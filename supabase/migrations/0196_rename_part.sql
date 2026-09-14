-- ===========================================================================
-- 0196 — RENAMING A PART CARRIES ITS HISTORY.
--
-- The user, 2026-09-14: "I need to be able to Edit Part Master", and — asked
-- before building, because the two readings are very different work — the
-- decision: "Rename carries the history".
--
-- WHY THIS NEEDS A FUNCTION RATHER THAN AN UPDATE. A part's identity here is
-- the STRING `CODE|Description`, and NOTHING IN THE DATABASE POINTS AT
-- `public.parts` — there is not one foreign key to it. Measured rather than
-- assumed: nine TABLES carry that string as a value.
--
--   handstock_opening.part          spare_consumption.part
--   indoor_job_parts.part_code      spare_consumption_history.part
--   material_returns.part           spare_dispatch_lines.part
--   spare_issue_history.part        spare_request_lines.part
--   stock_transfer_lines.part
--
-- (The dozen `part`/`part_code` columns on VIEWS derive from these, so they
-- follow on their own. `spare_usage`, `handstock_balance`, `engineer_stock` and
-- the rest need nothing here.)
--
-- HAND STOCK IS DERIVED, NEVER STORED — issued − consumed ± transfers −
-- returns (CLAUDE.md). So renaming the part row and leaving those nine behind
-- does not merely lose a link: an engineer's BALANCE CHANGES, because the
-- consumption lines stop matching the issues. A rename is therefore all nine
-- tables or none of them, which is what one function in one transaction buys.
--
-- IT IS A RENAME, NOT A MERGE. If the new name is already taken by another
-- part, this REFUSES: merging two parts means deciding what happens to two
-- sets of stock, which is not a decision a rename should make silently. The
-- caller is told the name is taken.
--
-- RIGHTS: `masters.edit`, the same right that adds and deactivates a part.
-- Rewriting stock-bearing history is at least that serious, and no lower right
-- exists that would make sense here.
--
-- FILED IN `handstock`, NOT IN `masters`, THOUGH THE PART MASTER IS A MASTER.
-- Two reasons and both are the same rule. `consumption_adjust_guard()` is
-- created by 0062 and redefined by 0081, BOTH in `handstock`, and `masters`
-- runs BEFORE `handstock` in ALL_ORDER — so a redefinition filed with the Part
-- Master would be silently overwritten on a fresh apply and the rename would
-- start failing again with nothing to show why. It is the `0055 sits in
-- handstock, not spare_requests` rule in CLAUDE.md, and the nine tables this
-- rewrites are that module's anyway.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- THE GUARD LEARNS THE DIFFERENCE BETWEEN RE-POINTING A LINE AND RENAMING THE
-- PART. Found by TESTING the rename rather than by reading the schema: the
-- first version failed with
--
--   "A reconciliation can only change the quantity — not the call, part,
--    engineer or source"
--
-- and the guard is RIGHT to refuse. Moving a consumption line onto a different
-- part is a quality record being rewritten, and 0062 exists to stop exactly
-- that. But a RENAME is not that: the part is the same part and only its name
-- has changed, and refusing it would leave the line naming a part that no
-- longer exists.
--
-- SO THE EXEMPTION IS AS NARROW AS THE FACT, and — this is the part that had to
-- be got right — IT CANNOT BE FORGED.
--
-- The first version declared the rename in a transaction-local `set_config`.
-- Tested, and it was a HOLE: `set_config` is available to any caller, so
-- anybody who could update a consumption line could set the flag themselves and
-- re-point the line — exactly what 0062 exists to prevent. Proved before it
-- shipped, by doing it:
--
--     begin;
--     select set_config('app.part_rename', <old>||chr(10)||<new>, true);
--     update spare_consumption set part = <new> ...;      -- UPDATE 1. Wrong.
--
-- A FLAG IS A SUGGESTION; A ROW IN A TABLE NOBODY MAY WRITE IS A CAPABILITY.
-- `rename_part()` (security definer, so it writes as the owner) files a TICKET
-- keyed on `txid_current()`, and the guard admits a part change only where a
-- ticket for THIS transaction names exactly this substitution. The table has
-- RLS on and NO POLICY and no grants, so no ordinary caller can write one —
-- and because the ticket is an ordinary row, a rollback takes it with it.
--
-- The other three checks (ucn, engineer, source) are UNCHANGED and are tested
-- separately, so this file cannot quietly relax one of them too.
-- ---------------------------------------------------------------------------

-- THE TICKET. Not a log — it is the capability itself, so it is written only by
-- the definer-owned function and read only by the definer-owned guard.
create table if not exists public.part_rename_ticket (
  txid       bigint primary key,
  old_key    text not null,
  new_detail text not null,
  at         timestamptz not null default now()
);
alter table public.part_rename_ticket enable row level security;
-- NO POLICY IS DELIBERATE. RLS with no policy denies every ordinary caller,
-- and the two SECURITY DEFINER functions below run as the owner, which RLS does
-- not apply to. Belt and braces: the grants are removed as well, so the table
-- is unreachable even if a policy were added by mistake later.
revoke all on public.part_rename_ticket from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.part_rename_ticket from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.part_rename_ticket from anon';
  end if;
end $$;

comment on table public.part_rename_ticket is
  'The capability that lets rename_part() move a consumption line. RLS on with NO policy and no grants, so only the definer-owned functions can write or read one — a set_config flag was forgeable by anybody who could update the line.';
create or replace function public.consumption_adjust_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare avail numeric; delta numeric;
begin
  if coalesce(new.ucn, '')      is distinct from coalesce(old.ucn, '')
  or coalesce(new.engineer, '') is distinct from coalesce(old.engineer, '')
  or coalesce(new.source, '')   is distinct from coalesce(old.source, '') then
    raise exception 'A reconciliation can only change the quantity — not the call, part, engineer or source';
  end if;

  if coalesce(new.part, '') is distinct from coalesce(old.part, '') then
    -- ONLY the substitution rename_part() filed a ticket for, in THIS
    -- transaction, for this exact row's current value. Anything else is a line
    -- being re-pointed, which is what this guard is for.
    if not exists (
      select 1 from public.part_rename_ticket t
       where t.txid = txid_current()
         and t.old_key = lower(btrim(coalesce(old.part, '')))
         and t.new_detail = coalesce(new.part, '')
    ) then
      raise exception 'A reconciliation can only change the quantity — not the call, part, engineer or source';
    end if;
    -- A rename changes no quantity, so the stock arithmetic below has nothing
    -- to check and the cap cannot be affected.
    if new.qty is not distinct from old.qty then return new; end if;
  end if;

  if new.qty is not distinct from old.qty then
    return new;                        -- nothing quantitative changed
  end if;
  if coalesce(new.qty, 0) < 0 then
    raise exception 'Quantity cannot be negative';
  end if;

  -- The one exemption: the same imported line, re-loaded from its source.
  if coalesce(btrim(new.source_ref), '') <> ''
     and btrim(new.source_ref) is not distinct from btrim(old.source_ref) then
    return new;
  end if;

  if coalesce(new.qty, 0) <= 0 and coalesce(btrim(new.adjustment_reason), '') = '' then
    raise exception 'Say why the line is being voided — the reason is kept with it';
  end if;
  if coalesce(btrim(new.adjustment_reason), '') = '' then
    raise exception 'Say why the quantity is being adjusted — the reason is kept with the line';
  end if;

  delta := coalesce(new.qty, 0) - coalesce(old.qty, 0);
  if delta > 0 then
    select public.handstock_available(new.engineer, new.part) into avail;
    if avail is not null and delta > avail then
      raise exception 'Only % left in %''s hand stock for %', avail, new.engineer, new.part;
    end if;
  end if;
  return new;
end $$;

create or replace function public.part_rename_impact(p_item_detail text)
returns table (relation text, rows bigint)
language plpgsql stable security definer set search_path = public as $$
declare k text := lower(btrim(coalesce(p_item_detail, '')));
begin
  -- READ-ONLY, and it exists so the person renaming SEES THE SIZE of what they
  -- are about to move before they move it. A count after the fact is a report;
  -- a count before it is a decision.
  if k = '' then return; end if;
  return query
    select 'Spare consumption'::text,        count(*) from spare_consumption        where lower(btrim(part)) = k
    union all select 'Consumption (history)', count(*) from spare_consumption_history where lower(btrim(part)) = k
    union all select 'Issued to engineers',   count(*) from spare_issue_history       where lower(btrim(part)) = k
    union all select 'Opening hand stock',    count(*) from handstock_opening         where lower(btrim(part)) = k
    union all select 'Spare request lines',   count(*) from spare_request_lines       where lower(btrim(part)) = k
    union all select 'Dispatch lines',        count(*) from spare_dispatch_lines      where lower(btrim(part)) = k
    union all select 'Stock transfer lines',  count(*) from stock_transfer_lines      where lower(btrim(part)) = k
    union all select 'Material returns',      count(*) from material_returns          where lower(btrim(part)) = k
    union all select 'Indoor job parts',      count(*) from indoor_job_parts          where lower(btrim(part_code)) = k;
end $$;

revoke all on function public.part_rename_impact(text) from public;
grant execute on function public.part_rename_impact(text) to authenticated;

create or replace function public.rename_part(
  p_id bigint, p_code text, p_description text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  old_detail text; old_key text;
  new_code text := btrim(coalesce(p_code, ''));
  new_desc text := btrim(coalesce(p_description, ''));
  new_detail text; moved jsonb := '{}'::jsonb; n bigint;
begin
  if not public.has_perm('masters.edit') then
    raise exception 'RBAC: only a role that maintains the masters may rename a part';
  end if;
  if new_code = '' or new_desc = '' then
    raise exception 'A part needs both a code and a description';
  end if;
  if position('|' in new_code) > 0 or position('|' in new_desc) > 0 then
    -- The separator IS the key's structure, so a value containing one would
    -- produce a key nothing can parse back.
    raise exception 'Neither the code nor the description may contain "|"';
  end if;

  select item_detail into old_detail from parts where id = p_id;
  if old_detail is null then raise exception 'No such part'; end if;
  old_key := lower(btrim(old_detail));
  new_detail := new_code || '|' || new_desc;

  if lower(btrim(new_detail)) = old_key then
    return jsonb_build_object('renamed', false, 'reason', 'nothing changed',
                              'from', old_detail, 'to', new_detail);
  end if;
  -- A RENAME, NOT A MERGE (see the header).
  if exists (select 1 from parts where item_detail_key = lower(btrim(new_detail)) and id <> p_id) then
    raise exception 'Another part is already called "%" — a rename cannot merge two parts', new_detail;
  end if;

  -- FILE THE TICKET, so the consumption guard can tell this rename from a line
  -- being re-pointed. Keyed on the transaction, so it is gone when this one
  -- ends — a rollback takes it, and a commit is followed by the delete below.
  -- Any ticket left by a crashed transaction names a txid that will not recur.
  insert into public.part_rename_ticket (txid, old_key, new_detail)
  values (txid_current(), old_key, new_detail)
  on conflict (txid) do update set old_key = excluded.old_key,
                                   new_detail = excluded.new_detail, at = now();

  -- THE NINE, then the part itself. Every one is matched case- and
  -- space-insensitively on the SAME key the register is matched on, so a row
  -- stored with different spacing moves with the rest instead of being left
  -- behind as the only survivor of the old name.
  update spare_consumption         set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Spare consumption', n);
  update spare_consumption_history set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Consumption (history)', n);
  update spare_issue_history       set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Issued to engineers', n);
  update handstock_opening         set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Opening hand stock', n);
  update spare_request_lines       set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Spare request lines', n);
  update spare_dispatch_lines      set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Dispatch lines', n);
  update stock_transfer_lines      set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Stock transfer lines', n);
  update material_returns          set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Material returns', n);
  update indoor_job_parts          set part_code = new_detail where lower(btrim(part_code)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Indoor job parts', n);

  update parts set code = new_code, description = new_desc, item_detail = new_detail
   where id = p_id;

  -- THE CAPABILITY IS SPENT. Not strictly required — the ticket names this
  -- transaction and no later one can reuse the id — but a capability left lying
  -- about is one somebody eventually reasons from.
  delete from public.part_rename_ticket where txid = txid_current();

  return jsonb_build_object('renamed', true, 'from', old_detail, 'to', new_detail, 'moved', moved);
end $$;

revoke all on function public.rename_part(bigint, text, text) from public;
grant execute on function public.rename_part(bigint, text, text) to authenticated;

comment on function public.rename_part(bigint, text, text) is
  'Rename a part and carry every record that names it. Nine tables hold the CODE|Description string and there are no foreign keys, so this is all of them or none — hand stock is derived, and a half-done rename changes an engineer''s balance.';

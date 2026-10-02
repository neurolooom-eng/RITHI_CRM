-- ===========================================================================
-- 0309 — A PART HAS AN HSN CODE, AND THE 29 THAT CARRIED IT IN THEIR
-- DESCRIPTION GIVE IT UP TO THE NEW COLUMN.
--
-- The user, 2026-10-01: "Add HSN Code Column in Part Master. Identify the HSN
-- Code that is present as part of the Description and fill it in [one time
-- activity]." Their answers: copy the code exactly as written (KY429500's
-- 7-digit 9033000 included -- correct it on the Part Master if it is a typo);
-- REMOVE "(HSN:...)" from the description; editable on the Part Master and in
-- its bulk upload.
--
-- WHAT THE LIVE DATA SAID (_part_hsn.sql, 2026-10-01): of 1,345 parts, 29
-- descriptions carry it, written "(HSN:90330000)" and once "(HSN NO:90330000)",
-- always in brackets. Five more have an 8-digit run with no HSN word -- LEGRIS
-- part numbers such as 31930813 -- and are NOT touched: a number is an HSN
-- code here only where the description says so.
--
-- REMOVING IT FROM THE DESCRIPTION IS A RENAME. A part's key is CODE|Description
-- and every spare request, dispatch, consumption and hand-stock line names it
-- by that key, so editing the description alone would strand all of them on a
-- name the Part Master no longer has. So it goes through rename_part's own
-- logic, which moves every record with the part in one transaction.
--
-- THAT LOGIC IS SPLIT IN TWO HERE, without changing what anybody may do:
--   rename_part_records()  the work -- callable by nobody (revoked), used by
--                          rename_part() and by this file's one-time fill;
--   rename_part()          the same signature, the same permission check
--                          (masters.edit.rename_part, 0289), then the work.
-- A migration runs with no signed-in user, so it cannot pass rename_part()'s
-- check; the split is how the fill uses the SAME code path a person's rename
-- does rather than a copy of it.
--
-- AND THE RENAME LEARNS A TENTH TABLE. Stock adjustments (0266) name a part
-- and were never added to the rename -- a part renamed after an adjustment
-- left the adjustment on the old name, and the engineer's balance split in two.
-- They move now, and part_rename_impact() counts them before a rename.
-- ===========================================================================

alter table public.parts add column if not exists hsn_code text not null default '';
comment on column public.parts.hsn_code is
  'HSN code of the part (0309). Filled once from "(HSN:...)" in the description, which was then removed from it; maintained on the Part Master and its upload since.';

-- ---- the work of a rename, callable by nobody directly ----------------------
create or replace function public.rename_part_records(p_id bigint, p_code text, p_description text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  old_detail text; old_key text;
  new_code text := btrim(coalesce(p_code, ''));
  new_desc text := btrim(coalesce(p_description, ''));
  new_detail text; moved jsonb := '{}'::jsonb; n bigint;
begin
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
  -- A RENAME, NOT A MERGE (0196).
  if exists (select 1 from parts where item_detail_key = lower(btrim(new_detail)) and id <> p_id) then
    raise exception 'Another part is already called "%" — a rename cannot merge two parts', new_detail;
  end if;

  -- FILE THE TICKET, so the consumption guard can tell this rename from a line
  -- being re-pointed (0196/0261). Keyed on the transaction.
  insert into public.part_rename_ticket (txid, old_key, new_detail)
  values (txid_current(), old_key, new_detail)
  on conflict (txid) do update set old_key = excluded.old_key,
                                   new_detail = excluded.new_detail, at = now();

  -- THE TEN, then the part itself, each matched on the key the register uses.
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
  -- NEW (0309): stock adjustments (0266) move with the part too.
  update handstock_adjustments     set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Stock adjustments', n);

  update parts set code = new_code, description = new_desc, item_detail = new_detail
   where id = p_id;

  delete from public.part_rename_ticket where txid = txid_current();

  return jsonb_build_object('renamed', true, 'from', old_detail, 'to', new_detail, 'moved', moved);
end $$;
revoke execute on function public.rename_part_records(bigint, text, text) from public, anon, authenticated;

-- ---- the rename a person makes: the same check as 0289, then the work ------
create or replace function public.rename_part(p_id bigint, p_code text, p_description text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('masters.edit.rename_part') then
    raise exception 'RBAC: only a role that maintains the masters may rename a part';
  end if;
  return public.rename_part_records(p_id, p_code, p_description);
end $$;
revoke all on function public.rename_part(bigint, text, text) from public, anon;
grant execute on function public.rename_part(bigint, text, text) to authenticated;

-- ---- what a rename would move, now counting stock adjustments -----------------
create or replace function public.part_rename_impact(p_item_detail text)
returns table (relation text, rows bigint)
language plpgsql stable security definer set search_path = public as $$
declare k text := lower(btrim(coalesce(p_item_detail, '')));
begin
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
    union all select 'Indoor job parts',      count(*) from indoor_job_parts          where lower(btrim(part_code)) = k
    union all select 'Stock adjustments',     count(*) from handstock_adjustments     where lower(btrim(part)) = k;
end $$;
revoke all on function public.part_rename_impact(text) from public, anon;
grant execute on function public.part_rename_impact(text) to authenticated;

-- ---- THE ONE-TIME FILL ----------------------------------------------------------
-- "(HSN:90330000)" / "(HSN NO:90330000)", brackets and all, with the space
-- before it. Idempotent: once removed, the pattern no longer matches, so a
-- re-run (or the bundle replayed) finds nothing to do. A part whose cleaned
-- name would collide with another part keeps its description and is named in
-- a notice; its HSN code is filled either way.
do $$
declare
  r record; hsn text; clean text; n_fill int := 0; n_ren int := 0; skipped text := '';
  pat constant text := '\s*\(\s*HSN(\s*NO\.?)?\s*:\s*([0-9]+)\s*\)';
begin
  for r in select id, code, description from public.parts
            where description ~* pat order by id loop
    hsn := (regexp_match(r.description, pat, 'i'))[2];
    clean := btrim(regexp_replace(r.description, pat, '', 'i'));
    update public.parts set hsn_code = hsn where id = r.id and btrim(hsn_code) = '';
    if found then n_fill := n_fill + 1; end if;
    if clean = '' then skipped := skipped || ' ' || r.code || ' (nothing left)'; continue; end if;
    begin
      perform public.rename_part_records(r.id, r.code, clean);
      n_ren := n_ren + 1;
    exception when others then
      skipped := skipped || ' ' || r.code || ' (' || sqlerrm || ')';
    end;
  end loop;
  raise notice '0309: HSN code filled on % part(s); "(HSN:...)" removed from % description(s).%',
    n_fill, n_ren, case when skipped = '' then '' else ' Left as they were:' || skipped end;
end $$;

-- ===========================================================================
-- A RENAME ALSO CARRIES THE PERSON'S RECORDS (finding 23, second half).
--
-- 0257 moves the TEAM: the rows that name a renamed person as their manager.
-- It left work already filed under the old name where it was, and that is not
-- only hand stock. Who may SEE a call is decided by the allottee's NAME
-- (`calls_scoped_read`: lower(trim(allocated_to)) in visible_engineer_names()),
-- and so is a spare request, a consumption line, a stock transfer and the rest
-- -- so after a rename the person, and their manager, stopped seeing
-- everything allotted to the old spelling, and their hand stock split into two
-- balances.
--
-- THE USER'S DECISION (2026-09-30): "Rename existing records".
--
-- WHAT MOVES — every column that decides whose a record IS, matched exactly as
-- its own read policy matches it (lower(btrim()) on both sides):
--
--   calls ............ field_calls / installation_calls / pm_calls.allocated_to
--   requests ......... call_requests.engineer, pending_registrations.engineer
--   spares ........... spare_requests.engineer, spare_dispatches.engineer
--   consumption ...... spare_consumption.engineer, spare_consumption_history.engineer
--   hand stock ....... handstock_opening.engineer, spare_issue_history.engineer,
--                      material_returns.engineer,
--                      stock_transfers.from_engineer / .to_engineer
--   who looks after .. parties.service_engineer, products.service_engineer
--
-- The last two are not history but POINTERS: a new call's Allocated To is
-- filled from the customer's Service Engineer, so a stale name there would
-- allot every new call to a name nobody can see — the same fault again.
--
-- WHAT DOES NOT MOVE, on purpose: who DID something — rm_by, dispatched_by,
-- received_by, recorded_by, a visit report's engineer, a feedback's engineer,
-- the sale's engineer, and spare_request_engineer_log (a log of changes of
-- engineer, which a rename must not rewrite). Those are signatures on a
-- record, and nothing's visibility or stock is decided by them.
--
-- THE SAME THREE LIMITS AS 0257: nothing moves when the old name was blank,
-- when only its case or surrounding space changed (every reader compares
-- lower(btrim())), or when another User Master row still carries the old name
-- — two people with one name, whose records cannot be told apart here.
--
-- GUARDS. Four triggers refuse or react to exactly this change: a consumption
-- line's engineer cannot change, a dispatched request's engineer cannot
-- change, an answered call request is frozen, and a changed allottee sends
-- "Call allotted to you". Each is taught to recognise THIS rename (0260,
-- 0261, 0262) by a TICKET filed here, in the same pattern as rename_part()
-- (0196): a row keyed on the transaction, in a table with row-level security
-- on, no policy and no grants, so only this definer function can write one.
-- A set_config flag would be forgeable by anybody who can update a row.
-- Every other guard still runs; the renamer is an administrator (only an
-- administrator can change a name — user_directory_address_guard), which is
-- what those guards already let through.
--
-- EACH TABLE IS GUARDED BY to_regclass() and updated by dynamic SQL, so a
-- project missing a module still renames what it has. The audit triggers on
-- the quality tables record every row moved.
-- ===========================================================================

create table if not exists public.engineer_rename_ticket (
  txid     bigint primary key,
  old_key  text not null,
  new_name text not null,
  at       timestamptz not null default now()
);
alter table public.engineer_rename_ticket enable row level security;
revoke all on public.engineer_rename_ticket from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.engineer_rename_ticket from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.engineer_rename_ticket from anon';
  end if;
end $$;
-- THE FIVE SYSTEM COLUMNS (0244), like every other table. Where 0244 has
-- already run -- the live project, a build in migration order -- they are
-- attached here; on a fresh apply of the bundles, `sys_columns` runs last and
-- attaches them to every table then.
do $$ begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.engineer_rename_ticket'::regclass);
  end if;
end $$;

comment on table public.engineer_rename_ticket is
  'The capability that lets a User Master rename move the records filed under the old name past the guards that refuse a change of engineer (0259). RLS on with NO policy and no grants: only the definer-owned rename trigger writes one, keyed on its own transaction.';

-- Is THIS transaction renaming `p_old` to `p_new`? Asked by the guards. It
-- answers only about the caller's own transaction, so it discloses nothing.
create or replace function public.engineer_rename_in_progress(p_old text, p_new text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return exists (
    select 1 from public.engineer_rename_ticket t
     where t.txid = txid_current()
       and t.old_key = lower(btrim(coalesce(p_old, '')))
       and t.new_name = coalesce(p_new, ''));
end $$;
revoke execute on function public.engineer_rename_in_progress(text, text) from public, anon;
grant  execute on function public.engineer_rename_in_progress(text, text) to authenticated;

create or replace function public.user_directory_carry_rename_records()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  old_key text := lower(btrim(coalesce(old.name, '')));
  new_nm  text := btrim(coalesce(new.name, ''));
  target  record;
begin
  if old_key = '' or new_nm = '' or old_key = lower(new_nm) then
    return null;
  end if;
  if exists (select 1 from public.user_directory d
              where d.id <> new.id and lower(btrim(d.name)) = old_key) then
    return null;
  end if;

  insert into public.engineer_rename_ticket (txid, old_key, new_name)
  values (txid_current(), old_key, new_nm)
  on conflict (txid) do update set old_key = excluded.old_key,
                                   new_name = excluded.new_name, at = now();

  for target in
    select * from (values
      ('field_calls', 'allocated_to'), ('installation_calls', 'allocated_to'), ('pm_calls', 'allocated_to'),
      ('call_requests', 'engineer'), ('pending_registrations', 'engineer'),
      ('spare_requests', 'engineer'), ('spare_dispatches', 'engineer'),
      ('spare_consumption', 'engineer'), ('spare_consumption_history', 'engineer'),
      ('handstock_opening', 'engineer'), ('spare_issue_history', 'engineer'),
      ('material_returns', 'engineer'),
      ('stock_transfers', 'from_engineer'), ('stock_transfers', 'to_engineer'),
      ('parties', 'service_engineer'), ('products', 'service_engineer')
    ) v(tbl, col)
  loop
    if to_regclass('public.' || target.tbl) is not null
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = target.tbl
                      and c.column_name = target.col) then
      execute format('update public.%I set %I = $1 where lower(btrim(%I)) = $2',
                     target.tbl, target.col, target.col)
        using new_nm, old_key;
    end if;
  end loop;

  delete from public.engineer_rename_ticket where txid = txid_current();
  return null;
end $$;
revoke execute on function public.user_directory_carry_rename_records() from public, anon, authenticated;

comment on function public.user_directory_carry_rename_records() is
  'When a User Master name changes, the records filed under the old name -- calls allotted to it, requests, spares, consumption, hand stock, and the Party Master / Product Database service engineer -- follow it (0259, finding 23). Not when the old name was blank, only its case or spacing changed, or another row still holds it.';

drop trigger if exists user_directory_carry_rename_records on public.user_directory;
create trigger user_directory_carry_rename_records
  after update of name on public.user_directory
  for each row execute function public.user_directory_carry_rename_records();

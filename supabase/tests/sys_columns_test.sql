-- ===========================================================================
-- SYSTEM COLUMNS ON EVERY TABLE (0244).
--
--   The user, 2026-09-26: a key, sys_created_by, sys_created_on,
--   sys_updated_by, sys_updated_on on every table except the counters, which
--   "shouldn't overlap with any of the other fields"; existing rows filled from
--   existing fields.
--
-- Every assertion RAISES, so an unmet one is an unexpected error the runner
-- counts -- a printed grid nothing checks is not an assertion. What it proves:
--   1. COVERAGE: every table but the nine counters carries the five columns,
--      a unique sys_id and the stamping trigger -- and the counters do not;
--   2. THE FILL: existing rows take same-meaning fields only -- on a call the
--      author is actual_created_by, NOT created_by (the Hotline desk);
--   3. THE FILL FIRES NO TRIGGER: re-attaching `reports` writes no audit row;
--   4. A SIGNED-IN CALLER CANNOT SET THEM: on insert and on update, whatever
--      the app sends is replaced by the database's own values;
--   5. A TRUSTED ROLE MAY: a restore can put back what it saved.
--
-- Run ONCE after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('5c500000-0000-0000-0000-000000000001', 'sys-user@x.com'),
  ('5c500000-0000-0000-0000-00000000de5c', 'sys-desk@x.com'),
  ('5c500000-0000-0000-0000-00000000717e', 'sys-typist@x.com')
on conflict do nothing;
insert into auth.users (id, email) values
  ('5c500000-0000-0000-0000-00000000ad01', 'sys-admin@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('5c500000-0000-0000-0000-000000000001', 'sys-user@x.com', 'Sys User', 'engineer'),
  ('5c500000-0000-0000-0000-00000000ad01', 'sys-admin@x.com', 'Sys Admin', 'admin')
on conflict do nothing;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

\echo ''
\echo '--- 1. every table but the counters carries all of it; the counters carry none ---'
do $$
declare missing text; leaked text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname not in ('call_number_seq', 'ffr_counters', 'indoor_job_counters',
                           'material_return_counters', 'party_key_seq', 'spare_dispatch_counters',
                           'spare_or_counters', 'stock_transfer_counters', 'ucn_counters',
                           'harness', 'schema_migrations')
     and not (
       (select count(*) from pg_attribute a where a.attrelid = c.oid and not a.attisdropped
          and a.attname in ('sys_id', 'sys_created_by', 'sys_created_on', 'sys_updated_by', 'sys_updated_on')) = 5
       and exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'zzz_sys_stamp')
       and exists (select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                    where i.indrelid = c.oid and i.indisunique and i.indnatts = 1 and a.attname = 'sys_id'));
  if missing is not null then raise exception 'tables without the sys columns: %', missing; end if;

  select string_agg(c.relname, ', ') into leaked
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('call_number_seq', 'ucn_counters', 'ffr_counters')
     and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'sys_id');
  if leaked is not null then raise exception 'a counter was given sys columns: %', leaked; end if;
  raise notice 'ok: coverage';
end $$;

\echo ''
\echo '--- 2. THE FILL takes same-meaning fields only ---'
-- A table shaped like the three call tables -- a DESK in created_by, the
-- person who typed it in actual_created_by -- written BEFORE the columns exist,
-- then attached. (Not field_calls itself: after 0245 the `calls` view is built
-- over its sys columns, so they cannot be taken off it to re-run the fill.)
create table public.sys_probe (
  id bigserial primary key, note text,
  created_by uuid, actual_created_by uuid, created_at timestamptz, updated_at timestamptz);
insert into public.sys_probe (note, created_by, actual_created_by, created_at, updated_at)
values ('call-shaped',
        '5c500000-0000-0000-0000-00000000de5c',   -- the Hotline DESK
        '5c500000-0000-0000-0000-00000000717e',   -- the person who typed it
        '2026-01-02 10:00+05:30', '2026-01-03 11:00+05:30');
select public.sys_columns_attach('public.sys_probe');
do $$
declare r record;
begin
  select * into r from public.sys_probe where note = 'call-shaped';
  if not found then raise exception 'fixture row missing'; end if;
  if r.sys_created_by is distinct from '5c500000-0000-0000-0000-00000000717e'::uuid then
    raise exception 'sys_created_by should be actual_created_by (the typist), not created_by (the desk); got %', r.sys_created_by;
  end if;
  if r.sys_created_on is distinct from '2026-01-02 10:00+05:30'::timestamptz then
    raise exception 'sys_created_on should be created_at; got %', r.sys_created_on; end if;
  if r.sys_updated_on is distinct from '2026-01-03 11:00+05:30'::timestamptz then
    raise exception 'sys_updated_on should be updated_at; got %', r.sys_updated_on; end if;
  if r.sys_updated_by is not null then
    raise exception 'there is no updated_by, so nothing may be invented; got %', r.sys_updated_by; end if;
  if r.sys_id is null then raise exception 'sys_id was not filled'; end if;
  -- ...and the business columns are exactly as they were: no overlap.
  if r.created_by is distinct from '5c500000-0000-0000-0000-00000000de5c'::uuid
     or r.actual_created_by is distinct from '5c500000-0000-0000-0000-00000000717e'::uuid then
    raise exception 'attaching changed a business column'; end if;
  raise notice 'ok: fill';
end $$;

-- AND ON THE REAL CALL TABLES the same rule is what 0244 used: every call's
-- sys_created_by is its actual_created_by, never its desk -- checked on the
-- rows the migrations themselves left, whatever they are.
do $$
begin
  if exists (select 1 from public.field_calls
              where sys_created_by is distinct from actual_created_by
                and sys_created_on < now() - interval '1 minute') then
    raise exception 'a call''s sys_created_by is not its actual_created_by';
  end if;
  raise notice 'ok: calls use actual_created_by';
end $$;
drop table public.sys_probe;

\echo ''
\echo '--- 3. THE FILL FIRES NO TRIGGER (no audit rows, no call status recomputed) ---'
insert into public.reports (ucn, call_number, engineer, visit_at, updated_at, uid, call_status)
values ('SYS-CALL', 'CN-SYS', 'Sys User', now(), now(), 'SYS-V1', 'Unsolved');
drop trigger if exists zzz_sys_stamp on public.reports;
drop index if exists public.reports_sys_id_key;
alter table public.reports
  drop column sys_id, drop column sys_created_by, drop column sys_created_on,
  drop column sys_updated_by, drop column sys_updated_on;
create temp table audit_before as select count(*) as n from public.record_audit;
select public.sys_columns_attach('public.reports');
do $$
begin
  if (select count(*) from public.record_audit) <> (select n from audit_before) then
    raise exception 'attaching wrote audit rows, so a trigger fired during the fill';
  end if;
  if (select sys_updated_on from public.reports where uid = 'SYS-V1') is null then
    raise exception 'reports.sys_updated_on should be its updated_at'; end if;
  raise notice 'ok: silent fill';
end $$;

\echo ''
\echo '--- 4. A SIGNED-IN CALLER CANNOT SET THEM ---'
call public.be('sys-user@x.com');
set role authenticated;
insert into public.saved_charts (page, name, owner, sys_id, sys_created_by, sys_created_on, sys_updated_by, sys_updated_on)
values ('test', 'SYS-CHART', '5c500000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000', '5c500000-0000-0000-0000-00000000de5c',
        '2000-01-01', '5c500000-0000-0000-0000-00000000de5c', '2000-01-01');
reset role;
create temp table first_stamp as
  select sys_id, sys_created_on from public.saved_charts where name = 'SYS-CHART';
do $$
declare r record;
begin
  select * into r from public.saved_charts where name = 'SYS-CHART';
  if not found then raise exception 'the insert did not land (RLS?), so this proves nothing'; end if;
  if r.sys_id = '00000000-0000-0000-0000-000000000000'::uuid then raise exception 'insert kept the sys_id the app sent'; end if;
  if r.sys_created_by is distinct from '5c500000-0000-0000-0000-000000000001'::uuid then
    raise exception 'sys_created_by should be the signed-in login; got %', r.sys_created_by; end if;
  if r.sys_created_on < now() - interval '1 hour' then raise exception 'insert kept the sys_created_on the app sent'; end if;
  if r.sys_updated_by is distinct from r.sys_created_by or r.sys_updated_on is distinct from r.sys_created_on then
    raise exception 'a new row''s last update is its creation'; end if;
  raise notice 'ok: insert stamped';
end $$;

set role authenticated;
update public.saved_charts
   set spec = '{"renamed": true}'::jsonb,
       sys_id = '00000000-0000-0000-0000-000000000000',
       sys_created_on = '2000-01-01', sys_created_by = '5c500000-0000-0000-0000-00000000de5c',
       sys_updated_on = '2000-01-01', sys_updated_by = '5c500000-0000-0000-0000-00000000de5c'
 where name = 'SYS-CHART';
reset role;
do $$
declare r record; f record;
begin
  select * into r from public.saved_charts where name = 'SYS-CHART';
  select * into f from first_stamp;
  if not found or r.spec is distinct from '{"renamed": true}'::jsonb then raise exception 'the update itself did not land (RLS?), so this proves nothing'; end if;
  if r.sys_id is distinct from f.sys_id then raise exception 'update changed sys_id'; end if;
  if r.sys_created_on is distinct from f.sys_created_on then raise exception 'update changed sys_created_on'; end if;
  if r.sys_created_by is distinct from '5c500000-0000-0000-0000-000000000001'::uuid then raise exception 'update changed sys_created_by'; end if;
  if r.sys_updated_by is distinct from '5c500000-0000-0000-0000-000000000001'::uuid then raise exception 'sys_updated_by is not the login that updated'; end if;
  if r.sys_updated_on < now() - interval '1 hour' then raise exception 'update kept the sys_updated_on the app sent'; end if;
  raise notice 'ok: update stamped';
end $$;

\echo ''
\echo '--- 4b. ...NOR THROUGH THE calls VIEW, whose INSTEAD OF functions now pass them on ---'
-- 0245 regenerates calls_view_insert/update from field_calls' column list, so
-- they now carry sys_* from the client to the table. They run as the CALLER,
-- so sys_stamp() still sees `authenticated` and discards them. Proved rather
-- than reasoned: a definer function here would let a client forge the author.
-- An ADMIN, because the edit below needs calls.edit -- and an admin is still
-- an ordinary signed-in caller to sys_stamp(): `authenticated`, not trusted.
-- (The row is checked on the TABLE, not through the view: an UPDATE through
-- `calls` answers "UPDATE 1" even when row-level security let nothing through.)
call public.be('sys-admin@x.com');
set role authenticated;
insert into public.calls (ucn, call_type, product_name, serial, reg_date, party_name,
                          complaint_reported, standard_complaint, allocated_to,
                          sys_id, sys_created_by, sys_created_on)
values ('SYS-VIEW', 'FIELD', 'SYSPROD', '9', current_date, 'HOSP', 'x', 'y', '',
        '00000000-0000-0000-0000-000000000000', '5c500000-0000-0000-0000-00000000de5c', '2000-01-01');
update public.calls
   set complaint_reported = 'edited',
       sys_created_by = '5c500000-0000-0000-0000-00000000de5c', sys_updated_on = '2000-01-01'
 where ucn = 'SYS-VIEW';
reset role;
do $$
declare r record;
begin
  select * into r from public.field_calls where ucn = 'SYS-VIEW';
  if not found then raise exception 'the insert through calls did not land (permission?), so this proves nothing'; end if;
  if r.complaint_reported <> 'edited' then raise exception 'the update through calls did not land, so this proves nothing'; end if;
  if r.sys_id = '00000000-0000-0000-0000-000000000000'::uuid then raise exception 'a forged sys_id went through the view'; end if;
  if r.sys_created_by is distinct from '5c500000-0000-0000-0000-00000000ad01'::uuid then
    raise exception 'sys_created_by through the view should be the signed-in login; got %', r.sys_created_by; end if;
  if r.sys_created_on < now() - interval '1 hour' or r.sys_updated_on < now() - interval '1 hour' then
    raise exception 'a forged timestamp went through the view'; end if;
  if (select sys_id from public.calls where ucn = 'SYS-VIEW') is distinct from r.sys_id then
    raise exception 'the calls view does not show the table''s sys_id'; end if;
  raise notice 'ok: calls view stamped';
end $$;

\echo ''
\echo '--- 5. A TRUSTED ROLE MAY SUPPLY THEM (a restore) ---'
insert into public.saved_charts (page, name, owner, sys_id, sys_created_by, sys_created_on)
values ('test', 'SYS-RESTORED', '5c500000-0000-0000-0000-000000000001',
        '11111111-2222-3333-4444-555555555555', '5c500000-0000-0000-0000-00000000717e', '2020-05-05');
do $$
declare r record;
begin
  select * into r from public.saved_charts where name = 'SYS-RESTORED';
  if not found then raise exception 'the restore insert did not land'; end if;
  if r.sys_id <> '11111111-2222-3333-4444-555555555555'::uuid
     or r.sys_created_on <> '2020-05-05'::timestamptz
     or r.sys_created_by <> '5c500000-0000-0000-0000-00000000717e'::uuid then
    raise exception 'a trusted insert did not keep what it supplied';
  end if;
  raise notice 'ok: trusted restore';
end $$;
\echo 'expect ERROR: duplicate key value violates unique constraint (sys_id is a key)'
insert into public.saved_charts (page, name, owner, sys_id)
values ('test', 'SYS-DUP', '5c500000-0000-0000-0000-000000000001', '11111111-2222-3333-4444-555555555555');

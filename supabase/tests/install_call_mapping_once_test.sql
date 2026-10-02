-- ===========================================================================
-- 0319 — the one-time installation-call mapping and the administrators' list.
--   1. WI-<Product>-<Serial> maps, on an installation call only (a FIELD call
--      with that number is ignored: "Map only installation call").
--   2. Two installation calls on one machine: the one for this PARTY maps.
--   3. One installation call on the machine maps, whatever its party.
--   4. Two calls, neither for this party: nothing written; listed as several.
--   5. No call: listed as none.
--   6. A machine already holding a UCN is not touched and not listed.
--   7. Two machine lines wanting the same call: neither takes it; listed.
--   8. A line with no serial is listed as such.
--   9. Every change is in inst_call_repair_log with its rule.
--  10. Run again, nothing changes.
--  11. The list is refused to a role without mod:/install-calls-unmapped.
-- Any wrong answer is an ERROR not labelled `expect ERROR`.
-- Run after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('c1900000-0000-0000-0000-000000000001','ic_admin@x.com'),
 ('c1900000-0000-0000-0000-000000000002','ic_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('c1900000-0000-0000-0000-000000000001','ic_admin@x.com','IC Admin','admin'),
 ('c1900000-0000-0000-0000-000000000002','ic_eng@x.com','IC Engineer','engineer')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

delete from public.one_time_fixes_done where name = '0319_install_call_mapping';

insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end)
values ('SA-IC-1', 'IC HOSP', '2025-01-01', '2026-12-31'),
       ('SA-IC-2', 'IC HOSP', '2025-01-01', '2026-12-31');
insert into public.sale_items (sa_number, product_name, serial_number, inst_call) values
 ('SA-IC-1', 'VEGA', 'IC1', 'To Check'),
 ('SA-IC-1', 'VEGA', 'IC2', ''),
 ('SA-IC-1', 'VEGA', 'IC3', null),
 ('SA-IC-1', 'VEGA', 'IC4', null),
 ('SA-IC-1', 'VEGA', 'IC5', null),
 ('SA-IC-1', 'VEGA', 'IC6', '26A01I0099'),
 ('SA-IC-1', 'VEGA', 'IC7', null),
 ('SA-IC-2', 'VEGA', 'IC7', null),
 ('SA-IC-1', 'VEGA', '',    null);

-- An INSTALLATION call found ONLY by its WI- number (its serial is something else).
insert into public.installation_calls (ucn, call_number, call_type, product_name, serial, reg_date, party_name,
                                       complaint_reported, standard_complaint, allocated_to)
values ('26A01I0001', 'wi-vega-ic1 ', 'INSTALLATION', 'VEGA', 'OTHERSERIAL', current_date, 'X', 'x', 'y', 'E');
-- A FIELD call carrying IC5's WI- number: never mapped, never offered.
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date, party_name, allocated_to)
values ('26A01F0001', 'WI-VEGA-IC5', 'FIELD', 'VEGA', 'IC5', current_date, 'X', 'E');
insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                       complaint_reported, standard_complaint, allocated_to)
values ('26A01I0002', 'INSTALLATION', 'VEGA', 'IC2', current_date, 'ic hosp', 'x', 'y', 'E'),
       ('26A01I0003', 'INSTALLATION', 'VEGA', 'IC2', current_date, 'OTHER',   'x', 'y', 'E'),
       ('26A01I0004', 'INSTALLATION', 'VEGA', 'IC3', current_date, 'OTHER',   'x', 'y', 'E'),
       ('26A01I0005', 'INSTALLATION', 'VEGA', 'IC4', current_date, 'OTHER A', 'x', 'y', 'E'),
       ('26A01I0006', 'INSTALLATION', 'VEGA', 'IC4', current_date, 'OTHER B', 'x', 'y', 'E'),
       ('26A01I0007', 'INSTALLATION', 'VEGA', 'IC7', current_date, 'IC HOSP', 'x', 'y', 'E');

\i supabase/migrations/0319_install_call_mapping_once.sql

\echo '--- 1-3, 6. what was mapped ---'
do $$ declare got text; begin
  select string_agg(serial_number || '=' || coalesce(inst_call, ''), ' ' order by serial_number, sa_number) into got
    from public.sale_items where sa_number like 'SA-IC-%' and serial_number <> '';
  if got <> 'IC1=26A01I0001 IC2=26A01I0002 IC3=26A01I0004 IC4= IC5= IC6=26A01I0099 IC7= IC7=' then
    raise exception 'FAILED 1-3/6: %', got; end if;
  raise notice 'ok 1-3, 6';
end $$;

\echo '--- 9. every change logged with its rule ---'
do $$ begin
  if (select count(*) from public.inst_call_repair_log where why like '%(0319)') <> 3
     -- (0234's trigger already blanked IC1's "To Check" on insert, so its old value is '')
     or not exists (select 1 from public.inst_call_repair_log where serial_number = 'IC1' and why like '%WI-%')
     or not exists (select 1 from public.inst_call_repair_log where serial_number = 'IC2' and why like '%party%')
  then raise exception 'FAILED 9: the log does not hold the three changes with their rules'; end if;
  raise notice 'ok 9';
end $$;

\echo '--- 4, 5, 7, 8. the list, as an administrator ---'
call public.be('ic_admin@x.com');
begin; set local role authenticated;
do $$ declare r record; got text := ''; begin
  for r in select serial_number, reason, candidates from public.install_calls_unmapped()
            where sa_number like 'SA-IC-%' order by serial_number, sa_number loop
    got := got || '[' || r.serial_number || ':' || split_part(r.reason, ' ', 1) || ':' || r.candidates || ']';
  end loop;
  if got <> '[:The:][IC4:Several:26A01I0005 (OTHER A), 26A01I0006 (OTHER B)][IC5:No:][IC7:One:26A01I0007 (IC HOSP)][IC7:One:26A01I0007 (IC HOSP)]'
  then raise exception 'FAILED 4/5/7/8: %', got; end if;
  raise notice 'ok 4, 5, 7, 8';
end $$;
commit;

\echo '--- 10. once: a machine and its call added after the run are NOT mapped by a second run ---'
insert into public.sale_items (sa_number, product_name, serial_number) values ('SA-IC-1', 'VEGA', 'IC8');
insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                       complaint_reported, standard_complaint, allocated_to)
values ('26A01I0008', 'INSTALLATION', 'VEGA', 'IC8', current_date, 'IC HOSP', 'x', 'y', 'E');
\i supabase/migrations/0319_install_call_mapping_once.sql
do $$ begin
  if exists (select 1 from public.sale_items where serial_number = 'IC8' and public.is_call_number(inst_call))
  then raise exception 'FAILED 10: the second run mapped again'; end if;
  raise notice 'ok 10';
end $$;

\echo '--- 11. the list is refused without the key ---'
\echo 'expect ERROR: RBAC: Machines Without an Installation Call needs the mod:/install-calls-unmapped permission.'
call public.be('ic_eng@x.com');
begin; set local role authenticated;
select count(*) from public.install_calls_unmapped();
rollback;
\echo 'expect ERROR: permission denied for function install_calls_unmapped'
begin; set local role anon;
select count(*) from public.install_calls_unmapped();
rollback;

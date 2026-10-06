-- ===========================================================================
-- REVIEW BATCH 9, PROVED ON A DATABASE (0409-0411).
-- Each section proves BOTH halves: the hole the re-review measured is closed,
-- AND the honest path beside it still works.
--
--   1. D-056  a master value records carry is not deleted; a duplicate or an
--             unused value is, and the count reads past row-level security (0409)
--   2. D-055  the cover registers are imaged (0410, FRS-187.3 only)
--   3. D-035  a re-open says why, and the reason, person and time are kept (0411)
--
-- Checks raise an unlabelled error when they are wrong, so the harness counts
-- a failure; an error that is meant to happen is labelled `expect ERROR`.
-- Run ONCE after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('rb9_lists',  'RB9 Lists',  '["masters.view", "master.complaint.delete", "master.complaint.edit", "master.standardComplaint.delete"]'::jsonb),
 ('rb9_hot',    'RB9 Hotline','["calls.view", "calls.create", "calls.reopen", "data.view_all"]'::jsonb),
 ('rb9_eng',    'RB9 Engineer','["calls.view"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
  ('0b990000-0000-0000-0000-000000000001', 'rb9-lists@x.com'),
  ('0b990000-0000-0000-0000-000000000002', 'rb9-hot@x.com'),
  ('0b990000-0000-0000-0000-000000000003', 'rb9-eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0b990000-0000-0000-0000-000000000001', 'rb9-lists@x.com', 'RB9 Lists', 'rb9_lists'),
  ('0b990000-0000-0000-0000-000000000002', 'rb9-hot@x.com',   'RB9 Hot',   'rb9_hot'),
  ('0b990000-0000-0000-0000-000000000003', 'rb9-eng@x.com',   'RB9 Eng',   'rb9_eng')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

-- ===========================================================================
\echo ''
\echo '--- 1. D-056: a value records carry is deactivated, not deleted ---'
-- ===========================================================================
call public.nobody();
delete from public.masters where name in ('complaint', 'standardComplaint') and value like 'RB9 %';
delete from public.field_calls where party_name = 'RB9 HOSP';
insert into public.masters (name, value, extra) values
  ('complaint', 'RB9 NO POWER', '{"product": "RB9 VENT"}'),
  ('complaint', 'RB9 ALARM', '{"product": "RB9 VENT"}'), ('complaint', 'RB9 ALARM', '{"product": "RB9 OTHER"}'),
  ('complaint', 'RB9 UNUSED', '{"product": "RB9 VENT"}');
-- A call the list-keeper may NOT see carries two of them.
insert into public.calls (ucn, call_type, party_name, product_name, serial, standard_complaint, allocated_to)
values ('RB9-C1', 'FIELD', 'RB9 HOSP', 'RB9 VENT', 'RB9-S1', ' rb9 no power', 'Somebody Else'),
       ('RB9-C2', 'FIELD', 'RB9 HOSP', 'RB9 VENT', 'RB9-S2', 'RB9 ALARM', 'Somebody Else');

call public.be('rb9-lists@x.com');
set role authenticated;
\echo 'expect ERROR: "RB9 NO POWER" is on 1 record(s) and cannot be deleted -- deactivate it instead'
delete from public.masters where name = 'complaint' and value = 'RB9 NO POWER';
-- One of two rows holding the same word: the word stays on the list.
delete from public.masters where name = 'complaint' and value = 'RB9 ALARM' and product_key = 'RB9 OTHER';
-- Nothing carries it.
delete from public.masters where name = 'complaint' and value = 'RB9 UNUSED';
-- The legacy list name is the same list (0233 can still write it).
reset role;
call public.nobody();
insert into public.masters (name, value, extra) values ('standardComplaint', 'RB9 LEGACY', '{"product": "RB9 VENT"}');
insert into public.calls (ucn, call_type, party_name, product_name, serial, standard_complaint, allocated_to)
values ('RB9-C4', 'FIELD', 'RB9 HOSP', 'RB9 VENT', 'RB9-S4', 'RB9 LEGACY', 'Somebody Else');
call public.be('rb9-lists@x.com');
set role authenticated;
\echo 'expect ERROR: "RB9 LEGACY" is on 1 record(s) and cannot be deleted -- deactivate it instead'
delete from public.masters where name = 'standardComplaint' and value = 'RB9 LEGACY';
-- Deactivating is the way out, and it is allowed.
update public.masters set active = false where name = 'complaint' and value = 'RB9 NO POWER';
reset role;
call public.nobody();
do $$ begin
  if (select string_agg(value || '/' || product_key || '/' || coalesce(active::text, 'null'), ',' order by value, product_key)
        from public.masters where name in ('complaint', 'standardComplaint') and value like 'RB9 %')
     is distinct from 'RB9 ALARM/RB9 VENT/true,RB9 LEGACY/RB9 VENT/true,RB9 NO POWER/RB9 VENT/false' then
    raise exception 'D-056 FAILED: got %', (select string_agg(value || '/' || product_key || '/' || coalesce(active::text, 'null'), ',' order by value, product_key)
        from public.masters where name in ('complaint', 'standardComplaint') and value like 'RB9 %');
  end if;
  if public.master_value_uses('complaint', 'rb9 alarm') <> 1 then
    raise exception 'D-056 FAILED: master_value_uses counted % for RB9 ALARM', public.master_value_uses('complaint', 'rb9 alarm');
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 2. D-055: the cover registers are imaged ---'
-- ===========================================================================
call public.nobody();
delete from public.sale_items where sa_number = 'SA-RB9-1';
delete from public.sale_entries where sa_number = 'SA-RB9-1';
delete from public.record_audit where table_name in ('sale_entries', 'sale_items');
insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end)
values ('SA-RB9-1', 'RB9 HOSP', '2025-01-01', '2025-12-31');
insert into public.sale_items (sa_number, product_code, product_name, serial_number)
values ('SA-RB9-1', 'RB9', 'RB9 VENT', 'RB9-S9');
update public.sale_items set serial_number = 'RB9-S10' where sa_number = 'SA-RB9-1';
delete from public.sale_items where sa_number = 'SA-RB9-1';
do $$ begin
  if not exists (select 1 from public.record_audit where table_name = 'sale_items' and op = 'UPDATE'
                  and old_data->>'serial_number' = 'RB9-S9' and new_data->>'serial_number' = 'RB9-S10') then
    raise exception 'D-055 FAILED: a machine line corrected was not imaged before and after';
  end if;
  if not exists (select 1 from public.record_audit where table_name = 'sale_items' and op = 'DELETE'
                  and old_data->>'serial_number' = 'RB9-S10') then
    raise exception 'D-055 FAILED: a removed machine line left no image';
  end if;
  if not exists (select 1 from public.record_audit where table_name = 'sale_entries' and op = 'INSERT'
                  and new_data->>'sa_number' = 'SA-RB9-1') then
    raise exception 'D-055 FAILED: a sale entry was not imaged';
  end if;
end $$;
delete from public.sale_entries where sa_number = 'SA-RB9-1';

-- ===========================================================================
\echo ''
\echo '--- 3. D-035: a re-open records its reason, person and time ---'
-- ===========================================================================
call public.nobody();
delete from public.call_reopens where ucn = 'RB9-C3';
insert into public.calls (ucn, call_type, party_name, product_name, serial, allocated_to)
values ('RB9-C3', 'FIELD', 'RB9 HOSP', 'RB9 VENT', 'RB9-S3', 'RB9 Eng');
insert into public.reports (uid, ucn, call_status, visit_at) values ('RB9-V1', 'RB9-C3', 'Solved - Report Completed', now());

call public.be('rb9-hot@x.com');
set role authenticated;
\echo 'expect ERROR: Give the reason for re-opening call RB9-C3'
select public.reopen_call('RB9-C3', '');
select public.reopen_call('RB9-C3', 'customer called back: no power again');
reset role;
-- Who may see the call reads the history; who may not, does not.
create temp table rb9_seen (who text, n bigint);
grant all on rb9_seen to authenticated;
set role authenticated;
insert into rb9_seen select 'hotline', count(*) from public.call_reopens where ucn = 'RB9-C3';
reset role;
call public.be('rb9-eng@x.com');
set role authenticated;
insert into rb9_seen select 'engineer-not-allocated', count(*) from public.call_reopens where ucn = 'RB9-C3';
\echo 'expect ERROR: new row violates row-level security policy for table "call_reopens" (no client writes)'
insert into public.call_reopens (ucn, reason) values ('RB9-C3', 'typed by hand');
reset role;
call public.nobody();
do $$ begin
  if (select count(*) from public.call_reopens r
       where r.ucn = 'RB9-C3' and r.reason = 'customer called back: no power again'
         and r.reopened_by = '0b990000-0000-0000-0000-000000000002' and r.reopened_by_name = 'RB9 Hot') <> 1 then
    raise exception 'D-035 FAILED: the re-open did not keep its reason and person';
  end if;
  if (select string_agg(who || '=' || n, ',' order by who) from rb9_seen) is distinct from 'engineer-not-allocated=0,hotline=1' then
    raise exception 'D-035 FAILED: history visibility %', (select string_agg(who || '=' || n, ',' order by who) from rb9_seen);
  end if;
end $$;

call public.nobody();

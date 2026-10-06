-- ===========================================================================
-- REVIEW BATCH 8, PROVED ON A DATABASE (0396-0399, 0402).
-- Each section proves BOTH halves: the hole the re-review measured is closed,
-- AND the honest path beside it still works.
--
--   1. D-067  a change to a role, a setting or an SLA target is imaged, under
--             the row's own key, before and after paired correctly (0396)
--   2. D-021  a quality objective edited or deleted is imaged (0396), and one
--             carrying a figure is not deleted (0402)
--   3. D-039  an indoor job and its parts are imaged; who reported damage to
--             the customer is the session (0396, 0399)
--   4. D-027  a Field Failure Report names its customer and problem (0397)
--   5. D-030  a call request's Attended Date is not in the future (0398)
--
-- Checks raise an unlabelled error when they are wrong, so the harness counts
-- a failure; an error that is meant to happen is labelled `expect ERROR`.
-- Run ONCE after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('rb8_rbac',   'RB8 RBAC',    '["rbac.manage"]'::jsonb),
 ('rb8_config', 'RB8 Config',  '["config.manage", "objective.manage"]'::jsonb),
 ('rb8_indoor', 'RB8 Indoor',  '["mod:/indoor", "indoor.receive", "indoor.work"]'::jsonb),
 ('rb8_ffr',    'RB8 FFR',     '["ffr.manage", "ffr.view"]'::jsonb),
 ('rb8_req',    'RB8 Request', '["request.create", "calls.create", "calls.view", "data.view_all"]'::jsonb),
 ('rb8_loader', 'RB8 Loader',  '["request.create", "ffr.manage", "bulk.upload"]'::jsonb),
 ('rb8_a',      'RB8 A',       '["calls.view"]'::jsonb),
 ('rb8_b',      'RB8 B',       '["calls.view"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
  ('0b880000-0000-0000-0000-000000000001', 'rb8-rbac@x.com'),
  ('0b880000-0000-0000-0000-000000000002', 'rb8-config@x.com'),
  ('0b880000-0000-0000-0000-000000000003', 'rb8-indoor@x.com'),
  ('0b880000-0000-0000-0000-000000000004', 'rb8-ffr@x.com'),
  ('0b880000-0000-0000-0000-000000000005', 'rb8-req@x.com'),
  ('0b880000-0000-0000-0000-000000000006', 'rb8-loader@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0b880000-0000-0000-0000-000000000001', 'rb8-rbac@x.com',   'RB8 Rbac',   'rb8_rbac'),
  ('0b880000-0000-0000-0000-000000000002', 'rb8-config@x.com', 'RB8 Config', 'rb8_config'),
  ('0b880000-0000-0000-0000-000000000003', 'rb8-indoor@x.com', 'RB8 Indoor', 'rb8_indoor'),
  ('0b880000-0000-0000-0000-000000000004', 'rb8-ffr@x.com',    'RB8 Ffr',    'rb8_ffr'),
  ('0b880000-0000-0000-0000-000000000005', 'rb8-req@x.com',    'RB8 Req',    'rb8_req'),
  ('0b880000-0000-0000-0000-000000000006', 'rb8-loader@x.com', 'RB8 Loader', 'rb8_loader')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

-- ===========================================================================
\echo ''
\echo '--- 1. D-067: roles, settings and SLA targets are imaged ---'
-- ===========================================================================
call public.nobody();
delete from public.record_audit where table_name in ('app_roles', 'app_settings', 'sla_rules');

call public.be('rb8-rbac@x.com');
set role authenticated;
-- Two roles in ONE statement: each after must be paired with its own before.
update public.app_roles set permissions = permissions || '["calls.create"]'::jsonb where role in ('rb8_a', 'rb8_b');
reset role;
call public.be('rb8-config@x.com');
set role authenticated;
insert into public.app_settings (key, value) values ('rb8.test', '"one"'::jsonb)
  on conflict (key) do update set value = excluded.value;
update public.app_settings set value = '"two"'::jsonb where key = 'rb8.test';
update public.sla_rules set target_hours = target_hours where key = (select min(key) from public.sla_rules);
reset role;
call public.nobody();
do $$ begin
  if (select count(*) from public.record_audit where table_name = 'app_roles' and op = 'UPDATE'
        and record_key in ('rb8_a', 'rb8_b')
        and old_data->>'role' = new_data->>'role'
        and actor = '0b880000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'D-067 FAILED: a role change was not imaged under its role, before and after paired';
  end if;
  if not exists (select 1 from public.record_audit where table_name = 'app_settings' and op = 'UPDATE'
                  and record_key = 'rb8.test' and old_data->>'value' = '"one"' and new_data->>'value' = '"two"') then
    raise exception 'D-067 FAILED: a setting change was not imaged with its old and new value';
  end if;
  if not exists (select 1 from public.record_audit where table_name = 'sla_rules' and op = 'UPDATE') then
    raise exception 'D-067 FAILED: an SLA target change was not imaged';
  end if;
  -- A table imaged before keeps the key it was recorded under.
  if public.record_audit_key('{"ucn": "U1", "id": 7, "key": "k"}'::jsonb) <> 'U1' then
    raise exception 'D-067 FAILED: the audit key order changed for tables already imaged';
  end if;
end $$;
delete from public.app_settings where key = 'rb8.test';

-- ===========================================================================
\echo ''
\echo '--- 2. D-021: a quality objective is imaged, and one with figures is kept ---'
-- ===========================================================================
call public.nobody();
delete from public.quality_objectives where parameter like 'RB8 %';
insert into public.quality_objectives (year, sort_order, process, parameter, yearly_target, frequency, responsible)
values (2026, 801, 'RB8', 'RB8 objective', '<5%', 'Monthly', 'NSM'),
       (2026, 802, 'RB8', 'RB8 added in error', '<5%', 'Monthly', 'NSM');
call public.be('rb8-config@x.com');
set role authenticated;
update public.quality_objectives set m01 = '3' where parameter = 'RB8 objective';
\echo 'expect ERROR: RB8 objective (2026) carries recorded figures and is kept'
delete from public.quality_objectives where parameter = 'RB8 objective';
-- One with nothing recorded can still be deleted, and the delete is imaged.
delete from public.quality_objectives where parameter = 'RB8 added in error';
reset role;
call public.nobody();
do $$ begin
  if not exists (select 1 from public.record_audit where table_name = 'quality_objectives' and op = 'UPDATE'
                  and new_data->>'parameter' = 'RB8 objective' and new_data->>'m01' = '3') then
    raise exception 'D-021 FAILED: a typed figure was not imaged';
  end if;
  if not exists (select 1 from public.quality_objectives where parameter = 'RB8 objective') then
    raise exception 'D-021 FAILED: an objective carrying a figure was deleted';
  end if;
  if exists (select 1 from public.quality_objectives where parameter = 'RB8 added in error') then
    raise exception 'D-021 FAILED: an objective with nothing recorded could not be deleted';
  end if;
  if not exists (select 1 from public.record_audit where table_name = 'quality_objectives' and op = 'DELETE'
                  and old_data->>'parameter' = 'RB8 added in error') then
    raise exception 'D-021 FAILED: a deleted objective left no image';
  end if;
end $$;
delete from public.quality_objectives where parameter like 'RB8 %';

-- ===========================================================================
\echo ''
\echo '--- 3. D-039: the workshop is imaged; who reported damage is the session ---'
-- ===========================================================================
call public.nobody();
delete from public.indoor_jobs where serial = 'RB8-IN-1';
insert into public.indoor_jobs (kind, activity, product_name, serial, party_name, demo_for_party, status) values
  ('Customer property', 'Repair', 'RB8 VENT', 'RB8-IN-1', 'RB8 HOSP', '', 'Received');
-- Decontaminated, so a part may be harvested from it (WI/SER/01, 4.5.3).
update public.indoor_jobs set decontaminated = true where serial = 'RB8-IN-1';
call public.be('rb8-indoor@x.com');
set role authenticated;
update public.indoor_jobs set damage_note = 'cracked casing',
       reported_to_customer_at = now() - interval '1 hour',
       reported_to_customer_by = '0b880000-0000-0000-0000-000000000006'
 where serial = 'RB8-IN-1';
\echo 'expect ERROR: A damage report to the customer cannot be recorded in the future'
update public.indoor_jobs set reported_to_customer_at = now() + interval '2 days' where serial = 'RB8-IN-1';
insert into public.indoor_job_parts (job_id, part_code, description, qty)
select id, 'RB8-P', 'RB8 harvested', 1 from public.indoor_jobs where serial = 'RB8-IN-1';
delete from public.indoor_job_parts where part_code = 'RB8-P';
reset role;
call public.nobody();
do $$ begin
  if (select reported_to_customer_by from public.indoor_jobs where serial = 'RB8-IN-1')
     is distinct from '0b880000-0000-0000-0000-000000000003' then
    raise exception 'D-039 FAILED: the damage report was attributed to the person the browser sent';
  end if;
  if (select reported_to_customer_at from public.indoor_jobs where serial = 'RB8-IN-1') > now() then
    raise exception 'D-039 FAILED: a future damage report time was saved';
  end if;
  if not exists (select 1 from public.record_audit where table_name = 'indoor_jobs' and op = 'UPDATE'
                  and new_data->>'serial' = 'RB8-IN-1' and new_data->>'damage_note' = 'cracked casing') then
    raise exception 'D-039 FAILED: an indoor job edit was not imaged';
  end if;
  if not exists (select 1 from public.record_audit where table_name = 'indoor_job_parts' and op = 'DELETE'
                  and old_data->>'part_code' = 'RB8-P') then
    raise exception 'D-039 FAILED: a removed harvested part left no image';
  end if;
end $$;
-- Clearing the time clears the person.
call public.be('rb8-indoor@x.com');
set role authenticated;
update public.indoor_jobs set reported_to_customer_at = null where serial = 'RB8-IN-1';
reset role;
call public.nobody();
do $$ begin
  if (select reported_to_customer_by from public.indoor_jobs where serial = 'RB8-IN-1') is not null then
    raise exception 'D-039 FAILED: clearing the damage report time left a person';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 4. D-027: a Field Failure Report names its customer and problem ---'
-- ===========================================================================
call public.nobody();
delete from public.field_failure_reports where ffr_no like 'RB8/%';
-- A report recorded before the rule, with no customer.
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date, customer_name, problem_reported)
values ('RB8/OLD', 'PC', 'RB8-U0', current_date, '', 'no power');

call public.be('rb8-ffr@x.com');
set role authenticated;
\echo 'expect ERROR: A Field Failure Report needs the Customer Name and the Problem Reported (missing: Customer Name, Problem Reported)'
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date) values ('RB8/1', 'PC', 'RB8-U1', current_date);
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date, customer_name, problem_reported)
values ('RB8/2', 'PC', 'RB8-U2', current_date, 'RB8 HOSP', 'alarm');
\echo 'expect ERROR: A Field Failure Report needs the Customer Name and the Problem Reported (missing: Problem Reported)'
update public.field_failure_reports set problem_reported = '' where ffr_no = 'RB8/2';
-- The old report's weekly review can still be recorded.
update public.field_failure_reports set reviewed_at = current_date where ffr_no = 'RB8/OLD';
reset role;
-- An import loads history as it was.
call public.be('rb8-loader@x.com');
set role authenticated;
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date) values ('RB8/3', 'PC', 'RB8-U3', current_date);
reset role;
call public.nobody();
do $$ begin
  if (select string_agg(ffr_no, ',' order by ffr_no) from public.field_failure_reports where ffr_no like 'RB8/%')
     is distinct from 'RB8/2,RB8/3,RB8/OLD' then
    raise exception 'D-027 FAILED: got %', (select string_agg(ffr_no, ',' order by ffr_no) from public.field_failure_reports where ffr_no like 'RB8/%');
  end if;
  if (select problem_reported from public.field_failure_reports where ffr_no = 'RB8/2') <> 'alarm' then
    raise exception 'D-027 FAILED: the problem was blanked';
  end if;
  if (select reviewed_at from public.field_failure_reports where ffr_no = 'RB8/OLD') is null then
    raise exception 'D-027 FAILED: an older report with no customer could not record its weekly review';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 5. D-030: a call request''s Attended Date is not in the future ---'
-- ===========================================================================
call public.nobody();
delete from public.call_requests where reqid like 'RB8-%';
call public.be('rb8-req@x.com');
set role authenticated;
\echo 'expect ERROR: The Attended Date cannot be in the future'
insert into public.call_requests (reqid, status, party_name, product, serial_no, standard_complaint, call_type, attended_date)
values ('RB8-1', 'Pending', 'RB8 HOSP', 'RB8 VENT', 'RB8-S1', 'Alarm', 'FIELD', current_date + 3);
insert into public.call_requests (reqid, status, party_name, product, serial_no, standard_complaint, call_type, attended_date)
values ('RB8-2', 'Pending', 'RB8 HOSP', 'RB8 VENT', 'RB8-S2', 'Alarm', 'FIELD', (now() at time zone 'Asia/Kolkata')::date);
reset role;
call public.be('rb8-loader@x.com');
set role authenticated;
insert into public.call_requests (reqid, status, party_name, product, serial_no, standard_complaint, call_type, attended_date)
values ('RB8-3', 'Pending', 'RB8 HOSP', 'RB8 VENT', 'RB8-S3', 'Alarm', 'FIELD', current_date + 3);
reset role;
-- An edit that leaves the date alone is not refused, even where it is ahead.
call public.be('rb8-req@x.com');
set role authenticated;
update public.call_requests set reported_problem = 'checked' where reqid = 'RB8-3';
\echo 'expect ERROR: The Attended Date cannot be in the future'
update public.call_requests set attended_date = current_date + 10 where reqid = 'RB8-2';
reset role;
call public.nobody();
do $$ begin
  if (select string_agg(reqid, ',' order by reqid) from public.call_requests where reqid like 'RB8-%')
     is distinct from 'RB8-2,RB8-3' then
    raise exception 'D-030 FAILED: got %', (select string_agg(reqid, ',' order by reqid) from public.call_requests where reqid like 'RB8-%');
  end if;
  if (select reported_problem from public.call_requests where reqid = 'RB8-3') is distinct from 'checked' then
    raise exception 'D-030 FAILED: an edit that left the date alone was refused';
  end if;
end $$;

call public.nobody();

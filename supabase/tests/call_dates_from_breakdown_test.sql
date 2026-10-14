-- ===========================================================================
-- COMPLAINT DATE FROM THE REQUEST, BREAKDOWN DATE FROM ITS ATTENDANCE, AND THE
-- TIMERS FROM THE BREAKDOWN DATE (0435-0438, the user, 2026-10-14).
--
--   BD-1 one request, raised 07-Aug, attended 06-Aug (Yes)
--        -> complaint 07-Aug, breakdown 06-Aug.
--   BD-2 one request, raised 10-Aug, not attended -> both 10-Aug.
--   BD-3 TWO requests -> left exactly as it was.
--   Visits (0436): BD-1 may be visited on 06-Aug (before its complaint) and
--        not on 05-Aug.
--   KPI (0437): BD-1 registered 07-Aug, first visit 09-Aug -> Attended in Days
--        3 from the breakdown, not 2 from the complaint.
--   Objective (0438): attended within 2 days -> BD-1 is NOT (3 days).
--
-- Run ONCE after _stub.sql + every migration, with the session on UTC. Every
-- error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
set timezone = 'UTC';

insert into auth.users (id, email) values ('0e435000-0000-0000-0000-000000000001', 'bd_admin@x.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e435000-0000-0000-0000-000000000001', 'bd_admin@x.com', 'BD Admin', 'admin')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
call public.be('bd_admin@x.com');

alter table public.field_calls disable trigger user;
insert into public.field_calls (ucn, call_number, call_type, reg_date, reg_at, complaint_date, breakdown_date, product_name, serial, party_name) values
 ('BD-1', 'R1', 'FIELD CALL', date '2025-08-07', timestamptz '2025-08-07 11:00+05:30', date '2025-08-06', date '2025-08-06', 'VEGA', 'S1', 'P'),
 ('BD-2', 'R2', 'FIELD CALL', date '2025-08-11', timestamptz '2025-08-11 11:00+05:30', date '2025-08-11', date '2025-08-11', 'VEGA', 'S2', 'P'),
 ('BD-3', 'R3', 'FIELD CALL', date '2025-08-12', timestamptz '2025-08-12 11:00+05:30', date '2025-08-01', date '2025-08-01', 'VEGA', 'S3', 'P');
alter table public.field_calls enable trigger user;

alter table public.call_requests disable trigger user;
insert into public.call_requests (reqid, submitted_at, call_type, party_name, product, serial_no, call_attended, attended_date, ucn, status) values
 ('BDQ-1',  timestamptz '2025-08-07 10:23+05:30', 'FIELD', 'P', 'VEGA', 'S1', 'Yes', date '2025-08-06', 'BD-1', 'Registered'),
 ('BDQ-2',  timestamptz '2025-08-10 23:30+05:30', 'FIELD', 'P', 'VEGA', 'S2', 'No',  date '2025-08-08', 'BD-2', 'Registered'),
 ('BDQ-3a', timestamptz '2025-08-05 10:00+05:30', 'FIELD', 'P', 'VEGA', 'S3', 'Yes', date '2025-08-04', 'BD-3', 'Registered'),
 ('BDQ-3b', timestamptz '2025-08-09 10:00+05:30', 'FIELD', 'P', 'VEGA', 'S3', 'Yes', date '2025-08-08', 'BD-3', 'Registered');
alter table public.call_requests enable trigger user;

\echo '--- 0435, re-run over the fixtures ---'
\ir ../migrations/0435_call_dates_from_request.sql

\echo '--- 1. the dates of a call registered from a request ---'
select 'BD-1: complaint = raised 07-Aug, breakdown = attended 06-Aug' as t,
  (complaint_date, breakdown_date) = (date '2025-08-07', date '2025-08-06') as ok from public.calls where ucn = 'BD-1';
select 'BD-2: not attended -> both the raised day, 10-Aug in India' as t,
  (complaint_date, breakdown_date) = (date '2025-08-10', date '2025-08-10') as ok from public.calls where ucn = 'BD-2';
select 'BD-3: two requests -> left as it was' as t,
  (complaint_date, breakdown_date) = (date '2025-08-01', date '2025-08-01') as ok from public.calls where ucn = 'BD-3';

\echo '--- 2. a visit from the breakdown date, not before ---'
insert into public.reports (uid, ucn, call_status, data, visit_at, updated_at)
  values ('WEB-BD-OK', 'BD-1', 'Unsolved', '{}'::jsonb, timestamptz '2025-08-06 00:00+00', now());
select 'a visit on 06-Aug (the breakdown, before the complaint) is accepted' as t,
  exists (select 1 from public.reports where uid = 'WEB-BD-OK') as ok;
\echo 'expect ERROR: A visit cannot be dated before the breakdown'
insert into public.reports (uid, ucn, call_status, data, visit_at, updated_at)
  values ('WEB-BD-EARLY', 'BD-1', 'Unsolved', '{}'::jsonb, timestamptz '2025-08-05 00:00+00', now());
delete from public.reports where uid = 'WEB-BD-OK';

\echo '--- 3. the KPI export counts from the breakdown ---'
alter table public.reports disable trigger user;
insert into public.reports (uid, ucn, call_status, data, visit_at, updated_at)
  values ('BD-V1', 'BD-1', 'Unsolved', '{}'::jsonb, timestamptz '2025-08-09 00:00+05:30', timestamptz '2025-08-09 18:00+05:30');
alter table public.reports enable trigger user;
select 'BD-1: Attended in Days 3 (06-Aug to 09-Aug), not 2 from the complaint' as t,
  "Attended in Days" = 3 as ok from public.kpi_field_inst where "UC Number" = 'BD-1';

\echo '--- 4. the objective counts from the breakdown ---'
insert into public.quality_objectives (year, sort_order, process, parameter, yearly_target, frequency, calc_key, calc_params) values
 (2025, 435, 'TEST', 'BD attended', '>75%', 'Monthly', 'attended_within_days', '{"family":"field","days":2}');
select 'BD-1 is NOT attended within 2 days of its breakdown (it would be, from its complaint)' as t,
  bool_and(role = 'late') as ok
  from public.objective_evidence((select id from public.quality_objectives where parameter = 'BD attended'), 8)
 where ucn = 'BD-1';

delete from public.quality_objectives where parameter = 'BD attended';
delete from public.reports where uid like 'BD-V%';

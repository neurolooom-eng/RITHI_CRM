-- ===========================================================================
-- THE KPI EXPORT DATES A VISIT IN INDIA TIME (0425, D-169).
--
--   Run with the session on UTC, as the live project is. KD-1 is registered
--   at 01:00 IST on 01-Mar-2025 (still 28-Feb in UTC) and visited and solved at
--   00:00 IST on 14-Mar-2025 (13-Mar in UTC), the way an imported visit is
--   stored. The export must read Attended 14-Mar, Solved 14-Mar, 13 days each,
--   Failure Month 2025 Mar -- before 0425 it read 13-Mar, 13-Mar, 12, 12 and
--   2025 Feb.
--
--   KD-2's only spare request was raised by another engineer; as the engineer
--   the call is allotted to, the export still dates Attended by it, as their
--   register does (call_first_spare_on, 0424).
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
set timezone = 'UTC';

insert into auth.users (id, email) values
  ('0e425000-0000-0000-0000-000000000001', 'kd_admin@x.com'),
  ('0e425000-0000-0000-0000-000000000002', 'kd_eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e425000-0000-0000-0000-000000000001', 'kd_admin@x.com', 'KD Admin', 'admin'),
  ('0e425000-0000-0000-0000-000000000002', 'kd_eng@x.com',   'KD Eng',   'engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

delete from public.user_directory where email in ('kd_eng@x.com', 'kd_other@x.com');
insert into public.user_directory (name, email, reporting_manager) values
  ('KD Eng', 'kd_eng@x.com', ''), ('KD Other', 'kd_other@x.com', '');

alter table public.field_calls disable trigger user;
insert into public.field_calls (ucn, call_number, call_type, reg_date, reg_at, complaint_date, product_name, serial, party_name, allocated_to) values
  ('KD-1', 'K1', 'FIELD CALL', date '2025-03-01', timestamptz '2025-03-01 01:00+05:30', date '2025-03-01', 'VEGA', 'S1', 'P', 'KD Other'),
  ('KD-2', 'K2', 'FIELD CALL', date '2025-07-01', timestamptz '2025-07-01 10:00+05:30', date '2025-07-01', 'VEGA', 'S2', 'P', 'KD Eng');
alter table public.field_calls enable trigger user;

alter table public.reports disable trigger user;
insert into public.reports (uid, ucn, call_status, data, visit_at, updated_at) values
  ('KD-V1', 'KD-1', 'Solved - Report Completed', '{}', timestamptz '2025-03-14 00:00+05:30', timestamptz '2025-03-15 18:00+05:30');
alter table public.reports enable trigger user;

alter table public.spare_requests disable trigger user;
insert into public.spare_requests (uid, ucn, engineer, engineer_email, or_req_date, created_at) values
  ('KD-S2', 'KD-2', 'KD Other', 'kd_other@x.com', date '2025-07-03', timestamptz '2025-07-03 10:00+05:30');
alter table public.spare_requests enable trigger user;

call public.be('kd_admin@x.com');

\echo '--- 1. a visit at 00:00 IST on 14-Mar is 14-Mar in the export, not 13-Mar ---'
select 'KD-1: Attended 14-Mar, Solved 14-Mar' as t,
  ("Call Attended On", "Call Solved Date & Time") = (date '2025-03-14', date '2025-03-14') as ok
  from public.kpi_field_inst where "UC Number" = 'KD-1';
select 'KD-1: 13 days each, counted from 01-Mar (the India registration day)' as t,
  ("Attended in Days", "Solved in Days") = (13, 13) as ok
  from public.kpi_field_inst where "UC Number" = 'KD-1';
select 'KD-1: registered 01:00 IST on 01-Mar is Failure Month 2025 Mar, not Feb' as t,
  "Failure Month" = '2025 Mar' as ok
  from public.kpi_field_inst where "UC Number" = 'KD-1';
select 'KD-1: the export agrees with the register''s call_dates' as t,
  (k."Call Attended On", k."Call Solved Date & Time") = (d.first_attended_on, d.solved_on) as ok
  from public.kpi_field_inst k join public.call_dates d on d.ucn = k."UC Number"
 where k."UC Number" = 'KD-1';

\echo '--- 2. as the engineer: a spare request somebody else raised still dates Attended ---'
call public.be('kd_eng@x.com');
set role authenticated;
select 'the engineer cannot read that spare request' as t,
  not exists (select 1 from public.spare_requests where uid = 'KD-S2') as ok;
select 'KD-2: Attended 03-Jul in their export' as t,
  "Call Attended On" = date '2025-07-03' as ok
  from public.kpi_field_inst where "UC Number" = 'KD-2';
reset role;

delete from public.reports where uid = 'KD-V1';
alter table public.spare_requests disable trigger user;
delete from public.spare_requests where uid = 'KD-S2';
alter table public.spare_requests enable trigger user;

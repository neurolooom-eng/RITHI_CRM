-- ===========================================================================
-- FIRST ATTENDED, LAST VISIT AND SOLVED DATES ON A CALL (0424).
--
--   Run with the session on UTC, as the live project is. Every visit below is
--   stored at 00:00 IST -- as an imported visit is -- so a bare `::date` would
--   read each one a day early. The three dates must read the India day.
--
--   CD-1 (Field): spare requested 12-Mar; visits 14-Mar (Unsolved) and
--        16-Mar (Solved - Report Completed)  -> attended 12-Mar, last 16-Mar,
--        solved 16-Mar.
--   CD-2 (PM): one visit 01-Apr, solved      -> attended 01-Apr (not 31-Mar).
--   CD-3 (Installation): visits 12-May then 10-May ENTERED LATER, and solved
--        on 05-May then Unsolved after       -> last 12-May (the latest visit,
--        not the latest entry); solved 05-May (the standing solve entry).
--   CD-4 (Field): no visit; a spare request with no or_req_date written at
--        01:30 IST on 02-Jun                  -> attended 02-Jun, others blank.
--   CD-5 (Field): allotted to the engineer; its spare request was raised by
--        somebody else, which sr_read hides from them -> the date still counts.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
set timezone = 'UTC';

insert into auth.users (id, email) values
  ('0e424000-0000-0000-0000-000000000001', 'cd_admin@x.com'),
  ('0e424000-0000-0000-0000-000000000002', 'cd_eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e424000-0000-0000-0000-000000000001', 'cd_admin@x.com', 'CD Admin', 'admin'),
  ('0e424000-0000-0000-0000-000000000002', 'cd_eng@x.com',   'CD Eng',   'engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

delete from public.user_directory where email in ('cd_eng@x.com', 'cd_other@x.com');
insert into public.user_directory (name, email, reporting_manager) values
  ('CD Eng', 'cd_eng@x.com', ''), ('CD Other', 'cd_other@x.com', '');

alter table public.field_calls disable trigger user;
alter table public.pm_calls disable trigger user;
alter table public.installation_calls disable trigger user;
insert into public.field_calls (ucn, call_number, call_type, reg_date, product_name, serial, party_name, allocated_to) values
  ('CD-1', 'C1', 'FIELD CALL', date '2025-03-10', 'VEGA', 'S1', 'P', 'CD Other'),
  ('CD-4', 'C4', 'FIELD CALL', date '2025-06-01', 'VEGA', 'S4', 'P', 'CD Other'),
  ('CD-5', 'C5', 'FIELD CALL', date '2025-07-01', 'VEGA', 'S5', 'P', 'CD Eng');
insert into public.pm_calls (ucn, call_number, call_type, reg_date, product_name, serial, party_name, allocated_to) values
  ('CD-2', 'C2', 'PM CALL', date '2025-03-25', 'VEGA', 'S2', 'P', 'CD Other');
insert into public.installation_calls (ucn, call_number, call_type, reg_date, product_name, serial, party_name, allocated_to) values
  ('CD-3', 'C3', 'INSTALLATION CALL', date '2025-05-01', 'VEGA', 'S3', 'P', 'CD Other');
alter table public.field_calls enable trigger user;
alter table public.pm_calls enable trigger user;
alter table public.installation_calls enable trigger user;

alter table public.reports disable trigger user;
insert into public.reports (uid, ucn, call_status, data, visit_at, updated_at) values
  ('CD-V11', 'CD-1', 'Unsolved',                  '{}', timestamptz '2025-03-14 00:00+05:30', timestamptz '2025-03-14 18:00+05:30'),
  ('CD-V12', 'CD-1', 'Solved - Report Completed', '{}', timestamptz '2025-03-16 00:00+05:30', timestamptz '2025-03-17 18:00+05:30'),
  ('CD-V21', 'CD-2', 'Solved - Report Completed', '{}', timestamptz '2025-04-01 00:00+05:30', timestamptz '2025-04-02 18:00+05:30'),
  ('CD-V30', 'CD-3', 'Solved - Report Completed', '{}', timestamptz '2025-05-05 00:00+05:30', timestamptz '2025-05-05 18:00+05:30'),
  ('CD-V31', 'CD-3', 'Unsolved',                  '{}', timestamptz '2025-05-12 00:00+05:30', timestamptz '2025-05-12 18:00+05:30'),
  ('CD-V32', 'CD-3', 'Unsolved',                  '{}', timestamptz '2025-05-10 00:00+05:30', timestamptz '2025-05-20 18:00+05:30');
alter table public.reports enable trigger user;

alter table public.spare_requests disable trigger user;
insert into public.spare_requests (uid, ucn, engineer, engineer_email, or_req_date, created_at) values
  ('CD-S1', 'CD-1', 'CD Other', 'cd_other@x.com', date '2025-03-12', timestamptz '2025-03-12 10:00+05:30'),
  ('CD-S4', 'CD-4', 'CD Other', 'cd_other@x.com', null,              timestamptz '2025-06-01 20:00+00'),
  ('CD-S5', 'CD-5', 'CD Other', 'cd_other@x.com', date '2025-07-03', timestamptz '2025-07-03 10:00+05:30');
alter table public.spare_requests enable trigger user;

call public.be('cd_admin@x.com');

\echo '--- 1. Field call: attended on the spare request, last and solved on the solving visit ---'
select 'CD-1: attended 12-Mar, last visit 16-Mar, solved 16-Mar' as t,
  (first_attended_on, last_visit_on, solved_on) = (date '2025-03-12', date '2025-03-16', date '2025-03-16') as ok
  from public.call_dates where ucn = 'CD-1';

\echo '--- 2. PM call: a visit at 00:00 IST on 01-Apr is 01-Apr, not 31-Mar ---'
select 'CD-2: attended 01-Apr, last 01-Apr, solved 01-Apr' as t,
  (first_attended_on, last_visit_on, solved_on) = (date '2025-04-01', date '2025-04-01', date '2025-04-01') as ok
  from public.call_dates where ucn = 'CD-2';

\echo '--- 3. Installation call: last = the latest VISIT, not the latest entry; solved = the standing solve ---'
select 'CD-3: attended 05-May, last 12-May, solved 05-May' as t,
  (first_attended_on, last_visit_on, solved_on) = (date '2025-05-05', date '2025-05-12', date '2025-05-05') as ok
  from public.call_dates where ucn = 'CD-3';

\echo '--- 4. no visit: attended on the request written at 01:30 IST on 02-Jun; nothing else ---'
select 'CD-4: attended 02-Jun, no last visit, not solved' as t,
  first_attended_on = date '2025-06-02' and last_visit_on is null and solved_on is null as ok
  from public.call_dates where ucn = 'CD-4';

\echo '--- 5. as the engineer: their own call counts a spare request they cannot read ---'
call public.be('cd_eng@x.com');
set role authenticated;
select 'the engineer cannot read the spare request on CD-5 itself' as t,
  not exists (select 1 from public.spare_requests where uid = 'CD-S5') as ok;
select 'CD-5: attended 03-Jul from that request' as t,
  first_attended_on = date '2025-07-03' as ok
  from public.call_dates where ucn = 'CD-5';
select 'a call the engineer may not see has no row' as t,
  not exists (select 1 from public.call_dates where ucn = 'CD-1') as ok;
select 'and its spare date is not given to them directly' as t,
  public.call_first_spare_on('CD-1') is null as ok;
reset role;

\echo '--- 6. the public key cannot ask ---'
set role anon;
\echo 'expect ERROR: permission denied for function call_first_spare_on'
select public.call_first_spare_on('CD-1');
reset role;

delete from public.reports where uid like 'CD-V%';
alter table public.spare_requests disable trigger user;
delete from public.spare_requests where uid like 'CD-S%';
alter table public.spare_requests enable trigger user;

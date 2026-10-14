-- ===========================================================================
-- EVERY DAY COUNT IS THE LOWER OF COMPLAINT-TO AND BREAKDOWN-TO (0440, 0441;
-- the user, 2026-10-14). The same cases check:ui asserts of callDays() in
-- src/lib/aging.ts, so the register's Aging and the database cannot disagree.
--
--   DY-1 complaint 07-Aug, breakdown 06-Aug, registered 08-Aug; first visit
--        09-Aug (a spare request on 12-Aug does not move it), solved 11-Aug
--        -> Attended 2, Solved 4 (from the complaint, the lower).
--   DY-2 complaint 10-Aug, breakdown 06-Aug; a visit ENTERED LATER but dated
--        08-Aug -> attended on 08-Aug, 2 days from the breakdown (the
--        complaint count would be negative).
--   DY-3 neither date -> from the registration day.
-- Run ONCE after _stub.sql + every migration, session on UTC. Every error
-- printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
set timezone = 'UTC';

\echo '--- 1. the rule ---'
select 'both positive: the lower' as t, public.call_days(date '2026-08-07', date '2026-08-06', date '2026-08-08', date '2026-08-09') = 2 as ok;
select 'visit before the complaint: from the breakdown' as t, public.call_days(date '2026-08-07', date '2026-08-06', null, date '2026-08-06') = 0 as ok;
select '...a day after the breakdown, before the complaint' as t, public.call_days(date '2026-08-10', date '2026-08-06', null, date '2026-08-08') = 2 as ok;
select 'both negative: 0' as t, public.call_days(date '2026-08-07', date '2026-08-06', null, date '2026-08-01') = 0 as ok;
select 'breakdown after the complaint: still the lower' as t, public.call_days(date '2026-08-01', date '2026-08-05', null, date '2026-08-09') = 4 as ok;
select 'only a breakdown date: from it' as t, public.call_days(null, date '2026-08-06', date '2026-08-08', date '2026-08-09') = 3 as ok;
select 'neither: from the registration' as t, public.call_days(null, null, date '2026-08-08', date '2026-08-09') = 1 as ok;
select 'nothing happened yet: no count' as t, public.call_days(date '2026-08-07', date '2026-08-06', null, null) is null as ok;

insert into auth.users (id, email) values ('0e440000-0000-0000-0000-000000000001', 'dy_admin@x.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e440000-0000-0000-0000-000000000001', 'dy_admin@x.com', 'DY Admin', 'admin')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
call public.be('dy_admin@x.com');

alter table public.field_calls disable trigger user;
insert into public.field_calls (ucn, call_number, call_type, reg_date, reg_at, complaint_date, breakdown_date, product_name, serial, party_name) values
 ('DY-1', 'D1', 'FIELD CALL', date '2025-08-08', timestamptz '2025-08-08 11:00+05:30', date '2025-08-07', date '2025-08-06', 'VEGA', 'S1', 'P'),
 ('DY-2', 'D2', 'FIELD CALL', date '2025-08-10', timestamptz '2025-08-10 11:00+05:30', date '2025-08-10', date '2025-08-06', 'VEGA', 'S2', 'P'),
 ('DY-3', 'D3', 'FIELD CALL', date '2025-08-08', timestamptz '2025-08-08 11:00+05:30', null, null, 'VEGA', 'S3', 'P');
alter table public.field_calls enable trigger user;
alter table public.reports disable trigger user;
insert into public.reports (uid, ucn, call_status, data, visit_at, updated_at) values
 ('DY-V11', 'DY-1', 'Unsolved',                  '{}', timestamptz '2025-08-09 00:00+05:30', timestamptz '2025-08-09 18:00+05:30'),
 ('DY-V12', 'DY-1', 'Solved - Report Completed', '{}', timestamptz '2025-08-11 00:00+05:30', timestamptz '2025-08-11 18:00+05:30'),
 ('DY-V21', 'DY-2', 'Unsolved',                  '{}', timestamptz '2025-08-12 00:00+05:30', timestamptz '2025-08-12 18:00+05:30'),
 ('DY-V22', 'DY-2', 'Unsolved',                  '{}', timestamptz '2025-08-08 00:00+05:30', timestamptz '2025-08-20 18:00+05:30'),
 ('DY-V31', 'DY-3', 'Unsolved',                  '{}', timestamptz '2025-08-10 00:00+05:30', timestamptz '2025-08-10 18:00+05:30');
alter table public.reports enable trigger user;
alter table public.spare_requests disable trigger user;
insert into public.spare_requests (uid, ucn, engineer, engineer_email, or_req_date, created_at) values
 ('DY-S1', 'DY-1', 'X', 'x@x.com', date '2025-08-12', timestamptz '2025-08-12 10:00+05:30');
alter table public.spare_requests enable trigger user;

\echo '--- 2. the KPI export ---'
select 'DY-1: Attended 2, Solved 4 -- the lower, from the complaint' as t,
  ("Attended in Days", "Solved in Days") = (2, 4) as ok from public.kpi_field_inst where "UC Number" = 'DY-1';
select 'DY-2: attended on the EARLIEST visit date (08-Aug, entered later): 2 days from the breakdown' as t,
  "Call Attended On" = date '2025-08-08' and "Attended in Days" = 2 as ok from public.kpi_field_inst where "UC Number" = 'DY-2';
select 'DY-3: neither date -> 2 days from the registration' as t,
  "Attended in Days" = 2 as ok from public.kpi_field_inst where "UC Number" = 'DY-3';

\echo '--- 3. the objective ---'
insert into public.quality_objectives (year, sort_order, process, parameter, yearly_target, frequency, calc_key, calc_params) values
 (2025, 440, 'TEST', 'DY attended', '>75%', 'Monthly', 'attended_within_days', '{"family":"field","days":2}');
select 'DY-1 and DY-2 attended within 2 days, DY-3 too' as t,
  count(*) filter (where role = 'attended') = 3 as ok
  from public.objective_evidence((select id from public.quality_objectives where parameter = 'DY attended'), 8)
 where ucn like 'DY-%';
select 'the evidence names both dates' as t,
  bool_and(status like '%from complaint 2025-08-07 and from breakdown 2025-08-06%') as ok
  from public.objective_evidence((select id from public.quality_objectives where parameter = 'DY attended'), 8)
 where ucn = 'DY-1';

delete from public.quality_objectives where parameter = 'DY attended';
delete from public.reports where uid like 'DY-V%';
alter table public.spare_requests disable trigger user;
delete from public.spare_requests where uid like 'DY-S%';
alter table public.spare_requests enable trigger user;

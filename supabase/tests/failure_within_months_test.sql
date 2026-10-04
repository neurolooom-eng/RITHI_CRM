-- ===========================================================================
-- PRODUCT FAILURE = A FIELD CALL WITHIN 3 MONTHS OF INSTALLATION, OVER THE
-- MACHINES INSTALLED IN A ROLLING 12 MONTHS (0357).
--
-- The user, 2026-10-04: "For Product Failures, The Concept is - Failure Within
-- 3 Months, But a Rolling Average for 12 Months". Installation = WARRANTY
-- START; the rate is over the machines installed in the window; both numbers
-- are set on Admin -> SLA / Objective Configuration; and by default only the
-- Admin role is given that page.
--
-- Every expectation is worked from those sentences, not read off the function.
-- Run after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('f3f3f3f3-0000-0000-0000-000000000001','fw_admin@x.com'),
 ('f3f3f3f3-0000-0000-0000-000000000002','fw_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('f3f3f3f3-0000-0000-0000-000000000001','fw_admin@x.com','FW Admin','admin'),
 ('f3f3f3f3-0000-0000-0000-000000000002','fw_eng@x.com','FW Eng','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;
call public.be('fw_admin@x.com');

-- Measured at the end of JUNE 2026 (month 6): the window is 1 Jul 2025 .. 30 Jun 2026.
--
--   FW-1  installed 2026-01-10, call 2026-02-01 (22 days)        FAILED
--   FW-2  installed 2026-01-10, calls 2026-03-01 AND 2026-03-20   FAILED -- ONCE
--   FW-3  installed 2026-01-10, call 2026-05-01 (> 3 months)      not a failure
--   FW-4  installed 2026-01-10, call 2026-01-05 (BEFORE install)  not a failure
--   FW-5  installed 2026-01-10, call CANCELLED inside the window  not a failure
--   FW-6  installed 2026-01-10, no call                           not a failure
--   FW-7  installed 2025-05-01 -- OUTSIDE the 12 months; call 2025-06-01 inside
--         its own 3 months. In neither number.
--   FW-8  no warranty start, call 2026-02-01. In neither number.
--   OTHER product, same serial FW-6, call 2026-02-01. Not FW-6's failure.
--
--   June: 2 failed / 6 installed (FW-1..FW-6) = 0.333333
--   Jan:  1 failed / 7 installed -- FW-7 is still inside the window then
delete from public.reports     where ucn like 'FW-%';
delete from public.field_calls where ucn like 'FW-%';
delete from public.products    where party_name = 'FW FLEET';
delete from public.quality_objectives where year = 2026 and parameter like 'TESTFW %';
update public.objective_settings set value = 3  where key = 'failure_window_months';
update public.objective_settings set value = 12 where key = 'failure_rolling_months';

insert into public.products (item_name, serial_number, party_name, warranty_start) values
 ('FWVENT', 'FW-1', 'FW FLEET', date '2026-01-10'),
 ('FWVENT', 'FW-2', 'FW FLEET', date '2026-01-10'),
 ('FWVENT', 'FW-3', 'FW FLEET', date '2026-01-10'),
 ('FWVENT', 'FW-4', 'FW FLEET', date '2026-01-10'),
 ('FWVENT', 'FW-5', 'FW FLEET', date '2026-01-10'),
 ('FWVENT', 'FW-6', 'FW FLEET', date '2026-01-10'),
 ('FWVENT', 'FW-7', 'FW FLEET', date '2025-05-01'),
 ('FWVENT', 'FW-8', 'FW FLEET', null);

insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                complaint_date, party_name, city, state, item_status,
                                complaint_reported, standard_complaint, allocated_to)
values
 ('FW-C1', 'F1', 'FIELD', 'FWVENT',  'FW-1', date '2026-02-01', date '2026-02-01','H','C','S','WGP','x','y','E'),
 ('FW-C2', 'F2', 'FIELD', 'FWVENT',  'fw-2 ', date '2026-03-01', date '2026-03-01','H','C','S','WGP','x','y','E'),
 ('FW-C3', 'F3', 'FIELD', 'FWVENT',  'FW-2', date '2026-03-20', date '2026-03-20','H','C','S','WGP','x','y','E'),
 ('FW-C4', 'F4', 'FIELD', 'FWVENT',  'FW-3', date '2026-05-01', date '2026-05-01','H','C','S','WGP','x','y','E'),
 ('FW-C5', 'F5', 'FIELD', 'FWVENT',  'FW-4', date '2026-01-05', date '2026-01-05','H','C','S','WGP','x','y','E'),
 ('FW-C6', 'F6', 'FIELD', 'FWVENT',  'FW-5', date '2026-02-01', date '2026-02-01','H','C','S','WGP','x','y','E'),
 ('FW-C7', 'F7', 'FIELD', 'FWVENT',  'FW-7', date '2025-06-01', date '2025-06-01','H','C','S','WGP','x','y','E'),
 ('FW-C8', 'F8', 'FIELD', 'FWVENT',  'FW-8', date '2026-02-01', date '2026-02-01','H','C','S','WGP','x','y','E'),
 ('FW-C9', 'F9', 'FIELD', 'OTHERPX', 'FW-6', date '2026-02-01', date '2026-02-01','H','C','S','WGP','x','y','E');
update public.field_calls set cancelled_at = now() where ucn = 'FW-C6';

insert into public.quality_objectives
  (year, sort_order, process, parameter, yearly_target, frequency, responsible, calc_key, calc_params)
values
 (2026, 201, 'TEST', 'TESTFW failure', '<6%', 'Monthly', 'NSM', 'failure_rate_12m', '{"product":"FWVENT"}');

\echo '--- 1. JUNE: 2 machines failed within 3 months / 6 installed in 12 months ---'
\echo 'expect: t -- 0.333333. FW-2 has two calls and counts ONCE; FW-3 failed too'
\echo 'expect: late, FW-4 before its install, FW-5 was cancelled; FW-7 is outside'
\echo 'expect: the window, FW-8 has no warranty start, and the OTHER product sharing'
\echo 'expect: FW-6''s serial is not FW-6''s failure.'
select public.objective_value(id, 6) = 0.333333 as june_is_2_of_6
  from public.quality_objectives where year = 2026 and parameter = 'TESTFW failure';

\echo '--- 2. THE EVIDENCE ADDS UP TO THE FIGURE: one failure row per machine ---'
\echo 'expect: failure 2 (FW-C1 and FW-C2, the first call of FW-2), machine 6, filter 1'
select role, count(*), string_agg(ucn, ',' order by ucn) filter (where role = 'failure') as ucns
  from public.objective_evidence(
         (select id from public.quality_objectives where year = 2026 and parameter = 'TESTFW failure'), 6)
 group by role order by role;
\echo 'expect: FW-2''s row says 2 field calls in the window, 50 days after installation'
select details->>'Field calls in the window' as calls_in_window,
       details->>'Days after installation' as days
  from public.objective_evidence(
         (select id from public.quality_objectives where year = 2026 and parameter = 'TESTFW failure'), 6)
 where role = 'failure' and ucn = 'FW-C2';

\echo '--- 3. JANUARY: THE WINDOW ROLLS -- 1 of 7 ---'
\echo 'expect: t -- on 31 Jan the 12 months reach back to Feb 2025, so FW-7'
\echo 'expect: (installed May 2025, failed June 2025) is IN, and is the only'
\echo 'expect: failure: FW-1 and FW-2 failed AFTER the cut-off and are not counted'
\echo 'expect: in an earlier month. By June FW-7 has rolled out (section 1).'
select public.objective_value(id, 1) = round(1::numeric / 7, 6) as jan_is_1_of_7
  from public.quality_objectives where year = 2026 and parameter = 'TESTFW failure';

\echo '--- 4. A WINDOW WITH NOTHING INSTALLED IS BLANK, NOT 0% ---'
\echo 'expect: t -- narrowed to a serial nobody has, the rate is NULL'
update public.quality_objectives set calc_params = '{"product":"FWVENT","serial":"NOPE%"}'
 where year = 2026 and parameter = 'TESTFW failure';
select public.objective_value(id, 6) is null as blank_without_installs
  from public.quality_objectives where year = 2026 and parameter = 'TESTFW failure';
update public.quality_objectives set calc_params = '{"product":"FWVENT"}'
 where year = 2026 and parameter = 'TESTFW failure';

\echo '--- 5. THE TWO NUMBERS ARE SETTINGS ---'
\echo 'expect: t -- with a 4-month window FW-3 (call 3 months 22 days after) also'
\echo 'expect: fails: 3 of 6 = 0.5'
update public.objective_settings set value = 4 where key = 'failure_window_months';
select public.objective_value(id, 6) = 0.5 as window_of_4_counts_fw3
  from public.quality_objectives where year = 2026 and parameter = 'TESTFW failure';
\echo 'expect: t -- with a 15-month rolling window FW-7 (installed May 2025) joins:'
\echo 'expect: its call a month after install fails it -> 4 of 7'
update public.objective_settings set value = 15 where key = 'failure_rolling_months';
select public.objective_value(id, 6) = round(4::numeric / 7, 6) as rolling_15_takes_fw7
  from public.quality_objectives where year = 2026 and parameter = 'TESTFW failure';
update public.objective_settings set value = 3  where key = 'failure_window_months';
update public.objective_settings set value = 12 where key = 'failure_rolling_months';

\echo '--- 6. A MISSING SETTING FALLS BACK TO 3 AND 12 ---'
\echo 'expect: 3 | 12 | 7 -- the fallback is the agreed rule, never zero'
select public.objective_setting('failure_window_months', 3),
       public.objective_setting('failure_rolling_months', 12),
       public.objective_setting('no_such_setting', 7);

\echo '--- 7. AN ENGINEER CANNOT CHANGE THE RULE ---'
\echo 'expect: UPDATE 0 -- row-level security matches nothing, and the value stays 3'
call public.be('fw_eng@x.com');
begin;
  set local role authenticated;
  update public.objective_settings set value = 1 where key = 'failure_window_months';
commit;
select value as still_3 from public.objective_settings where key = 'failure_window_months';

\echo '--- 8. ...THE ADMIN CAN, AND IS STAMPED AS WHO DID ---'
\echo 'expect: UPDATE 1, then 3 and t'
call public.be('fw_admin@x.com');
begin;
  set local role authenticated;
  update public.objective_settings set value = 3, updated_by = null where key = 'failure_window_months';
commit;
select value, updated_by = 'f3f3f3f3-0000-0000-0000-000000000001' as stamped_from_session
  from public.objective_settings where key = 'failure_window_months';

\echo '--- 9. A VALUE OUTSIDE 1..120 IS REFUSED (expect ERROR) ---'
\echo 'expect ERROR: objective_settings_value_check'
update public.objective_settings set value = 0 where key = 'failure_window_months';

\echo '--- 10. THE NOT-SIGNED-IN ROLE CANNOT READ THE SETTINGS (expect ERROR) ---'
\echo 'expect ERROR: permission denied for table objective_settings'
begin;
  set local role anon;
  select count(*) from public.objective_settings;
commit;

\echo '--- 11. THE ADMIN ROLE AND TECHNICAL SUPPORT ARE GIVEN THE PAGE (0357, 0358) ---'
\echo 'expect: admin and technical_support, nothing else -- the rest is decided on Roles & Permissions'
select role from public.app_roles where permissions ? 'mod:/sla-objective-config' order by role;
\echo 'expect: t -- the admin with all its actions'
select permissions @> '["config.manage","objective.manage"]'::jsonb as admin_has_every_action
  from public.app_roles where role = 'admin';
\echo 'expect: f -- Technical Support has the PAGE alone; its actions are ticked by an administrator'
select permissions @> '["objective.manage"]'::jsonb as ts_may_change_the_rule
  from public.app_roles where role = 'technical_support';

delete from public.field_calls where ucn like 'FW-%';
delete from public.products    where party_name = 'FW FLEET';
delete from public.quality_objectives where year = 2026 and parameter like 'TESTFW %';

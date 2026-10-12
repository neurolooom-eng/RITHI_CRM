-- ===========================================================================
-- A MISSED PM IS LEFT OUT OF THE PM OBJECTIVE, WITH A TOGGLE (0418).
--
--   A Missed PM is a PM call added (added_on) after the end of the month it is
--   registered for. The PM open-rate objective leaves it out of the calls and
--   the open calls -- the figure AND its evidence -- unless calc_params.missed_pm
--   is 'include'. No Added On date is not a Missed PM. The Field register is
--   untouched by the rule.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values ('0e418000-0000-0000-0000-000000000001', 'mpm_admin@x.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e418000-0000-0000-0000-000000000001', 'mpm_admin@x.com', 'MPM Admin', 'admin')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
call public.be('mpm_admin@x.com');

alter table public.pm_calls disable trigger user;
insert into public.pm_calls (ucn, call_number, call_type, reg_date, added_on, product_name, serial) values
 ('MPM-1', 'P1', 'P M VISIT', date '2025-03-05', date '2025-03-05', 'VEGA', 'S1'),  -- solved in March
 ('MPM-2', 'P2', 'P M VISIT', date '2025-03-06', date '2025-03-31', 'VEGA', 'S2'),  -- added on the last day: not missed, open
 ('MPM-3', 'P3', 'P M VISIT', date '2025-03-07', date '2025-10-01', 'VEGA', 'S3'),  -- added in October: MISSED, open
 ('MPM-4', 'P4', 'P M VISIT', date '2025-03-08', null,              'VEGA', 'S4'); -- no Added On: not missed, open
alter table public.pm_calls enable trigger user;
alter table public.field_calls disable trigger user;
insert into public.field_calls (ucn, call_number, call_type, reg_date, added_on, product_name, serial, party_name) values
 ('MPF-1', 'F1', 'FIELD CALL', date '2025-03-05', date '2025-10-01', 'VEGA', 'S9', 'P');  -- late, but not a PM
alter table public.field_calls enable trigger user;
alter table public.reports disable trigger user;
insert into public.reports (uid, ucn, call_status, data, visit_at, updated_at) values
 ('MPM-V1', 'MPM-1', 'Solved - Report Completed', '{}'::jsonb, timestamptz '2025-03-10 10:00+05:30', timestamptz '2025-03-10 10:00+05:30');
alter table public.reports enable trigger user;

insert into public.quality_objectives (year, sort_order, process, parameter, yearly_target, frequency, calc_key, calc_params) values
 (2025, 418, 'TEST', 'MPM PM default',  '<12%', 'Monthly', 'open_rate_monthly', '{"family":"pm"}'),
 (2025, 419, 'TEST', 'MPM PM include',  '<12%', 'Monthly', 'open_rate_monthly', '{"family":"pm","missed_pm":"include"}'),
 (2025, 420, 'TEST', 'MPM Field',       '<35%', 'Monthly', 'open_rate_monthly', '{"family":"field"}');

\echo '--- 1. by default the Missed PM is left out: 2 open of 3 ---'
select 'default: MPM-3 left out -- 2 of 3 open' as t,
       public.objective_value(id, 3) = round(2::numeric / 3, 6) as ok
  from public.quality_objectives where parameter = 'MPM PM default';
select 'default: the evidence lists the same 3 calls, not MPM-3' as t,
       count(*) = 3 and not bool_or(ucn = 'MPM-3') as ok
  from public.objective_evidence((select id from public.quality_objectives where parameter = 'MPM PM default'), 3);

\echo '--- 2. the toggle counts it: 3 open of 4 ---'
select 'include: every call counted -- 3 of 4 open' as t,
       public.objective_value(id, 3) = 0.75 as ok
  from public.quality_objectives where parameter = 'MPM PM include';
select 'include: the evidence lists all 4' as t, count(*) = 4 as ok
  from public.objective_evidence((select id from public.quality_objectives where parameter = 'MPM PM include'), 3);

\echo '--- 3. a Field objective is untouched by the rule ---'
select 'field: the late field call is still counted -- 1 of 1 open' as t,
       public.objective_value(id, 3) = 1 as ok
  from public.quality_objectives where parameter = 'MPM Field';

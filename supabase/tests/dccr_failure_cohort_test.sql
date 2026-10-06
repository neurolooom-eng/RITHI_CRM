-- ===========================================================================
-- DCCR FAILURE BY COMMISSIONING MONTH (0393).
--
--   A failure is a Field call whose DCCR spare category contains SPARE or whose
--   Any Potential Effect is YES; every call counts (a rate can pass 100%); a
--   month younger than the window is blank; the Objective is the plain average
--   of the 3-month rates of the 12 months ending in its month, blanks left out.
--
-- Run ONCE after _stub.sql + every migration. Superuser for the fixture; the
-- page's functions are read as `authenticated`.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- Three VEGA machines: two commissioned January 2025, one March 2025.
insert into public.products (item_name, serial_number, party_name, warranty_start) values
 ('VEGA', 'DV1', 'P', date '2025-01-10'),
 ('VEGA', 'DV2', 'P', date '2025-01-20'),
 ('VEGA', 'DV3', 'P', date '2025-03-05');

alter table public.field_calls disable trigger user;
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date, party_name, cancelled_at) values
 ('DF-1', 'C1', 'FIELD CALL', 'VEGA', 'DV1', date '2025-02-01', 'P', null),   -- spare, 22 days
 ('DF-2', 'C2', 'FIELD CALL', 'VEGA', 'DV1', date '2025-03-01', 'P', null),   -- potential YES only
 ('DF-3', 'C3', 'FIELD CALL', 'VEGA', 'DV2', date '2025-06-01', 'P', null),   -- spare, inside 6 not 3
 ('DF-4', 'C4', 'FIELD CALL', 'VEGA', 'DV3', date '2025-04-01', 'P', null),   -- correction, NO effect
 ('DF-5', 'C5', 'FIELD CALL', 'VEGA', 'DV3', date '2025-04-02', 'P', now());  -- cancelled
alter table public.field_calls enable trigger user;
alter table public.call_reviews disable trigger user;
insert into public.call_reviews (ucn, spare_category, risk_to_patient, warranty_failure, frequent_failure) values
 ('DF-1', 'SPARE', 'NO', 'NO', 'NO'),
 ('DF-2', 'CORRECTION', 'YES', 'NO', 'NO'),
 ('DF-3', 'SPARE', 'NO', 'NO', 'NO'),
 ('DF-4', 'CORRECTION', 'NO', 'NO', 'NO'),
 ('DF-5', 'SPARE', 'NO', 'NO', 'NO');
alter table public.call_reviews enable trigger user;

insert into public.quality_objectives (year, sort_order, process, parameter, yearly_target, frequency, calc_key, calc_params)
values (2025, 99, 'SERVICE', 'DCCR test VEGA', '<6%', 'Monthly', 'dccr_failure_cohort', '{"product":"%VEGA%"}');

\echo '--- 1. THE TABLE, as at 31-Dec-2025 ---'
select 'January: Parc 2, 3-month failures 2 (DF-1 spare + DF-2 potential), 100%; 6-month 3, 150%' as t,
       a.parc = 2 and a.failures = 2 and a.rate = 1 and b.failures = 3 and b.rate = 1.5 as ok
  from public._dccr_failure_cohort_rows('%VEGA%', '%', date '2025-12-31', 3) a
  join public._dccr_failure_cohort_rows('%VEGA%', '%', date '2025-12-31', 6) b on b.month = a.month
 where a.month = date '2025-01-01';
select 'February: no machine -- failures 0, rate blank' as t,
       parc = 0 and failures = 0 and rate is null as ok
  from public._dccr_failure_cohort_rows('%VEGA%', '%', date '2025-12-31', 3) where month = date '2025-02-01';
select 'March: Parc 1, the correction with no effect and the cancelled call are not failures -- 0%' as t,
       parc = 1 and failures = 0 and rate = 0 as ok
  from public._dccr_failure_cohort_rows('%VEGA%', '%', date '2025-12-31', 3) where month = date '2025-03-01';
select 'October: younger than 3 months at 31-Dec -- blank' as t,
       failures is null and rate is null as ok
  from public._dccr_failure_cohort_rows('%VEGA%', '%', date '2025-12-31', 3) where month = date '2025-10-01';
select 'January 12-month: blank, the month is not 12 months old yet' as t, failures is null as ok
  from public._dccr_failure_cohort_rows('%VEGA%', '%', date '2025-12-31', 12) where month = date '2025-01-01';

\echo '--- 2. THE OBJECTIVE: average of the 3-month rates of Jan..Dec 2025, blanks out ---'
select 'December 2025 = average(100%, 0%) = 50%' as t,
       public.objective_value(id, 12) = 0.5 as ok
  from public.quality_objectives where parameter = 'DCCR test VEGA';
select 'March 2025: as at 31-Mar no month is 3 months old yet (January completes on 1-Apr) -- blank' as t,
       public.objective_value(id, 3) is null as ok
  from public.quality_objectives where parameter = 'DCCR test VEGA';

\echo '--- 3. THE PAGE, as a signed-in reader ---'
insert into auth.users (id, email) values ('d0d0d393-0000-0000-0000-000000000001', 'dccr_view@x.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role, extra_permissions)
values ('d0d0d393-0000-0000-0000-000000000001', 'dccr_view@x.com', 'DCCR View', 'engineer', '["calls.view"]')
on conflict (id) do update set extra_permissions = excluded.extra_permissions;
-- A signed-in login with NO profile holds no permission at all (0300).
insert into auth.users (id, email) values ('d0d0d393-0000-0000-0000-000000000002', 'dccr_none@x.com') on conflict do nothing;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;
call public.be('dccr_view@x.com');
begin; set local role authenticated;
  select 'the page reads the table and the three failing calls' as t,
         (select count(*) from public.dccr_failure_cohorts((select id from public.quality_objectives where parameter = 'DCCR test VEGA'), date '2025-12-31') where month = date '2025-01-01' and r3 = 1) = 1
     and (select count(*) from public.dccr_failure_calls((select id from public.quality_objectives where parameter = 'DCCR test VEGA'), date '2025-12-31')) = 3 as ok;
commit;
call public.be('dccr_none@x.com');
\echo 'expect ERROR: no calls.view / reports.view'
begin; set local role authenticated;
  select count(*) from public.dccr_failure_cohorts((select id from public.quality_objectives where parameter = 'DCCR test VEGA'));
commit;
\echo 'expect ERROR: the internal function is not callable'
begin; set local role authenticated;
  select count(*) from public._dccr_failure_calls('%VEGA%', '%', current_date);
commit;

\echo '--- 4. THE SIX 2026 FAILURE RATES ARE ON THE NEW RULE ---'
select 'no 2026 objective is left on failure_rate_12m, and the product rates are on dccr_failure_cohort' as t,
       not exists (select 1 from public.quality_objectives where year = 2026 and calc_key = 'failure_rate_12m')
   and (select count(*) from public.quality_objectives where year = 2026 and calc_key = 'dccr_failure_cohort') = 6 as ok;

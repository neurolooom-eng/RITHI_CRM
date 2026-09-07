-- ===========================================================================
-- OBJECTIVES THAT COMPUTE THEMSELVES (0132).
--
-- The two rules the user gave (2026-09-07):
--   "Open Breakdown Calls should be less than 35% - calculation on a monthly
--    basis - cutoff not greater than emonth (current month)"
--   "Recent Failure Rate of MT75 <6% - Last 12 months data"
--
-- What this suite is really holding:
--   * THE CUTOFF IS THE END OF THE MONTH. A call closed in September does not
--     change July's figure — that is the difference between a quality record
--     and a live dashboard, and it is the easiest thing in here to get wrong;
--   * a month not yet reached is NULL, never 0. A zero reads as "nothing
--     failed", which is a claim;
--   * RE-CALC NEVER TOUCHES A TYPED FIGURE — the objectives with no calc_key
--     keep exactly what somebody typed;
--   * the figure and its EVIDENCE come from one query, so they cannot
--     disagree: counting the evidence rows reproduces the fraction;
--   * only an administrator may re-calculate.
--
-- Superuser bypasses RLS, so the scoped checks run as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('e1e1e1e1-0000-0000-0000-000000000001','or_admin@x.com'),
 ('e1e1e1e1-0000-0000-0000-000000000002','or_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('e1e1e1e1-0000-0000-0000-000000000001','or_admin@x.com','OR Admin','admin'),
 ('e1e1e1e1-0000-0000-0000-000000000002','or_eng@x.com','OR Eng','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- A fleet of 10 machines and 4 calls in January 2026, of which 1 was still open
-- at the end of January and closed in March. So:
--   January open rate  = 1/4 = 0.25   (NOT 0/4, which is what "today" would say)
--   failure rate       = 4/10 = 0.4   at any cutoff within 12 months of them
delete from public.reports     where ucn like 'OB-%';
delete from public.field_calls where ucn like 'OB-%';
delete from public.products    where party_name = 'OBJ FLEET';
insert into public.products (item_name, serial_number, party_name)
select 'TESTVENT X1', 'OBJ-' || g, 'OBJ FLEET' from generate_series(1,10) g;

insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                complaint_date, party_name, city, state, item_status,
                                complaint_reported, standard_complaint, allocated_to)
values
 ('OB-1','C1','FIELD','TESTVENT X1','OBJ-1', date '2026-01-05', date '2026-01-05','H','C','S','CMC','x','y','E'),
 ('OB-2','C2','FIELD','TESTVENT X1','OBJ-2', date '2026-01-10', date '2026-01-10','H','C','S','CMC','x','y','E'),
 ('OB-3','C3','FIELD','TESTVENT X1','OBJ-3', date '2026-01-20', date '2026-01-20','H','C','S','CMC','x','y','E'),
 ('OB-4','C4','FIELD','TESTVENT X1','OBJ-4', date '2026-01-25', date '2026-01-25','H','C','S','CMC','x','y','E');
-- Three solved inside January; the fourth not until March.
insert into public.reports (uid, ucn, call_number, call_status, engineer, visit_at, updated_at) values
 ('OBV-1','OB-1','C1','Solved - Report Completed','E', timestamptz '2026-01-06 10:00+05:30', timestamptz '2026-01-06 10:00+05:30'),
 ('OBV-2','OB-2','C2','Solved - Report Completed','E', timestamptz '2026-01-12 10:00+05:30', timestamptz '2026-01-12 10:00+05:30'),
 ('OBV-3','OB-3','C3','Solved - Report Completed','E', timestamptz '2026-01-28 10:00+05:30', timestamptz '2026-01-28 10:00+05:30'),
 ('OBV-4','OB-4','C4','Solved - Report Completed','E', timestamptz '2026-03-15 10:00+05:30', timestamptz '2026-03-15 10:00+05:30');

-- Two objectives of our own, so the suite does not depend on the seeded twelve.
delete from public.quality_objectives where year = 2026 and parameter like 'TEST %';
insert into public.quality_objectives
  (year, sort_order, process, parameter, yearly_target, frequency, responsible, calc_key, calc_params)
values
 (2026, 101, 'TEST', 'TEST open rate',    '<35%', 'Monthly', 'NSM', 'open_rate_monthly', '{"call_type":"FIELD"}'),
 (2026, 102, 'TEST', 'TEST failure rate', '<6%',  'Monthly', 'NSM', 'failure_rate_12m',  '{"product":"TESTVENT X1"}'),
 (2026, 103, 'TEST', 'TEST typed only',   'To Monitor', 'Monthly', 'NSM', '', '{}');
update public.quality_objectives set m01 = 0.99 where year = 2026 and parameter = 'TEST typed only';

\echo '--- 1. JANUARY''S OPEN RATE IS AS AT 31 JANUARY, not as at today ---'
\echo 'expect: 0.25 — one of the four was still open at the end of January.'
\echo 'expect: It was closed in MARCH; if the cutoff were "today" this would be 0.'
select public.objective_value(
  (select id from public.quality_objectives where year=2026 and parameter='TEST open rate'), 1) as jan_open_rate;

\echo '--- 2. ...and February is 0 calls, so NULL rather than 0% ---'
\echo 'expect: blank — no calls is not "none open"'
select coalesce(public.objective_value(
  (select id from public.quality_objectives where year=2026 and parameter='TEST open rate'), 2)::text, '(blank)') as feb;

\echo '--- 3. the failure rate is the trailing 12 months over the fleet ---'
\echo 'expect: 0.400000 — 4 calls, 10 machines'
select public.objective_value(
  (select id from public.quality_objectives where year=2026 and parameter='TEST failure rate'), 1) as jan_rate;

\echo '--- 4. a month that has not happened yet is NULL ---'
\echo 'expect: blank for December 2026'
select coalesce(public.objective_value(
  (select id from public.quality_objectives where year=2026 and parameter='TEST failure rate'), 12)::text, '(blank)') as dec;

\echo '--- 5. THE EVIDENCE REPRODUCES THE FIGURE ---'
\echo 'expect: 4 rows, 1 open and 3 closed — count them and you have 1/4'
select role, ucn, reg_date from public.objective_evidence(
  (select id from public.quality_objectives where year=2026 and parameter='TEST open rate'), 1) order by ucn;

\echo '--- 6. ...and for the rate, the failures plus one fleet row ---'
\echo 'expect: 4 failure rows and a fleet row reading 10'
select role, ucn as value from public.objective_evidence(
  (select id from public.quality_objectives where year=2026 and parameter='TEST failure rate'), 1) order by role, ucn;

\echo '--- 7. an ENGINEER cannot re-calculate ---'
\echo 'expect ERROR: only an administrator can re-calculate the objectives'
call public.be('or_eng@x.com');
begin;
  set local role authenticated;
  select * from public.recalc_quality_objectives(2026);
commit;

\echo '--- 8. an ADMIN can, and RE-CALC LEAVES THE TYPED FIGURE ALONE ---'
\echo 'expect: the two TEST computed rows are written; TEST typed only keeps 0.99'
call public.be('or_admin@x.com');
begin;
  set local role authenticated;
  select objective, months_written from public.recalc_quality_objectives(2026)
   where objective like 'TEST %' order by objective;
commit;
select parameter, m01, m02 from public.quality_objectives
 where year = 2026 and parameter like 'TEST %' order by parameter;

\echo '--- 9. ...and running it again changes nothing ---'
\echo 'expect: the same figures'
call public.be('or_admin@x.com');
begin;
  set local role authenticated;
  select count(*) from public.recalc_quality_objectives(2026);
commit;
select parameter, m01 from public.quality_objectives
 where year = 2026 and parameter like 'TEST %' order by parameter;

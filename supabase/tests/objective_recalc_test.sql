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
-- EVERY fixture this suite makes, cleared before ANYTHING is measured. The
-- serial-filter rows further down are also January FIELD calls, so on a second
-- run they would be counted by the open-rate objective above and its figure
-- would move. Clearing them here rather than beside their own section is what
-- makes the suite say the same thing twice.
delete from public.reports     where ucn like 'OB-%' or ucn like 'SF-%';
delete from public.field_calls where ucn like 'OB-%' or ucn like 'SF-%';
delete from public.products    where party_name in ('OBJ FLEET', 'SF FLEET');
delete from public.quality_objectives where year = 2026 and (parameter like 'TEST %' or parameter like 'TESTSF %');
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

\echo '--- 6. ...and for the rate, the failures AND the machines, one row each ---'
\echo 'expect: 4 failures and 10 machines. The denominator is LISTED, not'
\echo 'expect: asserted: a count of 10 that nobody can enumerate is worth as'
\echo 'expect: much as no denominator at all.'
select role, count(*) from public.objective_evidence(
  (select id from public.quality_objectives where year=2026 and parameter='TEST failure rate'), 1)
 group by role order by role;

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

\echo '--- 9b. COUNTING THE EVIDENCE REPRODUCES THE FIGURE, for the open rate ---'
\echo 'expect: t, and NO machine rows — that rate has no install base.'
\echo 'expect: RUN BEFORE the serial fixtures below: those are January FIELD'
\echo 'expect: calls too, and this objective counts every one of them.'
with e as (
  select role from public.objective_evidence(
    (select id from public.quality_objectives where year=2026 and parameter='TEST open rate'), 1))
select round((count(*) filter (where role='open'))::numeric / nullif(count(*), 0), 6)
       = public.objective_value(
           (select id from public.quality_objectives where year=2026 and parameter='TEST open rate'), 1)
       as evidence_matches_figure,
       count(*) filter (where role = 'machine') as machine_rows
  from e;

-- ===========================================================================
-- A RATE CAN BE NARROWED BY SERIAL AS WELL AS PRODUCT (0133).
--
-- "Indian Extend are the Extend XT with serial numbers starting from INXT."
-- The register has no column that says Indian; the SERIAL says it.
--
-- The whole risk is narrowing only the NUMERATOR: Indian failures counted
-- against the whole Extend fleet reads LOWER than the truth, and a failure
-- rate that flatters itself is the one nobody questions.
-- ===========================================================================

delete from public.reports     where ucn like 'SF-%';
delete from public.field_calls where ucn like 'SF-%';
delete from public.products    where party_name = 'SF FLEET';

-- 4 Indian machines (INXT) and 6 imported (EXTD). 2 Indian failures, 3 imported.
insert into public.products (item_name, serial_number, party_name)
select 'EXTEND-XT', 'INXT ' || g, 'SF FLEET' from generate_series(1,4) g;
insert into public.products (item_name, serial_number, party_name)
select 'EXTEND-XT', 'EXTD ' || g, 'SF FLEET' from generate_series(1,6) g;

insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                complaint_date, party_name, city, state, item_status,
                                complaint_reported, standard_complaint, allocated_to)
values
 ('SF-1','S1','FIELD','EXTEND-XT','INXT 1', date '2026-01-05', date '2026-01-05','H','C','S','CMC','x','y','E'),
 ('SF-2','S2','FIELD','EXTEND-XT','INXT 2', date '2026-01-06', date '2026-01-06','H','C','S','CMC','x','y','E'),
 ('SF-3','S3','FIELD','EXTEND-XT','EXTD 1', date '2026-01-07', date '2026-01-07','H','C','S','CMC','x','y','E'),
 ('SF-4','S4','FIELD','EXTEND-XT','EXTD 2', date '2026-01-08', date '2026-01-08','H','C','S','CMC','x','y','E'),
 ('SF-5','S5','FIELD','EXTEND-XT','EXTD 3', date '2026-01-09', date '2026-01-09','H','C','S','CMC','x','y','E');

delete from public.quality_objectives where year = 2026 and parameter like 'TESTSF %';
insert into public.quality_objectives
  (year, sort_order, process, parameter, yearly_target, frequency, responsible, calc_key, calc_params)
values
 (2026, 111, 'TEST', 'TESTSF indian only', '<8%', 'Monthly', 'NSM', 'failure_rate_12m',
  '{"product":"EXTEND-XT","serial":"INXT%"}'),
 (2026, 112, 'TEST', 'TESTSF whole fleet', '<8%', 'Monthly', 'NSM', 'failure_rate_12m',
  '{"product":"EXTEND-XT"}');

\echo '--- 10. THE SERIAL NARROWS BOTH HALVES OF THE FRACTION ---'
\echo 'expect: indian 0.5 (2 failures / 4 Indian machines)'
\echo 'expect: whole  0.5 (5 failures / 10 machines)'
\echo 'expect: If only the numerator were narrowed the Indian rate would read'
\echo 'expect: 2/10 = 0.2 — a rate that flatters itself, which is the one'
\echo 'expect: nobody questions. The two coming out EQUAL here is the point:'
\echo 'expect: the same 0.5 reached from 2/4 and from 5/10.'
select parameter, public.objective_value(id, 1) as jan
  from public.quality_objectives where year = 2026 and parameter like 'TESTSF %' order by parameter;

\echo '--- 11. and the EVIDENCE narrows the same way, or the file does not add up ---'
\echo 'expect: 2 failures (both INXT) and 4 machines — the DENOMINATOR AS ROWS,'
\echo 'expect: so a reader can count it instead of taking a total on trust'
select role, count(*) from public.objective_evidence(
  (select id from public.quality_objectives where year=2026 and parameter='TESTSF indian only'), 1)
 group by role order by role;
\echo 'expect: every machine listed is an INXT one'
select serial from public.objective_evidence(
  (select id from public.quality_objectives where year=2026 and parameter='TESTSF indian only'), 1)
 where role = 'machine' order by serial;

\echo '--- 12. a rate with no serial named is unchanged — the five others ---'
\echo 'expect: 5 failures and 10 machines'
select role, count(*) from public.objective_evidence(
    (select id from public.quality_objectives where year=2026 and parameter='TESTSF whole fleet'), 1)
 group by role order by role;

\echo '--- 13. COUNTING THE EVIDENCE REPRODUCES THE FIGURE ---'
\echo 'expect: t — failures / machines equals what the objective reports.'
\echo 'expect: This is the whole promise of the file: it adds up to the number.'
with e as (
  select role from public.objective_evidence(
    (select id from public.quality_objectives where year=2026 and parameter='TESTSF indian only'), 1))
select round((count(*) filter (where role='failure'))::numeric
             / nullif(count(*) filter (where role='machine'), 0), 6)
       = public.objective_value(
           (select id from public.quality_objectives where year=2026 and parameter='TESTSF indian only'), 1)
       as evidence_matches_figure
  from e;

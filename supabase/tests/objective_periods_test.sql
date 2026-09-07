-- ===========================================================================
-- QUARTERLY OBJECTIVES, THE THREE REGISTERS, AND THE STATED ASSUMPTIONS (0136).
--
-- The user's rules (2026-09-07):
--   "8 - No of calls registered in the month based on Call Registration date -
--    Solved calls by End of Month. same for preventive maintenance,
--    Installation calls"
--   "every KPI has a Monthly or Quarterly - If quarterly, then it should give a
--    cumulative for the 3 months period. Individual month data is not required
--    there (Can be filled as NA)."
--   "detail the assumptions, Hard Stops in the evidence sheet."
--
-- What this suite is really holding:
--
--   * CUMULATIVE IS POOLED, NOT AVERAGED. The fixture is built so the two
--     answers differ by a factor of five, because on balanced data they agree
--     and the bug would ship. This is the test that matters most in here.
--   * A QUARTERLY OBJECTIVE REPORTS IN ITS LAST MONTH. The other two are NA,
--     and Re-Calc CLEARS them on an objective it computes -- a stale February
--     figure sitting beside a Q1 total is what an auditor stops on.
--   * A REGISTER IS A TABLE. The three objectives below read three tables and
--     must give three different answers over the same quarter. (The database
--     will not let a PM row claim call_type 'FIELD' -- each table CHECKs
--     call_table_for(call_type) against its own name -- so the two ways of
--     asking agree; naming the table reads one register instead of three.)
--   * THE 3-DAY BOUNDARY IS INCLUSIVE and a call never attended counts against.
--   * a TYPED objective is still never touched, quarterly or not.
--
-- Superuser bypasses RLS, so the scoped checks run as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('e2e2e2e2-0000-0000-0000-000000000001','op_admin@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('e2e2e2e2-0000-0000-0000-000000000001','op_admin@x.com','OP Admin','admin')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- EVERY fixture cleared before ANYTHING is measured, so the suite says the same
-- thing on a second run. (Learned twice the hard way: a leftover January call
-- moves a denominator and the failure looks like a formula bug.)
delete from public.reports            where ucn like 'QP-%';
delete from public.spare_requests     where ucn like 'QP-%';
delete from public.field_calls        where ucn like 'QP-%';
delete from public.pm_calls           where ucn like 'QP-%';
delete from public.installation_calls where ucn like 'QP-%';
delete from public.quality_objectives where year = 2026 and parameter like 'TESTQ %';

-- ---------------------------------------------------------------------------
-- THE FIXTURE THAT SEPARATES POOLED FROM AVERAGED.
--
-- January: 1 field call, still open at the end of March  -> monthly rate 1.000
-- February: none
-- March:   9 field calls, all solved inside March        -> monthly rate 0.000
--
-- Pooled over Q1:   1 open / 10 registered = 0.1
-- Averaged monthly: (1.000 + 0.000) / 2    = 0.5
--
-- A factor of five apart. On a fixture with equal monthly volumes the two agree
-- and a wrong implementation passes, which is why the volumes are 1 and 9.
-- ---------------------------------------------------------------------------
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                complaint_date, party_name, city, state, item_status,
                                complaint_reported, standard_complaint, allocated_to)
select 'QP-F' || g, 'QF' || g, 'FIELD', 'QVENT', 'QS-' || g,
       case when g = 1 then date '2026-01-10' else date '2026-03-05' end,
       case when g = 1 then date '2026-01-10' else date '2026-03-05' end,
       'H','C','S','CMC','x','y','E'
  from generate_series(1,10) g;
-- The nine March calls are solved inside March; the January one never is.
insert into public.reports (uid, ucn, call_number, call_status, engineer, visit_at, updated_at)
select 'QPR' || g, 'QP-F' || g, 'QF' || g, 'Solved - Report Completed', 'E',
       timestamptz '2026-03-06 10:00+05:30', timestamptz '2026-03-06 10:00+05:30'
  from generate_series(2,10) g;

-- PM and INSTALLATION calls, in their own tables. The call_type must be spelled
-- so `call_table_for` agrees with the table -- each table CHECKs exactly that,
-- which is why a PM row cannot silently sit in the field register.
insert into public.pm_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                             complaint_date, party_name, city, state, item_status,
                             complaint_reported, standard_complaint, allocated_to)
values ('QP-P1','QP1','P M VISIT','QVENT','QS-P1', date '2026-02-10', date '2026-02-10','H','C','S','CMC','x','y','E'),
       ('QP-P2','QP2','P M VISIT','QVENT','QS-P2', date '2026-03-10', date '2026-03-10','H','C','S','CMC','x','y','E');
insert into public.installation_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                             complaint_date, party_name, city, state, item_status,
                             complaint_reported, standard_complaint, allocated_to)
values ('QP-I1','QI1','INSTALLATION CALL','QVENT','QS-I1', date '2026-01-20', date '2026-01-20','H','C','S','CMC','x','y','E');
-- One of the two PM calls is solved inside Q1; the installation call is not.
insert into public.reports (uid, ucn, call_number, call_status, engineer, visit_at, updated_at)
values ('QPRP1','QP-P1','QP1','Solved - Report Pending','E',
        timestamptz '2026-02-20 10:00+05:30', timestamptz '2026-02-20 10:00+05:30');

insert into public.quality_objectives
  (year, sort_order, process, parameter, yearly_target, frequency, responsible, calc_key, calc_params)
values
  (2026, 91, 'SERVICE', 'TESTQ quarterly field',   '<35%', '3 Months', 'X',
   'open_rate_monthly',    '{"family":"field"}'::jsonb),
  (2026, 92, 'SERVICE', 'TESTQ monthly field',     '<35%', 'Monthly',  'X',
   'open_rate_monthly',    '{"family":"field"}'::jsonb),
  (2026, 93, 'SERVICE', 'TESTQ quarterly pm',      '<12%', '3 Months', 'X',
   'open_rate_monthly',    '{"family":"pm"}'::jsonb),
  (2026, 94, 'BUSINESS','TESTQ quarterly install', '<10%', '3 Months', 'X',
   'open_rate_monthly',    '{"family":"installation"}'::jsonb),
  (2026, 95, 'BUSINESS','TESTQ typed quarterly',   '>75%', '3 Months', 'X', '', '{}'::jsonb);
update public.quality_objectives
   set m01 = 0.11, m02 = 0.22, m03 = 0.33
 where year = 2026 and parameter = 'TESTQ typed quarterly';

\echo '--- 1. MONTHLY OR QUARTERLY, from the frequency column ---'
\echo 'expect: f t t f f — "Monthly" is monthly; "3 Months" and "Quarterly" are'
\echo 'expect: quarterly; an unset or unrecognised frequency reads MONTHLY,'
\echo 'expect: which is the safer wrong answer (twelve honest figures rather'
\echo 'expect: than four and eight silently lost).'
select public.objective_is_quarterly('Monthly')   as monthly,
       public.objective_is_quarterly('3 Months')  as three_months,
       public.objective_is_quarterly('Quarterly') as quarterly,
       public.objective_is_quarterly('')          as blank,
       public.objective_is_quarterly(null)        as null_freq;

\echo '--- 2. THE WINDOW ONE FIGURE IS MEASURED OVER ---'
\echo 'expect: the monthly objective measures March alone (2026-03-01..03-31)'
select applies, period_start, period_end, label
  from public.objective_period(
    (select id from public.quality_objectives where year=2026 and parameter='TESTQ monthly field'), 3);
\echo 'expect: the quarterly one measures ALL of Q1 (2026-01-01..03-31) in March'
select applies, period_start, period_end, label
  from public.objective_period(
    (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly field'), 3);
\echo 'expect: ...and does not apply in January or February — NA, not zero'
select 1 as month, applies, label from public.objective_period(
    (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly field'), 1)
union all
select 2, applies, label from public.objective_period(
    (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly field'), 2);

\echo '--- 3. CUMULATIVE MEANS POOLED, NOT AVERAGED ---'
\echo 'expect: 0.100000 — 1 call still open out of the 10 registered across Q1.'
\echo 'expect: The AVERAGE of the monthly rates would be 0.5 (January 1/1 = 1.0,'
\echo 'expect: March 0/9 = 0.0), five times higher. The fixture is 1 call in'
\echo 'expect: January against 9 in March precisely so the two cannot agree by'
\echo 'expect: accident: averaging gives a four-call month the same weight as a'
\echo 'expect: ninety-call one, which is how a bad quarter reads as ordinary.'
select public.objective_value(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly field'), 3) as q1_pooled;

\echo 'expect: the monthly objective over the same calls reads 1.0 in January'
\echo 'expect: and 0.0 in March — both true of their own month, neither true of'
\echo 'expect: the quarter. This is what the two frequencies are FOR.'
select public.objective_value(
         (select id from public.quality_objectives where year=2026 and parameter='TESTQ monthly field'), 1) as jan,
       public.objective_value(
         (select id from public.quality_objectives where year=2026 and parameter='TESTQ monthly field'), 3) as mar;

\echo '--- 4. A QUARTERLY FIGURE EXISTS ONLY IN THE QUARTER-END MONTH ---'
\echo 'expect: blank blank 0.100000 — January and February are NA'
select coalesce(public.objective_value(
         (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly field'), 1)::text,'(blank)') as jan,
       coalesce(public.objective_value(
         (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly field'), 2)::text,'(blank)') as feb,
       coalesce(public.objective_value(
         (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly field'), 3)::text,'(blank)') as mar;

\echo '--- 5. AN OBJECTIVE READS ONE REGISTER, NAMED BY calc_params.family ---'
\echo 'expect: 0.500000 for PM — 2 PM calls in Q1, 1 still open. An objective'
\echo 'expect: that read the union of all three registers would have counted'
\echo 'expect: the field and installation calls too and reported 0.153846 here,'
\echo 'expect: and the SAME number for all three objectives.'
select public.objective_value(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly pm'), 3) as pm_q1;
\echo 'expect: 1.000000 for Installation — its 1 call was never solved'
select public.objective_value(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly install'), 3) as inst_q1;
\echo 'expect: t — the three registers gave THREE DIFFERENT answers over the'
\echo 'expect: same quarter. One shared answer would mean the family was being'
\echo 'expect: ignored and all three were reading the union.'
select count(distinct v) = 3 as three_registers_three_answers from (
  select public.objective_value((select id from public.quality_objectives
          where year=2026 and parameter='TESTQ quarterly field'), 3) as v
  union all select public.objective_value((select id from public.quality_objectives
          where year=2026 and parameter='TESTQ quarterly pm'), 3)
  union all select public.objective_value((select id from public.quality_objectives
          where year=2026 and parameter='TESTQ quarterly install'), 3)) t;

\echo '--- 6. THE EVIDENCE COVERS THE WHOLE QUARTER AND ADDS UP TO THE FIGURE ---'
\echo 'expect: 1 open and 9 closed — the January call and the nine from March,'
\echo 'expect: in ONE list, so counting the file reproduces 1/10'
select role, count(*) from public.objective_evidence(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly field'), 3)
 group by role order by role;
\echo 'expect: t — open / (open + closed) equals the figure on the page'
with e as (select role from public.objective_evidence(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly field'), 3))
select round((count(*) filter (where role='open'))::numeric / nullif(count(*),0), 6)
       = public.objective_value(
           (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly field'), 3)
       as evidence_matches_figure from e;
\echo 'expect: the January call IS in March''s evidence — that is the quarter'
select ucn, reg_date, role from public.objective_evidence(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly field'), 3)
 where reg_date < date '2026-03-01' order by ucn;

\echo '--- 7. RE-CALC CLEARS THE OFF-QUARTER MONTHS OF A COMPUTED OBJECTIVE ---'
call public.be('op_admin@x.com');
update public.quality_objectives set m01 = 0.99, m02 = 0.98
 where year = 2026 and parameter = 'TESTQ quarterly field';
select count(*) from public.recalc_quality_objectives(2026);
\echo 'expect: blank blank 0.100000 — the two stale monthly figures are gone.'
\echo 'expect: A February number sitting beside a Q1 total is what an auditor'
\echo 'expect: stops on, and Re-Calc owns the figures of what it computes.'
select coalesce(m01::text,'(blank)') as m01, coalesce(m02::text,'(blank)') as m02,
       coalesce(m03::text,'(blank)') as m03
  from public.quality_objectives where year=2026 and parameter='TESTQ quarterly field';

\echo '--- 8. ...and NEVER touches a TYPED one, quarterly or not ---'
\echo 'expect: 0.11 0.22 0.33 — untouched. "if the value is not calculated by'
\echo 'expect: us, leave it to be editable" applies to every month of it.'
select m01, m02, m03 from public.quality_objectives
 where year=2026 and parameter='TESTQ typed quarterly';

\echo '--- 9. THE ASSUMPTIONS AND THE HARD STOPS ARE STATED ---'
\echo 'expect: the quarterly objective says it is quarterly, says cumulative'
\echo 'expect: means pooled rather than averaged, and names the PM register'
select kind, note from public.objective_notes(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly pm'), 3)
 where kind = 'ASSUMPTION';
\echo 'expect: the hard stops — cancelled never counted, the cutoff, no calls'
\echo 'expect: means no rate, Re-Calc is explicit and never overwrites a typed'
\echo 'expect: figure'
select note from public.objective_notes(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly pm'), 3)
 where kind = 'HARD STOP';

\echo '--- 10. a TYPED objective says so, and says there are no rows behind it ---'
\echo 'expect: one HARD STOP saying the figure was typed. An evidence file that'
\echo 'expect: silently returned nothing would read as a fault in the export.'
select kind, note from public.objective_notes(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ typed quarterly'), 3)
 where kind = 'HARD STOP';

\echo '--- 11. the notes FOLLOW the objective, they do not describe a fixed one ---'
\echo 'expect: t — re-point the PM objective at Installation and the note'
\echo 'expect: changes with it. A file that went on naming the old register'
\echo 'expect: would be worse than one that named none.'
update public.quality_objectives set calc_params = '{"family":"installation"}'::jsonb
 where year=2026 and parameter='TESTQ quarterly pm';
select exists (select 1 from public.objective_notes(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly pm'), 3)
   where note like '%Installation calls register%') as note_followed_the_objective;
update public.quality_objectives set calc_params = '{"family":"pm"}'::jsonb
 where year=2026 and parameter='TESTQ quarterly pm';

-- ---------------------------------------------------------------------------
-- 12-14. ATTENDED WITHIN N DAYS. Four April field calls, attended on day 0, 3,
-- 4 and never — so the boundary is exercised from both sides and the
-- never-attended case is present, which is the one a naive query drops.
-- ---------------------------------------------------------------------------
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                complaint_date, party_name, city, state, item_status,
                                complaint_reported, standard_complaint, allocated_to)
values ('QP-A0','QA0','FIELD','QVENT','QS-A0', date '2026-04-01', date '2026-04-01','H','C','S','CMC','x','y','E'),
       ('QP-A3','QA3','FIELD','QVENT','QS-A3', date '2026-04-01', date '2026-04-01','H','C','S','CMC','x','y','E'),
       ('QP-A4','QA4','FIELD','QVENT','QS-A4', date '2026-04-01', date '2026-04-01','H','C','S','CMC','x','y','E'),
       ('QP-AX','QAX','FIELD','QVENT','QS-AX', date '2026-04-01', date '2026-04-01','H','C','S','CMC','x','y','E');
insert into public.reports (uid, ucn, call_number, call_status, engineer, visit_at, updated_at) values
 ('QPRA0','QP-A0','QA0','Unsolved','E', timestamptz '2026-04-01 10:00+05:30', timestamptz '2026-04-01 10:00+05:30'),
 ('QPRA3','QP-A3','QA3','Unsolved','E', timestamptz '2026-04-04 10:00+05:30', timestamptz '2026-04-04 10:00+05:30'),
 ('QPRA4','QP-A4','QA4','Unsolved','E', timestamptz '2026-04-05 10:00+05:30', timestamptz '2026-04-05 10:00+05:30');

insert into public.quality_objectives
  (year, sort_order, process, parameter, yearly_target, frequency, responsible, calc_key, calc_params)
values (2026, 96, 'BUSINESS', 'TESTQ attended 3d', '>75%', 'Monthly', 'X',
        'attended_within_days', '{"family":"field","days":3}'::jsonb);

\echo '--- 12. THE 3-DAY BOUNDARY IS INCLUSIVE, and never-attended counts against ---'
\echo 'expect: 0.500000 — attended on day 0 and day 3 pass; day 4 and never'
\echo 'expect: attended fail. Day 3 passing is the decision this asserts: it is'
\echo 'expect: read as "3 days or fewer", and one number on the screen changes'
\echo 'expect: it if the business means something else.'
select public.objective_value(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ attended 3d'), 4) as april;

\echo '--- 13. ...and the evidence says WHICH, and how many days each took ---'
\echo 'expect: QP-A0 and QP-A3 attended; QP-A4 late; QP-AX late, "never'
\echo 'expect: attended" — the failing call that a naive query drops entirely is'
\echo 'expect: the one most worth seeing on the sheet.'
select role, ucn, status from public.objective_evidence(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ attended 3d'), 4)
 order by ucn;

\echo '--- 14. A SPARE REQUEST COUNTS AS ATTENDING, and the EARLIER one wins ---'
insert into public.spare_requests (uid, ucn, or_req_date, engineer, party_name)
values ('QP-SR-AX', 'QP-AX', date '2026-04-02', 'E', 'H');
\echo 'expect: 0.750000 — QP-AX was never visited but a spare was raised on day'
\echo 'expect: 1, and the user''s Call Attended rule is the EARLIER of the two.'
\echo 'expect: The same rule the KPI export uses, so the two artifacts agree.'
select public.objective_value(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ attended 3d'), 4) as april_with_spare;

\echo '--- 15. a period with NO calls gives NO rate — blank, never 0% ---'
\echo 'expect: blank for December — a 0% there would read as "nothing was open"'
select coalesce(public.objective_value(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ monthly field'), 12)::text,
  '(blank)') as december;

\echo '--- 16. CANCELLED CALLS ARE NEVER COUNTED ---'
update public.field_calls set cancelled_at = now(), cancel_reason = 'test'
 where ucn = 'QP-F1';
\echo 'expect: 0.000000 — the one open call in Q1 was cancelled, so the quarter'
\echo 'expect: has 9 registered and none open. Not 1/9, and not 1/10.'
select public.objective_value(
  (select id from public.quality_objectives where year=2026 and parameter='TESTQ quarterly field'), 3) as q1_after_cancel;
update public.field_calls set cancelled_at = null, cancel_reason = '' where ucn = 'QP-F1';

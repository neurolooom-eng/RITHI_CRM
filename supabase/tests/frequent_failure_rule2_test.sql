-- ===========================================================================
-- FREQUENT FAILURE, RULE 2: THE SAME FAULT ACROSS THE FLEET (0198).
--
-- The user, 2026-09-15: "For frequent failure - Add more rule. Rule 2, Same
-- Complaint across same product, but multiple serial nos in the last 30 days."
--
-- WHAT THIS SUITE IS REALLY HOLDING is the SEPARATION between the two rules,
-- because a second rule that merely fires more often is not a second rule:
--
--   RULE 1  one MACHINE repeating — same product AND serial.
--   RULE 2  one MODEL failing the same way on DIFFERENT units. The thing rule 1
--           can never see, since each of those calls is a first failure on its
--           own machine.
--
-- So the two cases that matter most are the ones where exactly ONE fires: three
-- units with one complaint (rule 2 only), and one unit failing three times
-- (rule 1 only). If both fired on both, the rule would have been a wider
-- version of the first and not worth having.
--
-- IT COUNTS DISTINCT SERIALS, NOT CALLS, and that is the load-bearing choice —
-- "multiple serial nos" is the user's own wording, and counting calls would
-- make five visits to one machine read as a fleet problem.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.field_calls where ucn like 'R2%';

insert into public.field_calls (ucn, reg_date, product_name, serial, standard_complaint) values
  -- THREE different ORION-G units, one complaint, inside thirty days.
  ('R2A0001', current_date,      'ORION-G', '2410', 'BLOWER NOISE'),
  ('R2A0002', current_date - 5,  'ORION-G', '2411', 'BLOWER NOISE'),
  ('R2A0003', current_date - 20, 'ORION-G', '2412', 'BLOWER NOISE'),
  -- ONE VEGA failing the same way three times: rule 1's finding, not a fleet's.
  ('R2B0001', current_date,      'VEGA', '9001', 'NO POWER'),
  ('R2B0002', current_date - 3,  'VEGA', '9001', 'NO POWER'),
  ('R2B0003', current_date - 9,  'VEGA', '9001', 'NO POWER'),
  -- A second ORION-G unit with a DIFFERENT complaint: same model, so it must
  -- NOT be counted — the complaint is what makes it the same failure.
  ('R2C0001', current_date,      'ORION-G', '2413', 'DISPLAY BLANK'),
  -- ...and one OUTSIDE the window, at 40 days.
  ('R2D0001', current_date - 40, 'ORION-G', '2414', 'BLOWER NOISE');

\echo ''
\echo '--- 1. THREE UNITS, ONE COMPLAINT: rule 2 fires, rule 1 does not ---------'
\echo 'expect: rule1 f, rule2 t, serials 3, verdict t'
select (public.frequent_failure('R2A0001')->>'rule1_is_frequent')  as rule1,
       (public.frequent_failure('R2A0001')->>'rule2_is_frequent')  as rule2,
       (public.frequent_failure('R2A0001')->>'rule2_serials_seen') as serials,
       (public.frequent_failure('R2A0001')->>'is_frequent')        as verdict;

\echo ''
\echo '--- 2. ONE UNIT THREE TIMES: rule 1 fires, rule 2 does NOT ---------------'
-- The case the "count serials, not calls" decision exists for. Three calls,
-- one serial: a machine in trouble, not a batch.
\echo 'expect: rule1 t, rule2 f, serials 1, verdict t'
select (public.frequent_failure('R2B0001')->>'rule1_is_frequent')  as rule1,
       (public.frequent_failure('R2B0001')->>'rule2_is_frequent')  as rule2,
       (public.frequent_failure('R2B0001')->>'rule2_serials_seen') as serials,
       (public.frequent_failure('R2B0001')->>'is_frequent')        as verdict;

\echo ''
\echo '--- 3. SAME MODEL, DIFFERENT COMPLAINT: not counted ----------------------'
-- Matching on the product alone would flag every busy model in the register.
\echo 'expect: rule2 f, serials 1 — itself only'
select (public.frequent_failure('R2C0001')->>'rule2_is_frequent')  as rule2,
       (public.frequent_failure('R2C0001')->>'rule2_serials_seen') as serials;

\echo ''
\echo '--- 4. THE WINDOW IS THIRTY DAYS, AND IT IS IN DAYS ----------------------'
-- The 40-day-old call sees only itself; the recent three do not reach it.
\echo 'expect: serials 1 — the others are outside its thirty days'
select (public.frequent_failure('R2D0001')->>'rule2_serials_seen') as serials;
\echo 'expect: 30 — days, not a month, which differs in February'
select (public.frequent_failure_rule()->>'rule2_window_days') as window_days;

\echo ''
\echo '--- 5. THE RULE CAN BE TURNED OFF, and then only rule 1 answers ----------'
update public.app_settings set value = 'false' where key = 'ffr.rule2_enabled';
\echo 'expect: rule2 f, verdict f — the three-unit case, with rule 2 off'
select (public.frequent_failure('R2A0001')->>'rule2_is_frequent') as rule2,
       (public.frequent_failure('R2A0001')->>'is_frequent')       as verdict;
update public.app_settings set value = 'true' where key = 'ffr.rule2_enabled';

\echo ''
\echo '--- 6. RULE 1 IS UNCHANGED BY ANY OF THIS -------------------------------'
-- 0198 rewrites frequent_failure() whole, so the OLD rule has to be shown
-- still standing. `equipment_needs_complaint` is the one that nearly went: the
-- first draft rewrote its truthiness test as `in (''true'',...)` while the stored
-- value is `on`, so it silently read FALSE and rule 1 would have flagged more
-- calls than it does today.
\echo 'expect: true — the stored value is `on`, and `on` means on'
select (public.frequent_failure_rule()->>'equipment_needs_complaint') as needs_complaint;
\echo 'expect: 1 and 2 — rule 1''s window and threshold untouched'
select (public.frequent_failure_rule()->>'window_months') as months,
       (public.frequent_failure_rule()->>'threshold')     as threshold;

\echo ''
\echo '--- 7. A MACHINE THAT CANNOT BE IDENTIFIED still says "cannot tell" ------'
-- Rule 2 needs only the product and the complaint, so it COULD answer here —
-- but it counts DISTINCT SERIALS and a call whose own serial is unknown cannot
-- be one of them. Answering on a fleet while reporting "cannot tell" about the
-- machine would be two verdicts in one envelope.
insert into public.field_calls (ucn, reg_date, product_name, serial, standard_complaint)
values ('R2E0001', current_date, 'ORION-G', '', 'BLOWER NOISE');
\echo 'expect: known f, rule2 f'
select (public.frequent_failure('R2E0001')->>'known')            as known,
       (public.frequent_failure('R2E0001')->>'rule2_is_frequent') as rule2;

delete from public.field_calls where ucn like 'R2%';

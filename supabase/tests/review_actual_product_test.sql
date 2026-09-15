-- ===========================================================================
-- REVIEW 2 MAY CORRECT WHICH PRODUCT FAILED (0197).
--
-- The user, 2026-09-14: "Accessory Issues are also Logged in the Main Product -
-- Like CPX Care Failure is logged in Extend-XT or Orion-G ... I can select the
-- Actual Product [Accessory in this case] and the Failure is included in the
-- Accessory and Excluded from the Main Product."
--
-- THE ASK HAS TWO HALVES AND THIS SUITE HOLDS BOTH, because a change that does
-- only the first is the worse outcome: a failure counted under the accessory
-- AND still under the machine inflates both, and a Pareto that double-counts is
-- worse than one that is merely wrong. One effective value satisfies both by
-- construction, and that is what is tested — the totals before and after.
--
-- AND THE CALL IS NEVER REWRITTEN. The call says a machine was down and an
-- engineer went to it; that stays true, and the report still names it. What the
-- review establishes is what actually failed. Both are readable afterwards, and
-- the DIFFERENCE is exposed rather than hidden.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.field_failure_reports where ffr_no like 'RAP-%';
delete from public.call_reviews where ucn in ('26A02F9001','26A02F9002','26A02F9003');

insert into public.field_failure_reports (ffr_no, ffr_date, ucn, product_name, product_serial)
values ('RAP-1', current_date, '26A02F9001', 'ORION-G',   '2410'),
       ('RAP-2', current_date, '26A02F9002', 'ORION-G',   '2411'),
       ('RAP-3', current_date, '26A02F9003', 'EXTEND-XT', '7001');
insert into public.call_reviews (ucn, complaint_grouping, root_cause_keyword)
values ('26A02F9001','Accessory','POWER BOARD'),
       ('26A02F9002','Main unit','MIXER'),
       ('26A02F9003','Accessory','POWER CABLE');

\echo ''
\echo '--- 1. BEFORE: every report counts under the product its call named ------'
\echo 'expect: ORION-G 2, EXTEND-XT 1'
select live_product_name, count(*) from public.field_failure_register
 where ffr_no like 'RAP-%' group by 1 order by 1;

\echo ''
\echo '--- 2. Review 2 says the CPX CARE failed, on two of the three ------------'
update public.call_reviews set actual_product = 'CPX CARE'
 where ucn in ('26A02F9001','26A02F9003');

\echo ''
\echo '--- 3. AFTER: INCLUDED in the accessory and EXCLUDED from the machine ----'
-- BOTH HALVES IN ONE RESULT. CPX CARE gains two; ORION-G drops from two to one
-- and EXTEND-XT disappears entirely, having had only the one report that moved.
\echo 'expect: CPX CARE 2, ORION-G 1 — and NO EXTEND-XT row at all'
select live_product_name, count(*) from public.field_failure_register
 where ffr_no like 'RAP-%' group by 1 order by 1;

\echo 'expect: 3 — the total is unchanged, so nothing was double-counted'
select count(*) as total from public.field_failure_register where ffr_no like 'RAP-%';

\echo ''
\echo '--- 4. THE CALL IS NOT REWRITTEN -----------------------------------------'
\echo 'expect: each report still names what the call named, and says it moved'
select ffr_no, product_name as "the call named", live_product_name as "actually failed",
       live_product_changed as "moved"
  from public.field_failure_register where ffr_no like 'RAP-%' order by ffr_no;

\echo ''
\echo '--- 5. CLEARING IT PUTS THE REPORT BACK ----------------------------------'
-- An empty value is the normal state and means the call was right, so clearing
-- a correction has to be a real undo rather than leaving a blank product.
update public.call_reviews set actual_product = '' where ucn = '26A02F9003';
\echo 'expect: EXTEND-XT is back, and CPX CARE is down to 1'
select live_product_name, count(*) from public.field_failure_register
 where ffr_no like 'RAP-%' group by 1 order by 1;

\echo ''
\echo '--- 6. A REPORT WITH NO REVIEW AT ALL still has a product ----------------'
-- The join is a LEFT one, so a report nobody has reviewed must not come back
-- with an empty machine — that would empty the dimension for the whole of the
-- unreviewed backlog, which is most of a migrated register.
insert into public.field_failure_reports (ffr_no, ffr_date, ucn, product_name, product_serial)
values ('RAP-4', current_date, '26A02F9004', 'MONNAL T75', '9001');
\echo 'expect: MONNAL T75 — the report''s own product, with no review to say otherwise'
select live_product_name, live_product_changed from public.field_failure_register where ffr_no = 'RAP-4';

\echo ''
\echo '--- 7. the view still applies the reader''s own row-level security -------'
-- `create or replace view` DROPS security_invoker, and a view without it reads
-- as its OWNER. This project shipped that fault three times, and 0197 rebuilds
-- this view — so the setting is asserted here as well as by check:views.
\echo 'expect: t'
select coalesce(array_to_string(c.reloptions, ',') like '%security_invoker=on%', false)
  from pg_class c where c.oid = 'public.field_failure_register'::regclass;

delete from public.field_failure_reports where ffr_no like 'RAP-%';
delete from public.call_reviews where ucn in ('26A02F9001','26A02F9002','26A02F9003');

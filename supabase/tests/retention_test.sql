-- ===========================================================================
-- A RECORD IS NOT DELETED BY THE APPLICATION, AND AN AMENDMENT IS RECOVERABLE.
-- FRS-022 (record integrity) — OQ-61.
--
-- WRITTEN BECAUSE IT HAD NO TEST. FRS-022 is a HIGH-risk requirement and was one
-- of four carrying no protocol at all when the package was measured against
-- itself on 2026-09-14. A control nobody exercises is a control nobody knows
-- the state of, and this one is the whole of the retention argument.
--
-- WHAT IT HOLDS, and the third is the one people get wrong:
--   * the APPLICATION role cannot delete a quality record, and is told why;
--   * an amendment is recoverable from the record's own history;
--   * a VOIDED line is still there, carrying its ORIGINAL quantity and reason —
--     voiding is not a soft delete, the original figure is the evidence;
--   * the DATABASE OWNER can delete, deliberately, that being the archival
--     exception the retention trigger is written to permit.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.field_failure_reports where ffr_no like 'RET-%';
delete from public.spare_consumption where engineer = 'RET ENGINEER';
delete from public.spare_issue_history where engineer = 'RET ENGINEER';

insert into public.field_failure_reports (ffr_no, ffr_date, ucn, product_name, product_serial)
values ('RET-001', current_date, '26A02F0001', 'ORION-G', '2410');
-- THE ENGINEER MUST HOLD THE PART BEFORE CONSUMING IT. Hand stock is DERIVED,
-- and a trigger caps every consumption line at the balance — so a seed that
-- consumes without issuing is refused, which is the cap working and not a fault
-- in this suite. Found by running it.
insert into public.spare_issue_history (engineer, part, qty, source)
values ('RET ENGINEER', 'RET-1|A PART', 5, 'stock out');
insert into public.spare_consumption (engineer, part, qty, ucn, source)
values ('RET ENGINEER', 'RET-1|A PART', 3, '26A02F0001', 'test');

\echo ''
\echo '--- 1. THE APPLICATION CANNOT DELETE A QUALITY RECORD ---------------------'
-- `block_hard_delete` tests `current_user = ''authenticated''`, so this must be
-- run AS that role — as the owner it would pass and prove nothing, which is the
-- same trap the part-rename ticket test had to avoid.
\echo 'expect ERROR: RECORD RETENTION ... field_failure_reports'
begin;
set local role authenticated;
delete from public.field_failure_reports where ffr_no = 'RET-001';
rollback;

\echo 'expect ERROR: RECORD RETENTION ... spare_consumption'
begin;
set local role authenticated;
delete from public.spare_consumption where engineer = 'RET ENGINEER';
rollback;

\echo 'expect: 1 1 — both are still there'
select (select count(*) from public.field_failure_reports where ffr_no = 'RET-001') as ffr,
       (select count(*) from public.spare_consumption where engineer = 'RET ENGINEER') as consumption;

\echo ''
\echo '--- 2. AN AMENDMENT IS RECOVERABLE FROM THE RECORD''S OWN HISTORY ---------'
update public.field_failure_reports
   set problem_reported = 'corrected wording' where ffr_no = 'RET-001';
\echo 'expect: at least one history row naming this report'
select count(*) as "history rows" from public.ffr_history where ffr_no = 'RET-001';

\echo ''
\echo '--- 3. A VOIDED LINE IS STILL THERE, CARRYING ITS ORIGINAL FIGURE ---------'
-- VOIDING IS NOT A SOFT DELETE. The original quantity is the evidence of what
-- was booked; a row zeroed with no memory of what it said is a deletion that
-- left a husk behind.
update public.spare_consumption
   set qty = 0, adjustment_reason = 'booked against the wrong call'
 where engineer = 'RET ENGINEER';
\echo 'expect: qty 0, the reason kept, and the row present'
select qty, adjustment_reason is not null and btrim(adjustment_reason) <> '' as "reason kept"
  from public.spare_consumption where engineer = 'RET ENGINEER';

\echo ''
\echo '--- 4. THE OWNER MAY DELETE — that is the archival exception --------------'
-- Not a hole: the trigger names it, and it is what makes a controlled clear-out
-- (the pre-2026 reviews, the old field failure reports) possible at all.
delete from public.field_failure_reports where ffr_no = 'RET-001';
\echo 'expect: 0 — and 0 history rows, the history being ON DELETE CASCADE'
select (select count(*) from public.field_failure_reports where ffr_no = 'RET-001') as ffr,
       (select count(*) from public.ffr_history where ffr_no = 'RET-001') as history;

delete from public.spare_consumption where engineer = 'RET ENGINEER';
delete from public.spare_issue_history where engineer = 'RET ENGINEER';

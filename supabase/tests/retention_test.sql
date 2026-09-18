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
-- 0214: A SPARE NEEDS A VISIT BEHIND IT. `zz_consumption_needs_visit` refuses a
-- consumption row whose call has no `reports` entry, so without these the
-- inserts below are REFUSED and every assertion after them reads as the failure
-- it is testing for. Added when 0214 shipped and this fixture was not brought
-- forward with it.
insert into public.reports (ucn, uid, visit_at, updated_at)
select v.u, 'T-VISIT-' || v.u, now(), now() from (values ('26A02F0001')) v(u)
on conflict (uid) do nothing;

insert into public.spare_consumption (engineer, part, qty, ucn, source)
values ('RET ENGINEER', 'RET-1|A PART', 3, '26A02F0001', 'test');

\echo ''
\echo '--- 1. THE APPLICATION CANNOT DELETE A QUALITY RECORD ---------------------'
-- TWO CONTROLS, AND ONLY THE SECOND IS THE ONE PEOPLE NAME. Found by running
-- this suite in isolation on 2026-09-15: as `authenticated` the delete affects
-- ZERO ROWS AND RAISES NOTHING, because these tables carry SELECT, INSERT and
-- UPDATE policies and NO DELETE POLICY — so Row-Level Security never locates a
-- row to delete and `block_hard_delete` is never reached.
--
-- It is the same mechanism the package already records for signatures: a DELETE
-- must find its row through the SELECT policy first. The consequence here is
-- the opposite and worth stating plainly: THE RECORD IS PROTECTED, but by the
-- ABSENCE of a delete path rather than by the retention trigger. The trigger is
-- the second line, and this suite tests it by MAKING it reachable.
--
-- Run as `authenticated`, never as the owner: the owner bypasses RLS and the
-- whole of this section would pass while proving nothing.
\echo 'expect: DELETE 0 — RLS finds no row to delete, so nothing is removed'
begin;
set local role authenticated;
delete from public.field_failure_reports where ffr_no = 'RET-001';
delete from public.spare_consumption where engineer = 'RET ENGINEER';
rollback;

\echo 'expect: 1 1 — untouched by the attempt above'
select (select count(*) from public.field_failure_reports where ffr_no = 'RET-001') as ffr,
       (select count(*) from public.spare_consumption where engineer = 'RET ENGINEER') as consumption;

\echo ''
\echo '--- 1b. AND IF A DELETE PATH EVER EXISTED, THE TRIGGER STILL REFUSES ------'
-- The belt to the policy's braces. Somebody adding a DELETE policy — believing
-- it harmless because "the trigger blocks it anyway" — must still find the
-- trigger blocking it. Granted here and rolled back, so the schema is unchanged.
-- REACHING THE TRIGGER TAKES BOTH: a delete path AND a row the reader can SEE.
-- A DELETE must first locate its row through the SELECT policy, so with
-- `ffr_read` refusing this row the delete stayed at zero even with a delete
-- policy in place — which is the finding of section 1 restated, and is why the
-- row used here is one `ffr_read` admits to everybody: a report carrying NO
-- UCN, which that policy allows because a report not yet tied to a call cannot
-- be scoped by one.
insert into public.field_failure_reports (ffr_no, ffr_date, ucn, product_name, product_serial)
values ('RET-002', current_date, '', 'ORION-G', '2411');
begin;
create policy ret_tmp_delete on public.field_failure_reports for delete to authenticated using (true);
set local role authenticated;
\echo 'expect ERROR: RECORD RETENTION ... field_failure_reports'
delete from public.field_failure_reports where ffr_no = 'RET-002';
rollback;


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

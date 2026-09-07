-- ===========================================================================
-- THE KPI WORKBOOK'S Field_INST TAB, FROM THE REGISTER (0128).
--
-- What this suite is really holding — the three rules the user gave, each of
-- which is a decision somebody could get wrong later:
--
--   * CALL ATTENDED ON is the EARLIER of the first visit and the first spare
--     request, and it is whichever one exists when only one does;
--   * CALL SOLVED is the visit date of the entry that moved the call to
--     Solved - Report Completed — not the last visit, not the day it was
--     typed in, and on a reopened-and-resolved call the LATEST such entry;
--   * CLOSE means Solved - Report Completed and NOTHING else. A call left at
--     "Solved - Report Pending" is OPEN;
--   * CANCELLED CALLS DO NOT APPEAR AT ALL — not Open, not Close, not counted.
--     The workbook counted them as Close, which is why its 581 Close rows were
--     563 completed calls plus 18 cancellations.
--
-- And two the format depends on: PM calls are not on this tab, and the view
-- reads as the READER (an engineer's export is their own calls).
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.reports        where ucn like 'KP-%';
delete from public.spare_requests where ucn like 'KP-%';
delete from public.field_calls    where ucn like 'KP-%';
delete from public.installation_calls where ucn like 'KP-%';
delete from public.pm_calls       where ucn like 'KP-%';

insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                complaint_date, party_name, city, state, item_status,
                                complaint_reported, standard_complaint, allocated_to, breakdown_date)
values
 ('KP-VISIT','C-1','FIELD','MONNAL T75','1', date '2026-09-01', date '2026-09-01','H','Chennai','TN','CMC','x','y','Eng A', date '2026-09-01'),
 ('KP-SPARE','C-2','FIELD','MONNAL T75','2', date '2026-09-01', date '2026-09-01','H','Chennai','TN','CMC','x','y','Eng A', date '2026-09-01'),
 ('KP-BOTH', 'C-3','FIELD','MONNAL T75','3', date '2026-09-01', date '2026-09-01','H','Chennai','TN','CMC','x','y','Eng A', date '2026-09-01'),
 ('KP-NEITHER','C-4','FIELD','MONNAL T75','4', date '2026-09-01', date '2026-09-01','H','Chennai','TN','CMC','x','y','Eng A', date '2026-09-01'),
 ('KP-PENDING','C-5','FIELD','MONNAL T75','5', date '2026-09-01', date '2026-09-01','H','Chennai','TN','CMC','x','y','Eng A', date '2026-09-01'),
 ('KP-REDONE','C-6','FIELD','MONNAL T75','6', date '2026-09-01', date '2026-09-01','H','Chennai','TN','CMC','x','y','Eng A', date '2026-09-01'),
 ('KP-CANC','C-7','FIELD','MONNAL T75','7', date '2026-09-01', date '2026-09-01','H','Chennai','TN','CMC','x','y','Eng A', date '2026-09-01');
insert into public.installation_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                complaint_date, party_name, city, state, item_status,
                                complaint_reported, standard_complaint, allocated_to, breakdown_date)
values ('KP-INST','C-8','INSTALLATION CALL','MONNAL T75','8', date '2026-09-01', date '2026-09-01','H','Chennai','TN','WGP','x','y','Eng A', date '2026-09-01');
insert into public.pm_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                complaint_date, party_name, city, state, item_status,
                                complaint_reported, standard_complaint, allocated_to, breakdown_date)
values ('KP-PM','C-9','PM VISIT','MONNAL T75','9', date '2026-09-01', date '2026-09-01','H','Chennai','TN','CMC','x','y','Eng A', date '2026-09-01');

update public.field_calls set cancelled_at = now() where ucn = 'KP-CANC';

-- Visits. `updated_at` is what orders the ENTRIES, and it is deliberately NOT
-- the same order as visit_at on KP-REDONE — that is the case the rule is for.
--
-- The uids are NOT `WEB-`: 0115's visit-date guard refuses a future date on a
-- visit entered through the form, and these fixtures use FIXED dates so the
-- suite reads the same in a year's time. Imported history is exempt by design,
-- and imported history is what these rows represent.
insert into public.reports (uid, ucn, call_number, call_status, pending_reason, engineer, visit_at, updated_at) values
 ('KPV-1','KP-VISIT','C-1','Unsolved','SPARES NOT AVAILABLE','Eng V', timestamptz '2026-09-05 10:00+05:30', timestamptz '2026-09-05 10:00+05:30'),
 ('KPV-2','KP-BOTH','C-3','Solved - Report Completed','','Eng B',  timestamptz '2026-09-08 10:00+05:30', timestamptz '2026-09-08 10:00+05:30'),
 ('KPV-3','KP-PENDING','C-5','Solved - Report Pending','REPORT PENDING','Eng P', timestamptz '2026-09-06 10:00+05:30', timestamptz '2026-09-06 10:00+05:30'),
 -- solved, reopened (unsolved), solved again on a LATER entry but an EARLIER
 -- visit date: the standing solve is the second one.
 ('KPV-4','KP-REDONE','C-6','Solved - Report Completed','','Eng R', timestamptz '2026-09-03 10:00+05:30', timestamptz '2026-09-03 10:00+05:30'),
 ('KPV-5','KP-REDONE','C-6','Unsolved','WORK IN PROGRESS','Eng R',  timestamptz '2026-09-04 10:00+05:30', timestamptz '2026-09-04 10:00+05:30'),
 ('KPV-6','KP-REDONE','C-6','Solved - Report Completed','','Eng R2', timestamptz '2026-09-02 10:00+05:30', timestamptz '2026-09-10 09:00+05:30'),
 ('KPV-7','KP-CANC','C-7','Solved - Report Completed','','Eng C',   timestamptz '2026-09-05 10:00+05:30', timestamptz '2026-09-05 10:00+05:30'),
 ('KPV-8','KP-INST','C-8','Unsolved','WORK IN PROGRESS','Eng I',     timestamptz '2026-09-07 10:00+05:30', timestamptz '2026-09-07 10:00+05:30');

-- Spares. KP-SPARE has one and no visit; KP-BOTH has one raised BEFORE its visit.
insert into public.spare_requests (uid, ucn, engineer, item_status, or_req_date) values
 ('KPOR-1','KP-SPARE','Eng A','CMC', date '2026-09-04'),
 ('KPOR-2','KP-BOTH', 'Eng A','CMC', date '2026-09-03');

\echo '--- 1. the tab is FIELD + INSTALLATION only, and never a cancelled call ---'
\echo 'expect: KP-BOTH, KP-INST, KP-NEITHER, KP-PENDING, KP-REDONE, KP-SPARE, KP-VISIT'
\echo 'expect: NOT KP-CANC (cancelled) and NOT KP-PM (its own tab)'
select "UC Number" from public.kpi_field_inst where "UC Number" like 'KP-%' order by 1;

\echo '--- 2. CALL ATTENDED ON — the earlier of first visit and first spare ---'
\echo 'expect: VISIT 09-05 (visit only) | SPARE 09-04 (spare only)'
\echo 'expect: BOTH 09-03 (spare came FIRST) | NEITHER blank'
select "UC Number", "Call Attended On"
  from public.kpi_field_inst
 where "UC Number" in ('KP-VISIT','KP-SPARE','KP-BOTH','KP-NEITHER') order by 1;

\echo '--- 3. CALL SOLVED — the visit date of the entry that completed it ---'
\echo 'expect: BOTH 2026-09-08; REDONE 2026-09-02 (the LATEST ENTRY, whose visit'
\echo 'expect: date is EARLIER than the first solve — entry order, not date order)'
select "UC Number", "Call Solved Date & Time"
  from public.kpi_field_inst where "UC Number" in ('KP-BOTH','KP-REDONE') order by 1;

\echo '--- 4. OPEN / CLOSE — Close ONLY when Solved - Report Completed ---'
\echo 'expect: BOTH Close, REDONE Close, everything else Open'
\echo 'expect: KP-PENDING is OPEN — report pending is not solved'
select "UC Number", "Open/Close", "Call Status"
  from public.kpi_field_inst where "UC Number" like 'KP-%' order by 1;

\echo '--- 5. a call with no visit reads as Unattended, not blank ---'
\echo 'expect: Unattended, and no pending reason or engineer'
select "Call Status", "CALL PENDING REASON" as reason, "Visiting Service Engineer" as engineer
  from public.kpi_field_inst where "UC Number" = 'KP-NEITHER';

\echo '--- 6. the pending reason and engineer come from the LATEST entry ---'
\echo 'expect: KP-VISIT SPARES NOT AVAILABLE / Eng V; KP-REDONE blank / Eng R2'
select "UC Number", "CALL PENDING REASON" as reason, "Visiting Service Engineer" as engineer
  from public.kpi_field_inst where "UC Number" in ('KP-VISIT','KP-REDONE') order by 1;

\echo '--- 7. the columns are the workbook''s A-AB, in its order and spelling ---'
\echo 'expect: 28, ending Call Attended On | Call Solved Date & Time'
select count(*) as columns from information_schema.columns
 where table_schema='public' and table_name='kpi_field_inst';
select string_agg(column_name, ' | ' order by ordinal_position) as last_six
  from (select column_name, ordinal_position from information_schema.columns
         where table_schema='public' and table_name='kpi_field_inst'
         order by ordinal_position desc limit 6) x;

\echo '--- 8. the view reads as the READER, or every engineer exports every call ---'
\echo 'expect: t'
select coalesce(array_to_string(reloptions, ',') like '%security_invoker=on%', false) as invoker
  from pg_class where oid = 'public.kpi_field_inst'::regclass;

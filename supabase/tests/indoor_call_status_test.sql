-- ===========================================================================
-- THE INDOOR JOB'S CALL STATUS AND CALL PENDING REASON (0372).
--
--   The user, 2026-10-04: the Repair page's Workshop record carries Call
--   Status and Call Pending Reason, by the visit form's rules; they ARE the
--   visit's; the job's status is derived from them; a DEMO / new device keeps
--   its Status chosen by hand.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.field_calls (ucn, call_number, party_name) values
 ('UCN-CS-1', 'CN-CS-1', 'CS HOSPITAL') on conflict do nothing;

insert into public.indoor_jobs (kind, activity, ucn, product_name, serial, party_name, status, cleaned_at, qc_result, visit_draft) values
 ('Customer property', 'Repair',          'UCN-CS-1', 'CS VENT', 'CS1', 'CS HOSPITAL', 'Cleaned', now(), null,   '{"status":"Unsolved","pendingReason":"Return to Field","work":{}}'),
 ('Customer property', 'Troubleshooting', 'UCN-CS-1', 'CS VENT', 'CS2', 'CS HOSPITAL', 'Cleaned', now(), 'Pass', null),
 ('Customer property', 'Repair',          'UCN-CS-1', 'CS VENT', 'CS3', 'CS HOSPITAL', 'Received', null, null,  null);
insert into public.indoor_jobs (kind, activity, ucn, product_name, serial, demo_for_party, status, cleaned_at) values
 ('DEMO unit', 'Demo', null, 'CS DEMO', 'CS4', 'CS CLINIC', 'Cleaned', now());

\echo '--- 1. UNSOLVED, SPARES NOT AVAILABLE -> AWAITING SPARES ---'
update public.indoor_jobs set call_status = 'Unsolved', call_pending_reason = 'SPARES NOT AVAILABLE' where serial = 'CS1';
select 'awaiting spares, and the visit draft follows',
       status = 'Awaiting spares' and visit_draft->>'status' = 'Unsolved'
   and visit_draft->>'pendingReason' = 'SPARES NOT AVAILABLE' and visit_draft->>'updateWork' = 'Yes' as ok
  from public.indoor_jobs where serial = 'CS1';

\echo '--- 2. UNSOLVED, ANY OTHER REASON -> UNDER REPAIR ---'
update public.indoor_jobs set call_pending_reason = 'WORK IN PROGRESS' where serial = 'CS1';
select 'under repair', status = 'Under repair' as ok from public.indoor_jobs where serial = 'CS1';

\echo '--- 3. SOLVED, A REPAIR WITHOUT ITS QC PASS -> QC; THE REASON IS CLEARED ---'
update public.indoor_jobs set call_status = 'Solved - Report Completed' where serial = 'CS1';
select 'QC first, no pending reason on a completed report',
       status = 'QC' and call_pending_reason = '' as ok from public.indoor_jobs where serial = 'CS1';

\echo '--- 4. SOLVED - REPORT PENDING, A TROUBLESHOOTING WITH QC PASS -> READY ---'
update public.indoor_jobs set call_status = 'Solved - Report Pending' where serial = 'CS2';
select 'ready, pending reason Report Pending',
       status = 'Ready' and call_pending_reason = 'Report Pending' as ok from public.indoor_jobs where serial = 'CS2';

\echo '--- 5. NOT CLEANED YET: THE STATUS IS NOT MOVED ---'
update public.indoor_jobs set call_status = 'Unsolved', call_pending_reason = 'WORK IN PROGRESS' where serial = 'CS3';
select 'still received', status = 'Received' as ok from public.indoor_jobs where serial = 'CS3';

\echo '--- 6. A DEMO KEEPS ITS STATUS BY HAND ---'
update public.indoor_jobs set status = 'Under repair' where serial = 'CS4';
select 'demo status as set by hand', status = 'Under repair' as ok from public.indoor_jobs where serial = 'CS4';

\echo '--- 7. ONLY THE VISIT FORM''S THREE STATUSES ---'
\echo 'expect ERROR: violates check constraint indoor_jobs_call_status_check'
update public.indoor_jobs set call_status = 'Closed' where serial = 'CS2';

\echo '--- 8. WHAT THE VISIT FILES WITH ---'
select 'job choice, and the old fixed values for a job with none',
       (select (call_status, pending_reason) = ('Unsolved', 'SPARES NOT AVAILABLE') from public.indoor_visit_status('Unsolved', 'SPARES NOT AVAILABLE'))
   and (select (call_status, pending_reason) = ('Unsolved', 'Return to Field') from public.indoor_visit_status('', ''))
   and (select (call_status, pending_reason) = ('Solved - Report Completed', '') from public.indoor_visit_status('Solved - Report Completed', 'X')) as ok;

\echo '--- 9. NEW DEVICE IS ITS OWN KIND (0374), CONSIGNED WHERE IT IS GOING ---'
insert into public.indoor_jobs (kind, activity, product_name, serial, demo_for_party, status)
values ('New device', 'Troubleshooting', 'CS NEW', 'CS5', 'CS DEALER', 'Received');
select 'a New device job is accepted' as t,
       exists (select 1 from public.indoor_jobs where serial = 'CS5' and kind = 'New device') as ok;
\echo 'expect ERROR: violates check constraint indoor_jobs_kind_check'
insert into public.indoor_jobs (kind, activity, product_name, serial, status)
values ('Loan', 'Demo', 'CS X', 'CS6', 'Received');

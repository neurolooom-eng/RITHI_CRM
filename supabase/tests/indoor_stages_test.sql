-- ===========================================================================
-- THE INDOOR SERVICE STAGES (0323): the report upload, the Indoor DC's
-- Authorised By and approval, and the visit filed against the UCN at approval.
--
-- What this proves:
--
--   * indoor_dc_authorisers() offers the issuer's Reporting Manager and
--     Regional Manager (User Master) and every active NSM -- and nobody else.
--   * STAGE 4: the Indoor Service Report is REFUSED before the unit is cleaned
--     and without its report number; uploading needs indoor.work; who and when
--     are STAMPED from the session (a name the browser sends is discarded).
--   * STAGE 5: create_indoor_dc() refuses a unit with no uploaded report,
--     refuses a blank or unlisted AUTHORISED BY, stores the chosen name, makes
--     the DC PENDING APPROVAL, and prints the accessories' quantities as
--     received.
--   * A unit on a pending DC is not Dispatched.
--   * APPROVAL: only the AUTHORISED BY person (by their User Master name) or an
--     administrator approves or rejects -- the issuer and a stranger are
--     refused; a DC whose UCN job has no visit filed is not approved; the visit
--     recorded must be a visit of THAT call reading Unsolved / Return to Field /
--     Update Visit Work Details? = Yes; approval stamps who and when.
--   * A job with no UCN (a DEMO unit) needs no visit to be approved.
--   * REJECT needs a reason, keeps the DC, and RELEASES the units (DC No., DC
--     date and dispatch stamps cleared) so a new DC can be made -- by an
--     approver who holds no indoor right at all.
--   * "Return to Field" is on the Call Pending Reason master, active.
--
-- The visit itself is written by the screen through the Visit Entry's own save
-- path (CallReporting.tsx fileVisit); here it is a row put in `reports` the way
-- that path writes one.
--
-- Superuser bypasses RLS and privileges, so every scoped check runs as
-- `authenticated`. Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('7f000000-0000-0000-0000-000000000001','stg_ajay@x.com'),
 ('7f000000-0000-0000-0000-000000000002','stg_mgr@x.com'),
 ('7f000000-0000-0000-0000-000000000003','stg_nsm@x.com'),
 ('7f000000-0000-0000-0000-000000000004','stg_qc@x.com'),
 ('7f000000-0000-0000-0000-000000000005','stg_out@x.com'),
 ('7f000000-0000-0000-0000-000000000006','stg_nsm_off@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role,active) values
 ('7f000000-0000-0000-0000-000000000001','stg_ajay@x.com','Stage Ajay','tally_coordinator',true),
 ('7f000000-0000-0000-0000-000000000002','stg_mgr@x.com','Stage Manager','rm',true),
 ('7f000000-0000-0000-0000-000000000003','stg_nsm@x.com','Stage Nsm','nsm',true),
 ('7f000000-0000-0000-0000-000000000004','stg_qc@x.com','Stage Qc','commercial',true),
 ('7f000000-0000-0000-0000-000000000005','stg_out@x.com','Stage Outsider','rgm',true),
 ('7f000000-0000-0000-0000-000000000006','stg_nsm_off@x.com','Stage Nsm Left','nsm',false)
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, active = excluded.active;

-- Fixture grants (the migration grants NOTHING): the indoor engineer holds the
-- workshop rights; the approvers hold only the page; the QC holder holds the
-- page and indoor.qc (so the update policy lets the row through and the GUARD
-- has to refuse the upload).
insert into public.app_roles (role, permissions) values
 ('tally_coordinator', '["mod:/indoor","indoor.receive","indoor.work","indoor.qc","indoor.dispatch"]'::jsonb),
 ('rm',                '["mod:/indoor"]'::jsonb),
 ('nsm',               '["mod:/indoor"]'::jsonb),
 ('commercial',        '["mod:/indoor","indoor.qc"]'::jsonb),
 ('rgm',               '["mod:/indoor"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

-- THE USER MASTER: Ajay reports to Stage Manager, regionally to Stage Regional.
delete from public.user_directory where email in ('stg_ajay@x.com', 'stg_mgr@x.com');
insert into public.user_directory (name, email, reporting_manager, regional_manager) values
 ('Stage Ajay',    'stg_ajay@x.com', 'Stage Manager', 'Stage Regional'),
 ('Stage Manager', 'stg_mgr@x.com',  '',              '');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

call public.be('stg_ajay@x.com');
insert into public.indoor_jobs (kind, activity, ucn, product_name, serial, party_name, demo_for_party, status, qc_result) values
 ('Customer property', 'Repair', 'UCN-STG-1', 'STG VENT', 'G1', 'STG HOSPITAL', '',           'Received', 'Pass'),  -- J1
 ('DEMO unit',         'Demo',   null,        'STG DEMO', 'G2', null,           'STG CLINIC', 'Received', null),    -- J2
 ('Customer property', 'Repair', 'UCN-STG-3', 'STG VENT', 'G3', 'STG HOSPITAL', '',           'Received', 'Pass'),  -- J3
 ('Customer property', 'Repair', 'UCN-STG-4', 'STG VENT', 'G4', 'STG HOSPITAL', '',           'Received', 'Pass');  -- J4 never uploaded
insert into public.indoor_job_accessories (job_id, name, serial, qty)
select id, 'Flow sensor', 'FS9', 3 from public.indoor_jobs where serial = 'G1';

\echo '--- 0. THE ACCESSORY QUANTITY IS POSITIVE ---'
\echo 'expect ERROR: indoor_job_accessories_qty_positive'
insert into public.indoor_job_accessories (job_id, name, qty)
select id, 'Nothing', 0 from public.indoor_jobs where serial = 'G1';

\echo '--- 1. WHO MAY AUTHORISE AJAY''S DC ---'
\echo 'expect: Stage Manager (Reporting Manager), Stage Regional (Regional Manager), Stage Nsm (NSM) -- not the inactive NSM'
begin;
  set local role authenticated;
  select name, basis from public.indoor_dc_authorisers();
commit;

\echo '--- 2. THE REPORT BEFORE CLEANING IS REFUSED ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: the Indoor Service Report is uploaded after cleaning (WI/SER/01)'
  update public.indoor_jobs set indoor_report_no = 'ISR-G1', report_file_url = 'https://drive/isr-g1', report_file_name = 'ISR-G1_report.pdf'
   where serial = 'G1';
commit;

\echo '--- 3. CLEANED, BUT NO REPORT NUMBER ---'
update public.indoor_jobs set cleaned_by = '7f000000-0000-0000-0000-000000000001', cleaned_at = now(), status = 'Cleaned'
 where serial in ('G1', 'G2', 'G3', 'G4');
begin;
  set local role authenticated;
  \echo 'expect ERROR: an uploaded Indoor Service Report needs its Indoor Service Report No'
  update public.indoor_jobs set report_file_url = 'https://drive/isr-g1' where serial = 'G1';
commit;

\echo '--- 4. UPLOADING IS indoor.work -- a holder of indoor.qc alone is refused ---'
call public.be('stg_qc@x.com');
begin;
  set local role authenticated;
  \echo 'expect ERROR: indoor.work is required to upload the Indoor Service Report'
  update public.indoor_jobs set indoor_report_no = 'ISR-G1', report_file_url = 'https://drive/isr-g1' where serial = 'G1';
commit;

\echo '--- 5. THE UPLOAD, AND WHO DID IT IS THE SESSION ---'
call public.be('stg_ajay@x.com');
begin;
  set local role authenticated;
  update public.indoor_jobs
     set indoor_report_no = 'ISR-G1', report_file_url = 'https://drive/isr-g1', report_file_name = 'ISR-G1_report.pdf',
         report_uploaded_by = '7f000000-0000-0000-0000-000000000005', report_uploaded_at = '2001-01-01',
         visit_draft = '{"status": "Unsolved"}'::jsonb, visit_date = current_date
   where serial = 'G1';
  update public.indoor_jobs set indoor_report_no = 'ISR-' || serial, report_file_url = 'https://drive/isr-' || serial
   where serial in ('G2', 'G3');
commit;
\echo 'expect: ISR-G1 | uploaded by Ajay (not the outsider sent) | uploaded just now | Stage Ajay in the list'
select indoor_report_no, report_file_name,
       report_uploaded_by = '7f000000-0000-0000-0000-000000000001' as by_ajay,
       report_uploaded_at > now() - interval '1 minute' as just_now,
       report_uploaded_by_name
  from public.indoor_job_list where serial = 'G1';
\echo 'expect: an unrelated edit keeps the stamps'
begin;
  set local role authenticated;
  update public.indoor_jobs set remarks = 'x', report_uploaded_by = null where serial = 'G1';
commit;
select report_uploaded_by = '7f000000-0000-0000-0000-000000000001' as still_ajay from public.indoor_jobs where serial = 'G1';
\echo 'expect: the list writes the accessory with its quantity -- Flow sensor x3'
select accessories_received from public.indoor_job_list where serial = 'G1';

update public.indoor_jobs set status = 'Ready' where serial in ('G1', 'G2', 'G3', 'G4');

\echo '--- 6. A DC NEEDS THE UPLOADED REPORT ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: the Indoor Service Report has not been uploaded -- a unit goes on an Indoor DC after its report'
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'G4'), 'STG HOSPITAL', p_authorised_by => 'Stage Manager');
commit;

\echo '--- 7. AUTHORISED BY: required, and one of the list ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: choose who AUTHORISES this Indoor DC'
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'G1'), 'STG HOSPITAL');
commit;
begin;
  set local role authenticated;
  \echo 'expect ERROR: AUTHORISED BY must be your Reporting Manager, your Regional Manager or an NSM'
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'G1'), 'STG HOSPITAL', p_authorised_by => 'Stage Nsm Left');
commit;

\echo '--- 8. THREE DCs, PENDING APPROVAL ---'
begin;
  set local role authenticated;
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'G1'), 'STG HOSPITAL', p_authorised_by => 'stage manager') as dc1 \gset
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'G2'), 'STG CLINIC',   p_authorised_by => 'Stage Nsm') as dc2 \gset
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'G3'), 'STG HOSPITAL', p_authorised_by => 'Stage Manager') as dc3 \gset
commit;
\echo 'expect: three DCs, Pending approval, Authorised By stored as the list spells it (Stage Manager / Stage Nsm / Stage Manager)'
select dc_no = :'dc1' as is_dc1, authorised_by_name, approval_status from public.indoor_dcs
 where dc_no in (:'dc1', :'dc2', :'dc3') order by id;
\echo 'expect: the DC prints the accessory with the quantity received -- Flow sensor Sl.No FS9, QTY 3'
select l.description, l.qty from public.indoor_dc_lines l join public.indoor_dcs d on d.id = l.dc_id
 where d.dc_no = :'dc1' and l.accessory_id is not null;

\echo '--- 9. A UNIT ON A PENDING DC DOES NOT LEAVE ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: is still pending approval -- the unit is dispatched once it is approved'
  update public.indoor_jobs set status = 'Dispatched' where serial = 'G1';
commit;

\echo '--- 10. ONLY THE AUTHORISED BY APPROVES: the issuer and a stranger are refused ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: only Stage Manager (AUTHORISED BY) or an administrator approves Indoor DC'
  select public.approve_indoor_dc(:'dc1');
commit;
call public.be('stg_out@x.com');
begin;
  set local role authenticated;
  \echo 'expect ERROR: only Stage Manager (AUTHORISED BY) or an administrator approves Indoor DC'
  select public.approve_indoor_dc(:'dc1');
commit;
begin;
  set local role authenticated;
  \echo 'expect ERROR: only Stage Manager (AUTHORISED BY on'
  select public.record_indoor_visit((select id from public.indoor_jobs where serial = 'G1'), 'VIS-STG-1', true);
commit;
\echo 'expect: the list tells the stranger it is not theirs to decide (i_may_approve f)'
begin;
  set local role authenticated;
  select i_may_approve from public.indoor_dc_list where dc_no = :'dc1';
commit;

\echo '--- 11. THE APPROVER: not before the visit is filed ---'
call public.be('stg_mgr@x.com');
begin;
  set local role authenticated;
  \echo 'expect: OK -- the check before filing visits asks who and state only'
  select public.approve_indoor_dc(:'dc1', true);
  select i_may_approve from public.indoor_dc_list where dc_no = :'dc1';
  \echo 'expect ERROR: is not approved: the visit is not yet filed for'
  select public.approve_indoor_dc(:'dc1');
commit;

-- THE VISITS, as the Visit Entry's save path writes them (as the approver).
insert into public.reports (uid, ucn, call_status, pending_reason, engineer, data) values
 ('VIS-STG-WRONG', 'UCN-STG-1', 'Solved - Report Completed', '',                'Stage Ajay', '{"Update Visit Work Details?": "Yes"}'::jsonb),
 ('VIS-STG-OTHER', 'UCN-STG-3', 'Unsolved',                  'Return to Field', 'Stage Ajay', '{"Update Visit Work Details?": "Yes"}'::jsonb),
 ('VIS-STG-1',     'UCN-STG-1', 'Unsolved',                  'Return to Field', 'Stage Ajay',
  '{"Update Visit Work Details?": "Yes", "Manual Report No.": "ISR-G1", "Job Done": "Repaired in the workshop"}'::jsonb);
update public.reports set manual_report = 'https://drive/isr-g1' where uid = 'VIS-STG-1';

begin;
  set local role authenticated;
  \echo 'expect ERROR: does not read Unsolved / Return to Field / Update Visit Work Details? = Yes'
  select public.record_indoor_visit((select id from public.indoor_jobs where serial = 'G1'), 'VIS-STG-WRONG', true);
commit;
begin;
  set local role authenticated;
  \echo 'expect ERROR: is not a visit of call UCN-STG-1'
  select public.record_indoor_visit((select id from public.indoor_jobs where serial = 'G1'), 'VIS-STG-OTHER', true);
commit;
begin;
  set local role authenticated;
  select public.record_indoor_visit((select id from public.indoor_jobs where serial = 'G1'), 'VIS-STG-1', true);
  select public.approve_indoor_dc(:'dc1') = :'dc1' as approved;
commit;
\echo 'expect: VIS-STG-1 recorded and filed; the visit reads Unsolved | Return to Field | Yes | ISR-G1 | the report link'
select j.visit_uid, j.visit_filed_at is not null as filed, r.call_status, r.pending_reason,
       r.data ->> 'Update Visit Work Details?' as update_work, r.data ->> 'Manual Report No.' as report_no, r.manual_report
  from public.indoor_jobs j join public.reports r on r.uid = j.visit_uid where j.serial = 'G1';
\echo 'expect: Approved | approved by the manager | Stage Manager | just now'
select approval_status, approved_by = '7f000000-0000-0000-0000-000000000002' as by_manager, approved_by_name,
       approved_at > now() - interval '1 minute' as just_now
  from public.indoor_dcs where dc_no = :'dc1';
begin;
  set local role authenticated;
  \echo 'expect ERROR: is Approved, not pending approval'
  select public.reject_indoor_dc(:'dc1', 'too late');
commit;

\echo '--- 12. NOW IT LEAVES ---'
call public.be('stg_ajay@x.com');
begin;
  set local role authenticated;
  update public.indoor_jobs set status = 'Dispatched' where serial = 'G1';
commit;
\echo 'expect: Dispatched'
select status from public.indoor_jobs where serial = 'G1';

\echo '--- 13. A DEMO UNIT HAS NO CALL AND FILES NO VISIT ---'
call public.be('stg_nsm@x.com');
begin;
  set local role authenticated;
  select public.approve_indoor_dc(:'dc2') = :'dc2' as approved;
commit;
\echo 'expect: Approved, and the DEMO job carries no visit'
select d.approval_status, j.visit_uid is null as no_visit
  from public.indoor_dcs d join public.indoor_jobs j on j.dispatch_ref = d.dc_no where d.dc_no = :'dc2';

\echo '--- 14. REJECT: a reason, the DC kept, the unit released ---'
call public.be('stg_mgr@x.com');
begin;
  set local role authenticated;
  \echo 'expect ERROR: say why Indoor DC'
  select public.reject_indoor_dc(:'dc3', '  ');
commit;
call public.be('stg_out@x.com');
begin;
  set local role authenticated;
  \echo 'expect ERROR: only Stage Manager (AUTHORISED BY) or an administrator rejects Indoor DC'
  select public.reject_indoor_dc(:'dc3', 'no');
commit;
call public.be('stg_mgr@x.com');
begin;
  set local role authenticated;
  select public.reject_indoor_dc(:'dc3', 'Wrong consignee address') = :'dc3' as rejected;
commit;
\echo 'expect: Rejected | Wrong consignee address | the unit released: no DC No., no DC date, not dispatched, still Ready'
select d.approval_status, d.rejection_reason, j.dispatch_ref = '' as released, j.dc_date is null as no_dc_date,
       j.dispatched_at is null and j.dispatched_by is null as not_dispatched, j.status
  from public.indoor_dcs d, public.indoor_jobs j where d.dc_no = :'dc3' and j.serial = 'G3';
\echo 'expect: the released unit goes on a new DC'
call public.be('stg_ajay@x.com');
begin;
  set local role authenticated;
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'G3'), 'STG HOSPITAL', p_authorised_by => 'Stage Regional') <> :'dc3' as new_dc;
commit;

\echo '--- 15. THE RELEASE TICKET IS NOBODY ELSE''S ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: permission denied for table indoor_dc_release_tickets'
  insert into public.indoor_dc_release_tickets values (1, txid_current());
commit;

\echo '--- 16. RETURN TO FIELD IS A CALL PENDING REASON ---'
\echo 'expect: 1 | true'
select count(*), bool_and(active) from public.masters where name = 'pendingreason' and value = 'Return to Field';

\echo '--- 17. THE PUBLIC KEY CALLS NONE OF IT ---'
\echo 'expect: f | f | f | f | f'
select has_function_privilege('anon', 'public.approve_indoor_dc(text,boolean)', 'EXECUTE') as approve,
       has_function_privilege('anon', 'public.reject_indoor_dc(text,text)', 'EXECUTE') as reject,
       has_function_privilege('anon', 'public.record_indoor_visit(bigint,text,boolean)', 'EXECUTE') as record,
       has_function_privilege('anon', 'public.indoor_dc_authorisers()', 'EXECUTE') as authorisers,
       has_function_privilege('authenticated', 'public.indoor_dc_release_ticketed(bigint)', 'EXECUTE') as ticket;

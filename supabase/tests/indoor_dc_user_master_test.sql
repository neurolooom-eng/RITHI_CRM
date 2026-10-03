-- ===========================================================================
-- THE INDOOR DC IS APPROVED BY WHOEVER THE USER MASTER NAMES (0327).
--
-- The user, 2026-10-03: "AJAY G (INDOOR) is mapped to VIGNESH and Bagyaraj..
-- it is dynamic based on the user master. So when I say RM / RGM / NSM - it
-- should map as per the user Master"; the NSM is the Regional Manager's own
-- manager; and the person named may see and approve the DC whatever their
-- role holds.
--
-- What this proves, as `authenticated`:
--   1. The authorisers of an issuer are their Reporting Manager, their
--      Regional Manager, and the Regional Manager's own Reporting Manager as
--      NSM -- from the User Master; an NSM login outside that chain is not
--      offered, and the issuer can never name themselves (D-110).
--   2. The person named, whose ROLE holds no Indoor Service right at all,
--      sees the DC, its lines and the unit on it -- and no other DC; a
--      stranger sees none (D-109).
--   3. The unit's engineer cannot mark its visit filed (D-108).
--   4. Approving files the visit and its spares in ONE transaction: a spare
--      the engineer does not hold refuses the approval and files nothing.
--   5. Approving files the visit as the Visit Entry would (Unsolved / Return
--      to Field / Yes / the report / its number / the drafted work), stamps
--      the unit and approves the DC -- for an approver whose role could not
--      file a visit itself.
--   6. A DC that names its own issuer (raised before 0327) is not approved
--      by that issuer.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
 ('7e000000-0000-0000-0000-000000000001', 'um_ajay@x.com'),
 ('7e000000-0000-0000-0000-000000000002', 'um_vignesh@x.com'),
 ('7e000000-0000-0000-0000-000000000003', 'um_bagyaraj@x.com'),
 ('7e000000-0000-0000-0000-000000000004', 'um_kumar@x.com'),
 ('7e000000-0000-0000-0000-000000000005', 'um_othernsm@x.com'),
 ('7e000000-0000-0000-0000-000000000006', 'um_stranger@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, active) values
 ('7e000000-0000-0000-0000-000000000001', 'um_ajay@x.com',      'Um Ajay',      'um_indoor', true),
 ('7e000000-0000-0000-0000-000000000002', 'um_vignesh@x.com',   'Um Vignesh',   'um_plain',  true),
 ('7e000000-0000-0000-0000-000000000003', 'um_bagyaraj@x.com',  'Um Bagyaraj',  'um_plain',  true),
 ('7e000000-0000-0000-0000-000000000004', 'um_kumar@x.com',     'Um Kumar',     'um_plain',  true),
 ('7e000000-0000-0000-0000-000000000005', 'um_othernsm@x.com',  'Um Other Nsm', 'nsm',       true),
 ('7e000000-0000-0000-0000-000000000006', 'um_stranger@x.com',  'Um Stranger',  'um_plain',  true)
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, active = excluded.active;

-- The approvers' role holds NO Indoor Service right and no call-report key:
-- whatever they may do here comes from the User Master naming them.
insert into public.app_roles (role, permissions) values
 ('um_indoor', '["mod:/indoor","indoor.receive","indoor.work","indoor.qc","indoor.dispatch"]'::jsonb),
 ('um_plain',  '["calls.view"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

-- THE USER MASTER: Ajay reports to Vignesh, regionally to Bagyaraj; Bagyaraj
-- reports to Kumar, so Kumar is Ajay's NSM.
delete from public.user_directory where email like 'um\_%@x.com';
insert into public.user_directory (name, email, reporting_manager, regional_manager) values
 ('Um Ajay',     'um_ajay@x.com',     'Um Vignesh', 'Um Bagyaraj'),
 ('Um Vignesh',  'um_vignesh@x.com',  'Um Bagyaraj', ''),
 ('Um Bagyaraj', 'um_bagyaraj@x.com', 'Um Kumar',   ''),
 ('Um Kumar',    'um_kumar@x.com',    '',           '');

insert into public.field_calls (ucn, call_number, party_name) values
 ('UCN-UM-1', 'CN-UM-1', 'UM HOSPITAL'), ('UCN-UM-2', 'CN-UM-2', 'UM HOSPITAL')
on conflict do nothing;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

call public.be('um_ajay@x.com');
insert into public.indoor_jobs (kind, activity, ucn, product_name, serial, party_name, demo_for_party, status, qc_result) values
 ('Customer property', 'Repair', 'UCN-UM-1', 'UM VENT', 'U1', 'UM HOSPITAL', '', 'Received', 'Pass'),
 ('Customer property', 'Repair', 'UCN-UM-2', 'UM VENT', 'U2', 'UM HOSPITAL', '', 'Received', 'Pass');
update public.indoor_jobs set cleaned_by = '7e000000-0000-0000-0000-000000000001', cleaned_at = now(), status = 'Cleaned'
 where serial in ('U1', 'U2');
begin;
  set local role authenticated;
  update public.indoor_jobs
     set indoor_report_no = 'ISR-' || serial, report_file_url = 'https://drive/isr-' || serial,
         visit_date = current_date,
         visit_draft = jsonb_build_object(
           'visitDate', to_char(current_date, 'YYYY-MM-DD'), 'engineer', 'Um Ajay', 'engineerEmail', 'um_ajay@x.com',
           'status', 'Solved - Report Completed',      -- overridden: an Indoor visit is always Unsolved
           'work', jsonb_build_object('Job Done', 'Repaired in the workshop', 'Update Visit Work Details?', 'No'),
           'spares', case when serial = 'U2' then '[{"part": "UM-NOT-HELD", "qty": "1"}]'::jsonb else '[]'::jsonb end)
   where serial in ('U1', 'U2');
commit;
update public.indoor_jobs set status = 'Ready' where serial in ('U1', 'U2');

\echo '--- 1. AJAY''S AUTHORISERS COME FROM THE USER MASTER ---'
\echo 'expect: Um Vignesh (Reporting Manager), Um Bagyaraj (Regional Manager), Um Kumar (NSM) -- not Um Other Nsm, not Um Ajay'
begin;
  set local role authenticated;
  select name, basis from public.indoor_dc_authorisers();
commit;
begin;
  set local role authenticated;
  \echo 'expect ERROR: AUTHORISED BY must be your Reporting Manager, your Regional Manager or an NSM -- Um Ajay is none of them'
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'U1'), 'UM HOSPITAL', p_authorised_by => 'Um Ajay');
commit;
begin;
  set local role authenticated;
  \echo 'expect ERROR: AUTHORISED BY must be your Reporting Manager, your Regional Manager or an NSM -- Um Other Nsm is none of them'
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'U1'), 'UM HOSPITAL', p_authorised_by => 'Um Other Nsm');
commit;
begin;
  set local role authenticated;
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'U1'), 'UM HOSPITAL', p_authorised_by => 'Um Vignesh') as dc1 \gset
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'U2'), 'UM HOSPITAL', p_authorised_by => 'Um Vignesh') as dc2 \gset
commit;
-- A DC naming Bagyaraj, for the visibility check below (the stamp trigger
-- numbers it and names its issuer from the session).
insert into public.indoor_dcs (dc_no, consignee, authorised_by_name) values ('', 'UM HOSPITAL', 'Um Bagyaraj')
returning dc_no as dc_bagy \gset

\echo '--- 2. THE PERSON NAMED SEES WHAT THEY APPROVE, AND NOTHING ELSE ---'
call public.be('um_vignesh@x.com');
begin;
  set local role authenticated;
  \echo 'expect: Vignesh holds no Indoor right (f), yet sees his two DCs, their units by job number, their lines and the two units'
  select public.has_perm('mod:/indoor') as holds_indoor;
  select count(*) as dcs, bool_and(i_may_approve) as all_mine, bool_and(coalesce(job_nos, '') <> '') as units_named
    from public.indoor_dc_list;
  select count(*) > 0 as sees_lines from public.indoor_dc_lines;
  select count(*) as units from public.indoor_jobs;
commit;
call public.be('um_stranger@x.com');
begin;
  set local role authenticated;
  \echo 'expect: a stranger with the same role sees 0 | 0 | 0'
  select (select count(*) from public.indoor_dc_list) as dcs, (select count(*) from public.indoor_dc_lines) as lines,
         (select count(*) from public.indoor_jobs) as units;
commit;

\echo '--- 3. ONLY THE APPROVAL MARKS A VISIT FILED (D-108) ---'
insert into public.reports (uid, ucn, call_status, pending_reason, data) values
 ('VIS-UM-OLD', 'UCN-UM-1', 'Unsolved', 'Return to Field', '{"Update Visit Work Details?": "Yes"}'::jsonb);
call public.be('um_ajay@x.com');
begin;
  set local role authenticated;
  \echo 'expect ERROR: is recorded by the Indoor DC''s approval, not by an edit'
  update public.indoor_jobs set visit_uid = 'VIS-UM-OLD', visit_filed_at = now() where serial = 'U1';
commit;

\echo '--- 4. ONE TRANSACTION: a spare the engineer does not hold refuses the approval, and nothing is filed ---'
call public.be('um_vignesh@x.com');
begin;
  set local role authenticated;
  \echo 'expect ERROR: has 0 of UM-NOT-HELD in hand'
  select public.approve_indoor_dc(:'dc2');
commit;
\echo 'expect: Pending approval | no visit on the unit | no visit against UCN-UM-2'
select d.approval_status, j.visit_filed_at is null as unit_unfiled,
       (select count(*) from public.reports where ucn = 'UCN-UM-2') as visits
  from public.indoor_dcs d join public.indoor_jobs j on btrim(j.dispatch_ref) = d.dc_no where d.dc_no = :'dc2';

\echo '--- 5. THE APPROVAL FILES THE VISIT, for an approver whose role could not ---'
begin;
  set local role authenticated;
  select public.approve_indoor_dc(:'dc1') = :'dc1' as approved;
commit;
\echo 'expect: WEB- visit | filed | Unsolved | Return to Field | Yes (not the draft''s No) | ISR-U1 | the report link | the drafted Job Done | CN-UM-1 | filed by Vignesh | engineer Um Ajay'
select j.visit_uid like 'WEB-%' as web_visit, j.visit_filed_at is not null as filed, r.call_status, r.pending_reason,
       r.data ->> 'Update Visit Work Details?' as update_work, r.data ->> 'Manual Report No.' as report_no, r.manual_report,
       r.data ->> 'Job Done' as job_done, r.call_number, r.data ->> 'Email-ID' as filed_by, r.engineer
  from public.indoor_jobs j join public.reports r on r.uid = j.visit_uid where j.serial = 'U1';
\echo 'expect: Approved | Um Vignesh'
select approval_status, approved_by_name from public.indoor_dcs where dc_no = :'dc1';

\echo '--- 6. A DC NAMING ITS OWN ISSUER IS NOT APPROVED BY THAT ISSUER ---'
-- As 0323 allowed: Ajay issues a DC naming themselves (written directly, the
-- list no longer offering it).
call public.be('um_ajay@x.com');
insert into public.indoor_dcs (dc_no, consignee, authorised_by_name) values ('', 'UM HOSPITAL', 'Um Ajay')
returning dc_no as dc_self \gset
begin;
  set local role authenticated;
  \echo 'expect ERROR: was issued by you'
  select public.approve_indoor_dc(:'dc_self');
commit;
\echo 'expect: still Pending approval'
select approval_status from public.indoor_dcs where dc_no = :'dc_self';
\echo 'expect: Vignesh never saw the DC naming Bagyaraj, and it is still pending'
select approval_status from public.indoor_dcs where dc_no = :'dc_bagy';

\echo '--- 7. THE PUBLIC KEY CALLS NONE OF THE NEW HELPERS ---'
\echo 'expect: f | f | f'
select has_function_privilege('anon', 'public.indoor_dc_names_me(bigint)', 'EXECUTE') as names_me,
       has_function_privilege('anon', 'public.indoor_job_on_my_dc(text)', 'EXECUTE') as on_my_dc,
       has_function_privilege('authenticated', 'public.indoor_job_visit_by_approval()', 'EXECUTE') as trigger_fn;

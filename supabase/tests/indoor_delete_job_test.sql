-- ===========================================================================
-- DELETING AN INDOOR SERVICE JOB (0324), AND THE VISIT'S ENGINEER BEING
-- WHOEVER THE DRAFT NAMES.
--
-- What this proves:
--
--   * delete_indoor_job() is refused without indoor.delete -- to a holder of
--     every other indoor right -- and needs a reason;
--   * an administrator passes it with no grant (has_perm), and so does a role
--     given the key on Roles & Permissions;
--   * it is REFUSED for a job carrying a DC No., for a job a REJECTED DC still
--     names on its lines (its DC No. cleared), and for a job whose visit is
--     filed against its call;
--   * otherwise it deletes the job AND its accessories, harvested parts, checks
--     and Pre-Delivery Testing, leaves the job counter alone, and writes an
--     audit_log row naming the job, product, serial, UCN and the reason, with
--     who stamped from the session;
--   * a direct DELETE on indoor_jobs / indoor_pdt is refused for a signed-in
--     user however many indoor rights they hold, admin included -- the
--     function is the only way;
--   * the public key cannot call it, and the migration grants indoor.delete to
--     nobody;
--   * the visit filed at a DC's approval may name a VISITING ENGINEER other
--     than the filer and other than the Indoor engineer who drafted it (the
--     Repair page's pick, 2026-10-03): nothing pins it to the session, and the
--     job records that visit.
--
-- Superuser bypasses RLS and privileges, so every scoped check runs as
-- `authenticated`. Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('7e000000-0000-0000-0000-000000000001','del_eng@x.com'),
 ('7e000000-0000-0000-0000-000000000002','del_admin@x.com'),
 ('7e000000-0000-0000-0000-000000000003','del_holder@x.com'),
 ('7e000000-0000-0000-0000-000000000004','del_mgr@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role,active) values
 ('7e000000-0000-0000-0000-000000000001','del_eng@x.com','Del Engineer','tally_coordinator',true),
 ('7e000000-0000-0000-0000-000000000002','del_admin@x.com','Del Admin','admin',true),
 ('7e000000-0000-0000-0000-000000000003','del_holder@x.com','Del Holder','commercial',true),
 ('7e000000-0000-0000-0000-000000000004','del_mgr@x.com','Del Manager','rm',true)
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, active = excluded.active;

\echo '--- 0. THE MIGRATION GRANTS indoor.delete TO NOBODY ---'
\echo 'expect: 0'
select count(*) from public.app_roles where permissions ? 'indoor.delete';

-- Fixture grants: the engineer holds EVERY other indoor right; the holder is
-- given indoor.delete (as an administrator would on Roles & Permissions).
insert into public.app_roles (role, permissions) values
 ('tally_coordinator', '["mod:/indoor","indoor.receive","indoor.work","indoor.qc","indoor.dispatch","indoor.condemn","indoor.verify"]'::jsonb),
 ('commercial',        '["mod:/indoor","indoor.delete"]'::jsonb),
 ('rm',                '["mod:/indoor"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

delete from public.user_directory where email in ('del_eng@x.com', 'del_mgr@x.com');
insert into public.user_directory (name, email, reporting_manager, regional_manager) values
 ('Del Engineer', 'del_eng@x.com', 'Del Manager', ''),
 ('Del Manager',  'del_mgr@x.com', '',            '');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

call public.be('del_eng@x.com');
insert into public.indoor_jobs (kind, activity, ucn, product_name, serial, party_name, demo_for_party, status, qc_result) values
 ('Customer property', 'Repair',  'UCN-DEL-1', 'DEL VENT', 'D1', 'DEL HOSPITAL', '', 'Received', 'Pass'),  -- D1 deleted with children
 ('Customer property', 'Repair',  'UCN-DEL-2', 'DEL VENT', 'D2', 'DEL HOSPITAL', '', 'Received', 'Pass'),  -- D2 on a pending DC
 ('Customer property', 'Repair',  'UCN-DEL-3', 'DEL VENT', 'D3', 'DEL HOSPITAL', '', 'Received', 'Pass'),  -- D3 on a rejected DC
 ('Customer property', 'Repair',  'UCN-DEL-4', 'DEL VENT', 'D4', 'DEL HOSPITAL', '', 'Received', 'Pass'),  -- D4 visit filed
 ('DEMO unit',         'Demo',    null,        'DEL DEMO', 'D5', null,           'DEL CLINIC', 'Received', null); -- D5 deleted by the holder
insert into public.indoor_job_accessories (job_id, name, serial, qty)
select id, 'Flow sensor', 'FS1', 2 from public.indoor_jobs where serial = 'D1';
insert into public.indoor_job_checks (job_id, seq, parameter)
select id, 1, 'Tidal volume' from public.indoor_jobs where serial = 'D1';
update public.indoor_jobs set decontaminated = true where serial = 'D1';
insert into public.indoor_job_parts (job_id, part_code, qty)
select id, 'P-DEL', 1 from public.indoor_jobs where serial = 'D1';
insert into public.indoor_pdt (job_id) select id from public.indoor_jobs where serial = 'D1';
update public.indoor_jobs set visit_draft = '{"engineer": "Del Engineer"}'::jsonb where serial = 'D1';

\echo '--- 1. WITHOUT THE KEY: refused, to a holder of every other indoor right ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: indoor.delete is required to delete an Indoor Service job'
  select public.delete_indoor_job((select id from public.indoor_jobs where serial = 'D1'), 'raised in error');
commit;

\echo '--- 2. A DIRECT DELETE IS REFUSED, for the engineer and the administrator alike ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: permission denied for table indoor_jobs'
  delete from public.indoor_jobs where serial = 'D1';
commit;
begin;
  set local role authenticated;
  \echo 'expect ERROR: permission denied for table indoor_pdt'
  delete from public.indoor_pdt;
commit;
call public.be('del_admin@x.com');
begin;
  set local role authenticated;
  \echo 'expect ERROR: permission denied for table indoor_jobs'
  delete from public.indoor_jobs where serial = 'D1';
commit;
\echo 'expect: 5 -- every job still there'
select count(*) from public.indoor_jobs where serial like 'D_';

\echo '--- 3. A REASON IS NEEDED ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: say why the Indoor Service job is being deleted'
  select public.delete_indoor_job((select id from public.indoor_jobs where serial = 'D1'), '   ');
commit;

\echo '--- 4. THREE JOBS ON DCs, ONE WITH ITS VISIT FILED ---'
call public.be('del_eng@x.com');
update public.indoor_jobs set cleaned_by = '7e000000-0000-0000-0000-000000000001', cleaned_at = now(), status = 'Cleaned'
 where serial in ('D2', 'D3', 'D4');
begin;
  set local role authenticated;
  update public.indoor_jobs set indoor_report_no = 'ISR-' || serial, report_file_url = 'https://drive/isr-' || serial
   where serial in ('D2', 'D3', 'D4');
commit;
update public.indoor_jobs set status = 'Ready' where serial in ('D2', 'D3', 'D4');
begin;
  set local role authenticated;
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'D2'), 'DEL HOSPITAL', p_authorised_by => 'Del Manager') as dc2 \gset
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'D3'), 'DEL HOSPITAL', p_authorised_by => 'Del Manager') as dc3 \gset
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'D4'), 'DEL HOSPITAL', p_authorised_by => 'Del Manager') as dc4 \gset
commit;

call public.be('del_mgr@x.com');
begin;
  set local role authenticated;
  select public.reject_indoor_dc(:'dc3', 'Wrong address') = :'dc3' as rejected;
commit;

-- THE VISIT, as the Visit Entry's save path writes it at approval -- the
-- VISITING ENGINEER being a third person: neither the approver filing it nor
-- the Indoor engineer who drafted it.
insert into public.reports (uid, ucn, call_status, pending_reason, engineer, engineer_email, data) values
 ('VIS-DEL-4', 'UCN-DEL-4', 'Unsolved', 'Return to Field', 'Del Field Engineer', 'del_field@x.com',
  '{"Update Visit Work Details?": "Yes"}'::jsonb);

\echo '--- 5. THE VISIT MAY NAME AN ENGINEER WHO IS NOT THE SESSION ---'
-- Recorded as a repair in the SQL editor would (no signed-in caller may run
-- record_indoor_visit() since 0387, D-108); the approval is the approver's.
begin;
  select public.record_indoor_visit((select id from public.indoor_jobs where serial = 'D4'), 'VIS-DEL-4', true);
  set local role authenticated;
  select public.approve_indoor_dc(:'dc4') = :'dc4' as approved;
commit;
\echo 'expect: VIS-DEL-4 | filed | Del Field Engineer | del_field@x.com | Approved'
select j.visit_uid, j.visit_filed_at is not null as filed, r.engineer, r.engineer_email, d.approval_status
  from public.indoor_jobs j join public.reports r on r.uid = j.visit_uid
  join public.indoor_dcs d on d.dc_no = j.dispatch_ref
 where j.serial = 'D4';

\echo '--- 6. THE ADMINISTRATOR IS REFUSED ON EACH OF THEM, in its own words ---'
call public.be('del_admin@x.com');
begin;
  set local role authenticated;
  \echo 'expect ERROR: carries DC No. -- a job that went on a delivery challan is a record of the unit leaving'
  select public.delete_indoor_job((select id from public.indoor_jobs where serial = 'D2'), 'raised in error');
commit;
\echo 'expect: the rejected DC released D3 -- no DC No. on the job'
select dispatch_ref = '' as released from public.indoor_jobs where serial = 'D3';
begin;
  set local role authenticated;
  \echo 'expect ERROR: (Rejected) -- the challan keeps its lines, so the job is not deleted'
  select public.delete_indoor_job((select id from public.indoor_jobs where serial = 'D3'), 'raised in error');
commit;
-- D4 carries its DC No. too; clear it as the superuser to prove the VISIT rule
-- refuses on its own (the DC line is removed with it, as a superuser may).
alter table public.indoor_dc_lines disable trigger no_hard_delete;
delete from public.indoor_dc_lines where job_id = (select id from public.indoor_jobs where serial = 'D4');
alter table public.indoor_dc_lines enable trigger no_hard_delete;
alter table public.indoor_jobs disable trigger zz_indoor_jobs_guard;
update public.indoor_jobs set dispatch_ref = '' where serial = 'D4';
alter table public.indoor_jobs enable trigger zz_indoor_jobs_guard;
begin;
  set local role authenticated;
  \echo 'expect ERROR: has visit VIS-DEL-4 filed against call UCN-DEL-4'
  select public.delete_indoor_job((select id from public.indoor_jobs where serial = 'D4'), 'raised in error');
commit;
\echo 'expect: 5 -- nothing was deleted'
select count(*) from public.indoor_jobs where serial like 'D_';

\echo '--- 7. THE ADMINISTRATOR DELETES D1 AND EVERYTHING UNDER IT ---'
select id as d1 from public.indoor_jobs where serial = 'D1' \gset
select job_no as d1_no from public.indoor_jobs where serial = 'D1' \gset
select coalesce(sum(last_no), 0) as counters_before from public.indoor_job_counters \gset
begin;
  set local role authenticated;
  select public.delete_indoor_job(:d1, '  Duplicate intake  ') = :'d1_no' as deleted;
commit;
\echo 'expect: 0 | 0 | 0 | 0 | 0 -- the job, its accessory, check, part and PDT gone'
select (select count(*) from public.indoor_jobs where id = :d1),
       (select count(*) from public.indoor_job_accessories where job_id = :d1),
       (select count(*) from public.indoor_job_checks where job_id = :d1),
       (select count(*) from public.indoor_job_parts where job_id = :d1),
       (select count(*) from public.indoor_pdt where job_id = :d1);
\echo 'expect: t -- the job counter is untouched, so the number is not issued again'
select coalesce(sum(last_no), 0) = :counters_before from public.indoor_job_counters;
\echo 'expect: indoor.job_delete | the job no. | by the admin | DEL VENT | D1 | UCN-DEL-1 | Duplicate intake | 1 accessory, 1 part, 1 check, 1 pdt | had a draft'
select action, target = :'d1_no' as target_is_job, user_id = '7e000000-0000-0000-0000-000000000002' as by_admin,
       actor, meta ->> 'product' as product, meta ->> 'serial' as serial, meta ->> 'ucn' as ucn, meta ->> 'reason' as reason,
       meta -> 'deleted' as deleted, meta ->> 'had_visit_draft' as had_draft
  from public.audit_log where action = 'indoor.job_delete' and target = :'d1_no';

\echo '--- 8. A ROLE GIVEN THE KEY DELETES TOO ---'
call public.be('del_holder@x.com');
begin;
  set local role authenticated;
  select public.delete_indoor_job((select id from public.indoor_jobs where serial = 'D5'), 'Test entry') is not null as deleted;
commit;
\echo 'expect: 0'
select count(*) from public.indoor_jobs where serial = 'D5';
begin;
  set local role authenticated;
  \echo 'expect ERROR: was not found'
  select public.delete_indoor_job(-1, 'nothing there');
commit;

\echo '--- 9. THE PUBLIC KEY CANNOT CALL IT; A SIGNED-IN USER CAN (it asks the key itself) ---'
\echo 'expect: f | t | f | f'
select has_function_privilege('anon', 'public.delete_indoor_job(bigint,text)', 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', 'public.delete_indoor_job(bigint,text)', 'EXECUTE') as auth_exec,
       has_table_privilege('authenticated', 'public.indoor_jobs', 'DELETE') as auth_delete_jobs,
       has_table_privilege('authenticated', 'public.indoor_pdt', 'DELETE') as auth_delete_pdt;

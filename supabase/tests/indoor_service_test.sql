-- ===========================================================================
-- INDOOR SERVICE — the workshop register (0158, procedure §4.5).
--
-- What this proves, in the order it matters:
--
--   * a DEMO unit with NO CALL can be registered. This is the reason the
--     register stands on its own rather than being a stage a call is in; if it
--     fails, DEMO units need a fake call raised for them.
--   * the job number is the DATABASE's, restarts per year, and a client-supplied
--     one is discarded.
--   * indoor.qc / indoor.dispatch / indoor.condemn are REAL. Each is refused to
--     somebody who holds the page and the other rights -- because a right the
--     database does not test is a hidden button.
--   * a machine cannot leave with a FAILED check, and a repair cannot leave with
--     NO check (4.5.6).
--   * nothing is harvested from a unit that has not been decontaminated. The one
--     hard gate in the file.
--   * "Other" cannot be filed with no description.
--   * the stamps cannot be forged, and an edit cannot rewrite who took it in.
--
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('7d000000-0000-0000-0000-000000000001','ind_full@x.com'),
 ('7d000000-0000-0000-0000-000000000002','ind_work@x.com'),
 ('7d000000-0000-0000-0000-000000000003','ind_none@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('7d000000-0000-0000-0000-000000000001','ind_full@x.com','Ind Full','spare_coordinator'),
 ('7d000000-0000-0000-0000-000000000002','ind_work@x.com','Ind Worker','stores_incharge'),
 ('7d000000-0000-0000-0000-000000000003','ind_none@x.com','Ind Outsider','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

-- spare_coordinator: everything EXCEPT condemn (which 0158 grants to admin only).
insert into public.app_roles (role, permissions) values
 ('spare_coordinator', '["mod:/indoor","indoor.receive","indoor.work","indoor.qc","indoor.dispatch"]'::jsonb)
on conflict (role) do update set permissions = (
  select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (
    select jsonb_array_elements_text(app_roles.permissions) as v
    union select unnest(array['mod:/indoor','indoor.receive','indoor.work','indoor.qc','indoor.dispatch'])) u);
-- stores_incharge: the page and the WORK, but no QC, no dispatch, no condemn.
update public.app_roles set permissions =
  (permissions - 'indoor.qc' - 'indoor.dispatch' - 'indoor.condemn')
  where role = 'stores_incharge';
insert into public.app_roles (role, permissions) values
 ('stores_incharge', '["mod:/indoor","indoor.receive","indoor.work"]'::jsonb)
on conflict (role) do update set permissions = (
  select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (
    select jsonb_array_elements_text(app_roles.permissions) as v
    union select unnest(array['mod:/indoor','indoor.receive','indoor.work'])) u)
    - 'indoor.qc' - 'indoor.dispatch' - 'indoor.condemn';
-- The outsider holds NOTHING of this module.
update public.app_roles set permissions =
  permissions - 'mod:/indoor' - 'indoor.receive' - 'indoor.work'
              - 'indoor.qc' - 'indoor.dispatch' - 'indoor.condemn'
  where role = 'engineer';

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

delete from public.indoor_jobs where serial like 'IND-TEST-%';

\echo '--- 1. A DEMO UNIT NEEDS NO CALL ---'
\echo 'expect: one row, ucn null. This is why the register stands on its own:'
\echo 'expect: 4.5.5 puts DEMO units in here and a DEMO unit has no customer,'
\echo 'expect: no complaint and no call to hang off.'
call public.be('ind_full@x.com');
begin;
  set local role authenticated;
  insert into public.indoor_jobs (kind, activity, product_name, serial, expected_return)
       values ('DEMO unit', 'Demo', 'Extend XT', 'IND-TEST-DEMO',
               (now() at time zone 'Asia/Kolkata')::date - 3);
  select kind, activity, ucn is null as no_call, status
    from public.indoor_jobs where serial = 'IND-TEST-DEMO';
commit;

\echo '--- 2. THE JOB NUMBER IS THE DATABASE''S ---'
\echo 'expect: t -- the shape is IND<YY>-<NNNN>, and the number supplied by the'
\echo 'expect: client below is DISCARDED. A number two people can mint repeats.'
begin;
  set local role authenticated;
  insert into public.indoor_jobs (job_no, kind, activity, product_name, serial)
       values ('IND99-9999', 'Customer property', 'Repair', 'Extend XT', 'IND-TEST-REPAIR');
commit;
select job_no ~ ('^IND' || to_char(now() at time zone 'Asia/Kolkata','YY') || '-[0-9]{4}$') as own_series,
       job_no <> 'IND99-9999' as client_number_discarded
  from public.indoor_jobs where serial = 'IND-TEST-REPAIR';

\echo '--- 3. ...and it is stamped with WHO took it in ---'
\echo 'expect: Ind Full -- received_by defaults to the person at the keyboard,'
\echo 'expect: not to whatever the client sent.'
select received_by_name from public.indoor_job_list where serial = 'IND-TEST-REPAIR';

\echo '--- 4. THE OUTSIDER SEES NOTHING ---'
\echo 'expect: 0 -- a workshop register is not public to everyone who can sign in.'
call public.be('ind_none@x.com');
begin;
  set local role authenticated;
  select count(*) as rows_the_outsider_can_see from public.indoor_jobs;
commit;

\echo 'expect ERROR: and cannot file a job either (row-level security)'
begin;
  set local role authenticated;
  insert into public.indoor_jobs (product_name, serial) values ('X', 'IND-TEST-SNEAK');
commit;

\echo '--- 5. indoor.qc IS A REAL RIGHT, not a hidden button ---'
\echo 'expect ERROR: indoor.qc is required -- the worker holds the page, the'
\echo 'expect ERROR: intake and the work, and still cannot sign the check. That'
\echo 'expect ERROR: separation is the whole point of 4.5.6.'
call public.be('ind_work@x.com');
begin;
  set local role authenticated;
  update public.indoor_jobs set qc_result = 'Pass' where serial = 'IND-TEST-REPAIR';
commit;

\echo 'expect: Pass -- and the same update from somebody who holds indoor.qc works'
call public.be('ind_full@x.com');
begin;
  set local role authenticated;
  update public.indoor_jobs set work_done = 'replaced the sensor', qc_result = 'Pass'
   where serial = 'IND-TEST-REPAIR';
commit;
select qc_result, qc_at is not null as stamped, qc_by_name
  from public.indoor_job_list where serial = 'IND-TEST-REPAIR';

\echo '--- 6. indoor.dispatch IS A REAL RIGHT TOO ---'
\echo 'expect ERROR: indoor.dispatch is required to dispatch a unit'
call public.be('ind_work@x.com');
begin;
  set local role authenticated;
  update public.indoor_jobs set dispatch_ref = 'DC/1' where serial = 'IND-TEST-REPAIR';
commit;

\echo '--- 7. A FAILED CHECK DOES NOT LEAVE THE WORKSHOP ---'
\echo 'expect ERROR: the quality check failed -- it returns to Under repair.'
\echo 'expect ERROR: 4.5.6 puts the check BEFORE the return, so a failed one'
\echo 'expect ERROR: cannot be noted and stepped over.'
call public.be('ind_full@x.com');
begin;
  set local role authenticated;
  update public.indoor_jobs set qc_result = 'Fail', status = 'Dispatched'
   where serial = 'IND-TEST-REPAIR';
commit;

\echo '--- 8. AND NEITHER DOES A REPAIR WITH NO CHECK AT ALL ---'
\echo 'expect ERROR: cannot be dispatched before its quality check is recorded'
begin;
  set local role authenticated;
  insert into public.indoor_jobs (activity, product_name, serial, status)
       values ('Repair', 'Extend XT', 'IND-TEST-NOQC', 'Dispatched');
commit;

\echo 'expect: 1 -- but a DEMO going out needs no repair check, so it may.'
begin;
  set local role authenticated;
  update public.indoor_jobs set status = 'Dispatched' where serial = 'IND-TEST-DEMO';
commit;
select count(*) as demo_dispatched from public.indoor_jobs
 where serial = 'IND-TEST-DEMO' and status = 'Dispatched';

\echo '--- 9. NOTHING IS HARVESTED FROM A UNIT THAT WAS NOT DECONTAMINATED ---'
\echo 'expect ERROR: the unit has not been decontaminated. The ONE hard gate in'
\echo 'expect ERROR: this file: everything else here is a record, this is a'
\echo 'expect ERROR: person putting their hands inside a device from a hospital.'
-- The job is filed in its OWN transaction: put it in the same one as the
-- refused harvest and the rollback takes the job with it, leaving every later
-- step silently updating nothing.
begin;
  set local role authenticated;
  insert into public.indoor_jobs (activity, product_name, serial)
       values ('Salvage', 'Extend XT', 'IND-TEST-SALVAGE');
commit;
begin;
  set local role authenticated;
  insert into public.indoor_job_parts (job_id, part_code, qty, condition_grade)
       select id, 'P-1', 1, 'Serviceable' from public.indoor_jobs where serial = 'IND-TEST-SALVAGE';
commit;

\echo 'expect: 1 -- and once it IS decontaminated, the harvest records.'
begin;
  set local role authenticated;
  update public.indoor_jobs set decontaminated = true where serial = 'IND-TEST-SALVAGE';
  insert into public.indoor_job_parts (job_id, part_code, qty, condition_grade)
       select id, 'P-1', 1, 'Serviceable' from public.indoor_jobs where serial = 'IND-TEST-SALVAGE';
commit;
select count(*) as parts_harvested from public.indoor_job_parts p
  join public.indoor_jobs j on j.id = p.job_id where j.serial = 'IND-TEST-SALVAGE';

\echo '--- 10. CONDEMNING IS ITS OWN RIGHT ---'
\echo 'expect ERROR: indoor.condemn is required. The coordinator holds every'
\echo 'expect ERROR: other right in this module and still cannot scrap a machine:'
\echo 'expect ERROR: 0158 grants condemn to admin alone, deliberately.'
begin;
  set local role authenticated;
  update public.indoor_jobs set status = 'Condemned', condemned_reason = 'beyond economic repair'
   where serial = 'IND-TEST-SALVAGE';
commit;

\echo '--- 11. "OTHER" WITH NO DESCRIPTION IS A HOLE IN THE RECORD ---'
\echo 'expect ERROR: indoor_jobs_other_needs_note'
begin;
  set local role authenticated;
  insert into public.indoor_jobs (activity, product_name, serial)
       values ('Other', 'Extend XT', 'IND-TEST-OTHER');
commit;

\echo 'expect: 1 -- with a note, it files.'
begin;
  set local role authenticated;
  insert into public.indoor_jobs (activity, product_name, serial, activity_note)
       values ('Other', 'Extend XT', 'IND-TEST-OTHER', 'firmware reflash for the road show');
commit;
select count(*) as other_filed from public.indoor_jobs where serial = 'IND-TEST-OTHER';

\echo '--- 12. AN EDIT CANNOT REWRITE WHO TOOK IT IN, OR THE JOB NUMBER ---'
\echo 'expect: t | t -- both survive an attempt to overwrite them.'
select job_no as before_edit from public.indoor_jobs where serial = 'IND-TEST-REPAIR' \gset
begin;
  set local role authenticated;
  update public.indoor_jobs
     set job_no = 'IND00-0001', created_by = '7d000000-0000-0000-0000-000000000003'
   where serial = 'IND-TEST-REPAIR';
commit;
select job_no = :'before_edit' as job_no_held,
       created_by = '7d000000-0000-0000-0000-000000000001' as author_held
  from public.indoor_jobs where serial = 'IND-TEST-REPAIR';

\echo '--- 13. THE OVERDUE DEMO IS THE NUMBER THIS REGISTER EXISTS TO PRODUCE ---'
\echo 'expect: t -- out, past its expected return, not back. Nothing else in'
\echo 'expect: this system tracks a company asset sitting at a customer site.'
select demo_overdue from public.indoor_job_list where serial = 'IND-TEST-DEMO';

\echo '--- 14. QUALITY RECORDS ARE NOT DELETED (0049''s rule, here too) ---'
\echo 'expect: DELETE 0, then 1 -- and note it is not an ERROR. A table with no'
\echo 'expect: delete policy removes NOTHING and says so quietly, which is why'
\echo 'expect: the row count below is the assertion and the DELETE line is not.'
\echo 'expect: A job raised in error is CLOSED with the reason, so the register'
\echo 'expect: still says what happened to somebody''s machine.'
begin;
  set local role authenticated;
  delete from public.indoor_jobs where serial = 'IND-TEST-OTHER';
commit;
select count(*) as still_there from public.indoor_jobs where serial = 'IND-TEST-OTHER';

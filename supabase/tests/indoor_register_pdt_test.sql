-- ===========================================================================
-- THE R/SER/07 REGISTER AND R/SER/QC/007 PRE-DELIVERY TESTING (0319, 0320).
--
-- What this proves:
--
--   * Verified By is its own key (indoor.verify), refused before the unit is
--     Dispatched / Closed / Condemned, and STAMPED from the session -- a
--     verifier the browser names is discarded.
--   * A DEMO unit of an IMPORTED product (Product Master `imported` = true,
--     0319) is refused Dispatched with no PDT, with an incomplete PDT, with a
--     NOT OK, and allowed with a complete all-OK signed PDT.
--   * A DEMO unit of an IN-HOUSE product, and one whose imported-ness is
--     UNKNOWN (product matches no line, or the line's `imported` is blank),
--     does NOT owe the test -- the user's decision -- and the list says
--     unknown (NULL) rather than no.
--   * The machine's own product CODE (Product Database) decides before the
--     product NAME, and a name whose codes disagree is unknown.
--   * A customer-property job is unaffected: the existing quality check rule.
--   * The PDT inspector, name and designation are stamped from the session.
--
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('7e000000-0000-0000-0000-000000000001','pdt_work@x.com'),
 ('7e000000-0000-0000-0000-000000000002','pdt_sup@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role,designation) values
 ('7e000000-0000-0000-0000-000000000001','pdt_work@x.com','Pdt Worker','spare_coordinator','Service Engineer'),
 ('7e000000-0000-0000-0000-000000000002','pdt_sup@x.com','Pdt Supervisor','nsm','Service Manager')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name,
                               designation = excluded.designation;

-- The worker: the page and every working right, but NOT indoor.verify.
insert into public.app_roles (role, permissions) values
 ('spare_coordinator', '["mod:/indoor","indoor.receive","indoor.work","indoor.qc","indoor.dispatch"]'::jsonb)
on conflict (role) do update set permissions =
  '["mod:/indoor","indoor.receive","indoor.work","indoor.qc","indoor.dispatch"]'::jsonb;
-- The supervisor: the same plus indoor.verify (granted HERE, by the fixture --
-- 0320 grants it to nobody).
insert into public.app_roles (role, permissions) values
 ('nsm', '["mod:/indoor","indoor.receive","indoor.work","indoor.qc","indoor.dispatch","indoor.verify"]'::jsonb)
on conflict (role) do update set permissions =
  '["mod:/indoor","indoor.receive","indoor.work","indoor.qc","indoor.dispatch","indoor.verify"]'::jsonb;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- THE CATALOGUE. One imported line, one in-house, one left blank, and a name
-- (PDT MULTI) whose two codes DISAGREE.
insert into public.product_master (product_code, product_name, imported) values
 ('PDT-IMP', 'PDT IMPORTED', true),
 ('PDT-INH', 'PDT INHOUSE',  false),
 ('PDT-UNK', 'PDT BLANK',    null),
 ('PDT-M1',  'PDT MULTI',    true),
 ('PDT-M2',  'PDT MULTI',    false)
on conflict (product_code) do update set product_name = excluded.product_name,
                                         imported = excluded.imported;
-- One machine of PDT MULTI whose own code is the imported one.
insert into public.products (item_name, serial_number, item_code)
values ('PDT MULTI', 'PDT-SN-CODE', 'PDT-M1');

\echo '--- 0. THE MAPPING ---'
\echo 'expect: t | f | (null) | (null) | (null) | t'
\echo 'expect: imported, in-house, blank line = unknown, no line = unknown,'
\echo 'expect: a name whose codes disagree = unknown, and the SAME name read'
\echo 'expect: through the machine''s own code = imported.'
select public.indoor_job_is_imported('PDT IMPORTED', 'X')  as imported,
       public.indoor_job_is_imported('pdt inhouse ', 'X')  as in_house,
       public.indoor_job_is_imported('PDT BLANK', 'X')     as blank_line,
       public.indoor_job_is_imported('NO SUCH LINE', 'X')  as no_line,
       public.indoor_job_is_imported('PDT MULTI', 'OTHER') as codes_disagree,
       public.indoor_job_is_imported('PDT MULTI', 'PDT-SN-CODE') as by_machine_code;

\echo '--- 1. FILE THE JOBS (as the worker) ---'
call public.be('pdt_work@x.com');
begin;
  set local role authenticated;
  insert into public.indoor_jobs (kind, activity, product_name, serial, engineer_name, verified_by, verified_at)
  values ('DEMO unit', 'Demo', 'PDT IMPORTED', 'PDT-TEST-IMP', 'Indoor Service',
          '7e000000-0000-0000-0000-000000000002', now() - interval '3 days'),
         ('DEMO unit', 'Demo', 'PDT INHOUSE',  'PDT-TEST-INH', 'Indoor Service', null, null),
         ('DEMO unit', 'Demo', 'PDT BLANK',    'PDT-TEST-UNK', 'Indoor Service', null, null),
         ('Customer property', 'Repair', 'PDT IMPORTED', 'PDT-TEST-CUST', 'A Field Engineer', null, null);
commit;
\echo 'expect: 4 rows; the verifier the insert NAMED is discarded (f / f);'
\echo 'expect: product_imported t, f, (null), t.'
select serial, verified_by is not null as verified, verified_at is not null as verified_at_kept,
       product_imported
  from public.indoor_job_list where serial like 'PDT-TEST-%' order by id;

\echo '--- 2. VERIFICATION BEFORE DISPATCH IS REFUSED ---'
\echo 'expect ERROR: a register entry is verified once the unit is Dispatched, Closed or Condemned'
call public.be('pdt_sup@x.com');
begin;
  set local role authenticated;
  update public.indoor_jobs set verified_by = '7e000000-0000-0000-0000-000000000002'
   where serial = 'PDT-TEST-INH';
commit;

\echo '--- 3. A DEMO UNIT OF AN IMPORTED PRODUCT, WITH NO PDT ---'
\echo 'expect ERROR: does not leave before its Pre-Delivery Testing (R/SER/QC/007) is recorded'
call public.be('pdt_work@x.com');
begin;
  set local role authenticated;
  update public.indoor_jobs set status = 'Dispatched' where serial = 'PDT-TEST-IMP';
commit;

\echo '--- 4. ...WITH AN INCOMPLETE PDT ---'
begin;
  set local role authenticated;
  insert into public.indoor_pdt (job_id, test_date, measuring_equipment_id, software_version,
                                 check1, check2, check3, check4, check5)
  select id, current_date, 'PD/FLA/06', 'V3.6.2', 'OK', 'OK', 'OK', 'OK', 'OK'
    from public.indoor_jobs where serial = 'PDT-TEST-IMP';
commit;
\echo 'expect ERROR: Pre-Delivery Testing (R/SER/QC/007) is incomplete -- still blank: HV, HT, the CMV/ACMV readings, the PCMV readings, Inspected by (not signed)'
begin;
  set local role authenticated;
  update public.indoor_jobs set status = 'Dispatched' where serial = 'PDT-TEST-IMP';
commit;

\echo '--- 5. THE INSPECTOR IS THE SESSION ---'
\echo 'expect: Pdt Worker | Service Engineer | t -- the browser named the SUPERVISOR,'
\echo 'expect: the database wrote who was signed in, with their designation then.'
begin;
  set local role authenticated;
  update public.indoor_pdt p
     set hv = '22', ht = '24',
         cmv_vte_21 = 500, cmv_vte_60 = 498, cmv_vte_100 = 502,
         cmv_peep_21 = 5, cmv_peep_60 = 5, cmv_peep_100 = 5,
         cmv_o2_21 = 21, cmv_o2_60 = 60, cmv_o2_100 = 99,
         pcmv_pip_21 = 20, pcmv_pip_60 = 20, pcmv_pip_100 = 20,
         pcmv_peep_21 = 5, pcmv_peep_60 = 5, pcmv_peep_100 = 5,
         pcmv_o2_21 = 21, pcmv_o2_60 = 60, pcmv_o2_100 = 99,
         check3 = 'NOT OK',
         inspected_by = '7e000000-0000-0000-0000-000000000002',
         inspector_name = 'Somebody Else', inspector_designation = 'CEO',
         inspected_at = now() - interval '9 days'
    from public.indoor_jobs j where j.id = p.job_id and j.serial = 'PDT-TEST-IMP';
commit;
select p.inspector_name, p.inspector_designation,
       p.inspected_by = '7e000000-0000-0000-0000-000000000001'
         and p.inspected_at > now() - interval '1 minute' as stamped_now
  from public.indoor_pdt p join public.indoor_jobs j on j.id = p.job_id
 where j.serial = 'PDT-TEST-IMP';

\echo 'expect: Pdt Worker -- and a later edit cannot rewrite the signature'
begin;
  set local role authenticated;
  update public.indoor_pdt p set inspector_name = 'Forged'
    from public.indoor_jobs j where j.id = p.job_id and j.serial = 'PDT-TEST-IMP';
commit;
select p.inspector_name from public.indoor_pdt p join public.indoor_jobs j on j.id = p.job_id
 where j.serial = 'PDT-TEST-IMP';

\echo '--- 6. ...WITH A NOT OK ---'
\echo 'expect ERROR: Pre-Delivery Testing check 3 reads NOT OK -- a machine cannot leave with a failed check'
begin;
  set local role authenticated;
  update public.indoor_jobs set status = 'Dispatched' where serial = 'PDT-TEST-IMP';
commit;

\echo '--- 7. ...AND WITH A COMPLETE, ALL-OK, SIGNED PDT IT LEAVES ---'
begin;
  set local role authenticated;
  update public.indoor_pdt p set check3 = 'OK'
    from public.indoor_jobs j where j.id = p.job_id and j.serial = 'PDT-TEST-IMP';
  update public.indoor_jobs set status = 'Dispatched', dispatch_ref = 'DC/PDT/1', dc_date = current_date
   where serial = 'PDT-TEST-IMP';
commit;
\echo 'expect: Dispatched'
select status from public.indoor_jobs where serial = 'PDT-TEST-IMP';

\echo '--- 8. IN-HOUSE AND UNKNOWN OWE NO TEST ---'
\echo 'expect: Dispatched | Dispatched -- no PDT row exists for either. Unknown'
\echo 'expect: is NOT a refusal (the user''s decision); the screen says unknown.'
begin;
  set local role authenticated;
  update public.indoor_jobs set status = 'Dispatched' where serial in ('PDT-TEST-INH', 'PDT-TEST-UNK');
commit;
select serial, status from public.indoor_jobs where serial in ('PDT-TEST-INH', 'PDT-TEST-UNK') order by serial;

\echo '--- 9. A CUSTOMER JOB IS UNAFFECTED -- the quality check rule, as before ---'
\echo 'expect ERROR: a repair cannot be dispatched before its quality check is recorded (4.5.6)'
begin;
  set local role authenticated;
  update public.indoor_jobs set status = 'Dispatched' where serial = 'PDT-TEST-CUST';
commit;
\echo 'expect: Dispatched -- with a passed check it leaves; no PDT is asked of it'
begin;
  set local role authenticated;
  update public.indoor_jobs set qc_result = 'Pass', status = 'Dispatched' where serial = 'PDT-TEST-CUST';
commit;
select status from public.indoor_jobs where serial = 'PDT-TEST-CUST';

\echo '--- 10. VERIFIED BY IS ITS OWN KEY ---'
\echo 'expect ERROR: indoor.verify is required to verify an Indoor Service register entry'
\echo 'expect ERROR: -- the worker holds every other right, and the unit is Dispatched.'
call public.be('pdt_work@x.com');
begin;
  set local role authenticated;
  update public.indoor_jobs set verified_by = '7e000000-0000-0000-0000-000000000001'
   where serial = 'PDT-TEST-IMP';
commit;

\echo '--- 11. ...AND THE VERIFIER IS THE SESSION ---'
\echo 'expect: Pdt Supervisor | t -- the browser named the WORKER and a date nine'
\echo 'expect: days ago; the database wrote the supervisor, now.'
call public.be('pdt_sup@x.com');
begin;
  set local role authenticated;
  update public.indoor_jobs
     set verified_by = '7e000000-0000-0000-0000-000000000001',
         verified_at = now() - interval '9 days',
         remarks = 'checked against the DC'
   where serial = 'PDT-TEST-IMP';
commit;
select verified_by_name, verified_at > now() - interval '1 minute' as stamped_now
  from public.indoor_job_list where serial = 'PDT-TEST-IMP';

\echo '--- 12. A LATER EDIT OF A DISPATCHED DEMO UNIT IS NOT RE-JUDGED ---'
\echo 'expect: 1 -- the rule is asked on the MOVE into Dispatched, so a remark on'
\echo 'expect: a unit already out (before the rule existed) still saves.'
begin;
  set local role authenticated;
  update public.indoor_jobs set remarks = 'returned box' where serial = 'PDT-TEST-UNK';
commit;
select count(*) from public.indoor_jobs where serial = 'PDT-TEST-UNK' and remarks = 'returned box';

\echo '--- 13. THE COVER IS ONE VOCABULARY ---'
\echo 'expect: WGP -- "Warranty" typed on the register is stored as WGP (0208).'
begin;
  set local role authenticated;
  update public.indoor_jobs set cover = 'Warranty' where serial = 'PDT-TEST-CUST';
commit;
select cover from public.indoor_jobs where serial = 'PDT-TEST-CUST';

\echo '--- 14. A PDT IS NOT DELETED ---'
\echo 'expect: DELETE 0, then 1 -- no DELETE policy: row-level security matches nothing,'
\echo 'expect: so a quality record stays.'
begin;
  set local role authenticated;
  delete from public.indoor_pdt p using public.indoor_jobs j
   where j.id = p.job_id and j.serial = 'PDT-TEST-IMP';
commit;
\echo 'expect: 1'
select count(*) from public.indoor_pdt p join public.indoor_jobs j on j.id = p.job_id
 where j.serial = 'PDT-TEST-IMP';

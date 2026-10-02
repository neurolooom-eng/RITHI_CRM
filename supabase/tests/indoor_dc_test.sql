-- ===========================================================================
-- INDOOR_DC (0321) -- the Indoor Service module's own delivery challan.
--
-- What this proves:
--
--   * The number is the DATABASE'S: IDC-YYMM-NNNN, monthly by the DC date; a
--     number sent with a direct insert (even by a trusted role) is replaced.
--   * One DC carries several jobs going to the SAME consignee (party compared
--     case- and space-insensitively); jobs for different consignees are
--     refused together.
--   * Every job on the DC is stamped dispatch_ref = the IDC number and
--     dc_date = the DC date, its status is NOT changed, and the guard stamps
--     dispatched_at as it does for a typed reference.
--   * 0323: the DC date is the date of entry (no parameter); every unit carries
--     its uploaded Indoor Service Report (the fixtures upload one -- the
--     refusal without it is proved in indoor_stages_test); AUTHORISED BY is
--     required and stored; the DC is created PENDING APPROVAL.
--   * The lines: the equipment (PART No. from the machine's code, else the
--     name's one Product Master code, else blank) then each accessory; QTY 1;
--     PURPOSE from the DC, overridable per line; Issued By from the session.
--   * The DC IS NOT A WAY ROUND A DISPATCH RULE: a repair with no quality
--     check and a DEMO unit of an imported product without Pre-Delivery
--     Testing are refused in the guard's own words, and left untouched. A unit
--     that is not Ready, or already on a DC, is refused.
--   * Permission: indoor.dispatch to issue (refused to a reader of the page);
--     reading needs the page's key; nobody signed in can insert, update or
--     delete a DC or a line directly.
--
-- Superuser bypasses RLS and privileges, so every scoped check runs as
-- `authenticated`. Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('7d000000-0000-0000-0000-000000000001','idc_disp@x.com'),
 ('7d000000-0000-0000-0000-000000000002','idc_read@x.com'),
 ('7d000000-0000-0000-0000-000000000003','idc_out@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('7d000000-0000-0000-0000-000000000001','idc_disp@x.com','Idc Dispatcher','stores_incharge'),
 ('7d000000-0000-0000-0000-000000000002','idc_read@x.com','Idc Reader','rgm'),
 ('7d000000-0000-0000-0000-000000000003','idc_out@x.com','Idc Outsider','commercial')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

insert into public.app_roles (role, permissions) values
 ('stores_incharge', '["mod:/indoor","indoor.receive","indoor.work","indoor.qc","indoor.dispatch"]'::jsonb),
 ('rgm',             '["mod:/indoor","indoor.work"]'::jsonb),
 ('commercial',      '["calls.view"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- THE CATALOGUE AND ONE MACHINE. IDC VENT has one code on the Product Master;
-- the machine IDC VENT2 / S2 carries its own code; IDC IMPORTED is imported.
insert into public.product_master (product_code, product_name, imported) values
 ('IDC-CODE-1', 'IDC VENT',     false),
 ('IDC-IMP',    'IDC IMPORTED', true)
on conflict (product_code) do update set product_name = excluded.product_name, imported = excluded.imported;
insert into public.products (item_name, serial_number, item_code) values ('IDC VENT2', 'S2', 'IDC-MC-9');

-- THE ISSUER'S USER MASTER ROW: their Reporting Manager is the AUTHORISED BY
-- the DCs below name (0323).
delete from public.user_directory where email = 'idc_disp@x.com';
insert into public.user_directory (name, email, reporting_manager, regional_manager)
values ('Idc Dispatcher', 'idc_disp@x.com', 'Idc Manager', '');

-- The DC month, as the database will number it (the DC date is today, India).
select to_char((now() at time zone 'Asia/Kolkata')::date, 'YYMM') as m \gset

-- THE JOBS, filed by the dispatcher (the triggers stamp them). Cleaned, with
-- the Indoor Service Report uploaded -- what a DC asks of every unit (0323).
call public.be('idc_disp@x.com');
insert into public.indoor_jobs (kind, activity, product_name, serial, party_name, demo_for_party, status, qc_result,
                                cleaned_at, indoor_report_no, report_file_url) values
 ('Customer property', 'Repair', 'IDC VENT',     'S1', 'IDC HOSPITAL',   '', 'Ready',    'Pass', now(), 'ISR-1', 'https://drive/1'),  -- J1
 ('Customer property', 'Repair', 'IDC VENT2',    'S2', ' idc hospital ', '', 'Ready',    'Pass', now(), 'ISR-2', 'https://drive/2'),  -- J2
 ('Customer property', 'Repair', 'IDC VENT',     'S3', 'IDC HOSPITAL',   '', 'Ready',    null,   now(), 'ISR-3', 'https://drive/3'),  -- J3 no QC
 ('Customer property', 'Repair', 'IDC VENT',     'S4', 'OTHER CLINIC',   '', 'Ready',    'Pass', now(), 'ISR-4', 'https://drive/4'),  -- J4
 ('DEMO unit',         'Demo',   'IDC IMPORTED', 'S5', null, 'IDC HOSPITAL', 'Ready',    null,   now(), 'ISR-5', 'https://drive/5'),  -- J5 no PDT
 ('Customer property', 'Repair', 'IDC VENT',     'S6', 'IDC HOSPITAL',   '', 'Received', null,   now(), 'ISR-6', 'https://drive/6'),  -- J6
 ('Customer property', 'Repair', 'NO SUCH LINE', 'S7', 'IDC HOSPITAL',   '', 'Ready',    'Pass', now(), 'ISR-7', 'https://drive/7');  -- J7 no code
insert into public.indoor_job_accessories (job_id, name, serial)
select id, 'Flow sensor', 'FS1' from public.indoor_jobs where serial = 'S1' and product_name = 'IDC VENT';
insert into public.indoor_job_accessories (job_id, name, serial, qty)
select id, 'Power cord', '', 2 from public.indoor_jobs where serial = 'S1' and product_name = 'IDC VENT';
insert into public.indoor_job_accessories (job_id, name, serial)
select id, '', '' from public.indoor_jobs where serial = 'S1' and product_name = 'IDC VENT';   -- blank: no line

\echo '--- 0. THE PRODUCT CODE ---'
\echo 'expect: IDC-CODE-1 | IDC-MC-9 | (null)'
select public.indoor_job_product_code('idc vent ', 'ANY') as by_name,
       public.indoor_job_product_code('IDC VENT2', 's2')  as by_machine,
       public.indoor_job_product_code('NO SUCH LINE', 'S7') as none;

\echo '--- 1. A READER OF THE PAGE MAY NOT ISSUE A DC ---'
call public.be('idc_read@x.com');
begin;
  set local role authenticated;
  \echo 'expect ERROR: indoor.dispatch is required to issue an Indoor DC'
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'S1'), 'IDC HOSPITAL', p_authorised_by => 'Idc Manager');
commit;

\echo '--- 2. NOBODY WRITES A DC DIRECTLY, not even the dispatcher ---'
call public.be('idc_disp@x.com');
begin;
  set local role authenticated;
  \echo 'expect ERROR: permission denied for table indoor_dcs'
  insert into public.indoor_dcs (dc_no, consignee) values ('IDC-0000-0001', 'X');
commit;
begin;
  set local role authenticated;
  \echo 'expect ERROR: permission denied for table indoor_dc_lines'
  insert into public.indoor_dc_lines (dc_id, line_no, job_id, description) values (1, 1, 1, 'X');
commit;

\echo '--- 3. ONE DC, TWO JOBS, ONE CONSIGNEE ---'
begin;
  set local role authenticated;
  select public.create_indoor_dc(
    array(select id from public.indoor_jobs where serial in ('S1', 'S2') order by serial),
    E'IDC HOSPITAL\nMount Road\nChennai - 600002',
    'MIRN-77', '2026-09-30', 'By hand', 'Returned after repair',
    (select jsonb_build_array(jsonb_build_object('job_id', a.job_id, 'accessory_id', a.id, 'purpose', 'Spare cord returned'))
       from public.indoor_job_accessories a where a.name = 'Power cord'),
    'idc manager') as dc_no;
commit;
\echo 'expect: IDC-<this month>-0001 | dated today | MIRN-77 | 2026-09-30 | By hand | Returned after repair | Idc Dispatcher | creator is the dispatcher | Idc Manager | Pending approval'
select dc_no, dc_date = (now() at time zone 'Asia/Kolkata')::date as dated_today, customer_ref, customer_ref_date,
       mode_of_despatch, purpose, issued_by_name,
       created_by = '7d000000-0000-0000-0000-000000000001' as creator_is_dispatcher,
       authorised_by_name, approval_status
  from public.indoor_dcs where consignee like 'IDC HOSPITAL%';
\echo 'expect four lines: 1 IDC-CODE-1 "IDC VENT Sl.No S1" QTY 1; 2 "Flow sensor Sl.No FS1" QTY 1;'
\echo 'expect: 3 "Power cord" QTY 2 (as received) with the overridden purpose; 4 IDC-MC-9 "IDC VENT2 Sl.No S2" QTY 1'
select l.line_no, l.part_no, l.description, l.qty, l.purpose, l.accessory_id is null as equipment
  from public.indoor_dc_lines l join public.indoor_dcs d on d.id = l.dc_id
 where d.dc_no = 'IDC-' || :'m' || '-0001' order by l.line_no;
\echo 'expect: both jobs carry IDC-<month>-0001 and today, are STILL Ready, and the guard stamped dispatched_at/by'
select serial, dispatch_ref, dc_date = (now() at time zone 'Asia/Kolkata')::date as dc_dated_today, status, dispatched_at is not null as dispatched_at_set,
       dispatched_by = '7d000000-0000-0000-0000-000000000001' as dispatched_by_dispatcher
  from public.indoor_jobs where serial in ('S1', 'S2') order by serial;

\echo '--- 4. A UNIT ALREADY ON A DC ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: already carries DC No. -- one unit, one DC'
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'S1'), 'IDC HOSPITAL', p_authorised_by => 'Idc Manager');
commit;

\echo '--- 5. THE DC IS NOT A WAY ROUND THE QUALITY CHECK ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: a repair cannot be dispatched before its quality check is recorded (4.5.6)'
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial in ('S3', 'S7') order by serial), 'IDC HOSPITAL', p_authorised_by => 'Idc Manager');
commit;
\echo 'expect: S3 and S7 untouched -- Ready, no DC No. (nothing of the refused DC was kept)'
select serial, status, dispatch_ref, dc_date, dispatched_at is null as not_dispatched
  from public.indoor_jobs where serial in ('S3', 'S7') order by serial;

\echo '--- 6. ...NOR ROUND PRE-DELIVERY TESTING ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: a DEMO unit of an imported product does not leave before its Pre-Delivery Testing (R/SER/QC/007) is recorded'
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'S5'), 'IDC HOSPITAL', p_authorised_by => 'Idc Manager');
commit;

\echo '--- 7. TWO CONSIGNEES ON ONE DC ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: one Indoor DC goes to one consignee'
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial in ('S4', 'S7')), 'IDC HOSPITAL', p_authorised_by => 'Idc Manager');
commit;

\echo '--- 8. A UNIT THAT IS NOT READY ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: only a Ready unit goes on an Indoor DC -- this one is Received'
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'S6'), 'IDC HOSPITAL', p_authorised_by => 'Idc Manager');
commit;

\echo '--- 9. NO CONSIGNEE ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: an Indoor DC needs its consignee (To)'
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'S7'), '   ', p_authorised_by => 'Idc Manager');
commit;

\echo '--- 10. A PURPOSE FOR A JOB THAT IS NOT ON THE DC ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: a line purpose names job'
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'S7'), 'IDC HOSPITAL',
    '', null, '', 'x', '[{"job_id": -5, "accessory_id": null, "purpose": "y"}]'::jsonb, 'Idc Manager');
commit;

\echo '--- 11. A SECOND DC: a job with no code prints PART No. blank; the number runs on ---'
begin;
  set local role authenticated;
  select public.create_indoor_dc(array(select id from public.indoor_jobs where serial = 'S7'), 'IDC HOSPITAL',
    '', null, 'Courier', 'Returned after repair', p_authorised_by => 'Idc Manager') as dc_no;
commit;
\echo 'expect: IDC-<month>-0002 | 1 line | part_no blank | "NO SUCH LINE Sl.No S7"'
select d.dc_no, count(l.*) as lines, max(l.part_no) as part_no, max(l.description) as description
  from public.indoor_dcs d join public.indoor_dc_lines l on l.dc_id = d.id
 where d.dc_no = 'IDC-' || :'m' || '-0002' group by d.dc_no;

\echo '--- 12. THE NUMBER IS NOT SETTABLE, even by a trusted role; and it is monthly ---'
call public.be('idc_disp@x.com');
insert into public.indoor_dcs (dc_no, dc_date, consignee) values ('IDC-9999-9999', (now() at time zone 'Asia/Kolkata')::date, 'A TRUSTED ROLE');
insert into public.indoor_dcs (dc_no, dc_date, consignee) values ('MY-OWN-NUMBER', (date_trunc('month', (now() at time zone 'Asia/Kolkata')::date) + interval '1 month')::date, 'A TRUSTED ROLE');
\echo 'expect: IDC-<month>-0003 and IDC-<next month>-0001 -- neither number sent survived'
select dc_no from public.indoor_dcs where consignee = 'A TRUSTED ROLE' order by id;
\echo 'expect: an edit cannot rewrite the number or the issuer'
update public.indoor_dcs set dc_no = 'IDC-0000-0999', issued_by_name = 'Somebody Else' where dc_no = 'IDC-' || :'m' || '-0003';
select dc_no, issued_by_name from public.indoor_dcs where consignee = 'A TRUSTED ROLE' order by id;

\echo '--- 13. NOT CHANGED, NOT DELETED by anybody signed in ---'
begin;
  set local role authenticated;
  \echo 'expect ERROR: permission denied for table indoor_dcs'
  update public.indoor_dcs set consignee = 'CHANGED' where dc_no = 'IDC-' || :'m' || '-0001';
commit;
begin;
  set local role authenticated;
  \echo 'expect ERROR: permission denied for table indoor_dcs'
  delete from public.indoor_dcs where dc_no = 'IDC-' || :'m' || '-0001';
commit;
begin;
  set local role authenticated;
  \echo 'expect ERROR: permission denied for table indoor_dc_lines'
  delete from public.indoor_dc_lines;
commit;

\echo '--- 14. WHO READS ---'
\echo 'expect: the reader of the page sees 4 DCs; IDC-<month>-0001 lists both jobs and 4 lines'
call public.be('idc_read@x.com');
begin;
  set local role authenticated;
  select count(*) as dcs_seen from public.indoor_dc_list;
  select dc_no, line_count, job_nos is not null and job_nos like '%,%' as two_jobs
    from public.indoor_dc_list where dc_no = 'IDC-' || :'m' || '-0001';
commit;
\echo 'expect: somebody without the Indoor Service page sees 0 DCs and 0 lines'
call public.be('idc_out@x.com');
begin;
  set local role authenticated;
  select (select count(*) from public.indoor_dcs) as dcs_seen, (select count(*) from public.indoor_dc_lines) as lines_seen;
commit;
\echo 'expect: the counter and the number generator are closed to the API'
select has_function_privilege('authenticated', 'public.next_indoor_dc_no(date)', 'EXECUTE') as auth_may_number,
       has_function_privilege('anon', 'public.create_indoor_dc(bigint[],text,text,date,text,text,jsonb,text)', 'EXECUTE') as anon_may_issue,
       has_table_privilege('authenticated', 'public.indoor_dc_counters', 'SELECT') as auth_reads_counter;

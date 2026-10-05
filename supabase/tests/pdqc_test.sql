-- ===========================================================================
-- PRE-DELIVERY QUALITY CHECK (0377).
--
--   A check is written whole (every field mandatory, in the database), the
--   inspector is the session's whatever the browser sends, an edit re-signs
--   it, NOT OK is kept as it is, nobody without pdqc.record writes, and
--   nobody deletes.
--
-- Superuser bypasses RLS, so every step runs as `authenticated`.
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
 ('e1e1e377-0000-0000-0000-000000000001', 'pdqc_a@x.com'),
 ('e1e1e377-0000-0000-0000-000000000002', 'pdqc_b@x.com'),
 ('e1e1e377-0000-0000-0000-000000000003', 'pdqc_view@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role, designation, extra_permissions) values
 ('e1e1e377-0000-0000-0000-000000000001', 'pdqc_a@x.com', 'PDQC A', 'engineer', 'Service Engineer', '["pdqc.record"]'),
 ('e1e1e377-0000-0000-0000-000000000002', 'pdqc_b@x.com', 'PDQC B', 'engineer', 'QC Engineer', '["pdqc.record"]'),
 ('e1e1e377-0000-0000-0000-000000000003', 'pdqc_view@x.com', 'PDQC View', 'engineer', '', '["mod:/indoor/pdqc"]')
on conflict (id) do update set role = excluded.role, designation = excluded.designation, extra_permissions = excluded.extra_permissions;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- A whole check, as the screen sends it; inspected_by is a forgery.
create temp table good as select
  'ORION-G'::text product_name, ' SN-77 '::text serial, current_date test_date,
  'ME-1'::text measuring_equipment_id, 'v2.1'::text software_version, 'OK'::text hv, 'OK'::text ht,
  'OK'::text check1, 'OK'::text check2, 'NOT OK'::text check3, 'OK'::text check4, 'OK'::text check5,
  500::numeric cmv_vte_21, 501::numeric cmv_vte_60, 502::numeric cmv_vte_100,
  5::numeric cmv_peep_21, 5::numeric cmv_peep_60, 5::numeric cmv_peep_100,
  21::numeric cmv_o2_21, 60::numeric cmv_o2_60, 100::numeric cmv_o2_100,
  20::numeric pcmv_pip_21, 20::numeric pcmv_pip_60, 20::numeric pcmv_pip_100,
  5::numeric pcmv_peep_21, 5::numeric pcmv_peep_60, 5::numeric pcmv_peep_100,
  21::numeric pcmv_o2_21, 60::numeric pcmv_o2_60, 100::numeric pcmv_o2_100,
  'e1e1e377-0000-0000-0000-000000000003'::uuid inspected_by;
grant select on good to authenticated;
\set cols 'product_name, serial, test_date, measuring_equipment_id, software_version, hv, ht, check1, check2, check3, check4, check5, cmv_vte_21, cmv_vte_60, cmv_vte_100, cmv_peep_21, cmv_peep_60, cmv_peep_100, cmv_o2_21, cmv_o2_60, cmv_o2_100, pcmv_pip_21, pcmv_pip_60, pcmv_pip_100, pcmv_peep_21, pcmv_peep_60, pcmv_peep_100, pcmv_o2_21, pcmv_o2_60, pcmv_o2_100, inspected_by'

\echo '--- 1. A WHOLE CHECK SAVES, SIGNED BY THE SESSION ---'
call public.be('pdqc_a@x.com');
begin; set local role authenticated;
  insert into public.pdqc_records (:cols) select :cols from good;
commit;
select 'numbered PDQC/YY/0001', pdqc_no = 'PDQC/' || to_char(now() at time zone 'Asia/Kolkata', 'YY') || '/0001' as ok
  from public.pdqc_records where product_name = 'ORION-G';
select 'saved, serial trimmed, signed by the saver with their designation (the forged id discarded)',
       serial = 'SN-77' and check3 = 'NOT OK'
   and inspected_by = 'e1e1e377-0000-0000-0000-000000000001'
   and inspector_name = 'PDQC A' and inspector_designation = 'Service Engineer' and inspected_at is not null as ok
  from public.pdqc_records where product_name = 'ORION-G';

\echo '--- 2. EVERY FIELD IS MANDATORY ---'
\echo 'expect ERROR: a missing reading'
begin; set local role authenticated;
  insert into public.pdqc_records (product_name, serial, test_date, measuring_equipment_id, software_version, hv, ht,
    check1, check2, check3, check4, check5)
  select product_name, serial, test_date, measuring_equipment_id, software_version, hv, ht, check1, check2, check3, check4, check5 from good;
commit;
\echo 'expect ERROR: a blank text field'
begin; set local role authenticated;
  update public.pdqc_records set software_version = '  ' where product_name = 'ORION-G';
commit;
\echo 'expect ERROR: a check that is neither OK nor NOT OK'
begin; set local role authenticated;
  update public.pdqc_records set check1 = 'FINE' where product_name = 'ORION-G';
commit;

\echo '--- 3. AN EDIT RE-SIGNS AS THE EDITOR ---'
call public.be('pdqc_b@x.com');
begin; set local role authenticated;
  update public.pdqc_records set software_version = 'v2.2', pdqc_no = 'FORGED' where product_name = 'ORION-G';
commit;
select 'now signed by the editor, created_by and the number kept',
       inspector_name = 'PDQC B' and inspector_designation = 'QC Engineer'
   and created_by = 'e1e1e377-0000-0000-0000-000000000001' and software_version = 'v2.2'
   and pdqc_no like 'PDQC/%/0001' as ok
  from public.pdqc_records where product_name = 'ORION-G';

\echo '--- 4. THE PAGE KEY READS, IT DOES NOT WRITE ---'
call public.be('pdqc_view@x.com');
begin; set local role authenticated;
  select 'the page key sees the check' as t, count(*) = 1 as ok from public.pdqc_records;
commit;
\echo 'expect ERROR: no pdqc.record, no new check'
begin; set local role authenticated;
  insert into public.pdqc_records (:cols) select :cols from good;
commit;
begin; set local role authenticated;
  update public.pdqc_records set hv = 'X';
commit;
select 'no pdqc.record: the edit changed nothing', count(*) = 0 as ok from public.pdqc_records where hv = 'X';

\echo '--- 5. NEVER DELETED ---'
call public.be('pdqc_a@x.com');
\echo 'expect ERROR: a quality record is not deleted'
begin; set local role authenticated;
  delete from public.pdqc_records;
commit;
select 'the check is still there', count(*) = 1 as ok from public.pdqc_records;

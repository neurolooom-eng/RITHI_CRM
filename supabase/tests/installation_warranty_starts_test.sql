-- ===========================================================================
-- THE INSTALLATION WARRANTY TABLE, AND ITS BULK UPLOAD (0332).
--
--   The user, 2026-10-03: the installation's warranty decision stored in a
--   table of its own, loaded in one go for calls back to 2018.
--
--   Proves, as a signed-in user: a row loaded for a 2018 installation that was
--   never a RITHI call decides its product + serial's warranty exactly as a
--   RITHI report does; the result columns are the system's and a typed value
--   is discarded; a re-load corrects rather than duplicates; a role without
--   Bulk Uploads cannot load; the Visit Entry preview answers.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('iwup', 'Uploader', '["bulk.upload"]'::jsonb),
 ('iwno', 'No upload', '["calls.view"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;
insert into auth.users (id, email) values
 ('ab000000-0000-0000-0000-000000000001', 'iwup@x.com'),
 ('ab000000-0000-0000-0000-000000000002', 'iwno@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
 ('ab000000-0000-0000-0000-000000000001', 'iwup@x.com', 'Uploader', 'iwup'),
 ('ab000000-0000-0000-0000-000000000002', 'iwno@x.com', 'No Upload', 'iwno')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- A machine sold in 2018 with a 2-year warranty; its installation was never a
-- RITHI call.
insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end, warranty_years)
values ('SA-18', 'OLD HOSP', '2018-04-01', '2020-03-31', 2);
insert into public.sale_items (uid, sa_number, product_name, serial_number) values ('U-18', 'SA-18', 'OLD VENT', 'OV-18');

\echo '--- 1. AN UPLOADED 2018 INSTALLATION DECIDES ITS MACHINE''S WARRANTY ---'
call public.be('iwup@x.com');
begin;
  set local role authenticated;
  insert into public.installation_warranty_starts
    (ucn, call_number, product_name, serial, party_name, reg_date, warranty_choice, solved_date,
     engineer, remarks, source, warranty_start, warranty_end)
  values ('18D10I0001', 'WI-OLD VENT-OV-18', 'OLD VENT', 'OV-18', 'OLD HOSP', '2018-05-02',
          'Installation Call Solved Date', '2018-05-10', 'ENG OLD', 'installed', 'Upload',
          '1999-01-01', '1999-12-31');
commit;
select 'machine starts on the 2018 solved date, ends 2 years on',
       (warranty_start, warranty_end) = (date '2018-05-10', date '2020-05-09') as ok
  from public.products where item_name = 'OLD VENT' and serial_number = 'OV-18';
select 'the row records the system''s result, not the typed one',
       (warranty_start, warranty_end, period_months) = (date '2018-05-10', date '2020-05-09', 24::numeric) as ok
  from public.installation_warranty_starts where ucn = '18D10I0001';

\echo '--- 2. A RE-LOAD CORRECTS THE ROW ---'
begin;
  set local role authenticated;
  insert into public.installation_warranty_starts (ucn, product_name, serial, warranty_choice, solved_date, source)
  values ('18d10i0001 ', 'OLD VENT', 'OV-18', 'Invoice Date', '2018-05-10', 'Upload')
  on conflict (ucn_key) do update set warranty_choice = excluded.warranty_choice;
commit;
select 'one row, now Invoice Date, and the machine back on the sale''s start',
       (select count(*) from public.installation_warranty_starts where ucn_key = '18d10i0001') = 1
   and (select warranty_start = date '2018-04-01' from public.products
         where item_name = 'OLD VENT' and serial_number = 'OV-18') as ok;

\echo '--- 3. expect ERROR: a role without Bulk Uploads cannot load ---'
call public.be('iwno@x.com');
begin;
  set local role authenticated;
  insert into public.installation_warranty_starts (ucn, product_name, serial, warranty_choice, solved_date)
  values ('18D10I0099', 'OLD VENT', 'OV-99', 'Installation Call Solved Date', '2018-05-10');
commit;

\echo '--- 4. THE VISIT ENTRY PREVIEW ---'
begin;
  set local role authenticated;
  select 'preview gives now and after-solve dates',
         (now_start, now_end, period_months, solved_start, solved_end)
         = (date '2018-04-01', date '2020-03-31', 24::numeric, date '2026-10-03', date '2028-10-02') as ok
    from public.machine_warranty_preview('OLD VENT', 'OV-18', date '2026-10-03');
commit;

\echo '--- 5. RECORDED, AND CLOSED WHERE IT SHOULD BE ---'
select 'fill recorded', exists (select 1 from public.one_time_fixes_done where name = '0332_installation_warranty_filled') as ok;
select 'preview closed to the public key',
       not has_function_privilege('anon', 'public.machine_warranty_preview(text,text,date)', 'EXECUTE') as ok;

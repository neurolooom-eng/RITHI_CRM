-- ===========================================================================
-- LOADING THE FIELD FAILURE REGISTER BACK TO 2016 (0179).
--
--   "I want Provision to upload FFR Data from 2016 -- I think every year it has
--   a Different Format -- But it needs to be able to merge all into 1 Table."
--
--   AN IMPORTED ROW IS NOT ATTRIBUTED TO WHOEVER LOADED IT. ffr_stamp sets
--   raised_by from auth.uid() on a report raised here; on an imported one it
--   leaves it NULL, because the sheet's "Raised by" is a NAME and linking it to
--   the person running the upload would say a 2016 report was raised by
--   somebody who had not seen it.
--   THE COLUMNS THIS REGISTER HAS NO FIELD FOR ARE KEPT, so a year in an
--   unfamiliar shape loses nothing.
--   RE-LOADING A CORRECTED YEAR UPDATES rather than duplicating — the number is
--   the key.
--   LOADING OLD YEARS CANNOT DISTURB THIS YEAR'S COUNTER.
--   AND THE SPLIT IS REPORTABLE (URS-037): a migrated year and a report this
--   system raised are both quality records but not the same kind of evidence.
--
-- Superuser bypasses RLS, so the scoped checks run as `authenticated`.
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('cc000000-0000-0000-0000-000000000001','imp_admin@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('cc000000-0000-0000-0000-000000000001','imp_admin@x.com','Import Admin','admin')
on conflict (id) do update set role = excluded.role;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo ''
\echo '--- 1. an imported row is NOT attributed to whoever loaded it ---'
-- Signed in, as the upload actually runs: the stamp would otherwise write this
-- administrator's uuid onto a report from 2016.
call public.be('imp_admin@x.com');
set role authenticated;
insert into public.field_failure_reports
  (ffr_no, ffr_date, ucn, customer_name, product_name, product_serial,
   problem_reported, raised_by_name, imported_from, extra)
values ('FFR - 012/16', date '2016-07-14', 'CRN-2016-88', 'OLD HOSPITAL',
        'MONNAL T50', '4471', 'Blower noise', 'R Sharma',
        'Field Failure Register (sheet)',
        '{"Merged Doc ID":"1a2b3c","Sales Engineer":"K Rao"}'::jsonb);
select raised_by_name as should_be_R_Sharma,
       (raised_by is null) as raised_by_should_be_null
  from public.field_failure_reports where ffr_no = 'FFR - 012/16';
reset role;

\echo ''
\echo '--- 2. …but a report RAISED HERE still records who raised it ---'
-- The exception must not have removed the rule.
call public.be('imp_admin@x.com');
set role authenticated;
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date, customer_name, problem_reported)
values ('FFR - 900/26', 'PC', 'F-HERE-1', current_date, 'NEW HOSPITAL', 'raised here');
select (raised_by = 'cc000000-0000-0000-0000-000000000001') as should_be_the_signed_in_user
  from public.field_failure_reports where ffr_no = 'FFR - 900/26';
reset role;

\echo ''
\echo '--- 3. columns this register has no field for are KEPT, not dropped ---'
select extra ? 'Merged Doc ID' as autocrat_column_kept,
       extra ->> 'Sales Engineer' as should_be_K_Rao
  from public.field_failure_reports where ffr_no = 'FFR - 012/16';

\echo ''
\echo '--- 4. re-loading a corrected year UPDATES rather than duplicating ---'
-- THE KEY IS THE REPORT **AND THE MACHINE** (0181), because one report can
-- cover several machines and keying on the number alone silently replaced one
-- machine's record with another's — that is how twelve machines were lost on a
-- load that reported success. This section was written against the old
-- single-column key and was never moved with it, so from 0181 onward it raised
-- “no unique or exclusion constraint matching the ON CONFLICT specification”
-- and stopped testing the re-load at all. Found by the isolated run, 2026-09-15.
insert into public.field_failure_reports
  (ffr_no, ffr_date, ucn, customer_name, product_name, product_serial, problem_reported, imported_from)
values ('FFR - 012/16', date '2016-07-14', 'CRN-2016-88', 'OLD HOSPITAL, MUMBAI',
        'MONNAL T50', '4471', 'Blower noise on start-up', 'Field Failure Register (sheet)')
on conflict (ffr_no, product_serial) do update set
  customer_name = excluded.customer_name, problem_reported = excluded.problem_reported;
select count(*) as should_be_1, max(customer_name) as should_be_corrected
  from public.field_failure_reports where ffr_no = 'FFR - 012/16';

\echo ''
\echo '--- 5. the NUMBER cannot be rewritten by a re-load ---'
-- ffr_stamp puts the old number back on update, so a sheet that renumbered a
-- report cannot renumber the record. The row matched on the OLD number, so the
-- attempted new one is simply refused.
update public.field_failure_reports set ffr_no = 'FFR - 999/16' where ffr_no = 'FFR - 012/16';
select ffr_no as should_still_be_012_16 from public.field_failure_reports where ucn = 'CRN-2016-88';

\echo ''
\echo '--- 6. loading OLD years cannot disturb THIS year''s counter ---'
-- 2026 reads 901 rather than 013 because test 2 added FFR - 900/26 — the
-- counter follows ITS OWN year and nothing the 2016 load did. Labelled
-- precisely: "unaffected" would be wrong, since it moved.
select public.next_ffr_no(16::smallint) as follows_the_2016_rows,
       public.next_ffr_no(26::smallint) as follows_only_2026_rows;

\echo ''
\echo '--- 7. the split is reportable (URS-037) ---'
select case when imported_from = '' then 'raised by this system' else 'migrated from the sheet' end as origin,
       count(*)
  from public.field_failure_reports group by 1 order by 1;

\echo ''
\echo '--- 8. an imported report still has its own history from the start ---'
-- 0174's create entry fires for an imported row too, so a 2016 report's history
-- begins somewhere rather than at its first edit here.
select count(*) as should_be_1 from public.ffr_history
 where ffr_no = 'FFR - 012/16' and action = 'create';

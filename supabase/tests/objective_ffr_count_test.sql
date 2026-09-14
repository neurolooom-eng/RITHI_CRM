-- ===========================================================================
-- OBJECTIVE 1 COUNTS FIELD FAILURE REPORTS, AND COUNTS THEM BY REPORT.
--
-- The user, 2026-09-14: "Automate / Calculate -> No.of Field failures
-- registered in FFR ; Logic = No of FFRs registered for the Month".
--
-- Every expectation below is worked from that sentence, not read back off the
-- function. The one that matters most is the first: ONE REPORT CAN COVER
-- SEVERAL MACHINES (0181), so "no of FFRs" is a count of REPORT NUMBERS. A
-- count of rows would report six failures where three reports exist.
--
-- Run: psql ... -f supabase/tests/objective_ffr_count_test.sql
-- The only errors in the output should be the ones labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off

begin;

-- The objective row, as 0142 points it.
select id as oid, parameter, calc_key from public.quality_objectives
 where year = 2026 and calc_key = 'ffr_count_monthly' \gset

-- THE HARNESS IS AN ADMINISTRATOR throughout, and it has to be from the START
-- rather than only for Re-Calculate: `objective_evidence` gates an FFR
-- objective on `ffr.view`/`ffr.manage` (0142), so asking it as nobody tests the
-- gate and not the figure. That gate is deliberate -- the evidence for a count
-- of Field Failure Reports IS the reports, and whoever may not open that
-- register may not read them through this door either.
insert into auth.users (id, email) values
 ('ab000000-0000-0000-0000-000000000001','objadmin@x.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
 ('ab000000-0000-0000-0000-000000000001','objadmin@x.com','Objective Admin','admin')
 on conflict (id) do update set role = excluded.role;
update public.app_roles set permissions = permissions || '["config.manage","ffr.view"]'::jsonb
 where role = 'admin';
update public.harness set uid = 'ab000000-0000-0000-0000-000000000001', email = 'objadmin@x.com';
select public.has_perm('config.manage') as "the harness may re-calculate",
       public.has_perm('ffr.view')      as "...and may read the register behind the figure";

\echo
\echo '-- 0142 pointed objective 1 at the register --'
select :'parameter' ilike '%Field failures registered in FFR%' as "objective 1 is the one computed";

-- A month wholly in the past, so the cut-off is the month end and nothing
-- depends on today: January of this objective's year.
delete from public.field_failure_reports;
insert into public.field_failure_reports (ffr_no, ffr_date, product_name, product_serial, customer_name)
values
  -- ONE report over THREE machines. This is the case the whole test exists for.
  ('FFR-A', '2026-01-05', 'ORION-G', 'SN1', 'APOLLO'),
  ('FFR-A', '2026-01-05', 'ORION-G', 'SN2', 'APOLLO'),
  ('FFR-A', '2026-01-05', 'VEGA',    'SN3', 'APOLLO'),
  -- two more reports, one machine each
  ('FFR-B', '2026-01-20', 'VEGA',    'SN4', 'FORTIS'),
  ('FFR-C', '2026-01-31', 'MT75',    'SN5', 'FORTIS'),
  -- the month BEFORE and the month AFTER must not be counted
  ('FFR-D', '2025-12-31', 'ORION-G', 'SN6', 'APOLLO'),
  ('FFR-E', '2026-02-01', 'ORION-G', 'SN7', 'APOLLO');

\echo
\echo '-- THREE reports in January, over five machine rows --'
select public.objective_value(:'oid'::bigint, 1) = 3 as "January counts 3 reports, not 5 rows";

\echo
\echo '-- the neighbouring months are not counted --'
select public.objective_value(:'oid'::bigint, 12) is distinct from 1 as "December 2025 is not in this year";
select public.objective_value(:'oid'::bigint, 2) = 1 as "February counts its own one";

\echo
\echo '-- A MONTH WITH NONE IS ZERO, NOT BLANK --'
-- The rate objectives return null on an empty denominator because a rate over
-- nothing is undefined. A count over nothing is nought, and on a "To Monitor"
-- objective the difference is the finding itself.
select public.objective_value(:'oid'::bigint, 3) = 0 as "March, with no reports, is 0 and not null";

\echo
\echo '-- THERE IS NO SUCH THING AS AN UNDATED REPORT (expect ERROR) --'
-- The first draft of 0142 carried a fallback to created_at for a null ffr_date,
-- and a note in the evidence pack explaining it. Both were dead: 0165 declares
-- `ffr_date date not null default (now() at time zone 'Asia/Kolkata')::date`.
-- THIS INSERT IS THE PROOF, and it is kept so the day somebody relaxes that
-- column the fallback question comes back rather than passing unnoticed.
savepoint no_date;
insert into public.field_failure_reports (ffr_no, ffr_date, product_name, product_serial)
values ('FFR-NODATE', null, 'ORION-G', 'SN8');   -- expect ERROR: ffr_date is not null
rollback to savepoint no_date;

\echo
\echo '-- a report with NO NUMBER counts as itself, never merged with another --'
insert into public.field_failure_reports (ffr_no, ffr_date, product_name, product_serial)
values ('', '2026-04-02', 'VEGA', 'SN9'), (null, '2026-04-03', 'VEGA', 'SN10');
select public.objective_value(:'oid'::bigint, 4) = 2 as "two unnumbered reports are two, not one";

\echo
\echo '-- the PRODUCT filter narrows it, and is empty by default --'
update public.quality_objectives set calc_params = '{"product":"%ORION%"}'::jsonb where id = :'oid'::bigint;
select public.objective_value(:'oid'::bigint, 1) = 1 as "January narrowed to ORION is 1 report";
update public.quality_objectives set calc_params = '{}'::jsonb where id = :'oid'::bigint;
select public.objective_value(:'oid'::bigint, 1) = 3 as "and back to 3 with no filter";

\echo
\echo '-- THE EVIDENCE LISTS EVERY MACHINE ROW, so it out-numbers the figure --'
select count(*) = 5 as "January evidence has five machine rows"
  from public.objective_evidence(:'oid'::bigint, 1);
select count(distinct call_number) = 3 as "...covering three report numbers"
  from public.objective_evidence(:'oid'::bigint, 1);
select bool_and(role = 'ffr') as "every evidence row is tagged ffr"
  from public.objective_evidence(:'oid'::bigint, 1);


\echo
\echo '-- the notes say what the figure means --'
select count(*) >= 4 as "the objective explains itself"
  from public.objective_notes(:'oid'::bigint, 1);
select bool_or(note like '%FFR NUMBERS, not rows%') as "...including that it counts reports, not rows"
  from public.objective_notes(:'oid'::bigint, 1);
select bool_or(note like '%ZERO IS AN ANSWER%') as "...and that zero is not blank"
  from public.objective_notes(:'oid'::bigint, 1);

\echo
\echo '-- Re-Calculate writes it like any other computed objective --'
select count(*) = 1 as "recalc reports on this objective"
  from public.recalc_quality_objectives(2026) where objective ilike '%Field failures%';
select m01 = 3 and m02 = 1 and m03 = 0 as "the figures landed in the month columns"
  from public.quality_objectives where id = :'oid'::bigint;

\echo
\echo '-- AND THE FOUR OBJECTIVES THAT WERE ALREADY COMPUTED STILL ARE --'
-- This file re-states objective_value, objective_evidence and objective_notes
-- in full; a transcription slip would show up here rather than in production.
select count(distinct calc_key) = 4 as "all four calc_keys are in use"
  from public.quality_objectives where year = 2026 and calc_key <> '';
select count(*) = 10 as "the ten rate objectives are untouched"
  from public.quality_objectives
 where year = 2026 and calc_key in ('failure_rate_12m','open_rate_monthly','attended_within_days');

-- THE RE-STATEMENT IS THE RISK IN THIS FILE, not the new branch: 0142 copies
-- objective_value, objective_evidence and objective_notes out of three earlier
-- files. A slip would show as a rate objective losing its shape, so ask one.
insert into public.products (item_name, serial_number, party_name)
values ('ORION-G', 'BASE1', 'APOLLO'), ('ORION-G', 'BASE2', 'APOLLO');
insert into public.field_calls (ucn, call_number, call_type, party_name, product_name, serial, reg_date)
values ('O-1','CN-O-1','Field Call','APOLLO','ORION-G','BASE1','2026-01-10');

select id as rid from public.quality_objectives
 where year = 2026 and calc_key = 'failure_rate_12m'
   and calc_params->>'product' = '%ORION%' \gset

select public.objective_value(:'rid'::bigint, 1) = round(1::numeric/2, 6)
  as "a rate objective still divides failures by the installed base";
select count(*) filter (where role = 'machine') = 2
   and count(*) filter (where role = 'filter')  = 1
   and count(*) filter (where role = 'failure') = 1
  as "...and its evidence still carries the filter row and the machine rows (0140)"
  from public.objective_evidence(:'rid'::bigint, 1);
select bool_and(details is not null) as "...with the Product Master details column 0140 added"
  from public.objective_evidence(:'rid'::bigint, 1) where role = 'machine';

rollback;

\echo
\echo '-- done --'

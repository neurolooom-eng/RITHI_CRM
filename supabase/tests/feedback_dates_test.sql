-- ===========================================================================
-- A FEEDBACK CARRIES ITS OWN DATE, NOT THE DAY IT WAS UPLOADED.
--
-- Reported from use, 2026-09-14: "I think the Date is taken as 14Sep2026 for
-- all Uploads , I wanted the Actual Dates as per the CSV not the Upload date --
-- It creates a Complaint issue."
--
-- The register's Date column read `created_at` — when the ROW was written — so
-- every feedback in a twenty-four-thousand-row export read as the afternoon it
-- was loaded. On a complaint record the date a customer complained is part of
-- the record.
--
-- THE VALUES WERE NEVER LOST. The importer is `extraInto: 'answers'`, which
-- keeps every unmapped column under its ORIGINAL SPREADSHEET HEADING, so the
-- export's "Visit Entry Date" was on every row all along. 0190 reads it back
-- out, which is why nobody has to load the file again.
--
-- The fixtures below are REAL VALUES from the user's v2Feedback - Merge.csv.
--
-- Run: psql ... -f supabase/tests/feedback_dates_test.sql
-- The only errors in the output should be the ones labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off

begin;
delete from public.feedback where ucn like 'FBD-%';

-- A row in the state the importer left it in BEFORE 0190: no entry_at of its
-- own, the real date sitting in `answers` under the export's heading.
alter table public.feedback alter column entry_at drop default;
insert into public.feedback (ucn, party_name, entry_at, visit_at, answers) values
  ('FBD-1', 'APOLLO', now(), null,
   '{"Visit Entry Date":"02-Jan-2025 11:18:59","Visit Date & Time":"01 January 2025"}'::jsonb),
  ('FBD-2', 'FORTIS', now(), null,
   '{"Visit Entry Date":"31-Dec-2024 23:05:00","Visit Date & Time":"30 December 2024"}'::jsonb),
  -- A year that wrote the date without a time.
  ('FBD-3', 'KEM',    now(), null, '{"Visit Entry Date":"15-Mar-2026"}'::jsonb),
  -- A MALFORMED ONE. to_timestamp RAISES rather than returning null, so one
  -- bad cell in twenty-four thousand would fail the whole migration if the
  -- backfill were not guarded on the shape.
  ('FBD-4', 'JUNK',   now(), null, '{"Visit Entry Date":"rubbish"}'::jsonb),
  -- Recorded HERE: no answers at all, so nothing to read back.
  ('FBD-5', 'TYPED',  now(), null, '{}'::jsonb);
alter table public.feedback alter column entry_at set default now();

\echo
\echo '-- before: every row reads as today, which is the fault --'
select count(distinct entry_at::date) = 1 as "all five share one date"
  from public.feedback where ucn like 'FBD-%';

\i supabase/migrations/0190_feedback_dates_and_origin.sql

\echo
\echo '-- after: each row carries the date its own file gave it --'
select
  (select entry_at from public.feedback where ucn='FBD-1') = '2025-01-02 11:18:59'::timestamptz as "a date and time",
  (select entry_at from public.feedback where ucn='FBD-2') = '2024-12-31 23:05:00'::timestamptz as "...across a year end",
  (select entry_at from public.feedback where ucn='FBD-3') = '2026-03-15 00:00:00'::timestamptz as "...and a date with no time";

\echo
\echo '-- a malformed date does not stop the file, and does not invent one --'
-- It keeps the default and stays visible in `answers`, which is the honest
-- outcome: the register says "loaded today" for the one row nobody can date,
-- rather than the migration refusing all twenty-four thousand.
select (select entry_at::date from public.feedback where ucn='FBD-4') = current_date
  as "the unreadable one keeps today and is not guessed";
select (select answers->>'Visit Entry Date' from public.feedback where ucn='FBD-4') = 'rubbish'
  as "...and what the file said is still on the row";

\echo
\echo '-- the VISIT date is filled only where it was MISSING --'
-- FBD-7 already HAS a visit date that disagrees with the export's. The importer
-- maps this column, so a row that has one was mapped correctly and must not be
-- re-derived from `answers` -- a backfill that overwrites what the importer got
-- right is not a backfill, it is a second importer with no tests.
insert into public.feedback (ucn, party_name, visit_at, answers) values
  ('FBD-7', 'KEPT', '2024-06-15 09:00:00+00',
   '{"Visit Entry Date":"20-Jun-2024 08:00:00","Visit Date & Time":"01 January 2000"}'::jsonb);
\i supabase/migrations/0190_feedback_dates_and_origin.sql
select (select visit_at from public.feedback where ucn='FBD-7') = '2024-06-15 09:00:00+00'::timestamptz
  as "a visit date already on the row is left alone";

select
  (select visit_at from public.feedback where ucn='FBD-1') = '2025-01-01 00:00:00'::timestamptz as "read from the export",
  (select visit_at from public.feedback where ucn='FBD-3') is null as "and left null where the file had none";

\echo
\echo '-- UPLOADED vs ENTERED HERE --'
-- "Can I segregate the Uploaded ones and the Ones that were entered in the new
-- CRM?" A row whose answers carry a heading only the export produces was loaded.
select
  (select imported_from from public.feedback where ucn='FBD-1') = 'v2Feedback export' as "a loaded row says so",
  (select imported_from from public.feedback where ucn='FBD-5') = ''                  as "and one recorded here is blank";

\echo
\echo '-- a feedback recorded HERE still gets a meaningful date --'
-- The column means "when this feedback was taken" on every row, which for a new
-- one is now. A column correct only for imported rows would move the problem.
insert into public.feedback (ucn, party_name) values ('FBD-6', 'NEW');
select (select entry_at::date from public.feedback where ucn='FBD-6') = current_date
   and (select imported_from from public.feedback where ucn='FBD-6') = ''
  as "a new feedback is dated now and marked as entered here";

\echo
\echo '-- running it twice lands on the same values --'
\i supabase/migrations/0190_feedback_dates_and_origin.sql
select (select entry_at from public.feedback where ucn='FBD-1') = '2025-01-02 11:18:59'::timestamptz
  as "idempotent";

rollback;
\echo
\echo '-- done --'

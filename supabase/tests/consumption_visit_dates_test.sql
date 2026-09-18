-- ===========================================================================
-- WHERE THE CONSUMPTION REPORT'S VISIT DATES COME FROM (0215).
--
--   "Map the first booked date to Visit Entry Date, Visit Date & Time" and
--   "For Imported Data - I need the Visit Entry Date; Visit Date & Time as in
--    from the Import." (the user, 2026-09-18)
--
-- THREE SOURCES, IN ORDER: the real visit, then what the FILE said, then the
-- first booking. The order is the whole rule, so each rung is proved with the
-- one below it also present — a test where only one candidate exists cannot
-- tell precedence from coincidence.
--
-- Run ONCE after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.spare_consumption where ucn like 'VD-%';
delete from public.reports            where ucn like 'VD-%';
delete from public.field_calls        where ucn like 'VD-%';
delete from public.handstock_opening  where engineer = 'VD ENG';

insert into public.field_calls (ucn, call_number, party_name) values
 ('VD-VISIT','C1','A'), ('VD-IMPORT','C2','A'), ('VD-PLAIN','C3','A'), ('VD-JUNK','C4','A');
insert into public.handstock_opening (engineer, part, qty, as_of, source)
values ('VD ENG','P|S',99,current_date,'t');

-- A real visit, whose dates differ from the booking so precedence is visible.
insert into public.reports (ucn, call_number, engineer, visit_at, updated_at, uid)
values ('VD-VISIT','C1','VD ENG','2026-09-01 10:00+00','2026-09-02 11:00+00','VISIT-1');

-- 0214 refuses a spare on an unvisited call, which is the rule under test in
-- ITS suite. Here the point is what the REPORT shows for rows that predate it,
-- so the guard is lifted around the fixture alone.
alter table public.spare_consumption disable trigger zz_consumption_needs_visit;
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, created_at, data) values
 -- visited: the booking is LATER than the visit, so a fallback would show.
 ('VD-VISIT','C1','P|S',1,'VD ENG','2026-09-05 08:00+00', '{}'::jsonb),
 -- imported: the file carried the entry date; the upload maps Visit Date & Time
 -- onto created_at, which is why only one of the two is in `data`.
 ('VD-IMPORT','C2','P|S',1,'VD ENG','2026-08-20 06:30+00',
  '{"Visit Entry Date":"2026-08-21 09:45+00"}'::jsonb),
 -- neither: first booking is all there is.
 ('VD-PLAIN','C3','P|S',1,'VD ENG','2026-09-07 09:15+00', '{}'::jsonb),
 -- a cell holding something that is not a date at all.
 ('VD-JUNK','C4','P|S',1,'VD ENG','2026-09-08 07:00+00',
  '{"Visit Entry Date":"n/a"}'::jsonb);
alter table public.spare_consumption enable trigger zz_consumption_needs_visit;

\echo ''
\echo '--- 1. a REAL visit wins, over both the import and the booking ---'
select 'VD-VISIT' as check, "Visit Entry Date"::text as entry_should_be_02nd,
       "Visit Date & Time"::text as visit_should_be_01st, "Visit UID" as uid_should_be_VISIT_1
  from public.consumption_report where "UC Number" = 'VD-VISIT';

\echo ''
\echo '--- 2. ...then what the FILE said, over the booking ---'
-- Entry from `data`, Visit Date from created_at (the upload maps it there).
-- Neither is the same value, which is what makes this prove the order.
select 'VD-IMPORT' as check, "Visit Entry Date"::text as entry_should_be_21_Aug,
       "Visit Date & Time"::text as visit_should_be_20_Aug,
       coalesce("Visit UID", '(none)') as uid_should_be_none
  from public.consumption_report where "UC Number" = 'VD-IMPORT';

\echo ''
\echo '--- 3. ...and the first booking last ---'
select 'VD-PLAIN' as check, "Visit Entry Date"::text as entry_should_be_07_Sep,
       "Visit Date & Time"::text as visit_should_be_07_Sep
  from public.consumption_report where "UC Number" = 'VD-PLAIN';

\echo ''
\echo '--- 4. a cell holding "n/a" falls through — it does not take the report down ---'
-- A bare ::timestamptz here would raise, and the WHOLE report would fail to
-- read rather than one cell being wrong.
select 'VD-JUNK' as check, "Visit Entry Date"::text as entry_should_be_08_Sep
  from public.consumption_report where "UC Number" = 'VD-JUNK';

\echo ''
\echo '--- 5. the header is matched with case and punctuation squashed ---'
select 'shouty header' as check,
       public.imported_ts('{"VISIT_ENTRY_DATE":"2026-08-21 09:45+00"}'::jsonb,
                          'Visit Entry Date')::text as should_be_21_Aug;

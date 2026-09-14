-- ===========================================================================
-- 0190 — CUSTOMER FEEDBACK GETS ITS OWN DATE, AND SAYS WHERE IT CAME FROM.
--
-- Reported from use, 2026-09-14, after loading the v2Feedback export:
--
--    "I think the Date is taken as 14Sep2026 for all Uploads , I wanted the
--     Actual Dates as per the CSV not the Upload date -- It creates a
--     Complaint issue"
--
-- Right, and it is worse than a display fault. The register's Date column read
-- `created_at`, which is when the ROW was written here — so twenty-four
-- thousand feedbacks collected over two years all read as one afternoon in
-- September 2026. On a complaint record that is not a cosmetic problem: the
-- date a customer complained is part of the record.
--
-- THE REAL DATES WERE NEVER LOST, and that is what makes this fixable without
-- asking anybody to load the file again. The importer is declared
-- `extraInto: 'answers'`, which keeps every unmapped column on the row UNDER
-- ITS ORIGINAL SPREADSHEET HEADING. Measured against the user's own file
-- (v2Feedback - Merge.csv, 24,749 rows):
--
--    "Visit Entry Date"    24,748 filled   e.g. 02-Jan-2025 11:18:59
--    "Visit Date & Time"   24,748 filled   e.g. 01 January 2025
--
-- The first is when the feedback was taken; the second is the visit it is
-- about. The second was already mapped to `visit_at`. The first had no column,
-- so it sat in `answers` — present, and invisible.
--
-- SO THIS BACKFILLS RATHER THAN REQUIRING A RE-UPLOAD. Every already-loaded row
-- carries its own date in `answers`, and this reads it back out.
--
-- `entry_at` DEFAULTS TO now() so a feedback recorded IN THIS SYSTEM has a
-- meaningful date too: the column means "when this feedback was taken", which
-- for a new one is now and for a migrated one is what the file said. A column
-- that is only correct for imported rows would just move the problem.
--
-- AND `imported_from`, which answers the other half of the same question
-- ("Can I segregate the Uploaded ones and the Ones that were entered in the new
-- CRM?"). Same shape as the Field Failure Register's (0179): the file a row
-- came in from, empty meaning this system raised it. A figure drawn from both
-- has to be able to report the split — the validation package requires it
-- (URS-037) and until now this register could not.
--
-- THE PARSING IS GUARDED. `to_timestamp('rubbish', 'DD-Mon-YYYY')` does not
-- return null, it RAISES — so one malformed cell would fail the whole
-- migration. Only values matching the shape are converted; anything else keeps
-- the default and stays visible in `answers`.
-- ===========================================================================

alter table public.feedback
  add column if not exists entry_at      timestamptz not null default now(),
  add column if not exists imported_from text        not null default '';

comment on column public.feedback.entry_at is
  'When the feedback was taken. For a migrated row this is the export''s "Visit Entry Date"; for one recorded here it is when it was recorded. NOT created_at, which is when the ROW was written and reads as the upload date on every migrated feedback.';
comment on column public.feedback.imported_from is
  'The file this feedback was loaded from; EMPTY means it was recorded in this system. Lets a figure drawn from both report the split.';

create index if not exists feedback_entry_at_idx  on public.feedback (entry_at desc);
create index if not exists feedback_imported_idx  on public.feedback (imported_from);

-- ---------------------------------------------------------------------------
-- THE BACKFILL. Idempotent: it reads `answers`, which the importer wrote and
-- nothing else touches, so running it again lands on the same values.
-- ---------------------------------------------------------------------------
do $$
declare n_date int; n_visit int; n_from int;
begin
  if to_regclass('public.feedback') is null then return; end if;

  -- 1. WHERE IT CAME FROM. A row whose `answers` carries a heading only the
  --    export produces was loaded from it. "Visit Entry Date" is that heading
  --    and is also what the date comes from, so the two agree by construction.
  update public.feedback
     set imported_from = 'v2Feedback export'
   where imported_from = ''
     and answers ? 'Visit Entry Date';
  get diagnostics n_from = row_count;

  -- 2. THE FEEDBACK'S OWN DATE. Guarded on the SHAPE, because to_timestamp
  --    raises rather than returning null on anything it cannot read.
  update public.feedback
     set entry_at = to_timestamp(btrim(answers->>'Visit Entry Date'), 'DD-Mon-YYYY HH24:MI:SS')
   where answers->>'Visit Entry Date' ~ '^\s*\d{1,2}-[A-Za-z]{3}-\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*$';
  get diagnostics n_date = row_count;

  -- ...and the date-only spelling, for a year that wrote it without a time.
  update public.feedback
     set entry_at = to_timestamp(btrim(answers->>'Visit Entry Date'), 'DD-Mon-YYYY')
   where answers->>'Visit Entry Date' ~ '^\s*\d{1,2}-[A-Za-z]{3}-\d{4}\s*$';

  -- 3. THE VISIT DATE, only where it is MISSING. The importer maps this one, so
  --    this catches rows loaded before that alias was added and touches nothing
  --    it already got right.
  update public.feedback
     set visit_at = to_timestamp(btrim(answers->>'Visit Date & Time'), 'DD Month YYYY')
   where visit_at is null
     and answers->>'Visit Date & Time' ~ '^\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*$';
  get diagnostics n_visit = row_count;

  raise notice '0190: % feedback row(s) marked as imported, % given their own date, % given a visit date',
    n_from, n_date, n_visit;
end $$;

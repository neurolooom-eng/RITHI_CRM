-- ===========================================================================
-- DO I NEED TO RE-UPLOAD THE IMPORT DATA?
--
--   The user, 2026-09-18: "Add Default Columns - Line ID , Source Ref Key ,
--   Created At to the Consumption Report. Shall I re-upload the Import Data?"
--
-- READ-ONLY, no editing. Paste and run. It answers the question about YOUR
-- rows rather than in principle, because the answer is different for each of
-- the three columns and depends on what the file you loaded actually carried.
--
-- IT RUNS ON THE PROJECT AS IT IS TODAY, before 0214/0215 or anything else
-- pending. That is not a detail — its FIRST version called `public.imported_ts`,
-- which 0215 creates, so the one file whose job is to say whether you need to
-- run something could only run AFTER you had run it:
--
--   ERROR: 42883: function public.imported_ts(jsonb, unknown) does not exist
--
-- So the key match below is written out in full instead of calling that helper.
-- It is the same rule — case and punctuation squashed away, so "Visit Entry
-- Date", "VISIT ENTRY DATE" and "Visit_Entry_Date" are one column.
--
-- THE SHORT ANSWER IS NO, FOR THE THREE NEW COLUMNS. None of them is new data:
--
--   Line ID        the row's own key. Every row has one, always has had.
--   Created At     when the line was written. On an IMPORTED row the upload
--                  maps the file's `Visit Date & Time` onto it, so it is the
--                  file's date and not the day you loaded it.
--   Source Ref Key the row id FROM THE FILE (`UID` / `Row ID` / `Unique ID`).
--                  Blank on anything booked in the app, which is correct and
--                  not a gap — there was no file.
--
-- WHERE A RE-UPLOAD CAN STILL CHANGE SOMETHING IS `Visit Entry Date`. The
-- upload keeps every heading it does not map in `data`, and 0215 reads the
-- imported value from there. So the value is already in if the file you loaded
-- carried that column, and re-uploading the SAME file adds nothing. It is worth
-- re-uploading only if the file you have now carries a heading the loaded one
-- did not — row 4 below is the count that tells you which case you are in.
--
-- Re-uploading is SAFE either way: the Consumption load matches on the file's
-- own row id (`source_ref_key`), so a corrected sheet updates those lines
-- rather than adding them again. Rows with no row id in the file cannot be
-- matched, and would be loaded a second time — row 6 is that count.
--
-- Row 4 counts the heading being PRESENT and not empty, which is the fact that
-- decides whether to re-upload. Whether each value then READS as a date is a
-- separate question, and one only 0215 can answer without risking the whole
-- report on a cell holding "n/a" — so it is deliberately not asked here.
-- ===========================================================================
with c as (
  select
    count(*)                                                                   as rows_all,
    count(*) filter (where coalesce(btrim(source_ref_key), '') <> '')           as rows_imported,
    count(*) filter (where coalesce(btrim(source_ref_key), '') = ''
                       and jsonb_typeof(data) = 'object'
                       and data <> '{}'::jsonb)                                as rows_extra_no_key,
    count(*) filter (where jsonb_typeof(data) = 'object' and exists (
                       select 1 from jsonb_each_text(data) as kv(k, v)
                        where regexp_replace(lower(kv.k), '[^a-z0-9]', '', 'g') = 'visitentrydate'
                          and btrim(coalesce(kv.v, '')) <> ''))                 as rows_with_imported_entry,
    count(*) filter (where exists (
                       select 1 from public.reports r where r.ucn = sc.ucn))    as rows_with_a_visit
    from public.spare_consumption sc
)
select q.n as "#", q.item as "Question", q.answer as "Count", q.means as "What it means"
  from c,
  lateral (values
    (1, 'Line ID — rows that have one',
        c.rows_all::text,
        'Every row. Nothing to re-upload.'),
    (2, 'Created At — rows that have one',
        c.rows_all::text,
        'Every row. On an imported row this is the date the FILE gave (its Visit Date & Time), not the day you loaded it.'),
    (3, 'Source Ref Key — rows carrying the file''s own row id',
        c.rows_imported::text || ' of ' || c.rows_all::text,
        case when c.rows_imported = 0
             then 'None. Either nothing was imported, or the file had no UID / Row ID column — in which case a re-upload would ADD the lines again rather than update them.'
             else 'These are the lines a re-upload would UPDATE rather than duplicate. The rest were booked in the app and have no file behind them.' end),
    (4, 'Visit Entry Date — rows where the import already carried it',
        c.rows_with_imported_entry::text,
        case when c.rows_with_imported_entry > 0
             then 'Already in. Re-uploading the same file changes nothing — once 0215 is applied the report reads this value straight from what was loaded.'
             else 'The loaded file carried no Visit Entry Date column. Re-upload ONLY if the file you have now has one; otherwise the report falls back to the first booking, which is the best date on the record.' end),
    (5, 'Rows with a real visit behind them',
        c.rows_with_a_visit::text || ' of ' || c.rows_all::text,
        'These take their two dates from the visit itself and are unaffected by anything above. The remainder is the set 0214 stops growing.'),
    (6, 'Rows with unmapped columns but no row id',
        c.rows_extra_no_key::text,
        'Loaded from a file that kept extra headings but gave no UID, so they cannot be matched on a re-upload. Check this is 0 before re-loading anything.')
  ) as q(n, item, answer, means)
 order by q.n;

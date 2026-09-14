-- ===========================================================================
-- A WRONG FILE WENT INTO THE DCCR REGISTER. WHAT NOW.
--
-- Asked, 2026-09-14: "I uploaded a Wrong file in DCCR -- How to delete it?"
--
-- READ THIS BEFORE RUNNING ANYTHING. The obvious answer — delete the rows —
-- is right for SOME of them and destroys real work on the others, and there is
-- no history table on `call_reviews` to undo it from.
--
-- The DCCR upload is an UPSERT keyed on the UC Number. So one file did two
-- different things:
--
--   INSERTED  a review for a call that had none. Nothing was lost; deleting
--             the row puts the register back exactly as it was.
--   UPDATED   a review that already existed, overwriting the answers somebody
--             had recorded. DELETING ONE OF THESE DOES NOT UNDO THE UPLOAD --
--             it throws away the review as well, and the old answers are not
--             recoverable from anywhere.
--
-- For the second kind the fix is NOT a delete. It is to load the CORRECT file,
-- which overwrites those same rows back to what they should say.
--
-- AND THERE IS A THIRD THING THE UPLOAD MAY HAVE DONE, which is the one nobody
-- expects. A review whose Risk to Patient / Warranty Failure / Frequent Failure
-- answers make "Any Potential Effect" YES RAISES A FIELD FAILURE REPORT, by a
-- database trigger (0167). A wrong file can therefore have created FFRs, and
-- deleting the reviews does NOT remove them. Section 3 lists them.
--
-- HOW TO USE THIS FILE
--   1. Set the window below to when the upload ran.
--   2. Run sections 1-3. They are READ-ONLY. Nothing is changed.
--   3. Only if section 1 shows rows, and you are satisfied they are yours to
--      remove, uncomment section 4 and run it.
--
-- Section 4 is wrapped in a transaction that ROLLS BACK by default. Change the
-- last line to `commit;` when you mean it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- THE WINDOW. Set both to bracket the upload. Widen it if section 1 looks
-- short; narrow it if it catches somebody else's work. `updated_at` is stamped
-- on every write by `call_reviews_stamp`, so the window is against that.
-- ---------------------------------------------------------------------------
\set win_from '2026-09-14 00:00:00+05:30'
\set win_to   '2026-09-15 00:00:00+05:30'

\echo
\echo '=== 1. NEW REVIEWS THE UPLOAD CREATED — these are the ones safe to delete'
-- created_at INSIDE the window means the row did not exist before it. Nothing
-- is lost by removing these.
select count(*) as "rows the upload created"
  from public.call_reviews
 where created_at >= :'win_from'::timestamptz
   and created_at <  :'win_to'::timestamptz;

select ucn, call_number, risk_to_patient, warranty_failure, frequent_failure,
       any_potential_effect, created_at
  from public.call_reviews
 where created_at >= :'win_from'::timestamptz
   and created_at <  :'win_to'::timestamptz
 order by created_at
 limit 50;

\echo
\echo '=== 2. REVIEWS THE UPLOAD OVERWROTE — DO NOT DELETE THESE'
-- created_at BEFORE the window and updated_at inside it: the review existed and
-- the file wrote over it. The previous answers are gone; deleting the row would
-- lose the review as well. Load the CORRECT file to put these back.
select count(*) as "reviews overwritten — re-upload the correct file for these"
  from public.call_reviews
 where updated_at >= :'win_from'::timestamptz
   and updated_at <  :'win_to'::timestamptz
   and created_at <  :'win_from'::timestamptz;

select ucn, call_number, review2_by, review2_at, created_at, updated_at
  from public.call_reviews
 where updated_at >= :'win_from'::timestamptz
   and updated_at <  :'win_to'::timestamptz
   and created_at <  :'win_from'::timestamptz
 order by updated_at
 limit 50;

\echo
\echo '=== 3. FIELD FAILURE REPORTS THE UPLOAD RAISED'
-- Raised by the trigger on "Any Potential Effect = YES" (0167) and identifiable
-- by the rule it records on itself. These are QUALITY RECORDS: they are not
-- deleted here, and this file will not offer to. Cancel one on the Field
-- Failure Register if it should not stand — the record is kept, marked.
select count(*) as "FFRs raised from a review in this window"
  from public.field_failure_reports
 where created_at >= :'win_from'::timestamptz
   and created_at <  :'win_to'::timestamptz
   and extra->>'raised_by_rule' = 'any_potential_effect=YES';

select ffr_no, ucn, customer_name, product_name, ffr_status, created_at,
       extra->>'risk_to_patient'  as "risk",
       extra->>'warranty_failure' as "warranty",
       extra->>'frequent_failure' as "frequent"
  from public.field_failure_reports
 where created_at >= :'win_from'::timestamptz
   and created_at <  :'win_to'::timestamptz
   and extra->>'raised_by_rule' = 'any_potential_effect=YES'
 order by created_at
 limit 50;

\echo
\echo '=== 4. THE DELETE — commented out. Read sections 1-3 first.'
-- ---------------------------------------------------------------------------
-- ONLY THE ROWS THE UPLOAD CREATED. The `created_at` test is what keeps this
-- off the overwritten ones, and it is not a nicety: without it this statement
-- deletes reviews that existed before the file and cannot be got back.
--
-- It rolls back as written. Change `rollback;` to `commit;` when the counts
-- above are the ones you mean.
-- ---------------------------------------------------------------------------
-- begin;
--
-- delete from public.call_reviews
--  where created_at >= :'win_from'::timestamptz
--    and created_at <  :'win_to'::timestamptz;
--
-- -- What that removed, before you decide to keep it.
-- select count(*) as "still in the window after the delete"
--   from public.call_reviews
--  where created_at >= :'win_from'::timestamptz
--    and created_at <  :'win_to'::timestamptz;
--
-- rollback;   -- <<< change to `commit;` to keep it

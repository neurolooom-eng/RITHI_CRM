-- ===========================================================================
-- A WRONG FILE WENT INTO THE DCCR REGISTER. WHAT NOW.
--
-- Asked, 2026-09-14: "I uploaded a Wrong file in DCCR -- How to delete it?"
--
-- PASTE THIS WHOLE FILE INTO THE SUPABASE SQL EDITOR AND RUN IT. It is
-- READ-ONLY: it reports, it changes nothing. The delete is at the bottom,
-- commented out, and is a separate step.
--
-- (The first version of this file used psql's \set and \echo. Those do not
-- exist in the SQL Editor, which is where every file in this folder is
-- actually run — it failed on line 44 with "syntax error at or near \".
-- Everything here is now plain SQL.)
--
-- READ THIS BEFORE DELETING ANYTHING. The obvious answer — delete the rows —
-- is right for SOME of them and destroys real work on the others, and there is
-- no history table on `call_reviews` to undo that from.
--
-- The DCCR upload is an UPSERT keyed on the UC Number. So one file did two
-- different things:
--
--   CREATED   a review for a call that had none. Nothing was lost; deleting
--             the row puts the register back exactly as it was.
--   OVERWROTE a review that already existed, replacing answers somebody had
--             recorded. DELETING ONE OF THESE DOES NOT UNDO THE UPLOAD — it
--             throws the review away as well, and the old answers are not
--             recoverable from anywhere.
--
-- For the second kind the fix is NOT a delete. It is to load the CORRECT file,
-- which overwrites those same rows back to what they should say.
--
-- AND A THIRD THING THE UPLOAD MAY HAVE DONE, which is the one nobody expects.
-- A review whose Risk to Patient / Warranty Failure / Frequent Failure answers
-- make "Any Potential Effect" YES RAISES A FIELD FAILURE REPORT, by a database
-- trigger (0167). A wrong file can therefore have created FFRs, and deleting
-- the reviews does NOT remove them. They are listed below. They are quality
-- records: cancel one on the Field Failure Register if it should not stand —
-- that keeps the record and marks it — rather than deleting it here.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- THE WINDOW IS SET IN ONE PLACE, on the next two lines. Bracket the upload.
-- Widen it if the report looks short; narrow it if it catches somebody else's
-- work. Times are +05:30. `updated_at` is stamped on every write by
-- `call_reviews_stamp`, so the window is tested against that.
-- ---------------------------------------------------------------------------
with w as (
  select timestamptz '2026-09-14 00:00:00+05:30' as win_from,
         timestamptz '2026-09-15 00:00:00+05:30' as win_to
),

-- 1. NEW REVIEWS THE UPLOAD CREATED. created_at INSIDE the window means the row
--    did not exist before it: nothing is lost by removing these.
created as (
  select r.ucn, r.call_number, r.created_at as at,
         concat_ws(' · ',
           'Risk: '      || coalesce(nullif(r.risk_to_patient, ''), '—'),
           'Warranty: '  || coalesce(nullif(r.warranty_failure, ''), '—'),
           'Frequent: '  || coalesce(nullif(r.frequent_failure, ''), '—'),
           'Effect: '    || coalesce(nullif(r.any_potential_effect, ''), '—')) as detail
    from public.call_reviews r, w
   where r.created_at >= w.win_from and r.created_at < w.win_to
),

-- 2. REVIEWS THE UPLOAD OVERWROTE. created_at BEFORE the window and updated_at
--    inside it: the review existed and the file wrote over it.
overwritten as (
  select r.ucn, r.call_number, r.updated_at as at,
         'existed since ' || to_char(r.created_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY')
           || ' · now reads review-2 by ' || coalesce(nullif(r.review2_by, ''), '(nobody)') as detail
    from public.call_reviews r, w
   where r.updated_at >= w.win_from and r.updated_at < w.win_to
     and r.created_at <  w.win_from
),

-- 3. FIELD FAILURE REPORTS THE UPLOAD RAISED, identified by the rule the
--    trigger records on the report itself.
ffrs as (
  select f.ucn, f.ffr_no as call_number, f.created_at as at,
         coalesce(f.customer_name, '') || ' · ' || coalesce(f.product_name, '')
           || ' · ' || coalesce(f.ffr_status, '') as detail
    from public.field_failure_reports f, w
   where f.created_at >= w.win_from and f.created_at < w.win_to
     and f.extra->>'raised_by_rule' = 'any_potential_effect=YES'
)

select * from (
  -- The counts first, so the three numbers are readable without scrolling.
  select 0 as sort, '0. SUMMARY' as section,
         'reviews CREATED by the upload' as what_to_do,
         (select count(*)::text from created) as ucn,
         '' as ref, 'safe to delete — section 1 lists them' as detail, null::timestamptz as at
  union all
  select 0, '0. SUMMARY', 'reviews OVERWRITTEN by the upload',
         (select count(*)::text from overwritten), '',
         'DO NOT DELETE — load the correct file instead', null
  union all
  select 0, '0. SUMMARY', 'Field Failure Reports it raised',
         (select count(*)::text from ffrs), '',
         'not removed by deleting reviews — cancel on the register if wrong', null

  union all
  select 1, '1. CREATED — safe to delete', 'delete', c.ucn, c.call_number, c.detail, c.at from created c
  union all
  select 2, '2. OVERWRITTEN — DO NOT DELETE', 'reload the correct file', o.ucn, o.call_number, o.detail, o.at from overwritten o
  union all
  select 3, '3. FFRs RAISED — cancel on the register if wrong', 'review, do not delete here', x.ucn, x.call_number, x.detail, x.at from ffrs x
) rows
order by sort, at nulls first, ucn;


-- ===========================================================================
-- THE OVERWRITTEN ONES, IN FULL — run this on its own.
--
-- Asked, 2026-09-14, of a report reading 28,120 created / 23 overwritten / 0
-- FFRs: "What are those 23 Entries?"
--
-- They are the reviews that EXISTED BEFORE the upload and were written over.
-- The 28,120 are safe to delete; these 23 are the ones where something was
-- lost, and this says what can still be known about each.
--
-- WHAT THEY SAID BEFORE IS NOT RECOVERABLE. `call_reviews` has no history
-- table, and the audit log records THAT a review was saved — the UCN, who, and
-- when — and never the answers. So nothing anywhere holds the old values.
--
-- WHAT THE AUDIT LOG DOES ANSWER is the question that decides what to do:
-- did a PERSON ever review this call in the app? A row with an audit entry is
-- human work that has been overwritten and has to be re-done or re-loaded. A
-- row with none was itself put there by an earlier upload, and re-loading the
-- correct file restores it with no one having to remember anything.
--
-- AND RE-LOADING ONLY FIXES THE ONES THE CORRECT FILE CONTAINS. If the good
-- file has no line for a UCN below, that review keeps the wrong answers until
-- somebody re-enters it. The last column says which.
-- ===========================================================================
-- with w as (
--   select timestamptz '2026-09-14 00:00:00+05:30' as win_from,
--          timestamptz '2026-09-15 00:00:00+05:30' as win_to
-- )
-- select r.ucn,
--        r.call_number,
--        to_char(r.created_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY') as "review existed since",
--        r.risk_to_patient      as "risk (now)",
--        r.warranty_failure     as "warranty (now)",
--        r.frequent_failure     as "frequent (now)",
--        r.complaint_grouping   as "grouping (now)",
--        r.root_cause_keyword   as "root cause (now)",
--        r.review2_by           as "review 2 by (now)",
--        r.review3_by           as "review 3 by (now)",
--        -- Did a PERSON review this in the app, ever? This is the column that
--        -- decides whether real work was lost.
--        coalesce(a.n, 0)       as "times saved by a person",
--        a.who                  as "last saved by",
--        to_char(a.last_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI') as "last saved at",
--        case when coalesce(a.n, 0) > 0
--             then 'HUMAN WORK OVERWRITTEN — re-load the correct file, or re-enter it'
--             else 'came from an earlier upload — re-loading the correct file restores it'
--        end as "what to do"
--   from public.call_reviews r
--   cross join w
--   left join lateral (
--     select count(*) as n,
--            max(l.at) as last_at,
--            (array_agg(l.actor order by l.at desc))[1] as who
--       from public.audit_log l
--      where l.target = r.ucn
--        and l.action in ('dccr.review', 'dccr.review.autosave', 'dccr.review.bulk')
--        -- BEFORE THIS ROW WAS OVERWRITTEN, not merely before the window.
--        -- The window is a day wide, so a person who reviewed the call at
--        -- 10am and an upload that ran at 3pm are both inside it — testing
--        -- against win_from would miss exactly the human work this column
--        -- exists to find. Caught by testing rather than by reading.
--        and l.at < r.updated_at
--   ) a on true
--  where r.updated_at >= w.win_from and r.updated_at < w.win_to
--    and r.created_at <  w.win_from
--  order by coalesce(a.n, 0) desc, r.ucn;


-- ===========================================================================
-- THE DELETE. Commented out on purpose. Read the report above first.
--
-- ONLY THE ROWS THE UPLOAD CREATED. The `created_at` test is what keeps this
-- off the overwritten ones, and it is not a nicety: tested against a simulated
-- bad upload, the version that matches on `updated_at` instead — which is what
-- the obvious reading gives you — deletes the pre-existing review as well.
--
-- USE THE SAME TWO DATES you set at the top. Run it on its own, once you are
-- satisfied section 1 is what you mean to remove.
-- ===========================================================================
-- begin;
--
-- delete from public.call_reviews
--  where created_at >= timestamptz '2026-09-14 00:00:00+05:30'
--    and created_at <  timestamptz '2026-09-15 00:00:00+05:30';
--
-- -- Check the number before you keep it, then change rollback to commit.
-- rollback;   -- <<< change to `commit;` to keep it

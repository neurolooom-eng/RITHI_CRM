-- ===========================================================================
-- CLEARING THE OLD FIELD FAILURE REPORTS, TO RE-UPLOAD THEM.
--
-- Asked, 2026-09-14: "Delete all Old FFRs also, Let me re-upload those after
-- Uploading DCCR."
--
-- READ THIS FIRST — three things are not obvious and one of them is a decision.
--
-- 1. A QUALITY RECORD IS NORMALLY NEVER DELETED. `block_hard_delete` (0049)
--    refuses a delete from the APPLICATION, and that stays true. It permits one
--    from the SQL editor, where you are the database owner rather than the
--    `authenticated` role, which is what makes this file possible at all. That
--    is a deliberate exception for "an approved archival procedure", so this is
--    an archival procedure: the records are being removed in order to be
--    RELOADED, not discarded.
--
-- 2. THE AMENDMENT HISTORY GOES WITH THEM. `ffr_history` is ON DELETE CASCADE,
--    so every recorded edit of a deleted report is deleted too. For reports
--    that arrived in a bad upload and are about to be replaced that is right —
--    the history is of the wrong data. Section A counts it so the number is
--    seen rather than discovered.
--
-- 3. ORDER MATTERS, and it is the reverse of the obvious one. Do the DCCR load
--    FIRST and the FFR load SECOND. The register reads its Root Cause and
--    Complaint Grouping LIVE from the Daily Call Review by UCN, so reports
--    loaded before their reviews read blank until the reviews arrive — and
--    then fill in on their own. Loading them after is simply less confusing.
--
-- HOW AN "OLD" REPORT IS IDENTIFIED. Two answers, and they do not always agree,
-- so section A prints both and you choose:
--
--    by UCN     the first two characters of the UCN are the year (0001), so
--               `not like '26%'` is everything before 2026. This is the same
--               test the DCCR clear-out uses, which is the point — the two
--               registers then hold the same span.
--    by DATE    `ffr_date` is when the report was raised. A report can carry a
--               2026 UCN and an older date, or no UCN at all.
--
-- A REPORT WITH NO UCN CANNOT BE JUDGED BY UCN. Section A counts those on their
-- own and section B leaves them alone, because "no UCN" is not "old" — deciding
-- otherwise would delete records this file cannot identify.
-- ===========================================================================

-- ---- A. WHAT WOULD GO. Run this on its own, first. ------------------------
select coalesce(nullif(left(r.ucn, 2), ''), '(no UCN)')        as "UCN year",
       to_char(r.ffr_date, 'YYYY')                             as "raised in",
       count(*)                                                as "reports",
       count(*) filter (where coalesce(r.imported_from, '') <> '')
                                                               as "migrated in",
       count(*) filter (where coalesce(r.imported_from, '') = '')
                                                               as "raised here",
       count(h.id)                                             as "amendments that go too"
  from public.field_failure_reports r
  left join public.ffr_history h on h.ffr_id = r.id
 group by 1, 2
 order by 1, 2;


-- ---- B. THE DELETE. Commented out on purpose. ------------------------------
-- It rolls back as written. Read section A, then change `rollback` to `commit`.
--
-- This deletes every report whose UCN is present and does NOT start with 26.
-- Reports with no UCN are left, deliberately (see the header).
--
-- begin;
--
-- delete from public.field_failure_reports
--  where coalesce(btrim(ucn), '') <> ''
--    and ucn not like '26%';
--
-- select count(*) as "reports left",
--        count(*) filter (where coalesce(btrim(ucn), '') <> '' and ucn not like '26%')
--          as "pre-2026 left",
--        count(*) filter (where coalesce(btrim(ucn), '') = '') as "with no UCN, untouched"
--   from public.field_failure_reports;
--
-- rollback;   -- <<< change to `commit;` to keep it


-- ---- C. AFTERWARDS, to confirm the register and the reviews agree ----------
-- Run this once both loads are done. A report whose UCN has no review reads
-- "(not stated)" on the Pareto — which is honest, and is what the dates in that
-- column were hiding.
-- select count(*)                                              as "reports",
--        count(*) filter (where v.ucn is null)                 as "with no review",
--        count(*) filter (where coalesce(btrim(v.root_cause_keyword), '') = '')
--                                                              as "review states no root cause"
--   from public.field_failure_reports r
--   left join public.call_reviews v on v.ucn = r.ucn;

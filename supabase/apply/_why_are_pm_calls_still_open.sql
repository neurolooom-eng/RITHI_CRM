-- ===========================================================================
-- WHY DOES THE APP SHOW MORE OPEN PM CALLS THAN THE SOURCE REGISTER?
--
--   Reported 2026-09-24: the PM register exports 1,632 open calls; the database
--   answers 3,706 (3,192 Unattended + 358 Unsolved + 156 Report pending).
--
-- THE TWO EXPORTS ARE NOT THE PROBLEM. Checked row by row: the pending list is
-- exactly the 1,632 `Open/Close = Open` rows of the 7,038-row register, with no
-- UCN in one and not the other; every Solved row carries a visit date and every
-- Unattended row carries none; there are no duplicate UCNs. Nine rows are junk
-- (blank UC Number, Call Status '#VALUE!') and cannot load at all, because UCN
-- is the upload's one required column.
--
-- SO THE DISAGREEMENT IS BETWEEN THE FILE AND WHAT WAS LOADED, and this file
-- settles which of two very different causes it is.
--
-- A CALL'S STATE IS DERIVED FROM ITS LATEST VISIT, NEVER FROM THE CALL ROW.
-- `call_open_state(last_status, last_visit_at)` (0226, 0032): no visit and
-- nothing said => 'Unattended'. So a PM call whose visit was never loaded reads
-- UNATTENDED however firmly the source register calls it closed -- and 1,722 of
-- them would account for the whole Unattended excess on their own.
--
-- AND THE RULE'S LAST BRANCH IS A CATCH-ALL: anything it does not recognise
-- returns 'Report pending'. A visit loaded with a blank Call Status, or with a
-- word outside cancelled/unsolved/report pending/solved, lands there. Row 5
-- lists those words, because they are the ones nobody has looked at.
--
-- READ-ONLY. Run the whole file; the last block needs no editing.
-- ===========================================================================

-- ---- 1. the shape of the PM register as the database holds it --------------
with base as (
  select c.ucn, c.reg_date, c.open_state, c.cancelled_at, c.reopened_at,
         c.last_status, c.last_visit_at,
         exists (select 1 from public.reports r where r.ucn = c.ucn) as has_visit
    from public.pm_calls c
)
select 1 as row, 'PM calls in the database' as measure, count(*)::text as value,
       'The source register exports 7,038 rows, 9 of which cannot load (blank UC Number). If this is MORE than 7,029 the database holds PM calls that export does not -- and those extra calls, having no visit, are Unattended and are part of the excess.' as what_it_means
  from base
union all
select 2, 'PM calls with NO visit row at all', count(*) filter (where not has_visit)::text,
       'THE HEADLINE NUMBER. The export says only 1,470 PM calls have never been visited. Every one beyond that is a call whose visit was not loaded, and it reads Unattended for that reason alone.'
  from base
union all
select 3, 'PM calls open right now', count(*) filter (where cancelled_at is null and (open_state <> 'Solved' or reopened_at is not null))::text,
       'The same rule the Pending Calls screen uses. Compare with the export''s 1,632.'
  from base
union all
select 4, 'PM calls the database calls Solved', count(*) filter (where open_state = 'Solved' and cancelled_at is null and reopened_at is null)::text,
       'The export says 5,397. The shortfall here is the same number as the excess in row 3 -- they are one fault seen from two sides, not two faults.'
  from base;

-- ---- 2. every distinct visit status behind a PM call, and what it becomes ---
-- A status the rule does not recognise silently becomes 'Report pending'. This
-- is the list of words actually in the data, so nothing has to be guessed at.
select visit_status_as_stored, becomes, count(*) as calls,
       case when becomes = 'Report pending' and lower(raw) not like '%report pending%'
            then 'FELL THROUGH THE CATCH-ALL -- not a word the rule knows' else '' end as note
  from (
    select coalesce(nullif(btrim(c.last_status), ''), '(blank)') as visit_status_as_stored,
           public.call_open_state(c.last_status, c.last_visit_at) as becomes,
           lower(coalesce(c.last_status, '')) as raw
      from public.pm_calls c
     where c.last_visit_at is not null or coalesce(c.last_status, '') <> ''
  ) x
 group by visit_status_as_stored, becomes, note
 order by calls desc;

-- ---- 3. the unvisited calls by registration month --------------------------
-- If the missing visits stop at a date, this shows it as a cliff. If they are
-- spread evenly the load did not stop -- it never carried those rows.
select to_char(date_trunc('month', c.reg_date), 'YYYY-MM') as reg_month,
       count(*) as pm_calls_with_no_visit
  from public.pm_calls c
 where not exists (select 1 from public.reports r where r.ucn = c.ucn)
 group by 1
 order by 1;

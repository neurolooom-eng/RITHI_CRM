-- ===========================================================================
-- WHERE DOES THE "REGISTERED BY" RECORD ACTUALLY START?  Read-only.
--
-- 0113 makes `created_by` unforgeable from here on, but the column is only as
-- good as the history behind it. A call registered in the app carries the
-- stamp; a call BULK-LOADED from the sheet era does not, because there was no
-- signed-in user to stamp. So "who registered this?" has an answer for some of
-- the register and not for the rest, and it matters which — the Hotline
-- engineer is the only role trained on the vigilance questions, and a gap is
-- not evidence that somebody else did it.
--
-- This says exactly where the line falls. It changes nothing.
--
-- Run it in the Supabase SQL editor. Every number is over ALL calls, not a page.
-- ===========================================================================

-- ---- 1. How much of each register is attributable at all --------------------
select '1. coverage'                                    as section,
       c.call_type,
       count(*)                                         as calls,
       count(c.created_by)                              as has_registrar,
       count(*) - count(c.created_by)                    as no_registrar,
       round(100.0 * count(c.created_by) / nullif(count(*), 0), 1) as pct_attributable
  from public.calls c
 group by c.call_type
 union all
select '1. coverage', 'ALL TYPES',
       count(*), count(c.created_by), count(*) - count(c.created_by),
       round(100.0 * count(c.created_by) / nullif(count(*), 0), 1)
  from public.calls c
 order by 1, 2;

-- ---- 2. WHEN the record starts ---------------------------------------------
-- The oldest and newest call with a registrar, and without one. If the two
-- ranges do not overlap, the line is a date and the answer is simple: before
-- it, nobody was recorded; after it, everybody was.
select '2. where the line falls' as section,
       case when created_by is null then 'no registrar' else 'has registrar' end as bucket,
       min(reg_date)             as oldest,
       max(reg_date)             as newest,
       count(*)                  as calls
  from public.calls
 group by 2
 order by 2;

-- ---- 3. WHO has been registering calls -------------------------------------
-- The point of the exercise. Anyone other than the Hotline engineer appearing
-- here registered a call, which means they answered the three vigilance
-- questions. Ordered by how many, so the exposure is at the top.
-- LEFT join, deliberately. An INNER join drops a call whose created_by points
-- at a profile that has since been removed — silently, and out of a count whose
-- entire purpose is to be complete. Such a call is named below rather than lost.
select '3. who registered them'      as section,
       case when c.created_by is null then '(not recorded)'
            else coalesce(p.full_name, '(stamped, but no profile: ' || c.created_by || ')') end as registered_by,
       coalesce(p.email, '')         as email,
       coalesce(p.role, '')          as role,
       count(*)                      as calls,
       min(c.reg_date)               as first_call,
       max(c.reg_date)               as latest_call
  from public.calls c
  left join public.profiles p on p.id = c.created_by
 group by 2, p.email, p.role
 order by count(*) desc;

-- ---- 4. The same, split by call type ----------------------------------------
-- A PM call registered in bulk is a different question from a Field call
-- registered by hand, so the split is worth seeing.
select '4. by type and person'       as section,
       c.call_type,
       case when c.created_by is null then '(not recorded)'
            else coalesce(p.full_name, '(stamped, but no profile)') end as registered_by,
       count(*)                      as calls
  from public.calls c
  left join public.profiles p on p.id = c.created_by
 group by c.call_type, 3
 order by c.call_type, count(*) desc;

-- ---- 5. This YEAR only, which is what a review will ask about ---------------
select '5. this year'                as section,
       case when c.created_by is null then '(not recorded - no registrar stamped)'
            else coalesce(p.full_name, '(stamped, but no profile)') end as registered_by,
       count(*)                      as calls
  from public.calls c
  left join public.profiles p on p.id = c.created_by
 where c.reg_date >= date_trunc('year', current_date)
 group by 2
 order by count(*) desc;

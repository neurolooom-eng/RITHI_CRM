-- ===========================================================================
-- WHO REGISTERED THESE CALLS?  Read-only.
--
-- Every call carries TWO names since 0114:
--
--   created_by         the Hotline DESK the call is filed to. It defaults to
--                      the Hotline engineer, because she is the only person
--                      trained on the three vigilance questions — so this is
--                      hers whoever typed the call in, and on its own it tells
--                      you nothing.
--   actual_created_by  the person who actually typed it in. THIS is the column
--                      the question is about.
--
-- The two DIFFERING is the finding: somebody untrained answered the three
-- questions. Section 4 is that list.
--
-- The columns are only as good as the history behind them. A call registered in
-- the app carries both; a call BULK-LOADED from the sheet era carries neither,
-- because there was no signed-in user to stamp. So "who registered this?" has
-- an answer for some of the register and not for the rest, and it matters
-- which — a gap is not evidence that somebody else did it. Sections 1 and 2 say
-- exactly where the line falls.
--
-- It changes nothing. Run it in the Supabase SQL editor. Every number is over
-- ALL calls, not a page.
-- ===========================================================================

-- ---- 1. How much of each register is attributable at all --------------------
select '1. coverage'                                      as section,
       c.call_type,
       count(*)                                           as calls,
       count(c.actual_created_by)                         as has_registrar,
       count(*) - count(c.actual_created_by)              as no_registrar,
       round(100.0 * count(c.actual_created_by) / nullif(count(*), 0), 1) as pct_attributable
  from public.calls c
 group by c.call_type
 union all
select '1. coverage', 'ALL TYPES',
       count(*), count(c.actual_created_by), count(*) - count(c.actual_created_by),
       round(100.0 * count(c.actual_created_by) / nullif(count(*), 0), 1)
  from public.calls c
 order by 1, 2;

-- ---- 2. WHEN the record starts ---------------------------------------------
-- The oldest and newest call with a registrar, and without one. If the two
-- ranges do not overlap, the line is a date and the answer is simple: before
-- it, nobody was recorded; after it, everybody was.
select '2. where the line falls' as section,
       case when actual_created_by is null then 'no registrar' else 'has registrar' end as bucket,
       min(reg_date)             as oldest,
       max(reg_date)             as newest,
       count(*)                  as calls
  from public.calls
 group by 2
 order by 2;

-- ---- 3. WHO has been registering calls -------------------------------------
-- The point of the exercise, ordered by how many so the exposure is at the top.
-- LEFT join, deliberately. An INNER join drops a call whose registrar's profile
-- has since been removed — silently, and out of a count whose entire purpose is
-- to be complete. Such a call is NAMED below rather than lost.
select '3. who registered them'      as section,
       case when c.actual_created_by is null then '(not recorded)'
            else coalesce(p.full_name, '(stamped, but no profile: ' || c.actual_created_by || ')') end as registered_by,
       coalesce(p.email, '')         as email,
       coalesce(p.role, '')          as role,
       count(*)                      as calls,
       min(c.reg_date)               as first_call,
       max(c.reg_date)               as latest_call
  from public.calls c
  left join public.profiles p on p.id = c.actual_created_by
 group by 2, p.email, p.role
 order by count(*) desc;

-- ---- 4. THE FINDING: the desk and the keyboard disagree ---------------------
-- A call filed to the Hotline desk that somebody else actually registered. That
-- person answered the three vigilance questions without the training, which is
-- the thing a review has to be able to see. An empty result is the good result.
select '4. registered by someone other than the desk' as section,
       coalesce(d.full_name, '(no profile)')          as desk,
       coalesce(a.full_name, '(no profile)')          as actually_registered_by,
       coalesce(a.email, '')                          as email,
       count(*)                                       as calls,
       min(c.reg_date)                                as first_call,
       max(c.reg_date)                                as latest_call
  from public.calls c
  left join public.profiles d on d.id = c.created_by
  left join public.profiles a on a.id = c.actual_created_by
 where c.created_by is not null
   and c.actual_created_by is not null
   and c.created_by <> c.actual_created_by
 group by 2, 3, 4
 order by count(*) desc;

-- ---- 5. The same, split by call type ----------------------------------------
-- A PM call registered in bulk is a different question from a Field call
-- registered by hand, so the split is worth seeing.
select '5. by type and person'       as section,
       c.call_type,
       case when c.actual_created_by is null then '(not recorded)'
            else coalesce(p.full_name, '(stamped, but no profile)') end as registered_by,
       count(*)                      as calls
  from public.calls c
  left join public.profiles p on p.id = c.actual_created_by
 group by c.call_type, 3
 order by c.call_type, count(*) desc;

-- ---- 6. This YEAR only, which is what a review will ask about ---------------
select '6. this year'                as section,
       case when c.actual_created_by is null then '(not recorded - no registrar stamped)'
            else coalesce(p.full_name, '(stamped, but no profile)') end as registered_by,
       count(*)                      as calls
  from public.calls c
  left join public.profiles p on p.id = c.actual_created_by
 where c.reg_date >= date_trunc('year', current_date)
 group by 2
 order by count(*) desc;

-- ---- 7. Which desk new calls will be filed to ------------------------------
-- Empty means no desk resolves — nobody has pinned one and there is not exactly
-- one hotline-role profile — so a new call is filed to whoever registers it.
select '7. the default desk' as section,
       coalesce((select p.full_name from public.profiles p where p.id = public.default_registrant()),
                '(none resolves)') as desk,
       coalesce((select value from public.app_settings where key = 'calls.default_registrant_email'), '(not pinned)') as pinned_setting;

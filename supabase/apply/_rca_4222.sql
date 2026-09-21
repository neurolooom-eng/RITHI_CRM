-- ===========================================================================
-- RE-OPENING THE 4,222: WHAT DOES THE EVIDENCE ACTUALLY SAY?
--
-- Read-only. Paste the whole file into the Supabase SQL editor. Row 1 first.
--
-- I told you the "Close call" button left 4,222 calls Solved with no visit,
-- and that the audit entries proving it had expired on a 7-day retention.
-- BOTH HALVES WERE WRONG:
--
--   retention is 3650 days, the log runs 31-Aug -> 21-Sep unpurged, and it
--   holds FOUR close events. Four does not make 4,222.
--
-- What is still established, because it was reproduced rather than reasoned:
-- running `call_requests.sql` re-executed 0032's bare statement and set every
-- call with no visit to Unattended. That is HOW they changed on 20-Sep. It
-- says nothing about how they came to be Solved with no visit in the first
-- place, which is the question this file asks again from the start.
--
-- IT ASKS THE CALLS AS WELL AS THE LOG, and that is the point. `calls_biu` is
-- a BEFORE INSERT trigger only, so nothing maintains `updated_at` on an
-- update: a call whose updated_at differs from its created_at was written by
-- something that set it ON PURPOSE. And 0032's statement does not set it. So
-- the dates on those rows are a fingerprint that survived the incident.
--
-- THE DATES IN THIS LOG CANNOT BE BACK-DATED. `audit_biu` (0009) is a BEFORE
-- INSERT trigger doing `new.at := now()`, so a caller-supplied time is
-- discarded -- the 0113/0114 rule again. Proved by inserting a row dated
-- 08-Sep and reading it back stamped today. So a date here is evidence, and an
-- action ABSENT from the log was never written rather than written wrongly.
--
-- Nothing here changes anything. No row is a conclusion; they are the numbers
-- a conclusion would have to fit.
-- ===========================================================================
with no_visit as (
  select c.ucn, c.open_state, c.last_status, c.created_at, c.updated_at, c.call_type
    from public.calls c
   where not exists (select 1 from public.reports r where r.ucn = c.ucn)
),
with_visit as (
  select c.ucn from public.calls c
   where exists (select 1 from public.reports r where r.ucn = c.ucn)
)
select * from (
  -- ---- A. what the log says happened -------------------------------------
  select 1 as n, 'A1 · The actions this log actually records (top 12)' as question,
         coalesce((select string_agg(action || ' ' || cnt, '   ·   ' order by cnt desc)
                     from (select action, count(*)::text as cnt from public.audit_log
                            group by action order by count(*) desc limit 12) a), 'empty') as answer,
         'The shape of what gets written. If a path you expect to see is missing entirely, it never logged -- which is the limit of a client-written trail.' as what_it_means
  union all
  select 2, 'A2 · The four close events, in full',
         coalesce((select string_agg(to_char(at, 'DD-Mon HH24:MI') || ' ' || coalesce(nullif(actor, ''), email) || ' -> ' || coalesce(nullif(target, ''), '(no target)'), '   ·   ' order by at)
                     from public.audit_log where action ilike '%close%'), 'none'),
         'Four calls, named. If these are the only closes ever recorded, the button is not what produced thousands.'
  union all
  select 3, 'A3 · Anything that looks like a bulk load, by day',
         coalesce((select string_agg(d || ' ' || cnt, '   ·   ' order by d)
                     from (select to_char(at, 'DD-Mon') as d, count(*)::text as cnt from public.audit_log
                            where action ~* '(upload|import|bulk|migrat)' group by 1 order by 1) b), 'none recorded'),
         'A load big enough to set thousands of statuses should appear here. Absence is not proof -- it is a question about what the loader logs.'
  union all
  select 4, 'A4 · Everything touching a call, by day (01-Sep on)',
         coalesce((select string_agg(d || ' ' || cnt, '   ·   ' order by d)
                     from (select to_char(at, 'DD-Mon') as d, count(*)::text as cnt from public.audit_log
                            where action ilike 'call%' and at >= date '2026-09-01' group by 1 order by 1) c2), 'none'),
         'The working rhythm of the register. A spike is worth a look; a flat line means nothing unusual was recorded.'
  -- ---- B. the calls with no visit ----------------------------------------
  union all
  select 5, 'B1 · Calls with NO visit at all',
         (select count(*)::text from no_visit),
         'The population in question. Every one of these reads Unattended today, after 20-Sep.'
  union all
  select 6, 'B2 · ...what they read now',
         coalesce((select string_agg(open_state || ' (' || cnt || ')', ', ' order by open_state)
                     from (select open_state, count(*)::text as cnt from no_visit group by open_state) d), 'none'),
         'All Unattended = 0032''s statement did its work. Anything else has been set since.'
  union all
  select 7, 'B3 · ...WHEN they were registered (by month)',
         coalesce((select string_agg(m || ' ' || cnt, '   ·   ' order by m)
                     from (select to_char(created_at, 'YYYY-Mon') as m, count(*)::text as cnt
                             from no_visit group by 1 order by 1) e), 'none'),
         'THE KEY ROW. If they cluster in one or two months, they arrived together -- a migration or a load -- rather than accumulating call by call over a year.'
  union all
  select 8, 'B4 · ...how many were WRITTEN AFTER they were registered',
         (select count(*) filter (where updated_at > created_at + interval '1 minute')::text from no_visit),
         'Nothing maintains updated_at automatically, and 0032''s statement does not set it. A high number means something wrote these rows deliberately; near zero means they have not been touched since they were created.'
  union all
  select 9, 'B5 · ...and when that writing happened (by month)',
         coalesce((select string_agg(m || ' ' || cnt, '   ·   ' order by m)
                     from (select to_char(updated_at, 'YYYY-Mon') as m, count(*)::text as cnt
                             from no_visit where updated_at > created_at + interval '1 minute'
                            group by 1 order by 1) f), 'none -- they were never written after creation'),
         'If this clusters on one date, that date is the event. Compare it with A3 and A4.'
  union all
  select 10, 'B6 · ...by call type',
         coalesce((select string_agg(coalesce(nullif(call_type, ''), '(blank)') || ' ' || cnt, '   ·   ' order by cnt desc)
                     from (select call_type, count(*)::text as cnt from no_visit group by call_type) g), 'none'),
         'A load is usually one register at a time. An even spread across all three is a different story from 4,000 PM calls.'
  -- ---- C. the contrast ----------------------------------------------------
  union all
  select 11, 'C1 · Calls that DO have a visit',
         (select count(*)::text from with_visit),
         'The healthy population, for scale.'
  union all
  select 12, 'C2 · Is a no-visit call simply a call nobody has been to yet?',
         (select count(*) filter (where created_at > now() - interval '30 days')::text from no_visit)
           || ' of ' || (select count(*)::text from no_visit) || ' were registered in the last 30 days',
         'THE INNOCENT EXPLANATION, and it has to be ruled out before any other is offered: a call registered and not yet attended has no visit and is CORRECTLY Unattended. If most of them are recent, most of them are simply open work.'
) rows order by n;

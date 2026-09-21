-- ===========================================================================
-- WHAT THE 4,222 ACTUALLY WERE.
--
-- Read-only. Paste into the Supabase SQL editor. Row 1 first.
--
-- I QUESTIONED THE PHENOMENON AND NEVER THE INSTRUMENT, AND THE INSTRUMENT IS
-- MINE. "4,222 Calls without report" came from `solved_without_report` (0224),
-- which I wrote. Its own `where` clause reports FOUR DIFFERENT GAPS:
--
--   l.ucn is null                         -- no visit at all
--   l.visit_at is null                    -- a visit with no date
--   l.sharing >= 25                       -- entry date is an import stamp
--   btrim(l.manual_report) = ''           -- NO SERVICE REPORT DOCUMENT
--
-- The fourth is almost certainly most of them: a call that IS solved, DOES
-- have a visit, and simply has no document attached. That is a missing
-- ATTACHMENT, not a missing visit -- and it is a completely different problem
-- from the one I spent two days explaining.
--
-- So my RCA answered "why are calls Solved with NO VISIT" (the first gap) as
-- if it explained all 4,222. It cannot, and the four close events in the audit
-- log were the system telling me so. The row that matters is row 2.
--
-- NOTE ON READING THIS TODAY: the register has changed since -- the bundle
-- re-run set the no-visit calls to Unattended, and the blank-status
-- de-duplication moved 3,448 visits. So the totals will not match 4,222. The
-- SHAPE is what this answers: which gap dominates.
-- ===========================================================================
select * from (
  select 1 as n, 'Rows the report shows now' as question,
         (select count(*)::text from public.solved_without_report) as answer,
         'Not 4,222 any more -- the register has moved since. The breakdown is the point.' as what_it_means
  union all
  select 2, 'WHICH GAP each one has',
         coalesce((select string_agg(m || '  =  ' || c, '   |   ' order by c::int desc)
                     from (select coalesce(nullif(missing, ''), '(none)') as m,
                                  count(*)::text as c
                             from public.solved_without_report group by 1) g), 'none'),
         'THE ANSWER. If "no service report" dominates, the 4,222 were mostly calls with a perfectly good visit and no DOCUMENT attached -- which the Close-call button cannot explain and never could.'
  union all
  select 3, '   ...how many have NO VISIT AT ALL',
         (select count(*)::text from public.solved_without_report where missing like 'no visit at all%'),
         'The only subset my RCA was ever about, and the only one the bundle re-run turned Unattended.'
  union all
  select 4, '   ...how many have a visit but NO DOCUMENT',
         (select count(*)::text from public.solved_without_report
           where missing like '%no service report%' and missing not like 'no visit at all%'),
         'A missing attachment. Bulk Report Mapping is what fills these -- not a status repair.'
  union all
  select 5, '   ...how many are flagged only by the import stamp',
         (select count(*)::text from public.solved_without_report
           where missing like '%import stamp%' and missing not like 'no visit at all%'
             and missing not like '%no service report%'),
         'The visit is there and dated, but 25+ visits share its entry stamp -- loaded in bulk, so the entry date says when it was imported, not when it was written.'
  union all
  select 6, 'Calls that are Solved with NO visit row (asked directly)',
         (select count(*)::text from public.calls c
           where coalesce(c.open_state, '') like 'Solved%'
             and not exists (select 1 from public.reports r where r.ucn = c.ucn)),
         'The same question as row 3, asked without going through my view -- so the view cannot be the reason the number is what it is.'
  union all
  select 7, '   ...and how many of those the audit log can explain',
         (select count(*)::text from public.audit_log where action ilike '%close%'),
         'close_call() is the only thing in the database that sets Solved without a visit. If row 6 is large and this is 4, the explanation is NOT the button and I should stop saying it is.'
) rows order by n;

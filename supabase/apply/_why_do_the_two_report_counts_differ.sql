-- ===========================================================================
-- WHY DOES `call_report` NOT COUNT THE SAME AS `reports`?
--
--   The user, 2026-09-24: "there are 2 reports - call_report and reports ;
--   the count is different in both."
--
-- THEY COUNT DIFFERENT THINGS, and both are right.
--
--   public.reports      ONE ROW PER VISIT. 0001 created it with `unique (ucn)`
--                       — one row per call — and 0002 DROPPED that constraint
--                       and keyed it on `uid` instead, precisely so a call
--                       visited three times keeps three records.
--   public.call_report  ONE ROW PER CALL, over `public.calls`, LEFT JOINed to
--                       the LATEST visit. 0191 says so in its own words: "NOT
--                       one row per visit. A call with four visits is one call,
--                       and a report that repeated it four times would have
--                       every count in it wrong."
--
-- So the two numbers differ in BOTH DIRECTIONS AT ONCE, and a single "is one
-- bigger?" reading of them tells you nothing:
--
--   +  a call with SEVERAL visits is 1 row in call_report and N in reports
--   +  a call with NO visit is 1 row in call_report and 0 in reports
--      (it is the everyday state: a call is Unattended until somebody goes)
--   +  a visit whose UCN matches NO call is 0 rows in call_report and 1 in
--      reports. `reports.ucn` is plain text with NO foreign key, so a typo'd
--      or pre-migration UCN sits there for ever and is in neither register.
--
-- AND A FOURTH REASON THAT IS NOT ARITHMETIC AT ALL: both are read under
-- row-level security, and they are NOT the same security. `call_report` is
-- security_invoker over `calls`, so it is bounded by the CALL policies
-- (has_perm('calls.view') AND the visibility rule); `reports` has its own
-- `reports_read`. The same person can therefore be shown a different number of
-- rows by each WITHOUT ANY ROW BEING MISSING. Row 8 below measures that
-- directly — what you see, beside what exists.
--
-- READ-ONLY. Nothing here writes. Run the whole file in the Supabase SQL
-- editor; the grid reconciles the two totals line by line, row 9 states
-- whether they add up, and rows 101 onwards name the orphan visits.
--
-- ONE STATEMENT, ONE GRID. The SQL editor shows only the LAST result, and this
-- file used to end in a second query listing the orphans -- so the
-- reconciliation the header points at was never on screen (finding 40).
-- ===========================================================================

with
calls_all     as (select ucn from public.calls),
rep           as (select ucn from public.reports),
rep_ucns      as (select distinct ucn from public.reports),
orphan_visits as (select r.ucn from public.reports r
                   where not exists (select 1 from public.calls c where c.ucn = r.ucn)),
-- CALLS visited more than once. An orphan UCN's repeat visits are NOT counted
-- here: they are already in orphan_visit_rows, and counting them twice made row
-- 9 read "DOES NOT RECONCILE" on data that reconciled (measured 2026-09-26).
multi         as (select r.ucn, count(*) as n from public.reports r
                   where exists (select 1 from public.calls c where c.ucn = r.ucn)
                   group by r.ucn having count(*) > 1),
n as (
  select
    (select count(*) from calls_all)                                   as calls,
    (select count(*) from rep)                                         as visits,
    (select count(*) from rep_ucns)                                    as visited_ucns,
    (select count(*) from orphan_visits)                               as orphan_visit_rows,
    (select count(distinct ucn) from orphan_visits)                    as orphan_ucns,
    (select coalesce(sum(n) - count(*), 0) from multi)                 as extra_visits,
    (select count(*) from multi)                                       as calls_with_many_visits,
    (select count(*) from public.calls c
      where not exists (select 1 from public.reports r where r.ucn = c.ucn)) as calls_with_no_visit
)
select * from (
  select 1 as row, 'call_report rows (= one per CALL)' as measure,
         calls::text as value,
         'public.call_report is `from public.calls` LEFT JOINed to the latest visit, so it is exactly the call count -- a LEFT join cannot add or drop a row.' as what_it_means
    from n
  union all
  select 2, 'reports rows (= one per VISIT)', visits::text,
         'public.reports has no `unique (ucn)`: 0002 dropped it and keyed the table on `uid`. Several visits to one call are several rows, by design.' from n
  union all
  select 3, 'distinct UCNs that have a visit', visited_ucns::text,
         'This is the number call_report would match if every visit belonged to a call. Compare it with row 1.' from n
  union all
  select 4, 'calls with NO visit yet', calls_with_no_visit::text,
         'In call_report they are a row with blank Last Visit columns; in reports they are nothing at all. This is the normal state of an open call and is NOT a gap.' from n
  union all
  select 5, 'calls visited more than once', calls_with_many_visits::text,
         'Each is ONE row in call_report and several in reports.' from n
  union all
  select 6, 'extra visit rows they account for', extra_visits::text,
         'Visits beyond the first, per call. reports is larger than call_report by this much, before the two corrections below.' from n
  union all
  select 7, 'ORPHAN visits -- a UCN with no call', orphan_visit_rows::text || ' row(s) across ' || orphan_ucns::text || ' UCN(s)',
         'THE ONLY LINE HERE THAT IS A FAULT IF IT IS NOT ZERO. reports.ucn carries no foreign key, so a mistyped or pre-migration UCN is a visit nobody can reach: it is in no call register, no call_report row, and no call status. Rows 101 onwards name them.' from n
  union all
  select 8, 'what YOU can see, right now', 
         (select count(*)::text from public.call_report) || ' call_report / '
         || (select count(*)::text from public.reports) || ' reports',
         'BOTH ARE UNDER RLS AND THE RULES ARE NOT THE SAME -- call_report is security_invoker over `calls` (has_perm(''calls.view'') AND the visibility rule); reports has its own reports_read. If these two are smaller than rows 1 and 2 you are reading as somebody scoped, and the difference is the scope rather than missing data.' from n
  union all
  select 9, 'the arithmetic',
         calls::text || ' calls - ' || calls_with_no_visit::text || ' unvisited + '
         || extra_visits::text || ' extra visits + ' || orphan_visit_rows::text || ' orphans = '
         || (calls - calls_with_no_visit + extra_visits + orphan_visit_rows)::text
         || ' (reports holds ' || visits::text || ')',
         case when calls - calls_with_no_visit + extra_visits + orphan_visit_rows = visits
              then 'RECONCILED -- the two counts differ for exactly the reasons above and nothing is missing.'
              else 'DOES NOT RECONCILE. Something else is going on; do not act on the numbers above until this line balances.' end
    from n
  union all
  -- THE ORPHANS BY NAME, up to 200, as rows 101 onwards. Nothing is deleted or
  -- repaired here: an unreachable visit is still a record, and 0049's rule is
  -- that a quality record is corrected rather than removed.
  select * from (
    select (100 + row_number() over (order by count(*) desc, r.ucn))::int,
           'orphan visit UCN ' || r.ucn,
           count(*)::text || ' visit row(s)',
           'first ' || coalesce(min(r.visit_at)::text, '(no date)')
           || ', last ' || coalesce(max(r.visit_at)::text, '(no date)')
           || ', engineer(s): ' || coalesce(string_agg(distinct nullif(btrim(r.engineer), ''), ', '), '(none)')
      from public.reports r
     where not exists (select 1 from public.calls c where c.ucn = r.ucn)
     group by r.ucn
     order by count(*) desc, r.ucn
     limit 200
  ) o
) g order by row;

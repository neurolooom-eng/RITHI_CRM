-- ===========================================================================
-- PM CALLS: THE CALL NUMBER STARTS WITH THE CALL DATE'S YEAR. ONE-TIME.
--
-- Ad-hoc, run by hand in the Supabase SQL editor. Nothing here is a migration.
--
-- The user, 2026-10-05: "As a 1 time activity, I want to update the Call
-- Number for PM Calls. If the Call Date is 2026, then Call Number should start
-- with 26, if the call date is 2025 then it should start with 25." Settled the
-- same day:
--   * "Call Date" is the CALL REGISTRATION DATE (pm_calls.reg_date) -- what the
--     Call Report and the Daily Call Review show under that heading;
--   * 2025 and 2026 calls ONLY -- a call dated in any other year is left as it
--     is (and still counted below, so nothing is silently skipped);
--   * the copies follow: where the call's VISIT REPORTS, SPARE REQUESTS, SPARE
--     CONSUMPTION, CUSTOMER FEEDBACK or DAILY CALL REVIEW row for the SAME UCN
--     carries the OLD number, it gets the new one. A row with a different UCN
--     is never touched, nor one carrying some other number.
--
-- ONLY THE FIRST TWO DIGITS CHANGE: 25PMJAN0012-A-ORION-G-2259 becomes
-- 26PMJAN0012-A-ORION-G-2259. A number that does not start with two digits is
-- LEFT ALONE and listed -- a rule cannot say what such a number should be.
--
-- READ-ONLY UNTIL YOU CHANGE ONE WORD. The `settings` line below reads
-- `values (false)`. Run the file as it stands and it writes NOTHING: the grid
-- says what WOULD change. Read it, then change `false` to `true` and run it
-- again. Run it a third time and it reports 0 to change -- it is safe to repeat.
--
-- ONE STATEMENT, so it is all or nothing, and one grid, because the SQL editor
-- shows only the last result: rows 1-9 are the summary, 101 onwards the detail.
-- spare_consumption_history is a LOG of what a line used to say and is left as
-- the record of it.
-- ===========================================================================

with

-- ------------------------------------------------------------------ the switch
-- false = report only (the default). true = write the call numbers.
settings(apply) as (values (false)),

pm as (
  select p.id, p.ucn, coalesce(p.call_number, '') as old_no, p.reg_date,
         extract(year from p.reg_date)::int as yr,
         to_char(p.reg_date, 'YY') as yy
    from public.pm_calls p
),
plan as (
  select pm.*,
         case
           when pm.reg_date is null                    then 'no_date'
           when pm.yr not in (2025, 2026)              then 'other_year'
           when pm.old_no !~ '^[0-9]{2}'               then 'odd_number'
           when left(pm.old_no, 2) = pm.yy             then 'right'
           else 'change'
         end as verdict,
         case when pm.reg_date is not null and pm.yr in (2025, 2026) and pm.old_no ~ '^[0-9]{2}'
              then pm.yy || substr(pm.old_no, 3) end as new_no
    from pm
),
changes as (
  select ucn, old_no, new_no from plan where verdict = 'change'
),

-- ----------------------------------------------------------------- the writes
-- Each runs only when the switch is true. The copies match on UCN AND on the
-- old number, so a row already carrying something else is left as it is.
w_pm as (
  update public.pm_calls p set call_number = c.new_no
    from changes c, settings s
   where s.apply and p.ucn = c.ucn and coalesce(p.call_number, '') = c.old_no
  returning p.id
),
w_reports as (
  update public.reports r set call_number = c.new_no
    from changes c, settings s
   where s.apply and r.ucn = c.ucn and r.call_number = c.old_no
  returning r.id
),
w_spare_requests as (
  update public.spare_requests r set call_number = c.new_no
    from changes c, settings s
   where s.apply and r.ucn = c.ucn and r.call_number = c.old_no
  returning r.id
),
w_consumption as (
  update public.spare_consumption r set call_number = c.new_no
    from changes c, settings s
   where s.apply and r.ucn = c.ucn and r.call_number = c.old_no
  returning r.id
),
w_feedback as (
  update public.feedback r set call_number = c.new_no
    from changes c, settings s
   where s.apply and r.ucn = c.ucn and r.call_number = c.old_no
  returning r.id
),
w_reviews as (
  update public.call_reviews r set call_number = c.new_no
    from changes c, settings s
   where s.apply and r.ucn = c.ucn and r.call_number = c.old_no
  returning r.ucn
),

-- ---------------------------------------------------------------- the report
summary(n, item, value) as (
  select 1, case when (select apply from settings) then 'MODE: APPLIED -- the call numbers below were written'
                 else 'MODE: REPORT ONLY -- nothing was written. Change false to true on the settings line to apply.' end, null::text
  union all select 2, 'PM calls dated 2025 / 2026 whose number changes',  (select count(*) from plan where verdict = 'change')::text
  union all select 3, 'PM calls dated 2025 / 2026 already right',         (select count(*) from plan where verdict = 'right')::text
  union all select 4, 'PM calls dated 2025 / 2026 left alone: the number does not start with two digits (listed below)',
                      (select count(*) from plan where verdict = 'odd_number')::text
  union all select 5, 'PM calls with no Call Registration Date (left alone)', (select count(*) from plan where verdict = 'no_date')::text
  union all select 6, 'PM calls dated in other years (out of scope, left alone)', (select count(*) from plan where verdict = 'other_year')::text
  union all select 7, 'Rows WRITTEN -- PM calls',        (select count(*) from w_pm)::text
  union all select 8, 'Rows WRITTEN -- copies: visit reports / spare requests / spare consumption / feedback / daily call review',
                      (select count(*) from w_reports)::text || ' / ' || (select count(*) from w_spare_requests)::text || ' / '
                      || (select count(*) from w_consumption)::text || ' / ' || (select count(*) from w_feedback)::text || ' / '
                      || (select count(*) from w_reviews)::text
  union all select 9, 'Copies that WOULD follow (same UCN, old number): visit reports / spare requests / spare consumption / feedback / daily call review',
                      (select count(*) from public.reports r join changes c on r.ucn = c.ucn and r.call_number = c.old_no)::text || ' / '
                      || (select count(*) from public.spare_requests r join changes c on r.ucn = c.ucn and r.call_number = c.old_no)::text || ' / '
                      || (select count(*) from public.spare_consumption r join changes c on r.ucn = c.ucn and r.call_number = c.old_no)::text || ' / '
                      || (select count(*) from public.feedback r join changes c on r.ucn = c.ucn and r.call_number = c.old_no)::text || ' / '
                      || (select count(*) from public.call_reviews r join changes c on r.ucn = c.ucn and r.call_number = c.old_no)::text
),
detail as (
  select 100 + row_number() over (order by p.verdict, p.reg_date, p.ucn) as n,
         case p.verdict when 'change' then 'CHANGE' else 'LEFT ALONE -- number does not start with two digits' end
           || ': ' || p.ucn || ' (registered ' || to_char(p.reg_date, 'DD-Mon-YYYY') || ')' as item,
         case p.verdict when 'change' then p.old_no || '  ->  ' || p.new_no else p.old_no end as value
    from plan p
   where p.verdict in ('change', 'odd_number')
)
select n as "#", item as "What", value as "Value"
  from (select * from summary union all select * from detail) x
 order by n;

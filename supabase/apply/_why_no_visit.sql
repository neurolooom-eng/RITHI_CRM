-- ===========================================================================
-- WHY ARE 4,222 CALLS SOLVED WITH NO VISIT? Read-only. One grid.
--
-- WHAT THE CODE ALREADY RULES OUT, so this only has to settle what is left:
--
--   NOT a bulk call import. The Field Calls / Installation / PM uploads carry
--   no CALL STATUS column at all (the "Item Status" they do carry is the
--   COVER -- WGP/AMC/CMC/OGP). An imported call arrives with last_status = ''
--   and reads Unattended. A load cannot have made these Solved.
--
--   NOT deleted visits. sync_call_last_visit (0032) resets last_status to ''
--   and last_visit_at to null when the last report for a UCN goes, so a call
--   whose visits were deleted reads Unattended, not Solved -- unless the
--   delete ran with triggers disabled, which section D tests for.
--
--   THE LEADING CANDIDATE IS THE "CLOSE CALL" BUTTON. 0109 added it on
--   2026-09-05: it set last_status = 'Solved' and deliberately wrote NO visit
--   row. The user removed it on 2026-09-15 -- "Remove the Close call option
--   doesn't make sense" -- and the note left in FieldCalls.tsx says exactly
--   what this report is now showing: "a call whose own history says nobody
--   ever went, indistinguishable afterwards from one that was actually
--   attended". Nothing in the application calls close_call() today.
--
--   SO THE QUESTION THIS ANSWERS IS: how many of them fall in that ten-day
--   window, and what accounts for the rest.
--
-- IT CANNOT BE ANSWERED BY A FLAG, and that is the user's own decision on
-- record (2026-09-05): "IT IS NOT RECORDED DIFFERENTLY. A call closed this way
-- is Solved, like any other closed call." So this dates and groups them
-- instead, which is the evidence that does exist.
-- ===========================================================================
with target as (
  select c.ucn, c.call_number, c.call_type, c.reg_date, c.created_at, c.open_state
    from public.calls c
    left join public.reports r on r.ucn = c.ucn
   where coalesce(c.open_state, '') like 'Solved%'
     and r.ucn is null
), report as (

  -- A. THE SIZE OF IT, and how much is the ten days the button existed.
  select 1 as ord, 'A. total solved with no visit' as clause,
         count(*)::text as finding from target
  union all
  select 2, 'A. registered 05-Sep-2026 to 15-Sep-2026 (the window Close call existed)',
         count(*)::text from target
   where reg_date >= date '2026-09-05' and reg_date <= date '2026-09-15'
  union all
  select 3, 'A. registered OUTSIDE that window — these need another explanation',
         count(*)::text from target
   where reg_date is null or reg_date < date '2026-09-05' or reg_date > date '2026-09-15'

  -- B. WHEN. A button pressed by hand spreads; a bulk operation spikes.
  union all
  select 4, 'B. registered ' || to_char(reg_date, 'YYYY-MM'),
         count(*)::text from target where reg_date is not null
   group by to_char(reg_date, 'YYYY-MM')
  union all
  select 5, 'B. the ROW was created ' || to_char(created_at, 'YYYY-MM-DD'),
         count(*)::text from target where created_at is not null
   group by to_char(created_at, 'YYYY-MM-DD')

  -- C. WHICH REGISTER. Installation and PM behave differently from field.
  union all
  select 6, 'C. call type ' || coalesce(nullif(btrim(call_type), ''), '(blank)'),
         count(*)::text from target group by coalesce(nullif(btrim(call_type), ''), '(blank)')
  union all
  select 7, 'C. status reads exactly ' || coalesce(open_state, '(null)'),
         count(*)::text from target group by open_state

  -- D. ARE THE VISITS THERE BUT NOT JOINING? The view matches on UCN exactly.
  --    A visit loaded under a UCN that differs by case or spacing exists and
  --    is invisible to its call, which looks identical to no visit at all.
  union all
  select 8, 'D. visits whose UCN matches NO call at all (orphans)',
         count(*)::text from public.reports r
   where not exists (select 1 from public.calls c where c.ucn = r.ucn)
  union all
  select 9, 'D. ...of those, how many WOULD match if case and spaces were ignored',
         count(*)::text from public.reports r
   where not exists (select 1 from public.calls c where c.ucn = r.ucn)
     and exists (select 1 from public.calls c
                  where lower(btrim(c.ucn)) = lower(btrim(r.ucn)))

  -- E. HAS ANYBODY LOOKED AT THEM? A reviewed call was in front of a person.
  union all
  select 10, 'E. of the no-visit calls, how many carry a DCCR review',
         count(*)::text from target t
   where exists (select 1 from public.call_reviews v where v.ucn = t.ucn)

  -- F. FOR SCALE. What the register looks like either side of this.
  union all
  select 11, 'F. calls reading Solved WITH a visit', count(*)::text
    from public.calls c
   where coalesce(c.open_state, '') like 'Solved%'
     and exists (select 1 from public.reports r where r.ucn = c.ucn)
  union all
  select 12, 'F. calls in the register altogether', count(*)::text from public.calls
)
select clause, finding from report order by ord, clause;

-- ===========================================================================
-- WHY DOES THIS CALL READ UNSOLVED?  -- read-only, run in the Supabase SQL editor.
--
-- The user, 2026-10-05: "26A01P0429 is closed -- 'Solved-Report Completed' --
-- but it is still Unsolved. Deep dive and figure out why."
--
-- HOW A CALL GETS ITS STATUS (sync_call_last_visit, 0057; call_open_state, 0226):
-- the call copies the status of the visit ENTERED LAST -- reports.updated_at,
-- the "Visit Entry Date" -- NOT the visit with the latest visit date. So one
-- Unsolved visit whose ENTRY is later than the Solved visit's entry keeps the
-- whole call Unsolved, however much later the Solved visit happened. Two ways
-- that happens:
--   * a visit loaded by BULK UPLOAD takes its entry time from the file's
--     "Visit Entry Date" column, which can be EARLIER than an Unsolved visit
--     already entered in the app;
--   * the visit a SPARE REQUEST files (0333, uid SPR-...) is stamped with the
--     moment the request was saved; a Solved report uploaded afterwards with an
--     older entry date ranks below it.
--
-- WHAT IT SHOWS, one grid (the editor shows only the last result):
--   1-3   the call: its stored status, the visit status it copied, the state
--         the registers show, re-opened / cancelled;
--   4     THE VERDICT -- which of the causes above it is;
--   5+    any status column the upload kept from the file (calls.extra);
--   101+  every visit, IN THE ORDER THE SYSTEM RANKS THEM (entry time, newest
--         first) -- the first is the one the call follows;
--   201+  spare requests on the call, with when each was saved;
--   301+  a visit filed under ANOTHER UCN that looks like this call's (same
--         UCN with stray spaces / case, or the same call number) -- invisible
--         to the call, so it cannot close it.
-- Rows 5+ also show the visit columns the call register kept: PM Reports
-- REQUIRES Visit Date & Time, and a row without one is held back on upload.
-- It writes nothing. Change the UCN on the `target` line to look at another call.
-- ===========================================================================

with
target(ucn) as (values ('26A01P0429')),          -- <-- the call to examine

call as (
  select c.ucn, c.call_type, coalesce(c.status, '') as status, coalesce(c.last_status, '') as last_status,
         c.open_state, c.last_visit_at, c.reopened_at, c.cancelled_at, coalesce(c.extra, '{}'::jsonb) as extra
    from public.calls c join target t on c.ucn = t.ucn
),
-- EVERY STATUS-LIKE COLUMN THE IMPORT KEPT (the PM / field upload files
-- unmatched columns into `extra`), so a "Solved-Report Completed" that lives
-- only in the file's own Status column shows up here.
extra_status as (
  select e.key, e.value
    from call, jsonb_each_text(call.extra) e
   where e.key ilike '%status%' or e.value ilike '%solved%' or e.key ilike '%state%'
      -- and what a VISIT REPORT needs: PM Reports refuses a row with no
      -- Visit Date & Time (it is required), so its presence here says whether
      -- the PM register's row could ever have become a visit.
      or e.key ilike '%visit%' or e.key ilike '%entry%' or e.key ilike '%engineer%'
),
-- A VISIT THAT EXISTS BUT IS NOT FOUND BY THE UCN: the same UCN with stray
-- spaces or a different case, or the call's number (old 25PM... or new
-- 26PM...) on a visit filed under another UCN. Either way the call cannot see it.
near_visits as (
  select r.id, coalesce(r.uid, '') as uid, r.ucn, coalesce(r.call_number, '') as call_number,
         coalesce(r.call_status, '') as call_status, r.visit_at, r.updated_at
    from public.reports r cross join target t
    left join public.pm_calls p on p.ucn = t.ucn
   where r.ucn <> t.ucn
     and (upper(btrim(r.ucn)) = upper(t.ucn)
          or (coalesce(r.call_number, '') <> '' and coalesce(p.call_number, '') <> ''
              and substr(r.call_number, 3) = substr(p.call_number, 3)))
),
visits as (
  select row_number() over (order by r.updated_at desc nulls last, r.id desc) as rank,
         r.id, coalesce(r.uid, '') as uid, coalesce(r.call_status, '') as call_status,
         coalesce(r.pending_reason, '') as pending_reason, r.visit_at, r.updated_at,
         case when r.uid like 'SPR-%' then 'filed by a spare request'
              when r.uid like 'WEB-%' then 'entered in the app'
              when r.uid like 'IMP-%' then 'bulk upload'
              else 'other / older import' end as source
    from public.reports r join target t on r.ucn = t.ucn
),
latest as (select * from visits where rank = 1),
best_solved as (
  select * from visits where lower(call_status) like 'solved%'
   order by visit_at desc nulls last, updated_at desc nulls last limit 1
),
verdict(text) as (
  select case
    when not exists (select 1 from call) then
      'NO CALL with this UCN in field, installation or PM calls -- check the UCN.'
    when exists (select 1 from call where cancelled_at is not null) then
      'The call is CANCELLED (cancelled_at is set) -- that overrides any visit.'
    when exists (select 1 from call where reopened_at is not null) then
      'The call was RE-OPENED after it was solved (reopened_at is set) -- it stays open until a new visit is entered.'
    when not exists (select 1 from visits) and exists (select 1 from near_visits) then
      'The visit EXISTS but is filed under a DIFFERENT UCN (rows 301+), so this call cannot see it. Correct the UCN on that visit (or in the file) to '
      || (select ucn from target) || ' and load it again.'
    when not exists (select 1 from visits) then
      'There is NO VISIT REPORT on this call in RITHI, so it can never read Solved -- RITHI closes a call only from a visit that says Solved. '
      || 'The state shown (' || coalesce((select open_state from call), '?') || ') comes from the call row itself: last_status "'
      || (select last_status from call) || '", last visit at ' || coalesce((select to_char(last_visit_at, 'DD-Mon-YYYY') from call), 'none')
      || '. If the "Solved-Report Completed" is in AppSheet or in the file (rows 5+), the visit report was never loaded: load it with Bulk Uploads -> PM Reports, matched on the UCN.'
    when not exists (select 1 from best_solved) then
      'No visit on this call says Solved. Every visit is Unsolved / pending -- the Solved report was never filed against this UCN (look for it under a different UCN).'
    when (select lower(call_status) from latest) like 'solved%'
         and (select open_state from call) <> 'Solved' then
      'The latest visit IS Solved, but the call''s copy of it is stale (last_status differs). The sync did not run for this call -- re-saving any visit, or the fix offered with this answer, puts it right.'
    when (select lower(call_status) from latest) not like 'solved%' then
      'CAUSE: an UNSOLVED visit was ENTERED AFTER the Solved one. The call follows the visit with the latest ENTRY time, not the latest visit date. '
      || 'Latest entry: ' || (select uid || ' (' || source || '), ' || call_status || ', entered ' || coalesce(to_char(updated_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI'), '?') from latest)
      || '. The Solved visit: ' || (select uid || ' (' || source || '), visit ' || coalesce(to_char(visit_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY'), '?')
                                     || ', entered ' || coalesce(to_char(updated_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI'), '?') from best_solved) || '.'
    else
      'The call follows its latest-entered visit, which is Solved, and reads Solved. If a screen still shows Unsolved, refresh it; if it persists, send this grid.'
  end
),
rows(n, what, value) as (
  select 1, 'Call', (select ucn || ' · ' || call_type || ' · state shown on the registers: ' || coalesce(open_state, '?') from call)
  union all select 2, 'Copied from its latest-entered visit (last_status) / the call''s own status field',
    (select '"' || last_status || '" / "' || status || '"' from call)
  union all select 3, 'Re-opened at / cancelled at',
    (select coalesce(to_char(reopened_at, 'DD-Mon-YYYY HH24:MI'), '—') || ' / ' || coalesce(to_char(cancelled_at, 'DD-Mon-YYYY HH24:MI'), '—') from call)
  union all select 4, 'VERDICT', (select text from verdict)
  union all
  select 4 + row_number() over (order by key), 'In the PM register''s row: ' || key, value from extra_status
  union all
  select 100 + rank,
         case when rank = 1 then 'VISIT #1 (THE CALL FOLLOWS THIS ONE)' else 'Visit #' || rank end,
         uid || ' · ' || source || ' · ' || call_status
           || case when pending_reason <> '' then ' (' || pending_reason || ')' else '' end
           || ' · visit ' || coalesce(to_char(visit_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY'), '—')
           || ' · entered ' || coalesce(to_char(updated_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI'), '—')
    from visits
  union all
  select 200 + row_number() over (order by s.created_at),
         'Spare request',
         coalesce(nullif(s.or_no, ''), s.uid) || ' · saved ' || to_char(s.created_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI')
           || ' · ' || coalesce(s.engineer, '')
    from public.spare_requests s join target t on s.ucn = t.ucn
  union all
  select 300 + row_number() over (order by visit_at),
         'VISIT FILED UNDER ANOTHER UCN (the call cannot see it)',
         uid || ' · UCN "' || ucn || '" · call no ' || call_number || ' · ' || call_status
           || ' · visit ' || coalesce(to_char(visit_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY'), '—')
    from near_visits
)
select n as "#", what as "What", value as "Value" from rows order by n;

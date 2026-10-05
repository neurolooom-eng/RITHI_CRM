-- ===========================================================================
-- DUPLICATE VISITS LEFT BY THE SHARED-UID LOADS. ONE-TIME.
--
-- Ad-hoc, run by hand in the Supabase SQL editor. Nothing here is a migration.
--
-- The user, 2026-10-05: "make the uploader handle shared UIDs automatically.
-- And clean up old records as well."
--
-- WHAT HAPPENED. AppSheet's bulk call closure gives every call it closed ONE
-- visit UID. Loaded under that UID, the visits collapsed: one call per UID kept
-- the visit (stored under the plain UID) and the others were dropped. The file
-- was then fixed by hand to `UID|UCN` and loaded again, so the call that had
-- kept the visit now has it TWICE -- once as `UID`, once as `UID|UCN`. The
-- uploader now does the `UID|UCN` split itself, so this happens once.
--
-- WHAT IT REMOVES -- only an exact repeat of a visit the call still has:
--   A  a visit under a plain UID whose `UID|UCN` twin exists on the SAME call;
--   B  a visit loaded with no UID of its own (IMP-..., e.g. a one-row test
--      file) that repeats an AppSheet visit of the same call.
-- In both, the copy goes only when the visit date AND the call status match the
-- one kept, and nothing (an indoor job) points at it. Anything else is LISTED
-- and LEFT for a person to judge.
--
-- WHY A DELETE IS ALLOWED HERE. Visit records are retained: the app cannot
-- delete one (block_hard_delete refuses the signed-in role). This is the
-- controlled deletion that guard permits from the SQL editor, of rows that are
-- copies of a visit that stays, and every row removed is copied whole into the
-- audit trail (record_audit_d). Each removal re-syncs its call's status
-- (reports_touch_call), which cannot change, since the kept visit says the same.
--
-- READ-ONLY UNTIL YOU CHANGE ONE WORD. The `settings` line reads
-- `values (false)`: run as it stands it writes NOTHING and the grid says what
-- WOULD go. Then change `false` to `true` and run it again. A third run reports
-- 0 -- it is safe to repeat.
--
-- ONE STATEMENT, so all or nothing, and one grid: rows 1-7 the summary,
-- 101 onwards the copies removed (or to be removed), 5001 onwards the ones LEFT.
-- ===========================================================================

with

-- ------------------------------------------------------------------ the switch
-- false = report only (the default). true = remove the copies.
settings(apply) as (values (false)),

-- A: the plain-UID copy and its `UID|UCN` twin on the same call.
pair_a as (
  select r.id as dup_id, r.uid as dup_uid, r.ucn, k.uid as kept_uid,
         r.visit_at as dup_visit, k.visit_at as kept_visit,
         coalesce(r.call_status, '') as dup_status, coalesce(k.call_status, '') as kept_status,
         'A shared UID' as kind
    from public.reports r
    join public.reports k on k.ucn = r.ucn and k.uid = r.uid || '|' || r.ucn
   where position('|' in coalesce(r.uid, '')) = 0
),
-- B: a visit with a derived id (no UID in its file) repeating an AppSheet one.
pair_b as (
  select distinct on (r.id)
         r.id as dup_id, r.uid as dup_uid, r.ucn, k.uid as kept_uid,
         r.visit_at as dup_visit, k.visit_at as kept_visit,
         coalesce(r.call_status, '') as dup_status, coalesce(k.call_status, '') as kept_status,
         'B no UID in its file' as kind
    from public.reports r
    join public.reports k on k.ucn = r.ucn and k.id <> r.id
                         and k.visit_at = r.visit_at
                         and coalesce(k.call_status, '') = coalesce(r.call_status, '')
                         and coalesce(k.uid, '') !~ '^(IMP|WEB|SPR|REC)-'
   where coalesce(r.uid, '') like 'IMP-%'
   order by r.id, k.uid
),
pairs as (
  select p.*,
         (p.dup_visit is not distinct from p.kept_visit and p.dup_status = p.kept_status
          and not exists (select 1 from public.indoor_jobs j where j.visit_uid = p.dup_uid)) as safe
    from (select * from pair_a union all select * from pair_b) p
),

-- ----------------------------------------------------------------- the write
w_removed as (
  delete from public.reports r
   using pairs p, settings s
   where s.apply and p.safe and r.id = p.dup_id
  returning r.id
),

-- ---------------------------------------------------------------- the report
summary(n, item, value) as (
  select 1, case when (select apply from settings) then 'MODE: APPLIED -- the copies below were removed'
                 else 'MODE: REPORT ONLY -- nothing was removed. Change false to true on the settings line to apply.' end, null::text
  union all select 2, 'A -- visits under a shared UID that also exist as UID|UCN on the same call', (select count(*) from pairs where kind like 'A%')::text
  union all select 3, 'B -- visits loaded with no UID that repeat an AppSheet visit of the same call', (select count(*) from pairs where kind like 'B%')::text
  union all select 4, 'Of those, exact copies (same visit date and status, nothing pointing at them) -- these go', (select count(*) from pairs where safe)::text
  union all select 5, 'Of those, NOT exact copies -- LEFT, listed from row 5001', (select count(*) from pairs where not safe)::text
  union all select 6, 'Rows REMOVED by this run', (select count(*) from w_removed)::text
  union all select 7, 'Calls these visits belong to', (select count(distinct ucn) from pairs)::text
),
detail as (
  select (case when safe then 100 else 5000 end) + row_number() over (partition by safe order by ucn, dup_uid) as n,
         case when safe then 'REMOVE' else 'LEFT -- differs from the visit kept' end
           || ' (' || kind || '): ' || ucn as item,
         dup_uid || ' (' || coalesce(to_char(dup_visit at time zone 'Asia/Kolkata', 'DD-Mon-YYYY'), '--') || ', ' || dup_status
           || (case when safe then ')  is a copy of  ' else ')  differs from  ' end) || kept_uid || ' (' || coalesce(to_char(kept_visit at time zone 'Asia/Kolkata', 'DD-Mon-YYYY'), '--')
           || ', ' || kept_status || ')' as value
    from pairs
)
select n as "#", item as "What", value as "Value"
  from (select * from summary union all select * from detail) x
 order by n;

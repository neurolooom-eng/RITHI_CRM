-- ===========================================================================
-- WHERE DID THAT REPORT FILE ACTUALLY GO?
--
-- Read-only. Paste the whole file into the Supabase SQL editor. Read row 1
-- first, every time.
--
-- The user, 2026-09-21: "i uploaded the data, but still the status is not
-- changing". The mechanism was proved on a database built from every
-- migration -- one of these rows takes a call from Unattended to Solved -- so
-- the fault is upstream, and there is one way to get here that LOOKS like a
-- clean load:
--
--   THE SAME FILE IS ACCEPTED IN FULL BY TWO DIFFERENT REGISTERS.
--
--   Bulk Uploads -> Visit Reports -> Field Reports  writes 144 VISITS.
--   Bulk Uploads -> Calls         -> Field Calls    writes 144 CALLS,
--   with nothing held back, reporting "144 rows", and sweeping Call Status and
--   Visit Date into `extra`, where nothing reads them. Measured, not reasoned:
--   both registers shaped this exact file with 0 rows skipped.
--
--   And for the 52 rows that are NOT field calls it is not merely useless. A
--   PM call's UCN does not collide with anything in `field_calls`, so it is
--   INSERTED -- the UCN now exists twice, once typed FIELD and once PM.
--
-- Nothing here changes anything.
-- ===========================================================================
with mine as (
  select r.uid, r.ucn, r.call_status, r.visit_at, r.updated_at, r.id
    from public.reports r where r.uid like 'IMP-%'
),
matched as (
  select m.*, c.ucn as call_ucn, c.open_state
    from mine m left join public.calls c on c.ucn = m.ucn
),
latest as (
  select distinct on (r.ucn) r.ucn, r.uid, r.call_status
    from public.reports r where r.ucn in (select ucn from mine)
   order by r.ucn, r.updated_at desc nulls last, r.id desc
),
-- The fingerprint of this file landing in a CALL register: `extra` carrying a
-- heading only the visit-report file has. Nothing else writes it.
stray as (
  select 'field_calls' as tbl, ucn from public.field_calls        where extra->>'Row ID' like 'IMP-%'
  union all
  select 'installation_calls', ucn from public.installation_calls where extra->>'Row ID' like 'IMP-%'
  union all
  select 'pm_calls',           ucn from public.pm_calls           where extra->>'Row ID' like 'IMP-%'
),
dupes as (   -- a UCN that now exists in more than one call table
  select ucn from public.calls group by ucn having count(*) > 1
)
select * from (
  select 1 as n, 'PART 1 -- did the file go to Visit Reports?' as question,
         (select count(*) from mine)::text as answer,
         'Visits written (uid like IMP-%). 144 means it went to the right register. 0 means it did not.' as what_it_means
  union all
  select 2, 'PART 1 -- or did it go to a CALL register?',
         (select count(*) from stray)::text,
         'Call rows carrying this file''s "Row ID" in `extra`. Anything above 0 is the wrong register, and row 6 says what to do.'
  union all
  select 3, 'ᅟ ...of the visits, how many found their call',
         (select count(*) filter (where call_ucn is not null) from matched)::text,
         'A gap means a visit is filed against a UCN no call carries -- stored, attached to nothing, no status can change.'
  union all
  select 4, 'ᅟ ...and how many of those calls now read Solved',
         (select count(*) filter (where open_state = 'Solved') from matched where call_ucn is not null)::text,
         'This is the number you were after.'
  union all
  select 5, 'ᅟ ...the rest read',
         coalesce((select string_agg(open_state || ' (' || cnt || ')', ', ') from
           (select open_state, count(*)::text as cnt from matched
             where call_ucn is not null and open_state <> 'Solved' group by open_state) x), 'none'),
         'Report pending = a visit with a BLANK status; it is not neutral. Unattended = no visit attached.'
  union all
  select 6, 'PART 2 -- UCNs now duplicated across the call tables',
         (select count(*) from dupes)::text,
         'Each one is a real call plus a copy this load inserted. The register shows it twice. Row 7 lists them.'
  union all
  select 7, 'ᅟ ...which are (first 10)',
         coalesce((select string_agg(ucn, ', ') from (select ucn from dupes order by ucn limit 10) y),
                  'none -- nothing was duplicated'),
         'Cross-check one in the Field Call Register before running any repair.'
  union all
  select 8, 'ᅟ ...and the copies are safe to remove because',
         (select count(*) from stray s join dupes d on d.ucn = s.ucn
           where not exists (select 1 from public.reports r where r.ucn = s.ucn and r.uid not like 'IMP-%')
             and not exists (select 1 from public.spare_consumption sc where sc.ucn = s.ucn))::text,
         'Of the duplicates, how many carry NO visit of their own and NO spare -- i.e. nothing but what this load put there. The repair only touches these.'
  union all
  select 9, 'Is the trigger that syncs a call from its visits present?',
         case when exists (select 1 from pg_trigger where tgrelid = 'public.reports'::regclass
                            and tgname = 'reports_touch_call' and not tgisinternal)
              then 'YES' else 'NO -- run call_requests.sql' end,
         'If this says NO nothing else in this file matters: a visit is stored and the call is never told.'
  union all
  select 10, 'Blank statuses among the visits written',
         (select count(*) filter (where coalesce(btrim(call_status), '') = '') from mine)::text,
         'Should be 0. "Solved - Report Completed" is fine -- it reads as Solved.'
  union all
  select 11, 'REPAIR A -- re-run the load into the RIGHT register',
         'Bulk Uploads -> Visit Reports -> Field Reports (NOT Calls -> Field Calls)',
         'Do this first. It is an upsert on Row ID, so running it again corrects rather than duplicates.'
  union all
  select 12, 'REPAIR B -- recompute the statuses (safe, idempotent)',
         'select public.sync_call_last_visit(ucn) from (select distinct ucn from public.reports where uid like ''IMP-%'') u;',
         'Reads the visit history and writes nothing new, so it cannot invent a status.'
  union all
  select 13, 'REPAIR C -- remove only the duplicate calls this load inserted',
         'delete from public.field_calls f where f.extra->>''Row ID'' like ''IMP-%'' and exists (select 1 from public.calls c where c.ucn = f.ucn and c.id <> f.id) and not exists (select 1 from public.reports r where r.ucn = f.ucn and r.uid not like ''IMP-%'') and not exists (select 1 from public.spare_consumption sc where sc.ucn = f.ucn);',
         'ONLY where the UCN exists in another call table as well, and the copy carries no visit of its own and no spare. A genuine Field call that this file merely UPDATED is not duplicated, so it is not touched. Run row 7 first and look at one.'
) rows order by n;

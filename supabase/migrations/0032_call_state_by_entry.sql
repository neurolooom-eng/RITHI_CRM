-- ===========================================================================
-- Call status: Unattended until a visit is entered, then the status of the
-- LATEST VISIT ENTRY — latest by when the visit was ENTERED, not by the visit
-- date the engineer typed.
--
-- Two fixes:
--
-- 1) `sync_call_last_visit` picked the latest visit by `visit_at` (the Visit
--    Date field). A visit entered today for a call visited last week then lost
--    to an older entry with a later visit date. The entry timestamp is
--    `reports.updated_at` (set when the row is written), so order by that and
--    fall back to `id` — which also orders the sheet-era rows, whose
--    updated_at is their import time. `last_visit_at` still carries the visit
--    DATE; only the choice of row changes.
--
-- 2) `open_state` tested `like 'solved%'` first, so the "Solved - Report
--    Pending" status introduced with the report field spec read as Solved and
--    dropped the call off Pending Calls. Unsolved and report-pending are now
--    tested before solved.
-- ===========================================================================

-- The views read open_state, and it is recreated below.
drop view if exists public.pending_calls;
drop view if exists public.call_state;

do $calls_guard$ begin
-- 0040_call_tables_split.sql replaces public.calls with a VIEW over the three
-- typed call tables. What follows is table-only work, so on a project that has
-- already been split it has to be SKIPPED, not attempted — otherwise replaying
-- this file (which re-running any bundle does) dies with
--   ERROR 42809: cannot create index on relation "calls"
-- or "calls is not a table". On an unsplit project it runs exactly as before.
if (select c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'calls') = 'r' then
execute $calls_sql$
alter table public.calls drop column if exists open_state;
alter table public.calls add column open_state text
  generated always as (
    case
      when last_visit_at is null and coalesce(last_status, '') = ''   then 'Unattended'
      when lower(coalesce(last_status, '')) like '%unsolved%'         then 'Unsolved'
      when lower(coalesce(last_status, '')) like '%report pending%'   then 'Report pending'
      when lower(coalesce(last_status, '')) like 'solved%'            then 'Solved'
      else 'Report pending'
    end
  ) stored;

create index if not exists calls_open_idx on public.calls (open_state) where open_state <> 'Solved';
$calls_sql$;
end if;
end $calls_guard$;

-- ---- latest = latest ENTRY -------------------------------------------------
create or replace function public.sync_call_last_visit(p_ucn text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.calls c
     set last_status   = coalesce(r.call_status, ''),
         last_visit_at = r.visit_at
    from (
      select call_status, visit_at
        from public.reports
       where ucn = p_ucn
       order by updated_at desc nulls last, id desc
       limit 1
    ) r
   where c.ucn = p_ucn;

  if not found then  -- no visits left (or none matched): back to Unattended
    update public.calls set last_status = '', last_visit_at = null where ucn = p_ucn;
  end if;
end $$;

-- ---- re-backfill on the new rule ------------------------------------------
update public.calls c
   set last_status   = coalesce(r.call_status, ''),
       last_visit_at = r.visit_at
  from (
    select distinct on (ucn) ucn, call_status, visit_at
      from public.reports
     order by ucn, updated_at desc nulls last, id desc
  ) r
 where r.ucn = c.ucn
   and (c.last_status is distinct from coalesce(r.call_status, '')
     or c.last_visit_at is distinct from r.visit_at);

-- A call whose reports have all gone is Unattended again.
update public.calls c
   set last_status = '', last_visit_at = null
 where (coalesce(c.last_status, '') <> '' or c.last_visit_at is not null)
   and not exists (select 1 from public.reports r where r.ucn = c.ucn);

-- ---- views -----------------------------------------------------------------
create view public.call_state as
  select ucn, last_status, last_visit_at, open_state as state from public.calls;

create view public.pending_calls as
  select * from public.calls where open_state <> 'Solved';

alter view public.call_state    set (security_invoker = on);
alter view public.pending_calls set (security_invoker = on);

grant select on public.call_state    to authenticated;
grant select on public.pending_calls to authenticated;

-- ===========================================================================
-- Call state, without re-deriving it on every read.
--
-- Deriving a call's state from its latest visit in a view is correct, but
-- reading it means scanning `reports` through that table's RLS — a correlated
-- subquery plus can_see_call() per report row. Measured on 11k calls / 17k
-- reports: ~37ms without RLS, >5s with it ("canceling statement due to
-- statement timeout").
--
-- The latest visit is now kept ON the call, maintained by a trigger on
-- `reports`. Reads touch `calls` only — the register already loads it, so the
-- state comes along for free, and Pending Calls is an indexed filter.
-- ===========================================================================

-- An earlier build of these views read the columns below, and one is recreated
-- with a different shape, so any existing pair goes first.
drop view if exists public.pending_calls;
drop view if exists public.call_state;

alter table public.calls
  add column if not exists last_status   text default '',
  add column if not exists last_visit_at timestamptz;

-- Derived, so it can never drift from the two columns above.
alter table public.calls drop column if exists open_state;
alter table public.calls add column open_state text
  generated always as (
    case
      when last_visit_at is null and coalesce(last_status, '') = '' then 'Unattended'
      when lower(coalesce(last_status, '')) like 'solved%'          then 'Solved'
      when lower(coalesce(last_status, '')) like '%unsolved%'       then 'Unsolved'
      else 'Report pending'
    end
  ) stored;

create index if not exists calls_open_idx on public.calls (open_state) where open_state <> 'Solved';

-- ---- keep it current -------------------------------------------------------
-- security definer: a visit by one engineer updates the call regardless of who
-- may write `calls`.
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
       order by visit_at desc nulls last, id desc
       limit 1
    ) r
   where c.ucn = p_ucn;

  if not found then  -- no visits left (or none matched): back to Unattended
    update public.calls set last_status = '', last_visit_at = null where ucn = p_ucn;
  end if;
end $$;

create or replace function public.reports_touch_call()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_call_last_visit(coalesce(new.ucn, old.ucn));
  if tg_op = 'UPDATE' and new.ucn is distinct from old.ucn then
    perform public.sync_call_last_visit(old.ucn);
  end if;
  return null;
end $$;

drop trigger if exists reports_touch_call on public.reports;
create trigger reports_touch_call after insert or update or delete on public.reports
  for each row execute function public.reports_touch_call();

-- ---- backfill --------------------------------------------------------------
update public.calls c
   set last_status   = coalesce(r.call_status, ''),
       last_visit_at = r.visit_at
  from (
    select distinct on (ucn) ucn, call_status, visit_at
      from public.reports
     order by ucn, visit_at desc nulls last, id desc
  ) r
 where r.ucn = c.ucn
   and (c.last_status is distinct from coalesce(r.call_status, '')
     or c.last_visit_at is distinct from r.visit_at);

-- ---- views, now trivial ----------------------------------------------------
-- `calls` already carries `state` (the geographic one), so the call's open
-- state stays `open_state` here too.
create view public.call_state as
  select ucn, last_status, last_visit_at, open_state as state from public.calls;

create view public.pending_calls as
  select * from public.calls where open_state <> 'Solved';

alter view public.call_state    set (security_invoker = on);
alter view public.pending_calls set (security_invoker = on);

grant select on public.call_state    to authenticated;
grant select on public.pending_calls to authenticated;

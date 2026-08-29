-- ===========================================================================
-- Call state = whether a call is still open, derived from its LATEST visit:
--   Unattended     — no visit reported yet
--   Unsolved       — last visit came back unsolved
--   Report pending — visit made, report not completed
--   Solved         — last visit closed it
-- `pending_calls` is every call that is not Solved (the Pending Calls module).
-- Both views run with the caller's rights, so calls/reports RLS still applies.
-- ===========================================================================

create or replace view public.call_state as
select
  c.ucn,
  coalesce(r.call_status, '')                        as last_status,
  r.visit_at                                         as last_visit_at,
  case
    when r.ucn is null                    then 'Unattended'
    when r.call_status ilike 'solved%'     then 'Solved'
    when r.call_status ilike '%unsolved%'  then 'Unsolved'
    else 'Report pending'
  end                                                as state
from public.calls c
left join lateral (
  select rr.ucn, rr.call_status, rr.visit_at
  from public.reports rr
  where rr.ucn = c.ucn
  order by rr.visit_at desc nulls last, rr.id desc
  limit 1
) r on true;

-- NB: `calls` already has a `state` column (the geographic one), so the call's
-- open state is exposed here as `open_state`.
--
-- Skipped once 0014_call_state_denorm.sql has run: that migration denormalises
-- open_state onto `calls` itself and rebuilds this view against it. After that,
-- `c.*` here already carries open_state and aliasing s.state to the same name
-- collides ("column open_state ... already exists"), which broke re-running
-- this file. 0014's definition supersedes this one, so skipping is a no-op.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'calls'
                and column_name = 'open_state') then
    return;
  end if;

  create or replace view public.pending_calls as
  select c.*, s.state as open_state, s.last_status, s.last_visit_at
  from public.calls c
  join public.call_state s on s.ucn = c.ucn
  where s.state <> 'Solved';

  execute 'alter view public.pending_calls set (security_invoker = on)';
  execute 'grant select on public.pending_calls to authenticated';
end $$;

alter view public.call_state set (security_invoker = on);

grant select on public.call_state    to authenticated;
grant select on public.pending_calls to authenticated;

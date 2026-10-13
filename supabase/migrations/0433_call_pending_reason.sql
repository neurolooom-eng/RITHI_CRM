-- ===========================================================================
-- 0433 -- THE CALL PENDING REASON ON EVERY OPEN CALL (the user, 2026-10-13:
-- "i want the Call pending Reason and Cancellation Reason in Field,
-- Installation, PM Calls").
--
-- Settled with the user the same day: the reason is the one on the LATEST
-- VISIT ENTRY -- the same entry the call's status comes from
-- (sync_call_last_visit(): updated_at desc, id desc) -- and it is shown ONLY
-- WHILE THE CALL IS OPEN. A Solved call is pending nothing, and a Cancelled
-- one is not waiting for anybody, so both read blank rather than carrying the
-- reason a visit gave before it was closed. Open is pending_calls' own rule:
-- not cancelled, and not Solved unless re-opened.
--
-- The Cancellation Reason needs nothing here: cancel_reason has been on all
-- three call tables since 0108 and comes with the call.
--
-- APPENDED to call_dates (0424), not a view of its own: the registers already
-- read that view for the calls on screen, so this is one column more on the
-- same request. `create or replace view` may only add columns at the END, and
-- it DROPS security_invoker, which is re-asserted below.
-- ===========================================================================

create or replace view public.call_dates as
select c.ucn,
       least(v.first_visit_on, public.call_first_spare_on(c.ucn)) as first_attended_on,
       v.last_visit_on,
       s.solved_on,
       case when c.cancelled_at is null
             and (coalesce(c.open_state, '') <> 'Solved' or c.reopened_at is not null)
            then nullif(btrim(p.pending_reason), '')
       end as pending_reason
  from public.calls c
  left join lateral (
    select min((r.visit_at at time zone 'Asia/Kolkata')::date) as first_visit_on,
           max((r.visit_at at time zone 'Asia/Kolkata')::date) as last_visit_on
      from public.reports r
     where r.ucn = c.ucn and r.visit_at is not null
  ) v on true
  left join lateral (
    select (rs.visit_at at time zone 'Asia/Kolkata')::date as solved_on
      from public.reports rs
     where rs.ucn = c.ucn and rs.call_status ilike 'solved%report%complet%'
     order by rs.updated_at desc nulls last, rs.id desc
     limit 1
  ) s on true
  left join lateral (
    select rp.pending_reason
      from public.reports rp
     where rp.ucn = c.ucn
     order by rp.updated_at desc nulls last, rp.id desc
     limit 1
  ) p on true;

alter view public.call_dates set (security_invoker = on);
grant select on public.call_dates to authenticated;

comment on view public.call_dates is
  'Per call: First Attended (earlier of first visit and first spare request), Last Visit and Solved (visit date of the standing Solved - Report Completed entry), all India dates (0424); and the Call Pending Reason of the latest visit entry while the call is open (0433). security_invoker: one row per call the reader may see.';

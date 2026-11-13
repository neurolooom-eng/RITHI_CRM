-- ===========================================================================
-- 0479 -- CALL DATES CARRY THE LATEST VISIT'S ENGINEER, FOR THE REGION (the
-- user, 2026-11-13: "Add Region to all Call Registers, Spare Registers,
-- Handstock and their Exports. Ideally to all Tables which has Engineer Name
-- should have Region Column").
--
-- Asked, the user chose: the region is the engineer's CURRENT one, read from
-- the User Master when it is shown (never stored); on a call it is the
-- Visiting Service Engineer's -- the engineer of the latest visit entry --
-- else Call Allocated To's ("Use this as Order / Priority").
--
-- The call registers already read call_dates for every call on screen (0424,
-- 0433). One column is APPENDED: `visit_engineer`, the engineer of the same
-- latest entry the Call Pending Reason comes from (updated_at desc, id desc --
-- the latest thing the register was told, 0032), blank where the call has no
-- visit. 0433's view otherwise word for word; 0424 drops the view first, so a
-- replay of performance.sql does not stop on the appended column.
-- ===========================================================================

create or replace view public.call_dates as
select c.ucn,
       least(v.first_visit_on, public.call_first_spare_on(c.ucn)) as first_attended_on,
       v.last_visit_on,
       s.solved_on,
       case when c.cancelled_at is null
             and (coalesce(c.open_state, '') <> 'Solved' or c.reopened_at is not null)
            then nullif(btrim(p.pending_reason), '')
       end as pending_reason,
       -- appended (0479): the engineer of the latest visit entry.
       nullif(btrim(coalesce(p.engineer, '')), '') as visit_engineer
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
    select rp.pending_reason, rp.engineer
      from public.reports rp
     where rp.ucn = c.ucn
     order by rp.updated_at desc nulls last, rp.id desc
     limit 1
  ) p on true;

alter view public.call_dates set (security_invoker = on);
grant select on public.call_dates to authenticated;

comment on view public.call_dates is
  'Per call: First Attended (earlier of first visit and first spare request), Last Visit and Solved (visit date of the standing Solved - Report Completed entry), all India dates (0424); the Call Pending Reason of the latest visit entry while the call is open (0433); and the engineer of that latest entry, for the Region (0479). security_invoker: one row per call the reader may see.';

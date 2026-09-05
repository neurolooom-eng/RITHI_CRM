-- ===========================================================================
-- THE DAILY CALL REVIEW CAN FILTER BY CALL STATUS.
--
-- The review register's existing status filter is the REVIEW status — Review 1
-- / 2 / 3 Pending, Review Completed. That is a fact about the paperwork. The
-- other question the desk asks of the same list is a fact about the MACHINE:
-- is the call still open, was it solved, was it cancelled.
--
-- The full view (`field_call_review`) already carries `open_state`. The SUMMARY
-- view does not — and the summary is what the stage counters are read from, so
-- a filter the rows honoured and the counts did not would make the register
-- disagree with its own header. It carries `open_state` and `cancelled_at` now.
--
-- APPENDED, not inserted. `create or replace view` can only add columns at the
-- END; putting one in the middle fails with "cannot change name of view
-- column". Both go last, and the view is REPLACED rather than dropped so
-- nothing built on it has to be rebuilt.
--
-- THE FILTER USES `open_state` ONLY, for now. `field_call_review` — the full
-- view the rows come from — carries open_state but NOT cancelled_at, and it is
-- a large view with three lateral joins; appending a column to it is a change
-- worth making on its own rather than as a rider here. So the register can be
-- filtered to Unattended / Unsolved / Report pending / Solved, and a cancelled
-- call still shows under whichever of those its visits last said.
-- `cancelled_at` is carried here so that filter can be added without another
-- migration to this view.
--
-- `security_invoker` is re-asserted because `create or replace view` DROPS it,
-- and a view without it reads as its OWNER — which is how every signed-in user
-- could once read every call. This one reads `field_calls`, so it matters.
-- ===========================================================================

create or replace view public.field_call_review_summary as
select
  c.id,
  c.ucn,
  c.reg_date,
  c.product_name,
  c.allocated_to,
  c.party_name,
  c.serial,
  coalesce(r.any_potential_effect, '') as any_potential_effect,
  case
    when not (btrim(coalesce(c.public_health_threat, '')) <> ''
              and btrim(coalesce(c.death, '')) <> ''
              and btrim(coalesce(c.serious_incident, '')) <> '') then 'Review 1 Pending'
    when not coalesce(r.review2_done, false) then 'Review 2 Pending'
    when not coalesce(r.review3_done, false) then 'Review 3 Pending'
    else 'Review Completed'
  end as review_status,
  -- Appended (see the header). The call's own state, so the register can be
  -- asked "which of these are still open?" and have the counters agree.
  c.open_state,
  c.cancelled_at
from public.field_calls c
left join public.call_reviews r on r.ucn = c.ucn;

alter view public.field_call_review_summary set (security_invoker = on);
grant select on public.field_call_review_summary to authenticated;

-- ===========================================================================
-- 0353 — THE REVIEW SUMMARY CARRIES THE COLUMNS THE REGISTER SEARCHES
--        (second re-review, 2026-10-03: D-130)
--
-- The Daily Complaint Review Register's search (applyReviewFilter) ORs over
-- ten columns, and countCallReviews applies the same filter to this view to
-- count the register, its tabs and the Export. Five of the ten were not here
-- -- call_number, standard_complaint, complaint_reported, complaint_grouping,
-- root_cause_keyword -- so ANY search failed the count with "column
-- call_number does not exist": the title and menu read 0 beside the rows, the
-- tab badges vanished and Export read "Export 0 calls", disabled.
--
-- 0111's definition VERBATIM, with the five APPENDED (create or replace can
-- only add columns at the end), taken from where field_call_review takes
-- them: the call's own three, and the review's two with the same coalesce.
-- security_invoker re-asserted -- create or replace drops it -- and the grant
-- kept. Same module (daily_review), after 0111.
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
  c.open_state,
  c.cancelled_at,
  -- Appended (D-130): the columns the register's search names.
  c.call_number,
  c.standard_complaint,
  c.complaint_reported,
  coalesce(r.complaint_grouping, '') as complaint_grouping,
  coalesce(r.root_cause_keyword, '') as root_cause_keyword
from public.field_calls c
left join public.call_reviews r on r.ucn = c.ucn;

alter view public.field_call_review_summary set (security_invoker = on);
grant select on public.field_call_review_summary to authenticated;

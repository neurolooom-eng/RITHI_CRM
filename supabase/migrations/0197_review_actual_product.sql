-- ===========================================================================
-- 0197 — THE REVIEW MAY CORRECT WHICH PRODUCT FAILED.
--
-- The user, 2026-09-14: "In DCCR - I need to be able to change the Product --
-- Meaning, Accessory Issues are also Logged in the Main Product - Like CPX Care
-- Failure is logged in Extend-XT or Orion-G ... During Review I used to have a
-- Concept of 'CHANGE PRODUCT?' as part of Review 2, When i can select the
-- Actual Product [Accessory in this case] and the Failure is included in the
-- Accessory and Excluded from the Main Product."
--
-- WHY THIS IS A REVIEW FIELD AND NOT A CORRECTION TO THE CALL. The call says
-- what the customer reported: a machine is down, and the machine is the
-- EXTEND-XT. That is true and stays true — the engineer went to that machine,
-- the visit is against it, the spares were issued for it. What the REVIEW
-- establishes afterwards is what actually failed, and on an accessory-carrying
-- product those are different facts. Overwriting the call would destroy the
-- first to record the second.
--
-- So it lives beside the other things Review 2 determines — the complaint
-- grouping, the root cause — and is read the same way: `field_failure_register`
-- already exposes `live_*` columns taken from the review rather than from the
-- report, precisely so a judgement corrected later reads corrected everywhere.
-- This adds one more.
--
-- AND IT IS ONE VALUE, WHICH IS WHAT MAKES THE ARITHMETIC RIGHT. The ask has two
-- halves — included in the accessory AND excluded from the main product — and a
-- single effective product satisfies both by construction: the report is
-- counted once, under whatever that value is. Two columns, or a flag beside the
-- original, would let a count include it twice or neither, and a Pareto that
-- double-counts is worse than one that is merely wrong.
--
-- THE ORIGINAL IS NEVER LOST. `field_failure_reports.product_name` is
-- untouched; the view exposes both, so "what was reported" and "what actually
-- failed" are both answerable and the DIFFERENCE is visible — which is the
-- finding a reliability engineer wants, not a detail to hide.
-- ===========================================================================

alter table public.call_reviews
  add column if not exists actual_product text not null default '';

comment on column public.call_reviews.actual_product is
  'Set in Review 2 where the thing that failed is not the product the call names — an accessory logged against the machine it is fitted to. Empty means the call was right. The call is never rewritten: this is what the review determined, and field_failure_register.live_product_name is the one the counts use.';

-- ---------------------------------------------------------------------------
-- THE REGISTER EXPOSES THE EFFECTIVE PRODUCT.
--
-- APPENDED, NOT INSERTED. `create or replace view` can only ADD columns at the
-- end — putting one in the middle fails with "cannot change name of view
-- column" — so `live_product_name` goes last even though it belongs beside
-- `product_name` in a reader's mind.
--
-- RE-ASSERTING security_invoker IS NOT OPTIONAL. `create or replace view` DROPS
-- it, and a view without it reads as its OWNER, so row-level security stops
-- applying to whoever is reading with no error and no warning. This project
-- shipped that fault three times. The line is at the bottom of this file and
-- `npm run check:views` refuses the migration without it.
-- ---------------------------------------------------------------------------
-- DROPPED FIRST for the same reason 0167 is: this module is replayed as a unit
-- and as single files, and a `create or replace` that only widens works in one
-- direction. Dropping makes the statement true whatever shape the view is in
-- when it runs — which is the property a bundle needs.
drop view if exists public.field_failure_register;
create view public.field_failure_register as
select
  f.*,
  -- THESE THREE ARE NOT DECORATION AND WERE THE REASON THE FIRST VERSION OF
  -- THIS FILE FAILED. It was written from 0179, which is not the last word on
  -- this view — 0167 and a later change added `live_call_status`,
  -- `live_last_visit_at` and `live_engineer` BEFORE the customer name, and
  -- omitting them made the replacement narrower than the view it replaced:
  -- `cannot drop columns from view`. The definition here is the one taken from
  -- a database built by the migrations, not the one read out of a file.
  c.open_state                      as live_call_status,
  c.last_visit_at                   as live_last_visit_at,
  c.allocated_to                    as live_engineer,
  c.party_name                      as live_customer_name,
  c.item_status                     as live_cover,
  (select count(*) from public.reports rp where rp.ucn = f.ucn)            as live_visit_count,
  (select coalesce(string_agg(distinct btrim(s.part), ', '), '')
     from public.spare_consumption s
    where s.ucn = f.ucn and coalesce(s.qty, 0) > 0)                        as live_spares_consumed,
  r.any_potential_effect            as live_any_potential_effect,
  r.risk_to_patient                 as live_risk_to_patient,
  r.warranty_failure                as live_warranty_failure,
  r.frequent_failure                as live_frequent_failure,
  r.complaint_grouping              as live_complaint_grouping,
  r.root_cause_keyword              as live_root_cause_keyword,
  r.spare_category                  as live_spare_category,
  r.review2_at                      as live_review2_at,
  r.review3_done                    as live_review3_done,
  -- WHAT ACTUALLY FAILED. The review's answer where it gave one, the report's
  -- otherwise. Every count, rate and Pareto reads THIS, so a failure moved onto
  -- an accessory is counted there and nowhere else.
  coalesce(nullif(btrim(r.actual_product), ''), f.product_name)            as live_product_name,
  -- ...and whether it was moved, so a screen can say so rather than leaving two
  -- product names to be noticed. A reader seeing CPX CARE on a report that
  -- names EXTEND-XT deserves to be told which is which.
  (coalesce(nullif(btrim(r.actual_product), ''), f.product_name)
     is distinct from f.product_name)                                      as live_product_changed
from public.field_failure_reports f
left join public.calls c        on c.ucn = f.ucn
left join public.call_reviews r on r.ucn = f.ucn;

alter view public.field_failure_register set (security_invoker = on);
grant select on public.field_failure_register to authenticated;

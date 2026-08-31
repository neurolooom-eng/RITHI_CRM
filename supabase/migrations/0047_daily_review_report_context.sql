-- ===========================================================================
-- 0047 — What the reviewer needs from the REPORT, on the review row.
--
-- Reviewing a call means judging what the engineer actually found and did, so
-- the register carries the report alongside the three stages:
--
--   VISIT DETAILS      every visit, newest first, as "date : what was done" —
--                      the register's VISIT REMARKS column.
--   CALL STATUS        the latest visit's own status, and the call's open state.
--   SPARES CONSUMED    every spare booked against the call.
--   AGE OF THE PRODUCT how old the machine was when it failed — the days from
--                      warranty start to the complaint, and the register's
--                      banding of it ("With in 1 yr" … "More than 5 yrs").
--   SOFTWARE VERSION   as recorded on the latest visit.
--
-- All of it is DERIVED — nothing new is stored, and nothing has to be kept in
-- step by hand. `field_call_review` is rebuilt (dropped and created, not
-- replaced: replacing cannot reorder or drop a view's columns).
--
-- Idempotent.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The register's own banding of a product's age at failure. Whole years
--    from warranty start, capped at 5 — the buckets the DCCR has always used.
-- ---------------------------------------------------------------------------
create or replace function public.failure_age_group(p_days integer)
returns text language sql immutable set search_path = public as $$
  select case
    when p_days is null or p_days < 0 then ''
    when p_days <  365 then 'With in 1 yr'
    when p_days <  730 then 'More than 1 yr'
    when p_days < 1095 then 'More than 2 yrs'
    when p_days < 1460 then 'More than 3 yrs'
    when p_days < 1825 then 'More than 4 yrs'
    else                    'More than 5 yrs'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The lookups the view makes per call, one index each.
--
--    The register is read NEWEST FIRST and a page at a time, so this index is
--    what keeps it cheap: without it the whole register is sorted before the
--    page is cut, and the per-call lookups below run for every row rather than
--    for the 500 being shown. (Measured on 25k calls / 50k visits: a page goes
--    from 13.7 s to 0.25 s.)
--    reports already has (ucn); the latest visit is picked by ENTRY —
--    updated_at desc, id desc — the same rule as sync_call_last_visit()
--    (0032_call_state_by_entry.sql), so this index serves that order directly.
-- ---------------------------------------------------------------------------
create index if not exists field_calls_reg_date_idx
  on public.field_calls (reg_date desc nulls last, id desc);
create index if not exists reports_ucn_entry_idx
  on public.reports (ucn, updated_at desc, id desc);
create index if not exists spare_consumption_ucn_idx
  on public.spare_consumption (ucn);
create index if not exists spare_consumption_call_number_idx
  on public.spare_consumption (call_number);

-- ---------------------------------------------------------------------------
-- 3. The register, with the report on the row.
-- ---------------------------------------------------------------------------
drop view if exists public.field_call_review;
create view public.field_call_review as
select
  c.id,
  c.ucn,
  c.call_number,
  c.reg_date,
  c.complaint_date,
  c.party_name,
  c.city,
  c.state,
  c.product_name,
  c.serial,
  c.item_status,
  c.call_type,
  c.standard_complaint,
  c.complaint_reported,
  c.allocated_to,
  c.allocated_to_email,
  c.warranty_number,
  c.warranty_start,
  c.status,
  c.open_state,
  c.last_status,
  c.last_visit_at,

  -- ---- age of the product at failure -------------------------------------
  -- Warranty start to the complaint (the call's registration date when there
  -- is no complaint date). Null when the machine has no warranty start on it.
  age.age_days,
  public.failure_age_group(age.age_days) as age_group,

  -- ---- from the report ----------------------------------------------------
  coalesce(h.visit_details, '')  as visit_details,   -- every visit, newest first
  coalesce(h.visit_count, 0)     as visit_count,
  coalesce(v.sw_version, '')     as sw_version,
  coalesce(v.observation, '')    as observation,     -- latest visit's finding
  coalesce(v.job_done, '')       as job_done,
  coalesce(v.pending_reason, '') as pending_reason,
  coalesce(v.visit_engineer, '') as visit_engineer,
  coalesce(sp.spares_consumed, '') as spares_consumed,
  coalesce(sp.spares_count, 0)     as spares_count,

  -- ---- Review 1 — from the call itself ------------------------------------
  c.public_health_threat,
  c.death,
  c.serious_incident,
  c.reg_date as review1_at,
  (btrim(coalesce(c.public_health_threat, '')) <> ''
   and btrim(coalesce(c.death, '')) <> ''
   and btrim(coalesce(c.serious_incident, '')) <> '') as review1_done,
  -- ---- Review 2 -----------------------------------------------------------
  coalesce(r.risk_to_patient, '')     as risk_to_patient,
  coalesce(r.warranty_failure, '')    as warranty_failure,
  coalesce(r.frequent_failure, '')    as frequent_failure,
  r.review2_at,
  coalesce(r.review2_by, '')          as review2_by,
  coalesce(r.review2_done, false)     as review2_done,
  -- ---- Review 3 -----------------------------------------------------------
  coalesce(r.complaint_grouping, '')  as complaint_grouping,
  coalesce(r.root_cause_keyword, '')  as root_cause_keyword,
  coalesce(r.spare_category, '')      as spare_category,
  coalesce(r.service_observation, '') as service_observation,
  r.review3_at,
  coalesce(r.review3_by, '')          as review3_by,
  coalesce(r.review3_done, false)     as review3_done,
  -- ---- Derived ------------------------------------------------------------
  coalesce(r.any_potential_effect, '') as any_potential_effect,
  coalesce(r.action_taken, '')         as action_taken,
  case
    when not (btrim(coalesce(c.public_health_threat, '')) <> ''
              and btrim(coalesce(c.death, '')) <> ''
              and btrim(coalesce(c.serious_incident, '')) <> '') then 'Review 1 Pending'
    when not coalesce(r.review2_done, false) then 'Review 2 Pending'
    when not coalesce(r.review3_done, false) then 'Review 3 Pending'
    else 'Review Completed'
  end as review_status
from public.field_calls c
left join public.call_reviews r on r.ucn = c.ucn

-- Age at failure.
left join lateral (
  select (coalesce(c.complaint_date, c.reg_date) - c.warranty_start)::int as age_days
) age on true

-- The LATEST visit, by entry (updated_at desc, id desc) — the same visit the
-- call's status comes from.
left join lateral (
  select nullif(btrim(coalesce(rp.data->>'Software Version', '')), '')      as sw_version,
         nullif(btrim(coalesce(rp.data->>'Complaint Observation', '')), '') as observation,
         nullif(btrim(coalesce(rp.data->>'Job Done', '')), '')              as job_done,
         nullif(btrim(coalesce(rp.pending_reason, '')), '')                 as pending_reason,
         nullif(btrim(coalesce(rp.engineer, '')), '')                       as visit_engineer
    from public.reports rp
   where rp.ucn = c.ucn
   order by rp.updated_at desc nulls last, rp.id desc
   limit 1
) v on true

-- EVERY visit, as the register writes them: "date : what was done", newest
-- first. A visit with nothing written still shows its date, so a call that was
-- attended and left blank does not read as never visited.
left join lateral (
  select string_agg(
           to_char(coalesce(rp.visit_at, rp.updated_at), 'DD-Mon-YYYY') || ' : ' ||
           coalesce(
             nullif(btrim(coalesce(rp.data->>'Job Done', '')), ''),
             nullif(btrim(coalesce(rp.data->>'Complaint Observation', '')), ''),
             ''),
           E'\n' order by rp.visit_at desc nulls last, rp.id desc) as visit_details,
         count(*) as visit_count
    from public.reports rp
   where rp.ucn = c.ucn
) h on true

-- Every spare booked against the call, with the quantity when it is not one.
left join lateral (
  select string_agg(
           btrim(s.part) || case
             when coalesce(s.qty, 1) = 1 then ''
             -- A whole number reads as "x 2", not "x 2." (FM keeps the point).
             when s.qty = trunc(s.qty) then ' x ' || trunc(s.qty)::bigint::text
             else ' x ' || trim(to_char(s.qty, 'FM999999.999'))
           end,
           ', ' order by s.id) as spares_consumed,
         count(*) as spares_count
    from public.spare_consumption s
   where s.ucn = c.ucn and btrim(coalesce(s.part, '')) <> ''
) sp on true;

alter view public.field_call_review set (security_invoker = on);
grant select on public.field_call_review to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The same register WITHOUT the per-call report lookups.
--
--    The module's stage counters ask "how many of the whole filtered set are
--    at each stage", which the full view cannot answer cheaply: the report and
--    spares lookups would run for every row counted, not just the page shown
--    (3 s over a year of calls). This carries only what a count filters on and
--    groups by, so counting is a plain scan of the two tables.
-- ---------------------------------------------------------------------------
drop view if exists public.field_call_review_summary;
create view public.field_call_review_summary as
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
  end as review_status
from public.field_calls c
left join public.call_reviews r on r.ucn = c.ucn;

alter view public.field_call_review_summary set (security_invoker = on);
grant select on public.field_call_review_summary to authenticated;

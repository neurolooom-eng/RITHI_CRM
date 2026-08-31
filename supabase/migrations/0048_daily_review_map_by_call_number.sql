-- ===========================================================================
-- 0048 — Map the visits and the spares to a call by CALL NUMBER.
--
-- 0047 matched `reports` and `spare_consumption` to a call on `ucn` alone, so
-- a call whose visits and consumption are keyed by Call Number read as though
-- it had never been attended: "no visit reported yet" and "no spare booked"
-- on a call the Field Call view shows two visits and a consumed spare for.
--
-- Call Number is what associates them. It is what the Field Call view's own
-- panels read (reportsByCall / spareConsumptionByCall in src/lib/supabase.ts
-- both filter on call_number), and what CallReporting writes against.
--
-- So both lookups now match on EITHER key: the call number when the call has
-- one, or the UCN. A row written by the app carries both; a row that came in
-- from the register may carry only one, and either way it belongs to the call.
-- Blank keys never match — an empty call_number would otherwise sweep in every
-- other row that also has none.
--
-- Idempotent.
-- ===========================================================================

-- The call-number side of both lookups, so matching on either key stays cheap.
-- (reports already has (ucn) and (call_number); this adds the entry ordering
-- the latest-visit pick uses, keyed by call number.)
create index if not exists reports_call_number_entry_idx
  on public.reports (call_number, updated_at desc, id desc);

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
-- call's status comes from (sync_call_last_visit, 0032).
left join lateral (
  select nullif(btrim(coalesce(rp.data->>'Software Version', '')), '')      as sw_version,
         nullif(btrim(coalesce(rp.data->>'Complaint Observation', '')), '') as observation,
         nullif(btrim(coalesce(rp.data->>'Job Done', '')), '')              as job_done,
         nullif(btrim(coalesce(rp.pending_reason, '')), '')                 as pending_reason,
         nullif(btrim(coalesce(rp.engineer, '')), '')                       as visit_engineer
    from public.reports rp
   where (btrim(coalesce(c.call_number, '')) <> '' and rp.call_number = c.call_number)
      or (btrim(coalesce(c.ucn, '')) <> '' and rp.ucn = c.ucn)
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
   where (btrim(coalesce(c.call_number, '')) <> '' and rp.call_number = c.call_number)
      or (btrim(coalesce(c.ucn, '')) <> '' and rp.ucn = c.ucn)
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
   where btrim(coalesce(s.part, '')) <> ''
     and ((btrim(coalesce(c.call_number, '')) <> '' and s.call_number = c.call_number)
       or (btrim(coalesce(c.ucn, '')) <> '' and s.ucn = c.ucn))
) sp on true;

alter view public.field_call_review set (security_invoker = on);
grant select on public.field_call_review to authenticated;

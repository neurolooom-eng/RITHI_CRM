-- ===========================================================================
-- THE DCCR'S "UPDATED BY" AND "UPDATED DATE": THE IMPORT'S, ELSE THE CALL'S.
--
-- The user, 2026-10-04 (the DCCR Google Sheet mirror): "Updated By and Updated
-- Date has to come from the Import."
--
-- The old register carried both on every row (who last touched the review in
-- the sheet, and when) and the DCCR Register upload dropped them: no column
-- held them. Two columns on `call_reviews` hold them AS THE FILE CARRIED THEM —
-- text and a date, nothing derived — and the upload maps the two headings
-- (src/lib/uploads.ts). They are NOT call_reviews.updated_by / updated_at,
-- which say which LOGIN last wrote the row and are stamped by the database: the
-- person who loaded a file is not the person who reviewed the call.
--
-- AND FOR A CALL MADE IN RITHI (the user, the same day): "Updated by has to be
-- the Mail ID of the Person adding the DCCR - in our work flow it can use the
-- Mail id of the Person creating the call. Updated Date has to be Date of Call
-- Registeration since Adding to DCCR is again automatic". So each is the
-- file's value where the row was imported with one, else:
--   Updated By   = the email of the login that registered the call
--                  (field_calls.actual_created_by -- the person who TYPED it
--                  in, never created_by, which is the Hotline desk it is filed
--                  to, 0114)
--   Updated Date = the call's registration date (reg_date).
-- A call with no recorded registrant and no imported value reads blank.
--
-- THE EMAIL NEEDS A DOOR. profiles is readable only by its owner and the
-- people who manage users, and the view runs as its reader -- so a plain join
-- would give everybody else blank. call_registrant_email() is SECURITY
-- DEFINER and answers ONLY for a login that has registered a call, so it
-- cannot be used to look up the email of anybody who never did; the public
-- key cannot run it at all.
--
-- `field_call_review` gains the two at its END (create or replace can only
-- append), as dccr_updated_by / dccr_updated_date; the rest of the definition
-- is 0203's, verbatim. Nothing else is built on the view.
-- ===========================================================================

alter table public.call_reviews add column if not exists imported_updated_by   text;
alter table public.call_reviews add column if not exists imported_updated_date date;

create or replace function public.call_registrant_email(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select nullif(btrim(p.email), '')
    from public.profiles p
   where p.id = p_uid
     and exists (select 1 from public.field_calls f where f.actual_created_by = p_uid);
$$;
revoke all on function public.call_registrant_email(uuid) from public, anon;
grant execute on function public.call_registrant_email(uuid) to authenticated;

create or replace view public.field_call_review as
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
  end as review_status,
  -- ---- 0203: THE REVIEW'S CORRECTED PRODUCT ------------------------------
  coalesce(nullif(btrim(r.actual_product), ''), '')               as actual_product,
  -- ONE EFFECTIVE VALUE, exactly as 0197 argued for the register: the
  -- corrected product where one was chosen, the call's where none was. So a
  -- failure is counted ONCE under whatever that is. Two columns, or a flag
  -- beside the original, would let a count include it twice or neither, and a
  -- Pareto that double-counts is worse than one merely wrong.
  coalesce(nullif(btrim(r.actual_product), ''), c.product_name)   as live_product_name,
  -- Was it moved? For SHOWING the correction, never for counting it. The call
  -- still says a machine was down and an engineer went to it, which stays true.
  (coalesce(nullif(btrim(r.actual_product), ''), c.product_name)
     is distinct from c.product_name)                             as live_product_changed,
  -- ---- 0344: AS THE IMPORTED REGISTER CARRIED THEM -----------------------
  coalesce(nullif(btrim(coalesce(r.imported_updated_by, '')), ''),
           public.call_registrant_email(c.actual_created_by))      as dccr_updated_by,
  coalesce(r.imported_updated_date, c.reg_date)                    as dccr_updated_date
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

-- ===========================================================================
-- 0397  A PM CALL WHOSE CONSUMPTION IS A SPARE GOES TO THE DCCR REVIEW
--       (2026-10-06).
--
-- The user: "for PM also, we need to add a Trigger for DCCR, But the Logic is
-- if a Consumption indicates a Spare then it should be added to DCCR Review.
-- Spare / Consumption comes from the Part Master where each part is mapped. I
-- understand it is not mapped 100% but use the Current Data and Lets review
-- it again and add old calls once the mapping is complete". Their answers: the
-- PM call is ADDED TO THE REVIEW LIST with Spare / Consumable / Correction /
-- Calibration pre-set to SPARE (the reviewer answers the rest); picked up from
-- now on AND for the 2026 PM calls already carrying such a part.
--
--   1. `dccr_calls` -- the calls the DCCR reviews: every Field call, and every
--      PM call that HAS a DCCR review row (a spare consumed on it, or a PM row
--      of an old DCCR register loaded by 0395). security_invoker, so each
--      reader sees only the calls the call policies already give them.
--   2. field_call_review and field_call_review_summary read `dccr_calls` in
--      place of field_calls -- restated FROM THE DATABASE (0353's and 0344's
--      bodies) with that one word changed; same columns, same order.
--   3. `pm_spare_to_dccr` on spare_consumption: a line with a quantity above
--      0 on a PM call whose part (the code before "|") is SPARE in the Part
--      Master opens the call's review, SPARE pre-set. An existing review is
--      never changed. A part the Part Master does not yet call Spare opens
--      nothing -- the mapping is incomplete by the user's own account, and
--      re-running the backfill below after it is completed picks up the rest.
--   4. The backfill, for 2026.
-- ===========================================================================

create or replace view public.dccr_calls as
select id, ucn, call_number, reg_date, complaint_date, party_name, city, state, product_name, serial, item_status, call_type, standard_complaint, complaint_reported, allocated_to, allocated_to_email, warranty_number, warranty_start, status, open_state, last_status, last_visit_at, public_health_threat, death, serious_incident, actual_created_by, cancelled_at from public.field_calls
union all
select id, ucn, call_number, reg_date, complaint_date, party_name, city, state, product_name, serial, item_status, call_type, standard_complaint, complaint_reported, allocated_to, allocated_to_email, warranty_number, warranty_start, status, open_state, last_status, last_visit_at, public_health_threat, death, serious_incident, actual_created_by, cancelled_at from public.pm_calls p
 where exists (select 1 from public.call_reviews r where r.ucn = p.ucn);
alter view public.dccr_calls set (security_invoker = on);
grant select on public.dccr_calls to authenticated;
comment on view public.dccr_calls is
  'The calls the DCCR reviews (0397): every Field call, and the PM calls that have a DCCR review (a SPARE consumed on them, or loaded from an old register).';

create or replace view public.field_call_review as
 SELECT c.id,
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
    age.age_days,
    failure_age_group(age.age_days) AS age_group,
    COALESCE(h.visit_details, ''::text) AS visit_details,
    COALESCE(h.visit_count, (0)::bigint) AS visit_count,
    COALESCE(v.sw_version, ''::text) AS sw_version,
    COALESCE(v.observation, ''::text) AS observation,
    COALESCE(v.job_done, ''::text) AS job_done,
    COALESCE(v.pending_reason, ''::text) AS pending_reason,
    COALESCE(v.visit_engineer, ''::text) AS visit_engineer,
    COALESCE(sp.spares_consumed, ''::text) AS spares_consumed,
    COALESCE(sp.spares_count, (0)::bigint) AS spares_count,
    c.public_health_threat,
    c.death,
    c.serious_incident,
    c.reg_date AS review1_at,
    ((btrim(COALESCE(c.public_health_threat, ''::text)) <> ''::text) AND (btrim(COALESCE(c.death, ''::text)) <> ''::text) AND (btrim(COALESCE(c.serious_incident, ''::text)) <> ''::text)) AS review1_done,
    COALESCE(r.risk_to_patient, ''::text) AS risk_to_patient,
    COALESCE(r.warranty_failure, ''::text) AS warranty_failure,
    COALESCE(r.frequent_failure, ''::text) AS frequent_failure,
    r.review2_at,
    COALESCE(r.review2_by, ''::text) AS review2_by,
    COALESCE(r.review2_done, false) AS review2_done,
    COALESCE(r.complaint_grouping, ''::text) AS complaint_grouping,
    COALESCE(r.root_cause_keyword, ''::text) AS root_cause_keyword,
    COALESCE(r.spare_category, ''::text) AS spare_category,
    COALESCE(r.service_observation, ''::text) AS service_observation,
    r.review3_at,
    COALESCE(r.review3_by, ''::text) AS review3_by,
    COALESCE(r.review3_done, false) AS review3_done,
    COALESCE(r.any_potential_effect, ''::text) AS any_potential_effect,
    COALESCE(r.action_taken, ''::text) AS action_taken,
        CASE
            WHEN (NOT ((btrim(COALESCE(c.public_health_threat, ''::text)) <> ''::text) AND (btrim(COALESCE(c.death, ''::text)) <> ''::text) AND (btrim(COALESCE(c.serious_incident, ''::text)) <> ''::text))) THEN 'Review 1 Pending'::text
            WHEN (NOT COALESCE(r.review2_done, false)) THEN 'Review 2 Pending'::text
            WHEN (NOT COALESCE(r.review3_done, false)) THEN 'Review 3 Pending'::text
            ELSE 'Review Completed'::text
        END AS review_status,
    COALESCE(NULLIF(btrim(r.actual_product), ''::text), ''::text) AS actual_product,
    COALESCE(NULLIF(btrim(r.actual_product), ''::text), c.product_name) AS live_product_name,
    (COALESCE(NULLIF(btrim(r.actual_product), ''::text), c.product_name) IS DISTINCT FROM c.product_name) AS live_product_changed,
    COALESCE(NULLIF(btrim(COALESCE(r.imported_updated_by, ''::text)), ''::text), call_registrant_email(c.actual_created_by)) AS dccr_updated_by,
    COALESCE(r.imported_updated_date, c.reg_date) AS dccr_updated_date
   FROM (((((public.dccr_calls c
     LEFT JOIN call_reviews r ON ((r.ucn = c.ucn)))
     LEFT JOIN LATERAL ( SELECT (COALESCE(c.complaint_date, c.reg_date) - c.warranty_start) AS age_days) age ON (true))
     LEFT JOIN LATERAL ( SELECT NULLIF(btrim(COALESCE((rp.data ->> 'Software Version'::text), ''::text)), ''::text) AS sw_version,
            NULLIF(btrim(COALESCE((rp.data ->> 'Complaint Observation'::text), ''::text)), ''::text) AS observation,
            NULLIF(btrim(COALESCE((rp.data ->> 'Job Done'::text), ''::text)), ''::text) AS job_done,
            NULLIF(btrim(COALESCE(rp.pending_reason, ''::text)), ''::text) AS pending_reason,
            NULLIF(btrim(COALESCE(rp.engineer, ''::text)), ''::text) AS visit_engineer
           FROM reports rp
          WHERE (((btrim(COALESCE(c.call_number, ''::text)) <> ''::text) AND (rp.call_number = c.call_number)) OR ((btrim(COALESCE(c.ucn, ''::text)) <> ''::text) AND (rp.ucn = c.ucn)))
          ORDER BY rp.updated_at DESC NULLS LAST, rp.id DESC
         LIMIT 1) v ON (true))
     LEFT JOIN LATERAL ( SELECT string_agg(((to_char(COALESCE(rp.visit_at, rp.updated_at), 'DD-Mon-YYYY'::text) || ' : '::text) || COALESCE(NULLIF(btrim(COALESCE((rp.data ->> 'Job Done'::text), ''::text)), ''::text), NULLIF(btrim(COALESCE((rp.data ->> 'Complaint Observation'::text), ''::text)), ''::text), ''::text)), '
'::text ORDER BY rp.visit_at DESC NULLS LAST, rp.id DESC) AS visit_details,
            count(*) AS visit_count
           FROM reports rp
          WHERE (((btrim(COALESCE(c.call_number, ''::text)) <> ''::text) AND (rp.call_number = c.call_number)) OR ((btrim(COALESCE(c.ucn, ''::text)) <> ''::text) AND (rp.ucn = c.ucn)))) h ON (true))
     LEFT JOIN LATERAL ( SELECT string_agg((btrim(s.part) ||
                CASE
                    WHEN (COALESCE(s.qty, (1)::numeric) = (1)::numeric) THEN ''::text
                    WHEN (s.qty = trunc(s.qty)) THEN (' x '::text || ((trunc(s.qty))::bigint)::text)
                    ELSE (' x '::text || TRIM(BOTH FROM to_char(s.qty, 'FM999999.999'::text)))
                END), ', '::text ORDER BY s.id) AS spares_consumed,
            count(*) AS spares_count
           FROM spare_consumption s
          WHERE ((btrim(COALESCE(s.part, ''::text)) <> ''::text) AND (((btrim(COALESCE(c.call_number, ''::text)) <> ''::text) AND (s.call_number = c.call_number)) OR ((btrim(COALESCE(c.ucn, ''::text)) <> ''::text) AND (s.ucn = c.ucn))))) sp ON (true));
alter view public.field_call_review set (security_invoker = on);
grant select on public.field_call_review to authenticated;

create or replace view public.field_call_review_summary as
 SELECT c.id,
    c.ucn,
    c.reg_date,
    c.product_name,
    c.allocated_to,
    c.party_name,
    c.serial,
    COALESCE(r.any_potential_effect, ''::text) AS any_potential_effect,
        CASE
            WHEN (NOT ((btrim(COALESCE(c.public_health_threat, ''::text)) <> ''::text) AND (btrim(COALESCE(c.death, ''::text)) <> ''::text) AND (btrim(COALESCE(c.serious_incident, ''::text)) <> ''::text))) THEN 'Review 1 Pending'::text
            WHEN (NOT COALESCE(r.review2_done, false)) THEN 'Review 2 Pending'::text
            WHEN (NOT COALESCE(r.review3_done, false)) THEN 'Review 3 Pending'::text
            ELSE 'Review Completed'::text
        END AS review_status,
    c.open_state,
    c.cancelled_at,
    c.call_number,
    c.standard_complaint,
    c.complaint_reported,
    COALESCE(r.complaint_grouping, ''::text) AS complaint_grouping,
    COALESCE(r.root_cause_keyword, ''::text) AS root_cause_keyword
   FROM (public.dccr_calls c
     LEFT JOIN call_reviews r ON ((r.ucn = c.ucn)));
alter view public.field_call_review_summary set (security_invoker = on);
grant select on public.field_call_review_summary to authenticated;

-- A PART IS A SPARE WHEN THE PART MASTER SAYS SO. The consumption line names it
-- as "CODE|Description"; the code is matched case-blind.
-- PL/pgSQL, not SQL: parts.category arrives in the performance module (0148),
-- which a full apply runs AFTER this one, and a SQL-language body is checked
-- when it is created (the 0215 lesson). PL/pgSQL is checked when it runs.
create or replace function public.part_is_spare(p_part text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from public.parts pa
                  where lower(btrim(pa.code)) = lower(btrim(split_part(coalesce(p_part, ''), '|', 1)))
                    and upper(btrim(coalesce(pa.category, ''))) = 'SPARE');
end $$;
revoke execute on function public.part_is_spare(text) from public, anon, authenticated;

create or replace function public.pm_spare_to_dccr()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.qty, 0) <= 0 or btrim(coalesce(new.ucn, '')) = '' then return null; end if;
  if not exists (select 1 from public.pm_calls p where p.ucn = new.ucn) then return null; end if;
  if not public.part_is_spare(new.part) then return null; end if;
  insert into public.call_reviews (ucn, call_number, spare_category)
  select p.ucn, coalesce(p.call_number, ''), 'SPARE' from public.pm_calls p where p.ucn = new.ucn
  on conflict (ucn) do nothing;
  return null;
end $$;
revoke execute on function public.pm_spare_to_dccr() from public, anon, authenticated;

drop trigger if exists zz_pm_spare_to_dccr on public.spare_consumption;
create trigger zz_pm_spare_to_dccr after insert or update of part, qty on public.spare_consumption
  for each row execute function public.pm_spare_to_dccr();

-- THE BACKFILL: the 2026 PM calls already carrying a Spare. Re-runnable --
-- an existing review is left alone -- so once the Part Master mapping is
-- complete, running this statement again (or the objective bundle) adds the rest.
do $$
declare n integer;
begin
  -- On a fresh build the Part Master's category is not there yet (0148 comes
  -- later); there is nothing to backfill then either.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'parts' and column_name = 'category') then
    return;
  end if;
  insert into public.call_reviews (ucn, call_number, spare_category)
  select distinct p.ucn, coalesce(p.call_number, ''), 'SPARE'
    from public.pm_calls p
    join public.spare_consumption s on s.ucn = p.ucn
   where p.reg_date >= date '2026-01-01'
     and coalesce(s.qty, 0) > 0
     and public.part_is_spare(s.part)
  on conflict (ucn) do nothing;
  get diagnostics n = row_count;
  raise notice '0397: % PM call(s) of 2026 with a Spare consumed added to the DCCR review', n;
end $$;

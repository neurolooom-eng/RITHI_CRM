-- ===========================================================================
-- 0044 — Daily Call Review (DCCR: Daily Customer Complaint Review Register).
--
-- Every FIELD call is reviewed, every day, in three stages:
--
--   Review 1  — asked at Call Registration itself: Public Health Threat?,
--               Death?, Serious Incident?. Already columns on the call, so
--               nothing new is stored; its DATE is the call registration date.
--   Review 2  — Risk to Patient / Any Clinical Impact, Warranty Failure (1yr),
--               Frequent Failure.
--   Review 3  — Complaint Grouping, Root Cause Key Word,
--               Spare / Consumable / Correction / Calibration.
--
-- Stages 2 and 3 live here, in `call_reviews`, one row per call keyed by UCN.
-- Keeping them off the call tables leaves the `calls` union view (0040) and its
-- INSTEAD OF routing untouched.
--
-- Derived, so the sheet's formulas cannot drift from the data:
--   • ANY POTENTIAL EFFECT — blank until all three Review 2 answers are in,
--     then YES if any of them is YES, else NO. (The register's ARRAYFORMULA.)
--   • ACTION TAKEN — defaults to 'FFR Generation' the moment Any Potential
--     Effect turns YES; whoever raises the report overwrites it with the FFR
--     number (e.g. FFR-001/26).
--   • REVIEW STATUS — which stage is outstanding: Review 1/2/3 Pending, or
--     Review Completed. Served by the `field_call_review` view below.
--
-- Also adds the two masters the review reads, both tagged PER PRODUCT:
--   • dccrgrouping — "DCCR Complaint Grouping"
--   • rootcause    — "Root Cause Key Word"
-- A value tagged COMM is common to every product. Their values ship in
-- 0045_dccr_master_values.sql.
--
-- Idempotent.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Review 2 + Review 3, one row per call.
-- ---------------------------------------------------------------------------
create table if not exists public.call_reviews (
  ucn                  text primary key,
  call_number          text not null default '',

  -- Review 2
  risk_to_patient      text not null default '',   -- YES | NO
  warranty_failure     text not null default '',   -- YES | NO  (failure within 1 yr)
  frequent_failure     text not null default '',   -- YES | NO
  review2_at           date,
  review2_by           text not null default '',

  -- Review 3
  complaint_grouping   text not null default '',   -- master: dccrgrouping
  root_cause_keyword   text not null default '',   -- master: rootcause
  spare_category       text not null default '',   -- SPARE | CONSUMABLE | CORRECTION | CALIBRATION | …
  service_observation  text not null default '',
  action_taken         text not null default '',   -- FFR Generation / the FFR number
  review3_at           date,
  review3_by           text not null default '',

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id)
);

-- A stage is COMPLETE when every answer it asks for has been given.
alter table public.call_reviews
  add column if not exists review2_done boolean
  generated always as (
    btrim(risk_to_patient) <> '' and btrim(warranty_failure) <> '' and btrim(frequent_failure) <> ''
  ) stored;

alter table public.call_reviews
  add column if not exists review3_done boolean
  generated always as (
    btrim(complaint_grouping) <> '' and btrim(root_cause_keyword) <> '' and btrim(spare_category) <> ''
  ) stored;

-- ANY POTENTIAL EFFECT — the register's ARRAYFORMULA, as a column:
--   blank while any of the three is blank, else YES if any is YES, else NO.
alter table public.call_reviews
  add column if not exists any_potential_effect text
  generated always as (
    case
      when btrim(risk_to_patient) = '' or btrim(warranty_failure) = '' or btrim(frequent_failure) = '' then ''
      when upper(btrim(risk_to_patient))  = 'YES' then 'YES'
      when upper(btrim(warranty_failure)) = 'YES' then 'YES'
      when upper(btrim(frequent_failure)) = 'YES' then 'YES'
      else 'NO'
    end
  ) stored;

create index if not exists call_reviews_call_number_idx on public.call_reviews (call_number);
create index if not exists call_reviews_review2_idx      on public.call_reviews (review2_done);
create index if not exists call_reviews_review3_idx      on public.call_reviews (review3_done);

-- ---------------------------------------------------------------------------
-- 2. Stamps: the review dates, and the action a YES calls for.
--
-- A stage's DATE is written when that stage is answered, and is not moved by a
-- later edit of the other stage. `action_taken` is seeded with 'FFR Generation'
-- when Any Potential Effect turns YES and nothing has been entered yet; it is
-- cleared again if the answers change back to NO and nobody has typed over it.
-- ---------------------------------------------------------------------------
create or replace function public.call_review_stamp()
returns trigger language plpgsql set search_path = public as $$
declare
  was2 boolean := case when tg_op = 'UPDATE' then old.review2_done else false end;
  was3 boolean := case when tg_op = 'UPDATE' then old.review3_done else false end;
  new_effect text := case
      when btrim(new.risk_to_patient) = '' or btrim(new.warranty_failure) = '' or btrim(new.frequent_failure) = '' then ''
      when upper(btrim(new.risk_to_patient))  = 'YES' then 'YES'
      when upper(btrim(new.warranty_failure)) = 'YES' then 'YES'
      when upper(btrim(new.frequent_failure)) = 'YES' then 'YES'
      else 'NO'
    end;
  done2 boolean := btrim(new.risk_to_patient) <> '' and btrim(new.warranty_failure) <> '' and btrim(new.frequent_failure) <> '';
  done3 boolean := btrim(new.complaint_grouping) <> '' and btrim(new.root_cause_keyword) <> '' and btrim(new.spare_category) <> '';
begin
  if done2 and new.review2_at is null then new.review2_at := current_date; end if;
  if not done2 and not was2 then new.review2_at := null; end if;
  if done3 and new.review3_at is null then new.review3_at := current_date; end if;
  if not done3 and not was3 then new.review3_at := null; end if;

  -- The action a potential effect calls for: raise a Field Failure Report.
  if new_effect = 'YES' and btrim(new.action_taken) = '' then
    new.action_taken := 'FFR Generation';
  elsif new_effect <> 'YES' and new.action_taken = 'FFR Generation' then
    new.action_taken := '';
  end if;

  new.updated_at := now();
  if new.updated_by is null then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;

drop trigger if exists call_reviews_stamp on public.call_reviews;
create trigger call_reviews_stamp before insert or update on public.call_reviews
  for each row execute function public.call_review_stamp();

-- ---------------------------------------------------------------------------
-- 3. RLS — anyone who may see calls reads the reviews; changing one needs the
--    `review.edit` action (granted below to the roles that run the review).
-- ---------------------------------------------------------------------------
alter table public.call_reviews enable row level security;
grant select, insert, update, delete on public.call_reviews to authenticated;

drop policy if exists call_reviews_read on public.call_reviews;
create policy call_reviews_read on public.call_reviews for select
  using (auth.role() = 'authenticated');

drop policy if exists call_reviews_write on public.call_reviews;
create policy call_reviews_write on public.call_reviews for all
  using (public.has_perm('review.edit')) with check (public.has_perm('review.edit'));

-- `review.edit` on the roles that run the daily review. Admin already holds
-- every action; the rest gain it only if they do not have it already, so an
-- admin who has since removed it is not overruled on a re-run.
do $$
declare r text;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  foreach r in array array['admin', 'hotline', 'nsm', 'rgm', 'rm', 'commercial'] loop
    update public.app_roles
       set permissions = coalesce(permissions, '[]'::jsonb) || '["review.edit"]'::jsonb
     where role = r and not coalesce(permissions, '[]'::jsonb) ? 'review.edit';
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The register the module reads: one row per FIELD call, with its three
--    review stages and which one is outstanding.
--
--    Review 1 is the registration's own three answers, so it is complete as
--    soon as all three have been given (they default to NO on the form) and
--    its date is the call registration date.
-- ---------------------------------------------------------------------------
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
  -- Review 1 — from the call itself.
  c.public_health_threat,
  c.death,
  c.serious_incident,
  c.reg_date as review1_at,
  (btrim(coalesce(c.public_health_threat, '')) <> ''
   and btrim(coalesce(c.death, '')) <> ''
   and btrim(coalesce(c.serious_incident, '')) <> '') as review1_done,
  -- Review 2
  coalesce(r.risk_to_patient, '')     as risk_to_patient,
  coalesce(r.warranty_failure, '')    as warranty_failure,
  coalesce(r.frequent_failure, '')    as frequent_failure,
  r.review2_at,
  coalesce(r.review2_by, '')          as review2_by,
  coalesce(r.review2_done, false)     as review2_done,
  -- Review 3
  coalesce(r.complaint_grouping, '')  as complaint_grouping,
  coalesce(r.root_cause_keyword, '')  as root_cause_keyword,
  coalesce(r.spare_category, '')      as spare_category,
  coalesce(r.service_observation, '') as service_observation,
  r.review3_at,
  coalesce(r.review3_by, '')          as review3_by,
  coalesce(r.review3_done, false)     as review3_done,
  -- Derived
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
left join public.call_reviews r on r.ucn = c.ucn;

alter view public.field_call_review set (security_invoker = on);
grant select on public.field_call_review to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The two masters, tagged per product.
--
--    The same value legitimately exists for more than one product ("Calibration"
--    for MONNAL T60 and for MONNAL T75), so the uniqueness that 0021 put on
--    (name, value, stage) has to take the product in too. Widening it is a
--    relaxation — every existing list carries no product, so nothing that was
--    unique before stops being unique.
-- ---------------------------------------------------------------------------
drop index if exists public.masters_name_value_idx;
create unique index if not exists masters_name_value_product_idx
  on public.masters (name, value, (coalesce(extra->>'stage', '')), (coalesce(extra->>'product', '')));

insert into public.master_lists (key, label, value_label, columns, sort_order) values
  ('dccrgrouping', 'DCCR Complaint Grouping', 'Complaint Grouping',
   '[{"key": "product", "label": "Product"}]'::jsonb, 70),
  ('rootcause', 'Root Cause Key Word', 'Root Cause Key Word',
   '[{"key": "product", "label": "Product"}]'::jsonb, 80)
on conflict (key) do update set
  label = excluded.label, value_label = excluded.value_label,
  columns = excluded.columns, sort_order = excluded.sort_order, updated_at = now();

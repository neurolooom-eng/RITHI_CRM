-- ===========================================================================
-- 0402 — PM DUE, BY THE VISIT AND NOT BY A COUNT: GENERATED OR MISSED PM,
-- PRODUCTS AND ACCESSORIES (the user, 2026-10-08).
--
-- WHY 0401'S RULE IS REPLACED. It listed a machine when the visits scheduled
-- since its cover started outnumbered the PM calls raised in that time. RITHI
-- holds almost no PM call from before 2026 (37 of 2024, 500 of 2025), so a
-- three-year contract from 2024 read every 2024-25 visit as missed and was
-- listed again even with this month's call raised. Measured on the live
-- project (`_pm_due_by_month.sql`): October listed 2,348 machines, 1,098 of
-- which ALREADY had an October PM call -- Create would have duplicated them.
--
-- THE RULE NOW, in the user's words: a visit is GENERATED "when the visit is
-- created -- like 1/12, 2/12 like that and it is not in Cancelled state". So
-- each machine with a visit due in the month is listed, and is
--   GENERATED  a PM call exists for that product + serial, not cancelled,
--              registered within that cover's period (its start month to its
--              end), whose Reported Problem reads "k / N" with the SAME visit
--              number and the SAME number of visits -- in whatever month it was
--              raised;
--   MISSED PM  otherwise.
-- The visit numbering is the existing one: visit k on start + round(k x months
-- x 30 / visits) days, never after the cover's end (0401, the user's 120-day
-- example). One row per machine, warranty first (0218's order).
--
-- ACCESSORIES ARE LISTED AND MARKED, not dropped: "Give me an option to
-- segregate Product and Accessory". An accessory is a product whose Product
-- Master category reads ACCESSORY (the user, 2026-09-30, `isAccessoryCategory`);
-- anything else is a product.
--
-- `last_pm_on` is the machine's latest PM call ever (not cancelled), so a
-- Missed PM raised under a different visit number or a month off is visible.
--
-- A NEW NAME, pm_visits_due, because the columns differ: `create or replace`
-- cannot change a function's result columns, and re-running 0401's bundle on a
-- database holding a changed pm_due would fail on exactly that. 0401's pm_due
-- is dropped here; re-running the bundle recreates it in 0401 and drops it
-- again here. pm_due_latest_reg_at (0401) is unchanged.
--
-- SECURITY DEFINER with its own pm.generate check, as 0401: whether a visit was
-- generated must be answered from EVERY PM call, not only those the reader's
-- row-level security shows, or a hidden call reads as Missed and is raised
-- twice. Not executable by the public key.
-- ===========================================================================

drop function if exists public.pm_due(date);

create or replace function public.pm_visits_due(p_month date)
returns table (
  source           text,     -- 'Warranty' or 'Contract'
  ref_no           text,     -- the SA number or the MC number
  product_name     text,
  serial           text,
  is_accessory     boolean,  -- Product Master category ACCESSORY
  party_name       text,
  city             text,
  state            text,
  engineer         text,     -- the Product Database's Service Engineer
  on_product_database boolean,
  cover_type       text,     -- WGP, or the contract's type as keyed
  cover_start      date,
  cover_end        date,
  period_months    integer,
  pm_visits        integer,
  visit_no         integer,  -- the visit due this month, k of pm_visits
  due_date         date,
  generated        boolean,  -- a PM call "k / N" exists for this visit, not cancelled
  generated_ucn    text,
  generated_on     date,     -- that call's registration date
  last_pm_on       date      -- the machine's latest PM call, any visit
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  m_start date := date_trunc('month', p_month)::date;
  m_end   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not coalesce(public.has_perm('pm.generate'), false) then
    raise exception 'Listing the PM visits due needs “Generate PM calls from the registers” (pm.generate) on Roles & Permissions.'
      using errcode = '42501';
  end if;

  return query
  with cover as materialized (
    select 'Warranty'::text as src, w.sa_number as ref, btrim(w.product_name) as p, btrim(w.serial_number) as s,
           lower(btrim(w.product_name)) || '|' || lower(btrim(w.serial_number)) as mk,
           w.party_name as party, w.city as cty, w.state as st, 'WGP'::text as ctype,
           w.warranty_start as cs,
           coalesce(w.warranty_end, (w.warranty_start + make_interval(months => w.warranty_months))::date - 1) as ce,
           w.warranty_months as m, w.pm_visits as v
      from public.warranty_sale_details w
     where w.warranty_start is not null and coalesce(w.warranty_months, 0) > 0 and coalesce(w.pm_visits, 0) > 0
       and btrim(coalesce(w.product_name, '')) <> '' and btrim(coalesce(w.serial_number, '')) <> ''
       and w.warranty_start <= m_end
    union all
    select 'Contract', c.mc_number, btrim(c.product_name), btrim(c.serial_number),
           lower(btrim(c.product_name)) || '|' || lower(btrim(c.serial_number)),
           c.party_name, null::text, null::text, coalesce(c.contract_type, ''),
           c.contract_start,
           coalesce(c.contract_end, (c.contract_start + make_interval(months => c.contract_months))::date - 1),
           c.contract_months, c.pm_visits_total
      from public.contract_details c
     where c.contract_start is not null and coalesce(c.contract_months, 0) > 0 and coalesce(c.pm_visits_total, 0) > 0
       and btrim(coalesce(c.product_name, '')) <> '' and btrim(coalesce(c.serial_number, '')) <> ''
       and c.contract_start <= m_end
  ), visits as (
    -- Every visit of every cover, dated by the rule; keep the LAST one that
    -- falls in the month (two can, when the interval is under 30 days).
    select distinct on (cv.src, cv.ref, cv.mk)
           cv.*, k as kk,
           least(cv.cs + round(k * cv.m * 30.0 / cv.v)::int, cv.ce) as due
      from cover cv
      cross join lateral generate_series(1, cv.v) k
     where least(cv.cs + round(k * cv.m * 30.0 / cv.v)::int, cv.ce) between m_start and m_end
     order by cv.src, cv.ref, cv.mk, k desc
  ), one as (
    -- One row per machine, the warranty's visit first (0218's order).
    select distinct on (vi.mk) vi.*
      from visits vi
     order by vi.mk, (vi.src = 'Warranty') desc, vi.cs desc
  ), pm as materialized (
    -- The PM register read ONCE and hash-joined, with the "k / N" of its
    -- Reported Problem parsed. Only machines in this month's list.
    select lower(btrim(coalesce(pc.product_name, ''))) || '|' || lower(btrim(coalesce(pc.serial, ''))) as mk,
           pc.ucn, pc.reg_date,
           (regexp_match(coalesce(pc.complaint_reported, ''), '(\d+)\s*/\s*(\d+)'))::int[] as kn
      from public.pm_calls pc
     where pc.cancelled_at is null
       and lower(btrim(coalesce(pc.product_name, ''))) || '|' || lower(btrim(coalesce(pc.serial, '')))
           in (select o.mk from one o)
  ), gen as (
    select distinct on (o.mk) o.mk, pm.ucn, pm.reg_date
      from one o
      join pm on pm.mk = o.mk
             and pm.kn[1] = o.kk and pm.kn[2] = o.v
             and pm.reg_date between date_trunc('month', o.cs)::date and o.ce
     order by o.mk, pm.reg_date desc, pm.ucn desc
  ), last_pm as (
    select pm.mk, max(pm.reg_date) as d from pm group by pm.mk
  ), acc as (
    select distinct lower(btrim(pmx.product_name)) as p
      from public.product_master pmx
     where upper(btrim(coalesce(pmx.item_category, ''))) = 'ACCESSORY'
  )
  select o.src, o.ref, o.p, o.s,
         lower(o.p) in (select acc.p from acc),
         coalesce(nullif(btrim(pr.party_name), ''), o.party),
         coalesce(nullif(btrim(pr.city), ''), o.cty),
         coalesce(nullif(btrim(pr.state), ''), o.st),
         nullif(btrim(coalesce(pr.service_engineer, '')), ''),
         pr.id is not null,
         o.ctype, o.cs, o.ce, o.m, o.v, o.kk, o.due,
         g.ucn is not null, g.ucn, g.reg_date, lp.d
    from one o
    left join gen g on g.mk = o.mk
    left join last_pm lp on lp.mk = o.mk
    left join lateral (
      select * from public.products x
       where x.machine_key = o.mk
       order by x.id desc limit 1) pr on true
   order by 6 nulls last, 3, 4;
end $$;

comment on function public.pm_visits_due(date) is
  'The machines with a PM visit due in a month from the Warranty and Contract Registers (visit k on start + k x months x 30 / visits days), each GENERATED when a PM call "k / N" exists for it in the cover period and is not cancelled, else MISSED PM; accessories marked by the Product Master category. One row per machine, warranty first. Needs pm.generate (0402).';

revoke execute on function public.pm_visits_due(date) from public, anon;
grant execute on function public.pm_visits_due(date) to authenticated;

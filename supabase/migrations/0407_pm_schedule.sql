-- ===========================================================================
-- 0407 -- THE PM SCHEDULE OF ONE SALE OR ONE CONTRACT (the user, 2026-10-09:
-- "Can I have the schedules listed in Warranty and contract pages as well..
-- also a provision to generate from there").
--
-- Every visit of every machine on ONE Warranty Register entry (SA number) or
-- ONE Contract Register entry (MC number), by the rules PM Due uses (0402):
--   * visit k is due on start + round(k x months x 30 / visits) days, never
--     after the cover's end;
--   * it is GENERATED when a PM call for that product + serial, not cancelled,
--     registered within the cover's period, reads "k / N" with the same visit
--     number and number of visits -- in whatever month it was raised.
-- The entry window lists them, and offers Generate on a visit that is not
-- generated and whose due month has come ("Due or past due, dated its due
-- month" -- the call is shaped and dated exactly as PM Due shapes it).
--
-- ONE ENTRY AT A TIME, so it is a lookup and never a whole-register scan: the
-- reference is required. The party, city, state and engineer are the machine's
-- Product Database row's (the machine's current owner), else the register's,
-- as on PM Due.
--
-- SECURITY DEFINER with pm.generate, as pm_visits_due: whether a visit was
-- generated must be answered from EVERY PM call, not only those the reader may
-- see. Not executable by the public key.
-- ===========================================================================

create or replace function public.pm_schedule(p_source text, p_ref text)
returns table (
  source           text,
  ref_no           text,
  product_name     text,
  serial           text,
  party_name       text,
  city             text,
  state            text,
  engineer         text,
  on_product_database boolean,
  cover_type       text,
  cover_start      date,
  cover_end        date,
  period_months    integer,
  pm_visits        integer,
  visit_no         integer,
  due_date         date,
  generated        boolean,
  generated_ucn    text,
  generated_on     date
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not coalesce(public.has_perm('pm.generate'), false) then
    raise exception 'The PM schedule needs “Generate PM calls from the registers” (pm.generate) on Roles & Permissions.'
      using errcode = '42501';
  end if;
  if btrim(coalesce(p_ref, '')) = '' or p_source not in ('Warranty', 'Contract') then
    raise exception 'Name the register (Warranty or Contract) and the SA or MC number.';
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
     where p_source = 'Warranty' and w.sa_number = btrim(p_ref)
       and w.warranty_start is not null and coalesce(w.warranty_months, 0) > 0 and coalesce(w.pm_visits, 0) > 0
       and btrim(coalesce(w.product_name, '')) <> '' and btrim(coalesce(w.serial_number, '')) <> ''
    union all
    select 'Contract', c.mc_number, btrim(c.product_name), btrim(c.serial_number),
           lower(btrim(c.product_name)) || '|' || lower(btrim(c.serial_number)),
           c.party_name, null::text, null::text, coalesce(c.contract_type, ''),
           c.contract_start,
           coalesce(c.contract_end, (c.contract_start + make_interval(months => c.contract_months))::date - 1),
           c.contract_months, c.pm_visits_total
      from public.contract_details c
     where p_source = 'Contract' and c.mc_number = btrim(p_ref)
       and c.contract_start is not null and coalesce(c.contract_months, 0) > 0 and coalesce(c.pm_visits_total, 0) > 0
       and btrim(coalesce(c.product_name, '')) <> '' and btrim(coalesce(c.serial_number, '')) <> ''
  ), visits as (
    select cv.*, k as kk, least(cv.cs + round(k * cv.m * 30.0 / cv.v)::int, cv.ce) as due
      from cover cv cross join lateral generate_series(1, cv.v) k
  ), pm as materialized (
    select lower(btrim(coalesce(pc.product_name, ''))) || '|' || lower(btrim(coalesce(pc.serial, ''))) as mk,
           pc.ucn, pc.reg_date,
           (regexp_match(coalesce(pc.complaint_reported, ''), '(\d+)\s*/\s*(\d+)'))::int[] as kn
      from public.pm_calls pc
     where pc.cancelled_at is null
       and lower(btrim(coalesce(pc.product_name, ''))) || '|' || lower(btrim(coalesce(pc.serial, '')))
           in (select c.mk from cover c)
  ), gen as (
    select distinct on (vi.mk, vi.kk) vi.mk, vi.kk, pm.ucn, pm.reg_date
      from visits vi
      join pm on pm.mk = vi.mk and pm.kn[1] = vi.kk and pm.kn[2] = vi.v
             and pm.reg_date between date_trunc('month', vi.cs)::date and vi.ce
     order by vi.mk, vi.kk, pm.reg_date desc, pm.ucn desc
  )
  select vi.src, vi.ref, vi.p, vi.s,
         coalesce(nullif(btrim(pr.party_name), ''), vi.party),
         coalesce(nullif(btrim(pr.city), ''), vi.cty),
         coalesce(nullif(btrim(pr.state), ''), vi.st),
         nullif(btrim(coalesce(pr.service_engineer, '')), ''),
         pr.id is not null,
         vi.ctype, vi.cs, vi.ce, vi.m, vi.v, vi.kk, vi.due,
         g.ucn is not null, g.ucn, g.reg_date
    from visits vi
    left join gen g on g.mk = vi.mk and g.kk = vi.kk
    left join lateral (
      select * from public.products x where x.machine_key = vi.mk order by x.id desc limit 1) pr on true
   order by vi.p, vi.s, vi.kk;
end $$;

comment on function public.pm_schedule(text, text) is
  'Every PM visit of every machine on one Warranty (SA) or Contract (MC) entry -- visit k on start + k x months x 30 / visits days -- each GENERATED when a not-cancelled PM call "k / N" exists for it in the cover period. Needs pm.generate (0407).';

revoke execute on function public.pm_schedule(text, text) from public, anon;
grant execute on function public.pm_schedule(text, text) to authenticated;

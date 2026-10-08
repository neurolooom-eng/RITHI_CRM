-- ===========================================================================
-- DOES "EVEN, FIRST AFTER ONE INTERVAL" MATCH THE PM CALLS ALREADY RAISED?
-- (2026-10-08). READ-ONLY. Every PM call this year reads "SCHEDULED PM VISIT
-- k / N". For each, find the warranty or contract whose period holds the
-- call's month for that machine, and compare: is N that cover's PM Visits,
-- and does visit k of the rule fall in the call's month? One grid: the
-- verdicts (part 1), then the commonest disagreements in detail (part 2).
-- ===========================================================================
with pm as (
  select p.ucn, p.reg_date,
         lower(btrim(coalesce(p.product_name, ''))) || '|' || lower(btrim(coalesce(p.serial, ''))) as mk,
         (regexp_match(coalesce(p.complaint_reported, ''), '(\d+)\s*/\s*(\d+)'))::int[] as kn
    from public.pm_calls p
   where p.reg_date >= date_trunc('year', current_date) and p.cancelled_at is null
), cover as materialized (
  select 'Warranty'::text as src, lower(btrim(product_name)) || '|' || lower(btrim(serial_number)) as mk,
         warranty_start as s, coalesce(warranty_end, warranty_start + make_interval(months => warranty_months)) as e,
         warranty_months as m, pm_visits as v
    from public.warranty_sale_details
   where warranty_start is not null and coalesce(warranty_months, 0) > 0 and coalesce(pm_visits, 0) > 0
  union all
  select 'Contract', lower(btrim(product_name)) || '|' || lower(btrim(serial_number)),
         contract_start, coalesce(contract_end, contract_start + make_interval(months => contract_months)),
         contract_months, pm_visits_total
    from public.contract_details
   where contract_start is not null and coalesce(contract_months, 0) > 0 and coalesce(pm_visits_total, 0) > 0
), j as (
  -- ONE pass over the registers, hash-joined, then one cover per call --
  -- a LATERAL here re-read the two register views once per call and timed out.
  select distinct on (pm.ucn) pm.*, c.src, c.s, c.e, c.m, c.v
    from pm left join cover c
      on c.mk = pm.mk
     and date_trunc('month', pm.reg_date) between date_trunc('month', c.s) and date_trunc('month', c.e)
   order by pm.ucn, (c.src = 'Warranty') desc nulls last, c.s desc nulls last
), r as (
  select j.*,
    case when kn is null then 'no k / N in the Reported Problem'
         when src is null then 'no warranty or contract holds this month'
         when kn[2] <> v then 'N differs from the register''s PM Visits'
         when date_trunc('month', least(s + make_interval(months => round(kn[1] * m::numeric / v)::int), e))
              = date_trunc('month', reg_date) then 'N matches, visit k falls in this month'
         when date_trunc('month', least(s + make_interval(months => round((kn[1] - 1) * m::numeric / v)::int), e))
              = date_trunc('month', reg_date) then 'N matches, k is one month-step later than the rule (first in start month?)'
         else 'N matches, visit k falls in another month' end as verdict
    from j
)
-- The rule's verdict, then (rows 2) for the calls that fall in ANOTHER month,
-- the actual month offset from the start against what the rule says, by
-- period / visits / k: which pattern the raised calls really follow.
, g as (
  select 1 as part, src, verdict as what, null::int as m, null::int as v, null::int as k,
         null::int as actual_offset, null::int as rule_offset, count(*) as n, min(ucn) as example_ucn
    from r group by src, verdict
  union all
  select 2, src, 'another month', m, v, kn[1],
         ((extract(year from reg_date) - extract(year from s)) * 12 + extract(month from reg_date) - extract(month from s))::int,
         round(kn[1] * m::numeric / v)::int, count(*), min(ucn)
    from r where verdict = 'N matches, visit k falls in another month'
   group by src, m, v, kn[1], 7, 8
)
select * from g
 where part = 1 or n >= 20
 order by part, src nulls first, n desc
 limit 60;

-- ===========================================================================
-- WHAT PM DUE LISTS, MONTH BY MONTH (2026-10-08). READ-ONLY.
-- The user: "In spite of generating 8k calls till date, do u think I am
-- missing another 10k calls?" This runs pm_visits_due() (0403) AS AN
-- ADMINISTRATOR for every month of the year and counts, per month:
--   machines         every machine with a PM visit due that month
--   generated        its "k / N" PM call exists, not cancelled
--   missed_pm        no such call
--   missed_products / missed_accessories   the missed, split by the
--                    Product Master category (ACCESSORY)
--   missed_serial_has_pm  of the missed, the SERIAL has a PM call this year
--                    under ANOTHER product name -- a spelling the match by
--                    product + serial cannot see
--   missed_with_pm_that_month  of the missed, the machine HAS a PM call
--                    in that very month, numbered differently
--   can_create       of the missed, passing both 0403 rules
--   no_install_call / install_not_solved   of the missed, failing rule 1
--   party_not_customer  of the missed, failing rule 2 (a dealer, no Type,
--                    or not in the Party Master)
-- Months print as MM-YY.
-- ===========================================================================
select set_config('request.jwt.claims',
  (select json_build_object('sub', p.id, 'role', 'authenticated')::text
     from public.profiles p where p.role = 'admin' order by p.created_at limit 1), false);
set role authenticated;
with months as (
  select generate_series(date_trunc('year', current_date), date_trunc('year', current_date) + interval '11 months', interval '1 month')::date as mo
), d as materialized (
  select m.mo, x.* from months m cross join lateral public.pm_visits_due(m.mo) x
), ps as materialized (
  select distinct lower(btrim(coalesce(serial, ''))) as s, lower(btrim(coalesce(product_name, ''))) as p
    from public.pm_calls where cancelled_at is null and reg_date >= date_trunc('year', current_date)
), pmm as materialized (
  select distinct lower(btrim(coalesce(product_name, ''))) || '|' || lower(btrim(coalesce(serial, ''))) as mk,
         date_trunc('month', reg_date)::date as mo
    from public.pm_calls where cancelled_at is null
)
select to_char(d.mo, 'MM-YY') as month,
       count(*) as machines,
       count(*) filter (where generated) as generated,
       count(*) filter (where not generated) as missed_pm,
       count(*) filter (where not generated and not is_accessory) as missed_products,
       count(*) filter (where not generated and is_accessory) as missed_accessories,
       count(*) filter (where not generated
                          and exists (select 1 from ps where ps.s = lower(d.serial) and ps.p <> lower(d.product_name))
                          and not exists (select 1 from ps where ps.s = lower(d.serial) and ps.p = lower(d.product_name))) as missed_serial_has_pm,
       count(*) filter (where not generated
                          and exists (select 1 from pmm where pmm.mk = lower(d.product_name) || '|' || lower(d.serial) and pmm.mo = d.mo)) as missed_with_pm_that_month,
       count(*) filter (where can_create) as can_create,
       count(*) filter (where not generated and installation_ucn is null) as no_install_call,
       count(*) filter (where not generated and installation_ucn is not null and not install_solved) as install_not_solved,
       count(*) filter (where not generated and not party_is_customer) as party_not_customer
  from d group by d.mo order by d.mo;

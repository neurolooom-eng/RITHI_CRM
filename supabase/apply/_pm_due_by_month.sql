-- ===========================================================================
-- WHAT PM DUE LISTS, MONTH BY MONTH, AND WHY (2026-10-08). READ-ONLY.
-- The user, on seeing the list: "In spite of generating 8k calls till date,
-- do u think I am missing another 10k calls?" This runs pm_due() (0401) AS AN
-- ADMINISTRATOR for every month of the year and splits each month's list:
--   machines         rows PM Due lists for the month
--   warranty / contract
--   accessories      the product's Product Master category is ACCESSORY
--   none_raised      no PM call at all for that machine in its cover period
--   serial_has_pm    the SERIAL has a PM call this year under ANOTHER product
--                    name -- a spelling the count cannot match, so the visit
--                    reads as owed when it may have been done
--   older_visit      visit 2 or later with fewer calls raised than visits
--                    before it -- a backlog, not this month's visit alone
--   pm_this_month    the machine ALREADY has a PM call registered in that very
--                    month (product + serial): listed only because visits
--                    before RITHI held PM calls are missing from the count
--   first_pm_in_rithi the earliest PM call RITHI holds for the machine (MM-YY)
--                    -- the column below, how many listed machines have none
--                    before this year
-- Months print as MM-YY.
-- ===========================================================================
select set_config('request.jwt.claims',
  (select json_build_object('sub', p.id, 'role', 'authenticated')::text
     from public.profiles p where p.role = 'admin' order by p.created_at limit 1), false);
set role authenticated;
with months as (
  select generate_series(date_trunc('year', current_date), date_trunc('year', current_date) + interval '11 months', interval '1 month')::date as mo
), d as materialized (
  select m.mo, x.* from months m cross join lateral public.pm_due(m.mo) x
), acc as materialized (
  select distinct lower(btrim(product_name)) as p from public.product_master
   where upper(btrim(coalesce(item_category, ''))) = 'ACCESSORY'
), ps as materialized (
  select distinct lower(btrim(coalesce(serial, ''))) as s, lower(btrim(coalesce(product_name, ''))) as p
    from public.pm_calls where cancelled_at is null and reg_date >= date_trunc('year', current_date)
), pmm as materialized (
  select lower(btrim(coalesce(product_name, ''))) || '|' || lower(btrim(coalesce(serial, ''))) as mk,
         date_trunc('month', reg_date)::date as mo, reg_date
    from public.pm_calls where cancelled_at is null
), first_pm as materialized (
  select mk, min(reg_date) as first_at from pmm group by mk
)
select to_char(d.mo, 'MM-YY') as month,
       count(*) as machines,
       count(*) filter (where source = 'Warranty') as warranty,
       count(*) filter (where source = 'Contract') as contract,
       count(*) filter (where lower(d.product_name) in (select p from acc)) as accessories,
       count(*) filter (where raised = 0) as none_raised,
       count(*) filter (where exists (select 1 from ps where ps.s = lower(d.serial) and ps.p <> lower(d.product_name))
                          and not exists (select 1 from ps where ps.s = lower(d.serial) and ps.p = lower(d.product_name))) as serial_has_pm,
       count(*) filter (where visit_no - raised > 1) as older_visit,
       count(*) filter (where exists (select 1 from pmm where pmm.mk = lower(d.product_name) || '|' || lower(d.serial)
                                                       and pmm.mo = d.mo)) as pm_this_month,
       count(*) filter (where not exists (select 1 from first_pm f where f.mk = lower(d.product_name) || '|' || lower(d.serial)
                                                       and f.first_at < date_trunc('year', current_date))) as no_pm_before_this_year
  from d group by d.mo order by d.mo;

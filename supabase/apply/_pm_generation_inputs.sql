-- ===========================================================================
-- WHAT A PM CALL CARRIES TODAY, AND WHAT THE REGISTERS HOLD (2026-10-08).
-- READ-ONLY. Asked before building PM generation from the Warranty and
-- Contract Registers, so the generated calls carry what the uploaded ones do
-- and nothing is guessed. One grid: section, value, count.
--   sc     the Standard Complaint on PM calls registered this year
--   cr     the Reported Problem on them (top 8)
--   eng    whether the PM call's engineer is the Product Database's
--   wty    warranty machines: usable for a schedule, and why not
--   amc    contract machines: the same
-- ===========================================================================
with pm as (
  select p.*, lower(btrim(coalesce(p.product_name, ''))) || '|' || lower(btrim(coalesce(p.serial, ''))) as mk
    from public.pm_calls p
   where p.reg_date >= date_trunc('year', current_date) and p.cancelled_at is null
), sc as (
  select 'sc'::text as section, coalesce(nullif(btrim(standard_complaint), ''), '(blank)') as value, count(*) as n
    from pm group by 2 order by 3 desc limit 10
), cr as (
  select 'cr'::text, coalesce(nullif(btrim(complaint_reported), ''), '(blank)'), count(*)
    from pm group by 2 order by 3 desc limit 8
), eng as (
  select 'eng'::text,
         case when pr.id is null then 'machine not on the Product Database'
              when btrim(coalesce(pr.service_engineer, '')) = '' then 'Product Database engineer blank'
              when upper(btrim(pr.service_engineer)) = upper(btrim(coalesce(pm.allocated_to, ''))) then 'PM engineer = Product Database engineer'
              else 'PM engineer differs from Product Database engineer' end,
         count(*)
    from pm left join public.products pr on pr.machine_key = pm.mk
   group by 2
), wty as (
  select 'wty'::text,
         case when btrim(coalesce(serial_number, '')) = '' or btrim(coalesce(product_name, '')) = '' then 'no product or serial'
              when warranty_start is null then 'no start date'
              when coalesce(warranty_months, 0) <= 0 then 'no period in months'
              when coalesce(pm_visits, 0) <= 0 then 'no PM visits'
              when coalesce(warranty_end, warranty_start + make_interval(months => warranty_months)) < current_date then 'usable, period ended'
              else 'usable, in force today' end,
         count(*)
    from public.warranty_sale_details group by 2
), amc as (
  select 'amc'::text,
         case when btrim(coalesce(serial_number, '')) = '' or btrim(coalesce(product_name, '')) = '' then 'no product or serial'
              when contract_start is null then 'no start date'
              when coalesce(contract_months, 0) <= 0 then 'no period in months'
              when coalesce(pm_visits_total, 0) <= 0 then 'no PM visits'
              when coalesce(contract_end, contract_start + make_interval(months => contract_months)) < current_date then 'usable, period ended'
              else 'usable, in force today' end,
         count(*)
    from public.contract_details group by 2
)
select * from sc union all select * from cr union all select * from eng
union all select * from wty union all select * from amc
order by 1, 3 desc;

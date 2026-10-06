-- ===========================================================================
-- HOW MUCH OLD DCCR AND CALL DATA IS ON THE PROJECT? (2026-10-06) -- READ-ONLY.
--
-- The user: "check if there is old DCCR data in Database" -- for the failure
-- rate by commissioning month (0393), which reads Field calls, their DCCR
-- review and the Product Database's Warranty Start. One grid, one row per year
-- of call registration: Field calls, how many have a DCCR row, how many of those
-- were loaded from the old register (imported), how many carry a spare category,
-- how many count as a failure (SPARE or Any Potential Effect YES), and how many
-- of those find their machine's Warranty Start; then the Product Database's
-- machines with a Warranty Start by year; then DCCR rows whose UC Number is on
-- no call. Years are printed as two digits (the CI log masks a four-digit one).
-- ===========================================================================
with calls as (
  select extract(year from c.reg_date)::int as yr, c.ucn, c.serial, c.product_name, c.reg_date,
         r.ucn as rucn, coalesce(r.imported, false) as imported,
         coalesce(btrim(r.spare_category), '') as cat, coalesce(r.any_potential_effect, '') as pe
    from public.field_calls c
    left join public.call_reviews r on r.ucn = c.ucn
   where c.cancelled_at is null
), fails as (
  select k.*, exists (
           select 1 from public.products pr
            where upper(btrim(coalesce(pr.serial_number, ''))) = upper(btrim(k.serial))
              and pr.warranty_start is not null and pr.warranty_start <= k.reg_date) as has_machine
    from calls k
   where btrim(coalesce(k.serial, '')) <> ''
     and (upper(k.cat) like '%SPARE%' or upper(btrim(k.pe)) = 'YES')
)
select 'field calls' as what, 'yr ' || lpad((yr % 100)::text, 2, '0') as year,
       count(*) as calls,
       count(rucn) as with_dccr,
       count(*) filter (where imported) as dccr_imported,
       count(*) filter (where cat <> '') as with_spare_category,
       (select count(*) from fails f where f.yr = calls.yr) as failures_spare_or_potential,
       (select count(*) from fails f where f.yr = calls.yr and f.has_machine) as failures_with_install_date
  from calls group by yr
union all
select 'machines with warranty start', 'yr ' || lpad((extract(year from warranty_start)::int % 100)::text, 2, '0'),
       count(*), null, null, null, null, null
  from public.products where warranty_start is not null group by 2
union all
select 'machines WITHOUT warranty start', '(all)', count(*), null, null, null, null, null
  from public.products where warranty_start is null
union all
-- DCCR ROWS WHOSE UC NUMBER IS ON NO CALL: loaded, but nothing can show them --
-- the DCCR view lists Field calls with their review, so a review of a call the
-- register does not hold is invisible. Split by imported or not, and by the
-- two-digit year in the UC Number (the first two characters, e.g. 25C...).
select 'DCCR rows on NO call', 'uc ' || left(btrim(r.ucn), 2),
       count(*), null, count(*) filter (where coalesce(r.imported, false)),
       count(*) filter (where btrim(coalesce(r.spare_category, '')) <> ''), null, null
  from public.call_reviews r
 where not exists (select 1 from public.field_calls f where f.ucn = r.ucn)
   and not exists (select 1 from public.installation_calls i where i.ucn = r.ucn)
   and not exists (select 1 from public.pm_calls m where m.ucn = r.ucn)
 group by 2
union all
select 'DCCR rows (all)', 'imported', count(*) filter (where coalesce(imported, false)), count(*), null, null, null, null
  from public.call_reviews
order by 1, 2;

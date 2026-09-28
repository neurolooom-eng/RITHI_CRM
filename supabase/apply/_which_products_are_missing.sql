-- ===========================================================================
-- WHICH PRODUCTS CAN THE PICKERS NOT OFFER, AND WHY?
--
--   Reported 2026-09-28, twice: a Call Registration Request offered 6 products
--   and could not find "Vega"; Product & Party Search offers 26.
--
-- EVERY PRODUCT PICKER READS ONE THING: `product_register_names` (0098), which
-- is `select distinct item_name from products`. No engineer scoping, no party
-- scoping, no row-level narrowing -- `products_read` is simply "signed in".
-- So the list IS the Product Database. A product is offered if, and only if,
-- at least one machine of it is in `products` with that exact spelling.
--
-- The Product Database was emptied and reloaded from a file on 2026-09-25.
-- Whatever that file did not carry, the pickers cannot offer -- and nothing
-- anywhere says so, because an absent name is not an error.
--
-- READ-ONLY. Three grids: what the register holds, what real work uses that the
-- register does NOT hold, and names that differ only in spelling.
-- ===========================================================================

-- ---- 1. what the pickers offer right now -----------------------------------
select item_name as offered_product, count(*) as machines
  from public.products
 where coalesce(btrim(item_name), '') <> ''
 group by item_name
 order by item_name;

-- ---- 2. products in REAL WORK that the register cannot offer ---------------
-- Named on a call, a spare request or a warranty/contract line, but with no
-- machine in the Product Database under that exact name. Each one is a product
-- an engineer will type and be told "Nothing matches".
with used as (
  select btrim(product_name) as name, 'calls'           as src from public.calls
  union all
  select btrim(product_name),         'spare requests'         from public.spare_requests
  union all
  select btrim(product_name),         'warranty sales'         from public.sale_items
  union all
  select btrim(product_name),         'contracts'              from public.contract_items
)
select u.name as product_in_use_but_not_offered,
       count(*) filter (where u.src = 'calls')          as on_calls,
       count(*) filter (where u.src = 'spare requests') as on_spares,
       count(*) filter (where u.src = 'warranty sales') as on_sales,
       count(*) filter (where u.src = 'contracts')      as on_contracts
  from used u
 where coalesce(u.name, '') <> ''
   and not exists (select 1 from public.products p where p.item_name = u.name)
 group by u.name
 order by count(*) desc;

-- ---- 3. the same product spelled two ways ----------------------------------
-- "EXTEND XT" and "EXTEND-XT", "VEGA" and "Vega ": the picker matches the
-- register's spelling exactly, so one of each pair is unreachable.
select upper(regexp_replace(btrim(item_name), '[\s\-]+', '', 'g')) as squashed,
       string_agg(distinct item_name, '  |  ') as spellings_in_the_register,
       count(distinct item_name) as how_many
  from public.products
 where coalesce(btrim(item_name), '') <> ''
 group by 1
having count(distinct item_name) > 1
 order by 1;

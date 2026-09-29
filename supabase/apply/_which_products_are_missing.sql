-- ===========================================================================
-- WHY DID A PRODUCT PICKER OFFER FEWER PRODUCTS THAN THE REGISTER HOLDS?
--
--   Reported 2026-09-28/29: a Call Registration Request offered 6 products
--   and could not find VEGA; Product & Party Search offered 26. The register
--   holds 44, VEGA among them with 268 machines.
--
-- A CORRECTION, BECAUSE THE FIRST VERSION OF THIS FILE WAS WRONG. It said the
-- picker lists exactly what the Product Database holds, so a short list meant
-- the 2026-09-25 reload had left products out. Grid 1 run on the live project
-- disproved that: all 44 are there. The data was never the problem.
--
-- THE CAUSE WAS A LOOP IN THE APP. When the one-request read of
-- `product_register_names` fails, the app falls back to walking `products` a
-- thousand rows at a time, sorted by name -- and that walk did `if (error)
-- break` and returned what it had reached AS THE WHOLE LIST. One failed page
-- out of ~20 gave the first 26 names alphabetically, ending at MONNAL T75,
-- which is exactly what was on screen; VEGA, 43rd, was always cut. Fixed in
-- v0.9.381: a failed page is retried and then refused, and the screen says the
-- list could not be loaded instead of offering a short one. `check:paging`
-- reproduces the 26-name cut from these very counts.
--
-- THAT FIX REMOVES THE LIE, NOT THE FAILURE. The fallback only ran because the
-- primary read failed for that login -- the labels carried no machine counts,
-- which only the primary read supplies. GRID 0 asks why, as the database sees
-- it. It is read as `postgres` here, so it tests the GRANT and the SETTINGS
-- the signed-in app depends on rather than impersonating anybody.
--
-- READ-ONLY.
-- ===========================================================================

-- ---- 0. can the signed-in app read the list in one request? ----------------
select to_regclass('public.product_register_names') is not null            as view_exists,
       case when to_regclass('public.product_register_names') is null then null
            else has_table_privilege('authenticated', 'public.product_register_names', 'select') end
                                                                              as signed_in_users_can_read_it,
       (select coalesce(bool_or(c.reloptions::text ~ 'security_invoker=(true|on)'), false)
          from pg_class c where c.oid = to_regclass('public.product_register_names')) as security_invoker,
       current_setting('jit')                                                 as jit_setting,
       (select count(*) from public.product_register_names)                   as names_it_returns;

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

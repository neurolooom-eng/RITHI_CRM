-- ===========================================================================
-- WHICH PRODUCT NAMES ARE IN USE? -- one grid, READ-ONLY.
--
-- Asked while normalising the Technical Note folder for bulk upload
-- (2026-09-30): a note is found by a call through its PRODUCT, so each note
-- must carry the product spelled exactly as the Product Database and the
-- Product Master spell it. This lists every name each of the two uses, with
-- how many machines / product lines carry it.
--
-- Nothing to change; paste and run.
-- ===========================================================================
select src, name, n
  from (
    select 'Product Database (machines)'::text as src, btrim(item_name) as name, count(*) as n
      from public.products
     where btrim(coalesce(item_name, '')) <> ''
     group by btrim(item_name)
    union all
    select 'Product Master (lines)', btrim(product_name), count(*)
      from public.product_master
     where btrim(coalesce(product_name, '')) <> ''
     group by btrim(product_name)
  ) x
 order by src, name;

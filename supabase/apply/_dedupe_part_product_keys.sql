-- ===========================================================================
-- WHY "parts + products: natural keys" STILL READS NO AFTER RUNNING THE BUNDLE
--
-- 0081 and 0082 do not force their unique indexes onto a table that cannot take
-- one. If `parts` already holds two rows with the same Item Details, or
-- `products` two rows with the same model+serial, they SKIP the index and print
-- a notice:
--
--   parts holds duplicate item details — de-duplicate, then re-run this file
--   products holds duplicate model+serial — de-duplicate, then re-run this file
--
-- A notice is easy to miss in a 3,000-line bundle, and the bundle still says it
-- succeeded — so `_status.sql` row 35 is the thing that tells you. Those rows
-- got in before the key existed, which is the whole reason the key exists.
--
-- Nothing references `parts` or `products` by foreign key, and neither table has
-- a trigger, so removing the older copy of a duplicate touches nothing else.
--
-- Run 1 and 2 to see what is there. Run 3 to remove the older copies, look at
-- what it prints, then COMMIT. Then re-run HandStock_X.sql to build the indexes,
-- and _status.sql row 35 to confirm.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. PARTS — two rows with the same Item Details.
-- ---------------------------------------------------------------------------
select count(*) as duplicate_keys, sum(n) - count(*) as rows_that_would_go
  from (select item_detail_key, count(*) as n from public.parts group by 1 having count(*) > 1) d;

select p.id, p.code, p.item_detail, p.active
  from public.parts p
  join (select item_detail_key from public.parts group by 1 having count(*) > 1) d
    on d.item_detail_key = p.item_detail_key
 order by p.item_detail_key, p.id
 limit 40;

-- ---------------------------------------------------------------------------
-- 2. PRODUCTS — two rows for the same machine (model + serial).
-- ---------------------------------------------------------------------------
select count(*) as duplicate_keys, sum(n) - count(*) as rows_that_would_go
  from (select machine_key, count(*) as n from public.products group by 1 having count(*) > 1) d;

select p.id, p.item_name, p.serial_number, p.party_name, p.created_at
  from public.products p
  join (select machine_key from public.products group by 1 having count(*) > 1) d
    on d.machine_key = p.machine_key
 order by p.machine_key, p.id
 limit 40;

-- ---------------------------------------------------------------------------
-- 3. KEEP THE LAST ONE LOADED, drop the earlier copies.
--
--    The highest id is the row the most recent upload wrote, which is the
--    corrected one — an upload that could not match on a key ADDED a row
--    instead of updating it, and that is exactly how these pairs were made.
-- ---------------------------------------------------------------------------
begin;

with dupes as (
  select id, row_number() over (partition by item_detail_key order by id desc) as rn
    from public.parts
)
delete from public.parts p using dupes d where d.id = p.id and d.rn > 1;

with dupes as (
  select id, row_number() over (partition by machine_key order by id desc) as rn
    from public.products
)
delete from public.products p using dupes d where d.id = p.id and d.rn > 1;

-- Nothing left to block the indexes?
select (select count(*) from (select item_detail_key from public.parts    group by 1 having count(*) > 1) a) as parts_left,
       (select count(*) from (select machine_key     from public.products group by 1 having count(*) > 1) b) as products_left;

-- commit;
-- rollback;

-- ---------------------------------------------------------------------------
-- 4. THEN: re-run HandStock_X.sql (it builds both indexes now that it can), and
--    _status.sql row 35 to confirm.
-- ---------------------------------------------------------------------------

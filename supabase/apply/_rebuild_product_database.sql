-- ===========================================================================
-- EMPTY THE PRODUCT DATABASE AND REBUILD IT FROM A BULK IMPORT.
--
--   The user, 2026-09-24: "delete all records in product database and re-build
--   through bulk import" -- asked for after being told what it costs, and
--   confirmed. This file does exactly that and nothing else.
--
-- READ-ONLY UNTIL YOU CHANGE ONE WORD. Line 60 reads `v_apply boolean := false`.
-- Run it as it stands and nothing is deleted: you get the counts below, and the
-- list of machines the reload file MUST contain. Change it to true and run
-- again to empty the table.
--
-- IT TAKES A BACKUP FIRST, AUTOMATICALLY. `products_backup_<yyyymmdd_hhmi>`,
-- a plain copy of every row, made in the same transaction as the delete. That
-- is not hedging against the decision -- it is what an irreversible bulk delete
-- on a live register costs to make reversible, and it costs nothing: there is
-- no foreign key onto `products` and no delete guard on it, so without a copy
-- the rows are simply gone. Drop it when the reload has been checked:
--     drop table public.products_backup_<stamp>;
--
-- WHAT IS LINKED BY TEXT, NOT BY KEY. Nothing references `products` by foreign
-- key. Calls, spare requests, contracts and feedback all find a machine by its
-- SERIAL as text, so the delete raises no error and blocks nothing -- it
-- silently orphans every serial lookup until the reload lands. The second
-- query below lists the model+serial pairs those registers actually use, which
-- is the set your file has to bring back. Diff it against the file BEFORE you
-- apply, not after.
--
-- THE RELOAD: Bulk Uploads -> Masters -> Product Database. The table is keyed
-- on `machine_key`, which the database generates from ITEM NAME + SERIAL
-- NUMBER -- so a row with either one blank forms no key and cannot load. Row 5
-- counts the rows in the register today that are in that state; expect your
-- file to have the same ones unless it has been cleaned.
--
-- TWO TRIGGERS WILL PUT ROWS BACK BY THEMSELVES: `zz_sale_item_to_product`
-- (0237) and the ownership-transfer sync (0238) INSERT into `products` when a
-- sale item or a transfer is written. So between the delete and the reload,
-- any edit to a sale or a transfer re-creates that one machine. Harmless for a
-- bulk reload -- the upload upserts on the same key -- but it is why the table
-- may not read zero if you look between the two steps.
--
-- ONE THING THE RELOAD DOES NOT FIX BY ITSELF: Item Status. It is stored, not
-- derived, so after the import it says whatever the FILE says. If the file's
-- Item Status was computed on an older date, the staleness comes straight back
-- -- which is the argument for the nightly refresh, separately.
-- ===========================================================================

do $rebuild$
declare
  -- ------------------------------------------------------------------ SWITCH
  -- false = report only (the default). true = back up, then DELETE EVERY ROW.
  v_apply  boolean := false;
  -- -------------------------------------------------------------------------
  v_rows   bigint;
  v_backup text := 'products_backup_' || to_char(now() at time zone 'Asia/Kolkata', 'YYYYMMDD_HH24MI');
begin
  select count(*) into v_rows from public.products;

  if not v_apply then
    raise notice 'DRY RUN. % row(s) would be copied to public.% and then deleted. Nothing has changed.', v_rows, v_backup;
    return;
  end if;

  execute format('create table public.%I as select * from public.products', v_backup);
  execute format('alter table public.%I enable row level security', v_backup);
  delete from public.products;

  raise notice 'DONE. % row(s) copied to public.% and deleted from public.products.', v_rows, v_backup;
  raise notice 'Now load the file: Bulk Uploads -> Masters -> Product Database.';
  raise notice 'When the reload is checked: drop table public.%;', v_backup;
end $rebuild$;

-- ---- what is there, and what the reload has to bring back ------------------
select 1 as row, 'machines in the Product Database now' as measure,
       (select count(*)::text from public.products) as value,
       'All of these go. They are copied to products_backup_<stamp> in the same transaction.' as note
union all
select 2, 'distinct machines referenced by CALLS',
       (select count(*)::text from (
          select distinct lower(btrim(product_name)), lower(btrim(serial))
            from public.calls where coalesce(btrim(serial), '') <> '') s),
       'Every one of these must be in the reload file, or those calls lose the machine behind them -- cover, party and history all resolve by serial.'
union all
select 3, 'distinct machines referenced by SPARE REQUESTS',
       (select count(*)::text from (
          select distinct lower(btrim(product_name)), lower(btrim(serial))
            from public.spare_requests where coalesce(btrim(serial), '') <> '') s),
       'Same again. A spare request whose machine is gone cannot re-derive its cover.'
union all
select 4, 'machines referenced by a call but NOT in the register today',
       (select count(*)::text from (
          select distinct lower(btrim(c.product_name)) as p, lower(btrim(c.serial)) as s
            from public.calls c
           where coalesce(btrim(c.serial), '') <> ''
             and not exists (select 1 from public.products x
                              where lower(btrim(x.serial_number)) = lower(btrim(c.serial))
                                and lower(btrim(x.item_name)) = lower(btrim(c.product_name)))) q),
       'These are ALREADY orphaned today -- the delete does not cause them. Useful as the baseline to compare against after the reload.'
union all
select 5, 'rows with a blank Item Name or Serial (no machine_key)',
       (select count(*)::text from public.products
         where coalesce(btrim(item_name), '') = '' or coalesce(btrim(serial_number), '') = ''),
       'The upload keys on machine_key, generated from ITEM NAME + SERIAL NUMBER. A row missing either cannot load at all, so rows like these will not come back unless the file fills both.';

-- ---- the exact list the reload file must contain ---------------------------
-- Model AND serial, because a machine is both. Compare this against your file
-- before applying; anything here that the file does not carry is a call or a
-- spare that will not find its machine afterwards.
select coalesce(nullif(btrim(m.product_name), ''), '(blank model)') as item_name,
       m.serial,
       count(*) filter (where m.src = 'call')  as calls,
       count(*) filter (where m.src = 'spare') as spare_requests
  from (
    select product_name, btrim(serial) as serial, 'call'::text as src
      from public.calls where coalesce(btrim(serial), '') <> ''
    union all
    select product_name, btrim(serial), 'spare'
      from public.spare_requests where coalesce(btrim(serial), '') <> ''
  ) m
 group by 1, 2
 order by (count(*) filter (where m.src = 'call')) desc, m.serial
 limit 1000;

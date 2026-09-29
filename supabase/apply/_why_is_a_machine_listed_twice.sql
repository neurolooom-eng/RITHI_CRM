-- ===========================================================================
-- WHY IS A MACHINE LISTED TWICE IN THE PRODUCT DATABASE?
--
-- READ-ONLY. Paste into the Supabase SQL editor and run. Nothing to change.
-- It prints one grid.
--
-- REPORTED 2026-09-29: once 0250 made the machine download fast, a device
-- stopped at "machine ids out of order after 4375". The download reads the
-- Product Database in order of the machine's id and expects every id ONCE;
-- the same id twice means the Product Database itself is showing that
-- machine on two rows. That is wrong on the Product Database screen too,
-- not only on the phone, so it is worth knowing why rather than hiding it.
--
-- A MACHINE IS ONE ROW OF `products`. The view adds its cover and its
-- engineer by joining three other things, and only a join that finds TWO
-- matches can double a machine:
--
--   * the Party Master, by the customer's name -- unique ONLY if the unique
--     index 0076 creates (parties_name_key_uniq) is on the project;
--   * the contract register -- the current definition (0239) picks ONE
--     contract per machine; the earlier one (0235) joined every contract LINE
--     for the machine's MC number and serial, and EVERY CONTRACT ENTRY for
--     that MC number, so a renewed contract, or an MC number entered twice,
--     doubles the machine;
--   * the installation call -- 0239 picks one.
--
-- HOW TO READ IT
--   row 'definition'  : 0239 or 0235 -- which version of the view the project
--                       is running. 0235 is the likely cause on its own.
--   row 'party key'   : whether the unique index on the customer's name is
--                       there.
--   row 'totals'      : rows in the view against machines in `products`. The
--                       difference is how many extra rows the joins produced.
--   the machine rows  : up to 25 doubled machines, each with how many Party
--                       Master rows, contract lines and contract entries
--                       match it -- whichever column is above 1 is the join
--                       doing it.
-- ===========================================================================
with dup as (
  select id, count(*) as copies
    from public.product_database
   group by id
  having count(*) > 1
),
sample as (
  select d.id, d.copies, p.item_name, p.serial_number, p.party_name, p.contract_number
    from dup d join public.products p on p.id = d.id
   order by d.id
   limit 25
)
select 1 as n, 'definition' as check_, null::bigint as machine_id,
       case when pg_get_viewdef(to_regclass('public.product_database'), true) like '%contract_pick%'
            then '0239 -- one contract per machine'
            else '0235 -- every contract line and entry is joined: run sales_contracts.sql' end as answer,
       null::bigint as copies, null::text as party_master_rows, null::text as contract_lines, null::text as contract_entries
union all
select 2, 'party key', null,
       case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'parties_name_key_uniq')
            then 'unique index on the customer''s name is there'
            else 'NO unique index on the customer''s name -- two Party Master rows can match one machine' end,
       null, null, null, null
union all
select 3, 'totals', null,
       (select count(*) from public.product_database)::text || ' rows in the view, '
         || (select count(*) from public.products)::text || ' machines, '
         || (select count(*) from dup)::text || ' machines listed more than once',
       null, null, null, null
union all
select 4, 'doubled machine', s.id,
       s.item_name || ' / ' || s.serial_number || ' / ' || coalesce(s.party_name, ''),
       s.copies,
       (select count(*)::text from public.parties pa where pa.name_key = lower(btrim(coalesce(s.party_name, '')))),
       (select count(*)::text from public.contract_items ci
         where ci.mc_number = s.contract_number
           and lower(btrim(ci.serial_number)) = lower(btrim(s.serial_number))),
       (select count(*)::text from public.contract_entries ce where ce.mc_number = s.contract_number)
  from sample s
order by 1, 3;

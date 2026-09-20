-- ===========================================================================
-- WHY IS PRODUCT DATABASE 2.0 EMPTY?
--
-- READ-ONLY, nothing is written. Paste into the Supabase SQL editor and run.
-- One grid.
--
-- IT ASKS AS THE ADMIN, ON PURPOSE. The SQL editor runs as the service role, so
-- these counts are what EXISTS, with no row-level security in the way. That is
-- the right question first: an empty screen can mean the reader is filtered OR
-- that there is nothing to show, and those need different answers. If every
-- count below is healthy and the screen is still empty, the fault is on the
-- READER's side and `_why_is_it_empty_2.sql` is the file for that.
--
-- WHAT 2.0 REQUIRES, AND WHY IT CAN LEGITIMATELY SHOW LESS THAN `machine_cover`:
-- a machine is its MODEL **and** its SERIAL. A register row carrying a serial
-- but NO product name cannot be identified as a machine -- serials repeat
-- across models -- so it is not listed. `machine_cover` requires only the
-- serial, which is why it can show rows 2.0 does not, and why the ones it shows
-- can be two machines merged into one.
--
-- ROWS 4, 8 AND 12 ARE THE ANSWER. Each is "rows this register offers 2.0".
-- If a register's total is large and its BOTH count is 0, the product name is
-- missing from that register and THAT is why the screen is empty -- not RLS,
-- not the grant, and not the view.
-- ===========================================================================
select q.n as "#", q.item as "Question", q.answer as "Count", q.means as "What it means"
  from (
    select
      (select count(*) from public.warranty_sale_details)                       as w_all,
      (select count(*) from public.warranty_sale_details
        where coalesce(btrim(serial_number), '') <> '')                         as w_ser,
      (select count(*) from public.warranty_sale_details
        where coalesce(btrim(product_name), '') <> '')                          as w_prod,
      (select count(*) from public.warranty_sale_details
        where coalesce(btrim(serial_number), '') <> ''
          and coalesce(btrim(product_name), '') <> '')                          as w_both,
      (select count(*) from public.contract_details)                            as c_all,
      (select count(*) from public.contract_details
        where coalesce(btrim(serial_number), '') <> '')                         as c_ser,
      (select count(*) from public.contract_details
        where coalesce(btrim(product_name), '') <> '')                          as c_prod,
      (select count(*) from public.contract_details
        where coalesce(btrim(serial_number), '') <> ''
          and coalesce(btrim(product_name), '') <> '')                          as c_both,
      (select count(*) from public.product_additional_entries)                   as a_all,
      (select count(*) from public.product_additional_entries
        where coalesce(btrim(serial_number), '') <> '')                         as a_ser,
      (select count(*) from public.product_additional_entries
        where coalesce(btrim(item_name), '') <> '')                             as a_prod,
      (select count(*) from public.product_additional_entries
        where coalesce(btrim(serial_number), '') <> ''
          and coalesce(btrim(item_name), '') <> '')                             as a_both,
      (select count(*) from public.product_database_v2)                          as v2,
      (select count(*) from public.machine_cover)                                as mc,
      (select count(*) from public.products)                                     as prods,
      (select count(*) from public.products
        where coalesce(btrim(item_name), '') <> ''
          and coalesce(btrim(serial_number), '') <> '')                          as prods_both,
      (select count(*) from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
        where n.nspname = 'public' and cl.relname = 'product_database_v2')        as view_there,
      (select count(*) from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'product_database_v2'
          and grantee = 'authenticated' and privilege_type = 'SELECT')            as granted
  ) c,
  lateral (values
    (1,  'Is the 2.0 view on this project at all?', c.view_there::text,
         '1 = yes. 0 means product_database_2.sql has not been applied.'),
    (2,  'Can the app''s role read it?', c.granted::text,
         '1 = yes (SELECT granted to authenticated). 0 means the screen would report a permission error, not an empty list.'),
    (3,  '--- WARRANTY SALE DETAILS ---', c.w_all::text, 'rows in that register'),
    (4,  '   ...offering 2.0 a machine (serial AND product name)', c.w_both::text,
         'THIS is what 2.0 can use. If it is 0 while the total above is large, the register carries no product name and that is the whole answer.'),
    (5,  '   ...with a serial but NO product name', (c.w_ser - c.w_both)::text,
         'Not listed: a serial alone cannot identify a machine, because serials repeat across models.'),
    (6,  '   ...with a product name but NO serial', (c.w_prod - c.w_both)::text, 'Same, the other way round.'),
    (7,  '--- CONTRACT DETAILS ---', c.c_all::text, 'rows in that register'),
    (8,  '   ...offering 2.0 a machine (serial AND product name)', c.c_both::text, 'As row 4.'),
    (9,  '   ...with a serial but NO product name', (c.c_ser - c.c_both)::text, 'Not listed, same reason.'),
    (10, '--- ADDITIONAL ENTRIES ---', c.a_all::text, 'rows recovered by hand'),
    (11, '   ...offering 2.0 a machine (serial AND item name)', c.a_both::text, 'As row 4.'),
    (12, '   ...with a serial but NO item name', (c.a_ser - c.a_both)::text, 'Not listed, same reason.'),
    (13, 'MACHINES PRODUCT DATABASE 2.0 LISTS', c.v2::text,
         'The distinct machines from rows 4, 8 and 11 together. 0 here with healthy numbers above would be a fault in the view; 0 with 0 above is the registers.'),
    (14, 'machine_cover lists', c.mc::text,
         'For contrast. It needs only a SERIAL, so it can show rows 2.0 will not -- and merges machines that share one.'),
    (15, 'The Product Database you have today', c.prods::text, 'public.products, untouched by any of this.'),
    (16, '   ...of those, with BOTH a model and a serial', c.prods_both::text,
         'If this is large while rows 4/8/11 are small, the machines are in the install base but not in the SALE or CONTRACT registers -- which is a different problem from an empty screen, and worth saying out loud.')
  ) as q(n, item, answer, means)
 order by q.n;

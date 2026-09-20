-- ===========================================================================
-- PRODUCT DATABASE 2.0 BESIDE THE ONE YOU HAVE.
--
-- READ-ONLY, nothing is written. Paste into the Supabase SQL editor and run.
-- One grid.
--
-- WHY IT EXISTS. `docs/COVER_REQUIREMENTS.md` ranks the gaps by CONSEQUENCE,
-- because this repository cannot see the live rows -- it can say that keying on
-- the serial alone MERGES machines, and cannot say how many. This counts them
-- on your data, so the ranking can be argued with.
--
-- IT CHANGES NOTHING. `products` and `machine_cover` are read, not written, and
-- Product Database 2.0 is a view beside them. Every number below is a
-- disagreement to look at, not a repair that has happened.
--
-- IF IT ERRORS with `relation "product_database_v2" does not exist`, 0218 has
-- not been applied on this project yet -- run `sales_contracts.sql`.
-- ===========================================================================
select q.n as "#", q.item as "Question", q.answer as "Count", q.means as "What it means"
  from (
    select
      (select count(*) from public.products)                             as old_rows,
      (select count(*) from public.product_database_v2)                  as new_rows,
      (select count(*) from public.machine_cover)                        as cover_rows,
      (select count(*) from public.product_database_v2 v
        where not exists (select 1 from public.products p
                           where public.machine_key(p.item_name, p.serial_number) = v.machine_key))
                                                                         as new_only,
      (select count(*) from public.product_database_v2 v
        join public.products p
          on public.machine_key(p.item_name, p.serial_number) = v.machine_key
       where coalesce(p.item_status,'') <> coalesce(v.item_status,''))    as status_differs,
      (select count(*) from public.product_database_v2
        where item_status = 'WGP')                                        as wgp,
      (select count(*) from public.product_database_v2
        where item_status = 'CONTRACT (TYPE NOT RECORDED)')               as typeless,
      (select count(*) from public.product_database_v2 where in_additional_entries
          and not in_warranty_register and not in_contract_register)      as only_additional,
      (select count(*) from public.product_database_v2
        where transfer_date is not null)                                  as transferred,
      (select count(*) from public.product_database_v2
        where warranty_from like 'Installation call%')                    as start_from_install,
      (select count(*) from (
         select public.machine_key(product_name, serial_number) as k
           from public.warranty_sale_details
          where coalesce(btrim(serial_number),'') <> ''
          union
         select public.machine_key(product_name, serial_number)
           from public.contract_details
          where coalesce(btrim(serial_number),'') <> ''
       ) t
        join (select lower(btrim(serial_number)) as s, count(distinct public.machine_key(product_name, serial_number)) c
                from public.warranty_sale_details
               where coalesce(btrim(serial_number),'') <> ''
               group by 1 having count(distinct public.machine_key(product_name, serial_number)) > 1) d
          on split_part(t.k,'|',2) = regexp_replace(d.s,'[^a-z0-9]','','g'))
                                                                          as merged_by_serial_key
  ) c,
  lateral (values
    (1, 'Machines in the Product Database you have today', c.old_rows::text,
        'public.products — the stored table. Untouched by any of this.'),
    (2, 'Machines Product Database 2.0 lists', c.new_rows::text,
        'Derived from the warranty sale register, the contract register and the additional entries.'),
    (3, 'Machines machine_cover lists', c.cover_rows::text,
        'Two registers only, keyed on the SERIAL ALONE. Lower than row 2 partly because it merges machines that share a serial.'),
    (4, 'Rows where 2.0 and the serial-only key disagree about how many machines there are',
        c.merged_by_serial_key::text,
        'Machines sharing a serial under different models. machine_cover folds each such group into ONE row wearing one machine''s cover; 2.0 keeps them apart. This is gap 1.'),
    (5, 'Machines 2.0 knows that the old Product Database does not', c.new_only::text,
        'Mostly machines recovered into Additional Entries, and machines the registers hold but the stored table never received.'),
    (6, 'Machines where the item status DISAGREES with the stored one', c.status_differs::text,
        'The stored status is whatever the import said and is never recomputed; 2.0 derives it from the periods on every read. Each of these is a machine being described by an out-of-date answer. This is gap 6.'),
    (7, '   ...of which are inside warranty today', c.wgp::text,
        'Under 2.0''s rule warranty decides BEFORE contract, so a machine inside both reads WGP here and reads its contract type in machine_cover. This is gap 4.'),
    (8, 'Machines under a contract whose TYPE was never recorded', c.typeless::text,
        'These read CONTRACT (TYPE NOT RECORDED) rather than being assumed comprehensive. Every one is a contract row to correct. This is gap 5.'),
    (9, 'Machines known ONLY to Additional Entries', c.only_additional::text,
        'Invisible to machine_cover entirely — they have no cover there at all. This is gap 3.'),
    (10, 'Machines with a recorded ownership transfer', c.transferred::text,
        'Their party is decided by the latest dated evidence here. No other cover view reads the transfer register. This is gap 2.'),
    (11, 'Machines whose warranty starts from the INSTALLATION call', c.start_from_install::text,
        'The Warranty Start Date the engineer was asked for, finally read back. Nothing else in the system uses it. This is gap 7.')
  ) as q(n, item, answer, means)
 order by q.n;

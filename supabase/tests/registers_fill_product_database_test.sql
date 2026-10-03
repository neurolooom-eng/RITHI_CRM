-- ===========================================================================
-- THE THREE REGISTERS FILL THE PRODUCT DATABASE, BY PRODUCT + SERIAL (0330).
--
--   The user, 2026-10-03: a new sale entry inserts the product + serial with
--   all its warranty details; a contract entry updates that product + serial
--   with all its contract details (its PM visits overwriting the sale's, and a
--   machine not yet held inserted); an ownership transfer updates it with the
--   transfer's details (Ref and Date).
--
--   THE NEGATIVE IS THE POINT: two models share serial 'RF-219'. The contract
--   on one must not appear on the other, which is what the serial-only sync
--   (0036) did.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.parties (party_name, address, city, state, service_engineer) values
  ('RF BUYER', '1 Buyer Road', 'Chennai', 'Tamil Nadu', 'ENG B'),
  ('RF NEW',   '9 New Street', 'Bengaluru', 'Karnataka', 'ENG N');

\echo '--- 1. A SALE INSERTS THE MACHINE WITH ITS WARRANTY DETAILS ---'
insert into public.sale_entries (sa_number, party_name, invoice_no, invoice_date, warranty_start, warranty_end,
                                 warranty_years, warranty_months, pm_visits)
values ('SA-RF1', 'RF BUYER', 'INV-77', '2026-01-05', '2026-01-10', '2028-01-09', 2, 0, 4);
insert into public.sale_items (uid, sa_number, product_name, serial_number, accessories_included) values
  ('RF-U1', 'SA-RF1', 'RF VENT', 'RF-219', true),
  ('RF-U2', 'SA-RF1', 'RF CPAP', 'RF-219', false);
select 'sale inserts both machines with their warranty fields',
       (select count(*) from public.products where serial_number = 'RF-219') = 2
   and (select (warranty_number, warranty_start, warranty_end, pm_visits, invoice_no, invoice_date,
                warranty_years, warranty_months, accessories_included)
              = ('SA-RF1', date '2026-01-10', date '2028-01-09', 4, 'INV-77', date '2026-01-05', 2::numeric, 0, true)
          from public.products where item_name = 'RF VENT' and serial_number = 'RF-219') as ok;

\echo '--- 2. A CONTRACT UPDATES THAT PRODUCT + SERIAL ONLY, AND ITS PM VISITS OVERWRITE ---'
insert into public.contract_entries (mc_number, party_name, contract_type, contract_start, contract_end, pm_visits_total, status)
values ('MC-RF1', 'RF BUYER', 'AMC', '2028-01-10', '2029-01-09', 2, 'Active');
insert into public.contract_items (uid, mc_number, product_name, serial_number) values ('RF-C1', 'MC-RF1', 'RF VENT', 'RF-219');
select 'contract lands on RF VENT',
       (contract_number, contract_type, contract_start, contract_end, pm_visits, contract_status_keyed)
       = ('MC-RF1', 'AMC', date '2028-01-10', date '2029-01-09', 2, 'Active') as ok
  from public.products where item_name = 'RF VENT' and serial_number = 'RF-219';
select 'and NOT on RF CPAP, which shares the serial',
       coalesce(contract_number, '') = '' and pm_visits = 4 as ok
  from public.products where item_name = 'RF CPAP' and serial_number = 'RF-219';

\echo '--- 3. RE-SAVING THE SALE DOES NOT PUT THE SALE''S PM VISITS BACK ---'
update public.sale_entries set other_details = 're-saved' where sa_number = 'SA-RF1';
update public.sale_items set other_details = 're-saved' where uid = 'RF-U1';
select 'contract PM visits survive a re-saved sale', pm_visits = 2 as ok
  from public.products where item_name = 'RF VENT' and serial_number = 'RF-219';

\echo '--- 4. A CONTRACT FOR A MACHINE NOT YET HELD INSERTS IT ---'
insert into public.contract_items (uid, mc_number, product_name, serial_number, party_name) values ('RF-C2', 'MC-RF1', 'RF CONC', 'RF-500', 'RF BUYER');
select 'contract-only machine inserted with its contract and owner''s address',
       (party_name, contract_number, pm_visits, address) = ('RF BUYER', 'MC-RF1', 2, '1 Buyer Road') as ok
  from public.products where item_name = 'RF CONC' and serial_number = 'RF-500';

\echo '--- 5. A TRANSFER CARRIES ITS REF AND DATE ---'
insert into public.ownership_transfers (serial_number, item_name, from_party, to_party, transfer_date, reference_no)
values ('RF-219', 'RF VENT', 'RF BUYER', 'RF NEW', '2026-06-01', 'OT-RF-1');
select 'transfer ref, date and new owner on RF VENT',
       (party_name, transfer_ref, transfer_date, address) = ('RF NEW', 'OT-RF-1', date '2026-06-01', '9 New Street') as ok
  from public.products where item_name = 'RF VENT' and serial_number = 'RF-219';
select 'and nothing of it on RF CPAP',
       transfer_ref is null and party_name = 'RF BUYER' as ok
  from public.products where item_name = 'RF CPAP' and serial_number = 'RF-219';

\echo '--- 6. A CONTRACT NUMBER LEFT BY THE SERIAL-ONLY SYNC IS CLEARED ---'
update public.products set contract_number = 'MC-RF1', contract_type = 'AMC'
 where item_name = 'RF CPAP' and serial_number = 'RF-219';
select public.sync_product_cover('RF-219');
select 'another model''s contract cleared from RF CPAP; RF VENT keeps its own',
       (select coalesce(contract_number, '') = '' and coalesce(contract_type, '') = '' from public.products
         where item_name = 'RF CPAP' and serial_number = 'RF-219')
   and (select contract_number = 'MC-RF1' from public.products
         where item_name = 'RF VENT' and serial_number = 'RF-219') as ok;

\echo '--- 7. AN IMPORTED CONTRACT NUMBER NO REGISTER HOLDS IS LEFT ALONE ---'
update public.products set contract_number = 'MC-OLD-IMPORT' where item_name = 'RF CPAP' and serial_number = 'RF-219';
select public.sync_product_cover('RF-219');
select 'imported value kept', contract_number = 'MC-OLD-IMPORT' as ok
  from public.products where item_name = 'RF CPAP' and serial_number = 'RF-219';

\echo '--- 8. THE REFRESH AND THE ONE-TIME RE-SYNC ---'
select 'refresh counts machines', public.refresh_product_cover() >= 3 as ok;
select 're-sync recorded', exists (select 1 from public.one_time_fixes_done where name = '0330_product_database_resync') as ok;
select 'backup and sync closed to the API',
       not has_table_privilege('authenticated', 'public.products_resync_backup', 'SELECT')
   and not has_function_privilege('authenticated', 'public.sync_product_machine(text,text)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.sync_product_machine(text,text)', 'EXECUTE') as ok;

-- ===========================================================================
-- A TRANSFERRED MACHINE CARRIES ITS NEW OWNER'S ADDRESS (0329, D-098).
--
--   The user, 2026-10-03: "Transferred machine should carry the new owner's
--   address."
--
--   Proves: re-saving the sale of a machine since transferred keeps the NEW
--   owner's Party Master address, city, state and Service Engineer; a machine
--   still with its buyer keeps the sale's; a transferee whose Party Master
--   leaves a field blank does not blank the machine's; and a machine with no
--   sale at all takes its new owner's address from the transfer itself.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.parties (party_name, party_type, address, city, state, service_engineer) values
  ('TA BUYER',  'CUSTOMER', '1 Buyer Road',  'Chennai',   'Tamil Nadu',  'ENG BUYER'),
  ('TA NEW',    'CUSTOMER', '9 New Street',  'Bengaluru', 'Karnataka',   'ENG NEW'),
  ('TA BLANK',  'CUSTOMER', '',              '',          '',            ''),
  ('TA STAYS',  'CUSTOMER', '5 Stay Lane',   'Madurai',   'Tamil Nadu',  'ENG STAY');

insert into public.sale_entries (sa_number, party_name, address, city, state, engineer, warranty_start, warranty_end)
values ('SA-TA1', 'TA BUYER', '1 Buyer Road', 'Chennai', 'Tamil Nadu', 'ENG BUYER', '2026-01-01', '2027-12-31'),
       ('SA-TA2', 'TA STAYS', '5 Stay Lane',  'Madurai', 'Tamil Nadu', 'ENG STAY',  '2026-01-01', '2027-12-31'),
       ('SA-TA3', 'TA BUYER', '1 Buyer Road', 'Chennai', 'Tamil Nadu', 'ENG BUYER', '2026-01-01', '2027-12-31');
insert into public.sale_items (uid, sa_number, product_name, serial_number) values
  ('TA-U1', 'SA-TA1', 'TA VENT', 'TA-1'),
  ('TA-U2', 'SA-TA2', 'TA VENT', 'TA-2'),
  ('TA-U3', 'SA-TA3', 'TA VENT', 'TA-3');

-- TA-1 goes to TA NEW; TA-3 to TA BLANK, whose Party Master has nothing.
insert into public.ownership_transfers (serial_number, item_name, from_party, to_party, transfer_date, reference_no)
values ('TA-1', 'TA VENT', 'TA BUYER', 'TA NEW',   current_date, 'TA-REF-1'),
       ('TA-3', 'TA VENT', 'TA BUYER', 'TA BLANK', current_date, 'TA-REF-3');

\echo '--- 1. A TRANSFERRED MACHINE HAS ITS NEW OWNER''S ADDRESS ---'
select 'transferred machine reads the new owner',
       (party_name, address, city, state, service_engineer)
       = ('TA NEW', '9 New Street', 'Bengaluru', 'Karnataka', 'ENG NEW') as ok
  from public.products where serial_number = 'TA-1';

\echo '--- 2. ...AND KEEPS IT WHEN THE SALE IS RE-SAVED ---'
update public.sale_entries set other_details = 're-saved' where sa_number = 'SA-TA1';
update public.sale_items set other_details = 're-saved' where uid = 'TA-U1';
select 'still the new owner after the sale is re-saved',
       (party_name, address, city, state, service_engineer)
       = ('TA NEW', '9 New Street', 'Bengaluru', 'Karnataka', 'ENG NEW') as ok
  from public.products where serial_number = 'TA-1';

\echo '--- 3. A MACHINE STILL WITH ITS BUYER KEEPS THE SALE''S ADDRESS ---'
update public.sale_entries set other_details = 're-saved' where sa_number = 'SA-TA2';
select 'untransferred machine reads the sale',
       (party_name, address, city, state, service_engineer)
       = ('TA STAYS', '5 Stay Lane', 'Madurai', 'Tamil Nadu', 'ENG STAY') as ok
  from public.products where serial_number = 'TA-2';

\echo '--- 4. A BLANK PARTY MASTER FIELD DOES NOT BLANK THE MACHINE ---'
update public.products set address = 'Kept by hand', city = 'Salem' where serial_number = 'TA-3';
update public.sale_entries set other_details = 're-saved' where sa_number = 'SA-TA3';
select 'blank Party Master keeps the machine''s own values',
       (party_name, address, city) = ('TA BLANK', 'Kept by hand', 'Salem') as ok
  from public.products where serial_number = 'TA-3';

\echo '--- 5. A MACHINE WITH NO SALE TAKES ITS NEW OWNER''S ADDRESS FROM THE TRANSFER ---'
insert into public.products (party_name, item_name, serial_number, address, city, state, service_engineer)
values ('TA BUYER', 'TA VENT', 'TA-9', '1 Buyer Road', 'Chennai', 'Tamil Nadu', 'ENG BUYER');
insert into public.ownership_transfers (serial_number, item_name, from_party, to_party, transfer_date, reference_no)
values ('TA-9', 'TA VENT', 'TA BUYER', 'TA NEW', current_date, 'TA-REF-9');
select 'no-sale machine reads the new owner',
       (party_name, address, city, state, service_engineer)
       = ('TA NEW', '9 New Street', 'Bengaluru', 'Karnataka', 'ENG NEW') as ok
  from public.products where serial_number = 'TA-9';

\echo '--- 6. THE ONE-TIME REPAIR WAS RECORDED, AND ITS BACKUP IS NOT READABLE THROUGH THE API ---'
select 'repair recorded', exists (select 1 from public.one_time_fixes_done where name = '0329_new_owner_address') as ok;
select 'backup closed to the API',
       not has_table_privilege('authenticated', 'public.products_new_owner_address_backup', 'SELECT')
   and not has_table_privilege('anon', 'public.products_new_owner_address_backup', 'SELECT') as ok;

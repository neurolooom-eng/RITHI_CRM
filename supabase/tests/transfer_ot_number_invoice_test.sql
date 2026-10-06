-- ===========================================================================
-- AN OWNERSHIP TRANSFER: ITS OT NUMBER, ITS INVOICE, ITS FILES (0391).
--
--   The user, 2026-10-06: the OT number auto-generated, continuing OTnnnn;
--   an invoice on a transfer goes to the Product Database with or without a
--   fresh warranty; files kept with the transfer.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end, warranty_months, invoice_no, invoice_date)
values ('SA-ON1', 'ON OLD HOSP', '2024-01-01', '2024-12-31', 12, 'INV-SALE', '2024-01-01');
insert into public.sale_items (uid, sa_number, product_name, serial_number) values
  ('ON-U1', 'SA-ON1', 'ON VENT', 'ON-1'),
  ('ON-U2', 'SA-ON1', 'ON VENT', 'ON-2'),
  ('ON-U3', 'SA-ON1', 'ON VENT', 'ON-3');

\echo '--- 1. A loaded transfer keeps its own OT number; a customer reference is not one ---'
insert into public.ownership_transfers (serial_number, item_name, to_party, transfer_date, reference_no)
values ('ON-1', 'ON VENT', 'ON HOSP A', '2025-01-01', 'OT1432');
insert into public.ownership_transfers (serial_number, item_name, to_party, transfer_date, reference_no)
values ('ON-2', 'ON VENT', 'ON HOSP A', '2025-01-02', 'CUST-REF-99999');
select 'the loaded OT1432 is kept', exists (select 1 from public.ownership_transfers where reference_no = 'OT1432') as ok;

\echo '--- 2. A transfer saved with no number gets the next one ---'
insert into public.ownership_transfers (serial_number, item_name, to_party, transfer_date)
values ('ON-3', 'ON VENT', 'ON HOSP B', '2025-02-01');
select 'numbered OT1433, after the highest OTnnnn', (select reference_no from public.ownership_transfers where serial_number = 'ON-3') = 'OT1433' as ok;
insert into public.ownership_transfers (serial_number, item_name, to_party, transfer_date)
values ('ON-1', 'ON VENT', 'ON HOSP C', '2025-03-01');
select '...and the next OT1434',
       (select reference_no from public.ownership_transfers where serial_number = 'ON-1' and to_party = 'ON HOSP C') = 'OT1434' as ok;

\echo '--- 3. An edit cannot blank the number ---'
update public.ownership_transfers set reference_no = '' where reference_no = 'OT1433';
select 'blanking keeps OT1433', exists (select 1 from public.ownership_transfers where reference_no = 'OT1433') as ok;

\echo '--- 4. An invoice on a transfer reaches the machine, with no fresh warranty ---'
update public.ownership_transfers set invoice_no = ' INV-OT-1 ', invoice_date = '2025-03-01'
 where reference_no = 'OT1434';
select 'invoice trimmed on the transfer', (select invoice_no from public.ownership_transfers where reference_no = 'OT1434') = 'INV-OT-1' as ok;
select 'machine shows the transfer''s invoice; the warranty stays the sale''s',
       (invoice_no, invoice_date, warranty_number) = ('INV-OT-1', date '2025-03-01', 'SA-ON1') as ok
  from public.products where item_name = 'ON VENT' and serial_number = 'ON-1';
select 'a machine whose transfer has no invoice keeps the sale''s',
       (invoice_no, invoice_date) = ('INV-SALE', date '2024-01-01') as ok
  from public.products where item_name = 'ON VENT' and serial_number = 'ON-3';

\echo '--- 5. The old sale saved again does not take it back; a newer sale does ---'
update public.sale_entries set other_details = 're-saved' where sa_number = 'SA-ON1';
select 'old sale re-saved: still the transfer''s invoice', invoice_no = 'INV-OT-1' as ok
  from public.products where item_name = 'ON VENT' and serial_number = 'ON-1';
insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end, warranty_months, invoice_no, invoice_date)
values ('SA-ON2', 'ON HOSP D', '2026-01-01', '2026-12-31', 12, 'INV-RESALE', '2026-01-01');
insert into public.sale_items (uid, sa_number, product_name, serial_number) values ('ON-U4', 'SA-ON2', 'ON VENT', 'ON-1');
select 'a re-sale after the transfer shows its own invoice', invoice_no = 'INV-RESALE' as ok
  from public.products where item_name = 'ON VENT' and serial_number = 'ON-1';

\echo '--- 6. Files are a list ---'
update public.ownership_transfers set attachments = '[{"name":"deed.pdf","url":"https://drive.google.com/file/d/x/view"}]'
 where reference_no = 'OT1433';
select 'a file list is kept', jsonb_array_length((select attachments from public.ownership_transfers where reference_no = 'OT1433')) = 1 as ok;
\echo 'expect ERROR: attachments must be a list'
update public.ownership_transfers set attachments = '{"name":"x"}' where reference_no = 'OT1433';

\echo '--- 7. A fresh warranty is numbered by the auto OT number ---'
insert into public.ownership_transfers (serial_number, item_name, to_party, transfer_date, warranty_start, warranty_months)
values ('ON-2', 'ON VENT', 'ON HOSP E', '2026-05-01', '2026-05-01', 12);
select 'fresh warranty saved with no typed number: machine numbered OT1435',
       warranty_number = 'OT1435' as ok
  from public.products where item_name = 'ON VENT' and serial_number = 'ON-2';

\echo '--- 8. Closed to the API ---'
select 'numbering functions not callable',
       not has_function_privilege('authenticated', 'public.ot_next_no()', 'EXECUTE')
   and not has_function_privilege('anon', 'public.ownership_transfer_number()', 'EXECUTE') as ok;

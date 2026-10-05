-- ===========================================================================
-- A TRANSFER CAN GIVE THE NEW OWNER A FRESH WARRANTY (0383).
--
--   The user, 2026-10-05: "During Transfer, the new Owner gets a Fresh
--   warranty date" -- optional per transfer, the Warranty Number becoming the
--   transfer's OT number (its Reference no.), worked out as Warranty Entry is:
--   start + months, the years and the end derived.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end, warranty_months)
values ('SA-FW1', 'FW OLD HOSP', '2024-01-01', '2024-12-31', 12);
insert into public.sale_items (uid, sa_number, product_name, serial_number) values
  ('FW-U1', 'SA-FW1', 'FW VENT', 'FW-1'),
  ('FW-U2', 'SA-FW1', 'FW VENT', 'FW-2'),
  ('FW-U3', 'SA-FW1', 'FW CPAP', 'FW-1');

\echo '--- 1. A transfer with no fresh warranty leaves the sale''s warranty ---'
insert into public.ownership_transfers (serial_number, item_name, to_party, transfer_date, reference_no)
values ('FW-2', 'FW VENT', 'FW NEW HOSP', '2026-02-01', 'OT-FW2');
select 'no fresh warranty: sale''s number and dates stay',
       (warranty_number, warranty_start, warranty_end) = ('SA-FW1', date '2024-01-01', date '2024-12-31') as ok
  from public.products where item_name = 'FW VENT' and serial_number = 'FW-2';

\echo '--- 2. A fresh warranty: years and end worked out, typed ones discarded ---'
insert into public.ownership_transfers (serial_number, item_name, to_party, transfer_date, reference_no,
                                        warranty_start, warranty_months, warranty_years, warranty_end)
values ('FW-1', 'FW VENT', 'FW NEW HOSP', '2026-01-31', 'OT-FW1', '2026-01-31', 12, 99, '2099-01-01');
select 'the transfer records 12 months, 1 year, ending 30-Jan-2027',
       (warranty_months, warranty_years, warranty_end) = (12::numeric, 1.00::numeric, date '2027-01-30') as ok
  from public.ownership_transfers where reference_no = 'OT-FW1';

\echo '--- 3. ...and the machine wears it, numbered with the OT number ---'
select 'machine: OT number, fresh dates, 12 months, WGP',
       (warranty_number, warranty_start, warranty_end, warranty_months, item_status)
       = ('OT-FW1', date '2026-01-31', date '2027-01-30', 12, 'WGP') as ok
  from public.products where item_name = 'FW VENT' and serial_number = 'FW-1';
select 'the other model sharing the serial keeps the sale''s',
       (warranty_number, warranty_start) = ('SA-FW1', date '2024-01-01') as ok
  from public.products where item_name = 'FW CPAP' and serial_number = 'FW-1';
select 'the sale line is not touched',
       (select coalesce(i.warranty_start, h.warranty_start) from public.sale_items i
          join public.sale_entries h on h.sa_number = i.sa_number where i.uid = 'FW-U1') = date '2024-01-01' as ok;

\echo '--- 4. Re-saving the OLD sale does not take the warranty back ---'
update public.sale_entries set other_details = 're-saved' where sa_number = 'SA-FW1';
select 'fresh warranty survives the old sale saved again',
       (warranty_number, warranty_start) = ('OT-FW1', date '2026-01-31') as ok
  from public.products where item_name = 'FW VENT' and serial_number = 'FW-1';

\echo '--- 5. A NEWER sale does ---'
insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end, warranty_months)
values ('SA-FW2', 'FW NEW HOSP', '2026-06-01', '2028-05-31', 24);
insert into public.sale_items (uid, sa_number, product_name, serial_number) values ('FW-U4', 'SA-FW2', 'FW VENT', 'FW-1');
select 'a re-sale after the transfer wears its own warranty',
       (warranty_number, warranty_start) = ('SA-FW2', date '2026-06-01') as ok
  from public.products where item_name = 'FW VENT' and serial_number = 'FW-1';

\echo '--- 6. The rules on the form are the database''s too ---'
\echo 'expect ERROR: a fresh warranty needs its period'
insert into public.ownership_transfers (serial_number, item_name, to_party, transfer_date, reference_no, warranty_start)
values ('FW-2', 'FW VENT', 'FW THIRD HOSP', '2026-03-01', 'OT-FW3', '2026-03-01');
\echo 'expect ERROR: a fresh warranty needs the Reference no.'
insert into public.ownership_transfers (serial_number, item_name, to_party, transfer_date, warranty_start, warranty_months)
values ('FW-2', 'FW VENT', 'FW THIRD HOSP', '2026-03-01', '2026-03-01', 12);
select 'a period with no start is not a warranty',
       (select warranty_months is null and warranty_end is null from public.ownership_transfers where reference_no = 'OT-FW2') as ok;
update public.ownership_transfers set warranty_months = 12 where reference_no = 'OT-FW2';
select '...months alone are cleared',
       (select warranty_months is null from public.ownership_transfers where reference_no = 'OT-FW2') as ok;

update public.ownership_transfers set warranty_start = '2026-01-31', warranty_months = 1 where reference_no = 'OT-FW2';
select 'month overflow matches addPeriod: 31-Jan + 1 month ends 2-Mar',
       (select warranty_end from public.ownership_transfers where reference_no = 'OT-FW2') = date '2026-03-02' as ok;

\echo '--- 7. Closed to the API ---'
select 'the trigger function is not callable',
       not has_function_privilege('authenticated', 'public.ownership_transfer_warranty()', 'EXECUTE')
   and not has_function_privilege('anon', 'public.sync_product_machine(text,text)', 'EXECUTE') as ok;

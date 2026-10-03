-- ===========================================================================
-- THE WARRANTY STARTS WHERE THE INSTALLING ENGINEER SAYS (0331).
--
--   The user, 2026-10-03: the installation's customer feedback answers
--   "Warranty Start Date?" with "Installation Call Solved Date" or "Invoice
--   Date". The first makes that product + serial's Product Database warranty
--   start the day the installation call was solved, the end recomputed from
--   the warranty period; the second keeps the sale's documented start.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.sale_entries (sa_number, party_name, warranty_start, warranty_end, warranty_months)
values ('SA-IW1', 'IW HOSP', '2026-01-01', '2026-12-31', 12);
insert into public.sale_items (uid, sa_number, product_name, serial_number) values
  ('IW-U1', 'SA-IW1', 'IW VENT', 'IW-1'),
  ('IW-U2', 'SA-IW1', 'IW VENT', 'IW-2'),
  ('IW-U3', 'SA-IW1', 'IW CPAP', 'IW-1');

-- Three installation calls, all solved on 10-Mar-2026 (India time).
insert into public.installation_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                       complaint_reported, standard_complaint, call_number)
values ('IW-I1', 'INSTALLATION', 'IW VENT', 'IW-1', '2026-03-01', 'IW HOSP', 'INSTALLATION CALL', 'INSTALLATION CALL', 'WI-IW VENT-IW-1'),
       ('IW-I2', 'INSTALLATION', 'IW VENT', 'IW-2', '2026-03-01', 'IW HOSP', 'INSTALLATION CALL', 'INSTALLATION CALL', 'WI-IW VENT-IW-2');
-- Solved the real way: a visit filed Solved - Report Completed, 01:30 IST on
-- 10-Mar-2026 (20:00 UTC the day before) -- so the India-time day is tested.
insert into public.reports (uid, ucn, visit_at, call_status) values
  ('IW-I1-V', 'IW-I1', '2026-03-09T20:00:00Z', 'Solved - Report Completed'),
  ('IW-I2-V', 'IW-I2', '2026-03-09T20:00:00Z', 'Solved - Report Completed');

\echo '--- 1. "Installation Call Solved Date": start = solved day (IST), end = start + 12 months ---'
insert into public.feedback (ucn, call_type, product_name, serial, answers)
values ('IW-I1', 'INSTALLATION', 'IW VENT', 'IW-1', '{"Warranty Start Date?": "Installation Call Solved Date"}');
select 'solved-date choice moves start and end',
       (warranty_start, warranty_end) = (date '2026-03-10', date '2027-03-09') as ok
  from public.products where item_name = 'IW VENT' and serial_number = 'IW-1';

\echo '--- 2. ...and only for that product + serial ---'
select 'IW CPAP sharing the serial keeps the sale''s dates',
       (warranty_start, warranty_end) = (date '2026-01-01', date '2026-12-31') as ok
  from public.products where item_name = 'IW CPAP' and serial_number = 'IW-1';

\echo '--- 3. "Invoice Date": the sale''s documented start stays ---'
insert into public.feedback (ucn, call_type, product_name, serial, answers)
values ('IW-I2', 'INSTALLATION', 'IW VENT', 'IW-2', '{"Warranty Start Date?": "Invoice Date"}');
select 'invoice-date choice keeps the sale',
       (warranty_start, warranty_end) = (date '2026-01-01', date '2026-12-31') as ok
  from public.products where item_name = 'IW VENT' and serial_number = 'IW-2';

\echo '--- 4. RE-SAVING THE SALE DOES NOT PUT THE SALE''S START BACK ---'
update public.sale_entries set other_details = 're-saved' where sa_number = 'SA-IW1';
select 'installation start survives a re-saved sale',
       (warranty_start, warranty_end) = (date '2026-03-10', date '2027-03-09') as ok
  from public.products where item_name = 'IW VENT' and serial_number = 'IW-1';

\echo '--- 5. CHANGING THE ANSWER BACK RETURNS THE SALE''S START ---'
update public.feedback set answers = '{"Warranty Start Date?": "Invoice Date"}' where ucn = 'IW-I1';
select 'answer changed back to Invoice Date',
       (warranty_start, warranty_end) = (date '2026-01-01', date '2026-12-31') as ok
  from public.products where item_name = 'IW VENT' and serial_number = 'IW-1';

\echo '--- 6. A CALL NOT YET SOLVED DOES NOT MOVE IT ---'
update public.feedback set answers = '{"Warranty Start Date?": "Installation Call Solved Date"}' where ucn = 'IW-I2';
insert into public.reports (uid, ucn, visit_at, call_status) values
  ('IW-I2-V2', 'IW-I2', '2026-03-12T06:00:00Z', 'Unsolved');
select 'unsolved installation keeps the sale''s start', warranty_start = date '2026-01-01' as ok
  from public.products where item_name = 'IW VENT' and serial_number = 'IW-2';

\echo '--- 7. RECORDED, AND CLOSED TO THE API ---'
select 'one-time apply recorded', exists (select 1 from public.one_time_fixes_done where name = '0331_install_warranty_start') as ok;
select 'functions and backup closed',
       not has_function_privilege('authenticated', 'public.machine_install_warranty_start(text,text)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.machine_install_warranty_start(text,text)', 'EXECUTE')
   and not has_table_privilege('authenticated', 'public.products_install_start_backup', 'SELECT') as ok;

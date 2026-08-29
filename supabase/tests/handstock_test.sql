-- ===========================================================================
-- Hand stock (0020) — the stock level per engineer + spare:
--   Stock Out (Stores) − Consumption − Transfer From + Transfer To
-- Run it after _stub.sql + every migration. It shares the other suites'
-- personas and only looks at its own SP-* parts, so it can run alongside them:
--   psql ... -f supabase/tests/handstock_test.sql
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- ---- personas -------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','eng@x.com'),
  ('22222222-2222-2222-2222-222222222222','rm@x.com'),
  ('33333333-3333-3333-3333-333333333333','stores@x.com'),
  ('44444444-4444-4444-4444-444444444444','other@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('11111111-1111-1111-1111-111111111111','eng@x.com','Eng Elan','engineer'),
  ('22222222-2222-2222-2222-222222222222','rm@x.com','RM Ravi','rm'),
  ('33333333-3333-3333-3333-333333333333','stores@x.com','Stores Sam','stores_incharge'),
  ('44444444-4444-4444-4444-444444444444','other@x.com','Other Om','engineer')
on conflict do nothing;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

call public.be('eng@x.com');

\echo '--- 1. an OR Stores has not dispatched is NOT stock ---'
insert into public.spare_requests (uid, engineer, engineer_email, item_status)
  values ('HS-1','Eng Elan','eng@x.com','WARRANTY');
insert into public.spare_request_lines (request_uid, row_no, part, qty)
  values ('HS-1',1,'SP-100|Filter assembly',4), ('HS-1',2,'SP-200|Sensor',1);
call public.be('rm@x.com');
update public.spare_request_lines
   set rm_approval='Approved', rm_by='RM Ravi', rm_at=now(),
       commercial_approval='Auto-Approved', nsm_approval='Auto-Approved'
 where request_uid='HS-1';
select count(*) as movements_before_dispatch from public.handstock_movements where part_code like 'SP-%';

\echo '--- 2. the Stores stock-out IS the stock, acknowledged or not ---'
call public.be('stores@x.com');
update public.spare_request_lines
   set stores_status='Dispatched', dc_number='DC-9', dispatched_by='Stores Sam', dispatched_at=now()
 where request_uid='HS-1' and stage='Stores';
select direction, movement, engineer, part, qty, ref, ref_type
  from public.handstock_movements where part_code like 'SP-%' order by part;

\echo '--- 3. consuming one filter on a call takes it back out ---'
call public.be('eng@x.com');
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, engineer_email)
  values ('U-1','CL2600001','SP-100|Filter assembly',1,'Eng Elan','eng@x.com');
select engineer, part_code, stock_out, consumed, on_hand from public.handstock_balance
 where part_code like 'SP-%' order by part_code;

\echo '--- 4. the engineer name is matched case- and space-insensitively ---'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
  values ('U-2','CL2600002','SP-100|Filter assembly',1,'  ENG ELAN ');
select engineer_key, part_code, stock_out, consumed, on_hand from public.handstock_balance
 where part_code like 'SP-%' order by part_code;

\echo '--- 5. a spare is matched on its CODE, not the whole catalogue string ---'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
  values ('U-3','CL2600003','sp-200|Sensor (revised description)',1,'Eng Elan');
select part_code, part, stock_out, consumed, on_hand, movements from public.handstock_balance
 where part_code like 'SP-%' order by part_code;

\echo '--- 6. transferring a filter to another engineer moves the stock ---'
insert into public.stock_transfers (from_engineer, from_engineer_email, to_engineer, to_engineer_email, part, qty, reason)
  values ('Eng Elan','eng@x.com','Other Om','other@x.com','SP-100|Filter assembly',1,'covering the site');
select transfer_no is not null as numbered, from_engineer, to_engineer, qty from public.stock_transfers;
select engineer, part_code, stock_out, consumed, transferred_in, transferred_out, on_hand
  from public.handstock_balance where part_code = 'SP-100' order by engineer;

\echo '--- 7. a transfer cannot invent stock ---'
\echo 'expect ERROR: more than is in hand'
insert into public.stock_transfers (from_engineer, from_engineer_email, to_engineer, part, qty)
  values ('Eng Elan','eng@x.com','Other Om','SP-100|Filter assembly',99);
\echo 'expect ERROR: a spare nobody issued'
insert into public.stock_transfers (from_engineer, from_engineer_email, to_engineer, part, qty)
  values ('Eng Elan','eng@x.com','Other Om','SP-777|Never issued',1);
\echo 'expect ERROR: to oneself'
insert into public.stock_transfers (from_engineer, from_engineer_email, to_engineer, part, qty)
  values ('Eng Elan','eng@x.com','ENG ELAN','SP-100|Filter assembly',1);
\echo 'expect ERROR: zero quantity'
insert into public.stock_transfers (from_engineer, from_engineer_email, to_engineer, part, qty)
  values ('Eng Elan','eng@x.com','Other Om','SP-100|Filter assembly',0);

\echo '--- 8. the engineer who received it can pass it on again ---'
call public.be('other@x.com');
insert into public.stock_transfers (from_engineer, from_engineer_email, to_engineer, to_engineer_email, part, qty)
  values ('Other Om','other@x.com','Eng Elan','eng@x.com','SP-100|Filter assembly',1);
select engineer, part_code, transferred_in, transferred_out, on_hand from public.handstock_balance
 where part_code = 'SP-100' order by engineer;

\echo '--- 9. a transfer is a record, not something to edit ---'
\echo 'expect ERROR: updating a transfer'
update public.stock_transfers set qty = 5 where transfer_no is not null;

\echo '--- 10. consuming stock nobody issued goes negative, and says so ---'
call public.be('eng@x.com');
insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
  values ('U-4','CL2600004','SP-900|Old stock part',3,'Eng Elan');
select part_code, stock_out, consumed, on_hand from public.handstock_balance where part_code='SP-900';

\echo '--- 11. movements carry the reference the register links back to ---'
select direction, movement, engineer, ref, ref_type, ucn from public.handstock_movements
 where part_code like 'SP-%' order by moved_at, movement, engineer;

\echo '--- 12. rows with no engineer or no part code stay out of the balance ---'
insert into public.spare_consumption (ucn, part, qty, engineer) values ('U-5','SP-100|Filter',1,'');
insert into public.spare_consumption (ucn, part, qty, engineer) values ('U-6','',1,'Eng Elan');
select count(*) as balance_rows from public.handstock_balance where part_code like 'SP-%';

\echo '--- 13. a part-dispatched OR issues only what actually went out ---'
insert into public.spare_requests (uid, engineer, engineer_email, item_status)
  values ('HS-2','Eng Elan','eng@x.com','WARRANTY');
insert into public.spare_request_lines (request_uid, row_no, part, qty)
  values ('HS-2',1,'SP-300|Pump',2), ('HS-2',2,'SP-400|Valve',5);
call public.be('rm@x.com');
update public.spare_request_lines
   set rm_approval='Approved', rm_by='RM Ravi', rm_at=now(),
       commercial_approval='Auto-Approved', nsm_approval='Auto-Approved'
 where request_uid='HS-2';
call public.be('stores@x.com');
update public.spare_request_lines
   set stores_status='Dispatched', dc_number='DC-10', dispatched_by='Stores Sam', dispatched_at=now()
 where request_uid='HS-2' and row_no=1;   -- only the pump went out
select part_code, stock_out, on_hand from public.handstock_balance
 where part_code in ('SP-300','SP-400') order by part_code;

\echo '--- 14. handstock_on_hand() is what the transfer guard checks against ---'
select public.handstock_on_hand('eng elan','SP-100') as elan_sp100,
       public.handstock_on_hand('other om','SP-100') as om_sp100,
       public.handstock_on_hand('eng elan','SP-400') as never_dispatched;

\echo '--- 15. the module and transfer permissions are granted ---'
select role,
       permissions ? 'mod:/handstock' as handstock_module,
       permissions ? 'stock.transfer' as can_transfer
  from public.app_roles order by role;

\echo '--- 16. a dispatch from before this module (a DC, no date) is still stock ---'
call public.be('eng@x.com');
insert into public.spare_requests (uid, engineer, engineer_email, item_status)
  values ('HS-3','Eng Elan','eng@x.com','WARRANTY');
insert into public.spare_request_lines (request_uid, row_no, part, qty)
  values ('HS-3',1,'SP-500|Legacy board',2);
-- what a sheet-era row looks like: Stores said Dispatched, nobody stamped when.
call public.be('stores@x.com');
update public.spare_request_lines set stores_status = 'Dispatched', dc_number = 'DC-OLD'
 where request_uid = 'HS-3';
select part_code, stock_out, on_hand, last_in is not null as dated
  from public.handstock_balance where part_code = 'SP-500';

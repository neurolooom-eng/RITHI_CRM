-- ===========================================================================
-- Hand stock (0016) — receipts in, consumption out, netted per engineer/part.
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
  ('33333333-3333-3333-3333-333333333333','stores@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('11111111-1111-1111-1111-111111111111','eng@x.com','Eng Elan','engineer'),
  ('22222222-2222-2222-2222-222222222222','rm@x.com','RM Ravi','rm'),
  ('33333333-3333-3333-3333-333333333333','stores@x.com','Stores Sam','stores_incharge')
on conflict do nothing;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

call public.be('eng@x.com');

\echo '--- 1. a request nobody has acknowledged is NOT hand stock ---'
insert into public.spare_requests (uid, engineer, engineer_email, item_status)
  values ('HS-1','Eng Elan','eng@x.com','WARRANTY');
insert into public.spare_request_lines (request_uid, part, qty)
  values ('HS-1','SP-100|Filter assembly',4), ('HS-1','SP-200|Sensor',1);
select count(*) as movements_before_receipt from public.handstock_movements where part_code like 'SP-%';

\echo '--- 2. the acknowledgement puts both parts into hand stock (per SPARE) ---'
call public.be('rm@x.com');
update public.spare_request_lines
   set rm_approval='Approved', rm_by='RM Ravi', rm_at=now(),
       commercial_approval='Auto-Approved', nsm_approval='Auto-Approved'
 where request_uid='HS-1';
call public.be('stores@x.com');
update public.spare_request_lines
   set stores_status='Dispatched', dc_number='DC-9', dispatched_by='Stores Sam', dispatched_at=now()
 where request_uid='HS-1' and stage='Stores';
call public.be('eng@x.com');
update public.spare_request_lines
   set received_by='Eng Elan', received_at=now(), receipt_remarks='ok'
 where request_uid='HS-1';
select direction, engineer, part, qty, ref, ref_type from public.handstock_movements where part_code like 'SP-%' order by part, direction;

\echo '--- 3. consuming one filter on a call takes it back out ---'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, engineer_email)
  values ('U-1','CL2600001','SP-100|Filter assembly',1,'Eng Elan','eng@x.com');
select engineer, part_code, received, consumed, on_hand from public.handstock_balance where part_code like 'SP-%' order by part_code;

\echo '--- 4. the engineer name is matched case- and space-insensitively ---'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
  values ('U-2','CL2600002','SP-100|Filter assembly',2,'  ENG ELAN ');
select engineer_key, part_code, received, consumed, on_hand from public.handstock_balance where part_code like 'SP-%' order by part_code;

\echo '--- 5. a part is matched on its CODE, not the whole catalogue string ---'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
  values ('U-3','CL2600003','sp-200|Sensor (revised description)',1,'Eng Elan');
select part_code, part, received, consumed, on_hand, movements from public.handstock_balance where part_code like 'SP-%' order by part_code;

\echo '--- 6. consuming stock this module never saw received goes negative ---'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
  values ('U-4','CL2600004','SP-900|Old stock part',3,'Eng Elan');
select part_code, received, consumed, on_hand from public.handstock_balance where part_code='SP-900';

\echo '--- 7. movements carry the reference the register links back to ---'
select direction, ref, ref_type, ucn, call_number from public.handstock_movements where part_code like 'SP-%' order by moved_at, direction, ref;

\echo '--- 8. rows with no engineer or no part code stay out of the balance ---'
insert into public.spare_consumption (ucn, part, qty, engineer) values ('U-5','SP-100|Filter',1,'');
insert into public.spare_consumption (ucn, part, qty, engineer) values ('U-6','',1,'Eng Elan');
select count(*) as balance_rows from public.handstock_balance where part_code like 'SP-%';

\echo '--- 9. mod:/handstock is granted wherever mod:/spare-requests is ---'
select role,
       permissions ? 'mod:/spare-requests' as has_spare_requests,
       permissions ? 'mod:/handstock'      as has_handstock
  from public.app_roles order by role;

\echo '--- 10. a part-received OR puts in only the spares acknowledged ---'
call public.be('eng@x.com');
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
 where request_uid='HS-2' and stage='Stores';
call public.be('eng@x.com');
update public.spare_request_lines set received_by='Eng Elan', received_at=now()
 where request_uid='HS-2' and row_no=1;   -- only the pump arrived
select part_code, received, on_hand from public.handstock_balance
 where part_code in ('SP-300','SP-400') order by part_code;

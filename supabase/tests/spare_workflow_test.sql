\set ON_ERROR_STOP off
\pset pager off
-- ---- personas -------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','eng@x.com'),
  ('22222222-2222-2222-2222-222222222222','rm@x.com'),
  ('33333333-3333-3333-3333-333333333333','stores@x.com'),
  ('44444444-4444-4444-4444-444444444444','other@x.com');
insert into public.profiles (id, email, full_name, role) values
  ('11111111-1111-1111-1111-111111111111','eng@x.com','Eng Elan','engineer'),
  ('22222222-2222-2222-2222-222222222222','rm@x.com','RM Ravi','rm'),
  ('33333333-3333-3333-3333-333333333333','stores@x.com','Stores Sam','stores_incharge'),
  ('44444444-4444-4444-4444-444444444444','other@x.com','Other Om','engineer');

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

\echo '--- 1. OR numbering starts at OR47042 and increments ---'
call public.be('eng@x.com');
insert into public.spare_requests (uid, engineer, engineer_email, item_status, ucn)
  values ('WA-1','Eng Elan','eng@x.com','WARRANTY','U1'), ('WA-2','Eng Elan','eng@x.com','AMC','U2');
select uid, or_no, or_req_date = current_date as date_is_today from public.spare_requests order by uid;

\echo '--- 2. RowNo restarts at 1 per request; qty floor; 20-part cap ---'
insert into public.spare_request_lines (request_uid, part, qty) values ('WA-1','P-A',1),('WA-1','P-B',2);
insert into public.spare_request_lines (request_uid, row_no, part, qty) values ('WA-2',1,'P-C',5);
select request_uid, row_no, part from public.spare_request_lines order by request_uid, row_no;
\echo 'expect ERROR: qty below 1'
insert into public.spare_request_lines (request_uid, part, qty) values ('WA-1','P-Z',0);
\echo 'expect ERROR: 21st part'
insert into public.spare_request_lines (request_uid, row_no, part, qty) values ('WA-1',21,'P-Z',1);

\echo '--- 3. created_by defaults to the signed-in user ---'
select uid, created_by = '11111111-1111-1111-1111-111111111111'::uuid as created_by_set from public.spare_requests order by uid;

\echo '--- 4. OR number is immutable for non-admins ---'
call public.be('rm@x.com');
\echo 'expect ERROR: changing or_no'
update public.spare_requests set or_no = 'OR99999' where uid = 'WA-1';

\echo '--- 5. engineer cannot advance the approval stage ---'
call public.be('eng@x.com');
\echo 'expect ERROR: engineer approving'
update public.spare_requests set rm_approval = 'Approved', stage = 'Stores' where uid = 'WA-1';

\echo '--- 6. RM approves; non-AMC auto-clears to Stores ---'
call public.be('rm@x.com');
update public.spare_requests
   set rm_approval='Approved', rm_by='RM Ravi', rm_at=now(),
       commercial_approval='Auto-Approved', nsm_approval='Auto-Approved', stage='Stores'
 where uid='WA-1';
select uid, rm_approval, stage from public.spare_requests where uid='WA-1';

\echo '--- 7. receipt before dispatch is refused ---'
call public.be('eng@x.com');
\echo 'expect ERROR: not dispatched yet'
update public.spare_requests set received_by='Eng Elan', received_at=now(), stage='Received' where uid='WA-1';

\echo '--- 8. stores dispatches ---'
call public.be('stores@x.com');
update public.spare_requests set stores_status='Dispatched', dc_number='DC-1', courier='Bluedart',
       dispatched_by='Stores Sam', dispatched_at=now(), stage='Dispatched' where uid='WA-1';
select uid, stores_status, dc_number, stage from public.spare_requests where uid='WA-1';

\echo '--- 9. a different engineer cannot acknowledge ---'
call public.be('other@x.com');
\echo 'expect ERROR: not the raiser'
update public.spare_requests set received_by='Other Om', received_at=now(), stage='Received' where uid='WA-1';

\echo '--- 10. the raiser acknowledges ---'
call public.be('eng@x.com');
update public.spare_requests set received_by='Eng Elan', received_at=now(), receipt_remarks='ok', stage='Received' where uid='WA-1';
select uid, received_by, stage from public.spare_requests where uid='WA-1';

\echo '--- 11. spare.receive is granted on the roles that need it ---'
select role, permissions ? 'spare.receive' as has_receive from public.app_roles
 where role in ('admin','engineer','rm','rgm','spare_coordinator','commercial','nsm') order by role;

\echo '--- 12. AMC item: RM may NOT auto-clear Commercial ---'
call public.be('rm@x.com');
\echo 'expect ERROR: AMC needs a real Commercial approval'
update public.spare_requests
   set rm_approval='Approved', commercial_approval='Auto-Approved', nsm_approval='Auto-Approved', stage='Stores'
 where uid='WA-2';
\echo 'RM approval alone on the AMC item is fine:'
update public.spare_requests set rm_approval='Approved', rm_by='RM Ravi', rm_at=now(), stage='Commercial' where uid='WA-2';
select uid, item_status, rm_approval, commercial_approval, stage from public.spare_requests where uid='WA-2';
\echo 'expect ERROR: RM cannot write a manual Commercial approval'
update public.spare_requests set commercial_approval='Approved', commercial_by='RM Ravi' where uid='WA-2';

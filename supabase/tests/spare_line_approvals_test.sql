\set ON_ERROR_STOP off
\pset pager off
-- ===========================================================================
-- Per-SPARE approvals (0016_spare_line_approvals.sql).
--   The RM decides each line on its own, so one OR can go forward partly
--   approved; later stages may act per line or over the whole OR at once.
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
insert into auth.users (id,email) values
 ('11111111-1111-1111-1111-111111111111','eng@x.com'),
 ('22222222-2222-2222-2222-222222222222','rm@x.com'),
 ('33333333-3333-3333-3333-333333333333','stores@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('11111111-1111-1111-1111-111111111111','eng@x.com','Eng Elan','engineer'),
 ('22222222-2222-2222-2222-222222222222','rm@x.com','RM Ravi','rm'),
 ('33333333-3333-3333-3333-333333333333','stores@x.com','Stores Sam','stores_incharge');
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

call public.be('eng@x.com');
insert into public.spare_requests (uid, engineer, engineer_email, item_status)
  values ('WA-1','Eng Elan','eng@x.com','WARRANTY');
insert into public.spare_request_lines (request_uid, row_no, part, qty) values
  ('WA-1',1,'P-A',1), ('WA-1',2,'P-B',2), ('WA-1',3,'P-C',1);

\echo '--- 1. RM approves lines 1 and 3, rejects line 2 (PER SPARE) ---'
call public.be('rm@x.com');
update public.spare_request_lines
   set rm_approval='Approved', rm_by='RM Ravi', rm_at=now(),
       commercial_approval='Auto-Approved', nsm_approval='Auto-Approved'
 where request_uid='WA-1' and row_no in (1,3);
update public.spare_request_lines
   set rm_approval='Rejected', rm_by='RM Ravi', rm_at=now(),
       reject_reason='not covered', rejected_stage='RM Approval'
 where request_uid='WA-1' and row_no=2;
select row_no, part, rm_approval, stage from public.spare_request_lines where request_uid='WA-1' order by row_no;

\echo '--- 2. header rolls up to the least-advanced surviving line ---'
select uid, stage, status from public.spare_requests where uid='WA-1';

\echo '--- 3. header approvals are frozen; decisions belong on the line ---'
\echo 'expect ERROR:'
update public.spare_requests set rm_approval='Approved', stage='Stores' where uid='WA-1';

\echo '--- 4. Stores dispatches only the two approved lines (PER OR bulk) ---'
call public.be('stores@x.com');
update public.spare_request_lines
   set stores_status='Dispatched', dc_number='DC-1', dispatched_by='Stores Sam', dispatched_at=now()
 where request_uid='WA-1' and stage='Stores';
select row_no, part, stage, dc_number from public.spare_request_lines where request_uid='WA-1' order by row_no;
select uid, stage from public.spare_requests where uid='WA-1';

\echo '--- 5. engineer cannot approve a line ---'
call public.be('eng@x.com');
\echo 'expect ERROR:'
update public.spare_request_lines set rm_approval='Approved' where request_uid='WA-1' and row_no=2;

\echo '--- 6. raiser acknowledges receipt per spare ---'
update public.spare_request_lines set received_by='Eng Elan', received_at=now()
 where request_uid='WA-1' and row_no=1;
select row_no, stage from public.spare_request_lines where request_uid='WA-1' order by row_no;
\echo 'header still at Dispatched — line 3 is not acknowledged yet:'
select uid, stage from public.spare_requests where uid='WA-1';

\echo '--- 7. acknowledge the rest → header Received ---'
update public.spare_request_lines set received_by='Eng Elan', received_at=now()
 where request_uid='WA-1' and row_no=3;
select uid, stage from public.spare_requests where uid='WA-1';

\echo '--- 8. all lines rejected → header Rejected ---'
call public.be('eng@x.com');
insert into public.spare_requests (uid, engineer, engineer_email, item_status) values ('WA-2','Eng Elan','eng@x.com','WARRANTY');
insert into public.spare_request_lines (request_uid,row_no,part,qty) values ('WA-2',1,'P-X',1),('WA-2',2,'P-Y',1);
call public.be('rm@x.com');
update public.spare_request_lines set rm_approval='Rejected', rm_by='RM Ravi', rm_at=now() where request_uid='WA-2';
select uid, stage from public.spare_requests where uid='WA-2';

-- ===========================================================================
-- Per-spare IDs (0022_spare_line_uid.sql).
--   Every spare is <OR number>-<RowNo>, e.g. OR-2608-0001-01. The RM approves
--   and Stores dispatches against that ID, so two spares on one OR can go out
--   on different days with different DCs.
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id,email) values ('22222222-2222-2222-2222-222222222222','rm@x.com'),('33333333-3333-3333-3333-333333333333','st@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('22222222-2222-2222-2222-222222222222','rm@x.com','RM Ravi','rm'),
 ('33333333-3333-3333-3333-333333333333','st@x.com','Stores Sam','stores_incharge');
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

\echo '--- 1. each spare gets ORNO-Spare ---'
insert into public.spare_requests (uid, engineer, item_status) values ('R1','Ravi','WARRANTY');
insert into public.spare_request_lines (request_uid, part, qty) values ('R1','P-A',1),('R1','P-B',2),('R1','P-C',1);
select l.line_uid, l.row_no, l.part, r.or_no
  from public.spare_request_lines l join public.spare_requests r on r.uid=l.request_uid order by l.row_no;

\echo '--- 2. a second OR numbers its own spares from 01 ---'
insert into public.spare_requests (uid, engineer, item_status) values ('R2','Ravi','WARRANTY');
insert into public.spare_request_lines (request_uid, part, qty) values ('R2','P-D',1);
select line_uid from public.spare_request_lines where request_uid='R2';

\echo '--- 3. RM approves ONE spare by its ID; the others are untouched ---'
call public.be('rm@x.com');
update public.spare_request_lines
   set rm_approval='Approved', rm_by='RM Ravi', rm_at=now(),
       commercial_approval='Auto-Approved', nsm_approval='Auto-Approved'
 where line_uid = 'OR-2608-0001-02';
select line_uid, rm_approval, stage from public.spare_request_lines where request_uid='R1' order by row_no;

\echo '--- 4. Stores dispatches that spare on its own DC and date ---'
call public.be('st@x.com');
update public.spare_request_lines
   set stores_status='Dispatched', dc_number='DC-77', dispatched_by='Stores Sam', dispatched_at=now()
 where line_uid = 'OR-2608-0001-02';
select line_uid, stage, dc_number, dispatched_at::date as dispatched_on
  from public.spare_request_lines where request_uid='R1' order by row_no;

\echo '--- 5. a second spare, approved and dispatched on a DIFFERENT day/DC ---'
call public.be('rm@x.com');
update public.spare_request_lines set rm_approval='Approved', rm_by='RM Ravi', rm_at=now(),
       commercial_approval='Auto-Approved', nsm_approval='Auto-Approved' where line_uid='OR-2608-0001-01';
call public.be('st@x.com');
update public.spare_request_lines set stores_status='Dispatched', dc_number='DC-92',
       dispatched_by='Stores Sam', dispatched_at=now() + interval '2 days' where line_uid='OR-2608-0001-01';
select line_uid, dc_number, dispatched_at::date as dispatched_on, stage
  from public.spare_request_lines where request_uid='R1' order by row_no;

\echo '--- 6. the ID is unique and immutable ---'
\echo 'expect ERROR: changing a spare ID'
update public.spare_request_lines set line_uid='OR-2608-0001-99' where line_uid='OR-2608-0001-03';
\echo 'expect ERROR: duplicate spare ID'
insert into public.spare_request_lines (request_uid, row_no, part, qty, line_uid) values ('R2',9,'P-Z',1,'OR-2608-0001-01');

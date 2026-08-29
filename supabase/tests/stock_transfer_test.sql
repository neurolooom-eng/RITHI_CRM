-- ===========================================================================
-- Stock Transfer (0020_stock_transfer.sql).
--   Stock is derived: HandStock dispatched, minus consumption, plus/minus
--   transfers. A transfer may not move more than the sender holds.
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id,email) values
 ('44444444-4444-4444-4444-444444444444','rm@x.com'),
 ('11111111-1111-1111-1111-111111111111','ravi@x.com'),
 ('22222222-2222-2222-2222-222222222222','suresh@x.com'),
 ('33333333-3333-3333-3333-333333333333','stores@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('44444444-4444-4444-4444-444444444444','rm@x.com','RM Ravi','rm'),
 ('11111111-1111-1111-1111-111111111111','ravi@x.com','Ravi Menon','engineer'),
 ('22222222-2222-2222-2222-222222222222','suresh@x.com','Suresh Kumar','engineer'),
 ('33333333-3333-3333-3333-333333333333','stores@x.com','Stores Sam','stores_incharge');
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

\echo '--- 1. no HandStock yet -> no stock ---'
select count(*) as rows_in_engineer_stock from public.engineer_stock;

\echo '--- 2. hand-stock becomes the engineers once Stores dispatches it ---'
call public.be('ravi@x.com');
insert into public.spare_requests (uid, req_type, engineer, engineer_email, item_status)
  values ('H1','HandStock','Ravi Menon','ravi@x.com','WARRANTY');
insert into public.spare_request_lines (request_uid,row_no,part,qty) values ('H1',1,'P-A',10),('H1',2,'P-B',4);
call public.be('rm@x.com');
update public.spare_request_lines set rm_approval='Approved', rm_by='RM Ravi', rm_at=now(),
       commercial_approval='Auto-Approved', nsm_approval='Auto-Approved' where request_uid='H1';
call public.be('stores@x.com');
update public.spare_request_lines set stores_status='Dispatched', dc_number='DC1',
       dispatched_by='Stores Sam', dispatched_at=now() where request_uid='H1';
select engineer, part, qty from public.engineer_stock order by part;

\echo '--- 3. acknowledging it later changes nothing (already counted) ---'
call public.be('ravi@x.com');
update public.spare_request_lines set received_by='Ravi Menon', received_at=now() where request_uid='H1';
select engineer, part, qty from public.engineer_stock order by part;

\echo '--- 4. consumption on a call reduces it ---'
insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
  values ('U1','C1','P-A',3,'Ravi Menon');
select engineer, part, qty from public.engineer_stock order by part;

\echo '--- 5. transfer 5 of P-A to Suresh ---'
insert into public.stock_transfers (from_engineer, to_engineer) values ('Ravi Menon','Suresh Kumar');
insert into public.stock_transfer_lines (transfer_uid, part, qty)
  values ((select uid from public.stock_transfers order by id desc limit 1), 'P-A', 5);
select uid, from_engineer, to_engineer from public.stock_transfers;
select engineer, part, qty from public.engineer_stock order by engineer, part;

\echo '--- 6. transferring more than held is refused ---'
insert into public.stock_transfers (from_engineer, to_engineer) values ('Ravi Menon','Suresh Kumar');
\echo 'expect ERROR: only 2 of P-A left'
insert into public.stock_transfer_lines (transfer_uid, part, qty)
  values ((select uid from public.stock_transfers order by id desc limit 1), 'P-A', 3);

\echo '--- 7. two lines that individually pass but together over-draw ---'
\echo 'expect ERROR:'
insert into public.stock_transfer_lines (transfer_uid, part, qty)
  values ((select uid from public.stock_transfers order by id desc limit 1), 'P-A', 1),
         ((select uid from public.stock_transfers order by id desc limit 1), 'P-A', 2);

\echo '--- 8. transferring to yourself is refused ---'
\echo 'expect ERROR:'
insert into public.stock_transfers (from_engineer, to_engineer) values ('Ravi Menon','ravi menon');

\echo '--- 9. ST numbering ---'
select uid from public.stock_transfers order by id;

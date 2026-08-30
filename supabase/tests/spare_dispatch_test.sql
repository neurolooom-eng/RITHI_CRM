-- ===========================================================================
-- Stores dispatch in batches (0027_spare_dispatch.sql).
--   Stores picks every spare waiting for ONE engineer and books them out in a
--   single stock out, which generates the SO and DC numbers. The spares are
--   the engineer's hand stock from that moment — no acknowledgement needed —
--   which is what puts them in the call report's consumption picker.
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id,email) values
 ('22222222-2222-2222-2222-222222222222','rm@x.com'),
 ('33333333-3333-3333-3333-333333333333','st@x.com'),
 ('44444444-4444-4444-4444-444444444444','eng@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('22222222-2222-2222-2222-222222222222','rm@x.com','RM Ravi','rm'),
 ('33333333-3333-3333-3333-333333333333','st@x.com','Stores Sam','stores_incharge'),
 ('44444444-4444-4444-4444-444444444444','eng@x.com','Eng Anil','engineer');
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

-- Two engineers, four spares, all approved and sitting at Stores.
insert into public.spare_requests (uid, engineer, engineer_email, req_type, item_status)
values ('D1','Anil','eng@x.com','HandStock','WARRANTY'),
       ('D2','Anil','eng@x.com','Call Based','WARRANTY'),
       ('D3','Bala','bala@x.com','HandStock','WARRANTY');
insert into public.spare_request_lines (request_uid, part, qty) values
 ('D1','P-A|Pump',2),('D1','P-B|Valve',1),('D2','P-C|Seal',3),('D3','P-A|Pump',5);
call public.be('rm@x.com');
update public.spare_request_lines set rm_approval='Approved', rm_by='RM Ravi', rm_at=now(),
       commercial_approval='Auto-Approved', nsm_approval='Auto-Approved';

\echo '--- 1. the pending-dispatch queue, with the engineer to group by ---'
select engineer, or_no, row_no, part, qty from public.spare_pending_dispatch order by engineer, or_no, row_no;

\echo '--- 2. Stores books out everything for ONE engineer in one go ---'
call public.be('st@x.com');
select uid as stock_out_no, dc_number, engineer, line_count, total_qty
  from public.dispatch_spare_lines(
    (select array_agg(line_id) from public.spare_pending_dispatch where engineer='Anil'),
    'Blue Dart', 'Monthly top-up', current_date, 'Stores Sam');

\echo '--- 3. every spare in the batch carries the same SO and DC ---'
select line_uid, part, stock_out_no, dc_number, stage, courier
  from public.spare_request_lines where request_uid in ('D1','D2') order by line_uid;

\echo '--- 4. the queue now holds only the other engineer ---'
select engineer, part, qty from public.spare_pending_dispatch order by part;

\echo '--- 5. the next stock out takes the next numbers in the series ---'
select uid as stock_out_no, dc_number, engineer, line_count
  from public.dispatch_spare_lines(
    (select array_agg(line_id) from public.spare_pending_dispatch where engineer='Bala'),
    '', '', current_date, 'Stores Sam');

\echo '--- 6. hand stock counts it from the STOCK OUT, with no acknowledgement ---'
select engineer, part, stock_out, consumed, on_hand
  from public.handstock_balance order by engineer, part_code;
select r.engineer, count(*) filter (where l.received_at is not null) as acknowledged
  from public.spare_request_lines l join public.spare_requests r on r.uid=l.request_uid
 group by r.engineer order by r.engineer;

\echo '--- 7. two engineers cannot share one DC ---'
insert into public.spare_requests (uid, engineer, engineer_email, req_type, item_status)
values ('D4','Anil','eng@x.com','HandStock','WARRANTY'),('D5','Bala','bala@x.com','HandStock','WARRANTY');
insert into public.spare_request_lines (request_uid, part, qty) values ('D4','P-D|Hose',1),('D5','P-D|Hose',1);
call public.be('rm@x.com');
update public.spare_request_lines set rm_approval='Approved', rm_by='RM Ravi', rm_at=now(),
       commercial_approval='Auto-Approved', nsm_approval='Auto-Approved'
 where request_uid in ('D4','D5');
call public.be('st@x.com');
\echo 'expect ERROR: a stock out goes to one engineer'
select uid from public.dispatch_spare_lines(
  (select array_agg(line_id) from public.spare_pending_dispatch), '', '', current_date, 'Stores Sam');

\echo '--- 8. a spare already sent cannot go out twice ---'
\echo 'expect ERROR: only 0 of the 1 selected spares are still waiting'
select uid from public.dispatch_spare_lines(
  array[(select id from public.spare_request_lines where request_uid='D1' limit 1)],
  '', '', current_date, 'Stores Sam');

\echo '--- 9. dispatch needs the permission ---'
call public.be('eng@x.com');
\echo 'expect ERROR: dispatch requires spare.dispatch'
select uid from public.dispatch_spare_lines(
  (select array_agg(line_id) from public.spare_pending_dispatch where engineer='Anil'),
  '', '', current_date, 'Eng Anil');
\echo 'expect ERROR: stamping a stock out by hand needs spare.dispatch'
update public.spare_request_lines set stock_out_no='SO-FAKE' where request_uid='D4';

\echo '--- 10. and the batch is atomic: nothing moved on those failures ---'
call public.be('st@x.com');
select engineer, part, qty from public.spare_pending_dispatch order by engineer;
select count(*) as stock_outs_recorded from public.spare_dispatches;

\echo '--- 11. the challan number IS the stock out number (0028) ---'
select uid as stock_out_no, dc_number,
       (dc_number = uid) as challan_is_the_stock_out
  from public.spare_dispatches order by uid;
select count(*) as lines_carrying_a_foreign_dc
  from public.spare_request_lines l join public.spare_dispatches d on d.uid = l.dispatch_uid
 where l.dc_number is distinct from d.uid;
\echo 'expect ERROR: the retired DC series is gone'
select public.next_dc_number(current_date);

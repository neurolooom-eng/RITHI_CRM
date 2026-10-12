-- ===========================================================================
-- KY550200 OFF INDOOR SERVICE (0420): OR44271's line dropped, SO18001's row
-- and the transfer line deleted. The request is kept; the line leaves the
-- ledger and the dispatch queue; balances follow; a re-run changes nothing.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
update public.harness set uid = null, email = null;

alter table public.spare_requests disable trigger user;
alter table public.spare_request_lines disable trigger user;
insert into public.spare_requests (uid, or_no, req_type, engineer, item_status, ucn, stage, status)
values ('v2_N1-77d59cbd', 'OR44271', 'Call Based', 'INDOOR SERVICE', 'CMC', '26B25F0002', 'Dispatched', 'Dispatched');
insert into public.spare_request_lines (id, request_uid, row_no, part, qty, dispatched_qty, stores_status, dispatched_at, line_uid)
overriding system value values
 (3005, 'v2_N1-77d59cbd', 1, 'KY550200|MOTHER BOARD - OSIRIS 3', 1, 1, 'Dispatched', '2026-03-15 18:30:00+00', 'OR44271|KY550200');
alter table public.spare_requests enable trigger user;
alter table public.spare_request_lines enable trigger user;
insert into public.spare_issue_history (id, engineer, part, qty, issued_at, so_no, ref, line_uid, source)
overriding system value values
 (42748, 'INDOOR SERVICE', 'KY550200|MOTHER BOARD - OSIRIS 3', 1, '2026-03-16 10:42:39+00', 'SO18001', 'SO18001|OR44271|KY550200', 'OR44271|KY550200', 'Stock out');
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date, remarks) values
 ('ST-2609-0005', 'INDOOR SERVICE', 'AJAY G (INDOOR SERVICE)', '2026-09-25', 'MTN NO. 317') on conflict do nothing;
insert into public.stock_transfer_lines (id, transfer_uid, part, qty) overriding system value values
 (866, 'ST-2609-0005', 'KY550200|MOTHER BOARD - OSIRIS 3', 1);

select 'before: INDOOR SERVICE stock out counted once, AJAY G holds 1' as t,
  (select stock_out = 1 from public.handstock_balance where part_code = 'KY550200' and engineer_key = public.handstock_key('INDOOR SERVICE'))
  and (select on_hand = 1 from public.handstock_balance where part_code = 'KY550200' and engineer_key = public.handstock_key('AJAY G (INDOOR SERVICE)')) as ok;

\i supabase/migrations/0420_drop_or44271_ky550200.sql

select 'the request is kept and its line is Dropped with the reason, nothing dispatched' as t,
  exists (select 1 from public.spare_requests where uid = 'v2_N1-77d59cbd')
  and (select stores_status = 'Dropped' and coalesce(dispatched_qty, 0) = 0 and dispatch_remarks like 'Removed at the user%'
         from public.spare_request_lines where id = 3005) as ok;
select 'SO18001''s row and the transfer line are gone, images kept' as t,
  not exists (select 1 from public.spare_issue_history where id = 42748)
  and not exists (select 1 from public.stock_transfer_lines where id = 866)
  and (select count(*) = 2 from public.record_audit where op = 'DELETE' and new_data->>'note' like '0420:%') as ok;
select 'no stock out left; INDOOR SERVICE and AJAY G hold none' as t,
  not exists (select 1 from public.handstock_movements where part_code = 'KY550200' and movement = 'Stock out')
  and coalesce((select on_hand from public.handstock_balance where part_code = 'KY550200' and engineer_key = public.handstock_key('INDOOR SERVICE')), 0) = 0
  and coalesce((select on_hand from public.handstock_balance where part_code = 'KY550200' and engineer_key = public.handstock_key('AJAY G (INDOOR SERVICE)')), 0) = 0 as ok;
select 'the dropped line is not waiting for Stores' as t,
  not exists (select 1 from public.spare_pending_dispatch where line_id = 3005) as ok;

\i supabase/migrations/0420_drop_or44271_ky550200.sql
select 'a re-run changes nothing' as t,
  (select count(*) = 2 from public.record_audit where op = 'DELETE' and new_data->>'note' like '0420:%') as ok;

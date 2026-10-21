-- ===========================================================================
-- THE TEST REQUEST OR-2610-0356 AND ITS STOCK OUT SO-2610-0135 DELETED (0448).
-- The four rows go, the images are kept, Rithi Admin's NO-001 goes to 0, a
-- neighbour is untouched, and a re-run changes nothing.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
update public.harness set uid = null, email = null;

alter table public.spare_requests disable trigger user;
alter table public.spare_request_lines disable trigger user;
insert into public.spare_requests (id, uid, or_no, req_type, engineer, stage, status, handstock_reason)
overriding system value values
 (13150, 'WA-20261021-0QM54A0HZ', 'OR-2610-0356', 'HandStock', 'Rithi Admin', 'Dispatched', 'Dispatched', 'test'),
 (13151, 'WA-20261021-NEIGHBOUR', 'OR-2610-0355', 'HandStock', 'Rithi Admin', 'Dispatched', 'Dispatched', 'real');
insert into public.spare_request_lines (id, request_uid, row_no, part, qty, dispatched_qty, stores_status, dispatched_at, line_uid)
overriding system value values
 (10356, 'WA-20261021-0QM54A0HZ', 1, 'NO-001|NONE', 1, 1, 'Dispatched', now(), 'OR-2610-0356-01'),
 (10355, 'WA-20261021-NEIGHBOUR', 1, 'NO-001|NONE', 1, 1, 'Dispatched', now(), 'OR-2610-0355-01');
alter table public.spare_requests enable trigger user;
alter table public.spare_request_lines enable trigger user;
insert into public.spare_dispatches (id, uid, dc_number, engineer, line_count, total_qty, dc_date, dispatched_at, dispatched_by)
overriding system value values
 (337, 'SO-2610-0135', 'SO-2610-0135', 'Rithi Admin', 1, 1, current_date, now(), 'DEVIKA'),
 (336, 'SO-2610-0134', 'SO-2610-0134', 'Rithi Admin', 1, 1, current_date, now(), 'DEVIKA');
insert into public.spare_dispatch_lines (id, dispatch_uid, line_id, line_uid, part, qty) overriding system value values
 (1405, 'SO-2610-0135', 10356, 'OR-2610-0356-01', 'NO-001|NONE', 1),
 (1404, 'SO-2610-0134', 10355, 'OR-2610-0355-01', 'NO-001|NONE', 1);

select 'before: Rithi Admin holds 2 NO-001' as t, public.engineer_stock_available('Rithi Admin', 'NO-001|NONE') = 2 as ok;

\i supabase/migrations/0448_delete_test_or_2610_0356.sql

select 'the request, its line, the stock out and its line are gone' as t,
  not exists (select 1 from public.spare_requests where id = 13150)
  and not exists (select 1 from public.spare_request_lines where id = 10356)
  and not exists (select 1 from public.spare_dispatches where id = 337)
  and not exists (select 1 from public.spare_dispatch_lines where id = 1405) as ok;
select 'the neighbour OR-2610-0355 and SO-2610-0134 are untouched' as t,
  exists (select 1 from public.spare_requests where id = 13151)
  and exists (select 1 from public.spare_request_lines where id = 10355)
  and exists (select 1 from public.spare_dispatches where id = 336)
  and exists (select 1 from public.spare_dispatch_lines where id = 1404) as ok;
select 'Rithi Admin now holds 1 NO-001 (the neighbour''s)' as t, public.engineer_stock_available('Rithi Admin', 'NO-001|NONE') = 1 as ok;
select 'each deleted row''s image is in record_audit' as t,
  (select count(*) from public.record_audit where op = 'DELETE' and (
     (table_name = 'spare_dispatches' and record_key = 'SO-2610-0135')
     or (table_name = 'spare_requests' and old_data->>'or_no' = 'OR-2610-0356')
     or (table_name = 'spare_request_lines' and old_data->>'line_uid' = 'OR-2610-0356-01')
     or (table_name = 'spare_dispatch_lines' and old_data->>'line_uid' = 'OR-2610-0356-01'))) >= 4 as ok;

\i supabase/migrations/0448_delete_test_or_2610_0356.sql
select 'a re-run changes nothing' as t,
  (select count(*) from public.spare_requests where id in (13150, 13151)) = 1
  and public.engineer_stock_available('Rithi Admin', 'NO-001|NONE') = 1 as ok;

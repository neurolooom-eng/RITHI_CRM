-- ===========================================================================
-- KY732930 OFF STOCK OUT SO16233, AND ITS TRANSFER LINE (0419).
--
--   The two rows go, their images are kept in record_audit, the neighbouring
--   lines stay, the balances follow, and a re-run deletes nothing.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
update public.harness set uid = null, email = null;

insert into public.spare_issue_history (id, engineer, part, qty, issued_at, so_no, ref, line_uid, source)
overriding system value values
 (34166, 'INDOOR SERVICE', 'KY732930|INTERNAL BATTERY PACK Li-Ion', 1, '2025-07-14 06:28:15+00', 'SO16233', 'SO16233|OR39541|KY732930', 'OR39541|KY732930', 'Stock out'),
 (34167, 'INDOOR SERVICE', 'KY732693|OXYGEN MIXER ASSEMBLY-MT60',   1, '2025-07-14 06:28:15+00', 'SO16233', 'SO16233|OR39891|KY732693', 'OR39891|KY732693', 'Stock out');
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date, remarks) values
 ('ST-2609-0005', 'INDOOR SERVICE', 'AJAY G (INDOOR SERVICE)', '2026-09-25', 'MTN NO. 317');
insert into public.stock_transfer_lines (id, transfer_uid, part, qty) overriding system value values
 (867, 'ST-2609-0005', 'KY732930|INTERNAL BATTERY PACK Li-Ion', 1);
insert into public.stock_transfer_lines (id, transfer_uid, part, qty) overriding system value values
 (868, 'ST-2609-0005', 'KY732693|OXYGEN MIXER ASSEMBLY-MT60', 1);

select 'before: AJAY G holds 1' as t,
  (select on_hand = 1 from public.handstock_balance where part_code = 'KY732930' and engineer_key = public.handstock_key('AJAY G (INDOOR SERVICE)')) as ok;

\i supabase/migrations/0419_delete_so16233_ky732930.sql

select 'the two rows are gone' as t,
  not exists (select 1 from public.spare_issue_history where id = 34166)
  and not exists (select 1 from public.stock_transfer_lines where id = 867) as ok;
select 'their images are kept' as t,
  (select count(*) = 2 from public.record_audit where op = 'DELETE' and new_data->>'note' like '0419:%') as ok;
select 'the neighbouring lines stay' as t,
  exists (select 1 from public.spare_issue_history where id = 34167)
  and exists (select 1 from public.stock_transfer_lines where id = 868) as ok;
select 'balances: INDOOR SERVICE and AJAY G hold no KY732930' as t,
  coalesce((select on_hand from public.handstock_balance where part_code = 'KY732930' and engineer_key = public.handstock_key('INDOOR SERVICE')), 0) = 0
  and coalesce((select on_hand from public.handstock_balance where part_code = 'KY732930' and engineer_key = public.handstock_key('AJAY G (INDOOR SERVICE)')), 0) = 0 as ok;

\i supabase/migrations/0419_delete_so16233_ky732930.sql
select 'a re-run deletes nothing more and writes no second image' as t,
  (select count(*) = 2 from public.record_audit where op = 'DELETE' and new_data->>'note' like '0419:%')
  and exists (select 1 from public.spare_issue_history where id = 34167) as ok;

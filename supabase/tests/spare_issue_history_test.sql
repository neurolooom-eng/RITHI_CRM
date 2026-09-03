-- ===========================================================================
-- The issue side of the historical record (0090_spare_issue_history.sql).
--   Hand stock is WinMax HS + SO + ST received - Consumption - ST sent - MRN.
--   The SO arm counts every issued spare EXCEPT one already counted through
--   its 2026 request line, so the whole stock-out export and the 2026 register
--   can both be loaded, in either order, without counting a spare twice.
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id,email) values ('11111111-1111-1111-1111-111111111111','admin@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('11111111-1111-1111-1111-111111111111','admin@x.com','Rithi Admin','admin');
update public.harness set uid='11111111-1111-1111-1111-111111111111', email='admin@x.com';

\echo '--- 1. an issued spare puts stock in the engineer''s hands ---'
insert into public.spare_issue_history (engineer, part, qty, so_no, line_uid, source, ref, issued_at)
values ('RAVI','MP-010|SENSOR',3,'SO8915','OR20472|MP-010','Stock out','SO8915|OR20472|MP-010','2023-06-10');
select engineer, part_code, on_hand from public.handstock_balance where engineer_key = public.handstock_key('RAVI');

\echo '--- 2. the SAME spare, once the 2026 request that issued it is loaded:'
\echo '       counted once, not twice ---'
insert into public.spare_requests (uid, or_no, engineer) values ('OR43016','OR43016','RAVI');
insert into public.spare_request_lines (line_uid, request_uid, part, qty, dispatched_qty, stores_status)
values ('OR43016|MP-010','OR43016','MP-010|SENSOR',2,2,'Dispatched');
insert into public.spare_issue_history (engineer, part, qty, so_no, line_uid, source, ref)
values ('RAVI','MP-010|SENSOR',2,'SO9001','OR43016|MP-010','Stock out','SO9001|OR43016|MP-010');
select engineer, part_code, on_hand from public.handstock_balance where engineer_key = public.handstock_key('RAVI');
select ref_type, count(*), sum(qty) from public.handstock_movements
 where movement = 'Stock out' and engineer_key = public.handstock_key('RAVI') group by 1 order by 1;

\echo '--- 3. consumption takes it back out, and history is not capped ---'
insert into public.spare_consumption_history (engineer, part, qty, source, ref)
values ('RAVI','MP-010|SENSOR',4,'Consumption 2023','2023#1');
select engineer, part_code, on_hand from public.handstock_balance where engineer_key = public.handstock_key('RAVI');

\echo '--- 4. an issued spare still needs an engineer (expect ERROR) ---'
insert into public.spare_issue_history (engineer, part, qty, source, ref)
values ('','MP-010|SENSOR',1,'Stock out','X1');

\echo '--- 5. and a quantity above zero (expect ERROR) ---'
insert into public.spare_issue_history (engineer, part, qty, source, ref)
values ('RAVI','MP-010|SENSOR',0,'Stock out','X2');

\echo '--- 6. re-loading the same export corrects rather than duplicates ---'
insert into public.spare_issue_history (engineer, part, qty, so_no, line_uid, source, ref, issued_at)
values ('RAVI','MP-010|SENSOR',5,'SO8915','OR20472|MP-010','Stock out','SO8915|OR20472|MP-010','2023-06-10')
on conflict (source_key, ref) do update set qty = excluded.qty;
select count(*) as issue_rows, sum(qty) as qty from public.spare_issue_history;

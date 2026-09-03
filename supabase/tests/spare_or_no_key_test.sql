-- ===========================================================================
-- The OR number is the register's key (0085_spare_request_or_no_key.sql).
--   The import matches a request on its OR number and never sends `uid`; a
--   line finds its parent by OR number even when that request is held under
--   a different uid. Only a request in neither file gets a stub (0084).
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

\echo '--- 1. an insert with no uid takes the OR number as its uid ---'
insert into public.spare_requests (or_no, engineer, item_status) values ('OR43016','Ravi','WARRANTY');
select uid, or_no from public.spare_requests where or_no='OR43016';

\echo '--- 2. the app still supplies its own uid, and keeps it ---'
insert into public.spare_requests (uid, engineer, item_status) values ('WA-20260101-0001','Ravi','WARRANTY');
select uid, or_no ~ '^OR-\d{4}-\d{4}$' as numbered from public.spare_requests where uid='WA-20260101-0001';

\echo '--- 3. a request already held under the sheet row id: re-importing it on'
\echo '       the OR number UPDATES that row instead of colliding ---'
insert into public.spare_requests (uid, or_no, engineer, item_status)
values ('S1-30793a25','OR43017','Ravi','WARRANTY');
insert into public.spare_requests (or_no, engineer, item_status, remarks)
values ('OR43017','Meghanath','WARRANTY','re-imported')
on conflict (or_no) do update
   set engineer = excluded.engineer, remarks = excluded.remarks;
select uid, or_no, engineer, remarks from public.spare_requests where or_no='OR43017';

\echo '--- 4. matching on uid instead is what used to stop the file (expect ERROR) ---'
insert into public.spare_requests (uid, or_no, engineer, item_status)
values ('OR43017','OR43017','Meghanath','WARRANTY')
on conflict (uid) do update set engineer = excluded.engineer;

\echo '--- 5. a line finds that request by OR number, under its real uid ---'
insert into public.spare_request_lines (request_uid, part, qty) values ('OR43017','P-A',1);
select request_uid, part from public.spare_request_lines where part='P-A';
select count(*) as requests_for_43017 from public.spare_requests where or_no='OR43017';

\echo '--- 6. an OR number in neither file still gets a stub, marked as one ---'
insert into public.spare_request_lines (request_uid, part, qty) values ('OR99999','P-B',1);
select uid, or_no, status, left(remarks, 24) as remarks from public.spare_requests where or_no='OR99999';

\echo '--- 7. and the stub is created once, not per line ---'
insert into public.spare_request_lines (request_uid, part, qty) values ('OR99999','P-C',2);
select count(*) as stubs from public.spare_requests where uid='OR99999';

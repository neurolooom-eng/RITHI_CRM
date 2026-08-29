-- ===========================================================================
-- OR numbering: OR-YY/MM/N, restarting at 1 each month
-- (0017_spare_or_number_monthly.sql).
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- Note: it seeds a pre-0017 row to show old numbers are kept as history.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.spare_requests (uid, engineer, item_status, or_no)
  values ('T1','E','WARRANTY','OR47042');   -- a number from the old running series
\echo '--- new requests use OR-YY/MM/N ---'
insert into public.spare_requests (uid, engineer, item_status) values ('N1','E','WARRANTY'),('N2','E','WARRANTY'),('N3','E','WARRANTY');
select uid, or_no, or_req_date from public.spare_requests where uid like 'N%' order by uid;

\echo '--- the pre-existing number is left alone (history) ---'
select uid, or_no from public.spare_requests where uid='T1';

\echo '--- a back-dated request is numbered in ITS month ---'
insert into public.spare_requests (uid, engineer, item_status, or_req_date) values ('B1','E','WARRANTY','2026-07-15');
insert into public.spare_requests (uid, engineer, item_status, or_req_date) values ('B2','E','WARRANTY','2026-07-20');
select uid, or_no, or_req_date from public.spare_requests where uid like 'B%' order by uid;

\echo '--- next month restarts at 1 ---'
insert into public.spare_requests (uid, engineer, item_status, or_req_date) values ('S1','E','WARRANTY','2026-09-01');
insert into public.spare_requests (uid, engineer, item_status, or_req_date) values ('S2','E','WARRANTY','2026-09-02');
select uid, or_no from public.spare_requests where uid like 'S%' order by uid;

\echo '--- and the current month carries on where it left off ---'
insert into public.spare_requests (uid, engineer, item_status) values ('N4','E','WARRANTY');
select uid, or_no from public.spare_requests where uid='N4';

\echo '--- counters ---'
select period, last_no from public.spare_or_counters order by period;

\echo '--- uniqueness still enforced ---'
\echo 'expect ERROR: duplicate or_no'
insert into public.spare_requests (uid, engineer, item_status, or_no) values ('D1','E','WARRANTY','OR-26/08/1');

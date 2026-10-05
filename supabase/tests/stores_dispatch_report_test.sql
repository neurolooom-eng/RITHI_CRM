-- ===========================================================================
-- STORES DISPATCH REPORT (0385) -- the AppSheet Stores view, one row per
-- spare line dispatched.
--
-- WHAT THIS PROVES:
--   1. a dispatched line appears once, in the format's columns: OR|part key,
--      SO, the engineer and the User Master address, DETAILS / Spare, the
--      quantities, Item Status and the part's IND/IMP;
--   2. "Request Final Approval Date" is the LATEST of RM / Commercial / NSM,
--      and the days are EXACT elapsed time to one decimal, banded;
--   3. a line with no approval time recorded has a BLANK approval date, blank
--      days and the band "No approval date" -- never a figure computed from a
--      date that is not an approval (AppSheet's ">5 yrs");
--   4. an undispatched line is not on the report;
--   5. as `authenticated`, the Stores Incharge reads it, and the role holds
--      the report's page key after 0385.
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0385a000-0000-0000-0000-000000000001', 'sdr-rm@x.com'),
  ('0385a000-0000-0000-0000-000000000002', 'sdr-st@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0385a000-0000-0000-0000-000000000001', 'sdr-rm@x.com', 'SDR RM', 'rm'),
  ('0385a000-0000-0000-0000-000000000002', 'sdr-st@x.com', 'SDR STORES', 'stores_incharge')
on conflict do nothing;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;

insert into public.user_directory (name, email, designation, region, address, city, state, phone)
values ('SDR ENG', 'sdr-eng@x.com', 'Service Engineer', 'South', '12 MG ROAD', 'KOTTAYAM', 'KERALA', '7510983780');
insert into public.parts (code, description, item_detail, ind_imp) values
  ('SDR-P1', 'EXPIRATORY VALVE ASSEMBLY', 'SDR-P1|EXPIRATORY VALVE ASSEMBLY', 'IMPORTED'),
  ('SDR-P2', 'HEPA FILTER', 'SDR-P2|HEPA FILTER', 'INDIGENOUS'),
  ('SDR-P3', 'FUSE 4A', 'SDR-P3|FUSE 4A', '');

-- Three call-based CMC lines (no Commercial / NSM review) and one never sent.
insert into public.spare_requests (uid, engineer, engineer_email, req_type, item_status)
values ('SDR-1', 'SDR ENG', 'sdr-eng@x.com', 'Call Based', 'CMC');
insert into public.spare_request_lines (request_uid, part, qty) values
  ('SDR-1', 'SDR-P1|EXPIRATORY VALVE ASSEMBLY', 1),
  ('SDR-1', 'SDR-P2|HEPA FILTER', 3),
  ('SDR-1', 'SDR-P3|FUSE 4A', 20),
  ('SDR-1', 'SDR-P1|EXPIRATORY VALVE ASSEMBLY', 1);
call public.be('sdr-rm@x.com');
update public.spare_request_lines set rm_approval = 'Approved', rm_by = 'SDR RM', rm_at = now(),
       commercial_approval = 'Auto-Approved', nsm_approval = 'Auto-Approved'
 where request_uid = 'SDR-1';
reset role;
-- The approval TIMES the cases need: 2 days before dispatch, 10 days before, and
-- none recorded at all (an approval with no time, as an old import carries).
alter table public.spare_request_lines disable trigger user;
update public.spare_request_lines set rm_at = now() - interval '2 days',
       commercial_at = now() - interval '5 days'          -- an EARLIER decision: not the latest
 where request_uid = 'SDR-1' and part like 'SDR-P1%' and row_no = 1;
update public.spare_request_lines set rm_at = now() - interval '10 days' where request_uid = 'SDR-1' and part like 'SDR-P2%';
update public.spare_request_lines set rm_at = null, commercial_at = null, nsm_at = null where request_uid = 'SDR-1' and part like 'SDR-P3%';
alter table public.spare_request_lines enable trigger user;
select 'fixture at Stores' as check, count(*)::text as should_be_4
  from public.spare_request_lines where request_uid = 'SDR-1' and stage = 'Stores';

call public.be('sdr-st@x.com');
select uid as stock_out_no from public.dispatch_spare_lines(
  (select array_agg(l.id) from public.spare_request_lines l
    where l.request_uid = 'SDR-1' and l.row_no in (1, 2, 3)),
  'Blue Dart', '', current_date, 'SDR STORES');
reset role;

\echo ''
\echo '--- 1 and 2. the rows, in the format ---'
select "Spare Request NO|Part Number" as key, "TO", replace("ADDRESS", E'\n', ' / ') as address,
       "Stores Status", "Part Number", "Part Description", "Dispatched Qty", "Pending QTY",
       "IND/IMP", "Item Status", "Dispatched in (Days)" as days, "Dispatched in (Days - Group)" as band, "Sl No"
  from public.stores_dispatch_report where "Spare Request NO" = (select or_no from public.spare_requests where uid = 'SDR-1')
 order by "Sl No";
select 'the checks' as check,
  (select count(*) from public.stores_dispatch_report where "Spare Request NO" = (select or_no from public.spare_requests where uid = 'SDR-1'))::text as rows_should_be_3,
  (select "Dispatched in (Days)"::text || ' ' || "Dispatched in (Days - Group)" from public.stores_dispatch_report
     where "Part Number" = 'SDR-P1' and "Spare Request NO" = (select or_no from public.spare_requests where uid = 'SDR-1')) as p1_should_be_2_0_00_03d,
  (select "Dispatched in (Days)"::text || ' ' || "Dispatched in (Days - Group)" from public.stores_dispatch_report
     where "Part Number" = 'SDR-P2') as p2_should_be_10_0_08_15d,
  (select coalesce("Request Final Approval Date"::text, 'blank') || ' | ' || coalesce("Dispatched in (Days)"::text, 'blank') || ' | ' || "Dispatched in (Days - Group)"
     from public.stores_dispatch_report where "Part Number" = 'SDR-P3') as p3_should_be_blank_blank_no_approval_date,
  (select "IND/IMP" || ' | ' || "ADDRESS" from public.stores_dispatch_report where "Part Number" = 'SDR-P1'
     and "Spare Request NO" = (select or_no from public.spare_requests where uid = 'SDR-1')) as p1_should_be_imported_and_address,
  (select ("YY - MM" = to_char(now() at time zone 'Asia/Kolkata', 'YY-MM'))::text from public.stores_dispatch_report where "Part Number" = 'SDR-P2') as yy_mm_is_dispatch_month_should_be_true;

\echo ''
\echo '--- 5. the Stores Incharge reads it, and holds the page key ---'
call public.be('sdr-st@x.com');
set role authenticated;
select count(*)::text as stores_sees_should_be_3 from public.stores_dispatch_report
 where "Spare Request NO" = (select or_no from public.spare_requests where uid = 'SDR-1');
reset role;
select 'page key' as check,
  coalesce((select (permissions ? 'mod:/exports/stores-dispatch')::text from public.app_roles where role = 'stores_incharge'), 'no row') as stores_incharge_key;

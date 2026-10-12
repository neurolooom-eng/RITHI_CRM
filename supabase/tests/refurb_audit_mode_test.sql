-- ===========================================================================
-- A REFURBISHED ISSUE IS NOT AUDITABLE: REFUSED WHILE AUDIT MODE IS ON (0415).
--
--   1. Audit Mode off: a refurbished dispatch line is written
--   2. Audit Mode on: a refurbished line is refused; an ordinary one is not
--   3. Audit Mode on: an existing line cannot be marked refurbished
--   4. Audit Mode off again: refurbished issue works again
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

update public.harness set uid = null, email = null;
insert into public.spare_requests (uid, req_type, engineer, engineer_email, item_status, ucn, handstock_reason)
values ('RFB-SR1', 'HandStock', 'RFB ENG', 'rfb@x.com', '', '', 'boot stock');
insert into public.spare_request_lines (request_uid, part, qty, row_no) values
  ('RFB-SR1', 'RF-1|REFURB TEST', 3, 1);
insert into public.spare_dispatches (uid, dc_number, engineer) values ('RFB-D1', 'DC-RFB-1', 'RFB ENG');
insert into public.app_settings (key, value) values ('audit_mode', 'off')
  on conflict (key) do update set value = excluded.value;

\echo ''
\echo '--- 1. Audit Mode off: refurbished issue written ---'
insert into public.spare_dispatch_lines (dispatch_uid, line_id, line_uid, part, qty, refurbished)
select 'RFB-D1', id, 'RFB-L1', 'RRF-1|REFURB TEST', 1, true from public.spare_request_lines where request_uid = 'RFB-SR1';
select 'off' as t, (select count(*) = 1 from public.spare_dispatch_lines where dispatch_uid = 'RFB-D1' and refurbished) as refurbished_written;

\echo ''
\echo '--- 2. Audit Mode on: refurbished refused, ordinary written ---'
update public.app_settings set value = 'on' where key = 'audit_mode';
\echo 'expect ERROR: A refurbished part cannot be issued while Audit Mode is on'
insert into public.spare_dispatch_lines (dispatch_uid, line_id, line_uid, part, qty, refurbished)
select 'RFB-D1', id, 'RFB-L2', 'RRF-1|REFURB TEST', 1, true from public.spare_request_lines where request_uid = 'RFB-SR1';
insert into public.spare_dispatch_lines (dispatch_uid, line_id, line_uid, part, qty, refurbished)
select 'RFB-D1', id, 'RFB-L3', 'RF-1|REFURB TEST', 1, false from public.spare_request_lines where request_uid = 'RFB-SR1';

\echo ''
\echo '--- 3. Audit Mode on: an existing line cannot be marked refurbished ---'
\echo 'expect ERROR: A refurbished part cannot be issued while Audit Mode is on'
update public.spare_dispatch_lines set refurbished = true where line_uid = 'RFB-L3';
select 'on' as t,
  (select count(*) = 2 from public.spare_dispatch_lines where dispatch_uid = 'RFB-D1') as two_lines_only,
  (select not refurbished from public.spare_dispatch_lines where line_uid = 'RFB-L3') as ordinary_stays_ordinary;

\echo ''
\echo '--- 4. Audit Mode off again ---'
update public.app_settings set value = 'off' where key = 'audit_mode';
update public.spare_dispatch_lines set refurbished = true where line_uid = 'RFB-L3';
select 'off again' as t, (select refurbished from public.spare_dispatch_lines where line_uid = 'RFB-L3') as refurbished_again;

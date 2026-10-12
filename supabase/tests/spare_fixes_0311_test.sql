-- ===========================================================================
-- 0311 / 0317 -- two repairs found while documenting the Spares group.
--
--   D-081  A tick-box RM approval (decide_spare_lines) writes Auto-Approved
--          into Commercial / NSM by the same rule as the single-spare Approve:
--          a WGP line goes to Stores, a HandStock line to NSM, an OGP line to
--          Commercial. Proved as a NON-ADMINISTRATOR holding spare.approve_rm
--          and nothing else, because the line guard waves an administrator
--          through and would prove nothing.
--   D-082  An amended or voided consumption line keeps its original quantity
--          and the time it was adjusted.
--   D-083  (fixed by 0316) raising a line is checked against hand stock, and
--          the original quantity survives the raise too.
--
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions)
values ('rm311', 'RM 0311', '["spare.approve_rm", "spare.view"]')
on conflict (role) do update set permissions = excluded.permissions;
insert into auth.users (id,email) values
 ('d3110000-0000-0000-0000-000000000001','rm311@x.com'),
 ('d3110000-0000-0000-0000-000000000002','eng311@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('d3110000-0000-0000-0000-000000000001','rm311@x.com','RM 311','rm311'),
 ('d3110000-0000-0000-0000-000000000002','eng311@x.com','ENG 311','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
insert into public.user_directory (name, email, reporting_manager, validity) values
 ('RM 311','rm311@x.com','',true),
 ('ENG 311','eng311@x.com','RM 311',true);
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.spare_requests (uid, or_no, req_type, engineer, engineer_email, item_status, stage) values
 ('T311-W', 'OR-T311-W', 'Call Based', 'ENG 311', 'eng311@x.com', 'WGP', 'RM Approval'),
 ('T311-O', 'OR-T311-O', 'Call Based', 'ENG 311', 'eng311@x.com', 'OGP', 'RM Approval'),
 ('T311-H', 'OR-T311-H', 'HandStock',  'ENG 311', 'eng311@x.com', '',    'RM Approval');
insert into public.spare_request_lines (request_uid, row_no, part, qty) values
 ('T311-W', 1, 'P-1|ONE', 1), ('T311-O', 1, 'P-2|TWO', 1), ('T311-H', 1, 'P-3|THREE', 1);

\echo '--- 1. D-081: tick-box RM approval of a WGP, an OGP and a HandStock line ---'
\echo 'expect: decided 3, skipped 0'
call public.be('rm311@x.com');
begin; set local role authenticated;
  select * from public.decide_spare_lines(
    array(select id from public.spare_request_lines where request_uid like 'T311-%'), 'approve', '', '');
commit;
\echo 'expect: T311-H Approved Auto-Approved Pending NSM | T311-O Approved Pending Pending Commercial | T311-W Approved Auto-Approved Auto-Approved Stores; no _by/_at on any auto-approval'
select l.request_uid, l.rm_approval, coalesce(l.commercial_approval, 'Pending') commercial,
       coalesce(l.nsm_approval, 'Pending') nsm,
       public.spare_line_stage(l.rm_approval, coalesce(l.commercial_approval, 'Pending'),
         coalesce(l.nsm_approval, 'Pending'), coalesce(l.stores_status, 'Pending'), l.received_at, r.item_status) stage,
       (l.commercial_by is null and l.commercial_at is null and l.nsm_by is null and l.nsm_at is null) as no_auto_names
  from public.spare_request_lines l join public.spare_requests r on r.uid = l.request_uid
 where l.request_uid like 'T311-%' order by 1;

\echo '--- 2. the same approver still cannot approve the Commercial stage itself ---'
\echo 'expect: decided 0, skipped 1 (not yours to decide at Commercial)'
begin; set local role authenticated;
  select * from public.decide_spare_lines(
    array(select id from public.spare_request_lines where request_uid = 'T311-O'), 'approve', '', '');
commit;

\echo '--- 3. D-082: amending, then voiding, a consumption line keeps the first quantity ---'
update public.harness set uid = null, email = null;
insert into public.field_calls (ucn, call_number, party_name) values ('T311-C', 'CN-T311', 'ACME');
insert into public.reports (ucn, call_number, engineer, visit_at, updated_at, uid)
values ('T311-C', 'CN-T311', 'ENG 311', now(), now(), 'T311-V1');
insert into public.handstock_opening (engineer, part, qty, as_of, source)
values ('ENG 311', 'P-9|NINE', 10, current_date, 'test');
insert into public.spare_consumption (ucn, call_number, part, qty, engineer)
values ('T311-C', 'CN-T311', 'P-9|NINE', 3, 'ENG 311');
update public.spare_consumption set qty = 2, adjustment_reason = 'counted wrong' where ucn = 'T311-C';
update public.spare_consumption set qty = 0, adjustment_reason = 'not fitted after all' where ucn = 'T311-C';
\echo 'expect: qty 0, original_qty 3, adjusted_at set'
select qty, original_qty, adjusted_at is not null as adjusted_at_set
  from public.spare_consumption where ucn = 'T311-C';

\echo '--- 4. raising the line again is checked against hand stock (0316) and keeps the original quantity ---'
\echo 'expect: qty 1, original_qty still 3'
update public.spare_consumption set qty = 1, adjustment_reason = 'fitted after all' where ucn = 'T311-C';
select qty, original_qty from public.spare_consumption where ucn = 'T311-C';
-- Past the balance is allowed since 0401 and the Spare Coordinator told. Rolled back.
begin;
update public.spare_consumption set qty = 51, adjustment_reason = 'too many' where ucn = 'T311-C';
select 'raise past the balance (0401)' as check, qty::text as should_be_51 from public.spare_consumption where ucn = 'T311-C';
rollback;

\echo '--- 5. the guard still refuses a void with no reason ---'
\echo 'expect ERROR: Say why the line is being voided'
update public.spare_consumption set qty = 0, adjustment_reason = '' where ucn = 'T311-C';

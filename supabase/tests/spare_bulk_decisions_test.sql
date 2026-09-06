-- ===========================================================================
-- REJECT AND DROP IN BULK (0118), and the reason they are three decisions and
-- not one.
--
--   approve  advances the line ONE stage
--   reject   an APPROVER refuses the request; it closes where it stood
--   drop     STORES did not send a part that was already approved — a
--            different outcome, recorded differently (0025), because folding
--            them together misreports who ended the line
--
-- And the rule this suite exists to hold: A REASON IS REQUIRED for reject and
-- drop. An approval explains itself; ending somebody's request does not, and a
-- register full of reasonless rejections cannot be reviewed afterwards.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('d1d1d1d1-0000-0000-0000-000000000001','bd_nsm@x.com'),
 ('d1d1d1d1-0000-0000-0000-000000000002','bd_stores@x.com'),
 ('d1d1d1d1-0000-0000-0000-000000000003','bd_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('d1d1d1d1-0000-0000-0000-000000000001','bd_nsm@x.com','BD Nsm','nsm'),
 ('d1d1d1d1-0000-0000-0000-000000000002','bd_stores@x.com','BD Stores','spare_coordinator'),
 ('d1d1d1d1-0000-0000-0000-000000000003','bd_eng@x.com','BD Eng','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
insert into public.user_directory (name, email, reporting_manager, validity) values
 ('BD Nsm','bd_nsm@x.com','',true),
 ('BD Eng','bd_eng@x.com','BD Nsm',true)
on conflict do nothing;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.spare_requests (uid, or_no, req_type, engineer, engineer_email, item_status, stage)
values ('BD-R1','OR-BD-0001','Call Based','BD Eng','bd_eng@x.com','OGP','RM Approval')
on conflict (uid) do nothing;
insert into public.spare_request_lines (request_uid, row_no, part, qty)
values ('BD-R1',1,'P-1|ONE',1), ('BD-R1',2,'P-2|TWO',1), ('BD-R1',3,'P-3|THREE',1), ('BD-R1',4,'P-4|FOUR',1)
on conflict do nothing;

\echo '--- 1. a REJECT with no reason is refused ---'
\echo 'expect ERROR: A reject needs a reason'
call public.be('bd_nsm@x.com');
begin;
  set local role authenticated;
  select * from public.decide_spare_lines(array(select id from public.spare_request_lines where request_uid='BD-R1'), 'reject', 'BD Nsm', '   ');
commit;

\echo '--- 2. a DROP with no reason is refused too ---'
\echo 'expect ERROR: A drop needs a reason'
call public.be('bd_stores@x.com');
begin;
  set local role authenticated;
  select * from public.decide_spare_lines(array(select id from public.spare_request_lines where request_uid='BD-R1'), 'drop', 'BD Stores', '');
commit;

\echo '--- 3. an unknown decision is refused, not treated as one of them ---'
\echo 'expect ERROR: Unknown decision'
call public.be('bd_nsm@x.com');
begin;
  set local role authenticated;
  select * from public.decide_spare_lines(array[1::bigint], 'maybe', 'BD Nsm', 'x');
commit;

\echo '--- 4. REJECT two, with a reason ---'
\echo 'expect: decided 2, and the two closed as Rejected with the stage recorded'
call public.be('bd_nsm@x.com');
begin;
  set local role authenticated;
  select * from public.decide_spare_lines(
    array(select id from public.spare_request_lines where request_uid='BD-R1' order by row_no limit 2),
    'reject', 'BD Nsm', 'Not required — machine replaced');
commit;
select row_no, stage, rm_approval, rejected_stage, reject_reason
  from public.spare_request_lines where request_uid='BD-R1' order by row_no;

\echo '--- 5. DROP one — a different outcome, recorded differently ---'
\echo 'expect: decided 1; row 3 is Dropped with the reason on the DISPATCH side,'
\echo 'and its rm_approval untouched — it was not refused by an approver'
call public.be('bd_stores@x.com');
begin;
  set local role authenticated;
  select * from public.decide_spare_lines(
    array(select id from public.spare_request_lines where request_uid='BD-R1' and row_no = 3),
    'drop', 'BD Stores', 'Short supply');
commit;
select row_no, stage, rm_approval, stores_status, dispatch_remarks, reject_reason
  from public.spare_request_lines where request_uid='BD-R1' and row_no = 3;

\echo '--- 6. an already-closed line is SKIPPED, not an error ---'
\echo 'expect: decided 0, skipped 3 — a selection made a minute ago can be'
\echo 'overtaken by somebody else''s work'
call public.be('bd_nsm@x.com');
begin;
  set local role authenticated;
  select * from public.decide_spare_lines(
    array(select id from public.spare_request_lines where request_uid='BD-R1' order by row_no limit 3),
    'reject', 'BD Nsm', 'again');
commit;

\echo '--- 7. an ENGINEER can neither reject nor drop ---'
\echo 'expect ERROR twice: cannot approve or reject / cannot drop'
call public.be('bd_eng@x.com');
begin;
  set local role authenticated;
  select * from public.decide_spare_lines(array(select id from public.spare_request_lines where request_uid='BD-R1' and row_no=4), 'reject', 'BD Eng', 'no');
commit;
begin;
  set local role authenticated;
  select * from public.decide_spare_lines(array(select id from public.spare_request_lines where request_uid='BD-R1' and row_no=4), 'drop', 'BD Eng', 'no');
commit;

\echo '--- 8. approve still works, through the same function ---'
\echo 'expect: decided 1, and row 4 moves to Commercial — ONE stage, not three'
call public.be('bd_nsm@x.com');
begin;
  set local role authenticated;
  select * from public.decide_spare_lines(
    array(select id from public.spare_request_lines where request_uid='BD-R1' and row_no=4), 'approve', 'BD Nsm', '');
commit;
select row_no, stage from public.spare_request_lines where request_uid='BD-R1' and row_no=4;

\echo '--- 9. and 0116''s approve_spare_lines still answers as it always did ---'
\echo 'expect: columns approved / skipped / reason, 1 approved (row 4 -> NSM)'
call public.be('bd_nsm@x.com');
begin;
  set local role authenticated;
  select * from public.approve_spare_lines(
    array(select id from public.spare_request_lines where request_uid='BD-R1' and row_no=4), 'BD Nsm');
commit;

\echo '--- 10. cleanup ---'
call public.be(null);
delete from public.spare_request_lines where request_uid like 'BD-%';
delete from public.spare_requests where uid like 'BD-%';
delete from public.profiles where email like 'bd_%@x.com';
delete from public.user_directory where email like 'bd_%@x.com';

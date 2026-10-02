-- ===========================================================================
-- THE FIRST BATCH OF HIGH-RATED DEFECTS, PROVED ON A DATABASE (0311-0315).
--
--   1. D-036  cancel_call() refuses a call that is no longer open (0311)
--   2. D-042  who booked and who adjusted a consumption line come from the
--             session; with no session the supplied value is kept (0312)
--   3. D-043  a rejection, a drop and a reassignment each need a reason (0313)
--   4. D-051/D-062  returns, transfers, training and R&R periods are imaged
--             in record_audit (0314)
--   5. D-066  the audit log admits a holder of audit.view (0315)
--
-- Each check that matters runs as `authenticated`, because a superuser
-- ignores row-level security and EXECUTE grants alike.
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('hb_auditor', 'HB Auditor', '["audit.view"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
  ('0b110000-0000-0000-0000-000000000001', 'hb-admin@x.com'),
  ('0b110000-0000-0000-0000-000000000002', 'hb-coord@x.com'),
  ('0b110000-0000-0000-0000-000000000003', 'hb-auditor@x.com'),
  ('0b110000-0000-0000-0000-000000000004', 'hb-eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0b110000-0000-0000-0000-000000000001', 'hb-admin@x.com',   'HB Admin',   'admin'),
  ('0b110000-0000-0000-0000-000000000002', 'hb-coord@x.com',   'HB Coord',   'spare_coordinator'),
  ('0b110000-0000-0000-0000-000000000003', 'hb-auditor@x.com', 'HB Auditor', 'hb_auditor'),
  ('0b110000-0000-0000-0000-000000000004', 'hb-eng@x.com',     'HB ENG',     'engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

-- ===========================================================================
\echo ''
\echo '--- 1. D-036: only an Unattended or Unsolved call can be cancelled ---'
insert into public.field_calls (ucn, call_number, party_name, allocated_to, last_status, last_visit_at, reopened_at) values
  ('HB-OPEN',    'CN-HB1', 'ACME', 'HB ENG', null,       null,  null),
  ('HB-UNSOLV',  'CN-HB2', 'ACME', 'HB ENG', 'Unsolved', now(), null),
  ('HB-SOLVED',  'CN-HB3', 'ACME', 'HB ENG', 'Solved',   now(), null),
  ('HB-REOPEN',  'CN-HB4', 'ACME', 'HB ENG', 'Solved',   now(), now());
select ucn, open_state from public.field_calls where ucn like 'HB-%' order by ucn;

call public.be('hb-admin@x.com');
begin; set local role authenticated;
  select public.cancel_call('HB-OPEN',   'raised twice') as unattended_cancels;
  select public.cancel_call('HB-UNSOLV', 'raised twice') as unsolved_cancels;
commit;
\echo 'expect ERROR: Call HB-SOLVED is Solved: only an Unattended or Unsolved call can be cancelled'
begin; set local role authenticated; select public.cancel_call('HB-SOLVED', 'tidy up'); rollback;
\echo 'expect ERROR: Call HB-REOPEN is Reopened: only an Unattended or Unsolved call can be cancelled'
begin; set local role authenticated; select public.cancel_call('HB-REOPEN', 'tidy up'); rollback;
-- The batch path loops cancel_call() and reports each refusal as a ROW, so it
-- is read rather than expected as an error.
begin; set local role authenticated;
  select ucn, ok as ok_should_be_false, error from public.cancel_calls(array['HB-SOLVED'], 'tidy up');
rollback;
select 'cancel' as check,
       (select count(*) from public.field_calls where ucn in ('HB-OPEN','HB-UNSOLV') and cancelled_at is not null) as open_two_cancelled_should_be_2,
       (select count(*) from public.field_calls where ucn in ('HB-SOLVED','HB-REOPEN') and cancelled_at is not null) as closed_two_cancelled_should_be_0;

-- ===========================================================================
\echo ''
\echo '--- 2. D-042: the people on a consumption line come from the session ---'
call public.nobody();
insert into public.handstock_opening (engineer, part, qty, as_of, source)
values ('HB ENG', 'HB-P1|HB PART', 10, current_date, 'test');

call public.be('hb-coord@x.com');
begin; set local role authenticated;
  insert into public.spare_consumption (ucn, call_number, part, qty, engineer, remarks, recorded_by, source)
  values ('HB-UNSOLV', 'CN-HB2', 'HB-P1|HB PART', 1, 'HB ENG', 'hb line', 'Somebody Else', 'Reconciliation');
commit;
select 'booked' as check, recorded_by as should_be_HB_Coord
  from public.spare_consumption where remarks = 'hb line';

begin; set local role authenticated;
  update public.spare_consumption set qty = 2, adjustment_reason = 'two fitted', adjusted_by = 'A Forged Name'
   where remarks = 'hb line';
commit;
-- 10 opening, less this line, now 2: 8 in hand.
select 'adjusted' as check, qty as qty_should_be_2, adjusted_by as should_be_HB_Coord, recorded_by as still_HB_Coord
  from public.spare_consumption where remarks = 'hb line';

begin; set local role authenticated;
  update public.spare_consumption set remarks = 'hb line', recorded_by = 'Rewritten', adjusted_by = 'Rewritten'
   where remarks = 'hb line';
commit;
select 'unrelated edit' as check, recorded_by as should_still_be_HB_Coord, adjusted_by as should_still_be_HB_Coord
  from public.spare_consumption where remarks = 'hb line';

-- RAISING A QUANTITY (0316): it called handstock_available(), which never
-- existed, so the adjustment above failed with "function does not exist".
-- Within what is in hand it goes through; beyond it, it is refused.
\echo 'expect ERROR: Only 8 left in HB ENG''s hand stock for HB-P1|HB PART'
begin; set local role authenticated;
  update public.spare_consumption set qty = 50, adjustment_reason = 'too many' where remarks = 'hb line';
rollback;

-- No session: an administrative load keeps what it was given.
call public.nobody();
insert into public.spare_consumption (ucn, call_number, part, qty, engineer, remarks, recorded_by, source)
values ('HB-UNSOLV', 'CN-HB2', 'HB-P1|HB PART', 1, 'HB ENG', 'hb loaded', 'Loader Name', 'Reconciliation');
select 'no session' as check, recorded_by as should_be_Loader_Name
  from public.spare_consumption where remarks = 'hb loaded';

-- ===========================================================================
\echo ''
\echo '--- 3. D-043: a rejection, a drop and a reassignment each need a reason ---'
call public.nobody();
insert into public.spare_requests (uid, or_no, engineer, engineer_email, req_type, item_status) values
  ('HB-R1', 'OR-HB-0001', 'HB ENG', 'hb-eng@x.com', 'HandStock', 'WARRANTY');
insert into public.spare_request_lines (request_uid, part, qty) values
  ('HB-R1', 'HB-L1|Pump', 1), ('HB-R1', 'HB-L2|Valve', 1), ('HB-R1', 'HB-L3|Hose', 1);

call public.be('hb-admin@x.com');
\echo 'expect ERROR: A rejection needs a reason'
update public.spare_request_lines set rm_approval = 'Rejected', rejected_stage = 'RM Approval', reject_reason = '  '
 where request_uid = 'HB-R1' and part like 'HB-L1%';
update public.spare_request_lines set rm_approval = 'Rejected', rejected_stage = 'RM Approval', reject_reason = 'not covered'
 where request_uid = 'HB-R1' and part like 'HB-L1%';
\echo 'expect ERROR: A drop needs a reason'
update public.spare_request_lines set stores_status = 'Dropped', dispatch_remarks = ''
 where request_uid = 'HB-R1' and part like 'HB-L2%';
update public.spare_request_lines set stores_status = 'Dropped', dispatch_remarks = 'superseded'
 where request_uid = 'HB-R1' and part like 'HB-L2%';
select 'reasons kept' as check,
       (select reject_reason from public.spare_request_lines where request_uid = 'HB-R1' and part like 'HB-L1%') as should_be_not_covered,
       (select dispatch_remarks from public.spare_request_lines where request_uid = 'HB-R1' and part like 'HB-L2%') as should_be_superseded;

-- An unrelated edit of a line rejected long ago is not a NEW rejection.
update public.spare_request_lines set reject_reason = '' where request_uid = 'HB-R1' and part like 'HB-L1%';
select 'an old rejection is left alone' as check, count(*) as should_be_1
  from public.spare_request_lines where request_uid = 'HB-R1' and part like 'HB-L1%' and reject_reason = '';

\echo 'expect ERROR: Say why the order is moving to another engineer'
begin; set local role authenticated; select public.reassign_spare_request('HB-R1', 'HB Coord', '', '   '); rollback;
begin; set local role authenticated;
  select (public.reassign_spare_request('HB-R1', 'HB Coord', '', 'covering the site')).engineer as should_be_HB_Coord;
commit;

-- No session: nobody to ask, nothing refused.
call public.nobody();
update public.spare_request_lines set stores_status = 'Dropped', dispatch_remarks = ''
 where request_uid = 'HB-R1' and part like 'HB-L3%';
select 'no session' as check, count(*) as dropped_should_be_1
  from public.spare_request_lines where request_uid = 'HB-R1' and part like 'HB-L3%' and stores_status = 'Dropped';

-- ===========================================================================
\echo ''
\echo '--- 4. D-051 / D-062: five more tables are imaged ---'
call public.be('hb-admin@x.com');
insert into public.stock_transfers (uid, from_engineer, to_engineer, remarks) values ('HB-ST', 'HB ENG', 'HB Coord', 'hb');
insert into public.user_directory (name, email) values ('HB Trainee', 'hb-trainee@x.com');
insert into public.training_sessions (topic, session_date) values ('HB topic', current_date);
insert into public.training_attendance (session_id, dir_id, attended, assessment)
select (select id from public.training_sessions where topic = 'HB topic'),
       (select id from public.user_directory where name = 'HB Trainee'), true, 'Fail';
update public.training_attendance set assessment = 'Pass'
 where session_id = (select id from public.training_sessions where topic = 'HB topic');
insert into public.user_rr (dir_id, url, effective_from)
select id, 'https://example.com/rr', current_date from public.user_directory where name = 'HB Trainee';
update public.user_rr set effective_from = current_date - 30
 where dir_id = (select id from public.user_directory where name = 'HB Trainee');

select 'imaged' as check,
  (select count(*) from public.record_audit where table_name = 'stock_transfers' and record_key = 'HB-ST') as transfer_should_be_1,
  (select count(*) from public.record_audit where table_name = 'training_sessions' and op = 'INSERT') >= 1 as session_should_be_true,
  (select count(*) from public.record_audit where table_name = 'training_attendance' and op = 'UPDATE'
      and old_data->>'assessment' = 'Fail' and new_data->>'assessment' = 'Pass') as fail_to_pass_should_be_1,
  (select count(*) from public.record_audit where table_name = 'user_rr' and op = 'UPDATE') as rr_edit_should_be_1;
select 'every arming' as check, count(*) as triggers_should_be_15
  from pg_trigger
 where tgrelid in ('public.material_returns'::regclass, 'public.stock_transfers'::regclass,
                   'public.training_sessions'::regclass, 'public.training_attendance'::regclass,
                   'public.user_rr'::regclass)
   and tgname in ('record_audit_i', 'record_audit_u', 'record_audit_d');

-- ===========================================================================
\echo ''
\echo '--- 5. D-066: the audit log admits whoever the Audit Log screen admits ---'
call public.nobody();
insert into public.audit_log (actor, email, action, target) values ('HB', 'hb@x.com', 'hb.probe', 'HB');
call public.be('hb-auditor@x.com');
begin; set local role authenticated;
  select count(*) as auditor_reads_should_be_1 from public.audit_log where action = 'hb.probe';
rollback;
call public.be('hb-eng@x.com');
begin; set local role authenticated;
  select count(*) as engineer_reads_should_be_0 from public.audit_log where action = 'hb.probe';
rollback;

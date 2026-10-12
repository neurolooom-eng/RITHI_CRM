-- ===========================================================================
-- THE SECOND BATCH OF HIGH-RATED DEFECTS, PROVED ON A DATABASE (0335-0342).
-- Each section proves BOTH halves: the hole the re-review measured is closed,
-- AND the honest path beside it still works -- the batch was asked for with
-- "ensure it doesn't insert any breaking changes".
--
--   1. D-119  an import marker is the importer's alone (0339)
--   2. D-120  a recorded transfer is not re-pointed (0339)
--   3. D-123  a return is the returner's own stock (0339)
--   4. D-124  a cut never takes stock below zero, and is imaged (0339)
--   5. D-121  part and quantity are fixed once the RM decides (0340)
--   6. D-122  the engineer moves only by Change engineer; cover follows the call (0340)
--   7. D-128  re-open / close need sight of the call (0341)
--   8. D-129  a review needs a real call the writer can see (0342)
--   9. D-136  a master key changes only through a rename (0335)
--  10. D-142  an Indoor job that has been worked on is not deleted (0336)
--  11. D-127, D-134  the public key reads and runs less (0337, 0338)
--
-- Every check that matters runs as `authenticated`; a superuser ignores
-- row-level security and EXECUTE grants. Run ONCE after _stub.sql + every
-- migration. Every error printed is labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('hb2_rm',     'HB2 RM',      '["calls.view", "calls.reopen", "review.edit", "spare.request", "spare.approve_rm"]'::jsonb),
 ('hb2_master', 'HB2 Masters', '["masters.view", "masters.parties.edit", "masters.parties.delete", "masters.parts.edit", "masters.product_master.edit"]'::jsonb),
 ('hb2_indoor', 'HB2 Indoor',  '["mod:/indoor", "indoor.delete"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
  ('0b220000-0000-0000-0000-000000000001', 'hb2-admin@x.com'),
  ('0b220000-0000-0000-0000-000000000002', 'hb2-eng-a@x.com'),
  ('0b220000-0000-0000-0000-000000000003', 'hb2-eng-b@x.com'),
  ('0b220000-0000-0000-0000-000000000004', 'hb2-eng-c@x.com'),
  ('0b220000-0000-0000-0000-000000000005', 'hb2-stores@x.com'),
  ('0b220000-0000-0000-0000-000000000006', 'hb2-coord@x.com'),
  ('0b220000-0000-0000-0000-000000000007', 'hb2-rm@x.com'),
  ('0b220000-0000-0000-0000-000000000008', 'hb2-master@x.com'),
  ('0b220000-0000-0000-0000-000000000009', 'hb2-indoor@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0b220000-0000-0000-0000-000000000001', 'hb2-admin@x.com',  'HB2 Admin',  'admin'),
  ('0b220000-0000-0000-0000-000000000002', 'hb2-eng-a@x.com',  'HB2 ENG A',  'engineer'),
  ('0b220000-0000-0000-0000-000000000003', 'hb2-eng-b@x.com',  'HB2 ENG B',  'engineer'),
  ('0b220000-0000-0000-0000-000000000004', 'hb2-eng-c@x.com',  'HB2 ENG C',  'engineer'),
  ('0b220000-0000-0000-0000-000000000005', 'hb2-stores@x.com', 'HB2 Stores', 'stores_incharge'),
  ('0b220000-0000-0000-0000-000000000006', 'hb2-coord@x.com',  'HB2 Coord',  'spare_coordinator'),
  ('0b220000-0000-0000-0000-000000000007', 'hb2-rm@x.com',     'HB2 RM',     'hb2_rm'),
  ('0b220000-0000-0000-0000-000000000008', 'hb2-master@x.com', 'HB2 Master', 'hb2_master'),
  ('0b220000-0000-0000-0000-000000000009', 'hb2-indoor@x.com', 'HB2 Indoor', 'hb2_indoor')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
insert into public.user_directory (name, email, reporting_manager) values
  ('HB2 ENG A', 'hb2-eng-a@x.com', 'HB2 RM'),
  ('HB2 ENG B', 'hb2-eng-b@x.com', 'HB2 RM'),
  ('HB2 ENG C', 'hb2-eng-c@x.com', 'HB2 OTHER RM'),
  ('HB2 RM',    'hb2-rm@x.com',    '');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

-- Fixtures, written with no signed-in user (a load).
call public.nobody();
insert into public.parts (code, item_detail) values ('HP-1', 'HP-1|HB2 PART') on conflict do nothing;
insert into public.handstock_opening (engineer, part, qty, as_of, source) values
  ('HB2 ENG A', 'HP-1|HB2 PART', 5, current_date, 'test'),
  ('HB2 ENG B', 'HP-1|HB2 PART', 3, current_date, 'test'),
  ('HB2 ENG C', 'HP-1|HB2 PART', 4, current_date, 'test');
insert into public.field_calls (ucn, call_number, party_name, allocated_to, last_status, last_visit_at, item_status) values
  ('HB2-A1', 'CN-HB2A1', 'HB2 HOSP', 'HB2 ENG A', 'Solved',  now(), 'AMC'),
  ('HB2-A2', 'CN-HB2A2', 'HB2 HOSP', 'HB2 ENG A', null,      null,  'AMC'),
  ('HB2-C1', 'CN-HB2C1', 'HB2 HOSP', 'HB2 ENG C', 'Solved',  now(), 'AMC'),
  ('HB2-C2', 'CN-HB2C2', 'HB2 HOSP', 'HB2 ENG C', null,      null,  'AMC');
insert into public.reports (uid, ucn, call_status, data, visit_at, updated_at) values
  ('HB2-V1', 'HB2-A1', 'Solved - Report Completed', '{}'::jsonb, now(), now()),
  ('HB2-V2', 'HB2-C1', 'Solved - Report Completed', '{}'::jsonb, now(), now());
select engineer, qty from public.engineer_stock where part = 'HP-1|HB2 PART' order by 1;

-- ===========================================================================
\echo ''
\echo '--- 1. D-119: an import marker is the importer''s alone ---'
call public.be('hb2-eng-a@x.com');
-- Since 0401 an over-balance line is booked rather than refused, so the proof
-- that the made-up marker is DISCARDED is the row itself: its source_ref is
-- blank, and it was treated as an ordinary line -- the hand-stock check ran and
-- told the Spare Coordinator, which an imported line skips. Rolled back.
begin; set local role authenticated;
  insert into public.spare_consumption (ucn, call_number, part, qty, engineer, engineer_email, source_ref)
  values ('HB2-A1', 'CN-HB2A1', 'HP-1|HB2 PART', 999, 'HB2 ENG A', 'hb2-eng-a@x.com', 'made-up-ref');
  reset role;
  select 'the marker is discarded' as check,
    (select source_ref from public.spare_consumption where ucn = 'HB2-A1' and qty = 999) as source_ref_should_be_blank,
    (select count(*) from public.notifications where kind = 'negative_handstock' and body like '%HB2 ENG A%')::text as coordinator_told_should_be_1;
rollback;
\echo 'the honest path: an ordinary consumption of 2 is booked'
begin; set local role authenticated;
  insert into public.spare_consumption (ucn, call_number, part, qty, engineer, engineer_email)
  values ('HB2-A1', 'CN-HB2A1', 'HP-1|HB2 PART', 2, 'HB2 ENG A', 'hb2-eng-a@x.com');
commit;
\echo 'expect ERROR: Stock transfer exceeds available stock (a transfer marked import by an engineer is an ordinary transfer)'
begin; set local role authenticated;
  insert into public.stock_transfers (uid, from_engineer, to_engineer, source) values ('HB2-T-IMP', 'HB2 ENG A', 'HB2 ENG B', 'import');
  insert into public.stock_transfer_lines (transfer_uid, part, qty, reason) values ('HB2-T-IMP', 'HP-1|HB2 PART', 50, 'x');
commit;
\echo 'expect ERROR: Material return exceeds hand stock (a return marked import by an engineer is an ordinary return)'
begin; set local role authenticated;
  insert into public.material_returns (uid, engineer, engineer_email, part, good_qty, source)
  values ('HB2-MR-IMP', 'HB2 ENG A', 'hb2-eng-a@x.com', 'HP-1|HB2 PART', 100, 'import');
commit;
\echo 'the importer still loads history: an administrator books 50 under an import reference (a past engineer, beyond any balance)'
call public.be('hb2-admin@x.com');
begin; set local role authenticated;
  insert into public.spare_consumption (ucn, call_number, part, qty, engineer, engineer_email, source_ref)
  values ('HB2-A1', 'CN-HB2A1', 'HP-1|HB2 PART', 50, 'HB2 HISTORIC', '', 'IMP-HB2-1');
commit;
select source_ref, qty from public.spare_consumption where ucn = 'HB2-A1' order by id;
\echo 'expect ERROR: Say why the quantity is being adjusted (the re-load exemption is the importer''s alone)'
call public.be('hb2-coord@x.com');
begin; set local role authenticated;
  update public.spare_consumption set qty = 60 where source_ref = 'IMP-HB2-1';
commit;

-- ===========================================================================
\echo ''
\echo '--- 2. D-120: a recorded transfer is not re-pointed ---'
call public.be('hb2-eng-b@x.com');
begin; set local role authenticated;
  insert into public.stock_transfers (uid, from_engineer, to_engineer) values ('HB2-T-OK', 'HB2 ENG B', 'HB2 ENG A');
  insert into public.stock_transfer_lines (transfer_uid, part, qty, reason) values ('HB2-T-OK', 'HP-1|HB2 PART', 1, 'needed');
commit;
select uid, from_engineer, to_engineer from public.stock_transfers where uid = 'HB2-T-OK';
\echo 'expect ERROR: Transfer HB2-T-OK is recorded: its engineers and date are not changed afterwards'
begin; set local role authenticated;
  update public.stock_transfers set from_engineer = 'HB2 ENG C' where uid = 'HB2-T-OK';
commit;
\echo 'expect ERROR: Transfer HB2-T-OK is recorded (back-dating)'
begin; set local role authenticated;
  update public.stock_transfers set transfer_date = '2020-01-01' where uid = 'HB2-T-OK';
commit;
\echo 'a remark can still be corrected'
begin; set local role authenticated;
  update public.stock_transfers set remarks = 'corrected remark' where uid = 'HB2-T-OK';
commit;
select uid, from_engineer, remarks from public.stock_transfers where uid = 'HB2-T-OK';

-- ===========================================================================
\echo ''
\echo '--- 3. D-123: a return is the returner''s own stock ---'
call public.be('hb2-eng-a@x.com');
\echo 'expect ERROR: A return is your own stock: HB2 ENG B is not you'
begin; set local role authenticated;
  insert into public.material_returns (uid, engineer, engineer_email, part, good_qty)
  values ('HB2-MR-B', 'HB2 ENG B', 'hb2-eng-a@x.com', 'HP-1|HB2 PART', 1);
commit;
\echo 'the honest path: ENG A returns 1 of his own'
begin; set local role authenticated;
  insert into public.material_returns (uid, engineer, engineer_email, part, good_qty)
  values ('HB2-MR-A', 'HB2 ENG A', 'hb2-eng-a@x.com', 'HP-1|HB2 PART', 1);
commit;
\echo 'and Stores (stock.return.others) still records one for somebody else'
call public.be('hb2-stores@x.com');
begin; set local role authenticated;
  insert into public.material_returns (uid, engineer, engineer_email, part, good_qty)
  values ('HB2-MR-S', 'HB2 ENG B', '', 'HP-1|HB2 PART', 1);
commit;
select uid, engineer from public.material_returns where uid like 'HB2-MR-%' order by uid;

-- ===========================================================================
\echo ''
\echo '--- 4. D-124: a cut never takes stock below zero, and is imaged ---'
call public.be('hb2-eng-c@x.com');
begin; set local role authenticated;
  insert into public.spare_consumption (ucn, call_number, part, qty, engineer, engineer_email)
  values ('HB2-C1', 'CN-HB2C1', 'HP-1|HB2 PART', 3, 'HB2 ENG C', 'hb2-eng-c@x.com');
commit;
select engineer, qty from public.engineer_stock where engineer = 'hb2 eng c';
call public.be('hb2-stores@x.com');
\echo 'expect ERROR: HB2 ENG C would be left with -3 of HP-1 (deleting the opening balance)'
begin; set local role authenticated;
  delete from public.handstock_opening where engineer = 'HB2 ENG C';
commit;
\echo 'expect ERROR: HB2 ENG C would be left with -1 of HP-1 (cutting the opening balance to 2)'
begin; set local role authenticated;
  update public.handstock_opening set qty = 2 where engineer = 'HB2 ENG C';
commit;
\echo 'a cut that leaves stock is allowed, and is imaged'
begin; set local role authenticated;
  update public.handstock_opening set qty = 3 where engineer = 'HB2 ENG C';
commit;
select engineer, qty from public.engineer_stock where engineer = 'hb2 eng c';
select count(*) > 0 as opening_change_imaged from public.record_audit where table_name = 'handstock_opening';
select count(*) as dispatch_line_triggers from pg_trigger
 where tgrelid = 'public.spare_dispatch_lines'::regclass and tgname in ('stock_cut_keeps_balance', 'record_audit_u', 'record_audit_d');

-- ===========================================================================
\echo ''
\echo '--- 5. D-121: part and quantity are fixed once the RM decides ---'
call public.be('hb2-eng-a@x.com');
begin; set local role authenticated;
  insert into public.spare_requests (uid, engineer, engineer_email, ucn, item_status, req_type)
  values ('HB2-SR1', 'HB2 ENG A', 'hb2-eng-a@x.com', 'HB2-A2', 'AMC', 'Call Based');
  insert into public.spare_request_lines (request_uid, part, qty) values ('HB2-SR1', 'HP-1|HB2 PART', 1);
  insert into public.spare_request_lines (request_uid, part, qty) values ('HB2-SR1', 'HP-1|HB2 PART', 1);
commit;
\echo 'the requester may still change a line the RM has not decided'
begin; set local role authenticated;
  update public.spare_request_lines set qty = 2
   where id = (select min(id) from public.spare_request_lines where request_uid = 'HB2-SR1');
commit;
call public.nobody();
update public.spare_request_lines set rm_approval = 'Approved'
 where id = (select max(id) from public.spare_request_lines where request_uid = 'HB2-SR1');
call public.be('hb2-eng-a@x.com');
\echo 'expect ERROR: Spare … has been approved by the RM: its part and quantity are what was approved'
begin; set local role authenticated;
  update public.spare_request_lines set qty = 40
   where id = (select max(id) from public.spare_request_lines where request_uid = 'HB2-SR1');
commit;
select qty, rm_approval from public.spare_request_lines where request_uid = 'HB2-SR1' order by id;

-- ===========================================================================
\echo ''
\echo '--- 6. D-122: the engineer moves only by Change engineer; the cover follows the call ---'
call public.be('hb2-eng-a@x.com');
\echo 'expect ERROR: The engineer on … is changed with "Change engineer"'
begin; set local role authenticated;
  update public.spare_requests set engineer = 'HB2 ENG C', engineer_email = 'hb2-eng-c@x.com' where uid = 'HB2-SR1';
commit;
\echo 'Change engineer itself still works (administrator, with a reason)'
call public.be('hb2-admin@x.com');
begin; set local role authenticated;
  select public.reassign_spare_request('HB2-SR1', 'HB2 ENG B', 'hb2-eng-b@x.com', 'covering leave');
commit;
select uid, engineer from public.spare_requests where uid = 'HB2-SR1';
call public.be('hb2-rm@x.com');
\echo 'an RM writing another cover is kept as the call''s (AMC), not refused'
begin; set local role authenticated;
  update public.spare_requests set item_status = 'WGP', req_type = 'HandStock' where uid = 'HB2-SR1';
commit;
select uid, item_status, req_type from public.spare_requests where uid = 'HB2-SR1';
\echo 'the call''s own value is accepted: the call becomes WGP and Refresh carries it'
call public.nobody();
alter table public.field_calls disable trigger spare_requests_follow_call;
update public.field_calls set item_status = 'WGP' where ucn = 'HB2-A2';
alter table public.field_calls enable trigger spare_requests_follow_call;
call public.be('hb2-rm@x.com');
begin; set local role authenticated;
  select public.refresh_spare_requests_from_call(array['HB2-SR1']) as refreshed;
commit;
select uid, item_status from public.spare_requests where uid = 'HB2-SR1';

-- ===========================================================================
\echo ''
\echo '--- 7. D-128: re-open and close need sight of the call ---'
call public.be('hb2-rm@x.com');
begin; set local role authenticated;
  select ucn from public.calls where ucn like 'HB2-%' order by ucn;
commit;
\echo 'expect ERROR: Call HB2-C1 is not one of yours to change'
begin; set local role authenticated; select public.reopen_call('HB2-C1', 'test'); rollback;
\echo 'expect ERROR: Call HB2-C2 is not one of yours to change'
begin; set local role authenticated; select public.close_call('HB2-C2'); rollback;
\echo 'the RM still re-opens a call of his own team'
begin; set local role authenticated; select public.reopen_call('HB2-A1', 'customer called back') as reopened; commit;
\echo 'expect ERROR: No call with UCN NO-SUCH-CALL (a missing call still says so first)'
begin; set local role authenticated; select public.reopen_call('NO-SUCH-CALL', 'x'); rollback;

-- ===========================================================================
\echo ''
\echo '--- 8. D-129: a review needs a real call the writer can see ---'
call public.be('hb2-rm@x.com');
\echo 'expect ERROR: new row violates row-level security policy for table "call_reviews" (a call he cannot see)'
begin; set local role authenticated;
  insert into public.call_reviews (ucn, risk_to_patient, warranty_failure, frequent_failure) values ('HB2-C1', 'YES', 'NO', 'NO');
commit;
\echo 'expect ERROR: new row violates row-level security policy for table "call_reviews" (no such call)'
begin; set local role authenticated;
  insert into public.call_reviews (ucn, risk_to_patient, warranty_failure, frequent_failure) values ('NO-SUCH-CALL', 'YES', 'NO', 'NO');
commit;
\echo 'the reviewer still reviews his own team''s call'
begin; set local role authenticated;
  insert into public.call_reviews (ucn, risk_to_patient, warranty_failure, frequent_failure) values ('HB2-A2', 'NO', 'NO', 'NO');
commit;
\echo 'and the DCCR upload (bulk.upload) still loads a review of history for a call not loaded yet'
call public.be('hb2-admin@x.com');
begin; set local role authenticated;
  insert into public.call_reviews (ucn, risk_to_patient, warranty_failure, frequent_failure, imported) values ('HB2-HISTORY', 'NO', 'NO', 'NO', true);
commit;
select ucn from public.call_reviews where ucn like 'HB2-%' or ucn = 'NO-SUCH-CALL' order by ucn;
select count(*) as ffrs_on_unseen_or_missing_calls from public.field_failure_reports where ucn in ('HB2-C1', 'NO-SUCH-CALL');

-- ===========================================================================
\echo ''
\echo '--- 9. D-136: a master key changes only through a rename ---'
call public.nobody();
insert into public.parties (party_name, city, state) values ('HB2 NAMED HOSP', 'X', 'Y');
insert into public.products (item_name, serial_number, party_name) values ('HB2 VENT', 'HB2-S1', 'HB2 NAMED HOSP');
insert into public.product_master (product_code, product_name) values ('HB2-LINE', 'HB2 LINE');
call public.be('hb2-master@x.com');
\echo 'expect ERROR: A party''s name is the key every machine, call and contract names it by'
begin; set local role authenticated;
  update public.parties set party_name = 'HB2 NAMED HOSP X' where party_name = 'HB2 NAMED HOSP';
commit;
\echo 'expect ERROR: This party is still named on 1 record(s) (the delete guard, which renaming can no longer get round)'
begin; set local role authenticated;
  delete from public.parties where party_name = 'HB2 NAMED HOSP';
commit;
\echo 'the other fields still save, and a change of case is not a change of key'
begin; set local role authenticated;
  update public.parties set city = 'Pune', party_name = 'hb2 named hosp' where party_name = 'HB2 NAMED HOSP';
commit;
select party_name, city from public.parties where lower(party_name) = 'hb2 named hosp';
\echo 'expect ERROR: A product line''s code is the key machines name it by'
begin; set local role authenticated;
  update public.product_master set product_code = 'HB2-LINE-2' where product_code = 'HB2-LINE';
commit;
\echo 'the product line''s other fields still save'
begin; set local role authenticated;
  update public.product_master set product_name = 'HB2 LINE RENAMED' where product_code = 'HB2-LINE';
commit;
select product_code, product_name from public.product_master where product_code = 'HB2-LINE';
\echo 'expect ERROR: A part''s code and description are renamed with "Rename part"'
begin; set local role authenticated;
  update public.parts set item_detail = 'HP-9|SOMETHING ELSE' where code = 'HP-1';
commit;

-- ===========================================================================
\echo ''
\echo '--- 10. D-142: an Indoor job that has been worked on is not deleted ---'
call public.nobody();
insert into public.indoor_jobs (kind, activity, product_name, serial, party_name, demo_for_party, status) values
  ('Customer property', 'Repair', 'HB2 VENT', 'HB2-IN-ERR', 'HB2 HOSP', '', 'Received');
insert into public.indoor_jobs (kind, activity, product_name, serial, party_name, demo_for_party, status, condemned_reason, condemned_at, disposal_ref) values
  ('Customer property', 'Repair', 'HB2 VENT', 'HB2-IN-COND', 'HB2 HOSP', '', 'Condemned', 'beyond repair', now(), 'DSP-HB2');
insert into public.indoor_jobs (kind, activity, product_name, serial, party_name, demo_for_party, status) values
  ('Customer property', 'Repair', 'HB2 VENT', 'HB2-IN-VER', 'HB2 HOSP', '', 'Ready');
-- verified_by is stamped from the session, so a load cannot write it; set it as the verifier would have.
alter table public.indoor_jobs disable trigger user;
update public.indoor_jobs set verified_by = '0b220000-0000-0000-0000-000000000001', verified_at = now() where serial = 'HB2-IN-VER';
alter table public.indoor_jobs enable trigger user;
select serial, verified_by is not null as verified from public.indoor_jobs where serial = 'HB2-IN-VER';
call public.be('hb2-indoor@x.com');
\echo 'the deletion the user asked for still works: a job received in error'
begin; set local role authenticated;
  select public.delete_indoor_job((select id from public.indoor_jobs where serial = 'HB2-IN-ERR'), 'wrong unit received') is not null as deleted;
commit;
\echo 'expect ERROR: … has been worked on (condemned / disposal recorded) -- it is a quality record'
begin; set local role authenticated;
  select public.delete_indoor_job((select id from public.indoor_jobs where serial = 'HB2-IN-COND'), 'tidy');
rollback;
\echo 'expect ERROR: … has been worked on (verified) -- it is a quality record'
begin; set local role authenticated;
  select public.delete_indoor_job((select id from public.indoor_jobs where serial = 'HB2-IN-VER'), 'tidy');
rollback;
select serial from public.indoor_jobs where serial like 'HB2-IN-%' order by serial;

-- ===========================================================================
\echo ''
\echo '--- 11. D-127, D-134: the public key reads and runs less ---'
\echo 'expect ERROR: permission denied for materialized view product_database_v2_mv'
begin; set local role anon; select count(*) from public.product_database_v2_mv; rollback;
\echo 'expect ERROR: permission denied for function notify_resolve_uid'
begin; set local role anon; select public.notify_resolve_uid('hb2-eng-a@x.com', ''); rollback;
\echo 'expect ERROR: permission denied for function engineer_stock_available'
begin; set local role anon; select public.engineer_stock_available('HB2 ENG A', 'HP-1|HB2 PART'); rollback;
\echo 'a signed-in user still reads Product Database 2.0'
call public.be('hb2-eng-a@x.com');
begin; set local role authenticated; select count(*) >= 0 as signed_in_reads from public.product_database_v2; commit;

\echo ''
\echo '--- final hand stock ---'
select engineer, qty from public.engineer_stock where part = 'HP-1|HB2 PART' order by 1;

-- ===========================================================================
-- Re-opening a closed call (0057). See README for how to run.
--   psql ... -f _stub.sql -f <every migration> -f call_reopen_test.sql
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('99999999-9999-9999-9999-999999999999','hot@x.com'),
  ('88888888-8888-8888-8888-888888888888','eng2@x.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('99999999-9999-9999-9999-999999999999','hot@x.com','Hot Hema','hotline'),
  ('88888888-8888-8888-8888-888888888888','eng2@x.com','Eng Two','engineer')
  on conflict (id) do update set role = excluded.role;
update public.harness set uid = '99999999-9999-9999-9999-999999999999', email = 'hot@x.com';

insert into public.calls (ucn, call_type, party_name, product_name, serial, allocated_to)
  values ('RO-1','FIELD','A','P','S1','Eng');

\echo '--- 1. a solved visit closes the call; the exact status is kept ---'
insert into public.reports (uid, ucn, call_status, visit_at) values ('RV1','RO-1','Solved - Report Completed', now());
select ucn, last_status, state from public.call_state where ucn = 'RO-1';

\echo '--- 2. the Hotline re-opens it: open again, and counted ---'
select public.reopen_call('RO-1');
select ucn, last_status, state, reopen_count from public.call_state where ucn = 'RO-1';
\echo 'and it is back on pending_calls:'
select ucn, open_state, reopen_count from public.pending_calls where ucn = 'RO-1';

\echo '--- 3. re-opening an already re-opened call is refused ---'
\echo 'expect ERROR: already re-opened'
select public.reopen_call('RO-1');

\echo '--- 4. the next visit entry spends the re-open (count survives) ---'
insert into public.reports (uid, ucn, call_status, visit_at) values ('RV2','RO-1','Unsolved', now());
select ucn, last_status, state, reopen_count, reopened_at is null as reopen_spent from public.call_state where ucn = 'RO-1';

\echo '--- 5. an open call has nothing to re-open ---'
\echo 'expect ERROR: not closed'
select public.reopen_call('RO-1');

\echo '--- 6. an engineer may not re-open ---'
insert into public.reports (uid, ucn, call_status, visit_at) values ('RV3','RO-1','Solved - Report Completed', now());
update public.harness set uid = '88888888-8888-8888-8888-888888888888', email = 'eng2@x.com';
\echo 'expect ERROR: RBAC'
select public.reopen_call('RO-1');

\echo '--- 7. the flag is a filter: how many calls were re-opened ---'
select count(*) as reopened_calls from public.calls where reopen_count > 0;

\echo '--- 8. a re-open made only to correct the call is withdrawn, not visited ---'
update public.harness set uid = '99999999-9999-9999-9999-999999999999', email = 'hot@x.com';
select public.reopen_call('RO-1');
select ucn, state, reopen_count from public.call_state where ucn = 'RO-1';
\echo 'close it again: back to what the last visit said, count given back, no visit added'
select public.close_reopened_call('RO-1');
select ucn, last_status, state, reopen_count from public.call_state where ucn = 'RO-1';
select count(*) as visits from public.reports where ucn = 'RO-1';

\echo '--- 9. closing a call that is not re-opened is refused ---'
\echo 'expect ERROR: not re-opened'
select public.close_reopened_call('RO-1');

\echo '--- 10. a re-open followed by a real visit keeps its count ---'
select public.reopen_call('RO-1');
insert into public.reports (uid, ucn, call_status, visit_at) values ('RV4','RO-1','Solved - Report Completed', now());
select ucn, state, reopen_count from public.call_state where ucn = 'RO-1';

\echo '--- 11. an engineer may not close a re-opened call ---'
select public.reopen_call('RO-1');
update public.harness set uid = '88888888-8888-8888-8888-888888888888', email = 'eng2@x.com';
\echo 'expect ERROR: RBAC'
select public.close_reopened_call('RO-1');

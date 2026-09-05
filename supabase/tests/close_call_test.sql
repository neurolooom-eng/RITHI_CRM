-- ===========================================================================
-- Closing a call without a visit entry (0109).
--   It is NOT recorded differently: the call is Solved, like any other closed
--   call, and no visit is invented (last_visit_at stays null, the history
--   stays empty).
--   A VISIT ENTERED LATER TAKES OVER — including putting the call back on the
--   open list when that visit says Unsolved. That is the whole point.
--   It refuses on a call that is already closed, cancelled, or re-opened
--   (re-opened has its own action, which gives the re-open count back).
--   An engineer cannot do it.
-- Superuser bypasses RLS, so the scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('f1f1f1f1-0000-0000-0000-000000000001','clo_admin@x.com'),
 ('f1f1f1f1-0000-0000-0000-000000000002','clo_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('f1f1f1f1-0000-0000-0000-000000000001','clo_admin@x.com','Clo Admin','admin'),
 ('f1f1f1f1-0000-0000-0000-000000000002','clo_eng@x.com','Clo Engineer','engineer')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;
call public.be('clo_admin@x.com');

insert into public.calls (ucn, call_type, product_name, serial, reg_date, party_name,
                          complaint_reported, standard_complaint, allocated_to)
values ('CL-1', 'FIELD', 'CLPROD', '1', current_date, 'HOSP', 'x', 'y', 'Someone Else'),
       ('CL-2', 'FIELD', 'CLPROD', '2', current_date, 'HOSP', 'x', 'y', 'Someone Else'),
       ('CL-3', 'FIELD', 'CLPROD', '3', current_date, 'HOSP', 'x', 'y', 'Someone Else');

\echo '--- 1. an ENGINEER cannot close a call this way ---'
\echo 'expect ERROR: RBAC'
call public.be('clo_eng@x.com');
begin;
  set local role authenticated;
  select public.close_call('CL-1');
rollback;
call public.be('clo_admin@x.com');

\echo '--- 2. an open call closes, and reads as Solved like any other ---'
\echo 'expect: Solved'
select public.close_call('CL-1');
select ucn, state from public.call_state where ucn = 'CL-1';

\echo '--- 3. NO VISIT IS INVENTED — the history is still empty ---'
\echo 'expect: last_visit_at null, 0 visits'
select ucn, last_visit_at, last_status,
       (select count(*) from public.reports r where r.ucn = 'CL-1') as visits
  from public.calls where ucn = 'CL-1';

\echo '--- 4. ...and it has left the pending list ---'
\echo 'expect: 0'
select count(*) as still_pending from public.pending_calls where ucn = 'CL-1';

\echo '--- 5. closing it twice is refused ---'
\echo 'expect ERROR: already closed'
select public.close_call('CL-1');

\echo '--- 6. A VISIT ENTERED LATER TAKES OVER — the regular route ---'
\echo 'expect: Unsolved, and back on the pending list'
insert into public.reports (ucn, call_number, visit_at, call_status, engineer)
values ('CL-1', 'CL-1', now(), 'Unsolved', 'Someone Else');
select ucn, state from public.call_state where ucn = 'CL-1';
select count(*) as pending_again from public.pending_calls where ucn = 'CL-1';

\echo '--- 7. ...and a visit that SOLVES it closes it the regular way ---'
\echo 'expect: Solved, label from the visit'
update public.reports set call_status = 'Solved - Report Completed' where ucn = 'CL-1';
-- `calls.state` is the GEOGRAPHIC state; the call's is `call_state.state`.
select ucn, s.state as call_state, c.last_status from public.call_state s join public.calls c using (ucn) where ucn = 'CL-1';

\echo '--- 8. a RE-OPENED call is refused — Close again is its action ---'
\echo 'expect ERROR: use Close again'
select public.reopen_call('CL-1', 'came back');
select public.close_call('CL-1');

\echo '--- 9. a CANCELLED call is refused ---'
\echo 'expect ERROR: cancelled'
select public.cancel_call('CL-2', 'raised twice');
select public.close_call('CL-2');

\echo '--- 10. an unknown UCN is refused ---'
\echo 'expect ERROR: No call with UCN'
select public.close_call('CL-NOPE');

\echo '--- 11. cleanup ---'
delete from public.reports where ucn like 'CL-%';
delete from public.calls where ucn like 'CL-%';
delete from public.profiles where email like 'clo_%@x.com';

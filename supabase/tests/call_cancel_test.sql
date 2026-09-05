-- ===========================================================================
-- Cancelling a call (0108).
--   Admin, NSM and Hotline may; an engineer may not, and the refusal is an
--   ERROR rather than a silent no-op.
--   A cancellation needs a REASON.
--   A cancelled call leaves the pending list and reads as Cancelled — ahead of
--   Reopened, which it outranks.
--   It is NOT a delete: the row, its visits and its quality records survive,
--   and `restore_call` puts it back.
--   Field, Installation and PM are three tables and one register, so it works
--   the same on all three.
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('e1e1e1e1-0000-0000-0000-000000000001','cc_admin@x.com'),
 ('e1e1e1e1-0000-0000-0000-000000000002','cc_hotline@x.com'),
 ('e1e1e1e1-0000-0000-0000-000000000003','cc_nsm@x.com'),
 ('e1e1e1e1-0000-0000-0000-000000000004','cc_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('e1e1e1e1-0000-0000-0000-000000000001','cc_admin@x.com','CC Admin','admin'),
 ('e1e1e1e1-0000-0000-0000-000000000002','cc_hotline@x.com','CC Hotline','hotline'),
 ('e1e1e1e1-0000-0000-0000-000000000003','cc_nsm@x.com','CC NSM','nsm'),
 ('e1e1e1e1-0000-0000-0000-000000000004','cc_eng@x.com','CC Engineer','engineer')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- Set up as the ADMIN, so nothing is stamped created_by = the engineer and
-- quietly handed to them by the read policy's own-rows arm.
call public.be('cc_admin@x.com');

-- One of each kind, all unattended, none of them the engineer's.
insert into public.calls (ucn, call_type, product_name, serial, reg_date, party_name,
                          complaint_reported, standard_complaint, allocated_to)
values ('CC-F1', 'FIELD',        'CCPROD', '1', current_date, 'HOSP', 'x', 'y', 'Someone Else'),
       ('CC-I1', 'INSTALLATION', 'CCPROD', '2', current_date, 'HOSP', 'x', 'y', 'Someone Else'),
       ('CC-P1', 'PM',           'CCPROD', '3', current_date, 'HOSP', 'x', 'y', 'Someone Else');

\echo '--- 1. an ENGINEER cannot cancel a call ---'
\echo 'expect ERROR: RBAC'
call public.be('cc_eng@x.com');
begin;
  set local role authenticated;
  select public.cancel_call('CC-F1', 'raised twice');
rollback;
call public.be('cc_admin@x.com');

\echo '--- 2. a cancellation needs a REASON ---'
\echo 'expect ERROR: a reason'
call public.be('cc_hotline@x.com');
begin;
  set local role authenticated;
  select public.cancel_call('CC-F1', '   ');
rollback;
call public.be('cc_admin@x.com');

\echo '--- 3. the HOTLINE can cancel, and the row records who / when / why ---'
\echo 'expect: reason kept, cancelled_by = the hotline user'
call public.be('cc_hotline@x.com');
begin;
  set local role authenticated;
  select public.cancel_call('CC-F1', 'Raised twice — same fault as CC-F0');
commit;
select ucn, cancel_reason, (cancelled_at is not null) as cancelled,
       (select email from auth.users u where u.id = c.cancelled_by) as by
  from public.calls c where ucn = 'CC-F1';

\echo '--- 4. it is CANCELLED everywhere a state is read ---'
\echo 'expect: Cancelled'
select ucn, state from public.call_state where ucn = 'CC-F1';

\echo '--- 5. ...and it has left the pending list ---'
\echo 'expect: 0'
select count(*) as still_pending from public.pending_calls where ucn = 'CC-F1';

\echo '--- 6. cancelling it twice is refused ---'
\echo 'expect ERROR: already cancelled'
begin;
  set local role authenticated;
  select public.cancel_call('CC-F1', 'again');
rollback;

\echo '--- 7. CANCELLED OUTRANKS REOPENED ---'
\echo 'expect: Cancelled, not Reopened'
call public.be('cc_admin@x.com');
update public.calls set last_status = 'Solved' where ucn = 'CC-I1';
call public.be('cc_hotline@x.com');
begin;
  set local role authenticated;
  select public.reopen_call('CC-I1', 'came back');
  select public.cancel_call('CC-I1', 'wrong machine');
commit;
select ucn, state, (reopened_at is not null) as was_reopened from public.call_state where ucn = 'CC-I1';

\echo '--- 8. the NSM can cancel a PM call — three tables, one register ---'
\echo 'expect: Cancelled'
call public.be('cc_nsm@x.com');
begin;
  set local role authenticated;
  select public.cancel_call('CC-P1', 'PM not due');
commit;
select ucn, state from public.call_state where ucn = 'CC-P1';

\echo '--- 9. NOT A DELETE: every call is still there ---'
\echo 'expect: 3'
call public.be('cc_admin@x.com');
select count(*) as rows_still_there from public.calls where ucn like 'CC-%';

\echo '--- 10. an engineer cannot RESTORE either ---'
\echo 'expect ERROR: RBAC'
call public.be('cc_eng@x.com');
begin;
  set local role authenticated;
  select public.restore_call('CC-F1');
rollback;
call public.be('cc_admin@x.com');

\echo '--- 11. restoring puts it back, and the reason stays as the record ---'
\echo 'expect: back in pending, reason still readable'
call public.be('cc_hotline@x.com');
begin;
  set local role authenticated;
  select public.restore_call('CC-F1');
commit;
-- `calls.state` is the GEOGRAPHIC state; the call's is `call_state.state`.
select ucn, s.state as call_state, c.cancel_reason from public.call_state s join public.calls c using (ucn) where ucn = 'CC-F1';
select count(*) as pending_again from public.pending_calls where ucn = 'CC-F1';

\echo '--- 12. restoring one that is not cancelled is refused ---'
\echo 'expect ERROR: not cancelled'
begin;
  set local role authenticated;
  select public.restore_call('CC-F1');
rollback;

\echo '--- 13. cleanup ---'
call public.be('cc_admin@x.com');
delete from public.calls where ucn like 'CC-%';
delete from public.profiles where email like 'cc_%@x.com';

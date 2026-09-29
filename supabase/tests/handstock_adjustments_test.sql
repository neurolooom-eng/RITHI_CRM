-- ===========================================================================
-- Hand stock ADJUSTMENTS (0266) and the rename that carries them (0267).
--   A reconciler adds and removes; the balance follows through the movements.
--   A minus cannot take the engineer below zero.
--   Only an ACTIVE User Master person, only a Part Master part, and a reason.
--   An engineer without the reconciliation permission cannot adjust.
--   An adjustment is never edited or deleted (no policy: 0 rows).
--   Who recorded it is STAMPED from the session, whatever the client sends.
--   A User Master rename carries the adjustments with the rest.
--   The not-signed-in role reaches nothing.
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('ad000000-0000-0000-0000-000000000001','adj_admin@x.com'),
 ('ad000000-0000-0000-0000-000000000002','adj_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('ad000000-0000-0000-0000-000000000001','adj_admin@x.com','ADJ Admin','admin'),
 ('ad000000-0000-0000-0000-000000000002','adj_eng@x.com','ADJ Engineer','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
insert into public.user_directory (name, email, validity) values
 ('ADJ Engineer', 'adj_eng@x.com', true),
 ('ADJ Leaver',   'adj_leaver@x.com', false);
insert into public.parts (code, description, item_detail, category)
values ('ADJ-001', 'ADJ TEST PART', 'ADJ-001|ADJ TEST PART', 'Spare');
insert into public.handstock_opening (engineer, part, qty, as_of, source)
values ('ADJ Engineer', 'ADJ-001|ADJ TEST PART', 4, current_date, 'ADJ pool');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;
create or replace function pg_temp.bal() returns numeric language sql as $$
  select coalesce(sum(case when direction = 'IN' then qty else -qty end), 0)
    from public.handstock_movements where engineer_key = 'adj engineer' and part_code = public.part_code('ADJ-001|ADJ TEST PART') $$;

\echo '--- 1. the reconciler ADDS 5 (MTN 101): balance 4 -> 9 ---'
\echo 'expect: 9'
call public.be('adj_admin@x.com');
begin;
  set local role authenticated;
  insert into public.handstock_adjustments (engineer, part, qty, reason, reference)
  values ('ADJ Engineer', 'ADJ-001|ADJ TEST PART', 5, 'Physical count found more', 'MTN 101');
commit;
select pg_temp.bal() as balance;

\echo '--- 2. ...and REMOVES 3: balance 6, shown on the trail as an OUT Adjustment ---'
\echo 'expect: 6; trail rows Adjustment IN 5 MTN 101, Adjustment OUT 3 ADJ-<id>'
call public.be('adj_admin@x.com');
begin;
  set local role authenticated;
  insert into public.handstock_adjustments (engineer, part, qty, reason)
  values ('ADJ Engineer', 'ADJ-001|ADJ TEST PART', -3, 'Damaged in transit');
commit;
select pg_temp.bal() as balance;
select movement, direction, qty, left(ref, 7) as ref, remarks from public.handstock_movements
 where engineer_key = 'adj engineer' and movement = 'Adjustment' order by moved_at, direction;

\echo '--- 3. removing more than is held is refused ---'
\echo 'expect ERROR: below zero'
call public.be('adj_admin@x.com');
begin;
  set local role authenticated;
  insert into public.handstock_adjustments (engineer, part, qty, reason)
  values ('ADJ Engineer', 'ADJ-001|ADJ TEST PART', -7, 'too much');
rollback;

\echo '--- 4. a deactivated person, a part not on the Part Master, a blank reason ---'
\echo 'expect ERROR: not an ACTIVE person'
call public.be('adj_admin@x.com');
begin; set local role authenticated;
  insert into public.handstock_adjustments (engineer, part, qty, reason) values ('ADJ Leaver', 'ADJ-001|ADJ TEST PART', 1, 'x');
rollback;
\echo 'expect ERROR: not on the Part Master'
begin; set local role authenticated;
  insert into public.handstock_adjustments (engineer, part, qty, reason) values ('ADJ Engineer', 'NOPE|NOT A PART', 1, 'x');
rollback;
\echo 'expect ERROR: handstock_adjustments_reason'
begin; set local role authenticated;
  insert into public.handstock_adjustments (engineer, part, qty, reason) values ('ADJ Engineer', 'ADJ-001|ADJ TEST PART', 1, '  ');
rollback;

\echo '--- 5. an engineer without the reconciliation permission cannot adjust ---'
\echo 'expect ERROR: row-level security'
call public.be('adj_eng@x.com');
begin; set local role authenticated;
  insert into public.handstock_adjustments (engineer, part, qty, reason) values ('ADJ Engineer', 'ADJ-001|ADJ TEST PART', 100, 'mine');
rollback;

\echo '--- 6. an adjustment is never edited or deleted, even by the reconciler ---'
\echo 'expect: UPDATE 0, DELETE 0, still 2 adjustments'
call public.be('adj_admin@x.com');
begin; set local role authenticated;
  update public.handstock_adjustments set qty = 999 where engineer = 'ADJ Engineer';
  delete from public.handstock_adjustments where engineer = 'ADJ Engineer';
commit;
select count(*) as adjustments, max(qty) as max_qty from public.handstock_adjustments where engineer_key = 'adj engineer';

\echo '--- 7. who recorded it is stamped from the session, not taken from the client ---'
\echo 'expect: ADJ Admin'
call public.be('adj_admin@x.com');
begin; set local role authenticated;
  insert into public.handstock_adjustments (engineer, part, qty, reason, recorded_by_name)
  values ('ADJ Engineer', 'ADJ-001|ADJ TEST PART', 1, 'stamp test', 'Somebody Else');
commit;
select recorded_by_name from public.handstock_adjustments where reason = 'stamp test';

\echo '--- 8. the engineer reads their own adjustments ---'
\echo 'expect: 3'
call public.be('adj_eng@x.com');
begin; set local role authenticated;
  select count(*) as mine from public.handstock_adjustments;
rollback;

\echo '--- 9. a User Master rename carries the adjustments, and the balance with them ---'
\echo 'expect: 3 adjustments under ADJ Engineer Two, balance 7'
call public.be('adj_admin@x.com');
begin; set local role authenticated;
  update public.user_directory set name = 'ADJ Engineer Two' where name = 'ADJ Engineer';
commit;
select count(*) as adjustments from public.handstock_adjustments where engineer = 'ADJ Engineer Two';
select coalesce(sum(case when direction = 'IN' then qty else -qty end), 0) as balance
  from public.handstock_movements where engineer_key = 'adj engineer two' and part_code = public.part_code('ADJ-001|ADJ TEST PART');

\echo '--- 10. the not-signed-in role reaches nothing ---'
\echo 'expect ERROR: permission denied for table handstock_adjustments'
begin; set local role anon;
  select count(*) from public.handstock_adjustments;
rollback;

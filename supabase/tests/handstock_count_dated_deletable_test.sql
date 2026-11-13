-- ===========================================================================
-- AN UPLOADED HAND STOCK COUNT IS DATED, BATCHED AND DELETABLE (0483).
--   An uploaded count keeps the date and time it was given (not the upload
--   time); a screen count is still stamped now. A count in the future is
--   refused, and so is one dated before a later count of the same line.
--   The system quantity stamped is the balance AS AT the count.
--   Movements entered after a back-dated count still count against it.
--   delete_handstock_reconciliations() deletes one upload batch or single
--   counts, for a holder of handstock.reconcile only; the stock reverts.
--   The not-signed-in role cannot call it.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('ec483000-0000-0000-0000-000000000001','hcd_admin@x.com'),
 ('ec483000-0000-0000-0000-000000000002','hcd_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('ec483000-0000-0000-0000-000000000001','hcd_admin@x.com','HCD Admin','admin'),
 ('ec483000-0000-0000-0000-000000000002','hcd_eng@x.com','HCD Engineer','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
insert into public.user_directory (name, email, validity) values ('HCD Engineer', 'hcd_eng@x.com', true);
insert into public.parts (code, description, item_detail, category) values
 ('HCD-001', 'HCD PART ONE', 'HCD-001|HCD PART ONE', 'Spare'),
 ('HCD-002', 'HCD PART TWO', 'HCD-002|HCD PART TWO', 'Spare');
-- Opening 10 of each, ENTERED three days ago; an adjustment of -2 on HCD-001
-- entered two days ago.
insert into public.handstock_opening (engineer, part, qty, as_of, source) values
 ('HCD Engineer', 'HCD-001|HCD PART ONE', 10, current_date - 3, 'HCD pool'),
 ('HCD Engineer', 'HCD-002|HCD PART TWO', 10, current_date - 3, 'HCD pool');
insert into public.handstock_adjustments (engineer, part, qty, reason)
values ('HCD Engineer', 'HCD-001|HCD PART ONE', -2, 'two days ago');
set session_replication_role = replica;
update public.handstock_opening set sys_created_on = now() - interval '3 days' where engineer_key = 'hcd engineer';
update public.handstock_adjustments set sys_created_on = now() - interval '2 days' where engineer_key = 'hcd engineer';
set session_replication_role = origin;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;
create or replace function pg_temp.bal(p text) returns numeric language sql as $$
  select coalesce(sum(case when direction = 'IN' then qty else -qty end), 0)
    from public.handstock_movements where engineer_key = 'hcd engineer' and part_code = p $$;

\echo '--- 0. before any count: HCD-001 8, HCD-002 10 ---'
\echo 'expect: 8 | 10'
select pg_temp.bal('HCD-001') as hcd_001, pg_temp.bal('HCD-002') as hcd_002;

\echo '--- 1. an upload dated 2.5 days ago (before the adjustment): counts 7 and 4 ---'
\echo 'expect: HCD-001 = 7 - 2 = 5 (the adjustment was entered after the count) | HCD-002 = 4'
call public.be('hcd_admin@x.com');
begin;
  set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty, source, upload_batch, reconciled_at) values
   ('HCD Engineer', 'HCD-001|HCD PART ONE', 7, 'Upload', 'B1', now() - interval '60 hours'),
   ('HCD Engineer', 'HCD-002|HCD PART TWO', 4, 'Upload', 'B1', now() - interval '60 hours');
commit;
select pg_temp.bal('HCD-001') as hcd_001, pg_temp.bal('HCD-002') as hcd_002;

\echo '--- 2. kept its date, and the system quantity is the balance AS AT that time ---'
\echo 'expect: both dated ~60 hours ago | system 10 on each (the -2 came later) | batch B1'
select part_code, round(extract(epoch from now() - reconciled_at) / 3600) as hours_ago, system_qty, upload_batch
  from public.handstock_reconciliations where engineer_key = 'hcd engineer' order by part_code;

\echo '--- 3. a screen count is stamped now, whatever it sends, and carries no batch ---'
\echo 'expect: HCD-002 = 6 | hours_ago 0 | batch empty'
begin;
  set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty, upload_batch, reconciled_at)
  values ('HCD Engineer', 'HCD-002|HCD PART TWO', 6, 'X', now() - interval '10 days');
commit;
select pg_temp.bal('HCD-002') as hcd_002;
select round(extract(epoch from now() - reconciled_at) / 3600) as hours_ago, upload_batch
  from public.handstock_reconciliations where engineer_key = 'hcd engineer' and source = 'Screen';

\echo '--- 4. refused: dated in the future; dated before a later count of the line ---'
begin;
  set local role authenticated;
\echo 'expect ERROR: is in the future'
  insert into public.handstock_reconciliations (engineer, part, physical_qty, source, reconciled_at)
  values ('HCD Engineer', 'HCD-001|HCD PART ONE', 1, 'Upload', now() + interval '1 day');
rollback;
begin;
  set local role authenticated;
\echo 'expect ERROR: A later count of HCD-002 ... would change nothing'
  insert into public.handstock_reconciliations (engineer, part, physical_qty, source, reconciled_at)
  values ('HCD Engineer', 'HCD-002|HCD PART TWO', 1, 'Upload', now() - interval '1 day');
rollback;

\echo '--- 5. an engineer may not delete a count, and the public key cannot call it ---'
call public.be('hcd_eng@x.com');
begin;
  set local role authenticated;
\echo 'expect ERROR: Deleting a hand stock count needs'
  select public.delete_handstock_reconciliations(null, 'B1');
rollback;
begin;
  set local role anon;
\echo 'expect ERROR: permission denied for function delete_handstock_reconciliations'
  select public.delete_handstock_reconciliations(null, 'B1');
rollback;

\echo '--- 6. the administrator deletes the screen count: HCD-002 goes back to the upload count, 4 ---'
\echo 'expect: 1 | 4'
call public.be('hcd_admin@x.com');
begin;
  set local role authenticated;
  select public.delete_handstock_reconciliations(array(select id from public.handstock_reconciliations
                                                        where engineer_key = 'hcd engineer' and source = 'Screen'), null) as deleted;
commit;
select pg_temp.bal('HCD-002') as hcd_002;

\echo '--- 7. delete upload B1: both lines revert to the movements, 8 and 10 ---'
\echo 'expect: 2 | 8 | 10 | 0 counts left'
begin;
  set local role authenticated;
  select public.delete_handstock_reconciliations(null, 'B1') as deleted;
commit;
select pg_temp.bal('HCD-001') as hcd_001, pg_temp.bal('HCD-002') as hcd_002,
       (select count(*) from public.handstock_reconciliations where engineer_key = 'hcd engineer') as counts_left;

\echo '--- 8. naming nothing is refused ---'
begin;
  set local role authenticated;
\echo 'expect ERROR: Name the counts, or the upload, to delete'
  select public.delete_handstock_reconciliations(null, '');
rollback;

\echo '--- 9. each deletion is on the audit trail ---'
\echo 'expect: at least 3 deleted rows recorded'
select count(*) >= 3 as recorded from public.record_audit
 where table_name = 'handstock_reconciliations' and op = 'DELETE';

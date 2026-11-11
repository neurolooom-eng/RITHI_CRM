-- ===========================================================================
-- Hand stock RECONCILIATION (0468), and the rename / delete rules that carry
-- it (0468, 0469, 0470).
--   A physical count sets the line: movements entered before it stop counting,
--   movements entered after it count against it, and nothing is deleted.
--   Only the parts counted are reset.
--   The latest count wins; the earlier one stays on the record.
--   Who, when and what the system said are STAMPED by the database.
--   Only an ACTIVE User Master person, a Part Master part that is not a labour
--   charge, and a whole quantity of 0 or more.
--   The key is handstock.reconcile: an engineer, and a Spare Coordinator
--   holding consumption.reconcile, are refused.
--   Never edited or deleted (no UPDATE or DELETE privilege: refused).
--   A User Master rename and a part rename carry it; a counted part cannot be
--   deleted from the Part Master.
--   The not-signed-in role reaches nothing.
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('ec000000-0000-0000-0000-000000000001','rec_admin@x.com'),
 ('ec000000-0000-0000-0000-000000000002','rec_eng@x.com'),
 ('ec000000-0000-0000-0000-000000000003','rec_sc@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('ec000000-0000-0000-0000-000000000001','rec_admin@x.com','REC Admin','admin'),
 ('ec000000-0000-0000-0000-000000000002','rec_eng@x.com','REC Engineer','engineer'),
 ('ec000000-0000-0000-0000-000000000003','rec_sc@x.com','REC Coordinator','spare_coordinator')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
insert into public.user_directory (name, email, validity) values
 ('REC Engineer', 'rec_eng@x.com', true),
 ('REC Leaver',   'rec_leaver@x.com', false);
insert into public.parts (code, description, item_detail, category) values
 ('REC-001', 'REC PART ONE', 'REC-001|REC PART ONE', 'Spare'),
 ('REC-002', 'REC PART TWO', 'REC-002|REC PART TWO', 'Spare');
insert into public.parts (code, description, item_detail, category, labour_charge)
values ('REC-LAB', 'REC LABOUR', 'REC-LAB|REC LABOUR', 'Spare', true);
insert into public.handstock_opening (engineer, part, qty, as_of, source) values
 ('REC Engineer', 'REC-001|REC PART ONE', 10, current_date, 'REC pool'),
 ('REC Engineer', 'REC-002|REC PART TWO', 5,  current_date, 'REC pool');
insert into public.handstock_adjustments (engineer, part, qty, reason)
values ('REC Engineer', 'REC-001|REC PART ONE', -2, 'before the count');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;
create or replace function pg_temp.bal(p text) returns numeric language sql as $$
  select coalesce(sum(case when direction = 'IN' then qty else -qty end), 0)
    from public.handstock_movements where engineer_key = 'rec engineer' and part_code = p $$;

\echo '--- 0. before any count: REC-001 is 10 - 2 = 8, REC-002 is 5 ---'
\echo 'expect: 8 | 5'
select pg_temp.bal('REC-001') as rec_001, pg_temp.bal('REC-002') as rec_002;

\echo '--- 1. the administrator counts REC-001 at 6: the line is 6, REC-002 untouched ---'
\echo 'expect: 6 | 5'
call public.be('rec_admin@x.com');
begin;
  set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty, remarks)
  values ('REC Engineer', 'REC-001|REC PART ONE', 6, 'Counted at the branch');
commit;
select pg_temp.bal('REC-001') as rec_001, pg_temp.bal('REC-002') as rec_002;

\echo '--- 2. stamped: who, and what the system said (8); the old rows are kept ---'
\echo 'expect: REC Admin | 8 | 6 | t ; then 1 adjustment and 2 opening rows still on record'
select recorded_by_name, system_qty, physical_qty, reconciled_at > now() - interval '1 minute' as stamped_now
  from public.handstock_reconciliations where engineer_key = 'rec engineer';
select (select count(*) from public.handstock_adjustments where engineer_key = 'rec engineer') as adjustments,
       (select count(*) from public.handstock_opening where engineer_key = 'rec engineer') as opening_rows;

\echo '--- 3. the trail of REC-001 starts at the count ---'
\echo 'expect: one row, Reconciliation IN 6, remarks "Physical count 6 (system said 8) · Counted at the branch"'
select movement, direction, qty, left(ref, 4) as ref, remarks
  from public.handstock_movements where engineer_key = 'rec engineer' and part_code = 'REC-001';

\echo '--- 4. a movement ENTERED after the count counts against it: +3 -> 9 ---'
\echo 'expect: 9'
insert into public.handstock_adjustments (engineer, part, qty, reason)
values ('REC Engineer', 'REC-001|REC PART ONE', 3, 'after the count');
select pg_temp.bal('REC-001') as rec_001;

\echo '--- 5. counted again at 4: the latest count wins, both counts stay on record ---'
\echo 'expect: 4 ; 2 counts, the second one system_qty 9'
call public.be('rec_admin@x.com');
begin; set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty)
  values ('REC Engineer', 'REC-001|REC PART ONE', 4);
commit;
select pg_temp.bal('REC-001') as rec_001;
select physical_qty, system_qty from public.handstock_reconciliations
 where engineer_key = 'rec engineer' order by reconciled_at;

\echo '--- 6. the balance view carries the count and when ---'
\echo 'expect: REC-001 on_hand 4, reconciled_qty 4, reconciled_at set; REC-002 on_hand 5, nulls'
select part_code, on_hand, reconciled_qty, reconciled_at is not null as counted
  from public.handstock_balance where engineer_key = 'rec engineer' order by part_code;

\echo '--- 7. the same part twice in one save is refused ---'
\echo 'expect ERROR: handstock_reconciliations_uniq'
call public.be('rec_admin@x.com');
begin; set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty) values
   ('REC Engineer', 'REC-002|REC PART TWO', 1), ('REC Engineer', 'REC-002|REC PART TWO', 2);
rollback;

\echo '--- 8. what is refused: a leaver, a part not on the master, a labour charge, a negative, a fraction ---'
\echo 'expect ERROR: not an ACTIVE person'
begin; set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty) values ('REC Leaver', 'REC-001|REC PART ONE', 1);
rollback;
\echo 'expect ERROR: not on the Part Master'
begin; set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty) values ('REC Engineer', 'NOPE|NOT A PART', 1);
rollback;
\echo 'expect ERROR: labour charge'
begin; set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty) values ('REC Engineer', 'REC-LAB|REC LABOUR', 1);
rollback;
\echo 'expect ERROR: whole number, 0 or more'
begin; set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty) values ('REC Engineer', 'REC-002|REC PART TWO', -1);
rollback;
\echo 'expect ERROR: whole number'
begin; set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty) values ('REC Engineer', 'REC-002|REC PART TWO', 1.5);
rollback;

\echo '--- 9. the engineer, and a Spare Coordinator holding consumption.reconcile, are refused ---'
\echo 'expect ERROR: row-level security'
call public.be('rec_eng@x.com');
begin; set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty) values ('REC Engineer', 'REC-002|REC PART TWO', 50);
rollback;
\echo 'expect: t (the coordinator holds consumption.reconcile)'
call public.be('rec_sc@x.com');
begin; set local role authenticated;
  select public.has_perm('consumption.reconcile') as holds_consumption_reconcile;
rollback;
\echo 'expect ERROR: row-level security'
begin; set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty) values ('REC Engineer', 'REC-002|REC PART TWO', 50);
rollback;

\echo '--- 10. ...and the coordinator may, once handstock.reconcile is ticked for the role ---'
\echo 'expect: REC-002 is 7'
insert into public.app_roles (role, permissions) values ('spare_coordinator', '["consumption.reconcile", "handstock.reconcile"]'::jsonb)
on conflict (role) do update set permissions = public.app_roles.permissions || '["handstock.reconcile"]'::jsonb;
call public.be('rec_sc@x.com');
begin; set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty) values ('REC Engineer', 'REC-002|REC PART TWO', 7);
commit;
select pg_temp.bal('REC-002') as rec_002;

\echo '--- 11. never edited or deleted, even by the administrator: refused outright ---'
\echo 'expect ERROR: permission denied for table handstock_reconciliations'
call public.be('rec_admin@x.com');
begin; set local role authenticated;
  update public.handstock_reconciliations set physical_qty = 999 where engineer = 'REC Engineer';
rollback;
\echo 'expect ERROR: permission denied for table handstock_reconciliations'
begin; set local role authenticated;
  delete from public.handstock_reconciliations where engineer = 'REC Engineer';
rollback;
\echo 'expect: still 3 counts, max 7'
select count(*) as counts, max(physical_qty) as max_qty from public.handstock_reconciliations where engineer_key = 'rec engineer';

\echo '--- 12. who and when are the database''s, whatever the client sends ---'
\echo 'expect: REC Admin | t'
call public.be('rec_admin@x.com');
begin; set local role authenticated;
  insert into public.handstock_reconciliations (engineer, part, physical_qty, recorded_by_name, reconciled_at, system_qty)
  values ('REC Engineer', 'REC-002|REC PART TWO', 7, 'Somebody Else', '2020-01-01', 12345);
commit;
select recorded_by_name, reconciled_at > now() - interval '1 minute' as stamped_now, system_qty <> 12345 as system_stamped
  from public.handstock_reconciliations where engineer_key = 'rec engineer' order by id desc limit 1;

\echo '--- 13. the engineer reads their own counts, and their own figure agrees ---'
\echo 'expect: 4 | 4 | 7'
call public.be('rec_eng@x.com');
begin; set local role authenticated;
  select count(*) as my_counts,
         (select on_hand from public.handstock_balance where engineer_key = 'rec engineer' and part_code = 'REC-001') as rec_001,
         (select on_hand from public.handstock_balance where engineer_key = 'rec engineer' and part_code = 'REC-002') as rec_002
    from public.handstock_reconciliations;
rollback;

\echo '--- 14. a User Master rename carries the counts, and the line with them ---'
\echo 'expect: 4 counts under REC Engineer Two, REC-001 still 4'
call public.be('rec_admin@x.com');
begin; set local role authenticated;
  update public.user_directory set name = 'REC Engineer Two' where name = 'REC Engineer';
commit;
select count(*) as counts from public.handstock_reconciliations where engineer = 'REC Engineer Two';
select coalesce(sum(case when direction = 'IN' then qty else -qty end), 0) as rec_001
  from public.handstock_movements where engineer_key = 'rec engineer two' and part_code = 'REC-001';

\echo '--- 15. a part rename carries the counts, and the preview counts them ---'
\echo 'expect: Stock reconciliations 2 ; then 2 counts under REC-001|REC PART ONE RENAMED'
select relation, rows from public.part_rename_impact('REC-001|REC PART ONE') where relation = 'Stock reconciliations';
select public.rename_part_records((select id from public.parts where code = 'REC-001'), 'REC-001', 'REC PART ONE RENAMED') ? 'renamed' as renamed;
select count(*) as counts from public.handstock_reconciliations where part = 'REC-001|REC PART ONE RENAMED';

\echo '--- 16. a counted part cannot be deleted from the Part Master ---'
\echo 'expect ERROR: handstock reconciliations'
begin;
  delete from public.handstock_opening where part_code = 'REC-002';
  delete from public.handstock_adjustments where part_code = 'REC-002';
  delete from public.parts where code = 'REC-002';
rollback;

\echo '--- 17. the not-signed-in role reaches nothing ---'
\echo 'expect ERROR: permission denied for table handstock_reconciliations'
begin; set local role anon;
  select count(*) from public.handstock_reconciliations;
rollback;

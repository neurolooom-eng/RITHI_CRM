-- ===========================================================================
-- REVIEW BATCH 6, PROVED ON A DATABASE (0378-0373).
-- Each section proves BOTH halves: the hole the re-review measured is closed,
-- AND the honest path beside it still works.
--
--   1. D-108  record_indoor_visit() is not a signed-in user's (0378)
--   2. D-116  the indoor visit columns say the visit is filed at approval (0378)
--   3. D-086  "Add / edit master records" does not delete a list value (0371)
--   4. D-059  a User Master entry with R&R history is not deleted (0379)
--   5. D-050  a transfer or return is not dated into a closed period or the future (0373)
--
-- Checks raise an unlabelled error when they are wrong, so the harness counts
-- a failure; an error that is meant to happen is labelled `expect ERROR`.
-- Run ONCE after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('rb6_records', 'RB6 Records', '["masters.view", "masters.edit.records"]'::jsonb),
 ('rb6_listdel', 'RB6 List delete', '["masters.view", "master.callpendingreason.delete"]'::jsonb),
 ('rb6_people',  'RB6 People',  '["users.manage", "users.manage.disable"]'::jsonb),
 ('rb6_stock',   'RB6 Stock',   '["stock.transfer", "stock.transfer.others", "stock.return"]'::jsonb),
 ('rb6_loader',  'RB6 Loader',  '["stock.transfer", "bulk.upload"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
  ('0b660000-0000-0000-0000-000000000001', 'rb6-records@x.com'),
  ('0b660000-0000-0000-0000-000000000002', 'rb6-listdel@x.com'),
  ('0b660000-0000-0000-0000-000000000003', 'rb6-people@x.com'),
  ('0b660000-0000-0000-0000-000000000004', 'rb6-stock@x.com'),
  ('0b660000-0000-0000-0000-000000000005', 'rb6-loader@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0b660000-0000-0000-0000-000000000001', 'rb6-records@x.com', 'RB6 Records', 'rb6_records'),
  ('0b660000-0000-0000-0000-000000000002', 'rb6-listdel@x.com', 'RB6 Listdel', 'rb6_listdel'),
  ('0b660000-0000-0000-0000-000000000003', 'rb6-people@x.com',  'RB6 People',  'rb6_people'),
  ('0b660000-0000-0000-0000-000000000004', 'rb6-stock@x.com',   'RB6 Stock',   'rb6_stock'),
  ('0b660000-0000-0000-0000-000000000005', 'rb6-loader@x.com',  'RB6 Loader',  'rb6_loader')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

-- ===========================================================================
\echo ''
\echo '--- 1-2. D-108 / D-116: record_indoor_visit() and the visit columns ---'
-- ===========================================================================
do $$ begin
  if has_function_privilege('authenticated', 'public.record_indoor_visit(bigint,text,boolean)', 'EXECUTE') then
    raise exception 'D-108 FAILED: a signed-in user may still run record_indoor_visit()';
  end if;
  if col_description('public.indoor_jobs'::regclass,
       (select attnum from pg_attribute where attrelid = 'public.indoor_jobs'::regclass and attname = 'visit_filed_at'))
     not like '%approval%' then
    raise exception 'D-116 FAILED: visit_filed_at still says the visit is filed when the DC is issued';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 3. D-086: deleting a list value needs that list''s delete key ---'
-- ===========================================================================
call public.nobody();
delete from public.masters where name = 'callpendingreason' and value like 'RB6 %';
insert into public.masters (name, value) values
  ('callpendingreason', 'RB6 ONE'), ('callpendingreason', 'RB6 TWO'), ('callpendingreason', 'RB6 THREE');

call public.be('rb6-records@x.com');
set role authenticated;
-- "Add / edit master records" still edits...
update public.masters set value = 'RB6 ONE EDITED' where name = 'callpendingreason' and value = 'RB6 ONE';
-- ...and its delete matches nothing (row-level security), as the screen never offered it.
delete from public.masters where name = 'callpendingreason' and value = 'RB6 TWO';
reset role;
call public.be('rb6-listdel@x.com');
set role authenticated;
delete from public.masters where name = 'callpendingreason' and value = 'RB6 THREE';
reset role;
call public.nobody();
do $$ begin
  if not exists (select 1 from public.masters where name = 'callpendingreason' and value = 'RB6 ONE EDITED') then
    raise exception 'D-086 FAILED: "Add / edit master records" can no longer edit a list value';
  end if;
  if not exists (select 1 from public.masters where name = 'callpendingreason' and value = 'RB6 TWO') then
    raise exception 'D-086 FAILED: "Add / edit master records" deleted a list value';
  end if;
  if exists (select 1 from public.masters where name = 'callpendingreason' and value = 'RB6 THREE') then
    raise exception 'D-086 FAILED: the list''s own delete key could not delete';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 4. D-059: a User Master entry with R&R history is kept ---'
-- ===========================================================================
call public.nobody();
delete from public.user_directory where name in ('RB6 Leaver', 'RB6 Mistake');
insert into public.user_directory (name, email) values ('RB6 Leaver', 'rb6-leaver@x.com'), ('RB6 Mistake', 'rb6-mistake@x.com');
insert into public.user_rr (dir_id, url, effective_from)
select id, 'https://drive/rb6-rr', '2026-01-01' from public.user_directory where name = 'RB6 Leaver';

call public.be('rb6-people@x.com');
set role authenticated;
\echo 'expect ERROR: RB6 Leaver has Roles & Responsibilities history on the User Master, which is kept'
delete from public.user_directory where name = 'RB6 Leaver';
delete from public.user_directory where name = 'RB6 Mistake';
reset role;
call public.nobody();
do $$ begin
  if not exists (select 1 from public.user_rr r join public.user_directory d on d.id = r.dir_id where d.name = 'RB6 Leaver') then
    raise exception 'D-059 FAILED: the entry and its R&R history were deleted';
  end if;
  if exists (select 1 from public.user_directory where name = 'RB6 Mistake') then
    raise exception 'D-059 FAILED: an entry with no history could not be deleted';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 5. D-050: a transfer is not dated into a closed period or the future ---'
-- ===========================================================================
call public.nobody();
delete from public.stock_transfers where uid like 'RB6-ST%';
-- The engineers are on the User Master, and the transferrer may move anybody's
-- stock (stock.transfer.others): this section is about the DATE (0375 is D-049's).
delete from public.user_directory where name in ('RB6 A', 'RB6 B');
insert into public.user_directory (name, email) values ('RB6 A', 'rb6-a@x.com'), ('RB6 B', 'rb6-b@x.com');
delete from public.handstock_period;
insert into public.handstock_period (singleton, closed_through) values (true, current_date - 30);

call public.be('rb6-stock@x.com');
set role authenticated;
\echo 'expect ERROR: A stock transfer cannot be dated in the future'
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date) values ('RB6-ST1', 'RB6 A', 'RB6 B', current_date + 5);
\echo 'expect ERROR: A stock transfer cannot be dated ... hand stock is closed through'
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date) values ('RB6-ST2', 'RB6 A', 'RB6 B', current_date - 40);
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date) values ('RB6-ST3', 'RB6 A', 'RB6 B', current_date - 3);
reset role;
-- An importer loads history as it was.
call public.be('rb6-loader@x.com');
set role authenticated;
insert into public.stock_transfers (uid, from_engineer, to_engineer, transfer_date) values ('RB6-ST4', 'RB6 A', 'RB6 B', current_date - 40);
reset role;
call public.nobody();
do $$ begin
  if (select string_agg(uid, ',' order by uid) from public.stock_transfers where uid like 'RB6-ST%')
     is distinct from 'RB6-ST3,RB6-ST4' then
    raise exception 'D-050 FAILED: got %', (select string_agg(uid, ',' order by uid) from public.stock_transfers where uid like 'RB6-ST%');
  end if;
end $$;
delete from public.handstock_period;

call public.nobody();

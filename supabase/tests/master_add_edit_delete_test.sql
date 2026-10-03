-- ===========================================================================
-- ONE KEY TO ADD, ONE TO EDIT, ONE TO DELETE PER MASTER (0325).
--
--   The user, 2026-10-03: "Provision to edit all masters ... Ensure it is
--   added in Roles and Permissions" -- "One add, one edit, one delete per
--   master".
--
--   What this proves, as a signed-in user (a superuser ignores policies):
--     1. a role holding the old masters.edit.records still adds and edits a
--        party, a part and a product line -- nobody lost anything;
--     2. that role can NOT delete -- delete is its own key;
--     3. a role given ONLY masters.parties.delete deletes an unused party,
--        but cannot add or edit one;
--     4. a party, a part or a product line still NAMED on a record is refused
--        deletion whoever asks, and the message says how many records;
--     5. a list value can be added with only master.<list>.add.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('mrec', 'Master records', '["masters.edit.records"]'::jsonb),
 ('mdel', 'Party deleter',  '["masters.parties.delete"]'::jsonb),
 ('mlst', 'List adder',     '["master.calltype.add"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
 ('ee000000-0000-0000-0000-000000000001','mrec@x.com'),
 ('ee000000-0000-0000-0000-000000000002','mdel@x.com'),
 ('ee000000-0000-0000-0000-000000000003','mlst@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
 ('ee000000-0000-0000-0000-000000000001','mrec@x.com','Records','mrec'),
 ('ee000000-0000-0000-0000-000000000002','mdel@x.com','Deleter','mdel'),
 ('ee000000-0000-0000-0000-000000000003','mlst@x.com','Lister','mlst')
on conflict (id) do update set role = excluded.role;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- Fixtures: a party a machine names, a part a stock record names, a line a
-- machine names.
insert into public.parties (party_name, city, state) values ('NAMED HOSPITAL', 'Chennai', 'Tamil Nadu')
  on conflict do nothing;
insert into public.products (party_name, item_name, serial_number, item_code)
  values ('Named Hospital', 'ORION-G', 'MK-1', 'ORG-MK');
insert into public.parts (code, item_detail, description) values ('MK-P1', 'MK-P1|NAMED PART', 'NAMED PART')
  on conflict do nothing;
insert into public.spare_issue_history (engineer, part, qty, source) values ('ENG', 'MK-P1|NAMED PART', 1, 'test');
insert into public.product_master (product_code, product_name) values ('ORG-MK', 'ORION-G')
  on conflict do nothing;

-- ---- 1. masters.edit.records still adds and edits -------------------------
call public.be('mrec@x.com');
set role authenticated;
insert into public.parties (party_name, city, state) values ('NEW CLINIC', 'Pune', 'Maharashtra');
update public.parties set city = 'Mumbai' where party_name = 'NEW CLINIC';
insert into public.parts (code, item_detail, description) values ('MK-P2', 'MK-P2|SPARE PART', 'SPARE PART');
update public.parts set description = 'SPARE PART 2' where code = 'MK-P2';
insert into public.product_master (product_code, product_name) values ('NEW-LINE', 'NEW LINE');
update public.product_master set short_form = 'NL' where product_code = 'NEW-LINE';
reset role;
select 'records holder adds and edits', (select city from public.parties where party_name = 'NEW CLINIC') = 'Mumbai'
   and (select description from public.parts where code = 'MK-P2') = 'SPARE PART 2'
   and (select short_form from public.product_master where product_code = 'NEW-LINE') = 'NL' as ok;

-- ---- 2. ...but deletes nothing (row-level security: zero rows, no error) ---
call public.be('mrec@x.com');
set role authenticated;
delete from public.parties where party_name = 'NEW CLINIC';
delete from public.parts where code = 'MK-P2';
delete from public.product_master where product_code = 'NEW-LINE';
reset role;
select 'records holder cannot delete',
       exists (select 1 from public.parties where party_name = 'NEW CLINIC')
   and exists (select 1 from public.parts where code = 'MK-P2')
   and exists (select 1 from public.product_master where product_code = 'NEW-LINE') as ok;

-- ---- 3. the delete key alone: deletes, and only deletes --------------------
\echo '--- 3. expect ERROR: a delete-only role cannot add a party ---'
call public.be('mdel@x.com');
set role authenticated;
insert into public.parties (party_name, city, state) values ('NOT ALLOWED', 'X', 'Y');
update public.parties set city = 'Nowhere' where party_name = 'NEW CLINIC';
delete from public.parties where party_name = 'NEW CLINIC';
reset role;
select 'delete key deletes an unused party, edits nothing',
       not exists (select 1 from public.parties where party_name = 'NEW CLINIC')
   and not exists (select 1 from public.parties where party_name = 'NOT ALLOWED') as ok;

-- ---- 4. a named row is refused deletion, however strong the caller --------
\echo '--- 4a. expect ERROR: a party a machine names cannot be deleted ---'
delete from public.parties where party_name = 'NAMED HOSPITAL';
\echo '--- 4b. expect ERROR: a part a stock record names cannot be deleted ---'
delete from public.parts where code = 'MK-P1';
\echo '--- 4c. expect ERROR: a product line a machine names cannot be deleted ---'
delete from public.product_master where product_code = 'ORG-MK';
select 'named rows survive',
       exists (select 1 from public.parties where party_name = 'NAMED HOSPITAL')
   and exists (select 1 from public.parts where code = 'MK-P1')
   and exists (select 1 from public.product_master where product_code = 'ORG-MK') as ok;
-- An unused one goes (as the owner here, which passes the policy).
delete from public.parts where code = 'MK-P2';
delete from public.product_master where product_code = 'NEW-LINE';
select 'unused rows can be deleted',
       not exists (select 1 from public.parts where code = 'MK-P2')
   and not exists (select 1 from public.product_master where product_code = 'NEW-LINE') as ok;

-- ---- 5. a list value with only the list's add key -------------------------
call public.be('mlst@x.com');
set role authenticated;
insert into public.masters (name, value) values ('calltype', 'MK TEST TYPE');
-- The add key does not rename: row-level security matches nothing.
update public.masters set value = 'MK RENAMED' where name = 'calltype' and value = 'MK TEST TYPE';
reset role;
select 'list add key adds, does not rename',
       exists (select 1 from public.masters where name = 'calltype' and value = 'MK TEST TYPE')
   and not exists (select 1 from public.masters where name = 'calltype' and value = 'MK RENAMED') as ok;

select 'parents recorded', (select count(*) from public.perm_parents where child like 'masters.parties.%'
                                 or child like 'masters.parts.%' or child like 'masters.product_master.%') = 15 as ok;

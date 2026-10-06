-- ===========================================================================
-- EACH SCREEN'S CONTROLS HAVE THEIR OWN TICK; A BIG KEY IS A PARENT OF SMALL
-- ONES (0286-0298, findings 57-67, the user's decisions of 2026-09-30).
--
-- What this suite holds, every part as a signed-in user (the superuser
-- ignores row-level security and EXECUTE grants alike):
--   1. a PARENT key satisfies its children, and a child does not satisfy its
--      parent or its siblings (has_perm + perm_parents);
--   2. the Installation and PM registers are governed by install.* and pm.*:
--      a key for one register does nothing on another -- editing, reporting a
--      visit, cancelling, re-opening and creating;
--   3. booking spares on a visit is visit.spares, a child of every register's
--      report key, and feedback on a visit is visit.feedback;
--   4. user administration is five keys: creating a login does not let you
--      change anybody's role, and changing a role does not let you switch a
--      login off;
--   5. masters: editing records does not verify KYC, swap the Serviceman or
--      rename a part; each is its own key;
--   6. cover: adding a warranty entry does not delete one, and the Contract
--      Register has keys of its own;
--   7. deleting a Tracker item is tracker.delete (adding one is still the page);
--   8. an Indoor unit cannot be marked Dispatched with indoor.work alone
--      (finding 59);
--   9. objective, chart sharing, validation and Product Database 2.0 rebuild
--      answer to their own keys;
--  10. the grant copy (0298) runs ONCE: re-running it does not hand a key back
--      to a role it was taken from, and the two ticks that did nothing are gone.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0f270000-0000-0000-0000-000000000001', 'ps_admin@x.com'),
  ('0f270000-0000-0000-0000-000000000002', 'ps_inst@x.com'),
  ('0f270000-0000-0000-0000-000000000003', 'ps_field@x.com'),
  ('0f270000-0000-0000-0000-000000000004', 'ps_creator@x.com'),
  ('0f270000-0000-0000-0000-000000000005', 'ps_access@x.com'),
  ('0f270000-0000-0000-0000-000000000006', 'ps_target@x.com'),
  ('0f270000-0000-0000-0000-000000000007', 'ps_records@x.com'),
  ('0f270000-0000-0000-0000-000000000008', 'ps_kyc@x.com'),
  ('0f270000-0000-0000-0000-000000000009', 'ps_cover@x.com'),
  ('0f270000-0000-0000-0000-000000000010', 'ps_tracker@x.com'),
  ('0f270000-0000-0000-0000-000000000011', 'ps_indoor@x.com'),
  ('0f270000-0000-0000-0000-000000000012', 'ps_config@x.com'),
  ('0f270000-0000-0000-0000-000000000013', 'ps_parent@x.com')
on conflict do nothing;

insert into public.app_roles (role, label, permissions) values
  ('ps_inst',    'Installation only', '["calls.view","data.view_all","install.edit","install.report","install.cancel","install.reopen"]'),
  ('ps_field',   'Field only',        '["calls.view","data.view_all","calls.edit","calls.report","calls.cancel","calls.reopen","calls.create"]'),
  ('ps_creator', 'Creates logins',    '["users.manage.create","users.manage.details"]'),
  ('ps_access',  'Grants access',     '["users.manage.access"]'),
  ('ps_records', 'Master records',    '["masters.edit.records"]'),
  ('ps_kyc',     'KYC only',          '["masters.edit.kyc","masters.edit.records"]'),
  ('ps_cover',   'Warranty entries',  '["cover.edit.entries","masters.view"]'),
  ('ps_tracker', 'Tracker, no delete','["mod:/tracker"]'),
  ('ps_indoor',  'Indoor work',       '["mod:/indoor","indoor.receive","indoor.work","indoor.qc"]'),
  ('ps_config',  'Config only',       '["config.manage"]'),
  ('ps_parent',  'Parents',           '["users.manage","masters.edit","cover.edit"]')
on conflict (role) do update set permissions = excluded.permissions;

insert into public.profiles (id, email, full_name, role, extra_permissions) values
  ('0f270000-0000-0000-0000-000000000001', 'ps_admin@x.com',   'PS Admin',   'admin',      '[]'),
  ('0f270000-0000-0000-0000-000000000002', 'ps_inst@x.com',    'PS Inst',    'ps_inst',    '[]'),
  ('0f270000-0000-0000-0000-000000000003', 'ps_field@x.com',   'PS Field',   'ps_field',   '[]'),
  ('0f270000-0000-0000-0000-000000000004', 'ps_creator@x.com', 'PS Creator', 'ps_creator', '[]'),
  ('0f270000-0000-0000-0000-000000000005', 'ps_access@x.com',  'PS Access',  'ps_access',  '[]'),
  ('0f270000-0000-0000-0000-000000000006', 'ps_target@x.com',  'PS Target',  'engineer',   '[]'),
  ('0f270000-0000-0000-0000-000000000007', 'ps_records@x.com', 'PS Records', 'ps_records', '[]'),
  ('0f270000-0000-0000-0000-000000000008', 'ps_kyc@x.com',     'PS KYC',     'ps_kyc',     '[]'),
  ('0f270000-0000-0000-0000-000000000009', 'ps_cover@x.com',   'PS Cover',   'ps_cover',   '[]'),
  ('0f270000-0000-0000-0000-000000000010', 'ps_tracker@x.com', 'PS Tracker', 'ps_tracker', '[]'),
  ('0f270000-0000-0000-0000-000000000011', 'ps_indoor@x.com',  'PS Indoor',  'ps_indoor',  '[]'),
  ('0f270000-0000-0000-0000-000000000012', 'ps_config@x.com',  'PS Config',  'ps_config',  '[]'),
  ('0f270000-0000-0000-0000-000000000013', 'ps_parent@x.com',  'PS Parent',  'ps_parent',  '[]')
on conflict (id) do update set role = excluded.role, extra_permissions = excluded.extra_permissions;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- One call on each register, allocated to nobody so the visibility rule lets
-- everybody holding the register's keys at it.
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to, last_status)
values ('PS-F1', 'PSF1', 'FIELD', 'VEGA', 'PSF-1', current_date, 'Hosp F', 'x', 'y', '', 'Solved');
insert into public.installation_calls (ucn, call_number, call_type, product_name, serial, reg_date, party_name,
                                       complaint_reported, standard_complaint, allocated_to, last_status)
values ('PS-I1', 'PSI1', 'INSTALLATION CALL', 'VEGA', 'PSI-1', current_date, 'Hosp I', 'x', 'y', '', 'Solved');

\echo ''
\echo '--- 1. a parent satisfies its children; a child satisfies nothing else ---'
call public.be('ps_parent@x.com');
set role authenticated;
select 'parent' as who,
       public.has_perm('users.manage.create') and public.has_perm('users.manage.access')
       and public.has_perm('masters.edit.kyc') and public.has_perm('cover.edit.delete') as children_held;
reset role;
call public.be('ps_creator@x.com');
set role authenticated;
select 'child' as who,
       public.has_perm('users.manage.create') as own,
       public.has_perm('users.manage')        as parent,
       public.has_perm('users.manage.access') as sibling;
reset role;
do $$
begin
  if not exists (select 1 from public.perm_parents where child = 'visit.spares' and parent = 'install.report') then
    raise exception 'visit.spares should be a child of install.report';
  end if;
  raise notice 'ok: perm_parents carries the list';
end $$;

\echo ''
\echo '--- 2. install.* governs Installation calls and nothing else ---'
call public.be('ps_inst@x.com');
begin;
  set local role authenticated;
  update public.installation_calls set customer_number = '999' where ucn = 'PS-I1';
  select 'install edit' as check, customer_number from public.installation_calls where ucn = 'PS-I1';
  -- the same person on a Field call: the policy does not admit them, 0 rows
  update public.field_calls set customer_number = '999' where ucn = 'PS-F1';
commit;
do $$
begin
  if (select customer_number from public.installation_calls where ucn = 'PS-I1') is distinct from '999' then
    raise exception 'an install.edit holder could not edit an installation call';
  end if;
  if (select customer_number from public.field_calls where ucn = 'PS-F1') = '999' then
    raise exception 'an install.edit holder edited a FIELD call';
  end if;
  raise notice 'ok: install.edit edits installation calls only';
end $$;

-- A visit on each: only the installation one is theirs to file.
call public.be('ps_inst@x.com');
set role authenticated;
insert into public.reports (uid, ucn, visit_at, call_status) values ('PS-I1-v1', 'PS-I1', now(), 'Solved');
\echo 'expect ERROR: row-level security -- install.report does not file a Field call visit'
insert into public.reports (uid, ucn, visit_at, call_status) values ('PS-F1-v1', 'PS-F1', now(), 'Solved');
reset role;

-- Cancelling and re-opening follow the register too.
call public.be('ps_inst@x.com');
set role authenticated;
select 'install reopen' as check, public.reopen_call('PS-I1', 'test');
\echo 'expect ERROR: RBAC -- install.reopen does not re-open a Field call'
select public.reopen_call('PS-F1', 'test');
\echo 'expect ERROR: RBAC -- install.cancel does not cancel a Field call'
select public.cancel_call('PS-F1', 'test');
reset role;

-- Creating a PM call is pm.create, not calls.create.
call public.be('ps_field@x.com');
set role authenticated;
\echo 'expect ERROR: row-level security -- calls.create does not create a PM call'
insert into public.pm_calls (ucn, call_number, call_type, product_name, serial, reg_date, party_name,
                             complaint_reported, standard_complaint, allocated_to)
values ('PS-P1', 'PSP1', 'P M VISIT', 'VEGA', 'PSP-1', current_date, 'Hosp P', 'x', 'y', '');
reset role;

\echo ''
\echo '--- 3. spares and feedback on a visit are children of every register''s report key ---'
call public.be('ps_inst@x.com');
set role authenticated;
select 'install reporter' as who, public.has_perm('visit.spares') as spares, public.has_perm('visit.feedback') as feedback,
       public.has_perm('calls.report.visit') as field_visit;
reset role;

\echo ''
\echo '--- 4. user administration: five keys, not one ---'
call public.be('ps_creator@x.com');
set role authenticated;
\echo 'expect ERROR: RBAC -- creating logins does not change a role'
update public.profiles set role = 'rm' where email = 'ps_target@x.com';
reset role;
call public.be('ps_access@x.com');
set role authenticated;
update public.profiles set role = 'rm' where email = 'ps_target@x.com';
\echo 'expect ERROR: RBAC -- assigning roles does not switch a login off'
update public.profiles set active = false where email = 'ps_target@x.com';
reset role;
do $$
begin
  if (select role from public.profiles where email = 'ps_target@x.com') <> 'rm' then
    raise exception 'users.manage.access could not change a role';
  end if;
  if not (select active from public.profiles where email = 'ps_target@x.com') then
    raise exception 'users.manage.access switched a login off';
  end if;
  raise notice 'ok: access changes a role and nothing else';
end $$;

-- Creating a login decides nothing about what it may do: an Engineer with no
-- extras is all "Create logins" can make, and a User Master row's first-sign-in
-- role is "Assign roles" too.
insert into auth.users (id, email) values
  ('0f270000-0000-0000-0000-000000000021', 'ps_new1@x.com'),
  ('0f270000-0000-0000-0000-000000000022', 'ps_new2@x.com')
on conflict do nothing;
call public.be('ps_creator@x.com');
set role authenticated;
insert into public.profiles (id, email, full_name, role, extra_permissions)
values ('0f270000-0000-0000-0000-000000000021', 'ps_new1@x.com', 'PS New One', 'engineer', '[]');
\echo 'expect ERROR: RBAC -- creating logins does not create an RM'
insert into public.profiles (id, email, full_name, role, extra_permissions)
values ('0f270000-0000-0000-0000-000000000022', 'ps_new2@x.com', 'PS New Two', 'rm', '[]');
insert into public.user_directory (name, email) values ('PS Joiner', 'ps_joiner@x.com');
\echo 'expect ERROR: RBAC -- editing User Master details does not set the role a joiner signs in with'
update public.user_directory set role = 'admin' where email = 'ps_joiner@x.com';
reset role;
do $$
begin
  if not exists (select 1 from public.profiles where email = 'ps_new1@x.com' and role = 'engineer') then
    raise exception 'users.manage.create could not create an Engineer login';
  end if;
  raise notice 'ok: an Engineer login created, an RM refused, a joiner''s role refused';
end $$;

\echo ''
\echo '--- 5. masters: records, KYC, the Serviceman swap and a part rename are separate ---'
-- With a city and state: a party needs them since 0366.
insert into public.parties (party_name, kyc_status, service_engineer, city, state) values
  ('PS Party One', 'Pending', 'PS OLD', 'Madurai', 'Tamil Nadu'), ('PS Party Two', 'Pending', 'PS OLD', 'Madurai', 'Tamil Nadu');
call public.be('ps_records@x.com');
set role authenticated;
update public.parties set city = 'Chennai' where party_name = 'PS Party One';
\echo 'expect ERROR: RBAC -- editing records does not verify KYC'
update public.parties set kyc_status = 'Verified' where party_name = 'PS Party One';
\echo 'expect ERROR: RBAC -- editing records does not swap the Serviceman in bulk'
select public.swap_service_engineer('PS OLD', 'PS NEW');
reset role;
call public.be('ps_kyc@x.com');
set role authenticated;
update public.parties set kyc_status = 'Verified' where party_name = 'PS Party One';
reset role;
call public.be('ps_parent@x.com');
set role authenticated;
select 'swapped' as check, public.swap_service_engineer('PS OLD', 'PS NEW') as parties;
reset role;
do $$
begin
  if (select kyc_status from public.parties where party_name = 'PS Party One') <> 'Verified' then
    raise exception 'masters.edit.kyc could not verify KYC';
  end if;
  if (select city from public.parties where party_name = 'PS Party One') <> 'Chennai' then
    raise exception 'masters.edit.records could not edit a party';
  end if;
  if exists (select 1 from public.parties where service_engineer = 'PS OLD') then
    raise exception 'the parent masters.edit could not swap the Serviceman';
  end if;
  raise notice 'ok: records, KYC and the swap each answer to their own key';
end $$;

\echo ''
\echo '--- 6. cover: adding an entry is not deleting one; contracts have their own keys ---'
call public.be('ps_cover@x.com');
set role authenticated;
insert into public.sale_entries (sa_number, party_name) values ('PS-SA-1', 'PS Party One');
delete from public.sale_entries where sa_number = 'PS-SA-1';
\echo 'expect ERROR: row-level security -- a warranty key does not add a contract'
insert into public.contract_entries (mc_number, party_name) values ('PS-MC-1', 'PS Party One');
reset role;
do $$
begin
  if not exists (select 1 from public.sale_entries where sa_number = 'PS-SA-1') then
    raise exception 'cover.edit.entries deleted a whole entry';
  end if;
  raise notice 'ok: the entry survived a delete without cover.edit.delete';
end $$;

\echo ''
\echo '--- 7. the Tracker: adding is the page, deleting is tracker.delete ---'
call public.be('ps_tracker@x.com');
set role authenticated;
insert into public.tracker_items (title) values ('PS tracker item');
delete from public.tracker_items where title = 'PS tracker item';
reset role;
do $$
begin
  if not exists (select 1 from public.tracker_items where title = 'PS tracker item') then
    raise exception 'the page alone deleted a Tracker item';
  end if;
  raise notice 'ok: added with the page, not deleted without tracker.delete';
end $$;

\echo ''
\echo '--- 8. an Indoor unit is not Dispatched through the status picker without the dispatch right ---'
-- The job number is the database's own; the unit is found by its serial.
insert into public.indoor_jobs (activity, status, qc_result, serial)
values ('Demo', 'Ready', null, 'PS-IJ-1');
call public.be('ps_indoor@x.com');
set role authenticated;
\echo 'expect ERROR: indoor.dispatch is required to mark a unit Dispatched'
update public.indoor_jobs set status = 'Dispatched' where serial = 'PS-IJ-1';
reset role;

\echo ''
\echo '--- 9. objective, charts, validation and the 2.0 rebuild answer to their own keys ---'
call public.be('ps_config@x.com');
set role authenticated;
select 'config.manage alone' as who,
       public.has_perm('objective.manage') as objective, public.has_perm('charts.share') as charts,
       public.has_perm('validation.manage') as validation, public.has_perm('pd2.rebuild') as rebuild;
reset role;

\echo ''
\echo '--- 10. the grant copy runs once, and the dead ticks are gone ---'
update public.app_roles set permissions = permissions - 'install.edit' where role = 'hotline';
\ir ../migrations/0298_permission_grants_copied.sql
do $$
begin
  if exists (select 1 from public.app_roles where role = 'hotline' and permissions ? 'install.edit') then
    raise exception 're-running 0298 handed install.edit back to a role it was taken from';
  end if;
  if exists (select 1 from public.app_roles where permissions ?| array['dashboard.view', 'mod:/users']) then
    raise exception 'a tick that did nothing is still held';
  end if;
  if not exists (select 1 from public.app_roles where role = 'engineer' and permissions ? 'install.report') then
    raise exception 'the engineer row was not given install.report';
  end if;
  raise notice 'ok: copied once, not re-granted, dead ticks removed';
end $$;

-- ===========================================================================
-- WHAT WAS AN ADMINISTRATOR'S ALONE IS A KEY (0302-0307) -- the user,
-- 2026-09-30: "All Admin Actions that are greyed out now should be editable
-- from the Role & Permissions. Only the Admin Role should be Greyed out".
--
-- Three callers, each signed in as `authenticated` (a superuser ignores every
-- check under test):
--   KEY   a non-admin role holding the new keys  -> passes each gate
--   PLAIN a non-admin role holding review.edit only -> refused at each gate
--   ADMIN                                           -> still passes
-- Where a gate is passed and the call then fails for its own reason (a
-- request that does not exist), the message is the evidence: it is not the
-- key's refusal.
--
-- And the one rule this adds: a KEY holder may not reset the password of an
-- administrator or of anybody who can grant permissions.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

alter table auth.users add column if not exists encrypted_password text;
alter table auth.users add column if not exists updated_at timestamptz;

insert into public.app_roles (role, label, permissions) values
 ('ak_keyholder', 'AK Keyholder', '["review.edit","calls.view","data.view_all","review.correct_date","objective.lock","spare.reassign",
   "users.reset_password","bulk.upload","pm.bulk_upload","import.panel","export.tables","export.schedules","audit.mode"]'::jsonb),
 -- calls.view + data.view_all: since 0334 (D-128) a review is written only on a call
 -- the writer can see, as on every review screen; a reviewer who sees nothing reviews nothing.
 ('ak_plain', 'AK Plain', '["review.edit", "calls.view", "data.view_all"]'::jsonb),
 ('ak_granter', 'AK Granter', '["users.manage.access"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
 ('a4a40000-0000-0000-0000-000000000001', 'ak_key@x.com'),
 ('a4a40000-0000-0000-0000-000000000002', 'ak_plain@x.com'),
 ('a4a40000-0000-0000-0000-000000000003', 'ak_admin@x.com'),
 ('a4a40000-0000-0000-0000-000000000004', 'ak_victim@x.com'),
 ('a4a40000-0000-0000-0000-000000000005', 'ak_granter@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
 ('a4a40000-0000-0000-0000-000000000001', 'ak_key@x.com',     'AK Key',     'ak_keyholder'),
 ('a4a40000-0000-0000-0000-000000000002', 'ak_plain@x.com',   'AK Plain',   'ak_plain'),
 ('a4a40000-0000-0000-0000-000000000003', 'ak_admin@x.com',   'AK Admin',   'admin'),
 ('a4a40000-0000-0000-0000-000000000004', 'ak_victim@x.com',  'AK Victim',  'engineer'),
 ('a4a40000-0000-0000-0000-000000000005', 'ak_granter@x.com', 'AK Granter', 'ak_granter')
on conflict (id) do update set role = excluded.role;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date, complaint_date,
                                warranty_start, party_name, complaint_reported, standard_complaint, allocated_to)
values ('AK-1', 'C-AK1', 'FIELD', 'VEGA', 'AK1', date '2026-09-01', date '2026-09-01', date '2019-01-01', 'H', 'x', 'y', 'E')
on conflict do nothing;
insert into public.call_reviews (ucn, call_number, risk_to_patient, warranty_failure, frequent_failure, review2_at)
values ('AK-1', 'C-AK1', 'NO', 'NO', 'NO', date '2026-09-02');

\echo ''
\echo '--- 1. the keys: PLAIN holds none, KEY holds all ten ---'
call public.be('ak_plain@x.com');
set role authenticated;
select 'plain' as who, public.has_perm('audit.mode') as audit_mode_should_be_false,
       public.has_perm('users.reset_password') as reset_should_be_false;
reset role;
call public.be('ak_key@x.com');
set role authenticated;
select 'key' as who, public.has_perm('audit.mode') as audit_mode_should_be_true,
       public.has_perm('users.reset_password') as reset_should_be_true,
       public.has_perm('users.manage') as manage_should_be_false;
reset role;

\echo ''
\echo '--- 2. Audit Mode ---'
call public.be('ak_plain@x.com');
\echo 'expect ERROR: changing Audit Mode needs "Switch Audit Mode on or off"'
begin; set local role authenticated; select public.set_audit_mode(true, 'plain tries'); rollback;
call public.be('ak_key@x.com');
begin; set local role authenticated;
  select public.set_audit_mode(true, 'keyholder switches it') as key_switches;
  select count(*) >= 1 as key_reads_history_should_be_true from public.audit_mode_changes;
rollback;

\echo ''
\echo '--- 3. the objective cut-off lock ---'
call public.be('ak_plain@x.com');
\echo 'expect ERROR: locking or unlocking the objective cut-off needs its key'
begin; set local role authenticated; select public.set_objective_cutoff_lock(true); rollback;
call public.be('ak_key@x.com');
begin; set local role authenticated; select public.set_objective_cutoff_lock(true) is null as key_locks; rollback;

\echo ''
\echo '--- 4. Data Export: the table list and the schedules ---'
call public.be('ak_plain@x.com');
begin; set local role authenticated;
  select count(*) as plain_sees_tables_should_be_0 from public.exportable_tables();
rollback;
\echo 'expect ERROR: new row violates row-level security policy for table "export_schedules"'
begin; set local role authenticated;
  insert into public.export_schedules (label, tables) values ('AK plain', array['calls']);
rollback;
call public.be('ak_key@x.com');
begin; set local role authenticated;
  select count(*) > 0 as key_sees_tables_should_be_true from public.exportable_tables();
  insert into public.export_schedules (label, tables) values ('AK key', array['calls']);
  select count(*) as key_sees_its_schedule_should_be_1 from public.export_schedules where label = 'AK key';
rollback;

\echo ''
\echo '--- 5. changing the engineer on a spare request ---'
call public.be('ak_plain@x.com');
\echo 'expect ERROR: Changing the engineer on a spare request needs its key'
begin; set local role authenticated; select public.reassign_spare_request('AK-NO-SUCH', 'Somebody', '', 'why'); rollback;
call public.be('ak_key@x.com');
\echo 'expect ERROR: past the key -- refused for its own reason (no such request), NOT for the key'
begin; set local role authenticated; select public.reassign_spare_request('AK-NO-SUCH', 'Somebody', '', 'why'); rollback;

\echo ''
\echo '--- 6. resetting a password ---'
call public.be('ak_plain@x.com');
\echo 'expect ERROR: resetting a password needs its key'
begin; set local role authenticated; select public.admin_reset_password('ak_victim@x.com', 'Kf7-Rm2-Qx9-Tb4'); rollback;
call public.be('ak_key@x.com');
begin; set local role authenticated;
  select public.admin_reset_password('ak_victim@x.com', 'Kf7-Rm2-Qx9-Tb4') as key_resets_an_engineer;
commit;
select (encrypted_password = crypt('Kf7-Rm2-Qx9-Tb4', encrypted_password)) as verifies_should_be_true
  from auth.users where email = 'ak_victim@x.com';
\echo 'expect ERROR: only an administrator can reset an administrator''s password'
begin; set local role authenticated; select public.admin_reset_password('ak_admin@x.com', 'Kf7-Rm2-Qx9-Tb4'); rollback;
\echo 'expect ERROR: ...nor that of somebody who can grant permissions'
begin; set local role authenticated; select public.admin_reset_password('ak_granter@x.com', 'Kf7-Rm2-Qx9-Tb4'); rollback;
call public.be('ak_admin@x.com');
begin; set local role authenticated;
  select public.admin_reset_password('ak_granter@x.com', 'Kf7-Rm2-Qx9-Tb4') as admin_still_resets_anyone;
rollback;

\echo ''
\echo '--- 7. a review''s completion date: refused without the key, moved with it ---'
call public.be('ak_plain@x.com');
\echo 'expect ERROR: changing the date a review was completed needs its key'
begin; set local role authenticated;
  update public.call_reviews set review2_at = date '2026-08-01' where ucn = 'AK-1';
rollback;
begin; set local role authenticated;
  update public.call_reviews set service_observation = 'plain edits the rest' where ucn = 'AK-1';
commit;
select 'plain' as who, review2_at = date '2026-09-02' as date_unchanged_should_be_true,
       service_observation = 'plain edits the rest' as rest_saved_should_be_true
  from public.call_reviews where ucn = 'AK-1';
call public.be('ak_key@x.com');
begin; set local role authenticated;
  update public.call_reviews set review2_at = date '2026-08-01' where ucn = 'AK-1';
commit;
select 'key' as who, review2_at = date '2026-08-01' as date_corrected_should_be_true
  from public.call_reviews where ucn = 'AK-1';

\echo ''
\echo '--- 8. marking a review imported follows bulk.upload ---'
call public.be('ak_plain@x.com');
begin; set local role authenticated;
  update public.call_reviews set imported = true where ucn = 'AK-1';
commit;
select 'plain' as who, coalesce(imported, false) as imported_should_be_false from public.call_reviews where ucn = 'AK-1';
call public.be('ak_key@x.com');
begin; set local role authenticated;
  update public.call_reviews set imported = true where ucn = 'AK-1';
commit;
select 'key' as who, imported as imported_should_be_true from public.call_reviews where ucn = 'AK-1';

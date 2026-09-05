-- ===========================================================================
-- An administrator resetting a forgotten password (0110).
--   Only an administrator, and never a SUPER admin's account unless the caller
--   is one — an admin who could reset a super admin's password could take the
--   project.
--   The password that comes out actually works: the stored hash verifies
--   against it, which is the only thing that matters and the only thing worth
--   asserting.
--   The password is NEVER stored. `password_resets` records who reset whose
--   account and when, and an engineer cannot read even that.
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- The stub's auth.users is (id, email); the real one carries the hash.
alter table auth.users add column if not exists encrypted_password text;
alter table auth.users add column if not exists updated_at timestamptz;

insert into auth.users (id,email) values
 ('a9a9a9a9-0000-0000-0000-000000000001','pr_admin@x.com'),
 ('a9a9a9a9-0000-0000-0000-000000000002','pr_eng@x.com'),
 ('a9a9a9a9-0000-0000-0000-000000000003','pr_super@x.com'),
 ('a9a9a9a9-0000-0000-0000-000000000004','pr_victim@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('a9a9a9a9-0000-0000-0000-000000000001','pr_admin@x.com','PR Admin','admin'),
 ('a9a9a9a9-0000-0000-0000-000000000002','pr_eng@x.com','PR Engineer','engineer'),
 ('a9a9a9a9-0000-0000-0000-000000000003','pr_super@x.com','PR Super','admin'),
 ('a9a9a9a9-0000-0000-0000-000000000004','pr_victim@x.com','PR Victim','engineer')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
insert into public.app_super_admins (email) values ('pr_super@x.com') on conflict do nothing;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo '--- 1. an ENGINEER cannot reset anybody''s password ---'
\echo 'expect ERROR: RBAC'
call public.be('pr_eng@x.com');
begin;
  set local role authenticated;
  select public.admin_reset_password('pr_victim@x.com', 'Kf7-Rm2-Qx9-Tb4');
rollback;

\echo '--- 2. an ADMIN can, and the password that comes out actually works ---'
\echo 'expect: verifies = t'
call public.be('pr_admin@x.com');
begin;
  set local role authenticated;
  select public.admin_reset_password('pr_victim@x.com', 'Kf7-Rm2-Qx9-Tb4');
commit;
select email,
       (encrypted_password = crypt('Kf7-Rm2-Qx9-Tb4', encrypted_password)) as verifies,
       (encrypted_password = 'Kf7-Rm2-Qx9-Tb4')                            as stored_in_the_clear
  from auth.users where email = 'pr_victim@x.com';

\echo '--- 3. ...and a DIFFERENT password does not verify against that hash ---'
\echo 'expect: f'
select (encrypted_password = crypt('something-else-entirely', encrypted_password)) as wrong_password_verifies
  from auth.users where email = 'pr_victim@x.com';

\echo '--- 4. the log says who reset whose account, and holds NO password ---'
\echo 'expect: one row, pr_admin -> pr_victim'
select target_email, reset_by_email from public.password_resets where target_email = 'pr_victim@x.com';
\echo 'expect: 0 columns of password_resets contain the password'
select count(*) as columns_holding_the_password
  from public.password_resets
 where target_email like '%Kf7%' or reset_by_email like '%Kf7%';

\echo '--- 5. a short password is refused, so this cannot set a weak one ---'
\echo 'expect ERROR: at least 10 characters'
begin;
  set local role authenticated;
  select public.admin_reset_password('pr_victim@x.com', 'short');
rollback;

\echo '--- 6. an email with no login is refused ---'
\echo 'expect ERROR: No login for'
begin;
  set local role authenticated;
  select public.admin_reset_password('nobody@x.com', 'Kf7-Rm2-Qx9-Tb4');
rollback;

\echo '--- 7. AN ADMIN CANNOT RESET A SUPER ADMIN ---'
\echo 'expect ERROR: Only a super admin'
begin;
  set local role authenticated;
  select public.admin_reset_password('pr_super@x.com', 'Kf7-Rm2-Qx9-Tb4');
rollback;

\echo '--- 8. ...but a super admin can ---'
\echo 'expect: pr_super@x.com'
call public.be('pr_super@x.com');
begin;
  set local role authenticated;
  select public.admin_reset_password('pr_super@x.com', 'Zq3-Wn8-Lv5-Ha2');
commit;

\echo '--- 9. an ENGINEER cannot read the reset log ---'
\echo 'expect: 0'
call public.be('pr_eng@x.com');
begin;
  set local role authenticated;
  select count(*) as log_rows_visible from public.password_resets;
commit;

\echo '--- 10. ...and an admin can ---'
\echo 'expect: 2'
call public.be('pr_admin@x.com');
begin;
  set local role authenticated;
  select count(*) as log_rows_visible from public.password_resets;
commit;

\echo '--- 11. cleanup ---'
delete from public.password_resets where target_email like 'pr_%@x.com';
delete from public.app_super_admins where email = 'pr_super@x.com';
delete from public.profiles where email like 'pr_%@x.com';

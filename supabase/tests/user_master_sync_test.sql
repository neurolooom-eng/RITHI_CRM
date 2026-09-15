-- ===========================================================================
-- USER MASTER IS THE MASTER (0199). Every error printed is labelled
-- `expect ERROR`.
--
-- The rule under test: a role set on a User Master row reaches that person's
-- SIGN-IN by itself — because until 0199 the only thing that copied it was a
-- button in the browser, and "Zoho Migration" on the screen meant `engineer`
-- in every policy.
--
-- THE WHOLE SUITE RUNS AS AN ADMINISTRATOR, because that is who edits User
-- Master: the address guard (0030/0033) refuses every non-address change to a
-- directory row from anybody else, so a suite run with no identity would be
-- testing the guard and never reach the sync.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
  ('engineer','Engineer','[]'::jsonb),
  ('zoho_migration','Zoho Migration','[]'::jsonb),
  ('hotline','Hotline Engineer','[]'::jsonb),
  ('admin','Admin','[]'::jsonb)
on conflict (role) do update set label = excluded.label;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','ums.admin@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000001','ums.one@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002','ums.two@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000003','ums.dup@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role, designation) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','ums.admin@example.com','UMS ADMIN','admin',''),
  ('aaaaaaaa-0000-0000-0000-000000000001','ums.one@example.com','ONE PERSON','engineer',''),
  ('aaaaaaaa-0000-0000-0000-000000000002','ums.two@example.com','','engineer',''),
  ('aaaaaaaa-0000-0000-0000-000000000003','ums.dup@example.com','DUP PERSON','engineer','')
on conflict (id) do nothing;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- Signed in as the administrator for everything below.
call public.be('ums.admin@example.com');

\echo ''
\echo '=== 1. THE REPORTED CASE: a role set in User Master reaches the sign-in ='
-- Before 0199 this insert changed nothing on `profiles` and the person went on
-- running as an engineer while the screen said otherwise.
insert into public.user_directory (name, email, role, designation)
values ('ONE PERSON','ums.one@example.com','zoho_migration','ZOHO Engineer');
select role as should_be_zoho_migration, designation as should_be_zoho_engineer
  from public.profiles where email = 'ums.one@example.com';

\echo ''
\echo '=== 2. and CHANGING it later reaches the sign-in too ==================='
-- The half 0033 never covered: `ensure_my_profile()` returns early for a row
-- that already exists, so every later change was invisible to the sign-in.
update public.user_directory set role = 'hotline' where email = 'ums.one@example.com';
select role as should_be_hotline
  from public.profiles where email = 'ums.one@example.com';

\echo ''
\echo '=== 3. a role the MATRIX DOES NOT KNOW grants nothing =================='
-- A typo must not be applied. The sign-in keeps the role it had.
update public.user_directory set role = 'zoho_migraton' where email = 'ums.one@example.com';
select role as should_still_be_hotline
  from public.profiles where email = 'ums.one@example.com';

\echo ''
\echo '=== 4. a BLANK role leaves the sign-in alone ==========================='
update public.user_directory set role = '' where email = 'ums.one@example.com';
select role as should_still_be_hotline
  from public.profiles where email = 'ums.one@example.com';

\echo ''
\echo '=== 5. the "?" avatar: a BLANK name is filled from User Master ========='
insert into public.user_directory (name, gmail, role)
values ('TWO PERSON','ums.two@example.com','zoho_migration');
select case when full_name = 'TWO PERSON' then 'FILLED' else 'still ' || coalesce(full_name,'(null)') end as name,
       role as should_be_zoho_migration
  from public.profiles where email = 'ums.two@example.com';
\echo '    matched on GMAIL, not just the work address -- both are tried.'

\echo ''
\echo '=== 6. TWO directory rows for one login: the ROLE still applies ========'
\echo '    ...but the NAME is left alone, because it has no single source.'
insert into public.user_directory (name, email, role) values
  ('DUP PERSON','ums.dup@example.com','engineer'),
  ('WRITE OFF','ums.dup@example.com','zoho_migration');
select role as should_be_zoho_migration,
       case when full_name = 'DUP PERSON' then 'UNCHANGED (correct)'
            else 'OVERWRITTEN with ' || full_name end as name
  from public.profiles where email = 'ums.dup@example.com';

\echo ''
\echo '=== 7. a directory row with NO EMAIL reaches nobody and does not fail =='
insert into public.user_directory (name, role) values ('NO CONTACT','zoho_migration');
select count(*) as should_be_zero
  from public.profiles p where p.email = '' and p.role = 'zoho_migration';

\echo ''
\echo '=== 8. a person who has NOT signed in is simply not there yet =========='
-- No profile row to update; the role waits on `ensure_my_profile()`. Nothing
-- raises, and nothing is invented.
insert into public.user_directory (name, email, role)
values ('NOT YET','ums.future@example.com','zoho_migration');
select count(*) as should_be_zero from public.profiles where email = 'ums.future@example.com';

\echo ''
\echo '=== 9. THE GUARD IS NOT WEAKENED: nobody moves their OWN role =========='
-- 0008 refuses it and the sync must not become a way around it. The
-- administrator above saves their OWN User Master row with a different role:
-- the save is refused WHOLE, so the screen and the sign-in cannot disagree.
insert into public.user_directory (name, email, role)
values ('UMS ADMIN','ums.admin@example.com','admin');
\echo '    expect ERROR: you cannot change your own role or permissions'
update public.user_directory set role = 'hotline' where email = 'ums.admin@example.com';
select role as should_still_be_admin from public.profiles where email = 'ums.admin@example.com';
select role as directory_should_still_be_admin
  from public.user_directory where email = 'ums.admin@example.com';

\echo ''
\echo '=== 10. A PLAIN ENGINEER CHANGES NOTHING -- and does not ERROR ========='
-- Worth stating rather than assuming. RLS never LOCATES the row, so the update
-- touches nothing and raises nothing: a test written here as `expect ERROR`
-- would pass just as happily with the door standing open. Count the rows.
call public.be('ums.one@example.com');
begin;
  set local role authenticated;
  update public.user_directory set role = 'admin' where name = 'TWO PERSON';
commit;
select role as should_still_be_zoho_migration
  from public.profiles where email = 'ums.two@example.com';

\echo ''
\echo '=== 11. ...and SOMEBODY WHO MAY EDIT USERS still cannot hand out a role ='
-- `users.manage` gets them past RLS, and the address guard is what stops them:
-- a role is not an address. Without this, granting somebody the User Master
-- screen would quietly be granting them everybody else"s access.
insert into public.app_roles (role, label, permissions)
values ('user_manager','User Manager','["users.manage"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;
call public.be('ums.admin@example.com');
update public.user_directory set role = 'user_manager' where email = 'ums.one@example.com';
select role as should_be_user_manager from public.profiles where email = 'ums.one@example.com';

call public.be('ums.one@example.com');
\echo '    expect ERROR: only an administrator may edit the user directory'
begin;
  set local role authenticated;
  update public.user_directory set role = 'admin' where name = 'TWO PERSON';
commit;
select role as should_still_be_zoho_migration
  from public.profiles where email = 'ums.two@example.com';
call public.be('ums.admin@example.com');

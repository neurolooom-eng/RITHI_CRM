-- ===========================================================================
-- The User Master role, and the profile it becomes (0033_user_directory_role).
--   A role set on a directory row is what the person gets the first time they
--   sign in; a role the matrix does not know grants nothing; and the door that
--   lets dispatch fix an address must not let them hand out roles.
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','ann@x.com'),
 ('aaaaaaaa-0000-0000-0000-000000000002','newrm@x.com'),
 ('aaaaaaaa-0000-0000-0000-000000000003','plain@x.com'),
 ('aaaaaaaa-0000-0000-0000-000000000004','typo@x.com'),
 ('aaaaaaaa-0000-0000-0000-000000000005','packer@x.com');

insert into public.profiles (id,email,full_name,role) values
 ('aaaaaaaa-0000-0000-0000-000000000001','ann@x.com','Admin Ann','admin'),
 ('aaaaaaaa-0000-0000-0000-000000000005','packer@x.com','Packer Pat','stores_incharge');

insert into public.user_directory (name,email,designation,region,role) values
 ('New Manager','newrm@x.com','Reporting Manager','South','rm'),
 ('Plain Person','plain@x.com','Service Engineer','South',''),
 ('Typo Tim','typo@x.com','Service Engineer','South','engneer'),
 ('Packer Pat','packer@x.com','Stores','South','stores_incharge');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

\echo '--- 1. a directory row carries the role it should grant ---'
select name, role from public.user_directory order by name;

\echo '--- 2. first sign-in builds the profile from that row (rm, not engineer) ---'
call public.be('newrm@x.com');
select role, full_name, designation from public.ensure_my_profile();
select role, full_name from public.profiles where email = 'newrm@x.com';

\echo '--- 3. calling it again is a no-op, not a second row ---'
select count(*) as profiles_for_newrm from public.profiles where email = 'newrm@x.com';
select role from public.ensure_my_profile();

\echo '--- 4. no role on the row: an engineer, as before ---'
call public.be('plain@x.com');
select role from public.ensure_my_profile();

\echo '--- 5. a role the matrix does not know grants nothing, not something odd ---'
call public.be('typo@x.com');
select role from public.ensure_my_profile();

\echo '--- 6. an existing profile is left exactly as it is ---'
call public.be('packer@x.com');
select role from public.ensure_my_profile();

\echo '--- 7. dispatch may still fix an address ---'
call public.be('packer@x.com');
update public.user_directory set address = '12 Dock Road' where name = 'Plain Person';
select name, address from public.user_directory where name = 'Plain Person';

\echo '--- 8. expect ERROR: dispatch may NOT hand out a role through that door ---'
update public.user_directory set role = 'admin' where name = 'Plain Person';

\echo '--- 9. the role is unchanged after that attempt ---'
select name, coalesce(role,'') as role from public.user_directory where name = 'Plain Person';

\echo '--- 10. an administrator may set it ---'
call public.be('ann@x.com');
update public.user_directory set role = 'hotline' where name = 'Plain Person';
select name, role from public.user_directory where name = 'Plain Person';

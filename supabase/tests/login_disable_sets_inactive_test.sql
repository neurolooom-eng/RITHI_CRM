-- ===========================================================================
-- DISABLING A LOGIN SETS THE PERSON INACTIVE ON USER MASTER (0481).
--   Disabling a login (profiles.active -> false) sets every User Master row of
--   its address -- Air Liquide ID or Gmail -- to Active = false. It works for a
--   non-administrator who holds users.manage.disable (the address guard lets
--   that one change through, and that holder still cannot edit the row
--   directly), it is one way (enabling the login leaves the
--   User Master alone), and nothing else about the row changes.
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0e481000-0000-0000-0000-000000000001', 'lds_admin@x.com'),
  ('0e481000-0000-0000-0000-000000000002', 'lds_hr@x.com'),
  ('0e481000-0000-0000-0000-000000000003', 'lds_a@x.com'),
  ('0e481000-0000-0000-0000-000000000004', 'lds_b@gmail.com')
on conflict do nothing;
insert into public.app_roles (role, permissions) values ('lds_hr_role', '["users.manage.disable"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;
insert into public.profiles (id, email, full_name, role, active) values
  ('0e481000-0000-0000-0000-000000000001', 'lds_admin@x.com', 'LDS Admin', 'admin',       true),
  ('0e481000-0000-0000-0000-000000000002', 'lds_hr@x.com',    'LDS HR',    'lds_hr_role', true),
  ('0e481000-0000-0000-0000-000000000003', 'lds_a@x.com',     'LDS A',     'engineer',    true),
  ('0e481000-0000-0000-0000-000000000004', 'lds_b@gmail.com', 'LDS B',     'engineer',    true)
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, active = excluded.active;
insert into public.user_directory (name, email, gmail, validity, region) values
  ('LDS A', 'lds_a@x.com', '',                true, 'South'),
  ('LDS B', 'lds_b@x.com', 'lds_b@gmail.com', true, 'North');
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo '--- 1. an administrator disables A: A is inactive on User Master, nothing else changed ---'
\echo 'expect: f | South | LDS A'
call public.be('lds_admin@x.com');
begin; set local role authenticated;
  update public.profiles set active = false where email = 'lds_a@x.com';
commit;
select validity, region, name from public.user_directory where email = 'lds_a@x.com';

\echo '--- 2. a non-administrator with users.manage.disable disables B (matched on the Gmail) ---'
\echo 'expect: f | North'
call public.be('lds_hr@x.com');
begin; set local role authenticated;
  update public.profiles set active = false where email = 'lds_b@gmail.com';
commit;
select validity, region from public.user_directory where gmail = 'lds_b@gmail.com';

\echo '--- 3. one way: enabling A again leaves the User Master inactive ---'
\echo 'expect: f'
call public.be('lds_admin@x.com');
begin; set local role authenticated;
  update public.profiles set active = true where email = 'lds_a@x.com';
commit;
select validity from public.user_directory where email = 'lds_a@x.com';

\echo '--- 4. nothing else opens for a non-administrator: an edit of the row matches nothing ---'
\echo 'expect: UPDATE 0, and the region is still South'
call public.be('lds_hr@x.com');
begin; set local role authenticated;
  update public.user_directory set region = 'East' where email = 'lds_a@x.com';
commit;
select region from public.user_directory where email = 'lds_a@x.com';

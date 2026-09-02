-- ===========================================================================
-- app_user_names (0068) — id -> display name, so a table can show WHO created
-- a row instead of the UUID stamped into created_by.
--
-- What has to hold: an ordinary engineer, who may read only their OWN profile
-- row, can still resolve everyone's name — and cannot write anything through
-- the view, which bypasses the profiles policy on the way in.
--
-- Run after _stub.sql + every migration:
--   psql ... -f supabase/tests/app_user_names_test.sql
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('b1b1b1b1-0000-0000-0000-000000000001','aun_eng@x.com'),
  ('b1b1b1b1-0000-0000-0000-000000000002','aun_boss@x.com'),
  ('b1b1b1b1-0000-0000-0000-000000000003','aun_blank@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('b1b1b1b1-0000-0000-0000-000000000001','aun_eng@x.com','Aun Engineer','engineer'),
  ('b1b1b1b1-0000-0000-0000-000000000002','aun_boss@x.com','Aun Boss','nsm'),
  ('b1b1b1b1-0000-0000-0000-000000000003','aun_blank@x.com','   ','engineer')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

call public.be('aun_eng@x.com');

\echo '--- 1. profiles itself shows an engineer only THEMSELVES ---'
begin;
  set local role authenticated;
  select count(*) as own_rows_visible from public.profiles where email like 'aun_%';
commit;

\echo '--- 2. ...but the name view resolves everyone, which is the point ---'
begin;
  set local role authenticated;
  select id, name from public.app_user_names
   where id::text like 'b1b1b1b1%' order by id;
commit;

\echo '--- 3. a blank full_name falls back to the email, never to nothing ---'
begin;
  set local role authenticated;
  select name from public.app_user_names where id = 'b1b1b1b1-0000-0000-0000-000000000003';
commit;

\echo '--- 4. the view is READ-ONLY: no update through it (expect ERROR) ---'
begin;
  set local role authenticated;
  update public.app_user_names set name = 'Hijacked' where id = 'b1b1b1b1-0000-0000-0000-000000000002';
commit;

\echo '--- 5. ...and no delete through it (expect ERROR) ---'
begin;
  set local role authenticated;
  delete from public.app_user_names where id = 'b1b1b1b1-0000-0000-0000-000000000002';
commit;

\echo 'expect: Aun Boss, untouched'
select full_name from public.profiles where id = 'b1b1b1b1-0000-0000-0000-000000000002';

\echo '--- 6. anon cannot read it at all (expect ERROR: permission denied) ---'
begin;
  set local role anon;
  select count(*) from public.app_user_names;
commit;

\echo '--- 7. cleanup ---'
delete from public.profiles where email like 'aun_%';
delete from auth.users where email like 'aun_%';

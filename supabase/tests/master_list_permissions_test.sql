-- ===========================================================================
-- Master value lists — permission per list (0067).
--
-- Roles & Permissions lists every master as its own page, so the database has
-- to agree: `master.<list>.edit` maintains one list and `master.<list>.delete`
-- removes from it, while the global `masters.edit` still covers every list.
--
-- Run after _stub.sql + every migration:
--   psql ... -f supabase/tests/master_list_permissions_test.sql
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- ---- personas -------------------------------------------------------------
--   ml_one  — may maintain Call Type only (edit, no delete)
--   ml_del  — may delete from Call Type only
--   ml_all  — holds the global masters.edit
insert into auth.users (id, email) values
  ('a1a1a1a1-0000-0000-0000-000000000001','ml_one@x.com'),
  ('a1a1a1a1-0000-0000-0000-000000000002','ml_del@x.com'),
  ('a1a1a1a1-0000-0000-0000-000000000003','ml_all@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('a1a1a1a1-0000-0000-0000-000000000001','ml_one@x.com','ML One','ml_one'),
  ('a1a1a1a1-0000-0000-0000-000000000002','ml_del@x.com','ML Del','ml_del'),
  ('a1a1a1a1-0000-0000-0000-000000000003','ml_all@x.com','ML All','ml_all')
on conflict (id) do update set role = excluded.role;

-- MERGE, never overwrite: an admin may have tuned an existing role.
insert into public.app_roles (role, label, permissions) values
  ('ml_one','ML One',  '["master.call_type.edit"]'::jsonb),
  ('ml_del','ML Del',  '["master.call_type.delete"]'::jsonb),
  ('ml_all','ML All',  '["masters.edit"]'::jsonb)
on conflict (role) do update
  set permissions = (select jsonb_agg(distinct v)
                       from jsonb_array_elements(public.app_roles.permissions || excluded.permissions) v);

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

\echo '--- 1. list-scoped edit adds to ITS list ---'
call public.be('ml_one@x.com');
begin;
  set local role authenticated;
  insert into public.masters (name, value) values ('call_type','ML Breakdown');
  select name, value from public.masters where value like 'ML %' order by value;
commit;

\echo '--- 2. ...and NOT to another list (expect ERROR: row-level security) ---'
begin;
  set local role authenticated;
  insert into public.masters (name, value) values ('cancel_reason','ML Withdrawn');
commit;

-- A DELETE policy filters rather than raising: the row is simply not visible
-- to the delete, so the count stays 1.
\echo '--- 3. edit does not carry delete: removes nothing ---'
begin;
  set local role authenticated;
  delete from public.masters where name = 'call_type' and value = 'ML Breakdown';
commit;
select count(*) as still_there from public.masters where name='call_type' and value='ML Breakdown';

\echo '--- 4. deactivating a value is an update, so list-scoped edit may do it ---'
call public.be('ml_one@x.com');
begin;
  set local role authenticated;
  update public.masters set active = false where name='call_type' and value='ML Breakdown';
  select value, active from public.masters where name='call_type' and value='ML Breakdown';
commit;

\echo '--- 5. the global masters.edit still covers every list ---'
call public.be('ml_all@x.com');
begin;
  set local role authenticated;
  insert into public.masters (name, value) values ('cancel_reason','ML Withdrawn');
  select name, value from public.masters where value = 'ML Withdrawn';
commit;

\echo '--- 6. list-scoped delete removes from its list ---'
call public.be('ml_del@x.com');
begin;
  set local role authenticated;
  delete from public.masters where name='call_type' and value='ML Breakdown';
commit;
select count(*) as gone from public.masters where name='call_type' and value='ML Breakdown';

\echo '--- 7. ...but delete does not carry edit (expect ERROR: row-level security) ---'
begin;
  set local role authenticated;
  insert into public.masters (name, value) values ('call_type','ML Sneaked In');
commit;

\echo '--- 8. cleanup ---'
call public.be('ml_all@x.com');
begin;
  set local role authenticated;
  delete from public.masters where value like 'ML %';
commit;
delete from public.app_roles where role in ('ml_one','ml_del','ml_all');

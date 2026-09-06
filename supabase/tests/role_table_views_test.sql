-- ===========================================================================
-- A REGISTER'S LAYOUT, SET FOR A ROLE (0120).
--
-- What this suite is really holding:
--   * a role's own layout beats the everyone one — that is the whole feature;
--   * only an administrator may set or clear one;
--   * `set_at` is stamped by the DATABASE, so a caller cannot back-date a
--     layout to make it lose (or win) against somebody's own arrangement;
--   * clearing is possible without inventing an "empty layout", which would
--     read as "show no columns".
--
-- Superuser bypasses RLS, so the scoped checks run as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('a1a1a1a1-0000-0000-0000-000000000001','rv_admin@x.com'),
 ('a1a1a1a1-0000-0000-0000-000000000002','rv_stores@x.com'),
 ('a1a1a1a1-0000-0000-0000-000000000003','rv_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('a1a1a1a1-0000-0000-0000-000000000001','rv_admin@x.com','RV Admin','admin'),
 ('a1a1a1a1-0000-0000-0000-000000000002','rv_stores@x.com','RV Stores','stores_incharge'),
 ('a1a1a1a1-0000-0000-0000-000000000003','rv_eng@x.com','RV Eng','engineer')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo '--- 1. an ENGINEER cannot set a layout for anybody ---'
\echo 'expect ERROR: only an administrator can set a layout for a role'
call public.be('rv_eng@x.com');
begin;
  set local role authenticated;
  select public.set_role_table_view('spare-dispatch', 'engineer', '{"hidden":["x"]}'::jsonb);
commit;

\echo '--- 2. an administrator sets one for EVERYONE ---'
\echo 'expect: a millisecond stamp, and it is the database''s, not the caller''s'
call public.be('rv_admin@x.com');
begin;
  set local role authenticated;
  select public.set_role_table_view('spare-dispatch', '', '{"hidden":["remarks"],"group":["engineer"]}'::jsonb) > 0 as stamped;
commit;

\echo '--- 3. everybody sees it, including the engineer who could not set it ---'
\echo 'expect: role blank (the everyone layout), hidden = remarks'
call public.be('rv_eng@x.com');
begin;
  set local role authenticated;
  select role, view->>'hidden' as hidden from public.my_table_view('spare-dispatch');
commit;

\echo '--- 4. THE FEATURE: a role''s own layout beats the everyone one ---'
\echo 'expect: Stores sees role=stores_incharge; the engineer still sees the'
\echo 'everyone layout, because none was set for them'
call public.be('rv_admin@x.com');
begin;
  set local role authenticated;
  select public.set_role_table_view('spare-dispatch', 'stores_incharge', '{"hidden":["party_name"]}'::jsonb) > 0 as ok;
commit;
call public.be('rv_stores@x.com');
begin;
  set local role authenticated;
  select 'stores' as who, role, view->>'hidden' as hidden from public.my_table_view('spare-dispatch');
commit;
call public.be('rv_eng@x.com');
begin;
  set local role authenticated;
  select 'engineer' as who, role, view->>'hidden' as hidden from public.my_table_view('spare-dispatch');
commit;

\echo '--- 5. setting it again MOVES the stamp forward ---'
\echo 'expect: t — otherwise "apply to a role" could not override an arrangement'
\echo 'somebody made in between'
call public.be('rv_admin@x.com');
begin;
  set local role authenticated;
  select public.set_role_table_view('spare-dispatch', 'stores_incharge', '{"hidden":["serial"]}'::jsonb)
       >= (select set_at from public.role_table_views where storage_key='spare-dispatch' and role='stores_incharge')
       as stamp_moved_forward;
commit;

\echo '--- 6. an engineer cannot CLEAR one either ---'
\echo 'expect ERROR: only an administrator can clear a layout for a role'
call public.be('rv_eng@x.com');
begin;
  set local role authenticated;
  select public.clear_role_table_view('spare-dispatch', 'stores_incharge');
commit;

\echo '--- 7. an administrator clears the role''s, and it falls back to everyone ---'
\echo 'expect: t, then Stores sees the everyone layout again'
call public.be('rv_admin@x.com');
begin;
  set local role authenticated;
  select public.clear_role_table_view('spare-dispatch', 'stores_incharge') as cleared;
commit;
call public.be('rv_stores@x.com');
begin;
  set local role authenticated;
  select role, view->>'hidden' as hidden from public.my_table_view('spare-dispatch');
commit;

\echo '--- 8. a register nobody has set up answers nothing, not an empty layout ---'
\echo 'expect: 0 rows — an empty layout would read as "show no columns"'
call public.be('rv_stores@x.com');
begin;
  set local role authenticated;
  select count(*) as rows_for_an_unset_register from public.my_table_view('never-configured');
commit;

\echo '--- 9. the table cannot be written around the function ---'
\echo 'expect ERROR: permission denied for table role_table_views'
call public.be('rv_admin@x.com');
begin;
  set local role authenticated;
  insert into public.role_table_views (storage_key, role, view) values ('x','engineer','{}'::jsonb);
commit;

\echo '--- 10. cleanup ---'
call public.be(null);
delete from public.role_table_views where storage_key in ('spare-dispatch','x','never-configured');
delete from public.profiles where email like 'rv_%@x.com';

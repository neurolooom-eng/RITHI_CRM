-- ===========================================================================
-- CORRECTING A MANAGER'S NAME KEEPS THEIR TEAM (0257, finding 23).
--
-- WHAT THIS PROVES, as a signed-in ADMINISTRATOR (the only role
-- user_directory_address_guard lets change a name) — never the superuser,
-- which would skip the row-level security the cascade runs under:
--   1. the measured failure is gone: the Reporting Manager sees the same
--      people after their name is corrected as before;
--   2. EXACTLY the right rows move — reporting and regional manager, any case
--      — and a row naming ' RM Ravi ' (which the tree does not count as his)
--      is left alone, so no team WIDENS;
--   3. the three limits: a blank old name, an old name still held by another
--      row, and a change of case only, carry nothing.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('02570000-0000-0000-0000-000000000001', 'um-admin@x.com'),
  ('02570000-0000-0000-0000-000000000002', 'rm-ravi@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('02570000-0000-0000-0000-000000000001', 'um-admin@x.com', 'UM Admin',  'admin'),
  ('02570000-0000-0000-0000-000000000002', 'rm-ravi@x.com',  'RM Ravi',   'rm')
on conflict (id) do update set role = excluded.role;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into public.user_directory (name, email, reporting_manager, regional_manager) values
  ('RM Ravi',   'rm-ravi@x.com', '',          ''),
  ('Eng A',     'a@x.com',       'RM Ravi',   ''),
  ('Eng B',     'b@x.com',       'rm ravi',   ''),        -- another case: the tree counts it
  ('Eng C',     'c@x.com',       'Other RM',  'RM Ravi'), -- regional
  ('Eng Spaced','s@x.com',       ' RM Ravi ', ''),        -- the tree does NOT count it
  ('Eng Loose', 'l@x.com',       '',          ''),
  ('Dup Name',  'd1@x.com',      '',          ''),
  ('Dup Name',  'd2@x.com',      '',          ''),
  ('Eng Dup',   'ed@x.com',      'Dup Name',  ''),
  ('Case Mgr',  'cm@x.com',      '',          ''),
  ('Eng Case',  'ec@x.com',      'Case Mgr',  ''),
  ('',          'blank@x.com',   '',          '');

\echo ''
\echo '--- 1. the Reporting Manager sees the same team after the correction ---'
call public.be('rm-ravi@x.com');
create temp table before_team as select public.visible_engineer_names() as n;
grant select on before_team to authenticated;

call public.be('um-admin@x.com');
set role authenticated;
update public.user_directory set name = 'Ravi Kumar' where email = 'rm-ravi@x.com';
reset role;

call public.be('rm-ravi@x.com');
do $$
declare b text; a text;
begin
  select string_agg(n, ', ' order by n) into b from before_team where n <> 'RM Ravi';
  select string_agg(n, ', ' order by n) into a
    from public.visible_engineer_names() n where n <> 'Ravi Kumar';
  if b is distinct from 'Eng A, Eng B, Eng C' then
    raise exception 'fixture: before the rename the team should be Eng A, Eng B, Eng C, got %', b;
  end if;
  if a is distinct from b then
    raise exception 'after the rename the team should still be %, got %', b, a;
  end if;
  raise notice 'ok: team before and after = %', a;
end $$;

\echo ''
\echo '--- 2. exactly the right rows moved ---'
do $$
declare got text;
begin
  select string_agg(name || ':' || reporting_manager || '/' || regional_manager, '; ' order by name)
    into got from public.user_directory
   where name in ('Eng A', 'Eng B', 'Eng C', 'Eng Spaced', 'Eng Loose');
  if got <> 'Eng A:Ravi Kumar/; Eng B:Ravi Kumar/; Eng C:Other RM/Ravi Kumar; Eng Loose:/; Eng Spaced: RM Ravi /' then
    raise exception 'rows after the rename: %', got;
  end if;
  raise notice 'ok: %', got;
end $$;

\echo ''
\echo '--- 3. the three limits carry nothing ---'
call public.be('um-admin@x.com');
set role authenticated;
update public.user_directory set name = 'Dup Renamed' where email = 'd1@x.com';  -- another row keeps 'Dup Name'
update public.user_directory set name = 'CASE MGR'    where email = 'cm@x.com';  -- case only
update public.user_directory set name = 'Now Named'   where email = 'blank@x.com'; -- blank old name
reset role;
do $$
declare got text;
begin
  select string_agg(name || ':' || reporting_manager, '; ' order by name) into got
    from public.user_directory where name in ('Eng Dup', 'Eng Case', 'Eng Loose');
  if got <> 'Eng Case:Case Mgr; Eng Dup:Dup Name; Eng Loose:' then
    raise exception 'a limited rename carried something: %', got;
  end if;
  raise notice 'ok: %', got;
end $$;

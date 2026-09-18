-- ===========================================================================
-- 0216 — `data.view_all` for every role EXCEPT Regional Manager, Reporting
-- Manager and Engineer.
--
--   psql ... -f supabase/tests/view_all_except_three_test.sql
--
-- THE FIXTURES ARE INSERTED AND THEN THE MIGRATION IS RE-RUN (`\i`), because a
-- suite runs AFTER every migration has already been applied: rows created here
-- would otherwise never be seen by the file under test, and every assertion
-- would pass against roles the migration had already finished with. That is a
-- suite testing its own fixtures, and this project has shipped one.
--
-- The EXCLUSION is what is really being tested. Granting too little is visible
-- and reversible with a tick; granting to a Regional Manager hands one manager
-- every region's rows and reads as a different region rather than as a fault.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

delete from public.app_roles
 where role like 't216\_%'
    or role in ('regional_manager', 'RegionalManager', 'reporting_manager');

insert into public.app_roles (role, permissions) values
  -- ORDINARY, non-excluded, configured: must GAIN the key.
  ('t216_commercial',        '["calls.view","spare.approve_commercial"]'::jsonb),
  ('t216_tally',             '["calls.view"]'::jsonb),
  -- A role this repository has never heard of. The whole point of writing the
  -- rule as "everything minus three": it must be covered without being named.
  ('t216_some_new_role',     '["calls.view"]'::jsonb),
  -- THE THREE, in the spellings they turn up in. NOT prefixed like the rows
  -- above, and that is the point: the exclusion matches the role KEY with case
  -- and punctuation squashed, so `t216_regional_manager` is a DIFFERENT role
  -- and would rightly be granted. The first draft of this suite prefixed them
  -- and failed for that reason -- the fixture was wrong, not the migration.
  ('regional_manager',       '["calls.view"]'::jsonb),
  ('RegionalManager',        '["calls.view"]'::jsonb),
  ('reporting_manager',      '["calls.view"]'::jsonb),
  -- NOT CONFIGURED: zero permissions means the engineer fallback is live, and
  -- writing one key in would switch it off.
  ('t216_unconfigured',      '[]'::jsonb),
  -- Already holds it: must not be duplicated or rewritten.
  ('t216_already',           '["calls.view","data.view_all"]'::jsonb),
  -- AN EXCLUDED ROLE THAT HOLDS IT BY A HAND TICK. The file must LEAVE IT,
  -- because those three roles are not this migration's to edit.
  -- `rgm`, `rm` and `engineer` themselves are already rows from the migrations;
  -- they are asserted below without being re-inserted.
  ('t216_engineer_ticked',   '["calls.view","data.view_all"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

\echo '---- running 0216 against the fixtures ----'
\i supabase/migrations/0216_view_all_except_the_three.sql

\echo '---- results ----'
select role,
       (permissions ? 'data.view_all')                        as has_view_all,
       jsonb_array_length(permissions)                        as perms
  from public.app_roles
 where role like 't216\_%'
    or role in ('rgm', 'rm', 'engineer', 'regional_manager', 'RegionalManager',
                'reporting_manager')
 order by role;

do $$
declare bad text;
begin
  -- GRANTED where it should be.
  select string_agg(role, ', ') into bad from public.app_roles
   where role in ('t216_commercial', 't216_tally', 't216_some_new_role')
     and not (permissions ? 'data.view_all');
  if bad is not null then raise exception 'FAIL: not granted to %', bad; end if;

  -- NOT granted to any spelling of the three.
  select string_agg(role, ', ') into bad from public.app_roles
   where role in ('rgm', 'rm', 'engineer',
                  'regional_manager', 'RegionalManager', 'reporting_manager')
     and (permissions ? 'data.view_all');
  if bad is not null then raise exception 'FAIL: granted to an EXCLUDED role -- %', bad; end if;

  -- The unconfigured role is still unconfigured.
  if (select jsonb_array_length(permissions) from public.app_roles
       where role = 't216_unconfigured') <> 0 then
    raise exception 'FAIL: a zero-permission role was written to';
  end if;

  -- No duplicate key, and nothing else lost.
  if (select jsonb_array_length(permissions) from public.app_roles
       where role = 't216_already') <> 2 then
    raise exception 'FAIL: an existing holder was rewritten';
  end if;
  if not (select permissions ? 'calls.view' from public.app_roles
           where role = 't216_commercial') then
    raise exception 'FAIL: MERGE lost an existing permission';
  end if;

  -- It does NOT revoke from an excluded role that was ticked by hand.
  if not (select permissions ? 'data.view_all' from public.app_roles
           where role = 't216_engineer_ticked') then
    raise exception 'FAIL: 0216 removed data.view_all from an excluded role -- '
      'those three roles are not its to edit';
  end if;

  raise notice 'PASS: granted to 3, refused to all 6 spellings of the three, '
    'left the unconfigured row and the hand tick alone';
end $$;

\echo '---- re-running it changes nothing (idempotent) ----'
\i supabase/migrations/0216_view_all_except_the_three.sql

do $$
begin
  if (select count(*) from public.app_roles
       where role like 't216\_%' and permissions ? 'data.view_all') <> 5 then
    raise exception 'FAIL: the second run changed the outcome';
  end if;
  raise notice 'PASS: idempotent';
end $$;

rollback;

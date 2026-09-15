-- ===========================================================================
-- THE TWO ANALYSIS ROLES SEE THE DATA THEY ANALYSE — AND NOBODY ELSE MOVES
-- (0207).
--
--   Reported from use: Spare Insights and Product Failure Analysis were both
--   BLANK for VPTechnical. The module key opened each screen; the read
--   policies answered with nothing, because a role that is not an office role
--   and has no reporting team passes no branch of either scope.
--
--   The user's constraint is half the test: "Take the Current [As Set in the
--   App] Roles as the Standard for Regional Managers, Reporting Managers,
--   Engineers .. Never Touch those Roles & Permissions. Modify only the
--   VPTechnical and RnDEngg Role." So this suite asserts what the migration
--   did NOT do at least as hard as what it did.
--
-- Superuser bypasses RLS, so every scoped read runs as `authenticated`.
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- ---------------------------------------------------------------------------
-- The state BEFORE 0207: roles tuned by an administrator, exactly as a project
-- in use has them. The two analysis roles hold their page keys and nothing
-- that grants sight of a row.
-- ---------------------------------------------------------------------------
insert into public.app_roles (role, label, permissions) values
 ('vptechnical', 'VPTechnical',
  '["mod:/product-failure","mod:/spare-insights","mod:/","dashboard.view"]'::jsonb),
 ('rndengg', 'RnDEngg',
  '["mod:/product-failure","mod:/failure-report"]'::jsonb),
 -- The three the user named. Their permissions are the standard and must come
 -- out of this byte for byte.
 ('rgm', 'Regional Manager', '["calls.view","calls.allot","reports.view"]'::jsonb),
 ('rm', 'Reporting Manager', '["calls.view","calls.allot"]'::jsonb),
 ('engineer', 'Field Engineer', '["calls.view","calls.report"]'::jsonb),
 -- A role with an EMPTY set means "not configured" and falls back to the code
 -- defaults; writing one key into it turns that fallback off.
 ('rndengineer_empty', 'RnD Engineer', '[]'::jsonb)
on conflict (role) do update set label = excluded.label, permissions = excluded.permissions;

create temporary table before_207 as
  select role, permissions from public.app_roles;

-- ---------------------------------------------------------------------------
-- Re-run the migration. It is idempotent, so running it a second time on a
-- database that already has it must still produce exactly this.
-- ---------------------------------------------------------------------------
\set ECHO none
do $$
declare
  n int;
  keys text[] := array[
    'data.view_all',      -- the scope: every call, report, request and consumption row
    'calls.view',         -- the gate the call policies test BEFORE the scope
    'consumption.view',   -- Spare Insights, and the consumption reports
    'reports.view',       -- the visit reports a failure is read from
    'ffr.view',           -- the Field Failure Register the analysis rolls up
    'masters.view',       -- product, party and part names, so a chart has labels
    'feedback.view',
    'dashboard.view'
  ];
  who text;
begin
  if to_regclass('public.app_roles') is null then return; end if;

  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ar.permissions) as v
               union
               select unnest(keys) as v
             ) u
         ),
         updated_at = now()
   -- The LABEL is matched as well as the key: a role created through the UI
   -- takes its key from the name it was given, and "VP Technical" keys as
   -- `vp_technical` while "VPTechnical" keys as `vptechnical`. Squashing the
   -- separators out of both means the migration does not depend on which was
   -- typed. Nothing else squashes to these strings.
   where jsonb_array_length(ar.permissions) > 0
     and ( regexp_replace(lower(coalesce(ar.role,  '')), '[^a-z0-9]', '', 'g')
             in ('vptechnical', 'rndengg', 'rndengineer')
        or regexp_replace(lower(coalesce(ar.label, '')), '[^a-z0-9]', '', 'g')
             in ('vptechnical', 'rndengg', 'rndengineer') );
  get diagnostics n = row_count;

  select string_agg(ar.role, ', ' order by ar.role) into who
    from public.app_roles ar
   where regexp_replace(lower(coalesce(ar.role, '')), '[^a-z0-9]', '', 'g')
           in ('vptechnical', 'rndengg', 'rndengineer')
      or regexp_replace(lower(coalesce(ar.label, '')), '[^a-z0-9]', '', 'g')
           in ('vptechnical', 'rndengg', 'rndengineer');

  raise notice '0207: % analysis role(s) updated; roles present: %', n, coalesce(who, 'none');
  if who is null then
    raise notice '0207: neither VP Technical nor R&D Engineer exists on this project — nothing to do.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. THE TWO ANALYSIS ROLES NOW HOLD BOTH HALVES: the `has_perm` gate each
--    read path tests first, AND the scope that decides the rows. Holding one
--    without the other is what an empty page looks like.
-- ---------------------------------------------------------------------------
select 'vptechnical has the gate and the scope' as check,
       (permissions ? 'calls.view')       as calls_view,
       (permissions ? 'consumption.view') as consumption_view,
       (permissions ? 'data.view_all')    as view_all
  from public.app_roles where role = 'vptechnical';

select 'rndengg has the gate and the scope' as check,
       (permissions ? 'calls.view')       as calls_view,
       (permissions ? 'consumption.view') as consumption_view,
       (permissions ? 'data.view_all')    as view_all
  from public.app_roles where role = 'rndengg';

-- 2. WHAT THEY HELD BEFORE IS STILL THERE. Merged, not overwritten: an
--    administrator's tuning survives.
select 'the page keys they already had are kept' as check,
       (permissions ? 'mod:/product-failure') as product_failure,
       (permissions ? 'mod:/spare-insights')  as spare_insights
  from public.app_roles where role = 'vptechnical';

-- 3. READ ONLY. The analysis roles gained no authority to change a record.
select 'no write right was granted' as check,
       count(*) filter (where permissions ?| array[
         'calls.create','calls.edit','calls.allot','calls.cancel','calls.report',
         'review.edit','ffr.manage','cover.edit','consumption.reconcile',
         'spare.dispatch','stock.transfer','admin.view'
       ]) as roles_with_a_write
  from public.app_roles where role in ('vptechnical','rndengg');

-- 4. THE THREE ROLES THE USER NAMED ARE BYTE-FOR-BYTE UNCHANGED, and so is
--    every other role on the project. This is the assertion the instruction
--    was: the migration must be incapable of touching them.
select 'nothing but the two analysis roles moved' as check,
       coalesce(string_agg(b.role, ', ' order by b.role), 'none') as roles_changed
  from before_207 b
  join public.app_roles a on a.role = b.role
 where a.permissions is distinct from b.permissions
   and b.role not in ('vptechnical','rndengg');

-- 5. A ROLE WITH ZERO PERMISSIONS IS LEFT EMPTY even though its name matches.
--    `permsForRole()` returns the stored set whenever it is non-empty, so
--    writing one key here would replace the code defaults with that one key.
select 'an unconfigured role is left unconfigured' as check,
       jsonb_array_length(permissions) as keys
  from public.app_roles where role = 'rndengineer_empty';

-- ---------------------------------------------------------------------------
-- 6. AND IT ACTUALLY WORKS — the question the permission rows only imply.
--    A consumption line raised by somebody else, read as the VP.
--
--    Superuser bypasses RLS, so every scoped read runs as `authenticated` and
--    the harness says who that is. A suite that asserts on permission ROWS
--    alone proves the migration wrote what it meant to write, not that the
--    page stops being blank.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
 ('cc000000-0000-0000-0000-000000000001','vp@x.com'),
 ('cc000000-0000-0000-0000-000000000002','eng@x.com'),
 ('cc000000-0000-0000-0000-000000000003','other@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
 ('cc000000-0000-0000-0000-000000000001','vp@x.com','VP Person','vptechnical'),
 ('cc000000-0000-0000-0000-000000000002','eng@x.com','Some Engineer','engineer'),
 ('cc000000-0000-0000-0000-000000000003','other@x.com','Other Engineer','engineer')
on conflict (id) do update set role = excluded.role, email = excluded.email;

-- The engineer must HOLD the part before a line can be booked against it — a
-- trigger caps every consumption at the hand-stock balance. An insert the
-- guard rejects would leave every reader below seeing zero rows and the suite
-- passing while proving nothing.
insert into public.handstock_opening (engineer, part, qty, as_of, source)
 values ('Some Engineer', 'O-RING', 5, current_date - 1, 'Opening');

insert into public.spare_consumption (ucn, engineer, engineer_email, part, qty, created_by)
 values ('CONS-VP-1','Some Engineer','eng@x.com','O-RING', 2,
         'cc000000-0000-0000-0000-000000000002');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo ''
\echo '--- the line exists, so a reader seeing 0 below is a REFUSAL, not an empty table ---'
select count(*) as should_be_1 from public.spare_consumption where ucn = 'CONS-VP-1';

\echo ''
\echo '--- the VP reads a consumption line raised by an engineer: should_be_1 ---'
call public.be('vp@x.com');
set role authenticated;
select public.has_perm('consumption.view') as gate,
       public.can_view_all_calls()         as scope;
select count(*) as should_be_1 from public.spare_consumption where ucn = 'CONS-VP-1';
reset role;

\echo ''
\echo '--- the engineer who raised it still reads it: should_be_1 ---'
-- The standard role was not touched, so this is unchanged either way. It is
-- here because "nobody lost anything" is the other half of the instruction.
call public.be('eng@x.com');
set role authenticated;
select count(*) as should_be_1 from public.spare_consumption where ucn = 'CONS-VP-1';
reset role;

\echo ''
\echo '--- an unrelated engineer reads nothing of it: should_be_0 ---'
-- Without this the two checks above prove only that the row exists: a policy
-- that let everybody through would pass them both.
call public.be('other@x.com');
set role authenticated;
select count(*) as should_be_0 from public.spare_consumption where ucn = 'CONS-VP-1';
reset role;

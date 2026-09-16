-- ===========================================================================
-- "HOW RITHI FUNCTIONS" REACHES FOUR ROLES AND NO OTHERS (0209).
--
--   The user, 2026-09-16: "How RITHI Functions - Limit Exposure to Admin, NSM,
--   Zoho, Technical Support."
--
--   This suite asserts the NEGATIVE as hard as the positive, because that is
--   what "limit exposure" means: a migration that grants the four and also
--   leaks to a fifth passes every check that only looks at the four.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- The state BEFORE 0209 on a project in use: every role has a tuned row, and
-- none of them has ever heard of this key.
insert into public.app_roles (role, label, permissions) values
 ('admin',             'Admin',             '["mod:/","dashboard.view"]'::jsonb),
 ('nsm',               'NSM',               '["mod:/","calls.view"]'::jsonb),
 ('zoho_migration',    'Zoho Migration',    '["mod:/","masters.view"]'::jsonb),
 ('technical_support', 'Technical Support', '["mod:/","reports.view"]'::jsonb),
 ('rgm',               'Regional Manager',  '["mod:/","calls.view","calls.allot"]'::jsonb),
 ('rm',                'Reporting Manager', '["mod:/","calls.view"]'::jsonb),
 ('engineer',          'Field Engineer',    '["mod:/","calls.report"]'::jsonb),
 ('hotline',           'Hotline Engineer',  '["mod:/","calls.create"]'::jsonb),
 ('commercial',        'Commercial',        '["mod:/","cover.edit"]'::jsonb),
 -- NOT CONFIGURED. An empty array means the code defaults apply, and writing
 -- one key into it would switch that fallback off and take everything else
 -- away — so it must be left exactly as it is, even though its name is on the
 -- list of four.
 ('nsm_empty',         'NSM (unconfigured)', '[]'::jsonb)
on conflict (role) do update set label = excluded.label, permissions = excluded.permissions;

create temporary table before_209 as select role, permissions from public.app_roles;

-- Re-run it. On a live database the roles already exist when the bundle is
-- applied, so this is the order that actually happens — and it is the honest
-- check that the file is idempotent.
\i supabase/migrations/0209_how_rithi_functions_key.sql

\echo ''
\echo '--- 1. the four named roles hold the key ---'
select role, (permissions ? 'mod:/knowledge-base/how-it-works') as holds
  from public.app_roles
 where role in ('admin','nsm','zoho_migration','technical_support')
 order by role;

\echo ''
\echo '--- 2. NOBODY ELSE DOES — the half that "limit exposure" actually means ---'
select 'roles outside the four holding it' as check,
       coalesce(string_agg(role, ', ' order by role), 'none') as leaked
  from public.app_roles
 where permissions ? 'mod:/knowledge-base/how-it-works'
   and role not in ('admin','nsm','zoho_migration','technical_support');

\echo ''
\echo '--- 3. what each role already had is still there ---'
-- Merged, not overwritten: an administrator may have tuned any of these.
select 'roles that LOST a permission' as check,
       coalesce(string_agg(b.role, ', ' order by b.role), 'none') as lost
  from before_209 b
  join public.app_roles a on a.role = b.role
 where exists (
   select 1 from jsonb_array_elements_text(b.permissions) v
    where not (a.permissions ? v));

\echo ''
\echo '--- 4. nothing moved except the four ---'
select 'roles changed' as check,
       coalesce(string_agg(b.role, ', ' order by b.role), 'none') as changed
  from before_209 b
  join public.app_roles a on a.role = b.role
 where a.permissions is distinct from b.permissions
   and b.role not in ('admin','nsm','zoho_migration','technical_support');

\echo ''
\echo '--- 5. an UNCONFIGURED role is left unconfigured: should_be_0 ---'
select jsonb_array_length(permissions) as should_be_0
  from public.app_roles where role = 'nsm_empty';

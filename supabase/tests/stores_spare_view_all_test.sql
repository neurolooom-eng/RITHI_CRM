-- ===========================================================================
-- STORES INCHARGE AND SPARE COORDINATOR SEE EVERY ROW (0213).
--
--   The user, 2026-09-18: "data.view_all --- Stores In Charge, Spare
--   Co-ordinator should be able to view all Rows."
--
-- THE NEGATIVES ARE THE WHOLE POINT HERE. The user's standing rule is that
-- Regional Manager, Reporting Manager and Engineer are as they set them, so a
-- grant that reaches a fourth role is a worse failure than one that reaches
-- none. Every assertion below that matters is about what did NOT change.
--
-- Run ONCE after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.app_roles where role in
  ('stores_incharge','spare_coordinator','rgm','rm','engineer','commercial','vp_zero');

insert into public.app_roles (role, label, permissions) values
 ('stores_incharge',  'Stores Incharge',   '["calls.view","spare.dispatch"]'::jsonb),
 ('spare_coordinator','Spare Coordinator', '["calls.view","consumption.reconcile"]'::jsonb),
 -- The three the user said never to touch.
 ('rgm',      'Regional Manager',  '["calls.view","spare.approve_rm"]'::jsonb),
 ('rm',       'Reporting Manager', '["calls.view","spare.approve_rm"]'::jsonb),
 ('engineer', 'Engineer',          '["calls.view","calls.report"]'::jsonb),
 -- Named in the same message as a MODULE being worked on, not as a role to
 -- grant. It must not pick the permission up by association.
 ('commercial','Commercial',       '["calls.view","spare.approve_commercial"]'::jsonb),
 -- Not configured: the fallback must stay on.
 ('vp_zero',  'Zero Permissions',  '[]'::jsonb);

-- THE MIGRATION IS RE-RUN HERE, AFTER the fixtures, and that is not a detail.
-- Suites run once every migration is already applied, so the inserts above
-- REPLACE the rows 0213 had already granted — and the first version of this
-- file asserted against those replacements and reported "(none) hold it",
-- which reads as a broken migration and was a broken TEST. It is idempotent,
-- so re-running it is exactly what the live project does.
\i supabase/migrations/0213_stores_and_spare_coordinator_see_all.sql

\echo ''
\echo '--- 1. the two named roles get it ---'
select 'stores_incharge' as role,
       (permissions ? 'data.view_all')::text as should_be_true
  from public.app_roles where role = 'stores_incharge';
select 'spare_coordinator' as role,
       (permissions ? 'data.view_all')::text as should_be_true
  from public.app_roles where role = 'spare_coordinator';

\echo ''
\echo '--- 2. ...WITHOUT losing what they already had (merge, never overwrite) ---'
select 'stores_incharge keeps spare.dispatch' as check,
       (permissions ? 'spare.dispatch')::text as should_be_true
  from public.app_roles where role = 'stores_incharge';
select 'spare_coordinator keeps consumption.reconcile' as check,
       (permissions ? 'consumption.reconcile')::text as should_be_true
  from public.app_roles where role = 'spare_coordinator';

\echo ''
\echo '--- 3. AND NOBODY ELSE GOT IT. The user: never touch those roles. ---'
select 'roles holding data.view_all' as check,
       coalesce(string_agg(role, ', ' order by role), '(none)')
         as should_be_only_the_two
  from public.app_roles
 where permissions ? 'data.view_all'
   and role in ('rgm','rm','engineer','commercial','vp_zero',
                'stores_incharge','spare_coordinator');

select 'Regional Manager is untouched' as check,
       permissions::text as should_be_calls_view_and_approve_rm
  from public.app_roles where role = 'rgm';
select 'Reporting Manager is untouched' as check,
       permissions::text as should_be_calls_view_and_approve_rm
  from public.app_roles where role = 'rm';
select 'Engineer is untouched' as check,
       permissions::text as should_be_calls_view_and_report
  from public.app_roles where role = 'engineer';
select 'Commercial is untouched' as check,
       permissions::text as should_be_calls_view_and_approve_commercial
  from public.app_roles where role = 'commercial';

\echo ''
\echo '--- 4. a role with ZERO permissions is left empty, so the fallback stays on ---'
select 'not-configured role' as check,
       jsonb_array_length(permissions)::text as should_be_0
  from public.app_roles where role = 'vp_zero';

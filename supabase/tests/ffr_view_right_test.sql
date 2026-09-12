-- ===========================================================================
-- READING THE FIELD FAILURE REGISTER IS ITS OWN RIGHT (0176).
--
--   Reported from use: a role holding `ffr.manage` and the page key opened the
--   register and it was EMPTY. `ffr_read` (0165) tested neither permission — it
--   scoped the register to CALL visibility, so `ffr.manage` granted the right to
--   WRITE a register its holder could not READ.
--   `ffr.view` now grants the whole register. It WIDENS NOTHING on apply: only
--   roles that already held ffr.manage are given it, and everyone else sees
--   exactly what they saw before.
--   The old scope is KEPT: a report on your own call is still yours to read
--   without being granted anything.
--   And the update log follows the register, or somebody could read a report
--   and not what changed on it.
--
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- A role derived from the app: the page key and ffr.manage, nothing that grants
-- wide call visibility. Exactly the shape that was reported.
insert into public.app_roles (role, label, permissions) values
 ('vptechnical', 'VP Technical',
  '["mod:/failure-report","calls.view","reports.view","ffr.manage"]'::jsonb),
 ('deskonly', 'Desk Only', '["mod:/failure-report","calls.view"]'::jsonb)
on conflict (role) do update set label = excluded.label, permissions = excluded.permissions;

insert into auth.users (id,email) values
 ('aa000000-0000-0000-0000-000000000001','vp@x.com'),
 ('aa000000-0000-0000-0000-000000000002','eng@x.com'),
 ('aa000000-0000-0000-0000-000000000003','desk@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('aa000000-0000-0000-0000-000000000001','vp@x.com','VP Person','vptechnical'),
 ('aa000000-0000-0000-0000-000000000002','eng@x.com','Own Engineer','engineer'),
 ('aa000000-0000-0000-0000-000000000003','desk@x.com','Desk Person','deskonly')
on conflict (id) do update set role = excluded.role;
insert into public.user_directory (name, email, role) values
 ('VP Person','vp@x.com','vptechnical'),
 ('Own Engineer','eng@x.com','engineer'),
 ('Desk Person','desk@x.com','deskonly')
on conflict do nothing;

-- Two calls: one the engineer owns, one belonging to nobody in this test.
insert into public.field_calls (ucn, call_number, call_type, party_name, product_name, allocated_to, reg_date)
values ('F-OWN-1','CN-OWN-1','Field Call','Hospital A','MONNAL T75','Own Engineer', current_date),
       ('F-FAR-1','CN-FAR-1','Field Call','Hospital B','MONNAL T60','Somebody Else', current_date);
insert into public.field_failure_reports (ffr_no, source, ucn, ffr_date, customer_name, problem_reported)
values ('FFR - 600/26','PC','F-OWN-1', current_date, 'Hospital A', 'alarm'),
       ('FFR - 601/26','PC','F-FAR-1', current_date, 'Hospital B', 'no power');

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo ''
\echo '--- 1. ffr.manage alone no longer means an empty register ---'
-- THE MIGRATION IS RE-RUN HERE, and that is the point rather than a fudge: on a
-- live database the roles ALREADY EXIST when the bundle is applied, so the
-- grant sees them. Seeding them above and asserting without re-running would
-- test an order that never happens — and the first version of this test did
-- exactly that and reported a failure of its own making.
-- (It is also the honest check that the file is idempotent.)
\i supabase/migrations/0176_ffr_view_right.sql
\i supabase/migrations/0177_ffr_history_view_right.sql

call public.be('vp@x.com');
set role authenticated;
select public.has_perm('ffr.manage') as manage,
       public.has_perm('ffr.view')   as view,
       public.can_view_all_calls()   as sees_all_calls;
select count(*) as should_be_2 from public.field_failure_reports;
reset role;

\echo ''
\echo '--- 2. the PAGE KEY alone still shows nothing — it is not a data right ---'
-- The point the report turned on: opening the screen and reading the rows are
-- different things, and only the second is governed by RLS.
call public.be('desk@x.com');
set role authenticated;
select public.has_perm('mod:/failure-report') as can_open_the_page,
       public.has_perm('ffr.view')            as view;
select count(*) as should_be_0 from public.field_failure_reports;
reset role;

\echo ''
\echo '--- 3. the OLD SCOPE is kept: your own call is still yours to read ---'
call public.be('eng@x.com');
set role authenticated;
select public.has_perm('ffr.view') as view_not_granted;
select ffr_no as should_be_only_the_own_call from public.field_failure_reports;
reset role;

\echo ''
\echo '--- 4. granting ffr.view opens the whole register ---'
update public.app_roles
   set permissions = permissions || '["ffr.view"]'::jsonb
 where role = 'deskonly';
call public.be('desk@x.com');
set role authenticated;
select count(*) as should_be_2 from public.field_failure_reports;
select count(*) as register_view_should_be_2 from public.field_failure_register;
reset role;

\echo ''
\echo '--- 5. …and taking it away closes it again ---'
update public.app_roles
   set permissions = (select coalesce(jsonb_agg(v), '[]'::jsonb)
                        from jsonb_array_elements(permissions) v
                       where v <> '"ffr.view"'::jsonb)
 where role = 'deskonly';
call public.be('desk@x.com');
set role authenticated;
select count(*) as should_be_0 from public.field_failure_reports;
reset role;

\echo ''
\echo '--- 6. the UPDATE LOG follows the register, not ffr.manage alone ---'
update public.field_failure_reports set problem_status = 'Under investigation' where ffr_no = 'FFR - 601/26';
update public.app_roles set permissions = permissions || '["ffr.view"]'::jsonb where role = 'deskonly';
call public.be('desk@x.com');
set role authenticated;
-- Holds ffr.view and NOT ffr.manage: it may read a report, so it may read what
-- changed on one.
select public.has_perm('ffr.manage') as manage_not_held,
       (select count(*) from public.ffr_history where action = 'update') as history_rows;
reset role;

\echo ''
\echo '--- 7. somebody with neither right reads no history ---'
call public.be('eng@x.com');
set role authenticated;
select count(*) as should_be_0 from public.ffr_history;
reset role;

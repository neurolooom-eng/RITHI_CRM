-- ===========================================================================
-- A BLANK NAME IS NOT A MANAGER (0212).
--
--   The user, 2026-09-18: "Why is a Regional Manager able to see everyone's
--   call and every spare request?"
--
-- `visible_engineer_names()` matched manager-to-name with nothing excluding the
-- empty string, so a caller whose own directory row had a blank `name` pulled
-- in every row with no manager recorded — and LOST their own team at the same
-- time, because the root no longer matched the people naming them.
--
-- THE NEGATIVE IS THE POINT. A fix that narrows is easy to get right for the
-- broken case and wrong for the working one, and the working one is everybody.
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- The directory guard refuses writes from anybody who is not an admin, and the
-- fixture is not one. It is switched off around the SETUP only — what is under
-- test is the read function, not the guard.
delete from public.user_directory where email like '%@vdir.test';
alter table public.user_directory disable trigger user_directory_address_guard;
insert into public.user_directory (name, email, reporting_manager, regional_manager) values
 ('THE RGM',    'rgm@vdir.test', '',             ''),
 ('OWN ONE',    'o1@vdir.test',  'THE RGM',      'THE RGM'),
 ('OWN TWO',    'o2@vdir.test',  'THE RGM',      ''),
 ('OWN THREE',  'o3@vdir.test',  '',             'THE RGM'),
 ('STRANGER A', 'sa@vdir.test',  '',             ''),
 ('STRANGER B', 'sb@vdir.test',  NULL,           NULL),
 ('STRANGER C', 'sc@vdir.test',  'SOMEBODY ELSE','SOMEBODY ELSE');
alter table public.user_directory enable trigger user_directory_address_guard;

insert into auth.users (id, email) values
 ('ff000000-0000-0000-0000-00000000cd01','rgm@vdir.test') on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
 ('ff000000-0000-0000-0000-00000000cd01','rgm@vdir.test','THE RGM','rgm')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

update public.harness set uid = 'ff000000-0000-0000-0000-00000000cd01', email = 'rgm@vdir.test';

\echo ''
\echo '--- 1. with a name, the manager sees THEIR OWN TEAM and nobody else ---'
select 'his team' as check, string_agg(n, ', ' order by n) as should_be_OWN_ONE_TWO_THREE_and_himself
  from public.visible_engineer_names() n;
select 'no stranger is in it' as check,
       (not exists (select 1 from public.visible_engineer_names() n where n like 'STRANGER%'))::text
         as should_be_true;

\echo ''
\echo '--- 2. BLANK HIS DIRECTORY NAME — the shape a partial import leaves ---'
alter table public.user_directory disable trigger user_directory_address_guard;
update public.user_directory set name = '' where email = 'rgm@vdir.test';
alter table public.user_directory enable trigger user_directory_address_guard;

select 'a blank name sees nobody, rather than every unmanaged row' as check,
       coalesce(nullif(string_agg(n, ', ' order by n), ''), '(nobody)') as should_be_nobody
  from public.visible_engineer_names() n;
-- BEFORE 0212 this returned OWN TWO, OWN THREE, STRANGER A, STRANGER B: two
-- strangers in and one of his own out. Both halves mattered.
select 'specifically, no stranger leaked' as check,
       (not exists (select 1 from public.visible_engineer_names() n where n like 'STRANGER%'))::text
         as should_be_true;

\echo ''
\echo '--- 3. ...and restoring the name restores exactly the original team ---'
alter table public.user_directory disable trigger user_directory_address_guard;
update public.user_directory set name = 'THE RGM' where email = 'rgm@vdir.test';
alter table public.user_directory enable trigger user_directory_address_guard;
select 'the team is back, unchanged' as check, string_agg(n, ', ' order by n) as should_be_the_same_four
  from public.visible_engineer_names() n;

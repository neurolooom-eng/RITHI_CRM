-- ===========================================================================
-- Whose calls a manager can read (0092 + can_see_call).
--   The User Master is matched on the signed-in address, and FAILING THAT on
--   the name from the caller's own profile — a Reporting Manager whose address
--   in the User Master has gone stale still gets their team, which is what the
--   screen was already claiming while the database returned nothing.
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id,email) values
 ('55555555-5555-5555-5555-555555555555','harsh.rajput@airliquide.com'),
 ('66666666-6666-6666-6666-666666666666','anuj@airliquide.com');
insert into public.profiles (id,email,full_name,role) values
 ('55555555-5555-5555-5555-555555555555','harsh.rajput@airliquide.com','HARSH VARDHAN SINGH RAJPUT','rm'),
 ('66666666-6666-6666-6666-666666666666','anuj@airliquide.com','ANUJ KUMAR','engineer');
-- the User Master holds a DIFFERENT address for Harsh — the one he no longer uses
insert into public.user_directory (name, email, reporting_manager) values
 ('HARSH VARDHAN SINGH RAJPUT','h.rajput@old-domain.com',''),
 ('ANUJ KUMAR','anuj@airliquide.com','HARSH VARDHAN SINGH RAJPUT'),
 ('MEGHANATH','megha@airliquide.com','HARSH VARDHAN SINGH RAJPUT'),
 ('SOMEONE ELSE','else@airliquide.com','ANOTHER MANAGER');
update public.harness set uid='55555555-5555-5555-5555-555555555555', email='harsh.rajput@airliquide.com';

\echo '--- 1. the address in the User Master is stale; the NAME still finds his team ---'
select count(*) as engineers from public.visible_engineer_names();
select n from public.visible_engineer_names() as v(n) order by 1;

\echo '--- 2. so he can read his team''s calls, and not another team''s ---'
select public.can_see_call('ANUJ KUMAR')   as own_team,
       public.can_see_call('MEGHANATH')    as own_team_2,
       public.can_see_call('SOMEONE ELSE') as other_team,
       public.can_see_call('')             as unallocated;

\echo '--- 3. when the address DOES match, nothing changes: still his own team ---'
-- (as an administrator: the directory is theirs to edit)
insert into auth.users (id,email) values ('77777777-7777-7777-7777-777777777777','admin@x.com');
insert into public.profiles (id,email,full_name,role) values ('77777777-7777-7777-7777-777777777777','admin@x.com','Admin','admin');
update public.harness set uid='77777777-7777-7777-7777-777777777777', email='admin@x.com';
update public.user_directory set email = 'harsh.rajput@airliquide.com'
 where name = 'HARSH VARDHAN SINGH RAJPUT';
update public.harness set uid='55555555-5555-5555-5555-555555555555', email='harsh.rajput@airliquide.com';
select count(*) as engineers from public.visible_engineer_names();

\echo '--- 4. an engineer is still only themselves ---'
update public.harness set uid='66666666-6666-6666-6666-666666666666', email='anuj@airliquide.com';
select n from public.visible_engineer_names() as v(n) order by 1;
select public.can_see_call('MEGHANATH') as someone_elses_call;

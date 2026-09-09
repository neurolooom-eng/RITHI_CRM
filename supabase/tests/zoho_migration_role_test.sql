-- ===========================================================================
-- ZOHO MIGRATION (0155) — Technical Support's twin.
--
-- What this suite guards:
--   * it is a CLONE: it holds everything technical_support holds, so the two
--     cannot drift into different answers to "what can this login see?";
--   * it is READ-ONLY, and by the only mechanism that counts — it holds none
--     of the actions a write policy names, so the refusal is Postgres's;
--   * a MERGE, so an administrator's own tick survives a replay;
--   * it reads every call, which is the whole point of a migration login.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('20000000-0000-0000-0000-000000000001','zoho@x.com') on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('20000000-0000-0000-0000-000000000001','zoho@x.com','Zoho Migration','zoho_migration')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo '--- 1. IT IS A CLONE: nothing technical_support holds is missing ---'
\echo 'expect: 0. Any row here is drift between the two, which is the thing'
\echo 'deriving from the stored row was meant to make impossible.'
with ts as (select jsonb_array_elements_text(permissions) v from public.app_roles where role='technical_support'),
     zm as (select jsonb_array_elements_text(permissions) v from public.app_roles where role='zoho_migration')
select count(*) as missing_from_zoho from (select v from ts except select v from zm) x;

\echo '--- 2. THE SUB-PAGES ARE TICKED, not merely inherited ---'
\echo 'expect: 3 report sub-pages, and one key per master value list.'
select count(*) filter (where v like 'mod:/exports/%')  as report_subpages,
       count(*) filter (where v like 'mod:/masters/%')  as master_subpages
  from (select jsonb_array_elements_text(permissions) v from public.app_roles where role='zoho_migration') x;

\echo '--- 3. READ ONLY — it holds no action any write policy names ---'
\echo 'expect: 0. This is what makes it read-only; nothing is hidden from it.'
with zm as (select jsonb_array_elements_text(permissions) v from public.app_roles where role='zoho_migration')
select count(*) as write_actions_held from zm
 where v in ('calls.edit','calls.create','calls.allot','calls.report','calls.cancel',
             'masters.edit','users.manage','rbac.manage','spare.dispatch','spare.request',
             'spare.drop','stock.transfer','stock.return','consumption.reconcile',
             'ownership.transfer','cover.edit','review.edit','docs.manage','install.create',
             'pending.register','config.manage');

\echo '--- 4. ...and the database agrees, signed in as that role ---'
\echo 'expect: view t, export t, view_all t, and every write f'
call public.be('zoho@x.com');
begin;
  set local role authenticated;
  select has_perm('calls.view')      as calls_view,
         has_perm('export.data')     as may_export,
         has_perm('data.view_all')   as sees_all,
         has_perm('calls.edit')      as calls_edit,
         has_perm('masters.edit')    as masters_edit,
         has_perm('users.manage')    as users_manage;
commit;

\echo '--- 5. it cannot write, and the refusal comes from the DATABASE ---'
call public.be('zoho@x.com');
begin;
  set local role authenticated;
  \echo 'expect ERROR: row-level security (no masters.edit)'
  insert into public.masters (name, value) values ('calltype', 'ZOHO SHOULD NOT WRITE');
rollback;

\echo '--- 6. A MERGE: an administrator''s own tick survives a replay ---'
\echo 'expect: t — the hand-added key is still there after 0155 runs again'
update public.app_roles
   set permissions = permissions || '["zz.hand.added"]'::jsonb
 where role = 'zoho_migration';
\i supabase/migrations/0155_zoho_migration_role.sql
select (permissions ? 'zz.hand.added') as hand_tick_survived
  from public.app_roles where role = 'zoho_migration';

\echo '--- 7. cleanup ---'
call public.be(null);
update public.app_roles set permissions = permissions - 'zz.hand.added' where role = 'zoho_migration';
delete from public.profiles where email = 'zoho@x.com';

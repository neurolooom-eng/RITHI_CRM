-- ===========================================================================
-- THE FEEDBACK UPLOAD MUST SURVIVE A COLLIDING ROW.
--
-- Reported from use, 2026-09-14, once the key from 0186/0188 was finally live:
--
--     Your role does not have permission for this action. (row ~24093)
--     (24092 written before it stopped.)
--
-- 24,092 rows inserted, then one COLLIDED, the upsert became an UPDATE, and
-- `public.feedback` had no UPDATE policy — 0001 gave it a read and an insert,
-- 0008 narrowed those two to rights, and nothing ever updated a feedback row
-- until the key existed.
--
-- Giving a table a CONFLICT TARGET changes which policy the importer needs, and
-- the gap only shows at the one moment an upsert earns its keep: the re-load.
-- So this test does what the importer does -- ON CONFLICT DO UPDATE, as an
-- ordinary signed-in user, on a row that is already there.
--
-- Run AFTER _stub.sql + every migration.
-- The only errors printed are the ones labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
 ('ac000000-0000-0000-0000-000000000001','fbuser@x.com'),
 ('ac000000-0000-0000-0000-000000000002','nobody@x.com') on conflict do nothing;
insert into public.app_roles (role, label, permissions) values
 ('fbfiler', 'Feedback Filer', '["calls.report"]'::jsonb),
 ('fbnone',  'No Feedback',    '["mod:/settings"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;
insert into public.profiles (id, email, full_name, role) values
 ('ac000000-0000-0000-0000-000000000001','fbuser@x.com','Feedback Filer','fbfiler'),
 ('ac000000-0000-0000-0000-000000000002','nobody@x.com','No Rights','fbnone')
on conflict (id) do update set role = excluded.role;

create or replace procedure public.be_fb(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

delete from public.feedback where ucn like 'FBT-%';

\echo
\echo '--- 1. the first load INSERTS, as it always could ---'
call public.be_fb('fbuser@x.com');
set role authenticated;
insert into public.feedback (ucn, answers)
values ('FBT-1', '{"round":"first"}'::jsonb)
on conflict (ucn_key) do update set answers = excluded.answers;
select count(*) = 1 as "one feedback filed" from public.feedback where ucn = 'FBT-1';
reset role;

\echo
\echo '--- 2. THE RE-LOAD. The same UCN again: this is what stopped at row 24093 ---'
-- Before 0189 this raised "new row violates row-level security policy" — an
-- UPDATE with no UPDATE policy is refused outright, whatever the caller holds.
call public.be_fb('fbuser@x.com');
set role authenticated;
insert into public.feedback (ucn, answers)
values ('FBT-1', '{"round":"second"}'::jsonb)
on conflict (ucn_key) do update set answers = excluded.answers;
reset role;

select count(*) = 1 as "still ONE row -- the key held"
  from public.feedback where ucn = 'FBT-1';
select answers->>'round' = 'second' as "and the LATER feedback replaced the earlier one"
  from public.feedback where ucn = 'FBT-1';

\echo
\echo '--- 3. it grants nobody new reach: without the right, still refused (expect ERROR) ---'
-- fb_update copies fb_write's audience verbatim. Somebody who could not file a
-- feedback still cannot correct one.
call public.be_fb('nobody@x.com');
set role authenticated;
insert into public.feedback (ucn, answers)             -- expect ERROR: no right to file
values ('FBT-1', '{"round":"third"}'::jsonb)
on conflict (ucn_key) do update set answers = excluded.answers;
reset role;
select answers->>'round' = 'second' as "the row is untouched by somebody with no right"
  from public.feedback where ucn = 'FBT-1';

\echo
\echo '--- 4. a BATCH with a repeat inside it, which is what the export carries ---'
-- 24,749 rows and 24,748 distinct UC Numbers: the file repeats one UCN, so even
-- a first load has to update mid-batch.
call public.be_fb('fbuser@x.com');
set role authenticated;
insert into public.feedback (ucn, answers) values
  ('FBT-2', '{"n":1}'::jsonb), ('FBT-3', '{"n":1}'::jsonb), ('FBT-4', '{"n":1}'::jsonb)
on conflict (ucn_key) do update set answers = excluded.answers;
insert into public.feedback (ucn, answers) values
  ('FBT-3', '{"n":2}'::jsonb), ('FBT-5', '{"n":1}'::jsonb)
on conflict (ucn_key) do update set answers = excluded.answers;
reset role;
select count(*) = 4 as "four distinct UCNs from five rows"
  from public.feedback where ucn like 'FBT-%' and ucn <> 'FBT-1';
select answers->>'n' = '2' as "and the repeat was corrected, not duplicated"
  from public.feedback where ucn = 'FBT-3';

delete from public.feedback where ucn like 'FBT-%';
\echo
\echo '-- done --'

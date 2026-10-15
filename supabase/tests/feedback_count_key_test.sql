-- ===========================================================================
-- A SECOND FEEDBACK ON ONE CALL IS KEPT UNDER ITS COUNTED KEY (0445).
--
-- The user, 2026-10-15, on a Visit Entry for 25L01P0232 that answered "the
-- customer feedback was not: duplicate key value violates unique constraint
-- feedback_ucn_key_uniq": "For feedback it is ok to overwrite or duplicate.
-- If it's a duplicate -- add the count along with the key so it becomes
-- unique."
--
-- Run AFTER _stub.sql + every migration.
-- The only errors printed are the ones labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
 ('ad000000-0000-0000-0000-000000000001','fbc1@x.com'),
 ('ad000000-0000-0000-0000-000000000002','fbc2@x.com') on conflict do nothing;
insert into public.app_roles (role, label, permissions) values
 ('fbcfiler', 'Feedback Filer', '["calls.report"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;
insert into public.profiles (id, email, full_name, role) values
 ('ad000000-0000-0000-0000-000000000001','fbc1@x.com','Filer One','fbcfiler'),
 ('ad000000-0000-0000-0000-000000000002','fbc2@x.com','Filer Two','fbcfiler')
on conflict (id) do update set role = excluded.role;

create or replace procedure public.be_fbc(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

delete from public.feedback where ucn like 'FBC-%';

\echo
\echo '--- 1. the first feedback from the Visit Entry form takes the call''s own key ---'
call public.be_fbc('fbc1@x.com');
set role authenticated;
insert into public.feedback (ucn_key, ucn, engineer_email, answers)
values ('FBC-1', 'FBC-1', 'fbc1@x.com', '{"round":"first"}'::jsonb);
reset role;
select ucn_key = 'fbc-1' as "first feedback keyed fbc-1" from public.feedback where ucn = 'FBC-1';

\echo
\echo '--- 2. THE REPORTED CASE: solved again, a second feedback -- kept as fbc-1-2 ---'
-- Saved by a DIFFERENT engineer, who may not be able to read the first one:
-- the key is still counted past it.
call public.be_fbc('fbc2@x.com');
set role authenticated;
insert into public.feedback (ucn_key, ucn, engineer_email, answers)
values ('FBC-1', 'FBC-1', 'fbc2@x.com', '{"round":"second"}'::jsonb);
insert into public.feedback (ucn_key, ucn, engineer_email, answers)
values ('anything', 'FBC-1', 'fbc2@x.com', '{"round":"third"}'::jsonb);
reset role;
select string_agg(ucn_key, ',' order by id) = 'fbc-1,fbc-1-2,fbc-1-3'
       as "three feedbacks: fbc-1, fbc-1-2, fbc-1-3"
  from public.feedback where ucn = 'FBC-1';
select (select answers->>'round' from public.feedback where ucn_key = 'fbc-1') = 'first'
       as "the first feedback is unchanged";

\echo
\echo '--- 3. THE UPLOAD STILL OVERWRITES: no key sent, ON CONFLICT (ucn_key) ---'
call public.be_fbc('fbc1@x.com');
set role authenticated;
insert into public.feedback (ucn, answers)
values ('FBC-1', '{"round":"reloaded"}'::jsonb)
on conflict (ucn_key) do update set answers = excluded.answers;
reset role;
select count(*) = 3 as "still three -- a re-load adds nothing" from public.feedback where ucn = 'FBC-1';
select (select answers->>'round' from public.feedback where ucn_key = 'fbc-1') = 'reloaded'
       as "the re-load corrected the call's own feedback";

\echo
\echo '--- 4. a plain insert with no key is still refused (one row per key) ---'
\echo '    expect ERROR below -- duplicate key on feedback_ucn_key_uniq'
insert into public.feedback (ucn, answers) values ('FBC-1', '{}'::jsonb);

\echo
\echo '--- 5. an edit cannot move the key; a UCN corrected to another call follows it ---'
update public.feedback set ucn_key = 'hijack', answers = '{"round":"edited"}'::jsonb where ucn_key = 'fbc-1-3';
select exists (select 1 from public.feedback where ucn_key = 'fbc-1-3' and answers->>'round' = 'edited')
       as "an edit keeps the key";
update public.feedback set ucn = 'FBC-1' where ucn_key = 'fbc-1-3';
select exists (select 1 from public.feedback where ucn_key = 'fbc-1-3') as "same UCN, same key";
insert into public.feedback (ucn, answers) values ('FBC-2', '{}'::jsonb);
update public.feedback set ucn = 'FBC-2' where ucn_key = 'fbc-1-3';
select exists (select 1 from public.feedback where ucn = 'FBC-2' and ucn_key = 'fbc-2-2')
       as "moved to FBC-2, which had one, so fbc-2-2";

\echo
\echo '--- 6. a blank UCN still keys off its own row ---'
insert into public.feedback (ucn_key, ucn, answers) values ('x', '', '{}'::jsonb), (null, null, '{}'::jsonb);
select count(*) = 2 as "two blank-UCN rows, both keyed row-<id>"
  from public.feedback where coalesce(btrim(ucn), '') = '' and ucn_key = 'row-' || id;

\echo
\echo '--- 7. the column is no longer generated, and the trigger function is not callable ---'
select not exists (select 1 from pg_attribute where attrelid = 'public.feedback'::regclass
                    and attname = 'ucn_key' and attgenerated = 's') as "ucn_key is an ordinary column";
select not has_function_privilege('anon', 'public.feedback_key_stamp()', 'execute')
   and not has_function_privilege('authenticated', 'public.feedback_key_stamp()', 'execute')
       as "feedback_key_stamp() locked down";

-- ===========================================================================
-- A USER'S SAVED SIGNATURE (0172), and the back-fill's gate (0170).
--
--   A signature is READ and WRITTEN by its owner and by NOBODY else — an
--   administrator included. That is the whole security property: a mark a
--   second person can obtain is one they can put on anything, and a mark a
--   second person can SET is one nobody signed.
--   An administrator may DELETE one (a leaver), and may ask WHO has saved one
--   without ever seeing an image.
--   The owner cannot be forged: user_id is taken from the session, so a row
--   inserted naming somebody else lands under the inserter.
--
--   And 0170: backfill_ffrs() must refuse a signed-in NON-administrator, and
--   must NOT refuse the SQL editor, where auth.uid() is null and 0169's gate
--   locked the administrator out of the only place it is ever run.
--
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('51900000-0000-0000-0000-000000000001','sig_admin@x.com'),
 ('51900000-0000-0000-0000-000000000002','sig_eng@x.com'),
 ('51900000-0000-0000-0000-000000000003','sig_other@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('51900000-0000-0000-0000-000000000001','sig_admin@x.com','Sig Admin','admin'),
 ('51900000-0000-0000-0000-000000000002','sig_eng@x.com','Sig Engineer','engineer'),
 ('51900000-0000-0000-0000-000000000003','sig_other@x.com','Sig Other','engineer')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo ''
\echo '--- 1. the owner saves their own signature ---'
call public.be('sig_eng@x.com');
set role authenticated;
insert into public.user_signatures (user_id, signature, name_line, title_line)
values ('51900000-0000-0000-0000-000000000002', 'data:image/png;base64,ENGINEER-INK', 'Sig Engineer', 'Service Engineer');
-- 1 row, and it is theirs.
select count(*) as should_be_1, max(name_line) as should_be_sig_engineer
  from public.user_signatures;
reset role;

\echo ''
\echo '--- 2. ANOTHER ENGINEER cannot read it: 0 rows, not an error ---'
call public.be('sig_other@x.com');
set role authenticated;
-- The important assertion of the whole file. A policy that returns the row
-- would fail here silently if this only counted "no error".
select count(*) as should_be_0 from public.user_signatures
 where user_id = '51900000-0000-0000-0000-000000000002';
select coalesce(max(signature), '(nothing visible)') as should_be_nothing_visible
  from public.user_signatures where user_id = '51900000-0000-0000-0000-000000000002';
reset role;

\echo ''
\echo '--- 3. AN ADMINISTRATOR cannot read it either — deliberately ---'
call public.be('sig_admin@x.com');
set role authenticated;
select count(*) as should_be_0 from public.user_signatures
 where user_id = '51900000-0000-0000-0000-000000000002';
reset role;

\echo ''
\echo '--- 4. nobody can WRITE somebody else''s signature ---'
call public.be('sig_other@x.com');
set role authenticated;
-- The UPDATE does not error, it matches no row — which is the same protection
-- and is why this asserts the INK IS UNCHANGED rather than "no error".
update public.user_signatures set signature = 'data:image/png;base64,FORGED'
 where user_id = '51900000-0000-0000-0000-000000000002';
reset role;
call public.be('sig_eng@x.com');
set role authenticated;
select signature as should_still_be_engineer_ink from public.user_signatures
 where user_id = '51900000-0000-0000-0000-000000000002';
reset role;

\echo ''
\echo '--- 5. an INSERT naming somebody else lands under the inserter ---'
call public.be('sig_other@x.com');
set role authenticated;
insert into public.user_signatures (user_id, signature, name_line)
values ('51900000-0000-0000-0000-000000000002', 'data:image/png;base64,IMPOSTOR', 'Sig Engineer');
-- The trigger overwrote user_id with the session's, so this is Other's own row
-- and Other sees exactly one: their own.
select count(*) as should_be_1, max(name_line) as name_they_typed
  from public.user_signatures;
select user_id as should_be_sig_other from public.user_signatures;
reset role;
-- …and the engineer's ink is still the engineer's.
call public.be('sig_eng@x.com');
set role authenticated;
select signature as should_still_be_engineer_ink from public.user_signatures;
reset role;

\echo ''
\echo '--- 6. WHO has saved one: an administrator may ask, and sees no ink ---'
call public.be('sig_admin@x.com');
set role authenticated;
select full_name, has_signature from public.user_signature_status()
 where full_name like 'Sig %' order by full_name;
reset role;

\echo ''
\echo '--- 7. …and an ENGINEER may not (expect ERROR) ---'
call public.be('sig_eng@x.com');
set role authenticated;
select * from public.user_signature_status();
reset role;

\echo ''
\echo '--- 8a. an administrator CANNOT reach it with a plain DELETE ---'
-- Not a gap: PostgreSQL applies the SELECT policy to a DELETE that has to find
-- the row, so an administrator who cannot read it cannot delete it. This is
-- asserted rather than assumed, because the first version of the policy said
-- `or is_admin()` and reported DELETE 0 — a permission that looked granted and
-- was not.
call public.be('sig_admin@x.com');
set role authenticated;
delete from public.user_signatures where user_id = '51900000-0000-0000-0000-000000000002';
reset role;
call public.be('sig_eng@x.com');
set role authenticated;
select count(*) as should_still_be_1 from public.user_signatures;
reset role;

\echo ''
\echo '--- 8b. …and an ENGINEER cannot use the removal function (expect ERROR) ---'
call public.be('sig_other@x.com');
set role authenticated;
select public.remove_user_signature('51900000-0000-0000-0000-000000000002');
reset role;

\echo ''
\echo '--- 8c. an administrator removes a leaver''s signature, and it is gone ---'
call public.be('sig_admin@x.com');
set role authenticated;
select public.remove_user_signature('51900000-0000-0000-0000-000000000002') as should_be_true;
-- Removing one that is not there is not an error, and says so.
select public.remove_user_signature('51900000-0000-0000-0000-000000000002') as should_be_false;
reset role;
call public.be('sig_eng@x.com');
set role authenticated;
select count(*) as should_be_0 from public.user_signatures;
reset role;

-- ===========================================================================
-- 0170 — the back-fill's gate.
-- ===========================================================================
\echo ''
\echo '--- 9. a signed-in ENGINEER is refused (expect ERROR) ---'
call public.be('sig_eng@x.com');
set role authenticated;
-- The API case: PostgREST sets request.jwt.claims on every request it serves.
-- SESSION-scoped (false), not transaction-scoped: psql autocommits every
-- statement, so `true` here would clear the claim before the next line and
-- the API case would never actually be tested. It was, first time round.
select set_config('request.jwt.claims', '{"sub":"51900000-0000-0000-0000-000000000002"}', false);
select * from public.backfill_ffrs();
reset role;

\echo ''
\echo '--- 10. a signed-in ADMINISTRATOR is allowed ---'
call public.be('sig_admin@x.com');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"51900000-0000-0000-0000-000000000001"}', false);
select count(*) as dry_run_rows_no_error from public.backfill_ffrs();
reset role;

\echo ''
\echo '--- 11. THE SQL EDITOR: no signed-in user, no jwt claim — allowed ---'
-- This is the case 0169 got wrong: is_admin() reads auth.uid(), which is null
-- here, so the gate refused the administrator typing the catch-up in. A
-- direct database connection already has every table; a role check inside one
-- guards nothing it could not step around by writing the INSERT itself.
call public.be('nobody@nowhere.invalid');            -- uid null
select set_config('request.jwt.claims', '', false);
select count(*) as sql_editor_rows_no_error from public.backfill_ffrs();

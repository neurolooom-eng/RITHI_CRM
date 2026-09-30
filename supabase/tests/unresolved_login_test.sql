-- ===========================================================================
-- A LOGIN NOBODY HAS SET UP HOLDS NOTHING (0300, 0301) -- D-074, FRS-210.5.
--
-- "Unresolved" is an Auth account with no profile row (and so no User Master
-- row it could have been built from). Before 0300, has_perm() answered for it
-- with the ENGINEER permissions: my_role() is NULL, no role row matches NULL,
-- and the fallback applied -- so it could raise a call request and a spare
-- request through the API. Measured on a database built without 0300.
--
-- FOUR CALLERS, because the fix must move exactly one of them:
--   1. the unknown login        -> FALSE everywhere (not NULL: see 0300)
--   2. an engineer with profile -> unchanged
--   3. a super admin, no profile -> still everything (matched by e-mail)
--   4. nobody signed in         -> unchanged, NULL semantics included
-- Each write is tried by the engineer FIRST, so a refusal of the unknown login
-- is the policy speaking, not a missing column.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0e700000-0000-0000-0000-000000000001', 'ghost@x.com'),
  ('0e700000-0000-0000-0000-000000000002', 'known-eng@x.com'),
  ('0e700000-0000-0000-0000-000000000003', 'service.almsind@gmail.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0e700000-0000-0000-0000-000000000002', 'known-eng@x.com', 'Known Eng', 'engineer')
on conflict do nothing;
-- The super admin's own profile is absent on purpose: case 3.
delete from public.profiles where id = '0e700000-0000-0000-0000-000000000003';

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;
grant select on public.harness to anon, authenticated;

\echo ''
\echo '--- 2 first: an engineer WITH a profile is unchanged ---'
call public.be('known-eng@x.com');
set role authenticated;
select 'engineer keeps the engineer permissions' as check,
       public.has_perm('request.create')::text as request_create_should_be_true,
       public.has_perm('spare.request')::text  as spare_request_should_be_true;
insert into public.kb_articles (title, body) values ('UL known', 'a known login may write one');
select 'engineer reads Field Solutions' as check, count(*)::text as should_be_1
  from public.kb_articles where title = 'UL known';
reset role;

\echo ''
\echo '--- 1. the UNKNOWN login: FALSE, not NULL, and every write refused ---'
call public.be('ghost@x.com');
set role authenticated;
select 'the unknown login holds nothing' as check,
       coalesce(public.has_perm('request.create')::text, 'NULL') as should_be_false,
       coalesce(public.has_perm('spare.request')::text,  'NULL') as should_be_false_2,
       coalesce(public.has_perm('calls.view')::text,     'NULL') as should_be_false_3,
       coalesce(public.has_perm('mod:/')::text,          'NULL') as should_be_false_4;
\echo 'expect ERROR: row-level security (a call request)'
insert into public.call_requests (serial_no) values ('UL-GHOST-1');
\echo 'expect ERROR: row-level security (a spare request)'
insert into public.spare_requests (engineer) values ('Ghost');
\echo 'expect ERROR: row-level security (a Field Solutions article)'
insert into public.kb_articles (title, body) values ('UL ghost', 'nobody set this login up');
select 'the unknown login reads no Field Solutions' as check, count(*)::text as should_be_0
  from public.kb_articles;
reset role;

\echo ''
\echo '--- 3. a super administrator with no profile keeps everything ---'
call public.be('service.almsind@gmail.com');
set role authenticated;
select 'super admin, no profile' as check,
       coalesce(public.has_perm('users.manage')::text, 'NULL') as should_be_true;
reset role;

\echo ''
\echo '--- 4. nobody signed in: exactly as before 0300 ---'
update public.harness set uid = null, email = null;
select 'no session' as check,
       coalesce(public.has_perm('request.create')::text, 'NULL') as engineer_key_should_be_true,
       coalesce(public.has_perm('users.manage')::text,   'NULL') as other_key_should_be_NULL;

delete from public.kb_articles where title like 'UL %';

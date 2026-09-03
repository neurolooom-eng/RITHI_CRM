-- Minimal stand-ins for the Supabase platform objects the migrations expect.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);

-- The "session" the harness impersonates.
create table if not exists public.harness (uid uuid, email text, admin boolean default false);
insert into public.harness values (null, null, false);

-- security definer: the real auth.uid()/auth.email() read a request GUC and need
-- no table rights, so the stand-ins must not need rights on `harness` either —
-- otherwise a trigger that stamps auth.uid() fails under `set role authenticated`.
create or replace function auth.uid() returns uuid language sql stable security definer as $$ select uid from public.harness limit 1 $$;
create or replace function auth.email() returns text language sql stable security definer as $$ select email from public.harness limit 1 $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;

-- Supabase grants `authenticated` and `anon` blanket DML on `public` and leaves
-- RLS as the gate; a migration only adds a grant for something it creates
-- outside that default (a view, say). Without the same default here, a test
-- running `set local role authenticated` fails on "permission denied for table
-- reports" — a harness artefact that says nothing about the policy under test.
-- Set BEFORE the migrations run so every table they create picks it up.
alter default privileges in schema public grant all on tables to authenticated, anon;
alter default privileges in schema public grant all on sequences to authenticated, anon;
grant usage on schema public to authenticated, anon;
-- Supabase grants the API roles USAGE on `auth` (that is how auth.uid() is
-- callable from a policy). Without it here, any policy that calls one of them
-- fails with "permission denied for schema auth" — a harness artefact that says
-- nothing about the policy under test.
grant usage on schema auth to authenticated, anon;

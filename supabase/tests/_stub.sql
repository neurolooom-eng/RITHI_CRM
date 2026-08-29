-- Minimal stand-ins for the Supabase platform objects the migrations expect.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);

-- The "session" the harness impersonates.
create table if not exists public.harness (uid uuid, email text, admin boolean default false);
insert into public.harness values (null, null, false);

create or replace function auth.uid() returns uuid language sql stable as $$ select uid from public.harness limit 1 $$;
create or replace function auth.email() returns text language sql stable as $$ select email from public.harness limit 1 $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;

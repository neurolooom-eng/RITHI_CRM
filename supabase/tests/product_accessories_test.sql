-- ===========================================================================
-- Main product -> accessories / allied products (0255).
--   Anyone signed in reads the lists; only masters.edit writes them.
--   ONE list per main product, however it is typed -- a re-save replaces it.
--   The not-signed-in role reaches nothing.
-- Run after _stub.sql + every migration. Only `expect ERROR` errors allowed.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('ac000000-0000-0000-0000-000000000001','pa_admin@x.com'),
 ('ac000000-0000-0000-0000-000000000002','pa_eng@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('ac000000-0000-0000-0000-000000000001','pa_admin@x.com','PA Admin','admin'),
 ('ac000000-0000-0000-0000-000000000002','pa_eng@x.com','PA Engineer','engineer')
on conflict (id) do update set role = excluded.role;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo '--- 1. an administrator saves ORION-G''s accessories ---'
call public.be('pa_admin@x.com');
begin;
  set local role authenticated;
  insert into public.product_accessories (main_product, accessories)
  values ('ORION-G', array['CPX CARE','HUMIDIFIER'])
  on conflict (main_product_key) do update set accessories = excluded.accessories;
commit;

\echo '--- 2. saving again under another spelling REPLACES the one list ---'
\echo 'expect: 1 row, accessories {CPX CARE}'
call public.be('pa_admin@x.com');
begin;
  set local role authenticated;
  insert into public.product_accessories (main_product, accessories)
  values (' orion-g ', array['CPX CARE'])
  on conflict (main_product_key) do update set accessories = excluded.accessories;
commit;
select count(*) as rows, max(array_to_string(accessories, ',')) as accessories
  from public.product_accessories where main_product_key = 'orion-g';

\echo '--- 3. an engineer READS the lists ---'
\echo 'expect: 1'
call public.be('pa_eng@x.com');
begin;
  set local role authenticated;
  select count(*) from public.product_accessories;
rollback;

\echo '--- 4. ...but cannot write one ---'
\echo 'expect ERROR: new row violates row-level security policy'
call public.be('pa_eng@x.com');
begin;
  set local role authenticated;
  insert into public.product_accessories (main_product, accessories) values ('VEGA', array['X']);
rollback;

\echo '--- 5. ...nor change one (RLS matches nothing) ---'
\echo 'expect: UPDATE 0'
call public.be('pa_eng@x.com');
begin;
  set local role authenticated;
  update public.product_accessories set accessories = '{}' where main_product_key = 'orion-g';
rollback;

\echo '--- 6. the not-signed-in role reaches nothing ---'
\echo 'expect ERROR: permission denied for table product_accessories'
begin;
  set local role anon;
  select count(*) from public.product_accessories;
rollback;

-- ===========================================================================
-- The engineer's delivery address (0029_engineer_address.sql).
--   The Declaration form addresses the parcel, so Address / City / State /
--   Contact live on the User Master row. Dispatch may correct those four —
--   and only those: the rest of the directory, which decides who can see
--   whose calls, stays admin-only.
-- Run after _stub.sql + every migration. Lines marked "expect ERROR" must fail.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id,email) values
 ('33333333-3333-3333-3333-333333333333','st@x.com'),
 ('44444444-4444-4444-4444-444444444444','eng@x.com'),
 ('11111111-1111-1111-1111-111111111111','boss@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('33333333-3333-3333-3333-333333333333','st@x.com','Stores Sam','stores_incharge'),
 ('44444444-4444-4444-4444-444444444444','eng@x.com','Eng Anil','engineer'),
 ('11111111-1111-1111-1111-111111111111','boss@x.com','Admin Ann','admin');
insert into public.user_directory (name,email,designation,region) values
 ('Anil','eng@x.com','Service Engineer','South');
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

\echo '--- 1. the directory starts with no address ---'
select name, coalesce(address,'') as address, coalesce(city,'') as city,
       coalesce(state,'') as state, coalesce(phone,'') as phone from public.user_directory;

\echo '--- 2. Stores sets it — that is the job of whoever packs the parcel ---'
call public.be('st@x.com');
update public.user_directory
   set address = 'No. 14, 2nd Cross Street, Anna Nagar West',
       city = 'Chennai', state = 'Tamil Nadu', phone = '98400 12345'
 where name = 'Anil';
select name, address, city, state, phone from public.user_directory;

\echo '--- 3. but only the address: the reporting tree is not editable this way ---'
\echo 'expect ERROR: Stores renaming a directory entry'
update public.user_directory set name = 'Anil Kumar' where name = 'Anil';
\echo 'expect ERROR: Stores re-pointing a reporting manager'
update public.user_directory set reporting_manager = 'Someone Else' where name = 'Anil';
\echo 'expect ERROR: Stores deactivating an engineer'
update public.user_directory set validity = false where name = 'Anil';

\echo '--- 4. an engineer cannot set an address at all ---'
call public.be('eng@x.com');
\echo 'expect ERROR: no spare.dispatch permission'
update public.user_directory set address = 'Anywhere' where name = 'Anil';
\echo 'expect ERROR: nor the city'
update public.user_directory set city = 'Anywhere' where name = 'Anil';

\echo '--- 5. an admin still edits the whole row ---'
call public.be('boss@x.com');
update public.user_directory set name = 'Anil', region = 'South II', address = 'Head office' where name = 'Anil';
select name, region, address, city from public.user_directory;

\echo '--- 6. and the address survived every refusal above ---'
select name, (address = 'Head office') as address_is_what_the_admin_set from public.user_directory;

\echo '--- 7. an older import kept these in extra; the migration lifts them out ---'
insert into public.user_directory (name, extra) values
 ('Bala', '{"ADDRESS":"12 Gandhi Road","CITY":"Madurai","STATE":"Tamil Nadu","Contact  No":"90000 11111"}'::jsonb);
-- Re-running the backfill is what 0029 does on apply; it is idempotent.
update public.user_directory u
   set address = coalesce(nullif(btrim(u.address), ''), nullif(btrim(u.extra ->> 'ADDRESS'), ''), ''),
       city    = coalesce(nullif(btrim(u.city), ''),    nullif(btrim(u.extra ->> 'CITY'), ''), ''),
       state   = coalesce(nullif(btrim(u.state), ''),   nullif(btrim(u.extra ->> 'STATE'), ''), ''),
       phone   = coalesce(nullif(btrim(u.phone), ''),   nullif(btrim(u.extra ->> 'Contact  No'), ''), '')
 where u.extra <> '{}'::jsonb;
select name, address, city, state, phone from public.user_directory where name = 'Bala';

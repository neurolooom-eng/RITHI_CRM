-- ===========================================================================
-- REVIEW BATCH 3, PROVED ON A DATABASE (0346-0348).
-- Each section proves BOTH halves: the hole the re-review measured is closed,
-- AND the honest path beside it still works.
--
--   1. D-139  no signed-in user deletes a machine; add and edit still work (0347)
--   2. D-132  feedback permissions are asked once per query; who reads is unchanged (0347, 0348)
--   3. D-144  a rename carries the Indoor DCs waiting for that person, and only those (0346)
--
-- Checks raise an unlabelled error when they are wrong, so the harness counts
-- a failure; every error that is meant to happen is labelled `expect ERROR`.
-- Every check that matters runs as `authenticated`. Run ONCE after _stub.sql
-- + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('rb3_records', 'RB3 Records', '["masters.view", "masters.edit.records"]'::jsonb),
 ('rb3_fb',      'RB3 Feedback', '["visit.feedback"]'::jsonb),
 ('rb3_none',    'RB3 Nothing',  '["calls.view"]'::jsonb),
 ('rb3_users',   'RB3 Users',    '["users.manage.details"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
  ('0b330000-0000-0000-0000-000000000001', 'rb3-admin@x.com'),
  ('0b330000-0000-0000-0000-000000000002', 'rb3-records@x.com'),
  ('0b330000-0000-0000-0000-000000000003', 'rb3-fb@x.com'),
  ('0b330000-0000-0000-0000-000000000004', 'rb3-none@x.com'),
  ('0b330000-0000-0000-0000-000000000005', 'rb3-users@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0b330000-0000-0000-0000-000000000001', 'rb3-admin@x.com',   'RB3 Admin',   'admin'),
  ('0b330000-0000-0000-0000-000000000002', 'rb3-records@x.com', 'RB3 Records', 'rb3_records'),
  ('0b330000-0000-0000-0000-000000000003', 'rb3-fb@x.com',      'RB3 FB',      'rb3_fb'),
  ('0b330000-0000-0000-0000-000000000004', 'rb3-none@x.com',    'RB3 None',    'rb3_none'),
  ('0b330000-0000-0000-0000-000000000005', 'rb3-users@x.com',   'RB3 Users',   'rb3_users')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

-- ===========================================================================
\echo ''
\echo '--- 1. D-139: no signed-in user deletes a machine; add and edit still work ---'
-- ===========================================================================
call public.nobody();
delete from public.products where party_name = 'RB3 HOSP';

call public.be('rb3-records@x.com');
set role authenticated;
insert into public.products (party_name, item_name, serial_number) values ('RB3 HOSP', 'RB3 VENT', 'RB3-001');
update public.products set city = 'RB3 CITY' where party_name = 'RB3 HOSP';
delete from public.products where party_name = 'RB3 HOSP';
reset role;
do $$ begin
  if (select count(*) from public.products where party_name = 'RB3 HOSP') <> 1 then
    raise exception 'D-139 FAILED: the records key could not add a machine, or deleted it';
  end if;
  if (select city from public.products where party_name = 'RB3 HOSP') is distinct from 'RB3 CITY' then
    raise exception 'D-139 FAILED: the records key can no longer edit a machine';
  end if;
end $$;

-- An administrator passes has_perm() for every key, and still has no API delete.
call public.be('rb3-admin@x.com');
set role authenticated;
delete from public.products where party_name = 'RB3 HOSP';
reset role;
do $$ begin
  if (select count(*) from public.products where party_name = 'RB3 HOSP') <> 1 then
    raise exception 'D-139 FAILED: a signed-in administrator deleted a machine through the API';
  end if;
end $$;

-- The upload path: an upsert on machine_key (the Product Database upload's
-- conflict target) is an INSERT then an UPDATE, both still allowed.
call public.be('rb3-records@x.com');
set role authenticated;
insert into public.products (party_name, item_name, serial_number, city)
  values ('RB3 HOSP', 'RB3 VENT', 'RB3-001', 'RB3 CITY 2')
  on conflict (machine_key) do update set city = excluded.city;
reset role;
do $$ begin
  if (select city from public.products where party_name = 'RB3 HOSP') is distinct from 'RB3 CITY 2' then
    raise exception 'D-139 FAILED: a re-load (upsert) of a machine no longer saves';
  end if;
end $$;

-- The SQL editor (no session, the owner) still clears it, as the clean-up files do.
call public.nobody();
delete from public.products where party_name = 'RB3 HOSP';
do $$ begin
  if exists (select 1 from public.products where party_name = 'RB3 HOSP') then
    raise exception 'D-139 FAILED: the SQL editor can no longer delete a machine';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 2. D-132: feedback asks the permission once per query; same readers ---'
-- ===========================================================================
do $$
declare p record;
begin
  for p in select polname, coalesce(pg_get_expr(polqual, polrelid), '') || ' ' ||
                  coalesce(pg_get_expr(polwithcheck, polrelid), '') as expr
             from pg_policy where polrelid = 'public.feedback'::regclass
              and polname in ('fb_read', 'fb_write', 'fb_update') loop
    -- every has_perm( in the policy sits inside a sub-select
    if (length(p.expr) - length(replace(p.expr, 'has_perm(', ''))) / length('has_perm(')
       <> (length(p.expr) - length(replace(p.expr, 'SELECT has_perm(', ''))) / length('SELECT has_perm(') then
      raise exception 'D-132 FAILED: % still calls has_perm() per row: %', p.polname, p.expr;
    end if;
  end loop;
  if (select count(*) from pg_policy where polrelid = 'public.feedback'::regclass
       and polname in ('fb_read', 'fb_write', 'fb_update')) <> 3 then
    raise exception 'D-132 FAILED: a feedback policy is missing';
  end if;
end $$;

call public.nobody();
delete from public.feedback where party_name = 'RB3 HOSP';
insert into public.feedback (ucn, party_name, answers) values ('RB3-F1', 'RB3 HOSP', '{}'::jsonb);

call public.be('rb3-fb@x.com');
set role authenticated;
create temp table rb3_seen_fb as select count(*) as n from public.feedback where party_name = 'RB3 HOSP';
reset role;
call public.be('rb3-none@x.com');
set role authenticated;
create temp table rb3_seen_none as select count(*) as n from public.feedback where party_name = 'RB3 HOSP';
reset role;
do $$ begin
  if (select n from rb3_seen_fb) <> 1 then
    raise exception 'D-132 FAILED: a holder of visit.feedback no longer reads feedback';
  end if;
  if (select n from rb3_seen_none) <> 0 then
    raise exception 'D-132 FAILED: a role with neither feedback key reads feedback';
  end if;
end $$;
call public.nobody();
delete from public.feedback where party_name = 'RB3 HOSP';

-- ===========================================================================
\echo ''
\echo '--- 3. D-144: a rename carries the pending Indoor DCs, not the decided ones ---'
-- ===========================================================================
call public.nobody();
delete from public.user_directory where email = 'rb3-auth@x.com';
insert into public.user_directory (name, email) values ('RB3 Authoriser', 'rb3-auth@x.com');
insert into public.indoor_dcs (dc_no, consignee, authorised_by_name, approval_status)
  values ('', 'RB3 PENDING', 'RB3 Authoriser', 'Pending approval'),
         ('', 'RB3 APPROVED', 'RB3 Authoriser', 'Approved');

-- The User Master correction, made by an administrator (the directory guard
-- refuses a non-administrator's name change today -- D-084, open).
call public.be('rb3-admin@x.com');
set role authenticated;
update public.user_directory set name = 'RB3 Authoriser Renamed' where email = 'rb3-auth@x.com';
reset role;
do $$ begin
  if (select name from public.user_directory where email = 'rb3-auth@x.com') is distinct from 'RB3 Authoriser Renamed' then
    raise exception 'D-144 setup: the User Master rename did not save';
  end if;
  if (select authorised_by_name from public.indoor_dcs where consignee = 'RB3 PENDING') is distinct from 'RB3 Authoriser Renamed' then
    raise exception 'D-144 FAILED: a DC waiting for the renamed authoriser still names the old name';
  end if;
  if (select authorised_by_name from public.indoor_dcs where consignee = 'RB3 APPROVED') is distinct from 'RB3 Authoriser' then
    raise exception 'D-144 FAILED: an approved DC was re-signed by the rename';
  end if;
end $$;

call public.nobody();
-- indoor_dcs refuse a hard delete (quality records), so the fixtures stay,
-- named so that they cannot collide with another suite.
delete from public.user_directory where email = 'rb3-auth@x.com';

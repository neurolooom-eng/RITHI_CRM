-- ===========================================================================
-- The device cache status report (0249).
--   A device writes ITS OWN person's row, and cannot write anybody else's --
--   the person is stamped from the session, whatever the device sends.
--   A re-report from the same device UPDATES its row (the upsert's other half).
--   An engineer reads their own rows only, and cannot run the report.
--   An administrator reads every device AND every person who never reported.
--   Technical Support holds the key; the not-signed-in role reaches nothing.
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('dc000000-0000-0000-0000-000000000001','dc_admin@x.com'),
 ('dc000000-0000-0000-0000-000000000002','dc_eng@x.com'),
 ('dc000000-0000-0000-0000-000000000003','dc_other@x.com'),
 ('dc000000-0000-0000-0000-000000000004','dc_never@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('dc000000-0000-0000-0000-000000000001','dc_admin@x.com','DC Admin','admin'),
 ('dc000000-0000-0000-0000-000000000002','dc_eng@x.com','DC Engineer','engineer'),
 ('dc000000-0000-0000-0000-000000000003','dc_other@x.com','DC Other','engineer'),
 ('dc000000-0000-0000-0000-000000000004','dc_never@x.com','DC Never','engineer')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

\echo '--- 1. an engineer reports their phone; the person is STAMPED, not taken from the device ---'
\echo 'expect: one row, user = dc_eng, machines = 20002'
call public.be('dc_eng@x.com');
begin;
  set local role authenticated;
  insert into public.device_cache_status (user_id, device_id, device_label, machines, machines_at, customers)
  values ('dc000000-0000-0000-0000-000000000003', 'phone-1', 'Android · Chrome', 20002, now(), 5873)
  on conflict (user_id, device_id) do update set machines = excluded.machines;
commit;
select u.email, d.device_id, d.machines, d.customers
  from public.device_cache_status d join auth.users u on u.id = d.user_id
 where d.device_id = 'phone-1';

\echo '--- 2. the same device reports again: its row is UPDATED, not duplicated ---'
\echo 'expect: rows = 1, machines = 19000, error recorded'
call public.be('dc_eng@x.com');
begin;
  set local role authenticated;
  insert into public.device_cache_status (device_id, machines, machines_error)
  values ('phone-1', 19000, 'Failed to fetch')
  on conflict (user_id, device_id) do update
    set machines = excluded.machines, machines_error = excluded.machines_error;
commit;
select count(*) as rows, max(machines) as machines, max(machines_error) as error
  from public.device_cache_status where device_id = 'phone-1';

\echo '--- 3. another engineer reports their laptop ---'
call public.be('dc_other@x.com');
begin;
  set local role authenticated;
  insert into public.device_cache_status (device_id, machines) values ('laptop-9', 0);
commit;

\echo '--- 4. an engineer sees ONLY their own device ---'
\echo 'expect: phone-1 only'
call public.be('dc_eng@x.com');
begin;
  set local role authenticated;
  select device_id from public.device_cache_status order by device_id;
rollback;

\echo '--- 5. ...cannot rewrite somebody else''s row (RLS matches nothing) ---'
\echo 'expect: UPDATE 0, laptop-9 still reads 0 machines'
call public.be('dc_eng@x.com');
begin;
  set local role authenticated;
  update public.device_cache_status set machines = 999 where device_id = 'laptop-9';
commit;
select machines from public.device_cache_status where device_id = 'laptop-9';

\echo '--- 6. ...and cannot run the report ---'
\echo 'expect ERROR: RBAC'
call public.be('dc_eng@x.com');
begin;
  set local role authenticated;
  select count(*) from public.device_cache_report();
rollback;

\echo '--- 7. an ADMIN reads every device AND the person who never reported ---'
\echo 'expect: DC Engineer phone-1 19000 · DC Never (no device) · DC Other laptop-9 0'
call public.be('dc_admin@x.com');
begin;
  set local role authenticated;
  select full_name, device_id, machines
    from public.device_cache_report()
   where email like 'dc\_%' order by full_name;
rollback;

\echo '--- 8. Technical Support holds the key wherever the admin does (row 114) ---'
\echo 'expect: admin t, technical_support t (where each role row exists and is configured)'
select role, permissions ? 'mod:/device-cache' as holds
  from public.app_roles
 where role in ('admin', 'technical_support') and jsonb_array_length(permissions) > 0
 order by role;

\echo '--- 9. the not-signed-in role cannot run the report ---'
\echo 'expect ERROR: permission denied for function device_cache_report'
begin;
  set local role anon;
  select count(*) from public.device_cache_report();
rollback;

\echo '--- 10. ...nor read the table ---'
\echo 'expect ERROR: permission denied for table device_cache_status'
begin;
  set local role anon;
  select count(*) from public.device_cache_status;
rollback;

\echo '--- 11. a device reports its Standard Complaints, and the report returns them (0253) ---'
\echo 'expect: phone-1 complaints 651 with a time'
call public.be('dc_eng@x.com');
begin;
  set local role authenticated;
  insert into public.device_cache_status (device_id, complaints, complaints_at)
  values ('phone-1', 651, now())
  on conflict (user_id, device_id) do update
    set complaints = excluded.complaints, complaints_at = excluded.complaints_at;
commit;
call public.be('dc_admin@x.com');
begin;
  set local role authenticated;
  select device_id, complaints, complaints_at is not null as stored
    from public.device_cache_report() where device_id = 'phone-1';
rollback;

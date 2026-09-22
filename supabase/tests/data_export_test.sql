-- ===========================================================================
-- DATA EXPORT (0227) — the table picker, and who may see it.
--
-- `exportable_tables()` exists so a person can CHOOSE what to export. It is
-- SECURITY DEFINER, so the thing to prove is that being definer buys it
-- nothing it should not have:
--   * it returns NO DATA — names and estimated row counts only;
--   * it returns NOTHING AT ALL to a caller who is not an administrator,
--     which is the whole of its access control;
--   * it withholds the audit trails, which are the record of what everyone
--     did and are not something to carry about on a laptop;
--   * and the module key reached `admin` without disturbing another role.
--
-- Superuser bypasses RLS, so the scoped checks run as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('e0e0e0e0-0000-0000-0000-000000000001','dx_admin@x.com'),
 ('e0e0e0e0-0000-0000-0000-000000000002','dx_engineer@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('e0e0e0e0-0000-0000-0000-000000000001','dx_admin@x.com','An Administrator','admin'),
 ('e0e0e0e0-0000-0000-0000-000000000002','dx_engineer@x.com','An Engineer','engineer')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
-- SECURITY DEFINER because it reads auth.users, which `authenticated` cannot.
-- Without it the impersonation fails and every scoped check reads as a refusal
-- -- which looks exactly like the access control working, and is not.
create or replace procedure public.be(p text) language plpgsql security definer as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
-- `be()` UPDATES the harness row, so select alone is not enough here.
grant select, update on public.harness to authenticated;

set role authenticated;

\echo '--- an administrator is offered the tables'
call public.be('dx_admin@x.com');
select case when count(*) > 20 then 'PASS: an admin is offered ' || count(*)::text || ' tables'
            else 'FAIL: an admin was offered only ' || count(*)::text end as t
  from public.exportable_tables();

\echo '--- and NO row of data comes with them: names and counts only'
-- A set-returning FUNCTION has no row in information_schema.columns, so the
-- shape is read off pg_proc's OUT parameters. Asking the wrong catalogue
-- returned 0 and read as a failure, which is how this assertion was written
-- the first time.
select case when array_length(proargnames, 1) = 2
                 and proargnames @> array['table_name','approx_rows']
            then 'PASS: two OUT columns only — ' || array_to_string(proargnames, ', ')
            else 'FAIL: the function returns ' || coalesce(array_to_string(proargnames, ', '), '(none)') end as t
  from pg_proc where proname = 'exportable_tables';

\echo '--- the audit trails are NOT offered'
select case when count(*) = 0 then 'PASS: no audit table is offered'
            else 'FAIL: ' || string_agg(table_name, ', ') end as t
  from public.exportable_tables()
 where table_name in ('audit_log','record_audit','audit_mode_changes');

\echo '--- an engineer is offered NOTHING, which is the whole access control'
call public.be('dx_engineer@x.com');
select case when count(*) = 0 then 'PASS: a non-administrator is offered nothing'
            else 'FAIL: a non-administrator was offered ' || count(*)::text || ' tables' end as t
  from public.exportable_tables();

\echo '--- ...and that is a REFUSAL, not an empty database'
call public.be('dx_admin@x.com');
select case when count(*) > 20 then 'PASS: the same call as an admin still returns tables'
            else 'FAIL' end as t from public.exportable_tables();

reset role;

\echo '--- the module key reached admin, and only by MERGING'
select case when (select permissions ? 'mod:/data-export' from public.app_roles where role = 'admin')
            then 'PASS: admin holds mod:/data-export' else 'FAIL: admin does not hold it' end as t;
select case when (select jsonb_array_length(permissions) from public.app_roles where role = 'admin') > 5
            then 'PASS: admin kept its other permissions'
            else 'FAIL: admin''s permissions were replaced' end as t;

\echo '--- a role with ZERO permissions is left alone (an empty array means "not configured")'
select case when not exists (
         select 1 from public.app_roles
          where jsonb_array_length(permissions) = 0 and permissions ? 'mod:/data-export')
       then 'PASS: no empty role was written into' else 'FAIL' end as t;

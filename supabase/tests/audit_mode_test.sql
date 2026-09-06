-- ===========================================================================
-- AUDIT MODE (0114 audit) — the switch, and the record of it being thrown.
--
-- No RULES are attached to the mode yet; the user is supplying those. What is
-- testable today is the part that must be right BEFORE any rule hangs off it:
--   * only an administrator can change it;
--   * it cannot be changed without a reason;
--   * every change is kept, with who and when and why;
--   * that history cannot be written, edited or erased through the API — only
--     set_audit_mode() puts a row there;
--   * and a no-op change adds nothing, so the history stays readable.
--
-- Superuser bypasses RLS, so the scoped checks run as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('a0a0a0a0-0000-0000-0000-000000000001','am_admin@x.com'),
 ('a0a0a0a0-0000-0000-0000-000000000002','am_engineer@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('a0a0a0a0-0000-0000-0000-000000000001','am_admin@x.com','An Administrator','admin'),
 ('a0a0a0a0-0000-0000-0000-000000000002','am_engineer@x.com','An Engineer','engineer')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;
delete from public.audit_mode_changes;
update public.app_settings set value = 'off' where key = 'audit_mode';

\echo '--- 1. it starts OFF ---'
\echo 'expect: f'
select public.audit_mode() as mode_on;

\echo '--- 2. an engineer cannot throw it ---'
\echo 'expect ERROR: only an administrator can change Audit Mode'
call public.be('am_engineer@x.com');
begin;
  set local role authenticated;
  select public.set_audit_mode(true, 'because I feel like it');
commit;
\echo 'expect: f -- still off'
select public.audit_mode() as mode_on;

\echo '--- 3. an administrator cannot throw it SILENTLY ---'
\echo 'expect ERROR: Changing Audit Mode needs a reason'
call public.be('am_admin@x.com');
begin;
  set local role authenticated;
  select public.set_audit_mode(true, '   ');
commit;

\echo '--- 4. an administrator turns it on, with a reason ---'
\echo 'expect: t, and one row in the history'
begin;
  set local role authenticated;
  select public.set_audit_mode(true, 'CDSCO inspection, 2026-09-08') as mode_on;
commit;
select turned_on, reason, (select email from auth.users u where u.id = c.changed_by) as changed_by
  from public.audit_mode_changes c order by id;

\echo '--- 5. turning it on AGAIN adds nothing ---'
\echo 'expect: t, and STILL one row -- a history padded with no-ops is a history'
\echo 'nobody reads'
begin;
  set local role authenticated;
  select public.set_audit_mode(true, 'same again') as mode_on;
commit;
select count(*) as history_rows from public.audit_mode_changes;

\echo '--- 6. turning it off is kept too ---'
\echo 'expect: 2 rows, on then off'
begin;
  set local role authenticated;
  select public.set_audit_mode(false, 'inspection closed') as mode_on;
commit;
select turned_on, reason from public.audit_mode_changes order by id;

\echo '--- 7. the history cannot be written through the API ---'
\echo 'expect ERROR: permission denied for table audit_mode_changes'
call public.be('am_admin@x.com');
begin;
  set local role authenticated;
  insert into public.audit_mode_changes (turned_on, reason) values (true, 'not through here');
commit;

\echo '--- 8. ...nor edited, nor erased -- not even by an administrator ---'
\echo 'expect ERROR twice: permission denied for table audit_mode_changes'
begin;
  set local role authenticated;
  update public.audit_mode_changes set reason = 'something else';
commit;
begin;
  set local role authenticated;
  delete from public.audit_mode_changes;
commit;
\echo 'expect: 2 -- both still there'
select count(*) as history_rows from public.audit_mode_changes;

\echo '--- 9. an engineer cannot READ the history ---'
\echo 'expect: 0 -- who turned an inspection mode on is an administrator''s business'
call public.be('am_engineer@x.com');
begin;
  set local role authenticated;
  select count(*) as visible_to_engineer from public.audit_mode_changes;
commit;

\echo '--- 10. an administrator can ---'
\echo 'expect: 2'
call public.be('am_admin@x.com');
begin;
  set local role authenticated;
  select count(*) as visible_to_admin from public.audit_mode_changes;
commit;

\echo '--- 11. cleanup ---'
call public.be(null);
delete from public.audit_mode_changes;
delete from public.profiles where email like 'am_%@x.com';
update public.app_settings set value = 'off' where key = 'audit_mode';

-- ===========================================================================
-- RE-ALLOCATING A CALL IS ITS OWN RIGHT (0126).
--
-- Reported: "call re-allocation option not visible for RM / RGM and I couldn't
-- find it in the roles and permissions as well." It had no permission of its
-- own — it was a corner of `calls.edit`, so there was nothing to find and no
-- way to grant one without the other.
--
-- What this suite is really holding:
--   * every role that could edit a call KEEPS the ability, so nothing is lost
--     the day this lands — the merge, not an overwrite;
--   * a role tuned by an administrator does not lose what was tuned;
--   * `calls.edit` WITHOUT `calls.allot` can still edit the call and CANNOT
--     move it. That is the whole point of splitting them, and it has to hold
--     against PostgREST, not only against a hidden checkbox;
--   * filling a BLANK allocated_to is covered too — "allot this unallotted
--     call" is the same act, and it is what the bulk bar mostly does;
--   * registering a call WITH an engineer is not affected: that is calls.create;
--   * an admin, and a change with no signed-in user (import / definer), pass.
--
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('b1b1b1b1-0000-0000-0000-000000000001','ca_admin@x.com'),
 ('b1b1b1b1-0000-0000-0000-000000000002','ca_rm@x.com'),
 ('b1b1b1b1-0000-0000-0000-000000000003','ca_editor@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('b1b1b1b1-0000-0000-0000-000000000001','ca_admin@x.com','CA Admin','admin'),
 ('b1b1b1b1-0000-0000-0000-000000000002','ca_rm@x.com','CA RM','rm'),
 ('b1b1b1b1-0000-0000-0000-000000000003','ca_editor@x.com','CA Editor','ca_editor')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- A reporting tree. The call policy tests can_see_call() on BOTH sides of an
-- update, so an RM can only move a call between people who report to them —
-- without this the refusals below would prove nothing, because every update
-- would match zero rows for the reason we are not testing.
delete from public.user_directory where email like 'ca_%@x.com' or email like 'ce_%@x.com';
insert into public.user_directory (name, email, reporting_manager) values
 ('CA RM',   'ca_rm@x.com',     ''),
 ('CA Editor','ca_editor@x.com',''),
 ('Eng One', 'ce_one@x.com',    'CA RM'),
 ('Eng Two', 'ce_two@x.com',    'CA RM'),
 ('Eng Three','ce_three@x.com', 'CA RM'),
 ('Eng Four','ce_four@x.com',   'CA RM'),
 ('Eng Five','ce_five@x.com',   'CA Editor'),
 ('Eng Six', 'ce_six@x.com',    'CA RM'),
 ('Eng Seven','ce_seven@x.com', 'CA RM');

-- A role with calls.edit and DELIBERATELY NOT calls.allot: the split is only
-- real if this one can edit and cannot move. `data.view_all` so its refusals
-- are the guard's, never a row it could not see.
insert into public.app_roles (role, label, permissions) values
 ('ca_editor','CA Editor',
  '["calls.view","calls.edit","calls.report","data.view_all","mod:/field-calls"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

delete from public.field_calls where ucn like 'CA-%';
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                party_name, complaint_reported, standard_complaint, allocated_to)
values ('CA-1','C-1','FIELD','VEGA','1', current_date,'H','x','y','Eng One'),
       ('CA-2','C-2','FIELD','VEGA','2', current_date,'H','x','y','');   -- not allotted yet

\echo '--- 1. every role that can EDIT a call can also RE-ALLOCATE one ---'
\echo 'expect: NO ROWS. ca_editor is excluded — it is this suite own fixture,'
\echo 'expect: created after the migration precisely to lack the new right'
select role from public.app_roles
 where permissions ? 'calls.edit' and not (permissions ? 'calls.allot')
   and role <> 'ca_editor';

\echo '--- 2. rm and rgm have it, engineer does not ---'
\echo 'expect: rgm t, rm t, engineer f'
select role, permissions ? 'calls.allot' as may_allot
  from public.app_roles where role in ('rgm','rm','engineer') order by role;

\echo '--- 3. the tuned role above kept everything it was tuned with ---'
\echo 'expect: calls.view, calls.report and data.view_all all still there'
select permissions ? 'calls.view' as v, permissions ? 'calls.report' as r,
       permissions ? 'data.view_all' as d, permissions ? 'calls.allot' as a
  from public.app_roles where role = 'ca_editor';

\echo '--- 4. an RM MAY move a call ---'
\echo 'expect: UPDATE 1, allocated_to = Eng Two'
call public.be('ca_rm@x.com');
begin;
  set local role authenticated;
  update public.field_calls set allocated_to = 'Eng Two' where ucn = 'CA-1';
commit;
select allocated_to from public.field_calls where ucn = 'CA-1';

\echo '--- 5. a role with calls.edit but NOT calls.allot is REFUSED ---'
\echo 'expect ERROR: RBAC: moving a call to another engineer needs the ... permission'
call public.be('ca_editor@x.com');
begin;
  set local role authenticated;
  update public.field_calls set allocated_to = 'Eng Three' where ucn = 'CA-1';
commit;
\echo 'expect: still Eng Two'
select allocated_to from public.field_calls where ucn = 'CA-1';

\echo '--- 6. ...and can still EDIT the call, which is the point of the split ---'
\echo 'expect: UPDATE 1, complaint changed'
call public.be('ca_editor@x.com');
begin;
  set local role authenticated;
  update public.field_calls set complaint_reported = 'edited by ca_editor' where ucn = 'CA-1';
commit;
select complaint_reported from public.field_calls where ucn = 'CA-1';

\echo '--- 7. filling a BLANK allocated_to is a re-allocation too ---'
\echo 'expect ERROR: the same refusal — CA-2 was never allotted'
call public.be('ca_editor@x.com');
begin;
  set local role authenticated;
  update public.field_calls set allocated_to = 'Eng Four' where ucn = 'CA-2';
commit;
\echo 'expect: still blank'
select coalesce(nullif(allocated_to,''),'(blank)') as allocated_to
  from public.field_calls where ucn = 'CA-2';

\echo '--- 8. writing the SAME value is not a change, so it is not refused ---'
\echo 'expect: UPDATE 1, no error'
call public.be('ca_editor@x.com');
begin;
  set local role authenticated;
  update public.field_calls set allocated_to = 'Eng Two' where ucn = 'CA-1';
commit;

\echo '--- 9. an ADMIN may always move one ---'
\echo 'expect: Eng Five'
call public.be('ca_admin@x.com');
begin;
  set local role authenticated;
  update public.field_calls set allocated_to = 'Eng Five' where ucn = 'CA-1';
commit;
select allocated_to from public.field_calls where ucn = 'CA-1';

\echo '--- 10. REGISTERING a call with an engineer is untouched (that is calls.create) ---'
\echo 'expect: Eng Six — the guard is on UPDATE only'
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                party_name, complaint_reported, standard_complaint, allocated_to)
values ('CA-3','C-3','FIELD','VEGA','3', current_date,'H','x','y','Eng Six');
select allocated_to from public.field_calls where ucn = 'CA-3';

\echo '--- 11. with NO signed-in user (import / definer / scheduled) it passes ---'
\echo 'expect: Eng Seven'
update public.harness set uid = null, email = '';
update public.field_calls set allocated_to = 'Eng Seven' where ucn = 'CA-1';
select allocated_to from public.field_calls where ucn = 'CA-1';

\echo '--- 12. the guard is on all THREE call tables, not just field calls ---'
\echo 'expect: three rows'
select c.relname as call_table
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where t.tgname = 'zz_calls_allot_guard' and not t.tgisinternal
 order by 1;

\echo '--- 13. the permission is offered on the Roles screen, which is where it was missing ---'
\echo 'expect: t — an admin holds it, so it is grantable'
select permissions ? 'calls.allot' as admin_has_it from public.app_roles where role = 'admin';

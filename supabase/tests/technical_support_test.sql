-- ===========================================================================
-- TECHNICAL SUPPORT (0145) — the Super Admin's reach, none of its writes.
--
-- "Map this Role to All Modules and Mimic Super Admin - But with Read Only For
--  now" (the user, 2026-09-08). Two halves, and both are tested here:
--
--   REACH   — every module key the admin role holds, so no page is hidden, and
--             `data.view_all`, so the call pages are not empty.
--   READ    — no action that any write policy asks for, proved by REFUSALS
--             rather than by reading the permission list: what makes the role
--             safe is Postgres, not the browser hiding a button.
--
-- AND THE TWO EXCEPTIONS ARE TESTED TOO, because a hole nobody has written down
-- is found by accident. On two tables the right to READ is the right to WRITE,
-- by a design decision that predates this role:
--   * `feedback`      — fb_write (0008) accepts `feedback.view`.
--   * `tracker_items` — tracker_rw (0143) is ONE permission for both, which is
--                       what the user asked for on that page.
-- Both are shown succeeding below. Untick the module (Tracker) or the action
-- (Customer Feedback) in Roles & Permissions to close either one.
--
-- Superuser bypasses RLS, so every scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- Cleared at the TOP, so a second run tests the same thing as the first.
delete from public.tracker_items where title like 'TS %';
delete from public.field_calls   where ucn like 'TS-%';
delete from public.parties       where party_name like 'TS PARTY%';
delete from public.feedback      where ucn = 'TS-FB';

insert into auth.users (id,email) values
 ('75757575-0000-0000-0000-000000000001','ts_support@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('75757575-0000-0000-0000-000000000001','ts_support@x.com','Tech Support','technical_support')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- A call belonging to somebody else entirely: what the role must be able to
-- READ, and must not be able to touch.
insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to)
values ('TS-1', 'FIELD', 'TSPROD', '1', current_date, 'HOSP', 'x', 'y', 'Somebody Else');

\echo '--- 1. EVERY MODULE THE ADMIN HAS ---'
\echo 'expect: 0 -- "map this role to all modules" is the ask, so a page the'
\echo 'expect: Super Admin can open and this role cannot is a failure.'
select count(*) as modules_missing from (
  select v from public.app_roles ar, lateral jsonb_array_elements_text(ar.permissions) t(v)
   where ar.role = 'admin' and v like 'mod:%'
  except
  select v from public.app_roles ar, lateral jsonb_array_elements_text(ar.permissions) t(v)
   where ar.role = 'technical_support') x;

\echo '--- 2. AND NOTHING THAT WRITES ---'
\echo 'expect: 0 rows. Every write in this database names the action it needs;'
\echo 'expect: this asks the catalog itself which actions those are, so an'
\echo 'expect: action added later is caught here rather than in production.'
with granted as (
  select v from public.app_roles ar, lateral jsonb_array_elements_text(ar.permissions) t(v)
   where ar.role = 'technical_support' and v not like 'mod:%'
), write_exprs as (
  select coalesce(qual,'') || ' ' || coalesce(with_check,'') as e
    from pg_policies where schemaname = 'public' and cmd <> 'SELECT'
)
select g.v as write_action_held
  from granted g
 where exists (select 1 from write_exprs w where w.e like '%''' || g.v || '''%')
   -- The two known exceptions, both written up at the top of this file and both
   -- exercised at the end. Anything ELSE appearing here is a real hole.
   and g.v not in ('feedback.view');

\echo '--- 3. IT SEES A CALL ALLOTTED TO SOMEBODY ELSE ---'
\echo 'expect: TS-1 -- data.view_all is what makes the reach real. Without it'
\echo 'expect: the role opens every page and the call pages are empty.'
call public.be('ts_support@x.com');
begin;
  set local role authenticated;
  select ucn, allocated_to from public.field_calls where ucn = 'TS-1';
commit;

\echo '--- 4. ...and cannot change it ---'
\echo 'expect: UPDATE 0, and the complaint still reads x. calls.edit is not'
\echo 'expect: held, so RLS matches no row to update -- a refusal that does'
\echo 'expect: not depend on the screen hiding the button. It is silent rather'
\echo 'expect: than an error because a policy filters rows; it does not object.'
begin;
  set local role authenticated;
  update public.field_calls set complaint_reported = 'edited by support' where ucn = 'TS-1';
  select ucn, complaint_reported from public.field_calls where ucn = 'TS-1';
rollback;

\echo '--- 5. ...cannot add a master ---'
\echo 'expect ERROR: masters.edit is not held (row-level security).'
begin;
  set local role authenticated;
  insert into public.parties (party_name) values ('TS PARTY 1');
rollback;

\echo '--- 6. ...cannot register a call ---'
\echo 'expect ERROR: calls.create is not held.'
begin;
  set local role authenticated;
  insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                  complaint_reported, standard_complaint, allocated_to)
  values ('TS-2', 'FIELD', 'TSPROD', '2', current_date, 'HOSP', 'x', 'y', 'Somebody Else');
rollback;

\echo '--- 7. ...cannot change a role, which is the one that would undo the rest ---'
\echo 'expect: UPDATE 0 -- rbac.manage is not held, so the role cannot widen'
\echo 'expect: itself, which is the write that would undo every other refusal.'
begin;
  set local role authenticated;
  update public.app_roles set permissions = permissions || '"calls.edit"'::jsonb
   where role = 'technical_support';
rollback;

\echo '--- 8. ...and cannot touch a profile ---'
\echo 'expect: UPDATE 0 -- users.manage is not held, so it cannot promote'
\echo 'expect: itself to admin either.'
begin;
  set local role authenticated;
  update public.profiles set role = 'admin' where email = 'ts_support@x.com';
rollback;

\echo '--- 9. EXCEPTION A: the Tracker. Seeing it IS editing it, by design ---'
\echo 'expect: the insert SUCCEEDS. tracker_rw (0143) is one permission for both'
\echo 'expect: -- the user asked for exactly that on that page -- so a role'
\echo 'expect: holding mod:/tracker can add and edit there. Untick the module'
\echo 'expect: for this role to close it.'
begin;
  set local role authenticated;
  insert into public.tracker_items (title, detail, owner, area)
       values ('TS tracker line', 'added by a read-only role', 'Rithi Admin', 'Ops');
  select title, owner from public.tracker_items where title = 'TS tracker line';
commit;

\echo '--- 10. EXCEPTION B: Customer Feedback ---'
\echo 'expect: the insert SUCCEEDS. fb_write (0008) accepts feedback.view, which'
\echo 'expect: is also what READS the page -- so the two cannot be separated'
\echo 'expect: without changing that policy for every role that holds it.'
begin;
  set local role authenticated;
  insert into public.feedback (ucn, party_name) values ('TS-FB', 'TS customer');
  select ucn, party_name from public.feedback where ucn = 'TS-FB';
commit;

-- Leave nothing behind.
delete from public.tracker_items where title like 'TS %';
delete from public.field_calls   where ucn like 'TS-%';
delete from public.feedback      where ucn = 'TS-FB';

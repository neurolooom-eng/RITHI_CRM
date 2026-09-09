-- ---------------------------------------------------------------------------
-- WHY CAN'T I SET SOMEBODY TO ADMIN?  (read-only — changes nothing)
--
-- Asked 2026-09-09: "I am not able to add users to Admin / Super User."
--
-- There are TWO gates and they check DIFFERENT things, which is why editing a
-- user can work while setting that user to Admin fails:
--
--   1. RLS on `profiles`  -> has_perm('users.manage')
--        Lets you edit users at all. Fails as "new row violates row-level
--        security policy" or a save that silently changes nothing.
--
--   2. Trigger profiles_role_guard -> is_admin()
--        Refuses the ADMIN value specifically:
--          RBAC: granting admin requires an administrator
--        `is_admin()` is profiles.role = 'admin' OR your login email in
--        public.app_super_admins. Nothing else counts -- a role that merely
--        HOLDS every permission is still not an administrator to this trigger.
--
-- So a role with users.manage but without is_admin() can create and edit users
-- all day and be refused on the one value.
--
-- SUPER ADMIN IS NOT A ROLE AND NO SCREEN CAN GRANT IT. It is a row in
-- public.app_super_admins (database) matched against a hardcoded list in
-- src/lib/auth.tsx (app). Adding one is a migration plus a code change, on
-- purpose: it is the account that can override every other check.
--
-- Run this signed in as the person who is stuck.
-- ---------------------------------------------------------------------------

select 'Signed in as'                as question, coalesce(auth.email(), '(not signed in)') as answer
union all
select 'My profiles.role',            coalesce((select role from public.profiles where id = auth.uid()), '(no profile row)')
union all
select 'is_admin()  -- gate 2',       is_admin()::text from (select 1) _
union all
select 'is_super_admin()',            is_super_admin()::text
union all
select 'has_perm(users.manage) -- gate 1', coalesce(has_perm('users.manage')::text, 'null (not signed in)')
union all
select 'Am I in app_super_admins?',
       (exists (select 1 from public.app_super_admins s
                 where lower(s.email) = lower(coalesce(auth.email(), ''))))::text;

-- WHAT THE ANSWERS MEAN
--
--   is_admin() = false and my profiles.role <> 'admin'
--     -> This is it. Your own account is not an administrator in the DATABASE,
--        whatever the app's menu bar says. Someone who IS one (or a super
--        admin) must set your profiles.role to 'admin'; you cannot promote
--        yourself -- profiles_role_guard refuses that too, by design.
--
--   is_admin() = true but the save still fails
--     -> Not this guard. Read the error text: an RLS message points at gate 1,
--        anything else is a different fault.
--
--   has_perm('users.manage') = false
--     -> You cannot edit users at all, never mind the role. Grant users.manage
--        on Roles & Permissions, MERGING into the role rather than replacing
--        its list.

-- ---------------------------------------------------------------------------
-- BOOTSTRAP: there is no administrator, and SQL will not make one either.
--
-- The guard is a TRIGGER, not a policy, so running as the project owner in the
-- SQL editor does NOT bypass it: there `auth.uid()` is NULL, `is_admin()` is
-- false, and the same refusal comes back. That is the trap -- the obvious
-- workaround (do it in SQL) fails for a reason that looks like a permissions
-- bug.
--
-- Two more things this guard does, both deliberate and both verified:
--   * NOBODY PROMOTES THEMSELVES. Even a real administrator is refused on their
--     own row ("you cannot change your own role or permissions"); only a super
--     admin may. So the last administrator cannot re-grant themselves.
--   * Once your profiles.role IS 'admin', promoting other people just works.
--
-- So to create the first administrator, lift the guard for one statement. Run
-- it as one block: if the update fails the whole thing rolls back and the
-- trigger is still on. Change the email and nothing else.
-- ---------------------------------------------------------------------------
--
-- begin;
--   alter table public.profiles disable trigger profiles_role_guard;
--   update public.profiles set role = 'admin' where lower(email) = lower('SOMEBODY@example.com');
--   alter table public.profiles enable trigger profiles_role_guard;
--   -- Check it before committing. 1 row, role = admin.
--   select email, role from public.profiles where lower(email) = lower('SOMEBODY@example.com');
-- commit;
--
-- Leaving the trigger disabled would let any account with users.manage hand out
-- admin, so re-enabling it is part of the same transaction above, not a
-- follow-up to remember.

-- ---------------------------------------------------------------------------
-- WHY CAN'T I SET SOMEBODY TO ADMIN?  (read-only — changes nothing)
--
-- Asked 2026-09-09: "I am not able to add users to Admin / Super User."
--
-- ANSWERED BY EMAIL, NOT BY SESSION, and that is the whole point of this
-- rewrite. The first version asked auth.uid() — and the SQL editor has no
-- signed-in app user, so every line came back "(not signed in)" and it told
-- nobody anything. Put the address in ONE place below and it answers about that
-- person from the tables, with no session at all.
--
-- THERE ARE TWO GATES AND THEY CHECK DIFFERENT THINGS, which is why editing a
-- user can work while setting that user to Admin fails:
--
--   1. RLS on `profiles`  -> has_perm('users.manage')
--        Lets you edit users at all. Fails as "new row violates row-level
--        security policy".
--
--   2. Trigger profiles_role_guard -> is_admin()
--        Refuses the ADMIN value specifically:
--          RBAC: granting admin requires an administrator
--        is_admin() is profiles.role = 'admin' OR the login in
--        public.app_super_admins. Nothing else counts — a role that HOLDS
--        every permission in the matrix is still not an administrator here.
--
-- SUPER ADMIN IS NOT A ROLE AND NO SCREEN CAN GRANT IT: a row in
-- app_super_admins matched against a hardcoded list in src/lib/auth.tsx, so
-- adding one is a migration plus a code change. On purpose — it is the account
-- that overrides every other check.
-- ---------------------------------------------------------------------------

-- >>> PUT THE ADDRESS OF THE PERSON WHO IS STUCK HERE, and change nothing else.
with me as (select lower(btrim('PUT-THE-EMAIL-HERE@example.com')) as email),

p as (select pr.* from public.profiles pr, me where lower(pr.email) = me.email),
sa as (select exists (select 1 from public.app_super_admins s, me
                       where lower(s.email) = me.email) as yes),
ar as (select r.permissions from public.app_roles r
        where r.role = (select coalesce(role, '') from p))

select 'Email asked about'                              as question,
       (select email from me)                           as answer
union all
select 'Do they have a profile row?',
       case when exists (select 1 from p) then 'yes' else 'NO — they cannot sign in at all' end
union all
select 'Their profiles.role',
       coalesce((select nullif(role, '') from p), '(none)')
union all
select 'GATE 2 — is_admin(): role is exactly ''admin''?',
       case when (select coalesce(role,'') from p) = 'admin' then 'yes' else 'no' end
union all
select 'GATE 2 — is_admin(): in app_super_admins?',
       case when (select yes from sa) then 'yes' else 'no' end
union all
select 'GATE 1 — their role holds users.manage?',
       case when (select yes from sa) or (select coalesce(role,'') from p) = 'admin'
              then 'yes (an administrator holds everything)'
            when (select permissions from ar) ? 'users.manage' then 'yes'
            else 'no' end
union all
select '>>> CAN THIS PERSON GRANT ADMIN?',
       case when (select yes from sa) or (select coalesce(role,'') from p) = 'admin'
              then 'YES'
            else 'NO — this is what is stopping you (see below)' end;

-- WHO CAN, right now. If the list is empty, nobody can, and the bootstrap at
-- the bottom is the only way in.
select 'Can grant admin today' as who, email, role
  from public.profiles where role = 'admin'
union all
select 'Super admin (overrides everything)', s.email, '(not a role)'
  from public.app_super_admins s
 order by 1, 2;

-- ---------------------------------------------------------------------------
-- WHAT THE ANSWERS MEAN
--
--   CAN THIS PERSON GRANT ADMIN? = NO
--     -> Their account is not an administrator in the DATABASE, whatever the
--        app's menu bar says. Somebody from the second list must set their
--        profiles.role to 'admin' — and they cannot do it themselves:
--        profiles_role_guard refuses a person changing their OWN role, by
--        design, so even the last administrator cannot re-grant themselves.
--
--   ...= YES but the save still fails
--     -> Not this guard. Read the error text: "row-level security" points at
--        gate 1; anything else is a different fault.
--
-- BOOTSTRAP: nobody can, and SQL will not make one either.
--
-- The guard is a TRIGGER, not a policy, so running as the project owner in the
-- SQL editor does NOT bypass it — there auth.uid() is NULL, is_admin() is
-- false, and the same refusal comes back. That is the trap: the obvious
-- workaround fails for a reason that looks like a permissions bug.
--
-- So to make the first administrator, lift the guard for one statement. Run it
-- as one block: if the update fails the whole thing rolls back and the trigger
-- is still on. Change the email and nothing else.
-- ---------------------------------------------------------------------------
--
-- begin;
--   alter table public.profiles disable trigger profiles_role_guard;
--   update public.profiles set role = 'admin' where lower(email) = lower('SOMEBODY@example.com');
--   alter table public.profiles enable trigger profiles_role_guard;
--   -- Check before committing: 1 row, role = admin.
--   select email, role from public.profiles where lower(email) = lower('SOMEBODY@example.com');
-- commit;
--
-- Leaving the trigger disabled would let any account with users.manage hand out
-- admin, so re-enabling it is part of the same transaction rather than a
-- follow-up to remember.

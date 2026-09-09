-- ===========================================================================
-- REVOKE A SUPER ADMIN.
--
-- The user, 2026-09-09: "mmdev74@gmail.com - remove him from Admin".
--
-- SUPER ADMIN IS TWO THINGS IN TWO PLACES and both have to go, or the account
-- keeps real access:
--
--   * `public.app_super_admins` -- what is_super_admin() reads, so what
--     POSTGRES allows. Removed here.
--   * `SUPER_ADMINS` in src/lib/auth.tsx -- what the BROWSER offers. Removed in
--     the same change; without it the screens still hand them every button and
--     the database quietly refuses each one, which reads as the app being
--     broken rather than as access having been withdrawn.
--
-- AND `profiles.role` IS A THIRD PLACE. is_admin() is `role = 'admin'` OR the
-- super-admin row -- so dropping only the row can leave an ordinary Admin
-- standing, which is not what "remove him from Admin" means. It is downgraded
-- below, and only if it currently says admin.
--
-- DOWNGRADED TO `engineer`, the system's own default for a login with no role
-- set, chosen because it is the least this codebase can express: there is no
-- "no access" ROLE. If the intent is that this person should not sign in AT
-- ALL, that is a different action -- set their User Master row inactive -- and
-- it is deliberately not assumed here. Revoking rights is safe to do without
-- asking; deciding somebody should be locked out entirely is not.
--
-- 0008 SEEDS THAT ROW, and this migration must stay AFTER it in the `rbac`
-- module. Replaying rbac.sql runs 0008's insert (which puts the address back)
-- and then this delete -- in that order, the account ends revoked. The other
-- order would silently restore a super admin on every bundle replay, which is
-- exactly the class of fault this project has been bitten by.
--
-- Idempotent, and it says what it did.
-- ===========================================================================

do $rm$
declare
  v_email text := 'mmdev74@gmail.com';
  n_super integer := 0;
  n_role  integer := 0;
begin
  delete from public.app_super_admins where lower(email) = lower(v_email);
  get diagnostics n_super = row_count;

  update public.profiles
     set role = 'engineer'
   where lower(email) = lower(v_email)
     and lower(coalesce(role, '')) = 'admin';
  get diagnostics n_role = row_count;

  raise notice 'Super admin revoked for %: % super-admin row(s) removed, % profile(s) downgraded from admin',
    v_email, n_super, n_role;

  if n_super = 0 and n_role = 0 then
    raise notice '  (nothing to do -- already revoked, or that address has no rows here)';
  end if;
end $rm$;

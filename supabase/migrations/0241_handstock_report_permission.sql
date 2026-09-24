-- ===========================================================================
-- THE HAND STOCK REPORT'S KEY REACHES SOMEBODY.
--
--   The user, 2026-09-24: "Add a Hand Stock Report - Default access to
--   Admin/Super Admin, Rest of the Access I will select from Roles &
--   Permissions."
--
-- WITHOUT THIS THE SCREEN IS INVISIBLE TO EVERYBODY AND NOTHING SAYS SO.
-- `permsForRole()` is `if (stored && stored.length) return stored;` -- the code
-- defaults apply ONLY to a role whose stored set is EMPTY, and on a project in
-- use every role has a tuned row. So a new module's key must be MERGED into
-- `app_roles` or the page ships, the menu entry exists, the permission is
-- ticked in the code, and no role can open it. That has happened four times
-- here (Machine History, the Call Report, the Customer Feedback Report, Solved
-- Without a Report); 0195, 0209 and 0224 are the pattern and this is the same
-- shape.
--
-- WHO IT GRANTS, AND WHY IT IS NOT JUST `admin`.
--
--   SUPER ADMIN NEEDS NO GRANT. It is not a role -- it is a row in
--   `app_super_admins` that overrides every check -- so it can already open
--   this screen, and writing a key for it would be writing to a role that does
--   not exist.
--
--   TECHNICAL SUPPORT IS GRANTED, AND THAT IS NOT A LIBERTY TAKEN WITH A ROLE
--   THE USER DID NOT NAME. `_status.sql` row 114 asserts a PROPERTY: Technical
--   Support holds every module key the admin holds. That is what the role IS
--   (the user, 2026-09-08: "Map this Role to All Modules and Mimic Super Admin
--   - But with Read Only For now"), and an admin-only page skipping it breaks
--   the role silently -- which is the fault that row exists to catch. The first
--   version of this migration granted `admin` alone and row 114 went red on the
--   validation run, which is exactly what it is for. 0224 granted the previous
--   administrators-only report the same way.
--
--   IT CONFERS NO WRITE. A module key opens a SCREEN; the read policies decide
--   the rows, and this screen writes nothing at all. Row 117 -- Zoho Migration
--   holds no write action -- is untouched either way.
--
--   ZOHO MIGRATION IS LEFT ALONE. No check requires it, the user named Admin,
--   and the standing rule here is not to touch a role that was not named. It is
--   one tick on Roles & Permissions if it is wanted.
--
-- MERGED, NEVER OVERWRITTEN, and a role with ZERO permissions is left exactly
-- as it is: an empty array means "not configured", and writing one key into it
-- turns off the fallback that is currently giving that role its access.
--
-- IDEMPOTENT: a role that already holds the key is not touched, so `updated_at`
-- does not move on a re-run and the notice reports the truth either way.
-- ===========================================================================

do $$
declare n integer;
begin
  if to_regclass('public.app_roles') is null then return; end if;

  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ar.permissions) as v
               union
               select unnest(array['mod:/handstock-report']) as v
             ) u
         ),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'technical_support')
     and not (ar.permissions ? 'mod:/handstock-report');
  get diagnostics n = row_count;
  raise notice '0241: % of 2 role(s) given mod:/handstock-report (admin + technical_support -- grant the rest on Roles & Permissions)', n;
end $$;

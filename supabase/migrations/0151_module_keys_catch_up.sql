-- ===========================================================================
-- THE STORED ROLES CATCH UP WITH THE PAGES.
--
-- The user, 2026-09-09: "Update the Role & Permissions as per the Current List
-- of Pages , Actions."
--
-- A NEW PAGE IS INVISIBLE UNTIL A ROLE HOLDS ITS KEY, and that is the failure
-- this file fixes. `DEFAULT_PERMS` in the app is only a FALLBACK: it applies to
-- a role whose `app_roles` row is empty. Every role here has a populated row,
-- so adding a module to the code grants it to nobody — the nav asks
-- `can('mod:/x')`, the stored list does not have it, and the page simply never
-- appears. No error, no clue.
--
-- Three keys were in exactly that state:
--
--   mod:/spare-insights      shipped yesterday and visible to NOBODY but an
--                            administrator (is_admin short-circuits has_perm).
--                            My omission, not a design.
--   mod:/pm-bulk-upload      a page in the menu that had never had a key at all.
--   mod:/software-validation the same.
--
-- WHO GETS WHAT, and why it is derived rather than listed:
--
--   * Spare Insights goes to every role that already holds `consumption.view`.
--     It is a consumption dashboard; the roles allowed to see consumption are
--     the roles allowed to see it summarised. Deriving it from the permission
--     rather than naming roles means an administrator who has already tuned a
--     role gets the answer their own tuning implies.
--   * The two admin pages go to `admin` -- and to `technical_support`, because
--     that role's whole definition is "every module key the admin role holds,
--     read-only" (0145). A new admin page that skipped it would break that
--     promise silently, which is the same class of bug as the three above.
--
-- MERGED, NEVER OVERWRITTEN. An administrator may have tuned any of these; the
-- merge only ever adds, and adds nothing that writes.
-- ===========================================================================

do $mods$
declare
  n int := 0;
begin
  if to_regclass('public.app_roles') is null then
    raise notice 'app_roles is missing -- run rbac.sql first';
    return;
  end if;

  -- ---- Spare Insights: wherever consumption is already visible -------------
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ar.permissions) as v
               union select 'mod:/spare-insights'
             ) u
         ),
         updated_at = now()
   where ar.permissions ? 'consumption.view'
     and not (ar.permissions ? 'mod:/spare-insights');
  get diagnostics n = row_count;
  raise notice 'Spare Insights granted to % role(s) that already see consumption', n;

  -- ---- the two admin pages: admin, and the role defined as admin's reach ---
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ar.permissions) as v
               union select unnest(array['mod:/pm-bulk-upload', 'mod:/software-validation'])
             ) u
         ),
         updated_at = now()
   where ar.role in ('admin', 'technical_support')
     and not (ar.permissions ?& array['mod:/pm-bulk-upload', 'mod:/software-validation']);
  get diagnostics n = row_count;
  raise notice 'PM Bulk Upload and Software Validation granted to % role(s)', n;

  -- ---- and Technical Support keeps its defining property -------------------
  -- "Every module key the admin role holds" is what that role IS. Rather than
  -- listing modules again here, take whatever the admin row actually carries --
  -- so this stays true for pages added after today as well, whenever this file
  -- is replayed.
  update public.app_roles ts
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ts.permissions) as v
               union
               select m.v from public.app_roles a,
                    lateral jsonb_array_elements_text(a.permissions) as m(v)
                where a.role = 'admin' and m.v like 'mod:%'
             ) u
         ),
         updated_at = now()
   where ts.role = 'technical_support';
end $mods$;

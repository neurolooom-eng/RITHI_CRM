-- ===========================================================================
-- THE SCREEN WAS RENAMED, AND THE MODULE KEY IS THE ROUTE.
--
-- The user, 2026-09-15: "Rename it as Product Failure analysis." It shipped
-- yesterday as Daily Call Review Insights at `/dccr-insights`; it is now
-- Product Failure Analysis at `/product-failure`.
--
-- A RE-ARRANGED UI IS NOT DONE UNTIL ROLES & PERMISSIONS KNOWS — the standing
-- rule, and a RENAME is the case that hides it best, because the screen is
-- already working for everybody. `permsForRole()` returns the stored set
-- whenever it is non-empty, so the moment the route changed, every role's
-- `mod:/dccr-insights` stopped opening anything and the page went invisible to
-- all of them with no error anywhere.
--
-- IT MERGES THE NEW KEY INTO EVERY CONFIGURED ROLE, exactly as 0204 granted the
-- old one, so nobody loses the screen across the rename.
--
-- THE OLD KEY IS LEFT IN PLACE, and that is deliberate rather than untidy.
-- Removing it would be a second write for no gain: it now names a route that
-- does not exist, so it grants nothing, and `check:ui` ignores a key with no
-- module. Stripping it would also make this migration destructive on a project
-- where an administrator had tuned that row — and 0192 is the precedent for
-- MERGING a renamed module's key rather than swapping it.
--
-- A ROLE WITH ZERO PERMISSIONS IS LEFT ALONE: an empty array means "not
-- configured" and the code falls back to the defaults, which carry the new key.
-- ===========================================================================

do $$
declare n int;
begin
  if to_regclass('public.app_roles') is null then return; end if;

  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ar.permissions) as v
               union
               select unnest(array['mod:/product-failure']) as v
             ) u
         ),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and not (ar.permissions ? 'mod:/product-failure');
  get diagnostics n = row_count;
  raise notice '0205: % role(s) given mod:/product-failure (renamed from mod:/dccr-insights)', n;
end $$;

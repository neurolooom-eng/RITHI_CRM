-- ===========================================================================
-- DAILY CALL REVIEW INSIGHTS REACHES THE ROLES THAT ALREADY READ THE REVIEWS.
--
-- The user, 2026-09-15: "In the Overview heading - Add one more analytics page
-- to analyse all the data that is part of the daily call review."
--
-- A NEW SCREEN IS NOT DONE UNTIL ROLES & PERMISSIONS KNOWS. `permsForRole()`
-- returns the STORED set whenever it is non-empty, so a code default reaches
-- only a role whose row is empty — and on a project in use every role has a
-- tuned row. Without this the page ships, the menu entry exists, the permission
-- is ticked in DEFAULT_PERMS, and the screen is invisible to every role with no
-- error anywhere. That happened four times before 0195.
--
-- IT GRANTS NO REACH. The page holds no authority of its own: it reads
-- `field_call_review`, which `call_reviews_read` already opens to any signed-in
-- user, and it writes nothing. What each role SEES is decided by the row-level
-- security on the calls underneath, exactly as on the register.
--
-- MERGED, NEVER OVERWRITTEN, and a role with ZERO permissions is left alone —
-- an empty array means "not configured" and writing one key into it would turn
-- that fallback off.
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
               select unnest(array['mod:/dccr-insights']) as v
             ) u
         ),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and not (ar.permissions ? 'mod:/dccr-insights');
  get diagnostics n = row_count;
  raise notice '0204: % role(s) given mod:/dccr-insights', n;
end $$;

-- ===========================================================================
-- 0280 — REBUILDING PRODUCT DATABASE 2.0 HAS A KEY OF ITS OWN
--
-- Findings 57-67 (docs/PERMISSIONS_REVIEW.md), the user's decisions of
-- 2026-09-30: "63, 64: It should show the Individual View's Control Action and
-- its Check Box" -- each screen gets keys of its own, today's grants copied
-- across (0284) so nobody gains or loses anything on the day it ships -- and
-- "67: Break it down", with the old key kept as the PARENT of the new ones, so
-- a role holding it keeps everything until an administrator unticks it.
-- The parent rule itself is in has_perm() (0272, public.perm_parents).
--
-- This file: the Rebuild button asked masters.edit or cover.edit; now
-- pd2.rebuild. Reading its state follows the cover keys' split.
-- ===========================================================================

drop policy if exists pdv2_state_read on public.product_database_v2_state;
create policy pdv2_state_read on public.product_database_v2_state for select
  using (public.has_perm('masters.view') or public.has_perm('cover.edit.entries')
         or public.has_perm('contract.edit.entries') or public.is_admin());

CREATE OR REPLACE FUNCTION public.refresh_product_database_2()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  if not (public.has_perm('pd2.rebuild') or public.is_admin()) then
    raise exception 'Your role may not rebuild Product Database 2.0.' using errcode = '42501';
  end if;
  refresh materialized view concurrently public.product_database_v2_mv;
  select count(*) into n from public.product_database_v2_mv;
  update public.product_database_v2_state
     set refreshed_at = now(), rows_built = n, refreshed_by = auth.uid(), stale = false
   where only_row;
  return (select refreshed_at from public.product_database_v2_state where only_row);
end $function$;

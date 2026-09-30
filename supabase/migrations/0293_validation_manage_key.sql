-- ===========================================================================
-- 0293 — RECORDING VALIDATION RESULTS HAS A KEY OF ITS OWN
--
-- Findings 57-67 (docs/PERMISSIONS_REVIEW.md), the user's decisions of
-- 2026-09-30: "63, 64: It should show the Individual View's Control Action and
-- its Check Box" -- each screen gets keys of its own, today's grants copied
-- across (0298) so nobody gains or loses anything on the day it ships -- and
-- "67: Break it down", with the old key kept as the PARENT of the new ones, so
-- a role holding it keeps everything until an administrator unticks it.
-- The parent rule itself is in has_perm() (0286, public.perm_parents).
--
-- This file: valres_write asked config.manage while the screen asked
-- config.manage OR users.manage (finding 64). Both now ask validation.manage.
-- ===========================================================================

drop policy if exists valres_write on public.validation_results;
create policy valres_write on public.validation_results for all
  using (public.is_admin() or public.has_perm('validation.manage'))
  with check (public.is_admin() or public.has_perm('validation.manage'));

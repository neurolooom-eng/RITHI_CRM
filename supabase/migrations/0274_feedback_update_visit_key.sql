-- ===========================================================================
-- 0274 — FEEDBACK TAKEN ON A VISIT IS ITS OWN KEY
--
-- Findings 57-67 (docs/PERMISSIONS_REVIEW.md), the user's decisions of
-- 2026-09-30: "63, 64: It should show the Individual View's Control Action and
-- its Check Box" -- each screen gets keys of its own, today's grants copied
-- across (0284) so nobody gains or loses anything on the day it ships -- and
-- "67: Break it down", with the old key kept as the PARENT of the new ones, so
-- a role holding it keeps everything until an administrator unticks it.
-- The parent rule itself is in has_perm() (0272, public.perm_parents).
--
-- This file: fb_update, which 0189 created, now asks visit.feedback -- the
-- child of each register's report key -- instead of calls.report.
-- ===========================================================================

drop policy if exists fb_update on public.feedback;
create policy fb_update on public.feedback for update
  using (public.has_perm('visit.feedback') or public.has_perm('feedback.view'))
  with check (public.has_perm('visit.feedback') or public.has_perm('feedback.view'));

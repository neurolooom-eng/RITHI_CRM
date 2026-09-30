-- ===========================================================================
-- 0282 — DELETING A TRACKER ITEM IS ITS OWN KEY
--
-- Findings 57-67 (docs/PERMISSIONS_REVIEW.md), the user's decisions of
-- 2026-09-30: "63, 64: It should show the Individual View's Control Action and
-- its Check Box" -- each screen gets keys of its own, today's grants copied
-- across (0284) so nobody gains or loses anything on the day it ships -- and
-- "67: Break it down", with the old key kept as the PARENT of the new ones, so
-- a role holding it keeps everything until an administrator unticks it.
-- The parent rule itself is in has_perm() (0272, public.perm_parents).
--
-- This file: everybody who opens the Tracker still adds and edits (the
-- user's design); deleting asks tracker.delete, copied by 0284 to every
-- role that holds the Tracker today.
-- ===========================================================================

drop policy if exists tracker_rw     on public.tracker_items;
drop policy if exists tracker_read   on public.tracker_items;
drop policy if exists tracker_insert on public.tracker_items;
drop policy if exists tracker_update on public.tracker_items;
drop policy if exists tracker_delete on public.tracker_items;
create policy tracker_read on public.tracker_items for select using (public.has_perm('mod:/tracker'));
create policy tracker_insert on public.tracker_items for insert with check (public.has_perm('mod:/tracker'));
create policy tracker_update on public.tracker_items for update
  using (public.has_perm('mod:/tracker')) with check (public.has_perm('mod:/tracker'));
create policy tracker_delete on public.tracker_items for delete
  using (public.has_perm('mod:/tracker') and public.has_perm('tracker.delete'));

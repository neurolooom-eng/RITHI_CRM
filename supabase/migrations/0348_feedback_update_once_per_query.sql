-- ===========================================================================
-- 0348 — fb_update ASKS THE PERMISSION ONCE PER QUERY  (D-132)
--
-- fb_update (0288) is has_perm('visit.feedback') OR has_perm('feedback.view')
-- unwrapped, so an UPDATE is checked once per row, and a FOR UPDATE policy is
-- also consulted when the rows to update are read -- the 0250 fault 0347 fixes
-- on fb_read and fb_write. Same audience, word for word; only wrapped.
-- Owned by data_integrity (0288), so it is here, after 0288.
-- ===========================================================================

drop policy if exists fb_update on public.feedback;
create policy fb_update on public.feedback for update
  using ((select public.has_perm('visit.feedback')) or (select public.has_perm('feedback.view')))
  with check ((select public.has_perm('visit.feedback')) or (select public.has_perm('feedback.view')));

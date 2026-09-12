-- ===========================================================================
-- 0177 — THE UPDATE LOG FOLLOWS THE REGISTER.
--
-- 0176 made reading the Field Failure Register its own right (`ffr.view`).
-- 0174 gated the change log on `ffr.manage`, which would now leave somebody
-- able to read a report but NOT what changed on it — and the log exists to be
-- read alongside the record it describes.
--
-- A FILE OF ITS OWN, and not a tidiness choice: `ffrh_read` is created by 0174
-- in the `data_integrity` module, while `ffr_read` belongs to `daily_review`.
-- One migration redefining both would sit in one module and be reverted by a
-- replay of the other — `check:bundles` refuses exactly that, and caught it
-- here before it shipped.
-- ===========================================================================

drop policy if exists ffrh_read on public.ffr_history;
create policy ffrh_read on public.ffr_history for select to authenticated
  using (
        (select public.has_perm('ffr.view'))
     or (select public.has_perm('ffr.manage'))
     or (select public.is_admin())
  );

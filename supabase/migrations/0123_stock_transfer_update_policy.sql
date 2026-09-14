-- ===========================================================================
-- 0123 — THE STOCK TRANSFER REGISTER HAS THE SAME HOLE THE FEEDBACK KEY HAD.
--
-- Found by the check written for the feedback fault (0189), which now asks the
-- second question as well as the first: not only "can PostgREST infer this
-- conflict target?" but "may the caller WRITE the row it infers?".
--
-- `stock_transfers` upserts on `uid` (the Stock Transfer Number from the
-- sheet), and 0020 gave the table a read policy and an insert policy and no
-- third. So the register loads perfectly the first time and stops dead on the
-- first repeated transfer number of a RE-LOAD, with the message the feedback
-- upload produced:
--
--     Your role does not have permission for this action.
--
-- It has not bitten yet only because nobody has re-loaded that register.
--
-- WHAT THIS DOES AND DOES NOT ALLOW, because it is a stock record and the
-- distinction is the whole argument:
--
--   * THE QUANTITIES ARE NOT HERE. A transfer's quantities live in
--     `stock_transfer_lines`, and that register declares NO conflict target at
--     all -- its own note says "No natural key -- a re-run ADDS rows rather
--     than correcting them". Nothing in this policy lets anybody rewrite a
--     quantity.
--   * THE AUDIENCE IS UNCHANGED. `st_insert` is `has_perm('stock.transfer')`
--     with no ownership test: whoever holds that right can already raise a
--     transfer between any two engineers. This lets the same people correct
--     the header of one. It grants no new person any new reach.
--   * WHAT IT DOES ALLOW is correcting `from_engineer` / `to_engineer` on an
--     existing header, which does change whose balance a transfer moves. That
--     is a real capability and is written here rather than buried, because the
--     alternative -- a register that cannot be re-loaded -- is worse and fails
--     opaquely.
--
-- Hand stock stays derived (issued - consumed +/- transfers - returns); nothing
-- about that changes.
-- ===========================================================================

drop policy if exists st_update on public.stock_transfers;
create policy st_update on public.stock_transfers for update
  using      (public.has_perm('stock.transfer'))
  with check (public.has_perm('stock.transfer'));

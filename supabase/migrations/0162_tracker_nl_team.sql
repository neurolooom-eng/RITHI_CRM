-- ===========================================================================
-- 0162 — the tracker's "With whom" never reads "Claude"; it reads "NL Team".
--
-- The user's instruction (2026-09-11): the assignee on a tracker item is a
-- TEAM, not a tool. Everyone reading the tracker is from the customer's side
-- of the table, and an item parked "with Claude" tells them nothing they can
-- chase — "NL Team" is a party they can ask.
--
-- Three seed migrations wrote 'Claude' into tracker_items.owner (0144, 0150,
-- 0157). Those are applied history and are not edited; this renames what they
-- left behind, and it must stay LAST in the `tracker` module of
-- scripts/build-apply-bundles.mjs — the bundles are replayed one at a time, so
-- if 0144 ran after this, 'Claude' would simply come back.
--
-- Idempotent: re-running it changes nothing once no row says 'Claude'.
-- ===========================================================================

update public.tracker_items
   set owner = 'NL Team',
       updated_at = now()
 where btrim(coalesce(owner, '')) ilike 'claude';

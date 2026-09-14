-- ===========================================================================
-- 0189 — A KEY WITHOUT AN UPDATE POLICY IS AN UPSERT THAT CANNOT UPSERT.
--
-- Reported from use, 2026-09-14, loading the feedback export once the key was
-- finally in place:
--
--     Your role does not have permission for this action. (row ~24093)
--     (24092 written before it stopped.)
--
-- 24,092 rows went in, so the key works. Then one row COLLIDED, the upsert
-- turned from an INSERT into an UPDATE, and `public.feedback` has no UPDATE
-- policy at all — 0001 gave it a read and an insert, 0008 narrowed those two to
-- rights, and nobody ever added the third because nothing ever updated a
-- feedback row.
--
-- THAT IS THE SHAPE OF THE FAULT, and it is worth stating plainly: giving a
-- table a conflict target CHANGES WHICH POLICY THE IMPORTER NEEDS. Before 0186
-- the feedback upload declared no key, so every row was an insert and the
-- missing UPDATE policy could never matter. The moment the key existed, the
-- first colliding row needed a permission nobody held — and it fails at the
-- ONE MOMENT an upsert is meant to earn its keep, which is the re-load.
--
-- `check:upserts` did not catch it because it checks the INDEX: it answers "can
-- PostgREST infer a conflict target?" and not "may the caller write the row it
-- infers?". It now asks both.
--
-- WHO MAY CORRECT A FEEDBACK: exactly whoever may file one. The audience is
-- copied from `fb_write` VERBATIM rather than widened — this grants no new
-- person any new reach, it lets the people who could already add a feedback
-- for a call replace the one that is there. That is the rule 0186 wrote down
-- and this is what makes it true:
--
--     "a second feedback for one call is a correction of the first, which is
--      the same rule the other registers use"
--
-- USING and WITH CHECK are BOTH given, and deliberately not left to default:
-- an UPDATE policy with no USING lets nobody update anything, which would have
-- fixed nothing while looking like a fix.
-- ===========================================================================

drop policy if exists fb_update on public.feedback;
create policy fb_update on public.feedback for update
  using       (public.has_perm('calls.report') or public.has_perm('feedback.view'))
  with check  (public.has_perm('calls.report') or public.has_perm('feedback.view'));

comment on table public.feedback is
  'Customer feedback, one row per call (ucn_key, 0186/0188). A second feedback for the same call REPLACES the first — that is what the key is for — so whoever may file one may correct one (fb_update, 0189). Without that policy the upload inserted until the first collision and then stopped, which is exactly when an upsert is supposed to work.';

-- ===========================================================================
-- 0186 — FEEDBACK IS KEYED ON THE CALL.
--
-- The user, 2026-09-13: "Feedback has KEY - Simply use it." They are right, and
-- the export proves it: v2Feedback - Merge has 24,749 rows and 24,748 DISTINCT
-- UC Numbers with ZERO repeats. One feedback per call is what the register has
-- always been; nothing was enforcing it.
--
-- Until now the upload declared no conflict target, so its own note admitted
-- "No natural key, so a re-run ADDS rows" — load the export twice and the
-- register holds it twice, with nothing to say which is current.
--
-- `ucn_key` is GENERATED and STORED so the index is a plain btree: an
-- expression index is not a target PostgREST can infer, which `check:upserts`
-- refuses for that reason.
--
-- AND THE INDEX IS NOT PARTIAL, which the first version of this file got wrong.
-- `where ucn_key <> ''` looks like the careful thing — key the rows that have a
-- UCN, leave the rest alone — but a PARTIAL index is not inferable either, and
-- check:upserts said so:
--
--     NO INFERABLE UNIQUE INDEX for (ucn_key) on feedback
--
-- So a blank UCN keys off ITS OWN ROW instead: `row-<id>`, which is unique by
-- construction and can never collide with another. The index covers every row,
-- PostgREST can infer it, and no feedback is deleted to tidy an index — which
-- is what a total index over a plain lower(ucn) would have forced, since every
-- blank would have collided with every other blank.
--
-- The importer requires the UCN anyway, so no blank row arrives that way. This
-- is about the ones already there.
-- ===========================================================================

alter table public.feedback
  add column if not exists ucn_key text generated always as
    (coalesce(nullif(lower(btrim(coalesce(ucn, ''))), ''), 'row-' || id)) stored;

-- Existing duplicates first, or the index cannot be built. The LATEST row wins:
-- a second feedback for one call is a correction of the first, which is the
-- same rule the other registers use. Blank-UCN rows are NOT touched — they are
-- not duplicates of each other, and deleting somebody's feedback because it
-- lacks a call number would be destroying a record to tidy an index.
delete from public.feedback a
 using public.feedback b
 where lower(btrim(coalesce(a.ucn, ''))) = lower(btrim(coalesce(b.ucn, '')))
   and lower(btrim(coalesce(a.ucn, ''))) <> ''
   and a.id < b.id;

create unique index if not exists feedback_ucn_key_uniq on public.feedback (ucn_key);

comment on index public.feedback_ucn_key_uniq is
  'One feedback per call. The v2Feedback export has 24,748 distinct UC Numbers in 24,749 rows and no repeats — the key was always there, nothing was using it, and a second load duplicated the register. A row with no UCN keys off its own id, so it is unique rather than colliding with every other blank.';

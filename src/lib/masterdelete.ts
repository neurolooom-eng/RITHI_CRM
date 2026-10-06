// ===========================================================================
// MAY THIS VALUE-LIST ENTRY BE DELETED? (D-056, FRS-015, FRS-180.6)
//
// The screen's half of 0409. The database refuses deleting a value that any
// record carries -- unless ANOTHER row of the same list holds the same word,
// because then nothing is orphaned (a complaint listed twice, once per
// product). The screen asks master_value_uses() first so it can offer
// Deactivate instead of a Delete that will be refused.
//
// The duplicate test is the trigger's own: same list, a different row, the
// value compared lower(btrim(...)).  `uses` is null when the count could not be
// read: the delete is then ASKED, and the database decides.
//
// Pure, imports nothing, so `check:ui` runs it.
// ===========================================================================

export type MasterDeleteDecision =
  | { kind: 'deactivate'; uses: number }   // in use, no twin: do not offer the delete
  | { kind: 'duplicate' }                  // another row holds the word: deletable
  | { kind: 'unused' }                     // no record carries it: deletable
  | { kind: 'unknown' };                   // count not read: ask, the database decides

const fold = (v: unknown) => String(v ?? '').trim().toLowerCase();

export function masterDeleteDecision(
  item: { id: number; value: string },
  list: readonly { id: number; value: string }[],
  uses: number | null,
): MasterDeleteDecision {
  if (list.some((o) => o.id !== item.id && fold(o.value) === fold(item.value))) return { kind: 'duplicate' };
  if (uses == null || !Number.isFinite(uses)) return { kind: 'unknown' };
  return uses > 0 ? { kind: 'deactivate', uses } : { kind: 'unused' };
}

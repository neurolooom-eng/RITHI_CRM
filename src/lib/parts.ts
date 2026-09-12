// ===========================================================================
// A SPARE'S CATALOGUE STRING — "CODE|Description" — SPLIT IN ONE PLACE.
//
// Only the CODE identifies a part; the description is what a person reads. The
// two travel together in one column, so anything showing them apart has to cut
// the string, and this is where that cut is made.
//
// LIFTED OUT OF dc.ts (2026-09-12) when the Field Failure desk's spares table
// needed the same split — it was showing "TOUCH PANEL|Touch panel assembly",
// pipe and all. `dc.ts` re-exports these unchanged, so the Delivery Challan and
// the Declaration are untouched; this is a move, not a rewrite.
//
// ONE PARSER, ONE MATCHER (CLAUDE.md): there used to be four date parsers here
// and they had started to disagree. The same was beginning with this string.
//
// ⚠️ A THIRD VARIANT STILL EXISTS and is deliberately left alone:
// `partDescription()` in handstock.ts returns '' where a string has NO pipe,
// while `partName()` below returns the whole string. That difference is not a
// bug in either — hand stock wants "the description, or nothing", a display
// column wants "whatever names this part" — but it is the kind of divergence
// worth knowing about before a third caller picks one at random.
// ===========================================================================

const s = (v: unknown) => String(v ?? '').trim();

/** The part code — everything before the pipe, upper-cased, because a code is
 *  a code however it was typed. The whole string when there is no pipe: a
 *  catalogue entry with no description is still a code. */
export const partCode = (part: unknown): string =>
  s(part).split('|')[0]!.trim().toUpperCase();

/** What a person reads. The whole string when there is no pipe — a part that
 *  carries only a code is better shown as that code than as a blank cell. */
export const partName = (part: unknown): string => {
  const t = s(part);
  const i = t.indexOf('|');
  return (i === -1 ? t : t.slice(i + 1)).trim();
};

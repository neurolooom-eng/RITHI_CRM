// ---------------------------------------------------------------------------
// ONE VISIT ID PER CALL, EVEN WHEN THE EXPORT GIVES SEVERAL CALLS ONE ID.
//
// Reported 2026-10-05 ("Right i had bulk call closure, so UID was maintained to
// be the same for all those"): AppSheet's bulk call closure files ONE visit row
// for several calls, so its export carries the SAME UID on every call it
// closed. `reports.uid` is the visit's key and the upsert target, so those rows
// collapsed into one: the last call in the file kept the visit and the others
// were dropped WITHOUT A WORD. The PM register lost 2,790 of 7,470 visits on
// every load, 26A01P0429 among them — Solved in AppSheet, Unattended here.
//
// THE RULE, and it is the one the user applied by hand in Excel, so a file
// fixed that way and a file left alone land on the SAME rows:
//   * a UID used by ONE call is kept exactly as it is;
//   * a UID used by SEVERAL calls becomes `UID|UCN` for each of them;
//   * a UID that already carries a `|` is left alone (already split).
// Deterministic, so a re-load updates the rows it wrote rather than adding new
// ones. Several rows with the same UID and the SAME call are one visit repeated
// and still collapse, as before.
//
// LIMIT, stated rather than hidden: the rule reads ONE file. A UID that is
// shared in one export but appears alone in a later, partial export is kept
// plain there and becomes a second visit of that call. Loading the full
// register, as is done today, does not hit it.
//
// A module of its own so Bulk Uploads and Bulk Report Mapping use ONE copy, and
// so `check:uploads` can test it without `supabase.ts`.
// ---------------------------------------------------------------------------

export const SPLIT_MARK = '|';

/** Split shared keys in place. Returns how many rows were given a per-call id. */
export function splitSharedKeys(rows: Record<string, unknown>[], key = 'uid', by = 'ucn'): number {
  const callsPerKey = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = String(r[key] ?? '').trim();
    const b = String(r[by] ?? '').trim();
    if (!k || !b || k.includes(SPLIT_MARK)) continue;
    if (!callsPerKey.has(k)) callsPerKey.set(k, new Set());
    callsPerKey.get(k)!.add(b);
  }
  let split = 0;
  for (const r of rows) {
    const k = String(r[key] ?? '').trim();
    const b = String(r[by] ?? '').trim();
    if ((callsPerKey.get(k)?.size ?? 0) > 1) { r[key] = `${k}${SPLIT_MARK}${b}`; split += 1; }
  }
  return split;
}

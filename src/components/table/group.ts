// ---------------------------------------------------------------------------
// Grouping a register — "engineer wise" and whatever else a screen offers.
//
// Its own module so it can be checked without dragging the whole app in: the
// rule worth pinning down is the ORDER, and that is testable on its own.
// ---------------------------------------------------------------------------

/** The blank group's heading. A row with nobody on it is a real answer. */
export const NO_GROUP = '—';

/** Rows in groups, keeping the order they arrive in INSIDE each group so
 *  whatever sort is on still holds. Groups themselves come out alphabetically
 *  with the blank one LAST — "not allotted yet" belongs at the end of the
 *  register, not at the top under an empty heading. */
export function groupRowsBy<T>(rows: T[], key: string): [string, T[]][] {
  const by = new Map<string, T[]>();
  rows.forEach((r) => {
    const k = String((r as Record<string, unknown>)[key] ?? '').trim() || NO_GROUP;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(r);
  });
  return [...by.entries()].sort(([a], [b]) =>
    (a === NO_GROUP ? 1 : b === NO_GROUP ? -1 : a.localeCompare(b)));
}

// ---------------------------------------------------------------------------
// Grouping a register — "engineer wise", "region then engineer then status",
// and whatever else a screen offers.
//
// Its own module so it can be checked without dragging the whole app in: the
// rules worth pinning down are the ORDER and the NESTING, and both are testable
// on their own.
// ---------------------------------------------------------------------------

/** The blank group's heading. A row with nobody on it is a real answer. */
export const NO_GROUP = '—';

const valueOf = (row: unknown, key: string) =>
  String((row as Record<string, unknown>)[key] ?? '').trim() || NO_GROUP;

/** Rows in groups, keeping the order they arrive in INSIDE each group so
 *  whatever sort is on still holds. Groups themselves come out alphabetically
 *  with the blank one LAST — "not allotted yet" belongs at the end of the
 *  register, not at the top under an empty heading. */
export function groupRowsBy<T>(rows: T[], key: string): [string, T[]][] {
  const by = new Map<string, T[]>();
  rows.forEach((r) => {
    const k = valueOf(r, key);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(r);
  });
  return [...by.entries()].sort(([a], [b]) =>
    (a === NO_GROUP ? 1 : b === NO_GROUP ? -1 : a.localeCompare(b)));
}

export interface GroupNode<T> {
  /** The value this node groups on — one engineer, one region, one status. */
  name: string;
  /** Its full path, so a collapsed node is remembered independently of a
   *  same-named node under a different parent (two regions both have a
   *  "Solved"). */
  path: string;
  depth: number;
  /** Every row beneath this node, at any depth — what the count shows. */
  rows: T[];
  /** null at the last level: its rows are the ones to draw. */
  children: GroupNode<T>[] | null;
}

/** The same rule, nested: group by the first key, then group each of those by
 *  the second, and so on. An empty key list means no grouping at all. */
export function groupTree<T>(rows: T[], keys: string[], parentPath = '', depth = 0): GroupNode<T>[] {
  const [key, ...rest] = keys;
  if (!key) return [];
  return groupRowsBy(rows, key).map(([name, inGroup]) => {
    const path = parentPath ? `${parentPath} › ${name}` : name;
    return {
      name,
      path,
      depth,
      rows: inGroup,
      children: rest.length ? groupTree(inGroup, rest, path, depth + 1) : null,
    };
  });
}

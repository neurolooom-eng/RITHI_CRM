// ---------------------------------------------------------------------------
// Matching a file's HEADERS to the names an importer knows.
//
// Three passes, and the order is the point:
//   strict  tidies whitespace and underscores only
//   loose   also drops punctuation and bracketed suffixes — `Death?`,
//           `WARRANTY FAILURE (1YR)` and `PO No.` are not different columns
//           from the same names without their decoration
//   squash  letters and digits only, so `E-Mail ID` and `Email ID` are one
//
// Loosening alone is not safe: the Installation Call export carries BOTH
// `Warranty Start Date` and `Warranty Start Date?`, which loosen to the same
// thing — and matching loosely in one pass bound the label instead of the
// date. So an exact name always wins over a loosened one, and within a pass
// the earlier column in the file wins. Shared by every importer so they cannot
// disagree about which header is which.
// ---------------------------------------------------------------------------
export const strict = (h: string) => h.trim().toLowerCase().replace(/[\s_]+/g, ' ').trim();
export const loose = (h: string) => h.trim().toLowerCase()
  .replace(/\([^)]*\)/g, ' ')
  .replace(/[?.!:;#*'"]/g, '')
  .replace(/[\s_/,-]+/g, ' ').trim();
export const squash = (h: string) => loose(h).replace(/[^a-z0-9]/g, '');

/** The first header (in file order) that an alias matches, strictest pass first. */
export function findHeader(headers: string[], alias: string): string | undefined {
  const first = (fn: (h: string) => string) => { const w = fn(alias); return headers.find((h) => fn(h) === w); };
  return first(strict) ?? first(loose) ?? first(squash);
}

/** The first of several aliases that the file has, in alias-priority order. */
export function findHeaderFor(headers: string[], aliases: string[]): string | undefined {
  for (const a of aliases) { const h = findHeader(headers, a); if (h) return h; }
  return undefined;
}

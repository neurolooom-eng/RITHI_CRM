import { pickHeaderRow } from './headers';

// Minimal CSV/TSV parser: quotes, doubled quotes, the delimiter, CR/LF. One
// copy — every importer reads a file through this, so a quoting edge case is
// fixed once.

/** Tab or comma, decided by the file rather than by its extension.
 *
 *  A tab-separated export is still called ".csv" as often as not, and a sheet
 *  saved as TSV read through a comma parser is not an error — it is ONE column
 *  per row, which reads on screen as "no columns matched" and sends somebody
 *  looking at their headings. Only the first few lines are weighed, and a tab
 *  has to actually beat the commas, so a comma file carrying a stray tab in a
 *  cell is unaffected. */
export function pickDelimiter(text: string): string {
  const head = text.slice(0, 20000).split('\n').slice(0, 5).join('\n');
  const tabs = (head.match(/\t/g) || []).length;
  const commas = (head.match(/,/g) || []).length;
  return tabs > commas ? '\t' : ',';
}

/** The file as rows of cells, nothing interpreted. */
export function parseRows(text: string, delimiter = pickDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Rows keyed by heading.
 *
 *  `aliases` — every column name the importer knows — lets the header row be
 *  FOUND rather than assumed to be the first. A register printed for filing
 *  carries its letterhead above the headings (the Field Failure Register has
 *  three such rows: the company, the title, and PAGE NO), and reading row 1 as
 *  the headings matched nothing at all: the required column was "missing" and
 *  every row was skipped, with the file looking like the thing at fault.
 *  Without aliases the first row is used, exactly as before. */
export function parseCSV(text: string, opts?: { aliases?: string[] }): Record<string, string>[] {
  const rows = parseRows(text);
  if (!rows.length) return [];

  const at = opts?.aliases?.length ? pickHeaderRow(rows, opts.aliases) : 0;
  const headers = (rows[at] ?? []).map((h) => h.replace(/\s+/g, ' ').trim());

  // FIRST OCCURRENCE WINS where a heading repeats, matching the rule in
  // headers.ts that the earlier column in the file wins. Object.fromEntries
  // takes the LAST, and these sheets carry "FFR Date" twice — the real date in
  // column 6 and a month label ("Feb 2021") in column 39 — so the last-wins
  // default parsed every date in five years from the month alone, losing the
  // day silently on every row.
  //
  // THE LATER ONE IS KEPT UNDER A SUFFIXED NAME rather than dropped. It used to
  // be dropped, and that loses real columns: the Party Master export carries
  // `Tel 1`, `Tel 2`, `Fax` and `Email ID` TWICE — once for the installation
  // address and once for the billing address — so four of its twenty-five
  // columns reached no importer at all, not even `extra`, on a file whose whole
  // point was that every field is retained. A repeat now becomes "Email ID (2)".
  //
  // It cannot steal a mapped column from the first: `findHeader` tries `strict`
  // across every heading before it tries `loose`, and only `loose` discards a
  // bracketed suffix — so the unsuffixed heading is always matched first, and
  // the FFR's month label stays where it was. What changes is only that the
  // second column now ARRIVES, under a name that says which it is.
  const idx = new Map<string, number>();
  const seen = new Map<string, number>();
  headers.forEach((h, i) => {
    if (!h) return;
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    const key = n === 1 ? h : `${h} (${n})`;
    if (!idx.has(key)) idx.set(key, i);
  });

  return rows.slice(at + 1)
    .filter((r) => r.some((v) => String(v).trim() !== ''))
    .map((r) => Object.fromEntries([...idx].map(([h, i]) => [h, r[i] ?? ''])));
}

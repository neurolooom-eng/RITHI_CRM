// ---------------------------------------------------------------------------
// THE LEGACY IMPORTER'S DECISIONS, kept apart from the reads and writes that
// carry them out (D-071, FRS-201.4 / .6 / .7).
//
// A module of its own for the reason `uploads.ts` holds the Bulk Uploads
// planners: `supabase.ts` and `dataImport.ts` read `import.meta.env`, so
// nothing in them can be run as behaviour by a node check. What is here can,
// and `check:ui` runs it.
//
// THE USER'S DECISION (2026-10-12): a row the register already holds is
// OVERWRITTEN WITH THE FILE ("Overwrite with the file"), not added a second
// time and not skipped.
// ---------------------------------------------------------------------------
import { partCode } from './parts';

/** One person on the User Master, as matched: name, case and spacing aside. */
export const personKey = (name: unknown): string =>
  String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export interface DirectoryRow { id: number; name: string; extra?: Record<string, unknown> | null }

export interface DirectoryPlan {
  /** People the User Master does not have yet. */
  inserts: Record<string, unknown>[];
  /** People it has, by id, with ONLY the columns the file carries. */
  updates: { id: number; name: string; patch: Record<string, unknown> }[];
  /** Not loaded, with why. */
  held: { name: string; why: string }[];
  /** Loaded, but worth saying -- a name the file carries more than once. */
  notes: string[];
}

/**
 * A User Master file against the User Master.
 *
 * `present` is the list of columns the FILE has a heading for. A person already
 * listed takes the file's value for those columns and keeps every other one --
 * an absent heading is not a blank -- and keeps their name exactly as it is
 * spelled now, because a changed name is a RENAME, which carries every record
 * filed under it (0259) and is not something a re-import should do by changing
 * a capital letter. `extra` is merged, the file's keys over the stored ones.
 *
 * A name the User Master holds MORE THAN ONCE is not overwritten: which row is
 * meant cannot be told, so it is held back by name for somebody to resolve
 * there. A name the file holds more than once is loaded once, from its LAST
 * row, and said.
 */
export function planDirectory(
  rows: Record<string, unknown>[], present: string[], existing: DirectoryRow[],
): DirectoryPlan {
  const have = new Map<string, DirectoryRow[]>();
  existing.forEach((r) => {
    const k = personKey(r.name);
    if (!k) return;
    have.set(k, [...(have.get(k) ?? []), r]);
  });
  const last = new Map<string, Record<string, unknown>>();
  const times = new Map<string, number>();
  rows.forEach((r) => {
    const k = personKey(r.name);
    if (!k) return;
    last.set(k, r);
    times.set(k, (times.get(k) ?? 0) + 1);
  });
  const cols = present.filter((c) => c !== 'name' && c !== 'extra');
  const out: DirectoryPlan = { inserts: [], updates: [], held: [], notes: [] };
  for (const [k, r] of last) {
    const name = String(r.name ?? '').trim();
    const n = times.get(k) ?? 1;
    if (n > 1) out.notes.push(`${name} is in the file ${n} times — its last row is the one loaded`);
    const match = have.get(k) ?? [];
    if (match.length > 1) {
      out.held.push({ name, why: `on the User Master ${match.length} times, so which one to overwrite cannot be told — not loaded; resolve it on the User Master` });
      continue;
    }
    if (!match.length) { out.inserts.push(r); continue; }
    const patch: Record<string, unknown> = {};
    cols.forEach((c) => { if (c in r) patch[c] = r[c]; });
    const fileExtra = (r.extra ?? {}) as Record<string, unknown>;
    if (Object.keys(fileExtra).length) patch.extra = { ...(match[0]!.extra ?? {}), ...fileExtra };
    out.updates.push({ id: match[0]!.id, name: match[0]!.name, patch });
  }
  return out;
}

/** The MRN key, as the database builds it (0455): SI Number + part code + line. */
export const mrnKey = (r: Record<string, unknown>): string =>
  `${String(r.uid ?? '').trim()}\u0000${partCode(r.part)}\u0000${String(r.row_no ?? '')}`;

/** How many of `rows` the register already holds under `key`, and how many are new. */
export function splitByKey(
  rows: Record<string, unknown>[], key: (r: Record<string, unknown>) => string, existing: Set<string>,
): { fresh: number; overwrite: number } {
  let overwrite = 0;
  rows.forEach((r) => { if (existing.has(key(r))) overwrite++; });
  return { fresh: rows.length - overwrite, overwrite };
}

export interface FilePlanLine {
  file: string;
  table: string;
  /** Rows the file carries. */
  inFile: number;
  /** Rows that will be written as new records. */
  fresh: number;
  /** Rows that will overwrite a record already there. */
  overwrite: number;
  /** Rows not loaded, with why where it is known. */
  held: number;
  why?: string[];
}

/** The question the importer asks before it writes anything (FRS-201.4). */
export function legacyConfirmText(lines: FilePlanLine[], coverFollows: boolean): string {
  const each = lines.map((l) => {
    const parts = [`${l.fresh} new`, `${l.overwrite} already there — overwritten with the file's values`];
    if (l.held) parts.push(`${l.held} not loaded`);
    const why = (l.why ?? []).slice(0, 8).map((w) => `      · ${w}`).join('\n');
    const more = (l.why ?? []).length > 8 ? `\n      · and ${(l.why ?? []).length - 8} more` : '';
    return `• ${l.file} → ${l.table}: ${l.inFile} row(s) in the file; ${parts.join('; ')}.${why ? `\n${why}${more}` : ''}`;
  }).join('\n');
  const total = lines.reduce((a, l) => a + l.fresh + l.overwrite, 0);
  return `Write ${total} row(s)?\n\n${each}\n\nRows already there are matched on their key, so loading the same file again overwrites them rather than adding them a second time.`
    + (coverFollows ? '\n\nNormalise cover follows the sale / contract files; it will say what it hands back and ask again before it runs.' : '');
}

export interface UnpinCount { register: string; field: string; n: number }

/** What Normalise cover will hand back, said before it runs (URS-072, FRS-201.7). */
export function normaliseQuestion(counts: UnpinCount[]): string {
  const total = counts.reduce((a, c) => a + Number(c.n), 0);
  if (!total) return 'Normalise cover: no machine-line value repeats its entry, so nothing will be handed back; machine cover is still refreshed. Run it?';
  const by = (reg: string) => counts.filter((c) => c.register === reg)
    .map((c) => `${c.field} ${Number(c.n)}`).join(', ');
  const w = by('Warranty'); const c = by('Contract');
  return `Normalise cover will hand ${total} machine-line value(s) back to their entry:\n`
    + (w ? `\n• Warranty: ${w}` : '') + (c ? `\n• Contract: ${c}` : '')
    + '\n\nEach of these equals its entry\'s value today, so nothing shown changes now. But the line stops holding its own value: the next change to the entry changes the machine too. There is no undo. Run it?';
}

// ===========================================================================
// WHAT A CELL LOOKS LIKE ON THE WAY OUT — the mailed export's half of a rule
// the browser's export already keeps.
//
// A DOWNLOAD IS NOT THE WIRE. `2026-09-18T08:51:02.55+00:00` in a spreadsheet
// is a string nobody can sort, and printing the front of it puts the wrong
// TIME on the row and, before 05:30, the wrong DAY. The application has one
// formatter for this (`formatDayTime` in src/lib/dates.ts) and this is a
// deliberate second copy, for the reason zip.ts is: this runs in Deno on
// Supabase and cannot import the browser bundle.
//
// ONE DIFFERENCE, AND IT IS THE HONEST ONE. The browser's version shows an
// instant "where the reader is", because it is standing in the reader's
// timezone. A scheduled job is standing in UTC and has no reader in front of
// it, so it would print every timestamp five and a half hours early and look
// perfectly correct doing it. This one names Asia/Kolkata — where the people
// opening the mail are, and the zone the schedules themselves are set in.
// `npm run check:scheduled-export` holds both halves against each other.
// ===========================================================================

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Minutes east of UTC. India has no daylight saving, so this is a constant
 *  rather than a lookup — and no scheduled time here is ever ambiguous. */
export const IST_MINUTES = 330;

const ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

export function dayTime(v: unknown): string {
  const raw = String(v ?? '').trim();
  if (!raw) return '';

  // Date only — no time was recorded, so none is invented.
  const dOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dOnly) return `${dOnly[3]}-${MONTH_NAMES[Number(dOnly[2]) - 1] ?? dOnly[2]}-${dOnly[1]}`;

  // Anchored at BOTH ends: a remark that merely begins with a date
  // ("2026-09-18 pump replaced") is text and must survive untouched.
  const m = ISO.exec(raw);
  if (!m) return raw;

  const [, y, mo, d, hh, mi, ss, zone] = m;
  if (zone) {
    const t = Date.parse(raw);
    if (Number.isNaN(t)) return raw;
    const ist = new Date(t + IST_MINUTES * 60000);
    return `${pad(ist.getUTCDate())}-${MONTH_NAMES[ist.getUTCMonth()]}-${ist.getUTCFullYear()}`
      + ` ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`;
  }
  // No offset: a wall clock already written down. Printed as written.
  return `${d}-${MONTH_NAMES[Number(mo) - 1] ?? mo}-${y} ${hh}:${mi}:${ss ?? '00'}`;
}

/** One cell. A structured column goes out as it is stored, because inventing a
 *  flattening for it would make the export disagree with the database. */
export function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return dayTime(v);
}

// RFC 4180, every field quoted — the same rule as src/lib/csv.ts. Quoting
// unconditionally costs two bytes a field, which a compressor gives straight
// back, and removes the whole class of "it was fine until somebody typed a
// comma in a complaint".
export const csvField = (v: unknown) => `"${cell(v).replace(/"/g, '""')}"`;

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvField(r[c])).join(','));
  return lines.join('\r\n');
}

/** The columns of a set of rows, in first-seen order — a table's own column
 *  order, which is what somebody comparing two exports expects to see. A row
 *  PostgREST sends omits nothing, but a view can return a null-only column and
 *  the union across rows is what keeps it in the file. */
export function columnsOf(rows: Record<string, unknown>[]): string[] {
  const seen: string[] = [];
  const have = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (!have.has(k)) { have.add(k); seen.push(k); }
  return seen;
}

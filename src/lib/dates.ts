// ---------------------------------------------------------------------------
// ONE date parser for every import.
//
// There were four — coverImport, dataImport, uploads and reportMapping each
// carried its own — and they had started to disagree: one read space-separated
// "08 06 2026" and the others did not; one wrote a wall-clock time as if it
// were UTC and two built a local Date. Four copies of "day first, always" is
// four chances for one of them to quietly stop being day-first.
//
// The shapes these exports actually use:
//   2026-09-03                 ISO
//   03-September-2026          day, full or short month name, year (any separator)
//   08 06 2026                 day month year, SPACE separated (the Visit Date)
//   03/09/2026                 day first, ALWAYS: these are Indian exports, and
//                              reading 03/04 as 4 March moves a visit a month
// with an optional hh:mm[:ss] after any of them.
//
// Pure, and its own module, so it can be checked without the app.
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

export interface DateParts { y: number; mo: number; d: number; hh: number; mi: number; ss: number; hasTime: boolean }

export function parseDateParts(v: unknown): DateParts | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const t = /[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  const time = { hh: Number(t?.[1] ?? 0), mi: Number(t?.[2] ?? 0), ss: Number(t?.[3] ?? 0), hasTime: !!t };

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return { y: +m[1], mo: +m[2], d: +m[3], ...time };

  m = /^(\d{1,2})[-/. ]([A-Za-z]{3,})[-/. ](\d{4})/.exec(s);
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return { y: +m[3], mo, d: +m[1], ...time }; }

  m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})/.exec(s);
  if (m) { const mo = +m[2]; if (mo >= 1 && mo <= 12) return { y: +m[3], mo, d: +m[1], ...time }; }

  return null;
}

/** 'yyyy-mm-dd', or null. Never a half-parsed guess. */
export function toIsoDate(v: unknown): string | null {
  const p = parseDateParts(v);
  return p ? `${p.y}-${pad(p.mo)}-${pad(p.d)}` : null;
}

// How a WALL-CLOCK time in an export becomes an instant.
//
//   'local'  the time is read in the browser's own timezone — right when the
//            person uploading is where the export was made (IST for IST)
//   'utc'    the time is written as if it were already UTC — what the cover
//            importer has always done, kept until the choice is confirmed
//
// The two differ by the timezone offset (5½ h for India). This is the one open
// disagreement between the old parsers; it is a parameter here so it is visible
// and settled in one place rather than silently one way in one file and the
// other way in the next.
export type TimestampAs = 'local' | 'utc';

export function toIsoTimestamp(v: unknown, as: TimestampAs = 'local'): string | null {
  const p = parseDateParts(v);
  if (!p) return null;
  if (as === 'utc') return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mi)}:${pad(p.ss)}Z`;
  const dt = new Date(p.y, p.mo - 1, p.d, p.hh, p.mi, p.ss);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

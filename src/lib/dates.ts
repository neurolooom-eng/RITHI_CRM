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
//   02 Jul 26                  ...and the same with a TWO-DIGIT year
//   08 06 2026                 day month year, SPACE separated (the Visit Date)
//   03/09/2026                 day first, ALWAYS: these are Indian exports, and
//                              reading 03/04 as 4 March moves a visit a month
// with an optional hh:mm[:ss] after any of them.
//
// A two-digit year is read on the usual pivot: 00-68 is 2000s, 69-99 is 1900s.
// Refusing them was not neutral — one consumption export writes "02 Jul 26" and
// every one of its 8,356 rows came back unparsed, which meant the visit date was
// dropped and the row silently took today's date instead.
//
// Pure, and its own module, so it can be checked without the app.
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

// '26' -> 2026, '99' -> 1999. Only ever applied to a 2-digit group; a 4-digit
// year is used as written.
const fullYear = (y: string) => (y.length === 4 ? +y : +y <= 68 ? 2000 + +y : 1900 + +y);

export interface DateParts { y: number; mo: number; d: number; hh: number; mi: number; ss: number; hasTime: boolean }

export function parseDateParts(v: unknown): DateParts | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const t = /[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  const time = { hh: Number(t?.[1] ?? 0), mi: Number(t?.[2] ?? 0), ss: Number(t?.[3] ?? 0), hasTime: !!t };

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return { y: +m[1], mo: +m[2], d: +m[3], ...time };

  m = /^(\d{1,2})[-/. ]([A-Za-z]{3,})[-/. ](\d{4}|\d{2})\b/.exec(s);
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return { y: fullYear(m[3]), mo, d: +m[1], ...time }; }

  // All-numeric needs a FOUR-digit year: "03/04/26" could be day/month/year or
  // year/month/day and there is nothing in it to say which, so it is refused
  // rather than guessed. A month name removes that ambiguity, which is why the
  // rule above accepts two digits and this one does not.
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
//   'utc'    the time is written as if it were already UTC
//
// The two differ by the timezone offset (5½ h for India). SETTLED with the user
// 2026-09-03: every importer reads 'local'. 'utc' stays available for a file
// that genuinely carries UTC, but nothing in the app uses it today.
export type TimestampAs = 'local' | 'utc';

export function toIsoTimestamp(v: unknown, as: TimestampAs = 'local'): string | null {
  const p = parseDateParts(v);
  if (!p) return null;
  if (as === 'utc') return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mi)}:${pad(p.ss)}Z`;
  const dt = new Date(p.y, p.mo - 1, p.d, p.hh, p.mi, p.ss);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

// For DISPLAY: anything the app is asked to render as a date. ISO and full
// timestamps go straight to Date (they are unambiguous); anything else is read
// day-first through the same parser the imports use, so "03/04/2026" on a
// visit's report reads as 3 April — the same day the import would have stored.
// Settled with the user 2026-09-03: day-first everywhere, display included.
export function parseAnyDate(v: unknown): Date | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; }
  const p = parseDateParts(s);
  if (p) { const d = new Date(p.y, p.mo - 1, p.d, p.hh, p.mi, p.ss); return Number.isNaN(d.getTime()) ? null : d; }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// The DAY an instant happened, as the person who was there would name it.
//
// `toIsoDate` reads the date out of the string as written, which for a stored
// timestamp is its UTC date: a request logged at 01:00 IST is written
// "…T19:30:00+00:00" the day before, and reading the front of that string dates
// the request to yesterday. Anything carrying an offset or a Z is therefore
// converted through the browser's own calendar; everything else — a plain
// `yyyy-mm-dd`, a day-first export — is left to `toIsoDate`, which must not be
// shifted by a timezone it never had.
export function localIsoDate(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (/[T ]\d{1,2}:\d{2}/.test(s) && /(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
  }
  return toIsoDate(s);
}

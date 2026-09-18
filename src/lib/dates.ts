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

/** Does a COLUMN of values prove itself month-first (3/28/2016 = 28 March)?
 *
 *  Day-first is this project's rule and stays the default. But a file can PROVE
 *  it is written the other way: "3/28/2016" has 28 in the month position, which
 *  no day-first date ever does. The 2016 Field Failure Register is such a file,
 *  and every other year of it is `28-Mar-2016`, which is not ambiguous at all.
 *
 *  EVIDENCE, NOT A SETTING, and the whole column or nothing. It answers yes only
 *  when some value is impossible as day-first AND none is impossible as
 *  month-first — a column carrying both is contradictory, and the honest answer
 *  there is to leave the rule alone and let the impossible dates fail loudly.
 *  This is why it takes the values rather than one string: a single "3/4/2016"
 *  proves nothing, and guessing per value would read two rows of one column by
 *  two different rules. */
export function isMonthFirst(values: readonly unknown[]): boolean {
  let provesMonthFirst = 0, provesDayFirst = 0;
  for (const v of values) {
    const m = /^\s*(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})/.exec(String(v ?? '').trim());
    if (!m) continue;
    const a = +m[1], b = +m[2];
    if (b > 12 && a <= 12) provesMonthFirst++;
    if (a > 12 && b <= 12) provesDayFirst++;
  }
  return provesMonthFirst > 0 && provesDayFirst === 0;
}

export interface DateOpts { monthFirst?: boolean }

export function parseDateParts(v: unknown, opts?: DateOpts): DateParts | null {
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
  if (m) {
    // Day-first unless the CALLER has established otherwise for the whole
    // column — see isMonthFirst. Never decided from this value alone.
    const mo = opts?.monthFirst ? +m[1] : +m[2];
    const d = opts?.monthFirst ? +m[2] : +m[1];
    if (mo >= 1 && mo <= 12) return { y: +m[3], mo, d, ...time };
  }

  return null;
}

/** 'yyyy-mm-dd', or null. Never a half-parsed guess. */
export function toIsoDate(v: unknown, opts?: DateOpts): string | null {
  const p = parseDateParts(v, opts);
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

export function toIsoTimestamp(v: unknown, as: TimestampAs = 'local', opts?: DateOpts): string | null {
  const p = parseDateParts(v, opts);
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


// ---------------------------------------------------------------------------
// CONTRACT PERIODS — the arithmetic a renewal turns on.
//
// Here rather than in cover.ts for the reason at the top of this file: date
// logic lives in one place. It is also the only way to TEST it — cover.ts
// reaches the Supabase client, which cannot be imported into a node check.
//
// NO GAP AND NO OVERLAP is the property both of these exist to keep.
// `machine_cover` answers "what is this serial under today?", and two contracts
// covering the same day makes that ambiguous — so a renewal starts the day
// AFTER the old one ends, and a period ends the day BEFORE its anniversary.
// A one-year contract from 01-Apr-2026 ends 31-Mar-2027, and its renewal
// starts 01-Apr-2027.
// ---------------------------------------------------------------------------

/** The day after `iso`, as yyyy-mm-dd. Empty for anything unparseable — a
 *  renewal should propose nothing rather than a date built out of a guess. */
export function dayAfter(iso: string): string {
  const d = new Date(`${String(iso ?? '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

/** `start` plus a period, minus one day. No period gives '' — an unknown end
 *  date, which is not the same as a zero-day contract. */
export function addPeriod(startIso: string, years: number, months: number): string {
  const d = new Date(`${String(startIso ?? '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const y = Math.max(0, Math.floor(years || 0));
  const m = Math.max(0, Math.floor(months || 0));
  if (!y && !m) return '';
  d.setFullYear(d.getFullYear() + y);
  d.setMonth(d.getMonth() + m);
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

/** Local yyyy-mm-dd. toISOString() would shift a date across midnight in any
 *  timezone east of UTC, which is every one this system runs in. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// DISPLAYING A DATE — dd-MMM-yyyy, day first, one place.
//
// The user, 2026-09-15: "Update the date formats." A Field Call drawer showed
// "Call Registration Date 2026-09-12" beside "Complaint Date 09/11/2026" — one
// ISO, one whatever the browser's locale makes of a native date input — and
// 09/11 is either 9 November or 11 September depending on which of the two you
// think you are reading. On a record of when a device failed, that is not a
// cosmetic difference.
//
// `dd-MMM-yyyy` rather than `dd/mm/yyyy` because a NAMED month cannot be read
// the other way round by anybody, whatever they are used to. This file is
// already the one parser (day-first, always); it is now the one formatter too,
// for the same reason there is one parser: there used to be four and they had
// started to disagree.
// ---------------------------------------------------------------------------
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-09-12` → `12-Sep-2026`. Anything this cannot read comes back EXACTLY
 *  as it arrived — a value that is not a date is not improved by being
 *  rewritten, and showing it unchanged is what lets somebody see it is wrong. */
/** THE SAME INSTANT AS A NUMBER EXCEL UNDERSTANDS — days since 1899-12-30.
 *
 *  Reported from use (2026-09-18): *"those Date Fields are not Complaint with
 *  the Long Date Format of Excel"*. `formatDayTime` produces a correct-LOOKING
 *  string, and a string is all Excel sees: it cannot sort it, filter it by
 *  month, subtract one from another, or apply its own Long Date to it. A
 *  spreadsheet column of dates that is really text is worse than it looks,
 *  because every one of those operations quietly gives the wrong answer rather
 *  than refusing.
 *
 *  THE SERIAL CARRIES THE LOCAL WALL CLOCK, deliberately. The cell holds a bare
 *  number with no timezone in it, so whatever is encoded is what Excel shows —
 *  and the reader is in the office, not in UTC. This converts through the
 *  browser's own calendar first (the same choice `formatDayTime` makes), then
 *  encodes those local components. Encoding the UTC instant instead would put
 *  the number back an hour or five and lose the whole point of the conversion.
 *
 *  Returns null for anything that is not a date, so the caller writes it as
 *  text — a part code must never become a number.
 *
 *  1899-12-30 rather than 1900-01-01 is not an error: Excel believes 1900 was a
 *  leap year, and the two-day offset is the standard way to agree with it. */
export function excelSerial(v: unknown): number | null {
  const raw = String(v ?? '').trim();
  if (!raw) return null;

  // IT USES THE SAME STRICT TEST AS `formatDayTime`, NOT `parseAnyDate`.
  // The first version reached for `parseAnyDate` — the lenient DISPLAY parser,
  // which falls through to `new Date(s)` — and turned the part code `MP-010`
  // into the serial 37165. In a spreadsheet that is not a wrong-looking string,
  // it is a NUMBER under a date format: the column stops being a part code
  // silently. Found by building a workbook and reading the bytes, which is the
  // only way it was ever going to show up.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    // WHOLE DAYS, no fraction. Going through `new Date('2026-09-18')` parses it
    // as UTC midnight and then reads it back in local time, which added 05:30
    // to every date-only value in India — a date that is really 05:30.
    return Date.UTC(+y, +mo - 1, +d) / 86400000 + 25569;
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/
    .exec(raw);
  if (!m) return null;

  const [, y, mo, d, hh, mi, ss, zone] = m;
  if (zone) {
    // It names an instant: show it where the reader is, then encode THOSE
    // components — a bare serial has no timezone, so what is encoded is what
    // Excel displays.
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return null;
    return Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate(),
                    dt.getHours(), dt.getMinutes(), dt.getSeconds()) / 86400000 + 25569;
  }
  // No offset: a wall clock already written down, encoded as written.
  return Date.UTC(+y, +mo - 1, +d, +hh, +mi, ss ? +ss : 0) / 86400000 + 25569;
}

/** Does this value carry a TIME, or is it a date on its own? Decides which
 *  number format the cell gets: a date-only value must not gain a 00:00:00. */
export function hasClockTime(v: unknown): boolean {
  return /[T ]\d{1,2}:\d{2}/.test(String(v ?? '').trim());
}

/** A TIMESTAMP AS A PERSON READS IT: `18-Sep-2026 14:21:02`.
 *
 *  Reported from use (2026-09-18): the Consumption Report download carried
 *  `2026-09-18T08:51:02.55+00:00` — the wire format, straight out of PostgREST,
 *  in a file somebody opens in Excel. The month is named here for the same
 *  reason `formatDay` names it: `09-18` and `18-09` are the same eight
 *  characters read two ways, and a report that crosses a desk cannot rely on
 *  the reader guessing which.
 *
 *  IT SHOWS THE INSTANT IN THE READER'S OWN TIME, and that is the whole point
 *  of the conversion rather than a tidy-up of the text. The database stores UTC:
 *  a spare booked at 14:21 in India is written `T08:51:02+00:00`. Printing the
 *  front of that string would put the wrong TIME on the row, and for anything
 *  logged before 05:30 IST the wrong DAY as well — the same trap `localIsoDate`
 *  exists for.
 *
 *  A VALUE CARRYING NO OFFSET IS NOT SHIFTED. `2026-09-18 08:51:02` is a wall
 *  clock somebody already wrote down; moving it by the browser's timezone would
 *  invent an hour it never had.
 *
 *  A DATE WITH NO TIME STAYS A DATE. `2026-09-18` becomes `18-Sep-2026`, not
 *  `18-Sep-2026 00:00:00` — a midnight nobody recorded reads as a real instant.
 *
 *  Anything this cannot read comes back EXACTLY as it arrived, the same
 *  contract as `formatDay`: a value that is not a date is not improved by being
 *  rewritten, and leaving it is what lets somebody see it is wrong. */
export function formatDayTime(v: unknown): string {
  const raw = String(v ?? '').trim();
  if (!raw) return '';

  // Date only — no time was recorded, so none is shown.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDay(raw);

  // A full ISO timestamp, the shape PostgREST sends. Anchored at BOTH ends: a
  // remark that merely begins with a date ("2026-09-18 pump replaced") is text
  // and must survive untouched.
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/
    .exec(raw);
  if (!m) return raw;

  const [, y, mo, d, hh, mi, ss, zone] = m;
  if (zone) {
    // It names an instant, so show it where the reader is.
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return raw;
    return `${pad(dt.getDate())}-${MONTH_NAMES[dt.getMonth()] ?? dt.getMonth() + 1}-${dt.getFullYear()}`
      + ` ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  }
  // No offset: a wall clock already written down. Printed as written.
  return `${d}-${MONTH_NAMES[Number(mo) - 1] ?? mo}-${y} ${hh}:${mi}:${ss ?? '00'}`;
}

export function formatDay(v: unknown): string {
  const raw = String(v ?? '').trim();
  if (!raw) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[3]}-${MONTH_NAMES[Number(iso[2]) - 1] ?? iso[2]}-${iso[1]}`;
  // Not ISO — read it day-first, the way every other date in this system is
  // read, and leave it alone if that fails too.
  const p = parseDateParts(raw);
  if (!p) return raw;
  return `${String(p.d).padStart(2, '0')}-${MONTH_NAMES[p.mo - 1] ?? p.mo}-${p.y}`;
}

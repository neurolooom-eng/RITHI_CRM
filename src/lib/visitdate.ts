import { formatDay } from './dates';
// ---------------------------------------------------------------------------
// WHEN A VISIT CAN HAVE HAPPENED.
//
// Two rules, both the user's (2026-09-06), and both about a visit that has not
// happened rather than one recorded badly:
//
//   1. NOT IN THE FUTURE. A visit report is a record of something an engineer
//      did. A date after today says it has not been done yet, and the call's
//      status comes from the LATEST visit — so a visit dated next week closes a
//      call that nobody has been to, and keeps it closed until that day passes.
//
//   2. NOT BEFORE THE BREAKDOWN. Nobody attended a machine before it failed.
//      Until 2026-10-14 the bound was the Complaint Date; the user then set it
//      to the Breakdown Date ("Reports can allow a Dates between the Breakdown
//      Date and Today"), because a call registered from a request now carries
//      the day the request was RAISED as its complaint, and the engineer was
//      often there the day before. The caller passes the breakdown date, else
//      the complaint date; the database (0436) does the same.
//
// A call with NO such date (an installation, a PM, an imported call that
// never carried one) is only held to the first rule — there is nothing to
// compare against, and refusing the visit would be inventing a requirement.
//
// Pure and dateless-by-design: every value is a `yyyy-mm-dd` string and TODAY
// is passed IN. `new Date()` inside the rule would make it untestable and would
// read the browser's clock at a moment nobody chose — and `toISOString()` is
// UTC, which in India is YESTERDAY from midnight until 05:29. The caller
// supplies the local date: `todayISO()` in lib/format, which is `todayLocal()`
// (it was UTC itself until v0.9.382, so a visit filed after midnight defaulted
// to the day before and today was refused as "in the future").
// ---------------------------------------------------------------------------

// '' when the date is allowed. Otherwise the reason, in the words the person
// entering it would use.
export function visitDateProblem(visit: string, from: string, today: string, what: 'breakdown' | 'complaint' = 'breakdown'): string {
  const v = (visit ?? '').trim();
  if (!v) return 'Give the date of the visit.';
  const t = (today ?? '').trim();
  // yyyy-mm-dd compares correctly as text — fixed width, biggest unit first.
  if (t && v > t) return `A visit cannot be dated in the future — ${fmt(v)} is after today.`;
  const c = (from ?? '').trim();
  if (c && v < c) return `A visit cannot be dated before the ${what} (${fmt(c)}).`;
  return '';
}

// ONE FORMATTER, in `dates.ts` beside the one parser. This was a private copy
// of it — which is exactly how four date PARSERS came to exist here and start
// disagreeing with each other.
const fmt = formatDay;

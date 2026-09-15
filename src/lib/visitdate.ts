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
//   2. NOT BEFORE THE COMPLAINT. Nobody attended a fault that had not been
//      reported. A visit dated before the complaint also makes every
//      response-time figure taken from the pair negative.
//
// A call with NO complaint date (an installation, a PM, an imported call that
// never carried one) is only held to the first rule — there is nothing to
// compare against, and refusing the visit would be inventing a requirement.
//
// Pure and dateless-by-design: every value is a `yyyy-mm-dd` string and TODAY
// is passed IN. `new Date()` inside the rule would make it untestable and would
// read the browser's clock at a moment nobody chose — and `toISOString()` is
// UTC, which is a different day from about half past five in the evening here.
// The caller supplies the local date; `todayISO()` in lib/format already does.
// ---------------------------------------------------------------------------

// '' when the date is allowed. Otherwise the reason, in the words the person
// entering it would use.
export function visitDateProblem(visit: string, complaint: string, today: string): string {
  const v = (visit ?? '').trim();
  if (!v) return 'Give the date of the visit.';
  const t = (today ?? '').trim();
  // yyyy-mm-dd compares correctly as text — fixed width, biggest unit first.
  if (t && v > t) return `A visit cannot be dated in the future — ${fmt(v)} is after today.`;
  const c = (complaint ?? '').trim();
  if (c && v < c) return `A visit cannot be dated before the complaint (${fmt(c)}).`;
  return '';
}

// ONE FORMATTER, in `dates.ts` beside the one parser. This was a private copy
// of it — which is exactly how four date PARSERS came to exist here and start
// disagreeing with each other.
const fmt = formatDay;

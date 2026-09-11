// ===========================================================================
// CALL REVIEW — the rules, kept out of the screen.
// A second review, on the REPORT rather than on the failure (the DCCR does the
// failure). What the screen LISTS is its whole basis, so the rule lives here
// where it can be exercised with real inputs rather than read out of a JSX
// tree.
// ===========================================================================

export const REVIEW_DONE = 'Report Reviewed';

// SOLVED ONLY (the user's rule, 2026-09-11).
//
//  * "Solved - Report Pending" is NOT solved for this purpose: there is no
//    report to review yet, and listing it sends a reviewer to an empty pane.
//  * A RE-OPENED call is open again (reviewing a closure that has been undone
//    is reviewing nothing) and a CANCELLED one was never closed by a report.
//    Neither needs a branch here: both render a state that is not "Solved", and
//    the case this cannot see -- open_state still Solved with reopened_at set --
//    is excluded by listSolvedCalls() at the database, where the column is.
//    A branch for them LOOKED like the protection and was dead code: a check
//    asserting it passed unchanged when it was deleted.
export function isReviewable(state: string, status: string): boolean {
  const s = String(state ?? '').trim().toLowerCase();
  if (s !== 'solved') return false;
  return !/report\s*pending/i.test(String(status ?? ''));
}

// A report link is a LINK. The signed manual report is the thing the reviewer
// has come to look at, and it arrived as a wall of Drive URL to copy by hand.
export const isUrl = (v: string): boolean => /^https?:\/\/\S+$/i.test(String(v ?? '').trim());

// What the link READS. A Drive URL is 80 characters of id that tells nobody
// anything, so it takes the field's own name — "Manual Report" — and the raw
// address goes in the tooltip for anyone who wants it. A non-report link keeps
// its host, which is the part of a URL that says where it goes.
export function linkLabel(field: string, url: string): string {
  if (/manual\s*report|report\s*link/i.test(field)) return 'Open the report ↗';
  try { return `${new URL(url).hostname} ↗`; } catch { return url; }
}

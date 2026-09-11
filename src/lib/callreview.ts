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

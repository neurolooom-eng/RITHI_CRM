// ===========================================================================
// A DOWNLOAD FROM A HALF-LOADED TABLE IS A FILE THAT LIES BY OMISSION.
//
//   The user, 2026-09-24: "if there is more data and user is downloading it
//   give a pop up disclaimer that there are more data and you are exporting
//   only a partial data. If table is loaded fully (No load more option) then
//   don't show this disclaimer. People keep saying data is missing when they
//   download without ensure if all the data is loaded or not."
//
// THE COMPLAINT IS NOT A UI COMPLAINT, IT IS AN EVIDENCE ONE. Every register
// here loads in pages, and the screen is honest about it — the count carries a
// `+` and a Load more button sits beside it. The FILE carries neither. Opened
// in Excel a day later it is just rows, and there is nothing in it, anywhere,
// to say that the register had more. So the reader concludes the data is
// missing from the system, and reports it as such — which is exactly what has
// been happening.
//
// ONE PLACE, NOT THIRTY-FIVE. `csvExport()` is the single CSV writer and
// `xlsxDownload()` the single workbook writer, so the rule lives at the point
// the bytes are produced rather than in each screen's button handler. This
// project has the scar for the other way round: `allRows()` was applied to one
// of thirteen call sites and the other twelve were reported a year later as a
// new bug.
//
// AND THE ANSWER IS REQUIRED, NOT OPTIONAL. An optional flag is one a new
// screen forgets, silently, and the silence is the whole fault being fixed. It
// is the same discipline `FacetChips` already carries: `more` must be passed
// either way, and `more={false}` is a claim somebody made rather than a
// default nobody noticed.
// ===========================================================================

/** What the caller knows about completeness. `more: true` = rows exist beyond
 *  the ones being written. */
export interface ExportScope { more: boolean }

/** Everything that matches is in hand — no Load more, nothing truncated. */
export const COMPLETE: ExportScope = { more: false };

/** More rows exist behind a Load more button (or the read hit its cap). */
export const partial = (more: boolean): ExportScope => ({ more: !!more });

/** A read that asked for at most `cap` rows and got `got` back.
 *
 *  A FULL PAGE SAYS NOTHING ABOUT WHETHER A NEXT ONE EXISTS, which is the same
 *  rule the pagers use: receiving exactly what you asked for is the signature
 *  of a truncation, not of an exhausted table. So this answers "there may be
 *  more" rather than "there are", and the wording below is written for that —
 *  it never claims to know how many are missing, because it does not. */
export const cappedAt = (got: number, cap: number): ExportScope => ({ more: got >= cap });

// ===========================================================================
// WHAT THE POP-UP SAYS.
//
// Three things, in the order somebody needs them: WHAT WILL BE IN THE FILE,
// WHAT IS MISSING, and WHAT TO DO ABOUT IT. A confirmation that only warns is
// one people learn to click through; one that says "press Load more until the
// button goes away" can be acted on in five seconds.
//
// IT DOES NOT NAME A TOTAL. The screen does not know one — that is the whole
// reason the count carries a `+` — and inventing a number here would be the
// same fault in a new place.
//
// EXPORTING ANYWAY IS ALLOWED, deliberately. Somebody filtering to one
// engineer and wanting the first two hundred rows is doing nothing wrong, and a
// refusal would make the sensible case impossible to serve the careless one.
// The point is that nobody can now do it WITHOUT BEING TOLD.
// ===========================================================================
export function partialExportWarning(rows: number): string {
  const n = rows.toLocaleString();
  return `This table has NOT finished loading.\n\n`
    + `Only the ${n} row${rows === 1 ? '' : 's'} on screen will be in the file. `
    // "MAY BE", NOT "ARE". A scope from `cappedAt` means the read came back
    // full, which is the signature of a truncation and not proof of one.
    // AND NOT EVERY SCREEN HAS A LOAD MORE: Stock Transfer, User Master,
    // Pending Dispatch, Stock Out, RM Approval and the Field Failure register
    // read up to a cap. Their search boxes filter what was ALREADY read, so
    // "narrow the filter" (an earlier wording) could never reach the missing
    // rows -- advice that cannot be followed. It says so instead.
    + `There may be more in the register that have not been fetched, and the file will not say so.\n\n`
    + `To export everything: press Cancel, then use “Load more” until the button disappears, and download again. `
    + `Where the screen has no Load more, it reads at most its limit and the rest cannot be reached from this screen.\n\n`
    + `Export these ${n} row${rows === 1 ? '' : 's'} anyway?`;
}

// ===========================================================================
// THE PROMPT ITSELF, behind a function so a check can exercise the DECISION
// without a browser and so a screen cannot reach past it.
//
// `window.confirm` rather than a styled dialog, for one reason: it is MODAL to
// the browser and cannot be missed, mis-tabbed past, or rendered under a
// sticky toolbar. This is the one interruption in the application whose whole
// job is to be read.
//
// NO CONFIRM AVAILABLE (a headless run, a hardened browser) MEANS THE EXPORT
// PROCEEDS. Blocking there would break the export for an environment that has
// done nothing wrong, and the honest reading is that nobody was asked rather
// than that somebody said no.
// ===========================================================================
export function mayExport(scope: ExportScope, rows: number,
                          ask: (message: string) => boolean = defaultAsk): boolean {
  if (!scope.more) return true;
  return ask(partialExportWarning(rows));
}

function defaultAsk(message: string): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
    return window.confirm(message);
  } catch {
    return true;
  }
}

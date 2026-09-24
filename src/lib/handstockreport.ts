// ===========================================================================
// THE HAND STOCK REPORT — what it carries, and what the file is called.
//
// The user, 2026-09-24: "Add a Hand Stock Report ... Default Load as to be 1000
// and Auto Load till all the data is displayed and then Enable Download. Name
// the Export - HandStock_DateTime.csv / HandStock_DateTime.xlsx /
// HandStock_DateTime.xls"
//
// HAND STOCK IS DERIVED, NEVER STORED — issued − consumed ± transfers −
// returns, netted per engineer and part by `handstock_balance`. So this report
// has no table of its own and cannot drift from the register: it is the same
// view the Hand Stock screen reads, with every page fetched instead of the
// first.
//
// PURE, AND IN ITS OWN MODULE, for the `paging.ts` reason: `supabase.ts` reads
// `import.meta.env`, so nothing that lives there can be run by a check. The
// column list and the file name are exactly the two things worth testing —
// they are what somebody receives.
// ===========================================================================

/** One column of the report: the view's column, and the heading it exports under. */
export interface ReportColumn { key: string; header: string }

// EVERY FIGURE THE BALANCE PUBLISHES, in the order a reader wants them: who and
// what, then the movements that made the number, then the number, then when it
// last moved.
//
// THE COMPONENTS ARE EXPORTED BESIDE THE TOTAL and that is the point of a
// report rather than a screen: `on_hand` alone cannot be checked by anybody,
// and a balance nobody can check is a balance nobody trusts. Opening + stock
// out + transfers in − consumed − transfers out − returned is `on_hand`, and
// the reader can add it up.
export const HANDSTOCK_REPORT_COLUMNS: ReportColumn[] = [
  { key: 'engineer', header: 'Engineer' },
  { key: 'engineer_email', header: 'Engineer Email' },
  { key: 'part_code', header: 'Part Code' },
  { key: 'part', header: 'Part' },
  { key: 'opening', header: 'Opening' },
  { key: 'stock_out', header: 'Stock Out' },
  { key: 'consumed', header: 'Consumed' },
  { key: 'transferred_in', header: 'Transferred In' },
  { key: 'transferred_out', header: 'Transferred Out' },
  { key: 'returned', header: 'Returned' },
  { key: 'on_hand', header: 'On Hand' },
  // THE SHEET ERA, SEPARATELY. `on_hand` counts everything; `on_hand_live`
  // counts only what this system itself recorded. Both are true, of different
  // questions (0102), and publishing one without the other is how somebody
  // reconciles against the wrong number.
  { key: 'hist_net', header: 'From the Old System (net)' },
  { key: 'on_hand_live', header: 'On Hand (this system only)' },
  { key: 'movements', header: 'Movements' },
  { key: 'last_in', header: 'Last In' },
  { key: 'last_out', header: 'Last Out' },
  { key: 'last_movement', header: 'Last Movement' },
];

/** Two digits, so a time never renders as `9-5-3`. */
const p2 = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ===========================================================================
// HandStock_<DateTime>.<ext> — the name the user asked for, with the DateTime
// spelled the way this project spells one everywhere else.
//
// `dd-MMM-yyyy HH:mm:ss` IS THE STANDING RULE (CLAUDE.md), and a file name
// cannot carry it verbatim: a colon is not allowed in a Windows file name, and
// a space in a download is an invitation to something to mangle it. So the
// DATE is exactly the house format — MONTH NAMED, which is the whole point of
// the rule, since 09-10 cannot be read the other way round when it says Sep —
// and the CLOCK loses only its colons: `HandStock_24-Sep-2026_181530.csv`.
//
// LOCAL TIME, not UTC. The name answers "when did I pull this?", which is a
// wall clock in the room the person is standing in; a file stamped 12:30 for a
// report pulled at 18:00 IST reads as somebody else's export.
// ===========================================================================
export function handStockFileName(ext: 'csv' | 'xlsx' | 'xls', when: Date = new Date()): string {
  const stamp = `${p2(when.getDate())}-${MONTHS[when.getMonth()]}-${when.getFullYear()}`
    + `_${p2(when.getHours())}${p2(when.getMinutes())}${p2(when.getSeconds())}`;
  return `HandStock_${stamp}.${ext}`;
}

// ===========================================================================
// IS EVERY ROW IN YET? The download is refused until it is, which is the user's
// own instruction ("Auto Load till all the data is displayed and then Enable
// Download") and is the right rule for this file specifically: a hand-stock
// export is reconciled against, so a partial one is not a shorter answer but a
// WRONG one — parts read as missing and balances as short, with nothing on the
// page saying so. The project's `+` convention makes a partial COUNT honest;
// there is no equivalent for a partial FILE.
//
// A PAGE SHORTER THAN THE PAGE SIZE IS THE END, and it is the only signal
// PostgREST gives. Asking for 1,000 and receiving 1,000 says nothing about
// whether a 1,001st exists, so the loop stops on a short page and never on a
// full one.
// ===========================================================================
export const isLastPage = (received: number, pageSize: number): boolean => received < pageSize;

// ===========================================================================
// CALL REQUEST — the row rules, as functions rather than lines inside a form.
//
// THE MACHINE NAMES THE CUSTOMER (the user's design, 2026-09-11). Asking for
// the customer first meant an infix search over ~5,000 names, which is the
// search that kept timing out on a phone; a serial is a prefix on an indexed
// column. So on a FIELD or PM call the customer is not typed at all — it is
// read off the machine, per row — and these are the rules that follow from
// that. They live here so they can be exercised with real inputs: a regex over
// the form's source proves a line is present, not that it fires.
// ===========================================================================

export interface RequestRow {
  product: string;
  serial: string;
  party?: string;
  reportedProblem?: string;
}

/**
 * Why the machines on this request cannot be accepted, or null.
 *
 * On an INSTALLATION none of this applies: the machine is not on the register
 * yet, which is exactly why that path still asks for the customer on the form.
 */
export function machineRowProblem(rows: RequestRow[], isInstall: boolean): string | null {
  if (isInstall) return null;

  // A serial that matched no machine names no customer, and a call filed
  // against nobody cannot be allocated, covered or counted.
  const noParty = rows.findIndex((r) => r.serial.trim() !== '' && !String(r.party ?? '').trim());
  if (noParty >= 0) {
    return `Call ${noParty + 1}: that serial is not on the register, so no customer came with it. `
         + 'Pick the machine from the list, or have it added to Product Database.';
  }

  // ONE MACHINE CANNOT BE TWO CALLS on a request — its UniqueID is
  // REQID-Product-Serial, so the database would refuse the pair anyway. The
  // check is on the SERIAL alone and spans customers, because the rows may now
  // be for different ones.
  const seen = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const k = rows[i].serial.trim().toLowerCase();
    if (!k) continue;
    const first = seen.get(k);
    if (first !== undefined) return `Call ${i + 1}: that machine is already on this request as call ${first + 1}.`;
    seen.set(k, i);
  }
  return null;
}

// ---------------------------------------------------------------------------
// WHAT THE PRODUCT BOX READS WHEN NOTHING IS CHOSEN.
//
// A message explaining an empty list must appear ONLY when the list is empty.
// Used as the placeholder outright it read "<customer> has no machines on the
// register" over a perfectly good list of two (reported 2026-09-12) — the words
// contradicting the dropdown directly beneath them. Here so it can be run with
// real inputs rather than read out of a JSX tree.
export type OwnedState = 'idle' | 'loading' | 'ready' | 'failed';
export const PICK_A_PRODUCT = '— pick a product —';

export function productPlaceholder(
  opts: { isInstall: boolean; isFirstCall: boolean; party: string; state: OwnedState; count: number;
          // OPTIONAL, so every existing caller and check keeps working. True
          // only when the master list could not be FETCHED -- which is a
          // different fact from the list being empty, and the one the screen
          // was getting wrong.
          masterFailed?: boolean },
): string {
  if (opts.isInstall) return '— pick from Product Database —';
  // A FAILED FETCH IS NOT AN EMPTY LIST. Said before the first-call branch,
  // because call 1 is exactly where it was rendering as `Nothing matches ""`.
  if (opts.masterFailed && opts.count === 0) return '— could not load the product list — check your connection and reopen —';
  if (opts.isFirstCall || !opts.party.trim()) return PICK_A_PRODUCT;
  if (opts.state === 'loading') return `— loading ${opts.party}'s machines —`;
  if (opts.state === 'failed') return '— could not load this customer’s machines —';
  return opts.count > 0 ? PICK_A_PRODUCT : `— no machines found for ${opts.party} —`;
}

// ===========================================================================
// CLOSEST FIRST — the order the machine list comes back in.
//
// Reported 2026-09-24 with a screenshot: a request for ORION-G serial 105 was
// refused with "that serial is not on the register", and the user's diagnosis
// was exact — *"the list is not sorted as per the closest match"*, and if you
// do not manage to pick from it, the row goes on with a serial and no customer.
//
// The search behind that list was one `ilike '%105%'` with `.limit(50)` and NO
// ORDER, so which fifty of the 925 matching machines came back, and in what
// order, was decided by the physical order of the rows. Measured: the machine
// actually numbered 105 came back at RANK 19.
//
// THREE GROUPS, AND THE ORDER WITHIN EACH IS THE SERIAL:
//   0  the serial BEGINS with what was typed
//   1  the serial ENDS with it
//   2  the serial contains it somewhere in the middle
//
// THE SUFFIX GROUP IS NOT SYMMETRY, IT IS THE COMMON CASE (the user, 2026-09-24:
// *"I have a user case where serial number is INXT 0105, will that populate if I
// type 105?"*). A great many serials on this register are a letter code, a
// space and a number — INXT 0105, MT75 1132 — and what somebody standing at the
// machine reads out is the NUMBER. With only prefix and contains, "105" put
// INXT 0105 in the contains group and it was sorted alphabetically among 1,046
// other machines whose serial contains 105: measured at RANK 146, so past the
// fifty and not offered at all. A serial that ENDS with what was typed is a
// close match by any reading, and there are very few of them — four, against
// 1,046 — so promoting them costs nothing and it is what makes the machine
// reachable.
//
// THE EXACT MATCH IS NOT A THIRD GROUP, AND THAT IS DELIBERATE — it would be
// dead code. A string sorts before everything it is a prefix of, so the serial
// you typed is already the first row of group 0; an `=== want` tier on top of
// that can never change an order. It was written as three groups first, and the
// mutation test proved it: removing the exact tier altogether changed no
// result. A tier no test can distinguish is a tier that is not doing anything,
// and leaving it in would be a claim the code does not support.
//
// CASE-INSENSITIVE, because `ilike` is: ranking on a case-sensitive comparison
// beside a case-insensitive search is how "abc" ends up below "ABCD".
//
// DE-DUPLICATED ON MODEL + SERIAL, never the serial alone. The install base
// holds eleven machines numbered 219 and this list exists to tell them apart;
// keying the de-duplication on the serial would drop ten of them.
//
// A SMALL, VERY CLOSE GROUP MUST NOT BE CROWDED OUT BY A LARGE ONE, which is
// why `limit` is applied per group rather than to the ranked list. Measured
// while answering the INXT question: sorting by tier and then cutting at 50 put
// INXT 0105 at rank 52 — one place past the cap — because 120 serials happened
// to BEGIN with 105 and filled it. Tier order decides what comes FIRST; it must
// not decide what is REACHABLE, or the fix above is undone by its own cap. Each
// non-empty group is guaranteed an equal share of the fifty, and whatever is
// left over is handed back to the closest groups in order.
//
// HERE RATHER THAN IN supabase.ts, for the reason paging.ts and uploads.ts are
// their own modules: that file reads `import.meta.env`, so nothing in it can be
// run by a check. This is pure, and check:ui exercises it.
// ===========================================================================
export function rankSerialHits<T extends { serial: string; product: string }>(hits: T[], query: string, limit = 0): T[] {
  const want = query.trim().toLowerCase();
  const key = (m: T) => `${m.product.trim().toLowerCase()}|${m.serial.trim().toLowerCase()}`;
  const by = new Map<string, T>();
  for (const m of hits) if (!by.has(key(m))) by.set(key(m), m);

  const rank = (serial: string) => {
    if (!want) return 2;
    const v = serial.trim().toLowerCase();
    if (v.startsWith(want)) return 0;
    if (v.endsWith(want)) return 1;
    return 2;
  };
  const all = [...by.values()];
  const tiers = [0, 1, 2].map((t) => all.filter((m) => rank(m.serial) === t)
    .sort((a, b) => a.serial.localeCompare(b.serial)));

  if (!limit || all.length <= limit) return tiers.flat();

  // EVERY NON-EMPTY GROUP GETS A SHARE FIRST, then the closest groups take what
  // is left. The order of the result is still tier order — this decides how
  // many of each are kept, never which comes first.
  const live = tiers.filter((t) => t.length).length;
  const share = Math.max(1, Math.floor(limit / live));
  const kept = tiers.map((t) => t.slice(0, share));
  let room = limit - kept.reduce((n, t) => n + t.length, 0);
  for (let i = 0; i < tiers.length && room > 0; i++) {
    const more = tiers[i].slice(kept[i].length, kept[i].length + room);
    kept[i] = [...kept[i], ...more];
    room -= more.length;
  }
  return kept.flat();
}

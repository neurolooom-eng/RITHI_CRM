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

  // ONE REQUEST, ONE CUSTOMER (CR-007, finding 43). A request is one visit to
  // one site. Picking from the list keeps it so, but a serial TYPED rather than
  // picked is looked up in the register at submit, row by row, and nothing
  // compared what came back — so two typed serials could file one request
  // against two customers. Compared on the name with case and spacing ignored,
  // so a difference only in how it was keyed does not refuse a real request.
  const squash = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const firstParty = rows.findIndex((r) => r.serial.trim() !== '' && squash(r.party) !== '');
  if (firstParty >= 0) {
    const other = rows.findIndex((r) => r.serial.trim() !== '' && squash(r.party) !== ''
      && squash(r.party) !== squash(rows[firstParty].party));
    if (other >= 0) {
      return `Call ${other + 1}: that machine belongs to ${String(rows[other].party).trim()}, but call ${firstParty + 1} is for `
           + `${String(rows[firstParty].party).trim()}. A request is one visit to one customer — raise a separate request for this machine.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// A REQUEST IS WRITTEN WHOLE OR NOT AT ALL (FRS-123.8, D-030).
//
// `addCallRequestBatch` mints ONE REQID with `next_call_reqid()` and writes
// every call in ONE insert, which Postgres makes all-or-nothing. It used to
// fall back, when the mint failed, to inserting call 1 alone (letting a trigger
// mint the REQID) and then the rest — and when the rest failed it returned
// ok: true with "Saved X (1 call)", a request half-saved under a comment saying
// that never happens. There is no way to make two inserts one from the
// browser, so the fallback is gone: no REQID, no write.
//
// Here, not in supabase.ts, so check:ui can run it with real inputs.
// ---------------------------------------------------------------------------
export const NOTHING_SAVED = 'Nothing was saved';

export function reqidOrRefusal(minted: unknown, mintError?: string | null):
  { ok: true; reqid: string } | { ok: false; error: string } {
  const reqid = String(minted ?? '').trim();
  if (!mintError && reqid) return { ok: true, reqid };
  return {
    ok: false,
    error: `The request number could not be issued${mintError ? ` (${mintError})` : ''}. `
      + `${NOTHING_SAVED} — no call on this request was written. Try again; if it keeps failing, `
      + 'the database is missing next_call_reqid() (apply bundle: call_requests).',
  };
}

/** WHY AN ATTENDED DATE CANNOT BE ACCEPTED, or null (FRS-123.4, D-030).
 *  It becomes the call's complaint date, and no visit may precede that, so a
 *  date after today is a call nobody can ever report on. `today` is passed in
 *  (yyyy-mm-dd, the reader's calendar) so this can be run with a fixed day;
 *  ISO dates compare correctly as strings. The database refuses the same
 *  ("The Attended Date cannot be in the future"); this says it first. */
export function attendedDateProblem(attended: boolean, date: string, today: string): string | null {
  if (!attended) return null;
  const d = String(date ?? '').trim().slice(0, 10);
  if (!d) return 'Attended Date is required when Call Attended? = Yes.';
  if (d > today) return 'The Attended Date cannot be in the future.';
  return null;
}

/**
 * WHY A CORRECTION TO ONE CALL OF A PENDING REQUEST CANNOT BE SAVED, or null
 * (FRS-124, D-030).
 *
 * The correction offers the form's own pickers, so a value no master holds
 * cannot be typed; this is what the pickers cannot see — the row as a whole,
 * and the row against the OTHER calls on the same REQID. On a field or PM call
 * the machine names the customer (CR-005), so a row with a serial and no
 * customer is a serial the register does not hold; one machine cannot be two
 * calls; and a request is one visit to one customer (CR-007). An installation
 * names its customer by hand (CR-017), so it needs one typed.
 */
export function correctionProblem(
  row: RequestRow, others: RequestRow[], isInstall: boolean,
): string | null {
  const t = (v: unknown) => String(v ?? '').trim();
  const squash = (v: unknown) => t(v).replace(/\s+/g, ' ').toLowerCase();
  if (!t(row.product)) return 'Product is required.';
  if (!t(row.serial)) return 'Serial No is required.';
  if (!t(row.reportedProblem)) return 'Reported Problem is required.';
  if (isInstall) return t(row.party) ? null : 'Enter the Party Name.';
  if (!t(row.party)) {
    return 'That serial is not on the register, so no customer came with it. '
         + 'Pick the machine from the list, or have it added to Product Database.';
  }
  if (others.some((o) => squash(o.serial) !== '' && squash(o.serial) === squash(row.serial))) {
    return 'That machine is already on this request as another call.';
  }
  const other = others.find((o) => squash(o.party) !== '' && squash(o.party) !== squash(row.party));
  if (other) {
    return `That machine belongs to ${t(row.party)}, but the other calls on this request are for `
         + `${t(other.party)}. A request is one visit to one customer — raise a separate request for this machine.`;
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

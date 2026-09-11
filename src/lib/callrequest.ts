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
         + 'Pick the machine from the list, or have it added to Product Master.';
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

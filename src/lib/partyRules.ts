// ===========================================================================
// WHAT A NEW PARTY MUST CARRY, AND WHERE ONE COMES FROM WHEN A SALE NAMES IT.
//
// ONE LIST, TWO SCREENS. The Party Master's Add form (the user, 2026-10-03:
// Name, City and State) and the Warranty sale that creates a party on save
// (the user, 2026-10-05: "If the Party is not there in Master, then make all
// the party master (mandatory fields) mandatory here as well") ask the same
// question, so they read the same list: a second copy is the one that drifts.
// Pure and node-importable, so check:ui can test it as behaviour.
// ===========================================================================

export const PARTY_REQUIRED: readonly (readonly [string, string])[] = [
  ['party_name', 'Party Name'], ['city', 'City'], ['state', 'State'],
];

/** The labels of the Party Master's required fields this row leaves blank. */
export const partyMissing = (row: Record<string, unknown>): string[] =>
  PARTY_REQUIRED.filter(([k]) => !String(row[k] ?? '').trim()).map(([, l]) => l);

/** A WARRANTY SALE, read as the PARTY it names -- the reverse of
 *  partyFillForSale (coverspec.ts), field for field: tel1 is the party's Phone,
 *  gst its GSTIN, engineer its Serviceman. Blanks are left out, so the new
 *  party carries what was typed and nothing invented. */
// A PARTY CREATED FROM A WARRANTY SALE MUST CARRY MORE (the user, 2026-10-05:
// "If a New Party is being created from the Warranty Sale Entry Page, then
// these fields are Mandatory: Party Type, Party Profile, Country, State, City,
// Address, PinCode, GST, Service Engineer"). A DELIBERATE DIFFERENCE from the
// Party Master's own Add form, which still asks only Name, City and State --
// the user asked it of this page. Keyed by the SALE's field names, labelled as
// the sale labels them, so the message names the boxes on screen.
export const SALE_NEW_PARTY_REQUIRED: readonly (readonly [string, string])[] = [
  ['party_type', 'Party Type'], ['profile', 'Party Profile'], ['country', 'Country'],
  ['state', 'State'], ['city', 'City'], ['address', 'Address'], ['pincode', 'Inst. Pincode'],
  ['gst', 'GST'], ['engineer', 'Service Engineer - Initial'],
];

/** The labels a warranty sale naming a NEW party leaves blank. */
export const saleNewPartyMissing = (sale: Record<string, unknown>): string[] =>
  SALE_NEW_PARTY_REQUIRED.filter(([k]) => !String(sale[k] ?? '').trim()).map(([, l]) => l);

/** Party Master column <- Warranty sale field, the reverse of
 *  partyFillForSale (coverspec.ts). ONE list, read by both directions below. */
export const SALE_TO_PARTY: readonly (readonly [string, string])[] = [
  ['party_name', 'party_name'], ['country', 'country'], ['city', 'city'], ['state', 'state'],
  ['address', 'address'], ['pincode', 'pincode'], ['phone', 'tel1'], ['phone_2', 'tel2'],
  ['pan', 'pan'], ['gstin', 'gst'], ['party_type', 'party_type'], ['profile', 'profile'],
  ['service_engineer', 'engineer'],
];

/** A sale read as the party it names; blanks are left out, so a new party
 *  carries what was typed and nothing invented. */
export function partyFromSale(sale: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [to, from] of SALE_TO_PARTY) {
    const v = String(sale[from] ?? '').trim();
    if (v) out[to] = v;
  }
  return out;
}

// ===========================================================================
// WHAT A SAVED SALE WRITES BACK TO THE PARTY (the user, 2026-10-05: "All Party
// Related Fields, if Updated - Should be Saved to Party Master once the Entry
// is Saved").
//
// TWO CONDITIONS, BOTH NEEDED. A field goes back only when the user CHANGED it
// in this edit (before -> after) AND it now differs from what the master holds.
// The first stops a re-save of an old sale from reverting a party corrected
// since on the master -- the sale still carries the old value, untouched, and
// that is not an instruction. The second stops a no-op write. A field CLEARED
// on the sale is a change too, and clears the master: that is what was asked.
// The party's NAME is never written -- it is the key the row is found by.
// ===========================================================================
const tx = (v: unknown) => String(v ?? '').trim();

/** `master` is the party as partyFillForSale reads it -- the SALE's field
 *  names -- or null when the master could not be read. Returns PARTY columns. */

export function partyEdits(before: Record<string, unknown>, after: Record<string, unknown>,
                           master: Record<string, unknown> | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [col, field] of SALE_TO_PARTY) {
    if (col === 'party_name') continue;
    const now = tx(after[field]);
    if (now === tx(before[field])) continue;
    if (master && now === tx(master[field])) continue;
    out[col] = now;
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE PARTY MASTER'S DROPDOWNS (the user, 2026-10-08: "Party Master - Type,
// Profile, ServiceMan, City, State, Country -- all of this should be
// Drop-down"). Type and Profile start from the Warranty Entry's own lists;
// every list then adds the values the Party Master ALREADY holds, so a
// customer typed in before today still shows its own value rather than a
// blank. Spelled as stored, kept once regardless of case, sorted.
// The Serviceman is NOT here: it is the User Master's active people.
// ---------------------------------------------------------------------------
export const PARTY_TYPES = ['CUSTOMER', 'DEALER'];
export const PARTY_PROFILES = ['PRIVATE', 'GOVERNMENT', 'DEALER', 'GENERAL'];

export interface PartyFieldOptions {
  party_type: string[]; profile: string[]; state: string[]; country: string[]; city: string[];
  /** The cities each state already has, keyed by the state in lower case. */
  cityByState: Record<string, string[]>;
}

const uniqSorted = (vals: Iterable<unknown>): string[] => {
  const seen = new Map<string, string>();
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (s && !seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
};

export function partyFieldOptions(rows: Record<string, unknown>[]): PartyFieldOptions {
  const col = (k: string) => rows.map((r) => r[k]);
  const byState: Record<string, unknown[]> = {};
  for (const r of rows) {
    const st = String(r.state ?? '').trim().toLowerCase();
    if (st) (byState[st] ??= []).push(r.city);
  }
  return {
    party_type: uniqSorted([...PARTY_TYPES, ...col('party_type')]),
    profile: uniqSorted([...PARTY_PROFILES, ...col('profile')]),
    state: uniqSorted(col('state')),
    country: uniqSorted(['INDIA', ...col('country')]),
    city: uniqSorted(col('city')),
    cityByState: Object.fromEntries(Object.entries(byState).map(([k, v]) => [k, uniqSorted(v)])),
  };
}

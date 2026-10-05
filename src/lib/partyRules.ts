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
export function partyFromSale(sale: Record<string, unknown>): Record<string, string> {
  const map: [string, string][] = [
    ['party_name', 'party_name'], ['city', 'city'], ['state', 'state'], ['address', 'address'],
    ['pincode', 'pincode'], ['phone', 'tel1'], ['phone_2', 'tel2'], ['pan', 'pan'], ['gstin', 'gst'],
    ['party_type', 'party_type'], ['profile', 'profile'], ['service_engineer', 'engineer'],
  ];
  const out: Record<string, string> = {};
  for (const [to, from] of map) {
    const v = String(sale[from] ?? '').trim();
    if (v) out[to] = v;
  }
  return out;
}

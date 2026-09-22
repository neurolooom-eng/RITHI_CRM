// ===========================================================================
// THE KYC RECORDS ATTACHED TO A PARTY — the pure half, so it can be tested.
//
//   The user, 2026-09-22: "In Party Master, add a provision to attach the KYC
//   records. If the customer is already KYC Verified, then display as KYC
//   Verified so that commercial department can proceed with Sale Entry and
//   Installation call."
//
// 0201 gave a party a KYC STATUS. What it did not give it is the EVIDENCE —
// the GST certificate, the PAN card, the registration somebody looked at before
// writing "Verified". A verification with no record behind it is an assertion,
// and Commercial, who has to rely on it before a sale entry and an installation
// call, cannot check it.
//
// IT LIVES HERE RATHER THAN IN `supabase.ts` FOR THE `paging.ts` REASON: that
// module reads `import.meta.env`, so no node script can import it and nothing
// in it can be tested as behaviour.
//
// VERIFIED IS VERIFIED WHETHER OR NOT A FILE IS ATTACHED, and that is a
// deliberate asymmetry. The status is a DECISION a person made; refusing to
// honour it because the paperwork was filed elsewhere would make this stricter
// than the people it serves, and every screen says separately whether a record
// is attached. The inference never runs the other way: a party with documents
// and no verification is NOT verified, because attaching a file is not a
// decision.
// ===========================================================================

export interface KycDoc {
  /** The file's own name, as uploaded. */
  name: string;
  /** Where it is. A Drive link; the file is not held here. */
  url: string;
  /** When it was attached, ISO. */
  at: string;
  /** Who attached it — a display name, so the list reads without a lookup. */
  by: string;
}

export const KYC_VERIFIED = 'Verified';

/** Is this party cleared for a sale entry and an installation call? The SQL
 *  copy is `party_kyc_verified()` (0231) and the two must agree. */
export const isKycVerified = (status: unknown): boolean =>
  String(status ?? '').trim().toLowerCase() === KYC_VERIFIED.toLowerCase();

/** The records attached to a party, whatever the column happens to hold.
 *
 *  DEFENSIVE BECAUSE THE COLUMN IS jsonb AND THE ROW MAY PREDATE IT. A party
 *  loaded before 0231 has no such key; one written by a mistaken client could
 *  hold an object. Either way the answer is "no records", not a screen that
 *  fails to render — and an entry with no URL is dropped, because a link to
 *  nowhere is worse than an absent one: it reads as evidence that exists. */
export function kycDocs(v: unknown): KycDoc[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
    .map((d) => ({
      name: String(d.name ?? '').trim(),
      url: String(d.url ?? '').trim(),
      at: String(d.at ?? '').trim(),
      by: String(d.by ?? '').trim(),
    }))
    .filter((d) => d.url !== '');
}

/** The list with one more record on the end. Returns a NEW list — the caller
 *  sends it to the database and re-reads, and mutating the row on screen would
 *  make a failed write look like it succeeded. */
export function withKycDoc(current: unknown, doc: KycDoc): KycDoc[] {
  const now = kycDocs(current);
  // THE SAME FILE TWICE IS ONE RECORD. Re-attaching after a failed save is the
  // ordinary way this happens, and two identical rows in an evidence list is a
  // question somebody has to answer later.
  const seen = new Set(now.map((d) => d.url));
  return seen.has(doc.url) ? now : [...now, doc];
}

/** The list without the record at `url`. */
export const withoutKycDoc = (current: unknown, url: string): KycDoc[] =>
  kycDocs(current).filter((d) => d.url !== url);

/** What the table shows in one cell: the count, and whether there is anything
 *  at all. Kept here so the register and the drawer cannot disagree. */
export const kycSummary = (status: unknown, docs: unknown) => ({
  verified: isKycVerified(status),
  records: kycDocs(docs).length,
});

// ---------------------------------------------------------------------------
// WHICH MANUALS BELONG ON THIS CALL.
//
// The call says EXTEND-XT and the fault is in an accessory — a CPX Care. The
// CPX Care manual was tagged "CPX Care Failure" for exactly this, and it did
// not appear, because the matcher only ever compared the document's PRODUCT
// with the call's product: "cpx care" against "extend-xt" is not a match, and
// `documents.tags` was never read at all.
//
// The knowledge-base matcher next to it had always searched title, product AND
// tags, against the product and the complaint. This is the same rule, applied
// to manuals:
//
//   • a manual with NO product is a general one and is offered on every call
//   • a manual whose product matches the call's, either way round
//   • a manual one of whose TAGS appears in the call's own words — its product,
//     its Standard Complaint, or what was reported
//
// THE DIRECTION MATTERS. A tag is a short phrase somebody chose; the call's
// text is longer and messier. So the test is "do the call's words contain the
// tag", never the reverse — otherwise a one-word tag would swallow everything.
//
// Both sides are normalised the same way: lower-cased, with punctuation
// flattened to spaces, so "CPX-Care" finds "CPX care failure - no output
// pressure". No imports, so `npm run check:ui` can pin the rule itself.
// ---------------------------------------------------------------------------

/** Lower-cased, punctuation flattened to single spaces. */
export function norm(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The tags on a document, however they were separated. */
export function docTags(tags: unknown): string[] {
  return String(tags ?? '')
    .split(/[,;|\n]/)
    .map((t) => norm(t))
    // 3 characters, the same floor the knowledge-base matcher uses. Below that
    // a tag matches half the register.
    .filter((t) => t.length >= 3);
}

export interface ManualLike { product?: unknown; tags?: unknown }
export interface CallWords { product?: unknown; complaint?: unknown; reported?: unknown }

/** Does this manual belong on this call? */
export function manualMatchesCall(doc: ManualLike, call: CallWords): boolean {
  const owns = norm(doc.product);
  const want = norm(call.product);

  // A manual with no product is a general one — offered on every call.
  if (!owns) return true;
  // The machine's own manual, matched either way round so "EXTEND-XT" finds a
  // manual filed under "Extend XT INXT" and vice versa.
  if (want && (owns === want || want.includes(owns) || owns.includes(want))) return true;

  // An ACCESSORY's manual, reached through the words on the call. This is the
  // arm that was missing.
  const words = [call.product, call.complaint, call.reported].map(norm).filter(Boolean).join(' ');
  if (!words) return false;
  return docTags(doc.tags).some((t) => words.includes(t));
}

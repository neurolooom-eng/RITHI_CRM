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

/** The products a document names. A Technical Note may name SEVERAL,
 *  comma-separated (the user, 2026-09-30: "Product should be Multi Select");
 *  a manual names one, which is a list of one. */
export function docProducts(product: unknown): string[] {
  return String(product ?? '').split(/[,;|\n]/).map((p) => norm(p)).filter(Boolean);
}

/** Does this manual -- or Technical Note -- belong on this call? */
export function manualMatchesCall(doc: ManualLike, call: CallWords): boolean {
  const owns = docProducts(doc.product);
  const want = norm(call.product);

  // A document with no product is a general one — offered on every call.
  if (!owns.length) return true;
  // The machine's own document, matched either way round so "EXTEND-XT" finds
  // a manual filed under "Extend XT INXT" and vice versa -- against EACH
  // product a note names.
  if (want && owns.some((o) => o === want || want.includes(o) || o.includes(want))) return true;

  // An ACCESSORY's manual, reached through the words on the call. This is the
  // arm that was missing.
  const words = [call.product, call.complaint, call.reported].map(norm).filter(Boolean).join(' ');
  if (!words) return false;
  return docTags(doc.tags).some((t) => words.includes(t));
}

// ---------------------------------------------------------------------------
// A TECHNICAL NOTE IS OFFERED ONLY WHERE IT IS THE LATEST (the user,
// 2026-10-12: "in supporting Docs, list only the Technical notes tagged as
// Latest"; settled the same day: Latest for THIS call's product, and an
// accessory's note only where it is Latest for the accessory it names).
//
// The Latest mark is PER PRODUCT (`documents.latest_for`, 0354, written only by
// the database; '' = "Every product"), because a note naming two products can
// be the newest for one and not the other. So the question is never "is this
// note Latest?" but "is it Latest for the product that brought it here?":
//
//   • a note naming no product      → only if Latest for Every product
//   • a note naming the call's machine → only if Latest for that machine
//   • an accessory's note, reached through its tags (it names none of the
//     call's machine) → only if Latest for a product it names
//
// Service manuals are untouched: they have no Latest mark.
// ---------------------------------------------------------------------------

export interface NoteLike extends ManualLike { latest_for?: unknown }

/** Is this Technical Note offered on this call? */
export function noteMatchesCall(doc: NoteLike, call: CallWords): boolean {
  const latest = Array.isArray(doc.latest_for) ? doc.latest_for.map((p) => norm(p)) : [];
  const owns = docProducts(doc.product);
  if (!owns.length) return latest.includes('');

  const want = norm(call.product);
  const isCalls = (p: string) => !!want && !!p && (p === want || want.includes(p) || p.includes(want));
  if (owns.some(isCalls)) return latest.some(isCalls);

  return manualMatchesCall(doc, call) && latest.some(Boolean);
}

/** The one test a call's Supporting documents applies to each document. */
export function docMatchesCall(doc: NoteLike & { kind?: unknown }, call: CallWords): boolean {
  return doc.kind === 'service_note' ? noteMatchesCall(doc, call) : manualMatchesCall(doc, call);
}

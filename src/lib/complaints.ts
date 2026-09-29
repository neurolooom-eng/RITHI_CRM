// ===========================================================================
// WHICH PRODUCTS A STANDARD COMPLAINT APPLIES TO.
//
// The user, 2026-09-29: "In Standard Complaint Master, I want a Product Field
// -- should be a Multi Select, meaning the Complaint can be mapped to more
// than one Product. Also a provision to map the Complaint to all Products."
//
// STORED ON THE ENTRY ITSELF, in `masters.extra.products`, a list of product
// names as the Product Database spells them. No new table: an entry already
// carries its own details there (Spare Approval Reason keeps Stage and Status
// the same way), and a list that lives with the value cannot drift from it.
//
// AN EMPTY LIST MEANS ALL PRODUCTS -- the "map to all" provision -- which is
// also what every complaint that existed before this change reads as, so
// nothing already in use stops applying anywhere. It is the convention the
// multi-select filters already follow (MultiPick: "empty means all").
//
// This module is pure so a node check can run it (the paging.ts reason).
// ===========================================================================

/** The products an entry is mapped to, however it was stored. */
export function complaintProducts(extra: unknown): string[] {
  const raw = (extra && typeof extra === 'object') ? (extra as Record<string, unknown>).products : undefined;
  const list = Array.isArray(raw) ? raw
    // A comma-separated string is accepted too, for a value typed or uploaded
    // before this screen wrote a list.
    : typeof raw === 'string' ? raw.split(',') : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    const s = String(v ?? '').trim();
    const k = s.toLowerCase();
    if (s && !seen.has(k)) { seen.add(k); out.push(s); }
  }
  return out;
}

/** True when the entry is mapped to every product. */
export const appliesToAllProducts = (extra: unknown): boolean => complaintProducts(extra).length === 0;

/** Does this complaint apply to this product? Matched ignoring case and
 *  surrounding spaces, because a stray space in a product name (the Extend XT
 *  fault) must not make a mapped complaint disappear. A blank product -- a
 *  call whose product is not chosen yet -- matches everything. */
export function complaintAppliesTo(extra: unknown, product: string): boolean {
  const mapped = complaintProducts(extra);
  const p = String(product ?? '').trim().toLowerCase();
  if (!mapped.length || !p) return true;
  return mapped.some((m) => m.toLowerCase() === p);
}

/** One line for a table cell or a CSV. */
export const productsLabel = (extra: unknown): string => {
  const m = complaintProducts(extra);
  return m.length ? m.join(', ') : 'All products';
};

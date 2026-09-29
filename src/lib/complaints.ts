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

// ---- the mapping in a bulk upload -------------------------------------------
// The user, 2026-09-29: "If I re-upload masters with Product Details, will it
// update?" It did not, in two ways, and both were worse than failing:
//
//   * A FILE WITH NO PRODUCTS COLUMN WIPED THE MAPPING. The upload replaces an
//     entry's details wholesale, so every complaint in the file silently went
//     back to All products.
//   * A PRODUCTS COLUMN WAS NOT READ AS THE MAPPING. Unrecognised headings are
//     kept under their own spelling, so it landed as text under "Products"
//     where nothing looks -- and a heading spelled exactly `product` landed on
//     the key the per-product DCCR lists use, which is part of the list's
//     unique key: the load made a SECOND COPY of every complaint.
//
// So: NO HEADING -> the mapping is left exactly as it is (the upload does not
// send the details at all). A HEADING -> it IS the mapping, and a BLANK or
// "All" cell means ALL PRODUCTS -- the project's rule that a heading present
// and empty clears, and a heading absent leaves alone.
export const PRODUCTS_HEADING = /^(applicable\s+)?products?(\s+name)?s?$/i;

/** "VEGA, ORION-G" / "VEGA; ORION-G" / one per line -> the list; blank or
 *  "All" / "All products" -> [] (all products). */
export function parseProductsCell(cell: unknown): string[] {
  const t = String(cell ?? '').trim();
  if (!t || /^all(\s+products?)?$/i.test(t)) return [];
  return complaintProducts({ products: t.split(/[,;\n]/) });
}

/** Applied to each shaped row of a Standard Complaint upload. */
export function applyProductsFromFile(row: Record<string, unknown>, headers: string[]): void {
  const hasHeading = headers.some((h) => PRODUCTS_HEADING.test(h.trim()));
  if (!hasHeading) { delete row.extra; return; }
  const extra = { ...((row.extra ?? {}) as Record<string, unknown>) };
  let cell: unknown = '';
  for (const k of Object.keys(extra)) {
    if (PRODUCTS_HEADING.test(k.trim())) { cell = extra[k]; delete extra[k]; }
  }
  row.extra = { ...extra, products: parseProductsCell(cell) };
}

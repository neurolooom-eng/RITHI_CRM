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

// THE KEY -- the complaint's own id, which the list's export carries (the user,
// 2026-09-29: "Map it per Key -- No need to update the Complaint Name at any
// point in time. It should update only the Product Details; if the Complaint
// Name is absent then add it as a New Complaint").
export const KEY_HEADING = /^(complaint\s+)?(key|id)$/i;
/** Where the shaper parks the key until planComplaintKeys() has used it. It
 *  is never a column of `masters`, and the planner always removes it. */
export const KEY_FIELD = '_complaint_key';

/** Applied to each shaped row of a Standard Complaint upload. */
export function applyProductsFromFile(row: Record<string, unknown>, headers: string[]): void {
  // The KEY is lifted out first, whatever else the file carries.
  const ex0 = (row.extra ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(ex0)) {
    if (KEY_HEADING.test(k.trim())) {
      const n = Number(String(ex0[k] ?? '').trim());
      if (Number.isInteger(n) && n > 0) row[KEY_FIELD] = n;
      const rest = { ...ex0 }; delete rest[k]; row.extra = rest;
    }
  }
  const hasHeading = headers.some((h) => PRODUCTS_HEADING.test(h.trim()));
  if (!hasHeading) { delete row.extra; return; }
  const extra = { ...((row.extra ?? {}) as Record<string, unknown>) };
  let cell: unknown = '';
  for (const k of Object.keys(extra)) {
    if (PRODUCTS_HEADING.test(k.trim())) { cell = extra[k]; delete extra[k]; }
  }
  row.extra = { ...extra, products: parseProductsCell(cell) };
}

// ---- matching an upload row to the complaint it means ----------------------
// Pure, so check:uploads can prove it; supabase.ts only reads the list and
// calls it (the paging.ts reason).
//
//   KEY GIVEN   -> that complaint, found by its id. The file's name is IGNORED:
//                  the stored name is put back on the row, so the upload can
//                  only ever update the products -- never rename.
//   KEY UNKNOWN -> held back BY NAME rather than guessed at or added.
//   NO KEY      -> matched on the name, ignoring case and surrounding spaces,
//                  and again the STORED spelling is kept; no match -> a NEW
//                  complaint.
// Either way an update keeps the rest of the entry's details and replaces
// only `products`.
export interface ExistingComplaint { id: number; name: string; value: string; extra: Record<string, unknown> }
export function planComplaintKeys(
  rows: Record<string, unknown>[], existing: ExistingComplaint[],
): { rows: Record<string, unknown>[]; note: string } {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const byName = new Map(existing.map((e) => [e.value.trim().toLowerCase(), e]));
  const unknownKeys: number[] = [];
  let namesIgnored = 0, added = 0, updated = 0;
  const out = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const key = r[KEY_FIELD] as number | undefined;
    delete r[KEY_FIELD];
    const ex = key !== undefined ? byId.get(key) : byName.get(String(r.value ?? '').trim().toLowerCase());
    if (key !== undefined && !ex) { unknownKeys.push(key); continue; }
    if (ex) {
      if (String(r.value ?? '').trim() !== ex.value.trim()) namesIgnored += 1;
      r.name = ex.name;
      r.value = ex.value;
      if ('extra' in r) {
        const keep = { ...(ex.extra ?? {}) }; delete keep.products;
        r.extra = { ...keep, products: (r.extra as Record<string, unknown>).products ?? [] };
      }
      updated += 1;
    } else {
      added += 1;
    }
    // One write per complaint: two file rows meaning the same one would make
    // the database refuse the whole batch ("cannot affect row a second time").
    out.set(`${String(r.name)}|${String(r.value).trim().toLowerCase()}`, r);
  }
  const bits = [
    `${updated} complaint${updated === 1 ? '' : 's'} updated (products only), ${added} added`,
    namesIgnored ? `${namesIgnored} name${namesIgnored === 1 ? '' : 's'} in the file differ from the list and were NOT changed -- the list's name is kept` : '',
    unknownKeys.length ? `${unknownKeys.length} row${unknownKeys.length === 1 ? '' : 's'} held back: no complaint has Key ${unknownKeys.slice(0, 8).join(', ')}${unknownKeys.length > 8 ? ' ...' : ''}` : '',
    rows.length - unknownKeys.length > out.size ? `${rows.length - unknownKeys.length - out.size} repeated row${rows.length - unknownKeys.length - out.size === 1 ? '' : 's'} folded (the last one counts)` : '',
  ].filter(Boolean);
  return { rows: [...out.values()], note: bits.join('; ') + '.' };
}

// ---- the dropdown on a call: this product's complaints + the all-products ones
// The user, 2026-09-29: "filter complaints by the call's product + Complaints
// that are applicable for all Products".
//
// Carried through the dropdown cache (masters.ts) as ONE STRING PER COMPLAINT,
// "<name><TAB><product><US><product>...", because that cache stores a list of
// strings -- and reusing it keeps the list on the device for offline use
// exactly like every other dropdown. No tab or unit separator can occur in a
// complaint or product name typed into this application.
const SEP = '\t', PSEP = '\u001f';
export function encodeComplaintEntry(value: string, extra: unknown): string {
  return `${value}${SEP}${complaintProducts(extra).join(PSEP)}`;
}
export function decodeComplaintEntry(s: string): { value: string; products: string[] } {
  const i = s.indexOf(SEP);
  if (i < 0) return { value: s, products: [] };
  const p = s.slice(i + 1);
  return { value: s.slice(0, i), products: p ? p.split(PSEP) : [] };
}
/** The complaints to offer on a call for this product, in the list's order.
 *  No product chosen yet -> every complaint (nothing is known to narrow by). */
export function complaintOptionsFor(encoded: string[], product: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of encoded) {
    const { value, products } = decodeComplaintEntry(e);
    if (!value || seen.has(value)) continue;
    if (complaintAppliesTo({ products }, product)) { seen.add(value); out.push(value); }
  }
  return out;
}

// ---- changing the products of many complaints at once ----------------------
// The user, 2026-09-30: "bulk updation of Products to Complaints". Three ways,
// because each answers a different job:
//   replace -> these complaints apply to exactly the chosen products
//              (none chosen = ALL products);
//   add     -> also apply to the chosen products;
//   remove  -> no longer apply to the chosen products.
// A complaint on ALL products (an empty list) is left on all products by
// "remove": taking VEGA out of "every product" would mean listing all the
// others, which is a decision somebody should make with the list in front of
// them, not a side effect.
export type BulkProductsMode = 'replace' | 'add' | 'remove';
export function applyBulkProducts(current: string[], chosen: string[], mode: BulkProductsMode): string[] {
  const clean = complaintProducts({ products: chosen });
  if (mode === 'replace') return clean;
  const cur = complaintProducts({ products: current });
  if (mode === 'add') return cur.length === 0 ? [] : complaintProducts({ products: [...cur, ...clean] });
  if (cur.length === 0) return [];
  const drop = new Set(clean.map((p) => p.toLowerCase()));
  return cur.filter((p) => !drop.has(p.toLowerCase()));
}

/** The master screen's Product filter: '' = any; ALL_PRODUCTS_FILTER = the
 *  complaints mapped to every product; otherwise complaints mapped to that
 *  product BY NAME (an all-products complaint is not listed under each product
 *  -- the filter is for managing the mapping, not previewing a call). */
export const ALL_PRODUCTS_FILTER = '— All products (no mapping) —';
/** Mapped to a name the Product Database does not have -- a typo, or a value
 *  loaded before the mapping used Product Database names (the Part Master's
 *  Item Master file carried short forms). Listed so it can be FIXED, never
 *  rewritten on its own (the user, 2026-09-30: "Keep and flag them"). */
export const UNRECOGNISED_FILTER = '— Unrecognised product —';
export function unrecognisedProducts(extra: unknown, known: string[]): string[] {
  const k = new Set(known.map((n) => n.trim().toLowerCase()));
  return complaintProducts(extra).filter((p) => !k.has(p.toLowerCase()));
}
export function matchesProductFilter(extra: unknown, filter: string, known: string[] = []): boolean {
  if (!filter) return true;
  const mapped = complaintProducts(extra);
  if (filter === ALL_PRODUCTS_FILTER) return mapped.length === 0;
  if (filter === UNRECOGNISED_FILTER) return known.length > 0 && unrecognisedProducts(extra, known).length > 0;
  const f = filter.trim().toLowerCase();
  return mapped.some((p) => p.toLowerCase() === f);
}

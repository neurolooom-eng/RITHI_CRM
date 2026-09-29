// ===========================================================================
// WHICH PARTS FIT THE MACHINE A CALL IS FOR.
//
// The user, 2026-09-30: "If a Call is logged against VEGA [Main Product];
// CPX Care, Humidifier, Air Supply [Allied Products or otherwise called
// Accessories] -- if a Call is logged against Vega I can request for Main
// Product Spares / Accessory Spares." And, choosing between the options put to
// them: "Spare List has to be Main Product + Potential Accessory Spares + Common
// Spares. I don't need a Separate field to record if it's CPX or VEGA or
// Humidifier."
//
// SO ONE LIST, THREE SOURCES, NOTHING NEW RECORDED:
//   * parts mapped to the call's product (Part Master -> Product);
//   * parts mapped to any of that product's accessories (Part Master ->
//     "Main product -> Accessories & allied products", 0255);
//   * parts mapped to NO product -- "Common (all products)".
// A "Show all parts" switch on each form opens the whole list, so a request is
// never blocked by a mapping that is incomplete (the user's choice).
//
// A CALL WITH NO PRODUCT gets everything: there is nothing to narrow by.
// Product names are matched ignoring case and surrounding spaces, the
// complaints.ts rule, so a stray space does not hide a part.
//
// Carried through the dropdown cache as one string per entry, the way the
// Standard Complaints are ("<value><TAB><name><US><name>..."), so both lists
// stay on the device for use with no signal.
//
// Pure, so a node check can run it (the paging.ts reason).
// ===========================================================================
import { complaintProducts, decodeComplaintEntry } from './complaints';

const SEP = '\t', PSEP = '\u001f';

/** A part: its picker value ("CODE|Description") and the products it fits
 *  (parts.product, comma-separated; blank = common to all products). */
export function encodePartEntry(itemDetail: string, product: unknown): string {
  return `${itemDetail}${SEP}${complaintProducts({ products: String(product ?? '') }).join(PSEP)}`;
}
/** A main product and its accessories / allied products. */
export function encodeAccessoryEntry(main: string, accessories: string[]): string {
  return `${main}${SEP}${complaintProducts({ products: accessories }).join(PSEP)}`;
}
export const decodeEntry = decodeComplaintEntry;

const norm = (s: string) => String(s ?? '').trim().toLowerCase();
/** The part code: what comes before "|" in the picker value. */
export const partCodeOf = (itemDetail: string) => norm(String(itemDetail ?? '').split('|')[0]);

/** The call's product and its accessories, lower-cased. EMPTY when the call
 *  names no product, which means "no narrowing". */
export function productFamily(accessoryEntries: string[], product: string): Set<string> {
  const p = norm(product);
  if (!p) return new Set();
  const fam = new Set([p]);
  for (const e of accessoryEntries) {
    const { value, products } = decodeEntry(e);
    if (norm(value) === p) products.forEach((a) => fam.add(norm(a)));
  }
  return fam;
}

/** The accessories of one product, as saved (for the line under the picker). */
export function accessoriesOf(accessoryEntries: string[], product: string): string[] {
  const p = norm(product);
  if (!p) return [];
  for (const e of accessoryEntries) {
    const { value, products } = decodeEntry(e);
    if (norm(value) === p) return products;
  }
  return [];
}

/** Does a part mapped to `products` fit this family? Common parts always do. */
export function fitsFamily(products: string[], family: Set<string>): boolean {
  if (!family.size || !products.length) return true;
  return products.some((x) => family.has(norm(x)));
}

/** The spare request's list: the parts that fit, in the list's order. */
export function partOptionsFor(partEntries: string[], accessoryEntries: string[], product: string): string[] {
  const fam = productFamily(accessoryEntries, product);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of partEntries) {
    const { value, products } = decodeEntry(e);
    if (!value || seen.has(value)) continue;
    if (fitsFamily(products, fam)) { seen.add(value); out.push(value); }
  }
  return out;
}

/** Every part, whatever it fits -- the "Show all parts" list. */
export function allPartValues(partEntries: string[]): string[] {
  return [...new Set(partEntries.map((e) => decodeEntry(e).value).filter(Boolean))];
}

/** For a list that is NOT built from the Part Master -- the engineer's hand
 *  stock on the visit report: does this part fit? Looked up by the picker value
 *  and, failing that, by the code. A part the Part Master does not list is
 *  KEPT: nothing says it does not fit, and hiding stock the engineer holds on a
 *  guess is worse than showing it. */
export function makePartFit(partEntries: string[], accessoryEntries: string[], product: string):
  (part: string, code?: string) => boolean {
  const fam = productFamily(accessoryEntries, product);
  if (!fam.size) return () => true;
  const byValue = new Map<string, string[]>();
  const byCode = new Map<string, string[]>();
  for (const e of partEntries) {
    const { value, products } = decodeEntry(e);
    if (!value) continue;
    const k = norm(value);
    // Two rows with one value: a part common on either is common.
    const prev = byValue.get(k);
    const merged = prev === undefined ? products : (!prev.length || !products.length ? [] : [...prev, ...products]);
    byValue.set(k, merged);
    const c = partCodeOf(value);
    if (c) {
      const pc = byCode.get(c);
      byCode.set(c, pc === undefined ? merged : (!pc.length || !merged.length ? [] : [...pc, ...merged]));
    }
  }
  return (part: string, code?: string) => {
    const hit = byValue.get(norm(part)) ?? byCode.get(norm(code ?? '') || partCodeOf(part));
    return hit === undefined ? true : fitsFamily(hit, fam);
  };
}

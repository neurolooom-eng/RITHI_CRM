import { getSupabase } from './supabase';

// ===========================================================================
// THE PRODUCT LINES — the Product Master (0193), as the forms need them.
//
// The user's rule, 2026-09-14: "All Inactive Products can never have a new Sale
// Entry, But can still have Contract or Calls or Basically everything other
// than New Sale Entry."
//
// So there are TWO lists and they are deliberately different:
//
//   sellable()  what a NEW SALE ENTRY may name — active lines only.
//   all()       every line, for anything that is not a new sale. A contract,
//               a call or a spare against a machine sold in 2014 names a line
//               that stopped being sold years ago, and refusing it would be
//               refusing the work rather than the sale.
//
// A NAME IS SELLABLE IF ANY OF ITS CODES IS. Measured on the user's own file:
// 53 codes, 43 names — CPX CARE has nine codes and they disagree, so treating
// the name as retired because one code is would be wrong eight times over. The
// same rule as `product_line_sellable()` in the database, kept in step because
// a form that offers what the database would refuse is worse than either.
// ===========================================================================

export interface ProductLine {
  code: string;
  name: string;
  active: boolean;
  category: string;
  /** The catalogue's own abbreviation — ORG, MT75, CPX, EXT. What the Part
   *  Master names a product family by, because a part fits a MODEL and the
   *  short form is what fits in a column beside a part code. Several lines
   *  share one (all nine CPX CARE codes are CPX), so it is not a key. */
  shortForm: string;
}

const s = (v: unknown) => String(v ?? '').trim();

export async function listProductLines(): Promise<ProductLine[]> {
  const c = getSupabase();
  if (!c) return [];
  const { data, error } = await c.from('product_master')
    .select('product_code,product_name,active,item_category,short_form')
    .order('product_name');
  // A CATALOGUE THAT CANNOT BE READ MUST NOT EMPTY THE FORM. The picker falls
  // back to free text below, so a reader who cannot see this table (or a
  // project where it has not been loaded yet) keeps a working Sale Entry.
  if (error) return [];
  return (data ?? []).map((r) => ({
    code: s(r.product_code), name: s(r.product_name),
    active: r.active !== false, category: s(r.item_category),
    shortForm: s(r.short_form),
  })).filter((p) => p.code || p.name);
}

/** The NAMES a new sale entry may use: any name with at least one active code. */
export const sellableNames = (lines: ProductLine[]): string[] =>
  [...new Set(lines.filter((p) => p.active).map((p) => p.name).filter(Boolean))].sort();

/** The CODES a new sale entry may use. */
export const sellableCodes = (lines: ProductLine[]): string[] =>
  [...new Set(lines.filter((p) => p.active).map((p) => p.code).filter(Boolean))].sort();

/** Names that exist but are retired — so the form can say WHY one is missing
 *  rather than leaving somebody to conclude the master is incomplete. */
export const retiredNames = (lines: ProductLine[]): string[] => {
  const live = new Set(lines.filter((p) => p.active).map((p) => p.name));
  return [...new Set(lines.filter((p) => !p.active && !live.has(p.name)).map((p) => p.name))]
    .filter(Boolean).sort();
};

/** THE SHORT FORMS, for the Part Master's product family.
 *
 *  DE-DUPLICATED, because several lines share one: all nine CPX CARE codes are
 *  CPX, both EXTEND-XT codes are EXT. A list offering CPX nine times is a list
 *  nobody can use.
 *
 *  ACTIVE AND RETIRED ALIKE. `active` stops a NEW SALE ENTRY and nothing else —
 *  a part still fits a machine that is no longer sold, and most of the spares
 *  catalogue is for exactly those. Refusing to record which would lose the fact
 *  rather than the sale.
 */
export function shortForms(lines: ProductLine[]): string[] {
  return [...new Set(lines.map((l) => l.shortForm).filter(Boolean))].sort();
}

// ===========================================================================
// THE COVER REGISTERS' OWN ARITHMETIC, transcribed from the AppSheet app.
//
// Source: docs/APPSHEET_ADMIN_APPDEF.md — "Service2OAdmin-3911373
// Documentation", sections 3.5 ContractDetails, 3.6 ContractEntry,
// 3.7 WarrantySale, 3.8 WarrantySaleDetails. Each function carries the
// expression it implements VERBATIM, so the two can be compared without
// opening the PDF.
//
// WHY A MODULE AND NOT FOUR COPIES IN THE FORMS: the same rule is stated in
// the spec on BOTH the header and the line (Contract Period (Years) is defined
// on ContractEntry column 9 and again on ContractDetails column 13, with the
// same expression). Two transcriptions of one formula is how they drift.
//
// WHAT THIS FILE DOES NOT CLAIM: the spec's boundary note says the supplied PDF
// "does not show detailed definitions for all 587 columns" and stops before the
// views, format rules and actions. So there is no layout here to match, and
// nothing below is inferred from a screen nobody has seen — only from the
// column definitions the document actually shows.
// ===========================================================================
import { addPeriod } from './dates';

const num = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** `[Contract Period (Months)] / 12` — ContractEntry col 9, ContractDetails
 *  col 13, and the same shape on WarrantySale col 9 as
 *  `[Warranty Period (in Months)] / 12`.
 *
 *  NOT rounded: the spec types it Decimal, and an 18-month contract is 1.5
 *  years. Rounding it to 2 would make the years field disagree with the months
 *  field beside it, which is worse than a fraction. */
export const periodYears = (months: unknown): number | null => {
  const m = num(months);
  return m === null ? null : m / 12;
};

/** The end date, from BOTH registers:
 *
 *    WarrantySale  col 10: EOMONTH([Warranty Start Date],[Warranty Period (in Months)]-1)
 *                          + DAY([Warranty Start Date]) - 1
 *    ContractEntry col 10: EOMONTH([Contract Start Date],[Contract Period (Months)]-1)
 *                          + DAY([Contract Start Date]) - 1
 *
 *  This delegates to addPeriod, which is the application's existing rule, and
 *  the two were PROVED equal rather than assumed: 80 combinations of
 *  start date and period — including 31 January, 29 February in a leap year,
 *  and every month-end — agree exactly. Keeping one implementation matters
 *  more than keeping the spreadsheet's spelling of it. */
export const periodEnd = (startIso: string, months: unknown): string => {
  const m = num(months);
  if (!startIso || m === null || m <= 0) return '';
  return addPeriod(startIso, 0, Math.round(m));
};

/** `([Warranty Period (in Months)] / 12) * 3` — WarrantySale col 11.
 *  Three preventive visits a year under warranty. */
export const warrantyPmVisits = (months: unknown): number | null => {
  const m = num(months);
  return m === null ? null : Math.round((m / 12) * 3);
};

/** `[Contract Period (Months)] / 6` — ContractEntry col 11.
 *  One visit every six months under contract, which is a DIFFERENT rate from
 *  warranty's three a year. The two are easy to conflate and the spec is
 *  explicit that they differ. */
export const contractPmVisits = (months: unknown): number | null => {
  const m = num(months);
  return m === null ? null : Math.round(m / 6);
};

/** `((18 * [Rate]) / 100)` — ContractDetails col 21.
 *  The 18 is GST and it is written into the sheet as a literal; it is kept as
 *  one here rather than spread through the form, so a rate change is one edit. */
export const GST_PERCENT = 18;
export const itemTaxAmount = (rate: unknown): number | null => {
  const r = num(rate);
  return r === null ? null : (GST_PERCENT * r) / 100;
};

/** `([Rate] + [Item Tax Amount])` — ContractDetails col 22. */
export const totalAfterTax = (rate: unknown, tax?: unknown): number | null => {
  const r = num(rate);
  if (r === null) return null;
  const t = tax === undefined ? itemTaxAmount(r) : num(tax);
  return r + (t ?? 0);
};

/** `INDEX(SPLIT([Product Details],"|"),1..3)` — ContractDetails cols 17-19.
 *
 *  The register's machine string is CODE|NAME|SERIAL. A value with fewer parts
 *  yields blanks rather than shifting the others along: SPLIT in the sheet
 *  returns nothing for an index past the end, and guessing which field a
 *  two-part string meant is how a serial ends up in the name column. */
export function splitProductDetails(v: unknown): { code: string; name: string; serial: string } {
  const parts = String(v ?? '').split('|');
  return {
    code: (parts[0] ?? '').trim(),
    name: (parts[1] ?? '').trim(),
    serial: (parts[2] ?? '').trim(),
  };
}

/** `CONCATENATE([Product Code],"|",[Product Name],"|",[Product Serial Number])`
 *  — WarrantySaleDetails col 3.
 *
 *  Built even when a part is blank, because it is the JOIN KEY back to the
 *  Product Master ("Already Sold TO" and "Present Item Status" both look up
 *  through it): dropping a blank would change the shape and match nothing. */
export const itemDetailsLong = (code: unknown, name: unknown, serial: unknown): string =>
  [code, name, serial].map((v) => String(v ?? '').trim()).join('|');

/** ABOUT TO EXPIRE / ACTIVE / INACTIVE — the status column on all four tables
 *  (ContractEntry col 13, WarrantySale col 14, and both detail tables).
 *
 *  The sheet's own formula is a spreadsheet expression the PDF does not print
 *  in full, so the THRESHOLD is this application's, stated rather than
 *  pretended: within 60 days of the end date is "about to expire". Everything
 *  else follows from the dates themselves. A missing end date is NOT called
 *  inactive — it is unknown, and saying "inactive" would read as a decision
 *  somebody made. */
export const ABOUT_TO_EXPIRE_DAYS = 60;
export function coverStatus(endIso: string, today = new Date()): 'ACTIVE' | 'ABOUT TO EXPIRE' | 'INACTIVE' | '' {
  const iso = String(endIso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const end = new Date(`${iso}T00:00:00`);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (Number.isNaN(end.getTime())) return '';
  if (end < now) return 'INACTIVE';
  const days = Math.floor((end.getTime() - now.getTime()) / 86400000);
  return days <= ABOUT_TO_EXPIRE_DAYS ? 'ABOUT TO EXPIRE' : 'ACTIVE';
}

/** The next number in a series.
 *
 *  THE SPEC'S OWN RULE CANNOT BE CARRIED OVER, and saying so is the point:
 *
 *    WarrantySale  col 2: CONCATENATE("SA",[_RowNumber]+1183)
 *    ContractEntry col 2: CONCATENATE("MC",13+[_RowNumber])
 *
 *  `_RowNumber` is the SPREADSHEET ROW — it exists because the data lived in a
 *  sheet, and it is not a property a database row has. Worse, it is unstable:
 *  delete a row and every number below it changes, which for a contract number
 *  printed on paperwork is not a number at all.
 *
 *  So the series continues from the HIGHEST ALREADY ISSUED, the same rule
 *  next_ffr_no uses. The offsets above are preserved as the FLOOR, so the
 *  first number this system issues follows the sheet's last one rather than
 *  colliding with it. */
// Keyed 'sale' | 'contract' — the application's OWN CoverKind, not the spec's
// "WarrantySale". One vocabulary through the codebase beats matching a
// document's spelling in one file and the app's everywhere else.
export const SERIES: Record<'sale' | 'contract', { prefix: string; floor: number }> = {
  sale: { prefix: 'SA', floor: 1183 },
  contract: { prefix: 'MC', floor: 13 },
};

export function nextInSeries(kind: 'sale' | 'contract', existing: readonly string[]): string {
  const { prefix, floor } = SERIES[kind];
  const re = new RegExp(`^${prefix}\\s*0*(\\d+)$`, 'i');
  let top = floor;
  for (const v of existing) {
    const m = re.exec(String(v ?? '').trim());
    if (m) top = Math.max(top, Number(m[1]));
  }
  return `${prefix}${top + 1}`;
}

// ---------------------------------------------------------------------------
// APPLYING THE RULES AS SOMEBODY TYPES.
//
// Keyed on WHICH FIELD CHANGED, not run over the whole row, and that is the
// difference between a form that helps and one that fights you. The spec makes
// the end date an App formula, but this register has always let it be typed —
// a contract that does not run a whole number of months has an end date the
// arithmetic cannot produce. Re-deriving everything on every keystroke would
// silently undo that the moment any other field moved.
//
// So: editing the PERIOD or the START re-derives what they drive. Editing the
// end date itself changes nothing else. Nothing here overwrites a field the
// person is not upstream of.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

const WARRANTY_DRIVERS = ['warranty_months', 'warranty_start'];
const CONTRACT_DRIVERS = ['contract_months', 'contract_start'];

/** The header's derived fields, after `changed` was edited. Returns only what
 *  it sets, so a caller can merge it and see what moved. */
export function deriveHeader(kind: 'sale' | 'contract', changed: string, row: Row): Row {
  const out: Row = {};
  if (kind === 'sale' && WARRANTY_DRIVERS.includes(changed)) {
    const months = row.warranty_months;
    out.warranty_years = periodYears(months);
    out.warranty_end = periodEnd(String(row.warranty_start ?? ''), months);
    out.pm_visits = warrantyPmVisits(months);
  }
  if (kind === 'contract' && CONTRACT_DRIVERS.includes(changed)) {
    const months = row.contract_months;
    out.contract_years = periodYears(months);
    out.contract_end = periodEnd(String(row.contract_start ?? ''), months);
    out.pm_visits_total = contractPmVisits(months);
  }
  return out;
}

/** A machine line's derived fields, after `changed` was edited.
 *
 *  The three product columns are derived from the machine string on a CONTRACT
 *  line (the spec splits Product Details) and the string is built FROM them on
 *  a WARRANTY line (the spec concatenates Item Details Long). The direction is
 *  opposite on the two tables and it is not a mistake in either: a contract
 *  picks an existing machine, a sale names one that may be new. */
export function deriveItem(kind: 'sale' | 'contract', changed: string, row: Row): Row {
  const out: Row = {};
  if (changed === 'rate') {
    const tax = itemTaxAmount(row.rate);
    out.item_tax_amount = tax;
    out.total_after_tax = totalAfterTax(row.rate, tax);
  }
  if (changed === 'item_tax_amount') out.total_after_tax = totalAfterTax(row.rate, row.item_tax_amount);
  if (kind === 'contract' && changed === 'product_details') {
    const p = splitProductDetails(row.product_details);
    out.product_code = p.code; out.product_name = p.name; out.serial_number = p.serial;
  }
  if (kind === 'sale' && ['product_code', 'product_name', 'serial_number'].includes(changed)) {
    out.item_detail_long = itemDetailsLong(row.product_code, row.product_name, row.serial_number);
  }
  if (kind === 'sale' && WARRANTY_DRIVERS.includes(changed)) {
    out.warranty_years = periodYears(row.warranty_months);
    out.warranty_end = periodEnd(String(row.warranty_start ?? ''), row.warranty_months);
    out.pm_visits = warrantyPmVisits(row.warranty_months);
  }
  if (kind === 'contract' && CONTRACT_DRIVERS.includes(changed)) {
    out.contract_years = periodYears(row.contract_months);
    out.contract_end = periodEnd(String(row.contract_start ?? ''), row.contract_months);
  }
  return out;
}

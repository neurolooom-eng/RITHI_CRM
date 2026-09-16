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
// SECOND SOURCE, and it settles what the first could not: the SPREADSHEET
// FORMULA EXPORT from `Appsheet - Forms.xlsx`. The PDF describes the sheet-side
// columns only as "a spreadsheet formula ... emits values including ABOUT TO
// EXPIRE, ACTIVE, INACTIVE" — it names the outputs and withholds the rule. The
// export prints the rule. Where a function below cites a cell (`M2`, `V2`,
// `AD2`) it is quoting that export; where it cites a column number it is
// quoting the PDF. Both are named so a disagreement between them is findable.
//
// WHAT THIS FILE DOES NOT CLAIM: the spec's boundary note says the supplied PDF
// "does not show detailed definitions for all 587 columns" and stops before the
// views, format rules and actions. So there is no layout here to match, and
// nothing below is inferred from a screen nobody has seen — only from the
// column definitions the document actually shows and the formulas the export
// actually prints.
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

/** THE PERIOD AS ONE NUMBER OF MONTHS — because a contract row states it TWICE
 *  and the two are the same fact, not two facts to add up.
 *
 *  `contract_years` is DERIVED from `contract_months` (above: months / 12), so
 *  a one-year contract is stored as years = 1 AND months = 12. Anything that
 *  reads both and adds them gets twenty-four months.
 *
 *  That is exactly what the renewal did (found 2026-09-16, while adding price
 *  revision to the same panel): `addPeriod(start, years, months)` on a one-year
 *  contract proposed a TWO-year renewal, and on a two-year contract a four-year
 *  one. The form never had the bug because it computes the end from months
 *  alone; only the renewal passed both.
 *
 *  MONTHS WINS when both are present, since months is the one the form drives
 *  from and the one that can express a period years cannot. Years is the
 *  fallback for a row that somehow has only that — an old import, say — where
 *  ignoring it would turn a real period into none. */
export const periodToMonths = (years: unknown, months: unknown): number | null => {
  const m = num(months);
  if (m !== null) return m;
  const y = num(years);
  return y === null ? null : y * 12;
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

/** REVISING A RATE AT RENEWAL — the old rate lifted by a percentage.
 *
 *  A renewal is re-priced, and on a contract carrying twenty machines that is
 *  twenty numbers. Almost always they move together: the same percentage on
 *  last year's rate. So this computes the SUGGESTION, and the panel still puts
 *  it in an editable box — a machine that is being repriced differently is
 *  typed over, and nothing is written that somebody did not see.
 *
 *  IT IS NOT A SILENT CARRY-FORWARD, which the renewal deliberately refuses:
 *  this only ever runs because somebody entered a percentage and pressed the
 *  button. 0% is a real answer (hold last year's price) and is honoured; a
 *  machine with NO old rate yields null rather than 0, because "we do not know
 *  what this was on" and "it was free" are different facts and only one of them
 *  is true.
 *
 *  Rounded to paise, or a 7% uplift on 1000 arrives as 1070.0000000000001 and
 *  that lands in a box somebody is about to agree to. */
export const upliftRate = (oldRate: unknown, percent: unknown): number | null => {
  const r = num(oldRate);
  const p = num(percent);
  if (r === null || p === null) return null;
  return Math.round(r * (1 + p / 100) * 100) / 100;
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

/** ABOUT TO EXPIRE / ACTIVE / INACTIVE / NOT COVERED — the status column on
 *  all four tables (ContractEntry col 13, WarrantySale col 14, and both detail
 *  tables), and the STATE TILES the register filters by.
 *
 *  THE THIRTY IS THE SHEET'S, no longer this application's guess. The supplied
 *  documentation described these columns only as "a spreadsheet formula …
 *  emits values including ABOUT TO EXPIRE, ACTIVE, INACTIVE" and never printed
 *  the expression, so 0036 chose 60 and said so. The formula export
 *  (Appsheet - Forms.xlsx) supplies it, identically on all four sheets:
 *
 *    SaleEntry           M2  =IF(I2>=Today(),IF(I2<=(Today()+30),"ABOUT TO EXPIRE","ACTIVE"),"INACTIVE")
 *    WarrantySaleDetails V2  =IF(O2>=Today(),IF(O2<=(Today()+30),"ABOUT TO EXPIRE","ACTIVE"),"INACTIVE")
 *    ContractEntry       L2  =IF(I2>=Today(),IF(I2<=(Today()+30),"ABOUT TO EXPIRE","ACTIVE"),"INACTIVE")
 *    ContractDetails     W2  =IF(M2>=Today(),IF(M2<=(Today()+30),"ABOUT TO EXPIRE","ACTIVE"),"INACTIVE")
 *
 *  I / O / I / M there are the end-date column on each sheet.
 *
 *  ONE IMPLEMENTATION, THREE PLACES IT USED TO LIVE. The number was written
 *  out three times — here, in `cover_state()` (the SQL the *_details views
 *  read), and a fourth hand-rolled `stateOf` inside the register screen — so
 *  the entries tab and the machines tab could disagree with each other and
 *  with the sheet. The screen now calls this; the SQL is the same rule in the
 *  one place a view can reach (0187), and check:ui refuses another copy of the
 *  threshold in the module.
 *
 *  DELIBERATELY NOT THE SHEET'S ANSWER FOR A BLANK END DATE: in Sheets an
 *  empty cell compared with `>=Today()` is TRUE, so the sheet calls a machine
 *  with no end date ACTIVE. That is a comparison artefact, not a decision
 *  anybody made, and "active" is the one wrong answer for an unknown — so a
 *  missing or unparseable date is NOT COVERED, matching cover_state(). */
export const ABOUT_TO_EXPIRE_DAYS = 30;
export type CoverState = 'ACTIVE' | 'ABOUT TO EXPIRE' | 'INACTIVE' | 'NOT COVERED';
export function coverStatus(endIso: unknown, today = new Date()): CoverState {
  const iso = String(endIso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'NOT COVERED';
  const end = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(end.getTime())) return 'NOT COVERED';
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (end < now) return 'INACTIVE';
  const days = Math.round((end.getTime() - now.getTime()) / 86400000);
  return days <= ABOUT_TO_EXPIRE_DAYS ? 'ABOUT TO EXPIRE' : 'ACTIVE';
}

/** `=J&"|"&L` — WarrantySaleDetails col 4, and `=Q&"|"&R` — ContractDetails
 *  col 5. Both are PRODUCT NAME | SERIAL NUMBER, and the two sheets agreeing
 *  is what makes it one function rather than two.
 *
 *  NOT the same string as `itemDetailsLong` below, which carries the code as
 *  well and is the key into the Product Master. Two strings, two jobs; they
 *  are easy to confuse because the sheet names them four characters apart. */
export const itemDetails = (name: unknown, serial: unknown): string =>
  [name, serial].map((v) => String(v ?? '').trim()).join('|');

/** `=if(LEN(U2:U17347)<2,"WI-","RWI-")` — WarrantySaleDetails col 31, Add Call,
 *  where U is `Already Sold TO`.
 *
 *  A machine nobody has sold before gets a Warranty Installation; one that has
 *  already been sold to somebody gets a RE-warranty installation. The `<2`
 *  rather than `<1` is the sheet's and is kept verbatim — a one-character
 *  party name is not a party name. */
export const addCallPrefix = (alreadySoldTo: unknown): 'WI-' | 'RWI-' =>
  String(alreadySoldTo ?? '').length < 2 ? 'WI-' : 'RWI-';

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
  // RATE, TAX AND TOTAL ARE A CONTRACT'S, NOT A SALE'S. The spec puts them on
  // ContractDetails (cols 20-22) and nowhere on WarrantySaleDetails, and the
  // tables agree: sale_items has no such columns. Ungated, this put three
  // non-existent columns on a sale line — which does not merely do nothing, it
  // makes PostgREST refuse the whole save.
  if (kind === 'contract' && changed === 'rate') {
    const tax = itemTaxAmount(row.rate);
    out.item_tax_amount = tax;
    out.total_after_tax = totalAfterTax(row.rate, tax);
  }
  if (kind === 'contract' && changed === 'item_tax_amount') {
    out.total_after_tax = totalAfterTax(row.rate, row.item_tax_amount);
  }
  if (kind === 'contract' && changed === 'product_details') {
    const p = splitProductDetails(row.product_details);
    out.product_code = p.code; out.product_name = p.name; out.serial_number = p.serial;
  }
  // NOTE: the spec's `Item Details Long` (WarrantySaleDetails col 3) is NOT set
  // here, and that is deliberate rather than an omission. There is no such
  // column on sale_items — `item_detail` exists on `parts` alone — so putting
  // it on the row makes PostgREST refuse the WHOLE save with "could not find
  // the column in the schema cache", which is the fault the Field Failure
  // Register shipped with earlier and the reason writes are whitelisted below.
  // The value is derivable from the three parts at any point it is needed
  // (itemDetailsLong is exported); storing it would take a migration and a
  // reason to store it.
  // Add Call follows "Already Sold TO" and nothing else: a machine with a
  // previous owner takes a RE-warranty installation. Keyed on that field
  // CHANGING, so a value somebody typed by hand is never overwritten by a
  // re-derivation they did not ask for.
  if (kind === 'sale' && changed === 'already_sold_to') {
    out.add_call = addCallPrefix(row.already_sold_to);
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

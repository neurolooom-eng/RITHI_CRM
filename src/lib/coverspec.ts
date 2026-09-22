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
// ---------------------------------------------------------------------------
// PM VISITS ARE SUGGESTED, NOT IMPOSED.
//
//   The user, 2026-09-22: "PM visit should editable by the user. It varies
//   based on PO."
//
// The count follows from the period -- three a year under warranty, one every
// six months under contract -- and that is the right STARTING answer, because
// it is what the standard offer says. It is not the right FINAL answer: what
// was actually sold is on the purchase order, and a PO with four visits a year
// is a PO with four visits a year.
//
// SO IT FOLLOWS THE PERIOD UNTIL SOMEBODY CHANGES IT, AND THEN IT IS THEIRS.
// The test for "has somebody changed it" is whether the value still equals
// what the period SUGGESTED before this edit -- the same rule as a machine
// pinning a field away from its entry, and for the same reason. A count that
// keeps snapping back to three every time the start date is corrected is a
// field somebody has to re-type until they give up; one that never follows the
// period at all makes every ordinary sale a manual entry.
//
// `prev` IS THE ROW BEFORE THIS EDIT and is what makes the question answerable:
// after the edit the period has already moved, so "does it match the
// suggestion" would compare against the NEW one and read as overridden on
// every period change. Omitting `prev` keeps the old behaviour for callers
// that do not have it -- the value simply follows.
// ---------------------------------------------------------------------------
const stillFollowing = (current: unknown, suggestedBefore: unknown): boolean =>
  current === null || current === undefined || current === ''
  || Number(current) === Number(suggestedBefore);

export function deriveHeader(kind: 'sale' | 'contract', changed: string, row: Row, prev?: Row): Row {
  const out: Row = {};
  if (kind === 'sale' && WARRANTY_DRIVERS.includes(changed)) {
    const months = row.warranty_months;
    out.warranty_years = periodYears(months);
    out.warranty_end = periodEnd(String(row.warranty_start ?? ''), months);
    if (!prev || stillFollowing(prev.pm_visits, warrantyPmVisits(prev.warranty_months))) {
      out.pm_visits = warrantyPmVisits(months);
    }
  }
  if (kind === 'contract' && CONTRACT_DRIVERS.includes(changed)) {
    const months = row.contract_months;
    out.contract_years = periodYears(months);
    out.contract_end = periodEnd(String(row.contract_start ?? ''), months);
    if (!prev || stillFollowing(prev.pm_visits_total, contractPmVisits(prev.contract_months))) {
      out.pm_visits_total = contractPmVisits(months);
    }
  }
  return out;
}

/** What the period suggests, so a form can offer it back once somebody has
 *  typed over it. */
export const suggestedPmVisits = (kind: 'sale' | 'contract', months: unknown): number | null =>
  (kind === 'sale' ? warrantyPmVisits(months) : contractPmVisits(months));

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

// ===========================================================================
// THE PARTY FILLS THE SALE IN — one mapping, in one place.
//
//   The user, 2026-09-22: "In Warranty Sale - Party Name should be a drop-down
//   from Party Master - Type Search and select. All relevant fields like city,
//   state, address should fill in Automatically based on the selected Party."
//
// WHY IT IS A FUNCTION AND NOT TEN LINES IN THE FORM: the columns are named
// differently on the two sides (`phone` is `tel1`, `gstin` is `gst`,
// `service_engineer` is `engineer`), and a mapping written inline is one nobody
// can test and everybody can half-copy.
//
// CHANGING THE PARTY REPLACES ALL OF THEM, INCLUDING WITH BLANKS, and that is
// the decision worth stating. Keeping the previous party's address where the
// new one has none looks helpful and is the worst outcome available: a sale
// carrying a DIFFERENT customer's address, with nothing on screen saying so.
// These fields describe the chosen party; if the installation address really
// differs, it is typed afterwards, over a field that is visibly the party's.
//
// A VALUE THE FORM CANNOT OFFER IS DROPPED RATHER THAN FORCED IN. `party_type`
// and `profile` are pick-lists with a fixed vocabulary, and the Party Master is
// free-typed in places; a value outside the list would sit in a box that cannot
// re-select it, which reads as a form that has lost the value.
// ===========================================================================

export interface PartyFill {
  state?: unknown; city?: unknown; address?: unknown; pincode?: unknown;
  phone?: unknown; phone_2?: unknown; pan?: unknown; gstin?: unknown;
  party_type?: unknown; profile?: unknown; service_engineer?: unknown;
}

const text = (v: unknown) => String(v ?? '').trim();
const oneOf = (v: unknown, allowed: string[]) => {
  const t = text(v).toUpperCase();
  return allowed.includes(t) ? t : '';
};

export const SALE_PARTY_TYPES = ['CUSTOMER', 'DEALER'];
export const SALE_PROFILES = ['PRIVATE', 'GOVERNMENT', 'DEALER', 'GENERAL'];

/** The Sale Entry fields that follow the party, as the party has them. Every
 *  key is always present, so applying it CLEARS what the new party does not
 *  have rather than leaving the previous party's value behind. */
export function partyFillForSale(p: PartyFill | null): Row {
  const q = p ?? {};
  return {
    state: text(q.state),
    city: text(q.city),
    address: text(q.address),
    pincode: text(q.pincode),
    tel1: text(q.phone),
    tel2: text(q.phone_2),
    pan: text(q.pan),
    gst: text(q.gstin),
    party_type: oneOf(q.party_type, SALE_PARTY_TYPES),
    profile: oneOf(q.profile, SALE_PROFILES),
    engineer: text(q.service_engineer),
  };
}

/** Which Sale Entry fields the party fills — so the form can say so beside
 *  them, and so a check can hold the two lists together. */
export const SALE_PARTY_FIELDS = Object.keys(partyFillForSale(null));

// ===========================================================================
// THE PRODUCT CODE AND THE PRODUCT NAME ARE ONE CHOICE, NOT TWO.
//
// A sale line asks for both and the Product Master holds both, so typing the
// second is re-keying something the system already knows — and the pair being
// out of step is a machine the register cannot match back to its catalogue
// line.
//
// IT FILLS ONLY WHERE THE ANSWER IS UNAMBIGUOUS. Nine catalogue codes share the
// name "CPX CARE", so choosing that name does not decide a code and the field
// is LEFT ALONE rather than given the first one — the same rule as a Drive file
// name matching two files, and for the same reason: a wrong code on a machine
// record is worse than a blank one, because the blank gets filled in and the
// wrong one gets believed.
//
// It never CLEARS the other field. An unrecognised name is one the catalogue
// has not got, not a reason to throw away a code somebody typed.
// ===========================================================================

export interface CatalogueLine { code: string; name: string; active: boolean }

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

export function pairProductCodeAndName(
  changed: 'product_name' | 'product_code', value: string, lines: CatalogueLine[],
): Row {
  const v = norm(value);
  if (!v) return {};
  const live = lines.filter((l) => l.active);
  if (changed === 'product_name') {
    const codes = [...new Set(live.filter((l) => norm(l.name) === v).map((l) => l.code).filter(Boolean))];
    return codes.length === 1 ? { product_code: codes[0] } : {};
  }
  const names = [...new Set(live.filter((l) => norm(l.code) === v).map((l) => l.name).filter(Boolean))];
  return names.length === 1 ? { product_name: names[0] } : {};
}

// ===========================================================================
// FORCING EVERY MACHINE BACK ONTO THE ENTRY.
//
//   The user, 2026-09-22: "Force inherit — 'Force Update Child Records' the
//   parent details to all child records."
//
// A machine under a Sale or a Contract follows its entry until somebody types
// into one of its fields; from then on that field is PINNED and the entry no
// longer moves it. That is the right default — a machine really can carry a
// different warranty start from the rest of its sale — and it is also how an
// entry ends up moving nothing at all, because a bulk import once wrote the
// entry's own values onto every machine and every field is pinned to a value
// that merely LOOKS inherited.
//
// This is the deliberate way back: clear every inheriting field on every
// machine so they all follow the entry again.
//
// IT IS DESTRUCTIVE AND THE SCREEN MUST SAY WHAT IT WILL DESTROY. A pinned
// value that genuinely differs from the entry is somebody's decision about ONE
// machine, and there is no undo — the previous values are gone. So the count is
// computed FIELD BY FIELD and shown before anything is written, and the ones
// that differ from the entry are counted separately from the ones that merely
// repeat it: clearing a value identical to the entry changes nothing anybody
// can see, and clearing one that differs changes the record.
//
// PURE, AND HERE RATHER THAN IN cover.ts, for the paging.ts reason: that module
// reaches supabase.ts and its import.meta.env, so nothing in it can be tested.
// ===========================================================================

export interface InheritField { name: string; label: string; inherits?: boolean }

export interface PinnedSummary {
  /** Fields pinned on at least one machine, commonest first. */
  fields: { name: string; label: string; machines: number; differing: number }[];
  /** Machines carrying at least one pinned field. */
  machines: number;
  /** Pinned values that DIFFER from the entry — the ones with something to lose. */
  differing: number;
  /** Every pinned value, differing or not. */
  total: number;
}

/** Is this field pinned on this machine? The one copy of the rule — a pinned
 *  field holds a value of its own; null, undefined and '' all mean "follow the
 *  entry". */
export const isPinnedValue = (v: unknown): boolean => v !== null && v !== undefined && v !== '';

const same = (a: unknown, b: unknown) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

export function summarisePinned(fields: InheritField[], items: Row[], header: Row): PinnedSummary {
  const inheriting = fields.filter((f) => f.inherits);
  const out: PinnedSummary = { fields: [], machines: 0, differing: 0, total: 0 };
  const touched = new Set<number>();

  for (const f of inheriting) {
    let machines = 0;
    let differing = 0;
    items.forEach((it, i) => {
      if (!isPinnedValue(it[f.name])) return;
      machines += 1;
      touched.add(i);
      if (!same(it[f.name], header[f.name])) differing += 1;
    });
    if (machines) out.fields.push({ name: f.name, label: f.label, machines, differing });
    out.total += machines;
    out.differing += differing;
  }
  out.fields.sort((a, b) => b.machines - a.machines || a.label.localeCompare(b.label));
  out.machines = touched.size;
  return out;
}

/** The patch that puts every machine back on the entry: every inheriting field
 *  set to null. Built from the field list, so a field added to the register is
 *  covered by that fact alone. */
export const inheritAllPatch = (fields: InheritField[]): Row =>
  Object.fromEntries(fields.filter((f) => f.inherits).map((f) => [f.name, null]));

// ===========================================================================
// THE INSTALLATION CALL A SALE ENTRY RAISES.
//
//   The user, 2026-09-22: "Provision add Installation Calls in Warranty Sale
//   Entry. Map the party, Product Details, Standard Complaint - Installation
//   Calls, Complaint Reported - Installation Calls. All Vigilance questions set
//   to No, Leave customer details blank. Once the call is created, map it to
//   the Warranty Sale detail [Product+Serial] is what matters."
//
// A machine has been sold and somebody has to go and install it. Every fact
// that call needs is already on the sale entry, and re-typing it into the call
// form is where the customer, the model or the serial stops matching the sale.
//
// THE VIGILANCE ANSWERS ARE "NO" BECAUSE THE USER SAID SO, and that is worth
// writing down rather than assuming. Public Health Threat, Death and Serious
// Incident are asked of a COMPLAINT — an installation is not one, and the three
// are answered by the Hotline engineer trained to ask them. Set here they are
// the honest answer to "did a device hurt somebody?" for a machine that has not
// been switched on yet. They remain editable on the call afterwards, which is
// what matters: an installation that DOES go wrong is answered by a person.
//
// THE CUSTOMER CONTACT IS LEFT BLANK, also on instruction, and also not
// arbitrary: `person_calling` and the customer block record WHO REPORTED a
// fault. Nobody reported this. Filling them with the sale's contact would put a
// name against a report that never happened.
//
// THE COVER COMES FROM THE ENTRY where the entry has one. A machine installed
// under a warranty sale is in warranty; a call raised with no cover reads as
// OGP and feeds every count that asks who is paying. Where the sale records no
// warranty at all, the cover is LEFT BLANK rather than guessed — an unknown
// cover gets asked about, a wrong one gets believed.
// ===========================================================================

export const INSTALL_COMPLAINT = 'Installation Calls';

export interface SaleForCall {
  party_name?: unknown; city?: unknown; state?: unknown;
  sa_number?: unknown; warranty_start?: unknown; warranty_end?: unknown;
  warranty_months?: unknown;
}
export interface SaleItemForCall {
  product_name?: unknown; serial_number?: unknown;
  warranty_start?: unknown; warranty_end?: unknown; inst_call?: unknown;
}

/** The call record for one machine, in the shape `addCall` takes. */
export function installCallFromSale(header: SaleForCall, item: SaleItemForCall): Row {
  const pick = (a: unknown, b: unknown) => (isPinnedValue(a) ? a : b);
  const wStart = pick(item.warranty_start, header.warranty_start);
  const wEnd = pick(item.warranty_end, header.warranty_end);
  const covered = isPinnedValue(wEnd) || isPinnedValue(header.warranty_months);
  return {
    callType: 'INSTALLATION',
    // The party, from the entry.
    partyName: text(header.party_name),
    city: text(header.city),
    state: text(header.state),
    // The machine. A machine is its MODEL and its SERIAL, and both come from
    // the sale line rather than from anything typed twice.
    productName: text(item.product_name),
    serial: text(item.serial_number),
    // What the call is for. Both columns, on instruction: one is the coded
    // reason every count groups by, the other is what a reader sees.
    standardComplaint: INSTALL_COMPLAINT,
    complaintReported: INSTALL_COMPLAINT,
    // Vigilance: answered No. An installation is not a complaint.
    publicHealthThreat: 'NO',
    death: 'NO',
    seriousIncident: 'NO',
    // Nobody reported this, so nobody is recorded as having reported it.
    personCalling: '',
    customerName: '',
    customerNumber: '',
    customerDesignation: '',
    emailAddress: '',
    // The cover, where the sale has one.
    warrantyNumber: covered ? text(header.sa_number) : '',
    warrantyStart: covered ? text(wStart) : '',
    warrantyEnd: covered ? text(wEnd) : '',
    itemStatus: covered ? 'WGP' : '',
  };
}

/** Which machines on this entry still need an installation call. Keyed on
 *  PRODUCT + SERIAL, which is what identifies a machine; a line with neither
 *  is not a machine yet and is skipped rather than given a call about nothing. */
export function machinesNeedingInstallCall<T extends SaleItemForCall>(items: T[]): T[] {
  return items.filter((i) => !isPinnedValue(i.inst_call)
    && isPinnedValue(i.product_name) && isPinnedValue(i.serial_number));
}

// ===========================================================================
// RE-READING THE CUSTOMER ONTO A SALE THAT ALREADY NAMES THEM.
//
//   The user, 2026-09-22: "Also add a provision to update address in Warranty
//   Sale based on update from Party Master."
//
// The sale takes the customer's address when the customer is CHOSEN. A hospital
// that moves, or a Party Master record that is corrected afterwards, leaves
// every sale already raised carrying the old address — and those are the ones
// somebody is trying to deliver to.
//
// IT IS A DELIBERATE ACT WITH A NAMED EFFECT, not a background sync. The
// installation address on a sale legitimately differs from the customer's
// registered one, and a sale whose address quietly changed under an operator
// who had corrected it by hand is worse than one that is out of date: the first
// is wrong without anybody knowing, the second is visibly stale.
//
// SO THIS RETURNS WHAT WOULD CHANGE, AND THE SCREEN SAYS IT. A field the master
// agrees with is not listed — telling somebody that eleven fields "changed"
// when nine of them did not is a number they stop reading.
// ===========================================================================

export interface FieldChange { field: string; from: string; to: string }

/** The differences between a sale entry and what the Party Master would fill.
 *  Compared on the TRIMMED text, so whitespace alone is not a change. */
export function partyFillChanges(current: Row, fill: Row): FieldChange[] {
  const out: FieldChange[] = [];
  for (const [field, to] of Object.entries(fill)) {
    const a = String(current[field] ?? '').trim();
    const b = String(to ?? '').trim();
    if (a !== b) out.push({ field, from: a, to: b });
  }
  return out;
}

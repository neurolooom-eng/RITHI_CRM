// ===========================================================================
// Importing the four AppSheet exports AS EXPORTED.
//
//   Sale Entry            → sale_entries       (header)
//   Warranty Sale Details → sale_items         (one machine each)
//   Contract Entry        → contract_entries   (header)
//   Contract Details      → contract_items     (one machine each)
//
// Every column of every file has a home: a table column where one exists, and
// the `extra` jsonb otherwise, so nothing in the export is dropped. Values are
// loaded as they stand — the copied-down header values included — and
// `cover_unpin_inherited()` afterwards nulls the ones that merely repeat their
// header, leaving genuine differences pinned as overrides. Nothing is
// reinterpreted on the way in.
//
// Order does not matter: an item whose header has not been loaded yet gets a
// stub header (0036_sales_contracts.sql), which the header file then fills in.
// ===========================================================================

import { toIsoDate, toIsoTimestamp } from './dates';

export type CoverTable = 'sale_entries' | 'sale_items' | 'contract_entries' | 'contract_items';

// Spreadsheet error text is not data.
const JUNK = new Set(['#REF!', '#N/A', '#VALUE!', '#NAME?', '#DIV/0!', '#NULL!', '#NUM!']);
const str = (v: unknown): string => {
  const s = String(v ?? '').trim();
  return JUNK.has(s) ? '' : s;
};

// Dates come from ./dates, the one parser every import shares.
//
// A wall-clock time in the export is read as LOCAL time, like every other
// importer — settled with the user 2026-09-03. This importer used to write it
// as if UTC, which put every sale / contract entry time 5½ h off for IST.
export const toDate = (v: unknown): string | null => toIsoDate(str(v));
export const toTimestamp = (v: unknown): string | null => toIsoTimestamp(str(v), 'local');

// "7,51,192.00" (Indian grouping) is a number; "" and "#REF!" are not.
export function toNum(v: unknown): number | null {
  const s = str(v).replace(/,/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export const toInt = (v: unknown): number | null => {
  const n = toNum(v);
  return n === null ? null : Math.round(n);
};
export function toBool(v: unknown): boolean | null {
  const s = str(v).toLowerCase();
  if (!s) return null;
  if (/^(true|yes|y|1)$/.test(s)) return true;
  if (/^(false|no|n|0)$/.test(s)) return false;
  return null;
}

// Which file is this? Each export has a column combination no other one has.
export function detectCoverTable(headers: string[]): CoverTable | null {
  const H = new Set(headers.map((h) => h.trim()));
  // Contract Details carries an SA Number too (the sale the machine came
  // from), so the contract files are ruled out before the sale ones.
  if (H.has('MC Number') && H.has('Product Serial Number')) return 'contract_items';
  if (H.has('MC Number') && H.has('Prev MC Number')) return 'contract_entries';
  if (H.has('SA Number') && H.has('Product Serial Number')) return 'sale_items';
  if (H.has('SA Number') && (H.has('Inst. Pincode') || H.has('Service Engineer - Initial'))) return 'sale_entries';
  return null;
}

// Columns already represented by a table column, or derived by the views
// (Item Details = Product|Serial, and the header values a child repeats).
// Everything else on the row is kept in `extra`.
const leftovers = (r: Record<string, string>, mapped: string[]): Record<string, string> => {
  const skip = new Set(mapped);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) {
    const key = k.trim();
    if (!skip.has(key) && str(v)) out[key] = str(v);
  }
  return out;
};

const SALE_ENTRY_COLS = ['SA Number', 'Timestamp', 'Party Name', 'Sold Through', 'INVOICE NO', 'INVOICE DATE',
  'Warranty Start Date', 'Warranty Period (in Years)', 'Warranty End Date', 'PM VISITS', 'Other Details',
  'Warranty Period (in Months)', 'WARRANTY STATUS', 'Type', 'Profile', 'COUNTRY', 'State', 'City',
  'Service Engineer - Initial', 'Address', 'Inst. Pincode', 'Tel 1', 'Tel 2', 'PAN', 'GST', 'TAX'];

const SALE_ITEM_COLS = ['Priority', 'Item Details Long', 'Item Details', 'SA Number', 'Sale Entry Date', 'Party Name',
  'Sold Through', 'INVOICE NO', 'INVOICE DATE', 'Product Name', 'Product Code', 'Product Serial Number',
  'Warranty Start Date', 'Warranty Period (in Years)', 'Warranty End Date', 'PM VISITS', 'ACCESSORIES INCLUDED?',
  'CONSUMABLE INCLUDED?', 'CONTRACT PRICE FIXED?', 'Other Details', 'Already Sold TO', 'WARRANTY STATUS',
  'Warranty Period (in Months)', 'Replacement UNIT?', 'Replacement Unit SL NO', 'Added By', 'STATE', 'CITY',
  'ENGINEER', 'Add Call', 'INST Call'];

const CONTRACT_ENTRY_COLS = ['MC Number', 'Contract Entry Date', 'Party Name', 'Payment Schedule', 'Bill Generate At',
  'Contract Type', 'Contract Start Date', 'Contract Period (Years)', 'Contract End Date', 'P M Visits (TOTAL)',
  'Contract Period (Months)', 'Status', 'Prev MC Number'];

const CONTRACT_ITEM_COLS = ['UID', 'Priority', 'Item Details Long', 'Item Details', 'MC Number', 'Contract Entry Date',
  'Party Name', 'Payment Schedule', 'Bill Generate At', 'Contract Type', 'Contract Start Date',
  'Contract Period (Years)', 'Contract End Date', 'P M Visits (TOTAL)', 'Product Details', 'Product Code',
  'Product Name', 'Product Serial Number', 'Rate', 'Item Tax Amount', 'Total After Tax', 'Contract Period (Months)',
  'Status', 'Present Item Status', 'Last Contract Number', 'Last Contract End Date', 'SA Number', 'SA End Date',
  'Added By'];

// A machine whose sale was never keyed still has to land somewhere, or the row
// is lost on a foreign key. It goes under this header, which the stub trigger
// creates, so it is visible and can be reassigned later.
export const ORPHAN_SA = 'SA-UNKNOWN';
export const ORPHAN_MC = 'MC-UNKNOWN';

// On an ITEM, a column that also exists on the header is an override: an empty
// cell means "inherit", so it is stored as null rather than as an empty string
// that would pin the item to blank. (17,051 contract rows have no Status of
// their own — every one of them should follow its contract.)
export function shapeCoverRows(table: CoverTable, raw: Record<string, string>[]): Record<string, unknown>[] {
  const g = (r: Record<string, string>) => (k: string) => str(r[k]);

  if (table === 'sale_entries') {
    return dedupe(raw.map((r) => {
      const v = g(r);
      return {
        sa_number: v('SA Number'), entry_at: toTimestamp(r['Timestamp']),
        party_name: v('Party Name'), sold_through: v('Sold Through'),
        invoice_no: v('INVOICE NO'), invoice_date: toDate(r['INVOICE DATE']),
        warranty_start: toDate(r['Warranty Start Date']), warranty_end: toDate(r['Warranty End Date']),
        warranty_years: toNum(r['Warranty Period (in Years)']), warranty_months: toInt(r['Warranty Period (in Months)']),
        pm_visits: toInt(r['PM VISITS']), warranty_status: v('WARRANTY STATUS'), other_details: v('Other Details'),
        party_type: v('Type'), profile: v('Profile'), country: v('COUNTRY'),
        state: v('State'), city: v('City'), engineer: v('Service Engineer - Initial'),
        address: v('Address'), pincode: v('Inst. Pincode'), tel1: v('Tel 1'), tel2: v('Tel 2'),
        pan: v('PAN'), gst: v('GST'), tax: v('TAX'),
        extra: leftovers(r, SALE_ENTRY_COLS),
      };
    }).filter((r) => r.sa_number), 'sa_number');
  }

  if (table === 'sale_items') {
    return dedupe(raw.map((r) => {
      const v = g(r);
      const sa = v('SA Number') || ORPHAN_SA;
      return {
        uid: `${sa}|${v('Product Name')}|${v('Product Serial Number')}`,
        sa_number: sa, priority: toInt(r['Priority']),
        product_code: v('Product Code'), product_name: v('Product Name'), serial_number: v('Product Serial Number'),
        invoice_no: v('INVOICE NO') || null, invoice_date: toDate(r['INVOICE DATE']), sold_through: v('Sold Through') || null,
        warranty_start: toDate(r['Warranty Start Date']), warranty_end: toDate(r['Warranty End Date']),
        warranty_years: toNum(r['Warranty Period (in Years)']), warranty_months: toInt(r['Warranty Period (in Months)']),
        pm_visits: toInt(r['PM VISITS']), warranty_status: v('WARRANTY STATUS') || null, other_details: v('Other Details') || null,
        state: v('STATE') || null, city: v('CITY') || null, engineer: v('ENGINEER') || null,
        accessories_included: toBool(r['ACCESSORIES INCLUDED?']),
        consumable_included: toBool(r['CONSUMABLE INCLUDED?']),
        contract_price_fixed: toBool(r['CONTRACT PRICE FIXED?']),
        already_sold_to: v('Already Sold TO'),
        replacement_unit: toBool(r['Replacement UNIT?']), replacement_unit_sl: v('Replacement Unit SL NO'),
        add_call: v('Add Call'), inst_call: v('INST Call'), added_by: v('Added By'),
        extra: leftovers(r, SALE_ITEM_COLS),
      };
    }), 'uid');
  }

  if (table === 'contract_entries') {
    return dedupe(raw.map((r) => {
      const v = g(r);
      return {
        mc_number: v('MC Number'), entry_at: toTimestamp(r['Contract Entry Date']),
        party_name: v('Party Name'), payment_schedule: v('Payment Schedule'), bill_generate_at: v('Bill Generate At'),
        contract_type: v('Contract Type'),
        contract_start: toDate(r['Contract Start Date']), contract_end: toDate(r['Contract End Date']),
        contract_years: toNum(r['Contract Period (Years)']), contract_months: toInt(r['Contract Period (Months)']),
        pm_visits_total: toInt(r['P M Visits (TOTAL)']), status: v('Status'), prev_mc_number: v('Prev MC Number'),
        extra: leftovers(r, CONTRACT_ENTRY_COLS),
      };
    }).filter((r) => r.mc_number), 'mc_number');
  }

  return dedupe(raw.map((r) => {
    const v = g(r);
    const mc = v('MC Number') || ORPHAN_MC;
    return {
      uid: v('UID') || `${mc}|${v('Product Name')}|${v('Product Serial Number')}`,
      mc_number: mc, priority: toInt(r['Priority']),
      product_code: v('Product Code'), product_name: v('Product Name'), serial_number: v('Product Serial Number'),
      entry_at: toTimestamp(r['Contract Entry Date']), party_name: v('Party Name') || null,
      payment_schedule: v('Payment Schedule') || null, bill_generate_at: v('Bill Generate At') || null,
      contract_type: v('Contract Type') || null,
      contract_start: toDate(r['Contract Start Date']), contract_end: toDate(r['Contract End Date']),
      contract_years: toNum(r['Contract Period (Years)']), contract_months: toInt(r['Contract Period (Months)']),
      pm_visits_total: toInt(r['P M Visits (TOTAL)']), status: v('Status') || null,
      rate: toNum(r['Rate']), item_tax_amount: toNum(r['Item Tax Amount']), total_after_tax: toNum(r['Total After Tax']),
      present_item_status: v('Present Item Status'),
      last_contract_number: v('Last Contract Number'), last_contract_end: toDate(r['Last Contract End Date']),
      sa_number: v('SA Number'), sa_end_date: toDate(r['SA End Date']), added_by: v('Added By'),
      extra: leftovers(r, CONTRACT_ITEM_COLS),
    };
  }), 'uid');
}

// The exports carry a few genuine duplicates (three SA numbers, and machines
// listed twice on one deal). A repeat would be rejected by the unique key, so
// keep the first — the import reports how many it set aside.
function dedupe(rows: Record<string, unknown>[], key: string): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const k = String(r[key] ?? '').trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// ===========================================================================
// WARRANTY / CONTRACT COVERAGE
//
// A machine's cover is not a separate register in this system — it lives on
// the machine itself, in `products` (warranty_number/start/end and
// contract_number/start/end/type), which is what the call form freezes into a
// call and what Product Master shows. The Warranty and Contract registers are
// therefore VIEWS OVER THE MACHINES: every serial with (or without) cover of
// one kind, with the cover's state derived from its end date.
//
// The old registers were CRUD screens over the local demo collections, so they
// rendered blank against live data (`clearDemoData()` empties those on load).
// ===========================================================================

export type CoverageKind = 'warranty' | 'contract';

/** A cover expiring within this many days counts as "Expiring soon". */
export const EXPIRING_DAYS = 60;

export type CoverageStatus = 'Active' | 'Expiring soon' | 'Expired' | 'Not covered';

/** Filter value used by the toolbar and the server query. '' = every covered row. */
export type CoverageStatusFilter = '' | 'active' | 'expiring' | 'expired' | 'none' | 'all';

export interface CoverageFilter {
  q?: string;
  party?: string;
  product?: string;
  serial?: string;
  number?: string;
  type?: string; // contract type (contract register only)
  status?: CoverageStatusFilter;
}

export interface CoverageRow extends Record<string, unknown> {
  id: string;
  party: string;
  product: string;
  serial: string;
  itemStatus: string;
  city: string;
  state: string;
  engineer: string;
  number: string;
  start: string;
  end: string;
  contractType: string;
  daysLeft: number | null; // null when there is no end date
  status: CoverageStatus;
}

const s = (v: unknown) => (v == null ? '' : String(v));

/** yyyy-MM-dd for a Date, in local time (the dates in `products` are plain dates). */
export const isoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Today, and today + EXPIRING_DAYS — the two cut-offs every status uses. */
export function coverageCutoffs(today = new Date()): { today: string; soon: string } {
  const soon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + EXPIRING_DAYS);
  return { today: isoDay(today), soon: isoDay(soon) };
}

/** Whole days from today to `end` (negative once it has passed). */
export function daysLeft(end: string, today = new Date()): number | null {
  if (!end) return null;
  const d = new Date(`${end.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - base.getTime()) / 86400000);
}

export function coverageStatus(end: string, today = new Date()): CoverageStatus {
  const n = daysLeft(end, today);
  if (n === null) return 'Not covered';
  if (n < 0) return 'Expired';
  return n <= EXPIRING_DAYS ? 'Expiring soon' : 'Active';
}

/**
 * Normalise one machine row into a coverage row for `kind`. Accepts either the
 * snake_case `products` row (Supabase) or the sheet-header shape
 * `productRowToSheet` produces (the Apps Script fallback).
 */
export function toCoverageRow(kind: CoverageKind, raw: Record<string, unknown>, i: number, today = new Date()): CoverageRow {
  const extra = (raw.extra as Record<string, unknown>) ?? {};
  const pick = (snake: string, header: string, extraKey?: string) =>
    s(raw[snake] ?? raw[header] ?? (extraKey ? extra[extraKey] : '') ?? '');

  const end = pick(`${kind}_end`, kind === 'warranty' ? 'Warranty End Date' : 'Contract End Date').slice(0, 10);
  const start = pick(`${kind}_start`, kind === 'warranty' ? 'Warranty Start Date' : 'Contract Start Date').slice(0, 10);
  const number = pick(`${kind}_number`, kind === 'warranty' ? 'Warranty Number' : 'Contract Number');
  const serial = pick('serial_number', 'Item Serial Number');

  return {
    id: s(raw.id ?? '') || `${serial || 'row'}-${i}`,
    party: pick('party_name', 'Party Name'),
    product: pick('item_name', 'Item Name'),
    serial,
    itemStatus: pick('item_status', 'Item Status'),
    city: pick('city', 'City', 'City'),
    state: pick('state', 'State', 'State'),
    engineer: pick('service_engineer', 'Service Engineer', 'Service Engineer'),
    number,
    start,
    end,
    contractType: pick('contract_type', 'Contract Type'),
    daysLeft: daysLeft(end, today),
    status: coverageStatus(end, today),
  };
}

/** The sheet-header shape the call-form prefill (`productToCallPrefill`) reads. */
export function coverageRowToProduct(r: CoverageRow, kind: CoverageKind): Record<string, unknown> {
  const wty = kind === 'warranty';
  return {
    'Party Name': r.party, 'City': r.city, 'State': r.state,
    'Item Name': r.product, 'Item Serial Number': r.serial, 'Item Status': r.itemStatus,
    'Warranty Number': wty ? r.number : '', 'Warranty Start Date': wty ? r.start : '', 'Warranty End Date': wty ? r.end : '',
    'Contract Number': wty ? '' : r.number, 'Contract Start Date': wty ? '' : r.start, 'Contract End Date': wty ? '' : r.end,
    'Contract Type': r.contractType, 'Service Engineer': r.engineer,
  };
}

/** Client-side filter — the Apps Script fallback has no server-side search. */
export function filterCoverage(rows: CoverageRow[], f: CoverageFilter): CoverageRow[] {
  const has = (hay: string, needle?: string) => !needle || hay.toLowerCase().includes(needle.toLowerCase().trim());
  const wanted: Record<string, CoverageStatus> = {
    active: 'Active', expiring: 'Expiring soon', expired: 'Expired', none: 'Not covered',
  };
  return rows.filter((r) => {
    if (f.status && f.status !== 'all' && r.status !== wanted[f.status]) return false;
    if (!f.status && r.status === 'Not covered') return false; // default: covered machines only
    if (!has(`${r.party} ${r.product} ${r.serial} ${r.number}`, f.q)) return false;
    return has(r.party, f.party) && has(r.product, f.product) && has(r.serial, f.serial)
      && has(r.number, f.number) && has(r.contractType, f.type);
  });
}

export const coverageCounts = (rows: CoverageRow[]): Record<CoverageStatus, number> => {
  const c: Record<CoverageStatus, number> = { 'Active': 0, 'Expiring soon': 0, 'Expired': 0, 'Not covered': 0 };
  rows.forEach((r) => { c[r.status] += 1; });
  return c;
};

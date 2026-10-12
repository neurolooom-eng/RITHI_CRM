import { coverCode } from './fieldcall';
import { toIsoDate as toDate, todayLocal } from './dates';
import { complaintAppliesTo, decodeComplaintEntry } from './complaints';

// ===========================================================================
// PM bulk upload — shape a monthly Preventive-Maintenance spreadsheet into
// insert-ready PM call rows. Every row is forced to call_type 'P M VISIT'
// (so it lands in pm_calls after the split); the server assigns the UCN and
// Call Number. Headers are matched case-insensitively against common names;
// anything unrecognised is kept in `extra` rather than dropped.
// ===========================================================================

const PM_TYPE = 'P M VISIT';
const norm = (s: string) => s.trim().toLowerCase();

// call column  ->  accepted header names (lowercased)
const ALIASES: Record<string, string[]> = {
  call_number:        ['call number', 'call no', 'call no.', 'callno', 'cl number', 'cl no', 'cl no.', 'call reg number', 'call reg no'],
  party_name:         ['party name', 'party', 'customer', 'customer name', 'hospital', 'account name', 'account'],
  city:               ['city', 'town'],
  state:              ['state'],
  product_name:       ['product', 'product name', 'equipment', 'model', 'machine'],
  // 'product serial number' is the PM-to-DO sheet's own heading (2026-10-05:
  // "the Serial nos are not imported.. it is blank").
  serial:             ['serial', 'serial no', 'serial number', 'sl no', 'sr no', 'sr. no', 'product serial number', 'product serial no', 'machine serial number'],
  item_status:        ['item status', 'cover', 'warranty status', 'cmc/wgp', 'contract status'],
  allocated_to:       ['engineer', 'allocated to', 'service engineer', 'assigned to', 'allocated engineer', 'fse', 'engineer name', 'call allocated to'],
  allocated_to_email: ['engineer email', 'engineer mail', 'allocated email', 'fse email'],
  reg_date:           ['reg date', 'registration date', 'pm date', 'pm due date', 'plan date', 'planned date', 'due date', 'scheduled date', 'visit date', 'date'],
  standard_complaint: ['standard complaint', 'complaint', 'fault', 'reason'],
  complaint_reported: ['reported problem', 'complaint reported', 'remarks', 'reported complaint', 'description', 'notes', 'comments'],
  customer_name:      ['contact name', 'customer contact', 'contact person', 'contact'],
  customer_number:    ['contact number', 'phone', 'mobile', 'customer number', 'contact no'],
  email_address:      ['email', 'email address', 'customer email', 'mail id', 'e-mail id'],
  contract_number:    ['contract number', 'contract no', 'amc number', 'cmc number', 'amc no'],
  contract_type:      ['contract type'],
  warranty_number:    ['warranty number', 'warranty no'],
};
const DATE_COLS = new Set(['reg_date', 'complaint_date']);
// The sheet's own complaint / breakdown dates: replaced by the registration
// date on every PM call, so they are not kept in `extra` either.
const PM_DATED_HERE = new Set(['complaint date', 'breakdown date', 'break down date']);

const todayISO = todayLocal;
const pad = (n: number) => String(n).padStart(2, '0');

// A Date -> the 'YYYY-MM-DDTHH:mm:ss' a <input type="datetime-local"> wants, in
// LOCAL time (the same clock the operator reads).
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// The default first-registration time and the gap between calls for a due month.
// The call NUMBERING never changes; the registration DATE-AND-TIME is what
// orders a batch. Two cases, matching the operator's rule:
//   • the month already has calls  -> continue 10s after the latest one;
//   • a fresh month (none yet)      -> start at 00:30 on the 1st, 5s apart.
// Both are pre-filled but editable before import.
export function pmStartDefaults(month: string, latestRegAt: string | null): { startLocal: string; stepSec: number } {
  if (latestRegAt) {
    const d = new Date(latestRegAt);
    d.setSeconds(d.getSeconds() + 10);
    return { startLocal: toLocalInput(d), stepSec: 10 };
  }
  return { startLocal: `${month}-01T00:30:00`, stepSec: 5 };
}

// Turn raw CSV rows into PM call records for a DUE MONTH (YYYY-MM). Every kept
// row is dated the 1st of that month (reg_date), stamped with today as
// `added_on`, forced to the PM type, and given a registration date-and-time
// (`reg_at`) starting at `startLocal` and stepping `stepSec` between calls — so
// the batch keeps a stable order. A Call Number from the sheet is kept as-is
// (the database only assigns one when the column is blank); the UCN is always
// assigned by the database. Skips rows with no identifying data (the step is
// applied to KEPT rows, so blank rows leave no gaps).
export function shapePmRows(
  raw: Record<string, string>[],
  month: string,
  startLocal: string,
  stepSec: number,
): Record<string, unknown>[] {
  const regDate = `${month}-01`;   // 1st of the due month
  const added = todayISO();
  const startMs = new Date(startLocal).getTime();           // startLocal has no zone -> local
  const stepMs = Math.max(0, Math.round((stepSec || 0) * 1000));
  const shaped = raw.map((r) => {
    const byNorm: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) byNorm[norm(k)] = v;

    const out: Record<string, unknown> = { call_type: PM_TYPE, status: 'Registered' };
    const used = new Set<string>();
    for (const [col, names] of Object.entries(ALIASES)) {
      if (col === 'reg_date') continue;   // reg_date comes from the chosen month, not the sheet
      for (const n of names) {
        const v = byNorm[n];
        if (v != null && String(v).trim() !== '') {
          const val = String(v).trim();
          // Cover reads through the SAME rule as every other importer. A PM
          // sheet saying "warranty status: WARRANTY" means WGP, and a second
          // spelling splits every count on that dimension without saying so.
          out[col] = DATE_COLS.has(col) ? toDate(val)
                   : col === 'item_status' ? coverCode(val)
                   : val;
          used.add(n);
          break;
        }
      }
    }
    out.reg_date = regDate;
    // COMPLAINT DATE AND BREAKDOWN DATE ARE THE REGISTRATION DATE on a PM call
    // (the user, 2026-10-05: "Map, Complaint Date, Break Down Date to the Same
    // Date as Call Registration ... this is only for PM"). A PM visit is
    // scheduled, not reported, so the sheet's own values are not used.
    out.complaint_date = regDate;
    out.breakdown_date = regDate;
    out.added_on = added;
    // Keep any column we didn't map (incl. a per-row PM due date), so nothing is lost.
    const extra: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      if (PM_DATED_HERE.has(norm(k))) continue;   // superseded by the registration date above
      if (!used.has(norm(k)) && String(v ?? '').trim() !== '') extra[k.trim()] = String(v).trim();
    }
    if (Object.keys(extra).length) out.extra = extra;
    return out;
  }).filter((o) => o.party_name || o.serial || o.product_name);

  // Sequence reg_at across the kept rows only.
  if (!Number.isNaN(startMs)) {
    shaped.forEach((o, i) => { o.reg_at = new Date(startMs + i * stepMs).toISOString(); });
  }
  return shaped;
}

// A starter template so the uploader knows the columns.
export const PM_TEMPLATE_HEADERS = [
  'Call Number', 'Party Name', 'City', 'State', 'Product', 'Serial No', 'Item Status',
  'Engineer', 'Engineer Email', 'PM Due Date', 'Standard Complaint',
  'Reported Problem', 'Contact Name', 'Contact Number',
];
export function pmTemplateCsv(): string {
  const sample = [
    'CL2600501', 'Apollo Hospital', 'Chennai', 'SOUTH3', 'Ventilator XT', 'VN-4471', 'CMC',
    'SIVARANI', 'sivarani@example.com', '2026-09-15', 'Preventive Maintenance',
    'Monthly PM visit', 'Nurse Station', '9840000000',
  ];
  return `${PM_TEMPLATE_HEADERS.join(',')}\n${sample.map((c) => `"${c}"`).join(',')}\n`;
}

// ===========================================================================
// WHAT A PM UPLOAD MAY CREATE (D-038; FRS-142.4, .5, .11). THE UPLOAD PATH
// ONLY -- shapePmRows above is shared with the PM Due generator, which builds
// its rows from the registers (Standard Complaint "SCHEDULED PM VISIT", an
// engineer from the cover) and has its own "already generated" rule, so none
// of this is applied there.
//
// Each shaped row is KEPT or HELD BACK with the reason, and the reason names
// the row, so the operator can correct the file rather than guess:
//
//   no serial        FRS-142.4 -- a PM call that identifies no device.
//   already a call   FRS-142.11, as the user decided it (2026-10-12): the
//                    machine (product + serial, trimmed, case ignored) already
//                    has a PM call in the due month -- from an earlier load or
//                    from PM Due -- so the row is SKIPPED and that call's UCN
//                    named. No second call; the existing one is NOT changed.
//   twice in file    the same machine on two rows: the FIRST is kept, the rest
//                    held back naming it. Decided before the value checks, so
//                    which row stands never depends on which one is valid.
//   complaint        FRS-142.5 -- not on the Standard Complaint master FOR THIS
//                    PRODUCT, by the rule every call form uses
//                    (complaints.ts: mapped to the product, or to all
//                    products). Matched ignoring case and surrounding spaces,
//                    and the MASTER's spelling is written, so the call counts
//                    with every other call carrying that complaint.
//   engineer         FRS-142.5 -- not an ACTIVE name on the User Master
//                    (validity true). Matched the same way, master spelling
//                    written.
//
// A BLANK complaint or engineer is NOT held back: FRS-142.5 holds back a row
// "carrying a value on neither", and a blank carries no value. A blank engineer
// is an unallocated call, which the register already shows as such.
//
// Pure, so check:uploads runs it as behaviour (the paging.ts reason).
// ===========================================================================
export type PmHoldKind = 'no-serial' | 'exists' | 'repeated' | 'complaint' | 'engineer';
export interface PmHeldRow {
  /** The line in the file, the headings being line 1 (blank lines are not counted). */
  row: number;
  product: string; serial: string; party: string;
  kinds: PmHoldKind[];
  reason: string;
  /** The UCN of the call already there, for 'exists'. */
  ucn?: string;
}
export interface PmUploadContext {
  /** The ACTIVE Standard Complaints, each as complaints.ts encodes it
   *  (value + the products it is mapped to) -- listMaster('complaintProducts'). */
  complaints: string[];
  /** The ACTIVE User Master names (sbActiveUserNames). */
  activeEngineers: string[];
  /** The PM calls already in the due month. */
  existing: { ucn: string; product_name: string; serial: string }[];
}

const keyText = (v: unknown) => String(v ?? '').trim().toLowerCase();
/** A machine for FRS-142.11: product + serial, trimmed, case ignored. */
export const pmMachineKey = (product: unknown, serial: unknown): string => `${keyText(product)}|${keyText(serial)}`;

export function checkPmUploadRows(
  rows: { row: number; rec: Record<string, unknown> }[], ctx: PmUploadContext,
): { kept: Record<string, unknown>[]; held: PmHeldRow[] } {
  const existing = new Map<string, string>();
  for (const c of ctx.existing) {
    const k = pmMachineKey(c.product_name, c.serial);
    if (!existing.has(k)) existing.set(k, String(c.ucn ?? ''));
  }
  const engineers = new Map<string, string>();
  for (const n of ctx.activeEngineers) {
    const k = keyText(n);
    if (k && !engineers.has(k)) engineers.set(k, String(n).trim());
  }
  const complaints = ctx.complaints.map(decodeComplaintEntry).filter((c) => c.value.trim());
  const firstRow = new Map<string, number>();
  const kept: Record<string, unknown>[] = [];
  const held: PmHeldRow[] = [];

  for (const { row, rec } of rows) {
    const product = String(rec.product_name ?? '').trim();
    const serial = String(rec.serial ?? '').trim();
    const base = { row, product, serial, party: String(rec.party_name ?? '').trim() };
    if (!serial) {
      held.push({ ...base, kinds: ['no-serial'], reason: 'no serial number' });
      continue;
    }
    const key = pmMachineKey(product, serial);
    const ucn = existing.get(key);
    if (ucn !== undefined) {
      held.push({ ...base, kinds: ['exists'], ucn, reason: `already a PM call this month: ${ucn || '(no UCN)'}` });
      continue;
    }
    const first = firstRow.get(key);
    if (first !== undefined) {
      held.push({ ...base, kinds: ['repeated'], reason: `the same machine is on row ${first} of this file` });
      continue;
    }
    firstRow.set(key, row);

    const out = { ...rec };
    const kinds: PmHoldKind[] = [];
    const why: string[] = [];
    const complaint = String(rec.standard_complaint ?? '').trim();
    if (complaint) {
      const hit = complaints.find((c) => keyText(c.value) === keyText(complaint)
        && complaintAppliesTo({ products: c.products }, product));
      if (hit) out.standard_complaint = hit.value;
      else {
        kinds.push('complaint');
        why.push(`Standard Complaint “${complaint}” is not on the complaint master for ${product || 'this product'}`);
      }
    }
    const engineer = String(rec.allocated_to ?? '').trim();
    if (engineer) {
      const name = engineers.get(keyText(engineer));
      if (name) out.allocated_to = name;
      else {
        kinds.push('engineer');
        why.push(`engineer “${engineer}” is not an active name on the User Master`);
      }
    }
    if (kinds.length) { held.push({ ...base, kinds, reason: why.join('; ') }); continue; }
    kept.push(out);
  }
  return { kept, held };
}

/** The upload's whole preparation: shape each line (shapePmRows, unchanged),
 *  check them, and step the registration times across the KEPT rows only --
 *  the rule shapePmRows applies to blank rows, so a held-back row leaves no
 *  gap in the batch either. With nothing held back the result is exactly
 *  shapePmRows' own. */
export function preparePmUpload(
  raw: Record<string, string>[], month: string, startLocal: string, stepSec: number, ctx: PmUploadContext,
): { kept: Record<string, unknown>[]; held: PmHeldRow[]; blank: number } {
  const shaped: { row: number; rec: Record<string, unknown> }[] = [];
  raw.forEach((r, i) => {
    const [rec] = shapePmRows([r], month, startLocal, 0);
    if (rec) shaped.push({ row: i + 2, rec });
  });
  const { kept, held } = checkPmUploadRows(shaped, ctx);
  const startMs = new Date(startLocal).getTime();
  const stepMs = Math.max(0, Math.round((stepSec || 0) * 1000));
  kept.forEach((o, i) => {
    if (Number.isNaN(startMs)) delete o.reg_at;
    else o.reg_at = new Date(startMs + i * stepMs).toISOString();
  });
  return { kept, held, blank: raw.length - shaped.length };
}

/** One line per reason, for the preview and the confirmation. */
export function pmHeldSummary(held: PmHeldRow[]): string {
  if (!held.length) return '';
  const n = (k: PmHoldKind) => held.filter((h) => h.kinds.includes(k)).length;
  const parts = [
    [n('exists'), 'already have a PM call this month (skipped, not changed)'],
    [n('repeated'), 'repeat a machine already on an earlier row'],
    [n('no-serial'), 'have no serial number'],
    [n('complaint'), 'carry a Standard Complaint not on the product’s complaint master'],
    [n('engineer'), 'name an engineer who is not active on the User Master'],
  ].filter(([c]) => (c as number) > 0).map(([c, t]) => `${c} ${t}`);
  return `${held.length} row${held.length === 1 ? '' : 's'} held back — ${parts.join('; ')}.`;
}

// ===========================================================================
// PM DUE -> PM CALLS (0401, the user, 2026-10-08). The machines the Warranty
// and Contract Registers say are due become calls through shapePmRows, the
// SAME shaping the monthly upload uses, so a generated call and an uploaded
// one cannot differ: dated the 1st of the due month, complaint and breakdown
// dates the same, Added On the day it was generated, registration times
// stepped from the month's latest.
//
// The two texts are what this year's PM calls carry (measured 2026-10-08:
// 8,720 of 8,720 read "SCHEDULED PM VISIT", and the Reported Problem reads
// "SCHEDULED PM VISIT k / N"), not wording chosen here.
// ===========================================================================
export const PM_STANDARD_COMPLAINT = 'SCHEDULED PM VISIT';

export interface PmDueMachine {
  source: 'Warranty' | 'Contract'; ref_no: string; product_name: string; serial: string;
  party_name: string | null; city: string | null; state: string | null;
  engineer: string | null; cover_type: string; cover_start: string; cover_end: string;
  pm_visits: number; visit_no: number; due_date: string;
}

export function shapePmDueRows(
  due: PmDueMachine[], month: string, startLocal: string, stepSec: number,
): Record<string, unknown>[] {
  const raw = due.map((d) => ({
    'Party Name': d.party_name ?? '', 'City': d.city ?? '', 'State': d.state ?? '',
    'Product': d.product_name, 'Serial No': d.serial,
    'Item Status': d.cover_type ?? '',
    'Engineer': d.engineer ?? '',
    'Standard Complaint': PM_STANDARD_COMPLAINT,
    'Reported Problem': `${PM_STANDARD_COMPLAINT} ${d.visit_no} / ${d.pm_visits}`,
    // A sale's SA number is the machine's Warranty No. (sync_product_machine),
    // a contract's MC number its Contract No.
    ...(d.source === 'Contract' ? { 'Contract Number': d.ref_no } : { 'Warranty Number': d.ref_no }),
    // Not call columns: kept in `extra`, so the call says where it came from.
    'PM Source': `${d.source} Register`,
    'PM Due Date': d.due_date,
  }));
  const shaped = shapePmRows(raw, month, startLocal, stepSec);
  // The cover's own dates, on the call's own columns. shapePmRows keeps the
  // rows in order and drops only rows with no party, product or serial --
  // which a due machine always has -- so the two lists line up.
  return shaped.map((o, i) => {
    const d = due[i];
    return d.source === 'Warranty'
      ? { ...o, warranty_start: d.cover_start, warranty_end: d.cover_end }
      : { ...o, contract_start: d.cover_start, contract_end: d.cover_end };
  });
}

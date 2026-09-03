// ---------------------------------------------------------------------------
// INDIVIDUAL REGISTER UPLOADS.
//
// Data Import guesses which table a file belongs to from its headers. That is
// fine for a handful of files and wrong for a cutover: a Call Type sheet and a
// Pending Reason sheet are BOTH `masters`, and no header tells them apart — the
// list name is not in the file, it is in the operator's head. Guessing there
// puts every value in one list.
//
// So: you pick the register, and the register says what its file means. The
// list name (or the call type, or the request type) is STAMPED from the choice
// rather than inferred, which is the whole point.
//
// One generic shaper drives every register. Thirty bespoke shapers would drift
// apart; a table of column definitions cannot.
// ---------------------------------------------------------------------------

import { shapeCoverRows, type CoverTable } from './coverImport';
import { toIsoDate, toIsoTimestamp, parseAnyDate } from './dates';
import { loose, findHeaderFor } from './headers';

export type ColType = 'text' | 'date' | 'ts' | 'num' | 'int' | 'bool' | 'json';

export interface Col {
  /** The database column. */
  to: string;
  /** Header names accepted for it, matched case- and space-insensitively. */
  from: string[];
  type?: ColType;
  /** A row without this is not loaded — it would be a fragment, not a record. */
  required?: boolean;
  /** Take the value only when this passes. A real column is not always used for
   *  one thing: the Call Request export's `UCN number` holds a UCN on 4,016
   *  rows and the words "Request cancel" on the other 52. A value that fails is
   *  NOT written to this column — it falls through to `extraInto`, where it can
   *  still be seen, rather than being filed as something it is not. */
  when?: (v: string) => boolean;
  /** Computed from the row AFTER the file's own columns are mapped, and only
   *  when the file supplied nothing. Lets a register whose export carries no row
   *  id of its own still be re-runnable: the derived key is the same on every
   *  run, where a generated one would load the file again as new rows. */
  /** `i` is the row's position in the file (0-based), for a register whose
   *  source has no id of its own: the same file gives the same value every
   *  run, so a re-load corrects rather than duplicates. */
  derive?: (out: Record<string, unknown>, i: number) => unknown;
  /** Run `derive` even when the file DID supply a value — for a column the
   *  register has to combine rather than choose (WinMax holds good stock and
   *  defective stock in two columns, and an engineer holds both). */
  always?: boolean;
}

export interface UploadDef {
  key: string;
  label: string;
  group: string;
  table: string;
  cols: Col[];
  /** Constants written on every row — the list name, the call type, and so on. */
  stamp?: Record<string, unknown>;
  /** Upsert key, where the table has one. Without it a re-run DUPLICATES. */
  conflict?: string;
  /** The conflict target is COMPUTED by the database (generated columns) from
   *  fields this register does fill — so the key is not a column of its own.
   *  `conflictFrom` names the fields it is derived from, which is what the
   *  coherence check verifies instead. */
  conflictFrom?: string[];
  /** jsonb column that catches every header not named above. */
  extraInto?: string;
  /** A last look at the whole shaped row: return why it cannot be loaded, or ''.
   *  For rules that span COLUMNS, which a per-column check cannot see — a stock
   *  transfer from an engineer to themselves is refused by the database, and one
   *  such row failed the entire batch. Held back and named here instead. */
  reject?: (row: Record<string, unknown>) => string;
  /** What has to be loaded first, because rows here point at it. */
  requires?: string;
  /** A step that runs BEFORE the rows are written, when they point at rows the
   *  database has to have first. `spare-line-parents` resolves each line's OR
   *  number to the request that holds it and creates the ones that are missing
   *  — as its own statement, so the line insert can SEE them.
   *
   *  Doing it here rather than in a trigger is deliberate. A trigger's insert is
   *  invisible to the very command inserting the line, so the row-level check
   *  cannot see the parent it is being asked about and refuses the row — which
   *  is what "Your role does not have permission for this action." on row 1
   *  was. Prepared here, the upload no longer depends on that at all. */
  prepare?: 'spare-line-parents' | 'stock-transfer-parents';
  /** How rows that collide on the DATABASE's key are folded together, where the
   *  key is COMPUTED and the raw columns do not show the collision. Hand stock
   *  is keyed on the part CODE, so two WinMax lines for ACC-081 with different
   *  descriptions are one balance — and keeping the last of them would drop the
   *  other's 200 pieces on the floor. `sum` names the fields to add up. */
  fold?: { key: (r: Record<string, unknown>) => string; sum?: string[] };
  /** A register whose file needs more than a column map. The four AppSheet
   *  sale / contract exports are the case: `coverImport.ts` was written for
   *  exactly those files and does things a column map cannot — it DERIVES the
   *  sale-item uid from SA|Product|Serial (the export carries no uid at all),
   *  stubs a header row for an item whose entry has not been loaded yet, and
   *  sorts the header values a child repeats from the ones it overrides.
   *  Re-declaring that as columns would have been a worse copy of it. */
  shape?: (raw: Record<string, unknown>[]) => Record<string, unknown>[];
  note?: string;
}

// ---- coercion -------------------------------------------------------------

// Header matching lives in ./headers — shared with every importer so none of
// them can disagree about which column is which.
const norm = loose;

// Dates live in ./dates — one parser for every import. Kept under the names
// the registers and the checks already use.
export const toDate = (v: unknown): string | null => toIsoDate(v);
export const toTs = (v: unknown): string | null => toIsoTimestamp(v, 'local');

const TRUE = new Set(['y', 'yes', 'true', '1', 't', 'active', 'enabled', 'live']);
const FALSE = new Set(['n', 'no', 'false', '0', 'f', 'inactive', 'disabled', 'retired']);

export function coerce(v: unknown, type: ColType = 'text'): unknown {
  const s = String(v ?? '').trim();
  switch (type) {
    case 'date': return toDate(s);
    case 'ts': return toTs(s);
    case 'num': { if (!s) return null; const n = Number(s.replace(/,/g, '')); return Number.isFinite(n) ? n : null; }
    case 'int': { if (!s) return null; const n = parseInt(s.replace(/,/g, ''), 10); return Number.isFinite(n) ? n : null; }
    case 'bool': { const l = s.toLowerCase(); return TRUE.has(l) ? true : FALSE.has(l) ? false : null; }
    case 'json': { if (!s) return {}; try { return JSON.parse(s) as unknown; } catch { return { value: s }; } }
    default: return s;
  }
}

// ---- shaping --------------------------------------------------------------

export interface ShapeResult {
  rows: Record<string, unknown>[];
  skipped: { row: number; why: string }[];
  /** Headers in the file that no column claimed — shown so a mis-picked
   *  register is obvious BEFORE anything is written. */
  unmatched: string[];
  /** Headers the register deliberately overrides (Call Type on a call
   *  register). Not a problem, and not listed as one. */
  stamped?: string[];
}

export function shapeUpload(def: UploadDef, raw: Record<string, unknown>[]): ShapeResult {
  // A register with its own shaper owns the whole job — it knows which columns
  // it consumed, so there is nothing useful to report as "unmatched".
  if (def.shape) {
    const out = def.shape(raw);
    return {
      rows: out,
      skipped: raw.length > out.length
        ? [{ row: 0, why: `${raw.length - out.length} row(s) without the key this register needs, or duplicated within the file` }]
        : [],
      unmatched: [],
    };
  }
  const rows: Record<string, unknown>[] = [];
  const skipped: { row: number; why: string }[] = [];
  const claimed = new Set<string>();
  const headers = Object.keys(raw[0] ?? {});

  // header -> column, resolved once for the whole file rather than per row.
  //
  // ONE header per column, chosen by ALIAS PRIORITY then by exactness. A real
  // export often has several of a column's aliases at once — the AppSheet Party
  // Master carries both `Type` and `Profile`, and both `Address` and `Billing
  // Address`. Binding all of them to the same column let whichever came last in
  // the row overwrite the others, so `Type: CUSTOMER` silently became
  // `Profile: GOVERNMENT`. The losers fall through to `extraInto`, kept rather
  // than fighting over a column.
  //
  // A header may feed MORE than one column where both name it (Timestamp is
  // both the registration date and its time), so this maps header -> columns.
  const bind = new Map<string, Col[]>();
  def.cols.forEach((c) => {
    const h = findHeaderFor(headers, c.from);
    if (h) { bind.set(h, [...(bind.get(h) ?? []), c]); claimed.add(h); }
  });

  raw.forEach((r, i) => {
    const out: Record<string, unknown> = { ...(def.stamp ?? {}) };
    const extra: Record<string, unknown> = {};

    Object.entries(r).forEach(([h, v]) => {
      const cols = bind.get(h);
      if (cols) {
        let usedBy = 0;
        cols.forEach((col) => {
          const raw = String(v ?? '').trim();
          if (col.when && raw && !col.when(raw)) return;   // not this column's kind of value
          usedBy += 1;
          const val = coerce(v, col.type);
          // Never let a blank cell overwrite a stamped constant.
          if (val !== null && val !== '') out[col.to] = val;
        });
        // Claimed by a column that refused it — keep it rather than lose it.
        if (!usedBy && def.extraInto) {
          const t = String(v ?? '').trim();
          if (t) extra[h.trim()] = t;
        }
      } else if (def.extraInto) {
        const s = String(v ?? '').trim();
        if (s) extra[h.trim()] = s;
      }
    });

    if (def.extraInto) out[def.extraInto] = extra;

    // Fill in what the file did not carry, from what it did.
    def.cols.forEach((c) => {
      if (c.derive && (c.always || out[c.to] === undefined || out[c.to] === '' || out[c.to] === null)) {
        const v = c.derive(out, i);
        if (v !== undefined && v !== null && v !== '') out[c.to] = v;
      }
    });

    const missing = def.cols.filter((c) => c.required && (out[c.to] === undefined || out[c.to] === '' || out[c.to] === null));
    if (missing.length) {
      skipped.push({ row: i + 2, why: `no ${missing.map((c) => c.from[0]).join(', ')}` });   // +2: header row, 1-based
      return;
    }
    const bad = def.reject?.(out);
    if (bad) { skipped.push({ row: i + 2, why: bad }); return; }
    rows.push(out);
  });

  // A re-run must correct rather than duplicate, so the last of a repeated key
  // wins inside the file too — otherwise the upsert fights itself in one batch
  // ("cannot affect row a second time").
  //
  // Deduped on what the key is DERIVED FROM, not on the key column: several
  // registers never send the key at all. call_requests' `unique_key` is rebuilt
  // by the database from reqid + product + serial, and parties' `name_key` from
  // the party name — deduping on a column the row does not carry silently
  // dedupes nothing.
  const dedupeOn = def.conflictFrom ?? (def.conflict ? def.conflict.split(',') : []);
  const deduped = def.fold ? fold(rows, def.fold) : dedupeOn.length ? dedupe(rows, dedupeOn) : rows;

  // A header naming something the register STAMPS (Call Type on a call
  // register, the list name on a master) is not unrecognised — it is
  // deliberately ignored, because the register is the authority on it. Listing
  // it as unknown made a correct load look wrong.
  const stamped = new Set(Object.keys(def.stamp ?? {}).map(norm));
  return {
    rows: deduped,
    skipped,
    unmatched: headers.filter((h) => !claimed.has(h) && !stamped.has(norm(h))),
    stamped: headers.filter((h) => !claimed.has(h) && stamped.has(norm(h))),
  };
}

// Rows that land on the same database key, added up rather than overwritten.
function fold(
  rows: Record<string, unknown>[],
  by: { key: (r: Record<string, unknown>) => string; sum?: string[] },
): Record<string, unknown>[] {
  const out = new Map<string, Record<string, unknown>>();
  rows.forEach((r) => {
    const k = by.key(r);
    const had = out.get(k);
    if (!had) { out.set(k, r); return; }
    (by.sum ?? []).forEach((f) => { had[f] = (Number(had[f]) || 0) + (Number(r[f]) || 0); });
  });
  return [...out.values()];
}

function dedupe(rows: Record<string, unknown>[], keys: string[]): Record<string, unknown>[] {
  const by = new Map<string, Record<string, unknown>>();
  const out: Record<string, unknown>[] = [];
  rows.forEach((r) => {
    const k = keys.map((x) => String(r[x] ?? '')).join('\u0000');
    // A row missing every part of the key cannot collide with anything, so it
    // is kept rather than collapsed onto the other keyless rows.
    if (!keys.some((x) => String(r[x] ?? '').trim())) { out.push(r); return; }
    by.set(k, r);
  });
  return [...out, ...by.values()];
}

// ---- the registers --------------------------------------------------------

const TEXT = (to: string, ...from: string[]): Col => ({ to, from: [to, ...from] });
const DATE = (to: string, ...from: string[]): Col => ({ to, from: [to, ...from], type: 'date' });
const TS = (to: string, ...from: string[]): Col => ({ to, from: [to, ...from], type: 'ts' });
const NUM = (to: string, ...from: string[]): Col => ({ to, from: [to, ...from], type: 'num' });

const CALL_COLS: Col[] = [
  { to: 'ucn', from: ['ucn', 'uc number', 'uc no', 'unique call number'], required: true },
  TEXT('call_number', 'call number', 'call no'),
  // "Registeration" is how the export spells it — matched as written rather
  // than corrected, because the file is what it is.
  DATE('reg_date', 'call registeration date', 'call registration date', 'registration date', 'reg date', 'date of registration', 'timestamp'),
  DATE('complaint_date', 'complaint date'),
  DATE('breakdown_date', 'breakdown date'),
  TEXT('party_name', 'party name', 'customer', 'party'),
  TEXT('city'), TEXT('state'),
  TEXT('product_name', 'product name', 'product', 'model'),
  TEXT('serial', 'product serial number', 'item serial number', 'serial no', 'serial number', 'sr no'),
  TEXT('item_status', 'item status'),
  // The "(F)" columns are the FORMULA-maintained ones and are what the register
  // currently holds, so they are listed FIRST and win where a file has both. On
  // the PM export the two agree for complaint and call type, but `Call
  // Allocated To (F)` differs from the plain column on 1,556 of 7,029 rows —
  // the plain one is stale, and preferring it would have allocated those calls
  // to an engineer who no longer has them.
  //
  // Written out rather than built with TEXT(), because TEXT() prepends the
  // COLUMN NAME as the first alias — `standard_complaint` normalises to
  // "standard complaint" and so matched the plain header before the (F) one was
  // ever tried. The helper is a convenience, not a place to hide precedence.
  { to: 'standard_complaint', from: ['standard complaint (f)', 'standard_complaint', 'standard complaint'] },
  { to: 'complaint_reported', from: ['complaint reported (f)', 'complaint_reported', 'complaint reported', 'reported problem'] },
  { to: 'allocated_to', from: ['call allocated to (f)', 'allocated_to', 'call allocated to', 'allocated to', 'engineer'] },
  TEXT('allocated_to_email', 'allocated to email', 'engineer email'),
  TEXT('warranty_number', 'warranty number'),
  DATE('warranty_start', 'warranty start date', 'warranty start'),
  DATE('warranty_end', 'warranty end date', 'warranty end'),
  TEXT('contract_number', 'contract number'),
  DATE('contract_start', 'contract start date', 'contract start'),
  DATE('contract_end', 'contract end date', 'contract end'),
  TEXT('contract_type', 'contract type'),
  TEXT('person_calling', 'person calling'),
  TEXT('public_health_threat', 'public health threat'),
  TEXT('death'), TEXT('serious_incident', 'serious incident'),
  TEXT('mode_of_reporting', 'mode of complaint reporting', 'mode of reporting'),
  TEXT('customer_name', 'customer name'), TEXT('customer_number', 'customer number'),
  TEXT('customer_designation', 'customer designation'), TEXT('email_address', 'email address'),
  DATE('added_on', 'call added on', 'added on'),
  // Last resort on both: the AppSheet forms stamp `Timestamp` when the call was
  // raised, and it is the only registration moment those exports carry.
  TS('reg_at', 'registration date time', 'reg at', 'timestamp'),
];

const REPORT_COLS: Col[] = [
  // The call registers carry their latest visit but no row id of their own, so
  // one is DERIVED from the call and the visit date. It is the same on every
  // run — a generated id would load the file again as new visits — and it stays
  // distinct where a call has more than one visit.
  { to: 'uid', from: ['uid', 'row id', 'unique id', 'key'], required: true,
    derive: (o) => (o.ucn
      ? `IMP-${o.ucn}${o.visit_at ? '-' + String(o.visit_at).slice(0, 19).replace(/[:T-]/g, '') : ''}`
      : '') },
  { to: 'ucn', from: ['ucn', 'uc number'], required: true },
  TEXT('call_number', 'call number'),
  TEXT('call_status', 'call status', 'status'),
  TEXT('pending_reason', 'call pending reason', 'pending reason'),
  TEXT('engineer', 'visiting service engineer', 'engineer name'),
  TEXT('engineer_email', 'email id', 'engineer email'),
  // REQUIRED, and this is a data-integrity rule rather than a convenience: a
  // call is Unattended only until it has a visit row, so loading a row with no
  // visit would mark an unattended call as attended. On the PM register 1,368
  // of 7,038 rows are exactly that — a call with no visit yet.
  { to: 'visit_at', from: ['visit date & time', 'visit date and time', 'visit date', 'date of visit'],
    type: 'ts', required: true },
  // WHEN THE ENTRY WAS MADE, which is not the same as when the visit happened —
  // and it is what decides a call's status. `sync_call_last_visit` (0032) takes
  // the LATEST ENTRY by updated_at, so leaving this to default to the import
  // moment would give all 7,509 rows the same timestamp and let an arbitrary
  // one decide every call.
  TS('updated_at', 'visit entry date', 'entry date', 'updated at'),
  // `Service Report` is what the PM/Installation registers call the attachment.
  // It arrives as an AppSheet path, not a link — Bulk Report Mapping is the way
  // to turn those into Drive links; here it is at least kept rather than lost.
  TEXT('manual_report', 'manual report', 'service report', 'attachment'),
];

export const UPLOADS: UploadDef[] = [
  // ---- calls. One table behind three registers; the call type is STAMPED
  // from the register you picked, so a PM sheet cannot land as a field call.
  { key: 'field_calls', label: 'Field Calls', group: 'Calls', table: 'field_calls',
    cols: CALL_COLS, stamp: { call_type: 'FIELD' }, conflict: 'ucn', extraInto: 'extra',
    note: 'Written straight to the field-call table rather than through the `calls` view: a view cannot be upserted, so going through it meant a re-run duplicated every call. The call number and registration date are still stamped by the database.' },
  { key: 'installation_calls', label: 'Installation Calls', group: 'Calls', table: 'installation_calls',
    cols: CALL_COLS, stamp: { call_type: 'INSTALLATION' }, conflict: 'ucn', extraInto: 'extra' },
  { key: 'pm_calls', label: 'PM Calls', group: 'Calls', table: 'pm_calls',
    cols: CALL_COLS, stamp: { call_type: 'PM' }, conflict: 'ucn', extraInto: 'extra' },

  // ---- visit reports. One table; the register only says which calls they are
  // for, so nothing is stamped.
  { key: 'field_reports', label: 'Field Reports', group: 'Visit Reports', table: 'reports',
    cols: REPORT_COLS, conflict: 'uid', extraInto: 'data', requires: 'Field Calls',
    note: 'For attaching recovered visits with AppSheet attachments, use Bulk Report Mapping instead — it resolves those to Drive links.' },
  { key: 'installation_reports', label: 'Installation Reports', group: 'Visit Reports', table: 'reports',
    cols: REPORT_COLS, conflict: 'uid', extraInto: 'data', requires: 'Installation Calls' },
  { key: 'pm_reports', label: 'PM Reports', group: 'Visit Reports', table: 'reports',
    cols: REPORT_COLS, conflict: 'uid', extraInto: 'data', requires: 'PM Calls' },

  { key: 'call_requests', label: 'Call Registration Requests', group: 'Calls', table: 'call_requests',
    conflict: 'unique_key', conflictFrom: ['reqid', 'product', 'serial_no'], extraInto: 'extra',
    note: 'The Hotline desk: one row per machine on a request. The file MUST carry the request id (its `ID` column): the database builds the match key from it, so without one every load creates a fresh request and a re-load duplicates the lot. A request that was already registered keeps its UCN, which is what links it to the call.',
    cols: [
      // REQUIRED. `unique_key` is not sent at all — call_requests_biu (0003)
      // rebuilds it from reqid + product + serial on every write, so whatever
      // the file says is overwritten. That is fine while the request id comes
      // from the file, and a disaster when it does not: the database generates
      // one, the key is different every run, and the whole file loads again as
      // new requests. Requiring it turns a silent duplication into "no id".
      { to: 'reqid', from: ['id', 'reqid', 'req id', 'request id'], required: true },
      TS('submitted_at', 'timestamp', 'submitted at', 'request date'),
      TEXT('email', 'e mail id', 'email id', 'email'),
      TEXT('engineer', 'engineer name', 'requested by'),
      TEXT('call_type', 'call type'),
      TEXT('party_name', 'party name', 'customer'),
      TEXT('state'), TEXT('city'), TEXT('address'),
      TEXT('customer_contact_details', 'customer contact details', 'contact person', 'name'),
      TEXT('customer_contact_number', 'customer contact number', 'contact number'),
      TEXT('product', 'product name', 'product'),
      TEXT('serial_no', 'product serial number', 'serial no', 'serial number', 'serial'),
      TEXT('standard_complaint', 'standard complaint'),
      TEXT('reported_problem', 'reported problem', 'complaint reported'),
      TEXT('installation_report', 'installation report'),
      TEXT('kyc', 'kyc'),
      TEXT('call_attended', 'call attended'),
      DATE('attended_date', 'attended date'), DATE('plan_date', 'plan date'),
      TEXT('additional_comments', 'additional comments', 'remarks'),
      // A request already turned into a call carries its UCN; that is the link.
      // The export keeps cancellations in the SAME column ("Request cancel" on
      // 52 of 4,159 rows), so only a UCN-shaped value is taken as one — the rest
      // is kept alongside the row instead of being filed as a call number.
      { to: 'ucn', from: ['ucn number', 'uc number', 'ucn'], when: (v) => /^\d{2}[A-Za-z]\d{2}[A-Za-z]\d{4}$/.test(v) },
      // A UCN means the request became a call: the database (0083) sets
      // Registered on any blank / Pending row that carries one. Derived here as
      // well so the PREVIEW shows what will actually be stored.
      { to: 'status', from: ['status'], derive: (o) => (o.ucn ? 'Registered' : '') },
      TEXT('cancel_reason', 'cancel reason', 'cancellation reason'),
    ] },

  // ---- spares
  { key: 'spare_requests', label: 'Spare Request', group: 'Spares', table: 'spare_requests',
    conflict: 'or_no', requires: 'Field Calls', extraInto: 'extra',
    note: 'One row per request, matched on the OR number — which is also the only thing the lines export has to find its parent by, so load this file first. The table’s own `uid` is left to the database: matching on it instead is what made a re-load stop at "duplicate key … spare_requests_or_no_idx" on the first row. The Spare (1..20) / Qty (1..20) columns are the lines repeated across the row; load them from the Lines file, which carries the approvals and quantities too.',
    cols: [
      // The OR NUMBER identifies a request, in this file and in the lines file,
      // and it has a unique index of its own — so it is the conflict target.
      // `uid` is deliberately NOT sent: rows already here carry one (the sheet's
      // own row id, from an earlier import), and writing over it collided with
      // the or_no index and stopped the file. 0085 fills it in on insert.
      { to: 'or_no', from: ['or no', 'or number', 'request uid'], required: true },
      DATE('or_req_date', 'or req date', 'or date', 'request date'),
      TEXT('req_type', 'req type', 'request type'),
      TEXT('engineer', 'engineer name', 'engineer'),
      TEXT('engineer_email', 'engineer email'),
      TEXT('ucn', 'uc number', 'ucn'), TEXT('call_number', 'call number'),
      TEXT('party_name', 'party name'), TEXT('product_name', 'product name'),
      TEXT('serial', 'product serial number', 'serial no', 'serial'),
      TEXT('complaint', 'complaint reported', 'complaint'), TEXT('item_status', 'item status'),
      TEXT('handstock_reason', 'reason for handstock request', 'handstock reason'),
      TEXT('remarks', 'additional remarks', 'remarks'), TEXT('status'), TEXT('stage'),
      TS('created_at', 'raised on', 'created at'),
    ] },
  // The approvals are COLUMNS on the line, not registers of their own — so the
  // RM / Commercial / NSM sheets all load here, each filling in its own stage.
  { key: 'spare_request_lines', label: 'Spare Request Lines (+ RM / Commercial / NSM approval)', group: 'Spares',
    table: 'spare_request_lines', conflict: 'line_uid', requires: 'Spare Request', extraInto: 'extra',
    prepare: 'spare-line-parents',
    // A request line asks for something: the database refuses a quantity below 1
    // (0011), and four DROPPED lines in the 2026 export ask for none — requested,
    // dispatched and dropped all zero. Those four failed all 8,571. They are not
    // requests for a spare; held back by name, as the MRN rows that return
    // nothing are.
    reject: (r) => (Number(r.qty ?? 0) < 1
      ? 'the export asks for no quantity — a dropped line, which the register cannot hold'
      : ''),
    note: 'The export\u2019s "ADMIN Approval" is the Commercial stage — that is the column the approval flow reads. Before writing, each line\u2019s OR number is matched to the request holding it, and a request is created for any the header export does not carry (marked as such, so the gap stays visible) — so this file loads on its own, in any order. RM, Commercial and NSM approvals are columns on this row, not separate registers. Load the same file three times if the approvals arrived separately — each pass fills in its own stage.',
    cols: [
      // "OR26724|NO-001" — the export's own line identity.
      { to: 'line_uid', from: ['spare request no|part number', 'line uid', 'line id', 'uid'], required: true },
      // The OR number, which is the request's uid (see the Spare Request note).
      { to: 'request_uid', from: ['or no', 'or number', 'request uid'], required: true },
      // `Spare` is already CODE|Description; built from the two halves otherwise.
      { to: 'part', from: ['spare', 'part', 'part no'], required: true,
        derive: (o) => (o.extra && typeof o.extra === 'object'
          ? (() => {
              const e = o.extra as Record<string, unknown>;
              const c = String(e['Part Number'] ?? '').trim();
              const d = String(e['Part Description'] ?? '').trim();
              return c && d ? `${c}|${d}` : '';
            })()
          : '') },
      { to: 'qty', from: ['requested qty', 'qty', 'quantity'], type: 'num' },
      { to: 'row_no', from: ['row no', 'si number', 'sl no'], type: 'int' },
      TEXT('rm_approval', 'rmapproval', 'rm approval'), TEXT('rm_by', 'rm by'),
      TS('rm_at', 'rmapproval date', 'rm approval date', 'rm date'),
      // The sheet's "ADMIN Approval" IS the Commercial stage — that is the
      // column the approval flow reads (spareflow.ts); `admin_approval` is a
      // legacy field nothing acts on.
      TEXT('commercial_approval', 'admin approval', 'commercial approval'),
      TEXT('commercial_by', 'commercial by'),
      TS('commercial_at', 'admin approval date', 'commercial date'),
      TEXT('nsm_approval', 'nsm approval'), TEXT('nsm_by', 'nsm by'),
      TS('nsm_at', 'nsm approval date', 'nsm date'),
      TEXT('stores_status', 'stores status'), TEXT('stage'), TEXT('status'),
      TEXT('reject_reason', 'reject reason'), TEXT('rejected_stage', 'rejected stage'),
      TEXT('stock_out_no', 'so no', 'stock out no'),
      TEXT('dc_number', 'dc number'), TEXT('courier'),
      TS('dispatched_at', 'so date', 'dispatched date'),
      NUM('dispatched_qty', 'dispatched qty'), NUM('received_qty', 'received qty'),
    ] },
  { key: 'spare_dispatches', label: 'Stock Out Register', group: 'Spares', table: 'spare_dispatches',
    conflict: 'uid', requires: 'Spare Request Lines',
    cols: [
      { to: 'uid', from: ['uid', 'stock out no', 'dc number'], required: true },
      TEXT('dc_number', 'dc number'), DATE('dc_date', 'dc date'),
      TEXT('engineer'), TEXT('engineer_email', 'engineer email'),
      TEXT('courier'), TEXT('remarks'),
      { to: 'line_count', from: ['line count'], type: 'int' }, NUM('total_qty', 'total qty'),
      TEXT('dispatched_by', 'dispatched by'), TS('dispatched_at', 'dispatched at', 'dispatch date'),
    ] },
  { key: 'spare_consumption', label: 'Consumption', group: 'Spares', table: 'spare_consumption',
    requires: 'Field Calls', extraInto: 'data', conflict: 'source_ref_key', conflictFrom: ['source_ref'],
    note: 'Matched on the export\u2019s own row id, so re-loading a corrected sheet updates those lines rather than adding them again. GRIR / Traceability is carried through — it is which part was actually fitted, not just which kind.',
    cols: [
      { to: 'part', from: ['spares used', 'part', 'part no', 'spare'], required: true },
      // `Consumed Qty` is the authoritative one where both are present.
      { to: 'qty', from: ['consumed qty', 'qty', 'quantity'], type: 'num', required: true },
      { to: 'source_ref', from: ['uid', 'row id', 'unique id'] },
      TEXT('ucn', 'uc number', 'ucn'), TEXT('call_number', 'call number'),
      TEXT('engineer', 'visiting service engineer', 'engineer'),
      TEXT('engineer_email', 'e mail id', 'email id', 'engineer email'),
      TEXT('grir', 'grir traceability', 'grir / traceability', 'grir', 'traceability'),
      TEXT('remarks'), TEXT('recorded_by', 'recorded by'),
      TS('created_at', 'visit date & time', 'consumed on', 'date'),
    ] },
  { key: 'material_returns', label: 'MRN Register', group: 'Spares', table: 'material_returns', extraInto: 'extra',
    // `source: import` is what 0039 already looks for: a return that HAPPENED is
    // not refused for leaving the engineer short, because the issues that
    // covered it may be in a file that is not loaded yet. The register simply
    // never stamped it, so every historical MRN was refused.
    stamp: { source: 'import' },
    // The database refuses a return of nothing, and 7 such rows failed the whole
    // 602-row batch. They are not returns; held back by name.
    reject: (r) => (Number(r.good_qty ?? 0) + Number(r.defective_qty ?? 0) > 0
      ? '' : 'nothing returned — good and defective are both zero'),
    note: 'The returns register as exported. `Item Details` is the part — `Part Details` in the same export is a spreadsheet formula with the quantities glued on the end, and is not read. The export has no unique row id (its SI Number repeats), so load it once.',
    cols: [
      // `Item Details` is Item Code|Item Name, which is how a part is stored.
      { to: 'part', from: ['item details', 'part details clean', 'part', 'part no', 'spare'], required: true,
        derive: (o) => (o.item_code && o.item_name ? `${o.item_code}|${o.item_name}` : '') },
      TEXT('item_code', 'item code'), TEXT('item_name', 'item name'),
      TEXT('mrn_no', 'mrn no'), DATE('mrn_date', 'mrn date'),
      TEXT('engineer', 'engineer name', 'engineer'),
      TEXT('engineer_email', 'user email', 'engineer email'),
      TEXT('uid', 'si number', 'reference'),
      { to: 'row_no', from: ['row no', 'si no'], type: 'int' },
      NUM('good_qty', 'good qty', 'good'), NUM('defective_qty', 'defective qty', 'defective'),
      TEXT('customer_name', 'customer name', 'customer'), TEXT('report_no', 'report no'),
      TEXT('removed_from_equipment', 'removed from equip', 'removed from equipment'),
      TEXT('handstock_note', 'handstock'),
      TEXT('remarks'),
      TS('returned_at', 'timestamp', 'returned at'),
    ] },
  { key: 'stock_transfers', label: 'Stock Transfer Register', group: 'Spares', table: 'stock_transfers',
    // `source: Import` marks a transfer that already happened, which the stock
    // check lets past: it cannot be refused for leaving the sender short when
    // the issues that covered it are in a file that is not loaded yet (0089).
    conflict: 'uid', extraInto: 'extra', stamp: { source: 'import' },
    // The database refuses a transfer to the same engineer, and one such row
    // failed the whole batch. Held back by name instead — and it is genuinely
    // not a transfer.
    reject: (r) => {
      const a = String(r.from_engineer ?? '').trim().toLowerCase();
      const b = String(r.to_engineer ?? '').trim().toLowerCase();
      return a && a === b ? `from and to are the same engineer (${String(r.from_engineer ?? '')})` : '';
    },
    cols: [
      { to: 'uid', from: ['stock transfer number', 'uid', 'transfer no'], required: true },
      { to: 'from_engineer', from: ['from engineer', 'from'], required: true },
      { to: 'to_engineer', from: ['to engineer', 'to'], required: true },
      DATE('transfer_date', 'transfer date', 'timestamp', 'date'),
      TEXT('remarks', 'additional remarks', 'remarks'), TEXT('status'),
    ] },
  { key: 'stock_transfer_lines', label: 'Stock Transfer Lines', group: 'Spares', table: 'stock_transfer_lines',
    // A line whose transfer is not in the register cannot be loaded: the two
    // same-engineer rows the register holds back take their lines with them,
    // and one of those failed the first batch of 500. Held back by name.
    prepare: 'stock-transfer-parents',
    requires: 'Stock Transfer Register',
    note: 'No natural key — a re-run ADDS rows rather than correcting them.',
    cols: [
      { to: 'transfer_uid', from: ['transfer uid', 'uid', 'stock transfer number'], required: true },
      { to: 'part', from: ['part', 'part no', 'spare'], required: true },
      { to: 'qty', from: ['qty', 'quantity'], type: 'num', required: true },
      { to: 'row_no', from: ['row no', 'si number'], type: 'int' },
    ] },

  { key: 'handstock_opening', label: 'Opening Stock — a pool you have prepared', group: 'Spares',
    table: 'handstock_opening', conflict: 'engineer_key,part_code,source_key',
    conflictFrom: ['engineer', 'part', 'source'],
    note: 'For a pool you have PREPARED — one row per engineer + part + quantity, with a Source you give it. If you have the WinMax export itself, with its User Name / Item Code / Good Balance columns, use “Opening Stock — the WinMax export” below: this register cannot read that file and will hold back every row. The hand stock that pre-dates the movement history. Each pool is ADDITIVE and sits alongside the others — WinMax HS (struck June 2022), then 22 H2, 23, 24, 25. Give every row its Source: re-loading a corrected sheet replaces THAT pool rather than adding a second one, and an unlabelled balance cannot be audited.',
    cols: [
      { to: 'engineer', from: ['engineer', 'engineer name'], required: true },
      { to: 'part', from: ['part', 'part no', 'spare', 'item detail'], required: true },
      { to: 'qty', from: ['qty', 'quantity', 'stock', 'stock level', 'balance'], type: 'num', required: true },
      { to: 'source', from: ['source', 'pool', 'stock level name', 'period'], required: true },
      DATE('as_of', 'as of', 'as on', 'date'),
      TEXT('remarks'),
    ] },

  { key: 'spare_consumption_history', label: 'Consumption — historical (pre-2026)', group: 'Spares',
    table: 'spare_consumption_history', conflict: 'source_key,ref', conflictFrom: ['source', 'ref'],
    extraInto: 'data',
    note: 'The consumption that pre-dates this system. It is NOT capped and NOT reconciled — it is the record of what happened, not a control point — and it consolidates into Stock Levels alongside the opening pools. Give every row a Source, and a Ref from that source where you have one: without a Ref a re-run cannot match the row and would add it again.',
    cols: [
      { to: 'engineer', from: ['engineer', 'engineer name'], required: true },
      { to: 'part', from: ['part', 'part no', 'spare', 'item detail'], required: true },
      { to: 'qty', from: ['qty', 'quantity', 'consumed'], type: 'num', required: true },
      { to: 'source', from: ['source', 'pool', 'period', 'data set'], required: true },
      // Required: without it a re-run cannot match the row and would load it again.
      { to: 'ref', from: ['ref', 'row id', 'unique id', 'reference'], required: true },
      TS('consumed_at', 'consumed on', 'date', 'consumption date', 'visit date'),
      TEXT('ucn'), TEXT('call_number', 'call number'), TEXT('party_name', 'party name'),
      TEXT('remarks'),
    ] },

  // The ISSUE side of the historical record, and the other half of
  //     WinMax HS + SO + ST received - Consumption - ST sent - MRN.
  { key: 'spare_issues', label: 'Stock Out — all years', group: 'Spares', table: 'spare_issue_history',
    conflict: 'source_key,ref', conflictFrom: ['source', 'ref'], extraInto: 'data',
    stamp: { source: 'Stock out' },
    // The export has rows dispatched as zero — nothing left the store, so
    // nothing entered a hand. The table refuses them; held back by name.
    reject: (r) => (Number(r.qty ?? 0) > 0 ? '' : 'nothing was dispatched on this row'),
    note: 'Every spare ever issued, from the stock-out export. It is NOT capped, and a spare already counted through its 2026 request line is NOT counted again — the view tests the line id, so loading this whole file alongside the 2026 register is safe in either order. Matched on SO number + line, so a re-run corrects; the export has 35 rows that repeat that pair and they fold into one.',
    cols: [
      { to: 'engineer', from: ['to', 'engineer name', 'engineer'], required: true },
      // `Spare` where the export has it; otherwise the two halves it does.
      { to: 'part', from: ['spare', 'part', 'item detail'], required: true,
        derive: (o) => {
          const e = (o.data ?? {}) as Record<string, unknown>;
          const c = String(e['Part Number'] ?? '').trim();
          const d = String(e['Part Description'] ?? '').trim();
          return c && d ? `${c}|${d}` : c;
        } },
      { to: 'qty', from: ['dispatched qty', 'qty', 'quantity'], type: 'num', required: true },
      TS('issued_at', 'so date', 'dispatch date', 'stock out date'),
      TEXT('so_no', 'so no', 'stock out no', 'so number'),
      { to: 'line_uid', from: ['spare request no|part number', 'line uid'] },
      // The SO and the line identify the row in the export.
      { to: 'ref', from: ['ref', 'row id'], required: true,
        derive: (o) => `${String(o.so_no ?? '').trim()}|${String(o.line_uid ?? '').trim()}` },
      TEXT('remarks', 'address'),
    ] },

  // The WinMax balance struck at the cutover, which is where the record starts.
  { key: 'handstock_winmax', label: 'Opening Stock — the WinMax export, as exported', group: 'Spares',
    table: 'handstock_opening', conflict: 'engineer_key,part_code,source_key',
    conflictFrom: ['engineer', 'part', 'source'], extraInto: 'data',
    stamp: { source: 'WinMax HS', as_of: '2022-06-09' },
    note: 'The WinMax export exactly as it comes — User Name, Item Code, Item Name, Good Balance, Defective Balance. Nothing to prepare. The WinMax balance as it stood when the sheet era began. GOOD AND DEFECTIVE are both counted: a defective part is still in the engineer\u2019s hands until an MRN takes it back, which is exactly how the returns register subtracts it. A missing balance is not counted. Re-loading a corrected sheet replaces this pool rather than adding a second one.',
    cols: [
      { to: 'engineer', from: ['user name', 'engineer name', 'engineer'], required: true },
      { to: 'part', from: ['part', 'item detail', 'spare'], required: true,
        derive: (o) => {
          const e = (o.data ?? {}) as Record<string, unknown>;
          const c = String(e['Item Code'] ?? '').trim();
          const d = String(e['Item Name'] ?? '').trim();
          return c && d ? `${c}|${d}` : c;
        } },
      // Good PLUS defective — what the engineer actually holds.
      { to: 'qty', from: ['good balance', 'qty', 'quantity', 'balance'], type: 'num', required: true,
        always: true,
        derive: (o) => {
          const e = (o.data ?? {}) as Record<string, unknown>;
          const good = Number(o.qty ?? 0) || 0;
          const bad = Number(String(e['Defective Balance'] ?? '').replace(/,/g, '')) || 0;
          return good + bad;
        } },
      DATE('as_of', 'as of', 'as on', 'date'),
      TEXT('remarks'),
    ],
    reject: (r) => (Number(r.qty ?? 0) > 0 ? '' : 'no balance — good and defective are both zero'),
    // Hand stock is keyed on the part CODE, and two WinMax lines can share one
    // (ACC-081 is both tubings). One balance, so they are ADDED, not replaced.
    fold: {
      key: (r) => `${String(r.engineer ?? '').trim().toLowerCase()}|`
        + `${String(r.part ?? '').split('|')[0].trim().toLowerCase()}|`
        + `${String(r.source ?? '').trim().toLowerCase()}`,
      sum: ['qty'],
    },
  },

  // The yearly consumption exports: one register, four files.
  { key: 'consumption_yearly', label: 'Consumption — yearly export (pre-2026)', group: 'Spares',
    table: 'spare_consumption_history', conflict: 'source_key,ref', conflictFrom: ['source', 'ref'],
    extraInto: 'data',
    note: 'The 22 H2 / 23 / 24 / 25 consumption reports as exported. The Source is taken from each row\u2019s own Visit ENTRY date, so a visit entered in January for December lands in the year it was entered — the year the file is. Rows are matched on their position in the file, so re-loading the same file corrects rather than duplicates.',
    cols: [
      { to: 'engineer', from: ['visiting service engineer', 'engineer name', 'engineer'], required: true },
      { to: 'part', from: ['spares used', 'spares used (1)', 'part', 'spare'], required: true },
      { to: 'qty', from: ['consumed qty', 'qty', 'qty (1)', 'quantity'], type: 'num', required: true },
      TS('consumed_at', 'visit date & time', 'visit date'),
      TEXT('ucn', 'uc number'), TEXT('call_number', 'call number', 'call no'),
      TEXT('party_name', 'customer', 'party name'),
      // The file is a year, and the ENTRY date is what put a row in it.
      { to: 'source', from: ['source', 'data set'],
        derive: (o) => {
          const e = (o.data ?? {}) as Record<string, unknown>;
          const d = parseAnyDate(String(e['Visit Entry Date'] ?? '')) ?? parseAnyDate(String(o.consumed_at ?? ''));
          return d ? `Consumption ${d.getFullYear()}` : '';
        } },
      { to: 'ref', from: ['ref', 'row id'],
        derive: (o, i) => `${String(o.source ?? 'row')}#${i + 1}` },
      TEXT('remarks'),
    ] },

  // ---- quality
  { key: 'feedback', label: 'Customer Feedback', group: 'Quality', table: 'feedback',
    requires: 'Field Calls', extraInto: 'answers',
    note: 'The answers are kept as given — every column that is not named below becomes one. No natural key, so a re-run ADDS rows.',
    cols: [
      { to: 'ucn', from: ['ucn'], required: true },
      TEXT('call_number', 'call number'), TEXT('call_type', 'call type'),
      TEXT('engineer'), TEXT('engineer_email', 'engineer email'),
      TEXT('party_name', 'party name'), TEXT('state'),
      TEXT('product_name', 'product name'), TEXT('serial', 'serial no'), TEXT('complaint'),
      TS('visit_at', 'visit date'),
    ] },
  { key: 'call_reviews', label: 'DCCR Register', group: 'Quality', table: 'call_reviews',
    conflict: 'ucn', requires: 'Field Calls',
    note: 'Review Status, Any Potential Effect, Action Taken and the “Review N Completed” flags are DERIVED — the register computes them from the answers below, so the file\u2019s own copies are ignored rather than loaded. Everything else the file carries (call details, visit remarks, spares consumed, the failure-age columns) belongs to the call and its visits, not to the review, and is ignored here too.',
    cols: [
      { to: 'ucn', from: ['uc number', 'ucn', 'uc no'], required: true },
      TEXT('call_number', 'call number'),
      TEXT('risk_to_patient', 'risk to patient any clinical impact', 'risk to patient'),
      TEXT('warranty_failure', 'warranty failure'),
      TEXT('frequent_failure', 'frequent failure'),
      DATE('review2_at', 'date of review 2', 'review 2 date'), TEXT('review2_by', 'review 2 by'),
      TEXT('complaint_grouping', 'complaint grouping', 'dccr complaint grouping'),
      TEXT('root_cause_keyword', 'root cause key word', 'root cause keyword'),
      TEXT('spare_category', 'spare consumable correction calibration', 'spare category'),
      TEXT('service_observation', 'service dept observation', 'service observation'),
      DATE('review3_at', 'date of review 3', 'review 3 date'), TEXT('review3_by', 'review 3 by'),
    ] },

  // ---- registers with their own screens
  { key: 'parties', label: 'Party Master', group: 'Masters', table: 'parties', extraInto: 'extra',
    conflict: 'name_key', conflictFrom: ['party_name'],
    note: 'The AppSheet export loads as exported. Everything the table has no column for — Type, Profile, Country, Route, the telephone/email/PAN/GST fields, the contact person — is kept on the row rather than dropped. Each party is given its key (Party-1, Party-2 …) on first load and keeps it; matching is on the party name, so re-loading a corrected sheet updates those parties instead of adding them again.',
    cols: [
      { to: 'party_name', from: ['party name', 'party', 'customer', 'name'], required: true },
      TEXT('city'), TEXT('state'),
      TEXT('party_type', 'type', 'profile'),
      TEXT('address', 'billing address'),
    ] },
  { key: 'products', label: 'Product Master', group: 'Masters', table: 'products', extraInto: 'extra',
    conflict: 'machine_key', conflictFrom: ['item_name', 'serial_number'],
    note: 'A machine is its MODEL plus its SERIAL, not the serial alone — in the real export 3,794 serials repeat (there are eleven machines called “219”). Matched on the two together, so re-loading a corrected sheet updates those machines rather than adding them again. The install base — one row per machine. City, State, Address, PO and the rest are kept on the row; the table has no column for them.',
    cols: [
      // `Item Serial Number` is what the AppSheet export calls it.
      { to: 'serial_number', from: ['item serial number', 'serial number', 'serial no', 'serial', 'product serial number'], required: true },
      { to: 'item_name', from: ['item name', 'product name', 'product', 'model'], required: true },
      TEXT('party_name', 'party name', 'customer'),
      TEXT('item_status', 'item status', 'warranty status', 'contract status'),
      TEXT('warranty_number', 'warranty number'),
      DATE('warranty_start', 'warranty start date', 'warranty start'),
      DATE('warranty_end', 'warranty end date', 'warranty end'),
      TEXT('contract_number', 'contract number'), TEXT('contract_type', 'contract type'),
      DATE('contract_start', 'contract start date', 'contract start'),
      DATE('contract_end', 'contract end date', 'contract end'),
    ] },
  { key: 'parts', label: 'Part Master', group: 'Masters', table: 'parts', extraInto: 'extra',
    conflict: 'item_detail_key', conflictFrom: ['item_detail'],
    note: 'Matched on CODE|Description — the same thing a consumption line and an engineer\u2019s hand stock reference. Not on the code alone: the register uses YR134500 for two different parts, so the code would have merged them. Re-loading a corrected sheet updates those parts, rather than adding them again. A part marked Inactive comes in retired — it stays on every record that already uses it but is not offered in the pickers.',
    cols: [
      { to: 'code', from: ['item code', 'code', 'part no', 'part code'], required: true },
      // `Item Details` is already the CODE|Description string the app stores;
      // where a file has only the two halves, it is built from them.
      { to: 'item_detail', from: ['item details', 'item detail', 'part description'], required: true,
        derive: (o) => (o.code && o.description ? `${o.code}|${o.description}` : '') },
      TEXT('description', 'item name', 'description'),
      { to: 'active', from: ['active/inactive?', 'active inactive', 'active', 'status'], type: 'bool' },
      TS('created_at', 'added on'),
    ] },

  // ---- ownership & recovered cover
  { key: 'ownership_transfers', label: 'Ownership Transfer', group: 'Cover', table: 'ownership_transfers',
    requires: 'Product Master', extraInto: 'extra',
    note: 'One row per hand-over. Leave "From Party" blank and it is filled in from who holds the machine now — which is what makes a historical list loadable in date order. The machine follows the LATEST transfer, so a back-dated row loaded afterwards does not undo a later one. Everything else the export carries (the SA and warranty context, engineer, city) is kept on the row.',
    cols: [
      { to: 'serial_number', from: ['item serial number', 'serial number', 'serial no', 'serial'], required: true },
      // `Party Name (TO)` and `Party Name (FROM)` both lose their brackets under
      // loose matching and collapse to "party name" — so the bracketed forms are
      // listed FIRST and matched exactly, before loosening can confuse the two.
      { to: 'to_party', from: ['party name (to)', 'party name to', 'to party', 'new party', 'transferred to'], required: true },
      { to: 'from_party', from: ['party name (from)', 'party name from', 'from party', 'old party', 'transferred from'] },
      TEXT('item_name', 'product details', 'item details', 'item name', 'product name', 'product'),
      DATE('transfer_date', 'transfer date', 'ot date', 'date'),
      TEXT('reference_no', 'ot number', 'reference no', 'reference', 'document no'),
      TEXT('reason'), TEXT('remarks'),
      TEXT('document_url', 'file upload', 'document', 'document link'),
    ] },
  { key: 'product_additional_entries', label: 'Additional Entry Details (recovered warranty)', group: 'Cover',
    table: 'product_additional_entries', conflict: 'serial_key', conflictFrom: ['serial_number'], requires: 'Product Master',
    note: 'For machines whose Sale Entry was lost. Used only where the Sale / Contract registers are silent — load the real paperwork later and it wins automatically. Record where the detail came from in Source Note; a recovered date with no provenance is an assertion, not evidence.',
    cols: [
      { to: 'serial_number', from: ['serial number', 'serial no', 'serial'], required: true },
      TEXT('item_name', 'item name', 'product name'), TEXT('party_name', 'party name', 'customer'),
      TEXT('warranty_number', 'warranty number', 'sa number', 'invoice no'),
      DATE('warranty_start', 'warranty start'), DATE('warranty_end', 'warranty end'),
      TEXT('contract_number', 'contract number', 'mc number'), TEXT('contract_type', 'contract type'),
      DATE('contract_start', 'contract start'), DATE('contract_end', 'contract end'),
      TEXT('source_note', 'source note', 'source'), TEXT('document_url', 'document', 'document link'),
      TEXT('remarks'),
    ] },

  // ---- cover
  { key: 'sale_entries', label: 'Sale Entry', group: 'Cover', table: 'sale_entries', conflict: 'sa_number',
    note: 'The AppSheet export loads as exported — every column into the table\u2019s own column where there is one, and into `extra` otherwise. Any order works: a machine whose entry has not been loaded yet gets a stub entry, which the entry file then fills in.',
    shape: (raw) => shapeCoverRows('sale_entries' as CoverTable, raw as Record<string, string>[]),
    cols: [] },
  { key: 'sale_items', label: 'Sale Details', group: 'Cover', table: 'sale_items', conflict: 'uid',
    requires: 'Sale Entry',
    note: 'The AppSheet export loads as exported — every column into the table\u2019s own column where there is one, and into `extra` otherwise. Any order works: a machine whose entry has not been loaded yet gets a stub entry, which the entry file then fills in.',
    shape: (raw) => shapeCoverRows('sale_items' as CoverTable, raw as Record<string, string>[]),
    cols: [] },
  { key: 'contract_entries', label: 'Contract Entry', group: 'Cover', table: 'contract_entries', conflict: 'mc_number',
    note: 'The AppSheet export loads as exported — every column into the table\u2019s own column where there is one, and into `extra` otherwise. Any order works: a machine whose entry has not been loaded yet gets a stub entry, which the entry file then fills in.',
    shape: (raw) => shapeCoverRows('contract_entries' as CoverTable, raw as Record<string, string>[]),
    cols: [] },
  { key: 'contract_items', label: 'Contract Details', group: 'Cover', table: 'contract_items', conflict: 'uid',
    requires: 'Contract Entry',
    note: 'The AppSheet export loads as exported — every column into the table\u2019s own column where there is one, and into `extra` otherwise. Any order works: a machine whose entry has not been loaded yet gets a stub entry, which the entry file then fills in.',
    shape: (raw) => shapeCoverRows('contract_items' as CoverTable, raw as Record<string, string>[]),
    cols: [] },
];

// ---- master value lists ---------------------------------------------------
//
// Every value list gets its OWN upload, built from the registry rather than
// listed here — a list added later needs no code change. The list name is
// stamped from the register you picked, which is exactly what the header of a
// "Call Type" sheet cannot tell anyone.
export function masterUpload(list: { key: string; label: string; value_label?: string }): UploadDef {
  const names = [list.label, `${list.label} name`, list.value_label ?? '', 'value', 'name'].filter(Boolean);
  return {
    key: `master:${list.key}`,
    label: list.label,
    group: 'Master Value Lists',
    table: 'masters',
    stamp: { name: list.key },
    conflict: 'name,value',
    extraInto: 'extra',
    note: `Loads into the ${list.label} list. The list name is stamped for you, so the file only needs its values.`,
    cols: [
      { to: 'value', from: names, required: true },
      { to: 'added_by', from: ['added by'] },
      { to: 'added_on', from: ['added on'], type: 'date' },
    ],
  };
}

export const uploadGroups = (defs: UploadDef[]): { title: string; items: UploadDef[] }[] => {
  const order = ['Calls', 'Visit Reports', 'Spares', 'Quality', 'Masters', 'Master Value Lists', 'Cover'];
  const by = new Map<string, UploadDef[]>();
  defs.forEach((d) => { by.set(d.group, [...(by.get(d.group) ?? []), d]); });
  return order.filter((g) => by.has(g)).map((title) => ({ title, items: by.get(title)! }));
};

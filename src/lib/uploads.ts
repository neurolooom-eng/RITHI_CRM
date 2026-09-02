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

export type ColType = 'text' | 'date' | 'ts' | 'num' | 'int' | 'bool' | 'json';

export interface Col {
  /** The database column. */
  to: string;
  /** Header names accepted for it, matched case- and space-insensitively. */
  from: string[];
  type?: ColType;
  /** A row without this is not loaded — it would be a fragment, not a record. */
  required?: boolean;
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
  /** jsonb column that catches every header not named above. */
  extraInto?: string;
  /** What has to be loaded first, because rows here point at it. */
  requires?: string;
  note?: string;
}

// ---- coercion -------------------------------------------------------------

const norm = (h: string) => h.trim().toLowerCase().replace(/[\s_]+/g, ' ');

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Day-first, always. These are Indian exports: reading 03/04/2026 as 4 March
// instead of 3 April moves a record by a month and nothing downstream notices.
export function toDate(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{4})/.exec(s);
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export function toTs(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) {
    const [, d, mo, y, hh = '0', mi = '0', ss = '0'] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mi), Number(ss));
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

const TRUE = new Set(['y', 'yes', 'true', '1', 't']);
const FALSE = new Set(['n', 'no', 'false', '0', 'f']);

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
}

export function shapeUpload(def: UploadDef, raw: Record<string, unknown>[]): ShapeResult {
  const rows: Record<string, unknown>[] = [];
  const skipped: { row: number; why: string }[] = [];
  const claimed = new Set<string>();
  const headers = Object.keys(raw[0] ?? {});

  // header -> column, resolved once for the whole file rather than per row
  const bind = new Map<string, Col>();
  def.cols.forEach((c) => {
    const want = new Set(c.from.map(norm));
    headers.forEach((h) => { if (want.has(norm(h)) && !bind.has(h)) { bind.set(h, c); claimed.add(h); } });
  });

  raw.forEach((r, i) => {
    const out: Record<string, unknown> = { ...(def.stamp ?? {}) };
    const extra: Record<string, unknown> = {};

    Object.entries(r).forEach(([h, v]) => {
      const col = bind.get(h);
      if (col) {
        const val = coerce(v, col.type);
        // Never let a blank cell overwrite a stamped constant.
        if (val !== null && val !== '') out[col.to] = val;
      } else if (def.extraInto) {
        const s = String(v ?? '').trim();
        if (s) extra[h.trim()] = s;
      }
    });

    if (def.extraInto) out[def.extraInto] = extra;

    const missing = def.cols.filter((c) => c.required && (out[c.to] === undefined || out[c.to] === '' || out[c.to] === null));
    if (missing.length) {
      skipped.push({ row: i + 2, why: `no ${missing.map((c) => c.from[0]).join(', ')}` });   // +2: header row, 1-based
      return;
    }
    rows.push(out);
  });

  // A re-run must correct rather than duplicate, so the last of a repeated key
  // wins inside the file too — otherwise the upsert would fight itself in one
  // batch ("cannot affect row a second time").
  const deduped = def.conflict ? dedupe(rows, def.conflict) : rows;

  return { rows: deduped, skipped, unmatched: headers.filter((h) => !claimed.has(h)) };
}

function dedupe(rows: Record<string, unknown>[], key: string): Record<string, unknown>[] {
  const by = new Map<string, Record<string, unknown>>();
  const out: Record<string, unknown>[] = [];
  rows.forEach((r) => {
    const k = String(r[key] ?? '');
    if (!k) { out.push(r); return; }
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
  DATE('reg_date', 'registration date', 'reg date', 'date of registration'),
  DATE('complaint_date', 'complaint date'),
  DATE('breakdown_date', 'breakdown date'),
  TEXT('party_name', 'party name', 'customer', 'party'),
  TEXT('city'), TEXT('state'),
  TEXT('product_name', 'product name', 'product', 'model'),
  TEXT('serial', 'serial no', 'serial number', 'sr no'),
  TEXT('item_status', 'item status'),
  TEXT('standard_complaint', 'standard complaint'),
  TEXT('complaint_reported', 'complaint reported', 'reported problem'),
  TEXT('allocated_to', 'allocated to', 'engineer'),
  TEXT('allocated_to_email', 'allocated to email', 'engineer email'),
  TEXT('warranty_number', 'warranty number'), DATE('warranty_start', 'warranty start'), DATE('warranty_end', 'warranty end'),
  TEXT('contract_number', 'contract number'), DATE('contract_start', 'contract start'), DATE('contract_end', 'contract end'),
  TEXT('contract_type', 'contract type'),
  TEXT('person_calling', 'person calling'),
  TEXT('public_health_threat', 'public health threat'),
  TEXT('death'), TEXT('serious_incident', 'serious incident'),
  TEXT('mode_of_reporting', 'mode of reporting'),
  TEXT('customer_name', 'customer name'), TEXT('customer_number', 'customer number'),
  TEXT('customer_designation', 'customer designation'), TEXT('email_address', 'email address'),
  DATE('added_on', 'added on'), TS('reg_at', 'registration date time', 'reg at'),
];

const REPORT_COLS: Col[] = [
  { to: 'uid', from: ['uid', 'row id', 'unique id', 'key'], required: true },
  { to: 'ucn', from: ['ucn', 'uc number'], required: true },
  TEXT('call_number', 'call number'),
  TEXT('call_status', 'call status', 'status'),
  TEXT('pending_reason', 'pending reason'),
  TEXT('engineer', 'engineer name'), TEXT('engineer_email', 'engineer email'),
  TS('visit_at', 'visit date', 'date of visit'),
  TEXT('manual_report', 'manual report', 'attachment'),
];

export const UPLOADS: UploadDef[] = [
  // ---- calls. One table behind three registers; the call type is STAMPED
  // from the register you picked, so a PM sheet cannot land as a field call.
  { key: 'field_calls', label: 'Field Calls', group: 'Calls', table: 'calls',
    cols: CALL_COLS, stamp: { call_type: 'FIELD' }, conflict: 'ucn', extraInto: 'extra',
    note: 'Call type is stamped FIELD. The calls view routes each row to its own table.' },
  { key: 'installation_calls', label: 'Installation Calls', group: 'Calls', table: 'calls',
    cols: CALL_COLS, stamp: { call_type: 'INSTALLATION' }, conflict: 'ucn', extraInto: 'extra' },
  { key: 'pm_calls', label: 'PM Calls', group: 'Calls', table: 'calls',
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

  // ---- spares
  { key: 'spare_requests', label: 'Spare Request', group: 'Spares', table: 'spare_requests',
    conflict: 'uid', requires: 'Field Calls',
    cols: [
      { to: 'uid', from: ['uid', 'request uid', 'or no', 'unique id'], required: true },
      TEXT('or_no', 'or no', 'or number'), DATE('or_req_date', 'or req date', 'request date'),
      TEXT('req_type', 'req type', 'request type'),
      TEXT('engineer'), TEXT('engineer_email', 'engineer email'),
      TEXT('ucn'), TEXT('call_number', 'call number'),
      TEXT('party_name', 'party name'), TEXT('product_name', 'product name'), TEXT('serial', 'serial no'),
      TEXT('complaint'), TEXT('item_status', 'item status'),
      TEXT('handstock_reason', 'handstock reason'), TEXT('remarks'), TEXT('status'), TEXT('stage'),
      TS('created_at', 'raised on', 'created at'),
    ] },
  // The approvals are COLUMNS on the line, not registers of their own — so the
  // RM / Commercial / NSM sheets all load here, each filling in its own stage.
  { key: 'spare_request_lines', label: 'Spare Request Lines (+ RM / Commercial / NSM approval)', group: 'Spares',
    table: 'spare_request_lines', conflict: 'line_uid', requires: 'Spare Request',
    note: 'RM, Commercial and NSM approvals are columns on this row, not separate registers. Load the same file three times if the approvals arrived separately — each pass fills in its own stage.',
    cols: [
      { to: 'line_uid', from: ['line uid', 'line id', 'uid'], required: true },
      { to: 'request_uid', from: ['request uid', 'uid', 'or no'], required: true },
      { to: 'part', from: ['part', 'part no', 'spare'], required: true },
      NUM('qty', 'quantity', 'qty requested'),
      { to: 'row_no', from: ['row no', 'si number', 'sl no'], type: 'int' },
      TEXT('rm_approval', 'rm approval'), TEXT('rm_by', 'rm by'), TS('rm_at', 'rm date', 'rm at'),
      TEXT('commercial_approval', 'commercial approval'), TEXT('commercial_by', 'commercial by'), TS('commercial_at', 'commercial date'),
      TEXT('nsm_approval', 'nsm approval'), TEXT('nsm_by', 'nsm by'), TS('nsm_at', 'nsm date'),
      TEXT('stores_status', 'stores status'), TEXT('stage'), TEXT('status'),
      TEXT('reject_reason', 'reject reason'), TEXT('rejected_stage', 'rejected stage'),
      TEXT('dc_number', 'dc number'), TEXT('courier'), TS('dispatched_at', 'dispatched date'),
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
    requires: 'Field Calls', extraInto: 'data',
    note: 'This register has no natural key, so a re-run ADDS rows rather than correcting them. Load it once, and check the count before and after.',
    cols: [
      { to: 'part', from: ['part', 'part no', 'spare'], required: true },
      { to: 'qty', from: ['qty', 'quantity'], type: 'num', required: true },
      TEXT('ucn'), TEXT('call_number', 'call number'),
      TEXT('engineer'), TEXT('engineer_email', 'engineer email'),
      TEXT('remarks'), TEXT('recorded_by', 'recorded by'),
      TS('created_at', 'consumed on', 'date'),
    ] },
  { key: 'material_returns', label: 'MRN Register', group: 'Spares', table: 'material_returns',
    note: 'Also loadable from Data Import, which reads the sheet export as exported.',
    cols: [
      { to: 'part', from: ['part', 'part no', 'spare'], required: true },
      TEXT('mrn_no', 'mrn no'), DATE('mrn_date', 'mrn date'),
      TEXT('engineer'), TEXT('uid', 'reference'),
      NUM('good_qty', 'good'), NUM('defective_qty', 'defective'),
      TEXT('customer_name', 'customer'), TEXT('report_no', 'report no'),
      TEXT('removed_from_equipment', 'removed from equip'), TEXT('remarks'),
    ] },
  { key: 'stock_transfers', label: 'Stock Transfer Register', group: 'Spares', table: 'stock_transfers',
    conflict: 'uid',
    cols: [
      { to: 'uid', from: ['uid', 'stock transfer number', 'transfer no'], required: true },
      { to: 'from_engineer', from: ['from engineer', 'from'], required: true },
      { to: 'to_engineer', from: ['to engineer', 'to'], required: true },
      DATE('transfer_date', 'transfer date', 'date'), TEXT('remarks'), TEXT('status'),
    ] },
  { key: 'stock_transfer_lines', label: 'Stock Transfer Lines', group: 'Spares', table: 'stock_transfer_lines',
    requires: 'Stock Transfer Register',
    note: 'No natural key — a re-run ADDS rows rather than correcting them.',
    cols: [
      { to: 'transfer_uid', from: ['transfer uid', 'uid', 'stock transfer number'], required: true },
      { to: 'part', from: ['part', 'part no', 'spare'], required: true },
      { to: 'qty', from: ['qty', 'quantity'], type: 'num', required: true },
      { to: 'row_no', from: ['row no', 'si number'], type: 'int' },
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
    note: 'Review Status, Any Potential Effect and Action Taken are DERIVED — they are computed from the answers below and cannot be loaded.',
    cols: [
      { to: 'ucn', from: ['ucn'], required: true },
      TEXT('call_number', 'call number'),
      TEXT('risk_to_patient', 'risk to patient'),
      TEXT('warranty_failure', 'warranty failure'),
      TEXT('frequent_failure', 'frequent failure'),
      DATE('review2_at', 'review 2 date'), TEXT('review2_by', 'review 2 by'),
      TEXT('complaint_grouping', 'complaint grouping', 'dccr complaint grouping'),
      TEXT('root_cause_keyword', 'root cause key word', 'root cause keyword'),
      TEXT('spare_category', 'spare category'),
      TEXT('service_observation', 'service observation'),
      DATE('review3_at', 'review 3 date'), TEXT('review3_by', 'review 3 by'),
    ] },

  // ---- registers with their own screens
  { key: 'parties', label: 'Party Master', group: 'Masters', table: 'parties',
    cols: [{ to: 'party_name', from: ['party name', 'party', 'customer', 'name'], required: true },
           TEXT('city'), TEXT('state'), TEXT('address')] },
  { key: 'products', label: 'Product Master', group: 'Masters', table: 'products',
    cols: [{ to: 'serial_number', from: ['serial number', 'serial no', 'serial'], required: true },
           { to: 'item_name', from: ['item name', 'product name', 'product', 'model'], required: true },
           TEXT('party_name', 'party name', 'customer'),
           TEXT('item_status', 'item status'), TEXT('city'), TEXT('state')] },
  { key: 'parts', label: 'Part Master', group: 'Masters', table: 'parts',
    cols: [{ to: 'code', from: ['code', 'part no', 'part code'], required: true },
           { to: 'item_detail', from: ['item detail', 'description', 'part description'], required: true }] },

  // ---- ownership & recovered cover
  { key: 'ownership_transfers', label: 'Ownership Transfer', group: 'Cover', table: 'ownership_transfers',
    requires: 'Product Master',
    note: 'One row per hand-over. Leave "From Party" blank and it is filled in from who holds the machine now — which is what makes a historical list loadable in date order. The machine follows the LATEST transfer, so a back-dated row loaded afterwards does not undo a later one.',
    cols: [
      { to: 'serial_number', from: ['serial number', 'serial no', 'serial'], required: true },
      { to: 'to_party', from: ['to party', 'new party', 'transferred to'], required: true },
      TEXT('from_party', 'from party', 'old party', 'transferred from'),
      TEXT('item_name', 'item name', 'product name', 'product'),
      DATE('transfer_date', 'transfer date', 'date'),
      TEXT('reference_no', 'reference no', 'reference', 'document no'),
      TEXT('reason'), TEXT('remarks'), TEXT('document_url', 'document', 'document link'),
    ] },
  { key: 'product_additional_entries', label: 'Additional Entry Details (recovered warranty)', group: 'Cover',
    table: 'product_additional_entries', conflict: 'serial_number', requires: 'Product Master',
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
    cols: [{ to: 'sa_number', from: ['sa number', 'sa no'], required: true }], extraInto: 'extra' },
  { key: 'sale_items', label: 'Sale Details', group: 'Cover', table: 'sale_items', conflict: 'uid',
    requires: 'Sale Entry',
    cols: [{ to: 'uid', from: ['uid', 'row id'], required: true }], extraInto: 'extra' },
  { key: 'contract_entries', label: 'Contract Entry', group: 'Cover', table: 'contract_entries', conflict: 'mc_number',
    cols: [{ to: 'mc_number', from: ['mc number', 'mc no'], required: true }], extraInto: 'extra' },
  { key: 'contract_items', label: 'Contract Details', group: 'Cover', table: 'contract_items', conflict: 'uid',
    requires: 'Contract Entry',
    cols: [{ to: 'uid', from: ['uid', 'row id'], required: true }], extraInto: 'extra' },
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

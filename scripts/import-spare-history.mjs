#!/usr/bin/env node
// ===========================================================================
// Transform the 26_SpareRequest workbook into clean CSVs for the spare tables.
// ---------------------------------------------------------------------------
// Export these two sheets from 26_SpareRequest.xlsx as CSV first (File →
// Download → Comma-separated values), into ./migration-data/:
//
//   v2_OR_Req.csv      — one row per requested PART, with the approval chain,
//                        stores status and SO number. The richer sheet, and
//                        the one that drives the import.
//   v2_ORReq-All.csv    — one row per REQUEST. Only consulted for the three
//                        fields the part sheet lacks: UID, the HandStock
//                        reason, and Additional Remarks.
//
//   node scripts/import-spare-history.mjs
//
// Writes migration-data/spare_requests.csv and spare_request_lines.csv, then
// load them with:  node scripts/load-clean.mjs spare_requests
//
// Nothing is written to the database here, and the CSVs stay out of git
// (migration-data/*.csv is ignored) — they are customer data.
// ===========================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, '..', 'migration-data');

function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((v) => String(v).trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '').trim()])));
}
const read = (name) => {
  const f = join(DATA, name);
  if (!existsSync(f)) { console.error(`Missing ${f}`); process.exit(1); }
  return parseCSV(readFileSync(f, 'utf8'));
};

const csv = (rows, cols) => [
  cols.join(','),
  ...rows.map((r) => cols.map((c) => {
    const v = r[c] ?? '';
    return /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  }).join(',')),
].join('\n') + '\n';

// The sheet writes dates in a few shapes; keep the date, drop the rest.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function toDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);                       if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);                 if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[A-Za-z]*[- ](\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
const toTs = (v) => { const d = toDate(v); return d ? `${d}T00:00:00Z` : ''; };

// ---- the sheet's vocabulary → the app's ------------------------------------
// "Cleared for Stores Processing" is what the Commercial/NSM steps wrote when
// they passed a request on; it means Approved.
const approval = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return 'Pending';
  if (/^cleared/i.test(s)) return 'Approved';
  if (/reject/i.test(s)) return 'Rejected';
  if (/approv/i.test(s)) return 'Approved';
  return 'Pending';
};
const stores = (v) => {
  const s = String(v ?? '').trim();
  if (/dispatch/i.test(s)) return 'Dispatched';
  if (/drop/i.test(s)) return 'Dropped';
  return 'Pending';
};
const reqType = (v) => (/hand\s*stock/i.test(String(v ?? '')) ? 'HandStock' : 'Call Based');

// ---------------------------------------------------------------------------
const lines = read('v2_OR_Req.csv');
const all = read('v2_ORReq-All.csv');
const byOr = new Map(all.filter((r) => r['OR NO']).map((r) => [r['OR NO'].trim(), r]));

const requests = new Map();   // OR NO -> request row
const outLines = [];
const rowNo = new Map();      // OR NO -> next row number
let orphanOrs = new Set();

for (const l of lines) {
  const or = String(l['OR NO'] ?? '').trim();
  if (!or) continue;
  const head = byOr.get(or);
  if (!head) orphanOrs.add(or);

  if (!requests.has(or)) {
    // The part sheet carries every identifying field, so a request with no row
    // in the All sheet is still imported in full — only UID, the HandStock
    // reason and the remarks come from there, and those fall back sensibly.
    requests.set(or, {
      uid: (head?.UID || '').trim() || or,
      or_no: or,
      or_req_date: toDate(l['OR Date'] || head?.['OR Req Date']),
      req_type: reqType(l['Req Type'] || head?.['Req Type']),
      engineer: (l['ENGINEER NAME'] || head?.['ENGINEER NAME'] || '').trim(),
      engineer_email: (l['Engineer Email'] || head?.['Engineer Email'] || '').trim(),
      ucn: (l['UC Number'] || '').trim(),
      call_number: (l['CALL NUMBER'] || l['Call Number'] || '').trim(),
      party_name: (l['Party Name'] || '').trim(),
      product_name: (l['Product Name'] || '').trim(),
      serial: (l['Product Serial Number'] || '').trim(),
      complaint: (l['Complaint Reported'] || '').trim(),
      item_status: (l['Item Status'] || '').trim(),
      handstock_reason: (head?.['Reason for HANDSTOCK Request'] || '').trim(),
      remarks: (head?.['Additional Remarks'] || '').trim(),
      status: 'Imported',
      created_at: toTs(l['OR Date'] || head?.['OR Req Date']),
    });
  }

  const n = (rowNo.get(or) ?? 0) + 1;
  rowNo.set(or, n);
  const so = (l['SO NO'] || '').trim();
  outLines.push({
    request_uid: requests.get(or).uid,
    row_no: n,
    part: (l['Spare'] || '').trim(),
    qty: Number(l['Requested Qty'] || l['Qty'] || 1) || 1,
    rm_approval: approval(l['RMApproval']),
    rm_at: toTs(l['RMApproval Date']),
    commercial_approval: approval(l['ADMIN Approval']),
    commercial_at: toTs(l['ADMIN Approval Date']),
    nsm_approval: approval(l['NSM Approval']),
    nsm_at: toTs(l['NSM Approval Date']),
    stores_status: stores(l['Stores Status']),
    dc_number: so,
    dispatched_at: toTs(l['SO Date']),
    created_at: toTs(l['OR Date']),
  });
}

const REQ_COLS = ['uid','or_no','or_req_date','req_type','engineer','engineer_email','ucn','call_number',
                  'party_name','product_name','serial','complaint','item_status','handstock_reason','remarks','status','created_at'];
const LINE_COLS = ['request_uid','row_no','part','qty','rm_approval','rm_at','commercial_approval','commercial_at',
                   'nsm_approval','nsm_at','stores_status','dc_number','dispatched_at','created_at'];

writeFileSync(join(DATA, 'spare_requests.csv'), csv([...requests.values()], REQ_COLS));
writeFileSync(join(DATA, 'spare_request_lines.csv'), csv(outLines, LINE_COLS));

const tally = (rows, key) => rows.reduce((m, r) => (m[r[key]] = (m[r[key]] ?? 0) + 1, m), {});
console.log(`requests: ${requests.size}   lines: ${outLines.length}`);
console.log(`  of which had no row in v2_ORReq-All: ${orphanOrs.size} request(s), imported from the part sheet`);
console.log('  req_type      ', tally([...requests.values()], 'req_type'));
console.log('  rm_approval   ', tally(outLines, 'rm_approval'));
console.log('  stores_status ', tally(outLines, 'stores_status'));
console.log(`  lines with a DC (SO) number: ${outLines.filter((l) => l.dc_number).length}`);
console.log(`  requests with no date: ${[...requests.values()].filter((r) => !r.or_req_date).length}`);
console.log('\nWrote migration-data/spare_requests.csv and spare_request_lines.csv');
console.log('Load with:  node scripts/load-clean.mjs spare_requests');

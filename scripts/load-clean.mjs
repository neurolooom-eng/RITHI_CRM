#!/usr/bin/env node
// Load the CLEAN CSVs (built by build-migration-data.mjs) into Supabase.
// Columns already match the table schema; this coerces dates, dedupes UCNs,
// and inserts in batches with the service_role/secret key.
//   export SUPABASE_URL="https://xxxx.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."   # or service_role
//   node scripts/load-clean.mjs                 # all tables present
//   node scripts/load-clean.mjs masters parties # only these
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, '..', 'migration-data');
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!URL || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (secret key).'); process.exit(1); }
const db = createClient(URL, KEY, { auth: { persistSession: false } });

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
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '')])));
}
const read = (name) => { const f = join(DATA, name); return existsSync(f) ? parseCSV(readFileSync(f, 'utf8')) : null; };

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// Robust date -> YYYY-MM-DD; unparseable/empty -> null (never fails the row).
function toDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]+)[-/ ](\d{4})/); // 02-September-2023 / 2-Sep-2023
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
function toTs(v) { const d = toDate(v); return d ? d + 'T00:00:00Z' : null; }

async function insertBatched(table, rows, chunk = 1000) {
  if (!rows.length) { console.log(`  - ${table}: nothing`); return; }
  let done = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await db.from(table).insert(slice);
    if (error) { console.error(`\n  ✗ ${table} [${i}]: ${error.message}`); throw error; }
    done += slice.length; process.stdout.write(`  ${table}: ${done}/${rows.length}\r`);
  }
  console.log(`  ✓ ${table}: ${done} rows`);
}
const dedupe = (rows, key) => { const seen = new Set(); const out = []; for (const r of rows) { const k = String(r[key] ?? '').trim().toLowerCase(); if (!k || seen.has(k)) continue; seen.add(k); out.push(r); } return out; };

const CALL_DATES = ['reg_date', 'complaint_date', 'warranty_start', 'warranty_end', 'contract_start', 'contract_end', 'breakdown_date'];
const PROD_DATES = ['warranty_start', 'warranty_end', 'contract_start', 'contract_end'];

const LOADERS = {
  masters: async () => { const r = read('masters.csv'); if (r) await insertBatched('masters', r.map((x) => ({ name: x.name, value: x.value })).filter((x) => x.name && x.value)); },
  parties: async () => { const r = read('parties.csv'); if (r) await insertBatched('parties', r); },
  parts: async () => { const r = read('parts.csv'); if (r) await insertBatched('parts', r.map((x) => ({ ...x, active: String(x.active).toLowerCase() === 'true' }))); },
  products: async () => {
    const r = read('products.csv'); if (!r) return;
    await insertBatched('products', r.map((x) => { const o = { ...x }; for (const d of PROD_DATES) o[d] = toDate(o[d]); return o; }));
  },
  calls: async () => {
    let r = read('calls.csv'); if (!r) return;
    r = dedupe(r, 'ucn');
    await insertBatched('calls', r.map((x) => { const o = { ...x }; for (const d of CALL_DATES) o[d] = toDate(o[d]); return o; }));
  },
  reports: async () => {
    let r = read('reports.csv'); if (!r) return;
    r = dedupe(r, 'ucn'); // one report row per UCN (latest kept)
    await insertBatched('reports', r.map((x) => ({
      ucn: x.ucn, call_number: x.call_number, call_status: x.call_status, pending_reason: x.pending_reason,
      engineer: x.engineer, engineer_email: x.engineer_email, call_type: x.call_type, visit_at: toTs(x.visit_at),
      data: (() => { try { return JSON.parse(x.data); } catch { return {}; } })(),
    })));
  },
};

const only = process.argv.slice(2);
const order = ['masters', 'parties', 'products', 'parts', 'calls', 'reports'];
const run = only.length ? order.filter((k) => only.includes(k)) : order;
console.log(`Loading -> ${URL}`);
for (const k of run) { try { console.log(`• ${k}`); await LOADERS[k](); } catch (e) { console.error(`  aborted ${k}: ${e.message}`); } }
console.log('Done.');

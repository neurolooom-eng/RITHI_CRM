#!/usr/bin/env node
// ===========================================================================
// One-time data migration: Google Sheet CSV exports -> Supabase (Postgres).
// ---------------------------------------------------------------------------
// The live sheet reads time out, so this loads from CSV EXPORTS instead
// (Sheet: File -> Download -> Comma-separated values, one file per tab).
// It maps each CSV's headers to the table columns from 0001_init.sql and
// inserts in batches with the SERVICE_ROLE key (bypasses RLS for the load).
//
//   Usage:
//     export SUPABASE_URL="https://xxxx.supabase.co"
//     export SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."   # NOT the anon key; never commit
//     node scripts/migrate.mjs                 # migrate everything present
//     node scripts/migrate.mjs calls masters   # only the named datasets
//
// Put the CSVs in ./migration-data/ with these names (skip any you don't have):
//   parties.csv products.csv parts.csv masters.csv
//   field.csv installation.csv pm.csv          (the call registers)
//   pending.csv reporting.csv
//   spare_requests.csv consumption.csv feedback.csv
// See migration-data/README.md for the expected columns.
// ===========================================================================

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, '..', 'migration-data');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first.');
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

// ---- tiny CSV parser (handles quotes, commas, newlines) -------------------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => String(v).trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const readCSV = (name) => {
  const f = join(DATA, name);
  return existsSync(f) ? parseCSV(readFileSync(f, 'utf8')) : null;
};

// pick first non-empty of several possible header names
const pick = (r, ...keys) => { for (const k of keys) { const v = r[k]; if (v != null && String(v).trim() !== '') return String(v).trim(); } return ''; };
const toDate = (v) => { const s = String(v ?? '').trim(); if (!s) return null; const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };
const isActive = (v) => /^(active|yes|y|true|1)$/i.test(String(v ?? '').trim());

async function insertBatched(table, rows, chunk = 500) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await db.from(table).insert(slice);
    if (error) { console.error(`  ✗ ${table} [${i}..${i + slice.length}]: ${error.message}`); throw error; }
    process.stdout.write(`  ${table}: ${Math.min(i + chunk, rows.length)}/${rows.length}\r`);
  }
  console.log(`  ✓ ${table}: ${rows.length} rows`);
}

// ---- call register mapping (FIELD / INSTALLATION / PM share the shape) -----
const CALL_MAP = (r, callType) => ({
  ucn: pick(r, 'UC Number', 'UCN') || null,
  call_number: pick(r, 'Call Number'),
  reg_date: toDate(pick(r, 'Call Registeration Date', 'Call Registration Date')),
  complaint_date: toDate(pick(r, 'Complaint Date')),
  party_name: pick(r, 'Party Name'),
  city: pick(r, 'City'),
  state: pick(r, 'State'),
  product_name: pick(r, 'Product Name'),
  serial: pick(r, 'Product Serial Number', 'Serial No', 'SERIAL NO'),
  item_status: pick(r, 'Item Status'),
  warranty_number: pick(r, 'Warranty Number'),
  warranty_start: toDate(pick(r, 'Warranty Start Date')),
  warranty_end: toDate(pick(r, 'Warranty End Date')),
  contract_number: pick(r, 'Contract Number'),
  contract_start: toDate(pick(r, 'Contract Start Date')),
  contract_end: toDate(pick(r, 'Contract End Date')),
  contract_type: pick(r, 'Contract Type'),
  call_type: pick(r, 'Call Type') || callType,
  standard_complaint: pick(r, 'Standard Complaint'),
  complaint_reported: pick(r, 'Complaint Reported'),
  allocated_to: pick(r, 'Call Allocated To', 'Visiting Service Engineer'),
  breakdown_date: toDate(pick(r, 'Breakdown Date')),
  person_calling: pick(r, 'Person Calling'),
  public_health_threat: pick(r, 'Public Health Threat?'),
  death: pick(r, 'Death?'),
  serious_incident: pick(r, 'Serious Incident?'),
  mode_of_reporting: pick(r, 'Mode of Complaint Reporting'),
  customer_name: pick(r, 'Customer Name'),
  customer_number: pick(r, 'Customer Number'),
  customer_designation: pick(r, 'Customer Designation'),
  email_address: pick(r, 'Email address', 'E-Mail ID'),
});

// ---- per-dataset loaders ---------------------------------------------------
const LOADERS = {
  parties: async () => {
    const rows = readCSV('parties.csv'); if (!rows) return;
    await insertBatched('parties', rows.map((r) => ({
      party_name: pick(r, 'Party Name', 'PARTY NAME'), city: pick(r, 'City'), state: pick(r, 'State'),
      party_type: pick(r, 'Party Type', 'Type'), address: pick(r, 'Address'), extra: r,
    })).filter((r) => r.party_name));
  },
  products: async () => {
    const rows = readCSV('products.csv'); if (!rows) return;
    await insertBatched('products', rows.map((r) => ({
      party_name: pick(r, 'Party Name'), item_name: pick(r, 'Item Name', 'Product Name'),
      serial_number: pick(r, 'Item Serial Number', 'Product Serial Number', 'Serial No'),
      item_status: pick(r, 'Item Status'),
      warranty_number: pick(r, 'Warranty Number'), warranty_start: toDate(pick(r, 'Warranty Start Date')),
      warranty_end: toDate(pick(r, 'Warranty End Date')),
      contract_number: pick(r, 'Contract Number'), contract_start: toDate(pick(r, 'Contract Start Date')),
      contract_end: toDate(pick(r, 'Contract End Date')), contract_type: pick(r, 'Contract Type'),
      active: true, extra: r,
    })));
  },
  parts: async () => {
    const rows = readCSV('parts.csv'); if (!rows) return;
    await insertBatched('parts', rows.map((r) => ({
      code: pick(r, 'Item Code', 'Code'), description: pick(r, 'Item Description', 'Description'),
      item_detail: pick(r, 'Item Details', 'Item Detail'),
      active: isActive(pick(r, 'Active/Inactive?', 'Active', 'Status')), extra: r,
    })));
  },
  masters: async () => {
    // masters.csv: two columns  name,value  (one row per option)
    const rows = readCSV('masters.csv'); if (!rows) return;
    await insertBatched('masters', rows.map((r) => ({
      name: pick(r, 'name', 'Name', 'list'), value: pick(r, 'value', 'Value'),
    })).filter((r) => r.name && r.value));
  },
  field: async () => { const rows = readCSV('field.csv'); if (rows) await insertBatched('calls', rows.map((r) => CALL_MAP(r, 'FIELD'))); },
  installation: async () => { const rows = readCSV('installation.csv'); if (rows) await insertBatched('calls', rows.map((r) => CALL_MAP(r, 'INSTALLATION'))); },
  pm: async () => { const rows = readCSV('pm.csv'); if (rows) await insertBatched('calls', rows.map((r) => CALL_MAP(r, 'PM'))); },
  pending: async () => {
    const rows = readCSV('pending.csv'); if (!rows) return;
    await insertBatched('pending_registrations', rows.map((r) => ({
      engineer: pick(r, 'ENGINEER', 'Engineer'), call_type: pick(r, 'CALL TYPE', 'Call Type') || 'FIELD',
      party_name: pick(r, 'PARTY NAME', 'Party Name'), city: pick(r, 'City'), state: pick(r, 'State'),
      product: pick(r, 'PRODUCT', 'Product'), serial: pick(r, 'SERIAL NO', 'Serial'),
      reported_problem: pick(r, 'Reported Problem'), plan_date: toDate(pick(r, 'PLAN DATE (Visit Planned Date)', 'Plan Date')),
      ucn: pick(r, 'UC Number'), extra: r,
    })).filter((r) => !r.ucn)); // only those still pending
  },
  reporting: async () => {
    const rows = readCSV('reporting.csv'); if (!rows) return;
    await insertBatched('reports', rows.map((r) => ({
      ucn: pick(r, 'UC Number', 'UCN'), call_number: pick(r, 'Call Number'),
      call_status: pick(r, 'Call Status'), pending_reason: pick(r, 'Pending Reason'),
      engineer: pick(r, 'Visiting Service Engineer'), data: r,
    })).filter((r) => r.ucn));
  },
};

// ---- run -------------------------------------------------------------------
const only = process.argv.slice(2);
const order = ['parties', 'products', 'parts', 'masters', 'field', 'installation', 'pm', 'pending', 'reporting'];
const run = only.length ? order.filter((k) => only.includes(k)) : order;

console.log(`Migrating -> ${URL}`);
for (const key of run) {
  try { console.log(`• ${key}`); await LOADERS[key](); }
  catch (e) { console.error(`  aborted ${key}: ${e.message}`); }
}
console.log('Done.');

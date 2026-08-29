// ---------------------------------------------------------------------------
// One-time bulk CSV import into Supabase, run from the browser by an admin.
// The CSVs are the clean, schema-matched files produced by
// scripts/build-migration-data.mjs; columns already match the tables, so this
// only coerces dates, parses the reports `data` JSON, dedupes UCNs, and inserts
// in batches through the signed-in admin session (RLS permits it).
// ---------------------------------------------------------------------------
import { getSupabase } from './supabase';

export type ImportTable = 'masters' | 'parties' | 'products' | 'parts' | 'calls' | 'reports';

// Minimal CSV parser (quotes, commas, newlines).
export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
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
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

// Detect which table a clean CSV targets, from its header columns.
export function detectTable(headers: string[]): ImportTable | null {
  const H = new Set(headers.map((h) => h.trim()));
  if (H.has('name') && H.has('value')) return 'masters';
  if (H.has('ucn') && H.has('data')) return 'reports';
  if (H.has('ucn') && H.has('call_type')) return 'calls';
  if (H.has('serial_number') && H.has('item_name')) return 'products';
  if (H.has('item_detail') && H.has('code')) return 'parts';
  if (H.has('party_name')) return 'parties';
  return null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function toDate(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]+)[-/ ](\d{4})/);
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
const toTs = (v: unknown) => { const d = toDate(v); return d ? d + 'T00:00:00Z' : null; };

const CALL_DATES = ['reg_date', 'complaint_date', 'warranty_start', 'warranty_end', 'contract_start', 'contract_end', 'breakdown_date'];
const PROD_DATES = ['warranty_start', 'warranty_end', 'contract_start', 'contract_end'];

function dedupe(rows: Record<string, unknown>[], key: string): Record<string, unknown>[] {
  const seen = new Set<string>(); const out: Record<string, unknown>[] = [];
  for (const r of rows) { const k = String(r[key] ?? '').trim().toLowerCase(); if (!k || seen.has(k)) continue; seen.add(k); out.push(r); }
  return out;
}

// Shape raw CSV rows into insert-ready records for a given table.
export function shapeRows(table: ImportTable, raw: Record<string, string>[]): Record<string, unknown>[] {
  switch (table) {
    case 'masters': return raw.map((r) => ({ name: r.name, value: r.value })).filter((r) => r.name && r.value);
    case 'parties': return raw.filter((r) => r.party_name);
    case 'parts': return raw.map((r) => ({ ...r, active: String(r.active).toLowerCase() === 'true' }));
    case 'products': return raw.map((r) => { const o: Record<string, unknown> = { ...r }; for (const d of PROD_DATES) o[d] = toDate(r[d]); return o; });
    case 'calls': return dedupe(raw.map((r) => { const o: Record<string, unknown> = { ...r }; for (const d of CALL_DATES) o[d] = toDate(r[d]); return o; }), 'ucn');
    // Note: the reports table has no call_type column (it lives inside `data`).
    case 'reports': return dedupe(raw.map((r) => ({
      ucn: r.ucn, call_number: r.call_number, call_status: r.call_status, pending_reason: r.pending_reason,
      engineer: r.engineer, engineer_email: r.engineer_email, visit_at: toTs(r.visit_at),
      data: (() => { try { return JSON.parse(r.data); } catch { return {}; } })(),
    })), 'ucn');
  }
}

export interface ImportProgress { done: number; total: number }
// Insert shaped rows in batches through the admin session. Reports carry a large
// jsonb payload, so they use a smaller batch.
export async function bulkInsert(
  table: ImportTable, rows: Record<string, unknown>[], onProgress?: (p: ImportProgress) => void,
): Promise<{ ok: boolean; inserted: number; error?: string }> {
  const c = getSupabase();
  if (!c) return { ok: false, inserted: 0, error: 'Not connected to Supabase.' };
  const chunk = table === 'reports' ? 300 : 1000;
  let done = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await c.from(table).insert(slice);
    if (error) return { ok: false, inserted: done, error: `${error.message} (row ~${i})` };
    done += slice.length; onProgress?.({ done, total: rows.length });
  }
  return { ok: true, inserted: done };
}

// Count existing rows so the admin can see what's already loaded / avoid dupes.
export async function tableCount(table: ImportTable): Promise<number | null> {
  const c = getSupabase(); if (!c) return null;
  const { count, error } = await c.from(table).select('*', { count: 'exact', head: true });
  return error ? null : (count ?? 0);
}

// ---------------------------------------------------------------------------
// One-time bulk CSV import into Supabase, run from the browser by an admin.
// The CSVs are the clean, schema-matched files produced by
// scripts/build-migration-data.mjs; columns already match the tables, so this
// only coerces dates, parses the reports `data` JSON, dedupes UCNs, and inserts
// in batches through the signed-in admin session (RLS permits it).
// ---------------------------------------------------------------------------
import { getSupabase } from './supabase';
import { allRows } from './paging';
import { mrnKey, type DirectoryPlan, type DirectoryRow, type UnpinCount } from './legacyImportPlan';
import { detectCoverTable, shapeCoverRows, type CoverTable } from './coverImport';

// Only what Bulk Uploads does not do: the four AppSheet cover exports (which
// need the Normalise step after them), the User Master directory, and the MRN
// sheet's two-tab flattening. Everything else — masters, parties, parts,
// products, calls, reports, call requests — is a register in Bulk Uploads,
// where the target is CHOSEN rather than guessed from the headers. Two
// importers for the same table was how a good file came back as "0 rows".
export type ImportTable = 'user_directory' | 'material_returns' | CoverTable;

export { parseCSV } from './csv';

// Detect which table a clean CSV targets, from its header columns.
export function detectTable(headers: string[]): ImportTable | null {
  const H = new Set(headers.map((h) => h.trim()));
  // The four AppSheet sale / contract exports, imported as exported.
  const cover = detectCoverTable(headers);
  if (cover) return cover;
  if (H.has('name') && H.has('reporting_manager')) return 'user_directory';
  // Raw User Master export (sheet headers, not the clean file).
  if (H.has('User Name') && (H.has('RM') || H.has('Email ID'))) return 'user_directory';
  // Raw MRN export. The sheet kept it in two tabs — a form-data tab (one row
  // per submission) and a register tab (one row per item, repeating the
  // header). Either is accepted and flattened to one row per returned item;
  // the register is the fuller of the two.
  if (H.has('SI Number') && H.has('MRN No')) return 'material_returns';
  if (H.has('Stock Transfer Number') && H.has('MRN No')) return 'material_returns';
  return null;
}

import { toIsoDate, toIsoTimestamp } from './dates';
export const toDate = toIsoDate;
// A DATE written as a midnight UTC instant — what the MRN shaper has always
// stored for returned_at. Date-only, so the timezone question (see
// toIsoTimestamp) does not arise here: there is no time of day to shift.
const toTs = (v: unknown) => { const d = toIsoDate(v); return d ? d + 'T00:00:00Z' : null; };

const DIR_ALIASES: Record<string, string> = {
  name: 'name', 'user name': 'name', username: 'name', 'engineer name': 'name',
  email: 'email', 'email id': 'email', 'email-id': 'email',
  gmail: 'gmail', 'gmail id': 'gmail',
  designation: 'designation',
  reporting_manager: 'reporting_manager', rm: 'reporting_manager', 'reporting manager': 'reporting_manager',
  regional_manager: 'regional_manager', rgm: 'regional_manager', 'regional manager': 'regional_manager',
  region: 'region',
  validity: 'validity', active: 'validity',
  address: 'address', 'address line': 'address',
  city: 'city', state: 'state',
  phone: 'phone', 'contact no': 'phone', contact: 'phone', 'contact number': 'phone', mobile: 'phone',
};
/** The User Master columns the FILE has a heading for (D-071): a person the
 *  User Master already lists takes the file's value for these and keeps every
 *  other column -- an absent heading is not a blank. */
export function directoryColumns(headers: string[]): string[] {
  const out = new Set<string>();
  headers.forEach((h) => { const c = DIR_ALIASES[h.trim().toLowerCase().replace(/\s+/g, ' ')]; if (c) out.add(c); });
  return [...out];
}
function shapeDirectoryRow(r: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: '', email: '', gmail: '', designation: '', reporting_manager: '', regional_manager: '', region: '',
    address: '', city: '', state: '', phone: '',
  };
  const extra: Record<string, string> = {};
  let validity = 'true';
  for (const [k, v] of Object.entries(r)) {
    const col = DIR_ALIASES[k.trim().toLowerCase().replace(/\s+/g, ' ')];
    if (col === 'validity') validity = String(v ?? '');
    else if (col) out[col] = String(v ?? '').trim();
    else if (String(v ?? '').trim() !== '') extra[k.trim()] = String(v).trim();
  }
  out.validity = !/^(false|no|0|inactive)$/i.test(validity.trim() || 'true');
  out.extra = extra;
  return out;
}

// The historical Call Registration Request sheet, imported as exported. Its
// UNIQUE ID is already REQID-Product-SerialNo, so it lines up with what the app
// generates; a request that was registered carries its UCN, one that never was
// stays Pending and shows up in Pending Registrations. Columns the table has no
// home for are kept in `extra` rather than dropped.
const naBlank = (v: unknown) => { const s = String(v ?? '').trim(); return s.toUpperCase() === 'NA' ? '' : s; };
function shapeMrnRow(r: Record<string, string>): Record<string, unknown> {
  const code = naBlank(r['Item Code']);
  const name = naBlank(r['Item Name']);
  const good = Number(String(r['Good Qty'] ?? '').trim() || 0) || 0;
  const bad = Number(String(r['Defective Qty'] ?? '').trim() || 0) || 0;
  return {
    uid: String(r['SI Number'] ?? r['Stock Transfer Number'] ?? '').trim(),
    mrn_no: naBlank(r['MRN No']),
    mrn_date: toDate(r['MRN Date']),
    engineer: String(r['ENGINEER NAME'] ?? '').trim(),
    engineer_email: String(r['User Email'] ?? '').trim(),
    part: code ? `${code}|${name}` : '',
    item_code: code,
    item_name: name,
    // A row with neither quantity is still a returned item on the sheet; the
    // table's check constraint needs at least one, so an empty pair counts as
    // one good part, which is what the register means by a bare line.
    good_qty: good + bad > 0 ? good : 1,
    defective_qty: bad,
    customer_name: naBlank(r['Customer Name']),
    report_no: naBlank(r['Report No']),
    removed_from_equipment: naBlank(r['Removed from Equip']),
    handstock_note: naBlank(r['HandStock']),
    returned_at: toIsoTimestamp(r['Timestamp'], 'local') ?? toIsoTimestamp(r['MRN Date'], 'local'),
    source: 'import',
  };
}
// The unique index is (uid, part code, row no); number the lines within each
// submission and drop the sheet's exact duplicates.
function dedupeMrn(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const perUid = new Map<string, number>();
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const uid = String(r.uid ?? '');
    const code = String(r.item_code ?? '');
    const key = `${uid}|${code}`;
    if (seen.has(key)) continue;          // same spare twice on one MRN
    seen.add(key);
    const n = (perUid.get(uid) ?? 0) + 1;
    perUid.set(uid, n);
    out.push({ ...r, row_no: n });
  }
  return out;
}

// Shape raw CSV rows into insert-ready records for a given table.
export function shapeRows(table: ImportTable, raw: Record<string, string>[]): Record<string, unknown>[] {
  switch (table) {
    case 'sale_entries': case 'sale_items': case 'contract_entries': case 'contract_items':
      return shapeCoverRows(table, raw);
    // D-071: a row with no SI Number could never be matched on a re-run, so it
    // is not loaded (the trigger would give it a NEW MRN number every time).
    case 'material_returns': return dedupeMrn(raw.map(shapeMrnRow).filter((r) => r.part && r.uid));
    case 'user_directory': return raw.map(shapeDirectoryRow).filter((r) => r.name);
  }
}

export interface ImportProgress { done: number; total: number }

// The sale / contract tables have a natural key, so their files are UPSERTED:
// an import that stopped half way (a timeout, a dropped connection) can simply
// be run again instead of colliding with the rows that did land.
const CONFLICT_KEY: Partial<Record<ImportTable, string>> = {
  sale_entries: 'sa_number', sale_items: 'uid',
  contract_entries: 'mc_number', contract_items: 'uid',
  // D-071 (0439, the user's decision 2026-10-12: "Overwrite with the file"):
  // SI Number + part code + line, so a re-loaded MRN line takes the file's
  // values instead of returning the stock a second time.
  material_returns: 'uid,part_key,row_no',
};

// Rows per request. Every sale / contract item syncs the machine it names, so
// those batches are kept small enough to finish inside the server's statement
// timeout; reports carry a large jsonb payload.
const BATCH: Partial<Record<ImportTable, number>> = {
  sale_items: 400, contract_items: 400, sale_entries: 500, contract_entries: 500,
};

// Insert (or upsert) shaped rows in batches through the admin session.
export async function bulkInsert(
  table: ImportTable, rows: Record<string, unknown>[], onProgress?: (p: ImportProgress) => void,
): Promise<{ ok: boolean; inserted: number; error?: string }> {
  const c = getSupabase();
  if (!c) return { ok: false, inserted: 0, error: 'Not connected to Supabase.' };
  const chunk = BATCH[table] ?? 1000;
  const onConflict = CONFLICT_KEY[table];
  let done = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = onConflict
      ? await c.from(table).upsert(slice, { onConflict })
      : await c.from(table).insert(slice);
    if (error) {
      const hint = /timeout/i.test(error.message)
        ? ' — the database cancelled the batch. Apply supabase/apply/sales_contracts.sql (it adds the index this import needs), then run the import again; already-loaded rows are updated, not duplicated.'
        : '';
      return { ok: false, inserted: done, error: `${error.message} (row ~${i})${hint}` };
    }
    done += slice.length; onProgress?.({ done, total: rows.length });
  }
  return { ok: true, inserted: done };
}

// Count existing rows so the admin can see what's already loaded / avoid dupes.
export async function tableCount(table: ImportTable): Promise<{ count: number | null; error?: string }> {
  const c = getSupabase(); if (!c) return { count: null, error: 'Not connected to Supabase.' };
  const { count, error } = await c.from(table).select('*', { count: 'exact', head: true });
  return error ? { count: null, error: error.message } : { count: count ?? 0 };
}

// ---- D-071: what is already there, read BEFORE anything is written ---------

const chunks = <T,>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

/** The keys of `rows` the register already holds, as the upsert will match
 *  them. Counted among what the reader may see -- an administrator sees all. */
export async function existingKeys(table: ImportTable, rows: Record<string, unknown>[]): Promise<{ keys: Set<string>; key: (r: Record<string, unknown>) => string }> {
  const c = getSupabase(); if (!c) throw new Error('Not connected to Supabase.');
  if (table === 'material_returns') {
    const uids = [...new Set(rows.map((r) => String(r.uid ?? '').trim()).filter(Boolean))];
    const keys = new Set<string>();
    for (const part of chunks(uids, 100)) {
      const got = await allRows<Record<string, unknown>>((from, to) => c.from('material_returns')
        .select('id,uid,part,row_no').in('uid', part).order('id').range(from, to));
      got.forEach((r) => keys.add(mrnKey(r)));
    }
    return { keys, key: mrnKey };
  }
  const col = CONFLICT_KEY[table];
  if (!col || col.includes(',')) return { keys: new Set(), key: () => '' };
  const key = (r: Record<string, unknown>) => String(r[col] ?? '').trim();
  const vals = [...new Set(rows.map(key).filter(Boolean))];
  const keys = new Set<string>();
  for (const part of chunks(vals, 200)) {
    const { data, error } = await c.from(table).select(col).in(col, part);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r) => keys.add(key(r as unknown as Record<string, unknown>)));
  }
  return { keys, key };
}

/** Everybody on the User Master, by id, name and extra. */
export async function readDirectory(): Promise<DirectoryRow[]> {
  const c = getSupabase(); if (!c) throw new Error('Not connected to Supabase.');
  return allRows<DirectoryRow>((from, to) => c.from('user_directory')
    .select('id,name,extra').order('id').range(from, to));
}

/** Write a User Master plan: new people inserted, people already listed
 *  updated by id. An update row-level security refuses matches nothing and
 *  reports no error, so each one asks for the row it changed and STOPS,
 *  naming the person, when none came back (finding 48). */
export async function applyDirectory(
  plan: DirectoryPlan, onProgress?: (p: ImportProgress) => void,
): Promise<{ ok: boolean; inserted: number; updated: number; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, inserted: 0, updated: 0, error: 'Not connected to Supabase.' };
  const total = plan.inserts.length + plan.updates.length;
  let inserted = 0; let updated = 0;
  for (const part of chunks(plan.inserts, 500)) {
    const { error } = await c.from('user_directory').insert(part);
    if (error) return { ok: false, inserted, updated, error: `${error.message} (adding new people; ${inserted} added before it stopped)` };
    inserted += part.length; onProgress?.({ done: inserted, total });
  }
  for (const u of plan.updates) {
    if (!Object.keys(u.patch).length) { updated++; continue; }
    const { data, error } = await c.from('user_directory').update(u.patch).eq('id', u.id).select('id');
    if (error) return { ok: false, inserted, updated, error: `${error.message} (overwriting ${u.name})` };
    if (!data || !data.length) return { ok: false, inserted, updated, error: `${u.name} was not overwritten — your role may not change that person on the User Master. ${updated} overwritten before it stopped.` };
    updated++; onProgress?.({ done: inserted + updated, total });
  }
  return { ok: true, inserted, updated };
}

/** What Normalise cover would hand back, per register and field (0440). */
export async function previewNormalise(): Promise<UnpinCount[]> {
  const c = getSupabase(); if (!c) throw new Error('Not connected to Supabase.');
  const { data, error } = await c.rpc('cover_unpin_preview');
  if (error) throw new Error(error.message);
  return ((data ?? []) as UnpinCount[]).map((r) => ({ register: r.register, field: r.field, n: Number(r.n) }));
}

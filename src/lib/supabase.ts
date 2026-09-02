// ---------------------------------------------------------------------------
// Supabase data layer (full cutover from Google Sheets).
// The Postgres schema lives in supabase/migrations/0001_init.sql. This module
// owns the client, the connection config (URL + anon key, set in Settings or at
// build time), and a data API whose function shapes mirror the old sheets.ts so
// the UI modules switch over mechanically.
//
// Security: the anon key is PUBLIC by design — access is enforced by Row-Level
// Security in Postgres, not by hiding the key. Never ship the service_role key
// to the client.
// ---------------------------------------------------------------------------

import { machineKey } from './machine';
export { machineKey } from './machine';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL_KEY = 'rithi.supabase.url';
const KEY_KEY = 'rithi.supabase.anon';

// Baked defaults so every device is connected out-of-the-box. The publishable
// key is safe to ship publicly — access is enforced by Row-Level Security.
const DEFAULT_SUPABASE_URL = 'https://issxxmgsffszqbxugqis.supabase.co';
const DEFAULT_SUPABASE_ANON = 'sb_publishable_E9UsR_cIVIyP26h4B9pXOw_Dhprs63w';

// Optional build-time overrides (Vite env). Settings values take precedence.
const ENV_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const ENV_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

// The client wants the BASE project URL, not the REST endpoint. Strip a
// trailing /rest/v1 (and any trailing slashes) so a pasted REST URL still works.
function normUrl(u: string): string {
  return (u || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
}
export function getSupabaseCreds(): { url: string; anon: string } {
  try {
    return {
      url: normUrl(localStorage.getItem(URL_KEY) || ENV_URL || DEFAULT_SUPABASE_URL),
      anon: (localStorage.getItem(KEY_KEY) || ENV_ANON || DEFAULT_SUPABASE_ANON).trim(),
    };
  } catch {
    return { url: normUrl(ENV_URL || DEFAULT_SUPABASE_URL), anon: ENV_ANON || DEFAULT_SUPABASE_ANON };
  }
}

export function setSupabaseCreds(url: string, anon: string): void {
  try {
    localStorage.setItem(URL_KEY, url.trim());
    localStorage.setItem(KEY_KEY, anon.trim());
  } catch { /* ignore */ }
  _client = null; // force re-create with the new creds
}

export function supabaseConfigured(): boolean {
  const { url, anon } = getSupabaseCreds();
  return /^https:\/\/.+\.supabase\.co/.test(url) && anon.length > 20;
}

// Postgres rejects a write blocked by Row-Level Security with a terse
// "new row violates row-level security policy" (code 42501), and the RBAC
// triggers raise "RBAC: <reason>". Turn both into something a user can read.
export function errMsg(e: { message?: string; code?: string } | null | undefined): string {
  const m = String(e?.message ?? 'Unknown error');
  if (m.startsWith('RBAC: ')) return m.slice(6).replace(/^./, (c) => c.toUpperCase()) + '.';
  if (e?.code === '42501' || /row-level security/i.test(m))
    return 'Your role does not have permission for this action.';
  return m;
}

let _client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;
  const { url, anon } = getSupabaseCreds();
  if (!supabaseConfigured()) return null;
  _client = createClient(url, anon, {
    // Recovery links are handled by takeRecoveryFromUrl() below (the app uses a
    // HashRouter, which would otherwise swallow the token fragment), so the
    // client is told not to race us for it.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return _client;
}

function must(): SupabaseClient {
  const c = getSupabase();
  if (!c) throw new Error('Supabase is not configured (Settings → Database connection).');
  return c;
}

// ---- column mapping: app key <-> db column ---------------------------------
// Keeps the UI's record shape (app keys) unchanged while the DB uses snake_case.
const CALL_COLS: Record<string, string> = {
  ucn: 'ucn', callNumber: 'call_number', regDate: 'reg_date', complaintDate: 'complaint_date',
  partyName: 'party_name', city: 'city', state: 'state', productName: 'product_name', serial: 'serial',
  itemStatus: 'item_status', warrantyNumber: 'warranty_number', warrantyStart: 'warranty_start',
  warrantyEnd: 'warranty_end', contractNumber: 'contract_number', contractStart: 'contract_start',
  contractEnd: 'contract_end', contractType: 'contract_type', callType: 'call_type',
  standardComplaint: 'standard_complaint', complaintReported: 'complaint_reported', allocatedTo: 'allocated_to',
  breakdownDate: 'breakdown_date', personCalling: 'person_calling', publicHealthThreat: 'public_health_threat',
  death: 'death', seriousIncident: 'serious_incident', modeOfReporting: 'mode_of_reporting',
  customerName: 'customer_name', customerNumber: 'customer_number', customerDesignation: 'customer_designation',
  emailAddress: 'email_address', status: 'status', addedOn: 'added_on', regAt: 'reg_at',
};
const DATE_KEYS = new Set(['regDate', 'complaintDate', 'warrantyStart', 'warrantyEnd', 'contractStart', 'contractEnd', 'breakdownDate', 'addedOn']);
const CALL_COLS_INV: Record<string, string> = Object.fromEntries(Object.entries(CALL_COLS).map(([k, v]) => [v, k]));

function dbToCall(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [col, val] of Object.entries(row)) {
    const key = CALL_COLS_INV[col];
    if (key) out[key] = val ?? '';
  }
  out._id = row.id;
  // Denormalised call state (0014) — rides along with every call the register
  // already loads, so no second query is needed to colour the list.
  // A re-opened call is open again whatever its last visit said (0057).
  out.callState = row.reopened_at ? 'Reopened' : row.open_state ?? '';
  out.lastStatus = row.last_status ?? '';
  out.reopenedAt = row.reopened_at ?? '';
  out.reopenCount = Number(row.reopen_count ?? 0);
  out.lastVisitAt = row.last_visit_at ?? '';
  return out;
}
function callToDb(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(CALL_COLS)) {
    const v = rec[key];
    if (v === undefined || v === '') continue;
    out[col] = DATE_KEYS.has(key) ? isoDate(v) : v;
  }
  return out;
}
// Coerce assorted date strings to YYYY-MM-DD (Postgres date); '' / unparseable -> null.
const _MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function isoDate(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]+)[-/ ](\d{4})/); // 28-August-2026 / 2-Sep-2026
  if (m) { const mo = _MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Map a snake_case products row to the sheet-header shape the call forms expect
// (productToCallPrefill reads these keys).
export function productRowToSheet(r: Record<string, unknown>): Record<string, unknown> {
  const ex = (r.extra as Record<string, unknown>) ?? {};
  const g = (k: string) => r[k] ?? '';
  return {
    'Party Name': g('party_name'), 'City': ex['City'] ?? '', 'State': ex['State'] ?? '',
    'Item Name': g('item_name'), 'Item Serial Number': g('serial_number'), 'Item Status': g('item_status'),
    'Warranty Number': g('warranty_number'), 'Warranty Start Date': g('warranty_start'), 'Warranty End Date': g('warranty_end'),
    'Contract Number': g('contract_number'), 'Contract Start Date': g('contract_start'), 'Contract End Date': g('contract_end'),
    'Contract Type': g('contract_type'), 'Service Engineer': ex['Service Engineer'] ?? '',
  };
}

// ---- calls ----------------------------------------------------------------
// Supabase caps a single response at ~1000 rows, so page through with range()
// until the register is fully loaded (or `limit` reached).
export async function listCalls(callType = '', limit = 20000): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const out: Record<string, unknown>[] = [];
  for (let from = 0; from < limit; from += PAGE) {
    // Read the type's own table (isolated); the union view only for "all".
    const q = must().from(callTable(callType)).select('*').order('id', { ascending: false }).range(from, Math.min(from + PAGE, limit) - 1);
    const { data, error } = await q;
    if (error) throw new Error(errMsg(error));
    const rows = data ?? [];
    out.push(...rows.map(dbToCall));
    if (rows.length < PAGE) break;
  }
  return out;
}

// Server-side register search. Field-specific terms AND together (each an
// ilike on its column); the global term ORs across the common columns. RLS
// already scopes the result to what the user may see.
export interface CallSearch { q?: string; ucn?: string; serial?: string; partyName?: string; productName?: string }
const _san = (t: string) => t.replace(/[%,()]/g, ' ').trim();
export async function searchCalls(callType: string, terms: CallSearch, limit = 1000): Promise<Record<string, unknown>[]> {
  let q = must().from(callTable(callType)).select('*').order('id', { ascending: false }).limit(limit);
  if (terms.ucn) q = q.ilike('ucn', `%${_san(terms.ucn)}%`);
  if (terms.serial) q = q.ilike('serial', `%${_san(terms.serial)}%`);
  if (terms.partyName) q = q.ilike('party_name', `%${_san(terms.partyName)}%`);
  if (terms.productName) q = q.ilike('product_name', `%${_san(terms.productName)}%`);
  const g = _san(terms.q ?? '');
  if (g) q = q.or(['ucn', 'call_number', 'party_name', 'serial', 'product_name', 'allocated_to', 'city', 'state', 'standard_complaint', 'complaint_reported', 'customer_name'].map((c) => `${c}.ilike.%${g}%`).join(','));
  const { data, error } = await q;
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map(dbToCall);
}

// Latest registration date-time already recorded for PM calls in a due month
// (YYYY-MM). The bulk uploader continues a few seconds after this when adding
// to a month that already has calls; null means the month is empty. Uses the
// pm_calls (reg_date, reg_at desc) index.
export async function pmLatestRegAt(month: string): Promise<string | null> {
  const start = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const { data, error } = await must()
    .from('pm_calls').select('reg_at')
    .gte('reg_date', start).lt('reg_date', next)
    .not('reg_at', 'is', null)
    .order('reg_at', { ascending: false }).limit(1);
  if (error) throw new Error(errMsg(error));
  const v = data?.[0]?.reg_at;
  return v ? String(v) : null;
}

export interface AddResult { ok: boolean; ucn?: string; record?: Record<string, unknown>; error?: string }
export async function addCall(rec: Record<string, unknown>): Promise<AddResult> {
  const c = must();
  const payload = callToDb(rec);
  delete payload.ucn; // server assigns via trigger
  // Insert without .single(): a genuine failure sets `error`; an RLS-hidden
  // returning just yields an empty array (the row was still inserted).
  const { data, error } = await c.from('calls').insert(payload).select('*');
  if (error) return { ok: false, error: error.message };
  const row = data?.[0];
  if (row) return { ok: true, ucn: String(row.ucn ?? ''), record: dbToCall(row) };
  // Returning hidden by RLS — read back the row we just created.
  try {
    const { data: u } = await c.auth.getUser();
    const uid = u.user?.id;
    if (uid) {
      const { data: back } = await c.from('calls').select('*').eq('created_by', uid).order('id', { ascending: false }).limit(1);
      const r2 = back?.[0];
      if (r2) return { ok: true, ucn: String(r2.ucn ?? ''), record: dbToCall(r2) };
    }
  } catch { /* fall through */ }
  return { ok: true, ucn: '', record: dbToCall({ ...payload }) };
}

export async function updateCall(ucn: string, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('calls').update(callToDb(patch)).eq('ucn', ucn);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---- Product Master (cascade + search) -------------------------------------
// Page through a single column past PostgREST's 1000-row response cap and return
// the distinct, sorted values. Used for the party / product / spare pick-lists,
// which have thousands of rows.
async function distinctColumn(table: string, column: string, opts?: { eq?: [string, unknown]; max?: number }): Promise<string[]> {
  const c = must();
  const set = new Set<string>();
  const PAGE = 1000; const max = opts?.max ?? 40000;
  for (let from = 0; from < max; from += PAGE) {
    let q = c.from(table).select(column).range(from, from + PAGE - 1);
    if (opts?.eq) q = q.eq(opts.eq[0], opts.eq[1] as never);
    const { data, error } = await q;
    if (error) break;
    const rows = data ?? [];
    rows.forEach((r) => { const v = String((r as unknown as Record<string, unknown>)[column] ?? '').trim(); if (v) set.add(v); });
    if (rows.length < PAGE) break;
  }
  return [...set].sort();
}
export async function sbListParties(): Promise<string[]> {
  return distinctColumn('parties', 'party_name');
}
// Party Master view — field-specific server-side filters + paging (Load more).
export interface PartyFilter { name?: string; city?: string; state?: string; type?: string }
export async function queryParties(filter: PartyFilter, offset = 0, limit = 1000): Promise<Record<string, unknown>[]> {
  let q = must().from('parties').select('*').order('party_name').range(offset, offset + limit - 1);
  if (filter.name) q = q.ilike('party_name', `%${_san(filter.name)}%`);
  if (filter.city) q = q.ilike('city', `%${_san(filter.city)}%`);
  if (filter.state) q = q.ilike('state', `%${_san(filter.state)}%`);
  if (filter.type) q = q.ilike('party_type', `%${_san(filter.type)}%`);
  const { data, error } = await q;
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}
export async function sbListPartyProducts(party: string): Promise<string[]> {
  const { data, error } = await must().from('products').select('item_name').eq('party_name', party).limit(5000);
  if (error) throw new Error(errMsg(error));
  return [...new Set((data ?? []).map((r) => String(r.item_name)).filter(Boolean))];
}
export async function sbListPartyItems(party: string, product = ''): Promise<Record<string, unknown>[]> {
  let q = must().from('products').select('*').eq('party_name', party).limit(2000);
  if (product) q = q.eq('item_name', product);
  const { data, error } = await q;
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map(productRowToSheet);
}
export async function sbSearchProducts(filters: { q?: string; party?: string; product?: string; serial?: string }, limit = 100, offset = 0): Promise<Record<string, unknown>[]> {
  let q = must().from('products').select('*').range(offset, offset + limit - 1);
  if (filters.serial) q = q.ilike('serial_number', `%${filters.serial}%`);
  if (filters.party) q = q.ilike('party_name', `%${filters.party}%`);
  if (filters.product) q = q.ilike('item_name', `%${filters.product}%`);
  if (filters.q) q = q.or(`serial_number.ilike.%${filters.q}%,item_name.ilike.%${filters.q}%,party_name.ilike.%${filters.q}%`);
  const { data, error } = await q;
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map(productRowToSheet);
}

// Map a sheet tab name to a call_type value in the calls table.
export function callTypeForTab(tab: string): string {
  const t = (tab || '').toUpperCase();
  if (t === 'INST' || t.startsWith('INSTALL')) return 'INSTALLATION CALL';
  if (t === 'PM' || t.startsWith('P M') || t.startsWith('PM')) return 'P M VISIT';
  if (t === 'FIELD') return 'FIELD';
  return tab; // already a call_type, or empty (= all)
}

// The physical table a call_type reads from (mirrors the DB's call_table_for()
// after the 0040 split). A specific type reads its own table — so the PM
// register never scans field/installation, and vice-versa; an empty type reads
// the `calls` union view (all types). Writes always go through `calls` (the
// INSTEAD OF triggers route them), so this is for reads only.
export function callTable(callType = ''): string {
  const t = (callType || '').toUpperCase();
  if (!t) return 'calls';
  if (t.startsWith('INSTALL')) return 'installation_calls';
  if (t.replace(/\s/g, '').startsWith('PM')) return 'pm_calls';
  return 'field_calls';
}

// ---- call requests (Request Registration) ----------------------------------
// Party details for autofill (state / city / address).
export async function sbPartyInfo(party: string): Promise<{ state: string; city: string; address: string } | null> {
  const { data } = await must().from('parties').select('state,city,address,extra').ilike('party_name', party).limit(1).maybeSingle();
  if (!data) return null;
  const ex = (data.extra as Record<string, unknown>) ?? {};
  return { state: String(data.state ?? ''), city: String(data.city ?? ''), address: String(data.address ?? ex['Address'] ?? '') };
}

export async function addCallRequest(rec: Record<string, unknown>): Promise<{ ok: boolean; reqid?: string; unique_key?: string; error?: string }> {
  const { data, error } = await must().from('call_requests').insert(rec).select('reqid,unique_key').single();
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true, reqid: String(data.reqid ?? ''), unique_key: String(data.unique_key ?? '') };
}

// One request, several call items (up to 5). An item is a Product + Serial No +
// Standard Complaint + Reported Problem group — each becomes its own row. All
// rows share one REQID (so REQID is NOT unique — see 0007); each row's identity
// is its UniqueID (REQID-Product-SerialNo), assigned by the DB trigger.
export interface CallRequestItem {
  product: string;
  serial: string;
  standardComplaint: string;
  reportedProblem: string;
}
const itemCols = (it: CallRequestItem) => ({
  product: it.product,
  serial_no: it.serial,
  standard_complaint: it.standardComplaint,
  reported_problem: it.reportedProblem,
});
export async function addCallRequestBatch(base: Record<string, unknown>, items: CallRequestItem[]): Promise<{ ok: boolean; reqid?: string; count?: number; error?: string }> {
  const c = must();
  if (items.length === 0) return { ok: false, error: 'Add at least one call.' };

  // Mint the REQID first, then write every item in ONE insert — a request is
  // never half-saved. `next_call_reqid` ships in migration 0007; without it we
  // fall back to the older per-row path below.
  const { data: minted, error: mintErr } = await c.rpc('next_call_reqid');
  if (!mintErr && minted) {
    const reqid = String(minted);
    const rows = items.map((it) => ({ ...base, reqid, ...itemCols(it) }));
    const { error } = await c.from('call_requests').insert(rows);
    if (error) return { ok: false, error: error.message };
    return { ok: true, reqid, count: rows.length };
  }

  // Fallback: the first insert mints the REQID (DB trigger), the rest reuse it.
  // This needs 0007's dropped `reqid` unique constraint for more than one item.
  const first = { ...base, ...itemCols(items[0]) };
  const { data, error } = await c.from('call_requests').insert(first).select('reqid').single();
  if (error) return { ok: false, error: errMsg(error) };
  const reqid = String(data.reqid ?? '');
  if (items.length > 1) {
    const rest = items.slice(1).map((it) => ({ ...base, reqid, ...itemCols(it) }));
    const { error: e2 } = await c.from('call_requests').insert(rest);
    if (e2) {
      const hint = /call_requests_reqid_key/.test(e2.message ?? '')
        ? ' Run migration 0010_call_request_items.sql — REQID must not be unique, a request has one row per call.'
        : '';
      return { ok: true, reqid, count: 1, error: `Saved ${reqid} (1 call); the other items failed: ${errMsg(e2)}.${hint}` };
    }
  }
  return { ok: true, reqid, count: items.length };
}

// Every call request, whatever its outcome — the Request Registration register.
// Rows keep the app's camelCase shape; `status` is Pending / Mapped /
// Registered / Cancelled.
// PAGED, in 1,000-row requests. PostgREST caps a response at 1,000 rows however
// large the `limit` says — so a plain .limit(2000) silently returned 1,000 and
// the register looked like it held a thousand requests when it held four
// thousand. `listCalls` already pages for exactly this reason.
export async function listCallRequests(limit = 2000): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const raw: Record<string, unknown>[] = [];
  for (let from = 0; from < limit; from += PAGE) {
    const { data, error } = await must().from('call_requests').select('*')
      .order('submitted_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false })
      .range(from, Math.min(from + PAGE, limit) - 1);
    if (error) throw new Error(errMsg(error));
    const page = data ?? [];
    raw.push(...page);
    if (page.length < PAGE) break;
  }
  return raw.map((r) => ({
    id: r.id, reqid: r.reqid, uniqueKey: r.unique_key, submittedAt: r.submitted_at,
    engineer: r.engineer, email: r.email, callType: r.call_type,
    partyName: r.party_name, state: r.state, city: r.city, address: r.address,
    product: r.product, serial: r.serial_no,
    standardComplaint: r.standard_complaint, reportedProblem: r.reported_problem,
    customerContactDetails: r.customer_contact_details, customerContactNumber: r.customer_contact_number,
    installationReport: r.installation_report, kyc: r.kyc,
    callAttended: r.call_attended, attendedDate: r.attended_date, planDate: r.plan_date,
    additionalComments: r.additional_comments,
    ucn: r.ucn ?? '', status: r.status ?? 'Pending',
    cancelReason: r.cancel_reason ?? '', actionedBy: r.actioned_by ?? '', actionedAt: r.actioned_at ?? '',
  }));
}

// Pending call registrations (no UCN yet), mapped to the header keys the
// Pending Registrations screen already reads.
export async function listCallRequestsAsPending(limit = 500): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('call_requests').select('*')
    .or('ucn.is.null,ucn.eq.').neq('status', 'Cancelled')
    .order('submitted_at', { ascending: false }).limit(limit);
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r) => ({
    _row: r.id, 'REQID': r.reqid, 'UNIQUE ID': r.unique_key,
    'Timestamp': r.submitted_at, 'ENGINEER': r.engineer, 'E-Mail ID': r.email, 'CALL TYPE': r.call_type,
    'PARTY NAME': r.party_name, 'State': r.state, 'City': r.city, 'Address': r.address,
    'PRODUCT': r.product, 'SERIAL NO': r.serial_no, 'Standard Complaint': r.standard_complaint,
    'Reported Problem': r.reported_problem, 'CUSTOMER CONTACT DETAILS': r.customer_contact_details,
    'CUSTOMER CONTACT Number': r.customer_contact_number, 'Call Attended?': r.call_attended,
    'Attended Date': r.attended_date, 'PLAN DATE (Visit Planned Date)': r.plan_date,
    'Additional Comments': r.additional_comments,
  }));
}
// Close a request out with a UCN: 'Registered' (a new call was created from it)
// or 'Mapped' (it belongs to a call that already existed). Either way it leaves
// the pending list, which only lists requests with no UCN.
export async function setCallRequestUcn(id: number, ucn: string, status: 'Registered' | 'Mapped' = 'Registered', by = ''): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('call_requests')
    .update({ ucn, status, actioned_by: by, actioned_at: new Date().toISOString() }).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// Cancel a request — it stops being pending without ever becoming a call.
export async function cancelCallRequest(id: number, reason: string, by = ''): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await must().from('call_requests')
    .update({ status: 'Cancelled', cancel_reason: reason, cancelled_at: now, actioned_by: by, actioned_at: now }).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---- call state / open calls ------------------------------------------------
// A call's state comes from its LATEST visit (view `call_state`, migration
// 0012): Unattended (no visit yet), Unsolved, Report pending, or Solved.
// Everything but Solved counts as OPEN.
export type CallState = 'Unattended' | 'Unsolved' | 'Report pending' | 'Solved' | 'Reopened';
export const OPEN_STATES: CallState[] = ['Unattended', 'Unsolved', 'Report pending'];

export interface OpenCall {
  ucn: string; callType: string; partyName: string; productName: string; serial: string;
  allocatedTo: string; regDate: string; complaint: string;
  state: Exclude<CallState, 'Solved'>;
}
const CHUNK = 150;
const chunked = <T,>(xs: T[], n = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

// Pending (not solved) calls, optionally for one call type — the Pending Calls
// register. Rows come back in the app's call shape plus `state`.
export async function listPendingCalls(callType = '', limit = 20000): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const out: Record<string, unknown>[] = [];
  for (let from = 0; from < limit; from += PAGE) {
    let q = must().from('pending_calls').select('*').order('id', { ascending: false }).range(from, Math.min(from + PAGE, limit) - 1);
    if (callType) q = q.eq('call_type', callType);
    const { data, error } = await q;
    if (error) throw new Error(errMsg(error));
    const rows = data ?? [];
    out.push(...rows.map((r) => ({ ...dbToCall(r), state: r.reopened_at ? 'Reopened' : String(r.open_state ?? '') })));
    if (rows.length < PAGE) break;
  }
  return out;
}

// Open calls on any of these machines (or parties, when a request has no
// serial) — the Hotline's "is there already a call for this?" check.
//
// The QUERY is by serial, which is the indexed column; the MATCH is on model +
// serial. Without that filter the desk offered an open call for another
// machine that merely shares a number: a request for ORION-G 201 at one
// hospital was shown a VEGA 201 at another, one click from being mapped to it.
export interface MachineRef { product: string; serial: string }
export async function openCallsFor(machines: MachineRef[], parties: string[] = []): Promise<OpenCall[]> {
  const c = must();
  const ser = [...new Set(machines.map((m) => String(m.serial ?? '').trim()).filter(Boolean))];
  const want = new Set(machines
    .filter((m) => String(m.serial ?? '').trim())
    .map((m) => machineKey(m.product, m.serial)));
  const par = [...new Set(parties.map((s) => s.trim()).filter(Boolean))];
  if (!ser.length && !par.length) return [];

  const rows: Record<string, unknown>[] = [];
  const cols = 'ucn,call_type,party_name,product_name,serial,allocated_to,reg_date,complaint_reported,open_state,reopened_at';
  for (const part of chunked(ser)) {
    const { data, error } = await c.from('pending_calls').select(cols).in('serial', part).limit(1000);
    if (error) throw new Error(errMsg(error));
    rows.push(...(data ?? []));
  }
  if (!ser.length) {
    for (const part of chunked(par)) {
      const { data, error } = await c.from('pending_calls').select(cols).in('party_name', part).limit(1000);
      if (error) throw new Error(errMsg(error));
      rows.push(...(data ?? []));
    }
  }

  const byUcn = new Map<string, OpenCall>();
  rows.forEach((r) => {
    const ucn = String(r.ucn ?? '');
    if (!ucn || byUcn.has(ucn)) return;
    // Drop a call that only shares the serial. A call with no product recorded
    // cannot be told apart, so it is kept rather than hidden — the desk can see
    // it and judge.
    if (want.size && String(r.serial ?? '').trim() && String(r.product_name ?? '').trim()
        && !want.has(machineKey(r.product_name, r.serial))) return;
    byUcn.set(ucn, {
      ucn, callType: String(r.call_type ?? ''), partyName: String(r.party_name ?? ''),
      productName: String(r.product_name ?? ''), serial: String(r.serial ?? ''),
      allocatedTo: String(r.allocated_to ?? ''), regDate: String(r.reg_date ?? ''),
      complaint: String(r.complaint_reported ?? ''),
      state: ((r.reopened_at ? 'Reopened' : String(r.open_state ?? 'Unattended')) as Exclude<CallState, 'Solved'>),
    });
  });
  return [...byUcn.values()].sort((a, b) => (b.regDate || '').localeCompare(a.regDate || ''));
}

// Re-open a closed call (Hotline). The DB checks the permission and that the
// call really is closed, and counts the re-open on the call.
export async function reopenCall(ucn: string, reason = ''): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().rpc('reopen_call', { p_ucn: ucn, p_reason: reason });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// Withdraw a re-open (the call was re-opened only to correct it). The call
// falls back to what its last visit said; no visit is invented.
export async function closeReopenedCall(ucn: string, reason = ''): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().rpc('close_reopened_call', { p_ucn: ucn, p_reason: reason });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// Does this UCN exist? (manual mapping is free text, so it is worth checking.)
export async function callByUcn(ucn: string): Promise<Record<string, unknown> | null> {
  const { data } = await must().from('calls').select('*').eq('ucn', ucn).maybeSingle();
  return data ? dbToCall(data) : null;
}

// A reconciliation consumption line: the office booking a spare against a call
// directly, without the engineer's report. Flagged `source = 'Reconciliation'`
// so it is never mistaken for something the engineer wrote; the insert policy
// requires consumption.reconcile.
export interface ReconcileLine { part: string; qty: number; grir?: string }
export interface ReconcileInput {
  ucn: string; call_number: string; engineer: string; remarks?: string; recorded_by?: string;
  lines: ReconcileLine[];
}
// Several parts can be booked in one go; they are inserted together so a batch
// never lands half done. The database caps each line at the engineer's hand
// stock and insists on a real UCN, so a bad line fails the whole insert.
export async function addReconciliationConsumption(
  c: ReconcileInput,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const rows = c.lines
    .filter((l) => l.part.trim() && l.qty > 0)
    .map((l) => ({
      ucn: c.ucn.trim(), call_number: c.call_number.trim(),
      part: l.part.trim(), qty: l.qty, engineer: c.engineer.trim(),
      // Which part was actually fitted, not just which kind — the point of
      // recording it at all.
      grir: (l.grir ?? '').trim(),
      remarks: (c.remarks ?? '').trim(), recorded_by: (c.recorded_by ?? '').trim(),
      source: 'Reconciliation',
    }));
  if (!rows.length) return { ok: false, error: 'Add at least one part.' };
  const { error } = await must().from('spare_consumption').insert(rows);
  return error ? { ok: false, error: errMsg(error) } : { ok: true, count: rows.length };
}

// Correct the quantity on an existing consumption line (reconciliation). The
// database keeps the original, stamps who/when, refuses a raise beyond the
// engineer's hand stock, and logs the before/after in the audit trail.
export async function adjustConsumptionQty(
  id: number, qty: number, reason: string, by: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('spare_consumption')
    .update({ qty, adjustment_reason: reason.trim(), adjusted_by: by.trim() })
    .eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// Every spare actually issued, one row each, with how long Stores took from the
// last approval. Backed by the spare_stock_out_lines view.
export async function listStockOutLines(limit = 5000): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('spare_stock_out_lines')
    .select('*').order('dispatched_at', { ascending: false }).limit(limit);
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}

// ---- pending registrations -------------------------------------------------
export async function listPending(limit = 300): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('pending_registrations')
    .select('*').is('ucn', null).order('requested_at', { ascending: false }).limit(limit);
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}
export async function setPendingUcn(id: number, ucn: string): Promise<boolean> {
  const { error } = await must().from('pending_registrations').update({ ucn }).eq('id', id);
  return !error;
}

// ---- User directory (User Master) ------------------------------------------
// All directory rows, keyed with the header names access.ts / auth already use,
// so those consumers work unchanged.
export async function listDirectoryAsUsers(): Promise<Record<string, unknown>[]> {
  const c = must();
  const out: Record<string, unknown>[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await c.from('user_directory').select('*').range(from, from + PAGE - 1);
    if (error) break;
    const rows = data ?? [];
    rows.forEach((r) => out.push({
      'User Name': r.name, 'Email ID': r.email, 'GMAIL ID': r.gmail, 'Designation': r.designation,
      'RM': r.reporting_manager, 'RGM': r.regional_manager, 'REGION': r.region,
      'Validity': r.validity ? 'TRUE' : 'FALSE',
      // The delivery address the Declaration form is addressed by
      // (0029_engineer_address.sql), under the User Master's own headers.
      'ADDRESS': r.address ?? '', 'CITY': r.city ?? '', 'STATE': r.state ?? '',
      'Contact  No': r.phone ?? '',
    }));
    if (rows.length < PAGE) break;
  }
  return out;
}
// ---- User Master maintenance (admin) ---------------------------------------
// The directory rows as themselves (not remapped to sheet headers), so the User
// Master screen can edit them. `role` (0033) is the role the person is granted
// the first time they sign in.
export interface DirectoryRow {
  id: number; name: string; email: string; gmail: string; designation: string;
  reporting_manager: string; regional_manager: string; region: string;
  role: string; validity: boolean;
  address: string; city: string; state: string; phone: string;
}

const dirRow = (r: Record<string, unknown>): DirectoryRow => ({
  id: Number(r.id),
  name: String(r.name ?? ''), email: String(r.email ?? ''), gmail: String(r.gmail ?? ''),
  designation: String(r.designation ?? ''),
  reporting_manager: String(r.reporting_manager ?? ''), regional_manager: String(r.regional_manager ?? ''),
  region: String(r.region ?? ''), role: String(r.role ?? ''), validity: r.validity !== false,
  address: String(r.address ?? ''), city: String(r.city ?? ''), state: String(r.state ?? ''),
  phone: String(r.phone ?? ''),
});

export async function listDirectory(limit = 5000): Promise<DirectoryRow[]> {
  const { data, error } = await must().from('user_directory').select('*').order('name').limit(limit);
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map(dirRow);
}

// Add a person, or save an edit. `id` null adds.
export async function saveDirectoryRow(
  id: number | null, patch: Partial<DirectoryRow>,
): Promise<{ ok: boolean; error?: string }> {
  const c = must();
  const row: Record<string, unknown> = { ...patch };
  delete row.id;
  const { error } = id == null
    ? await c.from('user_directory').insert(row)
    : await c.from('user_directory').update(row).eq('id', id);
  if (!error) return { ok: true };
  const m = errMsg(error);
  // The directory is admin-only to write (0004/0008, and 0030's guard).
  return { ok: false, error: /permission|policy|administrator/i.test(m) ? `${m} — this needs the “Manage users” permission.` : m };
}

// Remove a User Master (directory) row. The person's login and history are not
// touched — use the disable-login toggle for a leaver; this is for a wrong /
// duplicate directory entry.
export async function deleteDirectoryRow(id: number): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  const { error } = await c.from('user_directory').delete().eq('id', id);
  if (!error) return { ok: true };
  const m = errMsg(error);
  return { ok: false, error: /permission|policy|administrator/i.test(m) ? `${m} — this needs the “Manage users” permission.` : m };
}

// First sign-in: turn the User Master row into a real profile, with the role it
// carries (0033_user_directory_role.sql). Older projects have not applied that
// migration yet, so a missing function is not an error here — the caller falls
// back to the bare profile it already used.
export async function ensureMyProfile(): Promise<Profile | null> {
  const c = getSupabase(); if (!c) return null;
  const { data, error } = await c.rpc('ensure_my_profile');
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as Profile | null;
}

export async function sbDirectoryNames(): Promise<string[]> {
  return distinctColumn('user_directory', 'name');
}

// ---- Audit log (admin) -----------------------------------------------------
export interface AuditFilter { action?: string; email?: string; status?: string }
export async function queryAudit(filter: AuditFilter, offset = 0, limit = 500): Promise<Record<string, unknown>[]> {
  let q = must().from('audit_log').select('*').order('at', { ascending: false }).range(offset, offset + limit - 1);
  if (filter.action) q = q.ilike('action', `%${_san(filter.action)}%`);
  if (filter.email) q = q.ilike('email', `%${_san(filter.email)}%`);
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ---- RBAC (role → permissions) ---------------------------------------------
export async function getRolePerms(): Promise<Record<string, string[]>> {
  const c = getSupabase(); if (!c) return {};
  const { data, error } = await c.from('app_roles').select('role,permissions');
  if (error) return {};
  const out: Record<string, string[]> = {};
  (data ?? []).forEach((r) => { out[String(r.role)] = Array.isArray(r.permissions) ? (r.permissions as string[]) : []; });
  return out;
}
export async function setRolePerms(role: string, permissions: string[], label?: string): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  const row: Record<string, unknown> = { role, permissions, updated_at: new Date().toISOString() };
  if (label != null) row.label = label;
  const { error } = await c.from('app_roles').upsert(row, { onConflict: 'role' });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// Distinct engineer names seen on calls (fallback source for the reporting
// engineer dropdown when the directory isn't populated yet).
export async function sbEngineerNames(): Promise<string[]> {
  const names = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await must().from('calls').select('allocated_to').range(from, from + PAGE - 1);
    if (error) break;
    const rows = data ?? [];
    rows.forEach((r) => { const v = String(r.allocated_to ?? '').trim(); if (v) names.add(v); });
    if (rows.length < PAGE) break;
  }
  return [...names].sort();
}

// ---- reports (Reporting-N equivalent) --------------------------------------
// `reports` is the visit HISTORY (one row per visit, `ucn` is not unique) and
// has no created_at. Two different orderings, on purpose:
//   • the LATEST visit — what the call's status comes from — is the latest
//     ENTRY: `updated_at` (written when the visit is entered) desc, id desc.
//     The same rule the database uses (0032_call_state_by_entry.sql).
//   • the register below lists the history by VISIT DATE, which is how it
//     reads as a list.
export async function getReport(ucn: string): Promise<{ row: Record<string, unknown> | null }> {
  const { data, error } = await must().from('reports').select('*').eq('ucn', ucn).order('updated_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(errMsg(error));
  return { row: data ?? null };
}
// Reports register — field filters + paging (Load more), like Party Master.
export interface ReportFilter { ucn?: string; callNumber?: string; engineer?: string; status?: string }
export async function queryReports(filter: ReportFilter, offset = 0, limit = 1000): Promise<Record<string, unknown>[]> {
  let q = must().from('reports').select('*').order('visit_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).range(offset, offset + limit - 1);
  if (filter.ucn) q = q.ilike('ucn', `%${_san(filter.ucn)}%`);
  if (filter.callNumber) q = q.ilike('call_number', `%${_san(filter.callNumber)}%`);
  if (filter.engineer) q = q.ilike('engineer', `%${_san(filter.engineer)}%`);
  if (filter.status) q = q.ilike('call_status', `%${_san(filter.status)}%`);
  const { data, error } = await q;
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}

// All visits for a UCN (newest first) — for a report history view.
export async function reportHistory(ucn: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('reports').select('*').eq('ucn', ucn).order('updated_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(200);
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}
// Each Visit Entry is a new VISIT row (reports = history), keyed by a fresh uid.
export async function saveReport(ucn: string, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const uid = `WEB-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  const row = { uid, ucn, ...patch, updated_at: new Date().toISOString() };
  const { error } = await must().from('reports').insert(row);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}
// The latest visit row for a UCN (most recent report), for history/context.
export async function latestReport(ucn: string): Promise<Record<string, unknown> | null> {
  const { data } = await must().from('reports').select('*').eq('ucn', ucn).order('updated_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}

// ---- daily call review (DCCR) ----------------------------------------------
// `field_call_review` (0044 + 0047) is one row per FIELD call with its three
// review stages, what they derive (Any Potential Effect, Action Taken), which
// stage is outstanding, and what the reviewer judges it by — the visits, the
// spares consumed, the software version and the product's age at failure.
// Reads are RLS-scoped exactly as the register itself is.
//
// It is read A PAGE AT A TIME, newest first, and every filter is applied by
// the DATABASE. That is not a nicety: the per-call report lookups run for
// every row the query returns, so asking for the whole register at once costs
// seconds per page and the screen shows nothing until the last one lands.
// `field_calls_reg_date_idx` (0047) is what makes the page cheap.
export interface ReviewFilter {
  from?: string;          // reg_date >=  (yyyy-mm-dd)
  to?: string;            // reg_date <=
  status?: string;        // review_status
  product?: string;
  engineer?: string;
  effectOnly?: boolean;   // Any Potential Effect = YES
  q?: string;             // free text across the scannable columns
}

function applyReviewFilter<T extends { eq: (c: string, v: never) => T; gte: (c: string, v: never) => T; lte: (c: string, v: never) => T; or: (f: string) => T }>(
  q: T, f: ReviewFilter,
): T {
  if (f.from) q = q.gte('reg_date', f.from as never);
  if (f.to) q = q.lte('reg_date', f.to as never);
  if (f.status) q = q.eq('review_status', f.status as never);
  if (f.product) q = q.eq('product_name', f.product as never);
  if (f.engineer) q = q.eq('allocated_to', f.engineer as never);
  if (f.effectOnly) q = q.eq('any_potential_effect', 'YES' as never);
  const t = _san(f.q ?? '');
  if (t) {
    q = q.or(['ucn', 'call_number', 'party_name', 'serial', 'product_name', 'allocated_to',
      'standard_complaint', 'complaint_reported', 'complaint_grouping', 'root_cause_keyword']
      .map((c) => `${c}.ilike.%${t}%`).join(','));
  }
  return q;
}

// One page of the register, newest first.
export async function listCallReviews(filter: ReviewFilter = {}, offset = 0, limit = 500): Promise<Record<string, unknown>[]> {
  let q = must().from('field_call_review').select('*')
    .order('reg_date', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  q = applyReviewFilter(q as never, filter) as never;
  const { data, error } = await q;
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}

// One call's full review row — what the review drawer reads.
export async function callReview(ucn: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await must().from('field_call_review').select('*').eq('ucn', ucn).limit(1).maybeSingle();
  if (error) throw new Error(errMsg(error));
  return data ?? null;
}

// How many calls sit at each stage across the WHOLE filtered set (not just the
// page on screen). Read from `field_call_review_summary`, which carries no
// per-call report lookups, so counting a year of calls is a plain scan.
export async function countCallReviews(filter: ReviewFilter = {}): Promise<{ total: number; byStatus: Record<string, number>; effects: number }> {
  const PAGE = 1000;
  const byStatus: Record<string, number> = {};
  let total = 0; let effects = 0;
  for (let from = 0; ; from += PAGE) {
    let q = must().from('field_call_review_summary').select('review_status,any_potential_effect').range(from, from + PAGE - 1);
    q = applyReviewFilter(q as never, filter) as never;
    const { data, error } = await q;
    if (error) throw new Error(errMsg(error));
    const rows = data ?? [];
    rows.forEach((r) => {
      const s = String((r as Record<string, unknown>).review_status ?? '');
      byStatus[s] = (byStatus[s] ?? 0) + 1;
      if (String((r as Record<string, unknown>).any_potential_effect ?? '') === 'YES') effects += 1;
    });
    total += rows.length;
    if (rows.length < PAGE) break;
  }
  return { total, byStatus, effects };
}

// The register's Product and Engineer boxes. Read from the whole register
// (the summary view, which has no per-call lookups) rather than from whatever
// page is loaded, so a product only used last year is still selectable.
export async function reviewPickLists(): Promise<{ products: string[]; engineers: string[] }> {
  const PAGE = 1000;
  const products = new Set<string>(); const engineers = new Set<string>();
  for (let from = 0; from < 40000; from += PAGE) {
    const { data, error } = await must().from('field_call_review_summary')
      .select('product_name,allocated_to').range(from, from + PAGE - 1);
    if (error) throw new Error(errMsg(error));
    const rows = data ?? [];
    rows.forEach((r) => {
      const p = String((r as Record<string, unknown>).product_name ?? '').trim();
      const e = String((r as Record<string, unknown>).allocated_to ?? '').trim();
      if (p) products.add(p);
      if (e) engineers.add(e);
    });
    if (rows.length < PAGE) break;
  }
  return { products: [...products].sort(), engineers: [...engineers].sort() };
}

// One call's review, upserted: the row is created the first time a stage is
// answered. The dates, Any Potential Effect and Action Taken are the database's
// to set (call_review_stamp), so only the answers are sent.
export async function saveCallReview(
  ucn: string,
  callNumber: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const row = { ucn, call_number: callNumber ?? '', ...patch };
  const { error } = await must().from('call_reviews').upsert(row, { onConflict: 'ucn' });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---- masters (dropdown value-lists) ----------------------------------------
// App master keys map to different sources: party -> parties, spare -> parts,
// product -> products, complaint -> the 'standardComplaint' list; the rest are
// plain masters rows.
export async function listMaster(name: string, limit = 3000): Promise<string[]> {
  const c = must();
  if (name === 'party') return sbListParties();
  if (name === 'product') return distinctColumn('products', 'item_name');
  if (name === 'spare') return distinctColumn('parts', 'item_detail', { eq: ['active', true] });
  const names = name === 'complaint' || name === 'standardComplaint' ? ['complaint', 'standardComplaint'] : [name];
  // Pickers only ever offer LIVE values; a deactivated one stays on the records
  // that already carry it but is not offered again.
  const { data, error } = await c.from('masters').select('value').in('name', names).neq('active', false).limit(limit);
  if (error) throw new Error(errMsg(error));
  return [...new Set((data ?? []).map((r) => String(r.value)).filter(Boolean))];
}

// Every value of every generic master list (masters table), for the All
// Masters view. Paged so a large registry still comes back whole.
export async function listAllMasterValues(max = 20000): Promise<{ name: string; value: string }[]> {
  const c = must();
  const out: { name: string; value: string }[] = [];
  const PAGE = 1000;
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await c.from('masters').select('name,value').neq('active', false).order('name').range(from, from + PAGE - 1);
    if (error) throw new Error(errMsg(error));
    const rows = data ?? [];
    rows.forEach((r) => {
      const name = String(r.name ?? '').trim();
      const value = String(r.value ?? '').trim();
      if (name && value) out.push({ name, value });
    });
    if (rows.length < PAGE) break;
  }
  return out;
}

// ---- master lists (each value list as its own maintained table) ------------
// `master_lists` (0014) is the registry: one row per list with its label, what
// one entry is called, and the extra columns that list carries in
// `masters.extra` (Spare Approval Reason has Stage + Status).
export interface MasterList { key: string; label: string; value_label: string; columns: { key: string; label: string }[]; sort_order: number; active: boolean }
export interface MasterItem { id: number; name: string; value: string; extra: Record<string, string>; added_on: string | null; added_by: string; active?: boolean }

export async function listMasterLists(): Promise<MasterList[]> {
  const { data, error } = await must().from('master_lists').select('*').eq('active', true).order('sort_order');
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r) => ({
    key: String(r.key), label: String(r.label), value_label: String(r.value_label ?? 'Value'),
    columns: Array.isArray(r.columns) ? (r.columns as { key: string; label: string }[]) : [],
    sort_order: Number(r.sort_order ?? 100), active: r.active !== false,
  }));
}

// Every row of one list, as the list's own table.
export async function listMasterItems(key: string, limit = 5000): Promise<MasterItem[]> {
  const names = key === 'complaint' ? ['complaint', 'standardComplaint'] : [key];
  const { data, error } = await must().from('masters').select('*').in('name', names).order('value').limit(limit);
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r) => ({
    id: Number(r.id), name: String(r.name), value: String(r.value ?? ''),
    extra: (r.extra ?? {}) as Record<string, string>,
    added_on: (r.added_on as string) ?? null, added_by: String(r.added_by ?? ''),
    active: r.active !== false,
  }));
}

// The values of a PER-PRODUCT master (DCCR Complaint Grouping, Root Cause Key
// Word) for one product: what is tagged with that product, plus everything
// tagged COMM — common to every product. Sorted, de-duplicated.
export async function listMasterValuesForProduct(key: string, product: string, limit = 5000): Promise<string[]> {
  const items = await listMasterItems(key, limit);
  const want = String(product ?? '').trim().toUpperCase();
  const seen = new Set<string>();
  return items
    .filter((i) => {
      const p = String(i.extra?.product ?? '').trim().toUpperCase();
      if (!p || p === 'COMM') return true;      // untagged / common to every product
      return want !== '' && p === want;
    })
    .map((i) => i.value)
    .filter((v) => v && !seen.has(v) && seen.add(v))
    .sort((a, b) => a.localeCompare(b));
}

export async function addMasterItem(key: string, value: string, extra: Record<string, string> = {}, addedBy = ''): Promise<{ ok: boolean; error?: string }> {
  const row = { name: key, value, extra, added_on: new Date().toISOString().slice(0, 10), added_by: addedBy };
  const { error } = await must().from('masters').insert(row);
  // The unique index is what stops a duplicate; say so in words the screen can show.
  if (error) return { ok: false, error: /duplicate key/i.test(errMsg(error)) ? 'That entry is already in this list.' : errMsg(error) };
  return { ok: true };
}

export async function updateMasterItem(id: number, patch: { value?: string; extra?: Record<string, string> }): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('masters').update(patch).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

export async function deleteMasterItem(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('masters').delete().eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// Deactivate rather than delete: the value is already on calls, reports and
// spare requests that must keep making sense.
export async function setMasterItemActive(id: number, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('masters').update({ active }).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}


// Row count of a master table (head request — no rows transferred).
export async function countRows(table: string, eq?: [string, unknown]): Promise<number> {
  let q = must().from(table).select('id', { count: 'exact', head: true });
  if (eq) q = q.eq(eq[0], eq[1] as never);
  const { count, error } = await q;
  if (error) throw new Error(errMsg(error));
  return count ?? 0;
}

// ---- part master (ITEM Master rows) ----------------------------------------
// The spare-parts catalogue lives in `parts`; the pickers show `item_detail`
// ("CODE|Description"). This is the register behind the Part Master view.
// A part code is stored bare (ECG-022) and shown to pickers as item_detail,
// "CODE|Description" — that pipe is the format every spare picker splits on, so
// a code may never contain one. Composed here, once, rather than by each caller.
export const PART_CODE_RE = /^[A-Z0-9][A-Z0-9\-_.\/]*$/;
export const normalisePartCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '');
export const composeItemDetail = (code: string, description: string) =>
  `${normalisePartCode(code)}|${description.trim()}`;

// Refuse a code that already exists (case-insensitively): the catalogue has no
// unique constraint of its own on older projects, and two parts with one code
// make hand stock ambiguous.
export async function partCodeExists(code: string): Promise<boolean> {
  const { data, error } = await must().from('parts')
    .select('id').ilike('code', normalisePartCode(code)).limit(1);
  if (error) throw new Error(errMsg(error));
  return (data ?? []).length > 0;
}

export async function addPart(
  code: string, description: string,
): Promise<{ ok: boolean; error?: string }> {
  const c = normalisePartCode(code);
  if (!c) return { ok: false, error: 'Give the part code.' };
  if (c.includes('|')) return { ok: false, error: 'A part code cannot contain "|" — that separates the code from the description.' };
  if (!PART_CODE_RE.test(c)) return { ok: false, error: 'Use letters, digits and - _ . / only, starting with a letter or digit.' };
  if (!description.trim()) return { ok: false, error: 'Give the description.' };
  if (await partCodeExists(c)) return { ok: false, error: `Part ${c} already exists.` };
  const { error } = await must().from('parts').insert({
    code: c, description: description.trim(), item_detail: composeItemDetail(c, description), active: true,
  });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// Parts are never deleted — a code may already be on a spare request, a stock
// out or an engineer's hand stock. Deactivating keeps the history and takes it
// out of the pickers.
export async function setPartActive(id: number, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('parts').update({ active }).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

export interface PartFilter { q?: string; code?: string; description?: string; active?: string }
export async function queryParts(filter: PartFilter, offset = 0, limit = 1000): Promise<Record<string, unknown>[]> {
  let q = must().from('parts').select('*').order('code').range(offset, offset + limit - 1);
  if (filter.code) q = q.ilike('code', `%${_san(filter.code)}%`);
  if (filter.description) q = q.ilike('description', `%${_san(filter.description)}%`);
  if (filter.active === 'yes') q = q.eq('active', true);
  if (filter.active === 'no') q = q.eq('active', false);
  if (filter.q) {
    const s = _san(filter.q);
    q = q.or(`code.ilike.%${s}%,description.ilike.%${s}%,item_detail.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}

// ---- spare requests --------------------------------------------------------
export async function addSpareRequest(
  req: Record<string, unknown>,
  lines: { part: string; qty: number }[],
): Promise<{ ok: boolean; uid?: string; orNo?: string; error?: string }> {
  const c = must();
  // or_no / or_req_date are assigned by the database (0011_spare_intake.sql).
  const { data, error } = await c.from('spare_requests').insert(req).select('uid, or_no').single();
  if (error) return { ok: false, error: errMsg(error) };
  const uid = String(data.uid);
  const orNo = String(data.or_no ?? '');
  if (lines.length) {
    // RowNo is sent explicitly: every row of one multi-row insert fires the
    // trigger against the same snapshot, so a max()+1 default would hand the
    // whole batch the same number. The trigger stays as the fallback.
    const { error: le } = await c.from('spare_request_lines')
      .insert(lines.map((l, i) => ({ request_uid: uid, row_no: i + 1, part: l.part, qty: l.qty })));
    if (le) {
      // The lines are the request; a header with none is not a usable record.
      await c.from('spare_requests').delete().eq('uid', uid);
      return { ok: false, error: errMsg(le) };
    }
  }
  return { ok: true, uid, orNo };
}
// Only the request's IDENTIFYING fields are pulled from the header. Its
// approval columns are deliberately not: since 0016 every decision lives on
// the line (the RM approves each spare separately) and the request carries
// only a rolled-up stage.
export async function listSpareRequestLines(limit = 1000, offset = 0): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('spare_request_lines')
    .select('*, spare_requests!inner(uid, or_no, or_req_date, req_type, engineer, engineer_email, ucn, call_number, party_name, product_name, serial, complaint, item_status, handstock_reason, remarks, stage, status, created_at)')
    .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r) => {
    // One row per part: the request's identity, the line's own workflow state.
    // The line is spread last, so it wins on every column both tables carry.
    const { spare_requests: req, ...line } = r as Record<string, unknown> & { spare_requests?: Record<string, unknown> };
    return {
      ...req, ...line,
      uid: req?.uid, line_id: line.id,
      req_engineer: req?.engineer, requested_at: req?.created_at,
      req_stage: req?.stage, req_status: req?.status,
    };
  });
}

// One spare. This is the RM path: each line is approved or rejected on its own.
export async function updateSpareRequestLine(lineId: unknown, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('spare_request_lines').update(patch).eq('id', lineId);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// Every line of one request that currently sits at `stages` — the per-OR path
// the later stages may use instead of acting spare by spare. Lines rejected
// earlier, or already past this stage, are left alone.
export async function updateSpareRequestLinesAtStage(
  uid: string, stages: string[], patch: Record<string, unknown>,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const { data, error } = await must().from('spare_request_lines')
    .update(patch).eq('request_uid', uid).in('stage', stages).select('id');
  return error ? { ok: false, error: errMsg(error) } : { ok: true, count: (data ?? []).length };
}

export async function updateSpareRequest(uid: string, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('spare_requests').update(patch).eq('uid', uid);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---- stock transfer -------------------------------------------------------
// Stock is not stored; engineer_stock derives it from hand-stock received,
// consumption, and transfers (0020_stock_transfer.sql).
export interface StockRow { engineer: string; part: string; qty: number }

// What one engineer is holding — only parts with something left.
export async function listEngineerStock(engineer: string): Promise<StockRow[]> {
  const key = engineer.trim().toLowerCase();
  if (!key) return [];
  const { data, error } = await must().from('engineer_stock')
    .select('*').eq('engineer', key).gt('qty', 0).order('part');
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r) => ({ engineer: String(r.engineer), part: String(r.part), qty: Number(r.qty) }));
}

// Every engineer's holding, for the stock-on-hand view.
export async function listAllStock(limit = 5000): Promise<StockRow[]> {
  const { data, error } = await must().from('engineer_stock')
    .select('*').gt('qty', 0).order('engineer').limit(limit);
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r) => ({ engineer: String(r.engineer), part: String(r.part), qty: Number(r.qty) }));
}

export async function addStockTransfer(
  from: string, to: string, lines: { part: string; qty: number }[], remarks = '', on?: string,
): Promise<{ ok: boolean; uid?: string; error?: string }> {
  const c = must();
  // uid / row_no are assigned by the database.
  const { data, error } = await c.from('stock_transfers')
    .insert({ from_engineer: from.trim(), to_engineer: to.trim(), remarks, ...(on ? { transfer_date: on } : {}) })
    .select('uid').single();
  if (error) return { ok: false, error: errMsg(error) };
  const uid = String(data.uid);
  const { error: le } = await c.from('stock_transfer_lines')
    .insert(lines.map((l, i) => ({ transfer_uid: uid, row_no: i + 1, part: l.part, qty: l.qty })));
  if (le) {
    // The lines are the transfer; a header alone is not a usable record. The
    // stock check rejects the whole insert, so nothing moved.
    await c.from('stock_transfers').delete().eq('uid', uid);
    return { ok: false, error: errMsg(le) };
  }
  return { ok: true, uid };
}

// ---- stores dispatch ------------------------------------------------------
// The Stores queue: every spare that has cleared its approvals and has not
// been booked out yet, with the engineer it is going to. The view is
// security_invoker, so this returns exactly the lines the caller may already
// see in the register (0027_spare_dispatch.sql).
export async function listPendingDispatch(limit = 2000): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('spare_pending_dispatch').select('*')
    .order('engineer', { ascending: true }).order('or_no', { ascending: true })
    .order('row_no', { ascending: true }).range(0, limit - 1);
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}

// Book a batch out. One round trip: the database generates the stock-out and
// DC numbers, stamps every line, and rolls the requests up — all in one
// transaction, so a batch never lands half done.
// `qtys` is parallel to `lineIds` — how many units of each line this stock out
// carries (partial dispatch). Omit it to send everything still outstanding.
export async function dispatchSpareLines(
  lineIds: number[], courier: string, remarks: string, dcDate: string, actor: string,
  qtys?: number[], refurb?: boolean[],
): Promise<{ ok: boolean; dispatch?: Record<string, unknown>; error?: string }> {
  const { data, error } = await must().rpc('dispatch_spare_lines', {
    p_line_ids: lineIds, p_qtys: qtys ?? null, p_refurb: refurb ?? null,
    p_courier: courier, p_remarks: remarks, p_dc_date: dcDate, p_actor: actor,
  });
  if (error) return { ok: false, error: errMsg(error) };
  // A function returning a composite comes back as the row itself; PostgREST
  // wraps it in an array when the client asks for a set.
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, dispatch: (row ?? {}) as Record<string, unknown> };
}

// The engineer acknowledges every outstanding SHIPMENT on these lines. A line
// whose whole quantity is now confirmed closes as Received; one still waiting
// for a balance stays at Stores.
export async function receiveSpareShipments(
  lineIds: number[], actor: string, remarks = '',
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const { data, error } = await must().rpc('receive_spare_shipments', {
    p_line_ids: lineIds, p_actor: actor, p_remarks: remarks,
  });
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true, count: Number(data ?? 0) };
}

// Stores drops approved lines instead of sending them (short supply / no longer
// needed). Terminal, not a dispatch — no DC is generated. Needs spare.dispatch
// (the stage guard checks it because stores_status changes).
export async function dropSpareLines(lineIds: number[], reason: string, actor: string): Promise<{ ok: boolean; error?: string }> {
  if (!lineIds.length) return { ok: true };
  const { error } = await must().from('spare_request_lines').update({
    stores_status: 'Dropped', dispatch_remarks: reason, dispatched_by: actor, dispatched_at: new Date().toISOString(),
  }).in('id', lineIds);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// The engineer's delivery address — Address / City / State / Contact from the
// User Master, which is where it is maintained (0029_engineer_address.sql).
export interface EngineerAddress { address: string; city: string; state: string; phone: string }

export async function engineerAddress(name: string): Promise<EngineerAddress | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const { data, error } = await must().from('user_directory')
    .select('name, address, city, state, phone').ilike('name', key).limit(1);
  if (error) return null;
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    address: String(row.address ?? ''), city: String(row.city ?? ''),
    state: String(row.state ?? ''), phone: String(row.phone ?? ''),
  };
}

// Correcting an address is the packer's job, so dispatch may set it. The
// database allows that column and no other (user_directory_address_guard).
export async function saveEngineerAddress(
  name: string, patch: Partial<EngineerAddress>,
): Promise<{ ok: boolean; error?: string }> {
  const key = name.trim();
  if (!key) return { ok: false, error: 'No engineer to save an address for.' };
  const { data, error } = await must().from('user_directory')
    .update(patch).ilike('name', key).select('id');
  if (error) return { ok: false, error: errMsg(error) };
  if (!(data ?? []).length) return { ok: false, error: `${key} is not in the user directory, so the address has nowhere to live.` };
  return { ok: true };
}

// Stock outs already booked, newest first — the Dispatched tab of the screen.
export async function listSpareDispatches(limit = 500): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('spare_dispatches').select('*')
    .order('dispatched_at', { ascending: false }).range(0, limit - 1);
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}

// The spares that went out under one stock out — what a DC prints.
export async function listDispatchLines(stockOutNo: string): Promise<Record<string, unknown>[]> {
  // A line can be sent across several stock outs (partial dispatch), so the DC
  // prints what THIS one carried — spare_dispatch_lines — not the line's whole
  // requested qty. `qty` is overridden with the quantity actually sent.
  const { data, error } = await must().from('spare_dispatch_lines')
    .select('qty, line_uid, part, spare_request_lines!inner(*, spare_requests!inner(uid, or_no, engineer, engineer_email, ucn, call_number, party_name, product_name, serial))')
    .eq('dispatch_uid', stockOutNo).order('line_uid', { ascending: true });
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r) => {
    const row = r as unknown as { qty: unknown; spare_request_lines?: Record<string, unknown> };
    const line = (row.spare_request_lines ?? {}) as Record<string, unknown> & { spare_requests?: Record<string, unknown> };
    const { spare_requests: req, ...rest } = line;
    return { ...req, ...rest, uid: req?.uid, qty: row.qty };
  });
}

export async function listStockTransfers(limit = 1000): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('stock_transfer_lines')
    .select('*, stock_transfers!inner(uid, from_engineer, to_engineer, transfer_date, remarks, status, created_at)')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r) => {
    const { stock_transfers: h, ...line } = r as Record<string, unknown> & { stock_transfers?: Record<string, unknown> };
    return { ...h, ...line, uid: h?.uid, transferred_at: h?.created_at };
  });
}

// Everything associated with one call — keyed by CALL NUMBER (server-side).
export async function reportsByCall(callNumber: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('reports').select('*').eq('call_number', callNumber).order('updated_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(200);
  if (error) return [];
  return data ?? [];
}
export async function spareRequestsByCall(callNumber: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('spare_request_lines')
    .select('*, spare_requests!inner(uid, call_number, req_type, status, engineer, item_status, rm_approval, commercial_approval, nsm_approval, stores_status, dc_number, received_at, created_at)')
    .eq('spare_requests.call_number', callNumber).order('created_at', { ascending: false }).limit(200);
  if (error) return [];
  return (data ?? []).map((r) => {
    const { spare_requests: req, ...line } = r as Record<string, unknown> & { spare_requests?: Record<string, unknown> };
    // Approvals / dispatch are PER LINE (0016), so the line's workflow columns
    // must win over the request-header roll-up — otherwise every line of a
    // request shows the header's single stage. Spread the header first, then the
    // line, so the line's own rm/commercial/nsm/stores fields take precedence.
    return {
      ...req, ...line, part: line.part, qty: line.qty,
      uid: req?.uid, req_status: req?.status, req_engineer: req?.engineer, requested_at: req?.created_at,
    };
  });
}
export async function spareConsumptionByCall(callNumber: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('spare_consumption').select('*').eq('call_number', callNumber).order('created_at', { ascending: false }).limit(200);
  if (error) return [];
  return data ?? [];
}
export async function feedbackByCall(callNumber: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('feedback').select('*').eq('call_number', callNumber).order('created_at', { ascending: false }).limit(50);
  if (error) return [];
  return data ?? [];
}

// ---- material returns (MRN) ------------------------------------------------
// One row per returned item, grouped by `uid` (MRN-YYMM-NNNN) — the flattened
// shape of the sheet's two tabs. A return is the fifth hand-stock movement
// (0039_material_returns.sql), so it needs no separate stock bookkeeping here.
export interface MrnLineInput {
  part: string; good_qty: number; defective_qty: number;
  customer_name?: string; report_no?: string; removed_from_equipment?: string; remarks?: string;
}
export async function addMaterialReturn(
  header: { mrn_no: string; mrn_date?: string; engineer: string; engineer_email?: string; remarks?: string },
  lines: MrnLineInput[],
): Promise<{ ok: boolean; uid?: string; error?: string }> {
  const c = must();
  // The uid and row numbers are assigned by the database. Ask for the first
  // row's uid so every line of one submission shares it.
  const first = { ...header, ...lines[0], source: 'app' };
  const { data, error } = await c.from('material_returns').insert(first).select('uid').single();
  if (error) return { ok: false, error: errMsg(error) };
  const uid = String(data.uid);
  if (lines.length > 1) {
    const { error: le } = await c.from('material_returns')
      .insert(lines.slice(1).map((l, i) => ({ ...header, ...l, uid, row_no: i + 2, source: 'app' })));
    if (le) {
      // The stock check runs per row, so a rejected line leaves the rest
      // standing — take the whole submission back out rather than half of it.
      await c.from('material_returns').delete().eq('uid', uid);
      return { ok: false, error: errMsg(le) };
    }
  }
  return { ok: true, uid };
}
export async function listMaterialReturns(limit = 1000, offset = 0): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('material_returns').select('*')
    .order('mrn_date', { ascending: false, nullsFirst: false }).order('uid', { ascending: false })
    .order('row_no', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}

// ---- hand stock ------------------------------------------------------------
// Netted per engineer + spare by Postgres (views from 0023_handstock.sql):
// Stock Out (Stores) − Consumption − Transfer From + Transfer To. Both views
// are security_invoker, so the rows a user gets are exactly the ones they may
// already see in Spare Requests / Consumption. `engineer_stock`, which the
// Stock Transfer screen and its guard read, is the same derivation — see
// listEngineerStock above.
export async function listHandstockBalance(limit = 5000): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('handstock_balance').select('*')
    .order('engineer', { ascending: true }).order('part_code', { ascending: true })
    .range(0, limit - 1);
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}
// One engineer's stock, for the pickers that may only offer what is in hand
// (the report form's consumption list, the transfer form).
export async function handstockForEngineer(engineer: string, limit = 1000): Promise<Record<string, unknown>[]> {
  const key = engineer.trim().toLowerCase();
  if (!key) return [];
  const { data, error } = await must().from('handstock_balance').select('*')
    .eq('engineer_key', key).gt('on_hand', 0)
    .order('part_code', { ascending: true }).range(0, limit - 1);
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}
// Every movement, newest first — the Movements tab of the Hand Stock register.
// Optional engineer / part filters narrow it server-side.
export async function listAllHandstockMovements(
  limit = 1000, offset = 0, filter: { engineerKey?: string; partCode?: string } = {},
): Promise<Record<string, unknown>[]> {
  let q = must().from('handstock_movements').select('*');
  if (filter.engineerKey) q = q.eq('engineer_key', filter.engineerKey);
  if (filter.partCode) q = q.eq('part_code', filter.partCode);
  const { data, error } = await q
    .order('moved_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}
// The movement history behind one line — every stock-out, consumption and
// transfer for that engineer and spare, newest first.
export async function listHandstockMovements(engineerKey: string, partCode = '', limit = 500): Promise<Record<string, unknown>[]> {
  let q = must().from('handstock_movements').select('*').eq('engineer_key', engineerKey);
  if (partCode) q = q.eq('part_code', partCode);
  const { data, error } = await q.order('moved_at', { ascending: false, nullsFirst: false }).limit(limit);
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}
// ---- consumption / feedback ------------------------------------------------
export async function listConsumptionRows(limit = 1000, offset = 0): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('spare_consumption').select('*').order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return data ?? [];
}
// Customer feedback, newest first. Each answer in the `answers` jsonb becomes
// its OWN column (prefixed `fb::<question>`) so every field the engineer entered
// shows as a separate column rather than one consolidated string.
export async function listFeedbackRows(limit = 1000, offset = 0): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('feedback').select('*').order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const a = (r.answers && typeof r.answers === 'object') ? r.answers as Record<string, unknown> : {};
    const flat: Record<string, unknown> = {};
    Object.entries(a).forEach(([k, v]) => { flat[`fb::${k}`] = v; });
    return { ...r, ...flat };
  });
}
export async function addConsumption(row: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('spare_consumption').insert(row);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}
// Every part consumed on one visit, in ONE insert: Postgres writes all the
// rows or none, so a report can never end up with some of its spares recorded
// and the rest lost. (Row-at-a-time inserts could fail on the second and, if
// the caller ignored the result, do exactly that.) No `.select()` — returning
// rows would need read rights on spare_consumption as well as write.
export async function addConsumptionRows(rows: Record<string, unknown>[]): Promise<{ ok: boolean; error?: string }> {
  if (!rows.length) return { ok: true };
  const { error } = await must().from('spare_consumption').insert(rows);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}
export async function addFeedback(row: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('feedback').insert(row);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---- auth (email + password) ----------------------------------------------
export interface Profile {
  id: string; email: string; full_name: string; role: string;
  designation?: string; engineer_code?: string; region?: string;
  reporting_manager_email?: string; regional_manager_email?: string; active?: boolean;
  extra_permissions?: string[];
}

// Admin: set a user's role, extra per-user permissions, and/or active flag.
export async function updateProfile(id: string, patch: { role?: string; extra_permissions?: string[]; active?: boolean }): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  const { error } = await c.from('profiles').update(patch).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// Admin: create a login WITHOUT the service key. The new user is signed up on a
// throwaway client (its own storage, no session persistence) so the admin's own
// session in this tab is untouched; then the profile is written with the admin's
// session (RLS: profiles_admin_write). For the user to sign in immediately the
// Supabase project must allow sign-ups and have "Confirm email" OFF.
export async function sbAdminCreateUser(input: { email: string; fullName: string; role: string; password: string; extraPermissions?: string[] }):
  Promise<{ ok: boolean; error?: string; needsConfirm?: boolean; id?: string }> {
  const admin = getSupabase(); if (!admin) return { ok: false, error: 'Not connected to the database.' };
  const email = input.email.trim().toLowerCase();
  const password = input.password ?? '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };

  const { url, anon } = getSupabaseCreds();
  const tmp = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'rithi-provision' },
  });
  const { data, error } = await tmp.auth.signUp({
    email, password, options: { data: { full_name: input.fullName.trim() } },
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (/already|registered|exists/.test(m)) return { ok: false, error: 'That email already has an account.' };
    if (/signup|sign-?ups?/.test(m) && /disabled|not allowed/.test(m))
      return { ok: false, error: 'Sign-ups are turned off in Supabase. Enable Authentication → Sign In / Providers → "Allow new users to sign up", then try again.' };
    return { ok: false, error: errMsg(error) };
  }
  const uid = data.user?.id;
  if (!uid) return { ok: false, error: 'No account was created (the email may already be in use).' };

  const profile: Record<string, unknown> = { id: uid, email, full_name: input.fullName.trim(), role: input.role };
  if (input.extraPermissions && input.extraPermissions.length) profile.extra_permissions = input.extraPermissions;
  const { error: pErr } = await admin.from('profiles').upsert(profile, { onConflict: 'id', ignoreDuplicates: true });
  if (pErr) return { ok: false, error: 'Login created, but saving the profile failed: ' + errMsg(pErr) };
  // No session (data.session null) means "Confirm email" is on — the user must
  // confirm before they can sign in.
  return { ok: true, needsConfirm: !data.session, id: uid };
}

// Everything a given user has entered/actioned — for a handover view. Matches on
// their auth id (calls they created), their name (allocation, reports, spare
// approvals/dispatch, consumption) and email. Admin session sees all rows (RLS).
export interface UserActivity {
  calls: Record<string, unknown>[];
  requests: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  dispatches: Record<string, unknown>[];
  reports: Record<string, unknown>[];
  consumption: Record<string, unknown>[];
}
export async function userActivity(u: { id?: string; email?: string; name?: string }): Promise<UserActivity> {
  const c = getSupabase();
  const empty: UserActivity = { calls: [], requests: [], approvals: [], dispatches: [], reports: [], consumption: [] };
  if (!c) return empty;
  const name = (u.name ?? '').trim();
  const email = (u.email ?? '').trim();
  const like = name || email;
  const rows = async (q: PromiseLike<{ data: unknown; error: unknown }>): Promise<Record<string, unknown>[]> => {
    try { const { data } = await q; return (data as Record<string, unknown>[]) ?? []; } catch { return []; }
  };
  const orName = (cols: string[]) => cols.map((col) => `${col}.ilike.%${_san(like)}%`).join(',');

  const [calls, requests, lines, reports, consumption] = await Promise.all([
    rows(c.from('calls').select('ucn,call_number,party_name,product_name,allocated_to,reg_date,created_by')
      .or(`${u.id ? `created_by.eq.${u.id},` : ''}allocated_to.ilike.%${_san(name)}%`).order('reg_date', { ascending: false }).limit(100)),
    rows(c.from('spare_requests').select('uid,call_number,engineer,status,created_at')
      .ilike('engineer', `%${_san(like)}%`).order('created_at', { ascending: false }).limit(100)),
    rows(c.from('spare_request_lines').select('*, spare_requests!inner(call_number,engineer)')
      .or(orName(['rm_by', 'commercial_by', 'nsm_by', 'dispatched_by'])).limit(200)),
    rows(c.from('reports').select('uid,ucn,engineer,call_status,visit_at').ilike('engineer', `%${_san(like)}%`).order('visit_at', { ascending: false }).limit(100)),
    rows(c.from('spare_consumption').select('*').ilike('engineer', `%${_san(like)}%`).order('created_at', { ascending: false }).limit(100)),
  ]);
  const approvals = lines.filter((l) => [l.rm_by, l.commercial_by, l.nsm_by].some((v) => String(v ?? '').toLowerCase().includes(like.toLowerCase())));
  const dispatches = lines.filter((l) => String(l.dispatched_by ?? '').toLowerCase().includes(like.toLowerCase()));
  return { calls, requests, approvals, dispatches, reports, consumption };
}

// ---- password reset / invite ----------------------------------------------
// A Supabase auth link comes back as an implicit-flow fragment:
//   https://app/#access_token=…&refresh_token=…&type=recovery
// `type` is `recovery` for a "forgot password" link, or `invite` / `signup`
// when an admin invited a brand-new user — all three land the person on the
// set-password screen. The app routes on the hash, so the tokens are grabbed
// synchronously at boot (before React or the router runs) and the URL is put
// back to "#/".
let pendingRecovery: { access: string; refresh: string } | null = null;
// Whether the captured link was an invite (a first-time user) vs a reset, so
// the set-password screen can greet them appropriately.
let recoveryIsInviteFlag = false;
// An expired or already-used link comes back as #error=…&error_description=…
let recoveryError = '';

export function takeRecoveryFromUrl(): boolean {
  try {
    const raw = window.location.hash.replace(/^#\/?/, '');
    if (!raw.includes('access_token') && !raw.includes('error')) return false;
    const p = new URLSearchParams(raw);
    const access = p.get('access_token') ?? '';
    const refresh = p.get('refresh_token') ?? '';
    const type = (p.get('type') ?? '').toLowerCase();
    // recovery = forgot-password; invite / signup = an admin-created account.
    const isSetPassword = type === 'recovery' || type === 'invite' || type === 'signup';
    const err = p.get('error_description') ?? p.get('error') ?? '';
    window.location.hash = '#/';
    if (err) {
      recoveryError = /expired|invalid/i.test(err)
        ? 'That link has expired or was already used. Request a new one below, or ask an admin to re-invite you.'
        : err.replace(/\+/g, ' ');
      return false;
    }
    if (!isSetPassword || !access || !refresh) return false;
    pendingRecovery = { access, refresh };
    recoveryIsInviteFlag = type !== 'recovery';
    return true;
  } catch { return false; }
}
export const hasPendingRecovery = (): boolean => pendingRecovery !== null;
// True when the captured link was an invite/signup (a first-time user setting
// their password), false for an ordinary password reset.
export const recoveryIsInvite = (): boolean => recoveryIsInviteFlag;
// Read (and clear) the message from a failed reset link, for the login screen.
export function takeRecoveryError(): string { const e = recoveryError; recoveryError = ''; return e; }

// Exchange the recovery tokens for a session, so updateUser() can set the new
// password. The session is a normal signed-in session afterwards.
export async function sbConsumeRecovery(): Promise<{ ok: boolean; error?: string }> {
  const r = pendingRecovery; pendingRecovery = null;
  if (!r) return { ok: false, error: 'No recovery link.' };
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  const { error } = await c.auth.setSession({ access_token: r.access, refresh_token: r.refresh });
  return error ? { ok: false, error: 'This reset link has expired. Request a new one.' } : { ok: true };
}

// Email a reset link. Always reports success: whether an address has an account
// is not something an unauthenticated form should reveal.
export async function sbSendPasswordReset(email: string): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected to the database.' };
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await c.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error && /rate|too many/i.test(error.message)) return { ok: false, error: 'Too many attempts — wait a minute and try again.' };
  return { ok: true };
}

// Set a new password for the signed-in (or just-recovered) user.
export async function sbUpdatePassword(password: string): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  const { error } = await c.auth.updateUser({ password });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// Confirm the user's current password before changing it (Supabase's
// updateUser doesn't ask for it). A correct password simply re-signs the same
// user in; a wrong one leaves the existing session untouched.
export async function sbVerifyPassword(email: string, password: string): Promise<boolean> {
  const c = getSupabase(); if (!c) return false;
  const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
  return !error;
}

export async function sbSignIn(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().auth.signInWithPassword({ email: email.trim(), password });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}
export async function sbSignOut(): Promise<void> {
  const c = getSupabase(); if (c) await c.auth.signOut();
}
// The signed-in user's own profile row (or null if not signed in / no row yet).
export async function sbCurrentProfile(): Promise<Profile | null> {
  const c = getSupabase(); if (!c) return null;
  const { data: { user } } = await c.auth.getUser();
  if (!user) return null;
  const { data } = await c.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (data) return data as Profile;
  // No profile row yet: build one from this person's User Master row, so they
  // arrive with the role they were given rather than as a bare engineer (and
  // so they show up in User Access at all).
  const made = await ensureMyProfile();
  if (made) return made;
  // Nothing to build from — the minimal identity, as before.
  return { id: user.id, email: user.email ?? '', full_name: user.email ?? '', role: 'engineer' };
}
// All profiles the current user may see (admins: everyone; others: themselves).
export async function sbListProfiles(): Promise<Profile[]> {
  const c = getSupabase(); if (!c) return [];
  const { data, error } = await c.from('profiles').select('*').order('full_name');
  if (error) return [];
  return (data ?? []) as Profile[];
}
// id -> display name for EVERY user, so a table can show who created a row
// instead of the raw UUID that was stamped into created_by. `profiles` only
// lets you read yourself unless you manage users, which is why this reads the
// `app_user_names` view (0068) instead. Missing view -> empty map, and the
// tables keep showing the UUID rather than breaking.
export async function listUserNames(): Promise<Record<string, string>> {
  const c = getSupabase(); if (!c) return {};
  const { data, error } = await c.from('app_user_names').select('id,name');
  if (error) return {};
  const out: Record<string, string> = {};
  (data ?? []).forEach((r) => {
    const row = r as { id?: string; name?: string };
    if (row.id && row.name) out[row.id] = row.name;
  });
  return out;
}

// Notify on sign-in/sign-out (Supabase persists the session across reloads).
export function sbOnAuthChange(cb: () => void): () => void {
  const c = getSupabase(); if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange(() => cb());
  return () => data.subscription.unsubscribe();
}

// ---- connectivity check ----------------------------------------------------
export async function pingSupabase(): Promise<{ ok: boolean; error?: string; count?: number }> {
  try {
    const { count, error } = await must().from('calls').select('*', { count: 'exact', head: true });
    if (error) return { ok: false, error: errMsg(error) };
    return { ok: true, count: count ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Knowledge Base — team-written field-solution articles (0042_knowledge_base).
// Anyone signed in reads all and contributes; the author (or an admin) edits.
// ---------------------------------------------------------------------------
export interface KbAttachment { name: string; url: string }
// ---------------------------------------------------------------------------
// OWNERSHIP TRANSFER (0072) and ADDITIONAL ENTRY DETAILS (0073).
// ---------------------------------------------------------------------------
export interface OwnershipTransfer {
  id: number; serial_number: string; item_name: string; from_party: string; to_party: string;
  transfer_date: string | null; reference_no: string; reason: string; remarks: string;
  document_url: string; recorded_by_name: string; created_at: string;
}
export async function listOwnershipTransfers(serial = ''): Promise<OwnershipTransfer[]> {
  const c = getSupabase(); if (!c) return [];
  let q = c.from('ownership_transfers').select('*').order('transfer_date', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(2000);
  if (serial.trim()) q = q.ilike('serial_number', `%${serial.trim()}%`);
  const { data, error } = await q;
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as OwnershipTransfer[];
}
export async function addOwnershipTransfer(t: Partial<OwnershipTransfer>): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Database not connected.' };
  const { error } = await c.from('ownership_transfers').insert(t);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

export interface AdditionalEntry {
  id: number; serial_number: string; item_name: string; party_name: string;
  warranty_number: string; warranty_start: string | null; warranty_end: string | null;
  contract_number: string; contract_type: string; contract_start: string | null; contract_end: string | null;
  source_note: string; document_url: string; remarks: string; recorded_by_name: string; created_at: string;
}
export async function listAdditionalEntries(serial = ''): Promise<AdditionalEntry[]> {
  const c = getSupabase(); if (!c) return [];
  let q = c.from('product_additional_entries').select('*').order('created_at', { ascending: false }).limit(2000);
  if (serial.trim()) q = q.ilike('serial_number', `%${serial.trim()}%`);
  const { data, error } = await q;
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as AdditionalEntry[];
}
// Upserts on the machine: a second entry for a serial is a CORRECTION of the
// first, not another record.
export async function saveAdditionalEntry(e: Partial<AdditionalEntry>): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Database not connected.' };
  const { error } = await c.from('product_additional_entries').upsert(e, { onConflict: 'serial_number' });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---------------------------------------------------------------------------
// INDIVIDUAL REGISTER UPLOADS — write shaped rows to whichever table the
// register named. Upserts where the table has a natural key, so a run that
// stopped half way can simply be run again; plain inserts where it has none,
// which the screen says out loud before you press the button.
// ---------------------------------------------------------------------------
export async function uploadRows(
  table: string,
  rows: Record<string, unknown>[],
  conflict?: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: boolean; written: number; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, written: 0, error: 'Database not connected.' };
  // Reports carry a large jsonb payload and every cover item re-syncs the
  // machine it names, so those batches stay small enough to finish inside the
  // server's statement timeout.
  // Reports carry a large jsonb payload and every cover item re-syncs the
  // machine it names, so those stay small. The history tables have no per-row
  // trigger at all, so they go up in larger batches — 44,000 rows is 22
  // requests rather than 88.
  const SIZE = /reports|_items$/.test(table) ? 300 : /_history$|_opening$/.test(table) ? 2000 : 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += SIZE) {
    const slice = rows.slice(i, i + SIZE);
    const { error } = conflict
      ? await c.from(table).upsert(slice, { onConflict: conflict })
      : await c.from(table).insert(slice);
    if (error) {
      const m = errMsg(error);
      // The ON CONFLICT message names nothing useful — "no unique or exclusion
      // constraint" tells an operator neither which index nor which script. It
      // means the migration carrying that index has not been applied, so say so.
      const hint = /no unique or exclusion constraint/i.test(m)
        ? ` — this register matches on ${conflict}, and the index it needs is not on this project yet.`
          + ' Run supabase/apply/_status.sql in the SQL editor: it names the bundle to apply.'
          + ' Nothing was written, so re-run the upload once the script is in.'
        : /timeout/i.test(m)
          ? ' — the database cancelled the batch. Re-run it: rows already written are updated, not duplicated.'
          : /schema cache|does not exist/i.test(m)
            ? ` — the ${table} table (or a column of it) is not on this project. Run supabase/apply/_status.sql to see what is missing.`
            : '';
      return { ok: false, written, error: `${m} (row ~${i + 1})${hint}` };
    }
    written += slice.length;
    onProgress?.(written, rows.length);
  }
  return { ok: true, written };
}

export async function countTable(table: string): Promise<number | null> {
  const c = getSupabase(); if (!c) return null;
  const { count, error } = await c.from(table).select('*', { count: 'exact', head: true });
  return error ? null : (count ?? 0);
}

// ---------------------------------------------------------------------------
// BULK REPORT → CALL MAPPING (recovering lost visit history).
// ---------------------------------------------------------------------------

// The call keys a recovery sheet needs to match against. Fetched by the keys
// the sheet actually carries rather than by reading the whole register — a
// recovery file names a few hundred calls, and `calls` holds every one ever
// raised.
export interface CallKeyRow { ucn: string; call_number: string; serial: string; party_name: string; product_name: string }
export async function callKeysFor(ucns: string[], callNumbers: string[]): Promise<CallKeyRow[]> {
  const c = getSupabase(); if (!c) return [];
  const cols = 'ucn,call_number,serial,party_name,product_name';
  const out = new Map<string, CallKeyRow>();
  const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

  const u = [...new Set(ucns.map((x) => x.trim()).filter(Boolean))];
  const n = [...new Set(callNumbers.map((x) => x.trim()).filter(Boolean))];
  for (const part of chunk(u, 200)) {
    const { data } = await c.from('calls').select(cols).in('ucn', part);
    (data ?? []).forEach((r) => out.set(String((r as CallKeyRow).ucn), r as CallKeyRow));
  }
  for (const part of chunk(n, 200)) {
    const { data } = await c.from('calls').select(cols).in('call_number', part);
    (data ?? []).forEach((r) => out.set(String((r as CallKeyRow).ucn), r as CallKeyRow));
  }
  return [...out.values()];
}

// Upsert recovered visits on `uid`, so re-running the same sheet CORRECTS the
// rows it loaded before instead of doubling the visit history. `mapped_at`
// marks them as recovered rather than reported live.
export interface RecoveredReport {
  uid: string; ucn: string; call_number: string; call_status: string; pending_reason: string;
  engineer: string; engineer_email: string; visit_at: string; manual_report: string;
  source_ref: string; data: Record<string, unknown>;
}
export async function upsertRecoveredReports(
  rows: RecoveredReport[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: boolean; written: number; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, written: 0, error: 'Database not connected.' };
  let written = 0;
  const SIZE = 100;
  for (let i = 0; i < rows.length; i += SIZE) {
    const batch = rows.slice(i, i + SIZE).map((r) => ({ ...r, visit_at: r.visit_at || null, mapped_at: new Date().toISOString() }));
    const { error } = await c.from('reports').upsert(batch, { onConflict: 'uid' });
    if (error) {
      return {
        ok: false, written,
        error: /source_ref|mapped_at|schema cache/i.test(errMsg(error))
          ? 'The reports table is missing source_ref / mapped_at — apply supabase/apply/reports.sql, then run the import again.'
          : errMsg(error),
      };
    }
    written += batch.length;
    onProgress?.(written, rows.length);
  }
  return { ok: true, written };
}

// ---------------------------------------------------------------------------
// DOCUMENT LIBRARY — service manuals and QMS documents (0070).
// The FILE lives in Google Drive; the row here is the catalogue entry that
// makes it findable — above all, which product a manual covers, so a call can
// hand the engineer the right one.
// ---------------------------------------------------------------------------
export type DocKind = 'service_manual' | 'qms';
export interface DocRow {
  id: number; kind: DocKind; title: string; product: string;
  doc_no: string; revision: string; effective_date: string | null;
  tags: string; url: string; file_name: string; notes: string; active: boolean;
  uploaded_by: string | null; uploaded_by_name: string;
  created_at: string; updated_at: string;
}
export type DocInput = Pick<DocRow, 'kind' | 'title' | 'product' | 'doc_no' | 'revision' | 'tags' | 'url' | 'file_name' | 'notes'>
  & { effective_date?: string | null; uploaded_by_name?: string };

export async function listDocuments(kind?: DocKind, includeInactive = true): Promise<DocRow[]> {
  const c = getSupabase(); if (!c) return [];
  let q = c.from('documents').select('*').order('title');
  if (kind) q = q.eq('kind', kind);
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as DocRow[];
}

// The manuals that apply to one product. A manual with a BLANK product is a
// general one and applies to every machine, so it comes back too — that is why
// this cannot be a plain equality filter.
export async function serviceManualsForProduct(product: string): Promise<DocRow[]> {
  const c = getSupabase(); if (!c) return [];
  const p = (product ?? '').trim();
  const { data, error } = await c.from('documents')
    .select('*').eq('kind', 'service_manual').eq('active', true).order('title');
  if (error) return [];
  const rows = (data ?? []) as DocRow[];
  if (!p) return rows;
  const want = p.toLowerCase();
  return rows.filter((r) => {
    const owns = (r.product ?? '').trim().toLowerCase();
    if (!owns) return true;                       // general manual
    return owns === want || want.includes(owns) || owns.includes(want);
  });
}

export async function addDocument(d: DocInput): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Database not connected.' };
  const { error } = await c.from('documents').insert(d);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}
export async function updateDocument(id: number, patch: Partial<DocInput>): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Database not connected.' };
  const { error } = await c.from('documents').update(patch).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}
// A superseded manual is DEACTIVATED, never deleted: calls already worked from
// it, and the shelf is a record of what the field was told.
export async function setDocumentActive(id: number, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Database not connected.' };
  const { error } = await c.from('documents').update({ active }).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

export interface KbArticle {
  id: number; title: string; body: string; category: string; product: string;
  tags: string; attachments: KbAttachment[];
  author_name: string; author_email: string; created_by: string | null;
  created_at: string; updated_at: string;
}
export type KbInput = Pick<KbArticle, 'title' | 'body' | 'category' | 'product' | 'tags' | 'attachments' | 'author_name' | 'author_email'>;

export async function kbList(): Promise<KbArticle[]> {
  const { data, error } = await must().from('kb_articles').select('*').order('updated_at', { ascending: false }).limit(1000);
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r) => ({ ...r, attachments: Array.isArray((r as KbArticle).attachments) ? (r as KbArticle).attachments : [] })) as KbArticle[];
}
// Knowledge-base articles that speak to one call: the ones tagged for the
// machine it is against, or for the complaint it was raised with. Matched
// against title / product / tags, and deliberately NOT against the body — an
// article that merely mentions the model in passing is noise on a call.
// Returns the light columns only; the body is fetched when one is opened.
export interface KbLite { id: number; title: string; category: string; product: string; tags: string; updated_at: string }
export async function kbForCall(product: string, complaint = ''): Promise<KbLite[]> {
  const c = getSupabase(); if (!c) return [];
  const terms = [product, complaint]
    .map((t) => (t ?? '').trim())
    .filter((t) => t.length >= 3)
    .map((t) => t.replace(/[,()*]/g, ' ').trim());
  if (!terms.length) return [];
  const clauses = terms.flatMap((t) => [`title.ilike.%${t}%`, `product.ilike.%${t}%`, `tags.ilike.%${t}%`]);
  const { data, error } = await c.from('kb_articles')
    .select('id,title,category,product,tags,updated_at')
    .or(clauses.join(','))
    .order('updated_at', { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []) as KbLite[];
}

export async function kbAdd(a: KbInput): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('kb_articles').insert(a);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}
export async function kbUpdate(id: number, patch: Partial<KbInput>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('kb_articles').update(patch).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}
export async function kbDelete(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('kb_articles').delete().eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---------------------------------------------------------------------------
// Help screenshots (0043_help_screenshots) — one picture per how-to task,
// keyed by the guide section id. Everyone reads; admins set / clear (RLS).
// ---------------------------------------------------------------------------
export interface HelpShot { section_id: string; image: string; caption: string; updated_at: string }
export async function helpShots(): Promise<Record<string, HelpShot>> {
  const { data, error } = await must().from('help_screenshots').select('section_id,image,caption,updated_at').limit(200);
  if (error) throw new Error(errMsg(error));
  const map: Record<string, HelpShot> = {};
  for (const r of (data ?? []) as HelpShot[]) map[r.section_id] = r;
  return map;
}
export async function helpShotSet(section_id: string, image: string, caption: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('help_screenshots').upsert({ section_id, image, caption }, { onConflict: 'section_id' });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}
export async function helpShotClear(section_id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('help_screenshots').delete().eq('section_id', section_id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---------------------------------------------------------------------------
// SLA rules (0044_sla_rules) — configurable service-level targets.
// ---------------------------------------------------------------------------
export interface SlaRuleRow { key: string; label: string; target_hours: number; active: boolean; sort_order: number }
export async function listSlaRules(): Promise<SlaRuleRow[]> {
  const { data, error } = await must().from('sla_rules').select('*').order('sort_order');
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as SlaRuleRow[];
}
export async function saveSlaRule(key: string, patch: { target_hours?: number; active?: boolean }): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('sla_rules').update(patch).eq('key', key);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---------------------------------------------------------------------------
// Notifications (0045_notifications) — per-user in-app bell.
// ---------------------------------------------------------------------------
export interface AppNotification { id: number; kind: string; title: string; body: string; link: string; read: boolean; created_at: string }
export async function listNotifications(limit = 30): Promise<AppNotification[]> {
  const { data, error } = await must().from('notifications').select('id,kind,title,body,link,read,created_at').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as AppNotification[];
}
export async function unreadNotificationCount(): Promise<number> {
  const { count, error } = await must().from('notifications').select('id', { count: 'exact', head: true }).eq('read', false);
  if (error) throw new Error(errMsg(error));
  return count ?? 0;
}
export async function markNotificationsRead(ids?: number[]): Promise<void> {
  let q = must().from('notifications').update({ read: true }).eq('read', false);
  if (ids && ids.length) q = q.in('id', ids);
  await q;
}

// ---------------------------------------------------------------------------
// Validation execution tracker (0046_validation_results).
// ---------------------------------------------------------------------------
export interface ValidationResult { test_id: string; result: string; actual: string; tester: string; notes: string; executed_at: string | null; updated_at: string }
export async function listValidationResults(): Promise<Record<string, ValidationResult>> {
  const { data, error } = await must().from('validation_results').select('*');
  if (error) throw new Error(errMsg(error));
  const map: Record<string, ValidationResult> = {};
  (data ?? []).forEach((r) => { map[(r as ValidationResult).test_id] = r as ValidationResult; });
  return map;
}
export async function saveValidationResult(testId: string, patch: { result?: string; actual?: string; tester?: string; notes?: string }): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('validation_results').upsert({ test_id: testId, ...patch }, { onConflict: 'test_id' });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

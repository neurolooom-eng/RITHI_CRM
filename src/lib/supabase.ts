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

let _client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;
  const { url, anon } = getSupabaseCreds();
  if (!supabaseConfigured()) return null;
  _client = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true },
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
  emailAddress: 'email_address', status: 'status',
};
const DATE_KEYS = new Set(['regDate', 'complaintDate', 'warrantyStart', 'warrantyEnd', 'contractStart', 'contractEnd', 'breakdownDate']);
const CALL_COLS_INV: Record<string, string> = Object.fromEntries(Object.entries(CALL_COLS).map(([k, v]) => [v, k]));

function dbToCall(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [col, val] of Object.entries(row)) {
    const key = CALL_COLS_INV[col];
    if (key) out[key] = val ?? '';
  }
  out._id = row.id;
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
    let q = must().from('calls').select('*').order('id', { ascending: false }).range(from, Math.min(from + PAGE, limit) - 1);
    if (callType) q = q.eq('call_type', callType);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
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
  let q = must().from('calls').select('*').order('id', { ascending: false }).limit(limit);
  if (callType) q = q.eq('call_type', callType);
  if (terms.ucn) q = q.ilike('ucn', `%${_san(terms.ucn)}%`);
  if (terms.serial) q = q.ilike('serial', `%${_san(terms.serial)}%`);
  if (terms.partyName) q = q.ilike('party_name', `%${_san(terms.partyName)}%`);
  if (terms.productName) q = q.ilike('product_name', `%${_san(terms.productName)}%`);
  const g = _san(terms.q ?? '');
  if (g) q = q.or(['ucn', 'call_number', 'party_name', 'serial', 'product_name', 'allocated_to', 'city', 'state', 'standard_complaint', 'complaint_reported', 'customer_name'].map((c) => `${c}.ilike.%${g}%`).join(','));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(dbToCall);
}

export interface AddResult { ok: boolean; ucn?: string; record?: Record<string, unknown>; error?: string }
export async function addCall(rec: Record<string, unknown>): Promise<AddResult> {
  const payload = callToDb(rec);
  delete payload.ucn; // server assigns via trigger
  const { data, error } = await must().from('calls').insert(payload).select('*').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, ucn: String(data.ucn ?? ''), record: dbToCall(data) };
}

export async function updateCall(ucn: string, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('calls').update(callToDb(patch)).eq('ucn', ucn);
  return error ? { ok: false, error: error.message } : { ok: true };
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
export async function sbListPartyProducts(party: string): Promise<string[]> {
  const { data, error } = await must().from('products').select('item_name').eq('party_name', party).limit(5000);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => String(r.item_name)).filter(Boolean))];
}
export async function sbListPartyItems(party: string, product = ''): Promise<Record<string, unknown>[]> {
  let q = must().from('products').select('*').eq('party_name', party).limit(2000);
  if (product) q = q.eq('item_name', product);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(productRowToSheet);
}
export async function sbSearchProducts(filters: { q?: string; party?: string; product?: string; serial?: string }, limit = 100): Promise<Record<string, unknown>[]> {
  let q = must().from('products').select('*').limit(limit);
  if (filters.serial) q = q.ilike('serial_number', `%${filters.serial}%`);
  if (filters.party) q = q.ilike('party_name', `%${filters.party}%`);
  if (filters.product) q = q.ilike('item_name', `%${filters.product}%`);
  if (filters.q) q = q.or(`serial_number.ilike.%${filters.q}%,item_name.ilike.%${filters.q}%,party_name.ilike.%${filters.q}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
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
  if (error) return { ok: false, error: error.message };
  return { ok: true, reqid: String(data.reqid ?? ''), unique_key: String(data.unique_key ?? '') };
}

// One request, several product/serial pairs (up to 5). All share one REQID; the
// DB trigger gives each row its own UniqueID (REQID-Product-SerialNo). The first
// insert mints the REQID (trigger), the rest reuse it.
export async function addCallRequestBatch(base: Record<string, unknown>, pairs: { product: string; serial: string }[]): Promise<{ ok: boolean; reqid?: string; count?: number; error?: string }> {
  const c = must();
  if (pairs.length === 0) return { ok: false, error: 'Add at least one product.' };
  const first = { ...base, product: pairs[0].product, serial_no: pairs[0].serial };
  const { data, error } = await c.from('call_requests').insert(first).select('reqid').single();
  if (error) return { ok: false, error: error.message };
  const reqid = String(data.reqid ?? '');
  if (pairs.length > 1) {
    const rest = pairs.slice(1).map((p) => ({ ...base, reqid, product: p.product, serial_no: p.serial }));
    const { error: e2 } = await c.from('call_requests').insert(rest);
    if (e2) return { ok: true, reqid, count: 1, error: `Saved ${reqid} (1 product); the other pairs failed: ${e2.message}` };
  }
  return { ok: true, reqid, count: pairs.length };
}

// Pending call registrations (no UCN yet), mapped to the header keys the
// Pending Registrations screen already reads.
export async function listCallRequestsAsPending(limit = 500): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('call_requests').select('*')
    .or('ucn.is.null,ucn.eq.').order('submitted_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
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
export async function setCallRequestUcn(id: number, ucn: string): Promise<boolean> {
  const { error } = await must().from('call_requests').update({ ucn, status: 'Registered' }).eq('id', id);
  return !error;
}

// ---- pending registrations -------------------------------------------------
export async function listPending(limit = 300): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('pending_registrations')
    .select('*').is('ucn', null).order('requested_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function setPendingUcn(id: number, ucn: string): Promise<boolean> {
  const { error } = await must().from('pending_registrations').update({ ucn }).eq('id', id);
  return !error;
}

// Distinct engineer names seen on calls (source for the reporting engineer
// dropdown until the User Master directory is migrated).
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
// Latest visit for a UCN (reports is history; ucn is no longer unique).
export async function getReport(ucn: string): Promise<{ row: Record<string, unknown> | null }> {
  const { data, error } = await must().from('reports').select('*').eq('ucn', ucn).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return { row: data ?? null };
}
// All visits for a UCN (newest first) — for a report history view.
export async function reportHistory(ucn: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('reports').select('*').eq('ucn', ucn).order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}
// Each Update Call is a new VISIT row (reports = history), keyed by a fresh uid.
export async function saveReport(ucn: string, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const uid = `WEB-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  const row = { uid, ucn, ...patch, updated_at: new Date().toISOString() };
  const { error } = await must().from('reports').insert(row);
  return error ? { ok: false, error: error.message } : { ok: true };
}
// The latest visit row for a UCN (most recent report), for history/context.
export async function latestReport(ucn: string): Promise<Record<string, unknown> | null> {
  const { data } = await must().from('reports').select('*').eq('ucn', ucn).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
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
  const { data, error } = await c.from('masters').select('value').in('name', names).limit(limit);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => String(r.value)).filter(Boolean))];
}

// ---- spare requests --------------------------------------------------------
export async function addSpareRequest(req: Record<string, unknown>, lines: { part: string; qty: number }[]): Promise<{ ok: boolean; uid?: string; error?: string }> {
  const c = must();
  const { data, error } = await c.from('spare_requests').insert(req).select('uid').single();
  if (error) return { ok: false, error: error.message };
  const uid = String(data.uid);
  if (lines.length) {
    const { error: le } = await c.from('spare_request_lines').insert(lines.map((l) => ({ request_uid: uid, part: l.part, qty: l.qty })));
    if (le) return { ok: false, uid, error: le.message };
  }
  return { ok: true, uid };
}
export async function listSpareRequestLines(limit = 600): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('spare_request_lines')
    .select('*, spare_requests!inner(uid, req_type, engineer, engineer_email, ucn, party_name, product_name, serial, status, created_at)')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Everything associated with one call — keyed by CALL NUMBER (server-side).
export async function reportsByCall(callNumber: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('reports').select('*').eq('call_number', callNumber).order('created_at', { ascending: false }).limit(200);
  if (error) return [];
  return data ?? [];
}
export async function spareRequestsByCall(callNumber: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('spare_request_lines')
    .select('*, spare_requests!inner(uid, call_number, req_type, status, engineer, created_at)')
    .eq('spare_requests.call_number', callNumber).order('created_at', { ascending: false }).limit(200);
  if (error) return [];
  return (data ?? []).map((r) => {
    const req = (r as Record<string, unknown>).spare_requests as Record<string, unknown> | undefined;
    return { ...r, uid: req?.uid, req_type: req?.req_type, req_status: req?.status, req_engineer: req?.engineer, requested_at: req?.created_at };
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

// ---- consumption / feedback ------------------------------------------------
export async function addConsumption(row: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('spare_consumption').insert(row);
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function addFeedback(row: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('feedback').insert(row);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---- auth (email + password) ----------------------------------------------
export interface Profile {
  id: string; email: string; full_name: string; role: string;
  designation?: string; engineer_code?: string;
  reporting_manager_email?: string; regional_manager_email?: string; active?: boolean;
}

export async function sbSignIn(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().auth.signInWithPassword({ email: email.trim(), password });
  return error ? { ok: false, error: error.message } : { ok: true };
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
  // No profile row yet — fall back to a minimal one from the auth identity.
  return { id: user.id, email: user.email ?? '', full_name: user.email ?? '', role: 'engineer' };
}
// All profiles the current user may see (admins: everyone; others: themselves).
export async function sbListProfiles(): Promise<Profile[]> {
  const c = getSupabase(); if (!c) return [];
  const { data, error } = await c.from('profiles').select('*').order('full_name');
  if (error) return [];
  return (data ?? []) as Profile[];
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
    if (error) return { ok: false, error: error.message };
    return { ok: true, count: count ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

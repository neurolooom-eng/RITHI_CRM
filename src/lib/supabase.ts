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
  // Denormalised call state (0014) — rides along with every call the register
  // already loads, so no second query is needed to colour the list.
  out.callState = row.open_state ?? '';
  out.lastStatus = row.last_status ?? '';
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
    let q = must().from('calls').select('*').order('id', { ascending: false }).range(from, Math.min(from + PAGE, limit) - 1);
    if (callType) q = q.eq('call_type', callType);
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
  let q = must().from('calls').select('*').order('id', { ascending: false }).limit(limit);
  if (callType) q = q.eq('call_type', callType);
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
export async function listCallRequests(limit = 2000): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('call_requests').select('*')
    .order('submitted_at', { ascending: false }).limit(limit);
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r) => ({
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
export type CallState = 'Unattended' | 'Unsolved' | 'Report pending' | 'Solved';
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
    out.push(...rows.map((r) => ({ ...dbToCall(r), state: String(r.open_state ?? '') })));
    if (rows.length < PAGE) break;
  }
  return out;
}

// Open calls on any of these serials (or parties, when a request has no
// serial) — the Hotline's "is there already a call for this?" check.
export async function openCallsFor(serials: string[], parties: string[] = []): Promise<OpenCall[]> {
  const c = must();
  const ser = [...new Set(serials.map((s) => s.trim()).filter(Boolean))];
  const par = [...new Set(parties.map((s) => s.trim()).filter(Boolean))];
  if (!ser.length && !par.length) return [];

  const rows: Record<string, unknown>[] = [];
  const cols = 'ucn,call_type,party_name,product_name,serial,allocated_to,reg_date,complaint_reported,open_state';
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
    byUcn.set(ucn, {
      ucn, callType: String(r.call_type ?? ''), partyName: String(r.party_name ?? ''),
      productName: String(r.product_name ?? ''), serial: String(r.serial ?? ''),
      allocatedTo: String(r.allocated_to ?? ''), regDate: String(r.reg_date ?? ''),
      complaint: String(r.complaint_reported ?? ''),
      state: (String(r.open_state ?? 'Unattended') as Exclude<CallState, 'Solved'>),
    });
  });
  return [...byUcn.values()].sort((a, b) => (b.regDate || '').localeCompare(a.regDate || ''));
}

// Does this UCN exist? (manual mapping is free text, so it is worth checking.)
export async function callByUcn(ucn: string): Promise<Record<string, unknown> | null> {
  const { data } = await must().from('calls').select('*').eq('ucn', ucn).maybeSingle();
  return data ? dbToCall(data) : null;
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
    }));
    if (rows.length < PAGE) break;
  }
  return out;
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
// Latest visit for a UCN (reports is history; ucn is no longer unique).
export async function getReport(ucn: string): Promise<{ row: Record<string, unknown> | null }> {
  const { data, error } = await must().from('reports').select('*').eq('ucn', ucn).order('visit_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(1).maybeSingle();
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
  const { data, error } = await must().from('reports').select('*').eq('ucn', ucn).order('visit_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(200);
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}
// Each Update Call is a new VISIT row (reports = history), keyed by a fresh uid.
export async function saveReport(ucn: string, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const uid = `WEB-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  const row = { uid, ucn, ...patch, updated_at: new Date().toISOString() };
  const { error } = await must().from('reports').insert(row);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}
// The latest visit row for a UCN (most recent report), for history/context.
export async function latestReport(ucn: string): Promise<Record<string, unknown> | null> {
  const { data } = await must().from('reports').select('*').eq('ucn', ucn).order('visit_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(1).maybeSingle();
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
    const { data, error } = await c.from('masters').select('name,value').order('name').range(from, from + PAGE - 1);
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
export interface MasterItem { id: number; name: string; value: string; extra: Record<string, string>; added_on: string | null; added_by: string }

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
  }));
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
  const { data, error } = await must().from('reports').select('*').eq('call_number', callNumber).order('visit_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(200);
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
    // Same flattening as the register: the request owns the workflow columns.
    return {
      ...line, ...req, part: line.part, qty: line.qty,
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

// ---- consumption / feedback ------------------------------------------------
export async function listConsumptionRows(limit = 1000, offset = 0): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('spare_consumption').select('*').order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function addConsumption(row: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('spare_consumption').insert(row);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}
export async function addFeedback(row: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('feedback').insert(row);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---- auth (email + password) ----------------------------------------------
export interface Profile {
  id: string; email: string; full_name: string; role: string;
  designation?: string; engineer_code?: string;
  reporting_manager_email?: string; regional_manager_email?: string; active?: boolean;
  extra_permissions?: string[];
}

// Admin: set a user's role and/or extra per-user permissions.
export async function updateProfile(id: string, patch: { role?: string; extra_permissions?: string[] }): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  const { error } = await c.from('profiles').update(patch).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---- password reset --------------------------------------------------------
// A Supabase recovery link comes back as an implicit-flow fragment:
//   https://app/#access_token=…&refresh_token=…&type=recovery
// The app routes on the hash, so the tokens are grabbed synchronously at boot
// (before React or the router runs) and the URL is put back to "#/".
let pendingRecovery: { access: string; refresh: string } | null = null;
// An expired or already-used link comes back as #error=…&error_description=…
let recoveryError = '';

export function takeRecoveryFromUrl(): boolean {
  try {
    const raw = window.location.hash.replace(/^#\/?/, '');
    if (!raw.includes('access_token') && !raw.includes('error')) return false;
    const p = new URLSearchParams(raw);
    const access = p.get('access_token') ?? '';
    const refresh = p.get('refresh_token') ?? '';
    const isRecovery = (p.get('type') ?? '') === 'recovery';
    const err = p.get('error_description') ?? p.get('error') ?? '';
    window.location.hash = '#/';
    if (err) {
      recoveryError = /expired|invalid/i.test(err)
        ? 'That password-reset link has expired or was already used. Request a new one below.'
        : err.replace(/\+/g, ' ');
      return false;
    }
    if (!isRecovery || !access || !refresh) return false;
    pendingRecovery = { access, refresh };
    return true;
  } catch { return false; }
}
export const hasPendingRecovery = (): boolean => pendingRecovery !== null;
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
    if (error) return { ok: false, error: errMsg(error) };
    return { ok: true, count: count ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

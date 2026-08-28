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
// Coerce assorted date strings to YYYY-MM-DD (Postgres date); '' -> null.
function isoDate(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

// ---- calls ----------------------------------------------------------------
export async function listCalls(callType = '', limit = 500): Promise<Record<string, unknown>[]> {
  let q = must().from('calls').select('*').order('created_at', { ascending: false }).limit(limit);
  if (callType) q = q.eq('call_type', callType);
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

// ---- reports (Reporting-N equivalent) --------------------------------------
export async function getReport(ucn: string): Promise<{ row: Record<string, unknown> | null }> {
  const { data, error } = await must().from('reports').select('*').eq('ucn', ucn).maybeSingle();
  if (error) throw new Error(error.message);
  return { row: data ?? null };
}
export async function saveReport(ucn: string, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const row = { ucn, ...patch, updated_at: new Date().toISOString() };
  const { error } = await must().from('reports').upsert(row, { onConflict: 'ucn' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---- masters (dropdown value-lists) ----------------------------------------
export async function listMaster(name: string, limit = 3000): Promise<string[]> {
  const { data, error } = await must().from('masters').select('value').eq('name', name).limit(limit);
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

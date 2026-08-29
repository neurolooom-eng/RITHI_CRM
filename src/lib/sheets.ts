// ---------------------------------------------------------------------------
// Google Sheet connector.
// Talks to the Apps Script Web App (see apps-script/Code.gs) that is bound to
// the real "F_I Call Register" spreadsheet. The Sheet is the source of truth;
// this module reads and writes calls through the single Web App /exec URL.
//
// CORS note: Apps Script cannot answer a CORS pre-flight, so POSTs are sent as
// text/plain (a "simple" request that skips pre-flight). GET is simple already.
// ---------------------------------------------------------------------------

import { recordToRow, rowToRecord } from './fieldcall';
import * as sb from './supabase';

const URL_KEY = 'rithi.sheets.url';
const VER_KEY = 'rithi.sheets.urlVersion';
const TAB_KEY = 'rithi.sheets.tab';

// Default CallReg Web App URL, shipped so every device/user is connected
// out-of-the-box. Bump DEFAULT_URL_VERSION whenever the URL changes — clients
// on an older version adopt the new default automatically (their stale saved
// URL is superseded until they explicitly Save a new one in Settings).
const DEFAULT_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwyUqmnGQWf33pYcGeoKTUZo09saJearX53Qeyb7wOira2XTayZO5rjWloP9y1B1FQN/exec';
const DEFAULT_URL_VERSION = 7;

export function getSheetsUrl(): string {
  try {
    const stored = localStorage.getItem(URL_KEY) ?? '';
    const ver = Number(localStorage.getItem(VER_KEY) ?? '0');
    if (!stored || ver < DEFAULT_URL_VERSION) return DEFAULT_SHEETS_URL;
    return stored;
  } catch {
    return DEFAULT_SHEETS_URL;
  }
}

export function setSheetsUrl(url: string): void {
  try {
    localStorage.setItem(URL_KEY, url.trim());
    localStorage.setItem(VER_KEY, String(DEFAULT_URL_VERSION));
  } catch { /* ignore */ }
}

// The tab (worksheet) name the Field Call Register reads/writes. Empty = let
// CallReg auto-detect the tab with a "UC Number" header.
export function getSheetsTab(): string {
  try {
    // Default to the FIELD intake tab when nothing is chosen yet.
    return localStorage.getItem(TAB_KEY) ?? 'FIELD';
  } catch {
    return 'FIELD';
  }
}

export function setSheetsTab(tab: string): void {
  localStorage.setItem(TAB_KEY, tab.trim());
}

export function sheetsConfigured(): boolean {
  return /^https:\/\/script\.google(usercontent)?\.com\//.test(getSheetsUrl());
}

export interface PingResult {
  ok: boolean;
  sheet?: string;
  headers?: string[];
  count?: number;
  tabs?: string[];
  error?: string;
}

async function getJson(params: Record<string, string>): Promise<Record<string, unknown>> {
  const base = getSheetsUrl();
  if (!base) throw new Error('No Google Sheet URL configured (Settings → Google Sheet Connection).');
  const tab = getSheetsTab();
  if (tab && !params.tab) params.tab = tab;
  const qs = new URLSearchParams(params).toString();
  const url = `${base}?${qs}`;
  // Try fetch with a short timeout; Apps Script frequently can't satisfy the
  // browser's CORS check, in which case fetch may hang or throw. Either way we
  // fall back to JSONP (a <script> load), which is not subject to CORS.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Sheet responded ${res.status}`);
    return await res.json();
  } catch {
    clearTimeout(timer);
    return jsonp(url);
  }
}

// JSONP loader — CallReg wraps its GET reply in callback(...) when ?callback= is set.
function jsonp(url: string, timeoutMs = 45000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const cb = '__callreg_cb_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const w = window as unknown as Record<string, unknown>;
    const cleanup = () => {
      clearTimeout(timer);
      delete w[cb];
      script.remove();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Request timed out — check the CallReg deployment access is "Anyone".'));
    }, timeoutMs);
    w[cb] = (data: Record<string, unknown>) => {
      cleanup();
      resolve(data);
    };
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    script.onerror = () => {
      cleanup();
      reject(new Error('Could not load from the sheet (network or deployment access).'));
    };
    document.body.appendChild(script);
  });
}

async function postJson(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const base = getSheetsUrl();
  if (!base) throw new Error('No Google Sheet URL configured (Settings → Google Sheet Connection).');
  const tab = getSheetsTab();
  if (tab && body.tab === undefined) body = { ...body, tab };
  // Note: no custom Content-Type header -> browser sends text/plain -> no pre-flight.
  const res = await fetch(base, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' });
  if (!res.ok) throw new Error(`Sheet responded ${res.status}`);
  return res.json();
}

export async function pingSheet(): Promise<PingResult> {
  try {
    const r = (await getJson({ action: 'ping' })) as unknown as PingResult;
    return r;
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}

// List calls from a tab. Returns records keyed by app keys.
export async function listFieldCalls(type = '', limit = 0, tab = ''): Promise<Record<string, unknown>[]> {
  if (sb.supabaseConfigured()) return sb.listCalls(sb.callTypeForTab(tab), limit || 2000);
  const params: Record<string, string> = { action: 'list' };
  if (type) params.type = type;
  if (limit) params.limit = String(limit);
  if (tab) params.tab = tab;
  const r = await getJson(params);
  if (!r.ok) throw new Error(String(r.error ?? 'list failed'));
  const rows = (r.rows as Record<string, unknown>[]) ?? [];
  return rows.map(rowToRecord);
}

export interface AddResult {
  ok: boolean;
  ucn?: string;
  record?: Record<string, unknown>;
  error?: string;
}

// Add a new call. `record` is keyed by app keys; UCN + reg date are assigned
// by the server so the number is unique against the live sheet.
export async function addFieldCall(record: Record<string, unknown>, tab = ''): Promise<AddResult> {
  if (sb.supabaseConfigured()) {
    const rec = { ...record };
    if (!rec.callType && tab) rec.callType = sb.callTypeForTab(tab);
    return sb.addCall(rec);
  }
  const call = recordToRow(record);
  // Sent over GET (JSONP-capable) so writes work even when the browser blocks
  // reading a cross-origin POST response.
  const params: Record<string, string> = { action: 'add', data: JSON.stringify(call) };
  if (tab) params.tab = tab;
  const r = await getJson(params);
  if (!r.ok) return { ok: false, error: String(r.error ?? 'add failed') };
  return { ok: true, ucn: String(r.ucn ?? ''), record: rowToRecord((r.row as Record<string, unknown>) ?? {}) };
}

// ---- Product Master lookup (cascade: Party -> Product -> Serial) ----------
export async function listParties(): Promise<string[]> {
  if (sb.supabaseConfigured()) return sb.sbListParties();
  const r = await getJson({ action: 'parties' });
  if (!r.ok) throw new Error(String(r.error ?? 'parties failed'));
  return (r.values as string[]) ?? [];
}

export async function listPartyProducts(party: string): Promise<string[]> {
  if (sb.supabaseConfigured()) return sb.sbListPartyProducts(party);
  const r = await getJson({ action: 'products', party });
  if (!r.ok) throw new Error(String(r.error ?? 'products failed'));
  return (r.values as string[]) ?? [];
}

export async function listPartyItems(party: string, product = ''): Promise<Record<string, unknown>[]> {
  if (sb.supabaseConfigured()) return sb.sbListPartyItems(party, product);
  const r = await getJson({ action: 'items', party, product });
  if (!r.ok) throw new Error(String(r.error ?? 'items failed'));
  return (r.rows as Record<string, unknown>[]) ?? [];
}

export interface ProdFilters {
  q?: string;       // global (party / product / serial / code)
  party?: string;
  product?: string;
  serial?: string;
  status?: string;  // exact Item Status (WGP/OGP/CMC/AMC)
}

// Product Master search. Explicit fields + optional global q; empty = browse.
export async function searchProducts(filters: ProdFilters | string = {}, limit = 100): Promise<Record<string, unknown>[]> {
  const f: ProdFilters = typeof filters === 'string' ? { q: filters } : filters;
  if (sb.supabaseConfigured()) return sb.sbSearchProducts(f, limit);
  const params: Record<string, string> = { action: 'prodsearch', limit: String(limit) };
  (['q', 'party', 'product', 'serial', 'status'] as const).forEach((k) => {
    const v = f[k];
    if (v && String(v).trim()) params[k] = String(v).trim();
  });
  const r = await getJson(params);
  if (!r.ok) throw new Error(String(r.error ?? 'product search failed'));
  return (r.rows as Record<string, unknown>[]) ?? [];
}

// ---- User Master auth (via CallReg; GET so the JSONP fallback covers CORS) --
export interface SheetUser {
  name: string;
  email: string;
  gmail: string;
  designation: string;
  region: string;
  rm: string;
  rgm: string;
}
export interface AuthResult {
  ok: boolean;
  needsPassword?: boolean;
  user?: SheetUser;
  error?: string;
}

export async function authLogin(id: string, password: string): Promise<AuthResult> {
  const r = await getJson({ action: 'auth', mode: 'login', id, password });
  return r as unknown as AuthResult;
}

export async function authSetPassword(id: string, password: string): Promise<AuthResult> {
  const r = await getJson({ action: 'auth', mode: 'setpassword', id, password });
  return r as unknown as AuthResult;
}

// ---- Admin config: sheet links stored in the backend + verification -------
export interface SheetConfig {
  register?: string;
  prodmaster?: string;
  partymaster?: string;
  usermaster?: string;
  crn?: string;
  sparereq?: string;
  consumption?: string;
  feedback?: string;
  itemmaster?: string;
}
export interface ConfigCheck {
  ok: boolean;
  name?: string;
  tabs?: string[];
  error?: string;
}

export async function getConfig(): Promise<SheetConfig> {
  const r = await getJson({ action: 'config' });
  return (r.config as SheetConfig) ?? {};
}
export async function setConfig(cfg: SheetConfig): Promise<SheetConfig> {
  const r = await getJson({ action: 'setconfig', data: JSON.stringify(cfg) });
  return (r.config as SheetConfig) ?? {};
}
export async function checkConfig(): Promise<Record<string, ConfigCheck>> {
  const r = await getJson({ action: 'configcheck' });
  return (r.checks as Record<string, ConfigCheck>) ?? {};
}

// ---- Call Registration Request workflow ------------------------------------
export async function listPending(limit = 200): Promise<Record<string, unknown>[]> {
  const r = await getJson({ action: 'pending', limit: String(limit) });
  if (!r.ok) throw new Error(String(r.error ?? 'pending failed'));
  return (r.rows as Record<string, unknown>[]) ?? [];
}
export async function addCrnRequest(data: Record<string, unknown>): Promise<boolean> {
  const r = await getJson({ action: 'crnrequest', data: JSON.stringify(data) });
  return !!r.ok;
}
export async function setPendingUcn(row: number, ucn: string): Promise<boolean> {
  const r = await getJson({ action: 'setucn', uid: String(row), ucn });
  return !!r.ok;
}

// User Master directory (all users, regardless of Validity).
export async function listUsers(q = '', limit = 300): Promise<Record<string, unknown>[]> {
  const r = await getJson({ action: 'users', q, limit: String(limit) });
  if (!r.ok) throw new Error(String(r.error ?? 'users failed'));
  return (r.rows as Record<string, unknown>[]) ?? [];
}

// ---- Shared table views (admin "default for everyone") ---------------------
export interface TableView {
  order?: string[];
  widths?: Record<string, number>;
  hidden?: string[];
}

export async function getView(key: string): Promise<TableView | null> {
  try {
    const r = await getJson({ action: 'getview', key });
    return r.ok ? ((r.view as TableView) ?? null) : null;
  } catch {
    return null;
  }
}

export async function setView(key: string, view: TableView): Promise<boolean> {
  try {
    const r = await getJson({ action: 'setview', key, data: JSON.stringify(view) });
    return !!r.ok;
  } catch {
    return false;
  }
}

// Read a tab's rows as raw header-keyed objects (schema-agnostic; used by Call
// Updation over the Reporting-N tab and any other tab).
export async function listTabRows(tab: string, limit = 300, type = '', book = ''): Promise<Record<string, unknown>[]> {
  const params: Record<string, string> = { action: 'list', tab };
  if (type) params.type = type;
  if (limit) params.limit = String(limit);
  if (book) params.book = book;
  const r = await getJson(params);
  if (!r.ok) throw new Error(String(r.error ?? 'list failed'));
  return (r.rows as Record<string, unknown>[]) ?? [];
}

// Update a row in a tab by UC Number; `patch` is already header-keyed (raw).
export async function updateTabRow(ucn: string, patch: Record<string, unknown>, tab: string): Promise<boolean> {
  const r = await getJson({ action: 'update', ucn, patch: JSON.stringify(patch), tab });
  return !!r.ok;
}

// ---- Call reporting (Reporting-N tab) -------------------------------------
export interface CallReport {
  headers: string[]; // Reporting-N column headers (to build the form)
  row: Record<string, unknown>; // existing report for this UCN ({} if none yet)
}

// Fetch the Reporting-N schema + the existing report row for a UCN.
// Resilient: if `reportget` is slow/unsupported (e.g. an older CallReg
// deployment), fall back to reading just the Reporting-N headers so the report
// form still opens (with an empty existing row) instead of hanging on load.
export async function getReport(ucn: string): Promise<CallReport> {
  try {
    const r = await getJson({ action: 'reportget', ucn });
    const headers = (r.headers as string[]) ?? [];
    if (r.ok && headers.length) return { headers, row: (r.row as Record<string, unknown>) ?? {} };
    // Backend answered but without the reportget action / empty schema — fall
    // through to reading the tab schema directly.
  } catch { /* network/timeout — fall through to schema-only */ }
  const headers = await tabMeta('Reporting-N');
  return { headers, row: {} };
}

// Upsert a call report into Reporting-N by UC Number (update in place, else
// append). Falls back to the raw tab update on older deployments that don't yet
// expose the 'report' action.
export async function saveReport(ucn: string, patch: Record<string, unknown>): Promise<{ ok: boolean; mode?: string; error?: string }> {
  const r = await getJson({ action: 'report', ucn, patch: JSON.stringify(patch) });
  if (r.ok) return { ok: true, mode: String(r.mode ?? '') };
  if (String(r.error ?? '').toLowerCase().includes('unknown action')) {
    const ok = await updateTabRow(ucn, patch, 'Reporting-N');
    return ok ? { ok: true, mode: 'updated' } : { ok: false, error: 'Update failed — the call may not have a Reporting-N row yet (redeploy CallReg to enable appends).' };
  }
  return { ok: false, error: String(r.error ?? 'report failed') };
}

// ---- Generic tab helpers (call-report sub-forms: v2Consumption / v2Feedback)
// A `book` selects the spreadsheet: '' / 'register' → the Call Register; any
// other value resolves to a script-property cfg_<book> spreadsheet id if set.

// Column headers of a tab (so the app can build the matching sub-form).
export async function tabMeta(tab: string, book = ''): Promise<string[]> {
  const p: Record<string, string> = { action: 'tabmeta', tab };
  if (book) p.book = book;
  const r = await getJson(p);
  if (!r.ok) throw new Error(String(r.error ?? 'tabmeta failed'));
  return (r.headers as string[]) ?? [];
}

// Append one header-mapped row to a tab.
export async function tabAppend(tab: string, data: Record<string, unknown>, book = ''): Promise<{ ok: boolean; error?: string }> {
  const p: Record<string, string> = { action: 'tabappend', tab, data: JSON.stringify(data) };
  if (book) p.book = book;
  const r = await getJson(p);
  return r.ok ? { ok: true } : { ok: false, error: String(r.error ?? 'append failed') };
}

// ---- Master value lists (Party / Product / Standard Complaint / Call Type) --
// Distinct values of a configured master column, for form dropdowns.
export async function listMaster(name: string, limit = 3000): Promise<string[]> {
  if (sb.supabaseConfigured()) return sb.listMaster(name, limit);
  const r = await getJson({ action: 'master', name, limit: String(limit) });
  if (!r.ok) throw new Error(String(r.error ?? 'master failed'));
  return (r.values as string[]) ?? [];
}

export interface MasterEntry { id?: string; book?: string; tab?: string; col?: string }
export async function getMasters(): Promise<Record<string, MasterEntry>> {
  const r = await getJson({ action: 'masters' });
  return r.ok ? ((r.registry as Record<string, MasterEntry>) ?? {}) : {};
}
export async function setMasters(data: Record<string, MasterEntry>): Promise<boolean> {
  const r = await getJson({ action: 'setmasters', data: JSON.stringify(data) });
  return !!r.ok;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const s = String(reader.result); const i = s.indexOf(','); resolve(i >= 0 ? s.slice(i + 1) : s); };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

// Upload a manual report file: POSTs the file (base64) to CallReg, which stores
// it in Drive and writes the link into the report's `column` on Reporting-N.
// The POST response is opaque cross-origin, so the caller confirms by re-reading
// the report (getReport) to pick up the stored link.
export async function uploadManualReport(ucn: string, column: string, file: File): Promise<{ ok: boolean; error?: string }> {
  const base = getSheetsUrl();
  if (!base) return { ok: false, error: 'No Google Sheet URL configured.' };
  try {
    const dataBase64 = await fileToBase64(file);
    await fetch(base, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({ action: 'upload', ucn, column, filename: file.name, mimeType: file.type || 'application/octet-stream', dataBase64 }),
      redirect: 'follow',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Patch an existing call by UCN (record keyed by app keys).
export async function updateFieldCall(ucn: string, patch: Record<string, unknown>, tab = ''): Promise<AddResult> {
  const params: Record<string, string> = { action: 'update', ucn, patch: JSON.stringify(recordToRow(patch)) };
  if (tab) params.tab = tab;
  const r = await getJson(params);
  if (!r.ok) return { ok: false, error: String(r.error ?? 'update failed') };
  return { ok: true, ucn };
}

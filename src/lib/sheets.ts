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

const URL_KEY = 'rithi.sheets.url';
const TAB_KEY = 'rithi.sheets.tab';

export function getSheetsUrl(): string {
  try {
    return localStorage.getItem(URL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setSheetsUrl(url: string): void {
  localStorage.setItem(URL_KEY, url.trim());
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
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!res.ok) throw new Error(`Sheet responded ${res.status}`);
    return await res.json();
  } catch {
    // Apps Script often can't satisfy the browser's CORS check on fetch reads;
    // fall back to JSONP (a <script> load), which is not subject to CORS.
    return jsonp(url);
  }
}

// JSONP loader — CallReg wraps its GET reply in callback(...) when ?callback= is set.
function jsonp(url: string, timeoutMs = 30000): Promise<Record<string, unknown>> {
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
  const call = recordToRow(record);
  const r = await postJson({ action: 'add', call, ...(tab ? { tab } : {}) });
  if (!r.ok) return { ok: false, error: String(r.error ?? 'add failed') };
  return { ok: true, ucn: String(r.ucn ?? ''), record: rowToRecord((r.row as Record<string, unknown>) ?? {}) };
}

// ---- Product Master lookup (cascade: Party -> Product -> Serial) ----------
export async function listParties(): Promise<string[]> {
  const r = await getJson({ action: 'parties' });
  if (!r.ok) throw new Error(String(r.error ?? 'parties failed'));
  return (r.values as string[]) ?? [];
}

export async function listPartyProducts(party: string): Promise<string[]> {
  const r = await getJson({ action: 'products', party });
  if (!r.ok) throw new Error(String(r.error ?? 'products failed'));
  return (r.values as string[]) ?? [];
}

export async function listPartyItems(party: string, product = ''): Promise<Record<string, unknown>[]> {
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

// Patch an existing call by UCN (record keyed by app keys).
export async function updateFieldCall(ucn: string, patch: Record<string, unknown>, tab = ''): Promise<AddResult> {
  const r = await postJson({ action: 'update', ucn, patch: recordToRow(patch), ...(tab ? { tab } : {}) });
  if (!r.ok) return { ok: false, error: String(r.error ?? 'update failed') };
  return { ok: true, ucn };
}

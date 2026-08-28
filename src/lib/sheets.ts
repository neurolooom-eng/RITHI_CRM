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

export function sheetsConfigured(): boolean {
  return /^https:\/\/script\.google(usercontent)?\.com\//.test(getSheetsUrl());
}

export interface PingResult {
  ok: boolean;
  sheet?: string;
  headers?: string[];
  count?: number;
  error?: string;
}

async function getJson(params: Record<string, string>): Promise<Record<string, unknown>> {
  const base = getSheetsUrl();
  if (!base) throw new Error('No Google Sheet URL configured (Settings → Google Sheet Connection).');
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${base}?${qs}`, { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error(`Sheet responded ${res.status}`);
  return res.json();
}

async function postJson(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const base = getSheetsUrl();
  if (!base) throw new Error('No Google Sheet URL configured (Settings → Google Sheet Connection).');
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

// List calls (default: only FIELD type). Returns records keyed by app keys.
export async function listFieldCalls(type = 'FIELD', limit = 0): Promise<Record<string, unknown>[]> {
  const params: Record<string, string> = { action: 'list' };
  if (type) params.type = type;
  if (limit) params.limit = String(limit);
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
export async function addFieldCall(record: Record<string, unknown>): Promise<AddResult> {
  const call = recordToRow(record);
  const r = await postJson({ action: 'add', call });
  if (!r.ok) return { ok: false, error: String(r.error ?? 'add failed') };
  return { ok: true, ucn: String(r.ucn ?? ''), record: rowToRecord((r.row as Record<string, unknown>) ?? {}) };
}

// Patch an existing call by UCN (record keyed by app keys).
export async function updateFieldCall(ucn: string, patch: Record<string, unknown>): Promise<AddResult> {
  const r = await postJson({ action: 'update', ucn, patch: recordToRow(patch) });
  if (!r.ok) return { ok: false, error: String(r.error ?? 'update failed') };
  return { ok: true, ucn };
}

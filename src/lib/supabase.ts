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

import { ffrWritable } from './ffr';
export { machineKey } from './machine';
import { machineKey } from './machine';
export { callFamily, callTable, type CallFamily } from './calltype';
import { byColumnSet, planConsumptionVisits } from './uploads';
import { callTable } from './calltype';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { manualMatchesCall } from './docmatch';
import { masterValueApplies } from './dccr';
import { callAging } from './aging';
import { rankSerialHits } from './callrequest';
import { manualReportLink } from './reports';

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
// The pager lives in ./paging — it is pure logic with no Supabase in it, which
// is the only way it can be TESTED: this file reads `import.meta.env` at load
// and cannot be imported by a node script at all.
import { allRows, PG_PAGE } from './paging';
import type { LoadedReport, ConvertWrite } from './reportMapping';
export { allRows, PG_PAGE };

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
  // WHO REGISTERED THE CALL, stamped by the database (calls_before_insert), not
  // by the app — the register has to be able to show that a call was raised by
  // somebody other than the Hotline engineer trained on the vigilance
  // questions. A UUID here; the table and the form resolve it to a name.
  out.createdBy = row.created_by ?? '';
  // ...and WHO WAS AT THE KEYBOARD (0114). `created_by` is the Hotline DESK a
  // call belongs to, which defaults to the trained engineer whoever typed it
  // in; this is the person who actually did. The two DISAGREEING is the
  // vigilance finding, so both are carried, both are shown, and neither is
  // settable by the app.
  out.actualCreatedBy = row.actual_created_by ?? '';
  // Denormalised call state (0014) — rides along with every call the register
  // already loads, so no second query is needed to colour the list.
  // A re-opened call is open again whatever its last visit said (0057).
  // Cancelled first: a call cancelled while it was re-opened is cancelled, and
  // it is not "Unattended" waiting for somebody to go (0108).
  out.callState = row.cancelled_at ? 'Cancelled' : row.reopened_at ? 'Reopened' : row.open_state ?? '';
  out.lastStatus = row.last_status ?? '';
  out.cancelledAt = row.cancelled_at ?? '';
  out.cancelReason = row.cancel_reason ?? '';
  out.reopenedAt = row.reopened_at ?? '';
  out.reopenCount = Number(row.reopen_count ?? 0);
  out.lastVisitAt = row.last_visit_at ?? '';
  // AGE, on the row rather than only in the cell, so the column sorts as a
  // NUMBER. Rendered text would sort "10 d" before "9 d", which on a register
  // people scan for the oldest call is worse than not offering the sort.
  const age = callAging(out as { regDate?: unknown; callState?: unknown; lastVisitAt?: unknown; cancelledAt?: unknown });
  out.agingDays = age.days;
  out.agingStopped = age.stopped;
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
//
// ALL 32 HEADINGS OF THE EXPORT (the user, 2026-09-14: "Product Database has to
// retain all Columns"), because retaining a value that no screen can show is
// not retaining it. 0194 gave the twenty-one that had none a column of their
// own; until then they were reachable only out of `extra`, under the file's
// spelling — which is why `Item Code` was a column on the Product Database
// screen and always came back BLANK: nothing ever put it there.
//
// COLUMN FIRST, `extra` SECOND, and the order is the whole point. The column is
// what this system holds and may have been corrected on screen; `extra` is what
// the FILE said, kept verbatim. Falling back to it means a project that has not
// run 0194 yet still shows everything it showed yesterday, so this file does
// not have to wait for that migration to reach the live database.
export function productRowToSheet(r: Record<string, unknown>): Record<string, unknown> {
  const ex = (r.extra as Record<string, unknown>) ?? {};
  const g = (k: string) => r[k] ?? '';
  // The column if it has anything, else the file's own word for it.
  const c = (k: string, heading: string) => {
    const v = r[k];
    return v === undefined || v === null || v === '' ? (ex[heading] ?? '') : v;
  };
  return {
    'Party Name': g('party_name'),
    'City': c('city', 'City'), 'State': c('state', 'State'), 'Address': c('address', 'Address'),
    'Item Name': g('item_name'), 'Item Serial Number': g('serial_number'), 'Item Status': g('item_status'),
    'Item Code': c('item_code', 'Item Code'),
    'Item Details Long': c('item_details_long', 'Item Details Long'),
    'Item Details': c('item_details', 'Item Details'),
    'Sold Through': c('sold_through', 'Sold Through'),
    'PO No.': c('po_no', 'PO No.'), 'PO Date': c('po_date', 'PO Date'),
    'Warranty Number': g('warranty_number'), 'Warranty Start Date': g('warranty_start'), 'Warranty End Date': g('warranty_end'),
    'Contract Number': g('contract_number'), 'Contract Start Date': g('contract_start'), 'Contract End Date': g('contract_end'),
    'Contract Type': g('contract_type'),
    // THE EXPORT'S OWN ACTIVE/INACTIVE, not the state computed from the dates
    // above. Named apart in the database (`*_keyed`) for exactly that reason,
    // and carried here under the heading the file uses.
    'Warranty Status': c('warranty_status_keyed', 'Warranty Status'),
    'Contract Status': c('contract_status_keyed', 'Contract Status'),
    'PM Visits': c('pm_visits', 'PM Visits'),
    'Other Details': c('other_details', 'Other Details'),
    'Service Engineer': c('service_engineer', 'Service Engineer'),
    'ProdFinal': c('prod_final', 'ProdFinal'),
    'Installation Completed?': c('installation_completed', 'Installation Completed?'),
    'INST Call': c('inst_call', 'INST Call'), 'INST Date': c('inst_date', 'INST Date'),
    'INST Call Status': c('inst_call_status', 'INST Call Status'),
    'Report': c('report', 'Report'),
    'Associated Accessory': c('associated_accessory', 'Associated Accessory'),
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

// Re-allot calls in one go. Written through the `calls` view, whose INSTEAD OF
// trigger routes each row to its own table (field / installation / PM), so one
// selection may span all three. Chunked: a very long `in` list is a very long
// URL, and PostgREST is not the place to find that out.
//
// Row-level security still decides: the update policy is
// `can_see_call(allocated_to)` on BOTH sides, so a manager may move a call they
// can see to someone they can see, and no further. The picker offers their own
// team for that reason — the database would refuse the rest anyway.
export async function reallocateCalls(
  ucns: string[], allocatedTo: string,
): Promise<{ ok: boolean; updated: number; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, updated: 0, error: 'Database not connected.' };
  const list = [...new Set(ucns.map((u) => String(u ?? '').trim()).filter(Boolean))];
  if (!list.length) return { ok: true, updated: 0 };
  const CH = 100;
  let updated = 0;
  for (let i = 0; i < list.length; i += CH) {
    const part = list.slice(i, i + CH);
    const { error } = await c.from('calls').update({ allocated_to: allocatedTo }).in('ucn', part);
    if (error) return { ok: false, updated, error: `${errMsg(error)} (${updated} moved before it stopped.)` };
    updated += part.length;
  }
  return { ok: true, updated };
}

// ---------------------------------------------------------------------------
// THE KPI WORKBOOK'S Field_INST TAB (0128).
//
// Read straight from the view, which does all of it: cancelled calls dropped,
// Open/Close from the current status, Call Attended On from the earlier of the
// first visit and the first spare, Call Solved from the entry that completed
// it. The view is security_invoker, so an engineer exports their own calls and
// a manager their team's — the same scope every other screen shows them.
//
// Paged, because a year of calls is thousands of rows and PostgREST caps a
// response at 1,000.
// ---------------------------------------------------------------------------
export interface KpiRange { from?: string; to?: string }

const kpiQuery = (range: KpiRange) => {
  let q = must().from('kpi_field_inst').select('*');
  // Ranged on the REGISTRATION date, which is what the workbook is built by
  // period on. `to` is inclusive of its whole day.
  if (range.from) q = q.gte('Call Registeration Date', range.from);
  if (range.to) q = q.lte('Call Registeration Date', `${range.to}T23:59:59.999+05:30`);
  return q;
};

export async function countKpiFieldInst(range: KpiRange = {}): Promise<number> {
  let q = must().from('kpi_field_inst').select('"UC Number"', { count: 'exact', head: true });
  if (range.from) q = q.gte('Call Registeration Date', range.from);
  if (range.to) q = q.lte('Call Registeration Date', `${range.to}T23:59:59.999+05:30`);
  const { count, error } = await q;
  if (error) throw new Error(errMsg(error));
  return count ?? 0;
}

export async function listKpiFieldInst(range: KpiRange = {}, offset = 0, limit = 1000): Promise<Record<string, unknown>[]> {
  const { data, error } = await kpiQuery(range)
    .order('Call Registeration Date', { ascending: true })
    // One row per call, so the UCN breaks a tie on the date (finding 15). This
    // read feeds a FILE, where a doubled or missing call cannot be seen.
    .order('UC Number', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// QUALITY & BUSINESS OBJECTIVES (0130). Twelve rows a year, read whole — there
// is no paging to do and no filter worth having.
// ---------------------------------------------------------------------------
export interface QualityObjective {
  id: number; year: number; sort_order: number; process: string; parameter: string;
  yearly_target: string; current_target: string; frequency: string; responsible: string;
  m01: number | null; m02: number | null; m03: number | null; m04: number | null;
  m05: number | null; m06: number | null; m07: number | null; m08: number | null;
  m09: number | null; m10: number | null; m11: number | null; m12: number | null;
  total: number | null; source: string; notes: string; updated_at: string;
  calc_key: string; calc_params: Record<string, unknown>;
}

export async function listQualityObjectives(year: number): Promise<QualityObjective[]> {
  const { data, error } = await must().from('quality_objectives').select('*')
    .eq('year', year).order('sort_order', { ascending: true });
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as QualityObjective[];
}

// RE-CALC — explicit, never on a page load. A figure that changes because
// somebody opened a screen is not a figure anybody can defend.
export async function recalcObjectives(
  year: number,
): Promise<{ ok: boolean; written?: { objective: string; months_written: number }[]; error?: string }> {
  // Re-Calculate READS the months' cut-offs; it does not set one. Two ways to
  // set the same thing is how a figure ends up disagreeing with the setting
  // that supposedly produced it.
  const { data, error } = await must().rpc('recalc_quality_objectives', { p_year: year });
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true, written: (data ?? []) as { objective: string; months_written: number }[] };
}

// ONE CUT-OFF PER MONTH, shared by every objective. A month with no row
// measures to the end of its own period.
export async function listObjectiveCutoffs(year: number): Promise<Record<number, string>> {
  const { data, error } = await must()
    .from('objective_cutoffs').select('month,cutoff_date').eq('year', year);
  if (error) return {};
  const out: Record<number, string> = {};
  for (const r of (data ?? []) as { month: number; cutoff_date: string }[]) out[r.month] = r.cutoff_date;
  return out;
}

// A null date CLEARS the month, putting it back to the end of its period —
// there has to be a way back, or the first mistyped date is permanent.
export async function setObjectiveCutoff(
  year: number, month: number, date: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().rpc('set_objective_cutoff', {
    p_year: year, p_month: month, p_date: date && date.trim() ? date.trim() : null,
  });
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true };
}

// THE CUT-OFF LOCK. An admin's switch over whether anyone else may re-base the
// objectives by moving the cut-off. Read by anyone; set by an administrator.
export async function objectiveCutoffLocked(): Promise<boolean> {
  const { data, error } = await must().rpc('objective_cutoff_locked');
  if (error) return false;   // a lock we cannot read is not a lock we enforce
  return Boolean(data);
}

export async function setObjectiveCutoffLock(on: boolean): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().rpc('set_objective_cutoff_lock', { p_on: on });
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true };
}

// THE ROWS BEHIND ONE FIGURE. The same query that produced the number, so the
// two cannot disagree — counting the evidence reproduces the fraction.
// ===========================================================================
// PAGED, AND AN RPC IS NOT EXEMPT FROM THE CAP.
//
// Reported 2026-09-24, from the banner this very call writes: "Downloaded the
// evidence for Preventive Maintenance Calls -- Sep: 1000 calls", and "i think
// it is calculating only for the first 1000 calls.. That should not be the
// case."
//
// THE FIGURE WAS NEVER CAPPED, and that is the first thing to be clear about:
// the objectives are computed by `recalc_quality_objectives()` in PL/pgSQL --
// `count(*)` over the register inside Postgres -- and nothing about a client
// page size reaches it. What WAS capped is this: the evidence behind the
// figure, which comes back through PostgREST like any other read, and PostgREST
// answers at most 1,000 rows however many the function returns. A `SETOF`
// function is a relation to it.
//
// So the number was right and its evidence was short -- which is the worse
// shape of the two, because the file is what somebody checks the number
// AGAINST. A thousand rows under a figure computed from four thousand does not
// disprove the figure; it makes it impossible to confirm, and it reads as if
// the figure were wrong.
//
// `Range` works on an RPC exactly as it does on a table, so `allRows()` pages
// it the same way as everything else.
// ===========================================================================
export async function objectiveEvidence(id: number, month: number): Promise<Record<string, unknown>[]> {
  return allRows<Record<string, unknown>>((from, to) =>
    must().rpc('objective_evidence', { p_id: id, p_month: month }).range(from, to));
}

// ---------------------------------------------------------------------------
// THE TRACKER — the shared activity list. One permission (mod:/tracker) grants
// the page AND the right to add and edit, so there is no separate "may I write"
// check here: the database policy is the whole of it, and a row that comes back
// is a row this user may change.
// ---------------------------------------------------------------------------
export interface TrackerItem {
  id: number;
  title: string;
  detail: string;
  status: string;
  owner: string;
  area: string;
  due_date: string | null;
  sort_order: number;
  created_by_name: string;
  updated_by_name: string;
  created_at: string;
  updated_at: string;
  is_closed: boolean;
}

export async function listTrackerItems(): Promise<TrackerItem[]> {
  const { data, error } = await must()
    .from('tracker_list')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as TrackerItem[];
}

/** A new item, at the end of the list. `created_by` / `updated_by` are stamped
 *  by the database, never sent from here — they cannot be forgotten and cannot
 *  be set to somebody else. */
export async function addTrackerItem(
  patch: Partial<TrackerItem> & { sort_order?: number },
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const { data, error } = await must()
    .from('tracker_items')
    .insert({ title: 'New item', ...patch })
    .select('id')
    .single();
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true, id: Number(data?.id) };
}

export async function saveTrackerItem(
  id: number, patch: Partial<TrackerItem>,
): Promise<{ ok: boolean; error?: string }> {
  // ALLOW-LIST, not a deny-list. The row comes from a VIEW that carries joined
  // names and a computed `is_closed`; naming what may be written means a column
  // added to the view later cannot silently become an update that fails.
  const WRITABLE = ['title', 'detail', 'status', 'owner', 'area', 'due_date', 'sort_order'] as const;
  const rest = Object.fromEntries(
    Object.entries(patch).filter(([k]) => (WRITABLE as readonly string[]).includes(k)));
  const { error } = await must().from('tracker_items').update(rest).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

export async function deleteTrackerItem(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('tracker_items').delete().eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---------------------------------------------------------------------------
// THE CONSUMPTION REPORT. Filtered IN THE DATABASE and paged, because the
// register is far larger than one response: a filter applied after the fetch
// would narrow the first page and report it as the whole answer.
// ---------------------------------------------------------------------------
export interface ConsumptionReportQuery {
  from?: string; to?: string; product?: string; party?: string; city?: string;
  engineer?: string; part?: string; callType?: string; ucn?: string;
}

// The SELECT is passed in rather than fixed: a count wants
// `{ count: 'exact', head: true }`, and PostgREST only accepts those options on
// the FIRST select — chaining a second one onto a built filter is a type error
// and, worse, would silently not count.
function consumptionQuery(
  f: ConsumptionReportQuery,
  opts?: { count: 'exact'; head: true },
) {
  let q = opts
    ? must().from('consumption_report').select('*', opts)
    : must().from('consumption_report').select('*');
  if (f.from) q = q.gte('Call Date', f.from);
  if (f.to) q = q.lte('Call Date', f.to);
  if (f.product) q = q.ilike('Product', `%${f.product}%`);
  if (f.party) q = q.ilike('Customer', `%${f.party}%`);
  if (f.city) q = q.ilike('City', `%${f.city}%`);
  if (f.engineer) q = q.ilike('Visiting Service Engineer', `%${f.engineer}%`);
  if (f.ucn) q = q.ilike('UC Number', `%${f.ucn}%`);
  if (f.callType) q = q.ilike('Call Type', `%${f.callType}%`);
  // The part is ONE string in the table and two columns in the report, so a
  // search for "MP-010" and one for "OXYGEN SENSOR" both have to work. The
  // undivided column is what carries both.
  if (f.part) q = q.ilike('Part (code|description)', `%${f.part}%`);
  return q;
}

/** How many rows the filter matches — EXACT, from the database, so the button
 *  can say what it is about to export rather than what it has loaded. */
export async function countConsumptionReport(f: ConsumptionReportQuery): Promise<number> {
  const { count, error } = await consumptionQuery(f, { count: 'exact', head: true });
  if (error) throw new Error(errMsg(error));
  return count ?? 0;
}

/** Every matching row, paged until the register is exhausted. Supabase caps one
 *  response at ~1000 rows; a report that stopped there would be wrong and would
 *  not look it. */
export async function listConsumptionReport(
  f: ConsumptionReportQuery, onProgress?: (n: number) => void,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const { data, error } = await consumptionQuery(f)
      .order('Call Date', { ascending: false })
      .order('Line ID', { ascending: false })
      .range(offset, offset + page - 1);
    if (error) throw new Error(errMsg(error));
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    onProgress?.(out.length);
    if (rows.length < page) return out;
  }
}

// ---------------------------------------------------------------------------
// NOT USED AS PER THE REQUEST — the same shape as the consumption report above,
// for the same reasons: the filter runs in the DATABASE and the count is exact,
// so the button says what it is about to export rather than what it has loaded.
// ---------------------------------------------------------------------------
export interface UnusedSpareQuery { from?: string; to?: string; engineer?: string; product?: string; part?: string }

function unusedQuery(f: UnusedSpareQuery, opts?: { count: 'exact'; head: true }) {
  let q = opts
    ? must().from('unused_spare_report').select('*', opts)
    : must().from('unused_spare_report').select('*');
  // Dated by when the part was SENT, not when the call was raised: the question
  // is about the part's journey, and a call opened in January can be sent a
  // part in March.
  if (f.from) q = q.gte('Dispatched On', f.from);
  if (f.to) q = q.lte('Dispatched On', f.to);
  if (f.engineer) q = q.ilike('Engineer', `%${f.engineer}%`);
  if (f.product) q = q.ilike('Product', `%${f.product}%`);
  if (f.part) q = q.ilike('Part Code', `%${f.part}%`);
  return q;
}

export async function countUnusedSpares(f: UnusedSpareQuery): Promise<number> {
  const { count, error } = await unusedQuery(f, { count: 'exact', head: true });
  if (error) throw new Error(errMsg(error));
  return count ?? 0;
}

/** The engineers this report can actually offer, from the report itself.
 *
 *  FROM THE VIEW, NOT THE DIRECTORY. A dropdown built from every engineer on
 *  the system offers dozens of names that return nothing — a filter whose
 *  options mostly produce an empty screen teaches people not to use it.
 *
 *  SPLIT, BECAUSE THE VIEW AGGREGATES. A part sent on two orders by two
 *  engineers comes back as "ENG A, ENG B" (the view joins them rather than
 *  picking one, so neither is hidden from whoever has to chase it). Offering
 *  that composite as an option would be nonsense; the names are split apart
 *  here, and each still matches its composite row because the filter is a
 *  contains-match. */
export async function unusedSpareEngineers(): Promise<string[]> {
  const c = getSupabase(); if (!c) return [];
  // PAGED, ordered by the report's own key. The result is a list of ENGINEER
  // NAMES for a filter, so a cap would quietly hide engineers rather than rows.
  let data: Record<string, unknown>[];
  try {
    data = await allRows<Record<string, unknown>>((a, b) =>
      // Ordered by the value it keeps (finding 15): `ucn` repeats, one call per
      // several parts, so its ties could drop a name at a page boundary.
      c.from('unused_spare_report').select('Engineer').order('Engineer', { ascending: true, nullsFirst: false }).range(a, b), 20000);
  } catch { return []; }
  const names = new Set<string>();
  data.forEach((r) => {
    String((r as Record<string, unknown>).Engineer ?? '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .forEach((n) => names.add(n));
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}

export async function listUnusedSpares(
  f: UnusedSpareQuery, onProgress?: (n: number) => void,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const { data, error } = await unusedQuery(f)
      .order('Dispatched On', { ascending: false })
      .order('ucn', { ascending: false })
      // The view is one row per call AND part (0147 groups by both), so the part
      // code completes the key; `ucn` alone ties on every multi-part call (15).
      .order('Part Code', { ascending: true })
      .range(offset, offset + page - 1);
    if (error) throw new Error(errMsg(error));
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    onProgress?.(out.length);
    if (rows.length < page) return out;
  }
}

// ---------------------------------------------------------------------------
// SPARE INSIGHTS — five breakdowns of one date window, in one round trip.
// The function is SECURITY INVOKER, so what comes back is scoped to the
// reader's own consumption rights (0148).
// ---------------------------------------------------------------------------
export interface SpareInsight {
  from: string; to: string;
  total: { qty: number; lines: number; parts: number; calls: number; unclassified_lines: number; unclassified_qty: number };
  by_part: { part_code: string; part_name: string; qty: number; calls: number; category: string }[];
  by_cover: { cover: string; qty: number; calls: number; lines: number }[];
  by_product: { product: string; qty: number; lines: number; calls: number; parts: number }[];
  by_category: { category: string; qty: number; lines: number; parts: number }[];
  by_month: { month: string; qty: number }[];
}

export async function spareInsights(from: string, to: string): Promise<SpareInsight> {
  const { data, error } = await must().rpc('spare_insights', { p_from: from, p_to: to });
  if (error) throw new Error(errMsg(error));
  return data as SpareInsight;
}

/** Part Master's Consumable / Spare setting. '' means nobody has said yet, and
 *  the insight reports those lines as Unclassified rather than guessing. */
export async function setPartCategory(id: number, category: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('parts').update({ category }).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// THE ASSUMPTIONS AND THE HARD STOPS behind one figure, in words. A second
// call rather than more columns on the evidence: these are derived from the
// objective's own definition, not from the rows, so they cannot drift out of
// step with the number the way a hand-written note in the page would.
export async function objectiveNotes(id: number, month: number): Promise<{ kind: string; note: string }[]> {
  const { data, error } = await must().rpc('objective_notes', { p_id: id, p_month: month });
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as { kind: string; note: string }[];
}

// The window one figure is measured over — a month, or a whole quarter on a
// quarterly objective. `applies` is false for the two months of a quarter that
// carry no figure.
export async function objectivePeriod(
  id: number, month: number,
): Promise<ObjectivePeriod | null> {
  const { data, error } = await must().rpc('objective_period', { p_id: id, p_month: month });
  if (error) throw new Error(errMsg(error));
  return ((data ?? []) as ObjectivePeriod[])[0] ?? null;
}

// The window, AND the date a solve must be recorded by. The two are separate on
// purpose: a cut-off must never change which calls are counted, only how many
// of them were closed in time.
export interface ObjectivePeriod {
  applies: boolean;
  period_start: string | null;
  period_end: string | null;
  solve_cutoff: string | null;
  label: string;
  cutoff_note: string;
}

// An objective's definition — everything except the twelve figures. Editable
// by an administrator, because none of it should be baked into a migration.
export async function saveObjectiveDef(
  id: number, patch: Partial<QualityObjective>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('quality_objectives').update(patch).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

export async function addObjective(year: number, sort_order: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('quality_objectives')
    .insert({ year, sort_order, process: 'SERVICE', parameter: 'New objective', yearly_target: 'To Monitor', frequency: 'Monthly' });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

export async function deleteObjective(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('quality_objectives').delete().eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

export async function objectiveYears(): Promise<number[]> {
  const { data, error } = await must().from('quality_objectives').select('year');
  if (error) throw new Error(errMsg(error));
  return [...new Set((data ?? []).map((r) => Number((r as { year: number }).year)))].sort((a, b) => b - a);
}

// One cell at a time: the register is edited a figure at a time, and a whole-row
// save would make two people overwrite each other's month.
export async function saveObjectiveCell(
  id: number, field: string, value: number | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('quality_objectives').update({ [field]: value }).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---- Product Database (cascade + search) -------------------------------------
// Page through a single column past PostgREST's 1000-row response cap and return
// the distinct, sorted values. Used for the party / product / spare pick-lists,
// which have thousands of rows.
async function distinctColumn(table: string, column: string, opts?: { eq?: [string, unknown]; max?: number }): Promise<string[]> {
  const c = must();
  const set = new Set<string>();
  const PAGE = 1000; const max = opts?.max ?? 40000;
  for (let from = 0; from < max; from += PAGE) {
    // Ordered by the column itself (finding 8): only the VALUES are kept, and a
    // sorted column puts the same value at each position whatever order its ties
    // come in, so no value can fall between two pages.
    let q = c.from(table).select(column).order(column, { ascending: true, nullsFirst: false }).range(from, from + PAGE - 1);
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

/** The Party Master's Serviceman for one party, or '' (0200).
 *
 *  WHO LOOKS AFTER THIS CUSTOMER. It prefills "Call Allocated To" on a new
 *  call where the MACHINE has no Service Engineer of its own — the precedence
 *  the user chose: the machine still wins, the party answers where it cannot.
 *  That is the whole reason it exists, because an INSTALLATION reaches a
 *  customer who has no machine yet and the machine can never answer for it.
 *
 *  A FAILURE IS THE EMPTY STRING, never a throw. It is a courtesy on a form
 *  the user is about to fill in by hand: a party master not yet loaded, or a
 *  party nobody has recorded, must leave the box empty and cost nothing — not
 *  stop somebody registering a call. */
export async function sbPartyServiceEngineer(party: string): Promise<string> {
  const name = (party ?? '').trim();
  if (!name) return '';
  const c = getSupabase(); if (!c) return '';
  const { data, error } = await c.from('parties')
    .select('service_engineer').eq('name_key', name.toLowerCase()).maybeSingle();
  if (error || !data) return '';
  return String((data as { service_engineer?: string }).service_engineer ?? '').trim();
}

// ---------------------------------------------------------------------------
// THE CUSTOMER LIST IS SEARCHED, NEVER DOWNLOADED.
//
// It used to be downloaded whole — `product_party_names` paged a thousand rows
// at a time — and cached in the browser. That was still the wrong shape: three
// requests and a few hundred KB before the field worked at all, reported as
// EIGHT SECONDS on a phone (2026-09-10), and getting worse as the register grew.
//
// Searching costs one small request per keystroke instead, debounced, and it
// costs the same at fifty thousand customers as at two thousand. Measured on the
// seeded register (22,000 machines, 2,600 parties): a search is 0.4-1.5 ms and
// the empty first page 25 ms, against a full download that had to happen before
// anything could be typed.
//
// The download and the `productParty` master it fed are GONE rather than left
// unused: dead code that still looks alive is how somebody reintroduces the
// problem by calling the convenient-looking helper.
// ---------------------------------------------------------------------------
// SEARCH THE CUSTOMERS WHO OWN A MACHINE — and do it WITHOUT AGGREGATING.
//
// This used to read `product_party_names`, which is `GROUP BY party_name` over
// the whole products register. An aggregate cannot stop early: to return fifty
// names it had to visit EVERY product row the term matched, and a short term
// matches most of them. That is what timed out on a phone
// ("Vada", 2026-09-11) while the PRODUCT picker beside it stayed instant — and
// the difference was never the network. The product list is about forty names,
// so it is fetched ONCE and filtered in the browser; there is no product search.
// The customers are five thousand names over nineteen thousand machines, so
// every keystroke went to the server, and went the expensive way.
//
// Reading the rows with a LIMIT lets the scan STOP as soon as it has enough,
// and the duplicates are collapsed here, where it costs nothing. Measured on
// 19,253 machines over 4,851 customers, as a signed-in engineer:
//
//     "HOSP"              25.6 ms  ->  2.4 ms
//     "CRITICARE TRAUMA"   6.2 ms  ->  1.9 ms
//     Party Master, in parallel:  0.1 - 4.4 ms
//
// SCAN_CAP is what bounds the work, and capping is the whole saving: ORDERING
// the filtered read does not stop early -- it must find every match before it
// can sort (16.8 ms for "HOSP", 47 ms for "a"), which is the same cost the
// aggregate was paying. So this read is capped and UNORDERED, and the names are
// sorted here.
//
// WHAT THE CAP COULD COST, AND WHY IT DOES NOT. A capped read can miss a
// customer whose machines sit past the cap -- exactly the fault that hid
// KARUNALAYA TRUST in September. It does not here, because COMPLETENESS COMES
// FROM THE OTHER SIDE: sbSearchPartiesForCall runs the Party Master alongside
// this, and that read is one row per customer, ordered, complete and indexed.
// This one supplies WHO OWNS A MACHINE, so the owners can lead; the master
// supplies the guarantee that a name on file can be found. Neither alone is
// both fast and complete; together they are.
//
// 1,000 machine rows is around 250 distinct customers on their data (roughly
// four machines each) -- five times what the list shows.
//
// An EMPTY query returns the first page rather than nothing, so the box opens
// with something in it. Wildcards in the term are neutralised: `%` typed by a
// person means the character, not "match anything".
const PARTY_SCAN_CAP = 1000;
export async function sbSearchProductParties(query: string, limit = 50): Promise<string[]> {
  const c = getSupabase(); if (!c) return [];
  const term = query.trim().replace(/[%_]/g, (m) => `\\${m}`);
  let q = c.from('products').select('party_name').limit(PARTY_SCAN_CAP);
  // Ordering an unfiltered read walks the btree in order and stops at the cap;
  // ordering a FILTERED one would have to find every match before it could sort,
  // which is the very cost this is removing. So the filtered case is sorted here.
  q = term ? q.ilike('party_name', `%${term}%`) : q.order('party_name');
  const { data, error } = await q;
  if (error) throw new Error(errMsg(error));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of data ?? []) {
    const v = String(r.party_name ?? '').trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  if (term) out.sort((a, b) => a.localeCompare(b));
  return out.slice(0, limit);
}

// The maintained Party Master, searched the same way — for an INSTALLATION,
// where the customer may have no machine yet and so cannot be in the register.
export async function sbSearchParties(query: string, limit = 50): Promise<string[]> {
  const c = getSupabase(); if (!c) return [];
  let q = c.from('parties').select('party_name').order('party_name').limit(limit);
  const term = query.trim().replace(/[%_]/g, (m) => `\\${m}`);
  if (term) q = q.ilike('party_name', `%${term}%`);
  const { data, error } = await q;
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r) => String(r.party_name ?? '')).filter(Boolean);
}

// A CUSTOMER WHO EXISTS BUT OWNS NO MACHINE IS SHOWN, AND SAID SO.
//
// Their register: 5,873 parties, of which 4,851 own a machine — about a
// THOUSAND customers are on the Party Master with nothing against them. On a
// field call those cannot be the answer, because the products and serials are
// looked up by the name. But answering "Nothing matches" is a lie by omission:
// the customer plainly exists, somebody is looking straight at them, and the
// screen says they do not. Reported 2026-09-11 as exactly that —
// "Nagapattinam Medical College", "HKSD".
//
// So they are LISTED and UNPICKABLE, with the reason on the row. PickList
// already has that shape (`isDisabled`), used where a spare with no stock is
// shown so the engineer can see WHY it is not an option. Seeing the name and
// the reason is what tells somebody the machine has not been registered yet —
// which is the real problem, and one they can act on.
const nonOwners = new Set<string>();
/** Was this name offered only because the Party Master has it? */
export function partyOwnsNoMachine(name: string): boolean {
  return nonOwners.has(name.trim().toLowerCase());
}
// BOTH AT ONCE, NOT ONE THEN THE OTHER.
//
// The master was a fallback, reached only when the owners had not answered —
// which made the SLOWER query the one every keystroke waited on. The Party
// Master is one row per customer with a trigram index (5,873 rows: 0.1-6 ms);
// the owners come from the machines (19,253 rows). Now they go together and the
// pair costs the slower of the two rather than their sum.
//
// OWNERS STILL LEAD. A customer who owns a machine is the one whose products
// and serials will cascade, so they are the likelier answer and belong at the
// top; the master's extras follow, listed and unpickable with the reason on the
// row. Neither query can take the other down: if one fails the other still
// answers, and only a failure of BOTH is reported as a failed search.
export async function sbSearchPartiesForCall(query: string, limit = 50): Promise<string[]> {
  const [ownersR, masterR] = await Promise.allSettled([
    sbSearchProductParties(query, limit),
    sbSearchParties(query, limit),
  ]);
  if (ownersR.status === 'rejected' && masterR.status === 'rejected') throw ownersR.reason;
  const owners = ownersR.status === 'fulfilled' ? ownersR.value : [];
  const master = masterR.status === 'fulfilled' ? masterR.value : [];
  const have = new Set(owners.map((v) => v.trim().toLowerCase()));
  const extras = master.filter((v) => !have.has(v.trim().toLowerCase()));
  extras.forEach((v) => nonOwners.add(v.trim().toLowerCase()));
  return [...owners, ...extras].slice(0, limit);
}

// The two together, owners FIRST — the installation case. A customer who owns a
// machine is still the likelier answer, so they lead; the master's extras follow
// rather than being interleaved, and a name in both appears once.
export async function sbSearchPartiesForInstall(query: string, limit = 50): Promise<string[]> {
  const [owners, master] = await Promise.all([
    sbSearchProductParties(query, limit).catch(() => [] as string[]),
    sbSearchParties(query, limit).catch(() => [] as string[]),
  ]);
  const seen = new Set(owners.map((v) => v.toLowerCase()));
  return [...owners, ...master.filter((v) => !seen.has(v.toLowerCase()))].slice(0, limit);
}

// Party Master view — field-specific server-side filters + paging (Load more).
export interface PartyFilter { name?: string; city?: string; state?: string; type?: string }
export interface PartyPatch {
  city?: string; state?: string; party_type?: string; profile?: string; route?: string;
  address?: string; pincode?: string; phone?: string; phone_2?: string; fax?: string; email?: string;
  billing_address?: string; billing_pincode?: string; billing_phone?: string;
  billing_phone_2?: string; billing_fax?: string; billing_email?: string;
  service_engineer?: string;
  gstin?: string; pan?: string; kyc_status?: string; kyc_notes?: string;
  /** The KYC records themselves (0231). A list of { name, url, at, by }; the
   *  files live in Drive and this holds the links. Sent whole, because that is
   *  what a jsonb column takes -- the caller builds the new list with
   *  `withKycDoc` / `withoutKycDoc` rather than patching it in place. */
  kyc_docs?: unknown;
}

/** Edit one party (0201).
 *
 *  THE PARTY NAME IS NOT HERE, deliberately. It is the key everything else
 *  names this customer by — `products.party_name`, every call, every contract —
 *  and there is not one foreign key to `parties`. Renaming it from this box
 *  would strand all of them, exactly as renaming a part would (0196), and that
 *  needs a carry-the-history function rather than a text input.
 *
 *  `kyc_verified_by` and `kyc_verified_at` are not here either: the database
 *  stamps them when the status becomes Verified, and a caller that could set
 *  them could sign somebody else's name to a verification. */
export async function updateParty(id: number, patch: PartyPatch): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('parties').update(patch).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

/** One party, re-read after an edit.
 *
 *  The database DERIVES things the form did not send — the GSTIN and PAN out of
 *  the Tax columns, and who verified it and when (0201) — so the row on screen
 *  would otherwise disagree with the row that was written. Re-reading the ONE
 *  row rather than the whole register keeps a reader's "Load more" progress:
 *  this register pages a thousand at a time and the real file has 4,752. */
export async function getParty(id: number): Promise<Record<string, unknown> | null> {
  const { data, error } = await must().from('parties').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(errMsg(error));
  return (data as Record<string, unknown>) ?? null;
}

/** Every Serviceman on the Party Master, with how many customers each has.
 *
 *  PAGED, because there are 4,752 parties and PostgREST caps a response at a
 *  thousand however large the limit says. Counting the first page would report
 *  49 names as 20 and nothing would say so.
 *
 *  Grouped in the browser rather than the database because PostgREST has no
 *  GROUP BY: one short column over five thousand rows is a few hundred KB and
 *  this is opened by hand, not on every page load. */
export async function partyServiceEngineerCounts(): Promise<{ key: string; count: number }[]> {
  const c = getSupabase(); if (!c) return [];
  const rows = await allRows<{ service_engineer: string | null }>((from, to) =>
    c.from('parties').select('service_engineer').order('id').range(from, to));
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const k = String(r.service_engineer ?? '').trim();
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  });
  return [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Rename one Serviceman across every party that names them.
 *
 *  THE WHOLE POINT IS THAT THE NAME MUST MATCH THE USER MASTER. `allocated_to`
 *  on a call is a NAME, and `notify_call_allotted()` finds the person by it in
 *  `user_directory` — so "SIVA KUMAR R." against a directory holding
 *  "SIVAKUMAR" prefills a box with somebody who does not exist, and nobody is
 *  notified. On the supplied export that is 328 customers for one spelling.
 *
 *  ONE STATEMENT, so 328 parties change together or not at all. Doing it a row
 *  at a time is 328 requests and a half-finished rename if one fails.
 *
 *  MATCHED EXACTLY on the stored string, which is what the caller picked out of
 *  the list above — not trimmed, not case-folded. A rename that quietly caught
 *  a second spelling would be a rename nobody asked for. */
export async function renamePartyServiceEngineer(
  from: string, to: string,
): Promise<{ ok: boolean; changed?: number; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  if (!from) return { ok: false, error: 'Pick the name to change.' };
  if (from === to) return { ok: false, error: 'That is the same name.' };
  const { error, count } = await c.from('parties')
    .update({ service_engineer: to }, { count: 'exact' })
    .eq('service_engineer', from);
  if (error) {
    const m = errMsg(error);
    return { ok: false, error: /permission|policy/i.test(m) ? `${m} — this needs the “Edit masters” permission.` : m };
  }
  return { ok: true, changed: count ?? 0 };
}

// ---------------------------------------------------------------------------
// A CHART SOMEBODY BUILT AND KEPT (0206).
//
// The row holds a DIMENSION and a chart type — never data. The numbers are
// computed in the reader's own session from rows their own RLS allowed, so a
// chart shared with somebody who may see less simply shows less, and sharing a
// chart can never share data.
// ---------------------------------------------------------------------------
export interface SavedChartSpec { dim: string; form: 'pareto' | 'share' | 'ordered'; top?: number }
export interface SavedChart {
  id: number; page: string; name: string;
  /** null = private to whoever made it · '' = everyone · otherwise a role key. */
  role: string | null;
  spec: SavedChartSpec;
  set_at: number;
}

export async function listSavedCharts(page: string): Promise<SavedChart[]> {
  const c = getSupabase(); if (!c) return [];
  // RLS decides what comes back — your own, plus what is shared with everyone
  // or with your role — so there is no filter here to get wrong.
  const { data, error } = await c.from('saved_charts')
    .select('id, page, name, role, spec, set_at').eq('page', page).order('name');
  if (error) return [];
  return (data ?? []) as SavedChart[];
}

export async function saveChart(
  page: string, name: string, role: string | null, spec: SavedChartSpec,
): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  // `owner` is NOT sent: the database stamps it from auth.uid(), so a chart
  // cannot be filed under somebody else's name even by a client that means to.
  const { error } = await c.from('saved_charts').insert({ page, name: name.trim(), role, spec });
  if (!error) return { ok: true };
  const m = errMsg(error);
  if (/duplicate key/i.test(m)) return { ok: false, error: 'A chart of that name is already saved here.' };
  if (/row-level security/i.test(m)) {
    return { ok: false, error: 'Saving a chart for a role or for everyone needs the “Manage configuration” permission.' };
  }
  return { ok: false, error: m };
}

export async function deleteSavedChart(id: number): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  const { error } = await c.from('saved_charts').delete().eq('id', id);
  if (!error) return { ok: true };
  const m = errMsg(error);
  return { ok: false, error: /row-level security|0 rows/i.test(m)
    ? 'That chart was shared by somebody else — removing it needs the “Manage configuration” permission.' : m };
}

export async function queryParties(filter: PartyFilter, offset = 0, limit = 1000): Promise<Record<string, unknown>[]> {
  let q = must().from('parties').select('*').order('party_name').order('id').range(offset, offset + limit - 1);
  if (filter.name) q = q.ilike('party_name', `%${_san(filter.name)}%`);
  if (filter.city) q = q.ilike('city', `%${_san(filter.city)}%`);
  if (filter.state) q = q.ilike('state', `%${_san(filter.state)}%`);
  if (filter.type) q = q.ilike('party_type', `%${_san(filter.type)}%`);
  const { data, error } = await q;
  if (error) throw new Error(errMsg(error));
  return data ?? [];
}
// ---------------------------------------------------------------------------
// A PARTY NAME IS THE SAME PARTY WHATEVER ITS CASE.
//
// Reported 2026-09-09: "CAPTAIN SAURABH KALIA MEMORIAL KAYDEE HOSPITAL — This
// party has Products, but this Party Doesnt — Captain Saurabh Kalia Memorial
// Kaydee Hospital."
//
// The two halves of the app disagreed, which is the whole bug. `sbPartyInfo`
// finds the party with `ilike` (case-insensitive), while the product lookups
// used `eq` (case-sensitive) — so picking the party spelled one way and reading
// products stored the other way returned nothing, on a party that plainly has
// machines. There is no unique constraint on `parties.party_name`, so both
// spellings exist as rows and either can be the one you land on.
//
// MATCHED IN TWO STEPS, deliberately. `ilike` does the narrowing in the
// database (the trigram index in 0052 serves it), and the exact comparison is
// then done here on `lower(trim())`. That second step is not belt-and-braces:
// in an ilike pattern `_` matches ANY character and `%` matches anything at
// all, so a party whose name contains either would quietly pull in its
// neighbours. Escaping them through PostgREST is fiddly; comparing the strings
// once they are here is exact and costs nothing at this size.
// ---------------------------------------------------------------------------
const partyKey = (v: unknown) => String(v ?? '').trim().toLowerCase();
/** The ilike pattern for "this exact name, any case". Wildcards in the name are
 *  neutralised to `_`, which over-matches rather than under-matching — the JS
 *  comparison below then throws the extras away. */
const partyLike = (party: string) => party.trim().replace(/[%_]/g, '_');

// ---------------------------------------------------------------------------
// A PARTY'S ROWS: EQUALITY FIRST, `ilike` ONLY IF THAT FINDS NOTHING.
//
// Reported 2026-09-21: clicking a customer on Product & Party Search came back
// "canceling statement due to statement timeout". `ilike` CANNOT USE A BTREE,
// so the read was a SEQUENTIAL SCAN of every machine -- and with `select *`
// that means reading each row's `extra` payload too. Measured on 19,253
// machines, the live count:
//
//     ilike     65.8 ms cold, 11.5 ms warm   Seq Scan, 18,733 rows discarded
//     =          0.7 ms cold,  0.5 ms warm   Bitmap Index Scan (party_name_eq)
//
// Nothing about the index was missing: `products_party_name_eq` has been there
// all along and the call-request cascade already reads through it, saying so
// in its own comment. This read simply never used it.
//
// THE `ilike` IS KEPT AS A FALLBACK, not deleted. On this screen the name comes
// VERBATIM from `products.party_name` -- the reader clicked a search result --
// so equality cannot miss. It can where the name was typed or came from a form
// (the call-request form passes one), and a party whose machines silently
// vanish is worse than a slow screen. So: the fast read first, and the old one
// only when the fast one finds nothing, which costs a second round trip only in
// the case that used to be the only case.
// ---------------------------------------------------------------------------
// The reader builds its own query and is told WHICH match to use, rather than
// being handed a matcher: chaining a generic through supabase-js's builder
// types makes the compiler give up ("Type instantiation is excessively deep").
async function partyRows<T>(read: (exact: boolean) => Promise<T[]>): Promise<T[]> {
  const hit = await read(true);
  return hit.length ? hit : read(false);
}

export async function sbListPartyProducts(party: string): Promise<string[]> {
  // PAGED: `allRows` throws on the first failing page, so there is no error to
  // unpack here.
  const data = await partyRows<{ item_name: string | null; party_name: string | null }>((exact) =>
    allRows((a, b) => {
      const base = must().from('products').select('item_name,party_name');
      const q = exact ? base.eq('party_name', party.trim()) : base.ilike('party_name', partyLike(party));
      return q.order('id').range(a, b);
    }, 20000));
  const want = partyKey(party);
  return [...new Set(data
    .filter((r) => partyKey(r.party_name) === want)
    .map((r) => String(r.item_name)).filter(Boolean))];
}
// ---- Suggesting the Standard Complaint -------------------------------------
//
// TWO LAYERS, and the screen works with only the first.
//
//   1. `suggest_standard_complaint()` (0104) ranks candidates by what people
//      actually CHOSE on past calls whose reported problem reads like this one.
//      A decision somebody made beats anything inferred from words, so this
//      answers first and always.
//   2. The `suggest-complaint` Edge Function asks a model to re-rank those same
//      candidates. It exists for the case layer 1 cannot reach — a genuine
//      paraphrase — and it can only CHOOSE among the candidates it is given, so
//      it cannot invent a complaint that is not in the master.
//
// If the function is not deployed, has no key, or fails for any reason, layer 1
// stands on its own and the screen says nothing about it.
export interface ComplaintSuggestion {
  value: string;
  chosen: number;
  score: number;
  why: string;
  source: 'register' | 'ai';
}

export async function sbSuggestComplaints(
  reported: string, product = '', limit = 5,
): Promise<ComplaintSuggestion[]> {
  const text = reported.trim();
  if (text.length < 3) return [];
  const { data, error } = await must().rpc('suggest_standard_complaint', {
    p_text: text, p_product: product, p_limit: limit,
  });
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r: Record<string, unknown>) => ({
    value: String(r.value ?? ''),
    chosen: Number(r.chosen ?? 0),
    score: Number(r.score ?? 0),
    why: String(r.why ?? ''),
    source: 'register' as const,
  })).filter((s: ComplaintSuggestion) => s.value);
}

// ---- the wording itself ----------------------------------------------------
//
// The register's Reported Problem is not freely written: the alarm number is
// used where the machine gives one, and the same fault comes back in the same
// words. 0107 offers both from evidence — the product's own spelling of an
// alarm number already typed, and the phrasings that product's calls have
// actually used more than once. `kind` separates them because they are not the
// same claim, and `unknown` is a WARNING, not something to click.
export interface TextSuggestion {
  value: string;
  used: number;
  kind: 'alarm' | 'phrase' | 'unknown';
  why: string;
}

export async function sbSuggestComplaintText(
  reported: string, product = '', limit = 4,
): Promise<TextSuggestion[]> {
  const text = reported.trim();
  if (text.length < 4) return [];
  const { data, error } = await must().rpc('suggest_complaint_text', {
    p_text: text, p_product: product, p_limit: limit,
  });
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r: Record<string, unknown>) => ({
    value: String(r.value ?? ''),
    used: Number(r.used ?? 0),
    kind: (String(r.kind ?? 'phrase') as TextSuggestion['kind']),
    why: String(r.why ?? ''),
  })).filter((s: TextSuggestion) => s.value);
}

// The model's re-ranking of candidates the register already produced. Returns
// [] for every failure — no key, not deployed, a bad reply — because a
// suggestion that cannot be made is not an error the person needs to see.
export async function sbAiRankComplaints(
  reported: string, product: string, candidates: string[],
): Promise<ComplaintSuggestion[]> {
  const c = getSupabase();
  if (!c || !candidates.length) return [];
  try {
    const { data, error } = await c.functions.invoke('suggest-complaint', {
      body: { reported, product, candidates },
    });
    if (error) return [];
    const picks = (data as { picks?: { value: string; why: string }[] } | null)?.picks ?? [];
    const allowed = new Set(candidates);
    return picks
      .filter((p) => allowed.has(p.value))   // the list is the law, on this side too
      .map((p) => ({ value: p.value, chosen: 0, score: 0, why: p.why, source: 'ai' as const }));
  } catch {
    return [];
  }
}

// What was offered and what was taken — so the accept rate can be READ rather
// than assumed, and so "is the model adding anything the register did not
// already give us" has an answer. Never allowed to fail the registration it
// describes: a log that breaks the thing it is logging is worse than no log.
export async function sbLogComplaintSuggestion(row: {
  product: string; reported: string; ucn?: string;
  suggested: { value: string; why: string; source: string }[];
  accepted: string;
}): Promise<void> {
  const c = getSupabase();
  if (!c || !row.suggested.length) return;
  const rank = row.accepted ? row.suggested.findIndex((s) => s.value === row.accepted) : -1;
  try {
    await c.from('complaint_suggestions').insert({
      product: row.product, reported: row.reported, ucn: row.ucn ?? '',
      suggested: row.suggested.map((s, i) => ({ ...s, rank: i + 1 })),
      accepted: row.accepted,
      accepted_rank: rank >= 0 ? rank + 1 : null,
    });
  } catch { /* never break a registration for a log line */ }
}

// ---- KPIs ------------------------------------------------------------------
//
// Every one of these is an aggregate the DATABASE computes (0101). The screen
// asks four small questions instead of pulling forty thousand consumption rows
// across the wire to add them up itself, and the views are security_invoker, so
// an engineer's KPIs are their own calls and a manager's are their team's
// without a second set of rules to keep in step.
export interface FailureRate {
  product: string; machines: number; calls_total: number; calls_12m: number;
  calls_open: number; per_100_machines: number | null;
}
export interface FailureMode { product: string; complaint: string; calls: number; calls_12m: number }
export interface SpareUsage {
  cover: string; region: string; product: string;
  lines: number; qty: number; calls: number; parts: number; engineers: number;
}
// One row per PRODUCT, so about fifty today — paged anyway, because the number
// of products is not a promise and "it is small now" is how the other twelve
// were written.
export async function sbFailureRates(): Promise<FailureRate[]> {
  return allRows<FailureRate>((a, b) => must().from('failure_rate_by_product').select('*')
    .order('product').range(a, b), 20000);
}
// PAGED. Both are one row per COMBINATION — product x complaint, and cover x
// region x product — so they pass a thousand long before the register does, and
// a truncated aggregate is a wrong NUMBER on a chart rather than a short list.
// Ordered by the grouping columns, which are what make a row unique here: a
// view has no primary key to fall back on.
export async function sbFailureModes(): Promise<FailureMode[]> {
  return allRows<FailureMode>((a, b) => must().from('failure_modes_by_product').select('*')
    .order('product').order('complaint').range(a, b), 20000);
}
export async function sbSpareUsage(): Promise<SpareUsage[]> {
  return allRows<SpareUsage>((a, b) => must().from('spare_usage_rollup').select('*')
    .order('cover').order('region').order('product').range(a, b), 20000);
}

// ---- Moving a spare request to a different engineer ------------------------
//
// Until it is dispatched, and logged either way. The rule lives in the database
// (0100) because hand stock is DERIVED from the request: after dispatch the name
// is not a label, it is whose parts they are.
export interface EngineerChange {
  id: number; request_uid: string; or_no: string;
  from_engineer: string; from_email: string;
  to_engineer: string; to_email: string;
  reason: string; changed_at: string; changed_by_name: string;
}
export async function sbReassignSpareRequest(uid: string, engineer: string, email = '', reason = ''): Promise<void> {
  const { error } = await must().rpc('reassign_spare_request', {
    p_uid: uid, p_engineer: engineer, p_email: email, p_reason: reason,
  });
  if (error) throw new Error(errMsg(error));
}
export async function sbListEngineerChanges(uid: string): Promise<EngineerChange[]> {
  const { data, error } = await must().from('spare_request_engineer_log')
    .select('*').eq('request_uid', uid).order('changed_at', { ascending: false });
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as unknown as EngineerChange[];
}

// ---- The Product Register's own lists (Product & Party Search) -------------
//
// The products a search can offer are the products the register HAS. A master
// value list is a different thing — maintained by hand, and on this project it
// was short — so the dropdown reads the register.
//
// 0098's view groups them; if it has not been applied yet the fallback asks for
// the column and de-duplicates here, which is slower but never leaves the
// screen without a list. (A merged migration is not an applied one.)
export interface ProductName { name: string; machines: number }
export async function sbListProductNames(): Promise<ProductName[]> {
  const c = must();
  const { data, error } = await c.from('product_register_names').select('item_name,machines').order('item_name');
  if (!error) {
    return (data ?? []).map((r) => ({ name: String(r.item_name ?? ''), machines: Number(r.machines ?? 0) })).filter((p) => p.name);
  }
  // PAGED, and it matters most HERE: this fallback counts the machines behind
  // every product name, so a thousand-row cap would not merely shorten the list
  // but print WRONG COUNTS beside the names that survived.
  const raw = await allRows<{ item_name: string | null }>((a, b) =>
    c.from('products').select('item_name').order('id').range(a, b), 100000);
  const counts = new Map<string, number>();
  raw.forEach((r) => {
    const n = String(r.item_name ?? '').trim();
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  });
  return [...counts].map(([name, machines]) => ({ name, machines })).sort((a, b) => a.name.localeCompare(b.name));
}

// The serials of one product — an equality filter, so 0052's btree serves it.
export async function sbListProductSerials(product: string): Promise<string[]> {
  // PAGED. This is the one that was reported: ORION-G has 2,547 machines and
  // the picker offered 1,000 of them, so a real serial read as "Nothing
  // matches". Ordered by `id` so the pages cannot overlap.
  const data = await allRows<{ serial_number: string | null }>((a, b) => must().from('products')
    .select('serial_number').eq('item_name', product).order('id').range(a, b), 20000);
  return [...new Set(data.map((r) => String(r.serial_number ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function sbListPartyItems(party: string, product = ''): Promise<Record<string, unknown>[]> {
  // PAGED: a hospital group can hold more than a thousand machines, and the
  // screen that lists "everything they have" is the last place to stop at one.
  const data = await partyRows<Record<string, unknown>>((exact) =>
    allRows((a, b) => {
      const base = must().from('product_database').select('*');
      let q = exact ? base.eq('party_name', party.trim()) : base.ilike('party_name', partyLike(party));
      if (product) q = q.eq('item_name', product);
      return q.order('id').range(a, b);
    }, 20000));
  const want = partyKey(party);
  return data.filter((r) => partyKey(r.party_name) === want).map(productRowToSheet);
}
// ONE MACHINE, BY ITS SERIAL. An EQUALITY on the stored `serial_key` (0129),
// which is indexed — not `ILIKE '%serial%'`, which is a leading-wildcard scan
// over every machine and is what kept timing out on Pending Registrations.
//
// `serial_key` is `lower(btrim(serial_number))`, so this matches however the
// serial was typed or spaced, and it matches ONE row rather than "the first 25
// that contain it" — a serial another 25 serials happen to contain used to come
// back as not in Product Database at all.
// THE KEY THE DATABASE STORES, not the one the application matches WITH.
//
// `machineKey()` in ./machine SQUASHES -- it strips every non-alphanumeric, so
// `ORION-G|2410` becomes `oriong|2410` -- and it is right for comparing two
// hand-typed values. `products.machine_key` is
// `lower(btrim(item_name)) || '|' || lower(btrim(serial_number))`, which KEEPS
// the hyphen. Using the squashing one against this column would have matched
// NOTHING and filled no cover anywhere, which is worse than the bug below.
// Caught by printing both before shipping it; `check:upserts` proves it
// against a real database.
const dbMachineKey = (product: unknown, serial: unknown): string =>
  `${String(product ?? '').trim().toLowerCase()}|${String(serial ?? '').trim().toLowerCase()}`;

// A MACHINE IS ITS MODEL AND ITS SERIAL, and this read used the serial alone.
//
// Reported 2026-09-21: "when I check the product master, the item status is
// under WGP, but when I register the call it shows as OGP". `serial_key` is
// `lower(btrim(serial_number))` and is NOT unique -- `machine_key` is
// `model|serial` and IS. With `.eq('serial_key', ...).limit(1)` this returned
// AN ARBITRARY ONE of the machines wearing that serial, and Pending
// Registrations then filled its item status, warranty and contract onto a call
// for a DIFFERENT machine. The eleven machines numbered 219, in a third place.
//
// WITH THE PRODUCT, it reads `machine_key` -- a unique index, one machine,
// no ambiguity possible.
//
// WITHOUT IT, an ambiguous serial returns NULL rather than a guess. That is the
// project's own rule about a wrong value on a quality record being worse than
// an absent one: the caller then fills nothing and SAYS SO, which a human can
// act on, where the wrong cover is invisible and reaches the spare decision.
export async function sbProductBySerial(serial: string, product = ''): Promise<Record<string, unknown> | null> {
  const key = String(serial ?? '').trim().toLowerCase();
  if (!key) return null;

  if (String(product ?? '').trim()) {
    const { data, error } = await must().from('product_database').select('*')
      .eq('machine_key', dbMachineKey(product, serial)).limit(1).maybeSingle();
    if (error) throw new Error(errMsg(error));
    return data ? productRowToSheet(data) : null;
  }

  // TWO rows asked for, not one: one is an answer, two is a question, and
  // `.limit(1)` cannot tell them apart.
  const { data, error } = await must().from('product_database').select('*').eq('serial_key', key).limit(2);
  if (error) throw new Error(errMsg(error));
  const rows = data ?? [];
  return rows.length === 1 ? productRowToSheet(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// THE THREE READS THAT WANT THE COVER AS IT IS TODAY go to
// `public.product_database` (0235) rather than to `products`: Item Status and
// Service Engineer are WORKED OUT there -- warranty first, then the contract
// the MC number names, else OGP, and the engineer always from the Party Master.
//
// A STORED COVER IS RIGHT ON THE DAY IT IS WRITTEN AND WRONG AFTERWARDS, which
// is why the register, the party's machine list and the call form's prefill all
// read the view. Everything that WRITES -- every importer and upsert -- still
// goes to the table, which is untouched.
// ---------------------------------------------------------------------------
export async function sbSearchProducts(filters: { q?: string; party?: string; product?: string; serial?: string; status?: string; exact?: boolean }, limit = 100, offset = 0): Promise<Record<string, unknown>[]> {
  // NEWEST ENTRIES FIRST, AND THIS IS A CORRECTNESS FIX BEFORE IT IS A
  // PREFERENCE (the user, 2026-09-25: "Always show sorted date - Newest
  // entries first"). This read PAGED 200 AT A TIME WITH NO ORDER AT ALL, which
  // breaks the project's own rule: without one the database may return the
  // rows in any order it likes between pages, so "Load more" can show a
  // machine twice and miss another entirely -- and the result looks complete,
  // which is worse than a truncation that announces itself.
  //
  // `created_at` is WHEN THE ROW WAS ADDED and is published by the view, so
  // the order column exists -- a missing one is an ERROR from PostgREST and an
  // EMPTY register, not merely unsorted rows.
  //
  // THE TIEBREAK IS NOT DECORATION HERE. A bulk reload writes every machine in
  // the same instant, so after one the whole register shares a `created_at`
  // and ordering on it alone is arbitrary; `id desc` makes the paging stable
  // and, within a load, puts the last rows of the file first.
  let q = must().from('product_database').select('*')
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  // An EXACT serial goes through the indexed key, not `eq(serial_number)`:
  // that was case-sensitive AND had no plain btree behind it, so the one
  // filter that meant equality was the one that could not use an index.
  if (filters.serial) {
    q = filters.exact
      ? q.eq('serial_key', filters.serial.trim().toLowerCase())
      : q.ilike('serial_number', `%${filters.serial}%`);
  }
  if (filters.party) q = q.ilike('party_name', `%${filters.party}%`);
  if (filters.product) q = filters.exact ? q.eq('item_name', filters.product) : q.ilike('item_name', `%${filters.product}%`);
  if (filters.q) q = q.or(`serial_number.ilike.%${filters.q}%,item_name.ilike.%${filters.q}%,party_name.ilike.%${filters.q}%`);
  // THE STATUS PICKER WAS SILENTLY DROPPED ON THIS PATH. `ProdFilters.status`
  // has existed since the sheet era and searchProducts() still forwards it to
  // the Apps Script bridge, but this function never read it -- so on a Supabase
  // project the Product Database's "Any status" box moved and NOTHING changed,
  // with no error to say so. Worse than an unimplemented control: a reader who
  // picks OGP and gets the whole register back concludes every machine is OGP.
  //
  // IT IS ONLY ASKABLE NOW. Before 0235 `item_status` was a STORED column that
  // decayed against current_date, so filtering on it would have returned the
  // answer as of the last import; it is worked out on read, so the filter and
  // the column on screen are the same rule. It costs a full pass over the view
  // (no index can serve a computed column) -- measured at 767 ms on 20,002
  // machines, against an eight-second ceiling.
  if (filters.status) q = q.eq('item_status', filters.status.trim().toUpperCase());
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
// WIDENED FOR THE WARRANTY SALE (2026-09-22), which fills eleven fields from
// the party rather than three. The original three keys are unchanged, so every
// existing caller reads exactly what it read before; the rest are extra keys on
// the same object and are ignored where nobody asks for them.
export interface PartyInfo {
  state: string; city: string; address: string;
  pincode: string; phone: string; phone_2: string;
  pan: string; gstin: string;
  party_type: string; profile: string; service_engineer: string;
}

export async function sbPartyInfo(party: string): Promise<PartyInfo | null> {
  // `name_key` IS `lower(btrim(party_name))` with a UNIQUE btree on it, and
  // `partyKey()` computes exactly that string in JavaScript -- so this is the
  // same case-insensitive, trimmed match the `ilike` was doing, through an
  // index instead of a scan. No fallback is needed here because it is not an
  // approximation of the old behaviour, it IS the old behaviour.
  const { data } = await must().from('parties')
    .select('state,city,address,extra,pincode,phone,phone_2,pan,gstin,party_type,profile,service_engineer')
    .eq('name_key', partyKey(party)).limit(1).maybeSingle();
  if (!data) return null;
  const ex = (data.extra as Record<string, unknown>) ?? {};
  const t = (v: unknown) => String(v ?? '').trim();
  return {
    state: t(data.state), city: t(data.city),
    // `extra` is the import's own leftovers and is the FALLBACK, not the
    // source: a party loaded before the column existed keeps its address there.
    address: String(data.address ?? ex['Address'] ?? '').trim(),
    pincode: t(data.pincode), phone: t(data.phone), phone_2: t(data.phone_2),
    pan: t(data.pan), gstin: t(data.gstin),
    party_type: t(data.party_type), profile: t(data.profile),
    service_engineer: t(data.service_engineer),
  };
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
  // THE CUSTOMER COMES FROM THE MACHINE, not from a box somebody typed it into
  // (the user's design, 2026-09-11). `call_requests` has always held party_name
  // and city PER ROW -- it was only the form that grouped them -- so carrying
  // them on the item needs no migration. Absent on an INSTALLATION, where there
  // is no machine on the register yet and the form still asks.
  party?: string;
  city?: string;
  state?: string;
  address?: string;
  contactDetails?: string;
  contactNumber?: string;
}
const itemCols = (it: CallRequestItem) => ({
  product: it.product,
  serial_no: it.serial,
  standard_complaint: it.standardComplaint,
  reported_problem: it.reportedProblem,
  // Only override the request's own when the row actually carries one: an
  // installation row has neither, and writing '' would blank the party the
  // form collected.
  ...(it.party?.trim() ? { party_name: it.party.trim() } : {}),
  ...(it.city?.trim() ? { city: it.city.trim() } : {}),
  ...(it.state?.trim() ? { state: it.state.trim() } : {}),
  ...(it.address?.trim() ? { address: it.address.trim() } : {}),
  ...(it.contactDetails?.trim() ? { customer_contact_details: it.contactDetails.trim() } : {}),
  ...(it.contactNumber?.trim() ? { customer_contact_number: it.contactNumber.trim() } : {}),
});

// FIND THE MACHINE, AND THE CUSTOMER COMES WITH IT.
//
// A serial is a far cheaper thing to look for than a customer name: measured
// over all 19,253 machines with no party filter, as a signed-in engineer, a
// serial prefix is 0.21 ms and a mid-string match 1.7-5 ms, against a customer
// search that has been timing out. It is also the identifier the engineer
// actually has -- they are standing at the machine, reading its label.
//
// The LIMIT is what keeps it cheap: the scan stops as soon as it has enough,
// so a short term that matches half the register costs no more than a precise
// one. City rides in `products.extra` under the spreadsheet's own heading.
export interface MachineHit { serial: string; product: string; party: string; city: string; state: string; address: string }
export async function sbSearchMachines(product: string, query: string, limit = 50, party = ''): Promise<MachineHit[]> {
  const c = getSupabase(); if (!c) return [];
  const term = query.trim().replace(/[%_]/g, (m) => `\\${m}`);
  const cols = 'serial_number,item_name,party_name,extra';
  const base = () => {
    let q = c.from('products').select(cols);
    // =====================================================================
    // MATCHED AS OFFERED, NOT TRIMMED — and the `.trim()` that used to be here
    // broke ONE PRODUCT COMPLETELY while every other one worked.
    //
    // Reported 2026-09-24: *"This happens in Extend XT product only."* The
    // Product box is filled from `product_register_names`, which groups
    // `products.item_name` and hands back the name VERBATIM; the search then
    // asked for `item_name = <that name>.trim()`. For a register row stored as
    // `'EXTEND-XT '` the list therefore offers `'EXTEND-XT '` and the search
    // asks for `'EXTEND-XT'` — which matches NOTHING. Measured: the dropdown
    // says 2 machines, the equality finds 0. Every serial box for that product
    // is empty, so no machine can be picked, so no customer arrives with it,
    // so the request is refused for machines that are plainly on the register.
    //
    // It is product-specific by construction: only a name carrying stray
    // whitespace is affected, and the rest of the register behaves perfectly,
    // which is exactly how it was reported.
    //
    // AND THIS WAS THE ODD ONE OUT. Every other read of this table matches the
    // name as it was given — sbSearchProducts, sbListMachinesForParty,
    // listPartyItems — so the trim was not a convention, it was a difference.
    //
    // THE STRAY SPACE IN THE DATA IS A SEPARATE FAULT and is not repaired here:
    // it also splits every `group by item_name` count in two, silently, and the
    // register is the user's to correct with numbers in front of them.
    // `supabase/apply/_which_product_names_carry_stray_spaces.sql` lists them.
    // =====================================================================
    if (product.trim()) q = q.eq('item_name', product);
    // NARROWED TO ONE CUSTOMER on the second call onward: the first call fixes
    // whose machines the request is about, so the rest need only look among
    // theirs. EQUALITY on party_name, which is indexed (products_party_name_eq) —
    // this is a filter, not a search, so it costs nothing.
    if (party.trim()) q = q.eq('party_name', party.trim());
    return q;
  };

  // =========================================================================
  // THE CLOSEST MATCH COMES FIRST, AND THE MACHINE YOU TYPED IS ALWAYS OFFERED.
  //
  // Reported 2026-09-24 with a screenshot: a Call Registration Request for
  // ORION-G serial 105 refused with "that serial is not on the register" —
  // *"the product and serial number combination is very much available"*, and
  // *"the list is not sorted as per the closest match"*.
  //
  // BOTH HALVES WERE ONE FAULT. The search was a single `ilike '%term%'` with
  // `.limit(50)` and NO ORDER AT ALL, which breaks this project's own rule that
  // every capped read must name an order — and here the consequence is not
  // cosmetic. Measured on a register where 925 machines have a serial
  // containing "105": the machine actually numbered 105 came back at RANK 19 of
  // 50, and its position was decided by the physical order of the rows rather
  // than by the match. Past the 50 it is not merely far down the list, it is
  // ABSENT — and a machine that cannot be picked cannot name its customer, so
  // the request is refused for a machine that is plainly on the register.
  //
  // THREE READS, RUN TOGETHER, so this costs one round trip of latency:
  //   PREFIX   `105%` ordered ascending. A string is sorted before everything
  //            it is a prefix of, so if serial 105 exists it is the FIRST row
  //            of this read — never cut off, whatever else matches.
  //   SUFFIX   `%105` — the machine whose serial ENDS with what was typed.
  //            Added 2026-09-24 for `INXT 0105`: a great many serials here are
  //            a letter code, a space and a number, and what somebody reads off
  //            the machine is the number. Through the contains read alone that
  //            serial was rank 146 of 1,046 and never appeared; there are FOUR
  //            serials ending in 105, so this read cannot be crowded out.
  //   CONTAINS `%105%` ordered ascending, for the mid-string matches neither of
  //            the others can see (X105161, and the engineer who remembers only
  //            the middle of a serial).
  //
  // RANKED AGAIN IN JAVASCRIPT — exact, then prefix, then contains — rather
  // than trusting the concatenation: `ilike` is case-insensitive and the
  // database's ordering is not, so "abc" and "ABCD" can come back either way
  // round. The ranking here says what it means and does not depend on a
  // collation.
  // =========================================================================
  let rows: Record<string, unknown>[];
  if (!term) {
    // No search yet: the first page of the register, in a STABLE order — an
    // unordered page can show a different fifty each time it is opened.
    const { data, error } = await base().order('serial_number').limit(limit);
    if (error) throw new Error(errMsg(error));
    rows = (data ?? []) as Record<string, unknown>[];
  } else {
    const [pre, suf, any] = await Promise.all([
      base().ilike('serial_number', `${term}%`).order('serial_number').limit(limit),
      base().ilike('serial_number', `%${term}`).order('serial_number').limit(limit),
      base().ilike('serial_number', `%${term}%`).order('serial_number').limit(limit),
    ]);
    if (pre.error) throw new Error(errMsg(pre.error));
    if (suf.error) throw new Error(errMsg(suf.error));
    if (any.error) throw new Error(errMsg(any.error));
    rows = [...(pre.data ?? []), ...(suf.data ?? []), ...(any.data ?? [])] as Record<string, unknown>[];
  }

  const hits = rows.map((r) => {
    const ex = (r.extra as Record<string, unknown>) ?? {};
    return {
      serial: String(r.serial_number ?? ''),
      product: String(r.item_name ?? ''),
      party: String(r.party_name ?? ''),
      // The site, as the register has it. Prefilled into the row and EDITABLE
      // there: the register is where the machine was sold, and a hospital moves
      // a ventilator between wards and buildings without telling anybody.
      city: String(ex['City'] ?? ''),
      state: String(ex['State'] ?? ''),
      address: String(ex['Address'] ?? ''),
    };
  }).filter((m) => m.serial);
  // DE-DUPLICATED AND RANKED CLOSEST-FIRST in one pure function, so the order
  // the form shows can be exercised by a check — see rankSerialHits().
  return rankSerialHits(hits, term, limit);
}
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
// ---------------------------------------------------------------------------
// WHAT COMMERCIAL IS WAITING ON (the user, 2026-09-22: "In My workload, list
// all installation pending request for commercial department").
//
// An INSTALLATION request that has not become a call yet is a machine sold and
// not yet installed. Commercial's question about each one is the same question
// the KYC work answers: is this customer cleared, so a Sale Entry and an
// installation call can proceed?
//
// SO THE TWO ARE READ TOGETHER. A list of installations with no KYC beside it
// sends somebody to a second screen per row, which is the step this is for.
// The parties are fetched in ONE request keyed on `name_key` -- the unique
// btree (0186) rather than an `ilike` per row.
// ---------------------------------------------------------------------------
export interface PendingInstall {
  id: number; reqid: string; submitted_at: string;
  party_name: string; city: string; product: string; serial_no: string;
  engineer: string;
  /** The customer's KYC status, or '' where the Party Master has no such
   *  customer at all -- which is itself the finding: nobody has been verified
   *  because nobody has been recorded. */
  kyc_status: string;
  kyc_docs: unknown;
  onMaster: boolean;
}

/** KYC for a set of customers, keyed on `name_key` — the unique btree (0186)
 *  rather than an `ilike` per row. Chunked, because a very long `in` list is a
 *  very long URL and PostgREST is not the place to find that out. */
export async function sbKycByParties(
  names: string[],
): Promise<Map<string, { status: string; docs: unknown }>> {
  const out = new Map<string, { status: string; docs: unknown }>();
  const c = getSupabase();
  if (!c) return out;
  const keys = [...new Set(names.map((n) => partyKey(n)).filter(Boolean))];
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await c.from('parties')
      .select('name_key,kyc_status,kyc_docs').in('name_key', keys.slice(i, i + 200));
    // A FAILED LOOKUP LEAVES THE COLUMN BLANK rather than taking the register
    // down: KYC is context beside a request, not the request itself.
    if (error) return out;
    (data ?? []).forEach((p) => out.set(String(p.name_key ?? ''),
      { status: String(p.kyc_status ?? ''), docs: p.kyc_docs }));
  }
  return out;
}

/** `partyKey` for a caller that has a name and wants the map's key. */
export const kycKeyFor = (name: string): string => partyKey(name);

export async function pendingInstallRequests(): Promise<PendingInstall[]> {
  const c = must();
  // PAGED (finding 32). This reads every installation request of every status,
  // oldest first, and a single response stops at 1,000 rows — so once the
  // register had held more than that, the ones cut off were the NEWEST, which is
  // where the pending ones are, under a card that says its count is exact.
  const data = await allRows<Record<string, unknown>>((a, b) => c.from('call_requests')
      .select('id,reqid,submitted_at,party_name,city,product,serial_no,engineer,status,call_type')
      // `like 'INSTALL%'` is the same test the UCN generator and the call router
      // use (0001, 0040), so "INSTALLATION" and "INSTALLATION CALL" are one thing
      // here as they are everywhere else.
      .ilike('call_type', 'INSTALL%')
      .order('submitted_at', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(a, b));
  // PENDING IS FILTERED HERE, NOT IN THE QUERY. PostgREST's `status.eq.` for an
  // empty string is a corner nobody should have to reason about, and "" and
  // null both mean pending -- a row loaded before the column existed has no
  // status and is still waiting. Installation requests are a small list; the
  // rule being READABLE matters more than the round trip.
  const isPending = (v: unknown) => {
    const st = String(v ?? '').trim().toLowerCase();
    return st === '' || st === 'pending';
  };
  const rows = (data ?? []).filter((r) => isPending(r.status));
  const keys = [...new Set(rows.map((r) => partyKey(String(r.party_name ?? ''))).filter(Boolean))];
  const kyc = new Map<string, { status: string; docs: unknown }>();
  // Chunked: a very long `in` list is a very long URL, and PostgREST is not the
  // place to find that out.
  for (let i = 0; i < keys.length; i += 200) {
    const { data: ps, error: pe } = await c.from('parties')
      .select('name_key,kyc_status,kyc_docs').in('name_key', keys.slice(i, i + 200));
    // A failed lookup is an ERROR, not an empty master (finding 32): ignored, it
    // made every customer read as "not on the master" and the whole queue as
    // waiting on KYC.
    if (pe) throw new Error(errMsg(pe));
    (ps ?? []).forEach((p) => kyc.set(String(p.name_key ?? ''),
      { status: String(p.kyc_status ?? ''), docs: p.kyc_docs }));
  }
  return rows.map((r) => {
    const hit = kyc.get(partyKey(String(r.party_name ?? '')));
    return {
      id: Number(r.id), reqid: String(r.reqid ?? ''), submitted_at: String(r.submitted_at ?? ''),
      party_name: String(r.party_name ?? ''), city: String(r.city ?? ''),
      product: String(r.product ?? ''), serial_no: String(r.serial_no ?? ''),
      engineer: String(r.engineer ?? ''),
      kyc_status: hit?.status ?? '', kyc_docs: hit?.docs ?? [], onMaster: !!hit,
    };
  });
}

// ---------------------------------------------------------------------------
// CORRECTING A CALL REQUEST (0232).
//
// The user, 2026-09-22: "Add a Provision in Call Request for me to edit it."
// A request is typed in the field, often from a phone, and the serial, the
// model or the customer is what is most often wrong. The only way to fix one
// was to cancel it and raise another, which loses the original timestamp and
// leaves two rows for one request.
//
// A WHITELIST, AND `ucn` AND `status` ARE NOT ON IT. Those are the request's
// DISPOSITION -- what was done about it -- and they are written by registering
// or cancelling, not by correcting. A form that could set them would let
// somebody mark a request Registered without a call existing.
//
// The database is what enforces the real rule: once a request has become a
// call, 0232 freezes these sixteen columns, because the call carries them from
// that moment and the call is what everything downstream reads.
// ---------------------------------------------------------------------------
const CALL_REQUEST_EDITABLE: Record<string, string> = {
  engineer: 'engineer', email: 'email', callType: 'call_type',
  partyName: 'party_name', state: 'state', city: 'city', address: 'address',
  product: 'product', serial: 'serial_no',
  standardComplaint: 'standard_complaint', reportedProblem: 'reported_problem',
  customerContactDetails: 'customer_contact_details', customerContactNumber: 'customer_contact_number',
  callAttended: 'call_attended', planDate: 'plan_date', additionalComments: 'additional_comments',
};

/** Which fields a request may be corrected in, in the screen's own keys. */
export const callRequestEditableKeys = (): string[] => Object.keys(CALL_REQUEST_EDITABLE);

export async function updateCallRequest(
  id: number, patch: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const row: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(CALL_REQUEST_EDITABLE)) {
    if (patch[key] === undefined) continue;
    const v = String(patch[key] ?? '').trim();
    // A DATE COLUMN TAKES NULL FOR "NOT SET", NEVER ''. PostgREST sends the
    // empty string through and Postgres refuses it as a date.
    row[col] = col === 'plan_date' ? (v === '' ? null : v) : v;
  }
  if (!Object.keys(row).length) return { ok: true };
  // A WRITE ROW-LEVEL SECURITY SKIPS IS NOT AN ERROR. `cr_update` lets the
  // raiser, Hotline and roles that register calls write a request; every office
  // role can READ every request (`cr_read` starts with can_view_all_calls()),
  // so Commercial, NSM, Stores and the coordinators could open the drawer,
  // press Save, and have the UPDATE match NO rows -- which PostgREST reports as
  // success. The screen then said "corrected" and showed a value the database
  // never stored. Measured on a database built from every migration.
  //
  // COUNTED, NOT RETURNED. `.select()` would need the row to be readable AFTER
  // the change, and `engineer`/`email` are correctable, so a manager moving a
  // request to somebody outside his team would see a real save reported as a
  // failure. The count needs no read-back. A null count (the server sent none)
  // is left as success -- unknown is not the same as refused.
  const { error, count } = await must().from('call_requests')
    .update(row, { count: 'exact' }).eq('id', id);
  if (error) return { ok: false, error: errMsg(error) };
  if (count === 0) {
    return {
      ok: false,
      error: 'Nothing was saved — your role can correct only the requests you raised yourself. '
        + 'Ask the person who raised it, or Hotline, to make the correction.',
    };
  }
  return { ok: true };
}

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
// EVERY PENDING REQUEST, NOT THE FIRST 300 (the user, 2026-09-18: "HotLine
// Engineer -- All Data should be Visible for this user").
//
// This read was capped and unpaged, and the cap is the thing "all data should
// be visible" runs into: the Hotline desk sees EVERY engineer's requests
// (`cr_read` consults `can_view_all_calls()`, which names hotline), so this is
// the one register where that person's list is the whole company's rather than
// their own. At 301 pending requests the screen showed 300, called it
// "300 pending call registrations" and gave the badge no `+` — a number that
// looks exact, is a LOWER BOUND, and is acted on.
//
// Paged in full now, so the count is EXACT and takes no `+`, the same shape as
// `countCallReviews`. ORDER IS NOT OPTIONAL WHEN PAGING: `submitted_at` alone
// ties whenever two requests share a timestamp — which a bulk import makes
// certain — and a tie can put the same row on two pages, or neither. `id`
// breaks it.
// ---------------------------------------------------------------------------
// PRODUCT DATABASE 2.0 (0218) — one row per machine, assembled from the five
// registers. PAGED, because this is the install base: ~20,000 machines, and a
// capped read here would be the Product & Party Search fault again.
//
// ORDERED BY `machine_key`, which the view derives and is unique per row -- so
// the pages cannot overlap. Ordering by product or party would tie in their
// thousands and a tie puts a row on two pages or on neither.
// ---------------------------------------------------------------------------
// REBUILDING PRODUCT DATABASE 2.0 (0220). The figures are AS OF the last
// rebuild — the view is materialised because deriving it per page timed out —
// so the screen needs both a way to say WHEN and a way to do it again.
export async function refreshProductDatabaseV2(): Promise<string> {
  const { data, error } = await must().rpc('refresh_product_database_2');
  if (error) throw error;
  return String(data ?? '');
}

export async function listProductDatabaseV2(): Promise<Record<string, unknown>[]> {
  const c = must();
  return allRows<Record<string, unknown>>((from, to) =>
    c.from('product_database_v2').select('*').order('machine_key').range(from, to));
}

// ---------------------------------------------------------------------------
// WHY IS PRODUCT DATABASE 2.0 EMPTY — asked of the DATABASE, not guessed at.
//
// The view lists a machine only where a register row carries BOTH a model and a
// serial, because a machine is its model PLUS its serial and a serial-only key
// merges the eleven machines numbered 219 into one row. So an empty 2.0 does
// NOT mean "no machines" — it means no register row carries both, and those are
// very different findings. The screen used to assert the first one.
//
// Counted as NULL-or-EMPTY rather than blank-after-trimming, because PostgREST
// cannot express `btrim`. That makes every "missing" number a LOWER BOUND — a
// whitespace-only cell is blank to the view and counted as present here — and
// the inequality runs the safe way: the screen can say "at least N of these
// carry no model", never more than is true.
// ---------------------------------------------------------------------------
import type { RegisterCount } from './dberror';
export type RegisterGap = RegisterCount & { register: string; table: string };

const PD2_REGISTERS: { register: string; table: string; model: string }[] = [
  { register: 'Warranty Sale Details', table: 'warranty_sale_details', model: 'product_name' },
  { register: 'Contract Details', table: 'contract_details', model: 'product_name' },
  { register: 'Additional Entries', table: 'product_additional_entries', model: 'item_name' },
];

export async function diagnoseProductDatabaseV2(): Promise<RegisterGap[]> {
  const c = must();
  const head = async (table: string, blank?: string): Promise<number | null> => {
    let q = c.from(table).select('*', { count: 'exact', head: true });
    if (blank) q = q.or(`${blank}.is.null,${blank}.eq.`);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? null;
  };
  return Promise.all(PD2_REGISTERS.map(async (r) => {
    try {
      const [rows, noSerial, noModel] = await Promise.all([
        head(r.table),
        head(r.table, 'serial_number'),
        head(r.table, r.model),
      ]);
      return { register: r.register, table: r.table, rows, noSerial, noModel };
    } catch (e) {
      // A register nobody may count is reported as uncounted, never as zero:
      // a zero here would read as "this register is empty", which is a claim.
      return {
        register: r.register, table: r.table, rows: null, noSerial: null, noModel: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }));
}

// SOLVED, BUT THE VISIT RECORD IS INCOMPLETE (0224). Register-sized — the
// whole point is to hand somebody the list of what to re-upload — so it pages,
// with a tiebreaker after `reg_date` because a bulk import makes ties certain
// and a tie puts a row on two pages or neither.
export async function listSolvedWithoutReport(): Promise<Record<string, unknown>[]> {
  const c = must();
  return allRows<Record<string, unknown>>((from, to) =>
    c.from('solved_without_report').select('*')
      .order('reg_date', { ascending: false, nullsFirst: false })
      .order('ucn', { ascending: false })
      .range(from, to));
}

// CUSTOMER FEEDBACK WITH NO COMPLETED REPORT BEHIND IT (0229).
// Ordered by the feedback's own ENTRY time -- the newest gap is the one worth
// chasing, and the feedback is what this report is a list OF. A tiebreaker on
// the id, because a bulk import makes ties certain and a tie puts a row on two
// pages or neither.
export async function listFeedbackWithoutReport(): Promise<Record<string, unknown>[]> {
  const c = must();
  return allRows<Record<string, unknown>>((from, to) =>
    c.from('feedback_without_report').select('*')
      .order('feedback_entered_at', { ascending: false, nullsFirst: false })
      .order('feedback_id', { ascending: false })
      .range(from, to));
}

export async function listCallRequestsAsPending(): Promise<Record<string, unknown>[]> {
  const c = must();
  const data = await allRows<Record<string, unknown>>((from, to) =>
    c.from('call_requests').select('*')
      .or('ucn.is.null,ucn.eq.').neq('status', 'Cancelled')
      .order('submitted_at', { ascending: false }).order('id', { ascending: false })
      .range(from, to));
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
export type CallState = 'Unattended' | 'Unsolved' | 'Report pending' | 'Solved' | 'Reopened' | 'Cancelled';
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
// ---------------------------------------------------------------------------
// EVERY call on one machine, whatever its status.
//
// `openCallsFor` above reads `pending_calls`, so it answers "is there something
// still open on this serial" — which is the right question when deciding
// whether to map a request onto an existing call. It is NOT the right question
// when the desk wants the machine's history: a call solved last month is often
// exactly what tells them this request is the same fault coming back.
//
// The machine is PRODUCT + SERIAL, not the serial alone. Serial numbers repeat
// across products, so the query is by serial (the indexed column) and the match
// is on the pair — the same rule `openCallsFor` uses. A row with no product
// recorded cannot be told apart, so it is KEPT and shown: the desk can see it
// and judge, which is better than silently hiding a call that may be the one.
// ---------------------------------------------------------------------------
export interface MachineCall extends Omit<OpenCall, 'state'> {
  state: string;
  lastStatus: string;
  solved: boolean;
}
export async function callsForMachine(product: string, serial: string, limit = 200): Promise<MachineCall[]> {
  const ser = String(serial ?? '').trim();
  if (!ser) return [];
  const want = machineKey(product, ser);
  const { data, error } = await must().from('calls')
    .select('ucn,call_type,party_name,product_name,serial,allocated_to,reg_date,complaint_reported,open_state,last_status,reopened_at')
    .eq('serial', ser)
    .order('reg_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(errMsg(error));
  const byUcn = new Map<string, MachineCall>();
  (data ?? []).forEach((r) => {
    const ucn = String(r.ucn ?? '');
    if (!ucn || byUcn.has(ucn)) return;
    const prod = String(r.product_name ?? '').trim();
    if (prod && machineKey(prod, ser) !== want) return;   // another product, same serial
    const open = String(r.open_state ?? '');
    byUcn.set(ucn, {
      ucn,
      callType: String(r.call_type ?? ''),
      partyName: String(r.party_name ?? ''),
      productName: prod,
      serial: String(r.serial ?? ''),
      allocatedTo: String(r.allocated_to ?? ''),
      regDate: String(r.reg_date ?? ''),
      complaint: String(r.complaint_reported ?? ''),
      state: r.reopened_at ? 'Reopened' : open,
      lastStatus: String(r.last_status ?? ''),
      solved: open === 'Solved' && !r.reopened_at,
    });
  });
  return [...byUcn.values()];
}

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

// Close an OPEN call without a visit entry: it ended for operational reasons —
// the customer sorted it, the machine moved, the job was done on another call.
// It is NOT recorded differently (the user's decision): the call reads Solved
// like any other closed call, and no visit is invented. A visit entered later
// takes over as usual, including re-opening the call if it says Unsolved.
export async function closeCall(ucn: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().rpc('close_call', { p_ucn: ucn });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---- cancelling a call -----------------------------------------------------
//
// A call that should not exist — raised twice, the customer rang back, the
// wrong machine. It is NOT a delete: the row keeps its UCN, its visits and its
// quality records, and it reads as Cancelled instead of sitting on the open
// list for ever or being closed as though somebody had solved something.
//
// Admin, NSM and the Hotline by default; it is the `calls.cancel` permission,
// so an administrator can move it. The database checks that, not this.
export async function cancelCall(ucn: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().rpc('cancel_call', { p_ucn: ucn, p_reason: reason });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// The undo. The reason stays on the row: what was done and then undone is part
// of the record.
export async function restoreCall(ucn: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().rpc('restore_call', { p_ucn: ucn });
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
export async function listStockOutLines(cap = 5000): Promise<Record<string, unknown>[]> {
  // PAGED. `.limit(5000)` was not a bigger request: PostgREST caps a response
  // at 1,000 however large the number says, silently, so this returned the
  // first thousand dispatched lines and nothing said otherwise.
  // `line_id`, NOT `id`. The view renames the dispatch line's primary key
  // (`dl.id as line_id`), so ordering by `id` asked PostgREST for a column
  // that is not there — and it does not answer with fewer rows, it answers
  // with an ERROR, so the whole register came back empty. Worse, the error
  // reads "…does not exist", which the screen matched as a MISSING TABLE and
  // told the reader to run migration 0027 — a bundle already applied. See the
  // note on that test in SpareDispatch.tsx; `npm run check:orders` now asks a
  // database whether every paged ORDER column exists.
  return allRows<Record<string, unknown>>((from, to) => must().from('spare_stock_out_lines')
    .select('*').order('dispatched_at', { ascending: false }).order('line_id', { ascending: false })
    .range(from, to), cap);
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
    // Ordered by id (finding 8): unordered pages can overlap, and a dropped row
    // is an engineer who vanishes from their manager's team.
    const { data, error } = await c.from('user_directory').select('*').order('id', { ascending: true }).range(from, from + PAGE - 1);
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

export async function listDirectory(cap = 5000): Promise<DirectoryRow[]> {
  // PAGED (see listStockOutLines). The User Master is the list every "Call
  // Allocated To" box is built from, so a silent cut at a thousand would drop
  // engineers off the end of the alphabet and out of every picker at once.
  const rows = await allRows<Record<string, unknown>>((from, to) =>
    must().from('user_directory').select('*').order('name').order('id').range(from, to), cap);
  return rows.map(dirRow);
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
  let q = must().from('audit_log').select('*').order('at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit - 1);
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
/** The NAME of each role, including those added from the application. Kept
 *  apart from getRolePerms so that adding it did not change a return type four
 *  screens depend on; one extra column on one small table, read once at sign-in
 *  with the matrix. */
export async function getRoleLabels(): Promise<Record<string, string>> {
  const c = getSupabase(); if (!c) return {};
  const { data, error } = await c.from('app_roles').select('role,label');
  if (error) return {};
  const out: Record<string, string> = {};
  (data ?? []).forEach((r) => {
    const label = String(r.label ?? '').trim();
    if (label) out[String(r.role)] = label;
  });
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
    // Ordered by the value it keeps (finding 8) — see distinctColumn.
    const { data, error } = await must().from('calls').select('allocated_to').order('allocated_to', { ascending: true, nullsFirst: false }).range(from, from + PAGE - 1);
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
  status?: string;        // review_status — where the PAPERWORK has got to
  // MORE THAN ONE STAGE AT ONCE. "To be Reviewed" is Review 2 Pending OR
  // Review 3 Pending, and `status` can only ask for one. Kept separate rather
  // than making `status` an array: every existing caller passes a single stage
  // and a filter that quietly changed shape is how one of them starts matching
  // nothing.
  statuses?: string[];
  callState?: string;     // open_state — where the CALL has got to
  product?: string;
  engineer?: string;
  effectOnly?: boolean;   // Any Potential Effect = YES
  q?: string;             // free text across the scannable columns
}

function applyReviewFilter<T extends { eq: (c: string, v: never) => T; gte: (c: string, v: never) => T; lte: (c: string, v: never) => T; in: (c: string, v: never) => T; or: (f: string) => T }>(
  q: T, f: ReviewFilter,
): T {
  if (f.from) q = q.gte('reg_date', f.from as never);
  if (f.to) q = q.lte('reg_date', f.to as never);
  if (f.status) q = q.eq('review_status', f.status as never);
  if (f.statuses?.length) q = q.in('review_status', f.statuses as never);
  // The CALL's own state (Unattended / Unsolved / Report pending / Solved) —
  // a fact about the machine, where `status` above is a fact about the
  // paperwork. Both views carry `open_state`, so the rows and the counters
  // agree; a filter only one of them honoured would make the register disagree
  // with its own header.
  if (f.callState) q = q.eq('open_state', f.callState as never);
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
export async function countCallReviews(
  filter: ReviewFilter = {},
  // THE CALL STATUS BOX, APPLIED TO THE TOTALS HERE RATHER THAN IN THE QUERY.
  // `solvedPending` is the "To be Reviewed" worklist, which is ALWAYS Solved
  // calls whatever that box says; filtered in the query, a box left on
  // "Unsolved" removed every Solved row and the worklist counted 0 while it
  // listed calls. The rule is the query's own (`open_state = <value>`), applied
  // to the rows the scan already reads. Callers passing it must leave
  // `filter.callState` unset.
  totalsState = '',
): Promise<{ total: number; byStatus: Record<string, number>; effects: number; solvedPending: number }> {
  const PAGE = 1000;
  const byStatus: Record<string, number> = {};
  let total = 0; let effects = 0; let solvedPending = 0;
  for (let from = 0; ; from += PAGE) {
    let q = must().from('field_call_review_summary')
      // Ordered by id, one row per call (finding 8): this total is shown as
      // EXACT, and unordered pages can count a row twice or not at all.
      .select('review_status,any_potential_effect,open_state').order('id', { ascending: true }).range(from, from + PAGE - 1);
    q = applyReviewFilter(q as never, filter) as never;
    const { data, error } = await q;
    if (error) throw new Error(errMsg(error));
    const rows = data ?? [];
    rows.forEach((r) => {
      const s = String((r as Record<string, unknown>).review_status ?? '');
      const inTotals = !totalsState || String((r as Record<string, unknown>).open_state ?? '') === totalsState;
      if (inTotals) {
        byStatus[s] = (byStatus[s] ?? 0) + 1;
        if (String((r as Record<string, unknown>).any_potential_effect ?? '') === 'YES') effects += 1;
        total += 1;
      }
      // SOLVED and still waiting on Review 2 or Review 3 — the "To be Reviewed"
      // worklist. Counted here, in the scan that is already happening, because
      // the tab's own filter cannot count itself: a counter narrowed by the
      // thing it counts can only ever report itself.
      if (String((r as Record<string, unknown>).open_state ?? '') === 'Solved'
          && (s === 'Review 2 Pending' || s === 'Review 3 Pending')) solvedPending += 1;
    });
    if (rows.length < PAGE) break;
  }
  return { total, byStatus, effects, solvedPending };
}

// The register's Product and Engineer boxes. Read from the whole register
// (the summary view, which has no per-call lookups) rather than from whatever
// page is loaded, so a product only used last year is still selectable.
export async function reviewPickLists(): Promise<{ products: string[]; engineers: string[] }> {
  const PAGE = 1000;
  const products = new Set<string>(); const engineers = new Set<string>();
  for (let from = 0; from < 40000; from += PAGE) {
    const { data, error } = await must().from('field_call_review_summary')
      // Ordered by the two values it keeps (finding 8) — see distinctColumn.
      .select('product_name,allocated_to').order('product_name', { ascending: true, nullsFirst: false }).order('allocated_to', { ascending: true, nullsFirst: false }).range(from, from + PAGE - 1);
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

// ---------------------------------------------------------------------------
// ANSWER REVIEW 2 FOR MANY CALLS AT ONCE (0119).
//
// The rule the function exists for: a call that failed inside its FIRST YEAR
// is reviewed one by one, never in bulk — Review 2 is where "Warranty Failure
// (1 yr)" is answered, so those are exactly the ones a person has to look at.
// The screen hides them from the selection; the DATABASE refuses them, which
// is what makes it a control rather than a convenience.
// ---------------------------------------------------------------------------
export async function bulkSetReview2(
  ucns: string[], risk: string, warranty: string, frequent: string, by: string,
): Promise<{ ok: boolean; updated?: number; skipped?: number; reason?: string; error?: string }> {
  const { data, error } = await must().rpc('bulk_set_review2', {
    p_ucns: ucns, p_risk: risk, p_warranty: warranty, p_frequent: frequent, p_by: by,
  });
  if (error) return { ok: false, error: errMsg(error) };
  const row = (Array.isArray(data) ? data[0] : data) as { updated?: number; skipped?: number; reason?: string } | null;
  return { ok: true, updated: Number(row?.updated ?? 0), skipped: Number(row?.skipped ?? 0), reason: String(row?.reason ?? '') };
}

// REVIEW 2 ANSWERS ITSELF THE MORNING AFTER (0124). Called when the register
// loads, so the rule applies on a project without pg_cron too — then it happens
// when somebody opens the screen after 9:15 rather than at a quarter past nine.
// Idempotent and self-gating: before 9:15 it marks nothing, and it only ever
// fills in a Review 2 that is still blank, so calling it on every load is safe.
export async function autoAnswerReview2():
  Promise<{ marked: number; heldFirstYear: number; heldUnknownAge: number; ran: boolean; note: string }> {
  const { data, error } = await must().rpc('auto_answer_review2');
  if (error) throw new Error(errMsg(error));
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    marked: Number(row?.marked ?? 0),
    heldFirstYear: Number(row?.held_first_year ?? 0),
    heldUnknownAge: Number(row?.held_unknown_age ?? 0),
    ran: Boolean(row?.ran),
    note: String(row?.note ?? ''),
  };
}

// The state of many calls at once, for colouring their UCNs wherever they are
// shown. `call_state` is the view that already answers "what is this call
// doing?" — Cancelled before Reopened before its visit-derived state (0108).
// RLS applies, so a caller gets states only for calls they may see; the rest
// come back absent and render uncoloured rather than guessed.
export async function listCallStates(ucns: string[]): Promise<Record<string, string>> {
  const want = [...new Set(ucns.filter(Boolean))];
  const out: Record<string, string> = {};
  const CHUNK = 200;                       // keep the URL inside PostgREST's limits
  for (let i = 0; i < want.length; i += CHUNK) {
    const { data, error } = await must().from('call_state')
      .select('ucn,state,last_status').in('ucn', want.slice(i, i + CHUNK));
    if (error) throw new Error(errMsg(error));
    (data ?? []).forEach((r) => {
      const row = r as { ucn?: string; state?: string; last_status?: string };
      if (row.ucn) out[row.ucn] = String(row.last_status || row.state || '');
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// AUTO SAVE, SET FOR EVERYONE (DCCR).
//
// Stored in `app_settings`, whose write policy is already admin-only (0047) —
// so the gate is the database's, not a hidden button. Two keys, written
// together: what it was set to, and WHEN. The time is what lets a reviewer's
// later choice stand while an administrator's "apply for everyone" overrides
// the choices made before it.
// ---------------------------------------------------------------------------
export const DCCR_AUTOSAVE_KEY = 'dccr.autosave_default';
export const DCCR_AUTOSAVE_AT_KEY = 'dccr.autosave_default_at';

export async function getDccrAutoSaveDefault(): Promise<{ on: boolean; at: number } | null> {
  const { data, error } = await must().from('app_settings')
    .select('key,value').in('key', [DCCR_AUTOSAVE_KEY, DCCR_AUTOSAVE_AT_KEY]);
  if (error) throw new Error(errMsg(error));
  const rows = (data ?? []) as { key: string; value: string }[];
  const on = rows.find((r) => r.key === DCCR_AUTOSAVE_KEY)?.value;
  if (on === undefined) return null;                    // never set for anybody
  const at = Number(rows.find((r) => r.key === DCCR_AUTOSAVE_AT_KEY)?.value ?? 0);
  return { on: String(on).trim() === 'on', at: Number.isFinite(at) ? at : 0 };
}

export async function setDccrAutoSaveDefault(on: boolean): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await must().from('app_settings').upsert([
    { key: DCCR_AUTOSAVE_KEY, value: on ? 'on' : 'off', updated_at: now },
    { key: DCCR_AUTOSAVE_AT_KEY, value: String(Date.now()), updated_at: now },
  ], { onConflict: 'key' });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---------------------------------------------------------------------------
// A REGISTER'S LAYOUT, SET FOR A ROLE (0120).
//
// Which columns, in what order, how wide, grouped by what. `role: ''` is
// EVERYONE, and the same table answers both — one mechanism, so the two cannot
// drift. `setAt` is stamped by the database and is what the reader's own
// arrangement is compared against: the later decision wins, like Auto Save.
// ---------------------------------------------------------------------------
export interface RoleTableView {
  order?: string[]; widths?: Record<string, number>; hidden?: string[];
  group?: string[]; wrap?: boolean;
}
export async function myTableView(storageKey: string): Promise<{ view: RoleTableView; setAt: number; role: string } | null> {
  const { data, error } = await must().rpc('my_table_view', { p_storage_key: storageKey });
  if (error) throw new Error(errMsg(error));
  const row = (Array.isArray(data) ? data[0] : data) as { view?: RoleTableView; set_at?: number; role?: string } | null;
  if (!row) return null;
  return { view: (row.view ?? {}) as RoleTableView, setAt: Number(row.set_at ?? 0), role: String(row.role ?? '') };
}
export async function setRoleTableView(storageKey: string, role: string, view: RoleTableView): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().rpc('set_role_table_view', { p_storage_key: storageKey, p_role: role, p_view: view });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}
export async function clearRoleTableView(storageKey: string, role: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().rpc('clear_role_table_view', { p_storage_key: storageKey, p_role: role });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---- masters (dropdown value-lists) ----------------------------------------
// App master keys map to different sources: party -> parties, spare -> parts,
// product -> products, complaint -> the 'standardComplaint' list; the rest are
// plain masters rows.
export async function listMaster(name: string, limit = 3000): Promise<string[]> {
  const c = must();
  if (name === 'party') return sbListParties();
  // ONE REQUEST, NOT TWENTY-ONE. This paged the WHOLE products table a thousand
  // rows at a time — 21 sequential round trips pulling 21,000 rows — to arrive
  // at about forty distinct names. `product_register_names` (0098) has done the
  // DISTINCT in Postgres since it was written; this call simply never used it.
  // On a phone those 21 round trips are most of why the New Call Request form
  // was slow to open, and could stop responding altogether.
  if (name === 'product') {
    try {
      const rows = await sbListProductNames();
      if (rows.length) return rows.map((r) => r.name).filter(Boolean);
    } catch { /* the view may not be applied yet — fall through */ }
    return distinctColumn('products', 'item_name');
  }
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
    const { data, error } = await c.from('masters').select('name,value').neq('active', false).order('name').order('id').range(from, from + PAGE - 1);
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
export async function listMasterItems(key: string, cap = 5000): Promise<MasterItem[]> {
  const names = key === 'complaint' ? ['complaint', 'standardComplaint'] : [key];
  // PAGED (see listStockOutLines). A value list longer than a thousand — the
  // complaint list is the one that grows — lost its tail, and a picker fed from
  // it then refuses a value that IS on the master.
  const data = await allRows<Record<string, unknown>>((from, to) => must().from('masters')
    .select('*').in('name', names).order('value').order('id').range(from, to), cap);
  return (data ?? []).map((r) => ({
    id: Number(r.id), name: String(r.name), value: String(r.value ?? ''),
    extra: (r.extra ?? {}) as Record<string, string>,
    added_on: (r.added_on as string) ?? null, added_by: String(r.added_by ?? ''),
    active: r.active !== false,
  }));
}

// The values of a PER-PRODUCT master (DCCR Complaint Grouping, Root Cause Key
// Word) for one product. Sorted, de-duplicated.
//
// WHICH ONES is `masterValueApplies` in src/lib/dccr.ts, and it is there rather
// than here so the rule can be read and tested without a database: T60 and T75
// get their own curated list and nothing else; every other product gets all of
// them. Until 2026-09-07 this offered the product's own PLUS everything tagged
// COMM, which buried a Monnal's alarm codes in the common list and left every
// other product with only the handful of COMM values.
export async function listMasterValuesForProduct(key: string, product: string, limit = 5000): Promise<string[]> {
  const items = await listMasterItems(key, limit);
  const seen = new Set<string>();
  return items
    .filter((i) => masterValueApplies(String(i.extra?.product ?? ''), product))
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
/** The fields nothing points at — safe to write straight to the row.
 *
 *  The CODE and DESCRIPTION are deliberately NOT here: together they are the
 *  part's identity, nine tables name it by that string, and there is not one
 *  foreign key to `parts`. Changing them is `renamePart` below, which carries
 *  the history. */
export async function updatePart(
  id: number, patch: { category?: string; product?: string; purchase_cost?: number | null },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('parts').update(patch).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

export interface PartRenameImpact { relation: string; rows: number }
/** What a rename would move, BEFORE it moves it. A count afterwards is a
 *  report; a count beforehand is a decision. */
export async function partRenameImpact(itemDetail: string): Promise<PartRenameImpact[]> {
  const { data, error } = await must().rpc('part_rename_impact', { p_item_detail: itemDetail });
  if (error) throw new Error(errMsg(error));
  return ((data ?? []) as { relation: string; rows: number }[])
    .map((r) => ({ relation: String(r.relation), rows: Number(r.rows) }))
    .filter((r) => r.rows > 0);
}

/** Rename a part AND every record that names it, in one transaction (0196).
 *
 *  Not an update of two columns: hand stock is DERIVED from the tables that
 *  carry the old string, so a half-done rename changes an engineer's balance.
 *  The database does all nine or none. */
export async function renamePart(
  id: number, code: string, description: string,
): Promise<{ ok: boolean; moved?: Record<string, number>; from?: string; to?: string; error?: string }> {
  const { data, error } = await must().rpc('rename_part',
    { p_id: id, p_code: code, p_description: description });
  if (error) return { ok: false, error: errMsg(error) };
  const r = (data ?? {}) as Record<string, unknown>;
  return { ok: true, moved: (r.moved as Record<string, number>) ?? {},
           from: String(r.from ?? ''), to: String(r.to ?? '') };
}

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
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit - 1);
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
export async function listAllStock(cap = 5000): Promise<StockRow[]> {
  // PAGED (see listStockOutLines). Hand stock across every engineer is well
  // over a thousand lines, so this was reporting a part of the field's holding
  // as all of it.
  const data = await allRows<Record<string, unknown>>((from, to) => must().from('engineer_stock')
    .select('*').gt('qty', 0).order('engineer').order('part').range(from, to), cap);
  return data.map((r) => ({ engineer: String(r.engineer), part: String(r.part), qty: Number(r.qty) }));
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
export async function listPendingDispatch(cap = 2000): Promise<Record<string, unknown>[]> {
  // PAGED. `.range(0, 1999)` is not a bigger request either — the cap is on the
  // RESPONSE, not on the span asked for — so the dispatch queue stopped at a
  // thousand lines with no Load more and nothing to say work was hidden.
  return allRows<Record<string, unknown>>((from, to) => must().from('spare_pending_dispatch').select('*')
    .order('engineer', { ascending: true }).order('or_no', { ascending: true })
    .order('row_no', { ascending: true }).range(from, to), cap);
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

// ---------------------------------------------------------------------------
// APPROVAL IN BULK (0116) — tick the boxes, press Approve.
//
// Each line is approved AT THE STAGE IT IS AT, so a mixed selection advances
// every line by exactly one step and nothing skips a review it has not had.
// It SKIPS what the caller may not approve instead of failing the batch — a
// batch of forty that stops on the one line you may not touch is a batch you
// then take apart by hand — and returns both counts with a reason, so the
// screen can say what happened to all forty.
// ---------------------------------------------------------------------------
export type SpareDecision = 'approve' | 'reject' | 'drop';
export async function decideSpareLines(
  lineIds: number[], decision: SpareDecision, actor: string, reason = '',
): Promise<{ ok: boolean; decided?: number; skipped?: number; reason?: string; error?: string }> {
  const { data, error } = await must().rpc('decide_spare_lines', {
    p_line_ids: lineIds, p_decision: decision, p_actor: actor, p_reason: reason,
  });
  if (error) return { ok: false, error: errMsg(error) };
  const row = (Array.isArray(data) ? data[0] : data) as { decided?: number; skipped?: number; reason?: string } | null;
  return { ok: true, decided: Number(row?.decided ?? 0), skipped: Number(row?.skipped ?? 0), reason: String(row?.reason ?? '') };
}

// What is waiting for an RM, and — per row, per reader — whether THIS reader
// may give it. `may_approve` is on the row rather than filtered out, so a spare
// somebody cannot approve is shown greyed rather than missing: "why is my spare
// not in the queue" then has an answer on the screen.
export async function listPendingRmApproval(cap = 2000): Promise<Record<string, unknown>[]> {
  // PAGED (see listPendingDispatch). Same shape, same queue-hiding fault.
  return allRows<Record<string, unknown>>((from, to) => must().from('spare_pending_rm').select('*')
    .order('engineer', { ascending: true }).order('or_no', { ascending: true })
    .order('row_no', { ascending: true }).range(from, to), cap);
}

// ---------------------------------------------------------------------------
// IS THIS A FREQUENT FAILURE? (0117, and the procedure's own rule in 0153)
//
// Review 2 asks it, and until now it was answered from memory. The register
// knows: earlier calls on the same machine within the window, matched on the
// same complaint OR the SAME PART fitted, counted INCLUDING the call under
// review against the threshold.
//
// THE VERDICT COMES FROM THE DATABASE, not from arithmetic here. The old shape
// returned rows and left the screen to apply the rule — which is how the count
// came to be read one short of what the procedure counts. One rule, one place.
//
// It returns the CALLS as well as the number. The reviewer is recording a
// judgement they may have to defend, and "which ones?" is the next question;
// `match_on` answers the one after that.
// ---------------------------------------------------------------------------
export interface FailureHistoryRow {
  ucn: string; call_number: string; reg_date: string;
  complaint: string; engineer: string; party_name: string; days_before: number;
  match_on: string;
}
export interface FrequentFailure {
  window_months: number;
  threshold: number;
  equipment_needs_complaint: boolean;
  /** false when the machine cannot be identified — a blank serial. "Cannot
   *  tell" and "no history" are different things to record a judgement on. */
  known: boolean;
  earlier: number;
  /** earlier + the call under review, which is what the threshold is against. */
  total: number;
  /** EITHER RULE. Rule 1 is one machine repeating; rule 2 is one MODEL failing
   *  the same way across different units — the thing rule 1 can never see,
   *  because each of those calls is a first failure on its own machine. */
  is_frequent: boolean;
  rows: FailureHistoryRow[];
  // ---- rule 2 (0198) ----
  rule2_enabled: boolean;
  rule2_window_days: number;
  /** How many DISTINCT serials it takes. Counting serials rather than calls is
   *  the point: five calls on one machine are rule 1's business. */
  rule2_serials: number;
  rule1_is_frequent: boolean;
  rule2_is_frequent: boolean;
  /** Distinct serials seen, INCLUDING the machine under review. */
  rule2_serials_seen: number;
  rule2_calls: number;
  rule2_rows: FailureHistoryRow[];
}
export async function frequentFailure(ucn: string): Promise<FrequentFailure> {
  const { data, error } = await must().rpc('frequent_failure', { p_ucn: ucn });
  if (error) throw new Error(errMsg(error));
  return data as FrequentFailure;
}

// The rule itself, for Admin Config. Read by anybody who may review; only an
// administrator can write, and that gate is the database's (app_settings, 0047).
export const FFR_KEYS = {
  months: 'ffr.window_months',
  threshold: 'ffr.threshold',
  needsComplaint: 'ffr.equipment_needs_complaint',
  // Rule 2 (0198) — its own window, in DAYS, because the user asked for thirty
  // days and "a month" is a different length in February.
  rule2Enabled: 'ffr.rule2_enabled',
  rule2WindowDays: 'ffr.rule2_window_days',
  rule2Serials: 'ffr.rule2_serials',
} as const;

export interface FrequentFailureRule {
  window_months: number; threshold: number; equipment_needs_complaint: boolean;
  // Rule 2 (0198). Its window is in DAYS on purpose — the user asked for thirty
  // days, and "a month" is a different length in February.
  rule2_enabled: boolean; rule2_window_days: number; rule2_serials: number;
}
export async function getFrequentFailureRule(): Promise<FrequentFailureRule> {
  const { data, error } = await must().rpc('frequent_failure_rule');
  if (error) throw new Error(errMsg(error));
  return data as FrequentFailureRule;
}

export async function setFrequentFailureRule(
  r: FrequentFailureRule,
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await must().from('app_settings').upsert([
    { key: FFR_KEYS.months, value: String(Math.max(1, Math.round(r.window_months))), updated_at: now },
    { key: FFR_KEYS.threshold, value: String(Math.max(1, Math.round(r.threshold))), updated_at: now },
    { key: FFR_KEYS.needsComplaint, value: r.equipment_needs_complaint ? 'on' : 'off', updated_at: now },
    // RULE 2. `on`/`off` for the switch, matching its sibling above rather than
    // inventing a second spelling for the same idea in the same table.
    { key: FFR_KEYS.rule2Enabled, value: r.rule2_enabled ? 'on' : 'off', updated_at: now },
    { key: FFR_KEYS.rule2WindowDays, value: String(Math.max(1, Math.round(r.rule2_window_days))), updated_at: now },
    // AT LEAST TWO SERIALS, floored here as well as in SQL: one serial is not
    // "multiple", and a rule that fired on one would fire on every call.
    { key: FFR_KEYS.rule2Serials, value: String(Math.max(2, Math.round(r.rule2_serials))), updated_at: now },
  ], { onConflict: 'key' });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
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
// ---------------------------------------------------------------------------
// THE SERVICE REPORT ON A CLOSED CALL — one row, fetched when the call is
// opened, rather than another column on the register.
//
// The call tables denormalise the LAST VISIT's status and date (0014/0032) and
// nothing else, so the link is not on the row. Widening that denormalisation
// would mean a column on three call tables, the trigger, and a rebuild of the
// `calls` view -- and `create or replace view` there is the change that has
// dropped `security_invoker` three times in this project. One request when a
// call is opened is the cheaper side of that trade by a distance.
//
// THE LATEST VISIT THAT HAS ONE, not simply the latest visit. The report is
// mandatory on the visit that closes a call, but a call re-opened and closed
// again for an operational reason has a later visit with nothing attached --
// and showing nothing there would say "no report was ever filed", which is a
// different and untrue statement. The visit it came from is returned with it,
// so the screen can say WHICH visit rather than implying it was the last.
//
// Keyed on UCN, which is what saveReport() writes; call_number is the fallback
// for sheet-era rows that were filed the other way round.
// ---------------------------------------------------------------------------
export interface CallServiceReport { url: string; visitAt: string; status: string; engineer: string }
export async function serviceReportForCall(ucn: string, callNumber = ''): Promise<CallServiceReport | null> {
  const c = getSupabase(); if (!c) return null;
  const cols = 'manual_report,data,visit_at,updated_at,call_status,engineer,id';
  const pick = async (column: 'ucn' | 'call_number', value: string): Promise<CallServiceReport | null> => {
    if (!value) return null;
    const { data, error } = await c.from('reports').select(cols)
      .eq(column, value)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(50);
    if (error) return null;
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const url = manualReportLink(row);
      if (url) {
        return {
          url,
          visitAt: String(row.visit_at ?? row.updated_at ?? ''),
          status: String(row.call_status ?? ''),
          engineer: String(row.engineer ?? ''),
        };
      }
    }
    return null;
  };
  return (await pick('ucn', ucn)) ?? (callNumber && callNumber !== ucn ? await pick('call_number', callNumber) : null);
}

export async function spareRequestsByCall(callNumber: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('spare_request_lines')
    // `or_no` IS THE OR NUMBER and it was not selected, so the call's spares
    // table and its detail pane both rendered it blank -- the detail pane had
    // asked for `or_number`, a column that does not exist, since it was
    // written. The OR is what Stores, the paperwork and the customer all say,
    // so it is the one identifier on this row somebody can act on.
    .select('*, spare_requests!inner(uid, or_no, call_number, req_type, status, engineer, item_status, rm_approval, commercial_approval, nsm_approval, stores_status, dc_number, received_at, created_at)')
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
      uid: req?.uid, or_no: req?.or_no, req_status: req?.status, req_engineer: req?.engineer, requested_at: req?.created_at,
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
    // THE TIEBREAKER THE PAGES NEED. Two parts of one MRN can share a row
    // number (the unique index includes the part), so the three orders above
    // tie and a page boundary could double one line and drop another.
    .order('id', { ascending: true })
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
// The balance, a page at a time.
//
// `limit` was 5,000 and the screen said "Synced 1000 lines": PostgREST caps a
// response at its own max-rows however wide a range is asked for, so the extra
// 4,000 were never coming. It pages properly now, and the caller decides how
// many pages to take.
//
// SEARCH IS SERVER-SIDE when a term is given. Filtering the page already loaded
// answers "is it on this screen", which is not the question — a part somebody is
// looking for is exactly the one that has not been paged in yet.
export async function listHandstockBalance(
  limit = 1000, offset = 0, search = '',
): Promise<Record<string, unknown>[]> {
  let q = must().from('handstock_balance').select('*');
  const term = _san(search.trim());
  if (term) q = q.or(`engineer.ilike.%${term}%,part.ilike.%${term}%,part_code.ilike.%${term}%`);
  const { data, error } = await q
    .order('engineer', { ascending: true }).order('part_code', { ascending: true })
    .range(offset, offset + limit - 1);
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
// Every column of handstock_movements after `moved_at`, in the view's order.
const HANDSTOCK_MOVEMENT_TIEBREAK = [
  'direction', 'movement', 'engineer_key', 'engineer', 'engineer_email', 'part_code', 'part',
  'qty', 'ref', 'ref_type', 'ref_uid', 'ucn', 'call_number', 'party_name', 'remarks',
] as const;
// Every movement, newest first — the Movements tab of the Hand Stock register.
// Optional engineer / part filters narrow it server-side.
export async function listAllHandstockMovements(
  limit = 1000, offset = 0, filter: { engineerKey?: string; partCode?: string } = {},
): Promise<Record<string, unknown>[]> {
  let q = must().from('handstock_movements').select('*');
  if (filter.engineerKey) q = q.eq('engineer_key', filter.engineerKey);
  if (filter.partCode) q = q.eq('part_code', filter.partCode);
  // The view has NO unique column, so the tie on `moved_at` (a dispatch moves
  // many parts at once) is broken on EVERY column (finding 15). Two rows equal
  // in all of them are the same row to the reader, so their order cannot drop
  // or double anything.
  const { data, error } = await HANDSTOCK_MOVEMENT_TIEBREAK.reduce(
    (acc, col) => acc.order(col, { ascending: true, nullsFirst: false }),
    q.order('moved_at', { ascending: false, nullsFirst: false }),
  ).range(offset, offset + limit - 1);
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
  const { data, error } = await must().from('spare_consumption').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return data ?? [];
}
// Customer feedback, newest first. Each answer in the `answers` jsonb becomes
// its OWN column (prefixed `fb::<question>`) so every field the engineer entered
// shows as a separate column rather than one consolidated string.
// A UNIQUE TIEBREAKER ON THE PAGED READS OF feedback, spare_consumption,
// spare_request_lines, audit_log and parties (finding 15). `created_at`,
// `at` and `party_name` tie -- a bulk import writes thousands of rows in one
// instant -- and a page boundary inside a tie can hand the same row to two
// pages and another to none. `id` is each table's primary key, so the order
// is total. It matters more now that the 30-minute sync re-reads every page
// the reader had loaded rather than only the first (finding 22).
export async function listFeedbackRows(limit = 1000, offset = 0): Promise<Record<string, unknown>[]> {
  const { data, error } = await must().from('feedback').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit - 1);
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
  /** THIS IDENTITY IS A STAND-IN, not a row that was read. Set only by
   *  `sbCurrentProfile()`'s last resort, where there is no profile row and
   *  nothing in the User Master to build one from. The person stays signed in —
   *  locking somebody out of an app they can authenticate to is worse — but
   *  every screen that shows who they are must SAY the profile did not load,
   *  because a blank name beside the fallback role is exactly what a broken app
   *  looks like. It is never stored: the column does not exist. */
  unresolved?: boolean;
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
// AN ADMINISTRATOR RESETS A FORGOTTEN PASSWORD (0110).
//
// Setting somebody else's password is an admin-API operation and the admin API
// needs the service_role key, which must never be in a browser — so this goes
// through a database function that holds the privilege instead, and checks the
// caller is an administrator before doing anything.
//
// The password is generated HERE and returned to the caller so it can be shown
// once and passed on. It is never stored: `password_resets` records who reset
// whose account, and that is all.
export async function sbAdminResetPassword(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().rpc('admin_reset_password', { p_email: email, p_password: password });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// NOT CALLED BY ANY SCREEN since the sign-in page stopped offering a
// self-service reset (v0.9.89): a forgotten password is an administrator's job
// now. Kept because this is exactly what an admin-side "send a reset link"
// button would call, and it is the supported way to do it.
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
  // THE ERROR IS NOT SWALLOWED. This used to read `const { data }` and drop the
  // error on the floor — so a failed read of somebody's own profile fell
  // silently through to the bare-engineer identity below, and they simply found
  // buttons missing with nothing anywhere saying why. A person quietly
  // downgraded is the worst kind of permission bug: it looks like the app is
  // broken rather than like access was not granted.
  const { data, error } = await c.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw new Error(`Could not read your profile: ${errMsg(error)}`);
  if (data) return data as Profile;
  // No profile row yet: build one from this person's User Master row, so they
  // arrive with the role they were given rather than as a bare engineer (and
  // so they show up in User Access at all).
  const made = await ensureMyProfile();
  if (made) return made;
  // NOTHING TO BUILD FROM. They stay signed in — a person with no profile row
  // and no User Master row would otherwise be locked out of an app they can
  // authenticate to — but the identity SAYS it is unresolved rather than
  // reading as a real one.
  //
  // It used to return `full_name: user.email ?? ''`, and where the session
  // carries no email that is a person with NO NAME ANYWHERE: the screen shows
  // "—" for their name, "—" for their email and "Engineer" for their role, and
  // nothing on it says why. That is the quiet downgrade the comment fifteen
  // lines above calls the worst kind of permission bug, written by the same
  // file that condemns it.
  //
  // `unresolved` is what the app reads to say so out loud; the name is filled
  // for the same reason, because a blank is indistinguishable from a bug.
  return {
    id: user.id,
    email: user.email ?? '',
    full_name: user.email || 'Profile not loaded',
    role: 'engineer',
    unresolved: true,
  } as Profile;
}
// ---------------------------------------------------------------------------
// A USER'S SAVED SIGNATURE (0172).
//
// Read and written only by its owner — the row policies say so, so these need
// no scoping of their own and a bug here cannot leak one. There is deliberately
// no "read somebody else's": a signature a second person can obtain is one they
// can put on anything.
// ---------------------------------------------------------------------------
export interface MySignature { signature: string; name_line: string; title_line: string; updated_at?: string }

export async function sbMySignature(): Promise<MySignature | null> {
  const c = getSupabase(); if (!c) return null;
  const { data: { user } } = await c.auth.getUser();
  if (!user) return null;
  const { data, error } = await c.from('user_signatures')
    .select('signature, name_line, title_line, updated_at').eq('user_id', user.id).maybeSingle();
  // A table that is not there yet is "no signature", not a broken Profile page:
  // the migration is the user's step and the rest of the page must still work.
  if (error) return null;
  return (data as MySignature) ?? null;
}

export async function sbSaveMySignature(sig: MySignature): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  const { data: { user } } = await c.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  // user_id is sent because the INSERT policy tests it; the trigger overwrites
  // it with the session's id anyway, so the two cannot disagree.
  const { error } = await c.from('user_signatures').upsert(
    { user_id: user.id, signature: sig.signature, name_line: sig.name_line, title_line: sig.title_line },
    { onConflict: 'user_id' });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

export async function sbClearMySignature(): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  const { data: { user } } = await c.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const { error } = await c.from('user_signatures').delete().eq('user_id', user.id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
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
/** Auth events, with the two things that make them safe to act on.
 *
 *  1. NEVER CALL SUPABASE FROM INSIDE THE CALLBACK. `onAuthStateChange` runs
 *     its listeners while the auth client holds its internal lock, so an
 *     `await c.auth.getUser()` — or any PostgREST read, which needs the token —
 *     made from in here waits for a lock the caller is holding. supabase-js
 *     documents this and it is easy to write by accident, because it works the
 *     first time: the DIRECT call at boot is outside the callback and returns
 *     real data, and only a LATER event (the auto-refresh tick, a tab regaining
 *     focus) goes through this path.
 *
 *     Reported from use (2026-09-16): "For 1 user alone - in 10Secs, it is
 *     going into ? instead of Profile Details ... no matter which user logins
 *     in, it is the same." The profile loaded, and seconds later the name and
 *     email went blank and the role fell back to Engineer. Handing the callback
 *     back out to a fresh task is the whole fix — the listener returns at once,
 *     the lock is released, and the work runs normally.
 *
 *  2. THE EVENT IS PASSED ON. It was swallowed, so every event looked alike and
 *     the caller re-read the identity for things that cannot change it. The
 *     ones that matter are named below; the rest are ignored rather than
 *     causing a round trip per tick.
 */
export type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED' | 'USER_UPDATED' | 'PASSWORD_RECOVERY' | string;

export function sbOnAuthChange(cb: (event: AuthEvent) => void): () => void {
  const c = getSupabase(); if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((event) => {
    // OUT OF THE CALLBACK BEFORE ANYTHING ELSE HAPPENS. `setTimeout(…, 0)`
    // rather than a microtask: a promise continuation can still run before the
    // lock is released, and this must be a separate task.
    setTimeout(() => cb(event), 0);
  });
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
  // PAGED. The order already ends in `id desc`, which makes the pages
  // deterministic; the cap alone was the fault.
  const data = await allRows<OwnershipTransfer>((a, b) => {
    let q = c.from('ownership_transfers').select('*')
      .order('transfer_date', { ascending: false, nullsFirst: false }).order('id', { ascending: false });
    if (serial.trim()) q = q.ilike('serial_number', `%${serial.trim()}%`);
    return q.range(a, b);
  }, 20000);
  return data;
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
  // PAGED, with `id` added to the order: `created_at` alone is not unique, and
  // two rows sharing a timestamp either side of a page boundary is how a row
  // gets shown twice and another not at all.
  return allRows<AdditionalEntry>((a, b) => {
    let q = c.from('product_additional_entries').select('*')
      .order('created_at', { ascending: false }).order('id', { ascending: false });
    if (serial.trim()) q = q.ilike('serial_number', `%${serial.trim()}%`);
    return q.range(a, b);
  }, 20000);
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
// ---------------------------------------------------------------------------
// A register whose rows point at rows that have to exist first.
//
// The spare LINES export names its request by OR number and nothing else, and
// the header export does not go back as far as the lines do — 58 of the OR
// numbers on 8,675 lines are in neither file. The database can create a stub
// parent from a trigger (0084), but a trigger's insert is INVISIBLE to the
// command inserting the line, so the row-level check cannot see the parent it
// is being asked about and refuses the row. One line, and the whole file fails.
//
// So resolve it HERE, before the write, in statements of its own:
//   1. which requests are already here, by uid;
//   2. of the rest, which are here under a DIFFERENT uid — matched on the OR
//      number, which is what the line actually names — and point the line at it;
//   3. create what is genuinely missing, marked as created from a line.
//
// Every one of those is a separate statement, so the parents are plainly there
// by the time the lines go up. The upload then works whatever the database has
// applied, instead of depending on the trigger and its policy.
// ---------------------------------------------------------------------------
const IN_CHUNK = 200;   // keeps the request URL well inside every gateway's limit

export async function prepareUpload(
  kind: 'spare-line-parents' | 'stock-transfer-parents' | 'handstock-engineers'
    | 'consumption-visits',
  rows: Record<string, unknown>[],
): Promise<{ ok: boolean; note?: string; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Database not connected.' };

  // ---- A SPARE NEEDS A VISIT, AND THE FILE USUALLY SAYS WHAT IT WAS -------
  //
  // 0214 refuses a consumption row whose call has no `reports` entry. On a bulk
  // load that arrived as a failure on ROW 1 with nothing written, which is
  // correct and unhelpful: the visit those rows describe is IN THE FILE.
  // `Visit Date & Time` is mapped onto `created_at` by this upload already, and
  // `Visit Entry Date` falls into `data` with the other unmapped headings.
  //
  // So the visit is FILED FIRST, from the file's own values. Nothing is
  // invented -- a UCN the file gives no date for keeps no visit, and its rows
  // are held back BY NAME so the rest of the file still loads. That is the
  // whole gain over the database's refusal, which could only stop everything.
  //
  // THE UID CONVENTION IS `REPORT_COLS`' OWN, character for character:
  // `IMP-<ucn>-<yyyymmddhhmmss>`. Loading the same data through Bulk Uploads ->
  // Visit Reports then lands on the SAME row rather than a second visit of the
  // same call on the same day, and re-running either is idempotent.
  if (kind === 'consumption-visits') {
    const ucns = [...new Set(rows.map((r) => String(r.ucn ?? '').trim()).filter(Boolean))];
    if (!ucns.length) return { ok: true };

    // Which calls already have a visit. Chunked like every other `in` here.
    const have = new Set<string>();
    for (let i = 0; i < ucns.length; i += IN_CHUNK) {
      const { data, error } = await c.from('reports').select('ucn').in('ucn', ucns.slice(i, i + IN_CHUNK));
      if (error) return { ok: false, error: `Could not read the visits: ${errMsg(error)}` };
      (data ?? []).forEach((r) => have.add(String(r.ucn ?? '').trim()));
    }

    // WHAT to write and what to hold back is decided in `uploads.ts`, where a
    // node script can import it and `check:uploads` can prove it. Only the two
    // round trips are here.
    const plan = planConsumptionVisits(rows, have);

    for (let i = 0; i < plan.visits.length; i += 200) {
      const { error } = await c.from('reports')
        .upsert(plan.visits.slice(i, i + 200), { onConflict: 'uid' });
      if (error) return { ok: false, error: `Could not file the visits these spares belong to: ${errMsg(error)}` };
    }

    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (plan.holdBack.has(String(rows[i].ucn ?? '').trim())) rows.splice(i, 1);
    }
    return { ok: true, note: plan.note || undefined };
  }

  // ---- Hand stock belongs to an ACTIVE ENGINEER ---------------------------
  //
  // The WinMax export's `User Name` column is not a list of engineers. It holds
  // dealers and customers too — 252,592 of its 257,130 parts sit under names
  // like "A AND M HEALTH CARE C" — and loading those would give every one of
  // them a hand-stock balance on a screen that only means anything for the
  // people who carry parts. Asked, the user said: User Master, active names
  // only. So a row is kept only if its name is an ACTIVE row of the User Master.
  //
  // Matched on `lower(trim(name))`, which IS the database's `handstock_key()` —
  // the same normalisation the balance is keyed on, so a name that passes here
  // lands on the pool it was meant for rather than beside it.
  //
  // It applies to the prepared pool as well as the WinMax export. The rule is
  // the same either way, and in a file somebody typed it catches the typo that
  // would otherwise open a balance for an engineer who does not exist.
  if (kind === 'handstock-engineers') {
    // PAGED. This set decides which uploaded rows are KEPT, so a name missing
    // because of the cap would throw that person's stock away as "not a user".
    let dir: { name: string | null }[];
    try {
      dir = await allRows<{ name: string | null }>((a, b) =>
        c.from('user_directory').select('name').eq('validity', true).order('id').range(a, b), 20000);
    } catch (e) { return { ok: false, error: `Could not read the User Master: ${e instanceof Error ? e.message : String(e)}` }; }
    const active = new Set(dir.map((r) => String(r.name ?? '').trim().toLowerCase()).filter(Boolean));
    // An EMPTY directory would drop every row and read as "the file was wrong".
    // Refuse instead: the User Master not being loaded is the fault, not the file.
    if (!active.size) {
      return { ok: false, error: 'The User Master has no active users on this project, so every row would be held back. Load the User Master first.' };
    }
    const dropped = new Set<string>();
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const name = String(rows[i].engineer ?? '').trim();
      if (!active.has(name.toLowerCase())) { dropped.add(name || '(blank)'); rows.splice(i, 1); }
    }
    if (!dropped.size) return { ok: true };
    const shown = [...dropped].sort().slice(0, 6).join(', ');
    return { ok: true, note:
      `${dropped.size} name${dropped.size === 1 ? '' : 's'} held back — not an active user in the User Master`
      + ` (${shown}${dropped.size > 6 ? `, and ${dropped.size - 6} more` : ''}).`
      + ' Hand stock is what an ENGINEER carries, so a dealer or a former user is left out.' };
  }

  // A stock transfer cannot be invented from its lines — its from / to and date
  // are only in the register file — so a line whose transfer is not here is
  // held back rather than loaded against a stub. Two transfers in the export go
  // from an engineer to themselves, which the register refuses; their lines
  // came with them and failed the first batch of 500.
  if (kind === 'stock-transfer-parents') {
    const wanted = [...new Set(rows.map((r) => String(r.transfer_uid ?? '').trim()).filter(Boolean))];
    if (!wanted.length) return { ok: true };
    const here = new Set<string>();
    for (let i = 0; i < wanted.length; i += IN_CHUNK) {
      const { data, error } = await c.from('stock_transfers').select('uid').in('uid', wanted.slice(i, i + IN_CHUNK));
      if (error) return { ok: false, error: `Could not read the stock transfers: ${errMsg(error)}` };
      (data ?? []).forEach((r) => here.add(String(r.uid)));
    }
    let dropped = 0;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (!here.has(String(rows[i].transfer_uid ?? ''))) { rows.splice(i, 1); dropped += 1; }
    }
    return { ok: true, note: dropped
      ? `${dropped} line${dropped === 1 ? '' : 's'} held back — their transfer is not in the register (load Stock Transfer Register first, or it was held back there).`
      : undefined };
  }

  if (kind !== 'spare-line-parents') return { ok: true };

  // RowNo is the part's position within its request. The export does not carry
  // one, and the database's own numbering asks `max(row_no) + 1` from a BEFORE
  // trigger — which cannot see the rows the same insert is writing, so a whole
  // batch would come out as row 1. Number them here, from the order the file
  // itself puts them in, which is also the same on every re-run.
  const seen = new Map<string, number>();
  rows.forEach((r) => {
    if (r.row_no !== undefined && r.row_no !== null && r.row_no !== '') return;
    const key = String(r.request_uid ?? '');
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    r.row_no = n;
  });

  const wanted = [...new Set(rows.map((r) => String(r.request_uid ?? '').trim()).filter(Boolean))];
  if (!wanted.length) return { ok: true };

  const chunks = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / IN_CHUNK) },
    (_, i) => a.slice(i * IN_CHUNK, i * IN_CHUNK + IN_CHUNK));

  // 1. Already here under the name the line uses.
  const here = new Set<string>();
  for (const part of chunks(wanted)) {
    const { data, error } = await c.from('spare_requests').select('uid').in('uid', part);
    if (error) return { ok: false, error: `Could not read the spare requests: ${errMsg(error)}` };
    (data ?? []).forEach((r) => here.add(String(r.uid)));
  }
  const missing = wanted.filter((u) => !here.has(u));
  if (!missing.length) return { ok: true };

  // 2. Here under a different uid — the OR number is what the line names.
  const byOrNo = new Map<string, string>();
  for (const part of chunks(missing)) {
    const { data, error } = await c.from('spare_requests').select('uid,or_no').in('or_no', part);
    if (error) return { ok: false, error: `Could not read the spare requests: ${errMsg(error)}` };
    (data ?? []).forEach((r) => { if (r.or_no) byOrNo.set(String(r.or_no), String(r.uid)); });
  }
  let repointed = 0;
  if (byOrNo.size) {
    rows.forEach((r) => {
      const held = byOrNo.get(String(r.request_uid ?? ''));
      if (held) { r.request_uid = held; repointed += 1; }
    });
  }

  // 3. What is in neither file gets a request, MARKED as one — the gap stays
  //    visible in the register instead of costing the whole load.
  const orphans = missing.filter((u) => !byOrNo.has(u));
  if (orphans.length) {
    const stubs = orphans.map((uid) => ({
      uid, or_no: uid, req_type: 'Call Based', status: 'Imported',
      remarks: 'Created from an imported spare line — the request header was not in the export.',
    }));
    for (const part of chunks(stubs)) {
      const { error } = await c.from('spare_requests').upsert(part, { onConflict: 'uid', ignoreDuplicates: true });
      if (error) {
        return { ok: false,
          error: `${errMsg(error)} — ${orphans.length} of these lines name a request that is not in the header export,`
            + ' and creating it was refused. Load the Spare Request file first, or ask an administrator to run this one.' };
      }
    }
  }
  const bits = [
    orphans.length ? `${orphans.length} request${orphans.length === 1 ? '' : 's'} created for lines whose request was not in the header export` : '',
    repointed ? `${repointed} line${repointed === 1 ? '' : 's'} pointed at the request already holding that OR number` : '',
  ].filter(Boolean);
  return { ok: true, note: bits.join('; ') };
}

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
  // ONE SHAPE PER REQUEST. PostgREST writes a batch as a single insert whose
  // column list is the union of the objects' keys, and a row missing one of
  // them is sent as NULL rather than taking the column's DEFAULT — which is
  // what refused the DCCR file with "null value in column complaint_grouping"
  // for a column that is `not null default ''`. Rows of the same shape go up
  // together, so a column no row in the group carries genuinely defaults.
  const slices = byColumnSet(rows).flatMap((group) => {
    const out: Record<string, unknown>[][] = [];
    for (let i = 0; i < group.length; i += SIZE) out.push(group.slice(i, i + SIZE));
    return out;
  });
  for (const slice of slices) {
    const i = written;
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
// EVERY VISIT THESE CALLS ALREADY HAVE, so the mapping can decide per row
// whether to skip, attach or file one. Paged in chunks, like callKeysFor.
export interface VisitRow { uid: string; ucn: string; call_status: string; manual_report: string; updated_at: string }
export async function visitsForCalls(ucns: string[]): Promise<VisitRow[]> {
  const c = getSupabase(); if (!c) return [];
  const want = [...new Set(ucns.map((x) => String(x ?? '').trim()).filter(Boolean))];
  const out: VisitRow[] = [];
  for (let i = 0; i < want.length; i += 200) {
    const { data, error } = await c.from('reports')
      .select('uid,ucn,call_status,manual_report,updated_at').in('ucn', want.slice(i, i + 200));
    if (error) throw new Error(errMsg(error));
    (data ?? []).forEach((r) => out.push({
      uid: String(r.uid ?? ''), ucn: String(r.ucn ?? ''),
      call_status: String(r.call_status ?? ''), manual_report: String(r.manual_report ?? ''),
      updated_at: String(r.updated_at ?? ''),
    }));
  }
  return out;
}

// ATTACH: THREE COLUMNS, NOT A ROW.
//
// The visit being written to is an ENGINEER'S record -- their job done, their
// readings, their answers. An upsert would carry the whole payload over it and
// blank every column the recovery file does not have. So this sets only the
// document, where it came from, and the status the user's rule names.
//
// `updated_at` is deliberately NOT touched: it is when the visit was ENTERED,
// and attaching a document years later does not make it a newer entry. Moving
// it would change which visit decides the call's status (0032).
export async function attachReportsToVisits(
  rows: { uid: string; manual_report: string; source_ref: string }[],
  status: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: boolean; written: number; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, written: 0, error: 'Database not connected.' };
  let written = 0;
  for (const r of rows) {
    const { error } = await c.from('reports')
      .update({ manual_report: r.manual_report, source_ref: r.source_ref, call_status: status,
                mapped_at: new Date().toISOString() })
      .eq('uid', r.uid);
    if (error) return { ok: false, written, error: errMsg(error) };
    written += 1;
    onProgress?.(written, rows.length);
  }
  return { ok: true, written };
}

// ---------------------------------------------------------------------------
// THE REPORTS ALREADY IN THE REGISTER, AND THEIR REFERENCES.
//
// Bulk Uploads' visit registers store the attachment cell exactly as the file
// wrote it, so 7,538 visits carry an AppSheet path or an AppSheet URL where a
// Drive link should be (counted 2026-09-22). This reads them so the screen can
// say how many there are, of which shape, BEFORE anything is looked up --
// including how many AppSheet URLs actually carry a `fileName`, which is the
// one thing nothing in this repository could answer by reading.
//
// PAGED, because it is register-sized: 12,254 visits, and PostgREST caps a
// response at 1,000 whatever the limit says. Ordered by the primary key, so no
// row lands on two pages or neither.
//
// It selects the SIX columns the conversion needs and no others. A screen that
// pulls every visit's `data` to look at one text column is a register-sized
// download for nothing.
// ---------------------------------------------------------------------------
export async function loadedReportRefs(): Promise<LoadedReport[]> {
  const c = must();
  const rows = await allRows<Record<string, unknown>>((from, to) => c
    .from('reports')
    .select('id,uid,ucn,manual_report,source_ref,visit_at')
    .neq('manual_report', '')
    .not('manual_report', 'is', null)
    .order('id', { ascending: true })
    .range(from, to));
  return rows.map((r) => ({
    id: Number(r.id),
    uid: String(r.uid ?? ''),
    ucn: String(r.ucn ?? ''),
    manual_report: String(r.manual_report ?? ''),
    source_ref: String(r.source_ref ?? ''),
    visit_at: String(r.visit_at ?? ''),
  }));
}

// CONVERT: TWO COLUMNS, KEYED ON THE PRIMARY KEY.
//
// The same argument as `attachReportsToVisits` and one column fewer. That
// function is ATTACHING a recovered report to a visit that had none, so it also
// writes the status the user's rule names. This one is only changing the FORM
// of a reference that is already on the row -- the visit, its status, its
// engineer and its entry time say exactly what they said before, and
// `updated_at` is untouched so the call's status still comes from the same
// visit (0032).
//
// `mapped_at` IS stamped: it is what marks a row whose link this application
// resolved rather than a person recording it, and it is how a second run can be
// told from the first.
export async function convertReportLinks(
  rows: ConvertWrite[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: boolean; written: number; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, written: 0, error: 'Database not connected.' };
  let written = 0;
  for (const r of rows) {
    const { error } = await c.from('reports')
      .update({ manual_report: r.manual_report, source_ref: r.source_ref, mapped_at: new Date().toISOString() })
      .eq('id', r.id);
    if (error) return { ok: false, written, error: errMsg(error) };
    written += 1;
    onProgress?.(written, rows.length);
  }
  return { ok: true, written };
}

// The tables a person may export, with ESTIMATED row counts for the picker.
// Names and counts only -- `exportable_tables()` (0227) returns no data, and
// returns nothing at all to a caller who is not an administrator.
export interface ExportableTable { table_name: string; approx_rows: number }
export async function exportableTables(): Promise<ExportableTable[]> {
  const c = must();
  const { data, error } = await c.rpc('exportable_tables');
  if (error) throw new Error(errMsg(error));
  return (data ?? []).map((r: { table_name?: unknown; approx_rows?: unknown }) => ({
    table_name: String(r.table_name ?? ''),
    approx_rows: Number(r.approx_rows ?? 0),
  })).filter((t: ExportableTable) => t.table_name);
}

// ---------------------------------------------------------------------------
// THE SCHEDULES — what to export and when. NEVER WHERE.
//
// There is no recipient here and no way to add one: the addresses live in a
// secret on the Edge Function, set with the Supabase CLI by somebody holding
// the project keys. The first design of this held the destination in a
// settings row and was refused as an exfiltration primitive -- correctly, since
// it made the nightly copy of the whole customer base redirectable by any
// administrator with nothing on any screen looking different afterwards. See
// the header of 0228.
//
// READS COME FROM THE VIEW, WRITES GO TO THE TABLE. `export_schedule_state`
// adds `next_run_at`, computed from the same function the job asks, so the
// screen cannot drift into its own opinion of when something will happen.
// ---------------------------------------------------------------------------
export interface ExportSchedule {
  id: number;
  label: string;
  tables: string[];
  frequency: 'daily' | 'weekly';
  day_of_week: number | null;
  hour_ist: number;
  minute_ist: number;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_detail: string | null;
  next_run_at: string | null;
}

export async function exportSchedules(): Promise<ExportSchedule[]> {
  const c = must();
  const { data, error } = await c.from('export_schedule_state')
    .select('id,label,tables,frequency,day_of_week,hour_ist,minute_ist,enabled,'
          + 'last_run_at,last_status,last_detail,next_run_at')
    .order('id', { ascending: true });
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as unknown as ExportSchedule[];
}

/** Insert or update one schedule. `created_by` is not sent: it is stamped by
 *  the trigger and a caller-supplied value is discarded (the 0113/0114 rule). */
export async function saveExportSchedule(
  s: Omit<ExportSchedule, 'id' | 'last_run_at' | 'last_status' | 'last_detail' | 'next_run_at'>
     & { id?: number },
): Promise<void> {
  const c = must();
  const row = {
    label: s.label, tables: s.tables, frequency: s.frequency,
    // A daily schedule carries NO weekday. Sending one would fail the check
    // constraint, which is the constraint doing its job -- "weekly on no day"
    // and "daily on a Tuesday" are both incoherent.
    day_of_week: s.frequency === 'weekly' ? s.day_of_week : null,
    hour_ist: s.hour_ist, minute_ist: s.minute_ist, enabled: s.enabled,
  };
  const { error } = s.id
    ? await c.from('export_schedules').update(row).eq('id', s.id)
    : await c.from('export_schedules').insert(row);
  if (error) throw new Error(errMsg(error));
}

export async function deleteExportSchedule(id: number): Promise<void> {
  const c = must();
  const { error } = await c.from('export_schedules').delete().eq('id', id);
  if (error) throw new Error(errMsg(error));
}

// The record of what actually left the building. READ ONLY -- the grants in
// 0228 give an administrator select and nothing else, so there is deliberately
// no writer here to match.
export interface ExportRun {
  id: number;
  label: string | null;
  started_at: string;
  finished_at: string | null;
  tables: string[] | null;
  row_count: number | null;
  bytes: number | null;
  recipients: number | null;
  status: string | null;
  detail: string | null;
}

export async function exportRuns(limit = 25): Promise<ExportRun[]> {
  const c = must();
  const { data, error } = await c.from('export_runs')
    .select('id,label,started_at,finished_at,tables,row_count,bytes,recipients,status,detail')
    .order('started_at', { ascending: false }).order('id', { ascending: false })
    .limit(limit);
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as unknown as ExportRun[];
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
// The call's own words decide, not its product alone: an accessory's manual
// reaches the call that names the accessory, whatever machine it is fitted to.
// The rule is `lib/docmatch.ts`, so it can be tested without a database.
export async function serviceManualsForProduct(
  product: string, complaint = '', reported = '',
): Promise<DocRow[]> {
  const c = getSupabase(); if (!c) return [];
  const { data, error } = await c.from('documents')
    .select('*').eq('kind', 'service_manual').eq('active', true).order('title');
  if (error) return [];
  const rows = (data ?? []) as DocRow[];
  if (!(product ?? '').trim() && !complaint && !reported) return rows;
  return rows.filter((r) => manualMatchesCall(r, { product, complaint, reported }));
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
// WHOSE DESK A CALL IS REGISTERED TO (0114).
//
// The Hotline engineer is the only person trained on the three vigilance
// questions, so a call belongs to her desk whoever typed it in — and the
// database defaults `created_by` to it. These read and set that default.
// `profiles` only lets most people read themselves, so the list of desks comes
// through a SECURITY DEFINER function rather than a query.
// ---------------------------------------------------------------------------
export interface RegistrantDesk { id: string; name: string; email: string; is_default: boolean }
export async function listRegistrantDesks(): Promise<RegistrantDesk[]> {
  const { data, error } = await must().rpc('registrant_desks');
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as RegistrantDesk[];
}
// '' means nobody has pinned one, and the database falls back to the single
// hotline-role profile — which is the state the project is in today.
export async function getDefaultRegistrantEmail(): Promise<string> {
  const { data, error } = await must().from('app_settings').select('value').eq('key', 'calls.default_registrant_email').maybeSingle();
  if (error) throw new Error(errMsg(error));
  return String((data as { value?: string } | null)?.value ?? '').trim();
}
export async function setDefaultRegistrantEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('app_settings')
    .upsert({ key: 'calls.default_registrant_email', value: email.trim(), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---------------------------------------------------------------------------
// AUDIT MODE (0114) — an administrator's switch.
//
// NOTHING READS THE MODE YET. The user asked for the switch and said the rules
// would follow, so the app can turn it on and off and show its history, and
// no behaviour hangs off it. When the rules arrive they attach here.
//
// Every change is written by the database, with a reason, into a table nothing
// purges — so `setAuditMode` REQUIRES the reason and the server refuses without
// one. Reading the switch is open to any signed-in user; reading its history is
// not.
// ---------------------------------------------------------------------------
export interface AuditModeChange { id: number; at: string; turned_on: boolean; reason: string; changed_by: string | null }
export async function getAuditMode(): Promise<boolean> {
  const { data, error } = await must().rpc('audit_mode');
  if (error) throw new Error(errMsg(error));
  return data === true;
}
export async function setAuditMode(on: boolean, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().rpc('set_audit_mode', { p_on: on, p_reason: reason });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}
export async function listAuditModeChanges(limit = 20): Promise<AuditModeChange[]> {
  const { data, error } = await must().from('audit_mode_changes')
    .select('id,at,turned_on,reason,changed_by').order('at', { ascending: false }).limit(limit);
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as AuditModeChange[];
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
// Signing out clears the bell — in the DATABASE, not just on screen, so the
// next session starts empty on every device. Unread ones go too: sign-out is
// the clearing event. The work behind them is not lost; the call is still in
// the register and the spare still on its request.
//
// The rule lives in `clear_my_notifications()` (0123), which takes no arguments
// and filters on auth.uid() — `authenticated` holds no `delete` on the table at
// all, so there is no shape of this that reaches somebody else's rows.
export async function clearMyNotifications(): Promise<number> {
  const c = getSupabase(); if (!c) return 0;
  const { data, error } = await c.rpc('clear_my_notifications');
  if (error) throw new Error(errMsg(error));
  return Number(data ?? 0);
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

// ===========================================================================
// INDOOR SERVICE — the workshop register (0158, procedure §4.5).
//
// TWO AXES, and keeping them apart is the point: `kind` says whose property the
// unit is, which turns the custody duties of §7.5.10 on or off; `activity` says
// what is being done to it. A DEMO unit in for repair is still a DEMO unit.
// ===========================================================================
export const INDOOR_KINDS = ['Customer property', 'DEMO unit'] as const;
export const INDOOR_ACTIVITIES = [
  'Repair', 'Rework', 'Salvage', 'Pre-delivery inspection', 'Demo', 'Other',
] as const;
export const INDOOR_STATUSES = [
  'Received', 'Cleaned', 'Under repair', 'Awaiting spares', 'QC',
  'Ready', 'Dispatched', 'Closed', 'Condemned',
] as const;

export interface IndoorJob {
  id: number;
  job_no: string;
  ucn: string | null;
  kind: string;
  activity: string;
  product_name: string;
  serial: string;
  party_name: string | null;
  received_at: string;
  received_by: string | null;
  condition_on_arrival: string;
  tag_no: string;
  status: string;
  cleaned_at: string | null;
  cleaned_by: string | null;
  cleaning_wi: string;
  cleaning_wi_rev: string;
  work_done: string;
  findings: string;
  qc_result: string | null;
  qc_by: string | null;
  qc_at: string | null;
  qc_notes: string;
  dispatched_at: string | null;
  dispatch_ref: string;
  damage_note: string;
  reported_to_customer_at: string | null;
  // Rework (§8.3.4)
  nc_reference: string;
  rework_instruction: string;
  rework_instruction_rev: string;
  rework_authorised_by: string;
  rework_authorised_at: string | null;
  adverse_effect_assessed: boolean | null;
  adverse_effect_note: string;
  reverified_by: string;
  reverified_at: string | null;
  reverification_result: string | null;
  disposition: string | null;
  // Salvage (SR-017)
  condemned_reason: string;
  condemned_at: string | null;
  decontaminated: boolean;
  disposal_method: string;
  disposal_ref: string;
  customer_informed: boolean;
  // Pre-delivery inspection (SR-003 / SR-006 / SR-020)
  source_ref: string;
  checklist_ref: string;
  checklist_rev: string;
  firmware_version: string;
  accessories_per_packing_list: boolean | null;
  pdi_result: string | null;
  released_at: string | null;
  held_reason: string;
  // Demo
  demo_for_party: string;
  requested_by: string;
  expected_out: string | null;
  expected_return: string | null;
  actual_out: string | null;
  actual_return: string | null;
  custody_holder: string;
  condition_out: string;
  condition_back: string;
  consumables_used: string;
  demo_outcome: string | null;
  sale_ref: string;
  activity_note: string;
  updated_at: string;
  // From the view
  received_by_name: string;
  cleaned_by_name: string;
  qc_by_name: string;
  dispatched_by_name: string;
  condemned_by_name: string;
  updated_by_name: string;
  is_closed: boolean;
  /** NULL where there is no due date — "not overdue" and "nobody said when"
   *  are different facts and must not render the same. */
  demo_overdue: boolean | null;
  accessory_count: number;
  accessories_outstanding: number;
}

export interface IndoorAccessory {
  id: number; job_id: number; name: string; serial: string;
  tag_no: string; returned: boolean; note: string;
}
export interface IndoorPart {
  id: number; job_id: number; part_code: string; description: string;
  qty: number; condition_grade: string; destination: string; note: string;
}
export interface IndoorCheck {
  id: number; job_id: number; seq: number; parameter: string;
  expected: string; measured: string; verdict: string;
  instrument: string; instrument_serial: string; calibration_due: string | null;
}

export async function listIndoorJobs(limit = 500): Promise<IndoorJob[]> {
  const { data, error } = await must()
    .from('indoor_job_list')
    .select('*')
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as IndoorJob[];
}

/** A new intake. `job_no` is NOT sent: the database issues it (0158), because a
 *  number the client may set is a number two people can mint. */
export async function addIndoorJob(
  patch: Partial<IndoorJob>,
): Promise<{ ok: boolean; id?: number; job_no?: string; error?: string }> {
  const { job_no: _ignored, ...rest } = patch as Record<string, unknown>;
  const { data, error } = await must()
    .from('indoor_jobs')
    .insert({ job_no: 'auto', ...rest })
    .select('id, job_no')
    .single();
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true, id: Number(data?.id), job_no: String(data?.job_no ?? '') };
}

export async function saveIndoorJob(
  id: number, patch: Partial<IndoorJob>,
): Promise<{ ok: boolean; error?: string }> {
  // ALLOW-LIST, not a deny-list. The row comes from a VIEW carrying joined
  // names, `is_closed` and `demo_overdue`; naming what may be written means a
  // column added to the view later cannot silently become an update that fails.
  // `job_no`, the stamps and every *_by id are absent deliberately — those are
  // the database's to set and the trigger discards them anyway.
  const WRITABLE = [
    'ucn', 'kind', 'activity', 'product_name', 'serial', 'party_name',
    'condition_on_arrival', 'tag_no', 'status',
    'cleaning_wi', 'cleaning_wi_rev', 'work_done', 'findings',
    'qc_result', 'qc_notes', 'dispatch_ref', 'damage_note',
    'nc_reference', 'rework_instruction', 'rework_instruction_rev',
    'rework_authorised_by', 'rework_authorised_at', 'adverse_effect_assessed',
    'adverse_effect_note', 'reverified_by', 'reverified_at',
    'reverification_result', 'disposition',
    'condemned_reason', 'decontaminated', 'disposal_method', 'disposal_ref',
    'customer_informed',
    'source_ref', 'checklist_ref', 'checklist_rev', 'firmware_version',
    'accessories_per_packing_list', 'pdi_result', 'held_reason',
    'demo_for_party', 'requested_by', 'expected_out', 'expected_return',
    'actual_out', 'actual_return', 'custody_holder', 'condition_out',
    'condition_back', 'consumables_used', 'demo_outcome', 'sale_ref',
    'activity_note',
  ] as const;
  const rest = Object.fromEntries(
    Object.entries(patch).filter(([k]) => (WRITABLE as readonly string[]).includes(k)));
  if (Object.keys(rest).length === 0) return { ok: true };
  const { error } = await must().from('indoor_jobs').update(rest).eq('id', id);
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true };
}

/** Marking the unit cleaned (4.5.3). `cleaned_by` is sent because the trigger
 *  only stamps a time once somebody is named — the WI and its revision are what
 *  make the record mean anything. */
export async function markIndoorCleaned(
  id: number, wi: string, rev: string, uid: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('indoor_jobs')
    .update({ cleaned_by: uid, cleaned_at: new Date().toISOString(),
              cleaning_wi: wi, cleaning_wi_rev: rev, status: 'Cleaned' })
    .eq('id', id);
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true };
}

export async function listIndoorAccessories(jobId: number): Promise<IndoorAccessory[]> {
  const { data, error } = await must()
    .from('indoor_job_accessories').select('*').eq('job_id', jobId).order('id');
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as IndoorAccessory[];
}
export async function addIndoorAccessory(
  jobId: number, patch: Partial<IndoorAccessory>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('indoor_job_accessories')
    .insert({ job_id: jobId, ...patch });
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true };
}
export async function saveIndoorAccessory(
  id: number, patch: Partial<IndoorAccessory>,
): Promise<{ ok: boolean; error?: string }> {
  const { id: _drop, job_id: _drop2, ...rest } = patch as Record<string, unknown>;
  const { error } = await must().from('indoor_job_accessories').update(rest).eq('id', id);
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true };
}
export async function deleteIndoorAccessory(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('indoor_job_accessories').delete().eq('id', id);
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true };
}

export async function listIndoorParts(jobId: number): Promise<IndoorPart[]> {
  const { data, error } = await must()
    .from('indoor_job_parts').select('*').eq('job_id', jobId).order('id');
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as IndoorPart[];
}
/** A harvested part. The database REFUSES this until the unit is decontaminated
 *  — the one hard gate in the module, and the error it raises says so. */
export async function addIndoorPart(
  jobId: number, patch: Partial<IndoorPart>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('indoor_job_parts').insert({ job_id: jobId, ...patch });
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true };
}
export async function deleteIndoorPart(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('indoor_job_parts').delete().eq('id', id);
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true };
}

export async function listIndoorChecks(jobId: number): Promise<IndoorCheck[]> {
  const { data, error } = await must()
    .from('indoor_job_checks').select('*').eq('job_id', jobId).order('seq').order('id');
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as IndoorCheck[];
}
export async function addIndoorCheck(
  jobId: number, patch: Partial<IndoorCheck>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('indoor_job_checks').insert({ job_id: jobId, ...patch });
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true };
}
export async function saveIndoorCheck(
  id: number, patch: Partial<IndoorCheck>,
): Promise<{ ok: boolean; error?: string }> {
  const { id: _drop, job_id: _drop2, ...rest } = patch as Record<string, unknown>;
  const { error } = await must().from('indoor_job_checks').update(rest).eq('id', id);
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true };
}
export async function deleteIndoorCheck(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await must().from('indoor_job_checks').delete().eq('id', id);
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true };
}

// ---- Call Review (/call-review) --------------------------------------------
// SOLVED CALLS ONLY, filtered BY THE DATABASE. The register is 24,000 calls and
// climbing; pulling all of them to keep the ~30% that are solved is what makes
// a screen stop responding, and it caps out silently besides. `cancelled_at is
// null` and `reopened_at is null` are the same two exclusions the list itself
// makes, applied where the rows are.
//
// Returns the rows AND whether the cap was reached, because a count over
// partly-loaded data is a LOWER BOUND and the screen has to say so.
export async function listSolvedCalls(limit = 20000): Promise<{ rows: Record<string, unknown>[]; more: boolean }> {
  const PAGE = 1000;
  const out: Record<string, unknown>[] = [];
  let more = false;
  for (let from = 0; from < limit; from += PAGE) {
    const { data, error } = await must().from('calls').select('*')
      .ilike('open_state', 'solved%')
      .is('cancelled_at', null)
      .is('reopened_at', null)
      .order('id', { ascending: false })
      .range(from, Math.min(from + PAGE, limit) - 1);
    if (error) throw new Error(errMsg(error));
    const rows = data ?? [];
    out.push(...rows.map(dbToCall));
    if (rows.length < PAGE) break;
    if (from + PAGE >= limit) more = true;
  }
  return { rows: out, more };
}


// Has this solved call's report been reviewed. One row per UCN (0163).
export async function listCallReportReviews(): Promise<Record<string, { status: string; remarks: string; by: string; at: string }>> {
  const c = getSupabase(); if (!c) return {};
  const out: Record<string, { status: string; remarks: string; by: string; at: string }> = {};
  const PAGE = 1000;
  // Paged like every other register: a single response is capped at ~1000 rows,
  // and a reviewer whose call sat at position 1001 would see it as un-reviewed
  // and review it twice.
  for (let from = 0; from < 60000; from += PAGE) {
    const { data, error } = await c.from('call_report_reviews')
      // Ordered by ucn, the table's key (finding 8): paging without an order can
      // still drop the row at position 1001.
      .select('ucn,status,remarks,reviewed_by_name,reviewed_at').order('ucn', { ascending: true }).range(from, from + PAGE - 1);
    if (error) break;
    const rows = data ?? [];
    rows.forEach((r) => {
      out[String(r.ucn)] = {
        status: String(r.status ?? ''), remarks: String(r.remarks ?? ''),
        by: String(r.reviewed_by_name ?? ''), at: String(r.reviewed_at ?? ''),
      };
    });
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function markCallReportReviewed(
  ucn: string, status: string, remarks: string, byName: string,
): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  // reviewed_by and reviewed_at are stamped by the database (0163) — a review
  // naming somebody who did not do it is worse than one naming nobody.
  const { error } = await c.from('call_report_reviews')
    .upsert({ ucn: ucn.trim(), status, remarks: remarks.trim(), reviewed_by_name: byName.trim() }, { onConflict: 'ucn' });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// What was consumed on a call. Matched on the UCN **or** the call number: the
// two are written together, but a call registered before the call number was
// issued carries only the UCN, and a review screen that silently missed those
// lines would report the opposite of the truth about what went into a machine.
export async function consumptionForCall(ucn: string, callNumber: string): Promise<Record<string, unknown>[]> {
  const c = getSupabase(); if (!c) return [];
  const keys = [ucn, callNumber].map((v) => (v ?? '').trim()).filter(Boolean);
  if (!keys.length) return [];
  const or = keys.map((k) => `ucn.eq.${k},call_number.eq.${k}`).join(',');
  const { data, error } = await c.from('spare_consumption').select('*').or(or)
    .order('created_at', { ascending: false }).limit(200);
  if (error) return [];
  const seen = new Set<unknown>();
  return (data ?? []).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

// Every role the DATABASE knows, with its label — the built-in list in
// rbac.ts is the starting set, not the whole set, once roles can be added from
// the app. Labels come from the same row as the permissions, so a renamed role
// reads the same everywhere without a code change.
export async function listRoleRows(): Promise<{ role: string; label: string; permissions: string[] }[]> {
  const c = getSupabase(); if (!c) return [];
  const { data, error } = await c.from('app_roles').select('role,label,permissions').order('role');
  if (error) return [];
  return (data ?? []).map((r) => ({
    role: String(r.role), label: String(r.label ?? '') || String(r.role),
    permissions: Array.isArray(r.permissions) ? (r.permissions as string[]) : [],
  }));
}

// Add a role. CLONED, never empty — see createRole() in lib/rbac.ts for why
// that is not a convenience.
export async function createRole(role: string, label: string, permissions: string[]): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  const { error } = await c.from('app_roles').insert({ role, label, permissions });
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---- Field Failure Register (/failure-report) -------------------------------
// The format is the Field_Failure_Register workbook's 2026 tab (0165). The
// AutoCrat plumbing columns are not carried: the document is generated here.
export interface FfrRow { [k: string]: unknown }

/** ONE report, by its number — what the printable page opens. A separate read
 *  rather than a filter over listFfrs(): the print route is reached by URL, so
 *  it must stand on its own without the register having been loaded first.
 *  The view is security_invoker, so a report the reader may not see is simply
 *  not found, with no separate permission check needed. */
/** THE PRODUCT THE COUNTS USE. Review 2 may decide the thing that failed is an
 *  accessory logged against the machine it is fitted to (0197), and every rate,
 *  Pareto and tally reads that answer rather than the call's.
 *
 *  THE FALLBACK IS WHAT LETS THIS SHIP BEFORE THE MIGRATION LANDS. On a project
 *  that has not run 0197 the view has no such column, so `live_product_name`
 *  arrives undefined — and a dimension keyed on it would go EMPTY across the
 *  whole register rather than degrading to the old behaviour. Filled here, once,
 *  where the rows are read, so nothing downstream has to remember. */
const withEffectiveProduct = (r: Record<string, unknown>): Record<string, unknown> => ({
  ...r,
  live_product_name: String(r.live_product_name ?? '').trim() || r.product_name,
});

export async function getFfr(ffrNo: string): Promise<Record<string, unknown> | null> {
  const c = getSupabase(); if (!c) return null;
  const { data, error } = await c.from('field_failure_register').select('*')
    .eq('ffr_no', ffrNo).maybeSingle();
  if (error) throw new Error(errMsg(error));
  return data ? withEffectiveProduct(data as Record<string, unknown>) : null;
}

/** THE CHANGE LOG FOR ONE REPORT (0174) — "I need to be able to capture
 *  everytime it is updated - For log keeping".
 *
 *  Newest first, because the question a weekly review asks is what changed
 *  since last week. Written by a database trigger, so this reads a record the
 *  application cannot have failed to write. */
export interface FfrHistoryRow {
  id: number;
  changed_at: string;
  changed_by_name: string;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }>;
}

export async function listFfrHistory(ffrNo: string): Promise<FfrHistoryRow[]> {
  const c = getSupabase(); if (!c) return [];
  const { data, error } = await c.from('ffr_history')
    .select('id, changed_at, changed_by_name, action, changes')
    .eq('ffr_no', ffrNo)
    .order('changed_at', { ascending: false }).order('id', { ascending: false })
    .limit(200);
  // A missing table is "no history yet", not a broken drawer: the migration is
  // the user's step and the report itself must still open.
  if (error) return [];
  return (data ?? []) as FfrHistoryRow[];
}

/**
 * THE VISITS AND SPARES BEHIND A REPORT (0178).
 *
 * Reported from use: an administrator saw the register's right-hand pane
 * populated and somebody granted `ffr.view` saw "0 visits" on the same report.
 * `reports` and `spare_consumption` are scoped to CALL visibility, which
 * reading the register does not confer.
 *
 * Returns null when the caller does not qualify, or when the UCN has no report
 * — and the desk then reads the tables directly, so nobody loses the visits
 * their own policies already allow them.
 */
export async function ffrCallContext(ucn: string): Promise<
  { visits: Record<string, unknown>[]; spares: Record<string, unknown>[] } | null> {
  const c = getSupabase(); if (!c) return null;
  const { data, error } = await c.rpc('ffr_call_context', { p_ucn: ucn });
  // A database that has not had 0178 yet is "fall back", not "broken".
  if (error || !data) return null;
  const d = data as { visits?: unknown; spares?: unknown };
  return {
    visits: Array.isArray(d.visits) ? d.visits as Record<string, unknown>[] : [],
    spares: Array.isArray(d.spares) ? d.spares as Record<string, unknown>[] : [],
  };
}

export async function listFfrs(limit = 5000): Promise<Record<string, unknown>[]> {
  const c = getSupabase(); if (!c) return [];
  const PAGE = 1000;
  const out: Record<string, unknown>[] = [];
  // Paged like every register: one response is capped at ~1000 rows, and an FFR
  // at position 1001 would read as missing rather than as unreached.
  for (let from = 0; from < limit; from += PAGE) {
    // THE VIEW, not the table: it carries the record AND the call as it stands
    // now, which is what the register is read for. It is security_invoker, so a
    // reader still sees only the reports and calls their role allows.
    const { data, error } = await c.from('field_failure_register').select('*')
      .order('ffr_date', { ascending: false }).order('id', { ascending: false })
      .range(from, Math.min(from + PAGE, limit) - 1);
    if (error) throw new Error(errMsg(error));
    const rows = data ?? [];
    out.push(...rows.map(withEffectiveProduct));
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Is there already an FFR against this call? A machine can fail twice, so this
 *  informs rather than blocks — raising a second one is a decision, not a slip. */
export async function ffrsForCall(ucn: string): Promise<Record<string, unknown>[]> {
  const c = getSupabase(); if (!c || !ucn.trim()) return [];
  const { data, error } = await c.from('field_failure_reports')
    .select('ffr_no,ffr_date,ffr_status').eq('ucn', ucn.trim()).order('id');
  if (error) return [];
  return data ?? [];
}

/** Raise one. The NUMBER and the raiser are the database's to issue (0165), so
 *  neither is sent: a caller-supplied FFR number could collide with one already
 *  on the sheet, and a caller-supplied raiser could name anybody. */
// THE REGISTER READS A VIEW AND THESE WRITE A TABLE. Both reduce the row to the
// table's own columns (ffrWritable) rather than dropping two keys and hoping:
// the previous version sent every live_* column the view had added, and
// PostgREST refused the whole write with "Could not find the
// 'live_any_potential_effect' column … in the schema cache" — so an edit made
// on the register was simply lost. Reported from use, 2026-09-12.
export async function addFfr(row: Record<string, unknown>): Promise<{ ok: boolean; ffrNo?: string; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  const { data, error } = await c.from('field_failure_reports')
    .insert(ffrWritable(row)).select('ffr_no').single();
  if (error) return { ok: false, error: errMsg(error) };
  return { ok: true, ffrNo: String(data?.ffr_no ?? '') };
}

export async function updateFfr(id: number, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const c = getSupabase(); if (!c) return { ok: false, error: 'Not connected.' };
  const { error } = await c.from('field_failure_reports')
    .update(ffrWritable(patch)).eq('id', id);
  return error ? { ok: false, error: errMsg(error) } : { ok: true };
}

// ---------------------------------------------------------------------------
// THE CALL REPORT AND THE CUSTOMER FEEDBACK REPORT (0191) — the same shape as
// the consumption report above, and for the same reasons.
//
// THE FILTER RUNS IN THE DATABASE. It would be easier to fetch and then narrow,
// and it would be wrong: both registers page, so a browser-side filter reports
// on the first thousand rows and calls it the answer. The count is EXACT and
// comes from the database, so the button says what it is ABOUT to export.
// ---------------------------------------------------------------------------

export interface CallReportQuery {
  from?: string; to?: string; product?: string; party?: string; city?: string;
  engineer?: string; callType?: string; status?: string; ucn?: string;
}

function callReportQuery(f: CallReportQuery, opts?: { count: 'exact'; head: true }) {
  let q = opts
    ? must().from('call_report').select('*', opts)
    : must().from('call_report').select('*');
  if (f.from) q = q.gte('Call Date', f.from);
  if (f.to) q = q.lte('Call Date', f.to);
  if (f.product) q = q.ilike('Product', `%${f.product}%`);
  if (f.party) q = q.ilike('Customer', `%${f.party}%`);
  if (f.city) q = q.ilike('City', `%${f.city}%`);
  if (f.engineer) q = q.ilike('Allocated To', `%${f.engineer}%`);
  if (f.callType) q = q.ilike('Call Type', `%${f.callType}%`);
  // EXACT on the status: "Solved" and "Solved - Report Pending" are different
  // answers, and a contains-match would fold the second into the first — which
  // is the distinction `open_state` exists to keep (0032).
  if (f.status) q = q.eq('Call Status', f.status);
  if (f.ucn) q = q.ilike('UC Number', `%${f.ucn}%`);
  return q;
}

export async function countCallReport(f: CallReportQuery): Promise<number> {
  const { count, error } = await callReportQuery(f, { count: 'exact', head: true });
  if (error) throw new Error(errMsg(error));
  return count ?? 0;
}

export async function listCallReport(
  f: CallReportQuery, onProgress?: (n: number) => void,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const { data, error } = await callReportQuery(f)
      .order('Call Date', { ascending: false })
      .order('UC Number', { ascending: false })
      .range(offset, offset + page - 1);
    if (error) throw new Error(errMsg(error));
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    onProgress?.(out.length);
    if (rows.length < page) return out;
  }
}

export interface FeedbackReportQuery {
  from?: string; to?: string; product?: string; party?: string; state?: string;
  engineer?: string; callType?: string; source?: string; ucn?: string;
}

function feedbackReportQuery(f: FeedbackReportQuery, opts?: { count: 'exact'; head: true }) {
  let q = opts
    ? must().from('feedback_report').select('*', opts)
    : must().from('feedback_report').select('*');
  // THE FEEDBACK'S OWN DATE (0190), never "Loaded On". On a migrated row the
  // two differ by up to two years, and somebody filtering for 2025 wants the
  // year the customer spoke — which is the whole point of that column existing.
  if (f.from) q = q.gte('Date', f.from);
  if (f.to) q = q.lte('Date', `${f.to} 23:59:59.999`);
  if (f.product) q = q.ilike('Product', `%${f.product}%`);
  if (f.party) q = q.ilike('Customer', `%${f.party}%`);
  if (f.state) q = q.ilike('State', `%${f.state}%`);
  if (f.engineer) q = q.ilike('Visiting Service Engineer', `%${f.engineer}%`);
  if (f.callType) q = q.ilike('Call Type', `%${f.callType}%`);
  if (f.source) q = q.eq('Source', f.source);
  if (f.ucn) q = q.ilike('UC Number', `%${f.ucn}%`);
  return q;
}

export async function countFeedbackReport(f: FeedbackReportQuery): Promise<number> {
  const { count, error } = await feedbackReportQuery(f, { count: 'exact', head: true });
  if (error) throw new Error(errMsg(error));
  return count ?? 0;
}

export async function listFeedbackReport(
  f: FeedbackReportQuery, onProgress?: (n: number) => void,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const { data, error } = await feedbackReportQuery(f)
      .order('Date', { ascending: false })
      .order('UC Number', { ascending: false })
      .range(offset, offset + page - 1);
    if (error) throw new Error(errMsg(error));
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    onProgress?.(out.length);
    if (rows.length < page) return out;
  }
}

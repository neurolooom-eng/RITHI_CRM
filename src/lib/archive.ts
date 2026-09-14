// ---------------------------------------------------------------------------
// THE ARCHIVE — the 2016 service history, in a Supabase project of its own.
//
// Ten years of closed calls do not belong in the live database. They are never
// registered against, never edited, never reported on by the registers, and
// they would double the size of every table the app pages through. So they sit
// in a SECOND project (sxcccaghpvznllvdebcb) that this app only ever reads.
//
// THIS FILE IS THE ONLY PLACE THAT KNOWS HOW THE ARCHIVE IS REACHED. Every
// screen asks it for a machine's history and gets rows back; none of them
// knows there is a second client, a second key or a second network hop. That
// is deliberate and it is the file's main job: the browser talking straight to
// the archive is the SIMPLEST transport, not the best one, and the better ones
// (postgres_fdw foreign tables on the live project, or an Edge Function that
// verifies the caller's JWT and queries the archive with a service key) are a
// change to this file alone. ProdHistory_02.sql argues that trade-off in full.
//
// WHAT THE KEY IS WORTH, because it differs from the live one and the
// difference matters. The live anon key is baked into supabase.ts and public by
// design: it identifies the project and grants nothing, because every policy
// tests the signed-in user. The archive cannot do that — your users exist in
// the LIVE project's auth, and a JWT signed by one project cannot be verified
// by another, so `auth.uid()` there is null for everybody. The archive key is
// therefore a READ CREDENTIAL, and there is deliberately NO baked-in default:
// it is pasted into Settings and stored per device.
//
// The archive is read-only from here in the strongest sense available — it
// holds no write policy and the API roles have no write privilege (see
// ProdHistory_02.sql). This module exposes no way to write to it, and none
// should be added: the 2016 records cannot be reconstructed.
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { machineKey } from './machine';
import { byColumnSet } from './uploads';
import { getSupabase } from './supabase';

const URL_KEY = 'rithi.archive.url';
const KEY_KEY = 'rithi.archive.key';

// The project the history lives in. The URL is not a secret — it is in the SQL
// files and in the docs — so it is defaulted, and the key is not.
const DEFAULT_ARCHIVE_URL = 'https://sxcccaghpvznllvdebcb.supabase.co';

const normUrl = (u: string): string =>
  (u || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');

export function getArchiveCreds(): { url: string; key: string } {
  try {
    return {
      url: normUrl(localStorage.getItem(URL_KEY) || DEFAULT_ARCHIVE_URL),
      key: (localStorage.getItem(KEY_KEY) || '').trim(),
    };
  } catch {
    return { url: DEFAULT_ARCHIVE_URL, key: '' };
  }
}

export function setArchiveCreds(url: string, key: string): void {
  try {
    localStorage.setItem(URL_KEY, url.trim());
    localStorage.setItem(KEY_KEY, key.trim());
  } catch { /* a browser with storage off still works for this session */ }
  _client = null;      // force a rebuild with the new pair
  _forward = true;     // and let the new project be asked the token question afresh
}

export function archiveConfigured(): boolean {
  const { url, key } = getArchiveCreds();
  return /^https:\/\/.+\.supabase\.co/.test(url) && key.length > 20;
}

// ---------------------------------------------------------------------------
// FORWARDING THE SIGNED-IN USER'S TOKEN, and giving up on it quietly.
//
// If the archive project is ever configured to trust the live project's JWTs,
// its policies can test who is asking — and this sends the token so that day
// needs no code change. Today it almost certainly is not, and an archive that
// rejects the token must not turn into a screen full of errors.
//
// So: send it, and the FIRST time the archive answers 401 or 403, stop sending
// it for the rest of the session and retry on the key alone. The archive's own
// policies decide what comes back either way — this only decides what
// credentials are offered, never what they are worth.
// ---------------------------------------------------------------------------
let _forward = true;

async function liveToken(): Promise<string> {
  try {
    const live = getSupabase();
    if (!live) return '';
    const { data } = await live.auth.getSession();
    return data.session?.access_token ?? '';
  } catch {
    return '';
  }
}

const archiveFetch: typeof fetch = async (input, init) => {
  const send = (headers?: HeadersInit) => fetch(input as RequestInfo, { ...init, headers });
  if (!_forward) return send(init?.headers);

  const token = await liveToken();
  if (!token) return send(init?.headers);

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const res = await send(headers);
  if (res.status !== 401 && res.status !== 403) return res;

  // The archive does not know this token. It never will during this session,
  // so stop asking — one rejected request rather than one per query.
  _forward = false;
  return send(init?.headers);
};

let _client: SupabaseClient | null = null;
export function getArchive(): SupabaseClient | null {
  if (_client) return _client;
  if (!archiveConfigured()) return null;
  const { url, key } = getArchiveCreds();
  _client = createClient(url, key, {
    // NOTHING SIGNS IN HERE. Persisting a session would put a second auth
    // record in the same localStorage the live client uses, and nobody ever
    // authenticates against this project — the reads are anonymous or they
    // carry the live token (above).
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: archiveFetch },
  });
  return _client;
}

// ---------------------------------------------------------------------------
// The row shapes, which mirror the live registers column for column where the
// column exists on both sides. A timeline built from the two halves then needs
// no translation layer, and a future FDW join is a UNION ALL rather than a
// mapping exercise.
// ---------------------------------------------------------------------------
export interface ArchiveCall {
  ucn: string; call_number: string; reg_date: string | null; complaint_date: string | null;
  closed_date: string | null; party_name: string; city: string; product_name: string;
  serial: string; call_type: string; standard_complaint: string; complaint_reported: string;
  allocated_to: string; status: string; closing_status: string; source_system: string;
}
export interface ArchiveVisit {
  uid: string; ucn: string; visit_at: string | null; engineer: string; call_status: string;
  work_done: string; root_cause: string; product_name: string; serial: string; source_system: string;
}
export interface ArchivePart {
  ucn: string; part: string; part_name: string; qty: number; consumed_on: string | null;
  engineer: string; product_name: string; serial: string; source_system: string;
}
export interface ArchiveCover {
  cover_kind: string; cover_number: string; contract_type: string; cover_start: string | null;
  cover_end: string | null; status: string; party_name: string; source_system: string;
}
export interface ArchiveMachine {
  product_name: string; serial: string; party_name: string; city: string; state: string;
  address: string; item_status: string; installed_on: string | null; source_system: string;
}

export interface ArchiveHistory {
  machine: ArchiveMachine | null;
  calls: ArchiveCall[];
  visits: ArchiveVisit[];
  parts: ArchivePart[];
  cover: ArchiveCover[];
  // ONE OF THESE LISTS CAME BACK FULL, so what is on screen is a lower bound
  // and every count taken from it has to say so with a "+". One machine with
  // 2,000 archived calls should not exist — and a count that looks exact and is
  // not is worse than no count, because somebody acts on it.
  capped: boolean;
}

export const EMPTY_HISTORY: ArchiveHistory =
  { machine: null, calls: [], visits: [], parts: [], cover: [], capped: false };

// How much of one machine's past is fetched in a single request. Generous
// enough that no real machine reaches it, and checked rather than assumed.
const PAGE = 2000;

const str = (v: unknown) => String(v ?? '').trim();
const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const dat = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));

// ---------------------------------------------------------------------------
// ONE MACHINE'S PAST, in one round of parallel requests.
//
// Keyed on `machine_key` — model AND serial, the same key the live app
// computes (src/lib/machine.ts) and the archive stores as a generated column
// (ProdHistory_01.sql). Never the serial alone: the install base has eleven
// machines numbered "219", so the number by itself lands on a different
// machine at a different hospital.
//
// It never throws. An archive that is unreachable, unconfigured or mid-restore
// must leave the live half of the history on screen — a screen that shows 2024
// and says the older half is unavailable is useful, and one that shows an
// error instead of both halves is not. The caller is told through `ok`.
// ---------------------------------------------------------------------------
export async function archiveHistory(product: string, serial: string):
    Promise<{ ok: boolean; reason: string; history: ArchiveHistory }> {
  const c = getArchive();
  if (!c) return { ok: false, reason: 'not-configured', history: EMPTY_HISTORY };
  const key = machineKey(product, serial);
  if (key.startsWith('|') || key.endsWith('|')) {
    return { ok: false, reason: 'no-machine', history: EMPTY_HISTORY };
  }

  const table = <T>(name: string, cols: string, order: string) =>
    c.from(name).select(cols).eq('machine_key', key).order(order, { ascending: false, nullsFirst: false })
      .limit(PAGE)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as T[];
      });

  try {
    const [machines, calls, visits, parts, cover] = await Promise.all([
      table<Record<string, unknown>>('history_machines',
        'product_name,serial,party_name,city,state,address,item_status,installed_on,source_system', 'installed_on'),
      table<Record<string, unknown>>('history_calls',
        'ucn,call_number,reg_date,complaint_date,closed_date,party_name,city,product_name,serial,call_type,'
        + 'standard_complaint,complaint_reported,allocated_to,status,closing_status,source_system', 'reg_date'),
      table<Record<string, unknown>>('history_visits',
        'uid,ucn,visit_at,engineer,call_status,work_done,root_cause,product_name,serial,source_system', 'visit_at'),
      table<Record<string, unknown>>('history_parts',
        'ucn,part,part_name,qty,consumed_on,engineer,product_name,serial,source_system', 'consumed_on'),
      table<Record<string, unknown>>('history_cover',
        'cover_kind,cover_number,contract_type,cover_start,cover_end,status,party_name,source_system', 'cover_start'),
    ]);

    const m = machines[0];
    const capped = [calls, visits, parts, cover].some((rows) => rows.length >= PAGE);
    return {
      ok: true,
      reason: '',
      history: {
        capped,
        machine: m ? {
          product_name: str(m.product_name), serial: str(m.serial), party_name: str(m.party_name),
          city: str(m.city), state: str(m.state), address: str(m.address),
          item_status: str(m.item_status), installed_on: dat(m.installed_on), source_system: str(m.source_system),
        } : null,
        calls: calls.map((r) => ({
          ucn: str(r.ucn), call_number: str(r.call_number), reg_date: dat(r.reg_date),
          complaint_date: dat(r.complaint_date), closed_date: dat(r.closed_date),
          party_name: str(r.party_name), city: str(r.city), product_name: str(r.product_name),
          serial: str(r.serial), call_type: str(r.call_type), standard_complaint: str(r.standard_complaint),
          complaint_reported: str(r.complaint_reported), allocated_to: str(r.allocated_to),
          status: str(r.status), closing_status: str(r.closing_status), source_system: str(r.source_system),
        })),
        visits: visits.map((r) => ({
          uid: str(r.uid), ucn: str(r.ucn), visit_at: dat(r.visit_at), engineer: str(r.engineer),
          call_status: str(r.call_status), work_done: str(r.work_done), root_cause: str(r.root_cause),
          product_name: str(r.product_name), serial: str(r.serial), source_system: str(r.source_system),
        })),
        parts: parts.map((r) => ({
          ucn: str(r.ucn), part: str(r.part), part_name: str(r.part_name), qty: num(r.qty),
          consumed_on: dat(r.consumed_on), engineer: str(r.engineer), product_name: str(r.product_name),
          serial: str(r.serial), source_system: str(r.source_system),
        })),
        cover: cover.map((r) => ({
          cover_kind: str(r.cover_kind), cover_number: str(r.cover_number),
          contract_type: str(r.contract_type), cover_start: dat(r.cover_start), cover_end: dat(r.cover_end),
          status: str(r.status), party_name: str(r.party_name), source_system: str(r.source_system),
        })),
      },
    };
  } catch (e) {
    return { ok: false, reason: (e as Error).message || 'unreachable', history: EMPTY_HISTORY };
  }
}

// ---------------------------------------------------------------------------
// MACHINES THE LIVE REGISTER HAS NEVER HEARD OF.
//
// A ventilator sold in 2016 and retired in 2021 is in the archive and not in
// Product Master, so a picker fed only by the live register cannot reach its
// history at all — which would make the archive invisible for exactly the
// machines it exists to cover. The picker asks both and merges.
// ---------------------------------------------------------------------------
export async function archiveSearchMachines(product: string, query: string, limit = 50):
    Promise<ArchiveMachine[]> {
  const c = getArchive();
  if (!c) return [];
  const term = query.trim().replace(/[%_]/g, (m) => `\\${m}`);
  let q = c.from('history_machines')
    .select('product_name,serial,party_name,city,state,address,item_status,installed_on,source_system')
    .limit(limit);
  if (product.trim()) q = q.eq('product_name', product.trim());
  if (term) q = q.ilike('serial', `%${term}%`);
  else q = q.order('serial');
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map((r) => ({
    product_name: str(r.product_name), serial: str(r.serial), party_name: str(r.party_name),
    city: str(r.city), state: str(r.state), address: str(r.address),
    item_status: str(r.item_status), installed_on: dat(r.installed_on), source_system: str(r.source_system),
  })).filter((m) => m.serial);
}

// What is loaded, straight from the archive's own view (ProdHistory_03.sql).
// Settings shows it: "connected" is not the same answer as "has data in it",
// and a history screen that is empty because nothing was ever loaded looks
// exactly like one that is empty because the machine is new.
export interface ArchiveLoad { target: string; source_system: string; rows: number; loaded_at: string }
export async function archiveLoads(): Promise<ArchiveLoad[]> {
  const c = getArchive();
  if (!c) return [];
  const { data, error } = await c.from('history_loads').select('target,source_system,rows,loaded_at');
  if (error) return [];
  return (data ?? []).map((r) => ({
    target: str(r.target), source_system: str(r.source_system),
    rows: num(r.rows), loaded_at: str(r.loaded_at),
  }));
}

// Settings → Test. Cheap, and it distinguishes the three answers that matter:
// not configured, configured but refused, configured and answering.
export async function pingArchive(): Promise<{ ok: boolean; rows?: number; error?: string }> {
  const c = getArchive();
  if (!c) return { ok: false, error: 'No archive URL and key saved yet.' };
  const { count, error } = await c.from('history_calls').select('id', { count: 'exact', head: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: count ?? 0 };
}

// ---------------------------------------------------------------------------
// LOADING THE ARCHIVE FROM THE SCREEN.
//
// This is the ONE write path to the archive, and it is an INSERT and nothing
// else. Not an upsert, not an update, not a delete — and the database agrees
// rather than taking this module's word for it: ProdHistory_06 grants INSERT
// and leaves UPDATE, DELETE and TRUNCATE revoked, so the strongest property of
// the archive survives the fact that a browser can now write to it —
//
//   NOTHING REACHABLE FROM HERE CAN ALTER OR DESTROY AN EXISTING ROW.
//
// The worst case is rubbish rows NEXT TO the real ones, never instead of them,
// and that is recoverable because every row carries the label it was loaded
// under. Do not add an update path here without reading ProdHistory_02 and 06:
// a value written over a 2016 record cannot be reconstructed from anywhere.
//
// Batched the same way the live uploader batches, and for the same reason:
// PostgREST writes a batch as ONE insert whose column list is the union of the
// objects' keys, so a row missing a key is sent as NULL rather than taking the
// column's default. `byColumnSet` groups rows of identical shape, which is what
// lets a column no row in the group carries genuinely default.
// ---------------------------------------------------------------------------
export async function archiveUploadRows(
  table: string,
  rows: Record<string, unknown>[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: boolean; written: number; error?: string }> {
  const c = getArchive();
  if (!c) return { ok: false, written: 0, error: 'The archive is not connected (Settings → Archive).' };
  if (!/^history_/.test(table)) {
    // A live table name reaching this function would write live data into the
    // archive project, which nothing would ever report as wrong — the insert
    // would simply fail, or worse, succeed against a table of the same name.
    return { ok: false, written: 0, error: `${table} is not an archive table.` };
  }
  // These tables carry no per-row trigger at all, so the batches can be large:
  // 44,000 rows is 22 requests rather than 88.
  const SIZE = 2000;
  let written = 0;
  const slices = byColumnSet(rows).flatMap((group) => {
    const out: Record<string, unknown>[][] = [];
    for (let i = 0; i < group.length; i += SIZE) out.push(group.slice(i, i + SIZE));
    return out;
  });
  for (const slice of slices) {
    const { error } = await c.from(table).insert(slice);
    if (error) {
      const m = error.message || 'Unknown error';
      // The archive refuses an unlabelled row at the POLICY, so the message
      // comes back as a bare RLS violation — which reads as "you are not
      // allowed to load" when it means "this batch has no label on it".
      const hint = /row-level security/i.test(m)
        ? ' — every archive row must carry the export label, and the database refuses one without it.'
          + ' Fill in "Which export is this?" and upload again. If the label IS set, the archive'
          + ' has not had ProdHistory_06.sql run on it yet: without that file it accepts no writes at all.'
        : '';
      return { ok: false, written, error: `${m}${hint}` };
    }
    written += slice.length;
    onProgress?.(written, rows.length);
  }
  return { ok: true, written };
}

/** How many rows an archive table holds, for the uploader's "N rows now".
 *  Null when the archive is not connected — which the screen says in words,
 *  rather than showing a 0 that reads as "loaded, and empty". */
export async function countArchiveTable(table: string): Promise<number | null> {
  const c = getArchive();
  if (!c || !/^history_/.test(table)) return null;
  const { count, error } = await c.from(table).select('id', { count: 'exact', head: true });
  if (error) return null;
  return count ?? 0;
}

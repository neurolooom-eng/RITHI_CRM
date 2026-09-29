// ===========================================================================
// THE WHOLE MACHINE REGISTER, KEPT ON THIS PHONE OR LAPTOP.
//
// The user, 2026-09-29: "Engineers are often in remote location ... Weak
// network signal and possible frequent disconnection. Whole machine register
// on every phone / laptop as a cached data. Search everything relevant to
// Product Database from cached data."
//
// IndexedDB, not localStorage: twenty thousand machines is megabytes, and
// localStorage is capped at about five for EVERYTHING the app stores.
//
// THE RULES, each for a reason already paid for here:
//   * REFRESHED EVERY SIX HOURS (mastercache.ts's window for the product list,
//     set by the user). Older than that it is still SERVED -- a two-day-old
//     register is far better than an error in a basement -- and refreshed as
//     soon as there is a signal.
//   * REPLACED ONLY BY A COMPLETE DOWNLOAD. A walk that stops part-way is
//     kept IN MEMORY and resumed from the last machine it has (keyset), never
//     stored as the register.
//   * ONE PERSON'S COPY. Keyed by the signed-in user and wiped on sign-out and
//     by "Clear Cache and Update", so a shared laptop does not hand the next
//     person somebody else's copy, and so the button people press to get rid
//     of stale data actually gets rid of this too.
//   * EVERY COLUMN IS KEPT (the user, 2026-09-29: "keep all columns in the
//     cache") -- of the machine register AND of the Party Master, which is
//     what fills the customer's details once the machine has named them. Two
//     registers, one set of rules, refreshed together.
//   * EVERY STORAGE CALL IS GUARDED. A private window or a full disk throws on
//     IndexedDB itself; then the app simply asks the server, as it always did.
// ===========================================================================
import { getSupabase, productRowToSheet, sbReportDeviceCache } from './supabase';
import { storedListInfo, warmMaster, MASTER_STORED_EVENT } from './masters';
import {
  downloadAfter, packRows, unpackRows, toCached, deviceLabel,
  type CachedMachine, type CachedParty, type DownloadState, type PackedRows,
} from './machinecache';

const DB = 'rithi-machines';
const STORE = 'register';
// Bump to abandon every stored copy -- a change in what a row MEANS. v2: the
// whole row is kept, where v1 kept only the 33 screen headings.
const VERSION = 'v2';
export const MACHINE_REFRESH_MS = 6 * 60 * 60 * 1000;
// A walk that stopped is resumed only while it is this young; after that the
// register may have moved enough that stitching old and new pages is unwise.
const PARTIAL_MAX_AGE_MS = 2 * 60 * 60 * 1000;

interface Stored { v: string; user: string; at: number; packed: PackedRows }

export interface MachineRegisterStatus {
  machines: number;        // on this device
  at: number | null;       // when that copy was downloaded
  downloading: boolean;
  progress: number;        // rows received so far in the current walk
  error: string;           // the last failed walk, in the server's words
  duplicates: number;      // rows the server sent twice for one id -- kept once
}

// ---- IndexedDB, guarded ------------------------------------------------------
// WHETHER THIS BROWSER WILL KEEP A COPY AT ALL. A private window, or a browser
// set to block site data, refuses IndexedDB -- the copy then lasts only until
// the tab closes, which the administrator's report needs to be able to say.
let storageOk = true;
function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const fail = () => { storageOk = false; resolve(null); };
    try {
      if (typeof indexedDB === 'undefined') return fail();
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => { storageOk = true; resolve(req.result); };
      req.onerror = () => fail();
      req.onblocked = () => resolve(null);
    } catch { fail(); }
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  const db = await open(); if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve((req.result as T) ?? null); };
      tx.onerror = () => { db.close(); resolve(null); };
      tx.onabort = () => { db.close(); resolve(null); };
    } catch { db.close(); resolve(null); }
  });
}

async function currentUser(): Promise<string> {
  try {
    const c = getSupabase(); if (!c) return '';
    const { data } = await c.auth.getSession();
    return data.session?.user?.id ?? '';
  } catch { return ''; }
}

// "CLEAR CACHE AND UPDATE" DOES NOT TOUCH THESE COPIES (the user, 2026-09-29:
// "Since I am constantly working on Dev, invariably I ask the user to Clear
// Cache and Update. Will that not defeat the purpose?"). It used to force a
// full re-download of both registers on every press -- 19,266 machines and
// 5,876 customers, on every device, every release, for data a release does not
// change. Updating the APP and refreshing the DATA are now separate: a release
// never costs a download; the data refreshes on its six-hour schedule, after an
// upload or an edit, and on "Download again". A release that changes what the
// copy HOLDS bumps VERSION above, and every device re-downloads once by itself.

// ---- one register ---------------------------------------------------------------
// The machine register and the Party Master are the same problem with a
// different table, so they are the same code with a different table.
function register<T extends { id: number }>(o: {
  key: string; table: string; toItem: (row: Record<string, unknown>) => T;
}) {
  let memory: { user: string; at: number; items: T[] } | null = null;
  let loaded: Promise<void> | null = null;
  let partial: { user: string; started: number; state: DownloadState<Record<string, unknown> & { id: number }> } | null = null;
  let running: Promise<void> | null = null;
  let status: MachineRegisterStatus = { machines: 0, at: null, downloading: false, progress: 0, error: '', duplicates: 0 };
  const listeners = new Set<(s: MachineRegisterStatus) => void>();
  const publish = (p: Partial<MachineRegisterStatus>) => {
    status = { ...status, ...p };
    listeners.forEach((l) => { try { l(status); } catch { /* a screen's problem, not ours */ } });
  };

  async function loadFromDevice(): Promise<void> {
    const user = await currentUser();
    if (!user) return;
    const s = await idb<Stored>('readonly', (st) => st.get(o.key));
    if (!s || s.v !== VERSION || s.user !== user || !s.packed) return;
    try {
      const items = unpackRows(s.packed).map(o.toItem);
      memory = { user, at: s.at, items };
      publish({ machines: items.length, at: s.at });
    } catch { /* an unreadable copy is no copy */ }
    scheduleReport();
  }

  async function fetchAfter(afterId: number, size: number) {
    const c = getSupabase(); if (!c) throw new Error('Database not connected.');
    // `select('*')`: EVERY COLUMN, as the user asked.
    const { data, error } = await c.from(o.table).select('*').gt('id', afterId).order('id').limit(size);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ ...(r as Record<string, unknown>), id: Number(r.id) }));
  }

  function refresh(opts: { force?: boolean } = {}): Promise<void> {
    if (running) return running;
    running = (async () => {
      try {
        if (!loaded) loaded = loadFromDevice();
        await loaded;
        const user = await currentUser();
        if (!user) return;
        const fresh = memory && memory.user === user && Date.now() - memory.at < MACHINE_REFRESH_MS;
        if (fresh && !opts.force) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

        const resume = partial && partial.user === user && Date.now() - partial.started < PARTIAL_MAX_AGE_MS
          ? partial : { user, started: Date.now(), state: { rows: [], lastId: 0 } };
        partial = resume;
        publish({ downloading: true, progress: resume.state.rows.length, error: '' });
        const r = await downloadAfter(fetchAfter, resume.state, {
          onProgress: (n) => publish({ progress: n, error: '' }),
          onRetry: (error, attempt) => publish({ error: `${error} -- retrying (attempt ${attempt + 1})` }),
        });
        if (!r.complete) {
          partial = { ...resume, state: { rows: r.rows, lastId: r.lastId } };
          publish({ downloading: false, error: r.error ?? 'the download stopped' });
          return;
        }
        partial = null;
        // THE SIGNED-IN PERSON MAY HAVE CHANGED during a long walk.
        if ((await currentUser()) !== user) return;
        const at = Date.now();
        memory = { user, at, items: r.rows.map(o.toItem) };
        await idb('readwrite', (st) => st.put({ v: VERSION, user, at, packed: packRows(r.rows) } satisfies Stored, o.key));
        publish({ downloading: false, machines: r.rows.length, at, progress: r.rows.length, error: '', duplicates: r.duplicates ?? 0 });
      } catch (e) {
        publish({ downloading: false, error: e instanceof Error ? e.message : String(e) });
      } finally {
        running = null;
        scheduleReport();
      }
    })();
    return running;
  }

  /** The rows on this device for the signed-in person, or NULL when there is
   *  no copy yet -- then the caller asks the server and a download starts
   *  behind it. Never waits for the network. */
  async function local(): Promise<T[] | null> {
    if (!loaded) loaded = loadFromDevice();
    await loaded;
    const user = await currentUser();
    if (!memory || !user || memory.user !== user) { void refresh(); return null; }
    if (Date.now() - memory.at > MACHINE_REFRESH_MS) void refresh();
    return memory.items;
  }

  return {
    local, refresh, status: () => status,
    on(l: (s: MachineRegisterStatus) => void) { listeners.add(l); l(status); return () => { listeners.delete(l); }; },
    forget() { memory = null; partial = null; loaded = null; publish({ machines: 0, at: null, progress: 0, error: '' }); },
  };
}

// ---- telling the administrator what this device holds (0249) -----------------
// The user, 2026-09-29: "Build the cache status report for my desk." A copy on
// a phone is invisible from anywhere else, so each device reports it: counts,
// when each was downloaded, the last failure. Nothing it holds -- no machine,
// customer or search -- is sent.
//
// SENT WHEN SOMETHING CHANGES, or every six hours as a sign of life, and
// debounced so the two registers finishing together are one request. A report
// that fails is not retried on its own: the next change sends it anyway.
const DEVICE_KEY = 'rithi.device.id';
const LAST_REPORT_KEY = 'rithi.device.lastReport';
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch { return 'no-storage'; }
}
let reportTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleReport(): void {
  if (typeof window === 'undefined') return;
  if (reportTimer) clearTimeout(reportTimer);
  reportTimer = setTimeout(() => { reportTimer = null; void reportDeviceCache(); }, 3000);
}
export async function reportDeviceCache(opts: { force?: boolean } = {}): Promise<void> {
  if (!(await currentUser())) return;
  const m = machines.status(), p = parties.status();
  const iso = (t: number | null) => (t ? new Date(t).toISOString() : null);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const payload = {
    device_id: deviceId(), device_label: deviceLabel(ua), user_agent: ua.slice(0, 400),
    app_version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '',
    storage_ok: storageOk,
    machines: m.machines, machines_at: iso(m.at), machines_error: m.downloading ? '' : m.error.slice(0, 300),
    customers: p.machines, customers_at: iso(p.at), customers_error: p.downloading ? '' : p.error.slice(0, 300),
    // THE STANDARD COMPLAINTS the call forms filter by product (0253).
    complaints: storedListInfo('complaintProducts')?.count ?? 0,
    complaints_at: iso(storedListInfo('complaintProducts')?.at ?? null),
  };
  const sig = JSON.stringify(payload);
  try {
    const last = JSON.parse(localStorage.getItem(LAST_REPORT_KEY) ?? 'null') as { sig: string; at: number } | null;
    if (!opts.force && last && last.sig === sig && Date.now() - last.at < MACHINE_REFRESH_MS) return;
  } catch { /* no memory of the last one -- send */ }
  if (await sbReportDeviceCache(payload)) {
    try { localStorage.setItem(LAST_REPORT_KEY, JSON.stringify({ sig, at: Date.now() })); } catch { /* ignore */ }
  }
}

const machines = register<CachedMachine>({
  key: 'current', table: 'product_database',
  toItem: (row) => toCached(row, productRowToSheet(row)),
});
const parties = register<CachedParty>({
  key: 'parties', table: 'parties',
  toItem: (row) => ({ ...row, id: Number(row.id) }),
});

export const localMachines = machines.local;
export const localParties = parties.local;
export const onMachineRegister = machines.on;
export const onPartyRegister = parties.on;

/** Refresh both registers (each only if older than six hours, or `force`). */
export function refreshMachineRegister(opts: { force?: boolean } = {}): Promise<void> {
  return Promise.all([machines.refresh(opts), parties.refresh(opts)]).then(() => undefined);
}
export const refreshPartyRegister = parties.refresh;

/** Wipe both: sign-out. */
export async function clearMachineRegister(): Promise<void> {
  machines.forget(); parties.forget();
  // SAID BEFORE SIGNING OUT, while the session can still write its own row:
  // this device no longer holds a copy. Bounded, so a dead signal cannot hold
  // up somebody signing out.
  if (reportTimer) { clearTimeout(reportTimer); reportTimer = null; }
  await Promise.race([reportDeviceCache({ force: true }), new Promise((r) => setTimeout(r, 3000))]);
  try {
    if (typeof indexedDB !== 'undefined') await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  } catch { /* nothing else to try */ }
}

// A SIGNAL COMING BACK is the moment to carry on, and so is somebody returning
// to the app. Both are cheap no-ops while the copies are fresh.
let watching = false;
export function watchMachineRegister(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  window.addEventListener('online', () => { void refreshMachineRegister(); void warmMaster('complaintProducts'); });
  // A LIST STORED is something the report should say (the complaints).
  window.addEventListener(MASTER_STORED_EVENT, () => scheduleReport());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshMachineRegister();
  });
  window.setInterval(() => { void refreshMachineRegister(); void warmMaster('complaintProducts'); }, 15 * 60 * 1000);
  void refreshMachineRegister();
  // THE STANDARD COMPLAINTS TOO, so a Call Request can be filled with no
  // signal even if no call form was opened while there was one.
  void warmMaster('complaintProducts');
}

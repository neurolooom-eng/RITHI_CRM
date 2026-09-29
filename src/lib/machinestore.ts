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
import { getSupabase, productRowToSheet } from './supabase';
import {
  downloadAfter, packRows, unpackRows, toCached,
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
}

// ---- IndexedDB, guarded ------------------------------------------------------
function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
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

// "CLEAR CACHE AND UPDATE" RE-DOWNLOADS RATHER THAN WIPES. The button is
// pressed to get rid of stale data, and a wiped register in a place with no
// signal is an engineer with nothing to search -- the very thing this exists to
// prevent. So the press is remembered across the reload it causes, and the old
// copy is served until a COMPLETE new one replaces it. One flag per register.
const FORCE_FLAG = 'rithi.machines.force';
export function requestMachineRefresh(): void {
  try {
    localStorage.setItem(FORCE_FLAG, '1');
    localStorage.setItem(`${FORCE_FLAG}.parties`, '1');
  } catch { /* ignore */ }
}

// ---- one register ---------------------------------------------------------------
// The machine register and the Party Master are the same problem with a
// different table, so they are the same code with a different table.
function register<T extends { id: number }>(o: {
  key: string; table: string; flag: string; toItem: (row: Record<string, unknown>) => T;
}) {
  let memory: { user: string; at: number; items: T[] } | null = null;
  let loaded: Promise<void> | null = null;
  let partial: { user: string; started: number; state: DownloadState<Record<string, unknown> & { id: number }> } | null = null;
  let running: Promise<void> | null = null;
  let status: MachineRegisterStatus = { machines: 0, at: null, downloading: false, progress: 0, error: '' };
  const listeners = new Set<(s: MachineRegisterStatus) => void>();
  const publish = (p: Partial<MachineRegisterStatus>) => {
    status = { ...status, ...p };
    listeners.forEach((l) => { try { l(status); } catch { /* a screen's problem, not ours */ } });
  };
  const forced = () => { try { return localStorage.getItem(o.flag) === '1'; } catch { return false; } };

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
        if (fresh && !opts.force && !forced()) return;
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
        try { localStorage.removeItem(o.flag); } catch { /* ignore */ }
        // THE SIGNED-IN PERSON MAY HAVE CHANGED during a long walk.
        if ((await currentUser()) !== user) return;
        const at = Date.now();
        memory = { user, at, items: r.rows.map(o.toItem) };
        await idb('readwrite', (st) => st.put({ v: VERSION, user, at, packed: packRows(r.rows) } satisfies Stored, o.key));
        publish({ downloading: false, machines: r.rows.length, at, progress: r.rows.length, error: '' });
      } catch (e) {
        publish({ downloading: false, error: e instanceof Error ? e.message : String(e) });
      } finally {
        running = null;
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
    local, refresh,
    on(l: (s: MachineRegisterStatus) => void) { listeners.add(l); l(status); return () => { listeners.delete(l); }; },
    forget() { memory = null; partial = null; loaded = null; publish({ machines: 0, at: null, progress: 0, error: '' }); },
  };
}

const machines = register<CachedMachine>({
  key: 'current', table: 'product_database', flag: FORCE_FLAG,
  toItem: (row) => toCached(row, productRowToSheet(row)),
});
const parties = register<CachedParty>({
  key: 'parties', table: 'parties', flag: `${FORCE_FLAG}.parties`,
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
  window.addEventListener('online', () => { void refreshMachineRegister(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshMachineRegister();
  });
  window.setInterval(() => { void refreshMachineRegister(); }, 15 * 60 * 1000);
  void refreshMachineRegister();
}

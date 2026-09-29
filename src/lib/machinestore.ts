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
//   * EVERY STORAGE CALL IS GUARDED. A private window or a full disk throws on
//     IndexedDB itself; then the app simply asks the server, as it always did.
// ===========================================================================
import { getSupabase, productRowToSheet } from './supabase';
import { downloadAfter, fromSheet, pack, unpack, type CachedMachine, type DownloadState, type PackedRegister } from './machinecache';

const DB = 'rithi-machines';
const STORE = 'register';
const KEY = 'current';
// Bump to abandon every stored copy -- a change in what a row MEANS.
const VERSION = 'v1';
export const MACHINE_REFRESH_MS = 6 * 60 * 60 * 1000;
// A walk that stopped is resumed only while it is this young; after that the
// register may have moved enough that stitching old and new pages is unwise.
const PARTIAL_MAX_AGE_MS = 2 * 60 * 60 * 1000;

interface Stored { v: string; user: string; at: number; packed: PackedRegister }

export interface MachineRegisterStatus {
  machines: number;        // on this device
  at: number | null;       // when that copy was downloaded
  downloading: boolean;
  progress: number;        // machines received so far in the current walk
  error: string;           // the last failed walk, in the server's words
}

let memory: { user: string; at: number; machines: CachedMachine[] } | null = null;
let loaded: Promise<void> | null = null;
let partial: { user: string; started: number; state: DownloadState } | null = null;
let running: Promise<void> | null = null;
let status: MachineRegisterStatus = { machines: 0, at: null, downloading: false, progress: 0, error: '' };
const listeners = new Set<(s: MachineRegisterStatus) => void>();
function publish(p: Partial<MachineRegisterStatus>) {
  status = { ...status, ...p };
  listeners.forEach((l) => { try { l(status); } catch { /* a screen's problem, not ours */ } });
}
export function onMachineRegister(l: (s: MachineRegisterStatus) => void): () => void {
  listeners.add(l); l(status);
  return () => { listeners.delete(l); };
}
export const machineRegisterStatus = () => status;

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

// ---- reading the copy ---------------------------------------------------------
async function loadFromDevice(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const s = await idb<Stored>('readonly', (st) => st.get(KEY));
  if (!s || s.v !== VERSION || s.user !== user || !s.packed) return;
  try {
    const machines = unpack(s.packed);
    memory = { user, at: s.at, machines };
    publish({ machines: machines.length, at: s.at });
  } catch { /* an unreadable copy is no copy */ }
}

/** The machines on this device for the signed-in person, or NULL when there is
 *  no copy yet -- in which case the caller asks the server, and a download is
 *  started behind it. Never waits for the network. */
export async function localMachines(): Promise<CachedMachine[] | null> {
  if (!loaded) loaded = loadFromDevice();
  await loaded;
  const user = await currentUser();
  if (!memory || !user || memory.user !== user) { void refreshMachineRegister(); return null; }
  if (Date.now() - memory.at > MACHINE_REFRESH_MS) void refreshMachineRegister();
  return memory.machines;
}

// ---- refreshing it -----------------------------------------------------------
async function fetchAfter(afterId: number, size: number): Promise<CachedMachine[]> {
  const c = getSupabase(); if (!c) throw new Error('Database not connected.');
  const { data, error } = await c.from('product_database').select('*')
    .gt('id', afterId).order('id').limit(size);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => fromSheet(Number(r.id), String(r.created_at ?? ''), productRowToSheet(r)));
}

/** Download the register if the copy is missing or older than six hours (or
 *  always, with `force`). Resolves when the walk ends either way; never throws. */
export function refreshMachineRegister(opts: { force?: boolean } = {}): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      if (!loaded) loaded = loadFromDevice();
      await loaded;
      const user = await currentUser();
      if (!user) return;
      const fresh = memory && memory.user === user && Date.now() - memory.at < MACHINE_REFRESH_MS;
      if (fresh && !opts.force && !forceRequested()) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      const resume = partial && partial.user === user && Date.now() - partial.started < PARTIAL_MAX_AGE_MS
        ? partial : { user, started: Date.now(), state: { rows: [], lastId: 0 } };
      partial = resume;
      publish({ downloading: true, progress: resume.state.rows.length, error: '' });
      const r = await downloadAfter(fetchAfter, resume.state, { onProgress: (n) => publish({ progress: n }) });
      if (!r.complete) {
        partial = { ...resume, state: { rows: r.rows, lastId: r.lastId } };
        publish({ downloading: false, error: r.error ?? 'the download stopped' });
        return;
      }
      partial = null;
      try { localStorage.removeItem(FORCE_FLAG); } catch { /* ignore */ }
      // THE SIGNED-IN PERSON MAY HAVE CHANGED during a long walk.
      if ((await currentUser()) !== user) return;
      const at = Date.now();
      memory = { user, at, machines: r.rows };
      await idb('readwrite', (st) => st.put({ v: VERSION, user, at, packed: pack(r.rows) } satisfies Stored, KEY));
      publish({ downloading: false, machines: r.rows.length, at, progress: r.rows.length, error: '' });
    } catch (e) {
      publish({ downloading: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      running = null;
    }
  })();
  return running;
}

// "CLEAR CACHE AND UPDATE" RE-DOWNLOADS RATHER THAN WIPES. The button is
// pressed to get rid of stale data, and a wiped register in a place with no
// signal is an engineer with nothing to search -- the very thing this exists to
// prevent. So the press is remembered across the reload it causes, and the old
// copy is served until a COMPLETE new one replaces it.
const FORCE_FLAG = 'rithi.machines.force';
export function requestMachineRefresh(): void {
  try { localStorage.setItem(FORCE_FLAG, '1'); } catch { /* ignore */ }
}
function forceRequested(): boolean {
  try { return localStorage.getItem(FORCE_FLAG) === '1'; } catch { return false; }
}

/** Wipe it: sign-out and "Clear Cache and Update". */
export async function clearMachineRegister(): Promise<void> {
  memory = null; partial = null; loaded = null;
  publish({ machines: 0, at: null, progress: 0, error: '' });
  try {
    if (typeof indexedDB !== 'undefined') await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  } catch { /* nothing else to try */ }
}

// A SIGNAL COMING BACK is the moment to carry on, and so is somebody returning
// to the app. Both are cheap no-ops while the copy is fresh.
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

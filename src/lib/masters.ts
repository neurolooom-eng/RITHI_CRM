import { useEffect, useState } from 'react';
import { listMaster, dataConfigured } from './sheets';
import { isFresh, afterRefresh } from './mastercache';

// ===========================================================================
// Master value lists for form dropdowns (Party, Product, Standard Complaint,
// Call Type, ...). Values are read once per session from the configured master
// sheet via CallReg and cached. If a master isn't configured or reachable, the
// caller's static fallback list is used so the form still works.
// ===========================================================================

const cache = new Map<string, string[]>();
// WHICH LISTS FAILED TO LOAD. `load()` swallows the error and returns [], which
// is right -- a picker must still render -- and is the reason the Call Request
// product box told an engineer `Nothing matches ""` when the fetch had failed
// (reported 2026-09-21, with a screenshot). An empty list and a failed request
// are OPPOSITE facts and the screen was stating the wrong one: "nothing to
// choose from" instead of "I could not reach the list". Same argument as an
// empty register proving what the READER was shown rather than what exists.
const failedNames = new Set<string>();
export const masterFailed = (name: string): boolean => failedNames.has(name);
const inflight = new Map<string, Promise<string[]>>();

// ---------------------------------------------------------------------------
// THE LISTS SURVIVE A RELOAD, because re-fetching them on every page load is
// what made the New Call Request form slow to open on a phone (reported
// 2026-09-10: "it is still taking quite some time.. Even became non responsive
// during 1 try"). The party list alone is thousands of names, paged a thousand
// at a time.
//
// STALE-WHILE-REVALIDATE, which is the shape that actually helps: the stored
// copy is handed over IMMEDIATELY so the form opens with a full list, and a
// fresh copy is fetched in the background and swapped in when it lands. A cache
// that blocks until it has revalidated is just a slow fetch with extra steps.
//
// A master changes when somebody edits it, which is rare and never urgent —
// a party added a minute ago appearing a minute later costs nothing, and
// "Clear Cache and Update" wipes this too (clearMasterCache below).
//
// STORED AS ONE NEWLINE-JOINED STRING rather than JSON: a few thousand names is
// a few hundred KB, and JSON.stringify on an array of strings spends a third of
// that on quotes and commas. Names cannot contain a newline.
//
// EVERY ACCESS IS GUARDED. A private window, a browser set to block site data,
// or a full quota all THROW on the accessor itself, not just return null — and
// a form that will not open because a cache is unavailable is worse than one
// that is slow.
// ---------------------------------------------------------------------------
const STORE_PREFIX = 'rithi.master.';
// Bump to abandon every stored list at once — a change in what a list MEANS
// (its source, its filtering) must not be served from a copy of the old one.
//
// v3 (2026-09-29): every device drops its stored lists once. An OLDER BUILD
// could store a product list cut short by one failed request -- the bug fixed
// in 0.9.381 -- and newer builds trusted any stored product list for six hours,
// so a phone that had run the old build kept offering 13 products of 44
// (reported for RAJU VISHWAKARMA). Bumping this is the one lever that reaches a
// list already sitting on somebody's phone.
const STORE_VERSION = 'v3-after-prefix-fix';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored { v: string; at: number; values: string }

function readEntry(name: string): { values: string[]; at: number } | null {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + name);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (s.v !== STORE_VERSION) return null;
    // A copy older than the window is not served even stale: something has
    // probably changed, and a week-old party list is worth one wait.
    if (!s.at || Date.now() - s.at > MAX_AGE_MS) return null;
    return { values: s.values ? s.values.split('\n') : [], at: s.at };
  } catch { return null; }
}
function readStored(name: string): string[] | null {
  return readEntry(name)?.values ?? null;
}

/** What this device holds of one list -- how many values and when they were
 *  stored -- for the line under a screen's title and the Device Cache Status
 *  report. NULL when the device holds no copy. */
export function storedListInfo(name: string): { count: number; at: number } | null {
  const e = readEntry(name);
  return e ? { count: e.values.length, at: e.at } : null;
}
/** Fired whenever a list is stored, so what reports on it can follow. */
export const MASTER_STORED_EVENT = 'rithi:master-stored';

function writeStored(name: string, values: string[]) {
  try {
    localStorage.setItem(STORE_PREFIX + name, JSON.stringify(
      { v: STORE_VERSION, at: Date.now(), values: values.join('\n') } satisfies Stored));
    try { window.dispatchEvent(new CustomEvent(MASTER_STORED_EVENT, { detail: name })); } catch { /* no window */ }
  } catch {
    // Out of quota, most likely. Drop every stored list rather than leaving a
    // half-written set: the in-memory cache still serves this session.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(STORE_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* nothing else to try */ }
  }
}

function load(name: string): Promise<string[]> {
  if (cache.has(name)) return Promise.resolve(cache.get(name)!);
  if (inflight.has(name)) return inflight.get(name)!;
  const p = listMaster(name)
    .then((v) => {
      cache.set(name, v); inflight.delete(name); failedNames.delete(name);
      // Only a NON-EMPTY answer is stored. An empty one is usually a failed
      // request or a permission the reader has not got, and storing it would
      // serve that emptiness back for a week.
      if (v.length) writeStored(name, v);
      return v;
    })
    .catch(() => { inflight.delete(name); failedNames.add(name); return [] as string[]; });
  inflight.set(name, p);
  return p;
}

/** DOWNLOAD NOW (the user, 2026-10-05: "Give Download Now Option in the Cache
 *  info"): fetch a fresh copy whatever the age of the stored one. The stored
 *  copy is NOT cleared first -- a download that fails on a weak signal keeps
 *  the good list (mastercache.ts, rule 1). True when a fresh copy was stored;
 *  every open picker follows through MASTER_STORED_EVENT. Never throws. */
export async function downloadMasterNow(name: string): Promise<boolean> {
  try {
    if (!dataConfigured()) return false;
    const v = await listMaster(name);
    if (!v.length) return false;
    cache.set(name, v); inflight.delete(name); failedNames.delete(name);
    writeStored(name, v);
    return true;
  } catch { return false; }
}

// Clear cached master values (e.g. after editing the registry, or a force sync).
// Clears the STORED copy too, or "Clear Cache and Update" would leave the very
// thing somebody pressed it to get rid of.
export function clearMasterCache(name?: string) {
  if (name) { cache.delete(name); inflight.delete(name); }
  else { cache.clear(); inflight.clear(); }
  try {
    if (name) localStorage.removeItem(STORE_PREFIX + name);
    else Object.keys(localStorage)
      .filter((k) => k.startsWith(STORE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

/** `enabled: false` skips the fetch entirely — for a list a form only needs in
 *  one of its modes. The hook still runs, so the rule of hooks is kept; what it
 *  does not do is pull thousands of rows nobody is going to look at. */
export function useMaster(
  name: string, fallback: string[] = [], enabled = true,
): { values: string[]; ready: boolean; failed: boolean } {
  const [failed, setFailed] = useState(false);
  const [values, setValues] = useState<string[]>(() => cache.get(name) ?? readStored(name) ?? fallback);
  const [ready, setReady] = useState<boolean>(
    () => cache.has(name) || readStored(name) !== null || !dataConfigured());

  useEffect(() => {
    let cancelled = false;
    if (!enabled) return;
    if (!dataConfigured()) { setValues(fallback); setReady(true); return; }
    if (cache.has(name)) { setValues(cache.get(name)!.length ? cache.get(name)! : fallback); setReady(true); return; }

    // THE STORED COPY GOES ON SCREEN FIRST, and the fetch still runs. That is
    // the whole point: the form opens with a full list on the first frame, and
    // a name added since appears when the fresh copy lands a moment later.
    const entry = readEntry(name);
    if (entry) {
      setValues(entry.values.length ? entry.values : fallback); setReady(true);
      // YOUNG ENOUGH TO TRUST (mastercache.ts): no network call at all. This is
      // what keeps a phone in a no-signal area working for six hours.
      if (entry.values.length && isFresh(name, entry.at, Date.now())) {
        cache.set(name, entry.values);
        return;
      }
    }

    void load(name).then((v) => {
      if (cancelled) return;
      // A FAILED OR EMPTY REFRESH KEEPS THE GOOD COPY rather than replacing it
      // with nothing -- which is what used to happen on a weak signal.
      const r = afterRefresh(entry?.values ?? null, masterFailed(name) ? null : v);
      setValues(r.values.length ? r.values : fallback);
      setFailed(r.failed);
      setReady(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, enabled]);

  // A FRESH COPY STORED ELSEWHERE (Download now) reaches this picker at once.
  useEffect(() => {
    if (!enabled) return;
    const onStored = (e: Event) => {
      if ((e as CustomEvent).detail !== name) return;
      const v = cache.get(name) ?? readStored(name);
      if (v && v.length) { setValues(v); setFailed(false); setReady(true); }
    };
    window.addEventListener(MASTER_STORED_EVENT, onStored);
    return () => window.removeEventListener(MASTER_STORED_EVENT, onStored);
  }, [name, enabled]);

  return { values, ready, failed };
}

/** Fetch and store a list in the background if this device has no young copy
 *  -- so a list a screen will need offline is on the device BEFORE that screen
 *  is opened (the Standard Complaints, 2026-09-30). Never throws. */
export async function warmMaster(name: string): Promise<void> {
  try {
    const e = readEntry(name);
    if (e && e.values.length && isFresh(name, e.at, Date.now())) return;
    if (!dataConfigured()) return;
    await load(name);
  } catch { /* the screen that needs it will ask again */ }
}

/** Fetch and store a list only if this device holds NO copy of it at all --
 *  for a list that is re-read whenever its form opens (the parts), so it is on
 *  the device for use with no signal without being re-downloaded on a timer.
 *  Never throws. */
export async function warmMasterIfMissing(name: string): Promise<void> {
  try {
    if (readEntry(name) || !dataConfigured()) return;
    await load(name);
  } catch { /* the form that needs it will ask again */ }
}

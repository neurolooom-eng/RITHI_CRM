import { useEffect, useState } from 'react';
import { listMaster, dataConfigured } from './sheets';

// ===========================================================================
// Master value lists for form dropdowns (Party, Product, Standard Complaint,
// Call Type, ...). Values are read once per session from the configured master
// sheet via CallReg and cached. If a master isn't configured or reachable, the
// caller's static fallback list is used so the form still works.
// ===========================================================================

const cache = new Map<string, string[]>();
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
const STORE_VERSION = 'v2-productParty';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored { v: string; at: number; values: string }

function readStored(name: string): string[] | null {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + name);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (s.v !== STORE_VERSION) return null;
    // A copy older than the window is not served even stale: something has
    // probably changed, and a week-old party list is worth one wait.
    if (!s.at || Date.now() - s.at > MAX_AGE_MS) return null;
    return s.values ? s.values.split('\n') : [];
  } catch { return null; }
}

function writeStored(name: string, values: string[]) {
  try {
    localStorage.setItem(STORE_PREFIX + name, JSON.stringify(
      { v: STORE_VERSION, at: Date.now(), values: values.join('\n') } satisfies Stored));
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
      cache.set(name, v); inflight.delete(name);
      // Only a NON-EMPTY answer is stored. An empty one is usually a failed
      // request or a permission the reader has not got, and storing it would
      // serve that emptiness back for a week.
      if (v.length) writeStored(name, v);
      return v;
    })
    .catch(() => { inflight.delete(name); return [] as string[]; });
  inflight.set(name, p);
  return p;
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
): { values: string[]; ready: boolean } {
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
    const stored = readStored(name);
    if (stored) { setValues(stored.length ? stored : fallback); setReady(true); }

    void load(name).then((v) => {
      if (cancelled) return;
      setValues(v.length ? v : fallback);
      setReady(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, enabled]);

  return { values, ready };
}

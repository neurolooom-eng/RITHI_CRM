import { useSyncExternalStore } from 'react';

// ===========================================================================
// MODULE COUNTS — a tiny shared store of "how many rows does this screen show".
// A module reports its (already role-scoped) row count via <PageHeader count>;
// the sidebar nav and the page heading both read it back. Persisted to
// localStorage so a count shows next to a module the moment the app loads,
// before that screen is opened again. Keyed by route path.
//
// `more` marks the count as a LOWER BOUND: the screen loads in pages (e.g. the
// first 1000 rows) and there are more behind a "Load more", so the true total
// is at least this many. It renders as "1,000+" — never a wrong exact number.
// ===========================================================================

const KEY = 'rithi.counts';

export interface Count { n: number; more?: boolean }

let counts: Record<string, Count> = load();
const listeners = new Set<() => void>();

function load(): Record<string, Count> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!v || typeof v !== 'object') return {};
    // Tolerate an older shape where the value was a bare number.
    const out: Record<string, Count> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === 'number') out[k] = { n: val };
      else if (val && typeof val === 'object' && typeof (val as Count).n === 'number') out[k] = val as Count;
    }
    return out;
  } catch {
    return {};
  }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(counts)); } catch { /* ignore */ }
}

// Record the count a screen is showing. No-op when unchanged, so it is safe to
// call from a render effect on every sync.
export function setModuleCount(path: string, n: number, more = false) {
  const cur = counts[path];
  if (cur && cur.n === n && !!cur.more === more) return;
  counts = { ...counts, [path]: { n, more } };
  persist();
  listeners.forEach((l) => l());
}

// Human label for a count: "1,234" or "1,000+".
export function countLabel(c: Count): string {
  return `${c.n.toLocaleString()}${c.more ? '+' : ''}`;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// Whole map — the nav subscribes to this and reads per-path.
export function useModuleCounts(): Record<string, Count> {
  return useSyncExternalStore(subscribe, () => counts, () => counts);
}

import { useSyncExternalStore } from 'react';

// ===========================================================================
// MODULE COUNTS — a tiny shared store of "how many rows does this screen show".
// A module reports its (already role-scoped) row count via <PageHeader count>;
// the sidebar nav and the page heading both read it back. Persisted to
// localStorage so a count shows next to a module the moment the app loads,
// before that screen is opened again. Keyed by route path.
// ===========================================================================

const KEY = 'rithi.counts';

let counts: Record<string, number> = load();
const listeners = new Set<() => void>();

function load(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(counts)); } catch { /* ignore */ }
}

// Record the count a screen is showing. No-op when unchanged, so it is safe to
// call from a render effect on every sync.
export function setModuleCount(path: string, n: number) {
  if (counts[path] === n) return;
  counts = { ...counts, [path]: n };
  persist();
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// Whole map — the nav subscribes to this and reads per-path.
export function useModuleCounts(): Record<string, number> {
  return useSyncExternalStore(subscribe, () => counts, () => counts);
}

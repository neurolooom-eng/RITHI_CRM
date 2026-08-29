// ---------------------------------------------------------------------------
// Lightweight per-table browser cache (localStorage) + last-sync tracking.
// Mirrors the Call Register behaviour for every list view: load instantly from
// cache, show "synced X ago", auto-refresh when stale (default 30 min), and a
// manual force-sync. Only the default/browse set is cached (capped), not
// filtered/searched results.
// ---------------------------------------------------------------------------

export const SYNC_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHED_ROWS = 1500;              // keep localStorage well under quota
const PREFIX = 'rithi.cache.';

export interface CacheEntry<T = Record<string, unknown>> { at: string; rows: T[] }

export function loadCache<T = Record<string, unknown>>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const e = JSON.parse(raw) as CacheEntry<T>;
    return e && Array.isArray(e.rows) ? e : null;
  } catch { return null; }
}

export function saveCache<T = Record<string, unknown>>(key: string, rows: T[]): string {
  const at = new Date().toISOString();
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ at, rows: rows.slice(0, MAX_CACHED_ROWS) })); }
  catch { /* quota / disabled — non-fatal */ }
  return at;
}

export const isStale = (at: string | undefined, ttl = SYNC_TTL_MS): boolean =>
  !at || Date.now() - new Date(at).getTime() > ttl;

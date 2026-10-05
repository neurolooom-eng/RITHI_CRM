// ---------------------------------------------------------------------------
// Lightweight per-table browser cache (localStorage) + last-sync tracking.
// Mirrors the Call Register behaviour for every list view: load instantly from
// cache, show "synced X ago", auto-refresh when stale (default 30 min), and a
// manual force-sync. Only the default/browse set is cached (capped), not
// filtered/searched results.
// ---------------------------------------------------------------------------

export const SYNC_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const MAX_CACHED_ROWS = 1500;              // keep localStorage well under quota
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

/** FORGET EVERY CACHED REGISTER AT SIGN-OUT (D-070). Each holds rows read
 *  under the signed-in person's row-level security -- up to 1,500 Audit Log
 *  rows among them -- so they must not outlive the session on a shared device.
 *  `rithi.sync.*` goes too: a "last synced" time with no rows behind it would
 *  tell the next person's screen it is fresh when it has read nothing.
 *  Preferences (theme, column widths, filters) are kept: they are the device's,
 *  not the data's. */
export function forgetCachedRegisters(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(PREFIX) || k.startsWith('rithi.sync.'))) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch { /* storage unavailable: nothing was cached */ }
}

export const isStale = (at: string | undefined, ttl = SYNC_TTL_MS): boolean =>
  !at || Date.now() - new Date(at).getTime() > ttl;

// THE BACKGROUND SYNC WAITS FOR A READ ALREADY IN FLIGHT. A register's
// 30-minute timer used to call its loader regardless, so a tick landing while
// "Load more" was fetching ran two reads at once and whichever finished second
// replaced the other's rows: the sync's page one over a page just loaded, or
// the Load more's stale list plus a page over the sync's fresh one. Rare, and
// the result looks complete, which is why it matters. The buttons are already
// disabled while busy, so the timer was the only way in. A tick that finds
// the screen busy now retries every few seconds until it is idle, instead of
// racing it or being skipped for another half hour.
export function startBackgroundSync(
  tick: () => void,
  isBusy: () => boolean,
  every: number = SYNC_TTL_MS,
  retry = 5000,
): () => void {
  let wait: ReturnType<typeof setTimeout> | undefined;
  const attempt = () => {
    wait = undefined;
    if (isBusy()) { wait = setTimeout(attempt, retry); return; }
    tick();
  };
  const id = setInterval(() => { if (!wait) attempt(); }, every);
  return () => { clearInterval(id); if (wait) clearTimeout(wait); };
}

// ---------------------------------------------------------------------------
// WHO created a row.
//
// Every quality record stamps `auth.uid()` into created_by / recorded_by, so a
// table that surfaces one of those columns shows a raw UUID
// ("6680c358-d798-…") where it should show "Rithi Admin". The names come from
// `app_user_names` (0068) — id -> display name and nothing else, readable by
// any signed-in user, because `profiles` only lets most people read themselves.
//
// Loaded once per session and shared: the map is small, changes rarely, and
// every table wants the same one. Until it resolves (or if the view is not
// applied) callers get an empty map and go on showing the UUID.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { listUserNames, supabaseConfigured } from './supabase';

let cache: Record<string, string> | null = null;
let inFlight: Promise<Record<string, string>> | null = null;
const listeners = new Set<(m: Record<string, string>) => void>();

export function userNames(): Record<string, string> { return cache ?? {}; }
export function clearUserNames(): void { cache = null; inFlight = null; }

export function loadUserNames(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache);
  if (!supabaseConfigured()) return Promise.resolve({});
  if (!inFlight) {
    inFlight = listUserNames()
      .then((m) => { cache = m; listeners.forEach((f) => f(m)); return m; })
      .catch(() => ({}))
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

// The map, re-rendering the caller once it arrives.
export function useUserNames(): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>(() => cache ?? {});
  useEffect(() => {
    let alive = true;
    const on = (m: Record<string, string>) => { if (alive) setMap(m); };
    listeners.add(on);
    void loadUserNames().then(on);
    return () => { alive = false; listeners.delete(on); };
  }, []);
  return map;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const looksLikeUserId = (v: unknown): boolean => typeof v === 'string' && UUID_RE.test(v.trim());

// The name behind an id, or the id itself when it is not one we know — a
// stranger's UUID is still better than a blank cell.
export const nameForUserId = (v: unknown, map: Record<string, string>): string => {
  const s = String(v ?? '').trim();
  return map[s] ?? map[s.toLowerCase()] ?? s;
};

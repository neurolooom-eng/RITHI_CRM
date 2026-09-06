// ---------------------------------------------------------------------------
// THE STATE OF A CALL, WHEREVER ITS UCN IS SHOWN.
//
// The rule (2026-09-06): a UCN is coloured by its call's status everywhere it
// is referenced — the call registers, the spare module, the DCCR, anywhere.
//
// Some registers already carry the state on the row (a call register knows its
// own calls). The others do not: a spare line carries a UCN because the spare
// was raised against a call, not because it knows what happened to that call.
// Rather than teach every one of those queries to join the calls, the UCNs on
// SCREEN are looked up in one go, here, and shared.
//
// WHAT IT WILL NOT DO IS GUESS. A UCN whose state has not arrived — or cannot
// be read, because the reader's scope does not include that call — renders
// plain. A wrong colour on a code people read is worse than no colour.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { listCallStates, supabaseConfigured } from './supabase';

const cache = new Map<string, string>();     // ucn -> state
const asked = new Set<string>();             // ucns already requested this session
let pending: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function clearCallStates(): void { cache.clear(); asked.clear(); }

// READ FROM A COLUMN DEFINITION. Most registers declare their columns at module
// level, outside any component, so a `render` cannot reach a hook's return
// value. The same shape `setEngineerNamesCache` already uses: the hook fetches
// and re-renders, this reads what has arrived. Empty until it has — and empty
// means uncoloured, never guessed.
export function callStateFor(ucn: unknown): string {
  return cache.get(String(ucn ?? '').trim()) ?? '';
}

// One request per burst rather than one per register: several screens can be
// mounted at once, and the UCNs they want overlap.
function flush(): void {
  const want = pending;
  pending = [];
  timer = null;
  if (!want.length) return;
  void listCallStates(want)
    .then((m) => {
      Object.entries(m).forEach(([u, st]) => cache.set(u, st));
      listeners.forEach((f) => f());
    })
    .catch(() => { /* leave them uncoloured; the UCN still reads */ });
}

export function useCallStates(ucns: string[]): Record<string, string> {
  const [, bump] = useState(0);
  const key = ucns.join('|');

  useEffect(() => {
    const on = () => bump((n) => n + 1);
    listeners.add(on);
    if (supabaseConfigured()) {
      const fresh = ucns.filter((u) => u && !asked.has(u));
      if (fresh.length) {
        fresh.forEach((u) => asked.add(u));
        pending = pending.concat(fresh);
        if (!timer) timer = setTimeout(flush, 60);
      }
    }
    return () => { listeners.delete(on); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const out: Record<string, string> = {};
  ucns.forEach((u) => { const s = cache.get(u); if (s) out[u] = s; });
  return out;
}

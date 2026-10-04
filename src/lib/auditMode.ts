import { useEffect, useState } from 'react';
import { getAuditMode, supabaseConfigured } from './supabase';

// ONE ANSWER FOR EVERY SCREEN, AND IT MOVES WHEN THE SWITCH DOES (the user,
// 2026-10-04: "I tried to turn on the Audit Mode, Still i am able to see the
// Spare Recycling Page"). It used to be read once per screen and cached for a
// minute, so the menu -- mounted once -- never heard the switch was thrown,
// and an open page went on showing. Now the answer is held once, every hook
// subscribes to it, the switch publishes the new state the moment it is saved
// (publishAuditMode), and it is re-read every minute and whenever the tab
// comes back into focus -- so another device's switch reaches this one too.
type State = { on: boolean; known: boolean };
let current: State = { on: true, known: false };
let lastRead = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<(s: State) => void>();
const FRESH_MS = 60 * 1000;

function set(next: State) {
  current = next;
  listeners.forEach((l) => l(current));
}

function refresh(force = false): Promise<void> {
  if (!supabaseConfigured()) { set({ on: true, known: false }); return Promise.resolve(); }
  if (!force && current.known && Date.now() - lastRead < FRESH_MS) return Promise.resolve();
  if (inflight) return inflight;
  inflight = getAuditMode()
    .then((on) => { lastRead = Date.now(); set({ on, known: true }); })
    .catch(() => { set({ on: true, known: false }); })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Called by the Audit Mode switch once the database has accepted the change. */
export function publishAuditMode(on: boolean): void {
  lastRead = Date.now();
  set({ on, known: true });
}

let watching = false;
function watch() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  window.addEventListener('focus', () => { void refresh(true); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refresh(true); });
  window.setInterval(() => { void refresh(true); }, FRESH_MS);
}

export function useAuditMode(): State {
  const [state, setState] = useState<State>(current);
  useEffect(() => {
    listeners.add(setState);
    setState(current);
    watch();
    void refresh();
    return () => { listeners.delete(setState); };
  }, []);
  return state;
}

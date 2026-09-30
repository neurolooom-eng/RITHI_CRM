import { useEffect, useState } from 'react';
import { getAuditMode, supabaseConfigured } from './supabase';

// ===========================================================================
// IS AUDIT MODE ON? (0114) -- for the screens whose controls it hides.
//
// The first rule attached to the mode (the user, 2026-09-30): the call's
// "Update Party Details" / "Update Product Details" are shown only while Audit
// Mode is OFF, and hidden while it is ON. The database refuses them as well
// (0271), so a screen that has not re-read the switch cannot get round it.
//
// UNKNOWN READS AS ON: until the answer arrives, or if it cannot be read, the
// controls stay hidden -- showing a control the mode forbids, even briefly, is
// the wrong way round for an audit.
// ===========================================================================
let cached: { on: boolean; at: number } | null = null;
const FRESH_MS = 60 * 1000;

export function useAuditMode(): { on: boolean; known: boolean } {
  const [state, setState] = useState<{ on: boolean; known: boolean }>(
    () => (cached && Date.now() - cached.at < FRESH_MS ? { on: cached.on, known: true } : { on: true, known: false }));
  useEffect(() => {
    if (!supabaseConfigured()) { setState({ on: true, known: false }); return; }
    if (cached && Date.now() - cached.at < FRESH_MS) return;
    let alive = true;
    getAuditMode()
      .then((on) => { cached = { on, at: Date.now() }; if (alive) setState({ on, known: true }); })
      .catch(() => { if (alive) setState({ on: true, known: false }); });
    return () => { alive = false; };
  }, []);
  return state;
}

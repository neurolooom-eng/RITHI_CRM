import type { CallState } from './supabase';

// ---------------------------------------------------------------------------
// One colour language for call state, used by every register: the badge in the
// Call Status column, the Pending Calls module, and the Hotline's open-call
// warning on a registration request.
//   Solved         green   — closed, nothing to do
//   Unsolved       red     — visited, still broken
//   Report pending amber   — visited, report not completed
//   Unattended     blue    — registered, no visit yet
// ---------------------------------------------------------------------------
export const STATE_TONE: Record<CallState, string> = {
  Solved: 'badge-success',
  Unsolved: 'badge-danger',
  'Report pending': 'badge-warning',
  Unattended: 'badge-info',
};

export const STATE_HINT: Record<CallState, string> = {
  Solved: 'Last visit closed the call',
  Unsolved: 'Last visit came back unsolved',
  'Report pending': 'Visited — report not completed',
  Unattended: 'Registered — no visit reported yet',
};

export function StateBadge({ state, title }: { state?: string; title?: string }) {
  if (!state) return <span className="muted">—</span>;
  const s = state as CallState;
  return <span className={`badge ${STATE_TONE[s] ?? 'badge-neutral'}`} title={title ?? STATE_HINT[s] ?? state}>{state}</span>;
}

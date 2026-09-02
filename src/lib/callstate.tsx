import type { CallState } from './supabase';

// ---------------------------------------------------------------------------
// One colour language for call state, used by every register: the badge in the
// Call Status column, the Pending Calls module, and the Hotline's open-call
// warning on a registration request.
//   Solved         green   — closed, nothing to do
//   Unsolved       red     — visited, still broken
//   Report pending amber   — visited, report not completed
//   Unattended     blue    — registered, no visit yet
//   Reopened       amber   — closed, then re-opened by the Hotline
//
// The badge shows the call's EXACT last status ("Solved - Report Completed"),
// coloured by which of the states above it falls into.
// ---------------------------------------------------------------------------
export const STATE_TONE: Record<string, string> = {
  Reopened: 'badge-warning',
  Solved: 'badge-success',
  Unsolved: 'badge-danger',
  'Report pending': 'badge-warning',
  Unattended: 'badge-info',
};

export const STATE_HINT: Record<string, string> = {
  Reopened: 'Closed, then re-opened — it needs another visit',
  Solved: 'Last visit closed the call',
  Unsolved: 'Last visit came back unsolved',
  'Report pending': 'Visited — report not completed',
  Unattended: 'Registered — no visit reported yet',
};

// `state` is the bucket (it picks the colour); `label` is what the call
// actually says — its exact last status. Falls back to the bucket.
export function StateBadge({ state, label, title }: { state?: string; label?: string; title?: string }) {
  if (!state && !label) return <span className="muted">—</span>;
  const s = String(state || label);
  const text = label || s;
  const hint = title ?? (STATE_HINT[s] ? (text === s ? STATE_HINT[s] : `${STATE_HINT[s]} — ${text}`) : text);
  return <span className={`badge ${STATE_TONE[s] ?? 'badge-neutral'}`} title={hint}>{text}</span>;
}

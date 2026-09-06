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
//   Cancelled      grey    — the call should not exist; kept, not deleted
//
// The badge shows the call's EXACT last status ("Solved - Report Completed"),
// coloured by which of the states above it falls into.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// THE CALL-STATUS COLOUR CODE — FIXED, and the same in either theme.
//
// The user's specification (2026-09-06):
//
//     Unattended                              RED
//     Unsolved                                BLUE
//     Solved - Report Pending                 PINK
//     Solved / Solved - Report Completed      GREEN
//
// "During colour theme switch — don't change the colours. Instead make a box
// around it to protect the colour coding."
//
// So these are LITERAL COLOURS, not theme tokens. A colour people have learned
// to read is a code, and a code that means something different in dark mode is
// not a code. Every other colour in the app follows the theme; these four do
// not, deliberately, and that is why they live here as hex rather than in the
// palette.
//
// What DOES change with the theme is the box: on a dark ground a mid-tone fill
// needs an outline to sit properly, so `.state-chip` draws one. The hue is
// untouched either way.
// ---------------------------------------------------------------------------
export interface StateColour { bg: string; fg: string; label: string }

export const STATE_COLOUR: Record<string, StateColour> = {
  Unattended:       { bg: '#d32f2f', fg: '#ffffff', label: 'Unattended' },
  Unsolved:         { bg: '#1565c0', fg: '#ffffff', label: 'Unsolved' },
  'Report pending': { bg: '#c2185b', fg: '#ffffff', label: 'Report pending' },
  Solved:           { bg: '#2e7d32', fg: '#ffffff', label: 'Solved' },
  // Not in the user's four, but they exist and must not fall through to
  // something that reads as one of them.
  Reopened:         { bg: '#ef6c00', fg: '#ffffff', label: 'Reopened' },
  Cancelled:        { bg: '#546e7a', fg: '#ffffff', label: 'Cancelled' },
};

// The bucket a status string falls into. The register writes the EXACT status
// ("Solved - Report Completed"), so the code is read off the beginning of it —
// and Report Pending is tested BEFORE Solved, or "Solved - Report Pending"
// would come out green, which is the one confusion that matters here.
export function stateBucket(v: unknown): string {
  const t = String(v ?? '').trim();
  if (!t) return '';
  if (/cancel/i.test(t)) return 'Cancelled';
  if (/re-?open/i.test(t)) return 'Reopened';
  if (/report\s*pending/i.test(t)) return 'Report pending';
  if (/unattended/i.test(t)) return 'Unattended';
  if (/unsolved/i.test(t)) return 'Unsolved';
  if (/solved/i.test(t)) return 'Solved';
  return '';
}

export function stateColour(v: unknown): StateColour | null {
  const b = stateBucket(v);
  return b ? STATE_COLOUR[b] ?? null : null;
}

export const STATE_HINT: Record<string, string> = {
  Cancelled: 'Cancelled — the call stands as a record, but nobody is going to it',
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
  const bucket = stateBucket(s) || stateBucket(text);
  const hint = title ?? (STATE_HINT[bucket] ? (text === bucket ? STATE_HINT[bucket] : `${STATE_HINT[bucket]} — ${text}`) : text);
  const c = bucket ? STATE_COLOUR[bucket] : null;
  if (!c) return <span className="badge badge-neutral" title={hint}>{text}</span>;
  return (
    <span className="state-chip" style={{ background: c.bg, color: c.fg }} title={hint}>{text}</span>
  );
}

// ---------------------------------------------------------------------------
// A UCN, COLOURED BY ITS CALL'S STATUS — everywhere a UCN is shown (the user's
// standing rule, 2026-09-06: "applicable for all modules… or ideally anywhere
// a UCN is referenced").
//
// One component so the code cannot drift between registers. Where the status
// is not known — a spare line carries a UCN but not the call's state — it
// renders plainly rather than guessing a colour, because a wrong colour on a
// code people read is worse than no colour.
// ---------------------------------------------------------------------------
export function Ucn({ ucn, state, title }: { ucn: unknown; state?: unknown; title?: string }) {
  const text = String(ucn ?? '').trim();
  if (!text) return <span className="muted">—</span>;
  const c = stateColour(state);
  if (!c) return <span className="ucn-plain">{text}</span>;
  const bucket = stateBucket(state);
  return (
    <span
      className="ucn-chip"
      style={{ background: c.bg, color: c.fg }}
      title={title ?? `${text} — ${STATE_HINT[bucket] ?? bucket}`}
    >
      {text}
    </span>
  );
}

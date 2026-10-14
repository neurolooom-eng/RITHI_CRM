// ---------------------------------------------------------------------------
// Audit logging — records actions, logins, errors and how long each took, to
// the Supabase audit_log table. Identity is stamped server-side (trigger), so
// clients only supply the action details. Fire-and-forget: logging never blocks
// or breaks the action it describes.
// ---------------------------------------------------------------------------
import { getSupabase, supabaseConfigured } from './supabase';

let current: { actor?: string; role?: string; email?: string } = {};
// auth.tsx calls this whenever the signed-in user changes, so logs carry the
// display name + role without an extra round-trip.
export function setAuditUser(u: { actor?: string; role?: string; email?: string } | null) {
  current = u ?? {};
}

export interface AuditEntry {
  action: string;
  target?: string;
  status?: 'ok' | 'error';
  error?: string;
  duration_ms?: number;
  meta?: Record<string, unknown>;
  email?: string; // for anon login attempts
}

function auditRow(entry: AuditEntry) {
  return {
    actor: current.actor ?? '', role: current.role ?? '',
    email: entry.email ?? current.email ?? '',
    action: entry.action, target: entry.target ?? '',
    status: entry.status ?? 'ok', error: (entry.error ?? '').slice(0, 2000),
    duration_ms: entry.duration_ms ?? null, meta: entry.meta ?? {},
  };
}

export function logAudit(entry: AuditEntry): void {
  if (!supabaseConfigured()) return;
  const c = getSupabase(); if (!c) return;
  // Fire-and-forget; swallow logging failures.
  void c.from('audit_log').insert(auditRow(entry)).then(() => {}, () => {});
}

/**
 * The same entry, AWAITED, answering whether it was written: null when it was,
 * the reason when it was not. For the records whose absence matters and must
 * be SAID rather than swallowed — a bulk load, a change of database, the start
 * of a "View as" preview (which must be on record BEFORE the preview's guard
 * goes up, or the guard refuses it). Never throws: the caller decides whether a
 * failed record stops the action or is reported beside it.
 */
export async function recordAudit(entry: AuditEntry): Promise<string | null> {
  if (!supabaseConfigured()) return 'This browser is not connected to the database, so nothing could be recorded.';
  const c = getSupabase(); if (!c) return 'This browser is not connected to the database, so nothing could be recorded.';
  try {
    const { error } = await c.from('audit_log').insert(auditRow(entry));
    return error ? (error.message || 'The audit log refused the entry.') : null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

// Run an async action, recording its outcome + duration to the audit log.
export async function withAudit<T>(action: string, target: string | undefined, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T> {
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  try {
    const res = await fn();
    logAudit({ action, target, status: 'ok', duration_ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start), meta });
    return res;
  } catch (e) {
    logAudit({ action, target, status: 'error', error: e instanceof Error ? e.message : String(e), duration_ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start), meta });
    throw e;
  }
}

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

export function logAudit(entry: AuditEntry): void {
  if (!supabaseConfigured()) return;
  const c = getSupabase(); if (!c) return;
  const row = {
    actor: current.actor ?? '', role: current.role ?? '',
    email: entry.email ?? current.email ?? '',
    action: entry.action, target: entry.target ?? '',
    status: entry.status ?? 'ok', error: (entry.error ?? '').slice(0, 2000),
    duration_ms: entry.duration_ms ?? null, meta: entry.meta ?? {},
  };
  // Fire-and-forget; swallow logging failures.
  void c.from('audit_log').insert(row).then(() => {}, () => {});
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

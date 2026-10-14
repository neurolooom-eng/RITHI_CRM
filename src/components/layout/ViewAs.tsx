import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { ROLES } from '../../lib/rbac';

const rbacLabel = (roleKey?: string) => ROLES.find((r) => r.key === roleKey)?.label ?? roleKey ?? '';

// ===========================================================================
// "View as" — lets a real admin preview the app exactly as another user sees it.
// The list is the real profiles (each carries its actual role), so previewing a
// Hotline / Coordinator shows their access, not an engineer's. Picking a user
// sets the auth context's viewAs identity, which every page honours (role-based
// visibility, permissions, nav).
//
// NOTHING IS WRITTEN, and that is now enforced rather than claimed (D-069):
// while a preview is up, the guard in src/lib/previewGuard.ts — passed to every
// Supabase client as its fetch — refuses every insert, update, delete, upsert,
// volatile function and upload with "View as is a read-only preview — nothing
// is written", through each screen's own error path. Every start and end of a
// preview is recorded in the audit log (viewas.start / viewas.end) with the
// administrator and the person previewed (FRS-212.3).
// ===========================================================================

export function ViewAsControl() {
  const { isAdmin, viewAs, setViewAs, users } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  if (!isAdmin) return null;

  // A start that could not be recorded does not start, and says why.
  const choose = async (u: Parameters<typeof setViewAs>[0]) => {
    const r = await setViewAs(u);
    setErr(r.error ?? '');
    // Kept open when anything went wrong, so the message is read.
    if (r.ok && !r.error) { setOpen(false); setQ(''); }
  };

  const filtered = users
    .filter((u) => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return `${u.fullName} ${u.email} ${u.region ?? ''} ${u.rbacRole ?? ''}`.toLowerCase().includes(s);
    })
    .sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email))
    .slice(0, 60);

  return (
    <div className="viewas">
      <button
        className={`btn btn-ghost btn-sm ${viewAs ? 'viewas-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Preview the app as another user sees it"
      >
        👁<span className="viewas-label">&nbsp;{viewAs ? `As: ${viewAs.fullName}` : 'View as'}</span>
      </button>
      {open && (
        <>
          <div className="viewas-backdrop" onClick={() => setOpen(false)} />
          <div className="viewas-panel">
            <div className="viewas-head">Preview as user</div>
            <input className="input" autoFocus placeholder="Search name, ID, region, role…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="viewas-list">
              {filtered.map((u) => {
                const active = viewAs?.email?.toLowerCase() === u.email.toLowerCase();
                const roleLabel = rbacLabel(u.rbacRole);
                return (
                  <button key={u.id} className={`viewas-item ${active ? 'viewas-item-active' : ''}`} onClick={() => { void choose(u); }}>
                    <span className="viewas-item-name">{u.fullName || u.email}</span>
                    <span className="viewas-item-id">{u.email || '(no id)'}{roleLabel ? ` · ${roleLabel}` : ''}{u.region ? ` · ${u.region}` : ''}</span>
                  </button>
                );
              })}
              {filtered.length === 0 && <div className="muted viewas-note">No users match.</div>}
            </div>
            {err && <div className="viewas-note" role="alert">{err}</div>}
            {viewAs && <button className="btn btn-sm viewas-exit" onClick={() => { void choose(null); }}>Exit preview</button>}
          </div>
        </>
      )}
    </div>
  );
}

export function ViewAsBanner() {
  const { viewAs, setViewAs } = useAuth();
  if (!viewAs) return null;
  const roleLabel = rbacLabel(viewAs.rbacRole) || 'user';
  return (
    <div className="viewas-banner">
      <span>👁 Viewing as <b>{viewAs.fullName}</b><span className="muted">&nbsp;· {viewAs.email} · {roleLabel} view</span></span>
      <button className="btn btn-sm" onClick={() => { void setViewAs(null).then((r) => { if (r.error) window.alert(r.error); }); }}>Exit preview</button>
    </div>
  );
}

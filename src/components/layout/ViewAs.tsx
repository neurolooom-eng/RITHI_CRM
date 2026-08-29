import { useState } from 'react';
import { useAuth, type User } from '../../lib/auth';
import { listUsers, dataConfigured } from '../../lib/sheets';

// ===========================================================================
// "View as" — lets a real admin preview the app exactly as an engineer sees it.
// Picking an engineer sets the auth context's viewAs identity, which every page
// honours (role-based call visibility, permissions, nav). Nothing is written as
// the engineer — this is a read-only preview the admin exits at any time.
// ===========================================================================

function rowToViewUser(r: Record<string, unknown>): User {
  const email = String(r['Email ID'] || r['GMAIL ID'] || '');
  return {
    id: 'viewas:' + email,
    username: email.toLowerCase(),
    fullName: String(r['User Name'] || email),
    email,
    role: 'engineer',
    passwordHash: '',
    active: true,
    createdAt: '',
    updatedAt: '',
    authSource: 'sheet',
    region: String(r['REGION'] || ''),
    designation: String(r['Designation'] || ''),
    reportingManager: String(r['RM'] || ''),
    regionalManager: String(r['RGM'] || ''),
  } as User;
}

export function ViewAsControl() {
  const { isAdmin, viewAs, setViewAs } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!isAdmin) return null;

  const load = async () => {
    if (rows) return;
    if (!dataConfigured()) { setErr('Connect the database to list engineers.'); return; }
    setBusy(true); setErr('');
    try { setRows(await listUsers('', 1000)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const toggle = () => { setOpen((o) => !o); if (!rows) void load(); };

  const filtered = (rows ?? []).filter((r) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return ['User Name', 'Email ID', 'GMAIL ID', 'REGION', 'Designation'].some((k) => String(r[k] ?? '').toLowerCase().includes(s));
  }).slice(0, 60);

  return (
    <div className="viewas">
      <button
        className={`btn btn-ghost btn-sm ${viewAs ? 'viewas-active' : ''}`}
        onClick={toggle}
        title="Preview the app as an engineer sees it"
      >
        👁<span className="viewas-label">&nbsp;{viewAs ? `As: ${viewAs.fullName}` : 'View as'}</span>
      </button>
      {open && (
        <>
          <div className="viewas-backdrop" onClick={() => setOpen(false)} />
          <div className="viewas-panel">
            <div className="viewas-head">Preview as engineer</div>
            <input className="input" autoFocus placeholder="Search name, ID, region…" value={q} onChange={(e) => setQ(e.target.value)} />
            {busy && <div className="muted viewas-note">Loading users…</div>}
            {err && <div className="field-err">{err}</div>}
            <div className="viewas-list">
              {filtered.map((r, i) => {
                const email = String(r['Email ID'] || r['GMAIL ID'] || '');
                const active = viewAs?.email?.toLowerCase() === email.toLowerCase();
                return (
                  <button key={i} className={`viewas-item ${active ? 'viewas-item-active' : ''}`} onClick={() => { setViewAs(rowToViewUser(r)); setOpen(false); setQ(''); }}>
                    <span className="viewas-item-name">{String(r['User Name'] || email)}</span>
                    <span className="viewas-item-id">{email || '(no id)'}{r['REGION'] ? ` · ${String(r['REGION'])}` : ''}</span>
                  </button>
                );
              })}
              {rows && filtered.length === 0 && <div className="muted viewas-note">No users match.</div>}
            </div>
            {viewAs && <button className="btn btn-sm viewas-exit" onClick={() => { setViewAs(null); setOpen(false); }}>Exit preview</button>}
          </div>
        </>
      )}
    </div>
  );
}

export function ViewAsBanner() {
  const { viewAs, setViewAs } = useAuth();
  if (!viewAs) return null;
  return (
    <div className="viewas-banner">
      <span>👁 Viewing as <b>{viewAs.fullName}</b><span className="muted">&nbsp;· {viewAs.email} · engineer view</span></span>
      <button className="btn btn-sm" onClick={() => setViewAs(null)}>Exit preview</button>
    </div>
  );
}

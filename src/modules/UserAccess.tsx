import { Fragment, useMemo, useState } from 'react';
import { PageHeader, SectionCard, Drawer } from '../components/ui/ui';
import { useAuth, type User } from '../lib/auth';
import { ACTIONS, ROLES, permsForRole } from '../lib/rbac';
import { updateProfile, sbSendPasswordReset, sbAdminCreateUser, supabaseConfigured } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import './fieldcalls.css';

// ===========================================================================
// USER ACCESS — map each user to a Role, plus optional per-user Additional
// access (actions granted beyond the role). Admin-only; writes profiles.role
// and profiles.extra_permissions in Supabase.
// ===========================================================================

const roleLabel = (key?: string) => ROLES.find((r) => r.key === key)?.label ?? key ?? '—';

export function UserAccess() {
  const { users, can, rolePerms, reloadUsers } = useAuth();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<User | null>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  // Email the user a reset link. Admins never see or set someone else's
  // password — only the account holder chooses it, from the link.
  const sendReset = async (u: User) => {
    if (!supabaseConfigured()) { setMsg({ tone: 'error', text: 'Connect the database first.' }); return; }
    if (!confirm(`Email a password-reset link to ${u.email}?`)) return;
    setResetting(u.id); setMsg(null);
    const res = await sbSendPasswordReset(u.email);
    setResetting(null);
    logAudit({ action: 'user.password.reset_link', target: u.email, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error });
    setMsg(res.ok
      ? { tone: 'ok', text: `Reset link sent to ${u.email}. It expires after a short while and can be used once.` }
      : { tone: 'error', text: res.error ?? 'Could not send the reset link.' });
  };

  if (!can('users.manage')) return <div style={{ padding: 24 }} className="muted">You don’t have permission to manage users.</div>;

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = [...users].sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email));
    return s ? list.filter((u) => `${u.fullName} ${u.email} ${u.rbacRole}`.toLowerCase().includes(s)) : list;
  }, [users, q]);

  return (
    <div>
      <PageHeader title="User Access" subtitle="Map users to roles and grant extra access where needed." icon="👥"
        actions={<button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add User</button>} />
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      <SectionCard title={`Users (${users.length})`}>
        <input className="input" placeholder="Search name / email / role…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, maxWidth: 360 }} />
        <div className="assoc-scroll">
          <table className="assoc-table" style={{ minWidth: 640 }}>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Extra access</th><th></th><th></th></tr></thead>
            <tbody>
              {visible.map((u) => (
                <tr key={u.id}>
                  <td>{u.fullName || '—'}</td>
                  <td>{u.email}</td>
                  <td><span className="badge badge-neutral">{roleLabel(u.rbacRole)}</span></td>
                  <td>{u.extraPermissions?.length ? `${u.extraPermissions.length} extra` : '—'}</td>
                  <td><button className="btn btn-sm" onClick={() => setEdit(u)}>Edit</button></td>
                  <td>
                    <button className="btn btn-sm" disabled={resetting === u.id || !u.email}
                      onClick={() => void sendReset(u)}>
                      {resetting === u.id ? 'Sending…' : 'Reset password'}
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={6} className="muted">No users match.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="muted rep-hint" style={{ marginTop: 8 }}>
          Users appear here once they’ve signed in (a Supabase Auth account exists). Role permissions are set in <b>Roles &amp; Permissions</b>.
          <b> Reset password</b> emails the user a one-time link — nobody, admins included, can read or set another person’s password.
        </div>
      </SectionCard>

      {edit && (
        <EditUser
          user={edit}
          rolePerms={rolePerms}
          onClose={() => setEdit(null)}
          onSaved={async (text) => { setEdit(null); setMsg({ tone: 'ok', text }); await reloadUsers(); }}
          onError={(text) => setMsg({ tone: 'error', text })}
        />
      )}

      {adding && (
        <AddUser
          onClose={() => setAdding(false)}
          onSaved={async (text) => { setAdding(false); setMsg({ tone: 'ok', text }); await reloadUsers(); }}
          onInfo={(text) => setMsg({ tone: 'info', text })}
          onError={(text) => setMsg({ tone: 'error', text })}
        />
      )}
    </div>
  );
}

const DEFAULT_NEW_PASSWORD = '123456789';

// Create a login from inside the app — no Supabase console, no service key.
// (Needs the project to allow sign-ups and have "Confirm email" off; see the hint.)
function AddUser({ onClose, onSaved, onInfo, onError }: {
  onClose: () => void; onSaved: (t: string) => void; onInfo: (t: string) => void; onError: (t: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('engineer');
  const [password, setPassword] = useState(DEFAULT_NEW_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!email.trim()) { setErr('Enter an email.'); return; }
    if (!fullName.trim()) { setErr('Enter the full name.'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    setBusy(true);
    const res = await sbAdminCreateUser({ email, fullName, role, password });
    logAudit({ action: 'user.create', target: email.trim().toLowerCase(), status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error, meta: { role } });
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Could not create the user.'); return; }
    if (res.needsConfirm) {
      onInfo(`${email.trim()} created, but "Confirm email" is ON in Supabase — they must confirm before signing in. Turn it off for instant logins.`);
    } else {
      onSaved(`${fullName.trim()} added. They sign in with this password and can change it under Profile → Password.`);
    }
  };

  return (
    <Drawer open onClose={onClose} title="Add User" width={520}>
      <div className="rep-form">
        <section className="rep-sec">
          <div className="rep-grid">
            <label className="rep-field">
              <span className="field-label">Email *</span>
              <input className="input" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} placeholder="name@airliquide.com" />
            </label>
            <label className="rep-field">
              <span className="field-label">Full name *</span>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="As it should appear" />
            </label>
            <label className="rep-field">
              <span className="field-label">Role</span>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </label>
            <label className="rep-field">
              <span className="field-label">Password</span>
              <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          </div>
          <div className="muted rep-hint">
            The user signs in with this password and changes it under <b>Profile → Password</b>.
            Set it to your region’s default if you like. Creating logins in-app needs Supabase sign-ups enabled and “Confirm email” off.
          </div>
          {err && <div className="field-err" style={{ marginTop: 8 }}>{err}</div>}
        </section>
        <div className="rep-actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
        </div>
      </div>
    </Drawer>
  );
}

function EditUser({ user, rolePerms, onClose, onSaved, onError }: {
  user: User; rolePerms: Record<string, string[]>;
  onClose: () => void; onSaved: (text: string) => void; onError: (text: string) => void;
}) {
  const [role, setRole] = useState(user.rbacRole || 'engineer');
  const [extra, setExtra] = useState<Set<string>>(new Set(user.extraPermissions ?? []));
  const [busy, setBusy] = useState(false);

  const roleGrants = useMemo(() => new Set(permsForRole(role, rolePerms)), [role, rolePerms]);
  const groups = useMemo(() => {
    const g: Record<string, typeof ACTIONS> = {};
    ACTIONS.forEach((a) => { (g[a.group] ??= []).push(a); });
    return Object.entries(g);
  }, []);

  const toggle = (key: string) => setExtra((cur) => { const n = new Set(cur); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const save = async () => {
    if (!supabaseConfigured()) { onError('Connect the database first.'); return; }
    setBusy(true);
    // Don't store extras that the role already grants.
    const extras = [...extra].filter((k) => !roleGrants.has(k));
    const res = await updateProfile(user.id, { role, extra_permissions: extras });
    logAudit({ action: 'user.access.save', target: user.email, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error, meta: { role, extras: extras.length } });
    setBusy(false);
    if (res.ok) onSaved(`Saved ${user.fullName || user.email}: ${roleLabel(role)}${extras.length ? ` + ${extras.length} extra` : ''}.`);
    else onError(res.error ?? 'Save failed.');
  };

  return (
    <Drawer open onClose={onClose} title={`Access — ${user.fullName || user.email}`} width={640}>
      <div className="rep-form">
        <section className="rep-sec">
          <div className="rep-grid">
            <label className="rep-field">
              <span className="field-label">Role</span>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </label>
          </div>
          <div className="muted rep-hint">The role sets the base access. Tick anything extra this user needs on top.</div>
        </section>

        <section className="rep-sec">
          <div className="rep-sec-title">Additional access</div>
          <div className="assoc-scroll">
            <table className="rbac-table" style={{ minWidth: 420 }}>
              <thead><tr><th className="rbac-action">Action</th><th>Via role</th><th>Extra</th></tr></thead>
              <tbody>
                {groups.map(([group, actions]) => (
                  <Fragment key={group}>
                    <tr className="rbac-group"><td colSpan={3}>{group}</td></tr>
                    {actions.map((a) => {
                      const viaRole = roleGrants.has(a.key);
                      return (
                        <tr key={a.key}>
                          <td className="rbac-action"><span>{a.label}</span><code className="muted">{a.key}</code></td>
                          <td className="rbac-cell">{viaRole ? '✓' : ''}</td>
                          <td className="rbac-cell">
                            <input type="checkbox" disabled={viaRole} checked={viaRole || extra.has(a.key)} onChange={() => toggle(a.key)} />
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="rep-actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save access'}</button>
        </div>
      </div>
    </Drawer>
  );
}

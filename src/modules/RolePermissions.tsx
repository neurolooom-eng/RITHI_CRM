import { Fragment, useMemo, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { ACTIONS, ROLES, permsForRole } from '../lib/rbac';
import { setRolePerms, supabaseConfigured } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import './fieldcalls.css';

// ===========================================================================
// ROLES & PERMISSIONS — admin matrix. Each role's allowed actions are toggled
// and saved to Supabase (app_roles). Admin/Super Admin always has everything.
// ===========================================================================

export function RolePermissions() {
  const { can, rolePerms, reloadRoles } = useAuth();
  // Local editable copy: role -> Set(actions).
  const [perms, setPerms] = useState<Record<string, Set<string>>>(() => {
    const out: Record<string, Set<string>> = {};
    ROLES.forEach((r) => { out[r.key] = new Set(permsForRole(r.key, rolePerms)); });
    return out;
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  const groups = useMemo(() => {
    const g: Record<string, typeof ACTIONS> = {};
    ACTIONS.forEach((a) => { (g[a.group] ??= []).push(a); });
    return Object.entries(g);
  }, []);

  if (!can('rbac.manage')) return <div style={{ padding: 24 }} className="muted">You don't have permission to manage roles.</div>;

  const has = (role: string, action: string) => role === 'admin' || perms[role]?.has(action);
  const toggle = (role: string, action: string) => {
    if (role === 'admin') return; // admin is always all-on
    setPerms((cur) => {
      const next = { ...cur, [role]: new Set(cur[role]) };
      if (next[role].has(action)) next[role].delete(action); else next[role].add(action);
      return next;
    });
  };

  const save = async () => {
    if (!supabaseConfigured()) { setMsg({ tone: 'error', text: 'Connect the database first.' }); return; }
    setBusy(true); setMsg({ tone: 'info', text: 'Saving…' });
    try {
      for (const r of ROLES) {
        const list = r.key === 'admin' ? ACTIONS.map((a) => a.key) : [...(perms[r.key] ?? [])];
        const res = await setRolePerms(r.key, list, r.label);
        if (!res.ok) { setMsg({ tone: 'error', text: `Save failed for ${r.label}: ${res.error}` }); setBusy(false); return; }
      }
      await reloadRoles();
      logAudit({ action: 'rbac.save', status: 'ok', meta: { roles: ROLES.length } });
      setMsg({ tone: 'ok', text: 'Permissions saved. They apply on each user’s next action / reload.' });
    } catch (e) {
      setMsg({ tone: 'error', text: `Save failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Roles & Permissions" subtitle="Set what each role can do. Admin / Super Admin always has full access." icon="🔐" />
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <SectionCard title="Permission matrix">
        <div className="rbac-scroll">
          <table className="rbac-table">
            <thead>
              <tr>
                <th className="rbac-action">Action</th>
                {ROLES.map((r) => <th key={r.key} title={r.key}>{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, actions]) => (
                <Fragment key={group}>
                  <tr className="rbac-group"><td colSpan={ROLES.length + 1}>{group}</td></tr>
                  {actions.map((a) => (
                    <tr key={a.key}>
                      <td className="rbac-action"><span>{a.label}</span><code className="muted">{a.key}</code></td>
                      {ROLES.map((r) => (
                        <td key={r.key} className="rbac-cell">
                          <input type="checkbox" checked={!!has(r.key, a.key)} disabled={r.key === 'admin'} onChange={() => toggle(r.key, a.key)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rep-actions">
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save permissions'}</button>
        </div>
      </SectionCard>
    </div>
  );
}

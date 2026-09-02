import { Fragment, useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { ACTIONS, ROLES, PERM_TREE, permsForRole, moduleAction, masterAction, masterListActions, dynamicActionLabel,
  type PermHeader, type PermPage } from '../lib/rbac';
import { setRolePerms, listMasterLists, supabaseConfigured, type MasterList } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import './fieldcalls.css';

// ===========================================================================
// ROLES & PERMISSIONS — the matrix, grouped the way the app is: header ->
// sub-page -> what you may do on it. Seeing a page ("View") is separate from
// acting on it, and every level collapses, because the flat list of thirty-odd
// actions made "what can this role do in Spare Requests" impossible to read.
//
// Master value lists are listed individually so access can be given list by
// list; a list INHERITS from All Masters unless the role is narrowed to
// specific lists (see can() in auth).
// ===========================================================================

const label = (key: string) => ACTIONS.find((a) => a.key === key)?.label ?? dynamicActionLabel(key) ?? key;

export function RolePermissions() {
  const { can, rolePerms, reloadRoles } = useAuth();
  const [perms, setPerms] = useState<Record<string, Set<string>>>(() => {
    const out: Record<string, Set<string>> = {};
    ROLES.forEach((r) => { out[r.key] = new Set(permsForRole(r.key, rolePerms)); });
    return out;
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [masters, setMasters] = useState<MasterList[]>([]);

  // Collapsed by default at header level would hide everything; start with the
  // headers open and the pages closed, which is the level people scan at.
  const [openHeads, setOpenHeads] = useState<Set<string>>(() => new Set(PERM_TREE.map((h) => h.title)));
  const [openPages, setOpenPages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!supabaseConfigured()) return;
    listMasterLists().then(setMasters).catch(() => setMasters([]));
  }, []);

  // The pages a header actually shows: its own, plus one per master value list
  // where the header carries them.
  const pagesFor = (head: PermHeader): PermPage[] => [
    ...head.pages,
    // Each value list sits directly under Master, as its own page — not nested
    // inside All Masters. Add / edit and delete are grantable per list; both
    // still come free with the global "Edit masters".
    ...(head.lists
      ? masters.map((m) => ({ path: `/masters/${m.key}`, label: `🗂 ${m.label}`, actions: masterListActions(m.key) }))
      : []),
  ];
  const allPageKeys = useMemo(
    () => PERM_TREE.flatMap((h) => pagesFor(h).map((p) => `${h.title}|${p.path}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [masters],
  );
  const expandAll = () => { setOpenHeads(new Set(PERM_TREE.map((h) => h.title))); setOpenPages(new Set(allPageKeys)); };
  const collapseAll = () => { setOpenHeads(new Set()); setOpenPages(new Set()); };
  const toggleIn = (set: Set<string>, k: string) => {
    const next = new Set(set); if (next.has(k)) next.delete(k); else next.add(k); return next;
  };

  if (!can('rbac.manage')) return <div style={{ padding: 24 }} className="muted">You don't have permission to manage roles.</div>;

  const has = (role: string, action: string) => role === 'admin' || !!perms[role]?.has(action);
  const toggle = (role: string, action: string) => {
    if (role === 'admin') return;
    setPerms((cur) => {
      const next = { ...cur, [role]: new Set(cur[role]) };
      if (next[role].has(action)) next[role].delete(action); else next[role].add(action);
      return next;
    });
  };
  // Tick every action on a page for one role in one go.
  const setPage = (role: string, keys: string[], on: boolean) => {
    if (role === 'admin') return;
    setPerms((cur) => {
      const next = { ...cur, [role]: new Set(cur[role]) };
      keys.forEach((k) => { if (on) next[role].add(k); else next[role].delete(k); });
      return next;
    });
  };

  const save = async () => {
    if (!supabaseConfigured()) { setMsg({ tone: 'error', text: 'Connect the database first.' }); return; }
    setBusy(true); setMsg({ tone: 'info', text: 'Saving…' });
    try {
      for (const r of ROLES) {
        const list = r.key === 'admin'
          ? [...ACTIONS.map((a) => a.key),
             ...masters.flatMap((m) => [masterAction(m.key), ...masterListActions(m.key)])]
          : [...(perms[r.key] ?? [])];
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

  const cells = (action: string, kind: '' | 'view' = '') => ROLES.map((r) => (
    <td key={r.key} className="rbac-cell">
      <input type="checkbox" className={kind === 'view' ? 'rbac-view-box' : undefined}
        checked={has(r.key, action)} disabled={r.key === 'admin'}
        onChange={() => toggle(r.key, action)} />
    </td>
  ));

  return (
    <div>
      <PageHeader title="Roles & Permissions" subtitle="What each role can see and do, page by page. Admin / Super Admin always has full access." icon="🔐" />
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <SectionCard title="Permission matrix">
        <div className="rbac-tools">
          <button className="btn btn-sm" onClick={expandAll}>⌄ Expand all</button>
          <button className="btn btn-sm" onClick={collapseAll}>› Collapse all</button>
          <span className="muted" style={{ fontSize: 12 }}>
            <b>View</b> is permission to open the page. The actions under it are what can be done there.
          </span>
        </div>

        <div className="rbac-scroll rbac-scroll-tall">
          <table className="rbac-table rbac-tree">
            <thead>
              <tr>
                <th className="rbac-action">Module / action</th>
                {ROLES.map((r) => <th key={r.key} title={r.key}>{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERM_TREE.map((head) => {
                const headOpen = openHeads.has(head.title);
                const pages = pagesFor(head);
                return (
                  <Fragment key={head.title}>
                    <tr className="rbac-group rbac-head-row" onClick={() => setOpenHeads((s) => toggleIn(s, head.title))}>
                      <td colSpan={ROLES.length + 1}>
                        <span className="rbac-caret">{headOpen ? '⌄' : '›'}</span> {head.title}
                        <span className="muted"> · {pages.length} page{pages.length === 1 ? '' : 's'}</span>
                      </td>
                    </tr>

                    {headOpen && pages.map((page) => {
                      const pk = `${head.title}|${page.path}`;
                      const pageOpen = openPages.has(pk);
                      const view = page.path ? moduleAction(page.path) : '';
                      const childKeys = [...page.actions];
                      const hasChildren = childKeys.length > 0;
                      return (
                        <Fragment key={pk}>
                          <tr className="rbac-page-row">
                            <td className="rbac-action rbac-page">
                              <button className="rbac-toggle" disabled={!hasChildren}
                                onClick={() => setOpenPages((s) => toggleIn(s, pk))}>
                                <span className="rbac-caret">{hasChildren ? (pageOpen ? '⌄' : '›') : '·'}</span>
                                <b>{page.label}</b>
                              </button>
                              {hasChildren && (
                                <span className="muted rbac-count">
                                  {page.actions.length} action{page.actions.length === 1 ? '' : 's'}
                                </span>
                              )}
                            </td>
                            {view
                              ? cells(view, 'view')
                              : ROLES.map((r) => <td key={r.key} className="rbac-cell muted">—</td>)}
                          </tr>

                          {pageOpen && page.actions.map((a) => (
                            <tr key={a} className="rbac-child">
                              <td className="rbac-action rbac-indent">
                                <span>{label(a)}</span><code className="muted">{a}</code>
                              </td>
                              {cells(a)}
                            </tr>
                          ))}

                          {pageOpen && hasChildren && (
                            <tr className="rbac-child rbac-bulk">
                              <td className="rbac-action rbac-indent muted">Everything on this page</td>
                              {ROLES.map((r) => (
                                <td key={r.key} className="rbac-cell">
                                  <button className="btn btn-ghost btn-sm" disabled={r.key === 'admin'}
                                    title={`Tick every action on ${page.label} for ${r.label}`}
                                    onClick={() => setPage(r.key, [view, ...childKeys].filter(Boolean),
                                      !childKeys.every((k) => has(r.key, k)))}>
                                    {childKeys.every((k) => has(r.key, k)) ? '✕' : '✓'}
                                  </button>
                                </td>
                              ))}
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
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

import { Fragment, useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { SelectPicker } from '../components/ui/SelectPicker';
import { useAuth } from '../lib/auth';
import { ACTIONS, ROLES, PERM_TREE, permsForRole, moduleAction, masterAction, masterListActions, dynamicActionLabel,
  roleKeyFrom, roleProblem, type RoleDef,
  type PermHeader, type PermPage } from '../lib/rbac';
import { setRolePerms, listMasterLists, listRoleRows, createRole, supabaseConfigured, type MasterList } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { xlsxDownload } from '../lib/xlsx';
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
  const { can, user, rolePerms, reloadRoles } = useAuth();
  // THE ROLES ARE THE DATABASE'S, not the code's. ROLES in rbac.ts is the
  // starting set that ships with the app; once a role can be added here, a
  // matrix drawn from the code alone would simply not show it, with no error --
  // the new role would exist, people would be on it, and nobody could see or
  // tune what it holds.
  const [roles, setRoles] = useState<RoleDef[]>(ROLES);
  const refreshRoleList = async () => {
    try {
      const rows = await listRoleRows();
      const seen = new Set(ROLES.map((r) => r.key));
      const extra = rows.filter((r) => !seen.has(r.role)).map((r) => ({ key: r.role, label: r.label }));
      setRoles([...ROLES, ...extra]);
      setPerms((cur) => {
        const next = { ...cur };
        extra.forEach((r) => { if (!next[r.key]) next[r.key] = new Set(permsForRole(r.key, rolePerms)); });
        return next;
      });
    } catch { /* the built-in list still draws the screen */ }
  };
  useEffect(() => { void refreshRoleList(); /* eslint-disable-next-line */ }, [rolePerms]);

  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [cloneFrom, setCloneFrom] = useState('');

  // ===========================================================================
  // THE MATRIX MUST SHOW WHAT IS STORED, AND SAVE ONLY WHAT WAS TOUCHED.
  //
  // Reported 2026-09-23: "Role & Permission are not working."
  //
  // TWO FAULTS, AND THE SECOND DESTROYS WORK. `rolePerms` starts life as
  // DEFAULT_PERMS (auth.tsx) and is replaced when `app_roles` arrives, so a
  // `useState` INITIALISER -- which runs once, at mount -- built this whole
  // matrix from the CODE DEFAULTS whenever the screen was opened before the
  // roles had loaded. Nothing corrected it afterwards, so an administrator was
  // reading the code's idea of each role and believing it was the project's.
  //
  // And `save()` wrote EVERY role, every time. So one tick on a matrix drawn
  // from defaults overwrote all twelve tuned rows with those defaults -- every
  // permission an administrator had ever set, gone, reported as "Permissions
  // saved". That is the whole complaint: changes appear to save and the system
  // then behaves as though nobody had configured anything.
  //
  // THE FIX IS BOTH HALVES, and the second is the one that matters: while
  // nothing has been edited the matrix FOLLOWS the database, and the save
  // writes only the roles somebody actually TOUCHED. Then even if the matrix
  // were showing the wrong thing, an untouched role's stored row is never
  // rewritten -- the same "MERGE, never overwrite" rule the migrations follow.
  // ===========================================================================
  const seedFrom = (config: Record<string, string[]>, list: RoleDef[]) => {
    const out: Record<string, Set<string>> = {};
    list.forEach((r) => { out[r.key] = new Set(permsForRole(r.key, config)); });
    return out;
  };
  const [perms, setPerms] = useState<Record<string, Set<string>>>(() => seedFrom(rolePerms, ROLES));
  // WHICH ROLES THE OPERATOR CHANGED. Not "has anything changed" -- which role,
  // because that is what decides what gets written.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  useEffect(() => {
    // Only while nothing is in progress: re-seeding over somebody's half-made
    // edits would throw them away, which is the other way to lose work here.
    if (touched.size) return;
    setPerms(seedFrom(rolePerms, roles));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolePerms, roles]);
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

  // TWO RIGHTS. `rbac.manage` edits the matrix; `admin.view` only reads it
  // (Technical Support) -- and reading it is exactly how somebody answers "why
  // can this person not see that page?" without being able to change the answer.
  const mayEdit = can('rbac.manage');
  if (!mayEdit && !can('admin.view')) {
    return <div style={{ padding: 24 }} className="muted">You don't have permission to manage roles.</div>;
  }

  const has = (role: string, action: string) => role === 'admin' || !!perms[role]?.has(action);
  const toggle = (role: string, action: string) => {
    if (role === 'admin') return;
    setTouched((cur) => new Set(cur).add(role));
    setPerms((cur) => {
      const next = { ...cur, [role]: new Set(cur[role]) };
      if (next[role].has(action)) next[role].delete(action); else next[role].add(action);
      return next;
    });
  };
  // Tick every action on a page for one role in one go.
  const setPage = (role: string, keys: string[], on: boolean) => {
    if (role === 'admin') return;
    setTouched((cur) => new Set(cur).add(role));
    setPerms((cur) => {
      const next = { ...cur, [role]: new Set(cur[role]) };
      keys.forEach((k) => { if (on) next[role].add(k); else next[role].delete(k); });
      return next;
    });
  };


  // ---- exporting the matrix -----------------------------------------------
  // The user, 2026-09-16: "Add a Provision to Export the Permission matrix."
  //
  // The matrix is read to answer "who can do what", and it is read AWAY from
  // this screen — in a review, beside an audit finding, against last quarter's
  // copy. So the file has to carry the three things the screen says implicitly
  // and a spreadsheet cannot:
  //
  //   1. ADMIN IS ALWAYS FULL. Its boxes are ticked and disabled here, which is
  //      obvious on screen and reads as "somebody ticked 400 boxes" in a file.
  //   2. A ROLE WITH AN EMPTY STORED SET IS NOT A ROLE WITH NO PERMISSIONS.
  //      `permsForRole()` returns the stored set only while it is non-empty and
  //      otherwise falls back to the ENGINEER defaults, so such a role's row
  //      here shows something the database does not contain. Exporting that
  //      without saying so produces a document that is wrong in the most
  //      expensive direction: it would be read as evidence of what is granted.
  //   3. UNSAVED TICKS. This screen holds its edits in local state. Exporting
  //      mid-edit is legitimate — it is how somebody reviews a change before
  //      committing it — but the file must say which it is.
  //
  // Everything else follows the reports already here: xlsx, dated in the
  // filename, and a sheet that says how to read it rather than a README nobody
  // gets sent.
  const exportMatrix = () => {
    const when = new Date();
    const stamp = when.toISOString().slice(0, 10);

    // WHERE EACH ROLE'S ROW COMES FROM. Computed rather than assumed: it is the
    // one thing about this matrix that is not visible on the screen it is taken
    // from.
    const provenance = (key: string): string => {
      if (key === 'admin') return 'Always full — not stored, and cannot be changed';
      const stored = rolePerms[key];
      return stored && stored.length
        ? 'Stored in the database'
        : 'NOT CONFIGURED — showing the Engineer fallback, which is what these users actually get';
    };
    const edited = roles.some((r) => {
      if (r.key === 'admin') return false;
      const now = [...(perms[r.key] ?? [])].sort().join('|');
      return now !== [...permsForRole(r.key, rolePerms)].sort().join('|');
    });

    // One row per grantable thing, in the order the screen shows them — so the
    // file can be read beside the screen without hunting.
    const matrix: Record<string, unknown>[] = [];
    PERM_TREE.forEach((head) => {
      pagesFor(head).forEach((page) => {
        const view = page.path ? moduleAction(page.path) : '';
        const row = (what: string, key: string) => {
          const r: Record<string, unknown> = {
            Group: head.title,
            Page: page.label.replace(/^🗂 /, ''),
            Route: page.path || '(not a page)',
            Grants: what,
            'Permission key': key,
          };
          roles.forEach((x) => { r[x.label] = has(x.key, key) ? 'Yes' : 'No'; });
          matrix.push(r);
        };
        // THE PAGE KEY IS THE ROUTE, and opening a page is a different right
        // from acting on it — which is the distinction the whole tree exists to
        // make, so it is a row of its own rather than a column.
        if (view) row('Open the page', view);
        page.actions.forEach((a) => row(label(a), a));
      });
    });

    const columns = ['Group', 'Page', 'Route', 'Grants', 'Permission key', ...roles.map((r) => r.label)];

    xlsxDownload(`permission-matrix-${stamp}.xlsx`, [
      { name: 'Matrix', columns, rows: matrix },
      {
        name: 'Roles',
        columns: ['Role', 'Key', 'Permissions held', 'Where this row comes from'],
        rows: roles.map((r) => ({
          Role: r.label,
          Key: r.key,
          'Permissions held': r.key === 'admin' ? 'every one' : (perms[r.key]?.size ?? 0),
          'Where this row comes from': provenance(r.key),
        })),
      },
      {
        name: 'How to read this',
        // NAMED COLUMNS, because `buildXlsx` looks each cell up BY the column
        // name (`row[h]`). Two columns both called '' read the same key twice,
        // so the second column would have come out empty on every row — a sheet
        // of headings with nothing beside them, which is worse than no sheet.
        columns: ['About this export', 'Detail'],
        rows: [
          { 'About this export': 'Taken from', Detail: 'Roles & Permissions, RITHI CRM' },
          { 'About this export': 'Taken on', Detail: when.toLocaleString() },
          { 'About this export': 'Taken by', Detail: user?.fullName || user?.email || 'not recorded' },
          { 'About this export': 'State',
            Detail: edited
              ? 'UNSAVED — this shows what is on screen, including changes not yet saved to the database'
              : 'Saved — this matches the database as it was read' },
          { 'About this export': 'Opening a page vs acting on it',
            Detail: 'Granted separately. The "Open the page" row is the module key — and the module key IS the route, so renaming a route is a permissions change.' },
          { 'About this export': 'Admin',
            Detail: 'Admin always holds everything. It is not stored as a list and cannot be edited, so its Yes column is a statement about the role rather than 400 ticked boxes. Super Admin is not a role at all and cannot be granted.' },
          { 'About this export': 'A role marked NOT CONFIGURED',
            Detail: 'Its stored permission list is EMPTY — and an empty list does not mean "no permissions". The system falls back to the Engineer defaults, so the Yes columns for that role are that fallback, which is what its users actually get. Granting it anything writes a real list and turns the fallback off.' },
          { 'About this export': 'Master value lists',
            Detail: 'Each list is grantable on its own and also comes free with the global "Edit masters" right, so a role can reach a list without a Yes against it here.' },
        ],
      },
    ]);
    logAudit({
      action: 'rbac.export', status: 'ok',
      meta: { roles: roles.length, rows: matrix.length, unsaved: edited },
    });
    setMsg({
      tone: edited ? 'info' : 'ok',
      text: edited
        ? `Exported ${matrix.length} permissions across ${roles.length} roles — including your UNSAVED changes. The file says so on its "How to read this" sheet.`
        : `Exported ${matrix.length} permissions across ${roles.length} roles.`,
    });
  };

  // ---- adding a role ------------------------------------------------------
  // ALWAYS A COPY OF AN EXISTING ROLE, and that is not a convenience. has_perm()
  // falls back to the ENGINEER's permissions for a role whose row is an empty
  // array (0008), so a role created with nothing does not grant nothing -- it
  // silently grants an engineer's writes to everyone put on it. Requiring a
  // source makes the empty role impossible instead of documenting the trap.
  const newKey = roleKeyFrom(newLabel);
  const addRole = async () => {
    const problem = roleProblem(newKey, newLabel, roles.map((r) => r.key), cloneFrom);
    if (problem) { setMsg({ tone: 'error', text: problem }); return; }
    const source = cloneFrom === 'admin'
      ? [...ACTIONS.map((a) => a.key), ...masters.flatMap((m) => [masterAction(m.key), ...masterListActions(m.key)])]
      : [...(perms[cloneFrom] ?? [])];
    setBusy(true); setMsg({ tone: 'info', text: 'Adding…' });
    const res = await createRole(newKey, newLabel.trim(), source);
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: `Could not add the role: ${res.error}` }); return; }
    logAudit({ action: 'rbac.role.add', target: newKey, status: 'ok', meta: { cloned_from: cloneFrom, permissions: source.length } });
    await reloadRoles();
    await refreshRoleList();
    // A NEW ROLE IS TOUCHED BY DEFINITION: it has no stored row to leave alone,
    // and `createRole` has already written one, so Save must carry the edits.
    setTouched((cur) => new Set(cur).add(newKey));
    setPerms((cur) => ({ ...cur, [newKey]: new Set(source) }));
    setAdding(false); setNewLabel(''); setCloneFrom('');
    setMsg({ tone: 'ok', text: `Added "${newLabel.trim()}" (${newKey}) with ${cloneFrom}'s ${source.length} permissions. Untick what it should not have, then Save.` });
  };

  const save = async () => {
    if (!supabaseConfigured()) { setMsg({ tone: 'error', text: 'Connect the database first.' }); return; }
    setBusy(true); setMsg({ tone: 'info', text: 'Saving…' });
    try {
      // ONLY WHAT WAS TOUCHED. This wrote every role on every save, so one tick
      // on a matrix that had been drawn from the code defaults replaced all
      // twelve tuned rows with those defaults -- and said "Permissions saved".
      // A role nobody edited is now left exactly as it is, which is the same
      // rule the migrations follow when they grant a key.
      const toWrite = roles.filter((r) => r.key !== 'admin' && touched.has(r.key));

      // ADMIN IS COMPUTED, NOT EDITED, so it is re-asserted whenever it has
      // fallen behind -- a new action added to the code reaches the DATABASE
      // policies only through `app_roles`, and `has_perm()` reads that row.
      // It is safe to overwrite BECAUSE nobody can edit it here: the column is
      // disabled, so the computed list is the only thing it could ever hold.
      // Dropping this with the every-role loop would have been a quiet
      // regression the day somebody added an action.
      const adminList = [...ACTIONS.map((a) => a.key),
                         ...masters.flatMap((m) => [masterAction(m.key), ...masterListActions(m.key)])];
      const key = (xs: string[]) => [...new Set(xs)].sort().join('\u0000');
      if (key(adminList) !== key(rolePerms.admin ?? [])) {
        const res = await setRolePerms('admin', adminList, 'Admin');
        if (!res.ok) { setMsg({ tone: 'error', text: `Save failed for Admin: ${res.error}` }); setBusy(false); return; }
      }

      // AN EMPTY SET IS NOT "NO PERMISSIONS", IT IS "NOT CONFIGURED", and
      // `permsForRole` turns the code fallback back ON for such a role -- so
      // saving one would grant the engineer defaults to whoever holds it, which
      // is the opposite of what unticking everything looks like it does. It is
      // refused with the reason rather than written.
      const emptied = toWrite.filter((r) => (perms[r.key]?.size ?? 0) === 0);
      if (emptied.length) {
        setMsg({ tone: 'error', text: `${emptied.map((r) => r.label).join(', ')} would be left with NO permissions ticked. `
          + 'An empty role means "not configured" and falls back to the built-in defaults, which is not what unticking everything looks like it does — tick at least one, or remove the role.' });
        setBusy(false); return;
      }

      if (!toWrite.length) {
        await reloadRoles();
        setMsg({ tone: 'info', text: 'Nothing was changed, so nothing was written.' });
        setBusy(false); return;
      }

      for (const r of toWrite) {
        const res = await setRolePerms(r.key, [...(perms[r.key] ?? [])], r.label);
        if (!res.ok) { setMsg({ tone: 'error', text: `Save failed for ${r.label}: ${res.error}` }); setBusy(false); return; }
      }
      await reloadRoles();
      setTouched(new Set());
      logAudit({ action: 'rbac.save', status: 'ok', meta: { roles: toWrite.map((r) => r.key) } });
      setMsg({ tone: 'ok', text: `Saved ${toWrite.length} role${toWrite.length === 1 ? '' : 's'}: ${toWrite.map((r) => r.label).join(', ')}. `
        + 'They apply on each user’s next action / reload.' });
    } catch (e) {
      setMsg({ tone: 'error', text: `Save failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  const cells = (action: string, kind: '' | 'view' = '') => roles.map((r) => (
    <td key={r.key} className="rbac-cell">
      <input type="checkbox" className={kind === 'view' ? 'rbac-view-box' : undefined}
        checked={has(r.key, action)} disabled={!mayEdit || r.key === 'admin'}
        onChange={() => toggle(r.key, action)} />
    </td>
  ));

  return (
    <div>
      <PageHeader title="Roles & Permissions" subtitle="What each role can see and do, page by page. Admin always has full access, and so does a Super Admin — which is not a role and cannot be granted here." icon="🔐" />
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {mayEdit && (
        <SectionCard title="Roles">
          <div className="rbac-addrole">
            {!adding ? (
              <button className="btn btn-sm" onClick={() => setAdding(true)}>＋ Add a role</button>
            ) : (
              <>
                <label className="field">
                  <span className="field-label">Role name</span>
                  <input className="input" value={newLabel} autoFocus
                    onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Regional Coordinator" />
                  {newLabel.trim() && <span className="muted rbac-addrole-key">Key: <code>{newKey || '—'}</code> — this is what the database stores, and it cannot be changed later.</span>}
                </label>
                <label className="field">
                  <span className="field-label">Copy permissions from</span>
                  <SelectPicker value={cloneFrom} onChange={setCloneFrom} placeholder="— pick a role to copy —"
                    options={roles.map((r) => ({ value: r.key, label: r.label }))} />
                  <span className="muted rbac-addrole-key">
                    A new role must start from an existing one. A role holding NOTHING does not grant nothing —
                    it falls back to an <b>Engineer</b>&rsquo;s permissions, which is the opposite of what an empty
                    role looks like. Copy the closest role, then untick what this one should not have.
                  </span>
                </label>
                <div className="rbac-addrole-btns">
                  <button className="btn btn-primary btn-sm" onClick={() => void addRole()} disabled={busy}>Add role</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setNewLabel(''); setCloneFrom(''); }}>Cancel</button>
                </div>
              </>
            )}
          </div>
          <p className="muted rbac-addrole-note">
            A role is never deleted from here: people may be on it, and removing it would drop them to the
            engineer fallback without telling anybody. Untick everything it holds instead, or move its users first.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Permission matrix">
        <div className="rbac-tools">
          <button className="btn btn-sm" onClick={expandAll}>⌄ Expand all</button>
          <button className="btn btn-sm" onClick={collapseAll}>› Collapse all</button>
          {/* AVAILABLE TO A READ-ONLY VIEWER TOO. Reading this matrix is how
              somebody answers "why can this person not see that page?", and
              that reader is exactly the one who needs to take it away with
              them — `admin.view` holds it without `rbac.manage`. */}
          <button className="btn btn-sm" onClick={exportMatrix}
            title="Download the whole matrix — every role against every permission — as a spreadsheet">
            ⭳ Export matrix
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            <b>View</b> is permission to open the page. The actions under it are what can be done there.
          </span>
        </div>

        <div className="rbac-scroll rbac-scroll-tall">
          <table className="rbac-table rbac-tree">
            <thead>
              <tr>
                <th className="rbac-action">Module / action</th>
                {roles.map((r) => <th key={r.key} title={r.key}>{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERM_TREE.map((head) => {
                const headOpen = openHeads.has(head.title);
                const pages = pagesFor(head);
                return (
                  <Fragment key={head.title}>
                    <tr className="rbac-group rbac-head-row" onClick={() => setOpenHeads((s) => toggleIn(s, head.title))}>
                      <td colSpan={roles.length + 1}>
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
                              : roles.map((r) => <td key={r.key} className="rbac-cell muted">—</td>)}
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
                              {roles.map((r) => (
                                <td key={r.key} className="rbac-cell">
                                  <button className="btn btn-ghost btn-sm" disabled={!mayEdit || r.key === 'admin'}
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
          {mayEdit
            ? <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save permissions'}</button>
            : <span className="muted">You can read this matrix but not change it.</span>}
        </div>
      </SectionCard>
    </div>
  );
}

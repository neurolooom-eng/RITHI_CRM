import { Fragment, useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox, Drawer, Modal } from '../components/ui/ui';
import { useAuth, type User } from '../lib/auth';
import { ROLES, ACTIONS, permsForRole } from '../lib/rbac';
import { csvExport, statusBadge } from '../lib/format';
import { listUsers, dataConfigured } from '../lib/sheets';
import {
  listDirectory, saveDirectoryRow, deleteDirectoryRow, updateProfile, sbAdminCreateUser, sbAdminResetPassword, userActivity,
  supabaseConfigured, type DirectoryRow, type UserActivity,
} from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { generatePassword } from '../lib/password';
import './fieldcalls.css';

// ===========================================================================
// USER MASTER — the directory of everyone, whether or not they have ever
// signed in. Administrators add people, edit them, and set the **role** each
// one gets (0033_user_directory_role.sql): the role lands on their profile the
// first time they sign in, and for someone already signed in it is applied to
// their profile straight away, so User Access agrees with this screen.
// Editing is one mode for the whole table: ✎ Edit turns every cell into an
// input, one Save writes every row that changed (each row on its own, so a
// failure names the person), and Cancel drops the lot. Rows that will be
// written are marked Edited. The drawer (⋯, and + New User) is the same fields
// in a form, for one person at a time.
// Without a database (sheet source) the screen stays the read-only browse.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

const VALIDITY_TONES = { TRUE: 'success', FALSE: 'neutral' } as const;
const roleLabel = (key: string) => ROLES.find((r) => r.key === key)?.label ?? (key || '—');

const emptyRow = (): DirectoryRow => ({
  id: 0, name: '', email: '', gmail: '', designation: '',
  reporting_manager: '', regional_manager: '', region: '', role: '', validity: true,
  address: '', city: '', state: '', phone: '',
});

export function UserMasterView() {
  const { users, can, reloadUsers } = useAuth();
  const live = supabaseConfigured();
  const editable = live && can('users.manage');

  const [q, setQ] = useState('');
  const [dir, setDir] = useState<DirectoryRow[]>([]);
  const [sheetRows, setSheetRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<DirectoryRow | null>(null);   // the drawer (new user)
  // One Edit for the whole table: every row becomes editable, and one Save
  // writes everything that changed. `drafts` holds the values as typed, keyed
  // by row id; a row with no draft is untouched.
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, DirectoryRow>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    dataConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load the User Master.' },
  );

  // Who has actually signed in — a profile exists — and with which role.
  const profileByEmail = useMemo(() => {
    const m = new Map<string, { role: string; id: string }>();
    users.forEach((u) => { if (u.email) m.set(u.email.toLowerCase(), { role: u.rbacRole ?? '', id: u.id }); });
    return m;
  }, [users]);
  // The full login profile behind a directory row (for access / clone / data).
  const userByEmail = useMemo(() => {
    const m = new Map<string, User>();
    users.forEach((u) => { if (u.email) m.set(u.email.toLowerCase(), u); });
    return m;
  }, [users]);
  const profileFor = (r: DirectoryRow): User | undefined =>
    userByEmail.get((r.email || '').toLowerCase()) ?? userByEmail.get((r.gmail || '').toLowerCase());

  const [accessFor, setAccessFor] = useState<User | null>(null);   // role + extra permissions
  const [dataFor, setDataFor] = useState<User | null>(null);       // everything this user entered
  const [viewRow, setViewRow] = useState<DirectoryRow | null>(null); // click a row → full record + actions
  // A reset password, shown ONCE so it can be passed on. Held in state and
  // nowhere else — not logged, not stored, gone when this modal closes.
  const [resetPw, setResetPw] = useState<{ email: string; name: string; password: string } | null>(null);

  // The `edit` drawer is the single create/edit place. For a NEW user it can
  // also create the sign-in login; a Clone pre-loads a source's permissions.
  const [mkLogin, setMkLogin] = useState(false);       // create a login on save (new only)
  const [pwd, setPwd] = useState('123456789');         // that login's starting password
  const [cloneSrc, setCloneSrc] = useState<User | null>(null); // clone permissions from this login
  const [dataAccess, setDataAccess] = useState(false); // clone Permissions + Data (grants data.view_all)

  const openNew = () => { setCloneSrc(null); setDataAccess(false); setPwd('123456789'); setMkLogin(true); setEdit(emptyRow()); };
  const openClone = (src: User) => { setCloneSrc(src); setDataAccess(false); setPwd('123456789'); setMkLogin(true); setEdit({ ...emptyRow(), role: src.rbacRole || 'engineer' }); };
  const openEdit = (r: DirectoryRow) => { setCloneSrc(null); setMkLogin(false); setEdit({ ...r }); };

  const load = async (query = q) => {
    if (!dataConfigured()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Loading users…' });
    try {
      if (live) {
        const rows = await listDirectory();
        setDir(rows);
        setMsg({ tone: rows.length ? 'ok' : 'info', text: rows.length ? `${rows.length} users.` : 'No users in the directory yet.' });
      } else {
        const r = await listUsers(query.trim(), 300);
        setSheetRows(r.map((u, i) => ({ ...u, id: `${String(u['Email ID'] || u['GMAIL ID'] || u['User Name'] || i)}-${i}` })));
        setMsg({ tone: r.length ? 'ok' : 'info', text: r.length ? `${r.length} users${r.length >= 300 ? ' (first 300 — refine search)' : ''}.` : 'No users matched.' });
      }
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Write one row, and put its role on the person's sign-in if they have one.
  // Returns what happened so a bulk save can report per row.
  const persist = async (row: DirectoryRow): Promise<{ ok: boolean; error?: string; note?: string }> => {
    const name = row.name.trim();
    if (!name) return { ok: false, error: 'A user needs a name — it is what calls are allotted to.' };
    const isNew = row.id === 0;
    const res = await saveDirectoryRow(isNew ? null : row.id, {
      name, email: row.email.trim(), gmail: row.gmail.trim(), designation: row.designation.trim(),
      reporting_manager: row.reporting_manager.trim(), regional_manager: row.regional_manager.trim(),
      region: row.region.trim(), role: row.role, validity: row.validity,
      address: row.address.trim(), city: row.city.trim(), state: row.state.trim(), phone: row.phone.trim(),
    });
    logAudit({ action: isNew ? 'user.directory.add' : 'user.directory.edit', target: name, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error });
    if (!res.ok) return { ok: false, error: res.error ?? 'Could not save that user.' };

    // Already signed in? Apply the role to their profile now, so this screen and
    // User Access never disagree. (A new joiner picks it up on first sign-in.)
    let note = '';
    const signedIn = profileByEmail.get(row.email.trim().toLowerCase()) ?? profileByEmail.get(row.gmail.trim().toLowerCase());
    if (row.role && signedIn && signedIn.role !== row.role) {
      const r = await updateProfile(signedIn.id, { role: row.role });
      if (r.ok) { await reloadUsers(); note = 'role applied to their sign-in now'; }
      else note = `their sign-in keeps ${roleLabel(signedIn.role)} — ${r.error ?? 'the role could not be changed'}`;
    } else if (row.role && !signedIn) {
      note = `gets ${roleLabel(row.role)} on first sign-in`;
    }
    return { ok: true, note };
  };

  // The drawer's Save / Add. A NEW user optionally creates the sign-in login
  // too (with cloned permissions when opened via Clone); then the directory row
  // is written. An edit just writes the directory row.
  const save = async (row: DirectoryRow) => {
    setBusy(true);
    const isNew = row.id === 0;
    let loginNote = '';
    if (isNew && mkLogin) {
      const email = (row.email.trim() || row.gmail.trim());
      if (!email) { setMsg({ tone: 'error', text: 'A login needs an email — enter the Air Liquide or Gmail ID.' }); setBusy(false); return; }
      const extras = cloneSrc ? [...(cloneSrc.extraPermissions ?? [])] : [];
      if (dataAccess && !extras.includes('data.view_all')) extras.push('data.view_all');
      const res = await sbAdminCreateUser({ email, fullName: row.name.trim(), role: row.role || 'engineer', password: pwd, extraPermissions: extras.length ? extras : undefined });
      logAudit({ action: cloneSrc ? 'user.clone' : 'user.create', target: email.toLowerCase(), status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error, meta: { role: row.role, from: cloneSrc?.email, data: dataAccess } });
      if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not create the login.' }); setBusy(false); return; }
      loginNote = res.needsConfirm ? ' Login created — but "Confirm email" is ON, so they must confirm before signing in.'
        : ` Login created${cloneSrc ? `, cloned from ${cloneSrc.fullName || cloneSrc.email}` : ''} — they sign in with the password and change it under Profile.`;
      await reloadUsers();
    }
    const r = await persist(row);
    if (!r.ok) { setMsg({ tone: 'error', text: r.error ?? 'Could not save that user.' }); setBusy(false); return; }
    setEdit(null); setCloneSrc(null); setMkLogin(false);
    setMsg({ tone: 'ok', text: `${isNew ? 'Added' : 'Saved'} ${row.name.trim()}.${loginNote || (r.note ? ` They ${r.note}.` : '')}` });
    await load();
  };

  // Delete a User Master (directory) entry — for a wrong/duplicate row. The
  // login and history are untouched; a leaver is handled with 🔒 Disable.
  const removeRow = async (r: DirectoryRow) => {
    if (r.id === 0) return;
    if (!confirm(`Delete ${r.name || r.email || 'this user'} from the User Master?\n\nThis removes their directory entry only. Their login (if any) and all history are kept — use 🔒 Disable login to lock out a leaver.`)) return;
    setBusy(true);
    const res = await deleteDirectoryRow(r.id);
    logAudit({ action: 'user.directory.delete', target: r.name || r.email, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error });
    setBusy(false);
    if (res.ok) { setViewRow(null); setMsg({ tone: 'ok', text: `Deleted ${r.name || r.email} from the User Master.` }); await load(); }
    else setMsg({ tone: 'error', text: res.error ?? 'Could not delete that user.' });
  };

  // Enable / disable a person's sign-in login (keeps all their history).
  const toggleActive = async (u: User) => {
    const enable = u.active === false;
    setBusy(true);
    const res = await updateProfile(u.id, { active: enable });
    logAudit({ action: enable ? 'user.login.enable' : 'user.login.disable', target: u.email, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error });
    setBusy(false);
    if (res.ok) { setMsg({ tone: 'ok', text: `${u.fullName || u.email}'s login is now ${enable ? 'active' : 'disabled'}.` }); await reloadUsers(); }
    else setMsg({ tone: 'error', text: res.error ?? 'Could not change the login.' });
  };

  // ---- the one Edit / Save pair ---------------------------------------------
  const draftOf = (r: DirectoryRow): DirectoryRow => drafts[r.id] ?? r;
  const changedRows = useMemo(
    () => dir.filter((r) => drafts[r.id] && JSON.stringify(drafts[r.id]) !== JSON.stringify(r)),
    [dir, drafts],
  );

  const setField = <K extends keyof DirectoryRow>(row: DirectoryRow, k: K, v: DirectoryRow[K]) =>
    setDrafts((d) => ({ ...d, [row.id]: { ...(d[row.id] ?? row), [k]: v } }));

  const startEditing = () => { setDrafts({}); setEditing(true); };

  const stopEditing = () => {
    if (changedRows.length && !confirm(`Discard ${changedRows.length} unsaved change${changedRows.length === 1 ? '' : 's'}?`)) return;
    setDrafts({}); setEditing(false);
  };

  // One Save for everything that changed. Rows are written one at a time so a
  // failure names the person it belongs to rather than sinking the whole batch.
  const saveAll = async () => {
    if (!changedRows.length) { setDrafts({}); setEditing(false); return; }
    const nameless = changedRows.find((r) => !drafts[r.id].name.trim());
    if (nameless) { setMsg({ tone: 'error', text: `${nameless.name || 'A user'} needs a name — it is what calls are allotted to.` }); return; }

    setBusy(true);
    setMsg({ tone: 'info', text: `Saving ${changedRows.length} change${changedRows.length === 1 ? '' : 's'}…` });
    const failed: string[] = [];
    const notes: string[] = [];
    let saved = 0;
    for (const r of changedRows) {
      const res = await persist(drafts[r.id]);
      if (res.ok) { saved += 1; if (res.note) notes.push(`${drafts[r.id].name.trim()} ${res.note}`); }
      else failed.push(`${drafts[r.id].name.trim() || r.name}: ${res.error}`);
    }
    setBusy(false);
    if (failed.length) {
      // Keep the drafts so nothing typed is lost; the ones that saved reload below.
      setMsg({ tone: 'error', text: `Saved ${saved}; ${failed.length} could not be saved — ${failed.join('; ')}` });
    } else {
      setDrafts({}); setEditing(false);
      setMsg({ tone: 'ok', text: `Saved ${saved} user${saved === 1 ? '' : 's'}.${notes.length ? ` ${notes.join('; ')}.` : ''}` });
    }
    await load();
  };

  // In edit mode every cell is an input, bound to that row's draft. Enter saves
  // everything; Esc leaves edit mode (asking first if anything was typed).
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void saveAll(); }
    if (e.key === 'Escape') { e.preventDefault(); stopEditing(); }
  };
  // A text cell: the value, or an input for it while the table is being edited.
  const cell = (k: keyof DirectoryRow, placeholder = '') =>
    (r: DirectoryRow) => (editing
      ? <input className="input" style={{ width: '100%' }} placeholder={placeholder}
          value={String(draftOf(r)[k] ?? '')} onKeyDown={keys}
          onChange={(e) => setField(r, k, e.target.value as DirectoryRow[typeof k])} />
      : <>{String(r[k] ?? '')}</>);

  // ---- reset a forgotten password ------------------------------------------
  //
  // The sign-in page tells people to ask an administrator; this is what the
  // administrator does. A new random password is generated here, set on the
  // account by the database (which checks this caller is an admin), and shown
  // once — the administrator passes it on, and the person changes it under
  // Profile → Password whenever they like.
  const resetPassword = async (email: string, name: string) => {
    if (!email) return;
    if (!confirm(`Reset the password for ${name || email}?\n\nA new one is generated and shown to you once. Every device they are signed in on is signed out.`)) return;
    const password = generatePassword();
    setBusy(true);
    const res = await sbAdminResetPassword(email, password);
    setBusy(false);
    // The audit records THAT it happened, never the password.
    logAudit({ action: 'user.reset_password', target: email, status: res.ok ? 'ok' : 'error', error: res.error });
    if (!res.ok) { setMsg({ tone: 'error', text: `Could not reset the password: ${res.error}` }); return; }
    setViewRow(null);
    setResetPw({ email, name, password });
  };

  const liveColumns: Column<DirectoryRow & Record<string, unknown>>[] = [
    { key: 'name', header: 'Name', width: 170, render: cell('name', 'As on the call') },
    { key: 'designation', header: 'Designation', width: 150, render: cell('designation') },
    {
      key: 'role', header: 'Role', width: 170,
      render: (r) => {
        if (editing) {
          return (
            <select className="select" style={{ width: '100%' }} value={draftOf(r).role ?? ''} onKeyDown={keys}
              onChange={(e) => setField(r, 'role', e.target.value)}>
              <option value="">— no role —</option>
              {ROLES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          );
        }
        const signedIn = profileByEmail.get(r.email.toLowerCase()) ?? profileByEmail.get(r.gmail.toLowerCase());
        // What they will get, and — where it differs — what they have today.
        if (!r.role && !signedIn) return <span className="muted">— not set —</span>;
        if (signedIn && r.role && signedIn.role !== r.role) {
          return <span title="The sign-in still carries the old role">{roleLabel(r.role)} <span className="muted">(now {roleLabel(signedIn.role)})</span></span>;
        }
        return roleLabel(signedIn?.role || r.role);
      },
    },
    {
      key: '_signed', header: 'Signed in', width: 90, wrap: false,
      render: (r) => (profileByEmail.has(r.email.toLowerCase()) || profileByEmail.has(r.gmail.toLowerCase())
        ? <span className="badge badge-success">Yes</span>
        : <span className="badge badge-neutral">Not yet</span>),
    },
    { key: 'email', header: 'Air Liquide ID', width: 200, wrap: false, render: cell('email', 'name@airliquide.com') },
    { key: 'gmail', header: 'Gmail', width: 180, wrap: false, render: cell('gmail', 'name@gmail.com') },
    { key: 'region', header: 'Region', width: 90, wrap: false, render: cell('region') },
    {
      key: 'validity', header: 'Active', width: 90, wrap: false,
      render: (r) => (editing
        ? (
          <select className="select" style={{ width: '100%' }} value={draftOf(r).validity ? 'TRUE' : 'FALSE'} onKeyDown={keys}
            onChange={(e) => setField(r, 'validity', e.target.value === 'TRUE')}>
            <option value="TRUE">Yes</option>
            <option value="FALSE">No</option>
          </select>
        )
        : statusBadge(r.validity ? 'TRUE' : 'FALSE', VALIDITY_TONES)),
    },
    { key: 'reporting_manager', header: 'Reporting Mgr', width: 150, render: cell('reporting_manager', 'RM name') },
    { key: 'regional_manager', header: 'Regional Mgr', width: 150, render: cell('regional_manager', 'RGM name') },
    { key: 'phone', header: 'Contact', width: 130, wrap: false, render: cell('phone') },
    { key: 'address', header: 'Address', width: 200, render: cell('address') },
    { key: 'city', header: 'City', width: 110, render: cell('city') },
    { key: 'state', header: 'State', width: 110, render: cell('state') },
  ];
  if (editable) {
    liveColumns.push({
      key: '_edit', header: 'Actions', width: 190, sortable: false, wrap: false,
      render: (r) => {
        if (editing) {
          return (drafts[r.id] && JSON.stringify(drafts[r.id]) !== JSON.stringify(r)
            ? <span className="badge badge-warning" title="Changed — will be saved">Edited</span>
            : <span className="muted">—</span>);
        }
        const prof = profileFor(r);
        return (
          <div className="row" style={{ gap: 4 }} onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-sm btn-ghost" title="Open the full form" onClick={() => openEdit(r)}>⋯</button>
            <button className="btn btn-sm" title={prof ? 'Role & permissions' : 'They must sign in before permissions can be set'}
              disabled={!prof} onClick={() => prof && setAccessFor(prof)}>🔐</button>
            <button className="btn btn-sm" title={prof ? 'Clone this user’s role & permissions to a new login' : 'They must sign in before they can be cloned'}
              disabled={!prof} onClick={() => prof && openClone(prof)}>⧉ Clone</button>
            <button className="btn btn-sm" title={prof ? 'See everything this user entered' : 'They must sign in first'}
              disabled={!prof} onClick={() => prof && setDataFor(prof)}>📊</button>
          </div>
        );
      },
    });
  }

  // Sheet source: the original read-only browse.
  const sheetColumns: Column<Row>[] = [
    { key: 'User Name', header: 'Name', width: 170 },
    { key: 'Designation', header: 'Designation', width: 150 },
    { key: 'Email ID', header: 'Air Liquide ID', width: 200, wrap: false },
    { key: 'GMAIL ID', header: 'Gmail', width: 180, wrap: false },
    { key: 'REGION', header: 'Region', width: 80, wrap: false },
    { key: 'Validity', header: 'Active', width: 70, wrap: false, render: (r) => statusBadge(r['Validity'], VALIDITY_TONES) },
    { key: 'RM', header: 'Reporting Mgr', width: 150 },
    { key: 'Contact  No', header: 'Contact', width: 130, wrap: false },
    { key: 'ADDRESS', header: 'Address', width: 220 },
    { key: 'CITY', header: 'City', width: 110 },
    { key: 'STATE', header: 'State', width: 110 },
  ];

  const visibleDir = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return dir;
    return dir.filter((r) => `${r.name} ${r.email} ${r.gmail} ${r.designation} ${r.region} ${roleLabel(r.role)}`.toLowerCase().includes(s));
  }, [dir, q]);

  return (
    <div>
      <PageHeader
        title="User Master"
        subtitle="Everyone in the directory, signed in or not — and the role each one is given."
        icon="👤"
        count={visibleDir.length}
        actions={editable && (
          editing ? (
            <div className="row">
              <button className="btn btn-primary" onClick={() => void saveAll()} disabled={busy || !changedRows.length}>
                {busy ? 'Saving…' : changedRows.length ? `Save ${changedRows.length} change${changedRows.length === 1 ? '' : 's'}` : 'Save'}
              </button>
              <button className="btn" onClick={stopEditing} disabled={busy}>Cancel</button>
            </div>
          ) : (
            <div className="row">
              <button className="btn" onClick={startEditing} disabled={busy || !dir.length}>✎ Edit</button>
              <button className="btn btn-primary" onClick={openNew}>+ New User</button>
            </div>
          )
        )}
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {live ? (
        <DataTable<DirectoryRow & Record<string, unknown>>
          columns={liveColumns}
          rows={visibleDir as (DirectoryRow & Record<string, unknown>)[]}
          getRowId={(r) => String(r.id)}
          storageKey="userMaster"
          rowsBeforeScroll={16}
          dense
          onRowClick={editing ? undefined : (r) => setViewRow(r)}
          emptyText={busy ? 'Loading…' : 'No users — adjust your search.'}
          toolbar={
            <Toolbar>
              <SearchBox value={q} onChange={setQ} placeholder="Name, email, region, designation, role…" />
              <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
              {editable && (
                <span className="muted">
                  {editing
                    ? `Editing every row — ${changedRows.length || 'no'} change${changedRows.length === 1 ? '' : 's'} so far. Enter saves, Esc cancels.`
                    : 'Edit changes the whole table at once; ⋯ opens one user in the full form.'}
                </span>
              )}
              <div className="spacer" />
              {visibleDir.length > 0 && (
                <button className="btn btn-sm" onClick={() => csvExport('user-master.csv',
                  liveColumns.filter((c) => !c.key.startsWith('_')).map((c) => ({ key: c.key, header: c.header })),
                  visibleDir as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
              )}
            </Toolbar>
          }
        />
      ) : (
        <DataTable<Row>
          columns={sheetColumns}
          rows={sheetRows}
          getRowId={(r) => r.id}
          storageKey="userMaster"
          rowsBeforeScroll={16}
          dense
          emptyText="No users — adjust your search."
          toolbar={
            <Toolbar>
              <SearchBox value={q} onChange={setQ} placeholder="Name, email, region, designation…" />
              <button className="btn btn-sm btn-primary" onClick={() => void load()} disabled={busy}>{busy ? '…' : 'Search'}</button>
              <div className="spacer" />
              {sheetRows.length > 0 && (
                <button className="btn btn-sm" onClick={() => csvExport('user-master.csv', sheetColumns.map((c) => ({ key: c.key, header: c.header })), sheetRows as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
              )}
            </Toolbar>
          }
        />
      )}

      {edit && (
        <Drawer open onClose={() => { setEdit(null); setCloneSrc(null); setMkLogin(false); }}
          title={edit.id ? `Edit ${edit.name || 'user'}` : cloneSrc ? `Clone — new user like ${cloneSrc.fullName || cloneSrc.email}` : 'New user'}
          width={640}>
          {edit.id === 0 && (
            <div className="rep-form" style={{ marginBottom: 8 }}>
              <label className="row" style={{ gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={mkLogin} onChange={(e) => setMkLogin(e.target.checked)} />
                <b>Create a sign-in login now</b>
              </label>
              {mkLogin && (
                <div className="rep-grid" style={{ marginTop: 6 }}>
                  <label className="rep-field"><span className="field-label">Starting password</span>
                    <input className="input" value={pwd} onChange={(e) => setPwd(e.target.value)} /></label>
                  {cloneSrc && (
                    <label className="rep-field"><span className="field-label">Clone from {cloneSrc.fullName || cloneSrc.email}</span>
                      <select className="select" value={dataAccess ? 'data' : 'perms'} onChange={(e) => setDataAccess(e.target.value === 'data')}>
                        <option value="perms">Permissions only — sees their own data</option>
                        <option value="data">Permissions + Data — can see all records</option>
                      </select></label>
                  )}
                </div>
              )}
              {mkLogin && cloneSrc && (
                <div className="muted rep-hint">
                  Copying <b>{roleLabel(cloneSrc.rbacRole || 'engineer')}</b>{cloneSrc.extraPermissions?.length ? ` + ${cloneSrc.extraPermissions.length} extra permission${cloneSrc.extraPermissions.length === 1 ? '' : 's'}` : ''}.
                  {dataAccess ? ' Plus full data visibility (every record).' : ' They see only their own data.'} Fill the new person’s details below.
                </div>
              )}
              {mkLogin && <div className="muted rep-hint">Creating logins in-app needs Supabase sign-ups enabled and “Confirm email” off. The new user changes the password under Profile → Password.</div>}
            </div>
          )}
          <UserForm
            row={edit}
            busy={busy}
            signedInRole={(profileByEmail.get(edit.email.trim().toLowerCase()) ?? profileByEmail.get(edit.gmail.trim().toLowerCase()))?.role}
            onChange={setEdit}
            onCancel={() => { setEdit(null); setCloneSrc(null); setMkLogin(false); }}
            onSave={() => void save(edit)}
          />
        </Drawer>
      )}

      {accessFor && (
        <AccessDrawer
          user={accessFor}
          onClose={() => setAccessFor(null)}
          onSaved={async (text) => { setAccessFor(null); setMsg({ tone: 'ok', text }); await reloadUsers(); }}
          onError={(text) => setMsg({ tone: 'error', text })}
        />
      )}

      {dataFor && <DataViewDrawer user={dataFor} onClose={() => setDataFor(null)} />}

      {/* SHOWN ONCE. It is in React state and nowhere else — not in the audit
          log, not in the database, not recoverable. If it is lost the answer is
          to reset again, which is cheap. */}
      <Modal open={!!resetPw} onClose={() => setResetPw(null)} title="New password" width={480}>
        {resetPw && (
          <div className="rep-form">
            <p style={{ margin: '0 0 10px' }}>
              A new password for <b>{resetPw.name || resetPw.email}</b>. Pass it on — they can change it
              under <b>Profile → Password</b> once they are signed in.
            </p>
            <div className="pw-show">{resetPw.password}</div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(resetPw.password); }}>
                ⧉ Copy
              </button>
              <div className="spacer" />
              <button className="btn btn-sm btn-primary" onClick={() => setResetPw(null)}>Done</button>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
              This is the only time it is shown — it is not stored anywhere and cannot be looked up.
              If it is lost, reset again. Every device {resetPw.name || 'they'} were signed in on has been signed out.
            </p>
          </div>
        )}
      </Modal>

      {viewRow && (() => {
        const r = viewRow;
        const prof = profileFor(r);
        const rows: [string, string][] = [
          ['Name', r.name || '—'],
          ['Designation', r.designation || '—'],
          ['Role', roleLabel(prof?.rbacRole || r.role)],
          ['Signed in', prof ? 'Yes' : 'Not yet'],
          ['Air Liquide ID', r.email || '—'],
          ['Gmail', r.gmail || '—'],
          ['Region', r.region || '—'],
          ['Active', r.validity ? 'Yes' : 'No'],
          ['Reporting Manager', r.reporting_manager || '—'],
          ['Regional Manager', r.regional_manager || '—'],
          ['Contact', r.phone || '—'],
          ['Address', [r.address, r.city, r.state].filter(Boolean).join(', ') || '—'],
          ...(prof?.extraPermissions?.length ? [['Extra permissions', `${prof.extraPermissions.length} granted`] as [string, string]] : []),
        ];
        return (
          <Drawer open onClose={() => setViewRow(null)} title={r.name || 'User'} width={560}>
            <div className="rep-form">
              {/* Actions at the top */}
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                {editable && <button className="btn btn-sm btn-primary" onClick={() => { setViewRow(null); openEdit(r); }}>✏️ Edit</button>}
                {editable && prof && <button className="btn btn-sm" onClick={() => { setViewRow(null); setAccessFor(prof); }}>🔐 Access</button>}
                {editable && prof && <button className="btn btn-sm" onClick={() => { setViewRow(null); openClone(prof); }}>⧉ Clone</button>}
                {editable && prof && (
                  <button className="btn btn-sm" disabled={busy} title="Generate a new password and show it once, to pass on"
                    onClick={() => void resetPassword(r.email || prof.email, r.name || prof.fullName)}>
                    🔑 Reset password
                  </button>
                )}
                {prof && <button className="btn btn-sm" onClick={() => { setViewRow(null); setDataFor(prof); }}>📊 Data</button>}
                {editable && prof && (
                  <button className={`btn btn-sm ${prof.active === false ? '' : 'btn-danger'}`} disabled={busy}
                    onClick={() => { setViewRow(null); void toggleActive(prof); }}>
                    {prof.active === false ? '🔓 Enable login' : '🔒 Disable login'}
                  </button>
                )}
                {editable && <button className="btn btn-sm btn-danger" disabled={busy} title="Remove this User Master entry" onClick={() => void removeRow(r)}>🗑 Delete</button>}
              </div>
              {prof?.active === false && <div className="sheet-banner sheet-banner-info" style={{ marginBottom: 8 }}><span>🔒 This login is <b>disabled</b> — they cannot sign in, but all their records are kept.</span></div>}
              {!prof && <div className="muted rep-hint">This person has not signed in yet, so there is no login to set permissions on, clone, or report data for. Set their role above; it applies when they first sign in.</div>}
              <div className="assoc-scroll">
                <table className="assoc-table" style={{ minWidth: 320 }}>
                  <tbody>
                    {rows.map(([k, v]) => (
                      <tr key={k}><td style={{ width: 160, color: 'var(--muted)' }}>{k}</td><td>{v}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Drawer>
        );
      })()}
    </div>
  );
}

// ---- Access: role + extra per-user permissions (folds in the old User Access)
function AccessDrawer({ user, onClose, onSaved, onError }: {
  user: User; onClose: () => void; onSaved: (t: string) => void; onError: (t: string) => void;
}) {
  const { rolePerms } = useAuth();
  const [role, setRole] = useState(user.rbacRole || 'engineer');
  const [extra, setExtra] = useState<Set<string>>(new Set(user.extraPermissions ?? []));
  const [busy, setBusy] = useState(false);
  const roleGrants = useMemo(() => new Set(permsForRole(role, rolePerms)), [role, rolePerms]);
  const groups = useMemo(() => {
    const g: Record<string, typeof ACTIONS> = {};
    ACTIONS.forEach((a) => { (g[a.group] ??= []).push(a); });
    return Object.entries(g);
  }, []);
  const toggle = (k: string) => setExtra((cur) => { const n = new Set(cur); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const save = async () => {
    setBusy(true);
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
        <label className="rep-field" style={{ maxWidth: 320 }}>
          <span className="field-label">Role</span>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <div className="muted rep-hint">The role sets the base access. Tick anything extra this person needs on top.</div>
        <div className="assoc-scroll" style={{ marginTop: 8 }}>
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
                        <td className="rbac-cell"><input type="checkbox" disabled={viaRole} checked={viaRole || extra.has(a.key)} onChange={() => toggle(a.key)} /></td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rep-actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save access'}</button>
        </div>
      </div>
    </Drawer>
  );
}

// ---- Data view: everything a user entered (for a handover)
function DataViewDrawer({ user, onClose }: { user: User; onClose: () => void }) {
  const [act, setAct] = useState<UserActivity | null>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    userActivity({ id: user.id, email: user.email, name: user.fullName })
      .then((a) => { if (alive) setAct(a); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [user.id, user.email, user.fullName]);

  const s = (v: unknown) => (v == null ? '' : String(v));
  const d = (v: unknown) => s(v).slice(0, 10);
  const Section = ({ title, icon, rows, cols }: { title: string; icon: string; rows: Record<string, unknown>[]; cols: { k: string; h: string; f?: (r: Record<string, unknown>) => string }[] }) => (
    <section className="rep-sec">
      <div className="rep-sec-title">{icon} {title} <span className="muted">({rows.length})</span></div>
      {rows.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>None.</div> : (
        <div className="assoc-scroll">
          <table className="assoc-table"><thead><tr>{cols.map((c) => <th key={c.k}>{c.h}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 50).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c.k}>{c.f ? c.f(r) : s(r[c.k])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <Drawer open onClose={onClose} title={`Activity — ${user.fullName || user.email}`} width={720}>
      {busy || !act ? <div className="muted" style={{ padding: 16 }}>Loading everything this user entered…</div> : (
        <div className="rep-form">
          <div className="muted rep-hint">Everything <b>{user.fullName || user.email}</b> has entered or actioned — useful for a handover.</div>
          <Section title="Calls registered / allocated" icon="📡" rows={act.calls}
            cols={[{ k: 'reg_date', h: 'Date', f: (r) => d(r.reg_date) }, { k: 'call_number', h: 'Call No' }, { k: 'party_name', h: 'Party' }, { k: 'product_name', h: 'Product' }, { k: 'allocated_to', h: 'Allocated' }]} />
          <Section title="Spare requests raised" icon="📦" rows={act.requests}
            cols={[{ k: 'created_at', h: 'Date', f: (r) => d(r.created_at) }, { k: 'uid', h: 'Req UID' }, { k: 'call_number', h: 'Call No' }, { k: 'status', h: 'Status' }]} />
          <Section title="Spares dispatched (DC)" icon="🚚" rows={act.dispatches}
            cols={[{ k: 'dispatched_at', h: 'Date', f: (r) => d(r.dispatched_at) }, { k: 'or_number', h: 'OR' }, { k: 'part', h: 'Part' }, { k: 'dc_number', h: 'DC No' }, { k: 'dispatched_by', h: 'By' }]} />
          <Section title="Spares approved" icon="✅" rows={act.approvals}
            cols={[{ k: 'or_number', h: 'OR' }, { k: 'part', h: 'Part' }, { k: 'rm_by', h: 'RM by' }, { k: 'commercial_by', h: 'Comm by' }, { k: 'nsm_by', h: 'NSM by' }]} />
          <Section title="Reports filed" icon="🗒️" rows={act.reports}
            cols={[{ k: 'visit_at', h: 'Visit', f: (r) => d(r.visit_at) }, { k: 'ucn', h: 'UCN' }, { k: 'call_status', h: 'Status' }]} />
          <Section title="Consumption entered" icon="🧾" rows={act.consumption}
            cols={[{ k: 'created_at', h: 'Date', f: (r) => d(r.created_at) }, { k: 'part', h: 'Part' }, { k: 'qty', h: 'Qty' }]} />
        </div>
      )}
    </Drawer>
  );
}

function UserForm({ row, busy, signedInRole, onChange, onCancel, onSave }: {
  row: DirectoryRow; busy: boolean; signedInRole?: string;
  onChange: (r: DirectoryRow) => void; onCancel: () => void; onSave: () => void;
}) {
  const set = <K extends keyof DirectoryRow>(k: K, v: DirectoryRow[K]) => onChange({ ...row, [k]: v });
  const field = (label: string, k: keyof DirectoryRow, placeholder = '', type = 'text') => (
    <label className="rep-field">
      <span className="field-label">{label}</span>
      <input className="input" type={type} placeholder={placeholder}
        value={String(row[k] ?? '')} onChange={(e) => set(k, e.target.value as DirectoryRow[typeof k])} />
    </label>
  );

  return (
    <div>
      <div className="rep-grid">
        <label className="rep-field">
          <span className="field-label">User Name *</span>
          <input className="input" placeholder="As it appears on a call's Allocated To"
            value={row.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        {field('Designation', 'designation', 'e.g. Service Engineer')}
        {field('Air Liquide ID (email)', 'email', 'name@airliquide.com', 'email')}
        {field('Gmail ID', 'gmail', 'name@gmail.com', 'email')}

        <label className="rep-field">
          <span className="field-label">Role</span>
          <select className="select" value={row.role} onChange={(e) => set('role', e.target.value)}>
            <option value="">— no role —</option>
            {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <label className="rep-field">
          <span className="field-label">Active</span>
          <select className="select" value={row.validity ? 'TRUE' : 'FALSE'} onChange={(e) => set('validity', e.target.value === 'TRUE')}>
            <option value="TRUE">Yes — may sign in</option>
            <option value="FALSE">No</option>
          </select>
        </label>

        {field('Reporting Manager (name)', 'reporting_manager', 'RM as named in this directory')}
        {field('Regional Manager (name)', 'regional_manager', 'RGM as named in this directory')}
        {field('Region', 'region', 'e.g. South')}
        {field('Contact No', 'phone', '', 'tel')}
        <label className="rep-field rep-span2">
          <span className="field-label">Address</span>
          <input className="input" value={row.address} onChange={(e) => set('address', e.target.value)} />
        </label>
        {field('City', 'city')}
        {field('State', 'state')}
      </div>

      <p className="muted rep-hint">
        The role decides what this person can open and do. Someone who has not signed in yet
        gets it the moment they do; if they have signed in already, saving applies it to their
        sign-in straight away. Reporting / Regional Manager are <b>names from this directory</b> —
        they build the tree that decides whose calls each manager can see.
        {signedInRole && row.role && signedInRole !== row.role && (
          <> Their sign-in currently carries <b>{roleLabel(signedInRole)}</b>.</>
        )}
      </p>

      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={onSave} disabled={busy || !row.name.trim()}>
          {busy ? 'Saving…' : row.id ? 'Save' : 'Add user'}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox, Drawer } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { ROLES } from '../lib/rbac';
import { csvExport, statusBadge } from '../lib/format';
import { listUsers, dataConfigured } from '../lib/sheets';
import {
  listDirectory, saveDirectoryRow, updateProfile, supabaseConfigured, type DirectoryRow,
} from '../lib/supabase';
import { logAudit } from '../lib/audit';
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

  // The drawer's Save / Add.
  const save = async (row: DirectoryRow) => {
    setBusy(true);
    const r = await persist(row);
    if (!r.ok) { setMsg({ tone: 'error', text: r.error ?? 'Could not save that user.' }); setBusy(false); return; }
    setEdit(null);
    setMsg({ tone: 'ok', text: `${row.id === 0 ? 'Added' : 'Saved'} ${row.name.trim()}.${r.note ? ` They ${r.note}.` : ''}` });
    await load();
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
      key: '_edit', header: '', width: 90, sortable: false, wrap: false,
      render: (r) => (editing
        // Which rows will be written when Save is pressed.
        ? (drafts[r.id] && JSON.stringify(drafts[r.id]) !== JSON.stringify(r)
          ? <span className="badge badge-warning" title="Changed — will be saved">Edited</span>
          : <span className="muted">—</span>)
        : <button className="btn btn-sm btn-ghost" title="Open the full form"
            onClick={(e) => { e.stopPropagation(); setEdit({ ...r }); }}>⋯</button>),
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
              <button className="btn btn-primary" onClick={() => setEdit(emptyRow())}>+ New User</button>
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
        <Drawer open onClose={() => setEdit(null)} title={edit.id ? `Edit ${edit.name || 'user'}` : 'New user'}>
          <UserForm
            row={edit}
            busy={busy}
            signedInRole={(profileByEmail.get(edit.email.trim().toLowerCase()) ?? profileByEmail.get(edit.gmail.trim().toLowerCase()))?.role}
            onChange={setEdit}
            onCancel={() => setEdit(null)}
            onSave={() => void save(edit)}
          />
        </Drawer>
      )}
    </div>
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

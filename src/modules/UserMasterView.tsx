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
// Editing is in the row itself — click it and the cells become inputs, Enter
// saves, Esc cancels — since these are one-field corrections read off the list.
// The drawer (⋯, and + New User) is the same fields in a form.
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
  // Inline edit: the row being edited in place, and the values as typed.
  const [rowEdit, setRowEdit] = useState<DirectoryRow | null>(null);
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

  const save = async (row: DirectoryRow) => {
    const name = row.name.trim();
    if (!name) { setMsg({ tone: 'error', text: 'A user needs a name — it is what calls are allotted to.' }); return; }
    setBusy(true);
    const isNew = row.id === 0;
    const res = await saveDirectoryRow(isNew ? null : row.id, {
      name, email: row.email.trim(), gmail: row.gmail.trim(), designation: row.designation.trim(),
      reporting_manager: row.reporting_manager.trim(), regional_manager: row.regional_manager.trim(),
      region: row.region.trim(), role: row.role, validity: row.validity,
      address: row.address.trim(), city: row.city.trim(), state: row.state.trim(), phone: row.phone.trim(),
    });
    logAudit({ action: isNew ? 'user.directory.add' : 'user.directory.edit', target: name, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error });
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not save that user.' }); setBusy(false); return; }

    // Already signed in? Apply the role to their profile now, so this screen and
    // User Access never disagree. (A new joiner picks it up on first sign-in.)
    let note = '';
    const signedIn = profileByEmail.get(row.email.trim().toLowerCase()) ?? profileByEmail.get(row.gmail.trim().toLowerCase());
    if (row.role && signedIn && signedIn.role !== row.role) {
      const r = await updateProfile(signedIn.id, { role: row.role });
      if (r.ok) { await reloadUsers(); note = ` Role applied to their sign-in now.`; }
      else note = ` Their sign-in keeps ${roleLabel(signedIn.role)} — ${r.error ?? 'the role could not be changed'}.`;
    } else if (row.role && !signedIn) {
      note = ` They get ${roleLabel(row.role)} when they first sign in.`;
    }

    setEdit(null);
    setRowEdit(null);
    setMsg({ tone: 'ok', text: `${isNew ? 'Added' : 'Saved'} ${name}.${note}` });
    await load();
  };

  // Inline editing: a row under edit swaps its cells for inputs, so the common
  // corrections (a name, a role, a number) are made where you are reading them.
  const editingThis = (r: DirectoryRow) => rowEdit?.id === r.id && r.id !== 0;
  const setField = <K extends keyof DirectoryRow>(k: K, v: DirectoryRow[K]) =>
    setRowEdit((d) => (d ? { ...d, [k]: v } : d));
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && rowEdit) { e.preventDefault(); void save(rowEdit); }
    if (e.key === 'Escape') { e.preventDefault(); setRowEdit(null); }
  };
  // A text cell: the value, or an input for it while the row is being edited.
  const cell = (k: keyof DirectoryRow, placeholder = '') =>
    (r: DirectoryRow) => (editingThis(r)
      ? <input className="input" style={{ width: '100%' }} placeholder={placeholder} autoFocus={k === 'name'}
          value={String(rowEdit?.[k] ?? '')} onKeyDown={keys}
          onChange={(e) => setField(k, e.target.value as DirectoryRow[typeof k])}
          onClick={(e) => e.stopPropagation()} />
      : <>{String(r[k] ?? '')}</>);

  const liveColumns: Column<DirectoryRow & Record<string, unknown>>[] = [
    { key: 'name', header: 'Name', width: 170, render: cell('name', 'As on the call') },
    { key: 'designation', header: 'Designation', width: 150, render: cell('designation') },
    {
      key: 'role', header: 'Role', width: 170,
      render: (r) => {
        if (editingThis(r)) {
          return (
            <select className="select" style={{ width: '100%' }} value={rowEdit?.role ?? ''} onKeyDown={keys}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setField('role', e.target.value)}>
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
      render: (r) => (editingThis(r)
        ? (
          <select className="select" style={{ width: '100%' }} value={rowEdit?.validity ? 'TRUE' : 'FALSE'} onKeyDown={keys}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setField('validity', e.target.value === 'TRUE')}>
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
      key: '_edit', header: '', width: 140, sortable: false, wrap: false,
      render: (r) => (editingThis(r)
        ? (
          <div className="row" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-sm btn-primary" disabled={busy || !(rowEdit?.name ?? '').trim()}
              onClick={() => rowEdit && void save(rowEdit)}>{busy ? '…' : 'Save'}</button>
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setRowEdit(null)}>Cancel</button>
          </div>
        )
        : (
          <div className="row" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-sm" onClick={() => setRowEdit({ ...r })}>Edit</button>
            <button className="btn btn-sm btn-ghost" title="Open the full form" onClick={() => setEdit({ ...r })}>⋯</button>
          </div>
        )),
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
        actions={editable && <button className="btn btn-primary" onClick={() => setEdit(emptyRow())}>+ New User</button>}
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
          onRowClick={(r) => { if (editable && !rowEdit) setRowEdit({ ...r }); }}
          emptyText={busy ? 'Loading…' : 'No users — adjust your search.'}
          toolbar={
            <Toolbar>
              <SearchBox value={q} onChange={setQ} placeholder="Name, email, region, designation, role…" />
              <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
              {editable && (
                <span className="muted">
                  {rowEdit ? 'Editing — Enter saves, Esc cancels.' : 'Click a row to edit it here; ⋯ opens the full form.'}
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

import { useState } from 'react';
import { useAuth, ROLE_LABELS, type Role, type User } from '../lib/auth';
import { PageHeader, Drawer } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { SchemaForm, type FormValues } from '../components/form/Form';
import { fmtDateTime } from '../lib/format';

const ROLE_OPTS = (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export function UsersAdmin() {
  const { users, user, createUser, updateUser, removeUser, can } = useAuth();
  const [drawer, setDrawer] = useState<{ mode: 'create' | 'edit'; row?: User } | null>(null);
  const [error, setError] = useState('');

  if (!can('manage-users')) {
    return (
      <div>
        <PageHeader title="User Access" icon="👥" />
        <div className="card card-pad muted">Only administrators can manage users.</div>
      </div>
    );
  }

  const columns: Column<User>[] = [
    { key: 'username', header: 'Username', width: 130, wrap: false },
    { key: 'fullName', header: 'Full Name', width: 180 },
    { key: 'email', header: 'Email', width: 200, wrap: false },
    { key: 'role', header: 'Role', width: 150, wrap: false, render: (r) => <span className="badge badge-primary">{ROLE_LABELS[r.role]}</span> },
    { key: 'active', header: 'Status', width: 100, wrap: false, render: (r) => (r.active ? <span className="badge badge-success">Active</span> : <span className="badge badge-neutral">Disabled</span>) },
    {
      key: '_actions', header: 'Actions', width: 160, sortable: false, wrap: false,
      render: (r) => (
        <div className="row" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-sm" onClick={() => setDrawer({ mode: 'edit', row: r })}>Edit</button>
          {r.id !== user?.id && (
            <button className="btn btn-sm btn-ghost" onClick={() => confirm(`Delete user ${r.username}?`) && removeUser(r.id)}>🗑</button>
          )}
        </div>
      ),
    },
  ];

  const createFields = [
    { name: 'fullName', label: 'Full Name', required: true, section: 'Account' as const },
    { name: 'username', label: 'Username', required: true, section: 'Account' as const },
    { name: 'email', label: 'Email', type: 'email' as const, section: 'Account' as const },
    { name: 'role', label: 'Role', type: 'select' as const, options: ROLE_OPTS, required: true, section: 'Access' },
    { name: 'password', label: 'Password', required: true, section: 'Access', help: 'Min 5 characters' },
  ];

  const editFields = [
    { name: 'fullName', label: 'Full Name', required: true, section: 'Account' as const },
    { name: 'email', label: 'Email', type: 'email' as const, section: 'Account' as const },
    { name: 'role', label: 'Role', type: 'select' as const, options: ROLE_OPTS, required: true, section: 'Access' },
    { name: 'active', label: 'Account active', type: 'checkbox' as const, section: 'Access' },
    { name: 'password', label: 'Reset Password', section: 'Access', help: 'Leave blank to keep current password' },
  ];

  const submit = (v: FormValues) => {
    setError('');
    if (drawer?.mode === 'create') {
      const res = createUser({
        username: String(v.username),
        fullName: String(v.fullName),
        email: String(v.email ?? ''),
        role: v.role as Role,
        password: String(v.password),
      });
      if (!res.ok) { setError(res.error ?? 'Failed'); return; }
    } else if (drawer?.row) {
      updateUser(drawer.row.id, {
        fullName: String(v.fullName),
        email: String(v.email ?? ''),
        role: v.role as Role,
        active: !!v.active,
        ...(v.password ? { password: String(v.password) } : {}),
      });
    }
    setDrawer(null);
  };

  return (
    <div>
      <PageHeader
        title="User Access"
        subtitle="Create users, assign roles & control access"
        icon="👥"
        actions={<button className="btn btn-primary" onClick={() => { setError(''); setDrawer({ mode: 'create' }); }}>+ New User</button>}
      />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <b>Role permissions</b>
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          <b>Administrator</b> — full access incl. user management & deletes ·{' '}
          <b>Service Manager</b> — create/edit/delete records ·{' '}
          <b>Field Engineer</b> — create/edit records (own data scoping where applicable) ·{' '}
          <b>Viewer</b> — read-only
        </div>
      </div>

      <DataTable<User>
        columns={columns}
        rows={users}
        getRowId={(r) => r.id}
        storageKey="users"
        emptyText="No users."
      />

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer?.mode === 'create' ? 'New User' : `Edit ${drawer?.row?.username}`} width={560}>
        {drawer && (
          <>
            {error && <div className="field-err" style={{ marginBottom: 10 }}>{error}</div>}
            {drawer.mode === 'edit' && drawer.row && (
              <div className="record-meta">Created {fmtDateTime(drawer.row.createdAt)}</div>
            )}
            <SchemaForm
              fields={drawer.mode === 'create' ? createFields : editFields}
              initial={drawer.row as unknown as FormValues}
              onSubmit={submit}
              onCancel={() => setDrawer(null)}
              submitLabel={drawer.mode === 'create' ? 'Create User' : 'Save Changes'}
            />
          </>
        )}
      </Drawer>
    </div>
  );
}

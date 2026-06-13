import { useMemo, useState, type ReactNode } from 'react';
import { useCollection, useCrud } from '../lib/hooks';
import type { BaseRecord } from '../lib/db';
import { useAuth } from '../lib/auth';
import { DataTable, type Column } from '../components/table/DataTable';
import { SchemaForm, type FieldDef, type FormValues } from '../components/form/Form';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, fmtDateTime } from '../lib/format';

// ===========================================================================
// Generic entity module. Combines the Table + Form + Drawer systems into a
// full list / create / edit / view / delete experience. Most service modules
// are a thin config over this; specialised screens (dashboards, reviews) are
// bespoke but still reuse the same primitives.
// ===========================================================================

export interface CrudConfig<T extends BaseRecord> {
  collection: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  singular: string;
  columns: Column<T>[];
  fields: FieldDef[];
  // produce derived/code fields on create
  onBeforeCreate?: (values: FormValues) => FormValues;
  searchKeys?: string[];
  storageKey?: string;
  rowsBeforeScroll?: number;
  // restrict list to records owned by current user
  userScoped?: boolean;
  extraToolbar?: ReactNode;
  defaultsForNew?: () => FormValues;
}

export function CrudModule<T extends BaseRecord>({ config }: { config: CrudConfig<T> }) {
  const rows = useCollection<T>(config.collection);
  const crud = useCrud(config.collection);
  const { user, can } = useAuth();
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState<{ mode: 'create' | 'edit' | 'view'; row?: T } | null>(null);

  const visibleRows = useMemo(() => {
    let r = rows;
    if (config.userScoped && user) r = r.filter((x) => x.ownerId === user.id);
    if (search.trim()) {
      const q = search.toLowerCase();
      const keys = config.searchKeys ?? config.columns.map((c) => c.key);
      r = r.filter((row) =>
        keys.some((k) => String((row as Record<string, unknown>)[k] ?? '').toLowerCase().includes(q)),
      );
    }
    return [...r].reverse();
  }, [rows, search, config, user]);

  const actionsColumn: Column<T> = {
    key: '_actions',
    header: 'Actions',
    width: 150,
    sortable: false,
    wrap: false,
    render: (row) => (
      <div className="row" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-sm" onClick={() => setDrawer({ mode: 'view', row })}>
          View
        </button>
        {can('edit') && (
          <button className="btn btn-sm" onClick={() => setDrawer({ mode: 'edit', row })}>
            Edit
          </button>
        )}
        {can('delete') && (
          <button
            className="btn btn-sm btn-ghost"
            title="Delete"
            onClick={() => {
              if (confirm(`Delete this ${config.singular.toLowerCase()}?`)) crud.remove(row.id);
            }}
          >
            🗑
          </button>
        )}
      </div>
    ),
  };

  const allColumns = [...config.columns, actionsColumn];

  const handleSubmit = (values: FormValues) => {
    if (drawer?.mode === 'edit' && drawer.row) {
      crud.update(drawer.row.id, values);
    } else {
      const prepared = config.onBeforeCreate ? config.onBeforeCreate(values) : values;
      crud.insert({ ...prepared, ownerId: user?.id });
    }
    setDrawer(null);
  };

  const initial: FormValues | undefined =
    drawer?.mode === 'create'
      ? config.defaultsForNew?.()
      : (drawer?.row as unknown as FormValues | undefined);

  return (
    <div>
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        icon={config.icon}
        actions={
          can('edit') && (
            <button className="btn btn-primary" onClick={() => setDrawer({ mode: 'create' })}>
              + New {config.singular}
            </button>
          )
        }
      />

      <DataTable<T>
        columns={allColumns}
        rows={visibleRows}
        getRowId={(r) => r.id}
        storageKey={config.storageKey ?? config.collection}
        rowsBeforeScroll={config.rowsBeforeScroll ?? 10}
        onRowClick={(r) => setDrawer({ mode: 'view', row: r })}
        emptyText={`No ${config.title.toLowerCase()} yet. Click “New ${config.singular}”.`}
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder={`Search ${config.title.toLowerCase()}…`} />
            {config.extraToolbar}
            <div className="spacer" />
            <button
              className="btn btn-sm"
              onClick={() =>
                csvExport(
                  `${config.collection}.csv`,
                  config.columns.map((c) => ({ key: c.key, header: c.header })),
                  visibleRows as unknown as Record<string, unknown>[],
                )
              }
            >
              ⭳ Export CSV
            </button>
          </Toolbar>
        }
      />

      <Drawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title={
          drawer?.mode === 'create'
            ? `New ${config.singular}`
            : drawer?.mode === 'edit'
              ? `Edit ${config.singular}`
              : `${config.singular} Details`
        }
        width={720}
      >
        {drawer && (
          <>
            {drawer.mode === 'view' && drawer.row && (
              <div className="record-meta">
                Created {fmtDateTime(drawer.row.createdAt)} · Updated {fmtDateTime(drawer.row.updatedAt)}
              </div>
            )}
            <SchemaForm
              fields={config.fields}
              initial={initial}
              readOnly={drawer.mode === 'view'}
              submitLabel={drawer.mode === 'edit' ? 'Save Changes' : `Create ${config.singular}`}
              onSubmit={handleSubmit}
              onCancel={() => setDrawer(null)}
              footer={
                drawer.mode === 'view' && can('edit') ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setDrawer({ mode: 'edit', row: drawer.row })}
                  >
                    Edit
                  </button>
                ) : undefined
              }
            />
          </>
        )}
      </Drawer>
    </div>
  );
}

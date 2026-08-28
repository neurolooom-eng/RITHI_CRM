import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { SchemaForm, type FieldDef, type FormValues } from '../components/form/Form';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, timeAgo } from '../lib/format';
import { listTabRows, sheetsConfigured, updateTabRow } from '../lib/sheets';
import { useAuth } from '../lib/auth';
import './fieldcalls.css';

// ===========================================================================
// CALL UPDATION — reads/updates the Call Register's "Reporting-N" tab
// directly (schema-agnostic). Columns are derived from the sheet; curate them
// with ⚙ Columns. Editing writes changed cells back by UC Number.
// ===========================================================================

const TAB = 'Reporting-N';
const UCN = 'UC Number';
const PREFERRED = [
  'UC Number', 'Call Number', 'Call Type', 'Visiting Service Engineer', 'Visit Date & Time',
  'Call Status', 'CALL PENDING REASON', 'Complaint Observation', 'Job Done', 'Service Report',
];
const LONG = ['Job Done', 'Complaint Observation', 'Service Report', 'Standard Complaint', 'CALL PENDING REASON'];
const READONLY = ['UC Number', 'Call Number', 'UID', 'Email-ID'];

type Row = Record<string, unknown> & { id: string };

export function CallUpdation() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState('');
  const [drawer, setDrawer] = useState<{ row: Row; mode: 'view' | 'edit' } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    sheetsConfigured() ? null : { tone: 'info', text: 'Connect the Google Sheet in Settings to load the Reporting-N tab.' },
  );

  const load = async () => {
    if (!sheetsConfigured()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Loading Reporting-N…' });
    try {
      const r = await listTabRows(TAB, 400);
      setRows(r.map((x, i) => ({ ...x, id: String(x[UCN] || i) })));
      setLastSync(new Date().toISOString());
      setMsg({ tone: 'ok', text: `Loaded ${r.length} rows from ${TAB}.` });
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const headerKeys = useMemo(() => {
    const ks = new Set<string>();
    rows.slice(0, 60).forEach((r) => Object.keys(r).forEach((k) => {
      if (k && !k.startsWith('_') && !/^Page.*Header$/i.test(k)) ks.add(k);
    }));
    return [...ks];
  }, [rows]);

  const baseCols = (PREFERRED.filter((k) => headerKeys.includes(k)).concat(headerKeys.filter((k) => !PREFERRED.includes(k)))).slice(0, 8);
  const columns: Column<Row>[] = baseCols.map((k) => ({ key: k, header: k, width: k === UCN ? 120 : 150 }));
  const allFields = headerKeys.map((k) => ({ key: k, header: k }));

  const actionsColumn: Column<Row> = {
    key: '_actions', header: 'Actions', width: 130, sortable: false, wrap: false,
    render: (row) => (
      <div className="row" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-sm" onClick={() => setDrawer({ row, mode: 'view' })}>View</button>
        {can('edit') && <button className="btn btn-sm" onClick={() => setDrawer({ row, mode: 'edit' })}>Update</button>}
      </div>
    ),
  };

  const editFields: FieldDef[] = headerKeys.map((k) => ({
    name: k,
    label: k,
    type: LONG.includes(k) ? 'textarea' : 'text',
    rows: LONG.includes(k) ? 2 : undefined,
    readOnly: READONLY.includes(k),
    span: LONG.includes(k) ? 2 : 1,
  }));

  const save = async (v: FormValues) => {
    if (!drawer) return;
    const ucn = String(drawer.row[UCN] ?? '');
    if (!ucn) { setMsg({ tone: 'error', text: 'This row has no UC Number to update by.' }); return; }
    // Only send changed, editable fields.
    const patch: Record<string, unknown> = {};
    headerKeys.forEach((k) => {
      if (READONLY.includes(k)) return;
      if (String(v[k] ?? '') !== String(drawer.row[k] ?? '')) patch[k] = v[k];
    });
    if (Object.keys(patch).length === 0) { setDrawer(null); return; }
    setBusy(true);
    try {
      const ok = await updateTabRow(ucn, patch, TAB);
      if (ok) {
        setRows((rs) => rs.map((r) => (r.id === drawer.row.id ? { ...r, ...patch } : r)));
        setMsg({ tone: 'ok', text: `Updated ${ucn} in ${TAB}.` });
        setDrawer(null);
      } else {
        setMsg({ tone: 'error', text: 'Update failed — check the connection.' });
      }
    } catch (e) {
      setMsg({ tone: 'error', text: `Update failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const visible = search.trim()
    ? rows.filter((r) => headerKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(search.toLowerCase())))
    : rows;

  return (
    <div>
      <PageHeader title="Call Updation" subtitle={`Update call reporting on the ${TAB} tab of the Call Register.`} icon="🛠️" />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <DataTable<Row>
        columns={can('edit') ? [...columns, actionsColumn] : columns}
        allFields={allFields}
        rows={visible}
        getRowId={(r) => r.id}
        storageKey="callUpdation"
        rowsBeforeScroll={14}
        dense
        onRowClick={(r) => setDrawer({ row: r, mode: 'view' })}
        emptyText="No rows — Refresh to load Reporting-N."
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="Search UCN, call number, engineer…" />
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off">⟳ {timeAgo(lastSync)}</span>}
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('reporting-n.csv', headerKeys.map((k) => ({ key: k, header: k })), visible as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer ? `${drawer.mode === 'edit' ? 'Update' : 'Call'} ${String(drawer.row[UCN] ?? '')}` : ''} width={760}>
        {drawer && (
          <SchemaForm
            key={drawer.row.id + drawer.mode}
            fields={editFields}
            initial={drawer.row as unknown as FormValues}
            readOnly={drawer.mode === 'view'}
            sectionOrderKey="callupdation"
            submitLabel={busy ? 'Saving…' : 'Save Update'}
            onSubmit={save}
            onCancel={() => setDrawer(null)}
            footer={drawer.mode === 'view' && can('edit') ? (
              <button type="button" className="btn btn-primary" onClick={() => setDrawer({ row: drawer.row, mode: 'edit' })}>Update</button>
            ) : undefined}
          />
        )}
      </Drawer>
    </div>
  );
}

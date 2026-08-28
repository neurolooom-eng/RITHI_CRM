import { useEffect, useMemo, useState } from 'react';
import { db, genId, type BaseRecord } from '../lib/db';
import { useCollection } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { DataTable, type Column } from '../components/table/DataTable';
import { SchemaForm, type FieldDef, type FormValues } from '../components/form/Form';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, engineerOptions, fmtDateTime, statusBadge } from '../lib/format';
import { C } from './collections';
import {
  addFieldCall,
  listFieldCalls,
  searchProducts,
  sheetsConfigured,
  updateFieldCall,
} from '../lib/sheets';
import './fieldcalls.css';
import {
  CALL_ACCEPTANCE,
  FC_CALL_STATUS,
  FC_CONTRACT_TYPE,
  FC_STATUS_TONES,
  ITEM_STATUS,
  OPEN_CLOSE,
  REGIONS,
  makeLocalUcn,
  productToCallPrefill,
  toSheetDate,
} from '../lib/fieldcall';

// ===========================================================================
// FIELD CALL REGISTER — operational.
// Reads and writes the real "F_I Call Register" Google Sheet through the Apps
// Script bridge (src/lib/sheets.ts). New calls are appended to the sheet with a
// server-assigned UCN. When no sheet is connected (or a write fails) calls are
// saved locally and can be pushed later with "Sync pending".
// Reuses the Table + Form + Drawer design systems.
// ===========================================================================

type Rec = BaseRecord & { _synced?: boolean; _pending?: boolean };

const OPT = (arr: string[]) => arr.map((v) => ({ value: v, label: v }));

// ---- Add / edit form schema (mapped to the sheet columns) -----------------
const FIELD_CALL_FIELDS: FieldDef[] = [
  // Registration (auto-assigned)
  { name: 'ucn', label: 'UC Number (UCN)', section: 'Registration', readOnly: true, help: 'Assigned automatically on save — matches the sheet format (e.g. 26A02F0001).', span: 1 },
  { name: 'regDate', label: 'Call Registration Date', section: 'Registration', readOnly: true, help: 'Stamped automatically.', span: 1 },
  { name: 'callNumber', label: 'Call Number', section: 'Registration', placeholder: 'e.g. WI-ORION-G-2354', span: 1 },
  { name: 'complaintDate', label: 'Complaint Date', type: 'date', section: 'Registration', required: true, span: 1 },

  // Customer & product
  { name: 'partyName', label: 'Party Name', section: 'Customer & Product', required: true, span: 2 },
  { name: 'city', label: 'City', section: 'Customer & Product', span: 1 },
  { name: 'state', label: 'State', section: 'Customer & Product', span: 1 },
  { name: 'productName', label: 'Product Name', section: 'Customer & Product', required: true, span: 1 },
  { name: 'serial', label: 'Product Serial Number', section: 'Customer & Product', span: 1 },
  { name: 'itemStatus', label: 'Item Status', type: 'select', options: OPT(ITEM_STATUS), section: 'Customer & Product', span: 1 },

  // Warranty & contract
  { name: 'warrantyNumber', label: 'Warranty Number', section: 'Warranty & Contract', span: 1 },
  { name: 'warrantyStart', label: 'Warranty Start', section: 'Warranty & Contract', placeholder: 'e.g. 24-December-2025', span: 1 },
  { name: 'warrantyEnd', label: 'Warranty End', section: 'Warranty & Contract', placeholder: 'e.g. 23-December-2026', span: 1 },
  { name: 'contractNumber', label: 'Contract Number', section: 'Warranty & Contract', span: 1 },
  { name: 'contractStart', label: 'Contract Start', section: 'Warranty & Contract', span: 1 },
  { name: 'contractEnd', label: 'Contract End', section: 'Warranty & Contract', span: 1 },
  { name: 'contractType', label: 'Contract Type', type: 'select', options: OPT(FC_CONTRACT_TYPE), section: 'Warranty & Contract', span: 1 },

  // Complaint
  { name: 'standardComplaint', label: 'Standard Complaint', section: 'Complaint', span: 2 },
  { name: 'complaintReported', label: 'Complaint Reported', type: 'textarea', rows: 2, section: 'Complaint', required: true, span: 2 },

  // Allocation
  { name: 'allocatedTo', label: 'Call Allocated To', type: 'select', options: engineerOptions, section: 'Allocation', span: 1 },
  { name: 'engineerEmail', label: 'Engineer Email', type: 'email', section: 'Allocation', span: 1 },
  { name: 'reportingManager', label: 'Reporting Manager', section: 'Allocation', span: 1 },
  { name: 'regionalManager', label: 'Regional Manager', section: 'Allocation', span: 1 },
  { name: 'region', label: 'Region', type: 'select', options: OPT(REGIONS), section: 'Allocation', span: 1 },
  { name: 'callAcceptance', label: 'Call Acceptance', type: 'select', options: OPT(CALL_ACCEPTANCE), section: 'Allocation', span: 1 },
  { name: 'openClose', label: 'Open / Close', type: 'select', options: OPT(OPEN_CLOSE), section: 'Allocation', span: 1 },
  { name: 'callStatus', label: 'Call Status', type: 'select', options: OPT(FC_CALL_STATUS), section: 'Allocation', span: 1 },

  // Resolution (filled during / after the visit)
  { name: 'visitingEngineer', label: 'Visiting Service Engineer', section: 'Resolution', span: 1 },
  { name: 'visitDateTime', label: 'Visit Date & Time', section: 'Resolution', span: 1 },
  { name: 'breakdownDate', label: 'Breakdown Date', section: 'Resolution', span: 1 },
  { name: 'pendingReason', label: 'Call Pending Reason', section: 'Resolution', span: 1 },
  { name: 'observation', label: 'Complaint Observation', type: 'textarea', rows: 2, section: 'Resolution', span: 2 },
  { name: 'jobDone', label: 'Job Done', type: 'textarea', rows: 2, section: 'Resolution', span: 2 },
  { name: 'serviceReport', label: 'Service Report (link)', section: 'Resolution', span: 2 },
  { name: 'solvedDateTime', label: 'Call Solved Date & Time', section: 'Resolution', span: 1 },
  { name: 'contractQuote', label: 'Contract Quote', section: 'Resolution', span: 1 },
  { name: 'spareQuote', label: 'Spare Quote', section: 'Resolution', span: 1 },
];

const COLUMNS: Column<Rec>[] = [
  {
    key: '_sync', header: '', width: 44, sortable: false, wrap: false, align: 'center',
    render: (r) => (r._pending ? <span title="Not yet in the sheet">⏳</span> : <span title="In the sheet" className="muted">✓</span>),
  },
  { key: 'ucn', header: 'UCN', width: 120, wrap: false },
  { key: 'callType', header: 'Type', width: 90, wrap: false },
  { key: 'callNumber', header: 'Call Number', width: 150 },
  { key: 'regDate', header: 'Registered', width: 130 },
  { key: 'partyName', header: 'Party Name', width: 200 },
  { key: 'city', header: 'City', width: 100 },
  { key: 'productName', header: 'Product', width: 120 },
  { key: 'serial', header: 'Serial', width: 90, wrap: false },
  { key: 'itemStatus', header: 'Item', width: 70, wrap: false },
  { key: 'complaintReported', header: 'Complaint', width: 220 },
  { key: 'allocatedTo', header: 'Allocated To', width: 140 },
  { key: 'region', header: 'Region', width: 90, wrap: false },
  { key: 'callStatus', header: 'Status', width: 150, render: (r) => statusBadge(r.callStatus, FC_STATUS_TONES) },
  { key: 'openClose', header: 'Open/Close', width: 100, render: (r) => statusBadge(r.openClose, FC_STATUS_TONES) },
];

// Search the Product Master and prefill the form from the chosen item.
function ProductLookup({ onPick }: { onPick: (p: Record<string, unknown>) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState('');

  const run = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setErr('');
    setPicked('');
    try {
      const r = await searchProducts(q.trim(), 10);
      setRows(r);
      if (r.length === 0) setErr('No products matched — check the serial / item code, or fill the fields manually.');
    } catch (e) {
      setErr(`Product lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="prod-lookup">
      <div className="prod-lookup-head">🔎 Fetch from Product Master</div>
      <div className="call-add-row">
        <input
          className="input"
          placeholder="Serial no., item code, product or party…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run(); } }}
        />
        <button className="btn btn-sm" onClick={() => void run()} disabled={busy || !q.trim()}>
          {busy ? '…' : 'Search'}
        </button>
      </div>
      {err && <div className="muted prod-err">{err}</div>}
      {picked && <div className="muted prod-picked">✓ Filled from {picked} — review & complete the complaint details below.</div>}
      {rows.length > 0 && (
        <div className="prod-results">
          {rows.map((p, i) => (
            <button
              type="button"
              className="prod-result"
              key={i}
              onClick={() => {
                onPick(p);
                setPicked(`${String(p['Item Name'] ?? '')} · ${String(p['Item Serial Number'] ?? '')}`);
                setRows([]);
              }}
            >
              <div><b>{String(p['Item Name'] ?? '—')}</b> · {String(p['Item Serial Number'] ?? '')}</div>
              <div className="muted">
                {String(p['Party Name'] ?? '')} — {String(p['City'] ?? '')}, {String(p['State'] ?? '')}
                {p['Item Status'] ? ` · ${String(p['Item Status'])}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const DATE_KEYS_TO_SHEET = ['complaintDate']; // picker (ISO) → sheet style on save

function buildPayload(values: FormValues): Record<string, unknown> {
  const rec: Record<string, unknown> = { ...values };
  DATE_KEYS_TO_SHEET.forEach((k) => {
    if (rec[k]) rec[k] = toSheetDate(rec[k]);
  });
  rec.callType = 'FIELD';
  return rec;
}

export function FieldCalls() {
  const cached = useCollection<Rec>(C.fieldCalls);
  const { user, can } = useAuth();
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState<{ mode: 'create' | 'edit' | 'view'; row?: Rec } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadLimit, setLoadLimit] = useState(300);
  const [typeFilter, setTypeFilter] = useState(''); // '' = all call types
  const [prefill, setPrefill] = useState<FormValues | undefined>(undefined);
  const [prefillKey, setPrefillKey] = useState(0);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const configured = sheetsConfigured();
  const pendingCount = cached.filter((r) => r._pending).length;

  // Pull the register from the sheet on first mount (and on manual refresh).
  // Capped to the most recent `limit` FIELD calls — the sheet holds thousands.
  const refresh = async (limit = loadLimit, type = typeFilter) => {
    if (!configured) {
      setBanner({ tone: 'info', text: 'Not connected to a Google Sheet. Add the Web App URL in Settings → Google Sheet Connection to load & publish calls. New calls are saved locally until then.' });
      return;
    }
    setBusy(true);
    setBanner({ tone: 'info', text: 'Loading calls from the Google Sheet…' });
    try {
      const rows = await listFieldCalls(type, limit);
      // Replace the synced cache; keep locally-pending rows.
      db.list(C.fieldCalls)
        .filter((r) => (r as Rec)._synced)
        .forEach((r) => db.remove(C.fieldCalls, r.id));
      // Insert oldest-first so the newest sit on top after the reverse in
      // visibleRows, and freshly-added calls also appear at the top.
      [...rows]
        .reverse()
        .forEach((r) => db.insert(C.fieldCalls, { ...r, id: String(r.ucn || genId()), _synced: true }));
      const capped = rows.length >= limit;
      const label = type ? `${type.toLowerCase()} calls` : 'calls (all types)';
      setBanner({
        tone: 'ok',
        text: `Loaded ${rows.length} ${label}${capped ? ` — most recent ${limit}; use “Load more” for older` : ''}.`,
      });
    } catch (e) {
      setBanner({ tone: 'error', text: `Could not reach the sheet: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveLocal = (rec: Record<string, unknown>, note: string) => {
    const existing = db.list(C.fieldCalls).map((r) => String((r as Rec).ucn ?? ''));
    const ucn = makeLocalUcn('FIELD', new Date(), existing);
    db.insert(C.fieldCalls, {
      ...rec,
      id: genId(),
      ucn,
      regDate: fmtDateTime(new Date().toISOString()),
      callType: 'FIELD',
      _pending: true,
      ownerId: user?.id,
    });
    setBanner({ tone: 'info', text: `${note} Saved locally as ${ucn}.` });
  };

  const handleCreate = async (values: FormValues) => {
    const rec = buildPayload(values);
    setBusy(true);
    try {
      if (configured) {
        const res = await addFieldCall(rec);
        if (res.ok && res.record) {
          db.insert(C.fieldCalls, { ...res.record, id: String(res.ucn), _synced: true, ownerId: user?.id });
          setBanner({ tone: 'ok', text: `Field call registered in the sheet as ${res.ucn}.` });
        } else {
          saveLocal(rec, `Sheet write failed (${res.error}).`);
        }
      } else {
        saveLocal(rec, 'No sheet connected.');
      }
      setDrawer(null);
    } catch (e) {
      saveLocal(rec, `Sheet write failed (${e instanceof Error ? e.message : String(e)}).`);
      setDrawer(null);
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async (values: FormValues) => {
    const row = drawer?.row;
    if (!row) return;
    const patch = buildPayload(values);
    setBusy(true);
    try {
      if (row._synced && configured) {
        const res = await updateFieldCall(String(row.ucn), patch);
        if (!res.ok) {
          setBanner({ tone: 'error', text: `Sheet update failed: ${res.error}` });
          setBusy(false);
          return;
        }
      }
      db.update(C.fieldCalls, row.id, patch);
      setBanner({ tone: 'ok', text: `Call ${row.ucn} updated${row._synced ? ' in the sheet' : ''}.` });
      setDrawer(null);
    } finally {
      setBusy(false);
    }
  };

  const syncPending = async () => {
    if (!configured) return;
    const pend = db.list(C.fieldCalls).filter((r) => (r as Rec)._pending) as Rec[];
    if (pend.length === 0) return;
    setBusy(true);
    let done = 0;
    for (const p of pend) {
      // Strip local-only fields; let the server assign a fresh UCN.
      const { id, ucn, _pending, _synced, regDate, ...rest } = p;
      void id; void ucn; void _pending; void _synced; void regDate;
      try {
        const res = await addFieldCall(rest);
        if (res.ok && res.record) {
          db.remove(C.fieldCalls, p.id);
          db.insert(C.fieldCalls, { ...res.record, id: String(res.ucn), _synced: true, ownerId: p.ownerId });
          done++;
        }
      } catch {
        /* leave as pending */
      }
    }
    setBusy(false);
    setBanner({ tone: done === pend.length ? 'ok' : 'error', text: `Synced ${done}/${pend.length} pending calls to the sheet.` });
  };

  const visibleRows = useMemo(() => {
    let r = cached;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((row) =>
        ['ucn', 'callNumber', 'partyName', 'city', 'productName', 'serial', 'complaintReported', 'allocatedTo', 'region', 'callStatus'].some(
          (k) => String(row[k] ?? '').toLowerCase().includes(q),
        ),
      );
    }
    // Newest first: cache already appends in load order; reverse for recency.
    return [...r].reverse();
  }, [cached, search]);

  const actionsColumn: Column<Rec> = {
    key: '_actions', header: 'Actions', width: 150, sortable: false, wrap: false,
    render: (row) => (
      <div className="row" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-sm" onClick={() => setDrawer({ mode: 'view', row })}>View</button>
        {can('edit') && <button className="btn btn-sm" onClick={() => setDrawer({ mode: 'edit', row })}>Edit</button>}
      </div>
    ),
  };

  return (
    <div>
      <PageHeader
        title="Field Call Register"
        subtitle="Live against the F_I Call Register Google Sheet — new calls get a UCN and are written back."
        icon="📡"
        actions={
          can('edit') && (
            <button
              className="btn btn-primary"
              onClick={() => { setPrefill(undefined); setPrefillKey((k) => k + 1); setDrawer({ mode: 'create' }); }}
            >
              + New Field Call
            </button>
          )
        }
      />

      {banner && (
        <div className={`sheet-banner sheet-banner-${banner.tone}`}>
          <span>{banner.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setBanner(null)}>✕</button>
        </div>
      )}

      <DataTable<Rec>
        columns={[...COLUMNS, actionsColumn]}
        rows={visibleRows}
        getRowId={(r) => r.id}
        storageKey="fieldCalls"
        rowsBeforeScroll={12}
        onRowClick={(r) => setDrawer({ mode: 'view', row: r })}
        emptyText={configured ? 'No field calls yet. Click “New Field Call”.' : 'Connect the Google Sheet in Settings to load calls, or add one now (saved locally).'}
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="Search UCN, party, product, serial…" />
            <select
              className="select"
              value={typeFilter}
              onChange={(e) => { const t = e.target.value; setTypeFilter(t); void refresh(loadLimit, t); }}
              title="Filter by call type"
            >
              <option value="">All call types</option>
              <option value="FIELD">Field</option>
              <option value="INSTALLATION CALL">Installation</option>
            </select>
            <button className="btn btn-sm" onClick={() => void refresh()} disabled={busy}>
              {busy ? '…' : '↻ Refresh'}
            </button>
            {configured && cached.filter((r) => r._synced).length >= loadLimit && (
              <button
                className="btn btn-sm"
                onClick={() => { const n = loadLimit + 300; setLoadLimit(n); void refresh(n); }}
                disabled={busy}
                title="Load older field calls"
              >
                ↓ Load more
              </button>
            )}
            {pendingCount > 0 && (
              <button className="btn btn-sm btn-primary" onClick={() => void syncPending()} disabled={busy || !configured}>
                ⇪ Sync {pendingCount} pending
              </button>
            )}
            <div className="spacer" />
            <span className={`conn-dot ${configured ? 'conn-on' : 'conn-off'}`} title={configured ? 'Connected to Google Sheet' : 'Not connected'}>
              {configured ? '● Sheet connected' : '○ Not connected'}
            </span>
            <button
              className="btn btn-sm"
              onClick={() =>
                csvExport('field-calls.csv', COLUMNS.filter((c) => c.key[0] !== '_').map((c) => ({ key: c.key, header: c.header })), visibleRows as unknown as Record<string, unknown>[])
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
          drawer?.mode === 'create' ? 'New Field Call'
            : drawer?.mode === 'edit' ? `Edit ${String(drawer.row?.ucn ?? 'Call')}`
              : `Field Call ${String(drawer?.row?.ucn ?? '')}`
        }
        width={760}
      >
        {drawer && (
          <>
            {drawer.row?._pending && (
              <div className="detail-hint" style={{ color: 'var(--warning, #b45309)' }}>
                ⏳ Saved locally, not yet in the sheet. Use “Sync {pendingCount} pending” once a sheet is connected.
              </div>
            )}
            {drawer.mode === 'create' && configured && (
              <ProductLookup
                onPick={(p) => { setPrefill(productToCallPrefill(p)); setPrefillKey((k) => k + 1); }}
              />
            )}
            <SchemaForm
              key={drawer.mode === 'create' ? `create-${prefillKey}` : String(drawer.row?.id)}
              fields={FIELD_CALL_FIELDS}
              initial={drawer.mode === 'create' ? prefill : (drawer.row as unknown as FormValues)}
              readOnly={drawer.mode === 'view'}
              submitLabel={busy ? 'Saving…' : drawer.mode === 'edit' ? 'Save Changes' : 'Register Field Call'}
              onSubmit={drawer.mode === 'edit' ? handleEdit : handleCreate}
              onCancel={() => setDrawer(null)}
              footer={
                drawer.mode === 'view' && can('edit') ? (
                  <button type="button" className="btn btn-primary" onClick={() => setDrawer({ mode: 'edit', row: drawer.row })}>Edit</button>
                ) : undefined
              }
            />
          </>
        )}
      </Drawer>
    </div>
  );
}

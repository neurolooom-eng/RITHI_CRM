import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { db, genId, type BaseRecord } from '../lib/db';
import { useCollection } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { DataTable, type Column } from '../components/table/DataTable';
import { SchemaForm, type FieldDef, type FormValues } from '../components/form/Form';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, engineerOptions, fmtDateTime } from '../lib/format';
import { C } from './collections';
import {
  addFieldCall,
  listFieldCalls,
  listParties,
  listPartyItems,
  listPartyProducts,
  sheetsConfigured,
  updateFieldCall,
} from '../lib/sheets';
import './fieldcalls.css';
import {
  FC_CONTRACT_TYPE,
  ITEM_STATUS,
  MODE_OF_REPORTING,
  PERSON_CALLING,
  YES_NO,
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

// ---- Add / edit form schema (mapped to the FIELD tab columns) -------------
const FIELD_CALL_FIELDS: FieldDef[] = [
  // Registration (auto-assigned)
  { name: 'ucn', label: 'UC Number (UCN)', section: 'Registration', readOnly: true, help: 'Assigned automatically on save — matches the sheet UCN format.', span: 1 },
  { name: 'regDate', label: 'Call Registration Date', section: 'Registration', readOnly: true, help: 'Stamped automatically.', span: 1 },
  { name: 'callNumber', label: 'Call Number', section: 'Registration', placeholder: 'e.g. R18447-MONNAL T75-7909', span: 1 },
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

  // Complaint & allocation
  { name: 'standardComplaint', label: 'Standard Complaint', section: 'Complaint', span: 2 },
  { name: 'complaintReported', label: 'Complaint Reported', type: 'textarea', rows: 2, section: 'Complaint', required: true, span: 2 },
  { name: 'allocatedTo', label: 'Call Allocated To', type: 'select', options: engineerOptions, section: 'Complaint', span: 1 },
  { name: 'breakdownDate', label: 'Breakdown Date', type: 'date', section: 'Complaint', span: 1 },

  // Reporting / risk
  { name: 'personCalling', label: 'Person Calling', type: 'select', options: OPT(PERSON_CALLING), section: 'Reporting', span: 1 },
  { name: 'modeOfReporting', label: 'Mode of Complaint Reporting', type: 'select', options: OPT(MODE_OF_REPORTING), section: 'Reporting', span: 1 },
  { name: 'publicHealthThreat', label: 'Public Health Threat?', type: 'select', options: OPT(YES_NO), section: 'Reporting', span: 1, defaultValue: 'NO' },
  { name: 'death', label: 'Death?', type: 'select', options: OPT(YES_NO), section: 'Reporting', span: 1, defaultValue: 'NO' },
  { name: 'seriousIncident', label: 'Serious Incident?', type: 'select', options: OPT(YES_NO), section: 'Reporting', span: 1, defaultValue: 'NO' },

  // Customer contact
  { name: 'customerName', label: 'Customer Name', section: 'Customer Contact', span: 1 },
  { name: 'customerNumber', label: 'Customer Number', type: 'tel', section: 'Customer Contact', span: 1 },
  { name: 'customerDesignation', label: 'Customer Designation', section: 'Customer Contact', span: 1 },
  { name: 'emailAddress', label: 'Email address', type: 'email', section: 'Customer Contact', span: 1 },
];

const COLUMNS: Column<Rec>[] = [
  {
    key: '_sync', header: '', width: 44, sortable: false, wrap: false, align: 'center',
    render: (r) => (r._pending ? <span title="Not yet in the sheet">⏳</span> : <span title="In the sheet" className="muted">✓</span>),
  },
  { key: 'ucn', header: 'UCN', width: 120, wrap: false },
  { key: 'callNumber', header: 'Call Number', width: 170 },
  { key: 'regDate', header: 'Registered', width: 140 },
  { key: 'complaintDate', header: 'Complaint Date', width: 120 },
  { key: 'partyName', header: 'Party Name', width: 220 },
  { key: 'city', header: 'City', width: 110 },
  { key: 'state', header: 'State', width: 110 },
  { key: 'productName', header: 'Product', width: 130 },
  { key: 'serial', header: 'Serial', width: 90, wrap: false },
  { key: 'itemStatus', header: 'Item', width: 70, wrap: false },
  { key: 'standardComplaint', header: 'Standard Complaint', width: 220 },
  { key: 'complaintReported', header: 'Complaint Reported', width: 200 },
  { key: 'allocatedTo', header: 'Allocated To', width: 150 },
  { key: 'personCalling', header: 'Person Calling', width: 130 },
];

// Session cache of party names (loaded once from Party Master).
let cachedParties: string[] | null = null;

// Cascade picker: Party → Product → Serial, prefilling the form from the item.
function ProductLookup({ onPick }: { onPick: (p: Record<string, unknown>) => void }) {
  const [parties, setParties] = useState<string[]>(cachedParties ?? []);
  const [party, setParty] = useState('');
  const [products, setProducts] = useState<string[]>([]);
  const [product, setProduct] = useState('');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [serial, setSerial] = useState('');
  const [busy, setBusy] = useState<'' | 'parties' | 'products' | 'items'>('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (cachedParties) return;
    setBusy('parties');
    listParties()
      .then((p) => { cachedParties = p; setParties(p); })
      .catch((e) => setErr(`Couldn't load parties: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setBusy(''));
  }, []);

  const pick = (row: Record<string, unknown>) => {
    setSerial(String(row['Item Serial Number'] ?? ''));
    onPick(row);
  };

  const onParty = async (val: string) => {
    setParty(val); setProduct(''); setProducts([]); setItems([]); setSerial('');
    if (!val || !parties.includes(val)) return;
    setBusy('products'); setErr('');
    try {
      const p = await listPartyProducts(val);
      setProducts(p);
      if (p.length === 0) setErr('No products found for this party in Product Master.');
    } catch (e) {
      setErr(`Products lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(''); }
  };

  const onProduct = async (val: string) => {
    setProduct(val); setItems([]); setSerial('');
    if (!val) return;
    setBusy('items'); setErr('');
    try {
      const rows = await listPartyItems(party, val);
      setItems(rows);
      if (rows.length === 1) pick(rows[0]); // single serial → auto-select
    } catch (e) {
      setErr(`Serials lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(''); }
  };

  // Filter the party datalist to the current input (cap for performance).
  const partyMatches = party.length >= 2
    ? parties.filter((p) => p.toLowerCase().includes(party.toLowerCase())).slice(0, 50)
    : [];

  return (
    <div className="prod-lookup">
      <div className="prod-lookup-head">🔎 Fetch from Product Master &nbsp;<span className="muted">Party → Product → Serial</span></div>

      <div className="cascade-grid">
        <label className="cascade-field">
          <span>Party {busy === 'parties' && <span className="muted">loading…</span>}</span>
          <input
            className="input"
            list="cascade-parties"
            placeholder="Type to search party…"
            value={party}
            onChange={(e) => void onParty(e.target.value)}
          />
          <datalist id="cascade-parties">
            {partyMatches.map((p) => <option key={p} value={p} />)}
          </datalist>
        </label>

        <label className="cascade-field">
          <span>Product {busy === 'products' && <span className="muted">loading…</span>}</span>
          <select className="select" value={product} disabled={products.length === 0} onChange={(e) => void onProduct(e.target.value)}>
            <option value="">{products.length ? '— Select product —' : '(pick a party first)'}</option>
            {products.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>

        <label className="cascade-field">
          <span>Serial {busy === 'items' && <span className="muted">loading…</span>}</span>
          <select
            className="select"
            value={serial}
            disabled={items.length === 0}
            onChange={(e) => {
              const row = items.find((r) => String(r['Item Serial Number']) === e.target.value);
              if (row) pick(row);
            }}
          >
            <option value="">{items.length ? '— Select serial —' : '(pick a product first)'}</option>
            {items.map((r, i) => (
              <option key={i} value={String(r['Item Serial Number'] ?? '')}>
                {String(r['Item Serial Number'] ?? '')}{r['Item Status'] ? ` · ${String(r['Item Status'])}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {err && <div className="muted prod-err">{err}</div>}
      {serial && <div className="muted prod-picked">✓ Filled from serial {serial} — review & complete the complaint details below.</div>}
    </div>
  );
}

const DATE_KEYS_TO_SHEET = ['complaintDate']; // picker (ISO) → sheet style on save

function buildPayload(values: FormValues, callType: string): Record<string, unknown> {
  const rec: Record<string, unknown> = { ...values };
  DATE_KEYS_TO_SHEET.forEach((k) => {
    if (rec[k]) rec[k] = toSheetDate(rec[k]);
  });
  rec.callType = callType;
  return rec;
}

// Configuration for one call register screen (FIELD tab or INST tab).
export interface CallSheetConfig {
  tab: string;          // sheet tab name, e.g. 'FIELD' / 'INST'
  callType: string;     // written into Call Type, e.g. 'FIELD' / 'INSTALLATION CALL'
  singular: string;     // 'Field Call' / 'Installation Call'
  title: string;
  subtitle: string;
  icon: ReactNode;
  collection: string;   // cache collection name
  storageKey: string;   // table layout key
  csvName: string;
}

export const FIELD_CONFIG: CallSheetConfig = {
  tab: 'FIELD',
  callType: 'FIELD',
  singular: 'Field Call',
  title: 'Field Call Register',
  subtitle: 'Live against the FIELD tab of the Call Register — new calls get a UCN and are written back.',
  icon: '📡',
  collection: C.fieldCalls,
  storageKey: 'fieldCalls',
  csvName: 'field-calls.csv',
};

export const INST_CONFIG: CallSheetConfig = {
  tab: 'INST',
  callType: 'INSTALLATION CALL',
  singular: 'Installation Call',
  title: 'Installation Call Register',
  subtitle: 'Live against the INST tab of the Call Register — new calls get a UCN and are written back.',
  icon: '🔧',
  collection: C.instCalls,
  storageKey: 'instCalls',
  csvName: 'installation-calls.csv',
};

export function FieldCalls() {
  return <CallSheetModule config={FIELD_CONFIG} />;
}
export function InstallationCalls() {
  return <CallSheetModule config={INST_CONFIG} />;
}

function CallSheetModule({ config }: { config: CallSheetConfig }) {
  const cached = useCollection<Rec>(config.collection);
  const { user, can } = useAuth();
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState<{ mode: 'create' | 'edit' | 'view'; row?: Rec } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadLimit, setLoadLimit] = useState(300);
  const [prefill, setPrefill] = useState<FormValues | undefined>(undefined);
  const [prefillKey, setPrefillKey] = useState(0);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const configured = sheetsConfigured();
  const pendingCount = cached.filter((r) => r._pending).length;
  const location = useLocation();

  // Pull the register tab on first mount (and on manual refresh). Capped to the
  // most recent `limit` rows — the sheet holds thousands.
  const refresh = async (limit = loadLimit) => {
    if (!configured) {
      setBanner({ tone: 'info', text: 'Not connected to a Google Sheet. Add the Web App URL in Settings → Google Sheet Connection to load & publish calls. New calls are saved locally until then.' });
      return;
    }
    setBusy(true);
    setBanner({ tone: 'info', text: 'Loading calls from the Google Sheet…' });
    try {
      const rows = await listFieldCalls('', limit, config.tab);
      // Replace the synced cache; keep locally-pending rows.
      db.list(config.collection)
        .filter((r) => (r as Rec)._synced)
        .forEach((r) => db.remove(config.collection, r.id));
      // Insert oldest-first so the newest sit on top after the reverse in
      // visibleRows, and freshly-added calls also appear at the top.
      [...rows]
        .reverse()
        .forEach((r) => db.insert(config.collection, { ...r, id: String(r.ucn || genId()), _synced: true }));
      const capped = rows.length >= limit;
      setBanner({
        tone: 'ok',
        text: `Loaded ${rows.length} ${config.singular.toLowerCase()}s${capped ? ` — most recent ${limit}; use “Load more” for older` : ''}.`,
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

  // Arriving with a prefill (e.g. "Register Call" from Product Master) opens the
  // create drawer pre-populated from the chosen item.
  useEffect(() => {
    const st = location.state as { prefill?: Record<string, unknown> } | null;
    if (st?.prefill) {
      setPrefill(st.prefill as FormValues);
      setPrefillKey((k) => k + 1);
      setDrawer({ mode: 'create' });
      window.history.replaceState({}, ''); // consume so it doesn't re-trigger
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const saveLocal = (rec: Record<string, unknown>, note: string) => {
    const existing = db.list(config.collection).map((r) => String((r as Rec).ucn ?? ''));
    const ucn = makeLocalUcn(config.callType, new Date(), existing);
    db.insert(config.collection, {
      ...rec,
      id: genId(),
      ucn,
      regDate: fmtDateTime(new Date().toISOString()),
      callType: config.callType,
      _pending: true,
      ownerId: user?.id,
    });
    setBanner({ tone: 'info', text: `${note} Saved locally as ${ucn}.` });
  };

  const handleCreate = async (values: FormValues) => {
    const rec = buildPayload(values, config.callType);
    setBusy(true);
    try {
      if (configured) {
        const res = await addFieldCall(rec, config.tab);
        if (res.ok && res.record) {
          db.insert(config.collection, { ...res.record, id: String(res.ucn), _synced: true, ownerId: user?.id });
          setBanner({ tone: 'ok', text: `${config.singular} registered in the sheet as ${res.ucn}.` });
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
    const patch = buildPayload(values, config.callType);
    setBusy(true);
    try {
      if (row._synced && configured) {
        const res = await updateFieldCall(String(row.ucn), patch, config.tab);
        if (!res.ok) {
          setBanner({ tone: 'error', text: `Sheet update failed: ${res.error}` });
          setBusy(false);
          return;
        }
      }
      db.update(config.collection, row.id, patch);
      setBanner({ tone: 'ok', text: `Call ${row.ucn} updated${row._synced ? ' in the sheet' : ''}.` });
      setDrawer(null);
    } finally {
      setBusy(false);
    }
  };

  const syncPending = async () => {
    if (!configured) return;
    const pend = db.list(config.collection).filter((r) => (r as Rec)._pending) as Rec[];
    if (pend.length === 0) return;
    setBusy(true);
    let done = 0;
    for (const p of pend) {
      // Strip local-only fields; let the server assign a fresh UCN.
      const { id, ucn, _pending, _synced, regDate, ...rest } = p;
      void id; void ucn; void _pending; void _synced; void regDate;
      try {
        const res = await addFieldCall(rest, config.tab);
        if (res.ok && res.record) {
          db.remove(config.collection, p.id);
          db.insert(config.collection, { ...res.record, id: String(res.ucn), _synced: true, ownerId: p.ownerId });
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
        ['ucn', 'callNumber', 'partyName', 'city', 'state', 'productName', 'serial', 'standardComplaint', 'complaintReported', 'allocatedTo', 'customerName'].some(
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
        title={config.title}
        subtitle={config.subtitle}
        icon={config.icon}
        actions={
          can('edit') && (
            <button
              className="btn btn-primary"
              onClick={() => { setPrefill(undefined); setPrefillKey((k) => k + 1); setDrawer({ mode: 'create' }); }}
            >
              + New {config.singular}
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
        storageKey={config.storageKey}
        rowsBeforeScroll={12}
        onRowClick={(r) => setDrawer({ mode: 'view', row: r })}
        emptyText={configured ? `No ${config.singular.toLowerCase()}s yet. Click “New ${config.singular}”.` : 'Connect the Google Sheet in Settings to load calls, or add one now (saved locally).'}
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="Search UCN, party, product, serial…" />
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
                csvExport(config.csvName, COLUMNS.filter((c) => c.key[0] !== '_').map((c) => ({ key: c.key, header: c.header })), visibleRows as unknown as Record<string, unknown>[])
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
          drawer?.mode === 'create' ? `New ${config.singular}`
            : drawer?.mode === 'edit' ? `Edit ${String(drawer.row?.ucn ?? 'Call')}`
              : `${config.singular} ${String(drawer?.row?.ucn ?? '')}`
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
              submitLabel={busy ? 'Saving…' : drawer.mode === 'edit' ? 'Save Changes' : `Register ${config.singular}`}
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

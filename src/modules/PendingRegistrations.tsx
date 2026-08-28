import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { SchemaForm, type FormValues } from '../components/form/Form';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { addFieldCall, listPending, searchProducts, setPendingUcn, sheetsConfigured } from '../lib/sheets';
import { productToCallPrefill } from '../lib/fieldcall';
import { todayISO } from '../lib/format';
import { buildCreateFields, buildPayload, ProductLookup, FIELD_CONFIG, INST_CONFIG, type CallSheetConfig } from './FieldCalls';
import { db } from '../lib/db';
import { C } from './collections';
import { useAuth } from '../lib/auth';
import './fieldcalls.css';

// ===========================================================================
// PENDING CALL REGISTRATIONS — Data-2026 rows without a UC Number.
// Clicking Register opens a split view: the request details on the left, the
// call registration form on the right. Party / Product / Serial come from the
// REQUEST (authoritative); Product Master only fills warranty/contract/status
// on an EXACT serial match, so nothing is overwritten with a wrong item.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

// Fields Product Master may fill on a validated (exact) serial — never the
// identifying party/product/serial, which stay from the request.
const PRODMASTER_FILL = ['itemStatus', 'warrantyNumber', 'warrantyStart', 'warrantyEnd', 'contractNumber', 'contractStart', 'contractEnd', 'contractType'];
const g = (r: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) { const v = r[k]; if (v != null && String(v).trim() !== '') return String(v); } return ''; };

const COLUMNS: Column<Row>[] = [
  { key: 'Timestamp', header: 'Requested', width: 140, wrap: false },
  { key: 'ENGINEER', header: 'Engineer', width: 150 },
  { key: 'CALL TYPE', header: 'Type', width: 100, wrap: false },
  { key: 'PARTY NAME', header: 'Party', width: 210 },
  { key: 'City', header: 'City', width: 100 },
  { key: 'PRODUCT', header: 'Product', width: 120 },
  { key: 'SERIAL NO', header: 'Serial', width: 90, wrap: false },
  { key: 'Reported Problem', header: 'Reported Problem', width: 220 },
  { key: 'PLAN DATE (Visit Planned Date)', header: 'Plan Date', width: 110, wrap: false },
];

export function PendingRegistrations() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<{ row: Row; prefill: FormValues; config: CallSheetConfig } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    sheetsConfigured() ? null : { tone: 'info', text: 'Connect the Google Sheet in Settings to load pending registrations.' },
  );

  const load = async () => {
    if (!sheetsConfigured()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Loading pending registrations…' });
    try {
      const r = await listPending(300);
      setRows(r.map((p, i) => ({ ...p, id: String((p as { _row?: number })._row ?? i) })));
      setMsg({ tone: 'ok', text: `${r.length} pending call registration${r.length === 1 ? '' : 's'} (no UCN yet).` });
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const register = async (row: Row) => {
    setBusy(true);
    setMsg({ tone: 'info', text: 'Checking Product Master…' });
    try {
      const serial = g(row, 'SERIAL NO', 'SERIAL NO (1)', 'Serial', 'Product Serial Number').trim();

      // (a) Validate against Product Master by EXACT serial. Only fill
      //     warranty/contract/status — never overwrite party/product/serial.
      const prodFill: Record<string, unknown> = {};
      let validated = false;
      if (serial) {
        const found = await searchProducts({ serial }, 25);
        const exact = found.find((p) => String(p['Item Serial Number'] ?? '').trim().toLowerCase() === serial.toLowerCase());
        if (exact) {
          const full = productToCallPrefill(exact);
          PRODMASTER_FILL.forEach((k) => { if (full[k] != null && String(full[k]) !== '') prodFill[k] = full[k]; });
          validated = true;
        }
      }

      // (b) Open-call check — don't duplicate an existing call for this serial.
      const existing = serial
        ? [...db.list(C.fieldCalls), ...db.list(C.instCalls)].find((c) => String(c.serial ?? '').trim().toLowerCase() === serial.toLowerCase())
        : undefined;
      if (existing) {
        if (confirm(`An open call already exists for serial ${serial} (UCN ${existing.ucn}). Open it to edit instead of creating a duplicate?`)) {
          const p = /install/i.test(String(existing.callType ?? '')) ? '/installations' : '/field-calls';
          navigate(p, { state: { editUcn: String(existing.ucn) } });
        }
        setBusy(false); setMsg(null);
        return;
      }
      if (serial && !validated) {
        setMsg({ tone: 'info', text: `Serial ${serial} not found in Product Master — warranty/contract not auto-filled. Verify on the right.` });
      } else {
        setMsg(null);
      }

      // Identifying fields come from the REQUEST; warranty/contract from Product Master.
      const prefill: FormValues = {
        callNumber: g(row, 'UNIQUE ID', 'ID', 'REQID'),
        partyName: g(row, 'PARTY NAME', 'Party Name'),
        state: g(row, 'State'),
        city: g(row, 'City'),
        productName: g(row, 'PRODUCT', 'Product Name'),
        serial,
        standardComplaint: g(row, 'Standard Complaint'),
        complaintReported: g(row, 'Reported Problem'),
        allocatedTo: g(row, 'ENGINEER'),
        customerName: g(row, 'CUSTOMER NAME', 'CUSTOMER CONTACT DETAILS'),
        customerNumber: g(row, 'CUSTOMER CONTACT Number'),
        emailAddress: g(row, 'E-Mail ID'),
        personCalling: 'DIRECT ENGINEER',
        complaintDate: g(row, 'Complaint Date') || todayISO(),
        ...prodFill,
      };
      const config = /install/i.test(g(row, 'CALL TYPE')) ? INST_CONFIG : FIELD_CONFIG;
      setPanel({ row, prefill, config });
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not prepare registration: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const actionsColumn: Column<Row> = {
    key: '_actions', header: 'Register', width: 110, sortable: false, wrap: false,
    render: (row) => (
      <div className="row" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-sm btn-primary" onClick={() => void register(row)} disabled={busy}>Register</button>
      </div>
    ),
  };

  const visible = search.trim()
    ? rows.filter((r) => ['PARTY NAME', 'PRODUCT', 'SERIAL NO', 'ENGINEER', 'Reported Problem', 'City'].some((k) => String(r[k] ?? '').toLowerCase().includes(search.toLowerCase())))
    : rows;

  return (
    <div>
      <PageHeader title="Pending Call Registrations" subtitle="Engineer requests awaiting a UCN — register from here." icon="⏳" />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <DataTable<Row>
        columns={can('edit') ? [...COLUMNS, actionsColumn] : COLUMNS}
        rows={visible}
        getRowId={(r) => r.id}
        storageKey="pendingRegistrations"
        rowsBeforeScroll={16}
        dense
        onRowClick={(r) => can('edit') && void register(r)}
        emptyText="No pending registrations."
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="Party, product, serial, engineer…" />
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
          </Toolbar>
        }
      />

      {panel && (
        <RegisterPanel
          row={panel.row}
          prefill={panel.prefill}
          config={panel.config}
          onClose={() => setPanel(null)}
          onDone={(ucn) => { setPanel(null); setMsg({ tone: 'ok', text: `Registered as ${ucn} — UCN back-filled into the request.` }); void load(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Split registration view: request details (left) + registration form (right).
// ---------------------------------------------------------------------------
function RegisterPanel({
  row, prefill, config, onClose, onDone,
}: {
  row: Row;
  prefill: FormValues;
  config: CallSheetConfig;
  onClose: () => void;
  onDone: (ucn: string) => void;
}) {
  const [pf, setPf] = useState<FormValues>(prefill);
  const [pfKey, setPfKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const detailKeys = Object.keys(row).filter((k) => k !== 'id' && !k.startsWith('_') && !/^Page.*Header$/i.test(k) && row[k] != null && String(row[k]).trim() !== '');

  const submit = async (v: FormValues) => {
    setBusy(true); setErr('');
    try {
      const rec = buildPayload(v, config.callType);
      const res = await addFieldCall(rec, config.tab);
      if (!res.ok) { setErr(res.error ?? 'Registration failed.'); setBusy(false); return; }
      const rowNum = Number((row as { _row?: number })._row ?? row.id);
      if (rowNum && res.ucn) { try { await setPendingUcn(rowNum, String(res.ucn)); } catch { /* UCN back-fill best-effort */ } }
      onDone(String(res.ucn));
    } catch (e) {
      setErr(`Registration failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="reg-overlay" onMouseDown={onClose}>
      <div className="reg-split" onMouseDown={(e) => e.stopPropagation()}>
        <aside className="reg-split-left">
          <div className="reg-split-head">
            <span>📄 Request details</span>
          </div>
          <div className="reg-detail-list">
            {detailKeys.map((k) => (
              <div className="reg-detail-row" key={k}>
                <div className="reg-detail-k">{k}</div>
                <div className="reg-detail-v">{String(row[k])}</div>
              </div>
            ))}
          </div>
        </aside>

        <section className="reg-split-right">
          <div className="reg-split-head">
            <span>📝 Register {config.singular}</span>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
          <div className="reg-split-body">
            {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span><button className="btn btn-ghost btn-sm" onClick={() => setErr('')}>✕</button></div>}
            <div className="detail-hint">Party / Product / Serial are from the request. Use the picker only to correct them from Product Master.</div>
            <ProductLookup onPick={(p) => { setPf((cur) => ({ ...cur, ...productToCallPrefill(p) })); setPfKey((k) => k + 1); }} />
            <SchemaForm
              key={pfKey}
              sectionOrderKey="callform"
              fields={buildCreateFields(pf)}
              initial={{ complaintDate: todayISO(), breakdownDate: todayISO(), ...pf }}
              submitLabel={busy ? 'Registering…' : `Register ${config.singular}`}
              onSubmit={submit}
              onCancel={onClose}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

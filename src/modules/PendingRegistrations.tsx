import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { SchemaForm, type FormValues } from '../components/form/Form';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { addFieldCall, listPending, searchProducts, setPendingUcn, dataConfigured } from '../lib/sheets';
import { cancelCallRequest, callByUcn, openCallsFor, supabaseConfigured, type OpenCall } from '../lib/supabase';
import { StateBadge } from '../lib/callstate';
import { useMaster } from '../lib/masters';
import { productToCallPrefill } from '../lib/fieldcall';
import { todayISO } from '../lib/format';
import { buildCreateFields, buildPayload, ProductLookup, FIELD_CONFIG, INST_CONFIG, type CallSheetConfig } from './FieldCalls';
import { db } from '../lib/db';
import { C } from './collections';
import { useAuth } from '../lib/auth';
import './fieldcalls.css';

// ===========================================================================
// PENDING CALL REGISTRATIONS — requests with no UC Number yet.
// Clicking a row opens the request, where the Hotline engineer picks one of:
//   • Map to an existing call — its UCN goes into UCN (Mapped)
//   • Create a new call       — registered, UCN assigned and back-filled
//   • Cancel the request      — with a reason
// Any of the three takes the request off this list. The Open Calls column
// flags requests whose machine already has a call nobody has closed
// (Unattended / Unsolved / Report pending).
//
// On the register form, Party / Product / Serial come from the REQUEST
// (authoritative); Product Master only fills warranty/contract/status on an
// EXACT serial match, so nothing is overwritten with a wrong item.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

// Fields Product Master may fill on a validated (exact) serial — never the
// identifying party/product/serial, which stay from the request.
const PRODMASTER_FILL = ['itemStatus', 'warrantyNumber', 'warrantyStart', 'warrantyEnd', 'contractNumber', 'contractStart', 'contractEnd', 'contractType'];
const g = (r: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) { const v = r[k]; if (v != null && String(v).trim() !== '') return String(v); } return ''; };

// Requests whose machine already has an open call are the ones the Hotline must
// look at before creating another. Match on serial when the request has one,
// otherwise fall back to the party.
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

function buildColumns(
  openCalls: Record<string, OpenCall[]>,
  canAct: boolean,
  onMapUcn: (row: Row, ucn: string) => void,
): Column<Row>[] {
  return [
    { key: 'Timestamp', header: 'Requested', width: 140, wrap: false },
    {
      key: '_open', header: 'Open Calls', width: 130, sortable: false,
      render: (row) => {
        const list = openCalls[row.id] ?? [];
        if (!list.length) return <span className="muted">—</span>;
        const worst = list.find((c) => c.state !== 'Report pending') ?? list[0];
        return (
          <span
            className={`badge ${worst.state === 'Report pending' ? 'badge-warning' : worst.state === 'Unsolved' ? 'badge-danger' : 'badge-info'}`}
            title={list.map((c) => `${c.ucn} · ${c.state} · ${c.allocatedTo || 'unallocated'}`).join('\n')}
          >
            {list.length} open
          </span>
        );
      },
    },
    { key: 'REQID', header: 'REQID', width: 90, wrap: false },
    { key: 'ENGINEER', header: 'Engineer', width: 150 },
    { key: 'CALL TYPE', header: 'Type', width: 100, wrap: false },
    { key: 'PARTY NAME', header: 'Party', width: 210 },
    { key: 'City', header: 'City', width: 100 },
    { key: 'PRODUCT', header: 'Product', width: 120 },
    { key: 'SERIAL NO', header: 'Serial', width: 90, wrap: false },
    { key: 'Reported Problem', header: 'Reported Problem', width: 220 },
    { key: 'PLAN DATE (Visit Planned Date)', header: 'Plan Date', width: 110, wrap: false },
    {
      key: '_mapped', header: 'UCN Number (Mapped)', width: 170, sortable: false, wrap: false,
      render: (row) => <MappedUcnCell row={row} canAct={canAct} onSave={onMapUcn} />,
    },
  ];
}

// Editable UCN (Mapped) cell — type a UCN here to map the request to a call
// that already exists. Saving takes the request off the pending list.
function MappedUcnCell({ row, canAct, onSave }: { row: Row; canAct: boolean; onSave: (row: Row, ucn: string) => void }) {
  const [v, setV] = useState('');
  if (!canAct) return <span className="muted">—</span>;
  return (
    <div className="row map-cell" onClick={(e) => e.stopPropagation()}>
      <input
        className="input" value={v} placeholder="UCN…"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onSave(row, v.trim()); setV(''); } }}
      />
      <button className="btn btn-sm" disabled={!v.trim()} onClick={() => { onSave(row, v.trim()); setV(''); }}>Map</button>
    </div>
  );
}

export function PendingRegistrations() {
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const canAct = can('pending.register') || can('edit');
  const [rows, setRows] = useState<Row[]>([]);
  const [openCalls, setOpenCalls] = useState<Record<string, OpenCall[]>>({});
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const [panel, setPanel] = useState<{ row: Row; prefill: FormValues; config: CallSheetConfig } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    dataConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load pending registrations.' },
  );

  const load = async () => {
    if (!dataConfigured()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Loading pending registrations…' });
    try {
      const r = await listPending(300);
      const mapped = r.map((p, i) => ({ ...p, id: String((p as { _row?: number })._row ?? i) })) as Row[];
      setRows(mapped);
      setMsg({ tone: 'ok', text: `${r.length} pending call registration${r.length === 1 ? '' : 's'} (no UCN yet).` });
      void loadOpenCalls(mapped);
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  // Open calls for the machines on this list — one lookup for the whole page.
  const loadOpenCalls = async (list: Row[]) => {
    if (!supabaseConfigured() || !list.length) return;
    try {
      const found = await openCallsFor(
        list.map((r) => g(r, 'SERIAL NO', 'Serial')),
        list.map((r) => g(r, 'PARTY NAME')),
      );
      const bySerial = new Map<string, OpenCall[]>();
      const byParty = new Map<string, OpenCall[]>();
      found.forEach((c) => {
        if (c.serial) bySerial.set(norm(c.serial), [...(bySerial.get(norm(c.serial)) ?? []), c]);
        byParty.set(norm(c.partyName), [...(byParty.get(norm(c.partyName)) ?? []), c]);
      });
      const out: Record<string, OpenCall[]> = {};
      list.forEach((r) => {
        const serial = norm(g(r, 'SERIAL NO', 'Serial'));
        const hit = serial ? bySerial.get(serial) : byParty.get(norm(g(r, 'PARTY NAME')));
        if (hit?.length) out[r.id] = hit;
      });
      setOpenCalls(out);
    } catch { /* the column just stays empty */ }
  };

  // Map the request to a call that already exists (picked from the list or
  // typed in). The UCN is written back and the request leaves this list.
  const mapToUcn = async (row: Row, ucn: string, checkExists = true) => {
    setBusy(true); setMsg({ tone: 'info', text: `Mapping to ${ucn}…` });
    try {
      if (checkExists && supabaseConfigured()) {
        const found = await callByUcn(ucn).catch(() => null);
        if (!found && !confirm(`No call found with UCN ${ucn}. Map the request to it anyway?`)) {
          setBusy(false); setMsg(null); return;
        }
      }
      const ok = await setPendingUcn(Number(row.id), ucn, 'Mapped', user?.fullName ?? '');
      if (!ok) { setMsg({ tone: 'error', text: 'Could not save the mapped UCN.' }); return; }
      setDetail(null);
      setMsg({ tone: 'ok', text: `${g(row, 'REQID') || 'Request'} mapped to ${ucn} — removed from pending.` });
      await load();
    } catch (e) {
      setMsg({ tone: 'error', text: `Mapping failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  const cancelRequest = async (row: Row, reason: string) => {
    setBusy(true); setMsg({ tone: 'info', text: 'Cancelling request…' });
    try {
      const res = await cancelCallRequest(Number(row.id), reason, user?.fullName ?? '');
      if (!res.ok) { setMsg({ tone: 'error', text: `Cancel failed: ${res.error}` }); return; }
      setDetail(null);
      setMsg({ tone: 'ok', text: `${g(row, 'REQID') || 'Request'} cancelled — removed from pending.` });
      await load();
    } catch (e) {
      setMsg({ tone: 'error', text: `Cancel failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

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
      setDetail(null);
      setPanel({ row, prefill, config });
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not prepare registration: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const visible = search.trim()
    ? rows.filter((r) => ['PARTY NAME', 'PRODUCT', 'SERIAL NO', 'ENGINEER', 'Reported Problem', 'City', 'REQID'].some((k) => String(r[k] ?? '').toLowerCase().includes(search.toLowerCase())))
    : rows;

  return (
    <div>
      <PageHeader title="Pending Call Registrations" subtitle="Engineer requests awaiting action — map to an existing call, register a new one, or cancel." icon="⏳" count={visible.length} />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <DataTable<Row>
        columns={buildColumns(openCalls, canAct, (row, ucn) => void mapToUcn(row, ucn))}
        rows={visible}
        getRowId={(r) => r.id}
        storageKey="pendingRegistrations"
        rowsBeforeScroll={16}
        dense
        onRowClick={(r) => setDetail(r)}
        emptyText="No pending registrations."
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="Party, product, serial, engineer…" />
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
          </Toolbar>
        }
      />

      {detail && (
        <RequestActions
          row={detail}
          openCalls={openCalls[detail.id] ?? []}
          canAct={canAct}
          busy={busy}
          onClose={() => setDetail(null)}
          onMap={(ucn) => void mapToUcn(detail, ucn)}
          onCreate={() => void register(detail)}
          onCancel={(reason) => void cancelRequest(detail, reason)}
          onOpenCall={(c) => { setDetail(null); navigate(/install/i.test(c.callType) ? '/installations' : '/field-calls', { state: { editUcn: c.ucn } }); }}
        />
      )}

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
// Request detail + the three ways to close it out: map to an existing call,
// create a new one, or cancel.
// ---------------------------------------------------------------------------
function RequestActions({
  row, openCalls, canAct, busy, onClose, onMap, onCreate, onCancel, onOpenCall,
}: {
  row: Row;
  openCalls: OpenCall[];
  canAct: boolean;
  busy: boolean;
  onClose: () => void;
  onMap: (ucn: string) => void;
  onCreate: () => void;
  onCancel: (reason: string) => void;
  onOpenCall: (c: OpenCall) => void;
}) {
  const cancelMaster = useMaster('cancelreason', ['Duplicate request', 'Raised in error', 'Customer withdrew', 'Not a service call']);
  const [manualUcn, setManualUcn] = useState('');
  const [mode, setMode] = useState<'actions' | 'cancel'>('actions');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const detailKeys = Object.keys(row).filter((k) => k !== 'id' && !k.startsWith('_') && !/^Page.*Header$/i.test(k) && row[k] != null && String(row[k]).trim() !== '');

  return (
    <div className="reg-overlay" onMouseDown={onClose}>
      <div className="reg-split" onMouseDown={(e) => e.stopPropagation()}>
        <aside className="reg-split-left">
          <div className="reg-split-head"><span>📄 Request details</span></div>
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
            <span>⚙️ Action this request</span>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
          <div className="reg-split-body">
            {!canAct && <div className="sheet-banner sheet-banner-info"><span>Your role can view requests but not action them.</span></div>}

            {mode === 'actions' ? (
              <>
                <div className="req-act-sec">
                  <div className="rep-sec-title">Open calls for this machine</div>
                  {openCalls.length === 0 ? (
                    <div className="detail-hint">No open call found — nothing is pending on this serial/party.</div>
                  ) : (
                    <div className="req-open-list">
                      {openCalls.map((c) => (
                        <div className="req-open-row" key={c.ucn}>
                          <div className="req-open-main">
                            <button className="linklike" onClick={() => onOpenCall(c)}>{c.ucn}</button>
                            <StateBadge state={c.state} />
                            <span className="muted">{c.callType} · {c.regDate || '—'} · {c.allocatedTo || 'unallocated'}</span>
                            {c.complaint && <div className="muted req-open-cmp">{c.complaint}</div>}
                          </div>
                          <button className="btn btn-sm btn-primary" disabled={!canAct || busy} onClick={() => onMap(c.ucn)}>Map</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="req-act-sec">
                  <div className="rep-sec-title">Map another UCN</div>
                  <div className="row map-cell">
                    <input className="input" value={manualUcn} placeholder="Type a UC Number…" onChange={(e) => setManualUcn(e.target.value)} />
                    <button className="btn btn-sm" disabled={!canAct || busy || !manualUcn.trim()} onClick={() => onMap(manualUcn.trim())}>Map this UCN</button>
                  </div>
                  <div className="detail-hint">Mapping fills UCN (Mapped) and takes the request off the pending list.</div>
                </div>

                <div className="rep-actions">
                  <button className="btn btn-danger" disabled={!canAct || busy} onClick={() => setMode('cancel')}>✕ Cancel request</button>
                  <button className="btn btn-primary" disabled={!canAct || busy} onClick={onCreate}>＋ Create new call</button>
                </div>
              </>
            ) : (
              <div className="req-act-sec">
                <div className="rep-sec-title">Cancel this request</div>
                <label className="rep-field">
                  <span className="field-label">Cancel reason *</span>
                  <select className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">—</option>
                    {cancelMaster.values.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label className="rep-field">
                  <span className="field-label">Note</span>
                  <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
                <div className="rep-actions">
                  <button className="btn" disabled={busy} onClick={() => setMode('actions')}>Back</button>
                  <button
                    className="btn btn-danger"
                    disabled={busy || !reason}
                    onClick={() => onCancel(note.trim() ? `${reason} — ${note.trim()}` : reason)}
                  >
                    Cancel request
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
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

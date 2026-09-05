import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { SchemaForm, type FormValues } from '../components/form/Form';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { addFieldCall, listPending, searchProducts, setPendingUcn, updateFieldCall, dataConfigured } from '../lib/sheets';
import { cancelCallRequest, callByUcn, openCallsFor, callsForMachine, machineKey, supabaseConfigured, type OpenCall, type MachineCall } from '../lib/supabase';
import { FIELD_CALL_FIELDS } from './FieldCalls';
import { ComplaintSuggest } from '../components/form/ComplaintSuggest';
import { useTeamEngineers } from '../lib/access';
import { StateBadge } from '../lib/callstate';
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
        list.map((r) => ({ product: g(r, 'PRODUCT', 'Product'), serial: g(r, 'SERIAL NO', 'Serial') })),
        list.map((r) => g(r, 'PARTY NAME')),
      );
      // Keyed by MACHINE (model + serial), not by serial: a serial on its own
      // belongs to several different machines.
      const byMachine = new Map<string, OpenCall[]>();
      const byParty = new Map<string, OpenCall[]>();
      found.forEach((c) => {
        if (c.serial) {
          const k = machineKey(c.productName, c.serial);
          byMachine.set(k, [...(byMachine.get(k) ?? []), c]);
        }
        byParty.set(norm(c.partyName), [...(byParty.get(norm(c.partyName)) ?? []), c]);
      });
      const out: Record<string, OpenCall[]> = {};
      list.forEach((r) => {
        const serial = g(r, 'SERIAL NO', 'Serial').trim();
        const hit = serial
          ? byMachine.get(machineKey(g(r, 'PRODUCT', 'Product'), serial))
          : byParty.get(norm(g(r, 'PARTY NAME')));
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
  const [manualUcn, setManualUcn] = useState('');

  // ---- every call on this machine, whatever its status --------------------
  //
  // The middle column asks "is anything still OPEN on this serial", which is
  // the question for deciding whether to map. This one asks what the machine's
  // history is — and a call solved last month is often exactly what says this
  // request is the same fault coming back. So: no status filter at all.
  //
  // The machine is PRODUCT + SERIAL. A serial on its own repeats across
  // products, and a request for ORION-G 2000 must not pull in the history of a
  // different machine that happens to share the number.
  // Read through the module's own field getter, with the SAME aliases the
  // open-call lookup above uses. Two lists of aliases for one field is how they
  // start to disagree.
  const product = g(row, 'PRODUCT', 'Product').trim();
  const serial = g(row, 'SERIAL NO', 'Serial').trim();
  const [history, setHistory] = useState<MachineCall[] | null>(null);
  const [histErr, setHistErr] = useState('');
  // A call open on this machine often needs the failure details filling in
  // BEFORE the request is mapped onto it — otherwise the request is closed out
  // against a call that does not yet say what happened. So the third pane
  // becomes the editor for one call and comes back when it is saved.
  const [editing, setEditing] = useState<{ ucn: string; values: FormValues } | null>(null);
  const [editErr, setEditErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const editTeam = useTeamEngineers();

  useEffect(() => {
    if (!supabaseConfigured() || !serial) { setHistory([]); return; }
    let cancelled = false;
    setHistory(null); setHistErr('');
    void callsForMachine(product, serial)
      .then((r) => { if (!cancelled) setHistory(r); })
      .catch((e) => { if (!cancelled) { setHistory([]); setHistErr(e instanceof Error ? e.message : String(e)); } });
    return () => { cancelled = true; };
  }, [product, serial, reload]);

  const openEditor = async (ucn: string) => {
    setEditErr(''); setSaving(true);
    try {
      const row = await callByUcn(ucn);
      if (!row) { setEditErr(`Could not load ${ucn}.`); return; }
      setEditing({ ucn, values: row as FormValues });
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  };

  const saveEdit = async (values: FormValues) => {
    if (!editing) return;
    setSaving(true); setEditErr('');
    try {
      // Only what actually CHANGED is sent. A call is a quality record and the
      // audit trail keeps a before/after image of it; writing back forty fields
      // that nobody touched makes that image unreadable.
      const patch: Record<string, unknown> = {};
      Object.entries(values).forEach(([k, v]) => {
        if (String(v ?? '') !== String(editing.values[k] ?? '')) patch[k] = v;
      });
      if (!Object.keys(patch).length) { setEditing(null); return; }
      const res = await updateFieldCall(editing.ucn, patch);
      if (!res.ok) { setEditErr(res.error ?? 'Could not save the call.'); return; }
      setEditing(null);
      setReload((n) => n + 1);   // the list re-reads, so the change shows
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  };

  // The register's own fields, with the two lists this drawer has to supply.
  const editFields = FIELD_CALL_FIELDS.map((f) =>
    f.name === 'allocatedTo'
      ? { ...f, options: editTeam.names.map((n) => ({ value: n, label: n })) }
      : f.name === 'standardComplaint'
        ? {
          ...f,
          below: ({ values, set }: { values: FormValues; set: (n: string, v: unknown) => void }) => (
            <ComplaintSuggest
              reported={String(values.complaintReported ?? '')}
              product={String(values.productName ?? '')}
              current={String(values.standardComplaint ?? '')}
              onPick={(v) => set('standardComplaint', v)}
            />
          ),
        }
        : f);

  // ---- the columns are the reader's to size -------------------------------
  //
  // Three panes, and which one matters depends on the request: sometimes the
  // details, sometimes the history. Drag either divider; the widths are
  // remembered, so somebody who works this screen all day sets it once.
  const [cols, setCols] = useState<[number, number]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('rithi.reg.cols') ?? '');
      if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number')) return v as [number, number];
    } catch { /* never set, or a private window */ }
    return [30, 38];
  });
  const dragRef = useRef<{ which: 0 | 1; x: number; start: [number, number]; width: number } | null>(null);
  const onDragStart = (which: 0 | 1) => (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    const box = e.currentTarget.parentElement?.getBoundingClientRect();
    dragRef.current = { which, x: e.clientX, start: cols, width: box?.width ?? 1000 };
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const delta = ((e.clientX - d.x) / d.width) * 100;
      // 15% is a pane you can still read; the third takes what is left, and it
      // needs room too, hence the 70 ceiling on the first two together.
      const clamp = (n: number) => Math.max(15, Math.min(60, n));
      const next: [number, number] = d.which === 0
        ? [clamp(d.start[0] + delta), d.start[1]]
        : [d.start[0], clamp(d.start[1] + delta)];
      if (next[0] + next[1] > 70) return;
      setCols(next);
    };
    const up = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setCols((c) => { try { localStorage.setItem('rithi.reg.cols', JSON.stringify(c)); } catch { /* ignore */ } return c; });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);
  const [mode, setMode] = useState<'actions' | 'cancel'>('actions');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const detailKeys = Object.keys(row).filter((k) => k !== 'id' && !k.startsWith('_') && !/^Page.*Header$/i.test(k) && row[k] != null && String(row[k]).trim() !== '');

  return (
    <div className="reg-overlay" onMouseDown={onClose}>
      <div
        className="reg-split reg-split-3"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ gridTemplateColumns: `${cols[0]}% 6px ${cols[1]}% 6px 1fr` }}
      >
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

        <div className="reg-gutter" onMouseDown={onDragStart(0)} title="Drag to resize" />

        <section className="reg-split-right">
          <div className="reg-split-head">
            <span>⚙️ Action this request</span>
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
                  {/* FREE TEXT, not the Call Cancel Reason master.
                      Cancelling a REQUEST and cancelling a CALL are different
                      acts: a call is cancelled for reasons the service process
                      defines and reports on, while a request is withdrawn for
                      whatever happened at the desk — the customer rang back, it
                      was raised twice, it turned out not to be a fault. Feeding
                      one list to both made the request's reason answer the
                      call's question, and put words into a controlled list that
                      the call register then had to carry. */}
                  <span className="field-label">Cancel reason *</span>
                  <input
                    className="input"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why is this request being cancelled?"
                  />
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

        <div className="reg-gutter" onMouseDown={onDragStart(1)} title="Drag to resize" />

        {/* THE MACHINE'S HISTORY — every call on this product + serial, whatever
            its status. The middle column asks "is anything still open"; this one
            asks what has happened to this machine, and a call solved last month
            is often exactly what says the request is the same fault returning.
            Any of them can be mapped: a request can legitimately belong to a
            call that is already closed. */}
        <section className="reg-split-third">
          <div className="reg-split-head">
            <span>
              {editing
                ? <>✎ Editing {editing.ucn}</>
                : <>🩺 This machine{history && history.length ? ` · ${history.length}` : ''}</>}
            </span>
            {editing
              ? <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => { setEditing(null); setEditErr(''); }}>← Back</button>
              : <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>}
          </div>
          <div className="reg-split-body">
            {editing ? (
              <>
                {/* The call is edited HERE, in the pane the machine's history
                    was in, and the pane comes back when it is saved — so the
                    request being actioned never leaves the screen and the Map
                    button is still there when you return. */}
                <div className="detail-hint" style={{ marginBottom: 10 }}>
                  Fill in what this call needs, save, and you are back with the list — then map the request onto it.
                </div>
                {editErr && <div className="sheet-banner sheet-banner-error"><span>{editErr}</span></div>}
                <SchemaForm
                  fields={editFields}
                  initial={editing.values}
                  columns={1}
                  submitLabel={saving ? 'Saving…' : 'Save call'}
                  onSubmit={(v) => void saveEdit(v)}
                  onCancel={() => { setEditing(null); setEditErr(''); }}
                />
              </>
            ) : (
            <>
            <div className="detail-hint" style={{ marginBottom: 10 }}>
              {product || '—'}{serial ? ` · ${serial}` : ''}
            </div>
            {editErr && <div className="sheet-banner sheet-banner-error"><span>{editErr}</span></div>}

            {!serial ? (
              <div className="detail-hint">This request carries no serial number, so there is no machine to look up.</div>
            ) : histErr ? (
              <div className="sheet-banner sheet-banner-error"><span>{histErr}</span></div>
            ) : history === null ? (
              <div className="detail-hint">Looking up this machine…</div>
            ) : history.length === 0 ? (
              <div className="detail-hint">No call has ever been registered on this machine.</div>
            ) : (
              <div className="req-open-list">
                {history.map((c) => (
                  <div className={`req-open-row ${c.solved ? 'req-open-done' : ''}`} key={c.ucn}>
                    <div className="req-open-main">
                      <button className="linklike" onClick={() => onOpenCall(c as unknown as OpenCall)}>{c.ucn}</button>
                      <StateBadge state={c.state} label={c.lastStatus || c.state} />
                      <span className="muted">{c.callType} · {c.regDate || '—'} · {c.allocatedTo || 'unallocated'}</span>
                      {c.complaint && <div className="muted req-open-cmp">{c.complaint}</div>}
                    </div>
                    <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                      {/* Edit BEFORE mapping: an open call often needs the
                          failure details filling in first, and mapping a
                          request onto a call that does not yet say what
                          happened is how the detail gets lost. */}
                      <button className="btn btn-sm btn-ghost" disabled={saving} onClick={() => void openEditor(c.ucn)}>✎ Edit</button>
                      <button className="btn btn-sm" disabled={!canAct || busy} onClick={() => onMap(c.ucn)}>Map</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </>
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

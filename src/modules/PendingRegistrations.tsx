import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { SchemaForm, type FormValues } from '../components/form/Form';
import { PageHeader, Toolbar, SearchBox, FacetChips } from '../components/ui/ui';
import { addFieldCall, listPending, productBySerial, setPendingUcn, updateFieldCall, dataConfigured } from '../lib/sheets';
import { cancelCallRequest, callByUcn, callExists, openCallsFor, callsForMachine, machineKey, supabaseConfigured, type OpenCall, type MachineCall } from '../lib/supabase';
import { FIELD_CALL_FIELDS, VIGILANCE_SECTION } from './FieldCalls';
import { useCallFieldMasters } from './callFields';
import { useTeamEngineers } from '../lib/access';
import { StateBadge } from '../lib/callstate';
import { productToCallPrefill, callDateFromRequest, withVigilanceRule } from '../lib/fieldcall';
import { SupportingDocs } from './CallAssociations';
import { todayISO, fmtLongDate } from '../lib/format';
import { buildCreateFields, buildPayload, ProductLookup, FIELD_CONFIG, INST_CONFIG, lockCallFields, callPermPrefix, mayEditCallOn, type CallSheetConfig } from './FieldCalls';
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
// (authoritative); Product Database only fills warranty/contract/status on an
// EXACT serial match, so nothing is overwritten with a wrong item.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

// Fields Product Database may fill on a validated (exact) serial — never the
// identifying party/product/serial, which stay from the request.
const PRODMASTER_FILL = ['itemStatus', 'warrantyNumber', 'warrantyStart', 'warrantyEnd', 'contractNumber', 'contractStart', 'contractEnd', 'contractType'];
const g = (r: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) { const v = r[k]; if (v != null && String(v).trim() !== '') return String(v); } return ''; };

// Requests whose machine already has an open call are the ones the Hotline must
// look at before creating another. Match on serial when the request has one,
// otherwise fall back to the party.
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

function buildColumns(
  openCalls: Record<string, OpenCall[]>,
  openCallsFailed: boolean,
  canAct: boolean,
  onMapUcn: (row: Row, ucn: string) => void,
): Column<Row>[] {
  return [
    { key: 'Timestamp', header: 'Requested', width: 140, wrap: false },
    {
      key: '_open', header: 'Open Calls', width: 130, sortable: false,
      render: (row) => {
        const list = openCalls[row.id] ?? [];
        // A FAILED LOOKUP IS NOT "NO OPEN CALL" (D-040): "—" there reads as
        // "nothing pending on this machine", which is what decides a new call.
        if (!list.length) return openCallsFailed
          ? <span className="muted" title="The check for open calls failed — Refresh to try again">not checked</span>
          : <span className="muted">—</span>;
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
  // Mapping, cancelling and reading a request are the desk's (pending.register).
  // Creating a call from one is the REGISTER'S key -- the database asks
  // calls.create or install.create (finding 64), so the button asks the same.
  const canAct = can('pending.register');
  const mayCreateFor = (row: Row) => can(/install/i.test(g(row, 'CALL TYPE')) ? 'install.create' : 'calls.create');
  const [rows, setRows] = useState<Row[]>([]);
  const [openCalls, setOpenCalls] = useState<Record<string, OpenCall[]>>({});
  const [openCallsFailed, setOpenCallsFailed] = useState(false);
  const [search, setSearch] = useState('');
  // CALL TYPE AT THE TOP (the user, 2026-10-02: "Add Clickable Filter /
  // Grouping at the Top based on the Call Type"). '' is every type.
  const [callType, setCallType] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  // FROM THE HEADER SEARCH (2026-10-01): open that request once the list is in.
  // Every pending request is loaded (no cap), so it is found if it is pending.
  const location = useLocation();
  const [wantReq, setWantReq] = useState<string>(() => String((location.state as { openReqId?: string } | null)?.openReqId ?? ''));
  useEffect(() => {
    const id = (location.state as { openReqId?: string } | null)?.openReqId;
    if (id) { setWantReq(String(id)); window.history.replaceState({}, ''); }
  }, [location.state]);
  useEffect(() => {
    if (!wantReq || !rows.length) return;
    const r = rows.find((x) => String(x['REQID'] ?? '') === wantReq);
    if (r) setDetail(r);
    else setMsg({ tone: 'info', text: `Request ${wantReq} is no longer pending — it has been registered or cancelled.` });
    setWantReq('');
  }, [wantReq, rows]);
  const [panel, setPanel] = useState<{ row: Row; prefill: FormValues; config: CallSheetConfig } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    dataConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load pending registrations.' },
  );

  const load = async () => {
    if (!dataConfigured()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Loading pending registrations…' });
    try {
      // NO CAP. The Supabase read pages in full (see `listCallRequestsAsPending`),
      // so this list is EVERY pending request and the counts below are exact.
      const r = await listPending();
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
    setOpenCallsFailed(false);
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
    } catch { setOpenCallsFailed(true); }
  };

  // Map the request to a call that already exists (picked from the list or
  // typed in). The UCN is written back and the request leaves this list.
  const mapToUcn = async (row: Row, ucn: string, checkExists = true) => {
    setBusy(true); setMsg({ tone: 'info', text: `Mapping to ${ucn}…` });
    try {
      // A UCN NO CALL HAS IS REFUSED, NOT OFFERED (D-031). It asked "Map the
      // request to it anyway?" and mapped on OK, so a typo closed the request
      // against a call that does not exist and it left this list for good. A
      // failed lookup is not "not found" either: it says so and maps nothing.
      if (checkExists && supabaseConfigured()) {
        let found: boolean;
        try { found = await callExists(ucn); } catch (e) {
          setMsg({ tone: 'error', text: `Not mapped — could not check UCN ${ucn}: ${e instanceof Error ? e.message : String(e)}` });
          return;
        }
        if (!found) {
          setMsg({ tone: 'error', text: `Not mapped — no call with UCN ${ucn} exists that you can see. Check the number; the request is still pending.` });
          return;
        }
      }
      const res = await setPendingUcn(Number(row.id), ucn, 'Mapped', user?.fullName ?? '');
      if (!res.ok) { setMsg({ tone: 'error', text: `Not mapped — ${res.error ?? 'the mapped UCN could not be saved.'}` }); return; }
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
    setMsg({ tone: 'info', text: 'Checking Product Database…' });
    try {
      const serial = g(row, 'SERIAL NO', 'SERIAL NO (1)', 'Serial', 'Product Serial Number').trim();

      // (a) Validate against Product Database by EXACT serial. Only fill
      //     warranty/contract/status — never overwrite party/product/serial.
      const prodFill: Record<string, unknown> = {};
      let validated = false;
      if (serial) {
        // ONE MACHINE, BY EQUALITY (0129). This used to read the first 25
        // products whose serial CONTAINS this one and then find the exact match
        // among them — a leading-wildcard scan of every machine, which is what
        // timed out, and which missed the serial entirely whenever 25 other
        // serials contained it.
        // THE PRODUCT TOO. A serial alone does not name a machine -- a machine
        // is its MODEL and its serial -- and this read used to return an
        // arbitrary one of the machines wearing the serial, filling ITS item
        // status, warranty and contract onto this call. Reported 2026-09-21:
        // a machine that is WGP in Product Database registered as OGP.
        const exact = await productBySerial(serial, g(row, 'PRODUCT', 'Product Name'));
        if (exact) {
          const full = productToCallPrefill(exact);
          PRODMASTER_FILL.forEach((k) => { if (full[k] != null && String(full[k]) !== '') prodFill[k] = full[k]; });
          validated = true;
        }
      }
      if (serial && !validated) {
        // NOT FOUND and AMBIGUOUS are different facts and the reader can act
        // on only one of them: "add the machine" against "say which machine".
        // The lookup returns null for both, so the second is asked for here
        // rather than guessed at from the first.
        const prod = g(row, 'PRODUCT', 'Product Name').trim();
        setMsg({ tone: 'info', text: prod
          ? `No machine in Product Database is ${prod} with serial ${serial} — warranty/contract not auto-filled. Check the model and serial on the right.`
          : `This request names no product, and serial ${serial} is on more than one machine — warranty/contract not auto-filled, because filling the wrong machine's cover is worse than filling none.` });
      } else {
        setMsg(null);
      }

      // Identifying fields come from the REQUEST; warranty/contract from Product Database.
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
        // NOT the request's E-Mail ID any more: that is the engineer who RAISED
        // it, and this field records who REGISTERS the call. Leaving it unset
        // lets the login-derived default apply (see callFields.tsx); the
        // request keeps its own email either way.
        personCalling: 'DIRECT ENGINEER',
        // NOT today: the day the request is about (see requestCallDate).
        complaintDate: requestCallDate(row).iso,
        breakdownDate: requestCallDate(row).iso,
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

  const typeOf = (r: Row) => g(r, 'CALL TYPE').trim();
  // THE CHIPS COUNT EVERY ROW THE SEARCH LEAVES, whatever type is picked, so a
  // count never changes because another chip was clicked. The rows are read in
  // full (listPending pages to the end), so the counts are exact.
  const searched = search.trim()
    ? rows.filter((r) => ['PARTY NAME', 'PRODUCT', 'SERIAL NO', 'ENGINEER', 'Reported Problem', 'City', 'REQID'].some((k) => String(r[k] ?? '').toLowerCase().includes(search.toLowerCase())))
    : rows;
  const typeCounts = (() => {
    const m = new Map<string, number>();
    searched.forEach((r) => m.set(typeOf(r), (m.get(typeOf(r)) ?? 0) + 1));
    return [...m.entries()].map(([key, count]) => ({ key, count }));
  })();
  const visible = callType ? searched.filter((r) => typeOf(r) === callType) : searched;

  return (
    <div>
      <PageHeader
        onRefresh={() => void load()}
        refreshing={busy} title="Pending Call Registrations" subtitle="Engineer requests awaiting action — map to an existing call, register a new one, or cancel." icon="⏳" count={visible.length} />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <FacetChips options={typeCounts} value={callType} onChange={setCallType}
        allLabel="All" title="Call Type" storeKey="pendingRegistrations.callType" more={false} />

      <DataTable<Row>
        columns={buildColumns(openCalls, openCallsFailed, canAct, (row, ucn) => void mapToUcn(row, ucn))}
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
          </Toolbar>
        }
      />

      {detail && (
        <RequestActions
          row={detail}
          openCalls={openCalls[detail.id] ?? []}
          openCallsFailed={openCallsFailed}
          canAct={canAct}
          busy={busy}
          onClose={() => setDetail(null)}
          onMap={(ucn) => void mapToUcn(detail, ucn)}
          onCreate={() => void register(detail)}
          canCreate={mayCreateFor(detail)}
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
          onDone={(ucn, backfillError) => {
            setPanel(null);
            // THE CALL EXISTS EITHER WAY; what is in doubt is the request
            // (D-031). Said, with the UCN, so it is mapped rather than
            // registered a second time.
            setMsg(backfillError
              ? { tone: 'error', text: `Registered as ${ucn}, but the request could NOT be marked Registered (${backfillError}). `
                  + `It is still listed as pending — map it to ${ucn} so it is not registered twice.` }
              : { tone: 'ok', text: `Registered as ${ucn} — UCN back-filled into the request.` });
            void load();
          }}
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
  row, openCalls, openCallsFailed, canAct, canCreate, busy, onClose, onMap, onCreate, onCancel, onOpenCall,
}: {
  row: Row;
  openCalls: OpenCall[];
  openCallsFailed?: boolean;
  canAct: boolean;
  canCreate: boolean;
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
  const [editing, setEditing] = useState<{ ucn: string; values: FormValues; perm: 'calls' | 'install' | 'pm' } | null>(null);
  const { can } = useAuth();
  const [editErr, setEditErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const editTeam = useTeamEngineers();
  const callMasters = useCallFieldMasters();

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
      const perm = callPermPrefix((row as FormValues).callType);
      if (!mayEditCallOn(perm, can)) { setEditErr(`Your role cannot edit this ${perm === 'install' ? 'installation' : perm === 'pm' ? 'PM' : 'field'} call.`); return; }
      setEditing({ ucn, values: row as FormValues, perm });
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

  // The register's own fields with the register's own lists — then the allottee
  // narrowed to who THIS person may allot to, which is the one list this drawer
  // does not take from the directory at large.
  // THE SAME SECTION LOCKS AS THE CALL REGISTERS (finding 57): this editor
  // rewrote any field of a live call with no check on screen at all.
  // D-033: editing a registered FIELD call drops the default NO, so a blank
  // answer stays blank rather than being written as a NO nobody chose (the
  // patch below sends whatever differs from the call as loaded).
  const editFields = lockCallFields(callMasters.inject(withVigilanceRule(FIELD_CALL_FIELDS,
    editing?.values.callType, 'edit')).map((f) =>
    f.name === 'allocatedTo'
      ? { ...f, options: editTeam.names.map((n) => ({ value: n, label: n })) }
      : f), editing?.perm ?? 'calls', can);

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
          {/* THE SAME SUPPORTING DOCUMENTS A CALL OFFERS (the user, 2026-09-09).
              A request already names the product, the standard complaint and
              what the customer reported — everything the match needs — so the
              manual and the articles for that machine can be read HERE, before
              it becomes a call. Waiting for a UCN to hand somebody the manual
              is waiting for the wrong event: the person deciding whether this
              is even a fault is the one who needs it.
              The component is the call's own, imported rather than copied, so
              the matching rule cannot drift between the two screens. It renders
              nothing when there is nothing to show. */}
          <SupportingDocs
            product={g(row, 'PRODUCT', 'Product')}
            complaint={g(row, 'Standard Complaint')}
            reported={g(row, 'Reported Problem')}
          />
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
                  {openCalls.length === 0 && openCallsFailed ? (
                    <div className="field-err">The check for open calls failed, so it is not known whether one is pending on this serial/party. Refresh the list before registering a new call.</div>
                  ) : openCalls.length === 0 ? (
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
                  <button className="btn btn-primary" disabled={!canCreate || busy} onClick={onCreate}
                    title={canCreate ? undefined : 'Creating this kind of call needs its register’s Create permission'}>＋ Create new call</button>
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
                  emphasisSections={[VIGILANCE_SECTION]}
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
                      {/* The register's own rule: a closed or cancelled call is
                          read-only until it is re-opened or restored (D-034). */}
                      {mayEditCallOn(callPermPrefix(c.callType), can) && !c.solved && c.state !== 'Cancelled' && (
                        <button className="btn btn-sm btn-ghost" disabled={saving} onClick={() => void openEditor(c.ucn)}>✎ Edit</button>
                      )}
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

// The day a call registered from a request is ABOUT (rule in lib/fieldcall.ts),
// with the sentence the form shows so nobody reads a non-today date as a bug.
export function requestCallDate(row: Row): { iso: string; why: string } {
  const d = callDateFromRequest({
    attended: row['Call Attended?'],
    attendedDate: row['Attended Date'],
    loggedAt: row['Timestamp'],
  });
  if (d.source === 'attended') return { iso: d.iso, why: `From the request — attended on ${fmtLongDate(d.iso)}` };
  if (d.source === 'logged') return { iso: d.iso, why: `From the request — logged on ${fmtLongDate(d.iso)}` };
  return { iso: todayISO(), why: 'The request carries no date, so today is used' };
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
  onDone: (ucn: string, backfillError?: string) => void;
}) {
  const [pf, setPf] = useState<FormValues>(prefill);
  const [pfKey, setPfKey] = useState(0);
  // Registering from a request is the same form as New Field Call, so it gets
  // the same lists: the Standard Complaint master with its suggestions, the
  // party datalist, and the engineers. It had none of them.
  const masters = useCallFieldMasters();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const detailKeys = Object.keys(row).filter((k) => k !== 'id' && !k.startsWith('_') && !/^Page.*Header$/i.test(k) && row[k] != null && String(row[k]).trim() !== '');

  // The two dates come from the REQUEST, so the form says which date and why —
  // a field that quietly disagrees with today looks like a bug otherwise.
  const when = requestCallDate(row);
  const registerFields = masters.inject(buildCreateFields(pf, config.callType)).map((f) => (
    f.name === 'complaintDate' || f.name === 'breakdownDate' ? { ...f, help: when.why } : f));

  const submit = async (v: FormValues) => {
    setBusy(true); setErr('');
    try {
      const rec = buildPayload(v, config.callType);
      const res = await addFieldCall(rec, config.tab);
      if (!res.ok) { setErr(res.error ?? 'Registration failed.'); setBusy(false); return; }
      const rowNum = Number((row as { _row?: number })._row ?? row.id);
      // NOT BEST-EFFORT ANY MORE (D-031): a swallowed failure left the request
      // Pending beside the call made from it. The call is registered whatever
      // happens here, so a failure is handed up to be said, not thrown.
      let backfill = '';
      if (rowNum && res.ucn) {
        try {
          const b = await setPendingUcn(rowNum, String(res.ucn));
          if (!b.ok) backfill = b.error || 'the request could not be updated';
        } catch (e) { backfill = e instanceof Error ? e.message : String(e); }
      }
      onDone(String(res.ucn), backfill || undefined);
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
            <div className="detail-hint">Party / Product / Serial are from the request. Use the picker only to correct them from Product Database.</div>
            {/* THE REQUEST'S ENGINEER WINS HERE, and this is the one place it can
                be lost. The user's rule, 2026-09-15: "In case of creating a call
                from a request, then it has to map it to the requestor."
                `productToCallPrefill` carries an `allocatedTo` — the machine's
                Service Engineer, or the party's (0200) — and spreading it whole
                overwrote the engineer the request names, silently, on a picker
                whose own hint says it is only for correcting party/product/
                serial. So the engineer is held back while the request has one;
                where the request names nobody, the machine may still answer.
                (The auto-fill path never had this fault: PRODMASTER_FILL above
                lists the eight cover fields and `allocatedTo` is not one.) */}
            <ProductLookup
              onPick={(p, partyEngineer) => {
                setPf((cur) => {
                  const fromProduct = productToCallPrefill(p, partyEngineer);
                  if (String(cur.allocatedTo ?? '').trim()) delete fromProduct.allocatedTo;
                  return { ...cur, ...fromProduct };
                });
                setPfKey((k) => k + 1);
              }}
            />
            <SchemaForm
              key={pfKey}
              sectionOrderKey="callform"
              emphasisSections={[VIGILANCE_SECTION]}
              fields={registerFields}
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

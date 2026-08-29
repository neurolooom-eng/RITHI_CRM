import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, fmtLongDate, makeRequestUID, timeAgo } from '../lib/format';
import { toSheetDate } from '../lib/fieldcall';
import { listTabRows, sheetsConfigured, tabAppend } from '../lib/sheets';
import { addSpareRequest, listSpareRequestLines, updateSpareRequest, supabaseConfigured } from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { deriveStage, stageAction, buildPatch, dispatchPatch } from '../lib/spareflow';
import { useAuth } from '../lib/auth';
import { useAccessScope } from '../lib/access';
import { useMaster } from '../lib/masters';
import './fieldcalls.css';

// ===========================================================================
// SPARE REQUESTS — live against 26_SpareRequest.
//   • List / track from v2_OR_Req (exploded, one row per part, with the
//     approval + dispatch status). Role-scoped like the call registers.
//   • Raise a request (Call Based, linked to a call's UCN) → appended to
//     v2_ORReq-All; the sheet explodes it into v2_OR_Req and drives approvals.
// ===========================================================================

const BOOK = 'sparereq';
const STATUS_TAB = 'v2_OR_Req';
const INTAKE_TAB = 'v2_ORReq-All';
const MAX_SPARES = 20;

const REQ_TYPES = ['Call Based', 'HandStock'];

type Row = Record<string, unknown> & { id: string };

const g = (r: Record<string, unknown>, k: string) => String(r[k] ?? '');

function statusTone(s: string): string {
  const v = s.toLowerCase();
  if (/dispatch|cleared|approved|complete/.test(v)) return 'success';
  if (/drop|reject|cancel/.test(v)) return 'danger';
  if (/pending|await|process/.test(v)) return 'warning';
  return 'neutral';
}
const badge = (s: string) => s ? <span className={`badge badge-${statusTone(s)}`}>{s}</span> : null;

// ---------------------------------------------------------------------------
// Raise-request drawer (reused from the register screen and from a call).
// ---------------------------------------------------------------------------
export interface CallLike { ucn?: unknown; [key: string]: unknown }

export function SpareRequestDrawer({
  call, open, onClose, onSaved,
}: {
  call: CallLike | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (ucn: string, uid?: string) => void;
}) {
  const { user } = useAuth();
  const spareMaster = useMaster('spare');
  const [reqType, setReqType] = useState('Call Based');
  const [remarks, setRemarks] = useState('');
  const [handstockReason, setHandstockReason] = useState('');
  const [spares, setSpares] = useState<{ spare: string; qty: string }[]>([{ spare: '', qty: '1' }]);
  const [uid, setUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // A fresh UID (WA-yyyymmdd-xxxx) is minted each time the drawer opens, so the
  // engineer can see/quote the reference for the request they're about to raise.
  useEffect(() => {
    if (open) { setReqType('Call Based'); setRemarks(''); setHandstockReason(''); setSpares([{ spare: '', qty: '1' }]); setUid(makeRequestUID()); setErr(''); }
  }, [open, call]);

  const c = (k: string) => String(call?.[k] ?? '');
  const setSpare = (i: number, field: 'spare' | 'qty', v: string) =>
    setSpares((s) => s.map((x, j) => (j === i ? { ...x, [field]: v } : x)));
  const addSpareRow = () => setSpares((s) => (s.length < MAX_SPARES ? [...s, { spare: '', qty: '1' }] : s));
  const removeSpareRow = (i: number) => setSpares((s) => (s.length > 1 ? s.filter((_, j) => j !== i) : s));

  const submit = async () => {
    const picked = spares.filter((s) => s.spare.trim() !== '');
    if (picked.length === 0) { setErr('Add at least one spare.'); return; }
    if (reqType === 'Call Based' && !c('ucn')) { setErr('A Call-Based request needs a call (UC Number).'); return; }
    if (reqType === 'HandStock' && !handstockReason.trim()) { setErr('Enter the reason for the HandStock request.'); return; }

    const data: Record<string, unknown> = {
      'UID': uid,
      'Engineer Email': user?.email ?? '',
      'Req Type': reqType,
      'OR Req Date': toSheetDate(new Date()),
      'ENGINEER NAME': user?.fullName ?? '',
      'Call Number': c('callNumber'),
      'UC Number': c('ucn'),
      'Party Name': c('partyName'),
      'Product Name': c('productName'),
      'Product Serial Number': c('serial'),
      'Complaint Reported': c('complaintReported') || c('standardComplaint'),
      'Item Status': c('itemStatus'),
      'Reason for HANDSTOCK Request': reqType === 'HandStock' ? handstockReason : '',
      'Additional Remarks': remarks,
    };
    picked.forEach((s, idx) => {
      data[`Spare (${idx + 1})`] = s.spare;
      data[`Qty (${idx + 1})`] = Number(s.qty) || 1;
    });

    setBusy(true); setErr('');
    try {
      if (supabaseConfigured()) {
        // Supabase: one spare_requests row + a spare_request_lines row per part.
        const req: Record<string, unknown> = {
          uid, req_type: reqType, engineer: user?.fullName ?? '', engineer_email: user?.email ?? '',
          ucn: c('ucn'), call_number: c('callNumber'), party_name: c('partyName'), product_name: c('productName'),
          serial: c('serial'), complaint: c('complaintReported') || c('standardComplaint'), item_status: c('itemStatus'),
          handstock_reason: reqType === 'HandStock' ? handstockReason : '', remarks, status: 'Pending',
        };
        const res = await addSpareRequest(req, picked.map((s) => ({ part: s.spare, qty: Number(s.qty) || 1 })));
        if (res.ok) { onSaved?.(c('ucn'), res.uid ?? uid); onClose(); }
        else setErr(res.error ?? 'Could not submit the request.');
        setBusy(false); return;
      }
      const res = await tabAppend(INTAKE_TAB, data, BOOK);
      if (res.ok) { onSaved?.(c('ucn'), uid); onClose(); }
      else setErr(res.error ?? 'Could not submit the request.');
    } catch (e) {
      setErr(`Submit failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <Drawer open={open} onClose={onClose} title={call?.ucn ? `Request Spares — ${String(call.ucn)}` : 'New Spare Request'} width={780}>
      {!(supabaseConfigured() || sheetsConfigured()) && <div className="sheet-banner sheet-banner-info"><span>Connect the database in Settings to raise spare requests.</span></div>}
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span><button className="btn btn-ghost btn-sm" onClick={() => setErr('')}>✕</button></div>}

      <div className="rep-form">
        {!!call?.ucn && (
          <section className="rep-sec">
            <div className="rep-sec-title">Against call</div>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
              <b>{c('ucn')}</b> · {c('callNumber')}<br />
              {c('partyName')} — {c('productName')} {c('serial') && `(${c('serial')})`} · {c('itemStatus')}
            </div>
          </section>
        )}

        <section className="rep-sec">
          <div className="rep-sec-title">Request <span className="muted">· UID {uid}</span></div>
          <div className="rep-grid">
            <label className="rep-field">
              <span className="field-label">Request UID</span>
              <input className="input" value={uid} readOnly />
            </label>
            <label className="rep-field">
              <span className="field-label">Request Type</span>
              <select className="select" value={reqType} onChange={(e) => setReqType(e.target.value)}>
                {REQ_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            {reqType === 'HandStock' && (
              <label className="rep-field">
                <span className="field-label">Reason for HandStock *</span>
                <input className="input" value={handstockReason} onChange={(e) => setHandstockReason(e.target.value)} />
              </label>
            )}
            <label className="rep-field rep-span2">
              <span className="field-label">Additional Remarks</span>
              <input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </label>
          </div>
        </section>

        <section className="rep-sec">
          <div className="rep-sec-title">Spares <span className="muted">{spareMaster.ready ? `(${spareMaster.values.length} parts)` : '(loading parts…)'}</span></div>
          <datalist id="dl-spares">
            {spareMaster.values.slice(0, 2000).map((v) => <option key={v} value={v} />)}
          </datalist>
          {spares.map((s, i) => (
            <div className="spare-row" key={i}>
              <input className="input spare-part" list="dl-spares" placeholder="Search part (CODE|Description)…" value={s.spare} onChange={(e) => setSpare(i, 'spare', e.target.value)} />
              <input className="input spare-qty" type="number" min={1} value={s.qty} onChange={(e) => setSpare(i, 'qty', e.target.value)} />
              <button className="btn btn-ghost btn-sm" title="Remove" onClick={() => removeSpareRow(i)} disabled={spares.length === 1}>✕</button>
            </div>
          ))}
          {spares.length < MAX_SPARES && <button className="btn btn-sm" onClick={addSpareRow}>＋ Add spare</button>}
        </section>

        <div className="rep-actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || !(supabaseConfigured() || sheetsConfigured())}>{busy ? 'Submitting…' : 'Submit Request'}</button>
        </div>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Spare Requests register (status view from v2_OR_Req).
// ---------------------------------------------------------------------------
const COLUMNS: Column<Row>[] = [
  { key: 'UID', header: 'UID', width: 150, wrap: false },
  { key: 'OR NO', header: 'OR No', width: 110, wrap: false },
  { key: 'OR Date', header: 'Date', width: 150, wrap: false },
  { key: 'UC Number', header: 'UCN', width: 110, wrap: false },
  { key: 'Party Name', header: 'Party', width: 200 },
  { key: 'Product Name', header: 'Product', width: 120 },
  { key: 'Part Number', header: 'Part', width: 110, wrap: false },
  { key: 'Part Description', header: 'Description', width: 200 },
  { key: 'Requested Qty', header: 'Qty', width: 60, align: 'right', wrap: false },
  { key: 'RMApproval', header: 'RM', width: 110, render: (r) => badge(g(r, 'RMApproval')) },
  { key: 'ADMIN Approval', header: 'Admin', width: 130, render: (r) => badge(g(r, 'ADMIN Approval')) },
  { key: 'Stores Status', header: 'Stores', width: 130, render: (r) => badge(g(r, 'Stores Status')) },
  { key: 'Status', header: 'Status', width: 140, render: (r) => badge(g(r, 'Status')) },
];

// Supabase shape (spare_request_lines joined with spare_requests) with the
// approval workflow columns.
const SUPA_COLUMNS: Column<Row>[] = [
  { key: 'uid', header: 'UID', width: 150, wrap: false },
  { key: 'requested_at', header: 'Date', width: 130, wrap: false, render: (r) => fmtLongDate(r.requested_at) },
  { key: 'ucn', header: 'UCN', width: 120, wrap: false },
  { key: 'party_name', header: 'Party', width: 190 },
  { key: 'product_name', header: 'Product', width: 120 },
  { key: 'part', header: 'Part', width: 180 },
  { key: 'qty', header: 'Qty', width: 55, align: 'right', wrap: false },
  { key: 'item_status', header: 'Item', width: 70, wrap: false },
  { key: 'stage', header: 'Stage', width: 130, wrap: false, render: (r) => badge(deriveStage(r)) },
  { key: 'rm_approval', header: 'RM', width: 100, render: (r) => badge(g(r, 'rm_approval')) },
  { key: 'commercial_approval', header: 'Commercial', width: 120, render: (r) => badge(g(r, 'commercial_approval')) },
  { key: 'nsm_approval', header: 'NSM', width: 110, render: (r) => badge(g(r, 'nsm_approval')) },
  { key: 'stores_status', header: 'Stores', width: 110, render: (r) => badge(g(r, 'stores_status')) },
  { key: 'dc_number', header: 'DC No', width: 110, wrap: false },
];

const CACHE_KEY = 'spareRequests';

export function SpareRequests() {
  const { user, can } = useAuth();
  const scope = useAccessScope();
  const onDb = supabaseConfigured();
  const cached = onDb ? loadCache<Row>(CACHE_KEY) : null;
  const PAGE = 1000;
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [offset, setOffset] = useState(cached?.rows.length ?? 0);
  const [more, setMore] = useState((cached?.rows.length ?? 0) >= PAGE);
  const [drawer, setDrawer] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    (onDb || sheetsConfigured()) ? null : { tone: 'info', text: 'Connect the database in Settings to load spare requests.' },
  );

  const load = async () => {
    if (onDb) {
      setBusy(true); setMsg({ tone: 'info', text: 'Loading spare requests…' });
      try {
        const r = await listSpareRequestLines(PAGE, 0);
        const mapped = r.map((x, i) => ({ ...x, id: String(`${g(x as Row, 'uid')}-${g(x as Row, 'part')}-${i}`) } as Row));
        setRows(mapped); setOffset(mapped.length); setMore(r.length === PAGE); setLastSync(saveCache(CACHE_KEY, mapped));
        setMsg({ tone: 'ok', text: `Synced ${mapped.length} spare-request line${mapped.length === 1 ? '' : 's'}.` });
      } catch (e) {
        setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
      } finally { setBusy(false); }
      return;
    }
    if (!sheetsConfigured()) return;
    setBusy(true); setMsg({ tone: 'info', text: 'Loading spare requests…' });
    try {
      let r = await listTabRows(STATUS_TAB, 600, '', BOOK).catch(() => [] as Record<string, unknown>[]);
      let from = STATUS_TAB;
      if (r.length === 0) {
        const intake = await listTabRows(INTAKE_TAB, 600, '', BOOK).catch(() => [] as Record<string, unknown>[]);
        if (intake.length > 0) { r = intake; from = INTAKE_TAB; }
      }
      setRows(r.map((x, i) => ({ ...x, id: `${g(x, 'UID') || g(x, 'OR NO')}-${g(x, 'Part Number')}-${i}` })));
      setLastSync(new Date().toISOString());
      setMsg({ tone: 'ok', text: `Loaded ${r.length} spare-request line${r.length === 1 ? '' : 's'} from ${from}.` });
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };
  useEffect(() => {
    if (onDb && rows.length && !isStale(lastSync)) { setMsg({ tone: 'info', text: `Showing cached data — synced ${timeAgo(lastSync)}. ↻ Refresh to update.` }); }
    else void load();
    const id = onDb ? window.setInterval(() => void load(), SYNC_TTL_MS) : undefined;
    return () => { if (id) window.clearInterval(id); };
    // eslint-disable-next-line
  }, []);

  const email = String(user?.email ?? '').trim().toLowerCase();
  // Role scope: engineer sees own; RM/RGM their team; admin all. On Supabase the
  // rows are already RLS-scoped by the directory, so no extra client filter.
  const scoped = useMemo(() => {
    if (scope.all || onDb) return rows;
    const inTeam = (name: string) => scope.names.has(name.trim().toLowerCase());
    return rows.filter((r) =>
      inTeam(g(r, 'ENGINEER NAME')) ||
      g(r, 'Engineer Email').toLowerCase() === email ||
      g(r, 'Reporting Manager').toLowerCase() === email ||
      g(r, 'Regional Manager').toLowerCase() === email,
    );
  }, [rows, scope, email, onDb]);

  const loadMore = async () => {
    setBusy(true);
    try {
      const r = await listSpareRequestLines(PAGE, offset);
      const mapped = r.map((x, i) => ({ ...x, id: String(`${g(x as Row, 'uid')}-${g(x as Row, 'part')}-${offset + i}`) } as Row));
      const merged = [...rows, ...mapped];
      setRows(merged); setOffset(offset + r.length); setMore(r.length === PAGE); setLastSync(saveCache(CACHE_KEY, merged));
    } catch (e) { setMsg({ tone: 'error', text: `Load more failed: ${e instanceof Error ? e.message : String(e)}` }); } finally { setBusy(false); }
  };
  const actor = user?.fullName || user?.email || 'user';
  const act = async (row: Row, decision: 'approve' | 'reject') => {
    const res = await updateSpareRequest(String(row.uid), buildPatch(row, decision, actor));
    if (res.ok) void load(); else setMsg({ tone: 'error', text: res.error ?? 'Update failed.' });
  };
  const doDispatch = async (row: Row) => {
    const dc = window.prompt('DC / Stock-out number for dispatch:', String(row.dc_number ?? ''));
    if (dc == null) return;
    const res = await updateSpareRequest(String(row.uid), dispatchPatch(dc.trim(), actor));
    if (res.ok) void load(); else setMsg({ tone: 'error', text: res.error ?? 'Dispatch failed.' });
  };
  const wfColumn: Column<Row> = {
    key: '_wf', header: 'Action', width: 210, sortable: false, wrap: false,
    render: (row) => {
      const stage = deriveStage(row);
      const action = stageAction(stage);
      if (!action || !can(action)) return <span className="muted">{stage === 'Dispatched' ? '✓ Dispatched' : stage === 'Rejected' ? '✕ Rejected' : '—'}</span>;
      if (stage === 'Stores') return <button className="btn btn-sm btn-primary" onClick={() => void doDispatch(row)}>🚚 Dispatch + DC</button>;
      return (
        <div className="row" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-sm btn-primary" onClick={() => void act(row, 'approve')}>✔ Approve</button>
          <button className="btn btn-sm" onClick={() => void act(row, 'reject')}>✖ Reject</button>
        </div>
      );
    },
  };
  const columns = onDb ? [...SUPA_COLUMNS, wfColumn] : COLUMNS;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    const keys = onDb
      ? ['uid', 'ucn', 'party_name', 'product_name', 'part', 'req_engineer', 'status']
      : ['OR NO', 'UC Number', 'Party Name', 'Product Name', 'Part Number', 'Part Description', 'ENGINEER NAME', 'Status'];
    return scoped.filter((r) => keys.some((k) => g(r, k).toLowerCase().includes(q)));
  }, [scoped, search, onDb]);

  const allFields = useMemo(() => {
    const ks = new Set<string>();
    rows.slice(0, 40).forEach((r) => Object.keys(r).forEach((k) => { if (k && !k.startsWith('_') && k !== 'id') ks.add(k); }));
    return [...ks].map((k) => ({ key: k, header: k }));
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Spare Requests"
        subtitle="Raise and track spare requests against calls (26_SpareRequest)."
        icon="📦"
        actions={can('edit') && <button className="btn btn-primary" onClick={() => setDrawer(true)}>＋ New Spare Request</button>}
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <DataTable<Row>
        columns={columns}
        allFields={allFields}
        rows={visible}
        getRowId={(r) => r.id}
        storageKey="spareRequests"
        rowsBeforeScroll={14}
        dense
        onLoadMore={onDb ? loadMore : undefined}
        moreAvailable={onDb && more}
        loadingMore={busy}
        emptyText="No spare requests — Refresh to load."
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="UID, UCN, party, part, engineer, status…" />
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off" title={`Last synced ${new Date(lastSync).toLocaleString()}`}>⟳ {timeAgo(lastSync)}</span>}
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('spare-requests.csv', columns.map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />

      <SpareRequestDrawer
        call={null}
        open={drawer}
        onClose={() => setDrawer(false)}
        onSaved={(_ucn, uid) => { setMsg({ tone: 'ok', text: `Spare request ${uid ?? ''} submitted.` }); void load(); }}
      />
    </div>
  );
}

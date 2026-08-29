import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Drawer, Modal, Toolbar, SearchBox } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { csvExport, fmtLongDate, makeRequestUID, timeAgo, todayISO } from '../lib/format';
import { listTabRows, sheetsConfigured, listUsers } from '../lib/sheets';
import {
  addSpareRequest, listSpareRequestLines, updateSpareRequestLine, updateSpareRequestLinesAtStage,
  searchCalls, supabaseConfigured,
} from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import {
  deriveStage, buildPatch, dispatchPatch, receivePatch, actionable, needsReview, trail,
  canBulkApprove, STAGES, stageTone, type Stage,
} from '../lib/spareflow';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { useAccessScope } from '../lib/access';
import { useMaster } from '../lib/masters';
import './fieldcalls.css';

// ===========================================================================
// SPARE REQUESTS.
//   • Raising a request writes to Supabase — one spare_requests row plus a
//     spare_request_lines row per part, with the OR number, OR date and RowNo
//     assigned by the database. The old v2_ORReq-All sheet append is gone.
//   • The register lists one row per part with the approval + dispatch status,
//     and runs the workflow in-app: RM → Commercial → NSM → Stores (dispatch
//     + DC) → engineer acknowledgement, with stage tiles, a "needs my action"
//     queue, a detail drawer and an approval trail.
//   • Reads still fall back to the 26_SpareRequest sheet when Supabase is not
//     connected, so an unmigrated deployment can still see its history.
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
//
// Fields follow the intake spec:
//   UID · Engineer Email (the signed-in user) · TimeStamp (created_at) ·
//   OR Req Date (today) · ENGINEER NAME (from the mail id; every role except
//   Engineer may point the request at someone else) · Req Type · OR NO and
//   RowNo (assigned by the database) · Call Number / UC Number / Party /
//   Product / Serial / Complaint / Item Status (from the Call Register, and
//   mandatory when the type is Call Based) · Reason for HANDSTOCK (mandatory
//   when the type is HandStock) · Additional Remarks · up to 20 Spare + Qty
//   rows, each editable and removable until the request is submitted.
// ---------------------------------------------------------------------------
export interface CallLike { ucn?: unknown; [key: string]: unknown }

const MIN_QTY = 1;

// The call fields the register copies onto a request.
interface PickedCall {
  ucn: string; callNumber: string; partyName: string; productName: string;
  serial: string; complaint: string; itemStatus: string;
}
const EMPTY_CALL: PickedCall = { ucn: '', callNumber: '', partyName: '', productName: '', serial: '', complaint: '', itemStatus: '' };

const callToPicked = (c: Record<string, unknown> | CallLike | null): PickedCall => {
  const g = (k: string) => String((c as Record<string, unknown>)?.[k] ?? '');
  if (!c) return EMPTY_CALL;
  return {
    ucn: g('ucn'), callNumber: g('callNumber'), partyName: g('partyName'), productName: g('productName'),
    serial: g('serial'), complaint: g('complaintReported') || g('standardComplaint'), itemStatus: g('itemStatus'),
  };
};

export function SpareRequestDrawer({
  call, open, onClose, onSaved,
}: {
  call: CallLike | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (ucn: string, uid?: string, orNo?: string) => void;
}) {
  const { user } = useAuth();
  const spareMaster = useMaster('spare');
  const [reqType, setReqType] = useState('Call Based');
  const [engineer, setEngineer] = useState('');
  const [engineerOpts, setEngineerOpts] = useState<string[]>([]);
  const [picked, setPicked] = useState<PickedCall>(EMPTY_CALL);
  const [remarks, setRemarks] = useState('');
  const [handstockReason, setHandstockReason] = useState('');
  const [spares, setSpares] = useState<{ spare: string; qty: string }[]>([{ spare: '', qty: '1' }]);
  const [uid, setUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Engineers raise requests for themselves; every other role may point a
  // request at one of their engineers.
  const canPickEngineer = (user?.rbacRole ?? 'engineer') !== 'engineer';
  // A call passed in from the call view fixes the call fields; opened from the
  // register, the user picks the UCN.
  const fixedCall = !!call?.ucn;

  // A fresh UID (WA-yyyymmdd-xxxx) is minted each time the drawer opens, so the
  // engineer can see/quote the reference for the request they're about to raise.
  useEffect(() => {
    if (!open) return;
    setReqType('Call Based'); setRemarks(''); setHandstockReason('');
    setSpares([{ spare: '', qty: '1' }]); setUid(makeRequestUID()); setErr('');
    setEngineer(user?.fullName ?? '');
    setPicked(callToPicked(call));
  }, [open, call, user]);

  // Directory names for the engineer picker (only for roles that may choose).
  useEffect(() => {
    if (!open || !canPickEngineer || engineerOpts.length) return;
    let alive = true;
    listUsers('', 2000)
      .then((rows) => {
        if (!alive) return;
        const names = [...new Set(rows.map((r) => String(r['User Name'] ?? '').trim()).filter(Boolean))].sort();
        setEngineerOpts(names);
      })
      .catch(() => { /* the field stays a free-text input */ });
    return () => { alive = false; };
  }, [open, canPickEngineer, engineerOpts.length]);

  const setSpare = (i: number, field: 'spare' | 'qty', v: string) =>
    setSpares((s) => s.map((x, j) => (j === i ? { ...x, [field]: v } : x)));
  const addSpareRow = () => setSpares((s) => (s.length < MAX_SPARES ? [...s, { spare: '', qty: '1' }] : s));
  const removeSpareRow = (i: number) => setSpares((s) => (s.length > 1 ? s.filter((_, j) => j !== i) : s));

  const submit = async () => {
    const picks = spares
      .map((s) => ({ part: s.spare.trim(), qty: Math.max(MIN_QTY, Math.floor(Number(s.qty) || MIN_QTY)) }))
      .filter((s) => s.part !== '');
    if (picks.length === 0) { setErr('Add at least one spare.'); return; }
    if (picks.length > MAX_SPARES) { setErr(`A request carries at most ${MAX_SPARES} spares.`); return; }
    if (!engineer.trim()) { setErr('Engineer name is required.'); return; }
    if (reqType === 'Call Based' && !picked.ucn.trim()) { setErr('A Call-Based request needs a call (UC Number).'); return; }
    if (reqType === 'HandStock' && !handstockReason.trim()) { setErr('Enter the reason for the HandStock request.'); return; }

    // Call-Based requests carry the call's identifying fields.
    const callFields = reqType === 'Call Based' ? picked : EMPTY_CALL;
    const req: Record<string, unknown> = {
      uid,
      req_type: reqType,
      engineer: engineer.trim(),
      engineer_email: user?.email ?? '',
      ucn: callFields.ucn,
      call_number: callFields.callNumber,
      party_name: callFields.partyName,
      product_name: callFields.productName,
      serial: callFields.serial,
      complaint: callFields.complaint,
      item_status: callFields.itemStatus,
      handstock_reason: reqType === 'HandStock' ? handstockReason.trim() : '',
      remarks: remarks.trim(),
      status: 'Pending',
    };

    setBusy(true); setErr('');
    try {
      const t0 = performance.now();
      const res = await addSpareRequest(req, picks);
      logAudit({ action: 'spare.request', target: res.uid ?? uid, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error, duration_ms: Math.round(performance.now() - t0), meta: { ucn: callFields.ucn, parts: picks.length } });
      if (res.ok) { onSaved?.(callFields.ucn, res.uid ?? uid, res.orNo); onClose(); }
      else setErr(res.error ?? 'Could not submit the request.');
    } catch (e) {
      setErr(`Submit failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  const ready = supabaseConfigured();

  return (
    <Drawer open={open} onClose={onClose} title={picked.ucn ? `Request Spares — ${picked.ucn}` : 'New Spare Request'} width={780}>
      {!ready && <div className="sheet-banner sheet-banner-info"><span>Connect the database in Settings to raise spare requests.</span></div>}
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span><button className="btn btn-ghost btn-sm" onClick={() => setErr('')}>✕</button></div>}

      <div className="rep-form">
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
            <label className="rep-field">
              <span className="field-label">Engineer Name *</span>
              <input
                className="input" list="dl-engineers" value={engineer}
                onChange={(e) => setEngineer(e.target.value)} readOnly={!canPickEngineer}
                title={canPickEngineer ? 'Raise this request for another engineer' : 'Taken from your login'}
              />
            </label>
            <label className="rep-field">
              <span className="field-label">Engineer Email</span>
              <input className="input" value={user?.email ?? ''} readOnly />
            </label>
            <label className="rep-field">
              <span className="field-label">OR Req Date</span>
              <input className="input" value={fmtLongDate(todayISO())} readOnly />
            </label>
            <label className="rep-field">
              <span className="field-label">OR No</span>
              <input className="input" value="assigned on submit" readOnly />
            </label>
          </div>
          {canPickEngineer && (
            <datalist id="dl-engineers">
              {engineerOpts.map((n) => <option key={n} value={n} />)}
            </datalist>
          )}
        </section>

        {reqType === 'Call Based' && (
          <section className="rep-sec">
            <div className="rep-sec-title">Against call <span className="muted">· from the Call Register</span></div>
            {fixedCall ? (
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                <b>{picked.ucn}</b> · {picked.callNumber}<br />
                {picked.partyName} — {picked.productName} {picked.serial && `(${picked.serial})`} · {picked.itemStatus}
              </div>
            ) : (
              <CallPicker picked={picked} onPick={setPicked} />
            )}
          </section>
        )}

        {reqType === 'HandStock' && (
          <section className="rep-sec">
            <div className="rep-sec-title">HandStock</div>
            <label className="rep-field">
              <span className="field-label">Reason for HandStock Request *</span>
              <input className="input" value={handstockReason} onChange={(e) => setHandstockReason(e.target.value)} />
            </label>
          </section>
        )}

        <section className="rep-sec">
          <div className="rep-sec-title">
            Spares <span className="muted">{spareMaster.ready ? `(${spareMaster.values.length} parts)` : '(loading parts…)'} · {spares.length}/{MAX_SPARES}</span>
          </div>
          <datalist id="dl-spares">
            {spareMaster.values.slice(0, 2000).map((v) => <option key={v} value={v} />)}
          </datalist>
          {spares.map((s, i) => (
            <div className="spare-row" key={i}>
              <span className="spare-no muted">{i + 1}</span>
              <input className="input spare-part" list="dl-spares" placeholder="Search part (CODE|Description)…" value={s.spare} onChange={(e) => setSpare(i, 'spare', e.target.value)} />
              <input className="input spare-qty" type="number" min={MIN_QTY} step={1} value={s.qty} onChange={(e) => setSpare(i, 'qty', e.target.value)} />
              <button className="btn btn-ghost btn-sm" title="Remove" onClick={() => removeSpareRow(i)} disabled={spares.length === 1}>✕</button>
            </div>
          ))}
          {spares.length < MAX_SPARES
            ? <button className="btn btn-sm" onClick={addSpareRow}>＋ Add spare</button>
            : <span className="muted" style={{ fontSize: 12.5 }}>Maximum of {MAX_SPARES} spares per request.</span>}
        </section>

        <section className="rep-sec">
          <div className="rep-sec-title">Additional Remarks</div>
          <textarea className="input" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Anything the approver or stores should know…" />
        </section>

        <div className="rep-actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || !ready}>{busy ? 'Submitting…' : 'Submit Request'}</button>
        </div>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// UC Number picker — searches the Call Register and copies the picked call's
// party / product / serial / complaint / item status onto the request.
// ---------------------------------------------------------------------------
function CallPicker({ picked, onPick }: { picked: PickedCall; onPick: (c: PickedCall) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // Debounced so typing a UCN doesn't fire a query per keystroke.
  useEffect(() => {
    const term = q.trim();
    if (picked.ucn || term.length < 3) { setHits([]); return; }
    let alive = true;
    const id = window.setTimeout(() => {
      setBusy(true); setNote('');
      searchCalls('', { q: term }, 25)
        .then((rows) => { if (alive) { setHits(rows); setNote(rows.length ? '' : 'No calls match that search.'); } })
        .catch((e) => { if (alive) setNote(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (alive) setBusy(false); });
    }, 350);
    return () => { alive = false; window.clearTimeout(id); };
  }, [q, picked.ucn]);

  if (picked.ucn) {
    return (
      <div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
          <b>{picked.ucn}</b> · {picked.callNumber}<br />
          {picked.partyName} — {picked.productName} {picked.serial && `(${picked.serial})`} · {picked.itemStatus}<br />
          {picked.complaint}
        </div>
        <button className="btn btn-sm" onClick={() => { onPick(EMPTY_CALL); setQ(''); }}>Change call</button>
      </div>
    );
  }

  return (
    <div>
      <label className="rep-field">
        <span className="field-label">UC Number *</span>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search UCN, call number, party, serial…" />
      </label>
      {busy && <div className="muted" style={{ fontSize: 12.5 }}>Searching…</div>}
      {note && <div className="muted" style={{ fontSize: 12.5 }}>{note}</div>}
      {hits.length > 0 && (
        <ul className="call-hits">
          {hits.map((h, i) => {
            const c = callToPicked(h as CallLike);
            return (
              <li key={`${c.ucn}-${i}`}>
                <button className="call-hit" onClick={() => onPick(c)}>
                  <b>{c.ucn}</b> <span className="muted">{c.callNumber}</span>
                  <div className="muted">{c.partyName} — {c.productName} {c.serial && `(${c.serial})`}</div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
  // The spare's own ID (OR number + its row). This is the reference quoted on
  // the DC and used for the RM decision, so it leads the register.
  { key: 'line_uid', header: 'Spare ID', width: 160, wrap: false },
  { key: 'or_no', header: 'OR No', width: 100, wrap: false },
  { key: 'row_no', header: '#', width: 45, align: 'right', wrap: false },
  { key: 'uid', header: 'UID', width: 150, wrap: false },
  { key: 'or_req_date', header: 'OR Date', width: 110, wrap: false, render: (r) => fmtLongDate(r.or_req_date ?? r.requested_at) },
  { key: 'ucn', header: 'UCN', width: 120, wrap: false },
  { key: 'party_name', header: 'Party', width: 190 },
  { key: 'product_name', header: 'Product', width: 120 },
  { key: 'part', header: 'Part', width: 180 },
  { key: 'qty', header: 'Qty', width: 55, align: 'right', wrap: false },
  { key: 'item_status', header: 'Item', width: 70, wrap: false },
  { key: 'stage', header: 'Stage', width: 130, wrap: false, render: (r) => stageBadge(deriveStage(r)) },
  { key: 'rm_approval', header: 'RM', width: 100, render: (r) => badge(g(r, 'rm_approval')) },
  { key: 'commercial_approval', header: 'Commercial', width: 120, render: (r) => badge(g(r, 'commercial_approval')) },
  { key: 'nsm_approval', header: 'NSM', width: 110, render: (r) => badge(g(r, 'nsm_approval')) },
  { key: 'stores_status', header: 'Stores', width: 110, render: (r) => badge(g(r, 'stores_status')) },
  { key: 'dc_number', header: 'DC No', width: 110, wrap: false },
];

const stageBadge = (stage: Stage) => <span className={`badge badge-${stageTone(stage)}`}>{stage}</span>;

const CACHE_KEY = 'spareRequests';
const MINE = 'mine'; // pseudo-stage: "needs my action"

// A pending workflow decision awaiting confirmation in the modal.
//   scope 'line' — this spare only. The RM stage is always 'line': each part
//                  is approved or rejected on its own.
//   scope 'or'   — every line of the request still at this stage, for the
//                  later stages where deciding per OR is allowed.
type Scope = 'line' | 'or';
type Pending =
  | { kind: 'approve' | 'reject'; row: Row; scope: Scope; lines: number }
  | { kind: 'dispatch'; row: Row; scope: Scope; lines: number }
  | { kind: 'receive'; row: Row; scope: Scope; lines: number };

export function SpareRequests() {
  const { user, can } = useAuth();
  const scope = useAccessScope();
  const onDb = supabaseConfigured();
  const cached = onDb ? loadCache<Row>(CACHE_KEY) : null;
  const PAGE = 1000;
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<Stage | typeof MINE | ''>('');
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [offset, setOffset] = useState(cached?.rows.length ?? 0);
  const [more, setMore] = useState((cached?.rows.length ?? 0) >= PAGE);
  const [drawer, setDrawer] = useState(false);
  const [detail, setDetail] = useState<string>(''); // uid of the open request
  const [pending, setPending] = useState<Pending | null>(null);
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
  // How many lines of this request sit at the same stage and are mine to act on
  // — the size of a per-OR decision.
  const sameStageLines = (row: Row): Row[] => {
    const stage = deriveStage(row);
    return rows.filter((r) => String(r.uid) === String(row.uid)
      && deriveStage(r) === stage && actionable(r, can, email));
  };

  const runPending = async (p: Pending, input: { reason?: string; dc?: string; courier?: string; remarks?: string }) => {
    setPending(null);
    const { row, scope } = p;
    const stage = deriveStage(row);
    const patch =
      p.kind === 'dispatch' ? dispatchPatch(input.dc ?? '', actor, input.courier ?? '', input.remarks ?? '')
      : p.kind === 'receive' ? receivePatch(actor, input.remarks ?? '')
      : buildPatch(row, p.kind, actor, input.reason ?? '');
    const what = p.kind === 'approve' ? 'approved' : p.kind === 'reject' ? 'rejected'
      : p.kind === 'dispatch' ? 'dispatched' : 'acknowledged';

    setBusy(true);
    try {
      if (scope === 'or') {
        const res = await updateSpareRequestLinesAtStage(String(row.uid), [stage], patch);
        if (res.ok) setMsg({ tone: 'ok', text: `${res.count ?? 0} spare${res.count === 1 ? '' : 's'} on ${String(row.or_no ?? row.uid)} ${what}.` });
        else { setMsg({ tone: 'error', text: res.error ?? 'Update failed.' }); return; }
      } else {
        const res = await updateSpareRequestLine(row.line_id ?? row.id, patch);
        if (res.ok) setMsg({ tone: 'ok', text: `${String(row.line_uid ?? row.part ?? 'Spare')} ${what}.` });
        else { setMsg({ tone: 'error', text: res.error ?? 'Update failed.' }); return; }
      }
      await load();
    } finally { setBusy(false); }
  };

  // Action cell — the buttons for this SPARE's current stage, RBAC-gated.
  // Every decision here is per line. Where the stage allows a whole-OR
  // decision, an extra "all N" button appears once more than one line of the
  // request is sitting at the same stage; the RM stage never offers it.
  const wfButtons = (row: Row, size = 'btn-sm') => {
    const stage = deriveStage(row);
    if (!actionable(row, can, email)) {
      return <span className="muted">{stage === 'Received' ? '✓ Received' : stage === 'Dispatched' ? '🚚 In transit' : stage === 'Rejected' ? '✕ Rejected' : '—'}</span>;
    }
    const siblings = canBulkApprove(stage) ? sameStageLines(row).length : 1;
    const bulk = (kind: 'approve' | 'dispatch' | 'receive') => siblings > 1 && (
      <button className={`btn ${size}`} title={`Apply to all ${siblings} spares of this OR at this stage`}
        onClick={() => setPending({ kind, row, scope: 'or', lines: siblings })}>
        ⇉ all {siblings}
      </button>
    );
    if (stage === 'Stores') return (
      <div className="row">
        <button className={`btn ${size} btn-primary`} onClick={() => setPending({ kind: 'dispatch', row, scope: 'line', lines: 1 })}>🚚 Dispatch + DC</button>
        {bulk('dispatch')}
      </div>
    );
    if (stage === 'Dispatched') return (
      <div className="row">
        <button className={`btn ${size} btn-primary`} onClick={() => setPending({ kind: 'receive', row, scope: 'line', lines: 1 })}>📥 Mark received</button>
        {bulk('receive')}
      </div>
    );
    return (
      <div className="row">
        <button className={`btn ${size} btn-primary`} onClick={() => setPending({ kind: 'approve', row, scope: 'line', lines: 1 })}>✔ Approve</button>
        <button className={`btn ${size}`} onClick={() => setPending({ kind: 'reject', row, scope: 'line', lines: 1 })}>✖ Reject</button>
        {bulk('approve')}
      </div>
    );
  };
  const wfColumn: Column<Row> = {
    key: '_wf', header: 'Action', width: 210, sortable: false, wrap: false,
    render: (row) => <div onClick={(e) => e.stopPropagation()}>{wfButtons(row)}</div>,
  };
  const columns = onDb ? [...SUPA_COLUMNS, wfColumn] : COLUMNS;

  // ---- stage tiles + filters ---------------------------------------------
  const counts = useMemo(() => {
    const c: Record<string, number> = { [MINE]: 0 };
    STAGES.forEach((s) => { c[s] = 0; });
    if (!onDb) return c;
    scoped.forEach((r) => {
      c[deriveStage(r)] = (c[deriveStage(r)] ?? 0) + 1;
      if (actionable(r, can, email)) c[MINE] += 1;
    });
    return c;
    // eslint-disable-next-line
  }, [scoped, onDb, email]);

  const visible = useMemo(() => {
    let out = scoped;
    if (onDb && stageFilter) {
      out = stageFilter === MINE
        ? out.filter((r) => actionable(r, can, email))
        : out.filter((r) => deriveStage(r) === stageFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return out;
    const keys = onDb
      ? ['line_uid', 'uid', 'or_no', 'ucn', 'party_name', 'product_name', 'part', 'req_engineer', 'stage', 'status', 'dc_number']
      : ['OR NO', 'UC Number', 'Party Name', 'Product Name', 'Part Number', 'Part Description', 'ENGINEER NAME', 'Status'];
    return out.filter((r) => keys.some((k) => g(r, k).toLowerCase().includes(q)));
    // eslint-disable-next-line
  }, [scoped, search, onDb, stageFilter, email]);

  const allFields = useMemo(() => {
    const ks = new Set<string>();
    rows.slice(0, 40).forEach((r) => Object.keys(r).forEach((k) => { if (k && !k.startsWith('_') && k !== 'id') ks.add(k); }));
    return [...ks].map((k) => ({ key: k, header: k }));
  }, [rows]);

  // All lines of the request open in the detail drawer.
  const detailLines = useMemo(() => rows.filter((r) => String(r.uid) === detail), [rows, detail]);
  const detailRow = detailLines[0];

  return (
    <div>
      <PageHeader
        title="Spare Requests"
        subtitle="Raise, approve, dispatch and acknowledge spare requests against calls."
        icon="📦"
        actions={can('spare.request') && <button className="btn btn-primary" onClick={() => setDrawer(true)}>＋ New Spare Request</button>}
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {onDb && (
        <>
          <KpiGrid>
            <KpiCard label="Awaiting me" value={counts[MINE]} icon="⚡" tone="primary" sub="requests you can action" />
            <KpiCard label="In approval" value={counts['RM Approval'] + counts.Commercial + counts.NSM} icon="🕒" tone="warning" sub="RM · Commercial · NSM" />
            <KpiCard label="Awaiting dispatch" value={counts.Stores} icon="📦" tone="info" sub="cleared, with Stores" />
            <KpiCard label="Dispatched" value={counts.Dispatched} icon="🚚" tone="info" sub="in transit to the field" />
            <KpiCard label="Received" value={counts.Received} icon="✅" tone="success" sub="acknowledged by the engineer" />
            <KpiCard label="Rejected" value={counts.Rejected} icon="✕" tone="danger" sub="closed without dispatch" />
          </KpiGrid>

          <div className="stage-chips">
            <button className={`chip ${stageFilter === '' ? 'chip-on' : ''}`} onClick={() => setStageFilter('')}>All <b>{scoped.length}</b></button>
            <button className={`chip ${stageFilter === MINE ? 'chip-on' : ''}`} onClick={() => setStageFilter(MINE)}>⚡ Needs my action <b>{counts[MINE]}</b></button>
            {STAGES.map((s) => (
              <button key={s} className={`chip ${stageFilter === s ? 'chip-on' : ''}`} onClick={() => setStageFilter(stageFilter === s ? '' : s)}>{s} <b>{counts[s]}</b></button>
            ))}
          </div>
        </>
      )}

      <DataTable<Row>
        columns={columns}
        allFields={allFields}
        rows={visible}
        getRowId={(r) => r.id}
        onRowClick={onDb ? (r) => setDetail(String(r.uid)) : undefined}
        storageKey="spareRequests"
        rowsBeforeScroll={14}
        dense
        onLoadMore={onDb ? loadMore : undefined}
        moreAvailable={onDb && more}
        loadingMore={busy}
        emptyText="No spare requests — Refresh to load."
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="UID, UCN, party, part, engineer, DC, status…" />
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off" title={`Last synced ${new Date(lastSync).toLocaleString()}`}>⟳ {timeAgo(lastSync)}</span>}
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('spare-requests.csv', columns.filter((c) => c.key !== '_wf').map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />

      <SpareRequestDrawer
        call={null}
        open={drawer}
        onClose={() => setDrawer(false)}
        onSaved={(_ucn, uid, orNo) => {
          setMsg({ tone: 'ok', text: `Spare request ${orNo ? `${orNo} ` : ''}submitted${uid ? ` (${uid})` : ''}.` });
          void load();
        }}
      />

      <Drawer open={!!detail && !!detailRow} onClose={() => setDetail('')} title={`Spare Request — ${String(detailRow?.or_no ?? '') || detail}`} width={720}>
        {detailRow && <RequestDetail row={detailRow} lines={detailLines} action={wfButtons(detailRow, '')} />}
      </Drawer>

      <DecisionModal pending={pending} onClose={() => setPending(null)} onConfirm={(input) => { if (pending) void runPending(pending, input); }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail drawer — the request header, every requested part, and the audit
// trail of who approved / dispatched / received it, plus the next action.
// ---------------------------------------------------------------------------
function RequestDetail({ row, lines, action }: { row: Row; lines: Row[]; action: ReactNode }) {
  const stage = deriveStage(row);
  const field = (label: string, value: unknown) => (
    <div className="rep-field"><span className="field-label">{label}</span><span>{String(value ?? '') || '—'}</span></div>
  );
  return (
    <div className="rep-form">
      <section className="rep-sec">
        <div className="rep-sec-title">Status {stageBadge(stage)}</div>
        <div className="rep-grid">
          {field('OR No', row.or_no)}
          {field('OR Req Date', fmtLongDate(row.or_req_date ?? row.requested_at))}
          {field('Raised by', row.req_engineer)}
          {field('Raised on', fmtLongDate(row.requested_at))}
          {field('Request type', row.req_type)}
          {field('Item status', row.item_status)}
        </div>
        {!needsReview(row.item_status) && <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Commercial and NSM auto-approve — the item is neither AMC nor OGP.</p>}
        {stage === 'Rejected' && !!String(row.reject_reason ?? '') && (
          <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Rejected at {String(row.rejected_stage ?? '')}: {String(row.reject_reason)}</p>
        )}
        <div className="rep-actions" style={{ position: 'static' }}>{action}</div>
      </section>

      <section className="rep-sec">
        <div className="rep-sec-title">Against call</div>
        <div className="rep-grid">
          {field('UC Number', row.ucn)}
          {field('Call Number', row.call_number)}
          {field('Party', row.party_name)}
          {field('Product', row.product_name)}
          {field('Serial', row.serial)}
          {field('Complaint', row.complaint)}
        </div>
        {!!String(row.handstock_reason ?? '') && <p className="muted" style={{ fontSize: 12.5 }}>HandStock reason: {String(row.handstock_reason)}</p>}
        {!!String(row.remarks ?? '') && <p className="muted" style={{ fontSize: 12.5 }}>Remarks: {String(row.remarks)}</p>}
      </section>

      <section className="rep-sec">
        <div className="rep-sec-title">Parts requested <span className="muted">({lines.length})</span></div>
        <ul className="rep-spare-list">
          {[...lines]
            .sort((a, b) => Number(a.row_no ?? 0) - Number(b.row_no ?? 0))
            .map((l) => (
              <li key={l.id}>
                <b>{String(l.line_uid ?? l.row_no ?? '')}</b> — {String(l.part ?? '')} · qty {String(l.qty ?? '')}
                {!!String(l.dc_number ?? '') && <span className="muted"> · DC {String(l.dc_number)}{l.dispatched_at ? ` on ${fmtLongDate(l.dispatched_at)}` : ''}</span>}
                {' '}{stageBadge(deriveStage(l))}
              </li>
            ))}
        </ul>
      </section>

      <section className="rep-sec">
        <div className="rep-sec-title">Approval trail</div>
        <ol className="wf-trail">
          {trail(row).map((e, i) => (
            <li key={i} className={/reject/i.test(e.outcome) ? 'wf-bad' : 'wf-ok'}>
              <b>{e.stage}</b> — {e.outcome}
              <span className="muted">{e.by ? ` · ${e.by}` : ''}{e.at ? ` · ${fmtLongDate(e.at)}` : ''}</span>
              {e.note && <div className="muted" style={{ fontSize: 12 }}>{e.note}</div>}
            </li>
          ))}
        </ol>
        {!!String(row.dc_number ?? '') && <p className="muted" style={{ fontSize: 12.5 }}>DC / stock-out: <b>{String(row.dc_number)}</b>{String(row.courier ?? '') && ` · ${String(row.courier)}`}</p>}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation modal for every workflow decision. A rejection must carry a
// reason and a dispatch must carry a DC number — both are recorded on the
// request, so the trail explains itself later.
// ---------------------------------------------------------------------------
function DecisionModal({
  pending, onClose, onConfirm,
}: {
  pending: Pending | null;
  onClose: () => void;
  onConfirm: (input: { reason?: string; dc?: string; courier?: string; remarks?: string }) => void;
}) {
  const [reason, setReason] = useState('');
  const [dc, setDc] = useState('');
  const [courier, setCourier] = useState('');
  const [remarks, setRemarks] = useState('');
  useEffect(() => {
    if (pending) { setReason(''); setDc(String(pending.row.dc_number ?? '')); setCourier(''); setRemarks(''); }
  }, [pending]);
  if (!pending) return null;

  const { kind, row, scope, lines } = pending;
  const per = scope === 'or' ? `all ${lines} spares` : 'this spare';
  const title = kind === 'approve' ? `Approve ${per} — ${deriveStage(row)}`
    : kind === 'reject' ? `Reject ${per} — ${deriveStage(row)}`
    : kind === 'dispatch' ? `Dispatch ${per} from Stores` : `Acknowledge receipt of ${per}`;
  const blocked = (kind === 'reject' && !reason.trim()) || (kind === 'dispatch' && !dc.trim());

  return (
    <Modal open onClose={onClose} title={title} width={520}>
      <div className="rep-form">
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          <b>{String(row.or_no ?? row.uid ?? '')}</b> · {String(row.party_name ?? '')}
          <br />
          {scope === 'or'
            ? `Applies to every spare on this OR still at ${deriveStage(row)} — ${lines} of them.`
            : `Applies to this spare only — ${String(row.line_uid ?? '')}: ${String(row.part ?? '')}.`}
          {kind === 'approve' && !needsReview(row.item_status) && deriveStage(row) === 'RM Approval' &&
            <><br />Not AMC/OGP — approving clears Commercial and NSM automatically and sends it to Stores.</>}
          {deriveStage(row) === 'RM Approval' &&
            <><br />Other spares on this OR are unaffected — the RM decides each one separately.</>}
        </p>
        {kind === 'reject' && (
          <label className="rep-field">
            <span className="field-label">Reason for rejection *</span>
            <input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this request being rejected?" />
          </label>
        )}
        {kind === 'dispatch' && (
          <>
            <label className="rep-field">
              <span className="field-label">DC / stock-out number *</span>
              <input className="input" autoFocus value={dc} onChange={(e) => setDc(e.target.value)} />
            </label>
            <label className="rep-field">
              <span className="field-label">Courier / mode</span>
              <input className="input" value={courier} onChange={(e) => setCourier(e.target.value)} />
            </label>
            <label className="rep-field">
              <span className="field-label">Dispatch remarks</span>
              <input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </label>
          </>
        )}
        {kind === 'receive' && (
          <label className="rep-field">
            <span className="field-label">Receipt remarks</span>
            <input className="input" autoFocus value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Condition, short shipment, date received…" />
          </label>
        )}
        <div className="rep-actions" style={{ position: 'static' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={blocked} onClick={() => onConfirm({ reason, dc: dc.trim(), courier, remarks })}>
            {kind === 'approve' ? '✔ Approve' : kind === 'reject' ? '✖ Reject' : kind === 'dispatch' ? '🚚 Dispatch' : '📥 Confirm receipt'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

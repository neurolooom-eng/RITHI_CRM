import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Drawer, Modal, Toolbar, SearchBox } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { csvExport, fmtLongDate, makeRequestUID, timeAgo, todayISO } from '../lib/format';
import { listTabRows, sheetsConfigured } from '../lib/sheets';
import {
  addSpareRequest, listSpareRequestLines, updateSpareRequestLine, updateSpareRequestLinesAtStage,
  searchCalls, supabaseConfigured, receiveSpareShipments,
} from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import {
  deriveStage, buildPatch, receivePatch, dropPatch, actionable, needsReview, trail, awaitingReceipt,
  canBulkApprove, STAGES, stageTone, type Stage,
} from '../lib/spareflow';
import { logAudit } from '../lib/audit';
import {
  COMMERCIAL_STATUSES, CLEARING_REASONS, REASONS_NEEDING_MC_SA, DIRECT_PO_STEPS, PENDING_REASONS,
  NSM_STATUSES, NSM_REASONS, commercialGaps, commercialPatch, commercialSummary, clearsForStores,
  nsmGaps, nsmPatch, nsmSummary, nsmClearsForStores, mergeApprovalData,
  type CommercialAnswer, type NsmAnswer,
} from '../lib/spareapproval';
import { useAuth } from '../lib/auth';
import { useAccessScope, allowsAllottee, useTeamEngineers } from '../lib/access';
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
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

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
  const [picked, setPicked] = useState<PickedCall>(EMPTY_CALL);
  const [remarks, setRemarks] = useState('');
  const [handstockReason, setHandstockReason] = useState('');
  const [spares, setSpares] = useState<{ spare: string; qty: string }[]>([{ spare: '', qty: '1' }]);
  const [uid, setUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Engineers raise requests for themselves; a manager points one at any of the
  // engineers reporting to them, and an office desk at anyone. `canPick` is the
  // list having more than one name in it, so the rule lives in ONE place —
  // asking the role again here is how a manager ended up being offered all
  // 2,000 names in the directory.
  const team = useTeamEngineers(engineer);
  const canPickEngineer = team.canPick;
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

  // Who this request may be raised FOR: a manager's own reporting engineers,
  // an office desk's whole directory, an engineer just themselves. The same
  // list the report screen and the call request offer — it used to be every
  // name in the company, which is not what "raise it for one of mine" means.

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
    const t0 = performance.now();
    try {
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
              {canPickEngineer ? (
                <select
                  className="select" value={engineer} onChange={(e) => setEngineer(e.target.value)}
                  title="Raise this request for one of your engineers"
                >
                  {!engineer && <option value="">— select —</option>}
                  {team.names.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              ) : (
                <input className="input" value={engineer} readOnly title="Taken from your login" />
              )}
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
  // Partial dispatch: what has actually gone out, and what the engineer has
  // still to acknowledge. Blank until a line is part-sent, so the common case
  // stays uncluttered.
  {
    key: 'dispatched_qty', header: 'Sent', width: 110, wrap: false,
    render: (r) => {
      const sent = Number(g(r, 'dispatched_qty')) || 0;
      const want = Number(g(r, 'qty')) || 0;
      if (!sent) return <span className="muted">—</span>;
      const owed = awaitingReceipt(r);
      return (
        <span title={owed ? `${owed} delivered, not yet acknowledged` : undefined}>
          {sent === want ? <span className="badge badge-success">all {sent}</span>
                         : <span className="badge badge-warning">{sent} of {want}</span>}
          {owed > 0 && <span className="badge badge-info" style={{ marginLeft: 4 }}>{owed} to confirm</span>}
        </span>
      );
    },
  },
  { key: 'item_status', header: 'Item', width: 70, wrap: false },
  { key: 'stage', header: 'Stage', width: 130, wrap: false, render: (r) => stageBadge(deriveStage(r)) },
  { key: 'rm_approval', header: 'RM', width: 100, render: (r) => badge(g(r, 'rm_approval')) },
  { key: 'commercial_approval', header: 'Commercial', width: 120, render: (r) => badge(g(r, 'commercial_approval')) },
  { key: 'nsm_approval', header: 'NSM', width: 110, render: (r) => badge(g(r, 'nsm_approval')) },
  { key: 'stores_status', header: 'Stores', width: 110, render: (r) => badge(g(r, 'stores_status')) },
  { key: 'dc_number', header: 'DC No', width: 110, wrap: false },
];

// What Commercial and NSM answered, as a line of text rather than raw jsonb.
function approvalCell(row: Row): ReactNode {
  const d = (row.approval_data ?? {}) as Record<string, unknown>;
  const c = commercialSummary(d.commercial as CommercialAnswer | undefined);
  const n = nsmSummary(d.nsm as NsmAnswer | undefined);
  if (!c && !n) return '';
  return (
    <span style={{ fontSize: 12.5 }}>
      {c && <><b>Commercial:</b> {c}</>}
      {c && n && <br />}
      {n && <><b>NSM:</b> {n}</>}
    </span>
  );
}

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
  | { kind: 'approve' | 'reject' | 'drop'; row: Row; scope: Scope; lines: number }
  | { kind: 'receive'; row: Row; scope: Scope; lines: number };

export function SpareRequests() {
  const { user, can, viewAs } = useAuth();
  const navigate = useNavigate();
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
  // Who this user may give RM approval to: the engineers reporting to them,
  // and never themselves — a manager's own request goes to THEIR manager.
  // Mirrors spare_rm_may_approve() in 0033; the database refuses it either way,
  // this only stops offering a button that would be rejected.
  //
  // `scope.reports` is the reporting sub-tree WITHOUT the user. Empty means
  // they manage nobody: an administrator, or a coordination role (Hotline,
  // Spare Coordinator) that holds spare.approve_rm as a backstop — those keep
  // the wider remit, minus their own request.
  const mayRmApprove = useMemo(() => {
    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
    const self = norm(scope.selfName);
    const team = new Set(scope.reports.map(norm));
    return (engineer: unknown) => {
      const who = norm(engineer);
      if (!who) return true;
      if (self && who === self) return false;
      return team.size ? team.has(who) : true;
    };
  }, [scope.selfName, scope.reports]);

  // The row id of the SPARE whose drawer is open. Keyed by the spare, not the
  // request: each spare has its own stage, so showing one line's status under
  // the OR number reads as the whole order's status and misleads.
  const [detail, setDetail] = useState<string>('');
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
    if (scope.all) return rows;
    // On Supabase the rows are already scoped by RLS (0040_spare_read_scope),
    // so no client filter is needed — EXCEPT while an admin previews as someone
    // else. "View as" is a client-side identity: the query still runs under the
    // admin's own session, so without this the preview shows the admin's
    // visibility and not the previewed person's, which is the one thing the
    // preview exists to answer.
    if (onDb) {
      if (!viewAs) return rows;
      return rows.filter((r) =>
        allowsAllottee(scope, g(r, 'engineer') || g(r, 'req_engineer'))
        || g(r, 'engineer_email').toLowerCase() === norm(viewAs.email));
    }
    const inTeam = (name: string) => scope.names.has(name.trim().toLowerCase());
    return rows.filter((r) =>
      inTeam(g(r, 'ENGINEER NAME')) ||
      g(r, 'Engineer Email').toLowerCase() === email ||
      g(r, 'Reporting Manager').toLowerCase() === email ||
      g(r, 'Regional Manager').toLowerCase() === email,
    );
  }, [rows, scope, email, onDb, viewAs]);

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
      && deriveStage(r) === stage && actionable(r, can, email, mayRmApprove));
  };

  const runPending = async (
    p: Pending,
    input: { reason?: string; remarks?: string; commercial?: CommercialAnswer; nsm?: NsmAnswer },
  ) => {
    setPending(null);
    const { row, scope } = p;
    const stage = deriveStage(row);
    // The Commercial and NSM steps answer a form rather than a yes/no. Their
    // "in progress" / "on hold" answers record why without approving, so the
    // spare stays in that stage's queue.
    const held = (input.commercial && !clearsForStores(input.commercial))
              || (input.nsm && !nsmClearsForStores(input.nsm));
    const formPatch = input.commercial ? commercialPatch(input.commercial, actor)
                    : input.nsm ? nsmPatch(input.nsm, actor) : null;
    const patch =
      formPatch ? { ...formPatch, approval_data: mergeApprovalData(row.approval_data, formPatch) }
      : p.kind === 'receive' ? receivePatch(actor, input.remarks ?? '')
      : p.kind === 'drop' ? dropPatch(actor, input.reason ?? '')
      : buildPatch(row, p.kind, actor, input.reason ?? '');
    const what = held ? (input.nsm ? 'put on hold' : 'marked in progress')
      : p.kind === 'approve' ? 'approved' : p.kind === 'reject' ? 'rejected'
      : p.kind === 'drop' ? 'dropped'
      : 'acknowledged';

    setBusy(true);
    const t0 = performance.now();
    // One audit entry per decision, whether it covered one spare or the OR.
    const audit = (res: { ok: boolean; error?: string; count?: number }) => logAudit({
      action: `spare.${p.kind}`,
      target: scope === 'or' ? String(row.or_no ?? row.uid) : String(row.line_uid ?? row.uid),
      status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error,
      duration_ms: Math.round(performance.now() - t0),
      meta: { stage, scope, spares: scope === 'or' ? res.count ?? 0 : 1 },
    });

    try {
      // Receipt follows the stock: acknowledge the SHIPMENTS on this line (or on
      // every line of the OR at this stage), not just the line's own flag.
      if (p.kind === 'receive') {
        const ids = (scope === 'or' ? sameStageLines(row) : [row])
          .map((l) => Number((l as Row).line_id ?? (l as Row).id))
          .filter((n) => Number.isFinite(n) && n > 0);
        const res = await receiveSpareShipments(ids, actor, input.remarks ?? '');
        audit(res);
        if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not acknowledge.' }); return; }
        setMsg({ tone: 'ok', text: `${res.count ?? 0} delivery${(res.count ?? 0) === 1 ? '' : ' lines'} acknowledged.` });
        await load();
        return;
      }
      if (scope === 'or') {
        const res = await updateSpareRequestLinesAtStage(String(row.uid), [stage], patch);
        audit(res);
        if (res.ok) setMsg({ tone: 'ok', text: `${res.count ?? 0} spare${res.count === 1 ? '' : 's'} on ${String(row.or_no ?? row.uid)} ${what}.` });
        else { setMsg({ tone: 'error', text: res.error ?? 'Update failed.' }); return; }
      } else {
        const res = await updateSpareRequestLine(row.line_id ?? row.id, patch);
        audit(res);
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
    // A spare can be DROPPED at any still-open stage by whoever holds spare.drop
    // (Spare Coordinator / Hotline), even if the current stage is not theirs.
    const dropActive = ['RM Approval', 'Commercial', 'NSM', 'Stores'].includes(stage);
    const dropBtn = (can('spare.drop') && dropActive) ? (
      <button className={`btn ${size}`} title="Drop this spare — not sent (needs a reason)"
        onClick={() => setPending({ kind: 'drop', row, scope: 'line', lines: 1 })}>⊘ Drop</button>
    ) : null;
    if (!actionable(row, can, email, mayRmApprove)) {
      if (dropBtn) return <div className="row">{dropBtn}</div>;
      return <span className="muted">{stage === 'Received' ? '✓ Received' : stage === 'Dispatched' ? '🚚 In transit' : stage === 'Rejected' ? '✕ Rejected' : stage === 'Dropped' ? '⊘ Dropped' : '—'}</span>;
    }
    const siblings = canBulkApprove(stage) ? sameStageLines(row).length : 1;
    const bulk = (kind: 'approve' | 'receive') => siblings > 1 && (
      <button className={`btn ${size}`} title={`Apply to all ${siblings} spares of this OR at this stage`}
        onClick={() => setPending({ kind, row, scope: 'or', lines: siblings })}>
        ⇉ all {siblings}
      </button>
    );
    // Dispatch happens on Pending Dispatch, not here: the stock-out and DC
    // numbers are generated for a BATCH, so a spare booked out on its own from
    // the register would mint a document nobody asked for. This links to the
    // queue, already filtered to the engineer this spare is going to.
    if (stage === 'Stores') return (
      <div className="row">
        {can('spare.dispatch') && (
          <button className={`btn ${size} btn-primary`} onClick={() => navigate(`/spare-dispatch?engineer=${encodeURIComponent(g(row, 'engineer'))}`)}>
            🚚 Dispatch…
          </button>
        )}
        {dropBtn}
      </div>
    );
    if (stage === 'Dispatched' || awaitingReceipt(row) > 0) return (
      <div className="row">
        <button className={`btn ${size} btn-primary`} onClick={() => setPending({ kind: 'receive', row, scope: 'line', lines: 1 })}>
          📥 Mark received{awaitingReceipt(row) > 0 && stage !== 'Dispatched' ? ` (${awaitingReceipt(row)})` : ''}
        </button>
        {bulk('receive')}
        {dropBtn}
      </div>
    );
    return (
      <div className="row">
        <button className={`btn ${size} btn-primary`} onClick={() => setPending({ kind: 'approve', row, scope: 'line', lines: 1 })}>✔ Approve</button>
        <button className={`btn ${size}`} onClick={() => setPending({ kind: 'reject', row, scope: 'line', lines: 1 })}>✖ Reject</button>
        {bulk('approve')}
        {dropBtn}
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
      if (actionable(r, can, email, mayRmApprove)) c[MINE] += 1;
    });
    return c;
    // eslint-disable-next-line
  }, [scoped, onDb, email, mayRmApprove]);

  const visible = useMemo(() => {
    let out = scoped;
    if (onDb && stageFilter) {
      out = stageFilter === MINE
        ? out.filter((r) => actionable(r, can, email, mayRmApprove))
        : out.filter((r) => deriveStage(r) === stageFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return out;
    const keys = onDb
      ? ['line_uid', 'uid', 'or_no', 'ucn', 'party_name', 'product_name', 'part', 'req_engineer', 'stage', 'status', 'dc_number']
      : ['OR NO', 'UC Number', 'Party Name', 'Product Name', 'Part Number', 'Part Description', 'ENGINEER NAME', 'Status'];
    return out.filter((r) => keys.some((k) => g(r, k).toLowerCase().includes(q)));
    // eslint-disable-next-line
  }, [scoped, search, onDb, stageFilter, email, mayRmApprove]);

  const allFields = useMemo(() => {
    const ks = new Set<string>();
    rows.slice(0, 40).forEach((r) => Object.keys(r).forEach((k) => { if (k && !k.startsWith('_') && k !== 'id') ks.add(k); }));
    return [...ks].map((k) => (k === 'approval_data'
      // The Commercial and NSM answers are jsonb. Raw they are unreadable, so
      // the column shows what each stage actually answered.
      ? { key: k, header: 'Approvals', render: (r: Row) => approvalCell(r) }
      : { key: k, header: k }));
  }, [rows]);

  // The spare whose drawer is open, and every spare of the same request —
  // shown alongside it so the order's other parts stay visible.
  const detailRow = useMemo(() => rows.find((r) => String(r.id) === detail), [rows, detail]);
  const detailLines = useMemo(
    () => (detailRow ? rows.filter((r) => String(r.uid) === String(detailRow.uid)) : []),
    [rows, detailRow],
  );

  return (
    <div>
      <PageHeader
        title="Spare Requests"
        subtitle="Raise, approve, dispatch and acknowledge spare requests against calls."
        icon="📦"
        count={visible.length}
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
        onRowClick={onDb ? (r) => setDetail(String(r.id)) : undefined}
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

      <Drawer
        open={!!detail && !!detailRow}
        onClose={() => setDetail('')}
        title={`Spare ${String(detailRow?.line_uid ?? '') || String(detailRow?.or_no ?? '')}`}
        width={720}
      >
        {detailRow && <RequestDetail row={detailRow} lines={detailLines} action={wfButtons(detailRow, '')} />}
      </Drawer>

      <DecisionModal pending={pending} onClose={() => setPending(null)} onConfirm={(input) => { if (pending) void runPending(pending, input); }} />
    </div>
  );
}

// Where the order's spares actually are — "1 at Stores · 2 at RM Approval".
// The order has no single status of its own: its spares are approved and
// dispatched one at a time, so it is only ever a tally.
function orderSummary(lines: Row[]): string {
  if (lines.length <= 1) return '1 spare on this order.';
  const counts = new Map<string, number>();
  lines.forEach((l) => {
    const st = deriveStage(l);
    counts.set(st, (counts.get(st) ?? 0) + 1);
  });
  const parts = STAGES.filter((st) => counts.has(st)).map((st) => `${counts.get(st)} at ${st}`);
  return `${lines.length} spares — ${parts.join(' · ')}.`;
}

// ---------------------------------------------------------------------------
// Detail drawer — the SPARE that was opened, the other spares on its order,
// and the trail of who approved / dispatched / received it, plus the next
// action.
// ---------------------------------------------------------------------------
function RequestDetail({ row, lines, action }: { row: Row; lines: Row[]; action: ReactNode }) {
  const stage = deriveStage(row);
  const field = (label: string, value: unknown) => (
    <div className="rep-field"><span className="field-label">{label}</span><span>{String(value ?? '') || '—'}</span></div>
  );
  return (
    <div className="rep-form">
      <section className="rep-sec">
        {/* This spare, not the order. Each spare has its own stage — one of
            three reaching Stores must not read as the whole OR at Stores. */}
        <div className="rep-sec-title">
          Spare {String(row.line_uid ?? '')} {stageBadge(stage)}
        </div>
        <div className="rep-grid">
          {field('Part', row.part)}
          {field('Qty', row.qty)}
        </div>

        <div className="rep-sec-title" style={{ marginTop: 14 }}>On order {String(row.or_no ?? '')}</div>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>{orderSummary(lines)}</p>
        <div className="rep-grid">
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
        <div className="rep-sec-title">Every spare on this order <span className="muted">({lines.length})</span></div>
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
        {(() => {
          // What Commercial and NSM answered on their forms — including an
          // "in progress" or "on hold" answer, which records why the spare is
          // still sitting in that stage rather than moving on.
          const d = (row.approval_data ?? {}) as Record<string, unknown>;
          const c = commercialSummary(d.commercial as CommercialAnswer | undefined);
          const n = nsmSummary(d.nsm as NsmAnswer | undefined);
          if (!c && !n) return null;
          return (
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
              {c && <div><b>Commercial:</b> {c}</div>}
              {n && <div><b>NSM:</b> {n}</div>}
            </div>
          );
        })()}
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
  onConfirm: (input: { reason?: string; remarks?: string; commercial?: CommercialAnswer; nsm?: NsmAnswer }) => void;
}) {
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [com, setCom] = useState<CommercialAnswer>({ status: '' });
  const [nsm, setNsm] = useState<NsmAnswer>({ status: '', reasons: [] });
  useEffect(() => {
    if (pending) {
      setReason(''); setRemarks('');
      setCom({ status: '' }); setNsm({ status: '', reasons: [] });
    }
  }, [pending]);
  if (!pending) return null;

  const { kind, row, scope, lines } = pending;
  const per = scope === 'or' ? `all ${lines} spares` : 'this spare';
  const title = kind === 'approve' && (deriveStage(row) === 'Commercial' || deriveStage(row) === 'NSM')
    ? `${deriveStage(row)} approval — ${per}`
    : kind === 'approve' ? `Approve ${per} — ${deriveStage(row)}`
    : kind === 'reject' ? `Reject ${per} — ${deriveStage(row)}`
    : kind === 'drop' ? `Drop ${per} — not sent`
    : `Acknowledge receipt of ${per}`;
  // Commercial and NSM answer their own form instead of a plain approve.
  const stage = deriveStage(row);
  const onForm = kind === 'approve' && (stage === 'Commercial' || stage === 'NSM');
  const gaps = !onForm ? [] : stage === 'Commercial' ? commercialGaps(com) : nsmGaps(nsm);
  const blocked = ((kind === 'reject' || kind === 'drop') && !reason.trim()) || gaps.length > 0;

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
        {onForm && stage === 'Commercial' && (
          <>
            <label className="rep-field">
              <span className="field-label">Admin Status *</span>
              <select className="select" value={com.status}
                onChange={(e) => setCom({ status: e.target.value as CommercialAnswer['status'] })}>
                <option value="">— Choose —</option>
                {COMMERCIAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>

            {com.status === 'Cleared for Stores Processing' && (
              <label className="rep-field">
                <span className="field-label">Reason for Clearing? *</span>
                <select className="select" value={com.clearing_reason ?? ''}
                  onChange={(e) => setCom({ ...com, clearing_reason: e.target.value, mc_sa_number: '', direct_po: {} })}>
                  <option value="">— Choose —</option>
                  {CLEARING_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            )}

            {REASONS_NEEDING_MC_SA.includes(com.clearing_reason ?? '') && (
              <label className="rep-field">
                <span className="field-label">MC / SA number *</span>
                <input className="input" value={com.mc_sa_number ?? ''}
                  onChange={(e) => setCom({ ...com, mc_sa_number: e.target.value })}
                  placeholder="MCyyyy or SAyyyy — no spaces" />
              </label>
            )}

            {com.clearing_reason === 'Direct PO' && (
              <section className="rep-sec">
                <div className="rep-sec-title">Process Completed — Direct PO *</div>
                {DIRECT_PO_STEPS.map((step) => (
                  <div className="spare-row" key={step}>
                    <span style={{ flex: 1, fontSize: 13 }}>{step}</span>
                    {(['Yes', 'No'] as const).map((v) => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                        <input type="radio" name={`po-${step}`} checked={com.direct_po?.[step] === v}
                          onChange={() => setCom({ ...com, direct_po: { ...(com.direct_po ?? {}), [step]: v } })} />
                        {v}
                      </label>
                    ))}
                  </div>
                ))}
              </section>
            )}

            {com.status === 'Admin Process in Progress' && (
              <label className="rep-field">
                <span className="field-label">Pending Reason *</span>
                <select className="select" value={com.pending_reason ?? ''}
                  onChange={(e) => setCom({ ...com, pending_reason: e.target.value })}>
                  <option value="">— Choose —</option>
                  {PENDING_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            )}

            <label className="rep-field">
              <span className="field-label">Additional Comments (if any)</span>
              <textarea className="input" rows={2} value={com.comments ?? ''}
                onChange={(e) => setCom({ ...com, comments: e.target.value })} />
            </label>
          </>
        )}

        {onForm && stage === 'NSM' && (
          <>
            <label className="rep-field">
              <span className="field-label">Status *</span>
              <select className="select" value={nsm.status}
                onChange={(e) => setNsm({ ...nsm, status: e.target.value as NsmAnswer['status'] })}>
                <option value="">— Choose —</option>
                {NSM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>

            <section className="rep-sec">
              <div className="rep-sec-title">Reason for Approval / Rejection <span className="muted">· any that apply</span></div>
              {NSM_REASONS.map((r) => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '2px 0' }}>
                  <input type="checkbox" checked={(nsm.reasons ?? []).includes(r)}
                    onChange={(e) => setNsm({
                      ...nsm,
                      reasons: e.target.checked
                        ? [...(nsm.reasons ?? []), r]
                        : (nsm.reasons ?? []).filter((x) => x !== r),
                    })} />
                  {r}
                </label>
              ))}
              <label className="rep-field">
                <span className="field-label">Other</span>
                <input className="input" value={nsm.other ?? ''}
                  onChange={(e) => setNsm({ ...nsm, other: e.target.value })} />
              </label>
            </section>

            <label className="rep-field">
              <span className="field-label">Remarks</span>
              <textarea className="input" rows={2} value={nsm.remarks ?? ''}
                onChange={(e) => setNsm({ ...nsm, remarks: e.target.value })} />
            </label>
          </>
        )}

        {gaps.length > 0 && (
          <div className="muted" style={{ fontSize: 12.5 }}>{gaps[0]}</div>
        )}

        {kind === 'reject' && (
          <label className="rep-field">
            <span className="field-label">Reason for rejection *</span>
            <input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this request being rejected?" />
          </label>
        )}
        {kind === 'drop' && (
          <label className="rep-field">
            <span className="field-label">Reason for dropping *</span>
            <input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Short supply, no longer needed, superseded…" />
          </label>
        )}
        {kind === 'receive' && (
          <label className="rep-field">
            <span className="field-label">Receipt remarks</span>
            <input className="input" autoFocus value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Condition, short shipment, date received…" />
          </label>
        )}
        <div className="rep-actions" style={{ position: 'static' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={blocked}
            onClick={() => onConfirm({
              reason, remarks,
              ...(onForm && stage === 'Commercial' ? { commercial: com } : {}),
              ...(onForm && stage === 'NSM' ? { nsm } : {}),
            })}>
            {onForm && stage === 'Commercial'
              ? (com.status === 'Admin Process in Progress' ? '⏳ Record progress' : '✔ Clear for Stores')
              : onForm && stage === 'NSM'
              ? (nsm.status === 'Put on HOLD' ? '⏸ Put on hold' : '✔ Clear for Stores')
              : kind === 'approve' ? '✔ Approve' : kind === 'reject' ? '✖ Reject'
              : '📥 Confirm receipt'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

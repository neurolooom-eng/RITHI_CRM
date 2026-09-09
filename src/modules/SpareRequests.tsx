import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { PickList } from '../components/ui/PickList';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Drawer, Modal, Toolbar, SearchBox, FacetChips } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { csvExport, fmtLongDate, makeRequestUID, timeAgo, todayISO } from '../lib/format';
import { toIsoDate } from '../lib/dates';
import { listTabRows, sheetsConfigured } from '../lib/sheets';
import {
  addSpareRequest, listSpareRequestLines, updateSpareRequestLine, updateSpareRequestLinesAtStage,
  searchCalls, supabaseConfigured, receiveSpareShipments,
  sbReassignSpareRequest, sbListEngineerChanges, type EngineerChange,
  decideSpareLines, type SpareDecision,
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
import { useAccessScope, allowsAllottee, useTeamEngineers, useRegionByEngineer } from '../lib/access';
import { useMaster } from '../lib/masters';
import './fieldcalls.css';
import { Ucn } from '../lib/callstate';
import { useCallStates, callStateFor } from '../lib/callstates';

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

  // A part already on the row that the master no longer lists still has to be
  // offered, or reopening a draft would silently drop it.
  const withCurrent = (list: string[], current: string) =>
    current && !list.includes(current) ? [current, ...list] : list;

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
              <SelectPicker value={reqType} onChange={setReqType} options={[...REQ_TYPES]} />
            </label>
            <label className="rep-field">
              <span className="field-label">Engineer Name *</span>
              {canPickEngineer ? (
                <SelectPicker value={engineer} onChange={setEngineer} options={team.names}
                              emptyHint="Only engineers on your team are listed." />
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
          {/* TYPE TO SEARCH (user's ask, 2026-09-09), the same control the call
              request uses for the Standard Complaint and the Serial No.

              IT REPLACES A DATALIST, and that is worth spelling out because it
              trades one thing away and wins two. A datalist SUGGESTS: it also
              accepts anything typed, so a part that is not in the master could
              be requested — and it was capped at 2,000 entries, so a master
              past that had parts nobody could pick at all, only guess at. The
              PickList searches the WHOLE master and returns a part that
              exists. Everything downstream — dispatch, consumption, hand
              stock, the not-consumed report — matches on the CODE, so a
              hand-typed part is a code nothing else can match.

              AND THERE IS NO FREE-TEXT FALLBACK (the user, 2026-09-09), which
              is where this deliberately parts company with the call request's
              complaint field. A complaint typed by hand is still a readable
              description of a fault; a PART typed by hand is a code that
              dispatch, hand stock and consumption will all fail to match, and
              the request is the point where that enters the system. An empty
              master therefore DISABLES the box and says which — loading, or
              genuinely empty — rather than quietly accepting anything. */}
          {spares.map((s, i) => (
            <div className="spare-row" key={i}>
              <span className="spare-no muted">{i + 1}</span>
              <div className="spare-part">
                <PickList
                  value={s.spare}
                  options={withCurrent(spareMaster.values, s.spare)}
                  onPick={(v) => setSpare(i, 'spare', v)}
                  disabled={!spareMaster.values.length}
                  placeholder="Type any part of the code or description…"
                  emptyLabel={spareMaster.values.length ? '— pick a part —'
                    : spareMaster.ready ? '— no parts in the master —'
                    : '— loading parts… —'}
                  emptyHint="If the part is not here, it needs adding to the Part Master."
                />
              </div>
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
  { key: 'ucn', header: 'UCN', width: 130, wrap: false, render: (r) => <Ucn ucn={r.ucn} state={callStateFor(r.ucn)} /> },
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

// Did this request reach the database on a different day from the one it was
// raised? For anything loaded from a file it did — `created_at` defaults to
// now(), and the importer fills it only when the export carried a "Raised on"
// column. Worth showing when it differs, worth hiding when it does not.
function enteredLater(row: Record<string, unknown>): boolean {
  const or = toIsoDate(row.or_req_date);
  const at = toIsoDate(row.requested_at);
  return !!or && !!at && or !== at;
}

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
  // ---- approval in bulk (0116) ---------------------------------------------
  // The ask (2026-09-06): NSM / Admin / Super Admin tick boxes and approve, at
  // EVERY stage. The register is the right place for it because the selection
  // spans requests — the per-OR "all N" button beside a row only ever covered
  // one request at one stage.
  //
  // Each line is approved at the stage it is AT, so nothing skips a review.
  // What the caller may not approve is skipped and reported, not silently
  // dropped and not enough to fail the batch.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [deciding, setDeciding] = useState(false);
  // NOTHING HAPPENS ON THE BUTTON PRESS. A bulk decision over forty spares is
  // not something to discover you have made, so the button opens a
  // confirmation that names the count and the decision, takes the reason where
  // one is required, and only then acts (the user's ask, 2026-09-06).
  const [confirm, setConfirm] = useState<{ decision: SpareDecision; ids: string[]; clear: () => void } | null>(null);
  const [why, setWhy] = useState('');
  const mayBulkApprove = can('spare.approve_rm') || can('spare.approve_commercial') || can('spare.approve_nsm');
  const mayDrop = can('spare.drop');

  const VERB: Record<SpareDecision, string> = { approve: 'Approve', reject: 'Reject', drop: 'Drop' };
  const DONE: Record<SpareDecision, string> = { approve: 'approved', reject: 'rejected', drop: 'dropped' };

  const runDecision = async () => {
    if (!confirm) return;
    const { decision, ids, clear } = confirm;
    const lineIds = ids
      .map((id) => Number((rows.find((r) => String(r.id) === id) as Row | undefined)?.line_id ?? id))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!lineIds.length) { setMsg({ tone: 'error', text: 'Nothing selected.' }); return; }
    setDeciding(true);
    const t0 = performance.now();
    const res = await decideSpareLines(lineIds, decision, user?.fullName || user?.email || '', why.trim());
    logAudit({
      action: `spare.${decision}`, target: `${lineIds.length} spares`,
      status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error,
      duration_ms: Math.round(performance.now() - t0),
      meta: { scope: 'bulk', selected: lineIds.length, decided: res.decided ?? 0, skipped: res.skipped ?? 0 },
    });
    setDeciding(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? `Could not ${decision}.` }); return; }
    // BOTH numbers, always. "12 approved" over a selection of 14 leaves
    // somebody wondering about the other two.
    const skipped = res.skipped ?? 0;
    setMsg({
      tone: skipped ? 'info' : 'ok',
      text: `${res.decided ?? 0} spare${res.decided === 1 ? '' : 's'} ${DONE[decision]}`
        + (skipped ? ` — ${skipped} skipped (${res.reason || 'not yours to decide at that stage'}).` : '.'),
    });
    setConfirm(null); setWhy('');
    clear();
    void load();
  };

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

  // More rows are waiting: every count on this screen is a lower bound.
  const partial = onDb && more;

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

  // ---- stage tiles + engineer tiles + filters -----------------------------
  //
  // The two narrow together, and each one's COUNTS are taken after the other
  // has been applied — so "PAWAN 4" under a stage means four of PAWAN's are at
  // that stage, not four in total. A count that ignores the filter next to it
  // is a number nobody can act on.
  const [engineerFilter, setEngineerFilter] = useState('');
  // A spare carries no region either; it comes off the engineer, as on a call.
  const regionOf = useRegionByEngineer();
  const engineerOf = (r: Row) => g(r, 'req_engineer') || g(r, 'engineer');
  const byStage = (list: Row[]) => (onDb && stageFilter
    ? (stageFilter === MINE
      ? list.filter((r) => actionable(r, can, email, mayRmApprove))
      : list.filter((r) => deriveStage(r) === stageFilter))
    : list);
  const byEngineer = (list: Row[]) => (engineerFilter ? list.filter((r) => engineerOf(r) === engineerFilter) : list);

  const engineerCounts = useMemo(() => {
    const c = new Map<string, number>();
    byStage(scoped).forEach((r) => { const n = engineerOf(r); c.set(n, (c.get(n) ?? 0) + 1); });
    return [...c.entries()].map(([key, count]) => ({ key, count }));
    // eslint-disable-next-line
  }, [scoped, stageFilter, onDb, email, mayRmApprove]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { [MINE]: 0 };
    STAGES.forEach((s) => { c[s] = 0; });
    if (!onDb) return c;
    byEngineer(scoped).forEach((r) => {
      c[deriveStage(r)] = (c[deriveStage(r)] ?? 0) + 1;
      if (actionable(r, can, email, mayRmApprove)) c[MINE] += 1;
    });
    return c;
    // eslint-disable-next-line
  }, [scoped, onDb, email, mayRmApprove, engineerFilter]);

  const visible = useMemo(() => {
    let out = byEngineer(byStage(scoped));
    const q = search.trim().toLowerCase();
    if (!q) return out;
    const keys = onDb
      ? ['line_uid', 'uid', 'or_no', 'ucn', 'party_name', 'product_name', 'part', 'req_engineer', 'stage', 'status', 'dc_number']
      : ['OR NO', 'UC Number', 'Party Name', 'Product Name', 'Part Number', 'Part Description', 'ENGINEER NAME', 'Status'];
    return out.filter((r) => keys.some((k) => g(r, k).toLowerCase().includes(q)));
    // eslint-disable-next-line
  }, [scoped, search, onDb, stageFilter, engineerFilter, email, mayRmApprove]);

  // The UCNs on screen, coloured by their calls' status (the standing rule,
  // 2026-09-06). This register does not carry the state — a spare line knows
  // the UCN it was raised against, not what happened to that call — so they
  // are looked up in ONE request and shared. A UCN whose state has not arrived,
  // or that this reader may not see, stays uncoloured rather than guessed.
  useCallStates(visible.map((r) => String((r as { ucn?: unknown }).ucn ?? '')).filter(Boolean));

  const visibleWithRegion = useMemo(
    () => visible.map((r) => ({
      ...r,
      _region: regionOf.get(engineerOf(r).trim().toLowerCase()) ?? '',
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, regionOf],
  );

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
        onRefresh={() => void load()}
        refreshing={busy}
        syncedAt={lastSync}
        title="Spare Requests"
        subtitle="Raise, approve, dispatch and acknowledge spare requests against calls."
        icon="📦"
        count={visible.length}
        countMore={partial}
        onLoadMore={onDb ? loadMore : undefined}
        loadingMore={busy}
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
            {/* Counted over what has LOADED, so each is a lower bound while more
                is waiting behind Load more — "1+", never a bare 1. */}
            <button className={`chip ${stageFilter === '' ? 'chip-on' : ''}`} onClick={() => setStageFilter('')}>All <b>{scoped.length}{partial ? '+' : ''}</b></button>
            <button className={`chip ${stageFilter === MINE ? 'chip-on' : ''}`} onClick={() => setStageFilter(MINE)}>⚡ Needs my action <b>{counts[MINE]}{partial ? '+' : ''}</b></button>
            {STAGES.map((s) => (
              <button key={s} className={`chip ${stageFilter === s ? 'chip-on' : ''}`} onClick={() => setStageFilter(stageFilter === s ? '' : s)}>{s} <b>{counts[s]}{partial ? '+' : ''}</b></button>
            ))}
          </div>

          {/* The same strip, engineer wise. */}
          <FacetChips
            options={engineerCounts}
            value={engineerFilter}
            onChange={setEngineerFilter}
            allLabel="All engineers"
            blankLabel="— no engineer —"
            more={onDb && more}
          />
        </>
      )}

      <DataTable<Row>
        columns={columns}
        allFields={allFields}
        rows={visibleWithRegion}
        getRowId={(r) => r.id}
        onRowClick={onDb ? (r) => setDetail(String(r.id)) : undefined}
        storageKey="spareRequests"
        // Region, engineer, stage — the spare register's own three. The
        // engineer is on the REQUEST, not on the spare, so it is joined onto
        // every row as `req_engineer`; the region comes off that name.
        groupable={[
          { key: '_region', label: 'Region' },
          { key: 'req_engineer', label: 'Engineer' },
          { key: 'stage', label: 'Stage' },
        ]}
        rowsBeforeScroll={14}
        dense
        // Tick boxes appear only for somebody who can actually approve
        // something — an engineer gets a column of boxes leading to a button
        // that would refuse them, which is worse than not offering it.
        selectable={mayBulkApprove}
        selected={picked}
        onSelectedChange={setPicked}
        bulkBar={(mayBulkApprove || mayDrop) ? (ids, clear) => (
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <b>{ids.length}</b>
            <span className="muted">selected — each is decided at the stage it is at, so nothing skips a review.</span>
            <div className="spacer" />
            {mayBulkApprove && (
              <button className="btn btn-sm btn-primary" disabled={deciding}
                onClick={() => { setWhy(''); setConfirm({ decision: 'approve', ids, clear }); }}>
                ✔ Approve {ids.length}
              </button>
            )}
            {mayBulkApprove && (
              <button className="btn btn-sm" disabled={deciding}
                onClick={() => { setWhy(''); setConfirm({ decision: 'reject', ids, clear }); }}>
                ✕ Reject {ids.length}
              </button>
            )}
            {mayDrop && (
              <button className="btn btn-sm" disabled={deciding}
                onClick={() => { setWhy(''); setConfirm({ decision: 'drop', ids, clear }); }}>
                ⊘ Drop {ids.length}
              </button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={clear} disabled={deciding}>Clear</button>
          </div>
        ) : undefined}
        // Load more lives beside the count in the heading (see PageHeader), so
        // it is NOT passed here — there is one of it, not two.
        moreAvailable={partial}
        emptyText="No spare requests — Refresh to load."
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="UID, UCN, party, part, engineer, DC, status…" />
            <div className="spacer" />
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('spare-requests.csv', columns.filter((c) => c.key !== '_wf').map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />

      {/* THE ACKNOWLEDGEMENT. It names the decision and the count before
          anything happens, and takes the reason where one is required — the
          database refuses a reasonless reject or drop, so asking here is the
          difference between a form and an error message. */}
      {confirm && (
        <Modal
          open
          title={`${VERB[confirm.decision]} ${confirm.ids.length} spare${confirm.ids.length === 1 ? '' : 's'}?`}
          onClose={() => { if (!deciding) { setConfirm(null); setWhy(''); } }}
        >
          <p style={{ marginTop: 0 }}>
            {confirm.decision === 'approve'
              ? <>Each spare is approved <b>at the stage it is at</b>, so every one of them moves on by one step. Nothing skips a review.</>
              : confirm.decision === 'reject'
                ? <>Each spare is <b>refused at the stage it is at</b> and closes there. The stage and the reason are recorded against it.</>
                : <>Each spare is marked <b>not sent</b> by Stores. That is different from a rejection — it was approved, and then not dispatched.</>}
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            Anything you may not decide — your own request, or a stage that is not yours — is skipped and counted,
            not applied quietly.
          </p>
          {confirm.decision !== 'approve' && (
            <label className="rep-field">
              <span className="field-label">Reason *</span>
              <textarea className="textarea" rows={2} value={why} onChange={(e) => setWhy(e.target.value)}
                placeholder={confirm.decision === 'reject' ? 'Why is this being refused?' : 'Why was it not sent?'} />
              <span className="muted rep-hint">Required — it is recorded against every spare in this batch.</span>
            </label>
          )}
          <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => { setConfirm(null); setWhy(''); }} disabled={deciding}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={deciding || (confirm.decision !== 'approve' && !why.trim())}
              onClick={() => void runDecision()}
            >
              {deciding ? 'Working…' : `${VERB[confirm.decision]} ${confirm.ids.length}`}
            </button>
          </div>
        </Modal>
      )}

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
        {detailRow && <RequestDetail row={detailRow} lines={detailLines} action={wfButtons(detailRow, '')} onChanged={() => void load()} />}
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

// ---------------------------------------------------------------------------
// WHO THIS ORDER IS FOR — changing it, and the record of every change.
//
// The database decides whether it is allowed (0100); this asks and shows what
// came back. The rule it enforces is worth restating here, because it is the
// reason there is no edit box once a DC exists: hand stock is DERIVED from the
// request, so after dispatch the engineer's name is not a label on a record,
// it is whose parts they are. Moving it then would move stock out of one
// person's balance and into another's, with nothing to show it happened.
// Before dispatch nothing has moved and the name is simply a correction.
// ---------------------------------------------------------------------------
function EngineerOnOrder({ row, lines, onDone }: { row: Row; lines: Row[]; onDone: () => void }) {
  const { can } = useAuth();
  const uid = String(row.uid ?? '');
  const current = String(row.req_engineer ?? row.engineer ?? '');
  const team = useTeamEngineers(current);
  const [log, setLog] = useState<EngineerChange[]>([]);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Dispatched if ANY spare on the order has gone out, not just the one open in
  // the drawer — the database's rule is about the order, and a screen that
  // offered a button the database would refuse would be worse than no button.
  const dispatched = [row, ...lines].some((l) =>
    !!l.dispatched_at || !!String(l.dc_number ?? '') || Number(l.dispatched_qty ?? 0) > 0
    || /dispatch/i.test(String(l.stores_status ?? '')));
  const mayChange = can('manage-users') && !dispatched && supabaseConfigured();

  useEffect(() => {
    if (!uid || !supabaseConfigured()) return;
    let cancelled = false;
    void sbListEngineerChanges(uid).then((r) => { if (!cancelled) setLog(r); }).catch(() => { /* not applied yet */ });
    return () => { cancelled = true; };
  }, [uid]);

  const save = async () => {
    if (!to.trim()) { setErr('Choose the engineer this order is moving to.'); return; }
    setBusy(true); setErr('');
    const t0 = performance.now();
    try {
      await sbReassignSpareRequest(uid, to.trim(), '', why.trim());
      logAudit({ action: 'spare.reassign', target: String(row.or_no ?? uid), status: 'ok',
                 duration_ms: Math.round(performance.now() - t0), meta: { from: current, to: to.trim() } });
      setLog(await sbListEngineerChanges(uid));
      setOpen(false); setTo(''); setWhy('');
      onDone();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(m);
      logAudit({ action: 'spare.reassign', target: String(row.or_no ?? uid), status: 'error', error: m });
    } finally { setBusy(false); }
  };

  if (!mayChange && log.length === 0) return null;

  return (
    <section className="rep-sec">
      <div className="rep-sec-title">Engineer on this order</div>
      <div className="rep-grid">
        <div className="rep-field"><span className="field-label">Currently</span><span>{current || '—'}</span></div>
      </div>

      {mayChange && !open && (
        <div className="rep-actions" style={{ position: 'static' }}>
          <button className="btn btn-sm" onClick={() => { setOpen(true); setErr(''); }}>✎ Change engineer</button>
        </div>
      )}
      {!can('manage-users') ? null : dispatched && (
        <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
          Dispatched — the parts are in {current || 'the engineer'}&rsquo;s hands, so the name is fixed. Move the stock with a
          stock transfer instead.
        </p>
      )}

      {open && (
        <div className="rep-grid" style={{ marginTop: 8 }}>
          <label className="rep-field">
            <span className="field-label">Move to</span>
            <SelectPicker value={to} onChange={setTo} placeholder="— choose an engineer —"
                          options={team.names.filter((n) => n !== current)}
                          emptyHint="Only engineers on your team are listed." />
          </label>
          <label className="rep-field">
            <span className="field-label">Why</span>
            <input className="input" value={why} placeholder="Kept with the record" onChange={(e) => setWhy(e.target.value)} />
          </label>
          <div className="rep-actions" style={{ position: 'static' }}>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setOpen(false); setErr(''); }}>Cancel</button>
          </div>
        </div>
      )}
      {err && <p className="sheet-banner sheet-banner-error" style={{ marginTop: 8 }}>{err}</p>}

      {log.length > 0 && (
        <ol className="wf-trail" style={{ marginTop: 10 }}>
          {log.map((c) => (
            <li key={c.id} className="wf-ok">
              <b>{c.from_engineer || '—'} → {c.to_engineer}</b>
              <span className="muted">{c.changed_by_name ? ` · ${c.changed_by_name}` : ''}{c.changed_at ? ` · ${fmtLongDate(c.changed_at)}` : ''}</span>
              {c.reason && <div className="muted" style={{ fontSize: 12 }}>{c.reason}</div>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RequestDetail({ row, lines, action, onChanged }: { row: Row; lines: Row[]; action: ReactNode; onChanged?: () => void }) {
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
          {/* NOT "Raised on": for an imported request this is when the FILE was
              loaded (created_at defaults to now()), which is not a fact about
              the request. Shown only when it differs from the OR Req Date, and
              named for what it actually is. */}
          {enteredLater(row) && field('Entered in the system', fmtLongDate(row.requested_at))}
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

      <EngineerOnOrder row={row} lines={lines} onDone={() => onChanged?.()} />

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
              <SelectPicker value={com.status} placeholder="— Choose —"
                onChange={(v) => setCom({ status: v as CommercialAnswer['status'] })}
                options={[...COMMERCIAL_STATUSES]} />
            </label>

            {com.status === 'Cleared for Stores Processing' && (
              <label className="rep-field">
                <span className="field-label">Reason for Clearing? *</span>
                <SelectPicker value={com.clearing_reason ?? ''} placeholder="— Choose —"
                  onChange={(v) => setCom({ ...com, clearing_reason: v, mc_sa_number: '', direct_po: {} })}
                  options={[...CLEARING_REASONS]} />
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
                <SelectPicker value={com.pending_reason ?? ''} placeholder="— Choose —"
                  onChange={(v) => setCom({ ...com, pending_reason: v })}
                  options={[...PENDING_REASONS]} />
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
              <SelectPicker value={nsm.status} placeholder="— Choose —"
                onChange={(v) => setNsm({ ...nsm, status: v as NsmAnswer['status'] })}
                options={[...NSM_STATUSES]} />
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

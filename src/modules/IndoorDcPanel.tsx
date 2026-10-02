// ===========================================================================
// INDOOR_DC ON THE INDOOR SERVICE SCREEN (0321, 2026-10-02).
//
//   IndoorDcDrawer -- "Create Indoor DC" for the Ready units ticked on the
//                     register: To (prefilled from the Party Master, editable),
//                     DATE, MIRN No. / Customer Ref No. and its date, Mode of
//                     Despatch, PURPOSE typed once and editable per line.
//   IndoorDcList   -- every Indoor DC, each re-printable; the ones awaiting
//                     the reader's approval first, with Approve / Reject.
//
// THE APPROVAL (0323, the user: "Only the INDOOR DC needs an approval"). A DC
// is created PENDING APPROVAL naming its AUTHORISED BY -- the issuer's
// Reporting Manager, Regional Manager or an NSM (indoor_dc_authorisers()).
// That person (or an administrator) approves or rejects it. APPROVING FILES
// THE VISITS: for every job on the DC with a UCN, the Visit Entry drafted with
// its Indoor Service Report is filed against the call through the Visit
// Entry's OWN save path (fileVisit, CallReporting.tsx), as the approver, with
// the Indoor engineer as the visiting engineer -- then recorded on the job
// (record_indoor_visit) -- and only then is the DC approved. The database
// refuses the approval while any visit is unfiled, so a visit that fails
// leaves the DC pending, says why, and a retry files only what is left (the
// job remembers the visit it already filed).
//
// THE DATABASE DECIDES (create_indoor_dc): it issues the number, refuses a
// unit the dispatch rules would refuse (in the rule's own words), refuses
// units for different consignees, builds the lines and stamps every job with
// the DC No. and date. What this screen checks first -- Ready, no DC No. yet,
// one consignee -- is said early so nobody fills a form that will be refused;
// it is not the control.
// ===========================================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createIndoorDc, indoorJobProductCode, listIndoorAccessories, listIndoorDcs, sbPartyInfo,
  listIndoorDcAuthorisers, approveIndoorDc, rejectIndoorDc, recordIndoorVisit, indoorJobsOnDc, callByUcn,
  type IndoorDc, type IndoorJob,
} from '../lib/supabase';
import { equipmentDescription, jobConsignee } from '../lib/indoorforms';
import { formatDay } from '../lib/dates';
import { todayISO } from '../lib/format';
import { logAudit } from '../lib/audit';
import { SelectPicker } from '../components/ui/SelectPicker';
import { useAuth } from '../lib/auth';
import { fileVisit, INDOOR_VISIT_FIXED, type VisitDraft } from './CallReporting';

interface PreviewLine {
  key: string; jobId: number; accessoryId: number | null; jobNo: string;
  partNo: string; description: string; qty: number; purpose: string; edited: boolean;
}

/** The "To" block from the Party Master: name, address, then city / state /
 *  pincode on one line. Only what the master holds; the field stays editable. */
async function consigneeText(name: string): Promise<string> {
  const n = name.trim();
  if (!n) return '';
  const p = await sbPartyInfo(n).catch(() => null);
  if (!p) return n;
  const place = [p.city, p.state].filter(Boolean).join(', ') + (p.pincode ? ` - ${p.pincode}` : '');
  return [n, p.address, place.trim()].filter((x) => x && x.trim()).join('\n');
}

export function IndoorDcDrawer({ jobs, onClose, onIssued }: {
  jobs: IndoorJob[];
  onClose: () => void;
  onIssued: (dcNo: string) => void;
}) {
  const navigate = useNavigate();
  const [to, setTo] = useState('');
  // THE DC DATE IS THE DATE OF ENTRY (the user, 2026-10-02) -- shown, not
  // editable, and not sent: the database dates the DC itself.
  const dcDate = todayISO();
  const [authorisers, setAuthorisers] = useState<{ name: string; basis: string }[] | null>(null);
  const [authorisedBy, setAuthorisedBy] = useState('');
  const [ref, setRef] = useState('');
  const [refDate, setRefDate] = useState('');
  const [mode, setMode] = useState('');
  const [purpose, setPurpose] = useState('');
  const [lines, setLines] = useState<PreviewLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const consignee = jobs.length ? jobConsignee(jobs[0]!) : '';

  useEffect(() => {
    let live = true;
    listIndoorDcAuthorisers()
      .then((a) => { if (live) { setAuthorisers(a); if (a.length === 1) setAuthorisedBy(a[0]!.name); } })
      .catch((e) => { if (live) { setAuthorisers([]); setErr(`Could not read who may authorise: ${e instanceof Error ? e.message : String(e)}`); } });
    return () => { live = false; };
  }, []);

  // PREFILL ONCE, from the Party Master by the jobs' consignee.
  useEffect(() => {
    let live = true;
    void consigneeText(consignee).then((t) => { if (live) setTo((cur) => cur || t); });
    return () => { live = false; };
  }, [consignee]);

  // THE LINES AS THE DATABASE WILL WRITE THEM: per job the equipment, then each
  // accessory with a name or serial.
  useEffect(() => {
    let live = true;
    (async () => {
      const out: PreviewLine[] = [];
      for (const j of jobs) {
        const [code, acc] = await Promise.all([
          indoorJobProductCode(j.product_name, j.serial),
          listIndoorAccessories(j.id).catch(() => []),
        ]);
        out.push({ key: `${j.id}:eq`, jobId: j.id, accessoryId: null, jobNo: j.job_no, partNo: code,
                   description: equipmentDescription(j.product_name, j.serial), qty: 1, purpose: '', edited: false });
        // THE ACCESSORIES AS RECEIVED, with the quantity received (0323).
        acc.filter((a) => a.name.trim() || a.serial.trim()).sort((a, b) => a.id - b.id).forEach((a) => out.push({
          key: `${j.id}:${a.id}`, jobId: j.id, accessoryId: a.id, jobNo: j.job_no, partNo: '',
          description: equipmentDescription(a.name, a.serial), qty: Number(a.qty ?? 1) || 1, purpose: '', edited: false,
        }));
      }
      if (live) setLines(out);
    })();
    return () => { live = false; };
  }, [jobs]);

  const shown = useMemo(() => lines.map((l) => (l.edited ? l : { ...l, purpose })), [lines, purpose]);

  const issue = async () => {
    if (!to.trim()) { setErr('Fill in To — whom the DC goes to.'); return; }
    if (!authorisedBy.trim()) { setErr('Choose who AUTHORISES this DC — they approve it.'); return; }
    setBusy(true); setErr('');
    const r = await createIndoorDc({
      jobIds: jobs.map((j) => j.id), consignee: to, customerRef: ref, customerRefDate: refDate,
      mode, purpose, authorisedBy,
      linePurposes: shown.filter((l) => l.edited).map((l) => ({ jobId: l.jobId, accessoryId: l.accessoryId, purpose: l.purpose })),
    });
    setBusy(false);
    logAudit({ action: 'indoor.dc_create', target: r.dcNo ?? '', status: r.ok ? 'ok' : 'error',
               error: r.ok ? undefined : r.error, meta: { jobs: jobs.map((j) => j.job_no) } });
    if (!r.ok) { setErr(r.error ?? 'The DC could not be issued.'); return; }
    onIssued(r.dcNo ?? '');
    navigate(`/indoor-dc/${encodeURIComponent(r.dcNo ?? '')}`);
  };

  return (
    <div className="ind-drawer">
      {err ? <div className="ind-warn">{err}</div> : null}
      <p className="ind-note">
        {jobs.length} unit{jobs.length === 1 ? '' : 's'} going to <b>{consignee || '(no consignee recorded)'}</b>:{' '}
        {jobs.map((j) => j.job_no).join(', ')}. The DC number is issued when you create it; each unit then carries it as
        its DC No. and the DC date. The DC is <b>pending approval</b> until the person you name under AUTHORISED BY
        approves it — that is when the visit is filed against each call — and the units are dispatched after that.
      </p>
      <div className="ind-grid">
        <label className="ind-field" style={{ gridColumn: '1 / -1' }}>
          <span className="ind-label">To *</span>
          <textarea rows={4} value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ind-hint">From the Party Master where the consignee is on it. Edit as the challan should read.</span>
        </label>
        <label className="ind-field"><span className="ind-label">DATE</span>
          <input value={formatDay(dcDate)} disabled />
          <span className="ind-hint">The date of entry — set by the database.</span></label>
        <label className="ind-field"><span className="ind-label">AUTHORISED BY *</span>
          <SelectPicker value={authorisedBy} onChange={setAuthorisedBy}
            placeholder={authorisers === null ? 'Reading…' : authorisers.length ? '— who approves this DC —' : '— nobody to choose —'}
            options={(authorisers ?? []).map((a) => ({ value: a.name, label: `${a.name} — ${a.basis}` }))} />
          <span className="ind-hint">{authorisers && !authorisers.length
            ? 'Your User Master row names no Reporting or Regional Manager and there is no active NSM — ask an administrator to fill it.'
            : 'Your Reporting Manager, Regional Manager (User Master) or an NSM. They approve the DC.'}</span></label>
        <label className="ind-field"><span className="ind-label">Mode of Despatch</span>
          <input value={mode} onChange={(e) => setMode(e.target.value)} placeholder="By hand, courier …" /></label>
        <label className="ind-field"><span className="ind-label">MIRN No. / CUSTOMER REF No.</span>
          <input value={ref} onChange={(e) => setRef(e.target.value)} /></label>
        <label className="ind-field"><span className="ind-label">Its DATE</span>
          <input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} /></label>
        <label className="ind-field" style={{ gridColumn: '1 / -1' }}>
          <span className="ind-label">PURPOSE (every line)</span>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Returned after repair" /></label>
      </div>

      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="table">
          <thead><tr><th>S.No.</th><th>PART No.</th><th>DESCRIPTION</th><th>QTY.</th><th>PURPOSE</th></tr></thead>
          <tbody>
            {shown.map((l, i) => (
              <tr key={l.key}>
                <td>{i + 1}</td>
                <td className="mono">{l.partNo}</td>
                <td>{l.description}<div className="ind-hint">{l.jobNo}{l.accessoryId ? ' · accessory' : ''}</div></td>
                <td>{l.qty}</td>
                <td><input value={l.purpose} onChange={(e) => {
                  const v = e.target.value;
                  setLines((all) => all.map((x) => (x.key === l.key ? { ...x, purpose: v, edited: true } : x)));
                }} /></td>
              </tr>
            ))}
            {shown.length === 0 ? <tr><td colSpan={5} className="ind-empty">Reading the units…</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={() => void issue()} disabled={busy || jobs.length === 0}>
          {busy ? 'Creating…' : 'Create Indoor DC (pending approval)'}
        </button>
      </div>
    </div>
  );
}

/** File the drafted visit of every job on the DC that has a UCN and has not
 *  had it filed, then approve. Returns the first refusal, in its own words. */
async function approveWithVisits(dc: IndoorDc, filerEmail: string, onStep: (s: string) => void): Promise<{ ok: boolean; error?: string }> {
  const check = await approveIndoorDc(dc.dc_no, true);
  if (!check.ok) return check;
  const jobs = await indoorJobsOnDc(dc.id);
  for (const j of jobs) {
    const ucn = String(j.ucn ?? '').trim();
    if (!ucn || j.visit_filed_at) continue;
    const draft = j.visit_draft as unknown as VisitDraft | null;
    if (!draft) return { ok: false, error: `${j.job_no}: no visit was drafted with its Indoor Service Report — the Indoor engineer completes it (Report stage) before this DC can be approved.` };
    onStep(`Filing the visit for ${ucn} (${j.job_no})…`);
    const call = await callByUcn(ucn).catch(() => null);
    if (!call) return { ok: false, error: `${j.job_no}: call ${ucn} was not found, or you cannot view it — the visit cannot be filed.` };
    // THE USER'S RULE, whatever the draft says: Unsolved / Return to Field /
    // work details Yes; the report is the uploaded Indoor Service Report and
    // its number travels as Manual Report No.
    const d: VisitDraft = {
      ...draft,
      status: INDOOR_VISIT_FIXED.status, pendingReason: INDOOR_VISIT_FIXED.pendingReason,
      updateWork: INDOOR_VISIT_FIXED.updateWork, manualLink: j.report_file_url,
    };
    // A visit already filed on an earlier attempt is not filed again: the job
    // remembers it. (Spares and feedback that failed are retried; an Indoor
    // visit is Unsolved, so it carries no feedback -- fileVisit asks for it
    // on a SOLVED call only.)
    const r = await fileVisit(call, d, {
      filerEmail, extraData: { 'Manual Report No.': j.indoor_report_no },
      progress: j.visit_uid ? { uid: j.visit_uid } : {},
    });
    if (!r.ok) {
      if (r.progress.uid && r.progress.uid !== j.visit_uid) await recordIndoorVisit(j.id, r.progress.uid, false);
      return { ok: false, error: `${j.job_no} (${ucn}): ${r.error}` };
    }
    const rec = await recordIndoorVisit(j.id, r.uid, true);
    if (!rec.ok) return { ok: false, error: `${j.job_no}: the visit ${r.uid} was filed but could not be recorded on the job: ${rec.error}` };
  }
  onStep('Approving…');
  return approveIndoorDc(dc.dc_no);
}

export function IndoorDcList({ onChanged }: { onChanged?: () => void } = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dcs, setDcs] = useState<IndoorDc[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [tick, setTick] = useState(0);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    let live = true;
    listIndoorDcs()
      .then((d) => { if (live) setDcs(d); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [tick]);
  if (err) return <div className="ind-msg">Could not load the Indoor DCs: {err}</div>;
  if (!dcs) return <p className="ind-note">Loading the Indoor DCs…</p>;

  const mine = (d: IndoorDc) => d.approval_status === 'Pending approval' && d.i_may_approve;
  // AWAITING THE READER'S APPROVAL FIRST, then everything else as listed.
  const ordered = [...dcs.filter(mine), ...dcs.filter((d) => !mine(d))];
  const refresh = () => { setTick((t) => t + 1); onChanged?.(); };

  const approve = async (d: IndoorDc) => {
    setBusy(d.dc_no); setMsg('');
    const r = await approveWithVisits(d, user?.email ?? '', (s) => setMsg(s)).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    setBusy('');
    logAudit({ action: 'indoor.dc_approve', target: d.dc_no, status: r.ok ? 'ok' : 'error', error: r.ok ? undefined : r.error });
    setMsg(r.ok ? `Indoor DC ${d.dc_no} approved — the visits are filed against the calls.` : `Not approved: ${r.error}`);
    refresh();
  };
  const reject = async (dcNo: string) => {
    if (!reason.trim()) { setMsg('Say why the DC is rejected.'); return; }
    setBusy(dcNo);
    const r = await rejectIndoorDc(dcNo, reason.trim());
    setBusy('');
    logAudit({ action: 'indoor.dc_reject', target: dcNo, status: r.ok ? 'ok' : 'error', error: r.ok ? undefined : r.error });
    setMsg(r.ok ? `Indoor DC ${dcNo} rejected — its units are released for a new DC.` : `Not rejected: ${r.error}`);
    if (r.ok) { setRejecting(null); setReason(''); }
    refresh();
  };

  const awaiting = dcs.filter(mine).length;
  return (
    <div className="table-wrap">
      {msg ? <div className="ind-msg">{msg}</div> : null}
      {awaiting ? <p className="ind-warn"><b>{awaiting}</b> Indoor DC{awaiting === 1 ? ' is' : 's are'} waiting for your approval — listed first.</p> : null}
      <table className="table">
        <thead><tr><th>DC No.</th><th>Date</th><th>To</th><th>Units</th><th>Lines</th><th>Issued by</th><th>Authorised by</th><th>Approval</th><th /></tr></thead>
        <tbody>
          {ordered.map((d) => (
            <tr key={d.id}>
              <td className="mono">{d.dc_no}</td>
              <td>{formatDay(d.dc_date)}</td>
              <td>{d.consignee.split('\n')[0]}</td>
              <td className="mono">{d.job_nos ?? ''}</td>
              <td>{d.line_count}</td>
              <td>{d.issued_by_name}</td>
              <td>{d.authorised_by_name}</td>
              <td>
                <span className={`ind-chip ${d.approval_status === 'Approved' ? 'ind-ready' : d.approval_status === 'Rejected' ? 'ind-condemned' : d.approval_status === 'Pending approval' ? 'ind-waiting' : 'ind-closed'}`}>
                  {d.approval_status}</span>
                {d.approval_status === 'Approved' && d.approved_at
                  ? <div className="ind-hint">{d.approved_by_name} · {formatDay(d.approved_at)}</div> : null}
                {d.approval_status === 'Rejected' ? <div className="ind-hint">{d.rejection_reason}</div> : null}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {mine(d) ? (rejecting === d.dc_no ? (
                  <>
                    <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it is rejected" />{' '}
                    <button className="btn btn-sm" disabled={!!busy} onClick={() => void reject(d.dc_no)}>Reject</button>{' '}
                    <button className="btn btn-sm btn-ghost" onClick={() => { setRejecting(null); setReason(''); }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => void approve(d)}
                      title="Files the drafted visit against each call, then approves">
                      {busy === d.dc_no ? 'Approving…' : 'Approve'}</button>{' '}
                    <button className="btn btn-sm" disabled={!!busy} onClick={() => setRejecting(d.dc_no)}>Reject…</button>{' '}
                  </>
                )) : null}
                <button className="btn btn-sm" onClick={() => navigate(`/indoor-dc/${encodeURIComponent(d.dc_no)}`)}>🖨 Print</button>
              </td>
            </tr>
          ))}
          {dcs.length === 0 ? <tr><td colSpan={9} className="ind-empty">No Indoor DC has been issued yet.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

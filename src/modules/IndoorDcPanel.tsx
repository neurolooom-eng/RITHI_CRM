// ===========================================================================
// INDOOR_DC ON THE INDOOR SERVICE SCREEN (0321, 2026-10-02).
//
//   IndoorDcForm   -- "Create Indoor DC": for the Ready units ticked in the
//                     Workshop view (a drawer), or for the open job (the
//                     right-hand pane of the job window, 2026-10-03): To
//                     (prefilled from the Party Master, editable), DATE, MIRN No. / Customer Ref No. and its date, Mode of
//                     Despatch, PURPOSE typed once and editable per line.
//   IndoorDcList   -- every Indoor DC, each re-printable; the ones awaiting
//                     the reader's approval first, with Approve / Reject.
//
// THE APPROVAL (0323, the user: "Only the INDOOR DC needs an approval"). A DC
// is created PENDING APPROVAL naming its AUTHORISED BY -- from the ISSUER'S
// User Master row (0327, the user: "it is dynamic based on the user master"):
// their Reporting Manager, their Regional Manager, and as NSM the Regional
// Manager's own Reporting Manager; never the issuer. That person (or an
// administrator) approves or rejects it, whatever their role holds: they see
// the DCs naming them here, or on /indoor-dc-approvals from My Workload when
// their role cannot open Indoor Service. APPROVING FILES THE VISITS in the
// database (approve_indoor_dc): for every unit with a UCN, the visit drafted
// with its Indoor Service Report and its spares, in one transaction with the
// approval, so a refusal leaves the DC pending with nothing filed.
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
  listIndoorDcAuthorisers, approveIndoorDc, rejectIndoorDc,
  type IndoorDc, type IndoorJob,
} from '../lib/supabase';
import { equipmentDescription, jobConsignee } from '../lib/indoorforms';
import { formatDay } from '../lib/dates';
import { todayISO } from '../lib/format';
import { logAudit } from '../lib/audit';
import { SelectPicker } from '../components/ui/SelectPicker';
import { PageHeader } from '../components/ui/ui';
import { useAuth } from '../lib/auth';

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

/** A read-only value in the form's language: plain text, not a disabled box. */
function Value({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="ind-field">
      <span className="ind-label">{label}</span>
      <span className="ind-value">{children}</span>
      {hint ? <span className="ind-hint">{hint}</span> : null}
    </div>
  );
}

/** The approval as a chip -- Pending approval / Approved / Rejected (and the
 *  pre-0323 "Issued before approval"), one hue each, the same in both themes. */
export function ApprovalChip({ status }: { status: string }) {
  const tone = status === 'Approved' ? 'is-approved' : status === 'Rejected' ? 'is-rejected'
    : status === 'Pending approval' ? 'is-pending' : 'is-legacy';
  return <span className={`ind-appr ${tone}`}>{status}</span>;
}

export function IndoorDcForm({ jobs, onClose, onIssued, inPane }: {
  jobs: IndoorJob[];
  onClose: () => void;
  onIssued: (dcNo: string) => void;
  /** Rendered as the right-hand pane of the job window (its title is there). */
  inPane?: boolean;
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
    <div className={`ind-form ind-dcform${inPane ? ' is-pane' : ''}`}>
      <p className="ind-dc-lead">
        {jobs.length} unit{jobs.length === 1 ? '' : 's'} going to <b>{consignee || '(no consignee recorded)'}</b>.{' '}
        <span className="ind-muted">The number is issued when you create the DC; it stays <b>pending approval</b> until
          the person under Authorised By approves it — that files the visit against each call — and the units leave after that.</span>
      </p>
      {jobs.length > 1 ? (
        <div className="ind-dc-units">{jobs.map((j) => <span key={j.id} className="ind-dc-unit mono">{j.job_no}</span>)}</div>
      ) : null}
      {err ? <div className="ind-warn" role="alert">{err}</div> : null}

      <section className="ind-group" style={{ marginTop: 14 }}>
        <div className="ind-group-head"><h4 className="ind-eyebrow">Consignee</h4></div>
        <div className="ind-grid">
          <label className="ind-field is-wide">
            <span className="ind-label">To *</span>
            <textarea rows={4} value={to} onChange={(e) => setTo(e.target.value)} />
            <span className="ind-hint">From the Party Master where the consignee is on it. Edit it as the challan should read.</span>
          </label>
          {/* MIRN No. / Customer Ref No. and its date were removed from this form
              (the user, 2026-10-04). They are sent empty; the printed DC keeps
              its two lines, blank, as the controlled form lays them out. */}
        </div>
      </section>

      <section className="ind-group">
        <div className="ind-group-head"><h4 className="ind-eyebrow">Despatch</h4></div>
        <div className="ind-grid">
          <Value label="DC date" hint="The date of entry — set by the database.">{formatDay(dcDate)}</Value>
          {/* Mode of despatch removed from this form (the user, 2026-10-04). */}
          <label className="ind-field is-wide">
            <span className="ind-label">Purpose (every line)</span>
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Returned after repair" />
            <span className="ind-hint">Change it for one line in the table below.</span></label>
        </div>
      </section>

      <section className="ind-group">
        <div className="ind-group-head"><h4 className="ind-eyebrow">Approval</h4></div>
        <div className="ind-grid">
          <label className="ind-field is-wide"><span className="ind-label">Authorised by *</span>
            <SelectPicker value={authorisedBy} onChange={setAuthorisedBy}
              placeholder={authorisers === null ? 'Reading…' : authorisers.length ? '— who approves this DC —' : '— nobody to choose —'}
              options={(authorisers ?? []).map((a) => ({ value: a.name, label: `${a.name} — ${a.basis}` }))} />
            <span className="ind-hint">{authorisers && !authorisers.length
              ? 'Your User Master row names no Reporting or Regional Manager and there is no active NSM — ask an administrator to fill it.'
              : 'Your Reporting Manager, Regional Manager (User Master) or an NSM. They approve the DC.'}</span></label>
        </div>
      </section>

      <section className="ind-group">
        <div className="ind-group-head">
          <h4 className="ind-eyebrow">Lines</h4>
          <div className="ind-group-aside"><span className="ind-meta">{shown.length} line{shown.length === 1 ? '' : 's'}</span></div>
        </div>
        <div className="ind-lines-wrap">
          <table className="ind-lines is-edit">
            <thead><tr><th className="num">S.No.</th><th>Part No.</th><th>Description</th><th className="num">Qty</th><th>Purpose</th></tr></thead>
            <tbody>
              {shown.map((l, i) => (
                <tr key={l.key}>
                  <td className="num">{i + 1}</td>
                  <td className="mono">{l.partNo || <span className="ind-muted">—</span>}</td>
                  <td className="ind-dc-desc">{l.description}<small>{l.jobNo}{l.accessoryId ? ' · accessory' : ''}</small></td>
                  <td className="num">{l.qty}</td>
                  <td><input aria-label={`Purpose of line ${i + 1}`} value={l.purpose} onChange={(e) => {
                    const v = e.target.value;
                    setLines((all) => all.map((x) => (x.key === l.key ? { ...x, purpose: v, edited: true } : x)));
                  }} /></td>
                </tr>
              ))}
              {shown.length === 0 ? <tr><td colSpan={5} className="ind-rows-empty">Reading the units…</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="ind-formactions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => void issue()} disabled={busy || jobs.length === 0}>
          {busy ? 'Creating…' : 'Create Indoor DC'}
        </button>
      </div>
    </div>
  );
}

/** APPROVING FILES THE VISITS IN THE DATABASE (0327). approve_indoor_dc()
 *  files, for every unit on the DC with a UCN, the visit drafted with its
 *  Indoor Service Report and its spares, stamps the unit and approves -- in one
 *  transaction, as the approver -- so a refusal anywhere leaves the DC pending
 *  with nothing filed, and the approver's ROLE needs no call-report key: the
 *  User Master naming them is what lets them approve. */
async function approveDc(dc: IndoorDc, onStep: (s: string) => void): Promise<{ ok: boolean; error?: string }> {
  onStep(`Approving ${dc.dc_no} and filing its visits…`);
  return approveIndoorDc(dc.dc_no);
}

// `namingMe`: the approvals page, where row-level security shows only the DCs
// naming the reader -- so an empty list there means none names THEM, not that
// none was issued, and the count is theirs, not the company's (D-146).
export function IndoorDcList({ onChanged, namingMe = false }: { onChanged?: () => void; namingMe?: boolean } = {}) {
  const navigate = useNavigate();
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
  if (!dcs) return <p className="ind-meta">Loading the Indoor DCs…</p>;

  const mine = (d: IndoorDc) => d.approval_status === 'Pending approval' && d.i_may_approve;
  // AWAITING THE READER'S APPROVAL FIRST, then everything else as listed.
  const ordered = [...dcs.filter(mine), ...dcs.filter((d) => !mine(d))];
  const refresh = () => { setTick((t) => t + 1); onChanged?.(); };

  const approve = async (d: IndoorDc) => {
    setBusy(d.dc_no); setMsg('');
    const r = await approveDc(d, (s) => setMsg(s)).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
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
    <div className="ind-form ind-dclist">
      {msg ? <div className="ind-warn" role="status">{msg}</div> : null}
      <p className="ind-meta ind-dclist-count">
        {dcs.length} Indoor DC{dcs.length === 1 ? '' : 's'}{namingMe ? ' naming you' : ''}
        {awaiting ? <> · <b>{awaiting} waiting for your approval</b>, listed first</> : null}
      </p>
      {ordered.map((d) => (
        <div key={d.id} className={`ind-dcrow${mine(d) ? ' is-mine' : ''}`}>
          <div>
            <div className="ind-dcrow-no">{d.dc_no}</div>
            <div className="ind-dcrow-sub">{formatDay(d.dc_date)} · {d.line_count} line{d.line_count === 1 ? '' : 's'}
              {d.job_nos ? <><br /><span className="mono">{d.job_nos}</span></> : null}</div>
          </div>
          <div>
            <div className="ind-dcrow-to">{d.consignee.split('\n')[0]}</div>
            <div className="ind-dcrow-sub">Issued by {d.issued_by_name || '—'} · authorised by {d.authorised_by_name || '—'}</div>
          </div>
          <div className="ind-dcrow-state">
            <ApprovalChip status={d.approval_status} />
            {d.approval_status === 'Approved' && d.approved_at
              ? <span className="ind-dcrow-sub">{d.approved_by_name} · {formatDay(d.approved_at)}</span> : null}
            {d.approval_status === 'Rejected' && d.rejection_reason
              ? <span className="ind-dcrow-sub">{d.rejection_reason}</span> : null}
          </div>
          <div className="ind-dcrow-acts">
            {mine(d) && rejecting !== d.dc_no ? (<>
              <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => void approve(d)}
                title="Files the drafted visit against each call, then approves">
                {busy === d.dc_no ? 'Approving…' : 'Approve'}</button>
              <button className="btn btn-sm" disabled={!!busy} onClick={() => setRejecting(d.dc_no)}>Reject…</button>
            </>) : null}
            <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/indoor-dc/${encodeURIComponent(d.dc_no)}`)}>🖨 Print</button>
          </div>
          {mine(d) && rejecting === d.dc_no ? (
            <div className="ind-dcrow-reject">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it is rejected" aria-label={`Why ${d.dc_no} is rejected`} />
              <button className="btn btn-sm btn-danger" disabled={!!busy || !reason.trim()} onClick={() => void reject(d.dc_no)}>Reject</button>
              <button className="btn btn-sm btn-ghost" onClick={() => { setRejecting(null); setReason(''); }}>Cancel</button>
            </div>
          ) : null}
        </div>
      ))}
      {dcs.length === 0
        ? <p className="ind-rows-empty">{namingMe ? 'No Indoor DC names you as Authorised By.' : 'No Indoor DC has been issued yet.'}</p>
        : null}
    </div>
  );
}

/** THE INDOOR DCs AWAITING THE READER (0327): the page My Workload opens for
 *  a person the User Master names as AUTHORISED BY whose role cannot open
 *  Indoor Service. Not a module and not keyed: row-level security shows them
 *  the DCs naming them and nothing else, and approving is approve_indoor_dc's
 *  own test. */
export function IndoorDcApprovals() {
  // indoor_dcs_read shows a holder of mod:/indoor EVERY DC; anybody else only
  // the ones naming them -- and only then is "naming you" true (D-146).
  const { can } = useAuth();
  return (
    <div>
      <PageHeader title="Indoor DCs to approve" icon="🏭"
        subtitle="The Indoor DCs that name you as AUTHORISED BY. Approving files each unit's visit against its call." />
      <IndoorDcList namingMe={!can('mod:/indoor')} />
    </div>
  );
}


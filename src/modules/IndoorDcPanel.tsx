// ===========================================================================
// INDOOR_DC ON THE INDOOR SERVICE SCREEN (0321, 2026-10-02).
//
//   IndoorDcDrawer -- "Create Indoor DC" for the Ready units ticked on the
//                     register: To (prefilled from the Party Master, editable),
//                     DATE, MIRN No. / Customer Ref No. and its date, Mode of
//                     Despatch, PURPOSE typed once and editable per line.
//   IndoorDcList   -- every Indoor DC, each re-printable.
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
  type IndoorDc, type IndoorJob,
} from '../lib/supabase';
import { equipmentDescription, jobConsignee } from '../lib/indoorforms';
import { formatDay } from '../lib/dates';
import { todayISO } from '../lib/format';
import { logAudit } from '../lib/audit';

interface PreviewLine {
  key: string; jobId: number; accessoryId: number | null; jobNo: string;
  partNo: string; description: string; purpose: string; edited: boolean;
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
  const [dcDate, setDcDate] = useState(todayISO());
  const [ref, setRef] = useState('');
  const [refDate, setRefDate] = useState('');
  const [mode, setMode] = useState('');
  const [purpose, setPurpose] = useState('');
  const [lines, setLines] = useState<PreviewLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const consignee = jobs.length ? jobConsignee(jobs[0]!) : '';

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
                   description: equipmentDescription(j.product_name, j.serial), purpose: '', edited: false });
        acc.filter((a) => a.name.trim() || a.serial.trim()).sort((a, b) => a.id - b.id).forEach((a) => out.push({
          key: `${j.id}:${a.id}`, jobId: j.id, accessoryId: a.id, jobNo: j.job_no, partNo: '',
          description: equipmentDescription(a.name, a.serial), purpose: '', edited: false,
        }));
      }
      if (live) setLines(out);
    })();
    return () => { live = false; };
  }, [jobs]);

  const shown = useMemo(() => lines.map((l) => (l.edited ? l : { ...l, purpose })), [lines, purpose]);

  const issue = async () => {
    if (!to.trim()) { setErr('Fill in To — whom the DC goes to.'); return; }
    setBusy(true); setErr('');
    const r = await createIndoorDc({
      jobIds: jobs.map((j) => j.id), consignee: to, dcDate, customerRef: ref, customerRefDate: refDate,
      mode, purpose,
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
        its DC No. and the DC date. The units stay Ready — mark them Dispatched as they leave.
      </p>
      <div className="ind-grid">
        <label className="ind-field" style={{ gridColumn: '1 / -1' }}>
          <span className="ind-label">To *</span>
          <textarea rows={4} value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ind-hint">From the Party Master where the consignee is on it. Edit as the challan should read.</span>
        </label>
        <label className="ind-field"><span className="ind-label">DATE</span>
          <input type="date" value={dcDate} onChange={(e) => setDcDate(e.target.value)} /></label>
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
                <td>1</td>
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
          {busy ? 'Creating…' : 'Create Indoor DC and print'}
        </button>
      </div>
    </div>
  );
}

export function IndoorDcList() {
  const navigate = useNavigate();
  const [dcs, setDcs] = useState<IndoorDc[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    listIndoorDcs()
      .then((d) => { if (live) setDcs(d); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, []);
  if (err) return <div className="ind-msg">Could not load the Indoor DCs: {err}</div>;
  if (!dcs) return <p className="ind-note">Loading the Indoor DCs…</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>DC No.</th><th>Date</th><th>To</th><th>Units</th><th>Lines</th><th>Mode of Despatch</th><th>Issued by</th><th /></tr></thead>
        <tbody>
          {dcs.map((d) => (
            <tr key={d.id}>
              <td className="mono">{d.dc_no}</td>
              <td>{formatDay(d.dc_date)}</td>
              <td>{d.consignee.split('\n')[0]}</td>
              <td className="mono">{d.job_nos ?? ''}</td>
              <td>{d.line_count}</td>
              <td>{d.mode_of_despatch}</td>
              <td>{d.issued_by_name}</td>
              <td><button className="btn btn-sm" onClick={() => navigate(`/indoor-dc/${encodeURIComponent(d.dc_no)}`)}>🖨 Print</button></td>
            </tr>
          ))}
          {dcs.length === 0 ? <tr><td colSpan={8} className="ind-empty">No Indoor DC has been issued yet.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
// R/SER/QC/007 PRE DELIVERY TESTING, PRINTABLE (2026-10-02).
//
// The user: "I will need these docs generated as well when completed or when
// printed. Printing can be HTML generated." The Field Failure Report's pattern
// (FieldFailureReportPrint.tsx): a route of its own, no menu, the company's
// mark, one Print button that is not on the paper.
//
// A TEST NOT YET COMPLETE STILL PRINTS -- a blank form is what somebody takes
// to the bench -- but the sheet SAYS it is incomplete, in a band that prints,
// so a partial test is never filed as a finished one.
//
// THE SIGNATURE: the stored one is reproduced only where the Inspected by
// block names the person producing the document (URS-057, signatureBelongsTo),
// exactly as the FFR does. Anybody else gets the empty line, to sign by hand.
// ===========================================================================
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getIndoorPdt, indoorJobById, supabaseConfigured, type IndoorJob, type IndoorPdt } from '../lib/supabase';
import { PDT_CHECKS, PDT_FIO2, PDT_HEADER, PDT_MODES, INDOOR_ORG, INDOOR_NOTICE, pdtGaps } from '../lib/indoorforms';
import { formatDay, formatDayTime } from '../lib/dates';
import { useMySignature, signatureBelongsTo } from '../lib/signature';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
// A PRINTED DOCUMENT CARRIES THE COMPANY'S MARK, never the application's.
import { COMPANY_LOGO } from '../lib/brand';
import './indoorprint.css';

const num = (v: number | null | undefined) => (v == null ? '' : String(v));

export function IndoorPdtPrint() {
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mySig = useMySignature();
  const [job, setJob] = useState<IndoorJob | null>(null);
  const [pdt, setPdt] = useState<IndoorPdt | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to print this form.'); return; }
    const id = Number(jobId);
    let live = true;
    Promise.all([indoorJobById(id), getIndoorPdt(id)])
      .then(([j, p]) => {
        if (!live) return;
        if (!j) setErr('That workshop job was not found, or you cannot view it.');
        else { setJob(j); setPdt(p); }
      })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [jobId]);

  if (err) {
    return (
      <div className="ip-page">
        <div className="ip-toolbar"><button className="btn btn-sm" onClick={() => navigate('/indoor')}>← Back</button></div>
        <div className="ip-missing"><p>{err}</p></div>
      </div>
    );
  }
  if (!job) return <div className="ip-page"><div className="ip-missing"><p>Loading…</p></div></div>;

  const gaps = pdtGaps(pdt);
  const complete = gaps.blank.length === 0 && gaps.notOk.length === 0;
  const inspector = pdt?.inspector_name ?? '';
  const signature = signatureBelongsTo(inspector, user) ? (mySig?.signature ?? '') : '';

  return (
    <div className="ip-page">
      <style>{'@media print { @page { size: A4 portrait; margin: 12.7mm 15mm 20mm; } }'}</style>
      <div className="ip-toolbar">
        <button className="btn btn-sm" onClick={() => navigate('/indoor')}>← Back to the register</button>
        <button className="btn btn-sm btn-primary"
          onClick={() => { logAudit({ action: 'indoor.pdt_print', target: job.job_no, status: 'ok', meta: { complete } }); window.print(); }}>
          🖨 Print
        </button>
        <span className="muted">
          {job.job_no} · R/SER/QC/007 · {complete ? 'complete' : 'NOT complete — the sheet says so when printed'}
        </span>
      </div>

      <PdtSheet productName={job.product_name} serial={job.serial} pdt={pdt} refText={`Job ${job.job_no}`} signature={signature} />
    </div>
  );
}

/** THE R/SER/QC/007 SHEET ITSELF -- one copy, printed for an Indoor job's
 *  test and for a Pre-Delivery Quality Check (0377) alike, so the two cannot
 *  drift. `pdt` carries the form's columns; `refText` names the record. */
export function PdtSheet({ productName, serial, pdt, refText, signature }: {
  productName: string; serial: string; refText: string; signature: string;
  pdt: Omit<IndoorPdt, 'id' | 'job_id'> | null;
}) {
  const gaps = pdtGaps(pdt as IndoorPdt | null);
  const complete = gaps.blank.length === 0 && gaps.notOk.length === 0;
  const inspector = pdt?.inspector_name ?? '';
  const box = (on: boolean) => <span className="ip-box">{on ? '✓' : ''}</span>;
  return (
      <section className="ip-sheet ip-portrait">
        <table className="ip-head">
          <tbody>
            <tr>
              <td className="ip-logo" rowSpan={2}><img src={COMPANY_LOGO} alt="Air Liquide Medical Systems" /></td>
              <td className="ip-mid">{INDOOR_ORG}<br />{PDT_HEADER.dept}</td>
              {/* A printed web page cannot count its own sheets; this form is one page. */}
              <td className="ip-pg" rowSpan={2}>PAGE NO: 1</td>
            </tr>
            <tr><td className="ip-mid">{PDT_HEADER.title}</td></tr>
          </tbody>
        </table>

        <table className="ip-grid">
          <tbody>
            <tr>
              <td><span className="ip-label">Product Name: </span>{productName}</td>
              <td><span className="ip-label">SL. No: </span>{serial}</td>
              <td><span className="ip-label">Date: </span>{pdt?.test_date ? formatDay(pdt.test_date) : ''}</td>
            </tr>
            <tr>
              <td colSpan={2}><span className="ip-label">Measuring Equipment ID No: </span>{pdt?.measuring_equipment_id ?? ''}</td>
              <td><span className="ip-label">Software Version: </span>{pdt?.software_version ?? ''}</td>
            </tr>
            <tr>
              <td colSpan={2}><span className="ip-label">HV: </span>{pdt?.hv ?? ''}</td>
              <td><span className="ip-label">HT: </span>{pdt?.ht ?? ''}</td>
            </tr>
          </tbody>
        </table>

        <table className="ip-grid">
          <colgroup><col style={{ width: '8%' }} /><col style={{ width: '68%' }} /><col style={{ width: '12%' }} /><col style={{ width: '12%' }} /></colgroup>
          <thead><tr><th className="ip-c">S.No</th><th>Description</th><th className="ip-c">OK</th><th className="ip-c">NOT OK</th></tr></thead>
          <tbody>
            {PDT_CHECKS.map((c) => (
              <tr key={c.no}>
                <td className="ip-c">{c.no}.</td>
                <td>{c.text}</td>
                {c.key
                  ? <><td className="ip-c">{box(pdt?.[c.key] === 'OK')}</td><td className="ip-c">{box(pdt?.[c.key] === 'NOT OK')}</td></>
                  : <td colSpan={2} />}
              </tr>
            ))}
          </tbody>
        </table>

        {PDT_MODES.map((m) => (
          <table className="ip-grid" key={m.no}>
            <colgroup><col style={{ width: '28%' }} /><col style={{ width: '24%' }} /><col style={{ width: '24%' }} /><col style={{ width: '24%' }} /></colgroup>
            <thead>
              <tr><th colSpan={4}>{m.no}. {m.settings}</th></tr>
              <tr><th />{PDT_FIO2.map((f) => <th key={f} className="ip-c">At FiO2 {f}%</th>)}</tr>
            </thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.label}>
                  <td className="ip-label">{r.label}</td>
                  {r.keys.map((k) => <td key={k} className="ip-c">{num(pdt?.[k])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ))}

        <table className="ip-grid">
          <tbody>
            <tr><td colSpan={3} className="ip-label">Inspected by:</td></tr>
            <tr>
              <td><span className="ip-label">Name: </span>{inspector}</td>
              <td><span className="ip-label">Designation: </span>{pdt?.inspector_designation ?? ''}</td>
              <td className="ip-sign-cell">
                <span className="ip-label">Sign: </span>
                {signature ? <img className="ip-sign-ink" src={signature} alt="" /> : null}
              </td>
            </tr>
          </tbody>
        </table>
        {pdt?.inspected_at
          ? <p className="ip-note">Signed in RITHI on {formatDayTime(pdt.inspected_at)} · {refText}</p>
          : null}
        {!complete ? (
          <div className="ip-draft">
            NOT COMPLETE{gaps.notOk.length ? ` — check ${gaps.notOk.join(', ')} NOT OK` : ''}
            {gaps.blank.length ? ` — blank: ${gaps.blank.join(', ')}` : ''}
          </div>
        ) : null}

        <div className="ip-foot">
          <div className="ip-foot-notice">{INDOOR_NOTICE}</div>
          <div className="ip-foot-tmpl">{PDT_HEADER.tmpl}</div>
        </div>
      </section>
  );
}

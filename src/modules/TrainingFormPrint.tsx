// ===========================================================================
// TRAINING FORM R/HR/11, PRINTED (0453; the user, 2026-10-23, with the
// template "102_2026 Service"; asked: "TRAINING FORM, Rev NOV 2021" on every
// page, the "*Note 1 & 2" markers kept with no note text, and the Request No.
// as typed -- it is raised elsewhere).
//
// The template's three parts in its own order and words: PLAN (request no.,
// date, trainee, designation, manager, topic, trainer, the risk with the
// methodology each risk means, approved by, if no reason), RECORD (training
// from / to, trainer signature, the employees with content, status and
// signature) and EVALUATION (required or not, justification, method, the plan
// with evaluator, dates and rating, re-assessment, remarks with the Rating
// Scale, signature of evaluator). Signatures are left for ink.
//
// THE SAME GATE AS ITS TWO SCREENS (App.tsx): Training, or New Employee
// Requests; the row is read under row-level security, so one the reader may
// not see is simply not found.
// ===========================================================================
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabaseConfigured } from '../lib/supabase';
import { getTrainingRequest, type TrainingRequest } from '../lib/training';
import { TRAINING_FORM, TRAINING_METHODOLOGY, TRAINING_RATINGS, TRAINING_RISKS, tick } from '../lib/trainingForm';
import { formatDay } from '../lib/dates';
import { logAudit } from '../lib/audit';
import { COMPANY_LOGO } from '../lib/brand';
import './indoorprint.css';

const pad = <T,>(rows: T[], n: number, blank: T): T[] => [...rows, ...Array.from({ length: Math.max(0, n - rows.length) }, () => blank)];

export function TrainingFormPrint() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [t, setT] = useState<TrainingRequest | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to print this form.'); return; }
    let live = true;
    void getTrainingRequest(Number(id))
      .then((r) => { if (!live) return; if (!r) setErr('This training request was not found, or you cannot view it.'); else setT(r); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [id]);

  const back = () => navigate(-1);
  if (err) return <div className="ip-page"><div className="ip-toolbar"><button className="btn btn-sm" onClick={back}>← Back</button></div><div className="ip-missing"><p>{err}</p></div></div>;
  if (!t) return <div className="ip-page"><div className="ip-missing"><p>Loading…</p></div></div>;

  return (
    <div className="ip-page">
      <div className="ip-toolbar">
        <button className="btn btn-sm" onClick={back}>← Back</button>
        <button className="btn btn-sm btn-primary"
          onClick={() => { logAudit({ action: 'training.form_print', target: t.req_no || `#${t.id}`, status: 'ok', meta: { trainee: t.trainee_name } }); window.print(); }}>
          🖨 Print / Save as PDF
        </button>
        <span className="muted">Training Form R/HR/11 · {t.trainee_name}{t.req_no ? ` · ${t.req_no}` : ' · no Request No. yet'} · A4</span>
      </div>

      <TrainingFormSheet t={t} />
    </div>
  );
}

/** THE SHEET ITSELF, pure: the print page and a sample render draw the same one. */
export function TrainingFormSheet({ t }: { t: TrainingRequest }) {
  const approved = t.approval === 'Approved' ? `${t.approved_by_name}${t.approved_at ? ` — ${formatDay(t.approved_at)}` : ''}`
    : t.approval === 'Not approved' ? `Not approved — ${t.approved_by_name}${t.approved_at ? `, ${formatDay(t.approved_at)}` : ''}` : '';
  const lines = pad(t.record_lines ?? [], 4, { name: '', content: '', status: '' });
  const evals = pad(t.evaluation_plan ?? [], 2, { plan: '', evaluator: '', planned_date: '', actual: '', rating: '' });

  return (
      <section className="ip-sheet ip-portrait trf-sheet">
      {/* THE FORM'S OWN STYLE, WITH THE SHEET, so wherever the sheet is drawn it
          looks the same. A NAMED PAGE, so another form's "@page { size: ... }"
          in the same bundle cannot win. */}
      <style>{`@page training-form { size: A4 portrait; margin: 10mm 12mm 14mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt Cambria, Georgia, serif; } }
@media print { .trf-sheet { page: training-form; } .trf-frame > thead { display: table-header-group; } .trf-keep { page-break-inside: avoid; } }
.trf-sheet { font-family: Cambria, Georgia, 'Times New Roman', serif; font-size: 10pt; }
.trf-sheet .ip-grid td, .trf-sheet .ip-grid th { padding: 2px 5px; }
.trf-frame { width: 100%; border-collapse: collapse; }
.trf-frame > thead > tr > td, .trf-frame > tfoot > tr > td, .trf-frame > tbody > tr > td { padding: 0; border: none; }
.trf-sec { font-weight: 700; text-decoration: underline; font-size: 11.5pt; margin: 7px 0 3px; }
.trf-tick { font-size: 11pt; margin-right: 2px; }
.trf-ink td { height: 6.5mm; }
.trf-scale { font-size: 8pt; line-height: 1.3; }`}</style>
      <table className="trf-frame">
        {/* THE HEADER ON EVERY PAGE: a table's head repeats in print. */}
        <thead><tr><td>
          <table className="ip-head">
            <tbody>
              <tr>
                <td className="ip-logo" rowSpan={2}><img src={COMPANY_LOGO} alt="Air Liquide Medical Systems" /></td>
                <td className="ip-mid">{TRAINING_FORM.org}<br />{TRAINING_FORM.dept}</td>
                <td className="ip-pg" rowSpan={2}>PAGE NO:</td>
              </tr>
              <tr><td className="ip-mid">{TRAINING_FORM.title}</td></tr>
            </tbody>
          </table>
        </td></tr></thead>
        <tbody><tr><td>

          <div className="trf-sec">PLAN</div>
          <table className="ip-grid trf-keep">
            <colgroup><col style={{ width: '34%' }} /><col style={{ width: '33%' }} /><col style={{ width: '33%' }} /></colgroup>
            <tbody>
              <tr>
                <td colSpan={2}><span className="ip-label">Training Request. No : </span>{t.req_no}</td>
                <td><span className="ip-label">Date : </span>{formatDay(t.req_date)}</td>
              </tr>
              <tr>
                <td><span className="ip-label">Trainee Name : </span>{t.trainee_name}</td>
                <td><span className="ip-label">Designation : </span>{t.designation}</td>
                <td><span className="ip-label">Manager Name: </span>{t.manager_name}</td>
              </tr>
              <tr><td colSpan={3}><span className="ip-label">Training Topic: </span>{t.topic}</td></tr>
              <tr>
                <td><span className="ip-label">Trainer name: </span>{t.trainer_name}</td>
                <td colSpan={2}><span className="ip-label">Trainer Designation : </span>{t.trainer_designation}</td>
              </tr>
            </tbody>
          </table>
          <table className="ip-grid trf-keep">
            <colgroup><col style={{ width: '34%' }} /><col style={{ width: '28%' }} /><col style={{ width: '38%' }} /></colgroup>
            <tbody>
              <tr>
                <td colSpan={3}><span className="ip-label">Training Impact on product /Process ( Risk)  *Note 1 &amp;2: </span>
                  {TRAINING_RISKS.map((r) => <span key={r} style={{ marginRight: 10 }}><span className="trf-tick">{tick(t.risk === r)}</span>{r.toUpperCase()}</span>)}
                </td>
              </tr>
              {TRAINING_RISKS.map((r, i) => (
                <tr key={r}>
                  {i === 0 && <td rowSpan={3}><span className="ip-label">Training Methodology:</span><br />(* Note 2)</td>}
                  <td><span className="trf-tick">{tick(t.risk === r)}</span>{r.toUpperCase()} RISK</td>
                  <td>{TRAINING_METHODOLOGY[r]}</td>
                </tr>
              ))}
              <tr><td><span className="ip-label">Training Approved by:</span></td><td colSpan={2}>{approved}</td></tr>
              <tr><td><span className="ip-label">If No Reason:</span></td><td colSpan={2}>{t.approval === 'Not approved' ? t.not_approved_reason : ''}</td></tr>
            </tbody>
          </table>

          <div className="trf-sec">RECORD</div>
          <table className="ip-grid trf-keep">
            <colgroup><col style={{ width: '62%' }} /><col style={{ width: '38%' }} /></colgroup>
            <tbody>
              <tr>
                <td><span className="ip-label">Training From (Date) : </span>{formatDay(t.from_date)}
                  <span style={{ marginLeft: 28 }} className="ip-label">To (Date) : </span>{formatDay(t.to_date)}</td>
                {/* THE TRAINER'S OWN SIGNATURE, placed when they signed (0454); otherwise left for ink. */}
                <td><span className="ip-label">Trainer Signature:</span>
                  {t.trainer_signed?.signature && <img className="ip-sign-ink" style={{ maxHeight: '10mm' }} src={t.trainer_signed.signature} alt="Trainer signature" />}</td>
              </tr>
            </tbody>
          </table>
          <table className="ip-grid">
            <colgroup><col style={{ width: '8%' }} /><col style={{ width: '26%' }} /><col style={{ width: '34%' }} /><col style={{ width: '14%' }} /><col style={{ width: '18%' }} /></colgroup>
            <thead><tr>
              <th className="ip-c">S. No</th><th>Name of the Employee</th>
              <th>Content of the training<br /><span style={{ fontWeight: 400 }}>( Attach sheet for details if any)</span></th>
              <th>Status</th><th>Signature</th>
            </tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="trf-ink">
                  <td className="ip-c">{l.name ? i + 1 : ''}</td><td>{l.name}</td><td>{l.content}</td><td>{l.status}</td>
                  <td>{l.signature && <img className="ip-sign-ink" style={{ maxHeight: '8mm', maxWidth: '30mm' }} src={l.signature} alt={`${l.name} signature`} />}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="trf-sec">EVALUATION</div>
          <table className="ip-grid">
            <colgroup><col style={{ width: '8%' }} /><col style={{ width: '28%' }} /><col style={{ width: '16%' }} /><col style={{ width: '14%' }} /><col style={{ width: '16%' }} /><col style={{ width: '18%' }} /></colgroup>
            <tbody>
              <tr><td colSpan={6}><span className="ip-label">Training Evaluation Required : </span>
                <span className="trf-tick">{tick(t.evaluation_required === true)}</span>YES{' '}
                <span className="trf-tick" style={{ marginLeft: 8 }}>{tick(t.evaluation_required === false)}</span>NO</td></tr>
              <tr><td colSpan={6}><span className="ip-label">If ‘No’, Justification: </span>{t.evaluation_required === false ? t.evaluation_justification : ''}</td></tr>
              <tr><td colSpan={6}><span className="ip-label">Evaluation Method (Note:2*) : </span>{t.evaluation_method}</td></tr>
              <tr>
                <th className="ip-c">Sl. No</th><th>Training Evaluation Plan</th><th>Evaluator</th><th>Planned Date</th><th>Status / Actual Date</th><th>Rating</th>
              </tr>
              {evals.map((l, i) => (
                <tr key={i} className="trf-ink">
                  <td className="ip-c">{l.plan ? i + 1 : ''}</td><td>{l.plan}</td><td>{l.evaluator}</td>
                  <td>{l.planned_date ? formatDay(l.planned_date) : ''}</td><td>{l.actual}</td><td>{l.rating}</td>
                </tr>
              ))}
              <tr><td colSpan={6}><span className="ip-label">Performance Re assessment  (if required)?  </span>
                <span className="trf-tick">{tick(t.reassessment === 'Yes')}</span>YES{' '}
                <span className="trf-tick" style={{ marginLeft: 8 }}>{tick(t.reassessment === 'No')}</span>NO</td></tr>
              <tr className="trf-keep">
                <td colSpan={3}><span className="ip-label">Remarks: </span>{t.remarks}</td>
                <td colSpan={3} className="trf-scale"><span className="ip-label">Rating Scale:</span>
                  {TRAINING_RATINGS.map((r) => <div key={r.label}><b>{r.label}:</b> {r.meaning}</div>)}
                </td>
              </tr>
              <tr className="trf-keep"><td colSpan={3} /><td colSpan={3} style={{ height: '11mm', verticalAlign: 'bottom', textAlign: 'center' }}>
                {t.evaluator_signed?.signature && <img className="ip-sign-ink" style={{ maxHeight: '10mm', margin: '0 auto' }} src={t.evaluator_signed.signature} alt="Evaluator signature" />}
                <span className="ip-label">Signature of Evaluator</span>{t.evaluator_name ? <> — {t.evaluator_name}</> : null}</td></tr>
            </tbody>
          </table>

        </td></tr></tbody>
      </table>
      {/* THE FOOTER AFTER THE FORM: a repeated table foot is placed unreliably
          in print (Chrome pushed it alone onto a second page). The HEADER
          still repeats on a second page through the table head. */}
      <div className="ip-foot">
        <div className="ip-foot-notice">{TRAINING_FORM.notice}</div>
        <div className="ip-foot-tmpl">{TRAINING_FORM.tmpl}</div>
      </div>
    </section>
  );
}

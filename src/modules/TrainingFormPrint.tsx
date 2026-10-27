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
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabaseConfigured } from '../lib/supabase';
import { getTrainingRequest, type TrainingRequest } from '../lib/training';
import { RECORD_SHEET_FIRST_PAGE, TRAINING_FORM, TRAINING_METHODOLOGY, TRAINING_RATINGS, TRAINING_RISKS, paginateRows, tick } from '../lib/trainingForm';
import { formatDay } from '../lib/dates';
import { logAudit } from '../lib/audit';
import { COMPANY_LOGO } from '../lib/brand';
import './indoorprint.css';

const pad = <T,>(rows: T[], n: number, blank: T): T[] => [...rows, ...Array.from({ length: Math.max(0, n - rows.length) }, () => blank)];
/** The template's Record table holds seven employees; more go on the attached
 *  Record sheet (the user, 2026-10-27: "Since the List is Huge in Service, it
 *  can go multiple pages" -- asked: an attached Record sheet from page 3). */
export const RECORD_ROWS_ON_FORM = 7;

export function TrainingFormPrint() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  /** ?part=record prints the Record sheet alone, pages 3 onwards, to go with
   *  HR's own two pages (the user, 2026-10-27: "Leave the Training Plan"). */
  const recordOnly = useSearchParams()[0].get('part') === 'record';
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
          onClick={() => { logAudit({ action: 'training.form_print', target: t.req_no || `#${t.id}`, status: 'ok', meta: { trainee: t.trainee_name, part: recordOnly ? 'record sheet' : 'form' } }); window.print(); }}>
          🖨 Print / Save as PDF
        </button>
        {recordOnly
          ? <Link className="btn btn-sm" to={`/training-form/${t.id}`} replace>Whole form</Link>
          : <Link className="btn btn-sm" to={`/training-form/${t.id}?part=record`} replace>Record sheet only</Link>}
        <span className="muted">Training Form R/HR/11 · {recordOnly ? `Record sheet, from page ${RECORD_SHEET_FIRST_PAGE}` : 'whole form'} · {t.trainee_name}{t.req_no ? ` · ${t.req_no}` : ' · no Request No. yet'} · A4</span>
      </div>

      {recordOnly ? <RecordSheet t={t} /> : <TrainingFormSheet t={t} />}
    </div>
  );
}

/** Every printed page of the form and of the Record sheet: one A4 block,
 *  header at the top, footer at the bottom. `@page` margin 0, so the page's
 *  own padding is the margin and the browser adds no header or footer. */
const A4_STYLE = `@page trf-a4 { size: A4 portrait; margin: 0; }
.trf-a4 { width: 210mm; height: 296.5mm; box-sizing: border-box; padding: 10mm 12mm 8mm; margin: 0 auto 16px; background: #fff; color: #000;
  display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.35);
  font-family: Cambria, Georgia, 'Times New Roman', serif; font-size: 10pt; }
.trf-a4-grow { height: auto; min-height: 296.5mm; overflow: visible; }
.trf-a4 .ip-grid td, .trf-a4 .ip-grid th { padding: 2px 5px; }
.trf-a4-body { flex: 1 1 0; min-height: 0; overflow: hidden; display: flow-root; padding-top: 1mm; }
.trf-a4-grow .trf-a4-body { flex: 1 0 auto; overflow: visible; }
.trf-a4 .trf-rs-intro { display: flow-root; }
.trf-a4 .trf-sec { font-weight: 700; text-decoration: underline; font-size: 11.5pt; margin: 7px 0 3px; }
.trf-a4 .trf-rs-intro .ip-grid { margin-top: 0; }
.trf-a4 .trf-rec { margin-top: 6px; }
.trf-a4 .trf-tick { font-size: 11pt; margin-right: 2px; }
.trf-a4 .trf-ink td { height: 6.5mm; }
.trf-a4 .trf-scale { font-size: 8pt; line-height: 1.3; }
.trf-a4 .ip-foot { flex: none; margin-top: 3mm; }
.trf-a4-probe { position: absolute; left: -10000px; top: 0; visibility: hidden; }
@media print {
  .trf-a4 { page: trf-a4; margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
  .trf-sheet + .trf-record-sheet .trf-a4:first-of-type { break-before: page; }
  .trf-record-sheet .trf-a4:last-child, .trf-sheet:last-child .trf-a4:last-child { break-after: auto; page-break-after: auto; }
  .trf-a4-probe { display: none !important; }
  .trf-keep { page-break-inside: avoid; }
}`;

/** The header on every page -- the logo and the table beside it, as the
 *  template's: the company, HR, TRAINING FORM and PAGE NO. Never the Request
 *  No. (the user, 2026-10-27: "Dont add Training No in Header"). `page` fills
 *  PAGE NO where the page is known -- on the Record sheet's own A4 pages. */
function TrfHead({ page }: { page?: number }) {
  return (
    <table className="ip-head">
      <tbody>
        <tr>
          <td className="ip-logo" rowSpan={2}><img src={COMPANY_LOGO} alt="Air Liquide Medical Systems" /></td>
          <td className="ip-mid">{TRAINING_FORM.org}<br />{TRAINING_FORM.dept}</td>
          <td className="ip-pg" rowSpan={2}>PAGE NO: {page ?? ''}</td>
        </tr>
        <tr><td className="ip-mid">{TRAINING_FORM.title}</td></tr>
      </tbody>
    </table>
  );
}

function TrfFoot() {
  return (
    <div className="ip-foot">
      <div className="ip-foot-notice">{TRAINING_FORM.notice}</div>
      <div className="ip-foot-tmpl">{TRAINING_FORM.tmpl}</div>
    </div>
  );
}

/** THE SHEET ITSELF, pure: the print page and a sample render draw the same one. */
export function TrainingFormSheet({ t }: { t: TrainingRequest }) {
  const approved = t.approval === 'Approved' ? `${t.approved_by_name}${t.approved_at ? ` — ${formatDay(t.approved_at)}` : ''}`
    : t.approval === 'Not approved' ? `Not approved — ${t.approved_by_name}${t.approved_at ? `, ${formatDay(t.approved_at)}` : ''}` : '';
  const all = t.record_lines ?? [];
  const attached = all.length > RECORD_ROWS_ON_FORM;
  const lines = attached ? [] : pad(all, 4, { name: '', content: '', status: '' });
  const evals = pad(t.evaluation_plan ?? [], 2, { plan: '', evaluator: '', planned_date: '', actual: '', rating: '' });

  return (
    <>
      <section className="trf-sheet">
      {/* THE FORM'S OWN STYLE, WITH THE SHEET, so wherever the sheet is drawn it
          looks the same; a NAMED page, so another form's "@page" cannot win. */}
      <style>{A4_STYLE}</style>
      {/* TWO A4 PAGES, AS THE TEMPLATE: page 1 the PLAN and the RECORD, page 2
          the EVALUATION -- each with the header (PAGE NO 1, 2) and the footer,
          so the attached Record sheet's page 3 is the third page printed (the
          user, 2026-10-27: "Footer and Header should be present in all
          pages"). A page grows rather than clips if its content is longer. */}
      <div className="trf-a4 trf-a4-grow">
        <TrfHead page={1} />
        <div className="trf-a4-body">

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
              {attached ? (
                <tr className="trf-ink"><td colSpan={5} className="ip-c">
                  <b>See attached Record sheet</b> — {all.length} employees{t.req_no ? `, Training Request ${t.req_no}` : ''}
                </td></tr>
              ) : lines.map((l, i) => <RecordRow key={i} l={l} i={i} />)}
            </tbody>
          </table>

        </div>
        <TrfFoot />
      </div>

      <div className="trf-a4 trf-a4-grow">
        <TrfHead page={2} />
        <div className="trf-a4-body">
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

        </div>
        <TrfFoot />
      </div>
    </section>
    {attached && <RecordSheet t={t} />}
    </>
  );
}

function RecordRow({ l, i }: { l: { name: string; content: string; status: string; signature?: string }; i: number }) {
  return (
    <tr className="trf-ink">
      <td className="ip-c">{l.name ? i + 1 : ''}</td><td>{l.name}</td><td>{l.content}</td><td>{l.status}</td>
      <td>{l.signature && <img className="ip-sign-ink" style={{ maxHeight: '8mm', maxWidth: '30mm' }} src={l.signature} alt={`${l.name} signature`} />}</td>
    </tr>
  );
}

/** THE ATTACHED RECORD SHEET (the user, 2026-10-27: "Simple Create a Sheet in
 *  the Same format for Record as Page 3 and Onwards"; then: "Expected output
 *  is a A4 Format. Page No should start from 3 and continue. Footer and Header
 *  should be present in all pages").
 *
 *  LAID OUT INTO A4 PAGES HERE, NOT BY THE BROWSER: each page is a 210 x 297 mm
 *  block with the header (PAGE NO 3, 4, ...), its rows and the footer, so
 *  every printed page carries both and its number whatever the browser does
 *  with a repeated table head or foot (Chrome placed the foot unreliably). The
 *  rows are measured once, hidden, at the page's own width -- a long Content
 *  of training or a signature makes a row taller -- and paginateRows() splits
 *  them. The first page also carries the Request No., topic, dates and
 *  trainer; the column headings repeat on every page. */
export function RecordSheet({ t }: { t: TrainingRequest }) {
  const rows = t.record_lines ?? [];
  const probe = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][] | null>(null);

  useLayoutEffect(() => {
    let live = true;
    setPages(null);
    void (async () => {
      const el = probe.current;
      if (!el) return;
      // Images change a row's height: wait for the logo and the signatures.
      await Promise.all([...el.querySelectorAll('img')].map((img) => (img.complete ? undefined
        : new Promise((done) => { img.addEventListener('load', done); img.addEventListener('error', done); }))));
      if (document.fonts) await document.fonts.ready;
      const p = probe.current;
      if (!live || !p) return;
      const box = (sel: string) => (p.querySelector(sel) as HTMLElement).getBoundingClientRect();
      const body = box('.trf-a4-body');
      const table = box('.trf-rec');
      const head = box('.trf-rec thead');
      const heights = [...p.querySelectorAll('.trf-rec tbody tr')].map((r) => r.getBoundingClientRect().height);
      const SLACK = 4; // rounding between screen and print
      setPages(paginateRows(heights, body.bottom - head.bottom - SLACK, body.height - (head.bottom - table.top) - SLACK));
    })();
    return () => { live = false; };
  }, [t]);

  const intro = (
    <div className="trf-rs-intro">
      <div className="trf-sec">RECORD — attached sheet{t.req_no ? ` [${t.req_no}]` : ''}</div>
      <table className="ip-grid">
        <colgroup><col style={{ width: '62%' }} /><col style={{ width: '38%' }} /></colgroup>
        <tbody>
          <tr>
            <td><span className="ip-label">Training Topic: </span>{t.topic}<br />
              <span className="ip-label">Training From (Date) : </span>{formatDay(t.from_date)}
              <span style={{ marginLeft: 28 }} className="ip-label">To (Date) : </span>{formatDay(t.to_date)}</td>
            <td><span className="ip-label">Trainer: </span>{t.trainer_name}<br /><span className="ip-label">Trainer Signature:</span>
              {t.trainer_signed?.signature && <img className="ip-sign-ink" style={{ maxHeight: '10mm' }} src={t.trainer_signed.signature} alt="Trainer signature" />}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
  const table = (idx: number[]) => (
    <table className="ip-grid trf-rec">
      <colgroup><col style={{ width: '8%' }} /><col style={{ width: '26%' }} /><col style={{ width: '34%' }} /><col style={{ width: '14%' }} /><col style={{ width: '18%' }} /></colgroup>
      <thead><tr>
        <th className="ip-c">S. No</th><th>Name of the Employee</th>
        <th>Content of the training</th><th>Status</th><th>Signature</th>
      </tr></thead>
      <tbody>{idx.map((i) => <RecordRow key={i} l={rows[i]} i={i} />)}</tbody>
    </table>
  );
  const page = (n: number, idx: number[], first: boolean, key?: number) => (
    <div className="trf-a4" key={key}>
      <TrfHead page={n} />
      <div className="trf-a4-body">{first && intro}{table(idx)}</div>
      <TrfFoot />
    </div>
  );

  return (
    <section className="trf-record-sheet">
      <style>{A4_STYLE}</style>
      {pages === null
        ? <div className="trf-a4-probe" ref={probe} aria-hidden="true">{page(RECORD_SHEET_FIRST_PAGE, rows.map((_, i) => i), true)}</div>
        : pages.map((idx, k) => page(RECORD_SHEET_FIRST_PAGE + k, idx, k === 0, k))}
    </section>
  );
}

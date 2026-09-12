// ===========================================================================
// THE FIELD FAILURE REPORT, PRINTABLE — R-SER-03 Rev 02.
//
// The user, 2026-09-12: "Add a HTML version which can be printed, similar to
// DC and declaration."
//
// WHY A PAGE AS WELL AS THE WORD FILE. The .docx is for somebody who has to
// edit or file the document; this is for somebody who wants the form on paper
// now, from a phone or a machine with no Word on it. The Delivery Challan and
// the Declaration already work that way and people know the pattern: a route of
// its own, no sidebar and no application chrome, and one Print button that is
// not on the paper.
//
// IT RENDERS THE SAME ROWS AS THE WORD FILE — FFR_ROWS in src/lib/ffrform.ts,
// which was extracted from the controlled template. That is the whole reason
// the form lives in a data file: a second transcription of a controlled form is
// a second form, and the two would drift the first time a label changed.
// ===========================================================================
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getFfr, supabaseConfigured } from '../lib/supabase';
import { ffrDocFrom } from '../lib/ffr';
import { ffrDocDownload, type FfrDocFields } from '../lib/ffrdoc';
import {
  FFR_ROWS, FFR_HEADER, FFR_FOOTER, ffrCellValue, ffrProblemText, type FfrCell,
} from '../lib/ffrform';
import { useMySignature, signatureBelongsTo } from '../lib/signature';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
// A PRINTED DOCUMENT CARRIES THE COMPANY'S MARK, never the application's
// (the user's rule, 2026-09-05) — and it comes from brand.ts, never from a
// direct asset import, so replacing a logo stays one file.
import { COMPANY_LOGO } from '../lib/brand';
import './ffr.css';

/** A label and, after it, its value. The label keeps the template's internal
 *  padding (white-space: pre in the stylesheet), which is how the printed form
 *  lines its colons up. */
function Cell({ cell, value }: { cell: FfrCell; value: string }) {
  return (
    <div>
      <span className="ffr-label">{cell.label}</span>
      {value ? <span className="ffr-value">{value}</span> : null}
    </div>
  );
}

export function FieldFailureReportPrint() {
  const { ffrNo = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mySig = useMySignature();
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to print a report.'); return; }
    let live = true;
    getFfr(decodeURIComponent(ffrNo))
      .then((r) => {
        if (!live) return;
        if (!r) setErr(`Field Failure Report ${decodeURIComponent(ffrNo)} was not found, or you cannot view it.`);
        else setRow(r);
      })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [ffrNo]);

  if (err) {
    return (
      <div className="ffr-page">
        <div className="ffr-toolbar">
          <button className="btn btn-sm" onClick={() => navigate('/failure-report')}>← Back</button>
        </div>
        <div className="ffr-missing"><p>{err}</p></div>
      </div>
    );
  }
  if (!row) return <div className="ffr-page"><div className="ffr-missing"><p>Loading report…</p></div></div>;

  const raisedBy = String(row.raised_by_name ?? '') || (user?.email ?? '');
  // THE BLOCK THAT NAMES YOU, and no other (src/lib/signature.ts). Somebody
  // else printing this report gets an empty block to sign by hand.
  const signature = signatureBelongsTo(raisedBy, user) ? (mySig?.signature ?? '') : '';
  const f: FfrDocFields = { ...ffrDocFrom(row, raisedBy), signature };

  return (
    <div className="ffr-page">
      <div className="ffr-toolbar">
        <button className="btn btn-sm" onClick={() => navigate('/failure-report')}>← Back to the register</button>
        <button className="btn btn-sm btn-primary" onClick={() => window.print()}>🖨 Print</button>
        <button
          className="btn btn-sm"
          onClick={() => { ffrDocDownload(f); logAudit({ action: 'ffr.document', target: f.ffrNo, status: 'ok' }); }}
        >📄 Word copy</button>
        <span className="muted">
          {f.ffrNo} · A4 — the same form as the Word copy, laid out from R-SER-03 Rev 02.
        </span>
      </div>

      <section className="ffr-sheet">
        <table className="ffr-head">
          <tbody>
            <tr>
              <td className="ffr-h-logo" rowSpan={2}>
                <img src={COMPANY_LOGO} alt="Air Liquide Medical Systems" />
              </td>
              <td className="ffr-h-mid">{FFR_HEADER.org}<br />{FFR_HEADER.dept}</td>
              {/* The Word file numbers the page with a PAGE field; a printed web
                  page cannot count its own sheets, so it states the first. A
                  report long enough to run over is the rare case, and a wrong
                  number would be worse than a plain one. */}
              <td className="ffr-h-page" rowSpan={2}>{FFR_HEADER.pageLabel} 1</td>
            </tr>
            <tr><td className="ffr-h-mid ffr-title">{FFR_HEADER.title}</td></tr>
          </tbody>
        </table>

        <table className="ffr-grid">
          <tbody>
            {FFR_ROWS.map((r, i) => {
              if (r.kind === 'section') {
                return <tr key={i}><td className="ffr-section" colSpan={2}>{r.title}</td></tr>;
              }
              if (r.kind === 'pair') {
                return (
                  <tr key={i}>
                    <td className="ffr-c-left"><Cell cell={r.left} value={ffrCellValue(f, r.left.key)} /></td>
                    <td className="ffr-c-right"><Cell cell={r.right} value={ffrCellValue(f, r.right.key)} /></td>
                  </tr>
                );
              }
              if (r.kind === 'block') {
                const text = r.key === 'problemReported' ? ffrProblemText(f) : ffrCellValue(f, r.key);
                return (
                  <tr key={i}>
                    <td colSpan={2}>
                      <div className="ffr-label">{r.label}</div>
                      <div className={`ffr-lines${r.key === 'serviceObservation' ? ' ffr-obs' : ''}`}>{text}</div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={i}>
                  <td colSpan={2}>
                    {r.lines.map((c, j) => {
                      const isSignature = c.label.startsWith('Signature');
                      return (
                        <div key={j}>
                          <span className="ffr-label">{c.label}</span>
                          {isSignature
                            ? (signature ? <img className="ffr-sign-ink" src={signature} alt="" /> : null)
                            : (ffrCellValue(f, c.key) ? <span className="ffr-value">{ffrCellValue(f, c.key)}</span> : null)}
                        </div>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="ffr-foot">
          <div className="ffr-foot-notice">{FFR_FOOTER.notice}</div>
          <div className="ffr-foot-tmpl">{FFR_FOOTER.tmpl}</div>
        </div>
      </section>
    </div>
  );
}

import { useState } from 'react';
import { Drawer } from '../components/ui/ui';
import { fmtLongSmart, formatSmartDate } from '../lib/format';
import { manualReportLink } from '../lib/reports';
import { DocPreview } from '../components/doc/DocPreview';

// ===========================================================================
// REPORT DETAIL — every field of one visit/report, shown in a drawer. Used by
// the Reports register (row click) and the Call view (visit history click).
// Top-level columns first, then everything the engineer filled (data jsonb).
//
// IT IS READ, NOT SCANNED, and that decides how it is laid out. The mini
// tables this borrows its styling from clip every cell to one ellipsised line
// so ten visits fit on a call; here that turned the two fields somebody opens
// this drawer FOR -- Job Done and the Complaint Observation -- into "Checked
// machine, rectified problem, calibration d…" (reported 2026-09-08). The
// `assoc-read` modifier lets them wrap and keeps the engineer's own line
// breaks; the label column stays on one line so the values still line up.
//
// AND THE MANUAL REPORT IS A BUTTON, not a URL. It was rendered as its raw
// Drive link, truncated, which is unreadable AND unusable: too long to see and
// not clickable. It opens the same viewer as every other screen.
// ===========================================================================

const s = (v: unknown) => (v == null ? '' : String(v));

// The engineer's fields are free-form (a jsonb blob), so dates arrive however
// they were written — an ISO date, or the browser locale string older visits
// stored. Anything whose FIELD NAME says date/time renders in the app's format
// (dd-mmm-yyyy, with hh:mm:ss when the value carries a time); anything else is
// left exactly as entered, and an unparseable value stays as typed.
const DATEISH = /\b(date|time|on)\b/i;
const showValue = (key: string, value: string) => (DATEISH.test(key) ? formatSmartDate(value, '') || value : value);

// The report field, whatever it is called on the row. `manualReportLink` reads
// the column and the legacy form field and returns '' for anything that is not
// a URL — so a note typed into the box does not become a dead link.
const isManualReport = (key: string) => /manual\s*report/i.test(key);

export function ReportDetail({ report, onClose }: { report: Record<string, unknown>; onClose: () => void }) {
  const data = (report.data && typeof report.data === 'object') ? report.data as Record<string, unknown> : {};
  const [showDoc, setShowDoc] = useState(false);
  const reportUrl = manualReportLink(report);

  const top: [string, string][] = [
    ['Visit Date', report.visit_at ? fmtLongSmart(report.visit_at) : ''],
    ['UCN', s(report.ucn)],
    ['Call Number', s(report.call_number)],
    ['Call Status', s(report.call_status)],
    ['Engineer', s(report.engineer)],
    ['Pending Reason', s(report.pending_reason)],
  ].filter(([, v]) => v) as [string, string][];

  // Every field the engineer filled, in the order stored.
  const fields = Object.entries(data)
    .map(([k, v]) => [k, typeof v === 'object' && v !== null ? JSON.stringify(v) : s(v)] as [string, string])
    .filter(([, v]) => v !== '');

  const title = `Report · ${s(report.call_number) || s(report.ucn) || 'Visit'}`;
  return (
    <Drawer open onClose={onClose} title={title} width={560}>
      <div className="rep-form">
        <div className="assoc-scroll">
          <table className="assoc-table assoc-read" style={{ minWidth: 320 }}>
            <tbody>
              {top.map(([k, v]) => (
                <tr key={k}><td style={{ width: 180, color: 'var(--muted)' }}>{k}</td><td><b>{v}</b></td></tr>
              ))}
              {/* THE REPORT, AT THE TOP, where somebody looking for it looks —
                  rather than only as a raw link buried in the field list. */}
              {reportUrl && (
                <tr>
                  <td style={{ width: 180, color: 'var(--muted)' }}>Service Report</td>
                  <td>
                    <button type="button" className="svc-report-link" onClick={() => setShowDoc(true)}>
                      📄 Show the report
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="rep-sec-title" style={{ marginTop: 12 }}>Report fields ({fields.length})</div>
        {fields.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No work details recorded on this visit.</div>
        ) : (
          <div className="assoc-scroll">
            <table className="assoc-table assoc-read" style={{ minWidth: 320 }}>
              <tbody>
                {fields.map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ width: 220, color: 'var(--muted)' }}>{k}</td>
                    <td>
                      {isManualReport(k) && reportUrl ? (
                        <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" className="svc-report-link" onClick={() => setShowDoc(true)}>
                            📄 Show the report
                          </button>
                          <a className="muted" style={{ fontSize: 12 }} href={reportUrl}
                             target="_blank" rel="noreferrer">Open in Drive ↗</a>
                        </span>
                      ) : showValue(k, v)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDoc && reportUrl && (
        <DocPreview
          url={reportUrl}
          title={`Service Report — ${s(report.ucn) || s(report.call_number)}`}
          subtitle={[report.visit_at ? fmtLongSmart(report.visit_at) : '', s(report.engineer), s(report.call_status)]
            .filter(Boolean).join(' · ')}
          onClose={() => setShowDoc(false)}
        />
      )}
    </Drawer>
  );
}

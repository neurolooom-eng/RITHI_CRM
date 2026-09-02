import { Drawer } from '../components/ui/ui';
import { fmtLongSmart, formatSmartDate } from '../lib/format';

// ===========================================================================
// REPORT DETAIL — every field of one visit/report, shown in a drawer. Used by
// the Reports register (row click) and the Call view (visit history click).
// Top-level columns first, then everything the engineer filled (data jsonb).
// ===========================================================================

const s = (v: unknown) => (v == null ? '' : String(v));

// The engineer's fields are free-form (a jsonb blob), so dates arrive however
// they were written — an ISO date, or the browser locale string older visits
// stored. Anything whose FIELD NAME says date/time renders in the app's format
// (dd-mmm-yyyy, with hh:mm:ss when the value carries a time); anything else is
// left exactly as entered, and an unparseable value stays as typed.
const DATEISH = /\b(date|time|on)\b/i;
const showValue = (key: string, value: string) => (DATEISH.test(key) ? formatSmartDate(value, '') || value : value);

export function ReportDetail({ report, onClose }: { report: Record<string, unknown>; onClose: () => void }) {
  const data = (report.data && typeof report.data === 'object') ? report.data as Record<string, unknown> : {};
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
          <table className="assoc-table" style={{ minWidth: 320 }}>
            <tbody>
              {top.map(([k, v]) => (
                <tr key={k}><td style={{ width: 180, color: 'var(--muted)' }}>{k}</td><td><b>{v}</b></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rep-sec-title" style={{ marginTop: 12 }}>Report fields ({fields.length})</div>
        {fields.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No work details recorded on this visit.</div>
        ) : (
          <div className="assoc-scroll">
            <table className="assoc-table" style={{ minWidth: 320 }}>
              <tbody>
                {fields.map(([k, v]) => (
                  <tr key={k}><td style={{ width: 220, color: 'var(--muted)' }}>{k}</td><td>{showValue(k, v)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Drawer>
  );
}

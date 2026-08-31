import { Drawer } from '../components/ui/ui';
import { fmtLongDate } from '../lib/format';

// ===========================================================================
// REPORT DETAIL — every field of one visit/report, shown in a drawer. Used by
// the Reports register (row click) and the Call view (visit history click).
// Top-level columns first, then everything the engineer filled (data jsonb).
// ===========================================================================

const s = (v: unknown) => (v == null ? '' : String(v));

export function ReportDetail({ report, onClose }: { report: Record<string, unknown>; onClose: () => void }) {
  const data = (report.data && typeof report.data === 'object') ? report.data as Record<string, unknown> : {};
  const top: [string, string][] = [
    ['Visit Date', report.visit_at ? fmtLongDate(report.visit_at) : ''],
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
                  <tr key={k}><td style={{ width: 220, color: 'var(--muted)' }}>{k}</td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Drawer>
  );
}

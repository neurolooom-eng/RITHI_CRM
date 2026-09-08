import { useCallback, useEffect, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { supabaseConfigured, countUnusedSpares, listUnusedSpares } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { xlsxDownload } from '../lib/xlsx';
import { csvExport, fmtLongDate } from '../lib/format';
import { logAudit } from '../lib/audit';
import { UNUSED_SPARE_COLUMNS, EMPTY_UNUSED_FILTER, describeUnusedFilter, type UnusedSpareFilter } from '../lib/reports';
import './dccr.css';

// ===========================================================================
// NOT USED AS PER THE REQUEST — parts that reached the engineer and were never
// booked against the call they were sent for.
//
// The user, 2026-09-08: "Flag if something was Requested but never used in the
// Consumption of that call ... Create a Separate Report of these Flagged
// items."
//
// WHAT IS AND IS NOT A FINDING is settled in the view (0147), not here, and it
// is worth saying on the screen rather than only in the SQL: a refused request
// and a part Stores dropped are NOT on this report, because nothing arrived, so
// nothing could be fitted. Every line here is a part that was sent.
//
// EACH ROW IS ONE OF TWO STORIES and the report cannot tell which: the part was
// fitted and never recorded, or it is still in the van. Both are worth chasing,
// which is why the row carries the customer, the machine and the engineer —
// enough to act on without opening the call.
//
// THE FILTER RUNS IN THE DATABASE and the count is exact, for the same reason
// as the consumption report: the register pages, so a browser-side filter would
// report on the first thousand rows and call it the answer.
// ===========================================================================

export function UnusedSpareReport() {
  const live = supabaseConfigured();
  const { can } = useAuth();
  const mayExport = can('consumption.view') || can('calls.view') || can('reports.view');

  const [filter, setFilter] = useState<UnusedSpareFilter>(EMPTY_UNUSED_FILTER);
  const [matching, setMatching] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k: keyof UnusedSpareFilter, v: string) => setFilter((f) => ({ ...f, [k]: v }));

  // How many the filter matches, asked of the database as the filter changes,
  // so the button says what it is about to export.
  const recount = useCallback(() => {
    if (!live) return;
    countUnusedSpares(filter)
      .then(setMatching)
      .catch((e) => { setMatching(null); setMsg(`Could not count: ${e instanceof Error ? e.message : String(e)}`); });
  }, [live, filter]);
  useEffect(() => { const t = window.setTimeout(recount, 300); return () => window.clearTimeout(t); }, [recount]);

  // A PREVIEW OF THE FIRST FEW, not the whole set. Somebody about to send this
  // to an engineer wants to see that it looks right; loading thousands of rows
  // to show twenty of them is a cost with no reader.
  const preview = useCallback(() => {
    if (!live) return;
    setBusy(true); setMsg('');
    listUnusedSpares(filter)
      .then((r) => { setRows(r.slice(0, 25)); if (!r.length) setMsg('Nothing is flagged for that filter.'); })
      .catch((e) => setMsg(`Could not read the report: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setBusy(false));
  }, [live, filter]);

  const download = async (kind: 'xlsx' | 'csv') => {
    setBusy(true); setMsg('');
    try {
      const all = await listUnusedSpares(filter, (n) => setMsg(`Reading… ${n.toLocaleString()} rows`));
      if (!all.length) { setMsg('Nothing is flagged for that filter — nothing to download.'); return; }
      const stamp = new Date().toISOString().slice(0, 10);
      const name = `not-consumed-against-call-${stamp}`;
      const cols = UNUSED_SPARE_COLUMNS.map((c) => ({ key: c, header: c }));
      if (kind === 'csv') {
        csvExport(`${name}.csv`, cols, all);
      } else {
        // THE FILE CARRIES ITS OWN SCOPE, like the consumption report: a report
        // whose filter is not written down is one somebody later mistakes for
        // the whole register — and this one exists to be sent to people who
        // were not here when it was made.
        xlsxDownload(`${name}.xlsx`, [
          { name: 'Not Consumed', columns: UNUSED_SPARE_COLUMNS, rows: all },
          {
            name: 'About',
            columns: ['Item', 'Value'],
            rows: [
              { Item: 'Report', Value: 'Not Consumed Against this Call' },
              { Item: 'What it lists', Value: 'Spares DISPATCHED or RECEIVED against a call whose part code never appears in that call’s consumption.' },
              { Item: 'What it excludes', Value: 'Lines refused by an approver, and lines Stores dropped — nothing arrived, so nothing could be fitted.' },
              { Item: 'Matched on', Value: 'The part CODE, not the description, which drifts.' },
              { Item: 'Filter', Value: describeUnusedFilter(filter) },
              { Item: 'Rows', Value: String(all.length) },
              { Item: 'Taken', Value: fmtLongDate(new Date().toISOString()) },
            ],
          },
        ]);
      }
      logAudit({ action: 'report.unused_spares', meta: { rows: all.length, filter: describeUnusedFilter(filter), kind } });
      setMsg(`${all.length.toLocaleString()} row${all.length === 1 ? '' : 's'} downloaded.`);
    } catch (e) {
      setMsg(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  if (!live) {
    return <div className="sheet-banner sheet-banner-error"><span>Not connected to the database.</span></div>;
  }

  return (
    <div>
      <SectionCard title="Not Consumed Against this Call">
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Parts that <b>reached the engineer</b> and are not fully accounted for in the call's consumption —
          either fitted and not recorded, or still in the van. <b>Not used</b> means none of it was booked;
          <b>Short</b> means less was booked than was sent (2 sent, 1 used). A line refused by an approver, or
          dropped by Stores, is <b>not</b> here: nothing arrived, so nothing could be fitted.
        </p>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
          <b>Dispatched counts as reached.</b> Acknowledging a delivery is not mandatory, so waiting for a
          receipt would leave most of these unreported.
        </p>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
          <b>Dispatched counts as reached.</b> Acknowledging a delivery is not mandatory, so waiting for a
          receipt would leave most of these unreported.
        </p>

        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label className="field-label" style={{ display: 'grid', gap: 4 }}>Dispatched from
            <input className="input" type="date" value={filter.from} onChange={(e) => set('from', e.target.value)} />
          </label>
          <label className="field-label" style={{ display: 'grid', gap: 4 }}>to
            <input className="input" type="date" value={filter.to} onChange={(e) => set('to', e.target.value)} />
          </label>
          <label className="field-label" style={{ display: 'grid', gap: 4 }}>Engineer
            <input className="input" placeholder="any" value={filter.engineer} onChange={(e) => set('engineer', e.target.value)} />
          </label>
          <label className="field-label" style={{ display: 'grid', gap: 4 }}>Product
            <input className="input" placeholder="any" value={filter.product} onChange={(e) => set('product', e.target.value)} />
          </label>
          <label className="field-label" style={{ display: 'grid', gap: 4 }}>Part code
            <input className="input" placeholder="any" value={filter.part} onChange={(e) => set('part', e.target.value)} />
          </label>
          {(filter.from || filter.to || filter.engineer || filter.product || filter.part) && (
            <button className="btn btn-sm btn-ghost" onClick={() => setFilter(EMPTY_UNUSED_FILTER)}>Clear</button>
          )}
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-sm" disabled={busy} onClick={preview}>Preview</button>
          <button className="btn btn-primary" disabled={busy || !mayExport || matching === 0}
                  onClick={() => void download('xlsx')}>
            ⭳ Download Excel{matching !== null ? ` (${matching.toLocaleString()})` : ''}
          </button>
          <button className="btn btn-sm" disabled={busy || !mayExport || matching === 0}
                  onClick={() => void download('csv')}>⭳ CSV</button>
          <span className="muted" style={{ fontSize: 12.5 }}>{describeUnusedFilter(filter)}</span>
        </div>

        {msg && <p className="muted" style={{ fontSize: 13 }}>{msg}</p>}

        {rows.length > 0 && (
          <div className="assoc-scroll" style={{ marginTop: 12 }}>
            <table className="assoc-table">
              <thead>
                <tr>{['UCN', 'OR No', 'Part Code', 'Part name', 'Finding', 'Sent', 'Used', 'Short', 'Engineer', 'Customer', 'Dispatched On']
                  .map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{String(r.ucn ?? '')}</td>
                    <td>{String(r['OR No'] ?? '')}</td>
                    <td>{String(r['Part Code'] ?? '')}</td>
                    <td>{String(r['Part name'] ?? '')}</td>
                    <td>{String(r.Finding ?? '')}</td>
                    <td>{String(r['Qty Sent'] ?? '')}</td>
                    <td>{String(r['Qty Used'] ?? '')}</td>
                    <td>{String(r['Qty Short'] ?? '')}</td>
                    <td>{String(r.Engineer ?? '')}</td>
                    <td>{String(r.Customer ?? '')}</td>
                    <td>{fmtLongDate(r['Dispatched On'])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12.5 }}>
              First {rows.length} of {matching?.toLocaleString() ?? '…'} — the download carries them all,
              with the customer, machine, DC number and call status on every row.
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

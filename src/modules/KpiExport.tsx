import { useEffect, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { supabaseConfigured, countKpiFieldInst, listKpiFieldInst } from '../lib/supabase';
import { KPI_FIELD_INST_COLUMNS, kpiExportColumns, toKpiExportRow, toKpiCellRow } from '../lib/kpi';
import { csvExport } from '../lib/format';
import { xlsxDownload, xlsxCell } from '../lib/xlsx';
import { logAudit } from '../lib/audit';
import './dccr.css';
import { COMPLETE } from '../lib/exportscope';

// ===========================================================================
// THE KPI WORKBOOK'S Field_INST TAB, computed from the register.
//
// Lifted out of the Objective page (2026-09-08) so every export lives on
// Reports. It was on Objective because that is where it was first asked for,
// and on KPI & Failure Analysis before that -- an export that moves with
// whichever screen prompted it is one nobody can find twice.
//
// Its own component with its own state, because the tab it sits on mounts one
// at a time: nothing here should be counting rows for a screen nobody is on.
// ===========================================================================

export function KpiExport() {
  const live = supabaseConfigured();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // The count is the whole range, not a page — so the button can say what it is
  // about to export, and a failed count says so rather than showing a stale
  // number from the last range (the "99 of 76" lesson).
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    setErr(false);
    void countKpiFieldInst({ from: from || undefined, to: to || undefined })
      .then((n) => { if (!cancelled) setCount(n); })
      .catch(() => { if (!cancelled) { setCount(null); setErr(true); } });
    return () => { cancelled = true; };
  }, [live, from, to]);

  const run = async (kind: 'csv' | 'xlsx' = 'csv') => {
    if (busy) return;
    setBusy(true);
    setMsg('Reading the calls…');
    try {
      const PAGE = 1000;
      const range = { from: from || undefined, to: to || undefined };
      const all: Record<string, unknown>[] = [];
      for (let off = 0; ; off += PAGE) {
        const page = await listKpiFieldInst(range, off, PAGE);
        all.push(...page);
        if (page.length < PAGE) break;
        setMsg(`Read ${all.length.toLocaleString()}…`);
      }
      const span = from || to ? `${from || 'start'}_${to || 'today'}` : new Date().toISOString().slice(0, 10);
      const cols = kpiExportColumns();
      if (kind === 'csv') {
        csvExport(`kpi-field-inst-${span}.csv`, cols, all.map(toKpiExportRow),
          // `all` is every page, read in the loop above.
          COMPLETE);
      } else {
        // EVERY DATE A REAL DATE, so Excel sorts it, filters it by month and
        // subtracts it — which a CSV cannot offer at all, whatever the dates
        // are spelled like in it. `xlsxCell` is handed the RAW value and
        // decides by VALUE, never by column name.
        xlsxDownload(`kpi-field-inst-${span}.xlsx`, [{
          name: 'Field_INST',
          columns: cols.map((c) => c.header),
          rows: all.map((r) => {
            const raw = toKpiCellRow(r);
            return Object.fromEntries(cols.map((c) => [c.header, xlsxCell(raw[c.key])]));
          }),
        }], COMPLETE);
      }
      setMsg(`Exported ${all.length.toLocaleString()} call${all.length === 1 ? '' : 's'}.`);
      logAudit({ action: 'kpi.export', target: `${all.length} calls`, meta: { rows: all.length, from, to, kind } });
    } catch (e) {
      setMsg(`Could not export: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <SectionCard title="KPI workbook — Field_INST">
      <p className="muted" style={{ marginTop: 0 }}>
        The workbook&rsquo;s own tab, computed from the register: <b>columns A to AG</b>, the same
        fields in the same order under the same headings, so the file drops straight in — plus
        <b> Pending Days</b>, which the workbook does not have. Field and Installation calls only
        — PM keeps its own tab — and <b>cancelled calls are not included at all</b>.
      </p>
      <ul className="muted" style={{ marginTop: 0, fontSize: 12.5, lineHeight: 1.7 }}>
        <li><b>Call Attended On</b> — the earlier of the first visit and the first spare request.
          A spare raised before anyone visits is still somebody attending to the call.</li>
        <li><b>Call Solved Date &amp; Time</b> — the visit date of the entry that moved the call to
          <b> Solved - Report Completed</b>. Not the last visit, and not the day it was typed in.</li>
        <li><b>Open/Close</b> — Close only when the call is Solved - Report Completed. Anything
          else is Open, <b>including Solved - Report Pending</b>.</li>
        <li><b>Attended in Days, Solved in Days, TTA, TTS and Failure Month</b> (AC–AG) are computed
          here, by the workbook&rsquo;s own formulas — days from the LATER of complaint and
          registration, never negative, and the band from the finer of its two lookup tables.</li>
        <li><b>Pending Days</b> is the workbook&rsquo;s missing column. Its own formula returns 0 for
          a call nobody has been to, so every unattended call reads as attended and solved the same
          day; this says how long it has actually been waiting.</li>
      </ul>
      <div className="row" style={{ gap: 10, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <label className="field-label">Registered from</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="field-label">to</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(from || to) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFrom(''); setTo(''); }}>
            Whole register
          </button>
        )}
        {/* EXCEL FIRST, AND THAT IS THE POINT OF IT (the user, 2026-09-24:
            "the Call Registration Date is not recognized by Excel"). A CSV can
            only carry text, so every date in it is left for Excel to parse and
            the one with a TIME on it does not survive that. In a workbook a
            date is a number plus a format and nothing is parsed. */}
        <button
          className="btn btn-primary"
          disabled={!live || busy || count === 0}
          title="Dates arrive as real dates — sortable, filterable by month, subtractable"
          onClick={() => void run('xlsx')}
        >
          {busy ? 'Exporting…'
            : err ? '⭳ Excel (.xlsx)'
            : `⭳ Excel — ${count == null ? '' : count.toLocaleString()} ${count === 1 ? 'call' : 'calls'}`}
        </button>
        {/* KEPT, because it is what pastes into the workbook column for column.
            Its dates read dd-MMM-yyyy, which is all a CSV can carry. */}
        <button
          className="btn"
          disabled={!live || busy || count === 0}
          title="Text only — Excel will read the plain dates but not the one carrying a time"
          onClick={() => void run('csv')}
        >
          {busy ? '…' : '⭳ CSV'}
        </button>
      </div>
      {/* A count nobody can tell is stale is worse than an admission. */}
      {err && <div className="sheet-banner sheet-banner-error"><span>Could not count the calls for that range — the export will still read them.</span></div>}
      {msg && <div className="sheet-banner sheet-banner-info"><span>{msg}</span></div>}
      <details>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 12.5 }}>
          Columns ({KPI_FIELD_INST_COLUMNS.length})
        </summary>
        <ol className="dccr-export-cols">
          {KPI_FIELD_INST_COLUMNS.map((c) => <li key={c}>{c}</li>)}
        </ol>
      </details>
    </SectionCard>
  );
}

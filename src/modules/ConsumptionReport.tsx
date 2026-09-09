import { useCallback, useEffect, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { supabaseConfigured, countConsumptionReport, listConsumptionReport } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { xlsxDownload } from '../lib/xlsx';
import { csvExport } from '../lib/format';
import { logAudit } from '../lib/audit';
import {
  CONSUMPTION_MANDATORY, CONSUMPTION_OPTIONAL, EMPTY_CONSUMPTION_FILTER,
  describeFilter, exportColumns, type ConsumptionFilter,
} from '../lib/reports';
import './dccr.css';

// ===========================================================================
// REPORTS — narrow it, choose the columns, take the file.
//
// The user's ask (2026-09-08): the consumption report in the format they
// already keep by hand, every other consumption column available at the end, a
// filter BEFORE the download, and a column picker in which the screenshot's
// columns are mandatory.
//
// THREE THINGS THIS SCREEN REFUSES TO GET WRONG:
//
//   * THE FILTER RUNS IN THE DATABASE. It would have been easier to fetch and
//     then narrow, and it would have been wrong: the register pages, so a
//     browser-side filter reports on the first thousand rows and calls it the
//     answer. `countConsumptionReport` asks the database how many match, so the
//     button says what it is ABOUT to export rather than what it has loaded.
//
//   * THE MANDATORY COLUMNS ARE SHOWN, TICKED AND DISABLED -- not hidden. A
//     column absent from a picker reads as an oversight; one that is visibly
//     locked reads as a rule, which is what it is.
//
//   * THE FILE CARRIES ITS OWN SCOPE. The workbook gets a second sheet naming
//     the filter, the column choice, the row count and the moment it was taken.
//     A report whose scope is not written down is one somebody will later
//     mistake for the whole register -- and this file exists precisely to be
//     sent to people who were not here when it was made.
// ===========================================================================

export function ConsumptionReport() {
  const live = supabaseConfigured();
  const { can } = useAuth();
  const mayExport = can('consumption.view') || can('calls.view') || can('reports.view');

  const [filter, setFilter] = useState<ConsumptionFilter>(EMPTY_CONSUMPTION_FILTER);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState<number | null>(null);
  const [countErr, setCountErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [msg, setMsg] = useState('');

  const set = (k: keyof ConsumptionFilter) => (v: string) =>
    setFilter((f) => ({ ...f, [k]: v }));

  // The count follows the filter, debounced — every keystroke would otherwise
  // be a round trip, and a count that lags the boxes is worse than none.
  const recount = useCallback(() => {
    if (!live) return;
    setCountErr(false);
    countConsumptionReport(filter)
      .then(setCount)
      .catch(() => { setCount(null); setCountErr(true); });
  }, [live, filter]);
  useEffect(() => { const t = setTimeout(recount, 350); return () => clearTimeout(t); }, [recount]);

  const toggle = (c: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(c)) n.delete(c); else n.add(c);
    return n;
  });

  const columns = exportColumns(picked);

  const download = async (kind: 'xlsx' | 'csv') => {
    setBusy(true); setDone(0); setMsg('');
    try {
      const rows = await listConsumptionReport(filter, setDone);
      if (!rows.length) { setMsg('Nothing matches that filter.'); return; }
      const shaped = rows.map((r) =>
        Object.fromEntries(columns.map((c) => [c, r[c] ?? ''])));
      const stamp = new Date().toISOString().slice(0, 10);

      if (kind === 'csv') {
        csvExport(`consumption-${stamp}.csv`, columns.map((c) => ({ key: c, header: c })), shaped);
      } else {
        xlsxDownload(`consumption-${stamp}.xlsx`, [
          { name: 'Consumption', columns, rows: shaped },
          // The scope, in the file. See the note at the top of this module.
          {
            name: 'Filter',
            columns: ['Item', 'Value'],
            rows: [
              { Item: 'Report', Value: 'Spare consumption' },
              { Item: 'Filter applied', Value: describeFilter(filter) },
              { Item: 'Rows', Value: rows.length },
              { Item: 'Columns', Value: `${columns.length} (${CONSUMPTION_MANDATORY.length} mandatory + ${columns.length - CONSUMPTION_MANDATORY.length} chosen)` },
              { Item: 'Downloaded', Value: new Date().toISOString() },
              { Item: '', Value: '' },
              { Item: 'A note on dates',
                Value: 'Visit Entry Date is when the register was told; Visit Date & Time is when the engineer was there. They differ, and both are here on purpose.' },
              { Item: 'A note on the visit',
                Value: 'A consumption line is booked against the CALL, not against one visit, so the two dates are the call’s LATEST visit. A call with no visit yet leaves them blank.' },
            ],
          },
        ]);
      }
      setMsg(`Downloaded ${rows.length.toLocaleString()} line${rows.length === 1 ? '' : 's'}, ${columns.length} columns.`);
      logAudit({ action: 'report.consumption', target: `${rows.length} lines`,
                 meta: { rows: rows.length, columns: columns.length, filter: describeFilter(filter) } });
    } catch (e) {
      setMsg(`Could not build the report: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  const F = (label: string, k: keyof ConsumptionFilter, type = 'text', placeholder = '') => (
    <div>
      <label className="field-label">{label}</label>
      <input
        className="input" type={type} value={filter[k]} placeholder={placeholder}
        onChange={(e) => set(k)(e.target.value)}
      />
    </div>
  );

  return (
    <div>
      {/* The count is EXACT — the database counted it, not the page — so it
          takes no "+". That is the project's rule for a count over partly-loaded
          data, and this one is not partly loaded. */}
      <PageHeader
        title="Spare Consumption" icon="🔩"
        subtitle="One row per spare booked, with its call and that call's latest visit around it."
        count={count ?? undefined} countMore={false}
      />
      {!live && (
        <div className="sheet-banner sheet-banner-error">
          <span>Not connected to the database — a report needs it.</span>
        </div>
      )}
      {msg && <div className="sheet-banner sheet-banner-info"><span>{msg}</span></div>}

      <SectionCard title="Spare Consumption">
        <p className="muted" style={{ marginTop: 0 }}>
          One row per spare booked, with its call and that call&rsquo;s latest visit around it.
          The filter runs <b>in the database</b>, so the count below is the whole answer and not
          just the first page.
        </p>

        <h4 style={{ margin: '4px 0 6px' }}>Filter</h4>
        <div className="sf-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {F('Call date from', 'from', 'date')}
          {F('Call date to', 'to', 'date')}
          {F('Product', 'product', 'text', 'e.g. MONNAL')}
          {F('Customer', 'party', 'text', 'contains')}
          {F('City', 'city', 'text', 'contains')}
          {F('Engineer', 'engineer', 'text', 'contains')}
          {F('Part (code or name)', 'part', 'text', 'e.g. MP-010 or SENSOR')}
          {F('UCN', 'ucn', 'text', 'contains')}
          <div>
            <label className="field-label">Call type</label>
            <SelectPicker value={filter.callType} onChange={(v) => set('callType')(v)}
              placeholder="All"
              options={[{ value: 'FIELD', label: 'Field' }, { value: 'INSTALL', label: 'Installation' },
                        { value: 'P M', label: 'PM' }]} />
          </div>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => setFilter(EMPTY_CONSUMPTION_FILTER)}>
            Clear the filter
          </button>
          <span className="muted" style={{ fontSize: 12.5 }}>{describeFilter(filter)}</span>
        </div>

        <h4 style={{ margin: '14px 0 6px' }}>
          Columns <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
            ({columns.length} of {CONSUMPTION_MANDATORY.length + CONSUMPTION_OPTIONAL.length})
          </span>
        </h4>
        <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
          The first {CONSUMPTION_MANDATORY.length} are the report&rsquo;s own format and are always
          included — shown here ticked and locked so it is clear they are a rule rather than an
          omission. Everything else is the rest of the consumption line and its call.
        </p>
        <div className="obj-cutoff-grid">
          {CONSUMPTION_MANDATORY.map((c) => (
            <label key={c} className="muted" style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked disabled readOnly />
              <b>{c}</b>
            </label>
          ))}
          {CONSUMPTION_OPTIONAL.map((c) => (
            <label key={c} style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={picked.has(c)} disabled={busy}
                     onChange={() => toggle(c)} />
              {c}
            </label>
          ))}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <button className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => setPicked(new Set(CONSUMPTION_OPTIONAL))}>
            Add every column
          </button>
          <button className="btn btn-ghost btn-sm" disabled={busy || picked.size === 0}
                  onClick={() => setPicked(new Set())}>
            Just the report format
          </button>
        </div>

        <div className="row" style={{ gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={!live || busy || !mayExport || count === 0}
                  onClick={() => void download('xlsx')}>
            {busy ? `Building… ${done.toLocaleString()} rows` : '⭳ Download Excel'}
          </button>
          <button className="btn" disabled={!live || busy || !mayExport || count === 0}
                  onClick={() => void download('csv')}>
            ⭳ CSV
          </button>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {countErr ? 'Could not count the matches — the download will still read them.'
              : count == null ? 'Counting…'
              : count === 0 ? 'Nothing matches that filter.'
              : `${count.toLocaleString()} line${count === 1 ? '' : 's'} match.`}
          </span>
        </div>
        {!mayExport && (
          <p className="muted" style={{ fontSize: 12.5 }}>
            Your role cannot read the consumption register, so there is nothing to export.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

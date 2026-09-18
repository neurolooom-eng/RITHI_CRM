import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { xlsxDownload, xlsxDate } from '../lib/xlsx';
import { csvExport } from '../lib/format';
import { logAudit } from '../lib/audit';
import { formatDayTime, excelSerial, hasClockTime } from '../lib/dates';
import './dccr.css';

// ===========================================================================
// ONE REPORT SCREEN, THREE REPORTS.
//
// The user, 2026-09-14: "Add Call Report , Customer Feedback Report -- Follow
// the Same concept of Consumption Report."
//
// "The same concept" is the reason this is a COMPONENT and not a third copy of
// that screen. The concept is four properties, and each of them is a thing that
// has to stay true on every report rather than on the one somebody remembered:
//
//   * THE FILTER RUNS IN THE DATABASE. It would be easier to fetch and then
//     narrow, and it would be wrong: every one of these registers pages, so a
//     browser-side filter reports on the first thousand rows and calls it the
//     answer. `count` asks the database how many match, so the button says what
//     it is ABOUT to export rather than what it has loaded.
//
//   * THE MANDATORY COLUMNS ARE SHOWN, TICKED AND DISABLED -- not hidden. A
//     column absent from a picker reads as an oversight; one that is visibly
//     locked reads as a rule, which is what it is.
//
//   * THE COLUMN ORDER IS THE VIEW'S, not the order they were clicked. A file
//     whose columns move between downloads is a file nobody can build a
//     formula against.
//
//   * THE FILE CARRIES ITS OWN SCOPE -- a second sheet naming the filter, the
//     column choice, the row count and the moment it was taken. A report whose
//     scope is not written down is one somebody will later mistake for the
//     whole register, and these files exist precisely to be sent to people who
//     were not there when they were made.
//
// Three copies of that would be three chances to lose one of them quietly.
// ===========================================================================

/** One box in the filter row. `select` takes its own options; everything else
 *  is an input of that type. */
export interface ReportFilterField<F> {
  key: keyof F & string;
  label: string;
  type?: 'text' | 'date' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface ReportSpec<F extends Record<string, string>> {
  /** Used for the file name and the audit line: `report.<key>`. */
  key: string;
  title: string;
  icon: string;
  /** One sentence, on the page header and again above the filter. */
  subtitle: string;
  /** What one ROW of this report is. Said out loud because it is the thing a
   *  reader most often assumes wrongly — "one row per call, never per visit". */
  rowMeaning: string;
  mandatory: string[];
  optional: string[];
  /** Optional columns that start TICKED. A starting point, not a rule — the
   *  reader can untick any of them, which is the whole difference between this
   *  and `mandatory`. Every entry must also be in `optional`, or it would be
   *  ticked here and dropped by `columns()` on the way out; `check:ui` refuses
   *  that, because a column that is ticked and absent from the file is the kind
   *  of wrong nobody looks for. */
  defaults?: string[];
  emptyFilter: F;
  fields: ReportFilterField<F>[];
  describe: (f: F) => string;
  columns: (picked: Set<string>) => string[];
  count: (f: F) => Promise<number>;
  list: (f: F, onProgress?: (n: number) => void) => Promise<Record<string, unknown>[]>;
  /** May this reader take the file at all? */
  mayExport: boolean;
  /** Extra `Item`/`Value` lines for the scope sheet — the notes that are about
   *  THIS report and would be wrong on another. */
  notes?: { Item: string; Value: string }[];
  /** Shown when the reader may not export. */
  deniedNote?: ReactNode;
  live: boolean;
}

export function ReportBuilder<F extends Record<string, string>>({ spec }: { spec: ReportSpec<F> }) {
  const [filter, setFilter] = useState<F>(spec.emptyFilter);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(spec.defaults ?? []));
  const [count, setCount] = useState<number | null>(null);
  const [countErr, setCountErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [msg, setMsg] = useState('');

  const set = (k: keyof F & string) => (v: string) =>
    setFilter((f) => ({ ...f, [k]: v }));

  // The count follows the filter, debounced — every keystroke would otherwise
  // be a round trip, and a count that lags the boxes is worse than none.
  const recount = useCallback(() => {
    if (!spec.live) return;
    setCountErr(false);
    spec.count(filter)
      .then(setCount)
      .catch(() => { setCount(null); setCountErr(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.live, filter]);
  useEffect(() => { const t = setTimeout(recount, 350); return () => clearTimeout(t); }, [recount]);

  // A report is rebuilt from scratch when the reader switches to another one,
  // so a filter typed for calls is never silently applied to feedback.
  useEffect(() => { setFilter(spec.emptyFilter); setPicked(new Set(spec.defaults ?? [])); setMsg(''); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec.key]);

  const toggle = (c: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(c)) n.delete(c); else n.add(c);
    return n;
  });

  const columns = spec.columns(picked);

  const download = async (kind: 'xlsx' | 'csv') => {
    setBusy(true); setDone(0); setMsg('');
    try {
      const rows = await spec.list(filter, setDone);
      if (!rows.length) { setMsg('Nothing matches that filter.'); return; }
      // SHAPED TO THE CHOSEN COLUMNS, in the view's order — and a missing value
      // becomes '' rather than "undefined", which is what a spreadsheet shows
      // when a key is absent.
      //
      // EVERY TIMESTAMP IS FORMATTED ON THE WAY OUT. The database hands back the
      // wire format — `2026-09-18T08:51:02.55+00:00` — and this file is opened
      // in Excel by somebody who wants a date, not an encoding. Reported
      // 2026-09-18 against the Consumption Report; it is fixed HERE rather than
      // there because all three reports share this download, and fixing one
      // would have left the other two carrying the same string.
      //
      // BY VALUE, NOT BY COLUMN NAME. The columns differ per report and change
      // with the picker, so a list of date-ish headings would be a list to
      // forget to update. `formatDayTime` recognises the ISO shape, anchored at
      // both ends, and returns anything else exactly as it arrived — a part
      // code, a UCN and a remark that begins with a date all survive it.
      //
      // THE TWO FORMATS WANT DIFFERENT THINGS, and giving both the same value
      // is what made the dates unusable. A CSV has only text, so it gets the
      // readable string. An .xlsx can hold a real DATE, and a string that looks
      // like one is text to Excel — it cannot be sorted into order, filtered by
      // month, subtracted from another, or given the reader's own Long Date
      // format, and every one of those quietly returns something rather than
      // refusing. Reported 2026-09-18, after the string itself was fixed.
      const asText = (v: unknown) => formatDayTime(v ?? '');
      const asCell = (v: unknown) => {
        // A NUMBER STAYS A NUMBER. The same argument as the dates below: a
        // spreadsheet cannot sort, sum or filter a number it was handed as
        // text, and each of those returns something WRONG rather than refusing
        // — Line ID sorts 1, 10, 100, 2, and SUM over QTY answers 0.
        // `typeof v === 'number'` is the whole test on purpose: PostgREST sends
        // the database's numeric columns as JSON numbers and its text columns
        // as strings, so this converts exactly the columns Postgres calls
        // numbers. Testing whether a STRING looks numeric would be the MP-010
        // mistake in the other direction — a Serial No, Call Number, Contract
        // No or UCN of all digits would lose its leading zeros and stop being
        // an identifier.
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        const serial = excelSerial(v ?? '');
        // Not a date — a part code, a UCN, a remark. Text, untouched.
        if (serial === null) return formatDayTime(v ?? '');
        return xlsxDate(serial, hasClockTime(v));
      };
      const shapedText = rows.map((r) =>
        Object.fromEntries(columns.map((c) => [c, asText(r[c])])));
      const shapedCells = rows.map((r) =>
        Object.fromEntries(columns.map((c) => [c, asCell(r[c])])));
      const stamp = new Date().toISOString().slice(0, 10);

      if (kind === 'csv') {
        csvExport(`${spec.key}-${stamp}.csv`, columns.map((c) => ({ key: c, header: c })), shapedText);
      } else {
        xlsxDownload(`${spec.key}-${stamp}.xlsx`, [
          { name: spec.title.slice(0, 28), columns, rows: shapedCells },
          {
            name: 'Filter',
            columns: ['Item', 'Value'],
            rows: [
              { Item: 'Report', Value: spec.title },
              { Item: 'One row is', Value: spec.rowMeaning },
              { Item: 'Filter applied', Value: spec.describe(filter) },
              { Item: 'Rows', Value: rows.length },
              { Item: 'Columns',
                Value: `${columns.length} (${spec.mandatory.length} mandatory + ${columns.length - spec.mandatory.length} chosen)` },
              // The sheet that travels with the file reads like the file.
              { Item: 'Downloaded', Value: formatDayTime(new Date().toISOString()) },
              ...(spec.notes?.length ? [{ Item: '', Value: '' }, ...spec.notes] : []),
            ],
          },
        ]);
      }
      setMsg(`Downloaded ${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'}, ${columns.length} columns.`);
      logAudit({ action: `report.${spec.key}`, target: `${rows.length} rows`,
                 meta: { rows: rows.length, columns: columns.length, filter: spec.describe(filter) } });
    } catch (e) {
      setMsg(`Could not build the report: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <div>
      {/* The count is EXACT — the database counted it, not the page — so it
          takes no "+". That is the project's rule for a count over
          partly-loaded data, and this one is not partly loaded. */}
      <PageHeader title={spec.title} icon={spec.icon} subtitle={spec.subtitle}
                  count={count ?? undefined} countMore={false} />
      {!spec.live && (
        <div className="sheet-banner sheet-banner-error">
          <span>Not connected to the database — a report needs it.</span>
        </div>
      )}
      {msg && <div className="sheet-banner sheet-banner-info"><span>{msg}</span></div>}

      <SectionCard title={spec.title}>
        <p className="muted" style={{ marginTop: 0 }}>
          {spec.rowMeaning} The filter runs <b>in the database</b>, so the count below is the
          whole answer and not just the first page.
        </p>

        <h4 style={{ margin: '4px 0 6px' }}>Filter</h4>
        <div className="sf-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {spec.fields.map((f) => (
            <div key={f.key}>
              <label className="field-label">{f.label}</label>
              {f.type === 'select' ? (
                <SelectPicker value={filter[f.key]} onChange={set(f.key)}
                              placeholder="All" options={f.options ?? []} />
              ) : (
                <input className="input" type={f.type ?? 'text'} value={filter[f.key]}
                       placeholder={f.placeholder ?? ''}
                       onChange={(e) => set(f.key)(e.target.value)} />
              )}
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => setFilter(spec.emptyFilter)}>
            Clear the filter
          </button>
          <span className="muted" style={{ fontSize: 12.5 }}>{spec.describe(filter)}</span>
        </div>

        <h4 style={{ margin: '14px 0 6px' }}>
          Columns <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
            ({columns.length} of {spec.mandatory.length + spec.optional.length})
          </span>
        </h4>
        <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
          The first {spec.mandatory.length} are the report&rsquo;s own format and are always
          included — shown here ticked and locked so it is clear they are a rule rather than an
          omission.
        </p>
        {!!spec.defaults?.length && (
          <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
            {spec.defaults.join(', ')} {spec.defaults.length === 1 ? 'is' : 'are'} ticked to start
            with. Untick {spec.defaults.length === 1 ? 'it' : 'any of them'} if you do not want
            {spec.defaults.length === 1 ? ' it' : ' them'} — unlike the {spec.mandatory.length}{' '}
            above, {spec.defaults.length === 1 ? 'it is' : 'they are'} a starting point rather than
            a rule.
          </p>
        )}
        <div className="obj-cutoff-grid">
          {spec.mandatory.map((c) => (
            <label key={c} className="muted" style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked disabled readOnly />
              <b>{c}</b>
            </label>
          ))}
          {spec.optional.map((c) => (
            <label key={c} style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={picked.has(c)} disabled={busy}
                     onChange={() => toggle(c)} />
              {c}
            </label>
          ))}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <button className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => setPicked(new Set(spec.optional))}>
            Add every column
          </button>
          <button className="btn btn-ghost btn-sm" disabled={busy || picked.size === 0}
                  onClick={() => setPicked(new Set())}>
            Just the report format
          </button>
          {!!spec.defaults?.length && (
            <button className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={() => setPicked(new Set(spec.defaults ?? []))}>
              Back to the default columns
            </button>
          )}
        </div>

        <div className="row" style={{ gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary"
                  disabled={!spec.live || busy || !spec.mayExport || count === 0}
                  onClick={() => void download('xlsx')}>
            {busy ? `Building… ${done.toLocaleString()} rows` : '⭳ Download Excel'}
          </button>
          <button className="btn" disabled={!spec.live || busy || !spec.mayExport || count === 0}
                  onClick={() => void download('csv')}>
            ⭳ CSV
          </button>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {countErr ? 'Could not count the matches — the download will still read them.'
              : count == null ? 'Counting…'
              : count === 0 ? 'Nothing matches that filter.'
              : `${count.toLocaleString()} row${count === 1 ? '' : 's'} match.`}
          </span>
        </div>
        {!spec.mayExport && spec.deniedNote}
      </SectionCard>
    </div>
  );
}

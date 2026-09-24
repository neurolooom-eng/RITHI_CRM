import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, fmtLongDate } from '../lib/format';
import { xlsxDownload, xlsxCell, xlsxText } from '../lib/xlsx';
import { xlsDownload } from '../lib/xls';
import { logAudit } from '../lib/audit';
import { formatDayTime } from '../lib/dates';
import { listHandstockBalance, supabaseConfigured } from '../lib/supabase';
import { loadFailure } from '../lib/dberror';
import { useAuth } from '../lib/auth';
import { seesEveryRecord } from '../lib/rbac';
import { HANDSTOCK_REPORT_COLUMNS, handStockFileName, isLastPage } from '../lib/handstockreport';
import { COMPLETE, partial } from '../lib/exportscope';

// ===========================================================================
// HAND STOCK REPORT — every engineer's stock, whole, and only then downloadable.
//
//   The user, 2026-09-24: "Add a Hand Stock Report - Default access to
//   Admin/Super Admin, Rest of the Access I will select from Roles &
//   Permissions. Add this under Reports. ... Default Load as to be 1000 and
//   Auto Load till all the data is displayed and then Enable Download."
//
// IT READS `handstock_balance`, THE SAME VIEW THE HAND STOCK REGISTER READS.
// Hand stock is DERIVED and never stored — issued − consumed ± transfers −
// returns — so a report with a query of its own could disagree with the screen
// people work from, and the two disagreeing about a stock figure is the one
// outcome worth ruling out by construction.
//
// THE DOWNLOAD IS REFUSED UNTIL EVERY PAGE IS IN, which is the user's own
// instruction and is the right rule for this file in particular. A hand-stock
// export is RECONCILED AGAINST: a partial one is not a shorter answer but a
// WRONG one — parts read as missing and balances as short, with nothing in the
// file saying so. Elsewhere this project makes a partial count honest with a
// `+`; there is no `+` for a spreadsheet somebody is subtracting from.
//
// THE PAGES ARE 1,000, WHICH IS NOT A PREFERENCE. PostgREST caps a response at
// a thousand rows however large the range asked for, so a bigger page is not a
// bigger request — it is the line that HIDES the truncation. The loop stops on
// a SHORT page, because a full one says nothing about whether a next one
// exists.
//
// WHAT A READER IS SHOWN IS NOT WHAT EXISTS, and the view is
// `security_invoker`: an engineer granted this screen sees their own stock and
// nobody else's. The subtitle says which of the two it is rather than letting a
// short report read as the company's.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

const PAGE = 1000;
// A GUARD, NOT A LIMIT. The loop ends on a short page; this only stops a
// runaway from asking for ever if the server ever answered a full page to an
// exhausted range. 500 pages is half a million balance lines.
const MAX_PAGES = 500;

const num = (v: unknown) => (v == null || v === '' ? '' : String(v));
const when = (v: unknown) => (v ? formatDayTime(v) : '');

const COLUMNS: Column<Row>[] = [
  { key: 'engineer', header: 'Engineer', width: 170 },
  { key: 'part_code', header: 'Part Code', width: 110, wrap: false },
  { key: 'part', header: 'Part', width: 260 },
  { key: 'opening', header: 'Opening', width: 80, wrap: false, render: (r) => num(r.opening) },
  { key: 'stock_out', header: 'Stock Out', width: 90, wrap: false, render: (r) => num(r.stock_out) },
  { key: 'consumed', header: 'Consumed', width: 90, wrap: false, render: (r) => num(r.consumed) },
  { key: 'transferred_in', header: 'Trf In', width: 75, wrap: false, render: (r) => num(r.transferred_in) },
  { key: 'transferred_out', header: 'Trf Out', width: 80, wrap: false, render: (r) => num(r.transferred_out) },
  { key: 'returned', header: 'Returned', width: 85, wrap: false, render: (r) => num(r.returned) },
  { key: 'on_hand', header: 'On Hand', width: 85, wrap: false,
    // THE ONE FIGURE PEOPLE ACT ON, so it is the one that is emphasised — and a
    // NEGATIVE balance is a finding rather than a rounding error: it means more
    // was consumed than this system knows was issued.
    // A NEGATIVE BALANCE IS A FINDING, not a rounding error: more was consumed
    // than this system knows was issued. Inverted against the page rather than
    // tinted -- "highlight" means CONTRAST here (the user's standing rule), and
    // a pale wash of an accent colour does not read on screen.
    render: (r) => (Number(r.on_hand) < 0
      ? <b style={{ background: 'var(--text)', color: 'var(--surface)', padding: '0 4px', borderRadius: 3 }}>{num(r.on_hand)}</b>
      : <b>{num(r.on_hand)}</b>) },
  { key: 'last_movement', header: 'Last Movement', width: 155, render: (r) => when(r.last_movement) },
];

export function HandStockReport() {
  const { user, can } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  // A RUN TOKEN, so a Refresh pressed mid-load cannot have the old loop append
  // its remaining pages underneath the new one's. Without it the table ends up
  // holding two overlapping reads and the row count is a number that never
  // existed.
  const run = useRef(0);

  const everyone = seesEveryRecord(user, can);

  const load = async () => {
    if (!supabaseConfigured()) return;
    const mine = ++run.current;
    setLoading(true); setComplete(false); setErr(null); setRows([]);
    const all: Row[] = [];
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const batch = await listHandstockBalance(PAGE, page * PAGE, '');
        if (run.current !== mine) return;          // a newer load owns the screen
        batch.forEach((b, i) => all.push({
          ...b,
          // engineer_key|part_code IS the row, and it is what the view groups
          // by — a positional id would change under the next sort and take the
          // table's row identity with it.
          id: `${String(b.engineer_key ?? '')}|${String(b.part_code ?? '')}|${page * PAGE + i}`,
        } as Row));
        // THE FIRST PAGE IS SHOWN IMMEDIATELY and each one after it as it
        // lands: "auto load till all the data is displayed" is a thing to
        // WATCH happening, not a spinner over an empty screen.
        setRows([...all]);
        if (isLastPage(batch.length, PAGE)) break;
      }
      if (run.current === mine) setComplete(true);
    } catch (e) {
      if (run.current !== mine) return;
      setErr(loadFailure(e, {
        tables: ['handstock_balance', 'handstock_movements'],
        hint: 'The hand-stock views are not on this project yet — run supabase/apply/handstock.sql in the Supabase SQL editor.',
      }));
    } finally {
      if (run.current === mine) setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // SEARCHED IN THE BROWSER, and only because everything is already here. A
  // server-side search would be the right answer for a paged screen and is the
  // wrong one for a report that has, by the time you can type into it, loaded
  // every row.
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => `${r.engineer} ${r.engineer_email} ${r.part_code} ${r.part}`
      .toLowerCase().includes(s));
  }, [rows, q]);

  const scope = [
    everyone ? 'every engineer' : 'your own stock only',
    q.trim() ? `search: ${q.trim()}` : 'no search filter',
  ].join(' · ');

  const download = (kind: 'csv' | 'xlsx' | 'xls') => {
    // BELT AND BRACES. The buttons are disabled until the load finishes; this
    // is the same rule stated where the file is actually written, because a
    // disabled button is a UI fact and this is a correctness one.
    if (!complete || !visible.length) return;
    const name = handStockFileName(kind);
    const cols = HANDSTOCK_REPORT_COLUMNS;

    if (kind === 'csv') {
      // A CSV CAN ONLY CARRY TEXT, so the timestamps go out as
      // dd-MMM-yyyy HH:mm:ss rather than the ISO string the API sent.
      csvExport(name, cols,
        visible.map((r) => Object.fromEntries(cols.map((c) => [c.key, xlsxText(r[c.key])]))), COMPLETE);
    } else {
      const sheet = {
        name: 'Hand Stock',
        columns: cols.map((c) => c.header),
        rows: visible.map((r) => Object.fromEntries(cols.map((c) => [c.header, xlsxCell(r[c.key])]))),
      };
      // THE FILE CARRIES ITS OWN SCOPE. A stock report whose filter is not
      // written down is one somebody later reconciles against believing it was
      // the whole company.
      const about = {
        name: 'About',
        columns: ['Item', 'Value'],
        rows: [
          { Item: 'Report', Value: 'Hand Stock' },
          { Item: 'What it is', Value: 'Every engineer’s hand stock, netted per part: opening + stock out + transfers in − consumed − transfers out − returned.' },
          { Item: 'Derived, not stored', Value: 'There is no hand-stock table. These figures are computed from the movements, so this file and the Hand Stock screen cannot disagree.' },
          { Item: 'Completeness', Value: 'Every page was loaded before this file could be written — the download is refused while rows are still coming.' },
          { Item: 'Scope', Value: scope },
          { Item: 'Rows', Value: String(visible.length) },
          { Item: 'Taken', Value: fmtLongDate(new Date().toISOString()) },
        ],
      };
      if (kind === 'xlsx') xlsxDownload(name, [sheet, about], COMPLETE);
      else xlsDownload(name, [sheet, about], COMPLETE);
    }
    logAudit({ action: 'report.handstock', meta: { rows: visible.length, scope, kind, file: name } });
  };

  const btn = (kind: 'csv' | 'xlsx' | 'xls', label: string, title: string) => (
    <button className="btn btn-sm" disabled={!complete || !visible.length}
            title={complete ? title : 'Still loading every row — the download opens when the whole report is in.'}
            onClick={() => download(kind)}>⭳ {label}</button>
  );

  return (
    <div>
      <PageHeader
        title="Hand Stock Report" icon="📦"
        subtitle={everyone
          ? 'Every engineer’s hand stock, netted per part. Loads in full before it can be downloaded.'
          : 'Your hand stock, netted per part. Your role is shown its own stock, so this is not the whole company.'}
        count={visible.length}
        // A COUNT OVER PARTLY-LOADED DATA IS A LOWER BOUND and must say so.
        // Once every page is in it is exact, and a `+` would then be wrong in
        // the other direction.
        countMore={!complete}
        onRefresh={() => void load()} refreshing={loading}
        actions={<>{btn('csv', 'CSV', 'Comma-separated — dates as dd-MMM-yyyy HH:mm:ss')}
                   {btn('xlsx', 'Excel (.xlsx)', 'Numbers stay numbers and dates stay dates')}
                   {btn('xls', 'Excel (.xls)', 'Excel 2003 XML. Excel may say the format and the extension do not match — it opens correctly after that. Prefer .xlsx.')}</>} />

      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}

      {!err && loading && (
        <div className="sheet-banner sheet-banner-info">
          <span>Loading every line — {visible.length.toLocaleString()} so far. The download opens when the whole report is in.</span>
        </div>
      )}

      {!err && complete && rows.length === 0 && (
        <div className="sheet-banner sheet-banner-ok">
          <span>{everyone
            ? 'No engineer is holding any hand stock.'
            : 'You are not holding any hand stock.'}</span>
        </div>
      )}

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Engineer, part code or part" />
        <div className="spacer" />
        <span className="muted">
          {complete
            ? `${rows.length.toLocaleString()} line${rows.length === 1 ? '' : 's'}, complete`
            : `${rows.length.toLocaleString()} loaded…`}
        </span>
      </Toolbar>

      <DataTable<Row>
        columns={COLUMNS}
        rows={visible}
        getRowId={(r) => r.id}
        storageKey="handstockReport"
        rowsBeforeScroll={16}
        emptyText={loading ? 'Loading…' : 'No hand stock matches.'} />
    </div>
  );
}

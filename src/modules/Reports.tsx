import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar } from '../components/ui/ui';
import { csvExport, fmtLongDate, timeAgo } from '../lib/format';
import { xlsxDownload, xlsxCell, xlsxText } from '../lib/xlsx';
import { queryReports, supabaseConfigured, type ReportFilter } from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { ReportDetail } from './ReportDetail';
import { REPORT_FIELD_KEYS } from './CallReporting';
import { Ucn } from '../lib/callstate';
import { manualReportLink } from '../lib/reports';
import { DocPreview } from '../components/doc/DocPreview';
import { partial } from '../lib/exportscope';

// ===========================================================================
// VISIT REPORTS / SERVICE REPORTS — the visit history, one row per visit.
//
// The menu says both names because the business does (the user, 2026-09-08):
// the engineer files a "service report" and the register holds it as a visit.
//
// This is a REGISTER — rows to look through, search and open. The EXPORTS live
// on Reports (/exports); the consumption report sat here briefly and moved
// there when that screen was created, because "a place you browse" and "a place
// you leave with a file" are different screens and mixing them made both worse.
//
// Local browser cache + last-sync + 30-min auto/force sync; field filters
// (UCN / Call Number / Engineer / Status) query the server live.
// ===========================================================================

const CACHE_KEY = 'reports';
const PAGE = 1000;
type Row = Record<string, unknown> & { id: string };
const j = (r: Row, k: string) => String(((r.data as Record<string, unknown>) ?? {})[k] ?? '');

const COLUMNS: Column<Row>[] = [
  { key: 'visit_at', header: 'Visit Date', width: 130, render: (r) => fmtLongDate(r.visit_at) },
  { key: 'ucn', header: 'UCN', width: 130, wrap: false, render: (r) => <Ucn ucn={r.ucn} state={r.call_status} /> },
  { key: 'call_number', header: 'Call Number', width: 170 },
  { key: 'call_status', header: 'Status', width: 180 },
  { key: 'engineer', header: 'Engineer', width: 160 },
  { key: 'pending_reason', header: 'Pending Reason', width: 180 },
  { key: '_job', header: 'Job Done', width: 320, render: (r) => j(r, 'Job Done') || j(r, 'Complaint Observation') },
];

// Placed on the base list too, so the column behaves the same whether a reader
// turned on `manual_report` or the report form's own `Manual Report` field.
// ===========================================================================
// EVERY COLUMN THE VISIT ACTUALLY CARRIES (the user, 2026-09-21: "I need to be
// able to Export all Columns from Visit Entry / Report").
//
// The export wrote SIX hard-coded columns -- the ones the grid happens to show
// -- while each row carries far more: `toRows` FLATTENS the report's `data`
// jsonb up onto the row, so every question the engineer answered is already
// there, plus the stored columns the grid has no room for (engineer_email, the
// entry date, the uid, the bulk-mapping source_ref, the attachment).
// Those are exactly the fields somebody exporting a visit report wants, and
// they were the ones being dropped.
//
// TAKEN FROM THE ROWS RATHER THAN A LIST, because the answers differ per visit
// -- an installation is asked different questions from a breakdown -- so a
// fixed list is either short for one kind or full of blanks for the other. A
// column the loaded rows do not have is not invented, and one they do have is
// never silently left out. THE SAME FAULT AS A REPORT'S TWO LISTS (reports.ts)
// and it is avoided here by not having a list at all.
//
// `data` ITSELF IS EXCLUDED: it is the raw blob and every one of its keys is
// already a column of its own, so exporting it would repeat the whole visit in
// one unreadable cell. `id` and the grid's private `_` keys go too.
const EXPORT_FIRST = ['visit_at', 'updated_at', 'ucn', 'call_number', 'call_status',
                      'pending_reason', 'engineer', 'engineer_email', 'manual_report',
                      'uid', 'source_ref', 'mapped_at'];
const EXPORT_HEADERS: Record<string, string> = {
  visit_at: 'Visit Date & Time', updated_at: 'Visit Entry Date', ucn: 'UCN',
  call_number: 'Call Number', call_status: 'Call Status', pending_reason: 'Call Pending Reason',
  engineer: 'Visiting Service Engineer', engineer_email: 'Email ID',
  manual_report: 'Service Report', uid: 'Row ID', source_ref: 'Source Ref', mapped_at: 'Mapped At',
};
function exportColumns(rows: Record<string, unknown>[]): { key: string; header: string }[] {
  const seen = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => {
    if (k === 'data' || k === 'id' || k.startsWith('_')) return;
    seen.add(k);
  }));
  // The stored columns first, in the order the upload names them, then every
  // answer the engineer filled -- alphabetical, so two exports of the same
  // register put the same column in the same place.
  const known = EXPORT_FIRST.filter((k) => seen.has(k));
  const rest = [...seen].filter((k) => !EXPORT_FIRST.includes(k)).sort((a, b) => a.localeCompare(b));
  return [...known, ...rest].map((key) => ({ key, header: EXPORT_HEADERS[key] ?? key }));
}

const REPORT_KEYS = ['manual_report', 'Manual Report'];

// Flatten the report's `data` jsonb up to the row so every field the engineer
// filled is available as a column (⚙ Columns) and searchable; `data` is kept
// for the detail drawer.
const toRows = (data: Record<string, unknown>[], base: number): Row[] => data.map((p, i) => ({
  ...((p.data as Record<string, unknown>) ?? {}),
  ...p,
  id: String(p.uid ?? p.id ?? base + i),
} as Row));

export function Reports() {
  const cached = loadCache<Row>(CACHE_KEY);
  const [filter, setFilter] = useState<ReportFilter>({ ucn: '', callNumber: '', engineer: '', status: '' });
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [offset, setOffset] = useState(cached?.rows.length ?? 0);
  const [more, setMore] = useState((cached?.rows.length ?? 0) >= PAGE);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load reports.' },
  );
  const set = (k: keyof ReportFilter, v: string) => setFilter((c) => ({ ...c, [k]: v }));
  const hasFilter = !!(filter.ucn || filter.callNumber || filter.engineer || filter.status);

  // EVERY COLUMN, BOTH FORMATS. A DOWNLOAD IS NOT THE WIRE: the dates go out as
  // real Excel dates (a number plus a format, so they sort and filter by month)
  // and as dd-MMM-yyyy HH:mm:ss in the CSV, which is all a CSV can carry.
  // Shaped by the one helper every export here uses.
  const downloadVisits = (kind: 'xlsx' | 'csv') => {
    const src = rows as unknown as Record<string, unknown>[];
    if (!src.length) return;
    const cols = exportColumns(src);
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = hasFilter
      ? [filter.ucn && `UCN ${filter.ucn}`, filter.callNumber && `call ${filter.callNumber}`,
         filter.engineer && `engineer ${filter.engineer}`, filter.status && `status ${filter.status}`]
        .filter(Boolean).join(' · ')
      : 'every visit loaded';
    if (kind === 'csv') {
      csvExport(`visit-reports-${stamp}.csv`, cols, /* scope below */
        src.map((r) => Object.fromEntries(cols.map((c) => [c.key, xlsxText(r[c.key])]))), partial(more));
      return;
    }
    xlsxDownload(`visit-reports-${stamp}.xlsx`, [
      { name: 'Visit Reports',
        columns: cols.map((c) => c.header),
        rows: src.map((r) => Object.fromEntries(cols.map((c) => [c.header, xlsxCell(r[c.key])]))) },
      { name: 'About',
        columns: ['Item', 'Value'],
        rows: [
          { Item: 'Report', Value: 'Visit Reports / Service Reports' },
          { Item: 'Columns', Value: `${cols.length} — every field these visits carry, including the answers on the visit form` },
          { Item: 'Why the count varies', Value: 'An installation is asked different questions from a breakdown, so the columns come from the visits loaded rather than from a fixed list.' },
          { Item: 'Scope of this file', Value: scope },
          { Item: 'Rows', Value: String(src.length) },
          { Item: 'Loaded so far', Value: more ? 'More visits are available — press Load more before exporting for the whole register.' : 'This is every visit matching the filter.' },
          { Item: 'Taken', Value: fmtLongDate(new Date().toISOString()) },
        ] },
    ], partial(more));
  };

  const refresh = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true);
    try {
      const data = await queryReports({}, 0, PAGE);
      const r = toRows(data, 0);
      setRows(r); setOffset(r.length); setMore(r.length === PAGE);
      setLastSync(saveCache(CACHE_KEY, r));
      setMsg({ tone: 'ok', text: `Synced ${r.length}${r.length === PAGE ? '+' : ''} report visits.` });
    } catch (e) {
      setMsg({ tone: 'error', text: `Sync failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return; mounted.current = true;
    if (!supabaseConfigured()) return;
    if (!rows.length || isStale(lastSync)) void refresh();
    else setMsg({ tone: 'info', text: `Showing cached data — synced ${timeAgo(lastSync)}. ↻ Refresh to update.` });
    const id = window.setInterval(() => { if (!hasFilter) void refresh(); }, SYNC_TTL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted.current || !supabaseConfigured()) return;
    if (!hasFilter) {
      const c = loadCache<Row>(CACHE_KEY);
      if (c) { setRows(c.rows); setOffset(c.rows.length); setMore(c.rows.length >= PAGE); setLastSync(c.at); }
      return;
    }
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const data = await queryReports(filter, 0, PAGE);
        setRows(toRows(data, 0)); setOffset(data.length); setMore(data.length === PAGE);
        setMsg({ tone: 'ok', text: `${data.length}${data.length === PAGE ? '+' : ''} visits matched (live).` });
      } catch (e) {
        setMsg({ tone: 'error', text: `Search failed: ${e instanceof Error ? e.message : String(e)}` });
      } finally { setBusy(false); }
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.ucn, filter.callNumber, filter.engineer, filter.status]);

  const loadMore = async () => {
    setBusy(true);
    try {
      const data = await queryReports(hasFilter ? filter : {}, offset, PAGE);
      const merged = [...rows, ...toRows(data, rows.length)];
      setRows(merged); setOffset(offset + data.length); setMore(data.length === PAGE);
      if (!hasFilter) setLastSync(saveCache(CACHE_KEY, merged));
    } catch (e) {
      setMsg({ tone: 'error', text: `Load more failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  const [detail, setDetail] = useState<Row | null>(null);
  const [docFor, setDocFor] = useState<Row | null>(null);

  // THE REPORT IS A BUTTON, NOT ITS ADDRESS. The Drive link was rendering as
  // raw text — a 90-character URL wrapping over five lines, which made every
  // row of the register four times taller than it needed to be and still could
  // not be clicked. The register's own rules apply: a cell is one line, and
  // what you do with the thing in it is a control.
  //
  // BOTH KEYS, because the value is on the row twice: `manual_report` is the
  // column, `Manual Report` is the report form's own field inside `data`, and
  // which one a reader has turned on is their business. `manualReportLink`
  // reads either and returns '' for anything that is not a URL, so a note typed
  // into the box does not become a dead link.
  const reportCell = (r: Row) => {
    const url = manualReportLink(r);
    if (!url) return <span className="muted">—</span>;
    return (
      <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <button type="button" className="svc-report-link"
                onClick={(e) => { e.stopPropagation(); setDocFor(r); }}
                title="Show the signed service report">📄 Show</button>
        <a className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }} href={url}
           target="_blank" rel="noreferrer"
           onClick={(e) => e.stopPropagation()}>Open in Drive ↗</a>
      </span>
    );
  };

  // Every report field is offered as a toggleable column (⚙), discovered from
  // the data jsonb, on top of the default columns.
  const allFields = useMemo(() => {
    const base = COLUMNS.filter((c) => !c.key.startsWith('_'))
      .map((c) => ({ key: c.key, header: c.header })) as { key: string; header: string; render?: (r: Row) => ReactNode }[];
    const seen = new Set(base.map((b) => b.key));
    const extra: { key: string; header: string; render?: (r: Row) => ReactNode }[] = [];
    const isReport = (k: string) => /manual\s*report/i.test(k);
    const add = (k: string) => {
      if (!k || seen.has(k)) return;
      seen.add(k);
      extra.push(isReport(k) ? { key: k, header: k, render: reportCell } : { key: k, header: k });
    };
    // Start from the full report schema so EVERY report field is offered as a
    // column, even when the loaded rows didn't fill it (nothing is trimmed to
    // just what the current page happens to contain)…
    REPORT_FIELD_KEYS.forEach(add);
    REPORT_KEYS.forEach(add);
    // …then add any further keys actually present in the data (custom / legacy).
    rows.forEach((r) => {
      const d = (r.data as Record<string, unknown>) ?? {};
      Object.keys(d).forEach(add);
    });
    return [...base, ...extra];
  }, [rows]);

  return (
    <div>
      <PageHeader
        onRefresh={() => void refresh()}
        refreshing={busy}
        syncedAt={lastSync} title="Visit Reports" subtitle="Every call report an engineer has filed — one row per visit, cached locally and synced from the database." icon="🗒️" count={rows.length} countMore={more} />
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      <DataTable<Row>
        columns={COLUMNS}
        allFields={allFields}
        rows={rows}
        getRowId={(r) => r.id}
        storageKey="reportsView"
        rowsBeforeScroll={16}
        dense
        onRowClick={(r) => setDetail(r)}
        onLoadMore={loadMore}
        moreAvailable={more}
        loadingMore={busy}
        emptyText={busy ? 'Loading…' : 'No report visits.'}
        toolbar={
          <Toolbar>
            <div className="call-search">
              <input className="input" placeholder="UCN" value={filter.ucn} onChange={(e) => set('ucn', e.target.value)} />
              <input className="input" placeholder="Call Number" value={filter.callNumber} onChange={(e) => set('callNumber', e.target.value)} />
              <input className="input" placeholder="Engineer" value={filter.engineer} onChange={(e) => set('engineer', e.target.value)} />
              <input className="input" placeholder="Status" value={filter.status} onChange={(e) => set('status', e.target.value)} />
            </div>
            <div className="spacer" />
            {rows.length > 0 && (
              <>
                <button className="btn btn-sm" onClick={() => downloadVisits('xlsx')}>⭳ Excel</button>
                <button className="btn btn-sm" onClick={() => downloadVisits('csv')}>⭳ CSV</button>
              </>
            )}
          </Toolbar>
        }
      />
      {detail && <ReportDetail report={detail} onClose={() => setDetail(null)} />}
      {docFor && (
        <DocPreview
          url={manualReportLink(docFor)}
          title={`Service Report — ${String(docFor.ucn ?? docFor.call_number ?? '')}`}
          subtitle={[fmtLongDate(docFor.visit_at), String(docFor.engineer ?? ''), String(docFor.call_status ?? '')]
            .filter(Boolean).join(' · ')}
          onClose={() => setDocFor(null)}
        />
      )}
    </div>
  );
}

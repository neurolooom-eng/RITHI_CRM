import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar } from '../components/ui/ui';
import { csvExport, fmtLongDate, timeAgo } from '../lib/format';
import { queryReports, supabaseConfigured, type ReportFilter } from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { ReportDetail } from './ReportDetail';
import { REPORT_FIELD_KEYS } from './CallReporting';

// ===========================================================================
// REPORTS — the visit history (one row per visit) from the Supabase `reports`
// table. Local browser cache + last-sync + 30-min auto/force sync; field
// filters (UCN / Call Number / Engineer / Status) query the server live.
// ===========================================================================

const CACHE_KEY = 'reports';
const PAGE = 1000;
type Row = Record<string, unknown> & { id: string };
const j = (r: Row, k: string) => String(((r.data as Record<string, unknown>) ?? {})[k] ?? '');

const COLUMNS: Column<Row>[] = [
  { key: 'visit_at', header: 'Visit Date', width: 130, render: (r) => fmtLongDate(r.visit_at) },
  { key: 'ucn', header: 'UCN', width: 120, wrap: false },
  { key: 'call_number', header: 'Call Number', width: 170 },
  { key: 'call_status', header: 'Status', width: 180 },
  { key: 'engineer', header: 'Engineer', width: 160 },
  { key: 'pending_reason', header: 'Pending Reason', width: 180 },
  { key: '_job', header: 'Job Done', width: 320, render: (r) => j(r, 'Job Done') || j(r, 'Complaint Observation') },
];

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

  // Every report field is offered as a toggleable column (⚙), discovered from
  // the data jsonb, on top of the default columns.
  const allFields = useMemo(() => {
    const base = COLUMNS.filter((c) => !c.key.startsWith('_')).map((c) => ({ key: c.key, header: c.header }));
    const seen = new Set(base.map((b) => b.key));
    const extra: { key: string; header: string }[] = [];
    const add = (k: string) => { if (k && !seen.has(k)) { seen.add(k); extra.push({ key: k, header: k }); } };
    // Start from the full report schema so EVERY report field is offered as a
    // column, even when the loaded rows didn't fill it (nothing is trimmed to
    // just what the current page happens to contain)…
    REPORT_FIELD_KEYS.forEach(add);
    // …then add any further keys actually present in the data (custom / legacy).
    rows.forEach((r) => {
      const d = (r.data as Record<string, unknown>) ?? {};
      Object.keys(d).forEach(add);
    });
    return [...base, ...extra];
  }, [rows]);

  return (
    <div>
      <PageHeader title="Reports" subtitle="Visit history — every call report, cached locally and synced from the database." icon="🗒️" count={rows.length} countMore={more} />
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
            <button className="btn btn-sm" onClick={() => void refresh()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off" title={`Last synced ${new Date(lastSync).toLocaleString()}`}>⟳ {timeAgo(lastSync)}</span>}
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('reports.csv', COLUMNS.filter((c) => !c.key.startsWith('_')).map((c) => ({ key: c.key, header: c.header })), rows as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />
      {detail && <ReportDetail report={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

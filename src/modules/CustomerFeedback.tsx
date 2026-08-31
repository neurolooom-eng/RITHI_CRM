import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, fmtLongDate, timeAgo } from '../lib/format';
import { listFeedbackRows, supabaseConfigured } from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { useAccessScope } from '../lib/access';
import './fieldcalls.css';

// ===========================================================================
// CUSTOMER FEEDBACK — the structured feedback captured on each call report,
// live from the Supabase `feedback` table (was reading the emptied demo
// collection, hence blank). Role-scoped by the engineer on the feedback.
// ===========================================================================

const CACHE_KEY = 'customerFeedback';
type Row = Record<string, unknown> & { id: string };
const g = (r: Record<string, unknown>, k: string) => String(r[k] ?? '');

const COLS = [
  { key: 'created_at', header: 'Date' },
  { key: 'call_number', header: 'Call Number' },
  { key: 'ucn', header: 'UCN' },
  { key: 'party_name', header: 'Party' },
  { key: 'product_name', header: 'Product' },
  { key: 'engineer', header: 'Engineer' },
  { key: 'answers_summary', header: 'Feedback' },
];

export function CustomerFeedback() {
  const scope = useAccessScope();
  const onDb = supabaseConfigured();
  const cached = onDb ? loadCache<Row>(CACHE_KEY) : null;
  const PAGE = 1000;
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [offset, setOffset] = useState(cached?.rows.length ?? 0);
  const [more, setMore] = useState((cached?.rows.length ?? 0) >= PAGE);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    onDb ? null : { tone: 'info', text: 'Connect the database in Settings to load customer feedback.' },
  );

  const load = async () => {
    if (!onDb) return;
    setBusy(true); setMsg({ tone: 'info', text: 'Loading customer feedback…' });
    try {
      const r = await listFeedbackRows(PAGE, 0);
      const mapped = r.map((x, i) => ({ ...x, id: `${g(x, 'call_number')}-${i}` } as Row));
      setRows(mapped); setOffset(mapped.length); setMore(r.length === PAGE); setLastSync(saveCache(CACHE_KEY, mapped));
      setMsg({ tone: mapped.length ? 'ok' : 'info', text: mapped.length ? `Synced ${mapped.length} feedback records.` : 'No customer feedback recorded yet.' });
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };
  useEffect(() => {
    if (onDb && rows.length && !isStale(lastSync)) setMsg({ tone: 'info', text: `Showing cached data — synced ${timeAgo(lastSync)}. ↻ Refresh to update.` });
    else void load();
    const id = onDb ? window.setInterval(() => void load(), SYNC_TTL_MS) : undefined;
    return () => { if (id) window.clearInterval(id); };
    // eslint-disable-next-line
  }, []);

  const loadMore = async () => {
    setBusy(true);
    try {
      const r = await listFeedbackRows(PAGE, offset);
      const mapped = r.map((x, i) => ({ ...x, id: `${g(x, 'call_number')}-${offset + i}` } as Row));
      const merged = [...rows, ...mapped];
      setRows(merged); setOffset(offset + r.length); setMore(r.length === PAGE); setLastSync(saveCache(CACHE_KEY, merged));
    } catch (e) { setMsg({ tone: 'error', text: `Load more failed: ${e instanceof Error ? e.message : String(e)}` }); } finally { setBusy(false); }
  };

  // Role scope: engineers/RMs see feedback tied to their own calls.
  const scoped = useMemo(() => {
    if (scope.all) return rows;
    return rows.filter((r) => scope.names.has(g(r, 'engineer').trim().toLowerCase()));
  }, [rows, scope]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((r) => COLS.some((c) => g(r, c.key).toLowerCase().includes(q)) || g(r, 'complaint').toLowerCase().includes(q));
  }, [scoped, search]);

  const columns: Column<Row>[] = COLS.map((c) => ({
    key: c.key, header: c.header, width: c.key === 'answers_summary' ? 320 : c.key === 'created_at' ? 170 : 140,
    wrap: c.key === 'answers_summary',
    ...(c.key === 'created_at' ? { render: (r: Row) => fmtLongDate(r[c.key]) } : {}),
  }));
  const allFields = useMemo(() => {
    const ks = new Set<string>();
    rows.slice(0, 40).forEach((r) => Object.keys(r).forEach((k) => { if (k && !k.startsWith('_') && k !== 'id' && k !== 'answers') ks.add(k); }));
    return [...ks].map((k) => ({ key: k, header: k }));
  }, [rows]);

  return (
    <div>
      <PageHeader title="Customer Feedback" subtitle="Feedback captured on each call report." icon="⭐" />
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      <DataTable<Row>
        columns={columns}
        allFields={allFields}
        rows={visible}
        getRowId={(r) => r.id}
        storageKey="customerFeedback"
        rowsBeforeScroll={14}
        dense
        onLoadMore={onDb ? loadMore : undefined}
        moreAvailable={onDb && more}
        loadingMore={busy}
        emptyText="No customer feedback yet — Refresh to load."
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="Call, party, engineer, feedback…" />
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off">⟳ {timeAgo(lastSync)}</span>}
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('customer-feedback.csv', columns.map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />
    </div>
  );
}

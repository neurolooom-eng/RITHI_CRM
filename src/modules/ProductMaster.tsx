import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar } from '../components/ui/ui';
import { csvExport, timeAgo } from '../lib/format';
import { searchProducts, dataConfigured, type ProdFilters } from '../lib/sheets';
import { ITEM_STATUS, productToCallPrefill } from '../lib/fieldcall';
import { useAuth } from '../lib/auth';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import './fieldcalls.css';

const CACHE_KEY = 'productMasterRows';

// ===========================================================================
// PRODUCT MASTER view — browse/search the ProdMaster sheet (via CallReg) and
// register a Field or Installation call directly from a product row (the call
// form opens pre-filled from that item).
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

const COLUMNS: Column<Row>[] = [
  { key: 'Item Name', header: 'Product', width: 150 },
  { key: 'Item Serial Number', header: 'Serial', width: 110, wrap: false },
  { key: 'Item Code', header: 'Item Code', width: 110, wrap: false },
  { key: 'Party Name', header: 'Party', width: 230 },
  { key: 'City', header: 'City', width: 110 },
  { key: 'State', header: 'State', width: 110 },
  { key: 'Item Status', header: 'Status', width: 70, wrap: false },
  { key: 'Warranty End Date', header: 'Warranty End', width: 120 },
  { key: 'Contract Type', header: 'Contract', width: 90, wrap: false },
  { key: 'Contract End Date', header: 'Contract End', width: 120 },
  { key: 'Service Engineer', header: 'Engineer', width: 150 },
];

export function ProductMaster() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const cached = loadCache<Row>(CACHE_KEY);
  const [f, setF] = useState<ProdFilters>({ q: '', party: '', product: '', serial: '', status: '' });
  const PAGE = 200;
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [offset, setOffset] = useState(cached?.rows.length ?? 0);
  const [more, setMore] = useState((cached?.rows.length ?? 0) >= PAGE);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    dataConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to search the Product Master.' },
  );

  const set = (k: keyof ProdFilters, v: string) => setF((cur) => ({ ...cur, [k]: v }));

  const run = async (filters: ProdFilters = f) => {
    if (!dataConfigured()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Searching Product Master…' });
    try {
      const r = await searchProducts(filters, PAGE, 0);
      const mapped = r.map((p, i) => ({ ...p, id: `${String(p['Item Serial Number'] ?? '')}-${i}` }));
      setRows(mapped); setOffset(mapped.length); setMore(r.length === PAGE);
      const anyFilter = Object.values(filters).some((v) => v && String(v).trim());
      if (!anyFilter) setLastSync(saveCache(CACHE_KEY, mapped)); // cache the browse set
      setMsg({
        tone: r.length ? 'ok' : 'info',
        text: r.length
          ? `${r.length} products${anyFilter ? ' matched' : ' (browse — refine with the filters)'}${r.length >= 200 ? ' — showing first 200' : ''}.`
          : 'No products matched.',
      });
    } catch (e) {
      setMsg({ tone: 'error', text: `Search failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const clear = () => { const empty = { q: '', party: '', product: '', serial: '', status: '' }; setF(empty); void run(empty); };

  const loadMore = async () => {
    setBusy(true);
    try {
      const r = await searchProducts(f, PAGE, offset);
      const mapped = r.map((p, i) => ({ ...p, id: `${String(p['Item Serial Number'] ?? '')}-${offset + i}` }));
      const merged = [...rows, ...mapped];
      setRows(merged); setOffset(offset + r.length); setMore(r.length === PAGE);
      const anyFilter = Object.values(f).some((v) => v && String(v).trim());
      if (!anyFilter) setLastSync(saveCache(CACHE_KEY, merged));
    } catch (e) {
      setMsg({ tone: 'error', text: `Load more failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  // Mount: show cache, refresh the browse set if stale/empty. 30-min auto-sync.
  useEffect(() => {
    if (!rows.length || isStale(lastSync)) void run({});
    else setMsg({ tone: 'info', text: `Showing cached data — synced ${timeAgo(lastSync)}. ↻ Refresh to update.` });
    const id = window.setInterval(() => {
      const anyFilter = Object.values(f).some((v) => v && String(v).trim());
      if (!anyFilter) void run({});
    }, SYNC_TTL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const register = (row: Row, path: string) =>
    navigate(path, { state: { prefill: productToCallPrefill(row) } });

  const actionsColumn: Column<Row> = {
    key: '_actions', header: 'Register Call', width: 170, sortable: false, wrap: false,
    render: (row) => (
      <div className="row" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-sm btn-primary" title="Register a field call for this item" onClick={() => register(row, '/field-calls')}>+ Field</button>
        <button className="btn btn-sm" title="Register an installation call for this item" onClick={() => register(row, '/installations')}>+ Install</button>
      </div>
    ),
  };

  return (
    <div>
      <PageHeader
        title="Product Master"
        subtitle="Search the install base and register a call straight from a product."
        icon="🩺"
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="prod-filters">
        <input className="input" placeholder="Party" value={f.party} onChange={(e) => set('party', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} />
        <input className="input" placeholder="Product" value={f.product} onChange={(e) => set('product', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} />
        <input className="input" placeholder="Serial Number" value={f.serial} onChange={(e) => set('serial', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} />
        <select className="select" value={f.status} onChange={(e) => { const v = e.target.value; set('status', v); void run({ ...f, status: v }); }}>
          <option value="">Any status</option>
          {ITEM_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="input prod-global" placeholder="🔎 Global search…" value={f.q} onChange={(e) => set('q', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} />
        <button className="btn btn-primary" onClick={() => void run()} disabled={busy}>{busy ? '…' : 'Search'}</button>
        <button className="btn" onClick={clear} disabled={busy}>Clear</button>
      </div>

      <DataTable<Row>
        columns={can('edit') ? [...COLUMNS, actionsColumn] : COLUMNS}
        rows={rows}
        getRowId={(r) => r.id}
        storageKey="productMaster"
        rowsBeforeScroll={14}
        onLoadMore={loadMore}
        moreAvailable={more}
        loadingMore={busy}
        emptyText="No products — adjust the filters or global search."
        toolbar={
          <Toolbar>
            <span className="muted">{rows.length ? `${rows.length} shown` : ''}</span>
            <button className="btn btn-sm" onClick={() => void run({})} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            {lastSync && <span className="conn-dot conn-off" title={`Last synced ${new Date(lastSync).toLocaleString()}`}>⟳ {timeAgo(lastSync)}</span>}
            <div className="spacer" />
            {rows.length > 0 && (
              <button
                className="btn btn-sm"
                onClick={() => csvExport('product-master.csv', COLUMNS.map((c) => ({ key: c.key, header: c.header })), rows as unknown as Record<string, unknown>[])}
              >
                ⭳ Export CSV
              </button>
            )}
          </Toolbar>
        }
      />
    </div>
  );
}

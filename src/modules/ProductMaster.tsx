import { useEffect, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar } from '../components/ui/ui';
import { csvExport, timeAgo } from '../lib/format';
import { searchProducts, dataConfigured, type ProdFilters } from '../lib/sheets';
import { ITEM_STATUS, productToCallPrefill } from '../lib/fieldcall';
import { useAuth } from '../lib/auth';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { isTimeout, errText } from '../lib/dberror';
import './fieldcalls.css';
import { partial } from '../lib/exportscope';

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

// EVERY COLUMN OF THE EXPORT, in the file's own order (the user, 2026-09-14:
// "Product Database has to retain all Columns"). The eleven above are what the
// screen OPENS with; these are what the ⚙ Columns picker offers and what the
// export carries, so a value is reachable without being in everybody's way.
//
// WRITTEN OUT rather than harvested from the loaded rows, which is how the
// other registers do it and is wrong for this one in two ways: the order would
// be whatever the first row happened to have, and a heading absent from the
// first forty machines would not be offered at all — `Sold Through` is blank
// on most of this file.
const ALL_FIELDS = [
  'Item Details Long', 'Item Details', 'Party Name', 'Sold Through', 'State', 'City', 'Address',
  'Item Code', 'Item Name', 'Item Serial Number', 'PO No.', 'PO Date',
  'Warranty Number', 'Warranty Start Date', 'Warranty End Date', 'Warranty Status',
  'Contract Number', 'Contract Start Date', 'Contract End Date', 'Contract Type', 'Contract Status',
  'PM Visits', 'Other Details', 'Service Engineer', 'Item Status', 'ProdFinal',
  'Installation Completed?', 'INST Call', 'INST Date', 'INST Call Status', 'Report',
  'Associated Accessory',
].map((k) => ({ key: k, header: k }));

// ONE MESSAGE FOR BOTH READS. A timeout says what to narrow; anything else is
// the error itself, which is the project's rule — the fault is usually readable
// in the original text and a friendly hint overwrites it.
const searchFailure = (e: unknown) =>
  isTimeout(e)
    ? `That was too much to answer in one go — the install base is 20,000 machines. Narrow it: a full serial, or a few more letters of the party. The database said: ${errText(e)}`
    : `Search failed: ${errText(e)}`;

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
    dataConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to search the Product Database.' },
  );

  const set = (k: keyof ProdFilters, v: string) => setF((cur) => ({ ...cur, [k]: v }));

  const run = async (filters: ProdFilters = f) => {
    if (!dataConfigured()) return;
    setBusy(true);
    setMsg({ tone: 'info', text: 'Searching the Product Database…' });
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
      // A TIMEOUT IS NOT A FAILED SEARCH, and saying so cost a support round
      // trip (2026-09-24, a Commercial user searching for a serial): the rows
      // on screen were the PREVIOUS search's, so "Search failed" over them
      // reads as a broken register. The same search narrowed comes back in
      // milliseconds. The database's own words are kept on the end.
      setMsg({ tone: 'error', text: searchFailure(e) });
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
      setMsg({ tone: 'error', text: searchFailure(e) });
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
        onRefresh={() => void run({})}
        refreshing={busy}
        syncedAt={lastSync}
        title="Product Database"
        subtitle="Search the install base and register a call straight from a product."
        icon="🩺"
        count={rows.length}
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
        <SelectPicker value={f.status ?? ''} placeholder="Any status"
          onChange={(v) => { set('status', v); void run({ ...f, status: v }); }}
          options={[...ITEM_STATUS]} />
        <input className="input prod-global" placeholder="🔎 Global search…" value={f.q} onChange={(e) => set('q', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} />
        <button className="btn btn-primary" onClick={() => void run()} disabled={busy}>{busy ? '…' : 'Search'}</button>
        <button className="btn" onClick={clear} disabled={busy}>Clear</button>
      </div>

      <DataTable<Row>
        columns={can('calls.create') ? [...COLUMNS, actionsColumn] : COLUMNS}
        allFields={ALL_FIELDS}
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
            <div className="spacer" />
            {rows.length > 0 && (
              <button
                className="btn btn-sm"
                title="All 32 columns of the install base, not only the ones on screen"
                onClick={() => csvExport('product-database.csv', ALL_FIELDS, rows as unknown as Record<string, unknown>[], partial(more))}
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

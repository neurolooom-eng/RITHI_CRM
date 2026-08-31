import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar } from '../components/ui/ui';
import { csvExport, timeAgo } from '../lib/format';
import { queryParties, supabaseConfigured, type PartyFilter } from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';

// ===========================================================================
// PARTY MASTER — live from Supabase `parties`, with a local browser cache +
// last-sync (like the Call Register): instant load from cache, 30-min auto
// refresh, manual force-sync. Field filters (Party / City / State / Type)
// query the server live; the unfiltered browse set is what gets cached.
// ===========================================================================

const CACHE_KEY = 'partyMaster';
const PAGE = 1000;
type Row = Record<string, unknown> & { id: string };

const COLUMNS: Column<Row>[] = [
  { key: 'party_name', header: 'Party Name', width: 300 },
  { key: 'city', header: 'City', width: 150 },
  { key: 'state', header: 'State', width: 150 },
  { key: 'party_type', header: 'Type', width: 150 },
  { key: 'address', header: 'Address', width: 340 },
];

const toRows = (data: Record<string, unknown>[], base: number): Row[] => data.map((p, i) => ({ ...p, id: String(p.id ?? base + i) } as Row));

export function PartyMaster() {
  const cached = loadCache<Row>(CACHE_KEY);
  const [filter, setFilter] = useState<PartyFilter>({ name: '', city: '', state: '', type: '' });
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [offset, setOffset] = useState(cached?.rows.length ?? 0);
  const [more, setMore] = useState((cached?.rows.length ?? 0) >= PAGE);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load Party Master.' },
  );
  const set = (k: keyof PartyFilter, v: string) => setFilter((c) => ({ ...c, [k]: v }));
  const hasFilter = !!(filter.name || filter.city || filter.state || filter.type);

  // Force-sync the browse set (no filters) and cache it.
  const refresh = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true);
    try {
      const data = await queryParties({}, 0, PAGE);
      const r = toRows(data, 0);
      setRows(r); setOffset(r.length); setMore(r.length === PAGE);
      setLastSync(saveCache(CACHE_KEY, r));
      setMsg({ tone: 'ok', text: `Synced ${r.length}${r.length === PAGE ? '+' : ''} parties.` });
    } catch (e) {
      setMsg({ tone: 'error', text: `Sync failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  // Mount: show cache, refresh if stale/empty. 30-min auto force-sync.
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

  // Filters: query the server live (debounced). Clearing them restores the cache.
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
        const data = await queryParties(filter, 0, PAGE);
        setRows(toRows(data, 0)); setOffset(data.length); setMore(data.length === PAGE);
        setMsg({ tone: 'ok', text: `${data.length}${data.length === PAGE ? '+' : ''} parties matched (live).` });
      } catch (e) {
        setMsg({ tone: 'error', text: `Search failed: ${e instanceof Error ? e.message : String(e)}` });
      } finally { setBusy(false); }
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.name, filter.city, filter.state, filter.type]);

  const loadMore = async () => {
    setBusy(true);
    try {
      const data = await queryParties(hasFilter ? filter : {}, offset, PAGE);
      const merged = [...rows, ...toRows(data, rows.length)];
      setRows(merged); setOffset(offset + data.length); setMore(data.length === PAGE);
      if (!hasFilter) setLastSync(saveCache(CACHE_KEY, merged));
    } catch (e) {
      setMsg({ tone: 'error', text: `Load more failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  const allFields = useMemo(() => {
    const ks = new Set<string>();
    rows.slice(0, 40).forEach((r) => Object.keys(r).forEach((k) => { if (k && k !== 'id' && k !== 'extra') ks.add(k); }));
    return [...ks].map((k) => ({ key: k, header: k }));
  }, [rows]);

  return (
    <div>
      <PageHeader title="Party Master" subtitle="Customers / parties — cached locally, synced from the database." icon="🏥" count={rows.length} />
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
        storageKey="partyMaster"
        rowsBeforeScroll={16}
        dense
        onLoadMore={loadMore}
        moreAvailable={more}
        loadingMore={busy}
        emptyText={busy ? 'Loading…' : 'No parties match.'}
        toolbar={
          <Toolbar>
            <div className="call-search">
              <input className="input" placeholder="Party name" value={filter.name} onChange={(e) => set('name', e.target.value)} />
              <input className="input" placeholder="State" value={filter.state} onChange={(e) => set('state', e.target.value)} />
              <input className="input" placeholder="City" value={filter.city} onChange={(e) => set('city', e.target.value)} />
              <input className="input" placeholder="Type" value={filter.type} onChange={(e) => set('type', e.target.value)} />
            </div>
            <button className="btn btn-sm" onClick={() => void refresh()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off" title={`Last synced ${new Date(lastSync).toLocaleString()}`}>⟳ {timeAgo(lastSync)}</span>}
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('party-master.csv', COLUMNS.map((c) => ({ key: c.key, header: c.header })), rows as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />
    </div>
  );
}

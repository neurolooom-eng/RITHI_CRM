import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, fmtLongDate, timeAgo } from '../lib/format';
import { listFeedbackRows, supabaseConfigured } from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { useAccessScope } from '../lib/access';
import './fieldcalls.css';
import { Ucn } from '../lib/callstate';
import { useCallStates, callStateFor } from '../lib/callstates';

// ===========================================================================
// CUSTOMER FEEDBACK — the structured feedback captured on each call report,
// live from the Supabase `feedback` table (was reading the emptied demo
// collection, hence blank). Role-scoped by the engineer on the feedback.
// ===========================================================================

const CACHE_KEY = 'customerFeedback';
type Row = Record<string, unknown> & { id: string };
const g = (r: Record<string, unknown>, k: string) => String(r[k] ?? '');

// Base columns; the per-question feedback columns (fb::<q>) are discovered from
// the data and appended, so every field the engineer filled is its own column.
// THE DATE IS THE FEEDBACK'S OWN, NOT THE ROW'S.
//
// Reported 2026-09-14: "I think the Date is taken as 14Sep2026 for all Uploads,
// I wanted the Actual Dates as per the CSV not the Upload date -- It creates a
// Complaint issue." This column read `created_at`, which is when the ROW was
// written — so twenty-four thousand feedbacks collected over two years all read
// as one afternoon in September 2026. On a complaint record the date a customer
// complained is part of the record, not a detail of the storage.
//
// `entry_at` is the export's own "Visit Entry Date" on a migrated row and the
// moment of recording on a new one (0190), so the column means one thing on
// every row. `created_at` is still here under the name it deserves — WHEN IT
// WAS LOADED — because that is a real and separate fact, and hiding it would
// make the correction unverifiable.
const BASE_COLS = [
  { key: 'entry_at', header: 'Date' },
  { key: 'visit_at', header: 'Visit Date' },
  { key: 'call_number', header: 'Call Number' },
  { key: 'ucn', header: 'UCN', width: 130, wrap: false, render: (r: Record<string, unknown>) => <Ucn ucn={r.ucn} state={callStateFor(r.ucn)} /> },
  { key: 'party_name', header: 'Party' },
  { key: 'product_name', header: 'Product' },
  { key: 'engineer', header: 'Engineer' },
  { key: 'origin', header: 'Source' },
  { key: 'created_at', header: 'Loaded on' },
];
/** Where a feedback came from, in a word. Empty `imported_from` means nobody
 *  loaded it — it was recorded here. */
const originOf = (r: Record<string, unknown>) =>
  (String(r.imported_from ?? '').trim() ? 'Uploaded' : 'Entered here');
const ORIGINS = ['Uploaded', 'Entered here'] as const;
// Turn a fb::<question> key into a readable header.
const fbHeader = (k: string) => {
  const q = k.replace(/^fb::/, '').replace(/[-_]+/g, ' ').trim();
  return q.charAt(0).toUpperCase() + q.slice(1);
};

export function CustomerFeedback() {
  const scope = useAccessScope();
  const onDb = supabaseConfigured();
  const cached = onDb ? loadCache<Row>(CACHE_KEY) : null;
  const PAGE = 1000;
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [search, setSearch] = useState('');
  // "Can I segregate the Uploaded ones and the Ones that were entered in the
  // new CRM?" (the user, 2026-09-14). Empty = both, so the filter costs
  // nothing until it is used.
  const [origin, setOrigin] = useState<'' | (typeof ORIGINS)[number]>('');
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

  // One column per feedback question actually present in the data.
  const fbKeys = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => { if (k.startsWith('fb::')) s.add(k); }));
    return [...s].sort();
  }, [rows]);
  const allCols = useMemo(() => [...BASE_COLS, ...fbKeys.map((k) => ({ key: k, header: fbHeader(k) }))], [fbKeys]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byOrigin = origin ? scoped.filter((r) => originOf(r) === origin) : scoped;
    if (!q) return byOrigin;
    return byOrigin.filter((r) => allCols.some((c) => g(r, c.key).toLowerCase().includes(q)) || g(r, 'complaint').toLowerCase().includes(q));
  }, [scoped, search, allCols, origin]);

  // The UCNs on screen, coloured by their calls' status (the standing rule,
  // 2026-09-06). This register does not carry the state — a spare line knows
  // the UCN it was raised against, not what happened to that call — so they
  // are looked up in ONE request and shared. A UCN whose state has not arrived,
  // or that this reader may not see, stays uncoloured rather than guessed.
  useCallStates(visible.map((r) => String((r as { ucn?: unknown }).ucn ?? '')).filter(Boolean));

  const DATE_COLS = new Set(['entry_at', 'visit_at', 'created_at']);
  const columns: Column<Row>[] = allCols.map((c) => ({
    key: c.key, header: c.header,
    width: DATE_COLS.has(c.key) ? 170 : c.key.startsWith('fb::') ? 160 : 140,
    wrap: c.key.startsWith('fb::'),
    ...(DATE_COLS.has(c.key) ? { render: (r: Row) => fmtLongDate(r[c.key]) } : {}),
    ...(c.key === 'origin' ? { render: (r: Row) => originOf(r) } : {}),
  }));
  const allFields = allCols.map((c) => ({ key: c.key, header: c.header }));


  return (
    <div>
      <PageHeader
        onRefresh={() => void load()}
        refreshing={busy}
        syncedAt={lastSync} title="Customer Feedback" subtitle="Feedback captured on each call report." icon="⭐" count={visible.length} countMore={onDb && more} />
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
            {/* UPLOADED vs ENTERED HERE. The count on each chip is over the
                SCOPED rows, not the filtered ones, so the two always add up to
                the register and a chip never reads zero because the other one
                is on. */}
            <button type="button" className={`chip ${origin === '' ? 'chip-on' : ''}`}
                    aria-pressed={origin === ''} onClick={() => setOrigin('')}>
              All <b>{scoped.length}</b>
            </button>
            {ORIGINS.map((o) => (
              <button key={o} type="button" className={`chip ${origin === o ? 'chip-on' : ''}`}
                      aria-pressed={origin === o}
                      onClick={() => setOrigin((c) => (c === o ? '' : o))}>
                {o} <b>{scoped.filter((r) => originOf(r) === o).length}</b>
              </button>
            ))}
            <div className="spacer" />
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('customer-feedback.csv', columns.map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />
    </div>
  );
}

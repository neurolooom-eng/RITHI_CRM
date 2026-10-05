import { isMissingTable } from '../lib/dberror';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, fmtLongDate, timeAgo } from '../lib/format';
import { useArrivingFilter } from '../lib/arriveWith';
import {
  listHandstockBalanceAll, listHandstockMovements, listAllHandstockMovements, supabaseConfigured, addHandstockAdjustment,
} from '../lib/supabase';
import { PickList } from '../components/ui/PickList';
import { useMaster } from '../lib/masters';
import { loadCache, saveCache, isStale, SYNC_TTL_MS, startBackgroundSync, MAX_CACHED_ROWS } from '../lib/cache';
import { useAuth } from '../lib/auth';
import { useAccessScope, previewScoped, useTeamEngineers } from '../lib/access';
import {
  balanceTone, byEngineer, movementTone, num, partDescription, summarise, withoutHistory,
  type HandstockBalance, type HandstockMovement, type MovementKind,
} from '../lib/handstock';
import './fieldcalls.css';
import { partial, searchScope } from '../lib/exportscope';
import { formatDayTime } from '../lib/dates';

// ===========================================================================
// HAND STOCK — the stock level an engineer is carrying, per spare.
//
//   Stock Level = every movement IN − every movement OUT: the opening balance +
//   Stock Out (Stores) − Consumption − Transfer From + Transfer To − Returned,
//   ± office adjustments and the migrated history (FRS-013/FRS-043, D-048).
//
// Nothing is entered here: the movements are the Stores dispatch on a spare
// request, the consumption on a call report, the hand-overs recorded on Stock
// Transfer, and the returns recorded on an MRN. Reads `handstock_balance` / `handstock_movements` (migration
// 0023_handstock.sql), which run with the caller's rights — so an engineer
// sees their own stock, an RM their sub-tree, an admin everyone's.
//
// Two tabs over the same derivation:
//   Stock Level — one line per engineer and spare, each term of the formula
//                 beside the level. What is in hand, right now.
//   Movements   — the ledger those levels are made of: every stock out,
//                 consumption and transfer, newest first.
//
// Stock Transfer (/stock-transfer) is where a hand-over is recorded, and it
// reads the same derivation (`engineer_stock` is a view over the balance
// below), so the two screens cannot disagree.
// ===========================================================================

const CACHE_KEY = 'handstock';
const MIGRATION_HINT = 'Hand stock needs migration 0023_handstock.sql — run it in the Supabase SQL editor (apply bundle: HandStock_X.sql).';

// `_state` is derived, not stored: "In hand" / "Short" / "Settled". The chips
// have always read it off `on_hand`; grouping needs the same reading as a value
// on the row, and deriving it once keeps the two from ever disagreeing.
type Row = HandstockBalance & { id: string; _state?: string };
type MoveRow = HandstockMovement & { id: string };
type Holding = 'held' | 'short' | 'settled' | '';
type Tab = 'levels' | 'moves';
// How many movements the stock-level drawer reads for one line (newest first).
const MOVES_CAP = 500;

const asRow = (r: Record<string, unknown>): Row => ({
  engineer_key: String(r.engineer_key ?? ''),
  engineer: String(r.engineer ?? ''),
  engineer_email: String(r.engineer_email ?? ''),
  part_code: String(r.part_code ?? ''),
  part: String(r.part ?? ''),
  opening: num(r.opening),
  stock_out: num(r.stock_out),
  consumed: num(r.consumed),
  transferred_in: num(r.transferred_in),
  transferred_out: num(r.transferred_out),
  returned: num(r.returned),
  on_hand: num(r.on_hand),
  last_in: r.last_in ? String(r.last_in) : null,
  last_out: r.last_out ? String(r.last_out) : null,
  last_movement: r.last_movement ? String(r.last_movement) : null,
  movements: num(r.movements),
  hist_stock_out: num(r.hist_stock_out),
  hist_consumed: num(r.hist_consumed),
  hist_net: num(r.hist_net),
  // Before 0102 is applied these columns are absent, so `on_hand_live` reads 0
  // and would show every engineer as holding nothing. Fall back to the whole
  // balance: the toggle then changes nothing, which is the honest behaviour
  // when the database cannot yet tell the two apart.
  on_hand_live: r.on_hand_live === undefined ? num(r.on_hand) : num(r.on_hand_live),
  id: `${String(r.engineer_key ?? '')}::${String(r.part_code ?? '')}`,
});

const asMovement = (r: Record<string, unknown>): HandstockMovement => ({
  direction: String(r.direction ?? '') === 'IN' ? 'IN' : 'OUT',
  movement: String(r.movement ?? '') as MovementKind,
  engineer_key: String(r.engineer_key ?? ''), engineer: String(r.engineer ?? ''),
  engineer_email: String(r.engineer_email ?? ''),
  part_code: String(r.part_code ?? ''), part: String(r.part ?? ''), qty: num(r.qty),
  moved_at: r.moved_at ? String(r.moved_at) : null,
  ref: String(r.ref ?? ''), ref_type: String(r.ref_type ?? ''), ref_uid: String(r.ref_uid ?? ''),
  ucn: String(r.ucn ?? ''), call_number: String(r.call_number ?? ''),
  party_name: String(r.party_name ?? ''), remarks: String(r.remarks ?? ''),
});

const stockBadge = (onHand: number) => (
  <span className={`badge badge-${balanceTone(onHand)}`}>{onHand}</span>
);


export function HandStock() {
  const { can, viewAs } = useAuth();
  const scope = useAccessScope();
  const navigate = useNavigate();
  const onDb = supabaseConfigured();
  const cached = onDb ? loadCache<Row>(CACHE_KEY) : null;
  const [tab, setTab] = useState<Tab>('levels');
  // The raw rows as fetched — cached and refreshed as before.
  const [allRows, setAllRows] = useState<Row[]>(cached?.rows ?? []);
  // IGNORE THE IMPORTED HISTORY. Three of the nine arms are the sheet era —
  // the opening pools, every stock out before 2026, and the yearly consumption
  // exports. When a level looks wrong it is usually a question about those, so
  // this shows the balance WITHOUT them: what this application has itself
  // recorded. Neither figure is a correction of the other; the toggle says
  // which question is being asked. Remembered, because somebody who distrusts
  // the import distrusts it tomorrow as well.
  const [liveOnly, setLiveOnly] = useState(() => {
    try { return localStorage.getItem('rithi.handstock.liveOnly') === '1'; } catch { return false; }
  });
  const setLive = (on: boolean) => {
    setLiveOnly(on);
    try { localStorage.setItem('rithi.handstock.liveOnly', on ? '1' : '0'); } catch { /* private window */ }
  };
  // What this screen shows. RLS already scoped a real session; this only
  // narrows the list while an administrator previews as someone else, whose
  // identity the database never sees. See previewScoped() in lib/access.
  const rows = useMemo(
    () => previewScoped(allRows, !!viewAs, scope, ['engineer', 'engineer_key'], ['engineer_email'], viewAs?.email)
      // With the history ignored, the WHOLE row is restated — not just the
      // total. A screen showing 4 in hand beside a stock out of 27 invites the
      // reader to check the arithmetic and find it broken, so each component
      // loses its imported part too. The transfers and returns are untouched:
      // they are not part of the sheet era.
      .map((r) => (liveOnly ? withoutHistory(r) : r))
      // The chips read this too; grouping needs it as a value ON the row, and
      // one derivation keeps the two from disagreeing.
      .map((r) => ({ ...r, _state: r.on_hand > 0 ? 'In hand' : r.on_hand < 0 ? 'Short' : 'Settled' })),
    [allRows, viewAs, scope, liveOnly],
  );
  const [search, setSearch] = useState('');
  const [engineerFilter, setEngineerFilter] = useState('');
  const [holding, setHolding] = useState<Holding>('held');
  // ARRIVING FROM MY WORKLOAD — the Short card opens the short lines.
  useArrivingFilter<Holding>('holding', setHolding);
  const [busy, setBusy] = useState(false);
  // Read by the background sync, which waits while a read is in flight.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  // THE WHOLE BALANCE ARRIVES IN ONE REQUEST (0384), so after a load `more`
  // is false and every count is exact. The one way this screen can still be
  // showing PART of the register is a restored device cache, which keeps at
  // most MAX_CACHED_ROWS lines: a cache AT that cap was almost certainly cut,
  // so it reads "+" and offers a reload until the full balance is in.
  const [more, setMore] = useState((cached?.rows?.length ?? 0) >= MAX_CACHED_ROWS);
  // Every ACTIVE engineer, not only the ones with a line on this page. Ten
  // names in a dropdown, on a register covering eighty, reads as "there are ten".
  const team = useTeamEngineers();
  const [detail, setDetail] = useState<Row | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    onDb ? null : { tone: 'info', text: 'Connect the database in Settings to load hand stock.' },
  );

  const load = async () => {
    if (!onDb) return;
    setBusy(true); setMsg({ tone: 'info', text: 'Loading hand stock…' });
    try {
      // ONE REQUEST, ONE AGGREGATE. The balance view costs the same for a page
      // as for everything (the GROUP BY runs over every movement either way),
      // so paging it was k full aggregates per load and another per search
      // keystroke -- 4.6-7.3 s each on the live project. The function returns
      // the whole balance as one array, under the reader's own RLS.
      const mapped = (await listHandstockBalanceAll()).map(asRow);
      setAllRows(mapped); setMore(false); setLastSync(saveCache(CACHE_KEY, mapped));
      setMsg({ tone: 'ok', text: `Loaded ${mapped.length} engineer/spare line${mapped.length === 1 ? '' : 's'} — the whole register.` });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setMsg({
        tone: 'error',
        text: isMissingTable(text, 'handstock_balance', 'handstock_movements', 'handstock_opening') ? MIGRATION_HINT : `Load failed: ${text}`,
      });
    } finally { setBusy(false); }
  };
  // THE SEARCH IS ON THE DEVICE, over the whole register, because the whole
  // register is here. It used to ask the database -- right while the screen
  // was paged, since the part somebody wanted was the one not yet paged in --
  // and each keystroke was a full aggregate. Two characters or more; `rows`
  // already carries the History switch and the preview scope, so a hit is
  // exactly a line the table would show.
  const hits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return null;
    return rows.filter((r) => `${r.engineer} ${r.part_code} ${r.part}`.toLowerCase().includes(q));
  }, [rows, search]);

  useEffect(() => {
    // A cache cut at its cap is not the register: load rather than show it.
    if (onDb && rows.length && !more && !isStale(lastSync)) setMsg({ tone: 'info', text: `Showing cached data — synced ${timeAgo(lastSync)}. ↻ Refresh to update.` });
    else void load();
    const stop = onDb ? startBackgroundSync(() => void load(), () => busyRef.current) : undefined;
    return () => stop?.();
    // eslint-disable-next-line
  }, []);

  const totals = useMemo(() => summarise(rows), [rows]);
  const holders = useMemo(() => byEngineer(rows), [rows]);

  // The dropdown is every ACTIVE engineer, with what is in hand beside the ones
  // this page knows about. A name with no line still belongs in the list — that
  // an engineer carries nothing is an answer, not a reason to hide them.
  const engineers = useMemo(() => {
    const held = new Map(holders.map((h) => [h.engineer_key, h]));
    const out = team.names.map((n) => {
      const key = n.trim().toLowerCase();
      return { engineer_key: key, engineer: n, onHand: held.get(key)?.onHand };
    });
    // Anyone holding stock who is NOT in the directory still has to be
    // selectable, or their lines cannot be filtered to.
    holders.forEach((h) => {
      if (!out.some((o) => o.engineer_key === h.engineer_key)) out.push({ ...h, onHand: h.onHand });
    });
    return out.sort((a, b) => a.engineer.localeCompare(b.engineer));
  }, [team.names, holders]);

  const visible = useMemo(() => {
    // A search shows what the DATABASE matched, not what this page happens to
    // hold. The chips and the engineer filter still narrow it.
    const base = hits ?? rows;
    return base.filter((r) => {
      if (engineerFilter && r.engineer_key !== engineerFilter) return false;
      if (holding === 'held' && r.on_hand <= 0) return false;
      if (holding === 'short' && r.on_hand >= 0) return false;
      if (holding === 'settled' && r.on_hand !== 0) return false;
      return true;
    });
  }, [rows, hits, engineerFilter, holding]);

  const columns: Column<Row>[] = [
    { key: 'engineer', header: 'Engineer', width: 165 },
    { key: 'part_code', header: 'Spare', width: 115, wrap: false },
    { key: 'part', header: 'Description', width: 235, accessor: (r) => partDescription(r.part) || r.part, render: (r) => partDescription(r.part) || r.part },
    { key: 'on_hand', header: 'Stock level', width: 100, align: 'right', wrap: false, render: (r) => stockBadge(r.on_hand) },
    // Stock the engineer was already carrying before the movement history
    // begins (WinMax HS and the yearly pools) — shown separately so a level
    // that comes from an opening balance is legible, not just correct.
    { key: 'opening', header: 'Opening', width: 90, align: 'right', wrap: false },
    // What the sheet era contributes to this line, in one figure: the opening
    // pool plus the imported stock outs, less the imported consumption. A level
    // that looks wrong is nearly always a question about THIS number, and until
    // now the register could not tell you what it was.
    { key: 'hist_net', header: 'From history', width: 110, align: 'right', wrap: false,
      render: (r) => (liveOnly ? <span className="muted" title="Ignored — the toggle is on">—</span>
        : r.hist_net === 0 ? <span className="muted">0</span> : <span>{r.hist_net}</span>) },
    { key: 'stock_out', header: 'Stock out', width: 95, align: 'right', wrap: false },
    { key: 'consumed', header: 'Consumed', width: 95, align: 'right', wrap: false },
    { key: 'transferred_in', header: 'Transfer in', width: 100, align: 'right', wrap: false },
    { key: 'transferred_out', header: 'Transfer out', width: 105, align: 'right', wrap: false },
    { key: 'returned', header: 'Returned', width: 95, align: 'right', wrap: false },
    { key: 'last_movement', header: 'Last movement', width: 135, render: (r) => fmtLongDate(r.last_movement) },
  ];

  return (
    <div>
      <PageHeader
        onRefresh={() => void load()}
        refreshing={busy}
        title="Hand Stock"
        subtitle="Stock level per engineer and spare: opening + stock out from Stores − consumption − transfers out + transfers in − returns ± adjustments."
        icon="🎒"
        count={visible.length}
        // EXACT once the whole balance is in; a "+" only over a device cache
        // cut at its cap, where the offer is a full reload, not a next page.
        countMore={more}
        moreAvailable={!hits && more}
        onLoadMore={() => void load()}
        loadingMore={busy}
        status={
          <>
            <span className={`conn-dot ${onDb ? 'conn-on' : 'conn-off'}`}>
              {onDb ? '● Database connected' : '○ Not connected'}
            </span>
            {!!lastSync && (
              <span className="conn-dot conn-off" title={`Last synced ${formatDayTime(lastSync)}`}>
                ⟳ synced {timeAgo(lastSync)}
              </span>
            )}
            {hits && <span className="conn-dot conn-on">🔎 searching the whole register — {hits.length}{more ? '+' : ''} match{hits.length === 1 ? '' : 'es'}</span>}
          </>
        }
        actions={(can('stock.transfer') || can('consumption.reconcile')) && (
          <div className="row" style={{ gap: 6 }}>
            {can('consumption.reconcile') && onDb && (
              <button className="btn" onClick={() => setAdjusting(true)}
                title="Add or remove quantity from an engineer's hand stock, with a reason">± Adjust stock</button>
            )}
            {can('stock.transfer') && <button className="btn btn-primary" onClick={() => navigate('/stock-transfer')}>⇄ Transfer stock</button>}
          </div>
        )}
      />

      {adjusting && (
        <AdjustDrawer engineers={team.names} onClose={() => setAdjusting(false)}
          onSaved={(text) => { setAdjusting(false); setMsg({ tone: 'ok', text }); void load(); }} />
      )}

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}


      {/* Tabs: the level, and the ledger it is made of. */}
      <div className="stage-chips hs-tabs">
        <button className={`chip ${tab === 'levels' ? 'chip-on' : ''}`} onClick={() => setTab('levels')}>📊 Stock Level <b>{rows.length}{more ? '+' : ''}</b></button>
        <button className={`chip ${tab === 'moves' ? 'chip-on' : ''}`} onClick={() => setTab('moves')}>🧾 Movements</button>
      </div>

      {tab === 'moves' ? (
        <Movements engineers={holders} onMigrationError={() => setMsg({ tone: 'error', text: MIGRATION_HINT })} />
      ) : (
        <>
          <div className="stage-chips">
            <button className={`chip ${holding === 'held' ? 'chip-on' : ''}`} onClick={() => setHolding('held')}>In hand <b>{rows.filter((r) => r.on_hand > 0).length}{more ? '+' : ''}</b></button>
            <button className={`chip ${holding === 'short' ? 'chip-on' : ''}`} onClick={() => setHolding('short')}>⚠️ Short <b>{totals.shortLines}{more ? '+' : ''}</b></button>
            <button className={`chip ${holding === 'settled' ? 'chip-on' : ''}`} onClick={() => setHolding('settled')}>Settled <b>{rows.filter((r) => r.on_hand === 0).length}{more ? '+' : ''}</b></button>
            <button className={`chip ${holding === '' ? 'chip-on' : ''}`} onClick={() => setHolding('')}>All <b>{rows.length}{more ? '+' : ''}</b></button>
            <span className="spacer" />
            {/* Not a filter — it changes what the numbers MEAN, so it sits apart
                from the chips that narrow the list, and the screen says which
                reading is on rather than leaving it to be inferred. */}
            <button
              className={`chip ${liveOnly ? 'chip-on' : ''}`}
              onClick={() => setLive(!liveOnly)}
              title={liveOnly
                ? 'Showing only what this system has recorded since 2026. Click to include the imported sheet-era record.'
                : 'Showing everything on record, including the imported sheet era — the opening pools, the pre-2026 stock outs and the yearly consumption exports. Click to leave them out.'}
            >
              {liveOnly ? '📅 History ignored' : '🗄️ History included'}
            </button>
          </div>

          {liveOnly && (
            <div className="sheet-banner sheet-banner-info">
              <span>
                <b>The imported record is being left out.</b> These are the levels from what this system has
                recorded itself — stock outs, consumption, transfers and returns since it went live. The opening
                pools, the pre-2026 stock outs and the yearly consumption exports are excluded, so a level here
                is <i>lower</i> than the full one wherever an engineer was carrying stock before the cutover.
                Neither number is wrong; they answer different questions.
              </span>
            </div>
          )}

          <DataTable<Row>
            columns={columns}
            rows={visible}
            getRowId={(r) => r.id}
            onRowClick={(r) => setDetail(r)}
            storageKey="handstock"
            rowsBeforeScroll={14}
            dense
            // Engineer, spare, and whether the line is in hand — the same
            // grouping the call and spare registers have.
            groupable={[
              { key: 'engineer', label: 'Engineer' },
              { key: 'part_code', label: 'Spare' },
              { key: '_state', label: 'Stock level' },
            ]}
            emptyText={
              hits ? 'Nothing in the whole register matches that.'
                  : rows.length ? 'No lines match this filter.'
                    : 'No hand stock yet — Refresh to load.'}
            toolbar={
              <Toolbar>
                <SearchBox value={search} onChange={setSearch} placeholder="Engineer, part code, description — searches every line" />
                <SelectPicker className="hs-eng-filter" value={engineerFilter} onChange={setEngineerFilter}
                  placeholder={`All engineers (${engineers.length})`}
                  options={engineers.map((e) => ({
                    value: e.engineer_key,
                    label: `${e.engineer}${e.onHand === undefined ? '' : ` (${e.onHand})`}`,
                  }))} />
                <div className="spacer" />
                {/* WHILE A SEARCH SHOWS, THE FILE IS THE SEARCH, and it is
                    complete unless the list itself is (a cut cache). */}
                {rows.length > 0 && (
                  <button className="btn btn-sm" onClick={() => csvExport('hand-stock.csv', columns.map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[], hits ? searchScope(more) : partial(more))}>⭳ Export CSV</button>
                )}
              </Toolbar>
            }
          />
        </>
      )}

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.part_code} — ${detail.engineer}` : ''}
        width={720}
      >
        {detail && (
          <MovementTrail
            row={detail}
            onTransfer={can('stock.transfer') ? () => navigate('/stock-transfer') : undefined}
          />
        )}
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Movements tab — the ledger the levels are made of. Every stock out,
// consumption and transfer across everyone the viewer may see, newest first.
// Loaded on its own (and paged) rather than with the levels, because a level
// is a handful of rows per engineer and its history is not.
// ---------------------------------------------------------------------------
const PAGE = 1000;

function Movements({
  engineers, onMigrationError,
}: {
  engineers: { engineer_key: string; engineer: string }[];
  onMigrationError: () => void;
}) {
  const [allMoves, setAllMoves] = useState<MoveRow[]>([]);
  const { viewAs } = useAuth();
  const scope = useAccessScope();
  const moves = useMemo(
    () => previewScoped(allMoves, !!viewAs, scope, ['engineer', 'engineer_key'], ['engineer_email'], viewAs?.email),
    [allMoves, viewAs, scope],
  );
  const [search, setSearch] = useState('');
  const [engineerFilter, setEngineerFilter] = useState('');
  const [kind, setKind] = useState<MovementKind | ''>('');
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState('');

  const fetchPage = async (from: number, engineerKey: string) => {
    const raw = await listAllHandstockMovements(PAGE, from, engineerKey ? { engineerKey } : {});
    return raw.map((m, i) => ({ ...asMovement(m), id: `${from + i}` } as MoveRow));
  };

  const load = async (engineerKey = engineerFilter) => {
    setBusy(true); setErr('');
    try {
      const page = await fetchPage(0, engineerKey);
      setAllMoves(page); setOffset(page.length); setMore(page.length === PAGE);
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      if (isMissingTable(text, 'handstock_balance', 'handstock_movements', 'handstock_opening')) onMigrationError();
      else setErr(text);
      setAllMoves([]); setMore(false);
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(engineerFilter); /* eslint-disable-next-line */ }, [engineerFilter]);

  const loadMore = async () => {
    setBusy(true);
    try {
      const page = await fetchPage(offset, engineerFilter);
      setAllMoves((m) => [...m, ...page]); setOffset(offset + page.length); setMore(page.length === PAGE);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return moves.filter((m) => {
      if (kind && m.movement !== kind) return false;
      if (!q) return true;
      return [m.engineer, m.part, m.part_code, m.ref, m.ucn, m.call_number, m.party_name, m.remarks]
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [moves, search, kind]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    moves.forEach((m) => { c[m.movement] = (c[m.movement] ?? 0) + 1; });
    return c;
  }, [moves]);

  const columns: Column<MoveRow>[] = [
    { key: 'moved_at', header: 'When', width: 135, render: (m) => fmtLongDate(m.moved_at) },
    { key: 'movement', header: 'Movement', width: 120, wrap: false, render: (m) => <span className={`badge badge-${movementTone(m.movement)}`}>{m.movement}</span> },
    { key: 'engineer', header: 'Engineer', width: 160 },
    { key: 'part_code', header: 'Spare', width: 115, wrap: false },
    { key: 'part', header: 'Description', width: 220, accessor: (m) => partDescription(m.part) || m.part, render: (m) => partDescription(m.part) || m.part },
    { key: 'qty', header: 'Qty', width: 70, align: 'right', wrap: false, render: (m) => <span className={m.direction === 'IN' ? 'wf-in' : 'wf-out'}>{m.direction === 'IN' ? '+' : '−'}{m.qty}</span> },
    { key: 'ref', header: 'Reference', width: 140, wrap: false },
    { key: 'ref_type', header: 'Against', width: 100, wrap: false },
    { key: 'party_name', header: 'Party / other engineer', width: 200 },
    { key: 'remarks', header: 'Remarks', width: 180 },
  ];

  const KINDS: MovementKind[] = ['Stock out', 'Consumption', 'Transfer in', 'Transfer out', 'Return', 'Adjustment'];

  return (
    <>
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span><button className="btn btn-ghost btn-sm" onClick={() => setErr('')}>✕</button></div>}

      <div className="stage-chips">
        <button className={`chip ${kind === '' ? 'chip-on' : ''}`} onClick={() => setKind('')}>All <b>{moves.length}{more ? '+' : ''}</b></button>
        {KINDS.map((k) => (
          <button key={k} className={`chip ${kind === k ? 'chip-on' : ''}`} onClick={() => setKind(kind === k ? '' : k)}>{k} <b>{counts[k] ?? 0}{more ? '+' : ''}</b></button>
        ))}
      </div>

      <DataTable<MoveRow>
        columns={columns}
        rows={visible}
        getRowId={(m) => m.id}
        storageKey="handstockMovements"
        rowsBeforeScroll={14}
        dense
        onLoadMore={() => void loadMore()}
        moreAvailable={more}
        loadingMore={busy}
        emptyText={busy ? 'Loading movements…' : 'No movements yet.'}
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="Engineer, spare, DC, call, remarks…" />
            <SelectPicker className="hs-eng-filter" value={engineerFilter} onChange={setEngineerFilter}
              placeholder="All engineers"
              options={engineers.map((e) => ({ value: e.engineer_key, label: e.engineer }))} />
            <div className="spacer" />
            {moves.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('hand-stock-movements.csv', columns.map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[], partial(more))}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// The movement trail behind one line: every stock-out, consumption and
// transfer, so a disputed stock level can be read back to the DC, the call or
// the engineer it came from. Loaded on open — the register itself only needs
// the netted figure.
// ---------------------------------------------------------------------------
function MovementTrail({ row, onTransfer }: { row: Row; onTransfer?: () => void }) {
  const [moves, setMoves] = useState<HandstockMovement[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setBusy(true); setErr(''); setMoves([]);
    listHandstockMovements(row.engineer_key, row.part_code, MOVES_CAP)
      .then((r) => { if (alive) setMoves(r.map(asMovement)); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [row.engineer_key, row.part_code]);

  const field = (label: string, value: unknown) => (
    <div className="rep-field"><span className="field-label">{label}</span><span>{String(value ?? '') || '—'}</span></div>
  );

  return (
    <div className="rep-form">
      <section className="rep-sec">
        <div className="rep-sec-title">Stock level {stockBadge(row.on_hand)}</div>
        <div className="rep-grid">
          {field('Engineer', row.engineer)}
          {field('Spare', row.part)}
          {field('Opening balance', row.opening)}
          {field('Stock out (Stores)', row.stock_out)}
          {field('Consumed', row.consumed)}
          {field('Transferred in', row.transferred_in)}
          {field('Transferred out', row.transferred_out)}
          {field('Returned (MRN)', row.returned)}
        </div>
        {/* THE SUM ADDS UP (D-048). It printed five terms and the database's
            result, which is every movement IN less every movement OUT -- the
            opening balance included -- so for a line with an opening the
            printed sum and the printed answer disagreed on the one screen meant
            to show how the figure was reached. Anything the named terms do not
            cover is shown as the difference, rather than left out. */}
        {(() => {
          const named = row.opening + row.stock_out - row.consumed - row.transferred_out + row.transferred_in - row.returned;
          const other = Math.round((row.on_hand - named) * 1000) / 1000;
          return (
            <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
              {row.opening} opening + {row.stock_out} stock out − {row.consumed} consumed − {row.transferred_out} out
              {' '}+ {row.transferred_in} in − {row.returned} returned
              {other !== 0 && <> {other > 0 ? '+' : '−'} {Math.abs(other)} other movements</>}
              {' '}= <b>{row.on_hand}</b>
            </p>
          );
        })()}
        {row.on_hand < 0 && (
          <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
            More consumed or handed on than Stores has issued — stock carried from before this register,
            or a spare taken without a DC. Check the dispatches on the Spare Requests register.
          </p>
        )}
        {onTransfer && row.on_hand > 0 && (
          <div className="rep-actions" style={{ position: 'static' }}>
            <button className="btn btn-primary" onClick={onTransfer}>⇄ Transfer this spare</button>
          </div>
        )}
      </section>

      <section className="rep-sec">
        <div className="rep-sec-title">Movements <span className="muted">({moves.length}{moves.length >= MOVES_CAP ? '+' : ''})</span></div>
        {/* IT SAYS WHEN IT STOPS (D-047): the drawer reads the latest
            MOVES_CAP movements, and a line with more read as complete. The
            Movements tab, filtered to the engineer, pages through the lot. */}
        {moves.length >= MOVES_CAP && (
          <div className="muted" style={{ fontSize: 12.5 }}>
            Showing the latest {MOVES_CAP} movements; older ones are not listed here. The Movements tab, filtered to
            this engineer, has them all.
          </div>
        )}
        {busy && <div className="muted" style={{ fontSize: 12.5 }}>Loading movements…</div>}
        {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
        <ol className="wf-trail">
          {moves.map((m, i) => (
            <li key={i} className={m.direction === 'IN' ? 'wf-ok' : 'wf-bad'}>
              <b>
                {m.movement === 'Stock out' ? `📤 Stock out ${m.qty}`
                  : m.movement === 'Consumption' ? `🧾 Consumed ${m.qty}`
                  : m.movement === 'Transfer in' ? `⇄ Received ${m.qty}`
                  : m.movement === 'Return' ? `↩️ Returned ${m.qty}`
                  : m.movement === 'Adjustment' ? (m.direction === 'IN' ? `± Adjusted +${m.qty}` : `± Adjusted −${m.qty}`)
                  : `⇄ Handed over ${m.qty}`}
              </b>
              <span className={`badge badge-${movementTone(m.movement)}`} style={{ marginLeft: 6 }}>{m.movement}</span>
              <span className="muted">
                {m.ref ? ` · ${m.ref_type} ${m.ref}` : ''}
                {m.moved_at ? ` · ${fmtLongDate(m.moved_at)}` : ''}
              </span>
              {(m.ucn || m.party_name || m.remarks) && (
                <div className="muted" style={{ fontSize: 12 }}>
                  {[m.ucn, m.party_name, m.remarks].filter(Boolean).join(' · ')}
                </div>
              )}
            </li>
          ))}
        </ol>
        {!busy && !err && moves.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No movements found for this line.</div>}
      </section>
    </div>
  );
}

// ===========================================================================
// ± ADJUST STOCK (0266). The user, 2026-09-30: WinMax's "eBizWiz Admin" account
// was how quantity was added to reconcile an engineer; this replaces it. + adds,
// - removes, a REASON is required and the reference (the MTN number) is kept.
// Effective on save; never edited -- a wrong one is reversed by another. The
// database refuses a person who is not active on the User Master, a part not
// on the Part Master, and a minus that would take them below zero.
// ===========================================================================
function AdjustDrawer({ engineers, onClose, onSaved }: {
  engineers: string[]; onClose: () => void; onSaved: (text: string) => void;
}) {
  const parts = useMaster('spare').values;
  const [engineer, setEngineer] = useState('');
  const [part, setPart] = useState('');
  const [dir, setDir] = useState<'add' | 'remove'>('add');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const n = Math.floor(Number(qty) || 0);
  const problem = !engineer ? 'Choose the engineer.' : !part ? 'Choose the part.' : n <= 0 ? 'Give a quantity of 1 or more.'
    : !reason.trim() ? 'Give the reason — it stays on the record.' : '';
  const save = async () => {
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr('');
    const signed = dir === 'add' ? n : -n;
    const r = await addHandstockAdjustment({ engineer, part, qty: signed, reason, reference });
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? 'Could not save the adjustment.'); return; }
    onSaved(`${engineer}: ${part.split('|')[0]} ${signed > 0 ? '+' : '−'}${n} recorded${reference.trim() ? ` (${reference.trim()})` : ''}.`);
  };
  return (
    <Drawer open onClose={onClose} title="Adjust hand stock" width={560}>
      <div className="rep-form">
        {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
        <label className="field"><span className="field-label">Engineer *</span>
          <SelectPicker value={engineer} onChange={setEngineer} placeholder="— active User Master names —" options={engineers} /></label>
        <label className="field"><span className="field-label">Part *</span>
          <PickList value={part} options={parts} onPick={setPart} placeholder="Type any part of the code or description…"
            emptyLabel={parts.length ? '— pick a part —' : '— loading parts… —'} /></label>
        <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field"><span className="field-label">Add or remove</span>
            <SelectPicker value={dir} onChange={(v) => setDir((v || 'add') as 'add' | 'remove')}
              options={[{ value: 'add', label: '＋ Add to their stock' }, { value: 'remove', label: '− Remove from their stock' }]} /></label>
          <label className="field"><span className="field-label">Quantity *</span>
            <input className="input" type="number" min={1} step={1} style={{ width: 110 }} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        </div>
        <label className="field"><span className="field-label">Reason *</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Physical count found 2 more" /></label>
        <label className="field"><span className="field-label">Reference</span>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. MTN number" /></label>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Takes effect when saved and shows on the engineer&rsquo;s movements as an <b>Adjustment</b>. It cannot be edited
          or deleted — to correct one, record another the other way. A removal cannot take them below zero.
        </p>
        <div className="rep-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save adjustment'}</button>
        </div>
      </div>
    </Drawer>
  );
}

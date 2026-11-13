import { isMissingTable } from '../lib/dberror';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, fmtLongDate, timeAgo } from '../lib/format';
import { useArrivingFilter } from '../lib/arriveWith';
import {
  listHandstockBalanceAll, handstockCountedFrom, listHandstockMovements, listAllHandstockMovements, supabaseConfigured, addHandstockAdjustment,
  handstockForEngineer, addHandstockReconciliation,
} from '../lib/supabase';
import { PickList } from '../components/ui/PickList';
import { Register as RegisterUpload } from './BulkUploads';
import { UPLOADS } from '../lib/uploads';
import { useMaster } from '../lib/masters';
import { loadCache, saveCache, isStale, SYNC_TTL_MS, startBackgroundSync, MAX_CACHED_ROWS } from '../lib/cache';
import { useAuth } from '../lib/auth';
import { useAccessScope, previewScoped, useTeamEngineers, useInactiveNames, useRegionByEngineer, regionFor } from '../lib/access';
import {
  balanceTone, byEngineer, movementTone, num, partDescription, summarise, withoutHistory,
  type HandstockBalance, type HandstockMovement, type MovementKind,
} from '../lib/handstock';
import './fieldcalls.css';
import { partial, searchScope } from '../lib/exportscope';
import { formatDay, formatDayTime, todayLocal } from '../lib/dates';
import { xlsxDownload, xlsxCell, xlsxText } from '../lib/xlsx';
import { COMPLETE, cappedAt } from '../lib/exportscope';

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
// What "From history" is, in the words the heading, the figure and the drawer
// all use.
const HIST_NOTE = 'From history = opening + imported stock outs − imported consumption: the part of this line from the old system. It is already inside Opening, Stock out and Consumed — not added to them.';

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
  // The latest physical count (0468); absent before it is applied.
  reconciled_qty: r.reconciled_qty == null ? null : num(r.reconciled_qty),
  reconciled_at: r.reconciled_at ? String(r.reconciled_at) : null,
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
  // PEOPLE WHO HAVE LEFT ARE HIDDEN, ON A SWITCH (the user, 2026-10-13:
  // "don't show [In]active employees. Or add a Toggle button to remove
  // INACTIVE USERS"). Hidden by default and remembered. Inactive = on the
  // User Master with Validity false on every row (useInactiveNames); a holder
  // the User Master does not carry is never hidden, since nothing says they
  // left. It narrows the LIST -- every count, chip, the engineer picker and
  // the CSV follow it -- and changes no balance.
  const { inactive } = useInactiveNames();
  const [hideInactive, setHideInactiveState] = useState(() => {
    try { return localStorage.getItem('rithi.handstock.hideInactive') !== '0'; } catch { return true; }
  });
  const setHideInactive = (on: boolean) => {
    setHideInactiveState(on);
    try { localStorage.setItem('rithi.handstock.hideInactive', on ? '1' : '0'); } catch { /* private window */ }
  };
  const isInactive = (r: { engineer_key: string; engineer: string }) =>
    inactive.has((r.engineer_key || r.engineer).trim().toLowerCase());
  // What this screen shows. RLS already scoped a real session; this only
  // narrows the list while an administrator previews as someone else, whose
  // identity the database never sees. See previewScoped() in lib/access.
  const scoped = useMemo(
    () => previewScoped(allRows, !!viewAs, scope, ['engineer', 'engineer_key'], ['engineer_email'], viewAs?.email),
    [allRows, viewAs, scope],
  );
  const inactiveLines = useMemo(() => scoped.filter(isInactive).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, inactive]);
  const inactivePeople = useMemo(() => new Set(scoped.filter(isInactive).map((r) => r.engineer_key)).size,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, inactive]);
  const rows = useMemo(
    () => scoped
      .filter((r) => !(hideInactive && isInactive(r)))
      // With the history ignored, the WHOLE row is restated — not just the
      // total. A screen showing 4 in hand beside a stock out of 27 invites the
      // reader to check the arithmetic and find it broken, so each component
      // loses its imported part too. The transfers and returns are untouched:
      // they are not part of the sheet era.
      .map((r) => (liveOnly ? withoutHistory(r) : r))
      // The chips read this too; grouping needs it as a value ON the row, and
      // one derivation keeps the two from disagreeing.
      .map((r) => ({ ...r, _state: r.on_hand > 0 ? 'In hand' : r.on_hand < 0 ? 'Short' : 'Settled' })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, liveOnly, hideInactive, inactive],
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
  const [reconciling, setReconciling] = useState(false);
  const [uploadingCounts, setUploadingCounts] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    onDb ? null : { tone: 'info', text: 'Connect the database in Settings to load hand stock.' },
  );

  // WHERE THE COUNT STARTS (0412): 09-Jun-2022, the WinMax opening. Said on
  // the screen, or a consumption from before it reads as lost.
  const [countedFrom, setCountedFrom] = useState<string | null>(null);
  useEffect(() => {
    if (!onDb) return;
    handstockCountedFrom().then(setCountedFrom).catch(() => setCountedFrom(null));
  }, [onDb]);

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

  const regionOf = useRegionByEngineer();
  const visibleBase = useMemo(() => {
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
  // REGION (2026-11-13): the engineer's CURRENT User Master region, on the
  // screen and in its export alike -- read when shown, never stored.
  const visible = useMemo(() => visibleBase.map((r) => ({ ...r, region: regionFor(regionOf, r.engineer) })), [visibleBase, regionOf]);

  const columns: Column<Row>[] = [
    { key: 'engineer', header: 'Engineer', width: 165 },
    { key: 'region', header: 'Region', width: 100, wrap: false },
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
    // A SUBTOTAL, NOT A TERM (the user, 2026-10-12: "Isnt the data that is
    // present is confusing?" -- From history 4 beside Opening 5 and Consumed 1
    // read as a fourth amount to add). It is the part of the line the old
    // system contributes, already inside Opening, Stock out and Consumed; said
    // on the heading, on the figure and in the line's drawer.
    { key: 'hist_net', header: 'From history', width: 110, align: 'right', wrap: false,
      headerTitle: HIST_NOTE,
      render: (r) => (liveOnly ? <span className="muted" title="Ignored — the toggle is on">—</span>
        : r.hist_net === 0 ? <span className="muted" title={HIST_NOTE}>0</span> : <span title={HIST_NOTE}>{r.hist_net}</span>) },
    { key: 'stock_out', header: 'Stock out', width: 95, align: 'right', wrap: false },
    { key: 'consumed', header: 'Consumed', width: 95, align: 'right', wrap: false },
    { key: 'transferred_in', header: 'Transfer in', width: 100, align: 'right', wrap: false },
    { key: 'transferred_out', header: 'Transfer out', width: 105, align: 'right', wrap: false },
    { key: 'returned', header: 'Returned', width: 95, align: 'right', wrap: false },
    { key: 'last_movement', header: 'Last movement', width: 135, render: (r) => fmtLongDate(r.last_movement) },
    // THE LATEST PHYSICAL COUNT (0468). The level starts from it: movements
    // entered before it are not counted, and stay on their own registers.
    { key: 'reconciled_at', header: 'Last counted', width: 160,
      accessor: (r) => (r.reconciled_at ? formatDayTime(r.reconciled_at) : ''),
      render: (r) => (r.reconciled_at
        ? <span title={`Physical count ${r.reconciled_qty ?? ''} — the level starts from this count`}>{formatDayTime(r.reconciled_at)} ({r.reconciled_qty ?? ''})</span>
        : <span className="muted">—</span>) },
  ];

  return (
    <div>
      <PageHeader
        onRefresh={() => void load()}
        refreshing={busy}
        title="Hand Stock"
        subtitle={'Stock level per engineer and spare: opening + stock out from Stores − consumption − transfers out + transfers in − returns ± adjustments.'
          + ' Where a line has been reconciled, it starts from the physical count and only what was entered after the count is added or taken off.'
          + (countedFrom ? ` Counted from ${formatDay(countedFrom)}: anything older is inside that day's opening balance and is not counted again.` : '')
          + ' Labour charges (service, transport, installation) are not hand stock.'}
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
        actions={(can('stock.transfer') || can('consumption.reconcile') || can('handstock.reconcile')) && (
          <div className="row" style={{ gap: 6 }}>
            {can('handstock.reconcile') && onDb && (
              <button className="btn" onClick={() => setReconciling(true)}
                title="Set an engineer's hand stock to a physically verified count, part by part">🧮 Reconcile</button>
            )}
            {can('handstock.reconcile') && onDb && COUNT_UPLOAD && (
              <button className="btn" onClick={() => setUploadingCounts(true)}
                title="Load physical counts for several engineers from a CSV file">⤵ Upload counts</button>
            )}
            {can('consumption.reconcile') && onDb && (
              <button className="btn" onClick={() => setAdjusting(true)}
                title="Add or remove quantity from an engineer's hand stock, with a reason">± Adjust stock</button>
            )}
            {can('stock.transfer') && <button className="btn btn-primary" onClick={() => navigate('/stock-transfer')}>⇄ Transfer stock</button>}
          </div>
        )}
      />

      {uploadingCounts && COUNT_UPLOAD && (
        <Drawer open onClose={() => { setUploadingCounts(false); void load(); }} title="Upload physical counts" width={860}>
          <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <button className="btn btn-sm" onClick={downloadCountTemplate}>⬇ Download template</button>
            <span className="muted" style={{ fontSize: 12 }}>A CSV with the four headings, ready to fill.</span>
          </div>
          <ul className="muted" style={{ fontSize: 12.5, marginTop: 0, paddingLeft: 18 }}>
            <li><b>Engineer</b>: the name exactly as on the User Master; only active users are loaded.</li>
            <li><b>Part</b>: the Part Master&rsquo;s Item Detail, code and description as one value (CODE|Description).</li>
            <li><b>Physical Qty</b>: the count, a whole number, 0 or more.</li>
            <li><b>Remarks</b>: optional.</li>
            <li>One row per engineer + part counted. It previews first; nothing is written until you press Upload.</li>
          </ul>
          <RegisterUpload def={COUNT_UPLOAD} count={null} onDone={() => void load()} />
        </Drawer>
      )}

      {reconciling && (
        <ReconcileDrawer engineers={team.names} onClose={() => setReconciling(false)}
          onSaved={(text) => { setReconciling(false); setMsg({ tone: 'ok', text }); void load(); }} />
      )}

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
            {/* Narrows the list, like the chips -- but kept beside the other
                switch because it, too, is remembered and stays on. */}
            <button
              className={`chip ${hideInactive ? 'chip-on' : ''}`}
              onClick={() => setHideInactive(!hideInactive)}
              title={hideInactive
                ? `Hiding ${inactivePeople} inactive user${inactivePeople === 1 ? '' : 's'} on the User Master (${inactiveLines} line${inactiveLines === 1 ? '' : 's'}). Click to show them.`
                : 'Showing everyone, including users marked inactive on the User Master. Click to hide them.'}
            >
              {hideInactive ? `🚫 Inactive users hidden${inactivePeople ? ` (${inactivePeople})` : ''}` : '👥 Inactive users shown'}
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
            historyIgnored={liveOnly}
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

  const regionOf = useRegionByEngineer();
  const visibleBase = useMemo(() => {
    const q = search.trim().toLowerCase();
    return moves.filter((m) => {
      if (kind && m.movement !== kind) return false;
      if (!q) return true;
      return [m.engineer, m.part, m.part_code, m.ref, m.ucn, m.call_number, m.party_name, m.remarks]
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [moves, search, kind]);
  // REGION (2026-11-13): the engineer's CURRENT User Master region, on the
  // screen and in its export alike -- read when shown, never stored.
  const visible = useMemo(() => visibleBase.map((r) => ({ ...r, region: regionFor(regionOf, r.engineer) })), [visibleBase, regionOf]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    moves.forEach((m) => { c[m.movement] = (c[m.movement] ?? 0) + 1; });
    return c;
  }, [moves]);

  const columns: Column<MoveRow>[] = [
    { key: 'moved_at', header: 'When', width: 135, render: (m) => fmtLongDate(m.moved_at) },
    { key: 'movement', header: 'Movement', width: 120, wrap: false, render: (m) => <span className={`badge badge-${movementTone(m.movement)}`}>{m.movement}</span> },
    { key: 'engineer', header: 'Engineer', width: 160 },
    { key: 'region', header: 'Region', width: 100, wrap: false },
    { key: 'part_code', header: 'Spare', width: 115, wrap: false },
    { key: 'part', header: 'Description', width: 220, accessor: (m) => partDescription(m.part) || m.part, render: (m) => partDescription(m.part) || m.part },
    { key: 'qty', header: 'Qty', width: 70, align: 'right', wrap: false, render: (m) => <span className={m.direction === 'IN' ? 'wf-in' : 'wf-out'}>{m.direction === 'IN' ? '+' : '−'}{m.qty}</span> },
    { key: 'ref', header: 'Reference', width: 140, wrap: false },
    { key: 'ref_type', header: 'Against', width: 100, wrap: false },
    { key: 'party_name', header: 'Party / other engineer', width: 200 },
    { key: 'remarks', header: 'Remarks', width: 180 },
  ];

  const KINDS: MovementKind[] = ['Stock out', 'Consumption', 'Transfer in', 'Transfer out', 'Return', 'Adjustment', 'Reconciliation'];

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
function MovementTrail({ row, onTransfer, historyIgnored = false }: { row: Row; onTransfer?: () => void; historyIgnored?: boolean }) {
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

  // Newest first, as read; numbered and balanced OLDEST first -- only when
  // the whole trail is here (see the table). FROM ZERO: the opening balance
  // is itself a movement on the trail ("Opening"), so starting from
  // row.opening counted it twice -- every Balance after read the opening too
  // high (reported 2026-10-12 on EM-851 / SIVAKUMAR: 10 and 9 where the stock
  // level is 4).
  const complete = moves.length < MOVES_CAP;
  const trail = useMemo(() => {
    const n = moves.length;
    let bal = 0;
    const balances: number[] = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      const m = moves[i];
      bal += (m.direction === 'IN' ? 1 : -1) * (Number(m.qty) || 0);
      balances[i] = Math.round(bal * 1000) / 1000;
    }
    return moves.map((m, i) => ({ n: n - i, m, balance: balances[i] }));
  }, [moves]);
  // A COMPLETE TRAIL MUST END ON THE STOCK LEVEL. Said when it does not,
  // rather than leaving two figures on one screen to disagree in silence. Not
  // asked while the history is ignored: the level is then restated without
  // the imported movements the trail still lists.
  const trailEnd = trail.length ? trail[0].balance : 0;
  const trailDisagrees = complete && !historyIgnored && !busy && !err && trail.length > 0
    && Math.abs(trailEnd - (Number(row.on_hand) || 0)) > 0.0005;

  const downloadTrail = (kind: 'xlsx' | 'csv') => {
    const cols: { key: string; header: string }[] = [
      { key: 'n', header: '#' }, { key: 'moved_at', header: 'Date' }, { key: 'movement', header: 'Movement' },
      { key: 'in', header: 'In' }, { key: 'out', header: 'Out' },
      ...(complete ? [{ key: 'balance', header: 'Balance after' }] : []),
      { key: 'ref_type', header: 'Reference type' }, { key: 'ref', header: 'Reference' },
      { key: 'ucn', header: 'UCN' }, { key: 'call_number', header: 'Call No' },
      { key: 'party_name', header: 'Party / with' }, { key: 'remarks', header: 'Remarks' },
    ];
    const rows = trail.map((t) => ({
      n: t.n, moved_at: t.m.moved_at, movement: t.m.movement,
      in: t.m.direction === 'IN' ? t.m.qty : '', out: t.m.direction === 'OUT' ? t.m.qty : '',
      balance: t.balance, ref_type: t.m.ref_type, ref: t.m.ref, ucn: t.m.ucn,
      call_number: t.m.call_number, party_name: t.m.party_name, remarks: t.m.remarks,
    } as Record<string, unknown>));
    const name = `hand-stock-${String(row.engineer).replace(/\W+/g, '-')}-${String(row.part_code).replace(/\W+/g, '-')}-${todayLocal()}`;
    if (kind === 'csv') {
      csvExport(`${name}.csv`, cols, rows.map((r) => Object.fromEntries(cols.map((c) => [c.key, xlsxText(r[c.key])]))),
        complete ? COMPLETE : cappedAt(moves.length, MOVES_CAP));
      return;
    }
    xlsxDownload(`${name}.xlsx`, [
      { name: 'Movements', columns: cols.map((c) => c.header),
        rows: rows.map((r) => Object.fromEntries(cols.map((c) => [c.header, xlsxCell(r[c.key])]))) },
      // THE FILE CARRIES THE STOCK LEVEL IT EXPLAINS, so it reads on its own.
      { name: 'Stock level', columns: ['Item', 'Value'], rows: [
        { Item: 'Engineer', Value: row.engineer }, { Item: 'Spare', Value: row.part },
        { Item: 'Opening balance', Value: row.opening }, { Item: 'Stock out (Stores)', Value: row.stock_out },
        { Item: 'Consumed', Value: row.consumed }, { Item: 'Transferred in', Value: row.transferred_in },
        { Item: 'Transferred out', Value: row.transferred_out }, { Item: 'Returned (MRN)', Value: row.returned },
        { Item: 'On hand', Value: row.on_hand },
        { Item: 'Movements', Value: complete ? `all ${moves.length}` : `the latest ${moves.length} only -- older ones are not in this file` },
      ] },
    ], complete ? COMPLETE : cappedAt(moves.length, MOVES_CAP));
  };

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
        {!historyIgnored && row.hist_net !== 0 && (
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
            Of this, <b>{row.hist_net}</b> comes from the old system (opening + imported stock outs − imported consumption).
            It is already counted in the figures above — the list’s <b>From history</b> column shows it, it is not added to them.
          </p>
        )}
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
        {/* A TABLE, WITH A DOWNLOAD (the user, 2026-10-08: "Convert this into
            a Table and add Download provision ... I need to investigate").
            One row per movement, In and Out in their own columns, and the
            balance AFTER each one, worked from zero oldest first (the opening
            is the first movement) -- so the row where the figure stops matching the paper is
            the row to look at. The balance is left out when the trail is cut
            at MOVES_CAP: a running figure that starts part-way is wrong on
            every row. */}
        {trailDisagrees && (
          <div className="sheet-banner sheet-banner-error" style={{ marginBottom: 6 }}>
            <span>The movements below add up to <b>{trailEnd}</b>, but the stock level is <b>{Number(row.on_hand) || 0}</b>. Ask the Spare Coordinator to check this line.</span>
          </div>
        )}
        {moves.length > 0 && (
          <>
            <div className="row" style={{ gap: 6, margin: '4px 0 8px' }}>
              <button className="btn btn-sm" onClick={() => downloadTrail('xlsx')}>⭳ Download (Excel)</button>
              <button className="btn btn-sm" onClick={() => downloadTrail('csv')}>⭳ CSV</button>
            </div>
            <div className="assoc-scroll">
              <table className="assoc-table" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th>#</th><th>Date</th><th>Movement</th><th style={{ textAlign: 'right' }}>In</th><th style={{ textAlign: 'right' }}>Out</th>
                    {complete && <th style={{ textAlign: 'right' }}>Balance after</th>}
                    <th>Reference</th><th>UCN</th><th>Party / with</th><th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {trail.map((t) => (
                    <tr key={t.n}>
                      <td>{t.n}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDayTime(t.m.moved_at) || '—'}</td>
                      <td><span className={`badge badge-${movementTone(t.m.movement)}`}>{t.m.movement}</span></td>
                      <td style={{ textAlign: 'right' }}>{t.m.direction === 'IN' ? t.m.qty : ''}</td>
                      <td style={{ textAlign: 'right' }}>{t.m.direction === 'OUT' ? t.m.qty : ''}</td>
                      {complete && <td style={{ textAlign: 'right' }}><b>{t.balance}</b></td>}
                      <td>{[t.m.ref_type, t.m.ref].filter(Boolean).join(' ')}</td>
                      <td>{t.m.ucn}</td>
                      <td>{t.m.party_name}</td>
                      <td>{t.m.remarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
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

// ===========================================================================
// 🧮 RECONCILE (0468). The user, 2026-11-11: "When i Reconcile, it should take
// the Date and Time of Reconcilliation and Igonre all past transactions for
// Calculation but those should be retained as Historical Data ... i will be
// setting the Opening Stock which is physcially verified".
//
// Choose the engineer; every part on their hand stock is listed with what the
// system says. Type the PHYSICAL count beside the parts you counted -- a part
// left blank is NOT counted and keeps its figure (the user's choice: only the
// parts entered). Add a part they hold that the system does not show. One
// save is one reconciliation: the database stamps who and when, and what the
// system said, and from then on the line starts from the count -- anything
// ENTERED before it is not counted again, anything entered after it is.
// Needs `handstock.reconcile`. Never edited: a wrong count is counted again.
// ===========================================================================
interface CountLine { part: string; system: number; physical: string }

// The physical-count upload, which lives here rather than on Bulk Uploads.
const COUNT_UPLOAD = UPLOADS.find((d) => d.key === 'handstock_reconciliation');

// ITS TEMPLATE (the user, 2026-11-13: "Give me the Template ... Add option in
// the Screen for Download Template"): the headings only. An example row would
// be one more row to remember to delete before uploading. A blank form, not
// data, so it is not behind the export permission.
const COUNT_TEMPLATE_HEADERS = ['Engineer', 'Part', 'Physical Qty', 'Remarks'];
function downloadCountTemplate() {
  const blob = new Blob([COUNT_TEMPLATE_HEADERS.join(',') + '\r\n'], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'hand-stock-physical-count-template.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The Reconcile list is GROUPED by the system quantity (the user, 2026-11-13:
// "a Grouping based on 0 Qty and More than 0"). A balance can go below zero
// since 0401, so that group is shown on its own when any part has one rather
// than being folded into either of the two asked for.
const COUNT_GROUPS: { key: string; title: string; test: (n: number) => boolean }[] = [
  { key: 'pos', title: 'More than 0', test: (n) => n > 0 },
  { key: 'zero', title: '0', test: (n) => n === 0 },
  { key: 'neg', title: 'Below 0', test: (n) => n < 0 },
];
type CountSort = 'part-asc' | 'part-desc' | 'qty-desc' | 'qty-asc';
const COUNT_SORTS: { value: CountSort; label: string }[] = [
  { value: 'part-asc', label: 'Part No (A → Z)' },
  { value: 'part-desc', label: 'Part No (Z → A)' },
  { value: 'qty-desc', label: 'Qty (high → low)' },
  { value: 'qty-asc', label: 'Qty (low → high)' },
];

function ReconcileDrawer({ engineers, onClose, onSaved }: {
  engineers: string[]; onClose: () => void; onSaved: (text: string) => void;
}) {
  const parts = useMaster('spare').values;
  const [engineer, setEngineer] = useState('');
  const [lines, setLines] = useState<CountLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<CountSort>('part-asc');
  const [adding, setAdding] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLines([]); setErr('');
    if (!engineer) return;
    let live = true;
    setLoading(true);
    handstockForEngineer(engineer, 1000, { includeEmpty: true })
      .then((rows) => {
        if (!live) return;
        setLines(rows.map((r) => ({ part: String(r.part ?? r.part_code ?? ''), system: num(r.on_hand), physical: '' }))
          .filter((l) => l.part)
          .sort((a, b) => a.part.localeCompare(b.part)));
      })
      .catch((e) => { if (live) setErr(`Could not load ${engineer}'s hand stock: ${e instanceof Error ? e.message : String(e)}`); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [engineer]);

  const addPart = (p: string) => {
    setAdding('');
    if (!p) return;
    const key = p.trim().toLowerCase();
    if (lines.some((l) => l.part.trim().toLowerCase() === key)) { setFilter(p.split('|')[0]); return; }
    setLines((ls) => [{ part: p, system: 0, physical: '' }, ...ls]);
  };
  const setPhysical = (part: string, v: string) =>
    setLines((ls) => ls.map((l) => (l.part === part ? { ...l, physical: v } : l)));

  const counted = lines.filter((l) => l.physical.trim() !== '');
  const bad = counted.filter((l) => { const n = Number(l.physical); return !Number.isInteger(n) || n < 0; });
  const differ = counted.filter((l) => Number(l.physical) !== l.system);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const got = q ? lines.filter((l) => l.part.toLowerCase().includes(q)) : lines;
    const code = (l: CountLine) => l.part.split('|')[0];
    const byPart = (a: CountLine, b: CountLine) => code(a).localeCompare(code(b), undefined, { numeric: true });
    const cmp = sort === 'part-asc' ? byPart
      : sort === 'part-desc' ? (a: CountLine, b: CountLine) => byPart(b, a)
        : sort === 'qty-desc' ? (a: CountLine, b: CountLine) => (b.system - a.system) || byPart(a, b)
          : (a: CountLine, b: CountLine) => (a.system - b.system) || byPart(a, b);
    return [...got].sort(cmp);
  }, [lines, filter, sort]);
  const grouped = useMemo(() => COUNT_GROUPS
    .map((g) => ({ ...g, rows: shown.filter((l) => g.test(l.system)) }))
    .filter((g) => shown.length > 0 && (g.rows.length > 0 || g.key !== 'neg')), [shown]);

  const problem = !engineer ? 'Choose the engineer.'
    : !counted.length ? 'Type the physical count beside at least one part.'
      : bad.length ? `A count must be a whole number, 0 or more — check ${bad.map((l) => l.part.split('|')[0]).join(', ')}.` : '';

  const save = async () => {
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr('');
    const r = await addHandstockReconciliation({
      engineer, remarks,
      lines: counted.map((l) => ({ part: l.part, physical_qty: Number(l.physical) })),
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? 'Could not save the reconciliation.'); return; }
    onSaved(`${engineer}: ${counted.length} part${counted.length === 1 ? '' : 's'} reconciled to the physical count`
      + (differ.length ? ` (${differ.length} differed from the system)` : ' (all agreed with the system)')
      + '. Movements entered before now are no longer counted on those parts; they stay on record.');
  };

  return (
    <Drawer open onClose={onClose} title="Reconcile hand stock" width={760}>
      <div className="rep-form">
        {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
        <label className="field"><span className="field-label">Engineer *</span>
          <SelectPicker value={engineer} onChange={setEngineer} placeholder="— active User Master names —" options={engineers} /></label>
        {engineer && (
          <>
            <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 260px' }}><span className="field-label">Find a part on the list</span>
                <input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Code or description" /></label>
              <label className="field" style={{ flex: '0 1 200px' }}><span className="field-label">Sort by</span>
                <SelectPicker value={sort} onChange={(v) => setSort((v || 'part-asc') as CountSort)} options={COUNT_SORTS} /></label>
              <label className="field" style={{ flex: '1 1 300px' }}><span className="field-label">Add a part not on the list</span>
                <PickList value={adding} options={parts} onPick={addPart} placeholder="Type any part of the code or description…"
                  emptyLabel={parts.length ? '— pick a part —' : '— loading parts… —'} /></label>
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {loading ? 'Loading their hand stock…'
                : `${lines.length} part${lines.length === 1 ? '' : 's'} listed · ${counted.length} counted · ${differ.length} differ from the system. A part left blank is not counted and keeps its figure.`}
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
              <table className="assoc-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr><th>Spare</th><th>Description</th><th style={{ textAlign: 'right' }}>System</th><th style={{ textAlign: 'right' }}>Physical</th><th style={{ textAlign: 'right' }}>Difference</th></tr>
                </thead>
                {grouped.map((g) => (
                <tbody key={g.key}>
                  <tr className="req-count-group"><th colSpan={5} style={{ textAlign: 'left' }}>
                    System qty {g.title} · {g.rows.length} part{g.rows.length === 1 ? '' : 's'}
                  </th></tr>
                  {g.rows.map((l) => {
                    const has = l.physical.trim() !== '';
                    const diff = has ? Number(l.physical) - l.system : 0;
                    return (
                      <tr key={l.part}>
                        <td style={{ whiteSpace: 'nowrap' }}>{l.part.split('|')[0]}</td>
                        <td>{partDescription(l.part) || l.part}</td>
                        <td style={{ textAlign: 'right' }}>{l.system}</td>
                        <td style={{ textAlign: 'right' }}>
                          <input className="input" type="number" min={0} step={1} style={{ width: 90, textAlign: 'right' }}
                            aria-label={`Physical count of ${l.part.split('|')[0]}`}
                            value={l.physical} onChange={(e) => setPhysical(l.part, e.target.value)} placeholder="—" />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {!has ? <span className="muted">not counted</span>
                            : diff === 0 ? <span className="muted">0</span>
                              : <b className={diff > 0 ? 'wf-in' : 'wf-out'}>{diff > 0 ? '+' : '−'}{Math.abs(diff)}</b>}
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && !g.rows.length && (
                    <tr><td colSpan={5} className="muted">None.</td></tr>
                  )}
                </tbody>
                ))}
                {!loading && !shown.length && (
                  <tbody><tr><td colSpan={5} className="muted">{lines.length ? 'No part on the list matches.' : 'The system shows no hand stock for them — add the parts you counted.'}</td></tr></tbody>
                )}
              </table>
            </div>
            <label className="field"><span className="field-label">Remarks</span>
              <input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Counted at the Chennai branch with the engineer" /></label>
          </>
        )}
        <p className="muted" style={{ fontSize: 12.5 }}>
          On save, each counted part&rsquo;s level becomes the physical count, recorded with your name and the date and time.
          Anything entered for that part <i>before</i> the count is no longer counted. It stays on its own register
          (stock out, consumption, transfer, return) as history. Anything entered <i>after</i> the count is added or taken off as usual.
          A count cannot be edited or deleted; to correct one, count that part again.
        </p>
        <div className="rep-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || loading || !engineer} onClick={() => void save()}>
            {busy ? 'Saving…' : `Save reconciliation${counted.length ? ` (${counted.length})` : ''}`}
          </button>
        </div>
      </div>
    </Drawer>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { csvExport, fmtLongDate, timeAgo } from '../lib/format';
import { listHandstockBalance, listHandstockMovements, supabaseConfigured } from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { useAuth } from '../lib/auth';
import {
  balanceTone, byEngineer, movementTone, num, partDescription, summarise,
  type HandstockBalance, type HandstockMovement, type MovementKind,
} from '../lib/handstock';
import './fieldcalls.css';

// ===========================================================================
// HAND STOCK — the stock level an engineer is carrying, per spare.
//
//   Stock Level = Stock Out (Stores) − Consumption − Transfer From + Transfer To
//
// Nothing is entered here: the movements are the Stores dispatch on a spare
// request, the consumption on a call report, and the hand-overs recorded on
// Stock Transfer. Reads `handstock_balance` / `handstock_movements` (migration
// 0022_handstock.sql), which run with the caller's rights — so an engineer
// sees their own stock, an RM their sub-tree, an admin everyone's.
//
// Stock Transfer (/stock-transfer) is where a hand-over is recorded, and it
// reads the same derivation (`engineer_stock` is a view over the balance
// below), so the two screens cannot disagree.
// ===========================================================================

const CACHE_KEY = 'handstock';
const MIGRATION_HINT = 'Hand stock needs migration 0022_handstock.sql — run it in the Supabase SQL editor (apply bundle: HandStock_X.sql).';

type Row = HandstockBalance & { id: string };
type Holding = 'held' | 'short' | 'settled' | '';

const asRow = (r: Record<string, unknown>): Row => ({
  engineer_key: String(r.engineer_key ?? ''),
  engineer: String(r.engineer ?? ''),
  engineer_email: String(r.engineer_email ?? ''),
  part_code: String(r.part_code ?? ''),
  part: String(r.part ?? ''),
  stock_out: num(r.stock_out),
  consumed: num(r.consumed),
  transferred_in: num(r.transferred_in),
  transferred_out: num(r.transferred_out),
  on_hand: num(r.on_hand),
  last_in: r.last_in ? String(r.last_in) : null,
  last_out: r.last_out ? String(r.last_out) : null,
  last_movement: r.last_movement ? String(r.last_movement) : null,
  movements: num(r.movements),
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
  const { can } = useAuth();
  const navigate = useNavigate();
  const onDb = supabaseConfigured();
  const cached = onDb ? loadCache<Row>(CACHE_KEY) : null;
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [search, setSearch] = useState('');
  const [engineerFilter, setEngineerFilter] = useState('');
  const [holding, setHolding] = useState<Holding>('held');
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [detail, setDetail] = useState<Row | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    onDb ? null : { tone: 'info', text: 'Connect the database in Settings to load hand stock.' },
  );

  const load = async () => {
    if (!onDb) return;
    setBusy(true); setMsg({ tone: 'info', text: 'Loading hand stock…' });
    try {
      const mapped = (await listHandstockBalance()).map(asRow);
      setRows(mapped); setLastSync(saveCache(CACHE_KEY, mapped));
      setMsg({ tone: 'ok', text: `Synced ${mapped.length} engineer/spare line${mapped.length === 1 ? '' : 's'}.` });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setMsg({
        tone: 'error',
        text: /handstock|does not exist|schema cache/i.test(text) ? MIGRATION_HINT : `Load failed: ${text}`,
      });
    } finally { setBusy(false); }
  };
  useEffect(() => {
    if (onDb && rows.length && !isStale(lastSync)) setMsg({ tone: 'info', text: `Showing cached data — synced ${timeAgo(lastSync)}. ↻ Refresh to update.` });
    else void load();
    const id = onDb ? window.setInterval(() => void load(), SYNC_TTL_MS) : undefined;
    return () => { if (id) window.clearInterval(id); };
    // eslint-disable-next-line
  }, []);

  const totals = useMemo(() => summarise(rows), [rows]);
  const engineers = useMemo(() => byEngineer(rows), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (engineerFilter && r.engineer_key !== engineerFilter) return false;
      if (holding === 'held' && r.on_hand <= 0) return false;
      if (holding === 'short' && r.on_hand >= 0) return false;
      if (holding === 'settled' && r.on_hand !== 0) return false;
      if (!q) return true;
      return [r.engineer, r.engineer_email, r.part, r.part_code].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, search, engineerFilter, holding]);

  const columns: Column<Row>[] = [
    { key: 'engineer', header: 'Engineer', width: 165 },
    { key: 'part_code', header: 'Spare', width: 115, wrap: false },
    { key: 'part', header: 'Description', width: 235, accessor: (r) => partDescription(r.part) || r.part, render: (r) => partDescription(r.part) || r.part },
    { key: 'on_hand', header: 'Stock level', width: 100, align: 'right', wrap: false, render: (r) => stockBadge(r.on_hand) },
    { key: 'stock_out', header: 'Stock out', width: 95, align: 'right', wrap: false },
    { key: 'consumed', header: 'Consumed', width: 95, align: 'right', wrap: false },
    { key: 'transferred_in', header: 'Transfer in', width: 100, align: 'right', wrap: false },
    { key: 'transferred_out', header: 'Transfer out', width: 105, align: 'right', wrap: false },
    { key: 'last_movement', header: 'Last movement', width: 135, render: (r) => fmtLongDate(r.last_movement) },
  ];

  return (
    <div>
      <PageHeader
        title="Hand Stock"
        subtitle="Stock level per engineer and spare: stock out from Stores − consumption − transfers out + transfers in."
        icon="🎒"
        actions={can('stock.transfer') && <button className="btn btn-primary" onClick={() => navigate('/stock-transfer')}>⇄ Transfer stock</button>}
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <KpiGrid>
        <KpiCard label="Units in the field" value={totals.onHand} icon="🎒" tone="primary" sub="held across every engineer" />
        <KpiCard label="Engineers holding" value={totals.engineers} icon="👤" tone="info" sub="with at least one spare in hand" />
        <KpiCard label="Spares held" value={totals.partCodes} icon="🔩" tone="info" sub="distinct part codes" />
        <KpiCard label="Stock out" value={totals.stockOut} icon="📤" tone="success" sub="issued by Stores on a DC" />
        <KpiCard label="Consumed" value={totals.consumed} icon="🧾" tone="neutral" sub="used on calls" />
        <KpiCard label="Transferred" value={totals.transferred} icon="⇄" tone="info" sub="handed between engineers" />
        <KpiCard label="Short" value={totals.shortLines} icon="⚠️" tone={totals.shortLines ? 'danger' : 'neutral'} sub="taken without a stock out" />
      </KpiGrid>

      <div className="stage-chips">
        <button className={`chip ${holding === 'held' ? 'chip-on' : ''}`} onClick={() => setHolding('held')}>In hand <b>{rows.filter((r) => r.on_hand > 0).length}</b></button>
        <button className={`chip ${holding === 'short' ? 'chip-on' : ''}`} onClick={() => setHolding('short')}>⚠️ Short <b>{totals.shortLines}</b></button>
        <button className={`chip ${holding === 'settled' ? 'chip-on' : ''}`} onClick={() => setHolding('settled')}>Settled <b>{rows.filter((r) => r.on_hand === 0).length}</b></button>
        <button className={`chip ${holding === '' ? 'chip-on' : ''}`} onClick={() => setHolding('')}>All <b>{rows.length}</b></button>
      </div>

      <DataTable<Row>
        columns={columns}
        rows={visible}
        getRowId={(r) => r.id}
        onRowClick={(r) => setDetail(r)}
        storageKey="handstock"
        rowsBeforeScroll={14}
        dense
        emptyText={rows.length ? 'No lines match this filter.' : 'No hand stock yet — Refresh to load.'}
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="Engineer, part code, description…" />
            <select className="select" value={engineerFilter} onChange={(e) => setEngineerFilter(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">All engineers</option>
              {engineers.map((e) => <option key={e.engineer_key} value={e.engineer_key}>{e.engineer} ({e.onHand})</option>)}
            </select>
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off" title={`Last synced ${new Date(lastSync).toLocaleString()}`}>⟳ {timeAgo(lastSync)}</span>}
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('hand-stock.csv', columns.map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />

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
    listHandstockMovements(row.engineer_key, row.part_code)
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
          {field('Stock out (Stores)', row.stock_out)}
          {field('Consumed', row.consumed)}
          {field('Transferred in', row.transferred_in)}
          {field('Transferred out', row.transferred_out)}
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
          {row.stock_out} − {row.consumed} − {row.transferred_out} + {row.transferred_in} = <b>{row.on_hand}</b>
        </p>
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
        <div className="rep-sec-title">Movements <span className="muted">({moves.length})</span></div>
        {busy && <div className="muted" style={{ fontSize: 12.5 }}>Loading movements…</div>}
        {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
        <ol className="wf-trail">
          {moves.map((m, i) => (
            <li key={i} className={m.direction === 'IN' ? 'wf-ok' : 'wf-bad'}>
              <b>
                {m.movement === 'Stock out' ? `📤 Stock out ${m.qty}`
                  : m.movement === 'Consumption' ? `🧾 Consumed ${m.qty}`
                  : m.movement === 'Transfer in' ? `⇄ Received ${m.qty}`
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

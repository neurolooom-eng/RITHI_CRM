import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { csvExport, fmtLongDate, timeAgo } from '../lib/format';
import { listHandstockBalance, listHandstockMovements, supabaseConfigured } from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import {
  balanceTone, byEngineer, num, partDescription, summarise,
  type HandstockBalance, type HandstockMovement,
} from '../lib/handstock';
import './fieldcalls.css';

// ===========================================================================
// HAND STOCK — the spares an engineer is actually carrying.
//
// Everything here is derived, not entered: a spare acknowledged as received
// goes in, a spare consumed against a call goes out, and what is left is hand
// stock. One row per engineer + part, with the movement trail behind it.
//
// Reads the `handstock_balance` / `handstock_movements` views (migration
// 0016_handstock.sql). They run with the caller's rights, so the rows match
// what Spare Requests and Spare Consumption already show that user: their own
// stock for an engineer, the sub-tree for an RM, everything for an admin.
// ===========================================================================

const CACHE_KEY = 'handstock';
const MIGRATION_HINT = 'Hand stock needs migration 0016_handstock.sql — run it in the Supabase SQL editor (apply bundle: spare_requests).';

type Row = HandstockBalance & { id: string };
type Holding = 'held' | 'short' | 'settled' | '';

const asRow = (r: Record<string, unknown>): Row => ({
  engineer_key: String(r.engineer_key ?? ''),
  engineer: String(r.engineer ?? ''),
  engineer_email: String(r.engineer_email ?? ''),
  part_code: String(r.part_code ?? ''),
  part: String(r.part ?? ''),
  received: num(r.received),
  consumed: num(r.consumed),
  on_hand: num(r.on_hand),
  last_in: r.last_in ? String(r.last_in) : null,
  last_out: r.last_out ? String(r.last_out) : null,
  last_movement: r.last_movement ? String(r.last_movement) : null,
  movements: num(r.movements),
  id: `${String(r.engineer_key ?? '')}::${String(r.part_code ?? '')}`,
});

const asMovement = (r: Record<string, unknown>): HandstockMovement => ({
  direction: String(r.direction ?? '') === 'IN' ? 'IN' : 'OUT',
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
  const onDb = supabaseConfigured();
  const cached = onDb ? loadCache<Row>(CACHE_KEY) : null;
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [search, setSearch] = useState('');
  const [engineerKey, setEngineerKey] = useState('');
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
      setMsg({ tone: 'ok', text: `Synced ${mapped.length} engineer/part line${mapped.length === 1 ? '' : 's'}.` });
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
      if (engineerKey && r.engineer_key !== engineerKey) return false;
      if (holding === 'held' && r.on_hand <= 0) return false;
      if (holding === 'short' && r.on_hand >= 0) return false;
      if (holding === 'settled' && r.on_hand !== 0) return false;
      if (!q) return true;
      return [r.engineer, r.engineer_email, r.part, r.part_code].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, search, engineerKey, holding]);

  const columns: Column<Row>[] = [
    { key: 'engineer', header: 'Engineer', width: 170 },
    { key: 'part_code', header: 'Part', width: 120, wrap: false },
    { key: 'part', header: 'Description', width: 260, accessor: (r) => partDescription(r.part) || r.part, render: (r) => partDescription(r.part) || r.part },
    { key: 'on_hand', header: 'In hand', width: 90, align: 'right', wrap: false, render: (r) => stockBadge(r.on_hand) },
    { key: 'received', header: 'Received', width: 90, align: 'right', wrap: false },
    { key: 'consumed', header: 'Consumed', width: 95, align: 'right', wrap: false },
    { key: 'last_in', header: 'Last receipt', width: 130, render: (r) => fmtLongDate(r.last_in) },
    { key: 'last_out', header: 'Last consumed', width: 130, render: (r) => fmtLongDate(r.last_out) },
    { key: 'movements', header: 'Moves', width: 70, align: 'right', wrap: false },
  ];

  return (
    <div>
      <PageHeader
        title="Hand Stock"
        subtitle="Spares an engineer is holding — every acknowledged receipt, less everything consumed on a call."
        icon="🎒"
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <KpiGrid>
        <KpiCard label="Units in the field" value={totals.onHand} icon="🎒" tone="primary" sub="held across every engineer" />
        <KpiCard label="Engineers holding" value={totals.engineers} icon="👤" tone="info" sub="with at least one part in hand" />
        <KpiCard label="Parts held" value={totals.partCodes} icon="🔩" tone="info" sub="distinct part codes" />
        <KpiCard label="Received" value={totals.received} icon="📥" tone="success" sub="acknowledged into hand stock" />
        <KpiCard label="Consumed" value={totals.consumed} icon="🧾" tone="neutral" sub="used on calls" />
        <KpiCard label="Short" value={totals.shortLines} icon="⚠️" tone={totals.shortLines ? 'danger' : 'neutral'} sub="consumed more than received" />
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
            <select className="select" value={engineerKey} onChange={(e) => setEngineerKey(e.target.value)} style={{ maxWidth: 220 }}>
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
        {detail && <MovementTrail row={detail} />}
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The movement trail behind one line: every receipt and every consumption, so
// a disputed balance can be read back to the OR number or the call it came
// from. Loaded on open — the register itself only needs the netted figure.
// ---------------------------------------------------------------------------
function MovementTrail({ row }: { row: Row }) {
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
        <div className="rep-sec-title">In hand {stockBadge(row.on_hand)}</div>
        <div className="rep-grid">
          {field('Engineer', row.engineer)}
          {field('Email', row.engineer_email)}
          {field('Part', row.part)}
          {field('Received', row.received)}
          {field('Consumed', row.consumed)}
          {field('Last movement', fmtLongDate(row.last_movement))}
        </div>
        {row.on_hand < 0 && (
          <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
            More consumed than this module has seen received — stock carried before receipts were acknowledged,
            or a dispatch nobody acknowledged. Check the receipts on the Spare Requests register.
          </p>
        )}
      </section>

      <section className="rep-sec">
        <div className="rep-sec-title">Movements <span className="muted">({moves.length})</span></div>
        {busy && <div className="muted" style={{ fontSize: 12.5 }}>Loading movements…</div>}
        {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
        <ol className="wf-trail">
          {moves.map((m, i) => (
            <li key={i} className={m.direction === 'IN' ? 'wf-ok' : 'wf-bad'}>
              <b>{m.direction === 'IN' ? `📥 Received ${m.qty}` : `🧾 Consumed ${m.qty}`}</b>
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

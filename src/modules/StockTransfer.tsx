import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { csvExport, fmtLongDate, timeAgo, todayISO } from '../lib/format';
import { listUsers } from '../lib/sheets';
import {
  listEngineerStock, listAllStock, addStockTransfer, listStockTransfers,
  supabaseConfigured, type StockRow,
} from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { useAuth } from '../lib/auth';
import { useAccessScope, previewScoped } from '../lib/access';
import './fieldcalls.css';

// ===========================================================================
// STOCK TRANSFER — engineer to engineer.
//
// Nothing stores a stock balance. An engineer's holding is DERIVED from what
// has happened to their hand-stock: HandStock spare requests they acknowledged
// receiving, less what they consumed on calls, plus or minus transfers
// (the engineer_stock view, 0020_stock_transfer.sql). So the figure on screen
// can never disagree with the history behind it.
//
// A transfer only offers parts the sender is actually holding, and each row's
// quantity is capped at what is left of that part. The database enforces the
// same rule, so neither a stale screen nor a direct write can overdraw.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };
const g = (r: Record<string, unknown>, k: string) => String(r[k] ?? '');
const CACHE_KEY = 'stockTransfers';

// ---------------------------------------------------------------------------
// Raise-transfer drawer.
// ---------------------------------------------------------------------------
function TransferDrawer({
  open, onClose, onSaved, defaultFrom, engineers,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (uid?: string) => void;
  defaultFrom: string;
  engineers: string[];
}) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState('');
  const [on, setOn] = useState(todayISO());
  const [remarks, setRemarks] = useState('');
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [picks, setPicks] = useState<{ part: string; qty: string }[]>([{ part: '', qty: '1' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setFrom(defaultFrom); setTo(''); setOn(todayISO()); setRemarks('');
    setPicks([{ part: '', qty: '1' }]); setErr('');
  }, [open, defaultFrom]);

  // What the sender is holding right now. Re-read whenever the sender changes,
  // so the caps always reflect that engineer.
  useEffect(() => {
    if (!open || !from.trim()) { setStock([]); return; }
    let alive = true;
    setLoadingStock(true);
    listEngineerStock(from)
      .then((s) => { if (alive) setStock(s); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setLoadingStock(false); });
    return () => { alive = false; };
  }, [open, from]);

  const availableOf = (part: string): number =>
    stock.find((s) => s.part.trim().toLowerCase() === part.trim().toLowerCase())?.qty ?? 0;

  // A part already on another row cannot be picked twice — the remaining
  // quantity would be wrong on both.
  const takenParts = (i: number) =>
    new Set(picks.filter((_, j) => j !== i).map((p) => p.part.trim().toLowerCase()).filter(Boolean));

  const setPick = (i: number, field: 'part' | 'qty', v: string) =>
    setPicks((p) => p.map((x, j) => {
      if (j !== i) return x;
      if (field === 'part') return { part: v, qty: '1' };   // reset qty to a value the new part allows
      const max = availableOf(x.part);
      const n = Math.floor(Number(v) || 0);
      return { ...x, qty: String(max > 0 ? Math.min(Math.max(n, 1), max) : n) };
    }));
  const addRow = () => setPicks((p) => [...p, { part: '', qty: '1' }]);
  const removeRow = (i: number) => setPicks((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p));

  const submit = async () => {
    const lines = picks
      .map((p) => ({ part: p.part.trim(), qty: Math.floor(Number(p.qty) || 0) }))
      .filter((p) => p.part !== '');
    if (!from.trim()) { setErr('Choose the engineer transferring the stock.'); return; }
    if (!to.trim()) { setErr('Choose the engineer receiving the stock.'); return; }
    if (from.trim().toLowerCase() === to.trim().toLowerCase()) { setErr('From and To must be different engineers.'); return; }
    if (lines.length === 0) { setErr('Add at least one part.'); return; }
    for (const l of lines) {
      if (l.qty < 1) { setErr(`Quantity for ${l.part} must be at least 1.`); return; }
      const have = availableOf(l.part);
      if (l.qty > have) { setErr(`${from} holds only ${have} of ${l.part}.`); return; }
    }
    setBusy(true); setErr('');
    try {
      const res = await addStockTransfer(from, to, lines, remarks.trim(), on);
      if (res.ok) { onSaved(res.uid); onClose(); }
      else setErr(res.error ?? 'Could not save the transfer.');
    } catch (e) {
      setErr(`Transfer failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  const nothingToSend = !loadingStock && !!from.trim() && stock.length === 0;

  return (
    <Drawer open={open} onClose={onClose} title="New Stock Transfer" width={760}>
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span><button className="btn btn-ghost btn-sm" onClick={() => setErr('')}>✕</button></div>}

      <div className="rep-form">
        <section className="rep-sec">
          <div className="rep-sec-title">Transfer</div>
          <div className="rep-grid">
            <label className="rep-field">
              <span className="field-label">From engineer *</span>
              <input className="input" list="dl-stock-engineers" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="rep-field">
              <span className="field-label">To engineer *</span>
              <input className="input" list="dl-stock-engineers" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="rep-field">
              <span className="field-label">Date</span>
              <input className="input" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
            </label>
          </div>
          <datalist id="dl-stock-engineers">
            {engineers.map((n) => <option key={n} value={n} />)}
          </datalist>
        </section>

        <section className="rep-sec">
          <div className="rep-sec-title">
            Parts <span className="muted">
              {loadingStock ? '(reading stock…)' : `(${stock.length} part${stock.length === 1 ? '' : 's'} in hand)`}
            </span>
          </div>

          {nothingToSend && (
            <div className="muted" style={{ fontSize: 13 }}>
              <b>{from}</b> is not holding any stock. Stock comes from a HandStock spare
              request they have acknowledged receiving, less what they have consumed.
            </div>
          )}

          {!nothingToSend && picks.map((p, i) => {
            const have = availableOf(p.part);
            const taken = takenParts(i);
            const options = stock.filter((s) => !taken.has(s.part.trim().toLowerCase()));
            return (
              <div className="spare-row" key={i}>
                <select className="input spare-part" value={p.part} onChange={(e) => setPick(i, 'part', e.target.value)}>
                  <option value="">— Select a part in hand —</option>
                  {options.map((s) => <option key={s.part} value={s.part}>{s.part} · {s.qty} in hand</option>)}
                </select>
                <input
                  className="input spare-qty" type="number" min={1} max={have || 1} step={1}
                  value={p.qty} disabled={!p.part}
                  onChange={(e) => setPick(i, 'qty', e.target.value)}
                />
                <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {p.part ? `of ${have}` : ''}
                </span>
                <button className="btn btn-ghost btn-sm" title="Remove" onClick={() => removeRow(i)} disabled={picks.length === 1}>✕</button>
              </div>
            );
          })}
          {!nothingToSend && picks.length < stock.length && (
            <button className="btn btn-sm" onClick={addRow}>＋ Add part</button>
          )}
        </section>

        <section className="rep-sec">
          <div className="rep-sec-title">Remarks</div>
          <textarea className="input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Why the stock is moving…" />
        </section>

        <div className="rep-actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || nothingToSend}>
            {busy ? 'Transferring…' : 'Transfer Stock'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Register: stock on hand, and the transfers that moved it.
// ---------------------------------------------------------------------------
const TRANSFER_COLUMNS: Column<Row>[] = [
  { key: 'uid', header: 'Transfer No', width: 140, wrap: false },
  { key: 'transfer_date', header: 'Date', width: 110, wrap: false, render: (r) => fmtLongDate(r.transfer_date) },
  { key: 'from_engineer', header: 'From', width: 170 },
  { key: 'to_engineer', header: 'To', width: 170 },
  { key: 'row_no', header: '#', width: 45, align: 'right', wrap: false },
  { key: 'part', header: 'Part', width: 220 },
  { key: 'qty', header: 'Qty', width: 60, align: 'right', wrap: false },
  { key: 'remarks', header: 'Remarks', width: 200 },
];

const STOCK_COLUMNS: Column<Row>[] = [
  { key: 'engineer', header: 'Engineer', width: 200 },
  { key: 'part', header: 'Part', width: 260 },
  { key: 'qty', header: 'In hand', width: 90, align: 'right', wrap: false },
];

export function StockTransfer() {
  const { user, can, viewAs } = useAuth();
  const scope = useAccessScope();
  const onDb = supabaseConfigured();
  const cached = onDb ? loadCache<Row>(CACHE_KEY) : null;
  const [tab, setTab] = useState<'stock' | 'transfers'>('stock');
  // Raw as fetched — cached and refreshed as before.
  const [allTransfers, setTransfers] = useState<Row[]>(cached?.rows ?? []);
  const [allStock, setStock] = useState<Row[]>([]);
  // What the screen shows. RLS scopes a real session; this narrows the list
  // only while an administrator previews as someone else, whose identity the
  // database never sees. A transfer is in scope if EITHER side of it is.
  const transfers = useMemo(
    () => previewScoped(allTransfers, !!viewAs, scope, ['from_engineer', 'to_engineer'], [], viewAs?.email),
    [allTransfers, viewAs, scope],
  );
  const stock = useMemo(
    () => previewScoped(allStock, !!viewAs, scope, ['engineer'], [], viewAs?.email),
    [allStock, viewAs, scope],
  );
  const [engineers, setEngineers] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [drawer, setDrawer] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    onDb ? null : { tone: 'info', text: 'Connect the database in Settings to use stock transfers.' },
  );

  const load = async () => {
    if (!onDb) return;
    setBusy(true);
    try {
      const [t, s] = await Promise.all([listStockTransfers(1000), listAllStock()]);
      const tRows = t.map((x, i) => ({ ...x, id: `${g(x as Row, 'uid')}-${i}` } as Row));
      setTransfers(tRows); setLastSync(saveCache(CACHE_KEY, tRows));
      setStock(s.map((x, i) => ({ ...x, id: `${x.engineer}-${x.part}-${i}` } as unknown as Row)));
      setMsg(null);
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (onDb && transfers.length && !isStale(lastSync)) setMsg({ tone: 'info', text: `Showing cached data — synced ${timeAgo(lastSync)}. ↻ Refresh to update.` });
    void load();
    listUsers('', 2000)
      .then((rows) => setEngineers([...new Set(rows.map((r) => String(r['User Name'] ?? '').trim()).filter(Boolean))].sort()))
      .catch(() => { /* the field stays free text */ });
    const id = onDb ? window.setInterval(() => void load(), SYNC_TTL_MS) : undefined;
    return () => { if (id) window.clearInterval(id); };
    // eslint-disable-next-line
  }, []);

  const rows = tab === 'stock' ? stock : transfers;
  const columns = tab === 'stock' ? STOCK_COLUMNS : TRANSFER_COLUMNS;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    const keys = tab === 'stock' ? ['engineer', 'part'] : ['uid', 'from_engineer', 'to_engineer', 'part', 'remarks'];
    return rows.filter((r) => keys.some((k) => g(r, k).toLowerCase().includes(q)));
  }, [rows, search, tab]);

  const holders = useMemo(() => new Set(stock.map((r) => g(r, 'engineer'))).size, [stock]);
  const totalQty = useMemo(() => stock.reduce((n, r) => n + Number(r.qty ?? 0), 0), [stock]);

  return (
    <div>
      <PageHeader
        title="Stock Transfer"
        subtitle="Move hand-stock between engineers. Stock is derived from what each engineer received and consumed."
        icon="🔄"
        count={visible.length}
        actions={can('stock.transfer') && <button className="btn btn-primary" onClick={() => setDrawer(true)}>＋ New Transfer</button>}
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <KpiGrid>
        <KpiCard label="Engineers holding stock" value={holders} icon="👷" tone="primary" />
        <KpiCard label="Part lines in hand" value={stock.length} icon="📦" tone="info" />
        <KpiCard label="Total units in hand" value={totalQty} icon="Σ" tone="success" />
        <KpiCard label="Transfer lines" value={transfers.length} icon="🔄" tone="neutral" />
      </KpiGrid>

      <div className="stage-chips">
        <button className={`chip ${tab === 'stock' ? 'chip-on' : ''}`} onClick={() => setTab('stock')}>Stock on hand <b>{stock.length}</b></button>
        <button className={`chip ${tab === 'transfers' ? 'chip-on' : ''}`} onClick={() => setTab('transfers')}>Transfers <b>{transfers.length}</b></button>
      </div>

      <DataTable<Row>
        columns={columns}
        rows={visible}
        getRowId={(r) => r.id}
        storageKey={`stockTransfer-${tab}`}
        rowsBeforeScroll={14}
        dense
        emptyText={tab === 'stock'
          ? 'No stock in hand. Stock appears once an engineer acknowledges a HandStock spare request.'
          : 'No stock transfers yet.'}
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder={tab === 'stock' ? 'Engineer, part…' : 'Transfer no, engineer, part…'} />
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off" title={`Last synced ${new Date(lastSync).toLocaleString()}`}>⟳ {timeAgo(lastSync)}</span>}
            {visible.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport(`${tab === 'stock' ? 'stock-on-hand' : 'stock-transfers'}.csv`, columns.map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />

      <TransferDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        onSaved={(uid) => { setMsg({ tone: 'ok', text: `Stock transfer ${uid ?? ''} recorded.` }); void load(); }}
        defaultFrom={user?.fullName ?? ''}
        engineers={engineers}
      />
    </div>
  );
}

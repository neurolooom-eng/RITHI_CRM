import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { csvExport, fmtLongDate, timeAgo, todayISO } from '../lib/format';
import {
  addMaterialReturn, listMaterialReturns, handstockForEngineer, supabaseConfigured,
  type MrnLineInput,
} from '../lib/supabase';
import { listUsers } from '../lib/sheets';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { useAuth } from '../lib/auth';
import { engineerKey, num, partDescription, stockOptionLabel, type HandstockBalance } from '../lib/handstock';
import './fieldcalls.css';

// ===========================================================================
// MRN — MATERIAL RETURN NOTE. The engineer sends a spare back to Stores.
//
// A return is the fifth hand-stock movement, and the second that takes stock
// OUT of an engineer's hands:
//   Stock Level = Stock Out − Consumption − Transfer Out + Transfer In − Returned
//
// So an engineer can only return what they are actually holding: the picker
// offers their hand stock and nothing else, the quantity is capped at what is
// left of that spare across the lines already added, and Postgres enforces the
// same rule (0037_material_returns.sql) so neither a stale screen nor a direct
// write can drive a level negative.
//
// One row per returned item — the flattened shape of the sheet's two tabs —
// grouped by MRN number, so a submission returning five spares is five rows.
// ===========================================================================

const CACHE_KEY = 'materialReturns';
const MIGRATION_HINT = 'Material returns need migration 0037_material_returns.sql — run it in the Supabase SQL editor (apply bundle: HandStock_X.sql).';

type Row = Record<string, unknown> & { id: string };
const g = (r: Record<string, unknown>, k: string) => String(r[k] ?? '');

const COLUMNS: Column<Row>[] = [
  { key: 'mrn_no', header: 'MRN No', width: 100, wrap: false },
  { key: 'mrn_date', header: 'MRN Date', width: 115, wrap: false, render: (r) => fmtLongDate(r.mrn_date) },
  { key: 'uid', header: 'Reference', width: 135, wrap: false },
  { key: 'row_no', header: '#', width: 45, align: 'right', wrap: false },
  { key: 'engineer', header: 'Engineer', width: 165 },
  { key: 'item_code', header: 'Spare', width: 115, wrap: false },
  { key: 'item_name', header: 'Description', width: 240, render: (r) => g(r, 'item_name') || partDescription(r.part) },
  { key: 'good_qty', header: 'Good', width: 70, align: 'right', wrap: false },
  { key: 'defective_qty', header: 'Defective', width: 85, align: 'right', wrap: false },
  { key: 'customer_name', header: 'Customer', width: 150 },
  { key: 'report_no', header: 'Report No', width: 110, wrap: false },
  { key: 'removed_from_equipment', header: 'Removed from equip.', width: 150 },
  { key: 'remarks', header: 'Remarks', width: 180 },
];

export function MaterialReturns() {
  const { user, can } = useAuth();
  const onDb = supabaseConfigured();
  const cached = onDb ? loadCache<Row>(CACHE_KEY) : null;
  const PAGE = 1000;
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [search, setSearch] = useState('');
  const [engineerFilter, setEngineerFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [offset, setOffset] = useState(cached?.rows.length ?? 0);
  const [more, setMore] = useState((cached?.rows.length ?? 0) >= PAGE);
  const [drawer, setDrawer] = useState(false);
  const [detail, setDetail] = useState('');   // uid of the open MRN
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    onDb ? null : { tone: 'info', text: 'Connect the database in Settings to load material returns.' },
  );

  const load = async () => {
    if (!onDb) return;
    setBusy(true);
    try {
      const r = await listMaterialReturns(PAGE, 0);
      const mapped = r.map((x, i) => ({ ...x, id: `${String(x.uid ?? '')}-${String(x.row_no ?? i)}` } as Row));
      setRows(mapped); setOffset(mapped.length); setMore(r.length === PAGE); setLastSync(saveCache(CACHE_KEY, mapped));
      setMsg({ tone: 'ok', text: `Synced ${mapped.length} returned item${mapped.length === 1 ? '' : 's'}.` });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setMsg({
        tone: 'error',
        text: /material_returns|does not exist|schema cache/i.test(text) ? MIGRATION_HINT : `Load failed: ${text}`,
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

  const loadMore = async () => {
    setBusy(true);
    try {
      const r = await listMaterialReturns(PAGE, offset);
      const mapped = r.map((x, i) => ({ ...x, id: `${String(x.uid ?? '')}-${String(x.row_no ?? offset + i)}` } as Row));
      const merged = [...rows, ...mapped];
      setRows(merged); setOffset(offset + r.length); setMore(r.length === PAGE); setLastSync(saveCache(CACHE_KEY, merged));
    } catch (e) { setMsg({ tone: 'error', text: `Load more failed: ${e instanceof Error ? e.message : String(e)}` }); } finally { setBusy(false); }
  };

  const engineers = useMemo(
    () => [...new Set(rows.map((r) => g(r, 'engineer')).filter(Boolean))].sort(),
    [rows],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (engineerFilter && g(r, 'engineer') !== engineerFilter) return false;
      if (!q) return true;
      return ['mrn_no', 'uid', 'engineer', 'item_code', 'item_name', 'part', 'customer_name', 'report_no', 'remarks']
        .some((k) => g(r, k).toLowerCase().includes(q));
    });
  }, [rows, search, engineerFilter]);

  const totals = useMemo(() => {
    const notes = new Set(rows.map((r) => g(r, 'uid')));
    const good = rows.reduce((n, r) => n + num(r.good_qty), 0);
    const defective = rows.reduce((n, r) => n + num(r.defective_qty), 0);
    return { notes: notes.size, lines: rows.length, good, defective };
  }, [rows]);

  const detailRows = useMemo(() => rows.filter((r) => g(r, 'uid') === detail), [rows, detail]);

  return (
    <div>
      <PageHeader
        title="Material Returns (MRN)"
        subtitle="Spares an engineer has sent back to Stores. Every return comes off their hand stock."
        icon="↩️"
        actions={can('stock.return') && <button className="btn btn-primary" onClick={() => setDrawer(true)}>＋ New MRN</button>}
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <KpiGrid>
        <KpiCard label="Returns" value={totals.notes} icon="↩️" tone="primary" sub="MRNs raised" />
        <KpiCard label="Items returned" value={totals.lines} icon="🔩" tone="info" sub="lines across every MRN" />
        <KpiCard label="Good" value={totals.good} icon="✅" tone="success" sub="back to Stores, usable" />
        <KpiCard label="Defective" value={totals.defective} icon="⚠️" tone={totals.defective ? 'warning' : 'neutral'} sub="back to Stores, faulty" />
      </KpiGrid>

      <DataTable<Row>
        columns={COLUMNS}
        rows={visible}
        getRowId={(r) => r.id}
        onRowClick={(r) => setDetail(g(r, 'uid'))}
        storageKey="materialReturns"
        rowsBeforeScroll={14}
        dense
        onLoadMore={onDb ? loadMore : undefined}
        moreAvailable={onDb && more}
        loadingMore={busy}
        emptyText={rows.length ? 'No returns match this filter.' : 'No material returns yet — Refresh to load.'}
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="MRN no, engineer, spare, customer, remarks…" />
            <select className="select" value={engineerFilter} onChange={(e) => setEngineerFilter(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">All engineers</option>
              {engineers.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off" title={`Last synced ${new Date(lastSync).toLocaleString()}`}>⟳ {timeAgo(lastSync)}</span>}
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('material-returns.csv', COLUMNS.map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />

      <MrnDrawer
        open={drawer}
        defaultEngineer={user?.fullName ?? ''}
        onClose={() => setDrawer(false)}
        onSaved={(uid) => { setMsg({ tone: 'ok', text: `Material return recorded${uid ? ` — ${uid}` : ''}.` }); void load(); }}
      />

      <Drawer open={!!detail && detailRows.length > 0} onClose={() => setDetail('')} title={`MRN — ${g(detailRows[0] ?? {}, 'mrn_no') || detail}`} width={720}>
        {detailRows.length > 0 && <MrnDetail rows={detailRows} />}
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One MRN, with every item on it.
// ---------------------------------------------------------------------------
function MrnDetail({ rows }: { rows: Row[] }) {
  const head = rows[0];
  const field = (label: string, value: unknown) => (
    <div className="rep-field"><span className="field-label">{label}</span><span>{String(value ?? '') || '—'}</span></div>
  );
  const total = (k: string) => rows.reduce((n, r) => n + num(r[k]), 0);
  return (
    <div className="rep-form">
      <section className="rep-sec">
        <div className="rep-sec-title">Return</div>
        <div className="rep-grid">
          {field('MRN No', g(head, 'mrn_no'))}
          {field('MRN Date', fmtLongDate(head.mrn_date))}
          {field('Reference', g(head, 'uid'))}
          {field('Engineer', g(head, 'engineer'))}
          {field('Good returned', total('good_qty'))}
          {field('Defective returned', total('defective_qty'))}
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
          Every item below has come off {g(head, 'engineer') || 'the engineer'}&rsquo;s hand stock.
        </p>
      </section>

      <section className="rep-sec">
        <div className="rep-sec-title">Items <span className="muted">({rows.length})</span></div>
        <ul className="rep-spare-list">
          {[...rows].sort((a, b) => num(a.row_no) - num(b.row_no)).map((r) => (
            <li key={r.id}>
              {String(r.row_no ?? '')}. <b>{g(r, 'item_code')}</b> {g(r, 'item_name') || partDescription(r.part)}
              {' — '}good {num(r.good_qty)}{num(r.defective_qty) > 0 ? `, defective ${num(r.defective_qty)}` : ''}
              {g(r, 'customer_name') && g(r, 'customer_name') !== 'NA' && <span className="muted"> · {g(r, 'customer_name')}</span>}
              {g(r, 'report_no') && g(r, 'report_no') !== 'NA' && <span className="muted"> · report {g(r, 'report_no')}</span>}
              {g(r, 'remarks') && <div className="muted" style={{ fontSize: 12 }}>{g(r, 'remarks')}</div>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Raise an MRN. Only what the engineer is holding can be returned, and only up
// to what is left of it once the lines already on this note are counted.
// ---------------------------------------------------------------------------
interface Pick extends MrnLineInput { }

function MrnDrawer({
  open, defaultEngineer, onClose, onSaved,
}: {
  open: boolean;
  defaultEngineer: string;
  onClose: () => void;
  onSaved: (uid: string) => void;
}) {
  const { user, can } = useAuth();
  // Engineers return their own stock; anyone who acts for others (admin,
  // Stores, an approver) may record a return on their behalf.
  const forOthers = can('users.manage') || can('spare.dispatch') || can('spare.approve_rm');
  const [engineer, setEngineer] = useState(defaultEngineer);
  const [mrnNo, setMrnNo] = useState('');
  const [mrnDate, setMrnDate] = useState(todayISO());
  const [remarks, setRemarks] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [stock, setStock] = useState<HandstockBalance[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([{ part: '', good_qty: 1, defective_qty: 0 }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setEngineer(defaultEngineer); setMrnNo(''); setMrnDate(todayISO()); setRemarks('');
    setPicks([{ part: '', good_qty: 1, defective_qty: 0 }]); setErr('');
  }, [open, defaultEngineer]);

  // Directory names, for a return recorded on someone else's behalf.
  useEffect(() => {
    if (!open || !forOthers || names.length) return;
    let alive = true;
    listUsers('', 2000)
      .then((r) => { if (alive) setNames([...new Set(r.map((x) => String(x['User Name'] ?? '').trim()).filter(Boolean))].sort()); })
      .catch(() => { /* the field stays a free-text input */ });
    return () => { alive = false; };
  }, [open, forOthers, names.length]);

  // What that engineer is holding right now — re-read whenever they change.
  useEffect(() => {
    if (!open || !engineer.trim() || !supabaseConfigured()) { setStock([]); return; }
    let alive = true;
    setLoadingStock(true);
    handstockForEngineer(engineer)
      .then((r) => { if (alive) setStock(r as unknown as HandstockBalance[]); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setLoadingStock(false); });
    return () => { alive = false; };
  }, [open, engineer]);

  const heldOf = (part: string) => num(stock.find((s) => s.part === part)?.on_hand);
  // What is left of a spare once the other lines on this note are counted.
  const remainingOf = (part: string, exceptIndex: number) =>
    heldOf(part) - picks.reduce((n, p, i) => (i === exceptIndex || p.part !== part ? n : n + p.good_qty + p.defective_qty), 0);

  const setPick = (i: number, patch: Partial<Pick>) =>
    setPicks((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addRow = () => setPicks((ps) => [...ps, { part: '', good_qty: 1, defective_qty: 0 }]);
  const removeRow = (i: number) => setPicks((ps) => (ps.length > 1 ? ps.filter((_, j) => j !== i) : ps));

  const nothingInHand = !loadingStock && stock.length === 0;

  const submit = async () => {
    const lines = picks.filter((p) => p.part.trim());
    if (!engineer.trim()) { setErr('Engineer is required.'); return; }
    if (!mrnNo.trim()) { setErr('Enter the MRN number from the slip.'); return; }
    if (!lines.length) { setErr('Add at least one spare to return.'); return; }
    for (const [i, p] of lines.entries()) {
      const qty = p.good_qty + p.defective_qty;
      if (qty < 1) { setErr(`Line ${i + 1}: return at least one — good or defective.`); return; }
      if (qty > heldOf(p.part)) { setErr(`Line ${i + 1}: only ${heldOf(p.part)} of that spare in hand.`); return; }
    }
    // The same spare on two lines must not exceed what is held in total.
    const byPart = new Map<string, number>();
    lines.forEach((p) => byPart.set(p.part, (byPart.get(p.part) ?? 0) + p.good_qty + p.defective_qty));
    for (const [part, qty] of byPart) {
      if (qty > heldOf(part)) { setErr(`${part.split('|')[0]}: ${qty} returned but only ${heldOf(part)} in hand.`); return; }
    }

    setBusy(true); setErr('');
    try {
      const res = await addMaterialReturn(
        {
          mrn_no: mrnNo.trim(), mrn_date: mrnDate || undefined, engineer: engineer.trim(),
          engineer_email: engineerKey(engineer) === engineerKey(defaultEngineer) ? user?.email ?? '' : '',
          remarks: remarks.trim(),
        },
        lines,
      );
      if (res.ok) { onSaved(res.uid ?? ''); onClose(); }
      else setErr(res.error ?? 'Could not record the return.');
    } catch (e) {
      setErr(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <Drawer open={open} onClose={onClose} title="New Material Return (MRN)" width={720}>
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span><button className="btn btn-ghost btn-sm" onClick={() => setErr('')}>✕</button></div>}
      <div className="rep-form">
        <section className="rep-sec">
          <div className="rep-sec-title">Return</div>
          <div className="rep-grid">
            <label className="rep-field">
              <span className="field-label">Engineer *</span>
              {forOthers ? (
                <input className="input" list="dl-mrn-engineers" value={engineer} onChange={(e) => { setEngineer(e.target.value); setPicks([{ part: '', good_qty: 1, defective_qty: 0 }]); }} />
              ) : (
                <input className="input" value={engineer} readOnly title="You can only return your own stock" />
              )}
              <datalist id="dl-mrn-engineers">{names.map((n) => <option key={n} value={n} />)}</datalist>
            </label>
            <label className="rep-field">
              <span className="field-label">MRN No *</span>
              <input className="input" value={mrnNo} onChange={(e) => setMrnNo(e.target.value)} placeholder="The number on the MRN slip" />
            </label>
            <label className="rep-field">
              <span className="field-label">MRN Date</span>
              <input className="input" type="date" value={mrnDate} onChange={(e) => setMrnDate(e.target.value)} />
            </label>
          </div>
        </section>

        <section className="rep-sec">
          <div className="rep-sec-title">
            Spares returned <span className="muted">· only what {engineer || 'the engineer'} is holding ({stock.length})</span>
          </div>

          {loadingStock && <div className="muted" style={{ fontSize: 12.5 }}>Loading hand stock…</div>}
          {nothingInHand && (
            <div className="muted" style={{ fontSize: 13 }}>
              <b>{engineer || 'This engineer'}</b> is not holding any stock. Stock comes from a spare Stores has
              dispatched, less what has been consumed, transferred or already returned.
            </div>
          )}

          {!nothingInHand && picks.map((p, i) => {
            const left = p.part ? remainingOf(p.part, i) : 0;
            const taken = new Set(picks.filter((_, j) => j !== i).map((x) => x.part).filter(Boolean));
            return (
              <div key={i} className="mrn-row">
                <select
                  className="select mrn-part" value={p.part}
                  onChange={(e) => setPick(i, { part: e.target.value, good_qty: 1, defective_qty: 0 })}
                >
                  <option value="">— Pick a spare in hand —</option>
                  {stock.filter((s) => !taken.has(s.part) || s.part === p.part)
                    .map((s) => <option key={s.part_code} value={s.part}>{stockOptionLabel(s)}</option>)}
                </select>
                <label className="mrn-qty">
                  <span className="field-label">Good</span>
                  <input
                    className="input" type="number" min={0} max={Math.max(0, left + p.good_qty)} step={1}
                    value={p.good_qty} disabled={!p.part}
                    onChange={(e) => setPick(i, { good_qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  />
                </label>
                <label className="mrn-qty">
                  <span className="field-label">Defective</span>
                  <input
                    className="input" type="number" min={0} max={Math.max(0, left + p.defective_qty)} step={1}
                    value={p.defective_qty} disabled={!p.part}
                    onChange={(e) => setPick(i, { defective_qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  />
                </label>
                <span className="muted mrn-held">{p.part ? `of ${heldOf(p.part)} in hand` : ''}</span>
                <button className="btn btn-ghost btn-sm" title="Remove" onClick={() => removeRow(i)} disabled={picks.length === 1}>✕</button>
              </div>
            );
          })}

          {!nothingInHand && picks.length < stock.length && (
            <button className="btn btn-sm" onClick={addRow}>＋ Add spare</button>
          )}
        </section>

        <section className="rep-sec">
          <div className="rep-sec-title">Remarks</div>
          <textarea className="input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Why the spare is going back…" />
        </section>

        <div className="rep-actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || nothingInHand}>
            {busy ? 'Recording…' : '↩️ Record return'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}

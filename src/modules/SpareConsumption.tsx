import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, fmtLongDate, timeAgo } from '../lib/format';
import { listTabRows, sheetsConfigured } from '../lib/sheets';
import {
  listConsumptionRows, supabaseConfigured, addReconciliationConsumption, searchCalls,
  listEngineerStock, adjustConsumptionQty, type StockRow,
} from '../lib/supabase';
import { Drawer } from '../components/ui/ui';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { useAuth } from '../lib/auth';
import { useAccessScope } from '../lib/access';
import './fieldcalls.css';

const CACHE_KEY = 'spareConsumption';

// ===========================================================================
// SPARE CONSUMPTION — monitor the spares consumed against every call report.
// Reads the standalone v2Consumption book (schema-agnostic). Rows carry the
// call's UC Number (written at report time), so consumption is traceable to the
// report/call. Role-scoped by the engineer column when present.
// ===========================================================================

const BOOK = 'consumption';
const UCN_KEYS = ['UC Number', 'UCN', 'UC No'];
const ENGINEER_KEYS = ['Visiting Service Engineer', 'ENGINEER NAME', 'Engineer', 'engineer', 'Service Engineer', 'Allocated To', 'Call Allocated To'];
const EMAIL_KEYS = ['Engineer Email', 'Email address', 'Email-ID', 'Email ID'];
const PREFERRED = [
  'ucn', 'call_number', 'part', 'qty', 'engineer', 'source', 'created_at', // Supabase shape
  'UC Number', 'Call Number', 'Party Name', 'Product Name', 'Product Serial Number',
  'Spare', 'Part Number', 'Part Description', 'Qty', 'Quantity', 'Consumption Date', 'Date', 'Timestamp',
  'Visiting Service Engineer', 'ENGINEER NAME',
];
const DATEISH = /date|created_at|timestamp/i;

type Row = Record<string, unknown> & { id: string };
const g = (r: Record<string, unknown>, k: string) => String(r[k] ?? '');
const pick = (r: Record<string, unknown>, keys: string[]) => { for (const k of keys) if (g(r, k)) return g(r, k); return ''; };

export function SpareConsumption() {
  const { user } = useAuth();
  const scope = useAccessScope();
  const onDb = supabaseConfigured();
  const cached = onDb ? loadCache<Row>(CACHE_KEY) : null;
  const PAGE = 1000;
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [offset, setOffset] = useState(cached?.rows.length ?? 0);
  const [more, setMore] = useState((cached?.rows.length ?? 0) >= PAGE);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    (onDb || sheetsConfigured()) ? null : { tone: 'info', text: 'Connect the database in Settings to load spare consumption.' },
  );

  // RECONCILIATION: Admin / Spare Coordinator book spares against a call
  // straight into consumption, without waiting for the engineer's report. Parts
  // come from what that engineer is actually holding, and a line cannot exceed
  // it — the same rule the database enforces.
  const { can } = useAuth();
  const mayReconcile = can('consumption.reconcile');
  type Line = { part: string; qty: string };
  const emptyForm = { ucn: '', call_number: '', engineer: '', remarks: '', lines: [{ part: '', qty: '1' }] as Line[] };
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [stockBusy, setStockBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const setF = (k: 'ucn' | 'call_number' | 'engineer' | 'remarks', v: string) =>
    setForm((f) => f && ({ ...f, [k]: v }));
  const setLine = (i: number, k: keyof Line, v: string) =>
    setForm((f) => f && ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const addLine = () => setForm((f) => f && ({ ...f, lines: [...f.lines, { part: '', qty: '1' }] }));
  const dropLine = (i: number) => setForm((f) => f && ({ ...f, lines: f.lines.filter((_, j) => j !== i) }));

  const onHand = (part: string) => stock.find((r) => r.part === part)?.qty ?? 0;
  // A part already used on another line eats into what is left for this one.
  const remainingFor = (i: number, part: string) => {
    if (!part) return 0;
    const used = (form?.lines ?? []).reduce((t, l, j) =>
      t + (j !== i && l.part === part ? (Number(l.qty) || 0) : 0), 0);
    return Math.max(onHand(part) - used, 0);
  };

  // Load what this engineer is holding; the part list is only ever their stock.
  const loadStock = async (engineer: string) => {
    const name = engineer.trim();
    if (!name || !onDb) { setStock([]); return; }
    setStockBusy(true);
    try { setStock(await listEngineerStock(name)); }
    catch { setStock([]); }
    finally { setStockBusy(false); }
  };

  // The UCN identifies the call; tabbing out pulls in its call number and the
  // engineer it is allotted to, then that engineer's hand stock.
  const lookupCall = async (term: string) => {
    const t = term.trim();
    if (!t || !onDb) return;
    try {
      const hits = await searchCalls('', { q: t }, 5);
      const hit = hits.find((c) => String(c.ucn ?? '').toLowerCase() === t.toLowerCase()
                               || String(c.callNumber ?? '').toLowerCase() === t.toLowerCase()) ?? hits[0];
      if (!hit) { setMsg({ tone: 'error', text: `No call found for ${t}.` }); return; }
      const eng = String(hit.allocatedTo ?? '');
      setForm((f) => f && ({
        ...f,
        ucn: String(hit.ucn ?? f.ucn),
        call_number: String(hit.callNumber ?? f.call_number),
        engineer: f.engineer || eng,
        lines: f.engineer && f.engineer !== eng ? f.lines : [{ part: '', qty: '1' }],
      }));
      await loadStock(eng);
      setMsg(null);
    } catch { /* leave what was typed */ }
  };

  const formProblem = (): string => {
    if (!form) return '';
    if (!form.ucn.trim()) return 'The UCN is required — a reconciliation is booked against a call.';
    if (!form.engineer.trim()) return 'No engineer — enter the UCN so the call fills it in.';
    const picked = form.lines.filter((l) => l.part.trim());
    if (!picked.length) return 'Add at least one part.';
    if (!form.remarks.trim()) return 'Give the reason — every hand-booked line records why.';
    for (const [i, l] of form.lines.entries()) {
      if (!l.part.trim()) continue;
      const q = Number(l.qty);
      if (!Number.isFinite(q) || q <= 0) return `Quantity for ${l.part} must be more than zero.`;
      if (q > remainingFor(i, l.part)) {
        return `${l.part}: only ${onHand(l.part)} in ${form.engineer}'s hand stock.`;
      }
    }
    return '';
  };

  const saveReconciliation = async () => {
    if (!form) return;
    const problem = formProblem();
    if (problem) { setMsg({ tone: 'error', text: problem }); return; }
    setSaving(true);
    const res = await addReconciliationConsumption({
      ucn: form.ucn, call_number: form.call_number, engineer: form.engineer,
      remarks: form.remarks, recorded_by: String(user?.fullName ?? user?.email ?? ''),
      lines: form.lines.filter((l) => l.part.trim()).map((l) => ({ part: l.part, qty: Number(l.qty) })),
    });
    setSaving(false);
    if (!res.ok) {
      setMsg({ tone: 'error', text: /permission|policy/i.test(res.error ?? '')
        ? 'Your role cannot add a reconciliation line (needs consumption.reconcile).'
        : (res.error ?? 'Could not save.') });
      return;
    }
    setForm(null); setStock([]);
    setMsg({ tone: 'ok', text: `Reconciliation recorded — ${res.count} part${res.count === 1 ? '' : 's'} against ${form.ucn}.` });
    await load();
  };

  // Arriving from a call's RECO action: the UCN / call / engineer come in on the
  // query string, so the entry is never typed against the wrong call.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const ucn = params.get('ucn') ?? '';
    if (!ucn || !mayReconcile || !onDb) return;
    const engineer = params.get('engineer') ?? '';
    setForm({
      ucn, call_number: params.get('call') ?? '', engineer,
      remarks: '', lines: [{ part: '', qty: '1' }],
    });
    void loadStock(engineer);
    // Clear them so a refresh does not reopen the drawer.
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, mayReconcile, onDb]);

  // ADJUST an existing line's quantity — the other half of reconciliation, for
  // when the engineer reported the wrong number. Only the quantity moves; the
  // database keeps the original, the reason and who changed it.
  const [adjust, setAdjust] = useState<{ row: Row; qty: string; reason: string; max: number } | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  const openAdjust = async (row: Row) => {
    const cur = Number(g(row, 'qty')) || 0;
    setAdjust({ row, qty: String(cur), reason: '', max: cur });
    // Raising it consumes more, so the ceiling is what is still in hand plus
    // what this line already accounts for.
    const eng = pick(row, ENGINEER_KEYS);
    if (eng && onDb) {
      try {
        const st = await listEngineerStock(eng);
        const inHand = st.find((r) => r.part === g(row, 'part'))?.qty ?? 0;
        setAdjust((a) => a && ({ ...a, max: cur + inHand }));
      } catch { /* leave the ceiling at the current quantity */ }
    }
  };

  const saveAdjust = async () => {
    if (!adjust) return;
    const id = Number(adjust.row._dbId);
    const qty = Number(adjust.qty);
    if (!Number.isFinite(id) || id <= 0) { setMsg({ tone: 'error', text: 'This line has no database id — Refresh and try again.' }); return; }
    if (!Number.isFinite(qty) || qty <= 0) { setMsg({ tone: 'error', text: 'Quantity must be more than zero.' }); return; }
    if (qty > adjust.max) { setMsg({ tone: 'error', text: `Only ${adjust.max} possible — the rest is not in that engineer's hand stock.` }); return; }
    if (!adjust.reason.trim()) { setMsg({ tone: 'error', text: 'Say why the quantity is being adjusted.' }); return; }
    setAdjusting(true);
    const res = await adjustConsumptionQty(id, qty, adjust.reason, String(user?.fullName ?? user?.email ?? ''));
    setAdjusting(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not adjust.' }); return; }
    const was = g(adjust.row, 'qty');
    setAdjust(null);
    setMsg({ tone: 'ok', text: `Quantity adjusted from ${was} to ${qty}. The change is kept on the line and in the audit trail.` });
    await load();
  };

  const load = async () => {
    if (onDb) {
      setBusy(true); setMsg({ tone: 'info', text: 'Loading spare consumption…' });
      try {
        const r = await listConsumptionRows(PAGE, 0);
        // The table needs a stable string key, but the DB id is what an
        // adjustment updates — keep both.
        const mapped = r.map((x, i) => ({ ...x, _dbId: x.id, id: `${pick(x, UCN_KEYS)}-${i}` } as Row));
        setRows(mapped); setOffset(mapped.length); setMore(r.length === PAGE); setLastSync(saveCache(CACHE_KEY, mapped));
        setMsg({ tone: 'ok', text: `Synced ${mapped.length} consumption lines.` });
      } catch (e) {
        setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
      } finally { setBusy(false); }
      return;
    }
    if (!sheetsConfigured()) return;
    setBusy(true); setMsg({ tone: 'info', text: 'Loading spare consumption…' });
    try {
      const r = await listTabRows('', 600, '', BOOK);
      setRows(r.map((x, i) => ({ ...x, id: `${pick(x, UCN_KEYS)}-${i}` })));
      setLastSync(new Date().toISOString());
      setMsg({ tone: 'ok', text: `Loaded ${r.length} consumption lines.` });
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
      const r = await listConsumptionRows(PAGE, offset);
      const mapped = r.map((x, i) => ({ ...x, id: `${pick(x, UCN_KEYS)}-${offset + i}` } as Row));
      const merged = [...rows, ...mapped];
      setRows(merged); setOffset(offset + r.length); setMore(r.length === PAGE); setLastSync(saveCache(CACHE_KEY, merged));
    } catch (e) { setMsg({ tone: 'error', text: `Load more failed: ${e instanceof Error ? e.message : String(e)}` }); } finally { setBusy(false); }
  };

  const headerKeys = useMemo(() => {
    const ks = new Set<string>();
    rows.slice(0, 60).forEach((r) => Object.keys(r).forEach((k) => { if (k && !k.startsWith('_') && k !== 'id' && k !== 'data' && !/^Page.*Header$/i.test(k)) ks.add(k); }));
    return [...ks];
  }, [rows]);

  const engineerKey = useMemo(() => ENGINEER_KEYS.find((k) => headerKeys.includes(k)), [headerKeys]);
  const emailKey = useMemo(() => EMAIL_KEYS.find((k) => headerKeys.includes(k)), [headerKeys]);
  const email = String(user?.email ?? '').trim().toLowerCase();

  // Role scope: engineers/RMs see their own consumption when an engineer column
  // exists; otherwise (no such column) the view is unfiltered.
  const scoped = useMemo(() => {
    if (scope.all || (!engineerKey && !emailKey)) return rows;
    return rows.filter((r) =>
      (engineerKey && scope.names.has(g(r, engineerKey).trim().toLowerCase())) ||
      (emailKey && g(r, emailKey).toLowerCase() === email),
    );
  }, [rows, scope, engineerKey, emailKey, email]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((r) => headerKeys.some((k) => g(r, k).toLowerCase().includes(q)));
  }, [scoped, search, headerKeys]);

  const baseCols = PREFERRED.filter((k) => headerKeys.includes(k)).concat(headerKeys.filter((k) => !PREFERRED.includes(k))).slice(0, 9);
  const columns: Column<Row>[] = baseCols.map((k) => ({
    key: k, header: k, width: UCN_KEYS.includes(k) ? 120 : 150, wrap: !UCN_KEYS.includes(k),
    ...(DATEISH.test(k) ? { render: (r: Row) => fmtLongDate(r[k]) } : {}),
    // A reconciliation line was booked by the office, not written by the
    // engineer on a call report — say so plainly.
    ...(k === 'source' ? {
      render: (r: Row) => (g(r, 'source') === 'Reconciliation'
        ? <span className="badge badge-warning" title="Booked by the office, not from a call report">Reconciliation</span>
        : <span className="muted">Report</span>),
    } : {}),
  }));
  // Reconcilers get a per-line adjust action; everyone sees when a line has
  // been corrected, so an amended quantity is never silently different from
  // what the engineer reported.
  if (mayReconcile && onDb) {
    columns.unshift({
      key: '_adj', header: '⚙', width: 46, sortable: false, wrap: false, align: 'center',
      render: (r: Row) => (
        <button className="btn btn-sm btn-icon" title="Adjust this quantity (reconciliation)"
          onClick={(e) => { e.stopPropagation(); void openAdjust(r); }}>✎</button>
      ),
    });
  }
  const qtyCol = columns.find((c) => c.key === 'qty');
  if (qtyCol) {
    qtyCol.render = (r: Row) => {
      const orig = g(r, 'original_qty');
      return (
        <span title={orig ? `Engineer reported ${orig}; adjusted by ${g(r, 'adjusted_by') || 'the office'}` : undefined}>
          {g(r, 'qty')}
          {!!orig && <span className="badge badge-warning" style={{ marginLeft: 6 }}>was {orig}</span>}
        </span>
      );
    };
  }
  const allFields = headerKeys.map((k) => ({ key: k, header: k }));

  return (
    <div>
      <PageHeader title="Spare Consumption" subtitle="Spares consumed against every call report (v2Consumption), traceable by UCN." icon="🧾" count={visible.length} />

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
        storageKey="spareConsumption"
        rowsBeforeScroll={14}
        dense
        onLoadMore={onDb ? loadMore : undefined}
        moreAvailable={onDb && more}
        loadingMore={busy}
        emptyText="No consumption yet — Refresh to load."
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="UCN, part, party, engineer…" />
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            {mayReconcile && onDb && (
              <button className="btn btn-sm btn-primary" onClick={() => setForm({ ...emptyForm })}>
                ＋ Add consumption
              </button>
            )}
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off">⟳ {timeAgo(lastSync)}</span>}
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('spare-consumption.csv', headerKeys.map((k) => ({ key: k, header: k })), visible as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />

      {adjust && (
        <Drawer open onClose={() => setAdjust(null)} title="Adjust quantity (reconciliation)" width={560}>
          <div className="kb-form">
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Corrects the quantity on a line the engineer already reported. Only the quantity
              changes — the call, part and engineer stay as they are. What it was, why, and who
              changed it are kept on the line and in the audit trail.
            </p>
            <div className="field">
              <label className="field-label">Line</label>
              <div className="muted" style={{ fontSize: 13 }}>
                <b>{g(adjust.row, 'part')}</b><br />
                {pick(adjust.row, UCN_KEYS)} · {pick(adjust.row, ENGINEER_KEYS)}
              </div>
            </div>
            <div className="field">
              <label className="field-label">Quantity <span style={{ color: 'var(--danger, #c00)' }}>*</span></label>
              <input className="input" type="number" min={1} max={adjust.max} style={{ width: 140 }}
                value={adjust.qty} autoFocus
                onChange={(e) => setAdjust((a) => a && ({ ...a, qty: e.target.value }))} />
              <span className="muted" style={{ fontSize: 12 }}>
                Reported {g(adjust.row, 'original_qty') || g(adjust.row, 'qty')} · up to {adjust.max} (what is in hand)
              </span>
            </div>
            <div className="field">
              <label className="field-label">Why <span style={{ color: 'var(--danger, #c00)' }}>*</span></label>
              <input className="input" value={adjust.reason}
                onChange={(e) => setAdjust((a) => a && ({ ...a, reason: e.target.value }))}
                placeholder="e.g. engineer keyed 2, actually fitted 4" />
            </div>
            <div className="kb-form-actions">
              <button className="btn btn-primary" onClick={() => void saveAdjust()} disabled={adjusting}>
                {adjusting ? 'Saving…' : 'Save adjustment'}
              </button>
              <button className="btn" onClick={() => setAdjust(null)} disabled={adjusting}>Cancel</button>
            </div>
          </div>
        </Drawer>
      )}

      {form && (
        <Drawer open onClose={() => setForm(null)} title="Add consumption (reconciliation)" width={720}>
          <div className="kb-form">
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Books spares against a call without waiting for the engineer's report — for a part
              fitted but never reported, or a stock correction. Saved as a <b>Reconciliation</b> line
              and taken off that engineer's hand stock, exactly as a reported consumption is.
            </p>

            <div className="field">
              <label className="field-label">UCN <span style={{ color: 'var(--danger, #c00)' }}>*</span></label>
              <input className="input" value={form.ucn} autoFocus
                onChange={(e) => setF('ucn', e.target.value)}
                onBlur={(e) => void lookupCall(e.target.value)}
                placeholder="26H29F0003 — tab out to pull the call in" />
              {!!form.call_number && (
                <span className="muted" style={{ fontSize: 12 }}>Call {form.call_number}</span>
              )}
            </div>

            <div className="field">
              <label className="field-label">Engineer (whose hand stock this comes off) <span style={{ color: 'var(--danger, #c00)' }}>*</span></label>
              <input className="input" value={form.engineer}
                onChange={(e) => setF('engineer', e.target.value)}
                onBlur={(e) => void loadStock(e.target.value)}
                placeholder="Filled from the call — change if it was someone else" />
              <span className="muted" style={{ fontSize: 12 }}>
                {stockBusy ? 'Loading hand stock…'
                  : form.engineer && stock.length === 0 ? 'Nothing in this engineer\u2019s hand stock.'
                  : stock.length ? `${stock.length} part${stock.length === 1 ? '' : 's'} in hand` : ''}
              </span>
            </div>

            <div className="field">
              <label className="field-label">Parts used <span style={{ color: 'var(--danger, #c00)' }}>*</span></label>
              {form.lines.map((l, i) => (
                <div className="reco-line" key={i}>
                  <select className="select" value={l.part} disabled={!stock.length}
                    onChange={(e) => setLine(i, 'part', e.target.value)}>
                    <option value="">{stock.length ? '— pick a part —' : 'Enter the UCN first'}</option>
                    {stock.map((r) => (
                      <option key={r.part} value={r.part}>{r.part} — {r.qty} in hand</option>
                    ))}
                  </select>
                  <input className="input" type="number" min={1} step={1} style={{ width: 110 }}
                    max={l.part ? remainingFor(i, l.part) : undefined}
                    value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)}
                    title={l.part ? `Up to ${remainingFor(i, l.part)}` : 'Pick a part first'} />
                  <button className="btn btn-ghost btn-sm" title="Remove this part"
                    onClick={() => dropLine(i)} disabled={form.lines.length === 1}>✕</button>
                </div>
              ))}
              <button className="btn btn-sm" onClick={addLine} disabled={!stock.length}>＋ Add another part</button>
            </div>

            <div className="field">
              <label className="field-label">Why <span style={{ color: 'var(--danger, #c00)' }}>*</span></label>
              <input className="input" value={form.remarks} onChange={(e) => setF('remarks', e.target.value)}
                placeholder="e.g. fitted on site, never reported; stock count correction" />
            </div>

            {!!formProblem() && <div className="sheet-banner sheet-banner-error"><span>{formProblem()}</span></div>}

            <div className="kb-form-actions">
              <button className="btn btn-primary" onClick={() => void saveReconciliation()}
                disabled={saving || !!formProblem()}>
                {saving ? 'Saving…' : 'Record consumption'}
              </button>
              <button className="btn" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}

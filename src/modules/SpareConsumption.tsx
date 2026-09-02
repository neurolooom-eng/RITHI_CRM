import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, fmtLongDate, timeAgo } from '../lib/format';
import { listTabRows, sheetsConfigured } from '../lib/sheets';
import {
  listConsumptionRows, supabaseConfigured, addReconciliationConsumption, searchCalls,
  listEngineerStock, type StockRow,
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

  const load = async () => {
    if (onDb) {
      setBusy(true); setMsg({ tone: 'info', text: 'Loading spare consumption…' });
      try {
        const r = await listConsumptionRows(PAGE, 0);
        const mapped = r.map((x, i) => ({ ...x, id: `${pick(x, UCN_KEYS)}-${i}` } as Row));
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

      {form && (
        <Drawer open onClose={() => setForm(null)} title="Add consumption (reconciliation)" width={640}>
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
                <div className="kb-att-row" key={i}>
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

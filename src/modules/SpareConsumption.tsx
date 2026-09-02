import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, fmtLongDate, timeAgo } from '../lib/format';
import { listTabRows, sheetsConfigured } from '../lib/sheets';
import {
  listConsumptionRows, supabaseConfigured, addReconciliationConsumption, searchCalls,
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

  // RECONCILIATION: Admin / Spare Coordinator book a spare against a call
  // straight into consumption, without waiting for the engineer's report. The
  // row is flagged so it is never mistaken for something the engineer wrote.
  const { can } = useAuth();
  const mayReconcile = can('consumption.reconcile');
  const emptyForm = { ucn: '', call_number: '', part: '', qty: '1', engineer: '', remarks: '' };
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [saving, setSaving] = useState(false);
  const setF = (k: keyof typeof emptyForm, v: string) => setForm((f) => f && ({ ...f, [k]: v }));

  // Typing a UCN or call number fills in the call's engineer, so a
  // reconciliation lands against the right person's hand stock.
  const lookupCall = async (term: string) => {
    const t = term.trim();
    if (!t || !onDb) return;
    try {
      const hits = await searchCalls('', { q: t }, 5);
      const hit = hits.find((c) => String(c.ucn ?? '').toLowerCase() === t.toLowerCase()
                               || String(c.callNumber ?? '').toLowerCase() === t.toLowerCase()) ?? hits[0];
      if (!hit) return;
      setForm((f) => f && ({
        ...f,
        ucn: String(hit.ucn ?? f.ucn),
        call_number: String(hit.callNumber ?? f.call_number),
        engineer: f.engineer || String(hit.allocatedTo ?? ''),
      }));
    } catch { /* leave what was typed */ }
  };

  const saveReconciliation = async () => {
    if (!form) return;
    if (!form.ucn.trim() && !form.call_number.trim()) {
      setMsg({ tone: 'error', text: 'Give the UCN or the Call Number this spare was used on.' }); return;
    }
    if (!form.part.trim()) { setMsg({ tone: 'error', text: 'Pick the part.' }); return; }
    const qty = Number(form.qty);
    if (!Number.isFinite(qty) || qty <= 0) { setMsg({ tone: 'error', text: 'Quantity must be more than zero.' }); return; }
    setSaving(true);
    const res = await addReconciliationConsumption({
      ucn: form.ucn, call_number: form.call_number, part: form.part, qty,
      engineer: form.engineer, remarks: form.remarks,
      recorded_by: String(user?.fullName ?? user?.email ?? ''),
    });
    setSaving(false);
    if (!res.ok) {
      setMsg({ tone: 'error', text: /permission|policy/i.test(res.error ?? '')
        ? 'Your role cannot add a reconciliation line (needs consumption.reconcile).'
        : (res.error ?? 'Could not save.') });
      return;
    }
    setForm(null);
    setMsg({ tone: 'ok', text: `Reconciliation recorded — ${qty} x ${form.part} against ${form.ucn || form.call_number}.` });
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
        <Drawer open onClose={() => setForm(null)} title="Add consumption (reconciliation)" width={560}>
          <div className="kb-form">
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Books a spare against a call without waiting for the engineer's report. It is
              recorded as a <b>Reconciliation</b> line and reduces that engineer's hand stock,
              exactly as a reported consumption does.
            </p>
            <div className="field">
              <label className="field-label">UCN</label>
              <input className="input" value={form.ucn} autoFocus
                onChange={(e) => setF('ucn', e.target.value)}
                onBlur={(e) => void lookupCall(e.target.value)}
                placeholder="26H29F0003 — tab out to pull the call in" />
            </div>
            <div className="field">
              <label className="field-label">Call Number</label>
              <input className="input" value={form.call_number}
                onChange={(e) => setF('call_number', e.target.value)}
                onBlur={(e) => void lookupCall(e.target.value)}
                placeholder="R18514-ORION-G-557" />
            </div>
            <div className="field">
              <label className="field-label">Part</label>
              <input className="input" value={form.part} onChange={(e) => setF('part', e.target.value)}
                placeholder="ECG-022|EARTH CABLE-ORG" />
            </div>
            <div className="field">
              <label className="field-label">Quantity</label>
              <input className="input" type="number" min={1} step={1} style={{ width: 120 }}
                value={form.qty} onChange={(e) => setF('qty', e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Engineer (whose stock this comes off)</label>
              <input className="input" value={form.engineer} onChange={(e) => setF('engineer', e.target.value)}
                placeholder="Filled from the call — change if it was someone else" />
            </div>
            <div className="field">
              <label className="field-label">Why (recorded with the entry)</label>
              <input className="input" value={form.remarks} onChange={(e) => setF('remarks', e.target.value)}
                placeholder="e.g. fitted on site, never reported; stock count correction" />
            </div>
            <div className="kb-form-actions">
              <button className="btn btn-primary" onClick={() => void saveReconciliation()} disabled={saving}>
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

import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, Drawer } from '../components/ui/ui';
import { csvExport, timeAgo } from '../lib/format';
import {
  queryParts, supabaseConfigured, addPart, setPartActive,
  normalisePartCode, composeItemDetail, PART_CODE_RE, type PartFilter,
} from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { listMaster, dataConfigured } from '../lib/sheets';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';

// ===========================================================================
// PART MASTER — live from the ITEM Master rows (Supabase `parts`), the same
// catalogue the spare pickers read. Cached locally with a last-sync stamp
// (like Party Master): instant load from cache, 30-min auto refresh, manual
// force-sync, field filters that query the server live.
// Without Supabase the sheet-backed `spare` master is listed read-only, so the
// screen still shows the catalogue on an Apps-Script-only deployment.
// ===========================================================================

const CACHE_KEY = 'partMaster';
const PAGE = 1000;
type Row = Record<string, unknown> & { id: string };

const COLUMNS: Column<Row>[] = [
  { key: 'code', header: 'Part Code', width: 140, wrap: false },
  { key: 'description', header: 'Description', width: 380 },
  { key: 'item_detail', header: 'Item Detail', width: 380 },
  { key: 'active', header: 'Active', width: 90, wrap: false, render: (r) => (r.active === false ? 'No' : 'Yes') },
];

const toRows = (data: Record<string, unknown>[], base: number): Row[] =>
  data.map((p, i) => ({ ...p, id: String(p.id ?? base + i) } as Row));

// Sheet fallback: the `spare` master is a flat "CODE|Description" list.
const fromValues = (values: string[]): Row[] =>
  values.map((v, i) => {
    const bar = v.indexOf('|');
    return {
      id: `spare-${i}`,
      code: bar >= 0 ? v.slice(0, bar).trim() : '',
      description: bar >= 0 ? v.slice(bar + 1).trim() : v,
      item_detail: v,
      active: true,
    } as Row;
  });

export function PartMaster() {
  const cached = loadCache<Row>(CACHE_KEY);
  const live = supabaseConfigured();
  const [filter, setFilter] = useState<PartFilter>({ q: '', code: '', description: '', active: '' });
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [offset, setOffset] = useState(cached?.rows.length ?? 0);
  const [more, setMore] = useState((cached?.rows.length ?? 0) >= PAGE);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    dataConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load Part Master.' },
  );
  const set = (k: keyof PartFilter, v: string) => setFilter((c) => ({ ...c, [k]: v }));
  const hasFilter = !!(filter.q || filter.code || filter.description || filter.active);

  // Force-sync the browse set (no filters) and cache it.
  const refresh = async () => {
    if (!dataConfigured()) return;
    setBusy(true);
    try {
      const r = live ? toRows(await queryParts({}, 0, PAGE), 0) : fromValues(await listMaster('spare'));
      setRows(r); setOffset(r.length); setMore(live && r.length === PAGE);
      setLastSync(saveCache(CACHE_KEY, r));
      setMsg({ tone: r.length ? 'ok' : 'info', text: r.length ? `Synced ${r.length}${r.length === PAGE ? '+' : ''} parts.` : 'The parts catalogue is empty — import the ITEM Master first.' });
    } catch (e) {
      setMsg({ tone: 'error', text: `Sync failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  // Mount: show cache, refresh if stale/empty. 30-min auto force-sync.
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return; mounted.current = true;
    if (!dataConfigured()) return;
    if (!rows.length || isStale(lastSync)) void refresh();
    else setMsg({ tone: 'info', text: `Showing cached data — synced ${timeAgo(lastSync)}. ↻ Refresh to update.` });
    const id = window.setInterval(() => { if (!hasFilter) void refresh(); }, SYNC_TTL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filters: query the server live (debounced). Clearing them restores the cache.
  useEffect(() => {
    if (!mounted.current || !live) return;
    if (!hasFilter) {
      const c = loadCache<Row>(CACHE_KEY);
      if (c) { setRows(c.rows); setOffset(c.rows.length); setMore(c.rows.length >= PAGE); setLastSync(c.at); }
      return;
    }
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const data = await queryParts(filter, 0, PAGE);
        setRows(toRows(data, 0)); setOffset(data.length); setMore(data.length === PAGE);
        setMsg({ tone: 'ok', text: `${data.length}${data.length === PAGE ? '+' : ''} parts matched (live).` });
      } catch (e) {
        setMsg({ tone: 'error', text: `Search failed: ${e instanceof Error ? e.message : String(e)}` });
      } finally { setBusy(false); }
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.q, filter.code, filter.description, filter.active]);

  const loadMore = async () => {
    setBusy(true);
    try {
      const data = await queryParts(hasFilter ? filter : {}, offset, PAGE);
      const merged = [...rows, ...toRows(data, rows.length)];
      setRows(merged); setOffset(offset + data.length); setMore(data.length === PAGE);
      if (!hasFilter) setLastSync(saveCache(CACHE_KEY, merged));
    } catch (e) {
      setMsg({ tone: 'error', text: `Load more failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  // Local filtering for the sheet fallback (no server-side search there).
  const visible = useMemo(() => {
    if (live || !hasFilter) return rows;
    const q = (filter.q ?? '').toLowerCase();
    const code = (filter.code ?? '').toLowerCase();
    const desc = (filter.description ?? '').toLowerCase();
    return rows.filter((r) =>
      (!q || String(r.item_detail ?? '').toLowerCase().includes(q)) &&
      (!code || String(r.code ?? '').toLowerCase().includes(code)) &&
      (!desc || String(r.description ?? '').toLowerCase().includes(desc)));
  }, [rows, live, hasFilter, filter.q, filter.code, filter.description]);

  const allFields = useMemo(() => {
    const ks = new Set<string>();
    rows.slice(0, 40).forEach((r) => Object.keys(r).forEach((k) => { if (k && k !== 'id' && k !== 'extra') ks.add(k); }));
    return [...ks].map((k) => ({ key: k, header: k }));
  }, [rows]);

  // ---- add / deactivate ---------------------------------------------------
  // A part is never deleted: its code may already be on a spare request, a stock
  // out or an engineer's hand stock. Deactivating keeps that history and takes
  // the part out of the pickers.
  const { can } = useAuth();
  const mayEdit = can('masters.edit') && live;
  const [form, setForm] = useState<{ code: string; description: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const formProblem = (): string => {
    if (!form) return '';
    const c = normalisePartCode(form.code);
    if (!c) return 'Give the part code.';
    if (c.includes('|')) return 'A part code cannot contain "|" — that separates the code from the description.';
    if (!PART_CODE_RE.test(c)) return 'Use letters, digits and - _ . / only, starting with a letter or digit.';
    if (!form.description.trim()) return 'Give the description.';
    return '';
  };

  const saveNew = async () => {
    if (!form) return;
    const problem = formProblem();
    if (problem) { setMsg({ tone: 'error', text: problem }); return; }
    setSaving(true);
    const res = await addPart(form.code, form.description);
    setSaving(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not add the part.' }); return; }
    setForm(null);
    setMsg({ tone: 'ok', text: `Part ${normalisePartCode(form.code)} added.` });
    await refresh();
  };

  const toggleActive = async (r: Row) => {
    const id = Number(r.id);
    const now = r.active !== false;
    const code = String(r.code ?? '');
    if (now && !confirm(`Deactivate ${code}? It stays on every record that already uses it, but stops being offered in the pickers.`)) return;
    const res = await setPartActive(id, !now);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not update the part.' }); return; }
    setMsg({ tone: 'ok', text: `${code} ${now ? 'deactivated' : 'reactivated'}.` });
    await refresh();
  };

  return (
    <div>
      <PageHeader
        title="Part Master"
        subtitle="Spare parts catalogue (ITEM Master) — cached locally, synced from the database."
        icon="🔩" count={visible.length}
        actions={mayEdit && <button className="btn btn-primary" onClick={() => setForm({ code: '', description: '' })}>＋ Add part</button>}
      />
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      <DataTable<Row>
        columns={mayEdit ? [...COLUMNS, {
          key: '_act', header: '', width: 120, sortable: false, wrap: false, align: 'center',
          render: (r: Row) => (
            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); void toggleActive(r); }}
              title={r.active === false ? 'Put this part back in the pickers' : 'Take this part out of the pickers'}>
              {r.active === false ? '↩ Reactivate' : '⊘ Deactivate'}
            </button>
          ),
        }] : COLUMNS}
        allFields={allFields}
        rows={visible}
        getRowId={(r) => r.id}
        storageKey="partMaster"
        rowsBeforeScroll={16}
        dense
        onLoadMore={loadMore}
        moreAvailable={more}
        loadingMore={busy}
        emptyText={busy ? 'Loading…' : 'No parts match.'}
        toolbar={
          <Toolbar>
            <div className="call-search">
              <input className="input" placeholder="Search code / description" value={filter.q} onChange={(e) => set('q', e.target.value)} />
              <input className="input" placeholder="Part code" value={filter.code} onChange={(e) => set('code', e.target.value)} />
              <input className="input" placeholder="Description" value={filter.description} onChange={(e) => set('description', e.target.value)} />
              {live && (
                <select className="input" value={filter.active} onChange={(e) => set('active', e.target.value)}>
                  <option value="">Active & inactive</option>
                  <option value="yes">Active only</option>
                  <option value="no">Inactive only</option>
                </select>
              )}
            </div>
            <button className="btn btn-sm" onClick={() => void refresh()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            {lastSync && <span className="conn-dot conn-off" title={`Last synced ${new Date(lastSync).toLocaleString()}`}>⟳ {timeAgo(lastSync)}</span>}
            {visible.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('part-master.csv', COLUMNS.map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[])}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />

      {form && (
        <Drawer open onClose={() => setForm(null)} title="Add part" width={560}>
          <div className="kb-form">
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              The catalogue stores the code and description separately and shows pickers
              <b> CODE|Description</b>. That pipe is what every spare picker splits on, so a
              code can never contain one.
            </p>
            <div className="field">
              <label className="field-label">Part code <span style={{ color: 'var(--danger, #c00)' }}>*</span></label>
              <input className="input" value={form.code} autoFocus
                onChange={(e) => setForm((f) => f && ({ ...f, code: e.target.value }))}
                placeholder="ECG-022" />
              <span className="muted" style={{ fontSize: 12 }}>
                Letters, digits and - _ . / — stored upper-case. A recycled part is the same code with an R in front (RECG-022).
              </span>
            </div>
            <div className="field">
              <label className="field-label">Description <span style={{ color: 'var(--danger, #c00)' }}>*</span></label>
              <input className="input" value={form.description}
                onChange={(e) => setForm((f) => f && ({ ...f, description: e.target.value }))}
                placeholder="EARTH CABLE-ORG" />
            </div>
            <div className="field">
              <label className="field-label">Will be listed as</label>
              <code style={{ fontSize: 13 }}>
                {form.code || form.description ? composeItemDetail(form.code, form.description) : '—'}
              </code>
            </div>
            {!!formProblem() && <div className="sheet-banner sheet-banner-error"><span>{formProblem()}</span></div>}
            <div className="kb-form-actions">
              <button className="btn btn-primary" onClick={() => void saveNew()} disabled={saving || !!formProblem()}>
                {saving ? 'Saving…' : 'Add part'}
              </button>
              <button className="btn" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, Drawer } from '../components/ui/ui';
import { csvExport, timeAgo } from '../lib/format';
import {
  queryParts, supabaseConfigured, addPart, setPartActive,
  updatePart, renamePart, partRenameImpact, type PartRenameImpact,
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

// THE ITEM MASTER'S OWN FIELDS (0148/0149). They were arriving in `extra` as
// loose jsonb, which keeps a value but cannot group, filter or show it — so
// "Spare / Consumable" was in the database and unusable, which is exactly what
// Spare Insights needed. A blank category reads as "— not set —" rather than
// being folded into either bucket: 86% of the file has none, and the insight
// reports that share rather than dividing it up.
const COLUMNS: Column<Row>[] = [
  { key: 'code', header: 'Part Code', width: 140, wrap: false },
  { key: 'description', header: 'Description', width: 380 },
  { key: 'item_detail', header: 'Item Detail', width: 380 },
  { key: 'category', header: 'Spare / Consumable', width: 150, wrap: false,
    render: (r) => (String(r.category ?? '').trim() || <span className="muted">— not set —</span>) },
  { key: 'product', header: 'Product', width: 110, wrap: false },
  { key: 'purchase_cost', header: 'Purchase Cost', width: 130, wrap: false, align: 'right' },
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

  // ---- EDITING AN EXISTING PART --------------------------------------------
  // TWO KINDS OF CHANGE, and the screen keeps them apart because the database
  // does. Category, family and cost are ordinary columns nothing points at.
  // The CODE and DESCRIPTION together are the part's IDENTITY — nine tables
  // name it by that string and there is not one foreign key to `parts` — so
  // changing them is a RENAME that carries every one of those records (0196).
  type EditForm = {
    id: number; code: string; description: string;
    category: string; product: string; cost: string;
    wasCode: string; wasDescription: string; wasDetail: string;
  };
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [impact, setImpact] = useState<PartRenameImpact[] | null>(null);
  const [impactFor, setImpactFor] = useState('');

  const openEdit = (r: Row) => {
    const cost = r.purchase_cost;
    setEdit({
      id: Number(r.id),
      code: String(r.code ?? ''), description: String(r.description ?? ''),
      category: String(r.category ?? ''), product: String(r.product ?? ''),
      cost: cost === null || cost === undefined ? '' : String(cost),
      wasCode: String(r.code ?? ''), wasDescription: String(r.description ?? ''),
      wasDetail: String(r.item_detail ?? ''),
    });
    setImpact(null); setImpactFor('');
  };

  // WHAT WOULD MOVE, fetched when the drawer opens and not on every keystroke:
  // it is a property of the part being renamed FROM, which does not change
  // while the form is open.
  useEffect(() => {
    if (!edit || !live || impactFor === edit.wasDetail) return;
    setImpactFor(edit.wasDetail);
    void partRenameImpact(edit.wasDetail).then(setImpact).catch(() => setImpact([]));
  }, [edit, live, impactFor]);

  const editProblem = (): string => {
    if (!edit) return '';
    const c = normalisePartCode(edit.code);
    if (!c) return 'Give the part code.';
    if (c.includes('|')) return 'A part code cannot contain "|" — that separates the code from the description.';
    if (!PART_CODE_RE.test(c)) return 'Use letters, digits and - _ . / only, starting with a letter or digit.';
    if (!edit.description.trim()) return 'Give the description.';
    if (edit.description.includes('|')) return 'A description cannot contain "|" either.';
    if (edit.cost.trim() && !Number.isFinite(Number(edit.cost))) return 'Purchase cost has to be a number.';
    return '';
  };
  const renaming = !!edit
    && composeItemDetail(edit.code, edit.description) !== composeItemDetail(edit.wasCode, edit.wasDescription);
  const movingCount = (impact ?? []).reduce((n, r) => n + r.rows, 0);

  const saveEdit = async () => {
    if (!edit) return;
    const problem = editProblem();
    if (problem) { setMsg({ tone: 'error', text: problem }); return; }
    setSaving(true);
    try {
      // THE RENAME FIRST. If it is refused — the name is taken, the right is
      // missing — nothing else should have been written either, so the safe
      // fields wait behind it rather than landing on a part that did not move.
      if (renaming) {
        const res = await renamePart(edit.id, edit.code, edit.description);
        if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not rename the part.' }); return; }
        const moved = Object.entries(res.moved ?? {}).filter(([, n]) => n > 0);
        setMsg({ tone: 'ok', text: moved.length
          ? `Renamed to ${res.to}, and ${moved.reduce((n, [, v]) => n + v, 0)} record(s) came with it — `
            + `${moved.map(([k, v]) => `${k} ${v}`).join(', ')}.`
          : `Renamed to ${res.to}. Nothing else names this part yet.` });
      }
      const patch = {
        category: edit.category.trim(), product: edit.product.trim(),
        // BLANK IS NULL, NOT ZERO. A cost nobody has recorded and a cost of
        // nothing are different answers about a part.
        purchase_cost: edit.cost.trim() === '' ? null : Number(edit.cost),
      };
      const res2 = await updatePart(edit.id, patch);
      if (!res2.ok) { setMsg({ tone: 'error', text: res2.error ?? 'Could not save the part.' }); return; }
      if (!renaming) setMsg({ tone: 'ok', text: `${composeItemDetail(edit.code, edit.description)} saved.` });
      setEdit(null);
      await refresh();
    } finally { setSaving(false); }
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
        onRefresh={() => void refresh()}
        refreshing={busy}
        syncedAt={lastSync}
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
          key: '_act', header: '', width: 190, sortable: false, wrap: false, align: 'center',
          render: (r: Row) => (
            <div className="row" onClick={(e) => e.stopPropagation()}>
              <button className="btn btn-sm" onClick={() => openEdit(r)}
                title="Edit this part — and rename it, carrying every record that names it">✎ Edit</button>
              <button className="btn btn-sm" onClick={() => void toggleActive(r)}
                title={r.active === false ? 'Put this part back in the pickers' : 'Take this part out of the pickers'}>
                {r.active === false ? '↩ Reactivate' : '⊘ Deactivate'}
              </button>
            </div>
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
                <SelectPicker value={filter.active ?? ''} onChange={(v) => set('active', v)}
                  placeholder="Active & inactive"
                  options={[{ value: 'yes', label: 'Active only' }, { value: 'no', label: 'Inactive only' }]} />
              )}
            </div>
            <div className="spacer" />
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

      {edit && (
        <Drawer open title={`Edit ${edit.wasDetail}`} onClose={() => setEdit(null)} storeKey="partEdit">
          <div className="kb-form">
            {/* WHAT IS SAFE AND WHAT IS NOT, said before either box is typed
                into. The two halves of this form behave completely differently
                and only one of them can move stock. */}
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Category, family and cost are just fields on this part. The <b>code</b> and
              <b> description</b> are its identity — every consumption line, hand-stock row and
              transfer names the part by <b>CODE|Description</b>, so changing either is a
              <b> rename</b> that moves all of them with it.
            </p>

            <div className="field">
              <label className="field-label">Part code</label>
              <input className="input" value={edit.code} autoFocus
                onChange={(e) => setEdit((f) => f && ({ ...f, code: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">Description</label>
              <input className="input" value={edit.description}
                onChange={(e) => setEdit((f) => f && ({ ...f, description: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">Will be listed as</label>
              <code style={{ fontSize: 13 }}>{composeItemDetail(edit.code, edit.description)}</code>
            </div>

            {/* THE SIZE OF WHAT IS ABOUT TO MOVE, before it moves. A count
                afterwards is a report; a count beforehand is a decision. It is
                shown whenever the name has changed, INCLUDING when nothing
                references the part — "nothing else names this" is the answer
                that makes a rename easy, and hiding it would leave the reader
                assuming the worst. */}
            {renaming && (
              <div className={`sheet-banner ${movingCount ? 'sheet-banner-warn' : 'sheet-banner-info'}`}>
                <span>
                  {impact === null ? 'Checking what names this part…'
                    : movingCount === 0
                      ? <>Nothing else names this part yet, so this rename moves only the catalogue entry.</>
                      : <>
                          <b>{movingCount}</b> record(s) will be renamed with it
                          {' — '}{impact.map((r) => `${r.relation} ${r.rows}`).join(', ')}.
                          {' '}They all move together, so hand stock stays exactly as it is.
                        </>}
                </span>
              </div>
            )}

            <div className="field">
              <label className="field-label">Category</label>
              <input className="input" value={edit.category} placeholder="SPARE / CONSUMABLE"
                onChange={(e) => setEdit((f) => f && ({ ...f, category: e.target.value }))} />
              <span className="muted" style={{ fontSize: 12 }}>
                Left blank it stays blank — Spare Insights reports those as Unclassified rather than guessing.
              </span>
            </div>
            <div className="field">
              <label className="field-label">Product family</label>
              <input className="input" value={edit.product}
                onChange={(e) => setEdit((f) => f && ({ ...f, product: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">Purchase cost</label>
              <input className="input" value={edit.cost} inputMode="decimal"
                onChange={(e) => setEdit((f) => f && ({ ...f, cost: e.target.value }))} />
              <span className="muted" style={{ fontSize: 12 }}>
                Blank means nobody has recorded one, which is not the same as zero.
              </span>
            </div>

            {!!editProblem() && <div className="sheet-banner sheet-banner-error"><span>{editProblem()}</span></div>}
            <div className="kb-form-actions">
              <button className="btn btn-primary" onClick={() => void saveEdit()}
                      disabled={saving || !!editProblem() || (renaming && impact === null)}>
                {saving ? 'Saving…' : renaming ? `Rename and save${movingCount ? ` (${movingCount} records move)` : ''}` : 'Save'}
              </button>
              <button className="btn" onClick={() => setEdit(null)} disabled={saving}>Cancel</button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}

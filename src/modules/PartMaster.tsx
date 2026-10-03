import { useEffect, useMemo, useRef, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { PickList } from '../components/ui/PickList';
import { MultiPick } from '../components/ui/MultiPick';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, Drawer, Modal } from '../components/ui/ui';
import { csvExport, timeAgo } from '../lib/format';
import {
  queryAllParts, supabaseConfigured, addPart, setPartActive,
  updatePart, renamePart, partRenameImpact, type PartRenameImpact,
  normalisePartCode, composeItemDetail, PART_CODE_RE, type PartFilter,
  deleteMasterRecord,
} from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { listMaster, dataConfigured } from '../lib/sheets';
import { loadCache, saveCache, startBackgroundSync } from '../lib/cache';
import { partial } from '../lib/exportscope';
import { isSysColumn } from '../lib/syscols';
import { useMaster, clearMasterCache } from '../lib/masters';
import {
  complaintProducts, unrecognisedProducts, matchesProductFilter, applyBulkProducts,
  ALL_PRODUCTS_FILTER, UNRECOGNISED_FILTER, type BulkProductsMode,
} from '../lib/complaints';
import { ProductAccessories } from './ProductAccessories';

// ===========================================================================
// PART MASTER — live from the ITEM Master rows (Supabase `parts`), the same
// catalogue the spare pickers read. Cached locally with a last-sync stamp
// (like Party Master): instant load from cache, 30-min auto refresh, manual
// force-sync, field filters that query the server live.
// Without Supabase the sheet-backed `spare` master is listed read-only, so the
// screen still shows the catalogue on an Apps-Script-only deployment.
// ===========================================================================

const CACHE_KEY = 'partMaster';
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
  // HSN CODE (0309, the user, 2026-10-01). 29 parts carried it inside the
  // description; it was lifted out once and lives here since.
  { key: 'hsn_code', header: 'HSN Code', width: 110, wrap: false },
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
  const [filter, setFilter] = useState<PartFilter>({ q: '', code: '', description: '', active: '', product: '' });
  // THE PRODUCT DATABASE'S NAMES (the user, 2026-09-30: map parts "Same logic
  // as of Standard Complaint" -- the names a machine, a call and a spare request
  // carry). EMPTY = COMMON TO ALL PRODUCTS. A value on a part that is not one of
  // these is kept and FLAGGED, never rewritten ("Keep and flag them").
  const productNames = useMaster('product', [], live).values;
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  // The whole catalogue is always loaded, so there is never a page to fetch.
  const [more, setMore] = useState(false);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [busy, setBusy] = useState(false);
  // Read by the background sync, which waits while a read is in flight.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    dataConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load Part Master.' },
  );
  const set = (k: keyof PartFilter, v: string) => setFilter((c) => ({ ...c, [k]: v }));
  const hasFilter = !!(filter.q || filter.code || filter.description || filter.active || filter.product);

  // Force-sync the browse set (no filters) and cache it.
  const refresh = async () => {
    if (!dataConfigured()) return;
    setBusy(true);
    try {
      // THE WHOLE CATALOGUE, EVERY TIME (the user, 2026-09-30: "Reload
      // automatically full list in Part Master"), paged to the end by
      // allRows, so every filter and the global search below run over all of
      // it on the device with no Load more and no server round trip.
      const r = live ? toRows(await queryAllParts({}), 0) : fromValues(await listMaster('spare'));
      setRows(r); setMore(false);
      setLastSync(saveCache(CACHE_KEY, r));
      // A part just added or re-mapped reaches this device's spare pickers.
      if (live) clearMasterCache('spareProducts');
      setMsg({ tone: r.length ? 'ok' : 'info', text: r.length ? `Loaded all ${r.length.toLocaleString()} parts.` : 'The parts catalogue is empty — import the ITEM Master first.' });
    } catch (e) {
      setMsg({ tone: 'error', text: `Sync failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  // Mount: show cache, refresh if stale/empty. 30-min auto force-sync.
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return; mounted.current = true;
    if (!dataConfigured()) return;
    // The stored copy goes on screen first (it may hold only the first
    // 1,500), and the full list is always reloaded behind it.
    if (rows.length) setMsg({ tone: 'info', text: `Showing the stored copy (synced ${timeAgo(lastSync)}) while the full list reloads…` });
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // THE 30-MINUTE SYNC, IN ITS OWN EFFECT so it sees the CURRENT filter.
  // Registered inside the mount-only effect above, its `hasFilter` was the
  // first render's `false` for ever -- so half an hour after somebody filtered
  // the list, it was silently replaced by the unfiltered first page while the
  // filter boxes still showed the filter. Rebuilt whenever the filter turns on
  // or off; no timer at all while one is set.
  // FILTERS ARE APPLIED ON THE DEVICE to the whole list now, so a reload no
  // longer throws a filter away and the sync runs whatever is being filtered.
  useEffect(() => {
    if (!dataConfigured()) return;
    return startBackgroundSync(() => { void refresh(); }, () => busyRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // EVERY FILTER RUNS ON THE DEVICE, over the whole catalogue.
  //   * GLOBAL SEARCH (the user, 2026-09-30: "Add Global Search"): every word
  //     typed must appear somewhere in the part -- code, description, item
  //     detail, Spare / Consumable, product, cost, or any Item Master field
  //     kept in `extra` -- in any order ("vega filter" finds "FILTER ... VEGA").
  //   * Part code / Description: that field only.
  //   * Product: whole names; "Common" = none; "Unrecognised" = a name the
  //     Product Database lacks (matchesProductFilter, complaints.ts).
  const loadMore = async () => { await refresh(); };
  const haystack = (r: Row): string => {
    const out: string[] = [];
    const walk = (v: unknown) => {
      if (v == null) return;
      if (typeof v === 'object') { Object.values(v as Record<string, unknown>).forEach(walk); return; }
      out.push(String(v));
    };
    for (const [k, v] of Object.entries(r)) if (k !== 'id' && !isSysColumn(k)) walk(v);
    return out.join(' ').toLowerCase();
  };
  const visible = useMemo(() => {
    if (!hasFilter) return rows;
    const words = (filter.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const code = (filter.code ?? '').trim().toLowerCase();
    const desc = (filter.description ?? '').trim().toLowerCase();
    return rows.filter((r) => {
      if (code && !String(r.code ?? '').toLowerCase().includes(code)) return false;
      if (desc && !String(r.description ?? '').toLowerCase().includes(desc)) return false;
      if (filter.active === 'yes' && r.active === false) return false;
      if (filter.active === 'no' && r.active !== false) return false;
      if (filter.product && !matchesProductFilter({ products: String(r.product ?? '') }, filter.product, productNames)) return false;
      if (words.length) { const h = haystack(r); if (!words.every((w) => h.includes(w))) return false; }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, hasFilter, filter.q, filter.code, filter.description, filter.active, filter.product, productNames]);

  const allFields = useMemo(() => {
    const ks = new Set<string>();
    rows.slice(0, 40).forEach((r) => Object.keys(r).forEach((k) => { if (k && k !== 'id' && k !== 'extra' && !isSysColumn(k)) ks.add(k); }));
    return [...ks].map((k) => ({ key: k, header: k }));
  }, [rows]);

  // ---- add / deactivate ---------------------------------------------------
  // A part is never deleted: its code may already be on a spare request, a stock
  // out or an engineer's hand stock. Deactivating keeps that history and takes
  // the part out of the pickers.
  const { can } = useAuth();
  // ADD, EDIT AND DELETE ARE SEPARATE KEYS (0325, 2026-10-03); "Add / edit
  // master records" still grants the first two. The accessories panel keeps
  // that key itself: its policies were not split.
  const mayAdd = can('masters.parts.add') && live;
  const mayEdit = can('masters.parts.edit') && live;
  const mayDelete = can('masters.parts.delete') && live;
  const mayAccessories = can('masters.edit.records') && live;
  // A RENAME moves every record naming the part, so it is its own tick
  // (finding 67, 0289); the other fields are ordinary record edits.
  const mayRename = can('masters.edit.rename_part');
  const [form, setForm] = useState<{ code: string; description: string; category: string; product: string; cost: string; common: boolean; hsn: string } | null>(null);
  // Whether Add has been pressed on the new-part form -- its error shows only then.
  const [tried, setTried] = useState(false);
  // DIGITS ONLY, ANY LENGTH. No length is imposed: one part's code on file is
  // 7 digits, kept as written (the user's choice), and a rule here would make
  // that part unsavable until somebody decided what it should be.
  const hsnProblem = (v: string) => (v.trim() && !/^[0-9]+$/.test(v.trim()) ? 'The HSN code takes digits only.' : '');
  const [saving, setSaving] = useState(false);

  const formProblem = (): string => {
    if (!form) return '';
    const c = normalisePartCode(form.code);
    if (!c) return 'Give the part code.';
    if (c.includes('|')) return 'A part code cannot contain "|" — that separates the code from the description.';
    if (!PART_CODE_RE.test(c)) return 'Use letters, digits and - _ . / only, starting with a letter or digit.';
    if (!form.description.trim()) return 'Give the description.';
    // MANDATORY WHEN CREATING (the user, 2026-09-30); editing an older part
    // with these blank is still allowed.
    if (!form.category.trim()) return 'Choose Spare / Consumable.';
    // PRODUCTS, OR "COMMON TO ALL PRODUCTS" -- stored empty, and chosen on
    // purpose rather than left blank by accident.
    if (!form.common && !form.product.trim()) return 'Choose the product(s) this part is for, or tick Common to all products.';
    if (form.cost.trim() && !Number.isFinite(Number(form.cost))) return 'Purchase cost must be a number.';
    return hsnProblem(form.hsn);
  };

  const saveNew = async () => {
    if (!form) return;
    const problem = formProblem();
    // THE FORM SAYS WHAT IS MISSING, once Add has been pressed -- not before
    // anything is typed (the master lists' Add entry form, 2026-10-03).
    if (problem) { setTried(true); return; }
    setSaving(true);
    const res = await addPart(form.code, form.description, {
      category: form.category, product: form.common ? '' : form.product, common: form.common,
      purchase_cost: form.cost.trim() === '' ? null : Number(form.cost),
      hsn_code: form.hsn.trim(),
    });
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
    category: string; product: string; cost: string; hsn: string;
    wasCode: string; wasDescription: string; wasDetail: string;
  };
  // THE FOUR THE ITEM MASTER USES, and they are the importer's own normalisation
  // (Spare / Consumable / Product / Labour) rather than a list invented here —
  // a form offering different words from the loader is how one part ends up
  // "Spare" and the next "SPARES".
  //
  // OFFERED, NOT ENFORCED. 0152 dropped the CHECK on this column deliberately:
  // it aborted a 1,300-row Item Master load part-written at row 174, and a
  // constraint that can half-load a master is in the wrong place. So the list
  // is a convenience, the current value is always kept (`withCurrent`), and a
  // value the file brought that is not one of these still shows and still saves.
  const PART_CATEGORIES = ['Spare', 'Consumable', 'Product', 'Labour'];
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
      hsn: String(r.hsn_code ?? ''),
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
    if (hsnProblem(edit.hsn)) return hsnProblem(edit.hsn);
    if (renaming && !mayRename) return 'Changing the code or description renames the part everywhere, which needs the “Rename a part” permission.';
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
        hsn_code: edit.hsn.trim(),
      };
      const res2 = await updatePart(edit.id, patch);
      if (!res2.ok) { setMsg({ tone: 'error', text: res2.error ?? 'Could not save the part.' }); return; }
      if (!renaming) setMsg({ tone: 'ok', text: `${composeItemDetail(edit.code, edit.description)} saved.` });
      setEdit(null);
      await refresh();
    } finally { setSaving(false); }
  };

  // ---- bulk: products of many parts at once (the Standard Complaint's rules,
  // applyBulkProducts in complaints.ts) ------------------------------------
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkProducts, setBulkProducts] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<BulkProductsMode>('replace');
  const applyBulk = async (ids: string[], clear: () => void) => {
    const targets = rows.filter((r) => ids.includes(r.id));
    if (!targets.length) return;
    const what = bulkMode === 'replace'
      ? (bulkProducts.length ? `fit ONLY ${bulkProducts.join(', ')}` : 'be COMMON to all products')
      : bulkMode === 'add' ? `also fit ${bulkProducts.join(', ')}` : `no longer fit ${bulkProducts.join(', ')}`;
    if (!confirm(`${targets.length} part${targets.length === 1 ? '' : 's'} will ${what}. Continue?`)) return;
    setBusy(true);
    let done = 0; const failed: string[] = [];
    try {
      for (let i = 0; i < targets.length; i += 10) {
        await Promise.all(targets.slice(i, i + 10).map(async (t) => {
          const next = applyBulkProducts(complaintProducts({ products: String(t.product ?? '') }), bulkProducts, bulkMode);
          const r = await updatePart(Number(t.id), { product: next.join(', ') });
          if (r.ok) done += 1; else failed.push(String(t.code ?? t.id));
        }));
      }
    } finally { setBusy(false); }
    clear();
    setMsg(failed.length
      ? { tone: 'error', text: `${done} updated; ${failed.length} could not be saved: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '…' : ''}` }
      : { tone: 'ok', text: `${done} part${done === 1 ? '' : 's'} updated.` });
    await refresh();
  };

  // ---- bulk: Spare / Consumable of many parts at once (the user, 2026-09-30:
  // "Bulk Edit Spare/Consumable Field as well") ------------------------------
  const [bulkCategory, setBulkCategory] = useState('');
  const applyBulkCategory = async (ids: string[], clear: () => void) => {
    const targets = rows.filter((r) => ids.includes(r.id));
    if (!targets.length || !bulkCategory) return;
    if (!confirm(`${targets.length} part${targets.length === 1 ? '' : 's'} will be set to "${bulkCategory}". Continue?`)) return;
    setBusy(true);
    let done = 0; const failed: string[] = [];
    try {
      for (let i = 0; i < targets.length; i += 10) {
        await Promise.all(targets.slice(i, i + 10).map(async (t) => {
          const r = await updatePart(Number(t.id), { category: bulkCategory });
          if (r.ok) done += 1; else failed.push(String(t.code ?? t.id));
        }));
      }
    } finally { setBusy(false); }
    clear();
    setMsg(failed.length
      ? { tone: 'error', text: `${done} updated; ${failed.length} could not be saved: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '…' : ''}` }
      : { tone: 'ok', text: `${done} part${done === 1 ? '' : 's'} set to ${bulkCategory}.` });
    await refresh();
  };

  // DELETE (0325): refused by the database while any spare request, stock,
  // transfer or consumption line names the part -- Deactivate is for those.
  const removePart = async (r: Row) => {
    const label = String(r.item_detail ?? r.code ?? '');
    if (!window.confirm(`Delete ${label} from the Part Master?\n\nThis cannot be undone. It is refused while any spare request, stock or consumption record names this part; Deactivate it instead to take it out of the pickers.`)) return;
    const res = await deleteMasterRecord('parts', 'id', Number(r.id));
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not delete it.' }); return; }
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    setMsg({ tone: 'ok', text: `${label} deleted from the Part Master.` });
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
        actions={mayAdd && <button className="btn btn-primary" onClick={() => { setTried(false); setForm({ code: '', description: '', category: '', product: '', cost: '', common: false, hsn: '' }); }}>＋ Add entry</button>}
      />
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      {live && <ProductAccessories mayEdit={mayAccessories} />}
      <DataTable<Row>
        columns={((mayEdit || mayDelete ? [...COLUMNS, {
          key: '_act', header: 'Actions', width: 230, sortable: false, wrap: false, align: 'center',
          render: (r: Row) => (
            <div className="row" onClick={(e) => e.stopPropagation()}>
              {mayEdit && (<>
                <button className="btn btn-sm" onClick={() => openEdit(r)}
                  title="Edit this part — and rename it, carrying every record that names it">✎ Edit</button>
                <button className="btn btn-sm" onClick={() => void toggleActive(r)}
                  title={r.active === false ? 'Put this part back in the pickers' : 'Take this part out of the pickers'}>
                  {r.active === false ? '↩ Reactivate' : '⊘ Deactivate'}
                </button>
              </>)}
              {mayDelete && (
                <button className="btn btn-ghost btn-sm" onClick={() => void removePart(r)}
                  title="Delete this part — refused while any spare request, stock or consumption record names it">🗑</button>
              )}
            </div>
          ),
        } as Column<Row>] : COLUMNS) as Column<Row>[]).map((c): Column<Row> => (c.key !== 'product' ? c : {
          ...c, width: 200,
          // BLANK = COMMON TO ALL PRODUCTS, said in words; a name the Product
          // Database does not have is flagged so it can be fixed.
          render: (r: Row) => {
            const mapped = complaintProducts({ products: String(r.product ?? '') });
            if (!mapped.length) return <span className="muted">Common (all products)</span>;
            const bad = new Set(productNames.length ? unrecognisedProducts({ products: mapped }, productNames) : []);
            return <span>{mapped.map((p, i) => (
              <span key={p} title={bad.has(p) ? 'Not a Product Database name — replace it' : undefined}
                style={bad.has(p) ? { color: 'var(--danger, #c00)' } : undefined}>
                {i ? ', ' : ''}{p}{bad.has(p) ? ' ⚠' : ''}
              </span>))}</span>;
          },
        }))}
        selectable={mayEdit}
        selected={picked}
        onSelectedChange={setPicked}
        bulkBar={mayEdit ? (ids, clear) => (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <b>{ids.length} selected</b>
            <div style={{ minWidth: 150 }}>
              <SelectPicker value={bulkMode} onChange={(v) => setBulkMode((v || 'replace') as BulkProductsMode)}
                options={[{ value: 'replace', label: 'Set products to' }, { value: 'add', label: 'Add products' },
                  { value: 'remove', label: 'Remove products' }]} />
            </div>
            <div style={{ minWidth: 220 }}>
              <MultiPick values={bulkProducts} options={productNames} noun="products"
                allLabel={bulkMode === 'replace' ? 'Common (all products)' : '— choose products —'} onChange={setBulkProducts} />
            </div>
            <button className="btn btn-primary btn-sm"
              disabled={busy || (bulkMode !== 'replace' && !bulkProducts.length)}
              onClick={() => void applyBulk(ids, clear)}>Apply to {ids.length}</button>
            <span className="muted">|</span>
            <div style={{ minWidth: 170 }}>
              <SelectPicker value={bulkCategory} onChange={setBulkCategory} placeholder="Spare / Consumable…"
                options={PART_CATEGORIES} />
            </div>
            <button className="btn btn-primary btn-sm" disabled={busy || !bulkCategory}
              onClick={() => void applyBulkCategory(ids, clear)}>Set for {ids.length}</button>
          </div>
        ) : undefined}
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
              <input className="input" placeholder="🔍 Search everything (code, description, product, category…)" value={filter.q}
                style={{ minWidth: 260 }} onChange={(e) => set('q', e.target.value)} />
              <input className="input" placeholder="Part code" value={filter.code} onChange={(e) => set('code', e.target.value)} />
              <input className="input" placeholder="Description" value={filter.description} onChange={(e) => set('description', e.target.value)} />
              {live && (
                <SelectPicker value={filter.product ?? ''} onChange={(v) => set('product', v)}
                  placeholder="Any product"
                  options={[{ value: ALL_PRODUCTS_FILTER, label: 'Common (all products)' },
                    { value: UNRECOGNISED_FILTER, label: '⚠ Unrecognised product' },
                    ...productNames]} />
              )}
              {live && (
                <SelectPicker value={filter.active ?? ''} onChange={(v) => set('active', v)}
                  placeholder="Active & inactive"
                  options={[{ value: 'yes', label: 'Active only' }, { value: 'no', label: 'Inactive only' }]} />
              )}
            </div>
            <div className="spacer" />
            {visible.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('part-master.csv', COLUMNS.map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[], partial(more))}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />

      {form && (
        <Modal open onClose={() => setForm(null)} title="Add to Part Master" width={560}>
          <form className="kb-form ml-form" onSubmit={(e) => { e.preventDefault(); void saveNew(); }}>
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
              <label className="field-label">Spare / Consumable <span style={{ color: 'var(--danger, #c00)' }}>*</span></label>
              <PickList
                value={form.category}
                options={PART_CATEGORIES}
                onPick={(v) => setForm((f) => f && ({ ...f, category: v }))}
                placeholder="Choose Spare, Consumable, Product or Labour…"
              />
            </div>
            <div className="field">
              <label className="field-label">Product <span style={{ color: 'var(--danger, #c00)' }}>*</span></label>
              <label className="row" style={{ gap: 6, fontSize: 13, margin: '2px 0 6px' }}>
                <input type="checkbox" checked={form.common}
                  onChange={(e) => setForm((f) => f && ({ ...f, common: e.target.checked, product: e.target.checked ? '' : f.product }))} />
                Common to all products
              </label>
              {!form.common && (
                <MultiPick
                  values={complaintProducts({ products: form.product })}
                  options={productNames}
                  onChange={(v) => setForm((f) => f && ({ ...f, product: v.join(', ') }))}
                  allLabel="— choose at least one —"
                  noun="products"
                />
              )}
              <span className="muted" style={{ fontSize: 12 }}>
                The machines this part fits, as the Product Database names them. Choose as many as apply,
                or tick Common to all products.
                {productNames.length ? '' : ' (Loading the product list…)'}
              </span>
            </div>
            <div className="field">
              <label className="field-label">Purchase cost</label>
              <input className="input" value={form.cost} inputMode="decimal"
                onChange={(e) => setForm((f) => f && ({ ...f, cost: e.target.value }))} />
              <span className="muted" style={{ fontSize: 12 }}>Optional. Blank means nobody has recorded one.</span>
            </div>
            <div className="field">
              <label className="field-label">HSN Code</label>
              <input className="input" value={form.hsn} inputMode="numeric"
                onChange={(e) => setForm((f) => f && ({ ...f, hsn: e.target.value }))} />
              <span className="muted" style={{ fontSize: 12 }}>Optional. Digits only.</span>
            </div>
            <div className="field">
              <label className="field-label">Will be listed as</label>
              <code style={{ fontSize: 13 }}>
                {form.code || form.description ? composeItemDetail(form.code, form.description) : '—'}
              </code>
            </div>
            {tried && !!formProblem() && <div className="field-err">{formProblem()}</div>}
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Add entry'}
              </button>
            </div>
          </form>
        </Modal>
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
              <label className="field-label">Spare / Consumable</label>
              {/* FOUR OPTIONS, SO NO SEARCH BOX — PickList shows just the list
                  under eight, and making somebody type to reach "Spare" is
                  worse than the box it replaced. A value the Item Master
                  brought that is not one of these is put at the top rather than
                  dropped: 0152 made this column source data on purpose, and a
                  form that silently replaced what the file said would undo
                  that. */}
              <PickList
                value={edit.category}
                options={edit.category && !PART_CATEGORIES.includes(edit.category)
                  ? [edit.category, ...PART_CATEGORIES] : PART_CATEGORIES}
                onPick={(v) => setEdit((f) => f && ({ ...f, category: v }))}
                placeholder="Choose Spare, Consumable, Product or Labour…"
              />
              <span className="muted" style={{ fontSize: 12 }}>
                Left blank it stays blank — Spare Insights reports those as Unclassified rather than guessing.
              </span>
            </div>
            <div className="field">
              <label className="field-label">Product</label>
              {/* MANY, BECAUSE A PART FITS MANY. A shared spare goes into an
                  ORION-G and a VEGA, and one box forced a choice between
                  naming one and typing a list nothing could read back.

                  THE SHORT FORMS, from Product Master — ORG, MT75, CPX. Several
                  lines share one (all nine CPX CARE codes are CPX), so the list
                  is de-duplicated; retired lines are offered too, because a
                  part still fits a machine that is no longer sold and most of
                  this catalogue is for exactly those.

                  EMPTY MEANS NONE RECORDED HERE, NOT ALL. MultiPick was built
                  for a FILTER, where empty means every row; on a form that
                  reading would be wrong, so the label says what empty means
                  rather than leaving the control's own default to imply it. */}
              <MultiPick
                values={complaintProducts({ products: edit.product })}
                // A value already on the part that the Product Database does
                // not have is still offered, so it can be seen and removed.
                options={[...new Set([...productNames, ...complaintProducts({ products: edit.product })])]}
                onChange={(v) => setEdit((f) => f && ({ ...f, product: v.join(', ') }))}
                allLabel="— common to all products —"
                noun="products"
              />
              <span className="muted" style={{ fontSize: 12 }}>
                The machines this part fits, as the Product Database names them. None chosen = common to all products.
                {unrecognisedProducts({ products: edit.product }, productNames).length && productNames.length
                  ? ` ⚠ Not a Product Database name: ${unrecognisedProducts({ products: edit.product }, productNames).join(', ')} — replace it.` : ''}
                {productNames.length ? '' : ' (Loading the product list…)'}
              </span>
            </div>
            <div className="field">
              <label className="field-label">Purchase cost</label>
              <input className="input" value={edit.cost} inputMode="decimal"
                onChange={(e) => setEdit((f) => f && ({ ...f, cost: e.target.value }))} />
              <span className="muted" style={{ fontSize: 12 }}>
                Blank means nobody has recorded one, which is not the same as zero.
              </span>
            </div>
            <div className="field">
              <label className="field-label">HSN Code</label>
              <input className="input" value={edit.hsn} inputMode="numeric"
                onChange={(e) => setEdit((f) => f && ({ ...f, hsn: e.target.value }))} />
              <span className="muted" style={{ fontSize: 12 }}>Digits only. Changing it is an ordinary edit, not a rename.</span>
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

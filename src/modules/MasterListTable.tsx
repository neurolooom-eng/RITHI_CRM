import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { Toolbar, Modal } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { csvExport, fmtDate } from '../lib/format';
import { listMaster, dataConfigured } from '../lib/sheets';
import { addMasterItem, deleteMasterItem, setMasterItemActive, listMasterItems, supabaseConfigured, type MasterItem, type MasterList } from '../lib/supabase';
import { clearMasterCache } from '../lib/masters';
import { masterAddAction, masterEditAction, masterDeleteAction } from '../lib/rbac';
import { usedBy } from './masterLists';
import { cappedAt } from '../lib/exportscope';
import { useMaster } from '../lib/masters';
import { MultiPick } from '../components/ui/MultiPick';
import { complaintProducts, productsLabel, applyBulkProducts, matchesProductFilter, ALL_PRODUCTS_FILTER, type BulkProductsMode } from '../lib/complaints';
import { SelectPicker } from '../components/ui/SelectPicker';
import { updateMasterItem, listProductMasterNames } from '../lib/supabase';
import { COMMON_PRODUCT } from '../lib/dccr';

// ===========================================================================
// One master value list as its own table: every entry, with Add and Remove.
// Used by each list's own screen and by the All Masters overview.
// Adding / deactivating needs this list's own edit permission and removing its
// own delete permission — both of which the global `masters.edit` still grants,
// so a role that maintains every master needs nothing ticked list by list.
// Every change clears that list's dropdown cache so the forms pick it up
// without a reload.
// ===========================================================================

export function MasterListTable({ list, onCountChange }: { list: MasterList; onCountChange?: (n: number) => void }) {
  const { user, can } = useAuth();
  const live = supabaseConfigured();
  // ADD, EDIT AND DELETE ARE SEPARATE KEYS (0325, 2026-10-03). The list's edit
  // key still grants adding, as it always did.
  const addable = live && can(masterAddAction(list.key));
  const editable = live && can(masterEditAction(list.key));
  const removable = live && can(masterDeleteAction(list.key));

  const [items, setItems] = useState<MasterItem[]>([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  // ADD ENTRY IS A FORM (the user, 2026-10-03: "people don't understand that
  // they should type and click on Add"). A button opens it; required fields
  // say so; a DCCR list's Product is picked from the Product Master.
  const [adding, setAdding] = useState(false);
  // EDITING reuses the Add form; this is the value it was opened on, or null
  // when adding. RENAMING IS ALLOWED (the user's choice, 2026-10-03), and the
  // form says what it does not do: records already saved keep the old wording.
  const [editItem, setEditItem] = useState<MasterItem | null>(null);
  const openEdit = (item: MasterItem) => {
    const d: Record<string, string> = { value: String(item.value ?? '') };
    list.columns.forEach((c) => { d[c.key] = String(item.extra?.[c.key] ?? ''); });
    setDraft(d);
    setDraftProducts(byProduct ? complaintProducts(item.extra) : []);
    setFormErr(''); setEditItem(item); setAdding(true);
  };
  const closeForm = () => { setAdding(false); setEditItem(null); };
  const [formErr, setFormErr] = useState('');
  // The DCCR lists tag each value with ONE product (extra.product), COMM being
  // common to every product (src/lib/dccr.ts). Their Product is required.
  const productColumn = list.columns.find((c) => c.key === 'product');
  const [pmNames, setPmNames] = useState<string[]>([]);
  useEffect(() => {
    if (!productColumn || !adding || pmNames.length) return; // the form is open, adding or editing
    listProductMasterNames().then(setPmNames).catch(() => setPmNames([]));
  }, [productColumn, adding, pmNames.length]);
  // STANDARD COMPLAINT ONLY: which products each complaint applies to (the
  // user, 2026-09-29: "a Product Field -- Multi Select ... Also a provision to
  // map the Complaint to all Products"). Stored as `extra.products`; EMPTY
  // MEANS ALL PRODUCTS, which is also what every complaint mapped to nothing
  // reads as -- see src/lib/complaints.ts.
  const byProduct = list.key === 'complaint';
  const productList = useMaster('product', [], byProduct);
  const [draftProducts, setDraftProducts] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: number; products: string[] } | null>(null);

  const load = async () => {
    if (!dataConfigured()) { setMsg({ tone: 'info', text: 'Connect the database in Settings to load this list.' }); return; }
    setBusy(true);
    try {
      const rows = live
        ? await listMasterItems(list.key)
        : (await listMaster(list.key)).map((v, i) => ({ id: -(i + 1), name: list.key, value: v, extra: {}, added_on: null, added_by: '' }));
      setItems(rows);
      onCountChange?.(rows.length);
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not read ${list.label}: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  useEffect(() => { setSearch(''); setDraft({}); setMsg(null); void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.key]);

  const reload = async () => {
    clearMasterCache(list.key);
    // The call forms read the complaints WITH their products under their own name.
    if (list.key === 'complaint') clearMasterCache('complaintProducts');
    await load();
  };

  const add = async () => {
    const value = (draft.value ?? '').trim();
    if (!value) { setFormErr(`${list.value_label} is required.`); return; }
    if (productColumn && !(draft.product ?? '').trim()) { setFormErr(`${productColumn.label} is required — pick a product, or ${COMMON_PRODUCT} for every product.`); return; }
    setFormErr('');
    const extra: Record<string, string> = {};
    list.columns.forEach((c) => { const v = (draft[c.key] ?? '').trim(); if (v) extra[c.key] = v; });
    const withProducts = byProduct && draftProducts.length
      ? { ...extra, products: draftProducts } as unknown as Record<string, string> : extra;
    setBusy(true);
    if (editItem) {
      const merged = { ...(editItem.extra ?? {}), ...withProducts } as Record<string, string>;
      list.columns.forEach((c) => { if (!(draft[c.key] ?? '').trim()) delete merged[c.key]; });
      if (byProduct && !draftProducts.length) delete (merged as Record<string, unknown>).products;
      const old = String(editItem.value ?? '');
      const u = await updateMasterItem(editItem.id, { value, extra: merged });
      if (!u.ok) { setFormErr(u.error ?? 'Could not save that entry.'); setBusy(false); return; }
      setDraft({}); setDraftProducts([]); closeForm();
      if (byProduct) clearMasterCache('complaintProducts');
      await reload();
      setMsg({ tone: 'ok', text: old !== value ? `Renamed “${old}” to “${value}”.` : `Saved “${value}”.` });
      return;
    }
    const r = await addMasterItem(list.key, value, withProducts, user?.fullName || user?.email || '');
    if (r.ok) { setDraft({}); setDraftProducts([]); setAdding(false); await reload(); setMsg({ tone: 'ok', text: `Added “${value}”.` }); }
    else { setFormErr(r.error ?? 'Could not add that entry.'); setBusy(false); }
  };

  // A value already used on calls, reports and spare requests is deactivated,
  // not deleted — those records must keep making sense. Delete stays for a
  // value added by mistake and never used.
  const setActive = async (item: MasterItem, active: boolean) => {
    const label = String(item.value ?? '');
    if (!active && !confirm(`Deactivate "${label}"? It stays on every record that already uses it, but stops being offered.`)) return;
    setBusy(true);
    const r = await setMasterItemActive(item.id, active);
    if (r.ok) { setMsg({ tone: 'ok', text: `"${label}" ${active ? 'reactivated' : 'deactivated'}.` }); await load(); }
    else { setMsg({ tone: 'error', text: r.error ?? 'Could not update that entry.' }); setBusy(false); }
  };

  const remove = async (item: MasterItem) => {
    if (!confirm(`Remove “${item.value}” from ${list.label}?`)) return;
    setBusy(true);
    const r = await deleteMasterItem(item.id);
    if (r.ok) { await reload(); setMsg({ tone: 'ok', text: `Removed “${item.value}”.` }); }
    else { setMsg({ tone: 'error', text: r.error ?? 'Could not remove that entry.' }); setBusy(false); }
  };

  // THE REST OF `extra` IS KEPT: only the product list is replaced, so a
  // complaint that carries anything else keeps it.
  const saveProducts = async (item: MasterItem, products: string[]) => {
    setBusy(true);
    const extra = { ...(item.extra ?? {}), products } as unknown as Record<string, string>;
    const r = await updateMasterItem(item.id, { extra });
    if (r.ok) {
      setEditing(null);
      clearMasterCache(list.key);
      clearMasterCache('complaintProducts');
      await load();
      setMsg({ tone: 'ok', text: `“${item.value}” now applies to ${products.length ? products.join(', ') : 'all products'}.` });
    } else { setMsg({ tone: 'error', text: r.error ?? 'Could not save the products.' }); setBusy(false); }
  };

  // Every product the register holds, plus any already mapped that the
  // register no longer lists -- a mapping must not vanish from its own editor.
  const productOptions = useMemo(() => {
    const set = new Set(productList.values);
    items.forEach((i) => complaintProducts(i.extra).forEach((p) => set.add(p)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [productList.values, items]);

  // STANDARD COMPLAINT FILTERS (the user, 2026-09-30: "I want Filters -
  // Product, Complaint Name"). The Product filter lists what is MAPPED to that
  // product; "All products (no mapping)" lists the rest -- it is for managing
  // the mapping, so an all-products complaint is not repeated under each one.
  const [productFilter, setProductFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const n = nameFilter.trim().toLowerCase();
    return items.filter((i) => (!q || i.value.toLowerCase().includes(q)
      || Object.values(i.extra ?? {}).some((v) => String(v).toLowerCase().includes(q))
      || (byProduct && productsLabel(i.extra).toLowerCase().includes(q)))
      && (!byProduct || !n || i.value.toLowerCase().includes(n))
      && (!byProduct || matchesProductFilter(i.extra, productFilter)));
  }, [items, search, byProduct, nameFilter, productFilter]);

  // BULK: tick complaints, choose products, Replace / Add / Remove
  // (applyBulkProducts in complaints.ts says exactly what each does).
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkProducts, setBulkProducts] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<BulkProductsMode>('replace');
  const applyBulk = async (ids: string[], clear: () => void) => {
    const targets = items.filter((i) => ids.includes(String(i.id)));
    if (!targets.length) return;
    const what = bulkMode === 'replace'
      ? (bulkProducts.length ? `apply ONLY to ${bulkProducts.join(', ')}` : 'apply to ALL products')
      : bulkMode === 'add' ? `also apply to ${bulkProducts.join(', ')}` : `no longer apply to ${bulkProducts.join(', ')}`;
    if (!confirm(`${targets.length} complaint${targets.length === 1 ? '' : 's'} will ${what}. Continue?`)) return;
    setBusy(true);
    let done = 0; const failed: string[] = [];
    // Ten at a time: quick on a good signal, and gentle on the database.
    for (let i = 0; i < targets.length; i += 10) {
      await Promise.all(targets.slice(i, i + 10).map(async (t) => {
        const next = applyBulkProducts(complaintProducts(t.extra), bulkProducts, bulkMode);
        const r = await updateMasterItem(t.id, { extra: { ...(t.extra ?? {}), products: next } as unknown as Record<string, string> });
        if (r.ok) done += 1; else failed.push(t.value);
      }));
    }
    clearMasterCache(list.key);
    clearMasterCache('complaintProducts');
    clear();
    await load();
    setMsg(failed.length
      ? { tone: 'error', text: `${done} updated; ${failed.length} could not be saved: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '…' : ''}` }
      : { tone: 'ok', text: `${done} complaint${done === 1 ? '' : 's'} updated.` });
  };

  const columns: Column<MasterItem & Record<string, unknown>>[] = useMemo(() => {
    const cols: Column<MasterItem & Record<string, unknown>>[] = [
      { key: 'value', header: list.value_label, width: 320 },
      ...list.columns.map((c) => ({
        key: `extra.${c.key}`, header: c.label, width: 180,
        render: (r: MasterItem) => String(r.extra?.[c.key] ?? ''),
      })),
      ...(byProduct ? [{
        key: '_products', header: 'Products', width: 320, sortable: false,
        render: (r: MasterItem) => (editing?.id === r.id ? (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ minWidth: 200, flex: 1 }}>
              <MultiPick values={editing.products} options={productOptions} noun="products" allLabel="All products"
                onChange={(v) => setEditing({ id: r.id, products: v })} />
            </div>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void saveProducts(r, editing.products)}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        ) : (
          <div className="row" style={{ gap: 6 }}>
            <span className={complaintProducts(r.extra).length ? '' : 'muted'}>{productsLabel(r.extra)}</span>
            {editable && (
              <button className="btn btn-ghost btn-sm" title="Choose the products this complaint applies to"
                onClick={(e) => { e.stopPropagation(); setEditing({ id: r.id, products: complaintProducts(r.extra) }); }}>✎</button>
            )}
          </div>
        )),
      }] : []),
      { key: 'added_on', header: 'Added On', width: 110, wrap: false, render: (r: MasterItem) => (r.added_on ? fmtDate(r.added_on) : '') },
      { key: 'added_by', header: 'Added By', width: 150 },
    ];
    if (editable || removable) {
      cols.push({
        key: 'active', header: 'Active', width: 80, wrap: false,
        render: (r: MasterItem & Record<string, unknown>) => (
          r.active === false ? <span className="badge badge-neutral">No</span> : <span className="badge badge-success">Yes</span>
        ),
      });
    }
    // THE ACTION BUTTONS ON THE ROW (the user, 2026-10-03): edit, deactivate,
    // delete -- each shown only to who holds its key.
    if (editable || removable) {
      cols.push({
        key: '_actions', header: 'Actions', width: 230, sortable: false, wrap: false,
        render: (r: MasterItem & Record<string, unknown>) => (
          <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
            {editable && <button className="btn btn-sm" title="Edit or rename this value" onClick={() => openEdit(r)}>✎ Edit</button>}
            {editable && (
              <button className="btn btn-sm" title={r.active === false ? 'Offer this value again' : 'Stop offering this value'}
                onClick={() => void setActive(r, r.active === false)}>
                {r.active === false ? '↩ Reactivate' : '⊘ Deactivate'}
              </button>
            )}
            {removable && (
              <button className="btn btn-ghost btn-sm" title="Remove from this list" disabled={busy}
                onClick={() => void remove(r)}>🗑</button>
            )}
          </div>
        ),
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, editable, removable, busy, byProduct, editing, productOptions]);

  const where = usedBy(list.key);

  return (
    <div>
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      {where && (
        <p className="muted" style={{ marginTop: 0 }}>
          Used by: {where}. Removing an entry only takes it out of the dropdown — calls already reported with it keep their value.
        </p>
      )}

      {addable ? (
        <div className="row" style={{ gap: 8, margin: '4px 0 10px' }}>
          <button className="btn btn-primary" onClick={() => { setDraft({}); setDraftProducts([]); setFormErr(''); setEditItem(null); setAdding(true); }}>
            + Add entry
          </button>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          {live ? (editable || removable ? '' : `You need the “Add values” permission for ${list.label} to add to this list.`) : 'Connect the database to add or remove entries.'}
        </p>
      )}

      <Modal open={adding} onClose={closeForm} title={editItem ? `Edit “${editItem.value}”` : `Add to ${list.label}`} width={520}>
        <form className="ml-form" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <label className="ml-field">
            <span className="field-label">{list.value_label} *</span>
            <input className="input" autoFocus value={draft.value ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))} />
            {editItem && (draft.value ?? '').trim() !== String(editItem.value ?? '') && (
              <span className="muted ml-hint">
                Renaming changes what is offered from now on. Calls, reports and spares already saved keep
                “{String(editItem.value ?? '')}” — they are not rewritten, and a count or filter on the new
                wording will not include them.
              </span>
            )}
          </label>
          {list.columns.map((c) => (
            <label key={c.key} className="ml-field">
              <span className="field-label">{c.label}{c.key === 'product' ? ' *' : ''}</span>
              {c.key === 'product' ? (
                <SelectPicker value={draft.product ?? ''} placeholder="— pick a product —"
                  onChange={(v) => setDraft((d) => ({ ...d, product: v }))}
                  options={[{ value: COMMON_PRODUCT, label: `${COMMON_PRODUCT} — common to every product` },
                    ...pmNames.map((n) => ({ value: n, label: n }))]} />
              ) : (
                <input className="input" value={draft[c.key] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.value }))} />
              )}
              {c.key === 'product' ? <span className="muted ml-hint">From the Product Master.</span> : null}
            </label>
          ))}
          {byProduct && (
            <label className="ml-field">
              <span className="field-label">Products</span>
              <MultiPick values={draftProducts} options={productOptions} noun="products" allLabel="All products"
                onChange={setDraftProducts} />
              <span className="muted ml-hint">Leave empty for all products.</span>
            </label>
          )}
          {formErr ? <div className="field-err">{formErr}</div> : null}
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
            <button type="button" className="btn btn-ghost" onClick={closeForm}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editItem ? 'Save' : 'Add entry'}</button>
          </div>
        </form>
      </Modal>

      <DataTable<MasterItem & Record<string, unknown>>
        columns={columns}
        rows={visible as (MasterItem & Record<string, unknown>)[]}
        getRowId={(r) => String(r.id)}
        storageKey={`master-${list.key}`}
        rowsBeforeScroll={14}
        dense
        emptyText={busy ? 'Loading…' : (items.length ? 'Nothing matches these filters.' : 'This list is empty.')}
        selectable={byProduct && editable}
        selected={picked}
        onSelectedChange={setPicked}
        bulkBar={byProduct && editable ? (ids, clear) => (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <b>{ids.length} selected</b>
            <div style={{ minWidth: 140 }}>
              <SelectPicker value={bulkMode} onChange={(v) => setBulkMode((v || 'replace') as BulkProductsMode)}
                options={[{ value: 'replace', label: 'Set products to' }, { value: 'add', label: 'Add products' },
                  { value: 'remove', label: 'Remove products' }]} />
            </div>
            <div style={{ minWidth: 220 }}>
              <MultiPick values={bulkProducts} options={productOptions} noun="products"
                allLabel={bulkMode === 'replace' ? 'All products' : '— choose products —'} onChange={setBulkProducts} />
            </div>
            <button className="btn btn-primary btn-sm"
              disabled={busy || (bulkMode !== 'replace' && !bulkProducts.length)}
              onClick={() => void applyBulk(ids, clear)}>Apply to {ids.length}</button>
          </div>
        ) : undefined}
        toolbar={
          <Toolbar>
            <input className="input" placeholder="Search this list" value={search} onChange={(e) => setSearch(e.target.value)} />
            {byProduct && (
              <>
                <input className="input" placeholder="Complaint name" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
                <div style={{ minWidth: 200 }}>
                  <SelectPicker value={productFilter} onChange={setProductFilter} placeholder="Any product"
                    options={['', ALL_PRODUCTS_FILTER, ...productOptions]} />
                </div>
              </>
            )}
            <button className="btn btn-sm" onClick={() => void reload()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            <span className="muted">{visible.length.toLocaleString()} {visible.length === 1 ? 'entry' : 'entries'}</span>
            {items.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport(`${list.key}-master.csv`,
                [
                  // THE KEY, so the file can come back through Bulk Uploads and
                  // update exactly these complaints (complaints.ts).
                  ...(byProduct ? [{ key: 'key', header: 'Key' }] : []),
                  { key: 'value', header: list.value_label }, ...list.columns.map((c) => ({ key: c.key, header: c.label })),
                  ...(byProduct ? [{ key: 'products', header: 'Products' }] : []),
                  { key: 'added_on', header: 'Added On' }, { key: 'added_by', header: 'Added By' }],
                visible.map((i) => ({ value: i.value, ...i.extra, ...(byProduct ? { key: i.id, products: productsLabel(i.extra) } : {}), added_on: i.added_on ?? '', added_by: i.added_by })), cappedAt(items.length, 5000))}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />
    </div>
  );
}

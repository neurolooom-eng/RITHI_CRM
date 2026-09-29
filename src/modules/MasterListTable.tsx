import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { Toolbar } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { csvExport, fmtDate } from '../lib/format';
import { listMaster, dataConfigured } from '../lib/sheets';
import { addMasterItem, deleteMasterItem, setMasterItemActive, listMasterItems, supabaseConfigured, type MasterItem, type MasterList } from '../lib/supabase';
import { clearMasterCache } from '../lib/masters';
import { masterEditAction, masterDeleteAction } from '../lib/rbac';
import { usedBy } from './masterLists';
import { cappedAt } from '../lib/exportscope';
import { useMaster } from '../lib/masters';
import { MultiPick } from '../components/ui/MultiPick';
import { complaintProducts, productsLabel } from '../lib/complaints';
import { updateMasterItem } from '../lib/supabase';

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
  const editable = live && can(masterEditAction(list.key));
  const removable = live && can(masterDeleteAction(list.key));

  const [items, setItems] = useState<MasterItem[]>([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
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

  const reload = async () => { clearMasterCache(list.key); await load(); };

  const add = async () => {
    const value = (draft.value ?? '').trim();
    if (!value) return;
    const extra: Record<string, string> = {};
    list.columns.forEach((c) => { const v = (draft[c.key] ?? '').trim(); if (v) extra[c.key] = v; });
    const withProducts = byProduct && draftProducts.length
      ? { ...extra, products: draftProducts } as unknown as Record<string, string> : extra;
    setBusy(true);
    const r = await addMasterItem(list.key, value, withProducts, user?.fullName || user?.email || '');
    if (r.ok) { setDraft({}); setDraftProducts([]); await reload(); setMsg({ tone: 'ok', text: `Added “${value}”.` }); }
    else { setMsg({ tone: 'error', text: r.error ?? 'Could not add that entry.' }); setBusy(false); }
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.value.toLowerCase().includes(q)
      || Object.values(i.extra ?? {}).some((v) => String(v).toLowerCase().includes(q))
      || (byProduct && productsLabel(i.extra).toLowerCase().includes(q)));
  }, [items, search, byProduct]);

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
    if (editable) {
      cols.push({
        key: '_active', header: '', width: 120, sortable: false, wrap: false,
        render: (r: MasterItem & Record<string, unknown>) => (
          <button className="btn btn-sm" title={r.active === false ? 'Offer this value again' : 'Stop offering this value'}
            onClick={(e) => { e.stopPropagation(); void setActive(r, r.active === false); }}>
            {r.active === false ? '↩ Reactivate' : '⊘ Deactivate'}
          </button>
        ),
      });
    }
    if (removable) {
      cols.push({
        key: '_remove', header: '', width: 70, sortable: false, wrap: false,
        render: (r: MasterItem) => (
          <button className="btn btn-ghost btn-sm" title="Remove from this list" disabled={busy}
            onClick={(e) => { e.stopPropagation(); void remove(r); }}>🗑</button>
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

      {editable ? (
        <div className="call-add-row">
          <input
            className="input"
            placeholder={`New ${list.value_label.toLowerCase()}`}
            value={draft.value ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
          />
          {list.columns.map((c) => (
            <input key={c.key} className="input" placeholder={c.label}
              value={draft[c.key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} />
          ))}
          {byProduct && (
            <div style={{ minWidth: 220 }} title="Leave empty for all products">
              <MultiPick values={draftProducts} options={productOptions} noun="products" allLabel="All products"
                onChange={setDraftProducts} />
            </div>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => void add()} disabled={busy || !(draft.value ?? '').trim()}>+ Add</button>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          {live ? `You need the “Add / edit values” permission for ${list.label} to change this list.` : 'Connect the database to add or remove entries.'}
        </p>
      )}

      <DataTable<MasterItem & Record<string, unknown>>
        columns={columns}
        rows={visible as (MasterItem & Record<string, unknown>)[]}
        getRowId={(r) => String(r.id)}
        storageKey={`master-${list.key}`}
        rowsBeforeScroll={14}
        dense
        emptyText={busy ? 'Loading…' : 'This list is empty.'}
        toolbar={
          <Toolbar>
            <input className="input" placeholder="Search this list" value={search} onChange={(e) => setSearch(e.target.value)} />
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

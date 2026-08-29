import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { Toolbar } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { csvExport, fmtDate } from '../lib/format';
import { listMaster, dataConfigured } from '../lib/sheets';
import { addMasterItem, deleteMasterItem, listMasterItems, supabaseConfigured, type MasterItem, type MasterList } from '../lib/supabase';
import { clearMasterCache } from '../lib/masters';
import { usedBy } from './masterLists';

// ===========================================================================
// One master value list as its own table: every entry, with Add and Remove.
// Used by each list's own screen and by the All Masters overview.
// Editing needs `masters.edit`; every change clears that list's dropdown cache
// so the forms pick it up without a reload.
// ===========================================================================

export function MasterListTable({ list, onCountChange }: { list: MasterList; onCountChange?: (n: number) => void }) {
  const { user, can } = useAuth();
  const live = supabaseConfigured();
  const editable = live && can('masters.edit');

  const [items, setItems] = useState<MasterItem[]>([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

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
    setBusy(true);
    const r = await addMasterItem(list.key, value, extra, user?.fullName || user?.email || '');
    if (r.ok) { setDraft({}); await reload(); setMsg({ tone: 'ok', text: `Added “${value}”.` }); }
    else { setMsg({ tone: 'error', text: r.error ?? 'Could not add that entry.' }); setBusy(false); }
  };

  const remove = async (item: MasterItem) => {
    if (!confirm(`Remove “${item.value}” from ${list.label}?`)) return;
    setBusy(true);
    const r = await deleteMasterItem(item.id);
    if (r.ok) { await reload(); setMsg({ tone: 'ok', text: `Removed “${item.value}”.` }); }
    else { setMsg({ tone: 'error', text: r.error ?? 'Could not remove that entry.' }); setBusy(false); }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.value.toLowerCase().includes(q)
      || Object.values(i.extra ?? {}).some((v) => String(v).toLowerCase().includes(q)));
  }, [items, search]);

  const columns: Column<MasterItem & Record<string, unknown>>[] = useMemo(() => {
    const cols: Column<MasterItem & Record<string, unknown>>[] = [
      { key: 'value', header: list.value_label, width: 320 },
      ...list.columns.map((c) => ({
        key: `extra.${c.key}`, header: c.label, width: 180,
        render: (r: MasterItem) => String(r.extra?.[c.key] ?? ''),
      })),
      { key: 'added_on', header: 'Added On', width: 110, wrap: false, render: (r: MasterItem) => (r.added_on ? fmtDate(r.added_on) : '') },
      { key: 'added_by', header: 'Added By', width: 150 },
    ];
    if (editable) {
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
  }, [list, editable, busy]);

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
          <button className="btn btn-primary btn-sm" onClick={() => void add()} disabled={busy || !(draft.value ?? '').trim()}>+ Add</button>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          {live ? 'You need the “Edit masters” permission to change this list.' : 'Connect the database to add or remove entries.'}
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
                [{ key: 'value', header: list.value_label }, ...list.columns.map((c) => ({ key: c.key, header: c.label })), { key: 'added_on', header: 'Added On' }, { key: 'added_by', header: 'Added By' }],
                visible.map((i) => ({ value: i.value, ...i.extra, added_on: i.added_on ?? '', added_by: i.added_by })))}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />
    </div>
  );
}

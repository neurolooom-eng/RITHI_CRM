import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox, Drawer } from '../components/ui/ui';
import { csvExport, fmtDate, statusBadge, timeAgo } from '../lib/format';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { useAuth } from '../lib/auth';
import { supabaseConfigured } from '../lib/supabase';
import {
  configFor, listHeaders, listItems, listMachines, countMachines, saveHeader, saveItem,
  deleteItem, deleteHeader, isPinned, type CoverKind, type CoverField, type Row,
} from '../lib/cover';
import './fieldcalls.css';

// ===========================================================================
// WARRANTY / CONTRACT REGISTER — one screen, two shapes.
//
//   Entries    the deals: a Sale Entry (SA) or Contract Entry (MC), each with
//              the machines sold or covered under it. Open one to edit the
//              header and its machines together.
//   Machines   the same data per serial, cover resolved, with the state tiles
//              (Active / About to expire / Inactive) to filter by.
//
// The header is the parent record: a field on a machine is left EMPTY to
// follow the header, so changing a date or a period on the header changes
// every machine under it. Typing into a machine's field pins that machine to
// its own value; ↺ hands it back to the header.
// ===========================================================================

type Tab = 'entries' | 'machines';
/** One feed per tab: what is loaded, how far it has paged, and its sync stamp. */
interface Feed { rows: Row[]; at: string; offset: number; more: boolean }
const PAGE: Record<Tab, number> = { entries: 200, machines: 500 };

const STATES = ['ACTIVE', 'ABOUT TO EXPIRE', 'INACTIVE'] as const;
const TONES: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  'ACTIVE': 'success', 'ABOUT TO EXPIRE': 'warning', 'INACTIVE': 'danger', 'NOT COVERED': 'neutral',
};

const str = (v: unknown) => (v == null ? '' : String(v));
const dateVal = (v: unknown) => str(v).slice(0, 10);

// A form value on its way back to the database: '' means "no value" (and on an
// inheriting field, "follow the header"), never an empty string.
function toDb(field: CoverField, raw: string): unknown {
  const v = raw.trim();
  if (v === '') return null;
  if (field.type === 'number') { const n = Number(v.replace(/,/g, '')); return Number.isFinite(n) ? n : null; }
  if (field.type === 'bool') return v === 'Yes';
  return v;
}
const fromDb = (field: CoverField, v: unknown): string =>
  field.type === 'bool' ? (v === true ? 'Yes' : v === false ? 'No' : '')
    : field.type === 'date' ? dateVal(v) : str(v);

function FieldInput({
  field, value, onChange, placeholder, disabled,
}: { field: CoverField; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  const common = { className: 'input', value, disabled, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  if (field.type === 'bool') return <select {...common} className="select"><option value="">—</option><option>Yes</option><option>No</option></select>;
  if (field.type === 'select') return (
    <select {...common} className="select">{(field.options ?? []).map((o) => <option key={o} value={o}>{o || '—'}</option>)}</select>
  );
  if (field.type === 'textarea') return <textarea {...common} rows={2} />;
  return <input {...common} type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'} placeholder={placeholder} />;
}

// One machine under a header, all its fields, with inheritance made visible.
function ItemCard({
  cfg, item, header, canEdit, onSaved, onDeleted,
}: {
  cfg: ReturnType<typeof configFor>; item: Row; header: Row; canEdit: boolean;
  onSaved: (r: Row) => void; onDeleted: (id: number) => void;
}) {
  const [open, setOpen] = useState(!item.id);
  const [draft, setDraft] = useState<Row>(item);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { setDraft(item); }, [item]);

  const set = (f: CoverField, v: string) => setDraft((d) => ({ ...d, [f.name]: toDb(f, v) }));
  const unpin = (f: CoverField) => setDraft((d) => ({ ...d, [f.name]: null }));
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(item), [draft, item],
  );

  const save = async () => {
    setBusy(true); setMsg('');
    try { onSaved(await saveItem(cfg.kind, str(header[cfg.key]), draft)); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!item.id || !window.confirm('Remove this machine from the entry?')) return;
    setBusy(true);
    try { await deleteItem(cfg.kind, Number(item.id)); onDeleted(Number(item.id)); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  const sections = [...new Set(cfg.itemFields.map((f) => f.section))];
  const pinned = cfg.itemFields.filter((f) => f.inherits && isPinned(draft, f.name)).length;

  return (
    <div className="req-act-sec">
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <button className="linklike" onClick={() => setOpen((o) => !o)}>
          {open ? '▾' : '▸'} {str(draft.product_name) || 'New machine'}
          {str(draft.serial_number) && ` · ${str(draft.serial_number)}`}
        </button>
        <span className="row" style={{ gap: 8, alignItems: 'center' }}>
          {pinned > 0 && <span className="badge badge-warning" title="Fields pinned on this machine instead of following the entry">{pinned} pinned</span>}
          {canEdit && open && dirty && <button className="btn btn-sm btn-primary" onClick={() => void save()} disabled={busy}>{busy ? '…' : 'Save machine'}</button>}
          {canEdit && open && !!item.id && <button className="btn btn-sm" onClick={() => void remove()} disabled={busy}>Remove</button>}
        </span>
      </div>
      {msg && <div className="sheet-banner sheet-banner-error" style={{ marginTop: 8 }}><span>{msg}</span></div>}
      {open && sections.map((sec) => (
        <div key={sec} style={{ marginTop: 10 }}>
          <div className="field-label" style={{ opacity: 0.75 }}>{sec}</div>
          <div className="rep-grid">
            {cfg.itemFields.filter((f) => f.section === sec).map((f) => {
              const inherits = !!f.inherits;
              const pinnedHere = inherits && isPinned(draft, f.name);
              const headerText = inherits ? fromDb(f, header[f.name]) : '';
              return (
                <label key={f.name} className="rep-field">
                  <span className="field-label">
                    {f.label}
                    {inherits && (pinnedHere
                      ? <> · <button className="linklike" onClick={() => unpin(f)} disabled={!canEdit} title="Follow the entry again">↺ inherit</button></>
                      : <span className="muted"> · from entry</span>)}
                  </span>
                  <FieldInput
                    field={f}
                    value={fromDb(f, draft[f.name])}
                    placeholder={headerText || undefined}
                    disabled={!canEdit}
                    onChange={(v) => set(f, v)}
                  />
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CoverRegister({ kind }: { kind: CoverKind }) {
  const cfg = configFor(kind);
  const { can } = useAuth();
  const navigate = useNavigate();
  const canEdit = can('cover.edit');
  const live = supabaseConfigured();

  const [tab, setTab] = useState<Tab>('entries');
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    live ? null : { tone: 'info', text: 'Connect the database in Settings to open this register.' },
  );

  // Each tab is its own feed: rows, how far it has paged, whether another page
  // may exist, and when its browse set was last synced. Same behaviour as the
  // Field Call Register — instant from cache, ↻ Refresh, 30-minute auto-sync,
  // Load more, and CSV export of what is on screen.
  const cacheKey = (t: Tab) => `cover-${kind}-${t}`;
  const fromCache = (t: Tab): Feed => {
    const c = loadCache<Row>(cacheKey(t));
    return { rows: c?.rows ?? [], at: c?.at ?? '', offset: c?.rows.length ?? 0, more: (c?.rows.length ?? 0) >= PAGE[t] };
  };
  const [feeds, setFeeds] = useState<Record<Tab, Feed>>(() => ({ entries: fromCache('entries'), machines: fromCache('machines') }));
  const feed = feeds[tab];
  const rows = feeds.entries.rows;
  const machines = feeds.machines.rows;
  const setFeed = (t: Tab, patch: Partial<Feed>) => setFeeds((cur) => ({ ...cur, [t]: { ...cur[t], ...patch } }));
  const filtered = !!q || (tab === 'machines' && !!state);

  const [open, setOpen] = useState<Row | null>(null);   // header being viewed
  const [items, setItems] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Row>({});
  const [saving, setSaving] = useState(false);

  // One page of a tab, from the server.
  const fetchPage = (t: Tab, offset: number): Promise<Row[]> =>
    t === 'entries'
      ? listHeaders(kind, { q }, offset, PAGE.entries)
      : listMachines(kind, { q, state }, offset, PAGE.machines);

  // Force-sync a tab: first page, and (unfiltered) cache it with a sync stamp.
  const refresh = async (t: Tab = tab) => {
    if (!live) return;
    setBusy(true);
    try {
      const r = await fetchPage(t, 0);
      const at = filtered ? feeds[t].at : saveCache(cacheKey(t), r);
      setFeed(t, { rows: r, offset: r.length, more: r.length >= PAGE[t], at });
      if (t === 'machines') {
        const cs = await Promise.all(STATES.map((x) => countMachines(kind, x, { q })));
        setCounts(Object.fromEntries(STATES.map((x, i) => [x, cs[i]])));
      }
      setMsg(r.length
        ? { tone: 'ok', text: `${r.length}${r.length >= PAGE[t] ? '+' : ''} ${t === 'entries' ? 'entries' : 'machines'}${filtered ? ' matched' : ''}.` }
        : { tone: 'info', text: filtered ? 'Nothing matched.' : 'Nothing here yet — import the exports in Settings → Bulk Data Import, or add an entry.' });
    } catch (e) { setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  };

  const loadMore = async () => {
    setBusy(true);
    try {
      const r = await fetchPage(tab, feed.offset);
      const merged = [...feed.rows, ...r];
      const at = filtered ? feed.at : saveCache(cacheKey(tab), merged);
      setFeed(tab, { rows: merged, offset: feed.offset + r.length, more: r.length >= PAGE[tab], at });
    } catch (e) { setMsg({ tone: 'error', text: `Load more failed: ${e instanceof Error ? e.message : String(e)}` }); }
    finally { setBusy(false); }
  };

  // Filters query the server live (debounced). With none, the cached browse set
  // shows immediately and is only re-fetched when it is stale.
  useEffect(() => {
    if (!live) return;
    if (filtered) {
      const t = window.setTimeout(() => { void refresh(tab); }, 300);
      return () => window.clearTimeout(t);
    }
    const cached = fromCache(tab);
    if (!cached.rows.length || isStale(cached.at)) { void refresh(tab); return; }
    setFeed(tab, cached);
    setMsg({ tone: 'info', text: `Showing cached data — synced ${timeAgo(cached.at)}. ↻ Refresh to update.` });
    if (tab === 'machines') {
      void Promise.all(STATES.map((x) => countMachines(kind, x, {})))
        .then((cs) => setCounts(Object.fromEntries(STATES.map((x, i) => [x, cs[i]]))))
        .catch(() => { /* tiles are a nicety; the table already loaded */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q, state]);

  // 30-minute background force-sync of whichever tab is open, unfiltered.
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => { if (!filtered) void refresh(tab); }, SYNC_TTL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filtered]);

  const openEntry = async (h: Row) => {
    setOpen(h); setDraft(h); setItems([]);
    try { setItems(await listItems(kind, str(h[cfg.key]))); }
    catch (e) { setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); }
  };

  const saveEntry = async () => {
    setSaving(true);
    try {
      const saved = await saveHeader(kind, draft);
      setOpen(saved); setDraft(saved);
      setFeed('entries', { rows: feeds.entries.rows.map((r) => (r.id === saved.id ? { ...r, ...saved } : r)) });
      // The header moved, so every machine that inherits from it moved too.
      setItems(await listItems(kind, str(saved[cfg.key])));
      setMsg({ tone: 'ok', text: `${cfg.keyLabel} ${str(saved[cfg.key])} saved — machines following it were updated.` });
    } catch (e) { setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); }
    finally { setSaving(false); }
  };

  const removeEntry = async () => {
    if (!open?.id || !window.confirm(`Delete ${str(open[cfg.key])} and its ${items.length} machine(s)?`)) return;
    try {
      await deleteHeader(kind, Number(open.id));
      setFeed('entries', { rows: feeds.entries.rows.filter((r) => r.id !== open.id) });
      setOpen(null);
    } catch (e) { setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); }
  };

  const headerColumns: Column<Row>[] = [
    { key: cfg.key, header: cfg.keyLabel, width: 120, wrap: false },
    { key: 'party_name', header: 'Party', width: 260 },
    ...(kind === 'contract'
      ? [{ key: 'contract_type', header: 'Type', width: 80, wrap: false } as Column<Row>]
      : [{ key: 'invoice_no', header: 'Invoice', width: 120, wrap: false } as Column<Row>]),
    { key: kind === 'sale' ? 'warranty_start' : 'contract_start', header: 'Start', width: 110, wrap: false, render: (r) => fmtDate(r[kind === 'sale' ? 'warranty_start' : 'contract_start']) },
    { key: cfg.endColumn, header: 'End', width: 110, wrap: false, render: (r) => fmtDate(r[cfg.endColumn]) },
    { key: 'item_count', header: 'Machines', width: 90, align: 'right', wrap: false },
    { key: 'status_now', header: 'State', width: 130, wrap: false, render: (r) => statusBadge(stateOf(str(r[cfg.endColumn])), TONES) },
  ];

  const machineColumns: Column<Row>[] = [
    { key: 'serial_number', header: 'Serial', width: 110, wrap: false },
    { key: 'product_name', header: 'Product', width: 150 },
    { key: 'party_name', header: 'Party', width: 240 },
    { key: cfg.key, header: cfg.keyLabel, width: 110, wrap: false },
    ...(kind === 'contract' ? [{ key: 'contract_type', header: 'Type', width: 80, wrap: false } as Column<Row>] : []),
    { key: kind === 'sale' ? 'warranty_start' : 'contract_start', header: 'Start', width: 110, wrap: false, render: (r) => fmtDate(r[kind === 'sale' ? 'warranty_start' : 'contract_start']) },
    { key: cfg.endColumn, header: 'End', width: 110, wrap: false, render: (r) => fmtDate(r[cfg.endColumn]) },
    { key: cfg.stateColumn, header: 'State', width: 130, wrap: false, render: (r) => statusBadge(str(r[cfg.stateColumn]), TONES) },
    { key: 'overridden', header: 'Pinned fields', width: 160, render: (r) => {
      const o = r.overridden as string[] | null;
      return o?.length ? <span className="badge badge-warning" title={o.join(', ')}>{o.length} pinned</span> : <span className="muted">follows entry</span>;
    } },
    { key: '_call', header: 'Register call', width: 130, sortable: false, wrap: false, render: (r) => (
      <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); navigate('/field-calls', { state: { prefill: prefillFrom(r, kind) } }); }}>+ Field call</button>
    ) },
  ];

  const sections = [...new Set(cfg.headerFields.map((f) => f.section))];

  return (
    <div>
      {/* The register's size is its entries — the deals — not the machines
          under them, so the nav count means the same thing on both tabs. */}
      <PageHeader title={cfg.title} subtitle={cfg.subtitle} icon={cfg.icon}
        count={tab === 'machines' ? machines.length : rows.length} />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <button className={`btn btn-sm ${tab === 'entries' ? 'btn-primary' : ''}`} onClick={() => setTab('entries')}>Entries</button>
        <button className={`btn btn-sm ${tab === 'machines' ? 'btn-primary' : ''}`} onClick={() => setTab('machines')}>By machine</button>
      </div>

      {tab === 'machines' && (
        <div className="pc-summary">
          {STATES.map((s) => (
            <button key={s} className={`pc-tile ${state === s ? 'pc-tile-on' : ''}`} onClick={() => setState(state === s ? '' : s)}>
              <span className="pc-tile-n">{counts[s] ?? 0}</span>
              {statusBadge(s, TONES)}
            </button>
          ))}
        </div>
      )}

      {tab === 'entries' ? (
        <DataTable<Row>
          columns={headerColumns}
          rows={rows}
          getRowId={(r) => str(r.id)}
          storageKey={`cover-${kind}-entries`}
          rowsBeforeScroll={16}
          dense
          onRowClick={(r) => void openEntry(r)}
          onLoadMore={loadMore}
          moreAvailable={feeds.entries.more}
          loadingMore={busy}
          emptyText={busy ? 'Loading…' : 'No entries match.'}
          toolbar={
            <Toolbar>
              <SearchBox value={q} onChange={setQ} placeholder={`${cfg.keyLabel} or party…`} />
              <button className="btn btn-sm" onClick={() => void refresh('entries')} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
              <div className="spacer" />
              {feeds.entries.at && (
                <span className="conn-dot conn-off" title={`Last synced ${new Date(feeds.entries.at).toLocaleString()}`}>⟳ {timeAgo(feeds.entries.at)}</span>
              )}
              {canEdit && (
                <button className="btn btn-sm btn-primary" onClick={() => { setOpen({}); setDraft({}); setItems([]); }}>+ New entry</button>
              )}
              {rows.length > 0 && (
                <button className="btn btn-sm" onClick={() => csvExport(`${kind}-entries.csv`, headerColumns.filter((c) => !c.key.startsWith('_')).map((c) => ({ key: c.key, header: c.header })), rows)}>⭳ Export CSV</button>
              )}
            </Toolbar>
          }
        />
      ) : (
        <DataTable<Row>
          columns={machineColumns}
          rows={machines}
          getRowId={(r) => str(r.uid ?? r.id)}
          storageKey={`cover-${kind}-machines`}
          rowsBeforeScroll={16}
          dense
          onLoadMore={loadMore}
          moreAvailable={feeds.machines.more}
          loadingMore={busy}
          emptyText={busy ? 'Loading…' : 'No machines match.'}
          toolbar={
            <Toolbar>
              <SearchBox value={q} onChange={setQ} placeholder="Serial, product, party…" />
              <button className="btn btn-sm" onClick={() => void refresh('machines')} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
              <div className="spacer" />
              {feeds.machines.at && (
                <span className="conn-dot conn-off" title={`Last synced ${new Date(feeds.machines.at).toLocaleString()}`}>⟳ {timeAgo(feeds.machines.at)}</span>
              )}
              {machines.length > 0 && (
                <button className="btn btn-sm" onClick={() => csvExport(`${kind}-machines.csv`, machineColumns.filter((c) => !c.key.startsWith('_')).map((c) => ({ key: c.key, header: c.header })), machines)}>⭳ Export CSV</button>
              )}
            </Toolbar>
          }
        />
      )}

      {open && (
        <Drawer open onClose={() => setOpen(null)} width={860}
          title={open.id ? `${cfg.keyLabel} ${str(open[cfg.key])}` : `New ${cfg.keyLabel}`}>
          <div className="muted" style={{ marginBottom: 10 }}>
            This is the parent record. A machine below leaves a field empty to follow it — change a
            date or a period here and every machine that follows moves with it.
          </div>

          {sections.map((sec) => (
            <div key={sec} style={{ marginBottom: 10 }}>
              <div className="field-label" style={{ opacity: 0.75 }}>{sec}</div>
              <div className="rep-grid">
                {cfg.headerFields.filter((f) => f.section === sec).map((f) => (
                  <label key={f.name} className="rep-field">
                    <span className="field-label">{f.label}</span>
                    <FieldInput field={f} value={fromDb(f, draft[f.name])} disabled={!canEdit}
                      onChange={(v) => setDraft((d) => ({ ...d, [f.name]: toDb(f, v) }))} />
                  </label>
                ))}
              </div>
            </div>
          ))}

          {canEdit && (
            <div className="row" style={{ gap: 8, marginBottom: 12 }}>
              <button className="btn btn-primary" onClick={() => void saveEntry()} disabled={saving}>
                {saving ? 'Saving…' : 'Save entry'}
              </button>
              {!!open.id && <button className="btn" onClick={() => void removeEntry()}>Delete entry</button>}
            </div>
          )}

          <h3 style={{ margin: '14px 0 8px' }}>Machines ({items.length})</h3>
          {!open.id && <div className="muted" style={{ marginBottom: 8 }}>Save the entry first, then add machines to it.</div>}
          {items.map((it) => (
            <ItemCard key={str(it.id)} cfg={cfg} item={it} header={draft} canEdit={canEdit}
              onSaved={(r) => setItems((cur) => cur.map((x) => (x.id === r.id ? r : x)))}
              onDeleted={(id) => setItems((cur) => cur.filter((x) => x.id !== id))} />
          ))}
          {canEdit && !!open.id && (
            <button className="btn btn-sm" style={{ marginTop: 8 }}
              onClick={() => setItems((cur) => [...cur, { [cfg.key]: str(draft[cfg.key]) }])}>
              + Add machine
            </button>
          )}
        </Drawer>
      )}
    </div>
  );
}

// The state a header is in, from its own end date (the machines under it can
// each differ — the by-machine tab is where that shows).
function stateOf(end: string): string {
  if (!end) return 'NOT COVERED';
  const d = new Date(`${end.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return 'NOT COVERED';
  const days = Math.round((d.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  return days < 0 ? 'INACTIVE' : days <= 60 ? 'ABOUT TO EXPIRE' : 'ACTIVE';
}

// A machine row, in the shape the call form's prefill reads.
function prefillFrom(r: Row, kind: CoverKind): Record<string, unknown> {
  const g = (k: string) => str(r[k]);
  const wty = kind === 'sale';
  return {
    partyName: g('party_name'), city: g('city'), state: g('state'),
    productName: g('product_name'), serial: g('serial_number'),
    warrantyNumber: wty ? g('sa_number') : '', warrantyStart: wty ? g('warranty_start') : '', warrantyEnd: wty ? g('warranty_end') : '',
    contractNumber: wty ? '' : g('mc_number'), contractStart: wty ? '' : g('contract_start'), contractEnd: wty ? '' : g('contract_end'),
    contractType: g('contract_type'), allocatedTo: g('engineer'),
  };
}

export const WarrantyRegister = () => <CoverRegister kind="sale" />;
export const ContractRegister = () => <CoverRegister kind="contract" />;

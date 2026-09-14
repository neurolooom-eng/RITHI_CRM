import { useEffect, useMemo, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { coverStatus, deriveHeader, deriveItem } from '../lib/coverspec';
import { PageHeader, Toolbar, SearchBox, Drawer } from '../components/ui/ui';
import { csvExport, fmtDate, statusBadge, timeAgo } from '../lib/format';
import { localIsoDate } from '../lib/dates';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { useAuth } from '../lib/auth';
import { supabaseConfigured } from '../lib/supabase';
import {
  configFor, listHeaders, listItems, listMachines, countMachines, saveHeader, saveItem,
  deleteItem, deleteHeader, isPinned, proposeRenewal, renewContract, addPeriod, nextCoverNumber,
  type CoverKind, type CoverField, type Row, type RenewalDraft,
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
interface Feed { rows: Row[]; at: string; offset: number; more: boolean; step: number }
// THE FIRST PAGE IS AS BIG AS THE SERVER WILL GIVE, and Load more doubles.
//
// The user, 2026-09-14: "In Contract , Warranty -- Make the Default Load Row to
// Max And Load More should load 2x". It opened at 200 entries / 500 machines,
// so a register of several thousand took a dozen clicks to walk.
//
// PostgREST caps a single response (`db-max-rows`, 1000 on this project), so a
// request for 4,000 rows does not return 4,000 — it returns 1,000 and the page
// would conclude there was no more. The cap is therefore the REQUEST size and
// the doubling is the number of requests: one page, then two, then four. That
// is "2x each time" without ever asking for a response the server will quietly
// truncate, which is the shape of bug that makes a register look complete when
// it is not.
const PAGE: Record<Tab, number> = { entries: 1000, machines: 1000 };
/** How many server pages one "Load more" fetches, doubling each time. */
const FIRST_STEP = 1;

const STATES = ['ACTIVE', 'ABOUT TO EXPIRE', 'INACTIVE'] as const;
const TONES: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  'ACTIVE': 'success', 'ABOUT TO EXPIRE': 'warning', 'INACTIVE': 'danger', 'NOT COVERED': 'neutral',
};

const str = (v: unknown) => (v == null ? '' : String(v));

// A DATE INPUT TAKES A VALUE, NOT A RENDERING, and getting that backwards is
// what emptied every date box on this screen.
//
// Reported 2026-09-14: "Why the Dates are not loaded in the Form even though
// the information is very much available?" — the Contract Register listed
// START 06-Sep-2025 and END 05-Sep-2031 while the drawer showed three blank
// `dd --- yyyy` boxes. This line was `fmtLongDate(v)`, which produces
// "06-Sep-2025"; `<input type="date">` accepts ONLY `yyyy-MM-dd` and renders
// anything else as EMPTY, with no error anywhere. So the value was always
// there, always sent on save, and never once visible.
//
// The distinction was already understood in this file — the old comment said
// "that is a VALUE, not a rendering" about the arithmetic below — and then
// applied the wrong way round here. A formatter is for text somebody READS; an
// input needs the machine form.
//
// `localIsoDate` rather than a slice, because `entry_at` is a TIMESTAMPTZ:
// slicing `2026-09-11T18:40:00+00:00` yields the UTC day, which in IST is
// already the 12th. It converts to the reader's own day and passes a plain
// `date` column straight through.
const dateVal = (v: unknown) => localIsoDate(v) ?? '';

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
  if (field.type === 'bool') {
    return <SelectPicker value={value} onChange={onChange} disabled={disabled} placeholder="—"
                         options={['Yes', 'No']} />;
  }
  if (field.type === 'select') {
    return <SelectPicker value={value} onChange={onChange} disabled={disabled} placeholder="—"
                         options={(field.options ?? []).filter(Boolean)} />;
  }
  if (field.type === 'textarea') return <textarea {...common} rows={2} />;
  return <input {...common} type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'} placeholder={placeholder} />;
}

// One machine under a header, all its fields, with inheritance made visible.
function ItemCard({
  cfg, kind, item, header, canEdit, onSaved, onDeleted,
}: {
  cfg: ReturnType<typeof configFor>; kind: CoverKind; item: Row; header: Row; canEdit: boolean;
  onSaved: (r: Row) => void; onDeleted: (id: number) => void;
}) {
  const [open, setOpen] = useState(!item.id);
  const [draft, setDraft] = useState<Row>(item);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { setDraft(item); }, [item]);

  // A machine line carries the same arithmetic as the entry above it — rate to
  // tax to total, the machine string to its three parts, the period to the end
  // date — from the one transcription in coverspec.ts. Derived from the field
  // just edited, never over the whole row: these fields INHERIT from the
  // header when blank, and re-deriving everything would pin them all the first
  // time anybody touched one.
  const set = (f: CoverField, v: string) => setDraft((d) => {
    const next = { ...d, [f.name]: toDb(f, v) };
    return { ...next, ...deriveItem(kind, f.name, next) };
  });
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

// ===========================================================================
// RENEW — the next MC, raised from this one.
//
// The last open piece of this module (docs/BACKLOG.md). It exists because the
// alternative is retyping a contract's machine list into a new entry, which is
// where serials get missed.
//
// WHAT IT ASKS FOR is only what genuinely changes: the new MC Number, the
// period, and which machines carry over. Everything else follows the contract
// it came from. The MC Number is TYPED, never generated — the numbering belongs
// to the business, and a number invented here would collide with theirs.
//
// The money is NOT carried over, and the panel says so rather than leaving
// somebody to notice: a renewal is re-priced, and a rate carried forward
// silently is a price nobody agreed that looks exactly like one they did.
// ===========================================================================
function RenewPanel({ header, items, onDone }: { header: Row; items: Row[]; onDone: (mc: string) => void }) {
  const [d, setD] = useState<RenewalDraft>(() => proposeRenewal(header, items));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const set = <K extends keyof RenewalDraft>(k: K, v: RenewalDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  // The end date follows the start and the period, so the three cannot disagree
  // — but it stays editable for a contract that does not run a whole number of
  // months.
  const reperiod = (startIso: string, years: number | null, months: number | null) =>
    setD((x) => ({ ...x, contract_start: startIso, contract_years: years, contract_months: months,
      contract_end: addPeriod(startIso, years ?? 0, months ?? 0) || x.contract_end }));

  const toggle = (sn: string) => setD((x) => ({
    ...x,
    serials: x.serials.includes(sn) ? x.serials.filter((s) => s !== sn) : [...x.serials, sn],
  }));

  const go = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await renewContract(header, items, d);
      onDone(r.mc_number);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const serials = items.map((i) => str(i.serial_number)).filter(Boolean);

  return (
    <div className="rep-sec" style={{ marginTop: 14 }}>
      <div className="rep-sec-title">
        Renew this contract <span className="muted">· raises the next MC from {str(header.mc_number)}</span>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        The new contract starts the day after this one ends, so cover has no gap and no overlap.
        The machines, type, party, period and billing schedule carry over.
        <b> Rates do not</b> — a renewal is re-priced, and a figure carried over silently is a price
        nobody agreed.
      </p>

      <div className="rep-grid">
        <label className="rep-field">
          <span className="field-label">New MC Number *</span>
          <input className="input" value={d.mc_number} placeholder="as issued"
                 onChange={(e) => set('mc_number', e.target.value)} />
        </label>
        <label className="rep-field">
          <span className="field-label">Contract Type</span>
          <SelectPicker value={d.contract_type} onChange={(v) => set('contract_type', v)}
            placeholder="— none —" options={['CMC', 'AMC']} />
        </label>
        <label className="rep-field">
          <span className="field-label">Start</span>
          <input className="input" type="date" value={d.contract_start}
                 onChange={(e) => reperiod(e.target.value, d.contract_years, d.contract_months)} />
        </label>
        <label className="rep-field">
          <span className="field-label">End</span>
          <input className="input" type="date" value={d.contract_end}
                 onChange={(e) => set('contract_end', e.target.value)} />
        </label>
        <label className="rep-field">
          <span className="field-label">Period (Years)</span>
          <input className="input" type="number" min={0} value={d.contract_years ?? ''}
                 onChange={(e) => reperiod(d.contract_start, e.target.value === '' ? null : Number(e.target.value), d.contract_months)} />
        </label>
        <label className="rep-field">
          <span className="field-label">Period (Months)</span>
          <input className="input" type="number" min={0} value={d.contract_months ?? ''}
                 onChange={(e) => reperiod(d.contract_start, d.contract_years, e.target.value === '' ? null : Number(e.target.value))} />
        </label>
      </div>

      <div className="field-label" style={{ marginTop: 10 }}>
        Machines carrying over ({d.serials.length} of {serials.length})
      </div>
      <div className="muted" style={{ fontSize: 12.5 }}>Untick a machine that is not being renewed.</div>
      <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 6 }}>
        {serials.map((sn) => {
          const it = items.find((x) => str(x.serial_number) === sn);
          return (
            <label key={sn} className="row" style={{ gap: 8, alignItems: 'center', padding: '3px 0' }}>
              <input type="checkbox" checked={d.serials.includes(sn)} onChange={() => toggle(sn)} />
              <span><b>{sn}</b> <span className="muted">{str(it?.product_name)}</span></span>
            </label>
          );
        })}
        {!serials.length && <div className="muted" style={{ fontSize: 12.5 }}>This contract has no machines on it.</div>}
      </div>

      {msg && <div className="sheet-banner sheet-banner-error" style={{ marginTop: 8 }}><span>{msg}</span></div>}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => void go()}>
          {busy ? 'Creating…' : 'Create the renewal'}
        </button>
      </div>
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
  /** Open a blank entry with the next number in the series already in it.
   *
   *  OFFERED, NOT RESERVED, and it stays editable: two people starting an entry
   *  at the same moment are offered the same number and the second is refused
   *  on save by the unique key. That is the honest failure — handing out a
   *  number and then not using it leaves a gap in a series somebody audits.
   *  If the lookup fails the form still opens, with the number blank to type:
   *  not being able to suggest one is no reason to refuse the entry. */
  const newEntry = async () => {
    setOpen({}); setItems([]);
    setDraft({});
    try {
      const n = await nextCoverNumber(kind);
      setDraft((d) => (str(d[cfg.key]) ? d : { ...d, [cfg.key]: n }));
    } catch { /* offered, not required — the field is typeable */ }
  };

  const cacheKey = (t: Tab) => `cover-${kind}-${t}`;
  const fromCache = (t: Tab): Feed => {
    const c = loadCache<Row>(cacheKey(t));
    return { rows: c?.rows ?? [], at: c?.at ?? '', offset: c?.rows.length ?? 0,
             more: (c?.rows.length ?? 0) >= PAGE[t], step: FIRST_STEP };
  };
  const [feeds, setFeeds] = useState<Record<Tab, Feed>>(() => ({ entries: fromCache('entries'), machines: fromCache('machines') }));
  const feed = feeds[tab];
  const rows = feeds.entries.rows;
  const machines = feeds.machines.rows;
  const setFeed = (t: Tab, patch: Partial<Feed>) => setFeeds((cur) => ({ ...cur, [t]: { ...cur[t], ...patch } }));
  const filtered = !!q || (tab === 'machines' && !!state);

  const [open, setOpen] = useState<Row | null>(null);   // header being viewed
  // Closed whenever a different entry is opened: a half-filled renewal must not
  // follow the reader onto another contract.
  const [renewing, setRenewing] = useState(false);
  const [items, setItems] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Row>({});
  const [saving, setSaving] = useState(false);

  // One page of a tab, from the server.
  const fetchPage = (t: Tab, offset: number): Promise<Row[]> =>
    t === 'entries'
      ? listHeaders(kind, { q }, offset, PAGE.entries)
      : listMachines(kind, { q, state }, offset, PAGE.machines);

  /** `pages` server pages from `offset`, in order, stopping at the first short
   *  one — a page that comes back smaller than asked for IS the end, and going
   *  on would only spend requests to be told so again. */
  const fetchPages = async (t: Tab, offset: number, pages: number): Promise<Row[]> => {
    const out: Row[] = [];
    for (let i = 0; i < pages; i += 1) {
      const r = await fetchPage(t, offset + out.length);
      out.push(...r);
      if (r.length < PAGE[t]) break;
    }
    return out;
  };

  // Force-sync a tab: first page, and (unfiltered) cache it with a sync stamp.
  const refresh = async (t: Tab = tab) => {
    if (!live) return;
    setBusy(true);
    try {
      const r = await fetchPage(t, 0);
      const at = filtered ? feeds[t].at : saveCache(cacheKey(t), r);
      setFeed(t, { rows: r, offset: r.length, more: r.length >= PAGE[t], at, step: FIRST_STEP });
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
      const want = feed.step * PAGE[tab];
      const r = await fetchPages(tab, feed.offset, feed.step);
      const merged = [...feed.rows, ...r];
      const at = filtered ? feed.at : saveCache(cacheKey(tab), merged);
      // THE DOUBLING ONLY CONTINUES WHILE IT PAID OFF. A short answer is the
      // end of the register, so `more` goes false and the step stops growing —
      // otherwise coming back to a filtered view would open with a request for
      // sixteen pages of nothing.
      setFeed(tab, { rows: merged, offset: feed.offset + r.length,
                     more: r.length >= want, at, step: feed.step * 2 });
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
    setRenewing(false);
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
      <PageHeader
        onRefresh={() => void refresh(tab)}
        refreshing={busy}
        syncedAt={tab === 'machines' ? feeds.machines.at : feeds.entries.at}
        title={cfg.title} subtitle={cfg.subtitle} icon={cfg.icon}
        count={tab === 'machines' ? machines.length : rows.length}
        countMore={feed.more} />

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
              <div className="spacer" />
              {canEdit && (
                <button className="btn btn-sm btn-primary" onClick={() => void newEntry()}>+ New entry</button>
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
              <div className="spacer" />
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
                      onChange={(v) => setDraft((d) => {
                        // The register's own arithmetic, from the AppSheet
                        // definition (src/lib/coverspec.ts). Derived from the
                        // field just edited, so an end date somebody typed for
                        // a part-month contract is not undone by an unrelated
                        // keystroke.
                        const next = { ...d, [f.name]: toDb(f, v) };
                        return { ...next, ...deriveHeader(kind, f.name, next) };
                      })} />
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
            <ItemCard key={str(it.id)} cfg={cfg} kind={kind} item={it} header={draft} canEdit={canEdit}
              onSaved={(r) => setItems((cur) => cur.map((x) => (x.id === r.id ? r : x)))}
              onDeleted={(id) => setItems((cur) => cur.filter((x) => x.id !== id))} />
          ))}
          {canEdit && !!open.id && (
            <button className="btn btn-sm" style={{ marginTop: 8 }}
              onClick={() => setItems((cur) => [...cur, { [cfg.key]: str(draft[cfg.key]) }])}>
              + Add machine
            </button>
          )}

          {/* CONTRACTS ONLY, and only once the entry exists. A sale is not
              renewed — the warranty runs from the sale and that is the end of
              it; a contract is the thing with a next one. Offered on ANY
              contract rather than only an expiring one, because renewals are
              raised in advance and a register that hides the button until the
              cover has lapsed is asking people to work around it. */}
          {canEdit && kind === 'contract' && !!open.id && (
            renewing ? (
              <RenewPanel
                header={draft}
                items={items}
                onDone={(mc) => {
                  setRenewing(false);
                  setOpen(null);
                  setMsg({ tone: 'ok', text: `Contract ${mc} created, carrying its machines over. Open it to set the rates — they are deliberately blank.` });
                  void refresh();
                }}
              />
            ) : (
              <button className="btn" style={{ marginTop: 14 }} onClick={() => setRenewing(true)}>
                ↻ Renew this contract
              </button>
            )
          )}
        </Drawer>
      )}
    </div>
  );
}

// The state a header is in, from its own end date (the machines under it can
// each differ — the by-machine tab is where that shows).
//
// ONE RULE, NOT A SECOND COPY OF IT. This used to carry its own arithmetic and
// its own threshold, which meant the ENTRIES tab and the MACHINES tab — the
// latter reading `cover_state()` through the view — could label the same
// contract differently the moment either number moved. It calls coverStatus
// now; the SQL is the same rule where a view can reach it (0187).
const stateOf = (end: string): string => coverStatus(end);

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

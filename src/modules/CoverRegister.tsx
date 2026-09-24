import { useEffect, useMemo, useState, useRef } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { LongDateInput, LongDateText } from '../components/ui/LongDate';
import { SplitPane } from '../components/ui/SplitPane';
import { sbSearchParties, sbPartyInfo } from '../lib/supabase';
import { partyFillForSale, SALE_PARTY_FIELDS, pairProductCodeAndName,
         summarisePinned, machinesNeedingInstallCall, INSTALL_COMPLAINT,
         // THE VALUE TEST, not the row test. `isPinned` from ./cover takes
         // (row, field) and asks whether a CHILD overrides its parent; this
         // asks whether one value is there at all, and they are different
         // questions with confusingly similar names.
         isPinnedValue, isCallNumber,
         partyFillChanges } from '../lib/coverspec';
import { useNavigate, useLocation} from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { coverStatus, deriveHeader, deriveItem } from '../lib/coverspec';
import { listProductLines, sellableNames, sellableCodes, retiredNames, type ProductLine } from '../lib/productLines';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, fmtDate, statusBadge, timeAgo } from '../lib/format';
import { localIsoDate } from '../lib/dates';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { useAuth } from '../lib/auth';
import { supabaseConfigured } from '../lib/supabase';
import {
  configFor, listHeaders, listItems, listMachines, countMachines, saveHeader, saveItem, forceInherit,
  raiseInstallCalls,
  deleteItem, deleteHeader, isPinned, proposeRenewal, renewContract, addPeriod, nextCoverNumber,
  type CoverKind, type CoverField, type Row, type RenewalDraft,
} from '../lib/cover';
// THE PRICING RULE COMES FROM ONE PLACE. GST and "total = rate + tax" are the
// contract form's own rules; the renewal panel shows what it is about to write
// and must not compute it a second way, or the preview and the saved row can
// disagree about money.
import { itemTaxAmount, totalAfterTax, upliftRate } from '../lib/coverspec';
import './fieldcalls.css';
import { partial } from '../lib/exportscope';

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
/** Server pages fetched when the tab OPENS, and by the first "Load more".
 *
 *  The user, 2026-09-14: "paging - Keep it at 1000 then" … "But perform that
 *  action once more automatically" — so the REQUEST stays at the 1,000 the
 *  server will actually return, and the register simply makes two of them
 *  before showing anything. Opening on 2,000 rows and asking for 2,000 at a
 *  time is the same bargain as one 2,000-row request, minus the truncation. */
const OPEN_PAGES = 2;

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
  field, value, onChange, placeholder, disabled, runtimeOptions,
}: { field: CoverField; value: string; onChange: (v: string) => void; placeholder?: string;
     disabled?: boolean;
     /** Options the SCREEN loaded — today, the Product Master's active lines. */
     runtimeOptions?: string[] }) {
  const common = { className: 'input', value, disabled, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  // WORKED OUT, OR STAMPED — never typed. A box somebody can type into is a box
  // whose value they expect to keep, and the next keystroke on the field that
  // DRIVES this one would overwrite it without saying so. Shown rather than
  // hidden, because the value is the answer they came for.
  if (field.derived) {
    // A DERIVED DATE READS THE SAME WAY AS A TYPED ONE. A register showing
    // dd-MMM-yyyy in one box and the browser's locale in the next is a register
    // people read twice.
    return field.type === 'date'
      ? <LongDateText value={value} />
      : <input className="input" value={value} readOnly disabled
               title={`Worked out from ${field.derived} — not typed here`} />;
  }
  // THE PARTY MASTER, SEARCHED ON THE SERVER. 5,873 customers is a few hundred
  // KB before the field would work at all; the call registers' own customer box
  // has searched since v0.9.193 and this is the same mechanism.
  if (field.optionsFrom === 'party') {
    return <SelectPicker value={value} onChange={onChange} disabled={disabled}
                         placeholder="— find the customer —"
                         options={value ? [value] : []}
                         onSearch={(term) => sbSearchParties(term, 50)}
                         // A SALE MAY NAME A CUSTOMER THE MASTER HAS NOT GOT.
                         // The machine is being sold to them either way, and a
                         // register that refuses the sale until somebody adds
                         // the customer elsewhere is a register that gets kept
                         // in a spreadsheet instead. Nothing is filled in for a
                         // name the master does not hold, which is honest: it
                         // has nothing to fill it from.
                         allowFreeText
                         emptyHint="Customers come from the Party Master. Typing a name the master has not got is allowed — nothing will be filled in for it." />;
  }
  if (field.type === 'bool') {
    return <SelectPicker value={value} onChange={onChange} disabled={disabled} placeholder="—"
                         options={['Yes', 'No']} />;
  }
  // A RETIRED PRODUCT LINE IS NOT OFFERED ON A NEW SALE (the user's rule,
  // 2026-09-14). The list is the Product Master's ACTIVE lines.
  //
  // `allowFreeText` stays ON, and that is the careful part rather than a
  // loophole: the catalogue is maintained by hand and may be incomplete or
  // unreadable to this reader, and a Sale Entry that could not be typed at all
  // because a list failed to load would be a worse fault than the one this
  // prevents. The list is the guidance; the empty hint says what it is.
  if (field.optionsFrom) {
    return <SelectPicker value={value} onChange={onChange} disabled={disabled}
                         placeholder="— choose the product —"
                         options={(runtimeOptions ?? []).filter(Boolean)}
                         allowFreeText
                         emptyHint="Only lines marked Active on the Product Master are offered — a retired line cannot take a new sale." />;
  }
  if (field.type === 'select') {
    return <SelectPicker value={value} onChange={onChange} disabled={disabled} placeholder="—"
                         options={(field.options ?? []).filter(Boolean)} />;
  }
  if (field.type === 'textarea') return <textarea {...common} rows={2} />;
  // EVERY DATE ON THIS REGISTER READS dd-MMM-yyyy (the user, 2026-09-22). A
  // native date input renders in the BROWSER'S locale and cannot be told
  // otherwise; LongDateInput shows the long form at rest and becomes the native
  // picker while it is being edited, so nothing is ever parsed out of text.
  if (field.type === 'date') {
    return <LongDateInput value={value} onChange={onChange} disabled={disabled} />;
  }
  return <input {...common} type={field.type === 'number' ? 'number' : 'text'} placeholder={placeholder} />;
}

// One machine under a header, all its fields, with inheritance made visible.
function ItemCard({
  cfg, kind, item, header, canEdit, onSaved, onDeleted, lines,
}: {
  cfg: ReturnType<typeof configFor>; kind: CoverKind; item: Row; header: Row; canEdit: boolean;
  onSaved: (r: Row) => void; onDeleted: (id: number) => void;
  /** The Product Master's lines, loaded once by the screen. */
  lines: ProductLine[];
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
    // THE CODE AND THE NAME ARE ONE CHOICE. Filled only where the catalogue
    // gives one answer — nine codes share the name "CPX CARE", and a guessed
    // code on a machine record is worse than a blank one.
    const pair = (f.name === 'product_name' || f.name === 'product_code')
      ? pairProductCodeAndName(f.name, v, lines)
      : {};
    return { ...next, ...pair, ...deriveItem(kind, f.name, next) };
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
                    runtimeOptions={f.optionsFrom === 'sellable-name' ? sellableNames(lines)
                      : f.optionsFrom === 'sellable-code' ? sellableCodes(lines) : undefined}
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
// THE MONEY IS RE-PRICED HERE (the user, 2026-09-16: "Renew this contract - I
// will need provision to revise the price"). Until now the renewal left every
// rate blank and somebody opened each machine afterwards to type one in, which
// on a twenty-machine contract is twenty trips through a form.
//
// What did NOT change is the rule underneath: nothing is carried forward
// silently. The old rate is shown BESIDE the box, never IN it, because a figure
// sitting in a field reads as one somebody agreed. The boxes start empty, and a
// renewal with all of them empty saves exactly as it did before.
//
// The uplift is the bulk case and it is an ACT, not a default: type a
// percentage, press the button, and every ticked machine's box is filled from
// its own old rate — visibly, and each one still editable. A machine with no
// old rate stays empty rather than becoming 0.
// ===========================================================================
function RenewPanel({ header, items, onDone }: { header: Row; items: Row[]; onDone: (mc: string) => void }) {
  const [d, setD] = useState<RenewalDraft>(() => proposeRenewal(header, items));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const set = <K extends keyof RenewalDraft>(k: K, v: RenewalDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  // The end date follows the start and the period, so the three cannot disagree
  // — but it stays editable for a contract that does not run a whole number of
  // months.
  //
  // MONTHS IS THE ONLY DRIVER, and years is kept in step with it rather than
  // added to it. Years and months on a contract are the SAME period written
  // twice (years = months / 12), so the previous version — which passed both to
  // `addPeriod` — renewed a one-year contract for two years. Editing either box
  // now sets the other, and the end date is computed from months alone, exactly
  // as the contract form does it.
  const reperiodMonths = (startIso: string, months: number | null) =>
    setD((x) => ({
      ...x,
      contract_start: startIso,
      contract_months: months,
      contract_years: months === null ? null : months / 12,
      contract_end: addPeriod(startIso, 0, months ?? 0) || x.contract_end,
    }));

  const toggle = (sn: string) => setD((x) => ({
    ...x,
    serials: x.serials.includes(sn) ? x.serials.filter((s) => s !== sn) : [...x.serials, sn],
  }));

  // ---- the price revision ------------------------------------------------
  const [pct, setPct] = useState('');

  // What each machine was on last time, by serial. CONTEXT for whoever is
  // pricing — it is never written anywhere.
  const oldRate = new Map<string, unknown>(
    items.map((i) => [str(i.serial_number), i.rate]),
  );

  const setRate = (sn: string, v: string) =>
    setD((x) => ({ ...x, rates: { ...x.rates, [sn]: v } }));

  // FILL THE TICKED MACHINES FROM THEIR OWN OLD RATES. Only the ticked ones:
  // an unticked machine is not being renewed, and pricing it would be writing
  // a number for a line that will not exist.
  const applyUplift = () => {
    const p = Number(pct);
    if (pct.trim() === '' || !Number.isFinite(p)) return;
    setD((x) => {
      const next = { ...x.rates };
      for (const sn of x.serials) {
        const up = upliftRate(oldRate.get(sn), p);
        // A machine with no old rate is left alone rather than set to 0 — "we
        // do not know what this was on" is not "it was free".
        if (up !== null) next[sn] = String(up);
      }
      return { ...x, rates: next };
    });
  };

  const clearRates = () => setD((x) => ({ ...x, rates: {} }));

  // What the panel is about to write, through the SAME functions that will
  // write it — so the preview cannot disagree with the saved row.
  const priced = d.serials
    .map((sn) => {
      const raw = (d.rates[sn] ?? '').trim();
      if (raw === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : null;
    })
    .filter((n): n is number => n !== null);
  const newTotal = priced.reduce((t, r) => t + (totalAfterTax(r) ?? 0), 0);
  const badRate = d.serials.some((sn) => {
    const raw = (d.rates[sn] ?? '').trim();
    if (raw === '') return false;
    const n = Number(raw);
    return !Number.isFinite(n) || n < 0;
  });
  const money = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

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
        nobody agreed. Set the new rates below, or leave them blank and price the contract later.
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
                 onChange={(e) => reperiodMonths(e.target.value, d.contract_months)} />
        </label>
        <label className="rep-field">
          <span className="field-label">End</span>
          <input className="input" type="date" value={d.contract_end}
                 onChange={(e) => set('contract_end', e.target.value)} />
        </label>
        {/* Two views of ONE period. Typing in either sets the other, so they
            cannot disagree and cannot be added together. */}
        <label className="rep-field">
          <span className="field-label">Period (Years)</span>
          <input className="input" type="number" min={0} step="0.5" value={d.contract_years ?? ''}
                 onChange={(e) => reperiodMonths(d.contract_start,
                   e.target.value === '' ? null : Number(e.target.value) * 12)} />
        </label>
        <label className="rep-field">
          <span className="field-label">Period (Months)</span>
          <input className="input" type="number" min={0} value={d.contract_months ?? ''}
                 onChange={(e) => reperiodMonths(d.contract_start,
                   e.target.value === '' ? null : Number(e.target.value))} />
        </label>
      </div>

      <div className="field-label" style={{ marginTop: 10 }}>
        Machines and rates ({d.serials.length} of {serials.length} carrying over)
      </div>
      <div className="muted" style={{ fontSize: 12.5 }}>
        Untick a machine that is not being renewed. <b>Was</b> is what it was charged on{' '}
        {str(header.mc_number)} — shown so you can price against it; it is not carried over.
      </div>

      {/* THE BULK CASE. Most renewals move every rate by the same percentage,
          and typing that twenty times is how a digit gets missed. Nothing
          happens until the button is pressed, and every box stays editable
          afterwards. */}
      <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12.5 }}>Revise all ticked by</span>
        <input className="input" type="number" step="0.01" value={pct} placeholder="%"
               style={{ width: 90 }} onChange={(e) => setPct(e.target.value)} />
        <button className="btn btn-sm" type="button" onClick={applyUplift}
                disabled={pct.trim() === '' || !Number.isFinite(Number(pct))}>
          Apply to rates
        </button>
        <button className="btn btn-sm" type="button" onClick={clearRates}>Clear rates</button>
        <span className="muted" style={{ fontSize: 12 }}>
          0% holds last year's price. A machine with no old rate is left blank.
        </span>
      </div>

      <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
        {serials.map((sn) => {
          const it = items.find((x) => str(x.serial_number) === sn);
          const on = d.serials.includes(sn);
          const was = oldRate.get(sn);
          const wasN = was == null || was === '' ? null : Number(was);
          const raw = (d.rates[sn] ?? '').trim();
          const n = raw === '' ? null : Number(raw);
          const ok = n !== null && Number.isFinite(n) && n >= 0;
          return (
            <div key={sn} className="renew-row" style={{ opacity: on ? 1 : 0.5 }}>
              <input type="checkbox" checked={on} onChange={() => toggle(sn)} />
              <span className="renew-name">
                <b>{sn}</b> <span className="muted">{str(it?.product_name)}</span>
              </span>
              <span className="renew-money">
                <span className="muted renew-was">
                  was {wasN === null || !Number.isFinite(wasN) ? '—' : money(wasN)}
                </span>
                <input className="input renew-rate" type="number" min={0} step="0.01"
                       placeholder="new rate" disabled={!on}
                       value={d.rates[sn] ?? ''} onChange={(e) => setRate(sn, e.target.value)} />
                {/* WHAT WILL ACTUALLY BE WRITTEN, next to the number being
                    typed: the rate goes in, but the contract bills the total. */}
                <span className="muted renew-tot">
                  {!on ? '' : ok ? `+GST = ${money(totalAfterTax(n) ?? 0)}`
                       : raw === '' ? 'price later' : 'not a rate'}
                </span>
              </span>
            </div>
          );
        })}
        {!serials.length && <div className="muted" style={{ fontSize: 12.5 }}>This contract has no machines on it.</div>}
      </div>

      {/* The contract's own total, so a rate typed with a digit too many shows
          up here rather than on an invoice. */}
      {priced.length > 0 && (
        <div className="row" style={{ gap: 8, marginTop: 8, fontSize: 13 }}>
          <span className="muted">
            {priced.length} of {d.serials.length} priced · rate {money(priced.reduce((t, r) => t + r, 0))}
            {' '}· tax {money(priced.reduce((t, r) => t + (itemTaxAmount(r) ?? 0), 0))}
          </span>
          <span><b>Total after tax {money(newTotal)}</b></span>
        </div>
      )}

      {msg && <div className="sheet-banner sheet-banner-error" style={{ marginTop: 8 }}><span>{msg}</span></div>}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary" disabled={busy || badRate} onClick={() => void go()}>
          {busy ? 'Creating…' : 'Create the renewal'}
        </button>
        {badRate && (
          <span className="muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>
            One of the rates is not a number — clear it or correct it.
          </span>
        )}
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

  // ARRIVING FROM SOMEWHERE THAT NAMED A DOCUMENT. Product Database 2.0 shows
  // an SA number and an MC number on every machine it assembles, and those are
  // the register's own keys — so they are LINKS there and this is the other
  // half. Without it the link lands on an unfiltered register and the reader
  // does the search again by hand, which is the same as no link.
  const location = useLocation();
  useEffect(() => {
    const st = location.state as { search?: string; tab?: Tab } | null;
    if (!st) return;
    if (st.tab) setTab(st.tab);
    if (st.search !== undefined) setQ(st.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);
  // NOT COUNTED IS NOT ZERO. The tiles read `0 ACTIVE / 0 ABOUT TO EXPIRE /
  // 0 INACTIVE` over 1,500 machines every one of which said ACTIVE (reported
  // 2026-09-23) -- because a tile that has not been counted rendered `?? 0`,
  // and the one path that fetches them on a cached open swallows its own
  // failure. A number that looks exact and is not is the fault this project
  // refuses everywhere else, and three of them sitting over a populated list
  // say the register is empty. `null` means not counted and renders as a dash.
  const [counts, setCounts] = useState<Record<string, number | null>>({});
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
    filledFor.current = '';
    // WARRANTY START DEFAULTS TO TODAY and is then typed over where the machine
    // was installed on another day (the user, 2026-09-22). The ENTRY date is
    // not set here at all: the database stamps it (0230), which is what
    // "automatic" has to mean if it is to be trusted.
    setDraft(kind === 'sale' ? { warranty_start: new Date().toISOString().slice(0, 10) } : {});
    try {
      const n = await nextCoverNumber(kind);
      setDraft((d) => (str(d[cfg.key]) ? d : { ...d, [cfg.key]: n }));
    } catch { /* offered, not required — the field is typeable */ }
  };

  const cacheKey = (t: Tab) => `cover-${kind}-${t}`;
  const fromCache = (t: Tab): Feed => {
    const c = loadCache<Row>(cacheKey(t));
    return { rows: c?.rows ?? [], at: c?.at ?? '', offset: c?.rows.length ?? 0,
             more: (c?.rows.length ?? 0) >= PAGE[t], step: OPEN_PAGES };
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
  // THE PRODUCT MASTER, loaded once and shared by every machine card. Only the
  // SALE uses it (a contract may name a retired line), and a failure to read it
  // leaves an empty list with free text still open rather than a stuck form.
  const [lines, setLines] = useState<ProductLine[]>([]);
  useEffect(() => { if (live) void listProductLines().then(setLines).catch(() => setLines([])); }, [live]);

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
    let countErr = '';
    try {
      const r = await fetchPages(t, 0, OPEN_PAGES);
      const at = filtered ? feeds[t].at : saveCache(cacheKey(t), r);
      // `more` tests what was ASKED FOR, not one page: two full pages back
      // means the register may well hold a third, and a short answer is the end.
      setFeed(t, { rows: r, offset: r.length, more: r.length >= OPEN_PAGES * PAGE[t],
                   at, step: OPEN_PAGES });
      if (t === 'machines') {
        // THE TOTALS MUST NOT TAKE THE TABLE DOWN WITH THEM. They used to be
        // awaited inside the same try, so a failing count threw away 1,500
        // rows that had already arrived and left an error banner over an empty
        // register. They are their own concern and report their own failure.
        try {
          const cs = await Promise.all(STATES.map((x) => countMachines(kind, x, { q })));
          setCounts(Object.fromEntries(STATES.map((x, i) => [x, cs[i]])));
        } catch (ce) {
          setCounts(Object.fromEntries(STATES.map((x) => [x, null])));
          countErr = ce instanceof Error ? ce.message : String(ce);
        }
      }
      setMsg(r.length
        ? { tone: countErr ? 'info' : 'ok',
            text: `${r.length}${r.length >= OPEN_PAGES * PAGE[t] ? '+' : ''} ${t === 'entries' ? 'entries' : 'machines'}${filtered ? ' matched' : ''}.`
              + (countErr ? ` The three totals did not load — ${countErr}` : '') }
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
        // THE TABLE HAS ALREADY LOADED, so this does not fail the page -- but
        // it must not leave three zeros behind either, and a dash on its own
        // does not say why. The reason is reported as INFORMATION rather than
        // as an error, because the register itself is fine.
        .catch((e) => {
          setCounts(Object.fromEntries(STATES.map((x) => [x, null])));
          setMsg({ tone: 'info', text: `The machines loaded; the three totals did not — ${e instanceof Error ? e.message : String(e)}` });
        });
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

  // THE PARTY FILLS THE ENTRY IN (the user, 2026-09-22). Only on a SALE, and
  // only when the name actually changed: re-picking the same customer must not
  // wipe an installation address somebody typed over it on purpose.
  //
  // IT REPLACES ALL ELEVEN FIELDS, BLANKS INCLUDED, and that is the careful
  // half. Keeping the previous party's address where the new one has none looks
  // helpful and is the worst outcome available — a sale carrying a DIFFERENT
  // customer's address, with nothing on screen saying so.
  const filledFor = useRef('');
  const fillFromParty = async (name: string) => {
    const want = name.trim();
    if (!want || want.toLowerCase() === filledFor.current.toLowerCase()) return;
    filledFor.current = want;
    let info = null;
    try { info = await sbPartyInfo(want); } catch { /* the name still stands */ }
    // A name the master has not got fills nothing rather than clearing what is
    // there: it has nothing to fill it FROM, and blanking on a typo would lose
    // work somebody had already done.
    if (!info) return;
    // Still the same customer? A slow lookup must not land on a name that has
    // since been changed.
    if (want.toLowerCase() !== filledFor.current.toLowerCase()) return;
    setDraft((d) => ({ ...d, ...partyFillForSale(info) }));
    setMsg({ tone: 'info', text: `Address, contact and tax details filled from the Party Master for ${want}.` });
  };

  const saveEntry = async () => {
    setSaving(true);
    try {
      // THE ENTRY DATE IS STAMPED ON CREATION, never typed (the user,
      // 2026-09-22). Sent from here as well as defaulted in the database
      // (0230) so the form works on a project that has not run that file yet;
      // on an UPDATE it is left exactly as it was, because re-stamping it would
      // silently re-date a sale every time somebody fixed a typo.
      const toSave = (!draft.id && kind === 'sale' && !draft.entry_at)
        ? { ...draft, entry_at: new Date().toISOString() }
        : draft;
      const saved = await saveHeader(kind, toSave);
      setOpen(saved); setDraft(saved);
      setFeed('entries', { rows: feeds.entries.rows.map((r) => (r.id === saved.id ? { ...r, ...saved } : r)) });
      // The header moved, so every machine that inherits from it moved too.
      setItems(await listItems(kind, str(saved[cfg.key])));
      setMsg({ tone: 'ok', text: `${cfg.keyLabel} ${str(saved[cfg.key])} saved — machines following it were updated.` });
    } catch (e) { setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); }
    finally { setSaving(false); }
  };

  // FORCE UPDATE CHILD RECORDS (the user, 2026-09-22). Every machine under this
  // entry goes back to following it.
  //
  // WHAT IT WILL CLEAR IS COUNTED AND NAMED FIRST, because there is no undo and
  // the two cases are not the same: a pinned value that merely REPEATS the
  // entry disappears without anybody being able to tell, and one that DIFFERS
  // is somebody's decision about one machine. The confirmation leads with the
  // second number.
  const pinnedNow = useMemo(
    () => summarisePinned(cfg.itemFields, items, draft), [cfg.itemFields, items, draft],
  );
  const forceAll = async () => {
    const p = pinnedNow;
    const lines = p.fields.map((f) => `  · ${f.label} — ${f.machines} machine(s)${f.differing ? `, ${f.differing} differing` : ''}`);
    const ok = window.confirm(
      `Put all ${items.length} machine(s) back on ${str(draft[cfg.key])}?\n\n`
      + `${p.differing} value(s) DIFFER from the entry and will be lost — there is no undo.\n`
      + `${p.total - p.differing} more merely repeat the entry and will look unchanged.\n\n`
      + `${lines.join('\n')}`);
    if (!ok) return;
    setSaving(true);
    try {
      const n = await forceInherit(kind, str(draft[cfg.key]));
      setItems(await listItems(kind, str(draft[cfg.key])));
      setMsg({ tone: 'ok', text: `${n} machine(s) now follow ${str(draft[cfg.key])} — ${p.total} pinned value(s) cleared.` });
    } catch (e) { setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); }
    finally { setSaving(false); }
  };

  // INSTALLATION CALLS FROM THE SALE ENTRY (the user, 2026-09-22). Every fact
  // the call needs is already here; re-typing it into the call form is where
  // the customer, the model or the serial stops matching the sale.
  //
  // ONE PER MACHINE THAT HAS NOT GOT ONE, and the UCN is written back onto that
  // machine's line — so the button disables itself by the only evidence that
  // counts, which is the mapping actually being there.
  const needCalls = useMemo(
    () => (kind === 'sale' ? machinesNeedingInstallCall(items) : []), [kind, items],
  );
  // A MACHINE TYPED BUT NOT SAVED IS THE ONE CASE THAT LOOKS LIKE A BUG.
  // It has a product and a serial, so the operator has done everything the
  // button asks — and `machinesNeedingInstallCall` refuses it because there is
  // no row id to write the UCN back to. Saying "every machine here has its
  // installation call" over that line would be flatly untrue, which is the
  // message this project keeps having to correct; it says what to do instead.
  const unsavedMachines = useMemo(
    () => (kind === 'sale'
      ? items.filter((i) => !isPinnedValue(i.id)
          && isPinnedValue(i.product_name) && isPinnedValue(i.serial_number)).length
      : 0), [kind, items]);
  const raiseCalls = async () => {
    const list = needCalls.map((i) => `  · ${str(i.product_name)} · ${str(i.serial_number)}`).join('\n');
    if (!window.confirm(
      `Raise ${needCalls.length} installation call(s) for ${str(draft.party_name) || 'this customer'}?\n\n${list}\n\n`
      + `Standard Complaint and Complaint Reported will read "${INSTALL_COMPLAINT}", the three vigilance `
      + `questions will be answered NO, and the customer contact will be left blank — nobody reported this.`)) return;
    setSaving(true);
    try {
      const r = await raiseInstallCalls(draft, items, (d, t) => setMsg({ tone: 'info', text: `Raising ${d} of ${t}…` }));
      setItems(await listItems(kind, str(draft[cfg.key])));
      if (r.error) {
        // STOPPED, NOT FAILED. What was created is named, because those calls
        // exist whatever the message says.
        setMsg({ tone: 'error', text: `Stopped at ${r.error}${r.created.length ? ` — ${r.created.length} call(s) were raised first: ${r.created.map((c) => c.ucn).join(', ')}.` : ''}` });
      } else {
        setMsg({ tone: 'ok', text: `${r.created.length} installation call(s) raised: ${r.created.map((c) => `${c.serial} → ${c.ucn}`).join(' · ')}` });
      }
    } catch (e) { setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); }
    finally { setSaving(false); }
  };

  // ONE MACHINE, FROM THE BY-MACHINE LIST (the user, 2026-09-23: "I need
  // + Installation Call"). The entry pane raises them for a whole sale; this
  // register is where somebody works down a list of machines, and the machine
  // in front of them is the one they want a call for.
  //
  // IT CALLS THE SAME FUNCTION WITH A LIST OF ONE. Every rule -- what the call
  // carries, that a machine already holding a UCN is refused, that an unsaved
  // one is refused, that the UCN is written back to the machine -- therefore
  // cannot drift between the two places, which is the fault this codebase
  // keeps finding in its own duplicated lists.
  //
  // THE VIEW IS ITS OWN HEADER. `warranty_sale_details` resolves the entry's
  // party, city, state, SA number and warranty onto each machine already, so
  // the row is passed as both -- there is no second record to fetch and
  // nothing to disagree with.
  const [raisingId, setRaisingId] = useState<number | null>(null);
  const raiseOneCall = async (r: Row) => {
    if (!machinesNeedingInstallCall([r] as never).length) return;
    // WHAT IS ABOUT TO BE OVERWRITTEN IS NAMED. The write-back replaces
    // INST Call, and on this register that field usually holds the AppSheet
    // placeholder "To Check" -- which is exactly what should be replaced. But
    // it could hold something somebody typed, and replacing that silently is
    // not a decision this screen gets to make on its own.
    const had = str(r.inst_call).trim();
    if (!window.confirm(
      `Raise an installation call for ${str(r.product_name)} · ${str(r.serial_number)}`
      + ` at ${str(r.party_name) || 'this customer'}?\n\n`
      + `Standard Complaint and Complaint Reported will read "${INSTALL_COMPLAINT}", the three vigilance `
      + `questions will be answered NO, and the customer contact will be left blank — nobody reported this.`
      + (had ? `\n\nINST Call currently reads “${had}”, which is not a call number. It will be replaced by the new UCN.` : ''))) return;
    setRaisingId(Number(r.id));
    try {
      const res = await raiseInstallCalls(r, [r]);
      const ucn = res.created[0]?.ucn ?? '';
      if (res.error || !ucn) { setMsg({ tone: 'error', text: res.error ?? 'The call was not created.' }); return; }
      // THE ROW IS PATCHED IN PLACE, AND SO IS THE CACHE. Re-reading 1,500
      // machines to learn one UCN would be a register-sized request for a value
      // already in hand -- and leaving the cache stale would put the button
      // back on the next visit, offering a second call for a machine that has
      // one.
      const rows = feeds.machines.rows.map((x) => (x.id === r.id ? { ...x, inst_call: ucn } : x));
      setFeed('machines', { rows });
      if (!filtered) saveCache(cacheKey('machines'), rows);
      setMsg({ tone: 'ok', text: `Installation call ${ucn} raised for ${str(r.serial_number)}.` });
    } catch (e) { setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); }
    finally { setRaisingId(null); }
  };

  // RE-READING THE CUSTOMER ONTO A SALE THAT ALREADY NAMES THEM (the user,
  // 2026-09-22). A hospital that moves, or a Party Master record corrected
  // afterwards, leaves every sale already raised carrying the old address --
  // and those are the ones somebody is trying to deliver to.
  //
  // A DELIBERATE ACT WITH A NAMED EFFECT, not a background sync. The
  // installation address on a sale legitimately differs from the registered
  // one, and a sale whose address changed quietly under an operator who had
  // corrected it by hand is worse than one that is visibly out of date.
  const refreshFromParty = async () => {
    const name = str(draft.party_name).trim();
    if (!name) return;
    setSaving(true);
    let info = null;
    try { info = await sbPartyInfo(name); } catch (e) {
      setSaving(false);
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
      return;
    }
    setSaving(false);
    if (!info) {
      // NOTHING TO READ FROM. Blanking the sale because the master has never
      // heard of this customer would destroy the only address anybody has.
      setMsg({ tone: 'error', text: `The Party Master has no customer called "${name}", so there is nothing to update from. Nothing was changed.` });
      return;
    }
    const fill = partyFillForSale(info);
    const changes = partyFillChanges(draft, fill);
    if (!changes.length) {
      setMsg({ tone: 'ok', text: 'Already matches the Party Master — nothing to change.' });
      return;
    }
    const labelOf = (k: string) => cfg.headerFields.find((f) => f.name === k)?.label ?? k;
    if (!window.confirm(
      `Update ${changes.length} field(s) on ${str(draft[cfg.key])} from the Party Master?\n\n`
      + changes.map((c) => `  · ${labelOf(c.field)}: ${c.from || '(blank)'} → ${c.to || '(blank)'}`).join('\n')
      + `\n\nSave the entry afterwards to keep this.`)) return;
    setDraft((d) => ({ ...d, ...fill }));
    setMsg({ tone: 'info', text: `${changes.length} field(s) updated from the Party Master — press Save entry to keep it.` });
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
    { key: '_call', header: 'Register call', width: 230, sortable: false, wrap: false, render: (r) => (
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); navigate('/field-calls', { state: { prefill: prefillFrom(r, kind) } }); }}>+ Field call</button>
        {/* INSTALLATION IS A SALE'S EVENT, NOT A CONTRACT'S. A machine reaches
            a contract already installed, so the button is not offered there --
            an action that makes no sense for the record in front of you is
            worse than a missing one, because somebody presses it to find out. */}
        {kind === 'sale' && (
          isCallNumber(r.inst_call)
            // ALREADY DONE, AND IT SAYS WHICH. The UCN is the evidence the
            // button disables itself by, so showing it is showing the reason.
            ? <span className="badge badge-neutral" title="This machine already has its installation call">
                {str(r.inst_call)}
              </span>
            : <>
                <button className="btn btn-sm" disabled={raisingId !== null}
                  onClick={(e) => { e.stopPropagation(); void raiseOneCall(r); }}
                  title="Raise the installation call for this machine and map it back">
                  {raisingId === Number(r.id) ? 'Raising…' : '+ Installation call'}
                </button>
                {/* WHATEVER IS IN THERE IS STILL SHOWN. The field usually holds
                    the AppSheet placeholder "To Check", which is what made the
                    button vanish in the first place -- hiding it now would just
                    move the surprise to the confirmation dialog. */}
                {isPinnedValue(r.inst_call) && (
                  <span className="muted" style={{ fontSize: 11 }}
                    title="Not a call number — the AppSheet export writes this where nobody has checked yet">
                    {str(r.inst_call)}
                  </span>
                )}
              </>
        )}
      </div>
    ) },
  ];

  const sections = [...new Set(cfg.headerFields.map((f) => f.section))];

  // THE ENTRY, AS THE SECOND WINDOW (the user, 2026-09-22: "Make the Warranty
  // Entry and Contract as a 2 window view [Adjustable width]"). It used to open
  // in a drawer OVER the list, which is right when you are looking at one
  // record and wrong when the job is working down a list: every entry meant
  // open, read, close, find your place again.
  const entryPane = open ? (
    <div style={{ padding: 14 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>
          {open.id ? `${cfg.keyLabel} ${str(open[cfg.key])}` : `New ${cfg.keyLabel}`}
        </h3>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => setOpen(null)} title="Close this entry">✕</button>
      </div>
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
                    <span className="field-label">
                      {f.label}
                      {f.derived && <span className="muted"> · from {f.derived}</span>}
                      {kind === 'sale' && SALE_PARTY_FIELDS.includes(f.name)
                        && <span className="muted"> · from the party</span>}
                    </span>
                    <FieldInput field={f} value={fromDb(f, draft[f.name])} disabled={!canEdit}
                      onChange={(v) => {
                        setDraft((d) => {
                          // The register's own arithmetic, from the AppSheet
                          // definition (src/lib/coverspec.ts). Derived from the
                          // field just edited, so an end date somebody typed for
                          // a part-month contract is not undone by an unrelated
                          // keystroke.
                          const next = { ...d, [f.name]: toDb(f, v) };
                          // `d` IS THE ROW BEFORE THIS EDIT, and passing it is
                          // what lets PM Visits follow the period until
                          // somebody types over it. Without it the derivation
                          // would compare against the period it has just moved
                          // to and read as overridden every time.
                          return { ...next, ...deriveHeader(kind, f.name, next, d) };
                        });
                        if (kind === 'sale' && f.name === 'party_name') void fillFromParty(v);
                      }} />
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
              {/* SALES ONLY: a contract entry carries no address of its own. */}
              {kind === 'sale' && !!str(draft.party_name).trim() && (
                <button className="btn" disabled={saving} onClick={() => void refreshFromParty()}
                  title="Re-read the address, contact and tax details from the Party Master">
                  ↺ Update from Party Master
                </button>
              )}
              {!!open.id && <button className="btn" onClick={() => void removeEntry()}>Delete entry</button>}
            </div>
          )}

          <h3 style={{ margin: '14px 0 8px' }}>Machines ({items.length})</h3>
          {/* WHY A PRODUCT MAY BE MISSING FROM THE LIST, said here rather than
              left to be inferred from an absence. A reader who cannot find
              ORION on a new sale should learn that it is retired, not conclude
              the master is incomplete and type it in anyway. Sale only: a
              contract may name a retired line. */}
          {kind === 'sale' && retiredNames(lines).length > 0 && (
            <div className="muted" style={{ marginBottom: 8, fontSize: 12.5 }}>
              {retiredNames(lines).length} product line
              {retiredNames(lines).length === 1 ? ' is' : 's are'} marked <b>Inactive</b> on the
              Product Master and {retiredNames(lines).length === 1 ? 'is' : 'are'} not offered
              here — a retired line takes no new sale. It can still take a contract, a call and
              everything else.
            </div>
          )}
          {!open.id && <div className="muted" style={{ marginBottom: 8 }}>Save the entry first, then add machines to it.</div>}
          {items.map((it) => (
            <ItemCard key={str(it.id)} cfg={cfg} kind={kind} item={it} header={draft} canEdit={canEdit} lines={lines}
              onSaved={(r) => setItems((cur) => cur.map((x) => (x.id === r.id ? r : x)))}
              onDeleted={(id) => setItems((cur) => cur.filter((x) => x.id !== id))} />
          ))}
          {canEdit && !!open.id && (
            <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-sm"
                onClick={() => setItems((cur) => [...cur, { [cfg.key]: str(draft[cfg.key]) }])}>
                + Add machine
              </button>
              {/* DISABLED ONCE EVERY MACHINE HAS ITS CALL, by the mapping
                  itself rather than by a flag somebody has to maintain. A line
                  with no product or no serial is not a machine yet and gets no
                  call — the call would be about nothing. */}
              {kind === 'sale' && (
                needCalls.length > 0
                  ? <button className="btn btn-sm" disabled={saving} onClick={() => void raiseCalls()}
                      title="Raise an installation call for each machine that has not got one">
                      ＋ Installation calls ({needCalls.length})
                    </button>
                  : <span className="muted" style={{ fontSize: 12 }}>
                      {unsavedMachines
                        ? `Press Save entry first — ${unsavedMachines} machine${unsavedMachines === 1 ? ' is' : 's are'} not saved yet, and a call can only be mapped to a saved machine.`
                        : items.length ? 'Every machine here has its installation call.' : ''}
                    </span>
              )}
              {/* OFFERED ONLY WHEN THERE IS SOMETHING TO CLEAR. A button that
                  does nothing is one people press to find out what it does. */}
              {pinnedNow.total > 0 && (
                <>
                  <button className="btn btn-sm" disabled={saving} onClick={() => void forceAll()}
                    title="Clear every pinned value so all machines follow this entry again">
                    ↺ Force update child records
                  </button>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {pinnedNow.machines} machine(s) pinned · {pinnedNow.total} value(s)
                    {pinnedNow.differing > 0 && <b> · {pinnedNow.differing} differ from this entry</b>}
                  </span>
                </>
              )}
            </div>
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
    </div>
  ) : null;

  const entriesTable = (
        <DataTable<Row>
          columns={headerColumns}
          rows={rows}
          getRowId={(r) => str(r.id)}
          storageKey={`cover-${kind}-entries`}
          // FEWER ROWS WHEN THE PANE IS NARROW. The split gives each side its
          // own scroller; a table that also wants sixteen rows puts a second
          // scrollbar inside the first, and the reader has to work out which
          // one they are in.
          rowsBeforeScroll={open ? 10 : 16}
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
                <button className="btn btn-sm" onClick={() => csvExport(`${kind}-entries.csv`, headerColumns.filter((c) => !c.key.startsWith('_')).map((c) => ({ key: c.key, header: c.header })), rows, partial(feeds.entries.more))}>⭳ Export CSV</button>
              )}
            </Toolbar>
          }
        />
  );
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
              <span className="pc-tile-n" title={counts[s] == null ? 'Not counted yet — press ↻ Refresh' : ''}>
                {counts[s] == null ? '—' : counts[s]!.toLocaleString()}
              </span>
              {statusBadge(s, TONES)}
            </button>
          ))}
        </div>
      )}

      {tab === 'entries' ? (
        // TWO WINDOWS WHEN AN ENTRY IS OPEN, one when it is not. A split with
        // nothing in its second pane is half a screen given to an empty box.
        open ? (
          <SplitPane storageKey={`cover-${kind}`} left={entriesTable} right={entryPane} />
        ) : entriesTable
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
                <button className="btn btn-sm" onClick={() => csvExport(`${kind}-machines.csv`, machineColumns.filter((c) => !c.key.startsWith('_')).map((c) => ({ key: c.key, header: c.header })), machines, partial(feeds.machines.more))}>⭳ Export CSV</button>
              )}
            </Toolbar>
          }
        />
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

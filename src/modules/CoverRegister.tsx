import { useEffect, useMemo, useState, useRef } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { LongDateInput, LongDateText } from '../components/ui/LongDate';
import { sbSearchParties, sbSearchProductParties, sbPartyInfo, sbSearchDealers, addParty, type PartyPatch } from '../lib/supabase';
import { partyMissing, partyFromSale } from '../lib/partyRules';
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
import { MachineRegisterNote } from '../components/machine/MachineRegisterNote';
import { coverStatus, deriveHeader, deriveItem, TRANSFERRED_AWAY, isDealerType, DEALER_NO_INSTALL } from '../lib/coverspec';
import { listProductLines, sellableNames, sellableCodes, retiredNames, type ProductLine } from '../lib/productLines';
import { PageHeader, Toolbar, SearchBox } from '../components/ui/ui';
import { csvExport, fmtDate, statusBadge, timeAgo } from '../lib/format';
import { localIsoDate, todayLocal } from '../lib/dates';
import { loadCache, saveCache, isStale, SYNC_TTL_MS, startBackgroundSync } from '../lib/cache';
import { useAuth } from '../lib/auth';
import { supabaseConfigured } from '../lib/supabase';
import {
  configFor, listHeaders, listItems, listMachines, countMachines, saveHeader, saveItem, forceInherit,
  raiseInstallCalls, missingRequired, yearsHint, getHeader, countPendingSales,
  deleteItem, deleteHeader, isPinned, proposeRenewal, renewContract, addPeriod, nextCoverNumber,
  proposeConversion, conversionHeader, convertWarrantyToContract, contractsFromSale, suggestedContractPmVisits,
  machinesWithAnotherCustomer,
  CONTRACT, type ConversionDraft,
  type CoverKind, type CoverField, type Row, type RenewalDraft,
} from '../lib/cover';
// THE PRICING RULE COMES FROM ONE PLACE. GST and "total = rate + tax" are the
// contract form's own rules; the renewal panel shows what it is about to write
// and must not compute it a second way, or the preview and the saved row can
// disagree about money.
import { itemTaxAmount, totalAfterTax, upliftRate } from '../lib/coverspec';
import './fieldcalls.css';
import { partial } from '../lib/exportscope';
import { xlsxDownload, xlsxCell } from '../lib/xlsx';

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
  // THE PRODUCT DATABASE'S CUSTOMERS, searched as you type (the user,
  // 2026-10-02, for the Contract Register). NO free text: a contract covers
  // machines already on record, so a name the Product Database has never
  // heard of is not a customer this contract can cover -- it is a typo, or a
  // machine that has to be added there first.
  if (field.optionsFrom === 'product-party') {
    return <SelectPicker value={value} onChange={onChange} disabled={disabled}
                         placeholder="— find the customer —"
                         options={value ? [value] : []}
                         onSearch={(term) => sbSearchProductParties(term, 50)}
                         emptyHint="Customers come from the Product Database — whoever owns a machine on record. Type more of the name to narrow the list." />;
  }
  // DEALERS ONLY (the user, 2026-10-03: "Only party identified as dealer
  // should be listed as part of the drop down"). No free text: Sold Through
  // monitors the dealer, and a name that is not a dealer monitors nothing.
  if (field.optionsFrom === 'dealer') {
    return <SelectPicker value={value} onChange={onChange} disabled={disabled}
                         placeholder="— find the dealer —"
                         options={value ? [value] : []}
                         onSearch={(term) => sbSearchDealers(term, 50)}
                         emptyHint="Only Party Master entries whose Type is DEALER are listed." />;
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
  cfg, kind, item, header, canEdit, onSaved, onDeleted, lines, onDirtyChange, focus,
}: {
  cfg: ReturnType<typeof configFor>; kind: CoverKind; item: Row; header: Row; canEdit: boolean;
  onSaved: (r: Row) => void; onDeleted: (id: number) => void;
  /** The Product Master's lines, loaded once by the screen. */
  lines: ProductLine[];
  /** Told whenever this card starts or stops holding an unsaved edit, so the
   *  window can warn before it is closed over one. */
  onDirtyChange?: (dirty: boolean) => void;
  /** THE MACHINE THE READER CLICKED ON THE REGISTER TAB: opened, marked and
   *  scrolled into view, so arriving at a twenty-machine contract does not
   *  leave them hunting for the one line they came for. */
  focus?: boolean;
}) {
  const [open, setOpen] = useState(!item.id || !!focus);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) cardRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus]);
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
  // Reported up, and withdrawn when the card goes (saved, removed or closed).
  const dirtyRef = useRef(onDirtyChange);
  dirtyRef.current = onDirtyChange;
  useEffect(() => { dirtyRef.current?.(dirty); }, [dirty]);
  useEffect(() => () => { dirtyRef.current?.(false); }, []);

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
    <div ref={cardRef} className={`req-act-sec${focus ? ' cover-card-focus' : ''}`}>
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
          {/* dd-MMM-yyyy at rest, the native picker while editing (FRS-089.1, D-064). */}
          <LongDateInput value={d.contract_start} onChange={(v) => reperiodMonths(v, d.contract_months)} />
        </label>
        {/* WORKED OUT, NOT TYPED, as on the contract form itself (the user,
            2026-10-02): the end is the start plus the months, and the years
            are the months divided by twelve. */}
        <label className="rep-field">
          <span className="field-label">End <span className="muted">· from Start + Period (months)</span></span>
          <LongDateText value={d.contract_end} />
        </label>
        <label className="rep-field">
          <span className="field-label">Period (Months) *</span>
          <input className="input" type="number" min={0} value={d.contract_months ?? ''}
                 onChange={(e) => reperiodMonths(d.contract_start,
                   e.target.value === '' ? null : Number(e.target.value))} />
          {/* The years, as a line rather than a box (2026-10-02). */}
          {yearsHint(d as unknown as Row, 'contract_months') && (
            <span className="muted rep-hint">{yearsHint(d as unknown as Row, 'contract_months')}</span>
          )}
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

// ===========================================================================
// CONVERT THIS WARRANTY INTO A CONTRACT (the user, 2026-10-02). Shown on a
// sale entry. What the sale holds is carried and shown as carried; what a
// sale cannot know is asked for, with the contract form's own rules. The
// mapping itself is in cover.ts (proposeConversion / conversionHeader /
// conversionItem), so this panel only collects and shows.
// ===========================================================================
function ConvertPanel({ sale, items, onDone, onCancel }: {
  sale: Row; items: Row[]; onDone: (mc: string, machines: number) => void; onCancel: () => void;
}) {
  const [d, setD] = useState<ConversionDraft>(() => proposeConversion(sale, items));
  const [pmTyped, setPmTyped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [already, setAlready] = useState<string[]>([]);
  // WHO HAS EACH MACHINE NOW (the user, 2026-10-03). null while asking; a
  // machine with a different customer is never offered, and the reason is
  // said beside it. A failed check stops the conversion rather than offering
  // a list nobody checked.
  const [away, setAway] = useState<Map<string, string> | null>(null);
  const [awayErr, setAwayErr] = useState('');
  const set = <K extends keyof ConversionDraft>(k: K, v: ConversionDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  // The next MC in the series, OFFERED (editable, not reserved), and the
  // contracts that already carry a machine from this sale.
  useEffect(() => {
    void nextCoverNumber('contract').then((n) => setD((x) => (x.mc_number ? x : { ...x, mc_number: n }))).catch(() => {});
    void contractsFromSale(str(sale.sa_number)).then(setAlready).catch(() => {});
  }, [sale.sa_number]);
  useEffect(() => {
    let live = true;
    setAway(null); setAwayErr('');
    machinesWithAnotherCustomer(sale, items)
      .then((m) => {
        if (!live) return;
        setAway(m);
        setD((x) => ({ ...x, serials: x.serials.filter((sn) => !m.has(sn)) }));
      })
      .catch((e) => { if (live) setAwayErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
    // The buyer and the machines decide the answer; another edit to the
    // draft does not, so it does not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale.party_name, sale.sa_number, items]);

  // PM VISITS FOLLOW THE MONTHS until somebody types over them -- the
  // contract form's rule (FRS-090), not a second one.
  const setMonths = (raw: string) => {
    const m = raw === '' ? null : Number(raw);
    setD((x) => ({ ...x, contract_months: m,
      pm_visits_total: pmTyped ? x.pm_visits_total : suggestedContractPmVisits(m) }));
  };

  const header = conversionHeader(sale, d);
  const opt = (name: string) => CONTRACT.headerFields.find((f) => f.name === name)?.options?.filter(Boolean) ?? [];
  const withSerial = items.filter((i) => str(i.serial_number));
  const machines = withSerial.filter((i) => !away?.has(str(i.serial_number)));
  const transferred = withSerial.filter((i) => away?.has(str(i.serial_number)));
  const checking = away === null && !awayErr;
  const toggle = (sn: string) => setD((x) => ({
    ...x, serials: x.serials.includes(sn) ? x.serials.filter((s) => s !== sn) : [...x.serials, sn],
  }));

  const go = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await convertWarrantyToContract(sale, items, d);
      onDone(r.mc_number, r.machines);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="rep-sec" style={{ marginTop: 0 }}>
      <div className="rep-sec-title">
        Convert to a contract <span className="muted">· from {str(sale.sa_number)}</span>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        <b>Carried from the sale:</b> Party Name, and each machine's Product Code, Product Name and Serial
        Number, with the SA Number and its warranty end recorded on the contract line.
        The contract starts the day after the warranty ends, so cover has no gap. Fill in the rest below.
      </p>
      {already.length > 0 && (
        <div className="sheet-banner sheet-banner-info" style={{ marginBottom: 8 }}>
          <span>Machines from {str(sale.sa_number)} are already on {already.join(', ')}. Converting again adds another contract.</span>
        </div>
      )}

      <div className="rep-grid">
        <label className="rep-field">
          <span className="field-label">Party Name <span className="muted">· from the sale</span></span>
          <input className="input" value={str(sale.party_name)} readOnly disabled />
        </label>
        <label className="rep-field">
          <span className="field-label">MC Number *</span>
          <input className="input" value={d.mc_number} onChange={(e) => set('mc_number', e.target.value)} />
        </label>
        <label className="rep-field">
          <span className="field-label">Contract Type</span>
          <SelectPicker value={d.contract_type} onChange={(v) => set('contract_type', v)}
            placeholder="— choose —" options={opt('contract_type')} />
        </label>
        <label className="rep-field">
          <span className="field-label">Contract Start Date</span>
          <LongDateInput value={d.contract_start} onChange={(v) => set('contract_start', v)} />
        </label>
        <label className="rep-field">
          <span className="field-label">Contract Period (Months) *</span>
          <input className="input" type="number" min={1} value={d.contract_months ?? ''}
                 onChange={(e) => setMonths(e.target.value)} />
          {yearsHint(header, 'contract_months') && <span className="muted rep-hint">{yearsHint(header, 'contract_months')}</span>}
        </label>
        <label className="rep-field">
          <span className="field-label">Contract End Date <span className="muted">· from Start + Period (months)</span></span>
          <LongDateText value={str(header.contract_end)} />
        </label>
        <label className="rep-field">
          <span className="field-label">PM Visits (Total) *</span>
          <input className="input" type="number" min={0} value={d.pm_visits_total ?? ''}
                 onChange={(e) => { setPmTyped(true); set('pm_visits_total', e.target.value === '' ? null : Number(e.target.value)); }} />
        </label>
        <label className="rep-field">
          <span className="field-label">Payment Schedule *</span>
          <SelectPicker value={d.payment_schedule} onChange={(v) => set('payment_schedule', v)}
            placeholder="—" options={opt('payment_schedule')} />
        </label>
        <label className="rep-field">
          <span className="field-label">Bill Generate At *</span>
          <SelectPicker value={d.bill_generate_at} onChange={(v) => set('bill_generate_at', v)}
            placeholder="—" options={opt('bill_generate_at')} />
        </label>
      </div>

      <div className="field-label" style={{ marginTop: 10 }}>
        Products ({d.serials.length} of {machines.length} going onto the contract)
      </div>
      <div className="muted" style={{ fontSize: 12.5 }}>
        Untick a machine that is not being covered. A rate is optional — leave it blank to price the contract later.
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
        {machines.map((it) => {
          const sn = str(it.serial_number);
          const on = d.serials.includes(sn);
          const raw = (d.rates[sn] ?? '').trim();
          const n = raw === '' ? null : Number(raw);
          return (
            <div key={sn} className="renew-row" style={{ opacity: on ? 1 : 0.5 }}>
              <input type="checkbox" checked={on} onChange={() => toggle(sn)} />
              <span className="renew-name">
                <b>{sn}</b> <span className="muted">{str(it.product_name)}{str(it.product_code) && ` · ${str(it.product_code)}`}</span>
              </span>
              <span className="renew-money">
                <span className="muted renew-was">warranty to {fmtDate(it.warranty_end || sale.warranty_end) || '—'}</span>
                <input className="input renew-rate" type="number" min={0} step="0.01" placeholder="rate" disabled={!on}
                       value={d.rates[sn] ?? ''} onChange={(e) => setD((x) => ({ ...x, rates: { ...x.rates, [sn]: e.target.value } }))} />
                <span className="muted renew-tot">
                  {!on ? '' : n !== null && Number.isFinite(n) && n >= 0 ? `+GST = ${(totalAfterTax(n) ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                    : raw === '' ? 'price later' : 'not a rate'}
                </span>
              </span>
            </div>
          );
        })}
        {checking && <div className="muted" style={{ fontSize: 12.5 }}>Checking which customer has each machine now…</div>}
        {!checking && !machines.length && (
          <div className="muted" style={{ fontSize: 12.5 }}>
            {transferred.length
              ? `Every machine on ${str(sale.sa_number)} is now with a different customer, so there is nothing to put on ${str(sale.party_name) || 'this customer'}'s contract.`
              : 'This sale has no machine with a serial number, so there is nothing to put on a contract.'}
          </div>
        )}
      </div>
      {transferred.length > 0 && (
        <div className="sheet-banner sheet-banner-info" style={{ marginTop: 8, display: 'block' }}>
          <b>Not offered ({transferred.length}):</b>
          {transferred.map((it) => {
            const sn = str(it.serial_number);
            return (
              <div key={`away-${sn}`} style={{ fontSize: 12.5, marginTop: 4 }}>
                <b>{sn}</b> <span className="muted">{str(it.product_name)}</span> — {TRANSFERRED_AWAY}
                {away?.get(sn) ? <span className="muted"> (now with {away.get(sn)})</span> : null}.
              </div>
            );
          })}
        </div>
      )}
      {awayErr && (
        <div className="sheet-banner sheet-banner-error" style={{ marginTop: 8 }}>
          <span>Could not check which customer has each machine, so the contract cannot be made yet: {awayErr}</span>
        </div>
      )}

      {msg && <div className="sheet-banner sheet-banner-error" style={{ marginTop: 8 }}><span>{msg}</span></div>}
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary" disabled={busy || checking || !!awayErr || !machines.length} onClick={() => void go()}>
          {busy ? 'Creating…' : 'Create the contract'}
        </button>
        <button className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function CoverRegister({ kind }: { kind: CoverKind }) {
  const cfg = configFor(kind);
  const { can } = useAuth();
  const navigate = useNavigate();
  // EACH REGISTER ITS OWN KEYS (findings 63, 67; 0291): the Warranty Register
  // answers to cover.edit, the Contract Register to contract.edit, and each
  // splits adding/editing an entry from deleting a whole one.
  const K = kind === 'contract' ? 'contract.edit' : 'cover.edit';
  const canEdit = can(`${K}.entries`);
  const canDelete = can(`${K}.delete`);
  // "+ Field call" opens the Field Call form: its save is calls.create.
  const canRaiseField = can('calls.create');
  // THE PER-MACHINE "+ Installation call" follows the permission that RAISES
  // the call -- install.create, which the database asks of the insert (finding
  // 64: cover.edit alone was offered the button and refused the call).
  // Mapping it back is `link_install_call` (0258), which accepts install.create,
  // so whoever may press the button can finish what it starts (finding 31).
  const canRaiseInstall = can('install.create');
  const live = supabaseConfigured();

  const [tab, setTab] = useState<Tab>('entries');
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  // PENDING INSTALLATION CALL -- a Warranty filter, on the server (cover.ts).
  // Combines with a state tile and the search; its own count beside them.
  const [pendingInstall, setPendingInstall] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const countPending = (search: string) => (kind === 'sale'
    ? countMachines(kind, '', { q: search, pendingInstall: true }).then(setPendingCount).catch(() => setPendingCount(null))
    : Promise.resolve());
  // ...and on the Entries tab, how many SALES have at least one such machine
  // (the user, 2026-10-02: "Add the pending count to the Entries tab as well").
  // The same toggle filters both tabs; each counts its own thing.
  const [pendingSalesCount, setPendingSalesCount] = useState<number | null>(null);
  const countPendingSalesNow = (search: string) => (kind === 'sale'
    ? countPendingSales({ q: search }).then(setPendingSalesCount).catch(() => setPendingSalesCount(null))
    : Promise.resolve());

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
  // Read by the background sync, which waits while a read is in flight.
  const busyRef = useRef(busy);
  busyRef.current = busy;
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
    filledFor.current = ''; setPartyKnown(null);
    // WARRANTY START DEFAULTS TO TODAY and is then typed over where the machine
    // was installed on another day (the user, 2026-09-22). The ENTRY date is
    // not set here at all: the database stamps it (0230), which is what
    // "automatic" has to mean if it is to be trusted.
    // CONTRACT START DEFAULTS TO TODAY as well (the user, 2026-10-02), typed
    // over for a contract that starts on another day.
    setDraft(kind === 'sale' ? { warranty_start: todayLocal() } : { contract_start: todayLocal() });
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
  const filtered = !!q || pendingInstall || (tab === 'machines' && !!state);

  const [open, setOpen] = useState<Row | null>(null);   // header being viewed
  // Closed whenever a different entry is opened: a half-filled renewal must not
  // follow the reader onto another contract.
  const [renewing, setRenewing] = useState(false);
  // The warranty-to-contract panel, closed the same way a renewal is.
  const [converting, setConverting] = useState(false);
  const [items, setItems] = useState<Row[]>([]);
  // TRUE WHILE AN ENTRY'S MACHINES ARE BEING READ. The Renew panel seeds its
  // draft ONCE, from `items`, when it opens -- so pressed before the read
  // lands it started with no machines and never picked them up, and saving
  // refused with "Tick at least one machine to carry over".
  const [loadingItems, setLoadingItems] = useState(false);
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
      ? listHeaders(kind, { q, pendingInstall }, offset, PAGE.entries)
      : listMachines(kind, { q, state, pendingInstall }, offset, PAGE.machines);

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
      if (t === 'entries') void countPendingSalesNow(q);
      if (t === 'machines') {
        // THE TOTALS MUST NOT TAKE THE TABLE DOWN WITH THEM. They used to be
        // awaited inside the same try, so a failing count threw away 1,500
        // rows that had already arrived and left an error banner over an empty
        // register. They are their own concern and report their own failure.
        try {
          const cs = await Promise.all(STATES.map((x) => countMachines(kind, x, { q })));
          setCounts(Object.fromEntries(STATES.map((x, i) => [x, cs[i]])));
          void countPending(q);
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
    if (tab === 'entries') void countPendingSalesNow('');
    if (tab === 'machines') {
      void countPending('');
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
  }, [tab, q, state, pendingInstall]);

  // 30-minute background force-sync of whichever tab is open, unfiltered.
  useEffect(() => {
    if (!live) return;
    return startBackgroundSync(() => { if (!filtered) void refresh(tab); }, () => busyRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filtered]);

  // ONE READ PER OPEN, AND ONLY THE LATEST MAY LAND. Opening contract A and
  // then B before A's machines arrived let A's reply set `items` on B's
  // entry and clear the loading flag -- so Renew was enabled on B, seeded
  // with A's machines, and B's own reply could not correct a panel that seeds
  // once. A reply for an entry no longer open is dropped.
  const openSeq = useRef(0);
  // The machine line to open, mark and scroll to -- set when the entry was
  // opened from the Register tab, cleared when it was opened as a whole.
  const [focusId, setFocusId] = useState<number | null>(null);
  const openEntry = async (h: Row, focus: number | null = null) => {
    const seq = ++openSeq.current;
    setFocusId(focus);
    setRenewing(false); setConverting(false);
    setOpen(h); setDraft(h); setItems([]);
    // An existing sale's party is looked up once, so a name the master lacks
    // is flagged before anybody presses Save.
    filledFor.current = str(h.party_name).trim(); setPartyKnown(null);
    if (kind === 'sale' && str(h.party_name).trim()) {
      void sbPartyInfo(str(h.party_name).trim())
        .then((i) => { if (seq === openSeq.current) setPartyKnown(!!i); }).catch(() => {});
    }
    setLoadingItems(true);
    try {
      const got = await listItems(kind, str(h[cfg.key]));
      if (seq === openSeq.current) setItems(got);
    } catch (e) {
      if (seq === openSeq.current) setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      if (seq === openSeq.current) setLoadingItems(false);
    }
  };

  // A LINE ON THE REGISTER TAB OPENS ITS ENTRY (the user, 2026-10-02: "Nothing
  // happens when I click the Line in the Register View", and chose this of the
  // three offered). The same window as the Entries tab -- same buttons, same
  // rules, nothing to keep in step -- with the clicked machine opened, marked
  // and scrolled into view on the right.
  const openFromRegister = async (r: Row) => {
    const key = str(r[cfg.key]).trim();
    if (!key) { setMsg({ tone: 'error', text: `This machine line carries no ${cfg.keyLabel}, so there is no entry to open.` }); return; }
    try {
      const h = await getHeader(kind, key);
      if (!h) { setMsg({ tone: 'error', text: `${cfg.keyLabel} ${key} was not found — the machine line names an entry the register does not hold.` }); return; }
      await openEntry(h, Number(r.id) || null);
    } catch (e) { setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) }); }
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
  // IS THE SALE'S PARTY ON THE PARTY MASTER? null = not asked yet. False turns
  // the master's required fields on here, and says the party will be added.
  const [partyKnown, setPartyKnown] = useState<boolean | null>(null);
  const fillFromParty = async (name: string) => {
    const want = name.trim();
    if (!want) { setPartyKnown(null); return; }
    if (want.toLowerCase() === filledFor.current.toLowerCase()) return;
    filledFor.current = want;
    let info = null;
    let looked = false;
    try { info = await sbPartyInfo(want); looked = true; } catch { /* the name still stands */ }
    if (want.toLowerCase() === filledFor.current.toLowerCase()) setPartyKnown(looked ? !!info : null);
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
    // EVERY BLANK REQUIRED FIELD NAMED AT ONCE, before anything is written --
    // one at a time would be a round trip per field.
    const missing = missingRequired(cfg.headerFields, draft);
    if (missing.length) {
      setMsg({ tone: 'error', text: `Fill in ${missing.join(', ')} before saving — ${missing.length === 1 ? 'it is' : 'they are'} required.` });
      return;
    }
    setSaving(true);
    let partyNote = '';
    try {
      // A NEW PARTY IS ADDED TO THE PARTY MASTER IN THE SAME STEP (the user,
      // 2026-10-05: "allow the user to create a new party and use it in
      // warranty sale at the same time", choosing "on Save, in one step").
      // ASKED OF THE MASTER NOW, not read off the screen's last lookup, so a
      // party somebody added meanwhile is not added twice. A name the master
      // has not got must carry the master's own required fields (partyRules)
      // -- for everybody, so the sale itself is complete. With
      // masters.parties.add the party is created first, from what was typed
      // on the sale; without it the sale saves as it always has (the user's
      // choice), and says so.
      const partyName = str(draft.party_name).trim();
      if (kind === 'sale' && partyName) {
        let info = null;
        try { info = await sbPartyInfo(partyName); } catch { info = undefined; }
        if (info === null) {
          const newParty = partyFromSale(draft);
          const lacking = partyMissing(newParty);
          if (lacking.length) {
            setPartyKnown(false);
            setMsg({ tone: 'error', text: `${partyName} is not on the Party Master, so the Party Master's required fields apply here too: fill in ${lacking.join(', ')}.` });
            return;
          }
          if (can('masters.parties.add')) {
            const res = await addParty(newParty as unknown as PartyPatch & { party_name: string });
            if (!res.ok && !/already on the Party Master/.test(res.error)) {
              setMsg({ tone: 'error', text: `The party could not be added to the Party Master, so the sale was not saved — ${res.error}` });
              return;
            }
            filledFor.current = partyName;
            setPartyKnown(true);
            partyNote = res.ok ? ` ${partyName} was added to the Party Master${res.partyKey ? ` as ${res.partyKey}` : ''}.` : '';
          } else {
            partyNote = ` ${partyName} is not on the Party Master and your role may not add it — ask somebody who may add parties.`;
          }
        }
      }
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
      setMsg({ tone: 'ok', text: `${cfg.keyLabel} ${str(saved[cfg.key])} saved — machines following it were updated.${partyNote}` });
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
      const fresh = await listItems(kind, str(draft[cfg.key]));
      setItems(fresh);
      // The sale's count on the Entries list moves with it, rather than
      // reading the old number until the next sync.
      const left = machinesNeedingInstallCall(fresh as never).length;
      setFeed('entries', { rows: feeds.entries.rows.map((x) => (x.id === draft.id ? { ...x, pending_install: left } : x)) });
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
    // HOW MANY OF THIS SALE'S MACHINES STILL WAIT FOR AN INSTALLATION CALL --
    // counted by the database (listHeaders), the Register tab's rule.
    ...(kind === 'sale' ? [{ key: 'pending_install', header: 'Install calls pending', width: 120, align: 'right', wrap: false,
      // NOT COUNTED IS NOT ZERO: a row cached before this column existed has
      // no count, and reads a dash until the next sync rather than "0".
      render: (r: Row) => (r.pending_install == null
        ? <span className="muted" title="Not counted yet — press ↻ Refresh">—</span>
        : Number(r.pending_install) > 0
        ? <span className="badge badge-warning" title="Machines on this sale with no installation call mapped">{Number(r.pending_install)}</span>
        : <span className="muted">0</span>) } as Column<Row>] : []),
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
    // THE IDENTIFIER: one word a reader can scan down and the export can carry.
    ...(kind === 'sale' ? [{ key: 'install_pending', header: 'Installation call', width: 130, sortable: false, wrap: false,
      render: (r: Row) => (installPending(r)
        ? <span className="badge badge-warning" title="No installation call is mapped to this machine yet">Pending</span>
        : isCallNumber(r.inst_call)
          ? <span className="badge badge-success" title="Installation call mapped">{str(r.inst_call)}</span>
          : <span className="muted" title="No product or no serial on this line, so no call can be raised for it">—</span>) } as Column<Row>] : []),
    { key: '_call', header: 'Register call', width: 230, sortable: false, wrap: false, render: (r) => (
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {canRaiseField && <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); navigate('/field-calls', { state: { prefill: prefillFrom(r, kind) } }); }}>+ Field call</button>}
        {/* INSTALLATION IS A SALE'S EVENT, NOT A CONTRACT'S. A machine reaches
            a contract already installed, so the button is not offered there --
            an action that makes no sense for the record in front of you is
            worse than a missing one, because somebody presses it to find out. */}
        {kind === 'sale' && isDealerType(r.party_type) && !isCallNumber(r.inst_call) && (
          <span className="muted" style={{ fontSize: 12 }} title={DEALER_NO_INSTALL}>Dealer — raised from the transfer</span>
        )}
        {kind === 'sale' && !(isDealerType(r.party_type) && !isCallNumber(r.inst_call)) && (
          isCallNumber(r.inst_call)
            // ALREADY DONE, AND IT SAYS WHICH. The UCN is the evidence the
            // button disables itself by, so showing it is showing the reason.
            ? <span className="badge badge-neutral" title="This machine already has its installation call">
                {str(r.inst_call)}
              </span>
            : <>
                {canRaiseInstall && <button className="btn btn-sm" disabled={raisingId !== null}
                  onClick={(e) => { e.stopPropagation(); void raiseOneCall(r); }}
                  title="Raise the installation call for this machine and map it back">
                  {raisingId === Number(r.id) ? 'Raising…' : '+ Installation call'}
                </button>}
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

  // A HIDDEN field is written by the code, never shown (Prev MC Number).
  const shownHeader = cfg.headerFields.filter((f) => !f.hidden);
  const sections = [...new Set(shownHeader.map((f) => f.section))];

  // AN ENTRY OPENS AS A POP-UP (the user, 2026-10-02: "When I click on the
  // Entry, the Entry should open in a Pop Up Window with 2 Screens - Left Side
  // details of the Entry, Right Side List of Product. Keep all the Action
  // Buttons at the Top [Sticky]" -- asked of the Contract Register, then "Do
  // the same for the Warranty Register"). It replaces the side-by-side split
  // of 2026-09-22 on both registers.
  //
  // THE PIECES ARE BUILT ONCE AND ARRANGED IN ONE PLACE, so a rule added to
  // the window cannot be missing from one of the two registers.

  // UNSAVED WORK IS NAMED BEFORE THE WINDOW CLOSES. A pop-up is closed with one
  // click, and a contract's rates typed into it and lost that way would be lost
  // without a trace. Each machine card reports whether it holds an edit; a
  // machine added and never saved counts too.
  const dirtyCards = useRef(new Set<string>());
  const entryDirty = !!open && JSON.stringify(draft) !== JSON.stringify(open);
  const closeEntry = () => {
    const cards = dirtyCards.current.size + items.filter((i) => !isPinnedValue(i.id)).length;
    const what = [entryDirty ? 'the entry' : '', cards ? `${cards} machine(s)` : ''].filter(Boolean).join(' and ');
    if (what && !window.confirm(`Unsaved changes to ${what} will be lost. Close anyway?`)) return;
    dirtyCards.current.clear();
    setRenewing(false); setConverting(false); setFocusId(null);
    setOpen(null);
  };
  // A machine added from the TOP of the window lands at the BOTTOM of the
  // product list, so the list is scrolled to it -- otherwise the button
  // appears to do nothing on a contract with twenty machines.
  const productsRef = useRef<HTMLDivElement>(null);
  const addMachine = () => {
    setItems((cur) => [...cur, { [cfg.key]: str(draft[cfg.key]) }]);
    window.requestAnimationFrame(() => {
      const el = productsRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  };

  const entryTitle = open ? (
    <h3 style={{ margin: 0, fontSize: 16 }}>
      {open.id ? `${cfg.keyLabel} ${str(open[cfg.key])}` : `New ${cfg.keyLabel}`}
    </h3>
  ) : null;

  const entryNote = (
    <div className="muted" style={{ marginBottom: 10 }}>
      This is the parent record. A machine on the right leaves a field empty to follow it — change a
      date or a period here and every machine that follows moves with it.
    </div>
  );

  // THE PARTY MASTER'S REQUIRED FIELDS, required here while the sale names a
  // party the master has not got (partyRules.PARTY_REQUIRED, minus the name
  // itself, which is the field that raised the question).
  const newPartyFields = new Set(kind === 'sale' && partyKnown === false ? ['city', 'state'] : []);
  const partyNotice = kind === 'sale' && partyKnown === false && str(draft.party_name).trim() ? (
    <div className={`sheet-banner sheet-banner-${can('masters.parties.add') ? 'info' : 'error'}`} style={{ margin: '0 0 10px' }}>
      <span>
        <b>{str(draft.party_name).trim()}</b> is not on the Party Master.{' '}
        {can('masters.parties.add')
          ? <>It will be <b>added to the Party Master</b> when you press Save entry, with the details typed here. City and State are required, as they are on the Party Master.</>
          : <>Your role may not add parties, so the sale will be saved without adding it. City and State are still required.</>}
      </span>
    </div>
  ) : null;

  const entryFields = sections.map((sec) => (
    <div key={sec} style={{ marginBottom: 10 }}>
      <div className="field-label" style={{ opacity: 0.75 }}>{sec}</div>
      <div className="rep-grid">
        {shownHeader.filter((f) => f.section === sec).map((f) => (
          <label key={f.name} className="rep-field">
            <span className="field-label">
              {f.label}{(f.required || (newPartyFields.has(f.name))) && <span title="Required"> *</span>}
              {f.derived && <span className="muted"> · from {f.derived}</span>}
              {kind === 'sale' && SALE_PARTY_FIELDS.includes(f.name)
                && <span className="muted"> · from the party</span>}
            </span>
            <FieldInput field={f} value={f.compute ? f.compute(draft) : fromDb(f, draft[f.name])} disabled={!canEdit}
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
            {f.hint && f.hint(draft) && <span className="muted rep-hint">{f.hint(draft)}</span>}
          </label>
        ))}
      </div>
    </div>
  ));

  // The entry's own buttons: save, re-read the party, delete.
  const entryButtons = canEdit && open ? (
    <>
      {/* ENABLED ONLY WHEN SOMETHING CHANGED (the user, 2026-10-02: "Enable
          Save only if the Data has changed. It is confusing at the Moment").
          A new entry always counts as changed -- it has not been saved yet. */}
      <button className="btn btn-primary" onClick={() => void saveEntry()}
        disabled={saving || (!!open.id && !entryDirty)}
        title={open.id && !entryDirty ? 'Nothing has changed since it was saved' : undefined}>
        {saving ? 'Saving…' : 'Save entry'}
      </button>
      {/* SALES ONLY: a contract entry carries no address of its own. */}
      {kind === 'sale' && !!str(draft.party_name).trim() && (
        <button className="btn" disabled={saving} onClick={() => void refreshFromParty()}
          title="Re-read the address, contact and tax details from the Party Master">
          ↺ Update from Party Master
        </button>
      )}
      {!!open.id && canDelete && <button className="btn" onClick={() => void removeEntry()}>Delete entry</button>}
    </>
  ) : null;

  // The buttons that act on the machines under the entry.
  const machineButtons = canEdit && open && !!open.id ? (
    <>
      <button className="btn btn-sm" onClick={addMachine}>+ Add machine</button>
      {/* DISABLED ONCE EVERY MACHINE HAS ITS CALL, by the mapping
          itself rather than by a flag somebody has to maintain. A line
          with no product or no serial is not a machine yet and gets no
          call — the call would be about nothing. */}
      {/* A DEALER GETS NO INSTALLATION CALL (the user, 2026-10-03; 0328):
          the call is raised from the Ownership Transfer when the dealer sells
          the machine. Said in place of the button, so nobody hunts for it. */}
      {kind === 'sale' && isDealerType(draft.party_type) && (
        <span className="muted" style={{ fontSize: 12 }}>{DEALER_NO_INSTALL}</span>
      )}
      {kind === 'sale' && !isDealerType(draft.party_type) && (
        needCalls.length > 0
          ? canRaiseInstall && <button className="btn btn-sm" disabled={saving} onClick={() => void raiseCalls()}
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
    </>
  ) : null;

  /* CONTRACTS ONLY, and only once the entry exists. A sale is not
     renewed — the warranty runs from the sale and that is the end of
     it; a contract is the thing with a next one. Offered on ANY
     contract rather than only an expiring one, because renewals are
     raised in advance and a register that hides the button until the
     cover has lapsed is asking people to work around it. */
  const canRenew = canEdit && kind === 'contract' && !!open?.id;
  const renewButton = canRenew ? (
    renewing
      ? <button className="btn" onClick={() => setRenewing(false)}
          title="Close the renewal without creating anything">✕ Cancel renewal</button>
      : <button className="btn" disabled={loadingItems}
          onClick={() => setRenewing(true)}
          title={loadingItems ? 'Waiting for this contract’s machines to load' : undefined}>
          {loadingItems ? 'Loading machines…' : '↻ Renew this contract'}
        </button>
  ) : null;
  // CONVERT TO CONTRACT: a saved sale, by whoever may create a contract.
  const canConvert = kind === 'sale' && !!open?.id && can('contract.edit.entries');
  const convertButton = canConvert ? (
    converting
      ? <button className="btn" onClick={() => setConverting(false)}
          title="Close without creating anything">✕ Cancel conversion</button>
      : <button className="btn" disabled={loadingItems} onClick={() => setConverting(true)}
          title={loadingItems ? 'Waiting for this sale’s machines to load' : 'Raise a contract from this warranty, carrying its customer and machines'}>
          {loadingItems ? 'Loading machines…' : '⇢ Convert to Contract'}
        </button>
  ) : null;
  const convertPanel = canConvert && converting && open ? (
    <ConvertPanel sale={draft} items={items}
      onCancel={() => setConverting(false)}
      onDone={(mc, n) => {
        setConverting(false);
        setOpen(null);
        setMsg({ tone: 'ok', text: `Contract ${mc} created with ${n} machine(s) from ${str(draft.sa_number)}. Opening the Contract Register…` });
        // TO THE NEW CONTRACT, already searched, so it is one click away.
        navigate('/contracts', { state: { search: mc, tab: 'entries' } });
      }} />
  ) : null;
  const renewPanel = canRenew && renewing ? (
    <RenewPanel
      header={draft}
      items={items}
      onDone={(mc) => {
        setRenewing(false);
        setOpen(null);
        setMsg({ tone: 'ok', text: `Contract ${mc} created, carrying its machines over. Open it to check the rates, or set any you left blank.` });
        void refresh();
      }}
    />
  ) : null;

  const machineList = open ? (
    <>
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
      {open.id && loadingItems && <div className="muted" style={{ marginBottom: 8 }}>Loading machines…</div>}
      {items.map((it, i) => (
        <ItemCard key={str(it.id) || `new-${i}`} cfg={cfg} kind={kind} item={it} header={draft} canEdit={canEdit} lines={lines}
          focus={focusId !== null && Number(it.id) === focusId}
          // A machine with no id is unsaved by definition and is counted
          // from `items`; only a SAVED machine's edit is tracked here.
          onDirtyChange={(d) => {
            const k = str(it.id);
            if (!k) return;
            if (d) dirtyCards.current.add(k); else dirtyCards.current.delete(k);
          }}
          onSaved={(r) => setItems((cur) => cur.map((x) => (x.id === r.id ? r : x)))}
          onDeleted={(id) => setItems((cur) => cur.filter((x) => x.id !== id))} />
      ))}
    </>
  ) : null;

  // THE ENTRY, AS A POP-UP. Every button sits in the bar at the top,
  // which does not scroll; the two halves below scroll each on their own, so
  // the details stay in view while the product list is worked down and the
  // reverse. It does NOT close on a click outside it: a window holding a form
  // that closes on a stray click is one that loses work.
  // THE RENEWAL OR THE CONVERSION OPENS A THIRD COLUMN (the user, 2026-10-02:
  // "Initiate with 2 Screens, but when I click Renew Contract / Convert into
  // Contract -- Open this in the Third Column"). The entry and its products
  // stay in view beside it, so the machines being carried over can be read
  // against the panel ticking them.
  const sidePanel = renewPanel ?? convertPanel;
  const entryPopup = open ? (
    <div className="cover-pop-overlay" role="dialog" aria-modal="true">
      <div className={`cover-pop${sidePanel ? ' cover-pop-wide' : ''}`}>
        <div className="cover-pop-bar">
          {entryTitle}
          {entryDirty && <span className="badge badge-warning" title="Press Save entry to keep it">Unsaved</span>}
          <div className="spacer" />
          {entryButtons}
          {renewButton}
          {convertButton}
          {machineButtons}
          <button className="btn btn-sm" onClick={closeEntry} title="Close this entry">✕ Close</button>
        </div>
        {msg && (
          <div className={`sheet-banner sheet-banner-${msg.tone}`} style={{ margin: '8px 14px 0' }}>
            <span>{msg.text}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
          </div>
        )}
        <div className={`cover-pop-body${sidePanel ? ' cover-pop-body-3' : ''}`}>
          <div className="cover-pop-col">
            <div className="cover-pop-col-head">{cfg.keyLabel} details</div>
            {/* WHAT THIS DEVICE HOLDS, as on Call Request (the user,
                2026-10-02). Party Name searches the copy on the device first --
                the machine register for a contract, the Party Master for a
                sale -- both downloaded at sign-in by Layout and refreshed every
                six hours; this line says how old that copy is. */}
            <MachineRegisterNote />
            {entryNote}
            {partyNotice}
            {entryFields}
          </div>
          <div className="cover-pop-col" ref={productsRef}>
            <div className="cover-pop-col-head">Products ({items.length})</div>
            {machineList}
          </div>
          {sidePanel && (
            <div className="cover-pop-col cover-pop-col-side">
              {sidePanel}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  // ===========================================================================
  // EXPORT: THE SAME COLUMNS AS THE TABLE, TWO FILES.
  //
  // The user, 2026-10-02: "During Export, it has to be a Excel Compatible Date
  // Field". A CSV can carry only text, so its dates are dd-MMM-yyyy STRINGS,
  // and whether Excel turns those back into dates on opening depends on the
  // reader's regional settings. The .xlsx carries each date as a serial plus a
  // date format (xlsxCell) -- a real date, sortable and filterable by month --
  // and leaves a code or a serial as text.
  //
  // ONE SOURCE FOR BOTH FILES. A column drawn by `render` and stored nowhere
  // (the entry's State) used to export EMPTY, because the CSV read the row's
  // key and the row has no such key. It is worked out here, the way the table
  // works it out, so a file and the screen say the same thing.
  // ===========================================================================
  const exportValue = (r: Row, key: string): unknown => {
    if (key === 'status_now') return stateOf(str(r[cfg.endColumn]));
    if (key === 'overridden') return Array.isArray(r.overridden) ? r.overridden.join(', ') : '';
    if (key === 'install_pending') return installPending(r) ? 'Pending' : isCallNumber(r.inst_call) ? str(r.inst_call) : '';
    return r[key];
  };
  const exportCols = (cols: Column<Row>[]) =>
    cols.filter((c) => !c.key.startsWith('_')).map((c) => ({ key: c.key, header: c.header }));
  const exportCsv = (name: string, cols: Column<Row>[], data: Row[], more: boolean) => {
    const ec = exportCols(cols);
    csvExport(`${name}.csv`, ec,
      data.map((r) => Object.fromEntries(ec.map((c) => [c.key, exportValue(r, c.key)]))), partial(more));
  };
  const exportXlsx = (name: string, sheet: string, cols: Column<Row>[], data: Row[], more: boolean) => {
    const ec = exportCols(cols);
    xlsxDownload(`${name}.xlsx`, [{
      name: sheet,
      columns: ec.map((c) => c.header),
      rows: data.map((r) => Object.fromEntries(ec.map((c) => [c.header, xlsxCell(exportValue(r, c.key))]))),
    }], partial(more));
  };

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
          rowsBeforeScroll={16}
          dense
          onRowClick={(r) => void openEntry(r)}
          moreAvailable={feeds.entries.more}
          emptyText={busy ? 'Loading…' : 'No entries match.'}
          toolbar={
            <Toolbar>
              <SearchBox value={q} onChange={setQ} placeholder={`${cfg.keyLabel} or party…`} />
              <div className="spacer" />
              {canEdit && (
                <button className="btn btn-sm btn-primary" onClick={() => void newEntry()}>+ New entry</button>
              )}
              {rows.length > 0 && (
                <>
                  <button className="btn btn-sm" onClick={() => exportXlsx(`${kind}-entries`, 'Entries', headerColumns, rows, feeds.entries.more)}
                    title="Dates arrive as Excel dates">⭳ Export Excel</button>
                  <button className="btn btn-sm" onClick={() => exportCsv(`${kind}-entries`, headerColumns, rows, feeds.entries.more)}>⭳ Export CSV</button>
                </>
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
        countMore={feed.more}
        // LOAD MORE SITS BESIDE THE COUNT, as on Field Calls and Spare
        // Requests (the user, 2026-10-02: "Move Load More to Top like all other
        // Pages"). The tables keep their "+" and lose the button, so there is
        // one of them; it loads the open tab, as the footer button did.
        onLoadMore={loadMore}
        loadingMore={busy} />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <button className={`btn btn-sm ${tab === 'entries' ? 'btn-primary' : ''}`} onClick={() => setTab('entries')}>Entries</button>
        <button className={`btn btn-sm ${tab === 'machines' ? 'btn-primary' : ''}`} onClick={() => setTab('machines')}>Register</button>
      </div>

      {/* THE SAME FILTER ON THE ENTRIES TAB: sales with at least one machine
          still waiting for its installation call. */}
      {tab === 'entries' && kind === 'sale' && (
        <div className="pc-summary">
          <button className={`pc-tile ${pendingInstall ? 'pc-tile-on' : ''}`} onClick={() => setPendingInstall((v) => !v)}
            title="Sales with at least one machine whose INST Call holds no call number">
            <span className="pc-tile-n" title={pendingSalesCount == null ? 'Not counted yet — press ↻ Refresh' : ''}>
              {pendingSalesCount == null ? '—' : pendingSalesCount.toLocaleString()}
            </span>
            <span className="badge badge-warning">SALES WITH INSTALL CALLS PENDING</span>
          </button>
        </div>
      )}

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
          {/* INSTALLATION CALL PENDING -- Warranty only: a machine reaches a
              contract already installed. A filter like the state tiles, and
              it combines with them and with the search. */}
          {kind === 'sale' && (
            <button className={`pc-tile ${pendingInstall ? 'pc-tile-on' : ''}`} onClick={() => setPendingInstall((v) => !v)}
              title="Machines with a product and a serial whose INST Call holds no call number">
              <span className="pc-tile-n" title={pendingCount == null ? 'Not counted yet — press ↻ Refresh' : ''}>
                {pendingCount == null ? '—' : pendingCount.toLocaleString()}
              </span>
              <span className="badge badge-warning">INSTALL CALL PENDING</span>
            </button>
          )}
        </div>
      )}

      {tab === 'entries' ? (
        entriesTable
      ) : (
        <DataTable<Row>
          columns={machineColumns}
          rows={machines}
          getRowId={(r) => str(r.uid ?? r.id)}
          storageKey={`cover-${kind}-machines`}
          rowsBeforeScroll={16}
          dense
          onRowClick={(r) => void openFromRegister(r)}
          moreAvailable={feeds.machines.more}
          emptyText={busy ? 'Loading…' : 'No machines match.'}
          toolbar={
            <Toolbar>
              <SearchBox value={q} onChange={setQ} placeholder="Serial, product, party…" />
              <div className="spacer" />
              {machines.length > 0 && (
                <>
                  <button className="btn btn-sm" onClick={() => exportXlsx(`${kind}-register`, 'Register', machineColumns, machines, feeds.machines.more)}
                    title="Dates arrive as Excel dates">⭳ Export Excel</button>
                  <button className="btn btn-sm" onClick={() => exportCsv(`${kind}-register`, machineColumns, machines, feeds.machines.more)}>⭳ Export CSV</button>
                </>
              )}
            </Toolbar>
          }
        />
      )}

      {entryPopup}
    </div>
  );
}

// The state a header is in, from its own end date (the machines under it can
// each differ — the Register tab is where that shows).
//
// ONE RULE, NOT A SECOND COPY OF IT. This used to carry its own arithmetic and
// its own threshold, which meant the ENTRIES tab and the MACHINES tab — the
// latter reading `cover_state()` through the view — could label the same
// contract differently the moment either number moved. It calls coverStatus
// now; the SQL is the same rule where a view can reach it (0187).
const stateOf = (end: string): string => coverStatus(end);

// PENDING = machinesNeedingInstallCall's rule for one line: a product and a
// serial, and no call number in INST Call. The server filter is the same rule.
const installPending = (r: Row): boolean =>
  isPinnedValue(r.product_name) && isPinnedValue(r.serial_number) && !isCallNumber(r.inst_call)
  // A DEALER'S MACHINE waits for no call of its own (0328): the transfer
  // raises the customer's.
  && !isDealerType(r.party_type);

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

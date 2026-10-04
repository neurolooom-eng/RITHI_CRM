// ===========================================================================
// The two cover registers, as the UI sees them.
//
// Each is a HEADER (the deal) with ITEMS under it (one machine each):
//
//   Sale Entry     SA…  →  sale_items       (Warranty Sale Details)
//   Contract Entry MC…  →  contract_items   (Contract Details)
//
// A field that belongs to the deal lives on the header. The same field on an
// item is an OVERRIDE: null means "follow the header", so editing the header
// moves every machine under it (0036_sales_contracts.sql). The screen shows an
// inheriting field as the header's value greyed out, and pins it the moment
// someone types into it.
// ===========================================================================
import { getSupabase, addCall } from './supabase';
import { dayAfter, addPeriod, todayLocal } from './dates';
import { nextInSeries, itemTaxAmount, totalAfterTax, periodToMonths, periodYears,
         inheritAllPatch, isPinnedValue, installCallFromSale, machinesNeedingInstallCall,
         coverStatus, contractPmVisits, periodEnd, withAnotherCustomer, TRANSFERRED_AWAY,
         DEALER_NO_INSTALL,
         type SaleForCall, type SaleItemForCall } from './coverspec';

export type CoverKind = 'sale' | 'contract';

export interface CoverField {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'select' | 'textarea' | 'bool';
  options?: string[];
  /** Options this form loads at run time rather than declaring here.
   *  `sellable-name` / `sellable-code` are the Product Master's ACTIVE lines —
   *  the user's rule (2026-09-14): an inactive line takes no NEW SALE ENTRY.
   *  Only the SALE carries these; a contract may name a retired line, because
   *  the machine it covers was sold when the line was current. */
  /**  `party` is the PARTY MASTER, searched on the server rather than
   *  downloaded: 5,873 customers is a few hundred KB before the field would
   *  work at all, and the same box on the call registers already searches.
   *  `product-party` is the PRODUCT DATABASE's customers -- whoever owns a
   *  machine on record (the user, 2026-10-02, for the Contract Register: a
   *  contract covers machines already installed, so its party is one that
   *  owns them). Picked from the list, never typed. */
  optionsFrom?: 'sellable-name' | 'sellable-code' | 'party' | 'product-party' | 'dealer';
  section: string;
  /** THE FORM DOES NOT ASK FOR THIS ONE — it is worked out, or it is stamped.
   *  Shown, and not typeable: a box somebody can type into is a box whose value
   *  they expect to keep, and the next keystroke elsewhere would overwrite it.
   *  `why` says what decides it, beside the field. */
  derived?: string;
  /** On an item: this field inherits from the header unless it is pinned. */
  inherits?: boolean;
  /** THE FORM REFUSES TO SAVE THE ENTRY WITHOUT IT. Checked by
   *  `missingRequired()` before the write, so the refusal names every blank
   *  field at once. Deliberately not a database rule: the registers are also
   *  loaded from the superseded system's exports, where these columns are
   *  often blank, and a NOT NULL would refuse that history. */
  required?: boolean;
  /** NOT SHOWN ON THE FORM, but still a column the entry may write -- the
   *  field list is also the save's whitelist (`writable` below), so removing a
   *  field would stop it being written at all. Set by the code instead: Prev
   *  MC Number is written by Renew this contract (the user, 2026-10-02:
   *  "Prev MC Number - Hide it -> Auto Populate this when I use the Renew
   *  Contract Button"). */
  hidden?: boolean;
  /** WORKED OUT ON THE SCREEN FROM THE REST OF THE ROW, never stored by the
   *  form -- for a value that depends on TODAY, which a stored copy would get
   *  wrong by tomorrow. Shown read-only in place of the stored column. */
  compute?: (row: Row) => string;
  /** A short line under the field, worked out from the row (e.g. the years a
   *  number of months comes to), for a value not worth a box of its own. */
  hint?: (row: Row) => string;
}

/** A contract's status in the user's words (2026-10-02): "Active" more than
 *  30 days before the end date, "About to Expire" within 30 days of it
 *  (the end date itself included), "Contract Expired" once today is past it.
 *  THE RULE IS coverStatus -- the one the register's tiles and the SQL's
 *  cover_state() use -- so the form cannot disagree with the list; only the
 *  words are this field's. No end date is no status, never "Active". */
export function contractStatusText(row: Row): string {
  const s = coverStatus(row.contract_end);
  return s === 'ACTIVE' ? 'Active'
    : s === 'ABOUT TO EXPIRE' ? 'About to Expire'
    : s === 'INACTIVE' ? 'Contract Expired'
    : '';
}

/** "= 2 years" under a period typed in months. */
export function yearsHint(row: Row, field: string): string {
  const y = periodYears(row[field]);
  if (y == null) return '';
  // 7 months is 0.58 years on screen, not 0.5833333333 -- the stored value
  // keeps its precision; only the reading is rounded.
  const r = Math.round(y * 100) / 100;
  return `= ${r} year${r === 1 ? '' : 's'}`;
}

/** The labels of the required header fields this row leaves blank. */
export function missingRequired(fields: CoverField[], row: Row): string[] {
  return fields
    .filter((f) => f.required && !f.derived && !f.hidden)
    .filter((f) => { const v = row[f.name]; return v == null || String(v).trim() === ''; })
    .map((f) => f.label);
}

export interface CoverConfig {
  kind: CoverKind;
  title: string;
  subtitle: string;
  icon: string;
  /** Header table, its key column, and the items table keyed to it. */
  headerTable: 'sale_entries' | 'contract_entries';
  itemTable: 'sale_items' | 'contract_items';
  key: 'sa_number' | 'mc_number';
  keyLabel: string;
  /** The view that serves effective (inheritance-resolved) rows. */
  detailsView: 'warranty_sale_details' | 'contract_details';
  /** Column on the details view holding the cover state, and its end date. */
  stateColumn: string;
  endColumn: string;
  headerFields: CoverField[];
  itemFields: CoverField[];
}

export const SALE: CoverConfig = {
  kind: 'sale',
  title: 'Warranty Register',
  subtitle: 'Sale Entry and the machines sold under it, with the warranty each one carries',
  icon: '🛡️',
  headerTable: 'sale_entries',
  itemTable: 'sale_items',
  key: 'sa_number',
  keyLabel: 'SA Number',
  detailsView: 'warranty_sale_details',
  stateColumn: 'warranty_state',
  endColumn: 'warranty_end',
  headerFields: [
    { name: 'sa_number', label: 'SA Number', section: 'Sale' },
    // STAMPED WHEN THE ENTRY IS CREATED (0230 defaults it to now()), not typed.
    // The user, 2026-09-22: "Warranty Entry date - Automatic - Timestamp".
    { name: 'entry_at', label: 'Sale Entry Date', type: 'date', section: 'Sale',
      derived: 'stamped when the entry is created' },
    { name: 'party_name', label: 'Party Name', section: 'Sale', optionsFrom: 'party' },
    // THE DEALER (the user, 2026-10-03): only Party Master entries typed DEALER.
    { name: 'sold_through', label: 'Sold Through', section: 'Sale', optionsFrom: 'dealer' },
    { name: 'invoice_no', label: 'Invoice No', section: 'Sale' },
    { name: 'invoice_date', label: 'Invoice Date', type: 'date', section: 'Sale' },
    { name: 'party_type', label: 'Type', type: 'select', options: ['', 'CUSTOMER', 'DEALER'], section: 'Sale' },
    { name: 'profile', label: 'Profile', type: 'select', options: ['', 'PRIVATE', 'GOVERNMENT', 'DEALER', 'GENERAL'], section: 'Sale' },
    { name: 'warranty_start', label: 'Warranty Start Date', type: 'date', section: 'Warranty' },
    // THE PERIOD IS ENTERED IN MONTHS AND THE REST FOLLOWS (the user,
    // 2026-09-22). `deriveHeader` has computed all three from the start date
    // and the months since it was written; what changes here is that the form
    // stops inviting somebody to type over the answer.
    { name: 'warranty_end', label: 'Warranty End Date', type: 'date', section: 'Warranty',
      derived: 'Warranty Start + Period (months)' },
    { name: 'warranty_months', label: 'Warranty Period (in Months)', type: 'number', section: 'Warranty' },
    { name: 'warranty_years', label: 'Warranty Period (in Years)', type: 'number', section: 'Warranty',
      derived: 'the months above' },
    // TYPED, AND SUGGESTED FROM THE PERIOD (the user, 2026-09-22: "PM visit
    // should editable by the user. It varies based on PO"). It follows the
    // period until somebody changes it, and is theirs from then on -- what was
    // actually sold is on the purchase order, not in the standard offer.
    { name: 'pm_visits', label: 'PM Visits', type: 'number', section: 'Warranty' },
    { name: 'warranty_status', label: 'Warranty Status (as keyed)', section: 'Warranty' },
    { name: 'other_details', label: 'Other Details', type: 'textarea', section: 'Warranty' },
    { name: 'country', label: 'Country', section: 'Installation' },
    { name: 'state', label: 'State', section: 'Installation' },
    { name: 'city', label: 'City', section: 'Installation' },
    { name: 'engineer', label: 'Service Engineer - Initial', section: 'Installation' },
    { name: 'address', label: 'Address', type: 'textarea', section: 'Installation' },
    { name: 'pincode', label: 'Inst. Pincode', section: 'Installation' },
    { name: 'tel1', label: 'Tel 1', section: 'Installation' },
    { name: 'tel2', label: 'Tel 2', section: 'Installation' },
    { name: 'pan', label: 'PAN', section: 'Tax' },
    { name: 'gst', label: 'GST', section: 'Tax' },
    { name: 'tax', label: 'TAX', section: 'Tax' },
  ],
  itemFields: [
    // THE ONLY TWO FIELDS IN THE APPLICATION THAT REFUSE A RETIRED PRODUCT
    // LINE. A new sale may not name one (the user's rule, 2026-09-14); a
    // contract, a call, a visit, a spare and a feedback all may, because the
    // machine they are about was sold when the line was current.
    { name: 'product_code', label: 'Product Code', section: 'Machine', optionsFrom: 'sellable-code' },
    { name: 'product_name', label: 'Product Name', section: 'Machine', optionsFrom: 'sellable-name' },
    { name: 'serial_number', label: 'Serial Number', section: 'Machine' },
    { name: 'warranty_start', label: 'Warranty Start Date', type: 'date', section: 'Warranty', inherits: true },
    { name: 'warranty_end', label: 'Warranty End Date', type: 'date', section: 'Warranty', inherits: true },
    { name: 'warranty_years', label: 'Warranty Period (in Years)', type: 'number', section: 'Warranty', inherits: true },
    { name: 'warranty_months', label: 'Warranty Period (in Months)', type: 'number', section: 'Warranty', inherits: true },
    { name: 'pm_visits', label: 'PM Visits', type: 'number', section: 'Warranty', inherits: true },
    { name: 'warranty_status', label: 'Warranty Status', section: 'Warranty', inherits: true },
    { name: 'invoice_no', label: 'Invoice No', section: 'Sale', inherits: true },
    { name: 'invoice_date', label: 'Invoice Date', type: 'date', section: 'Sale', inherits: true },
    { name: 'sold_through', label: 'Sold Through', section: 'Sale', inherits: true, optionsFrom: 'dealer' },
    { name: 'other_details', label: 'Other Details', type: 'textarea', section: 'Sale', inherits: true },
    { name: 'state', label: 'State', section: 'Installation', inherits: true },
    { name: 'city', label: 'City', section: 'Installation', inherits: true },
    { name: 'engineer', label: 'Engineer', section: 'Installation', inherits: true },
    { name: 'accessories_included', label: 'Accessories Included?', type: 'bool', section: 'Supplied' },
    { name: 'consumable_included', label: 'Consumable Included?', type: 'bool', section: 'Supplied' },
    { name: 'contract_price_fixed', label: 'Contract Price Fixed?', type: 'bool', section: 'Supplied' },
    { name: 'already_sold_to', label: 'Already Sold To', section: 'Supplied' },
    { name: 'replacement_unit', label: 'Replacement Unit?', type: 'bool', section: 'Supplied' },
    { name: 'replacement_unit_sl', label: 'Replacement Unit Sl. No', section: 'Supplied' },
    { name: 'add_call', label: 'Add Call', section: 'Calls' },
    { name: 'inst_call', label: 'INST Call', section: 'Calls' },
    { name: 'added_by', label: 'Added By', section: 'Calls' },
  ],
};

export const CONTRACT: CoverConfig = {
  kind: 'contract',
  title: 'Contract Register',
  subtitle: 'Contract Entry (AMC / CMC) and the machines covered under it',
  icon: '📋',
  headerTable: 'contract_entries',
  itemTable: 'contract_items',
  key: 'mc_number',
  keyLabel: 'MC Number',
  detailsView: 'contract_details',
  stateColumn: 'contract_state',
  endColumn: 'contract_end',
  headerFields: [
    { name: 'mc_number', label: 'MC Number', section: 'Contract' },
    { name: 'entry_at', label: 'Contract Entry Date', type: 'date', section: 'Contract' },
    // FROM THE PRODUCT DATABASE, TYPE TO SEARCH (the user, 2026-10-02). A
    // contract covers machines already installed, so its customer is one who
    // owns them.
    { name: 'party_name', label: 'Party Name', section: 'Contract', optionsFrom: 'product-party' },
    { name: 'contract_type', label: 'Contract Type', type: 'select', options: ['', 'CMC', 'AMC'], section: 'Contract' },
    // HIDDEN, AND FILLED BY RENEW (renewContract sets it to the contract being
    // renewed). Still read by Machine History ("renewed from …") and still
    // loaded from the old system's exports.
    { name: 'prev_mc_number', label: 'Prev MC Number', section: 'Contract', hidden: true },
    // WORKED OUT FROM THE END DATE AND TODAY (the user, 2026-10-02), not typed.
    // The stored column keeps whatever the old system's export carried; the
    // form shows the computed status in its place and never writes it, since a
    // status stored today is wrong the day the 30-day line is crossed.
    { name: 'status', label: 'Status', section: 'Contract',
      derived: 'the Contract End Date and today', compute: contractStatusText },
    // THE PERIOD IS ENTERED IN MONTHS AND THE REST FOLLOWS, as on the
    // Warranty Register (the user, 2026-10-02: "Contract Start Date can
    // Default to Today, Contract Period (Months) is Mandatory. Contract Period
    // Years is Auto Calculated, Contract End Date is also Auto Calculate based
    // on the Contract Start Date + Period in Months"). `deriveHeader` already
    // computed both; the form now stops inviting anybody to type over them.
    { name: 'contract_start', label: 'Contract Start Date', type: 'date', section: 'Period' },
    { name: 'contract_months', label: 'Contract Period (Months)', type: 'number', section: 'Period', required: true,
      hint: (r) => yearsHint(r, 'contract_months') },
    // HIDDEN, AND STILL WRITTEN (the user, 2026-10-02: "hide this ... since it
    // is a Calculated Field"). `deriveHeader` keeps it equal to months / 12 and
    // the save writes it; the years show as a line under the months instead.
    { name: 'contract_years', label: 'Contract Period (Years)', type: 'number', section: 'Period',
      derived: 'the months', hidden: true },
    { name: 'contract_end', label: 'Contract End Date', type: 'date', section: 'Period',
      derived: 'Contract Start + Period (months)' },
    // Suggested from the period and still typeable (FRS-090), now required.
    { name: 'pm_visits_total', label: 'PM Visits (Total)', type: 'number', section: 'Period', required: true },
    // MONTHLY IS ON THE SHEET AND WAS MISSING HERE. ContractEntry_Schema col 5
    // lists Yearly / Half Yearly / Quarterly / Monthly; three of the four were
    // transcribed. The field takes no fallback, so a monthly contract could not
    // be keyed at all — and an import carrying "Monthly" would show a value the
    // form cannot re-select.
    { name: 'payment_schedule', label: 'Payment Schedule', type: 'select',
      options: ['', 'Yearly', 'Half Yearly', 'Quarterly', 'Monthly'], section: 'Billing', required: true },
    { name: 'bill_generate_at', label: 'Bill Generate At', type: 'select',
      options: ['', 'Beginning Of Period', 'End Of Period'], section: 'Billing', required: true },
  ],
  itemFields: [
    { name: 'product_code', label: 'Product Code', section: 'Machine' },
    { name: 'product_name', label: 'Product Name', section: 'Machine' },
    { name: 'serial_number', label: 'Serial Number', section: 'Machine' },
    { name: 'present_item_status', label: 'Present Item Status', section: 'Machine' },
    { name: 'contract_start', label: 'Contract Start Date', type: 'date', section: 'Period', inherits: true },
    { name: 'contract_end', label: 'Contract End Date', type: 'date', section: 'Period', inherits: true },
    { name: 'contract_type', label: 'Contract Type', section: 'Period', inherits: true },
    { name: 'contract_years', label: 'Contract Period (Years)', type: 'number', section: 'Period', inherits: true },
    { name: 'contract_months', label: 'Contract Period (Months)', type: 'number', section: 'Period', inherits: true },
    { name: 'pm_visits_total', label: 'PM Visits (Total)', type: 'number', section: 'Period', inherits: true },
    { name: 'status', label: 'Status', section: 'Period', inherits: true },
    { name: 'party_name', label: 'Party Name', section: 'Period', inherits: true },
    { name: 'payment_schedule', label: 'Payment Schedule', section: 'Billing', inherits: true },
    { name: 'bill_generate_at', label: 'Bill Generate At', section: 'Billing', inherits: true },
    { name: 'rate', label: 'Rate', type: 'number', section: 'Billing' },
    { name: 'item_tax_amount', label: 'Item Tax Amount', type: 'number', section: 'Billing' },
    { name: 'total_after_tax', label: 'Total After Tax', type: 'number', section: 'Billing' },
    { name: 'sa_number', label: 'SA Number (sale)', section: 'History' },
    { name: 'sa_end_date', label: 'SA End Date', type: 'date', section: 'History' },
    { name: 'last_contract_number', label: 'Last Contract Number', section: 'History' },
    { name: 'last_contract_end', label: 'Last Contract End', type: 'date', section: 'History' },
    { name: 'added_by', label: 'Added By', section: 'History' },
  ],
};

export const configFor = (kind: CoverKind): CoverConfig => (kind === 'sale' ? SALE : CONTRACT);

export type Row = Record<string, unknown>;

function client() {
  const c = getSupabase();
  if (!c) throw new Error('Not connected to the database (Settings → Database connection).');
  return c;
}
// AN ERROR BANNER WITH NO TEXT IN IT IS WORSE THAN NO BANNER — it says
// something went wrong and refuses to say what, and the reader cannot even tell
// whether it is about the thing they just did. `?? ` only catches null and
// undefined, so a PostgREST error carrying an EMPTY message went straight
// through and painted a blank red bar across the register (seen 2026-09-23).
// `||` catches the empty string too, and the code is kept where there is one:
// "42501" and "57014" are the two that tell somebody what to do next.
const err = (e: { message?: string; code?: string; details?: string; hint?: string } | null) => {
  const parts = [e?.message, e?.details, e?.hint].map((x) => String(x ?? '').trim()).filter(Boolean);
  const text = parts.join(' — ') || 'The database refused the request and gave no reason.';
  return new Error(e?.code ? `${text} (${e.code})` : text);
};
const like = (t: string) => `%${t.replace(/[%,()]/g, ' ').trim()}%`;

export interface HeaderFilter { q?: string; party?: string; number?: string; state?: string; pendingInstall?: boolean }

// PENDING INSTALLATION CALLS PER SALE (the user, 2026-10-02: "Add the pending
// count to the Entries tab as well"). The Register tab's rule
// (pendingInstall) applied to a sale's own lines, as a FILTERED EMBEDDED
// COUNT -- PostgREST counts only the lines the filters on that alias pass --
// and, for the filter, an inner-joined embed of the same lines limited to one,
// which drops a sale with none. Both shapes were run against PostgREST 12
// before shipping: counts 2 / 0 / 1 on three fixture sales, and the filter
// returning exactly the two with pending machines.
const UCN_RE_SQL = '^[0-9]{2}[A-La-l][0-9]{2}[A-Za-z][0-9]{4}$';
type Filterable = { neq: (c: string, v: string) => Filterable; or: (f: string, o: { referencedTable: string }) => Filterable };
function pendingLines<T>(q: T, alias: string): T {
  const b = q as unknown as Filterable;
  return b.neq(`${alias}.product_name`, '').neq(`${alias}.serial_number`, '')
    .or(`inst_call.is.null,inst_call.not.imatch."${UCN_RE_SQL}"`, { referencedTable: alias }) as unknown as T;
}

/** Headers, newest first, with the machine count on each -- and, on a sale,
 *  how many of its machines still wait for an installation call. */
export async function listHeaders(kind: CoverKind, f: HeaderFilter, offset = 0, limit = 200): Promise<Row[]> {
  const cfg = configFor(kind);
  const sale = kind === 'sale';
  const dealers = sale ? await dealerParties() : new Set<string>();
  const embeds = [`items:${cfg.itemTable}(count)`,
    ...(sale ? [`pending:${cfg.itemTable}(count)`] : []),
    ...(sale && f.pendingInstall ? [`has_pending:${cfg.itemTable}!inner(id)`] : [])];
  let q = client().from(cfg.headerTable)
    .select(`*, ${embeds.join(', ')}`)
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  if (sale) q = pendingLines(q, 'pending');
  if (sale && f.pendingInstall) q = pendingLines(q, 'has_pending').limit(1, { referencedTable: 'has_pending' });
  if (f.number) q = q.ilike(cfg.key, like(f.number));
  if (f.party) q = q.ilike('party_name', like(f.party));
  // ONE `or` PARAMETER: the search and, when filtering pending, "not a dealer"
  // (0328) as one logic tree -- two separate `or`s are not a combination
  // PostgREST documents.
  const ors = [f.q ? `or(${cfg.key}.ilike.${like(f.q)},party_name.ilike.${like(f.q)})` : '',
               sale && f.pendingInstall ? notDealer(dealers) : ''].filter(Boolean);
  if (ors.length) q = q.or(`and(${ors.join(',')})`);
  const { data, error } = await q;
  if (error) throw err(error);
  return (data ?? []).map((r) => {
    const { items, pending, has_pending: _hp, ...rest } = r as unknown as Row & { items?: { count: number }[]; pending?: { count: number }[]; has_pending?: unknown };
    return { ...rest, item_count: items?.[0]?.count ?? 0,
             // A dealer's sale waits for no call of its own (0328).
             ...(sale ? { pending_install: isDealerParty(rest.party_name, dealers) ? 0 : pending?.[0]?.count ?? 0 } : {}) };
  });
}

/** How many sales have at least one machine waiting for an installation call. */
export async function countPendingSales(f: { q?: string }): Promise<number> {
  const cfg = configFor('sale');
  let q = client().from(cfg.headerTable)
    .select(`id, has_pending:${cfg.itemTable}!inner(id)`, { count: 'exact', head: true });
  q = pendingLines(q, 'has_pending');
  // One `or`: the search and "not a dealer" (0328), as listHeaders does.
  const dealers = await dealerParties();
  const ors = [f.q ? `or(${cfg.key}.ilike.${like(f.q)},party_name.ilike.${like(f.q)})` : '', notDealer(dealers)].filter(Boolean);
  q = q.or(`and(${ors.join(',')})`);
  const { count, error } = await q;
  if (error) throw err(error);
  return count ?? 0;
}

/** ONE entry by its number, in the shape `listHeaders` returns it -- so an
 *  entry opened from a Register line is the same object as one opened from
 *  the Entries tab, and the window's "unsaved" test compares like with like.
 *  Null when no such entry exists (a line whose header was never imported). */
export async function getHeader(kind: CoverKind, key: string): Promise<Row | null> {
  const cfg = configFor(kind);
  if (!key.trim()) return null;
  const { data, error } = await client().from(cfg.headerTable)
    .select(`*, items:${cfg.itemTable}(count)`)
    .eq(cfg.key, key).limit(1).maybeSingle();
  if (error) throw err(error);
  if (!data) return null;
  const items = (data as Row).items as { count: number }[] | undefined;
  return { ...(data as Row), item_count: items?.[0]?.count ?? 0 };
}

/** The number to offer for a new entry.
 *
 *  Reads the most recent 500 numbers and continues the series from the highest
 *  (src/lib/coverspec.ts). Ordered by `id`, not by the number: `SA999` sorts
 *  after `SA1200` as TEXT, so asking the database for the "largest" number
 *  would answer with the wrong one as soon as the series passed 999. Numbers
 *  are issued in order, so the newest rows carry the highest.
 *
 *  It is an OFFER, not a reservation. Two people starting an entry at the same
 *  moment are offered the same number and the second is refused on save by the
 *  unique key — which is the honest failure: a number handed out and then not
 *  used leaves a gap in a series somebody audits. */
export async function nextCoverNumber(kind: CoverKind): Promise<string> {
  const cfg = configFor(kind);
  const { data, error } = await client().from(cfg.headerTable)
    .select(cfg.key).order('id', { ascending: false }).limit(500);
  if (error) throw err(error);
  return nextInSeries(kind, (data ?? []).map((r) => String((r as Row)[cfg.key] ?? '')));
}

/** The raw items under one header — raw, so an override is visible as such. */
export async function listItems(kind: CoverKind, key: string): Promise<Row[]> {
  const cfg = configFor(kind);
  const { data, error } = await client().from(cfg.itemTable).select('*').eq(cfg.key, key).order('id');
  if (error) throw err(error);
  return data ?? [];
}

/** Machines, cover resolved — the register's "by machine" view. */
// PENDING INSTALLATION CALL (the user, 2026-10-02: "In Warranty, add an
// Identifier [Should be Filterable as well] for Pending Installation Call
// Generation"). The rule is machinesNeedingInstallCall's: a machine -- a
// product AND a serial -- whose INST Call holds no call number. "No call
// number" is the UCN shape (isCallNumber / is_call_number()) NOT matching, or
// nothing there at all: the AppSheet "To Check" is pending, not done.
//
// ON THE SERVER, because the register is paged: a filter over the rows loaded
// so far would answer "pending among the first 2,000", which reads as all.
const UCN_PATTERN = '^[0-9]{2}[A-La-l][0-9]{2}[A-Za-z][0-9]{4}$';
// A DEALER'S MACHINE IS NEVER "PENDING" (0328): it gets no installation call
// of its own -- the transfer raises the customer's.
//
// WHO IS A DEALER IS THE PARTY MASTER'S ANSWER (D-151, the user's decision of
// 2026-10-04: "Party Master decides"), the one party_is_dealer() gives the
// database -- NOT the sale's own Type, which is copied when the sale is entered
// and never updated. The dealers are read once per page load (a few names)
// and the pending filters exclude them by party name, ignoring case.
let dealerCache: Promise<Set<string>> | null = null;
export function dealerParties(): Promise<Set<string>> {
  if (!dealerCache) {
    dealerCache = (async () => {
      const { data, error } = await client().from('parties').select('party_name, party_type')
        .ilike('party_type', '%dealer%').order('party_name').limit(1000);
      if (error) { dealerCache = null; throw err(error); }
      return new Set((data ?? [])
        .filter((r) => String((r as Row).party_type ?? '').trim().toUpperCase() === 'DEALER')
        .map((r) => String((r as Row).party_name ?? '').trim().toLowerCase()).filter(Boolean));
    })();
  }
  return dealerCache;
}
export const isDealerParty = (name: unknown, dealers: Set<string>): boolean =>
  dealers.has(String(name ?? '').trim().toLowerCase());
// "Not a dealer" for a PostgREST filter: no party, or none of the dealers'
// names (ilike with no wildcard is an equality that ignores case; %, _ and \
// in a name are escaped, and the value quoted).
const notDealer = (dealers: Set<string>): string => {
  if (!dealers.size) return '';
  const q = (n: string) => `"${n.replace(/[\\%_]/g, (m) => `\\${m}`).replace(/["\\]/g, (m) => `\\${m}`)}"`;
  return `or(party_name.is.null,and(${[...dealers].map((n) => `party_name.not.ilike.${q(n)}`).join(',')}))`;
};
const pendingInstall = (dealers: Set<string>): string =>
  `and(product_name.neq.,serial_number.neq.,or(inst_call.is.null,inst_call.not.imatch."${UCN_PATTERN}")${notDealer(dealers) ? `,${notDealer(dealers)}` : ''})`;
const searchExpr = (cfg: CoverConfig, text: string) => {
  const t = like(text);
  return `serial_number.ilike.${t},product_name.ilike.${t},party_name.ilike.${t},${cfg.key}.ilike.${t}`;
};
/** The search box and the pending filter as ONE logic tree: two separate
 *  `or` parameters are not a combination PostgREST documents, a nested
 *  and(or(...), ...) is. */
const machineFilter = (cfg: CoverConfig, f: { q?: string; pendingInstall?: boolean }, dealers: Set<string>): string | null => {
  const parts = [f.q ? `or(${searchExpr(cfg, f.q)})` : '', f.pendingInstall && cfg.kind === 'sale' ? pendingInstall(dealers) : '']
    .filter(Boolean);
  return parts.length ? `and(${parts.join(',')})` : null;
};

export async function listMachines(
  kind: CoverKind, f: { q?: string; state?: string; pendingInstall?: boolean }, offset = 0, limit = 500,
): Promise<Row[]> {
  const cfg = configFor(kind);
  let q = client().from(cfg.detailsView).select('*')
    .order(cfg.endColumn, { ascending: false, nullsFirst: false })
    // A TIEBREAKER (D-103): an import gives many machines one end date, and
    // without a unique last key a page boundary can put a machine on two pages
    // and another on none while the count looks complete.
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  const tree = machineFilter(cfg, f, f.pendingInstall && cfg.kind === 'sale' ? await dealerParties() : new Set<string>());
  if (tree) q = q.or(tree);
  if (f.state) q = q.eq(cfg.stateColumn, f.state);
  const { data, error } = await q;
  if (error) throw err(error);
  return data ?? [];
}

export async function countMachines(
  kind: CoverKind, state: string, f: { q?: string; pendingInstall?: boolean },
): Promise<number> {
  const cfg = configFor(kind);
  let q = client().from(cfg.detailsView).select('id', { count: 'exact', head: true });
  if (state) q = q.eq(cfg.stateColumn, state);
  const tree = machineFilter(cfg, f, f.pendingInstall && cfg.kind === 'sale' ? await dealerParties() : new Set<string>());
  if (tree) q = q.or(tree);
  const { count, error } = await q;
  if (error) throw err(error);
  return count ?? 0;
}

/** The writable fields of `row` whose value differs from `loaded` — what an
 *  UPDATE of an entry sends (D-106).
 *
 *  ONLY WHAT THIS SCREEN CHANGED. Sending the whole draft put back every field
 *  somebody else had changed since this screen loaded the entry — a colleague's
 *  corrected invoice number reverted by a typo fix to the address, with no
 *  warning to either of them. Nothing else has to travel: the row is addressed
 *  by `id`, the database stamps its own columns, and a BEFORE trigger sees the
 *  whole merged row whichever columns the statement named. A value derived on
 *  the screen (an end date from a period) differs from the loaded one exactly
 *  when its driver changed, so it goes with the field that moved it.
 *
 *  null, undefined and absent are the same value here: the form writes null
 *  for a cleared box, and the loaded row may simply not carry the key. */
export function headerChanges(kind: CoverKind, row: Row, loaded: Row): Row {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const writable = onlyWritable(row, writableFor(configFor(kind), 'header'));
  return Object.fromEntries(Object.entries(writable).filter(([k, v]) => !same(v, loaded[k])));
}

/** Save an entry. `loaded` is the entry as this screen READ it: given on an
 *  update, only the fields that differ from it are written (headerChanges,
 *  D-106). Without it — the renewal and the conversion, which only ever
 *  INSERT — the whole whitelisted row is sent, as before. */
export async function saveHeader(kind: CoverKind, row: Row, loaded?: Row): Promise<Row> {
  const cfg = configFor(kind);
  // The same whitelist as saveItem. It used to name the two fields to DROP
  // (item_count, items) — which worked until a third arrived, and a derived
  // value with no column behind it loses the whole save rather than itself.
  const { id, ...all } = row as Row & { id?: number };
  const rest = id && loaded ? headerChanges(kind, all, loaded) : onlyWritable(all, writableFor(cfg, 'header'));
  const c = client();
  // NOTHING CHANGED IS NOT AN EMPTY UPDATE: the entry is read back instead, so
  // the caller still gets the row as the database holds it.
  if (id && !Object.keys(rest).length) {
    const { data, error } = await c.from(cfg.headerTable).select().eq('id', id).single();
    if (error) throw err(error);
    return data as Row;
  }
  const { data, error } = id
    ? await c.from(cfg.headerTable).update(rest).eq('id', id).select().single()
    : await c.from(cfg.headerTable).insert(rest).select().single();
  if (error) throw err(error);
  return data as Row;
}

/** Only the columns this register DECLARES, plus the key that links a machine
 *  to its entry.
 *
 *  A WHITELIST, not a strip, and the reason is a fault this codebase has now
 *  shipped twice: a value derived for the screen (or read from a view) that has
 *  no column behind it makes PostgREST refuse the WHOLE row — "could not find
 *  the column in the schema cache" — so one stray key loses the entire save,
 *  not just itself. A blacklist works until the next such value is added and
 *  nobody remembers to list it.
 *
 *  Built from the field definitions, so a column added to a form is writable by
 *  that fact alone and cannot be forgotten here. `uid` is deliberately absent:
 *  the database fills it (cover_item_uid), and a client that sent its own would
 *  be inventing a key. */
const writableFor = (cfg: ReturnType<typeof configFor>, part: 'header' | 'item'): Set<string> =>
  new Set([...(part === 'header' ? cfg.headerFields : cfg.itemFields).map((f) => f.name), cfg.key, 'extra']);

const onlyWritable = (row: Row, allow: Set<string>): Row =>
  Object.fromEntries(Object.entries(row).filter(([k]) => allow.has(k)));

export async function saveItem(kind: CoverKind, key: string, row: Row): Promise<Row> {
  const cfg = configFor(kind);
  const { id, ...all } = row as Row & { id?: number };
  const rest = onlyWritable(all, writableFor(cfg, 'item'));
  const c = client();
  const { data, error } = id
    ? await c.from(cfg.itemTable).update(rest).eq('id', id).select().single()
    : await c.from(cfg.itemTable).insert({ ...rest, [cfg.key]: key }).select().single();
  if (error) throw err(error);
  return data as Row;
}

/** The entry's machine list once `before` has been saved as `saved` (D-099).
 *
 *  BY THE LINE, NOT BY ITS ID. A machine added with + Add machine has no id
 *  until it is saved, so matching on the id never found it: the saved row
 *  never replaced the line, the card went on offering Save machine (a second
 *  press failed on sale_items_uid_key), ✕ Close warned of an unsaved machine
 *  and the installation-call count left it out. The line is the object the
 *  card was given; the id is the fallback for a list re-read meanwhile, and a
 *  machine found by neither is added rather than lost. */
export function withSavedMachine(cur: Row[], before: Row, saved: Row): Row[] {
  const hasId = (r: Row) => r.id != null && r.id !== '';
  let i = cur.indexOf(before);
  if (i < 0 && hasId(before)) i = cur.findIndex((x) => x.id === before.id);
  if (i < 0 && hasId(saved)) i = cur.findIndex((x) => x.id === saved.id);
  return i < 0 ? [...cur, saved] : cur.map((x, j) => (j === i ? saved : x));
}

/** The entry's machines after a RE-READ, keeping every line not yet saved
 *  (D-099 follow-up). Save entry re-reads the machines because every one
 *  that inherits from the header moved — but a line added with + Add machine
 *  is not in the database until its own Save machine, so the re-read dropped
 *  it, and with it whatever had been typed into its card, without a word.
 *  The re-read rows, then each unsaved line still on screen, in its order and
 *  as the SAME object, so its card keeps what was typed. */
export function keepUnsavedMachines(fresh: Row[], cur: Row[]): Row[] {
  const unsaved = cur.filter((r) => r.id == null || r.id === '');
  return unsaved.length ? [...fresh, ...unsaved] : fresh;
}

export async function deleteItem(kind: CoverKind, id: number): Promise<void> {
  const { error } = await client().from(configFor(kind).itemTable).delete().eq('id', id);
  if (error) throw err(error);
}

export async function deleteHeader(kind: CoverKind, id: number): Promise<void> {
  const { error } = await client().from(configFor(kind).headerTable).delete().eq('id', id);
  if (error) throw err(error);
}

/**
 * After a bulk import: fold the copied-down values back into inheritance, then
 * bring the machine master's cover up to date. Both are idempotent.
 */
export async function finishCoverImport(): Promise<{ unpinned: number; machines: number }> {
  const c = client();
  const a = await c.rpc('cover_unpin_inherited');
  if (a.error) throw err(a.error);
  const b = await c.rpc('refresh_product_cover');
  if (b.error) throw err(b.error);
  return { unpinned: Number(a.data ?? 0), machines: Number(b.data ?? 0) };
}

/**
 * FORCE UPDATE CHILD RECORDS — put every machine back onto its entry.
 *
 * The user, 2026-09-22. Clears every INHERITING field on every machine of this
 * entry in one statement, so each one follows the entry again. What it will
 * clear is counted and shown first (`summarisePinned`); there is no undo, and a
 * pinned value that genuinely differs from the entry is somebody's decision
 * about one machine.
 *
 * ONE STATEMENT, NOT ONE PER MACHINE: a sale with forty machines would
 * otherwise be forty round trips, any of which can fail half way and leave the
 * entry half-inherited — which is the state this is meant to resolve.
 *
 * It does not touch a field the register does not declare as inheriting: the
 * product, the serial and the machine's own supplied-with answers are ITS
 * facts, not the entry's, and clearing them would delete the machine's
 * identity.
 */
export async function forceInherit(kind: CoverKind, key: string): Promise<number> {
  const cfg = configFor(kind);
  const patch = inheritAllPatch(cfg.itemFields);
  const { data, error } = await client()
    .from(cfg.itemTable).update(patch).eq(cfg.key, key).select('id');
  if (error) throw err(error);
  return (data ?? []).length;
}

/**
 * RAISE THE INSTALLATION CALLS FOR A SALE ENTRY.
 *
 * One call per machine that has not got one, and the call's UCN is written
 * straight back onto that machine's line (`inst_call`) — the mapping the user
 * asked for, keyed on the line itself, which is Product + Serial.
 *
 * ONE MACHINE AT A TIME, AND A FAILURE STOPS RATHER THAN CONTINUING. The two
 * writes per machine are not one transaction — the call is inserted through the
 * `calls` view and the mapping is an update on `sale_items` — so a machine
 * whose call was created and whose mapping failed would be offered a SECOND
 * call on the next press. Stopping leaves exactly one machine in that state and
 * names it, which somebody can see and fix; carrying on hides it among the
 * successes.
 */
export async function raiseInstallCalls(
  header: Row, items: Row[], onProgress?: (done: number, total: number) => void,
): Promise<{ created: { serial: string; ucn: string }[]; error?: string }> {
  // A DEALER GETS NO INSTALLATION CALL (the user, 2026-10-03; 0328 refuses it
  // in the database too): the call is raised from the Ownership Transfer when
  // the dealer sells the machine.
  if (isDealerParty(header.party_name, await dealerParties())) return { created: [], error: DEALER_NO_INSTALL };
  const todo = machinesNeedingInstallCall(items as SaleItemForCall[]) as Row[];
  const created: { serial: string; ucn: string }[] = [];
  for (const it of todo) {
    onProgress?.(created.length, todo.length);
    const r = await addCall(installCallFromSale(header as SaleForCall, it as SaleItemForCall));
    if (!r.ok) return { created, error: `${str(it.serial_number)}: ${r.error ?? 'the call was refused'}` };
    const ucn = str(r.ucn);
    if (!ucn) {
      return { created, error: `${str(it.serial_number)}: the call was created but its UCN came back empty, so it could not be mapped to the machine. Find it on the Installation Call register.` };
    }
    // THROUGH `link_install_call`, NOT AN UPDATE ON THE LINE (0258, finding
    // 31). The call is gated on `install.create` and a direct write to this
    // line on `cover.edit`, and Hotline holds the first without the second:
    // the UPDATE matched NO rows, PostgREST reported success, and the button
    // came back offering a SECOND call for the same machine. The function
    // writes INST Call and nothing else, for either permission, and REFUSES
    // (an error, never zero rows) when it cannot: a call number already there,
    // or a call that is not this machine's installation.
    const { error } = await client().rpc('link_install_call', { p_item_id: Number(it.id), p_ucn: ucn });
    if (error) {
      return { created, error: `${str(it.serial_number)}: call ${ucn} was created but could not be written back to the machine — ${error.message}. Do not raise another: ask somebody who can edit the warranty register to put ${ucn} in INST Call.` };
    }
    created.push({ serial: str(it.serial_number), ucn });
  }
  onProgress?.(created.length, todo.length);
  return { created };
}

/** The value an item shows for a field: its own if pinned, else the header's. */
export const effective = (item: Row, header: Row, field: string): unknown =>
  item[field] === null || item[field] === undefined || item[field] === '' ? header[field] : item[field];

// ONE COPY OF THE RULE, in coverspec.ts, because `summarisePinned` counts what
// Force Update Child Records is about to clear and the two must agree about
// what "pinned" means or the screen promises one thing and the write does
// another.
export const isPinned = (item: Row, field: string): boolean => isPinnedValue(item[field]);

// ===========================================================================
// RENEWING A CONTRACT — raising the next MC from an expiring one.
//
// The last open piece of the Warranty/Contract work (docs/BACKLOG.md: "the
// AMC/CMC renewal flow (raising the next MC from an expiring one)"), and the
// data model was built for it from the start: the header carries
// `prev_mc_number` and every item carries `last_contract_number` /
// `last_contract_end`. Nothing here needs a migration — the columns are already
// there, unused.
//
// WHAT IT COPIES AND WHAT IT DELIBERATELY DOES NOT.
//
// Copied: the machines, the contract type, the party, the period, the PM visit
// count and the billing schedule. Those are what makes it the SAME contract
// continuing.
//
// NOT copied: the MONEY. Rate, tax and total are left blank on every machine.
// A renewal is re-priced, and a figure carried forward silently is a price
// nobody agreed that looks exactly like one they did — the kind of number that
// reaches an invoice because it was already in the box. Blank asks a question;
// a stale rate answers it wrongly.
//
// NOT copied either: `status`, which is the imported "as keyed" text of the old
// contract and says nothing about the new one.
//
// THE DATES CONTINUE RATHER THAN RESTART: the new contract starts the day AFTER
// the old one ends, so cover has no gap and no overlap — `machine_cover` answers
// "what is this serial under today?" and two contracts covering one day would
// make that ambiguous.
// ===========================================================================

const str = (v: unknown) => (v == null ? '' : String(v));

export { dayAfter, addPeriod };

// ---------------------------------------------------------------------------
// A MACHINE ON AN ENTRY IS ITS PRODUCT AND ITS SERIAL (CW-001, D-105).
//
// Renew and Convert keyed their ticks, their rates and the transferred-machine
// check by the SERIAL alone, so two machines of different products sharing a
// number on one entry ticked together, priced together, and a transfer of one
// hid both. This is the database's own key — `machine_key`, generated as
// lower(btrim(product)) || '|' || lower(btrim(serial)) on the cover tables —
// written once here so the picker and the write agree with it and each other.
// (machine.ts's machineKey squashes punctuation too, which is right for
// MATCHING a typed model and would be wrong here: it is not the key the
// database stores, and two lines it merged would still write as two.)
// ---------------------------------------------------------------------------
export const coverMachineKey = (it: Row): string =>
  `${str(it.product_name).trim().toLowerCase()}|${str(it.serial_number).trim().toLowerCase()}`;
/** How a machine line is named in a message: its serial, then its product. */
export const coverMachineLabel = (it: Row): string =>
  [str(it.serial_number).trim(), str(it.product_name).trim()].filter(Boolean).join(' ');
/** The key of every machine on an entry that has a serial, once each. */
const machineKeysOf = (items: Row[]): string[] =>
  [...new Set(items.filter((i) => str(i.serial_number).trim()).map(coverMachineKey))];
/** The label for a key, from the entry's own lines (the key itself if none). */
const labelFor = (items: Row[], key: string): string => {
  const it = items.find((i) => coverMachineKey(i) === key);
  return it ? coverMachineLabel(it) : key;
};

export interface RenewalDraft {
  mc_number: string;
  contract_type: string;
  contract_start: string;
  contract_end: string;
  contract_years: number | null;
  contract_months: number | null;
  machines: string[];         // which machines carry over, by coverMachineKey (D-105)
  // THE NEW RATE PER MACHINE, keyed by coverMachineKey — product AND serial. A missing or empty entry means
  // "leave it blank", which is what every machine starts as and what the whole
  // renewal used to do — filling these in is the revision, and it is optional.
  // Held as the TYPED STRING rather than a number so a half-typed "12" is not
  // read as a rate of twelve rupees while somebody is still typing 12000.
  rates: Record<string, string>;
}

/** What a renewal of `header` would look like, before anybody edits it. */
export function proposeRenewal(header: Row, items: Row[]): RenewalDraft {
  const end = str(header.contract_end).slice(0, 10);
  const start = end ? dayAfter(end) : todayLocal();
  // ONE PERIOD, not two added together. A one-year contract is stored as
  // years = 1 AND months = 12 — the same twelve months written twice, because
  // `contract_years` is derived from `contract_months`. This used to read both
  // and pass both to `addPeriod`, which renewed a one-year contract for TWO
  // years and a two-year one for four. The end date was wrong on every renewal
  // that had a period at all.
  const months = periodToMonths(header.contract_years, header.contract_months);
  const years = months === null ? null : periodYears(months);
  return {
    mc_number: '',
    contract_type: str(header.contract_type),
    contract_start: start,
    contract_end: addPeriod(start, 0, months ?? 0),
    contract_years: years,
    contract_months: months,
    // Every machine on the old contract, and the caller unticks what is not
    // being renewed — dropping one is the common case, adding one is not.
    machines: machineKeysOf(items),
    // EMPTY, and that is the default the renewal has always had: no price is
    // proposed. The old rate is shown beside the box as context, because that
    // is what anybody pricing a renewal is working from — but it is not put IN
    // the box, since a figure sitting in a field reads as one somebody agreed.
    rates: {},
  };
}

/** Is this MC number already taken? A renewal must not silently merge into an
 *  existing contract, which is what an insert on a duplicate key would look
 *  like from the outside. */
export async function contractNumberExists(mc: string): Promise<boolean> {
  const { data, error } = await client().from('contract_entries')
    .select('mc_number').eq('mc_number', mc).limit(1);
  if (error) throw err(error);
  return !!(data && data.length);
}

/**
 * Create the next contract from an expiring one. Returns the new MC number.
 * Header first, then the machines: if a machine fails, the header is still
 * there to add it to by hand, which is recoverable — whereas machines with no
 * header would be orphans.
 */
export async function renewContract(
  from: Row, items: Row[], d: RenewalDraft,
): Promise<{ mc_number: string; machines: number }> {
  const mc = d.mc_number.trim();
  if (!mc) throw new Error('Give the new MC Number — it comes from the contract, not from here.');
  if (await contractNumberExists(mc)) {
    throw new Error(`MC Number ${mc} already exists. Renewing into it would merge two contracts.`);
  }
  if (!d.contract_start) throw new Error('The new contract needs a start date.');
  // THE PERIOD IN MONTHS IS REQUIRED, as on the contract form (2026-10-02):
  // without it there is no end date to work out, and the end is no longer typed.
  if (d.contract_months == null || !(d.contract_months > 0)) {
    throw new Error('Give the new contract its Period (Months) — the end date is worked out from it.');
  }
  if (!d.machines.length) throw new Error('Tick at least one machine to carry over.');

  // EVERY RATE IS CHECKED BEFORE ANYTHING IS WRITTEN. The header goes in first
  // (see the note above), so a rate that turns out to be unreadable halfway
  // down the machines would leave a real contract carrying some of its prices
  // and not others — and a contract that exists is much harder to walk back
  // than one that was refused. A blank is fine and means "price it later"; a
  // value that is not a number is not.
  const rateFor = (key: string): number | null => {
    const raw = (d.rates ?? {})[key];
    if (raw == null || String(raw).trim() === '') return null;
    const n = Number(String(raw).trim());
    if (!Number.isFinite(n)) throw new Error(`Rate for ${labelFor(items, key)} is not a number: "${raw}"`);
    if (n < 0) throw new Error(`Rate for ${labelFor(items, key)} cannot be negative.`);
    return n;
  };
  for (const k of d.machines) rateFor(k);

  await saveHeader('contract', {
    mc_number: mc,
    entry_at: todayLocal(),
    party_name: from.party_name ?? null,
    contract_type: d.contract_type || null,
    // THE LINK BACK. Without it a renewal is just another contract that happens
    // to follow, and "what did this machine used to be on?" has no answer.
    prev_mc_number: str(from.mc_number) || null,
    contract_start: d.contract_start,
    contract_end: d.contract_end || null,
    contract_years: d.contract_years,
    contract_months: d.contract_months,
    pm_visits_total: from.pm_visits_total ?? null,
    payment_schedule: from.payment_schedule ?? null,
    bill_generate_at: from.bill_generate_at ?? null,
  });

  const keep = new Set(d.machines);
  const carried = items.filter((i) => str(i.serial_number).trim() && keep.has(coverMachineKey(i)));
  let machines = 0;
  for (const it of carried) {
    await saveItem('contract', mc, {
      product_code: it.product_code ?? null,
      product_name: it.product_name ?? null,
      serial_number: it.serial_number ?? null,
      present_item_status: it.present_item_status ?? null,
      // The item's own history of where it came from.
      last_contract_number: str(from.mc_number) || null,
      last_contract_end: from.contract_end ?? null,
      sa_number: it.sa_number ?? null,
      sa_end_date: it.sa_end_date ?? null,
      // Dates, type and period are left EMPTY so each machine follows the new
      // header — the whole point of the header/item inheritance.
      //
      // THE MONEY IS THE ONE THING TAKEN FROM THE DRAFT AND NEVER FROM `it`.
      // `it` is the machine on the OLD contract and its rate is last year's
      // price; copying it is the thing this flow has always refused, because a
      // figure carried forward silently is a price nobody agreed that looks
      // exactly like one they did. What goes in is what somebody entered in the
      // renewal panel, and when they entered nothing, null — the old default.
      //
      // Tax and total are DERIVED, through the same two functions the contract
      // form uses. Restating "18%" here would be a second copy of the pricing
      // rule, and the two would part company the first time the rate changed.
      ...(() => {
        const rate = rateFor(coverMachineKey(it));
        return rate === null
          ? { rate: null, item_tax_amount: null, total_after_tax: null }
          : { rate, item_tax_amount: itemTaxAmount(rate), total_after_tax: totalAfterTax(rate) };
      })(),
    });
    machines += 1;
  }
  return { mc_number: mc, machines };
}

// ===========================================================================
// CONVERT A WARRANTY INTO A CONTRACT (the user, 2026-10-02: "Give a Provision
// to convert the Warranty into a Contract - Can you map it to the Respective
// fields + Add the Products to the List").
//
// THE SAME SHAPE AS A RENEWAL, from the other register: the facts the sale
// already holds are carried, the ones a sale cannot know are asked for.
//
//   carried   Party Name; each machine's Product Code, Product Name and
//             Serial Number; the SA Number and that machine's warranty end on
//             the contract line (sa_number, sa_end_date -- the columns the
//             AppSheet sheet kept for exactly this history).
//   proposed  Contract Start = the day after the warranty ends, so cover runs
//             on without a gap or an overlap (CW-010). Editable.
//   asked     MC Number (the next in the series offered, not reserved),
//             Contract Type, Period (Months), PM Visits (Total), Payment
//             Schedule, Bill Generate At -- the contract form's own required
//             fields, refused here by the same rule -- and a rate per machine,
//             optional, never invented: a sale has no service price to carry.
//
// End date and years are WORKED OUT, through `deriveHeader`, exactly as the
// contract form works them out, so a converted contract and a typed one
// cannot disagree about when the cover ends.
// ===========================================================================
export interface ConversionDraft {
  mc_number: string;
  contract_type: string;
  contract_start: string;
  contract_months: number | null;
  pm_visits_total: number | null;
  payment_schedule: string;
  bill_generate_at: string;
  /** Ticked machines and their rates, by coverMachineKey (D-105). */
  machines: string[];
  rates: Record<string, string>;
}

/** A machine line's warranty end: its own if pinned, else the sale's. */
const itemWarrantyEnd = (sale: Row, it: Row): string =>
  str(it.warranty_end || sale.warranty_end).slice(0, 10);

/** What a conversion of `sale` would look like before anybody edits it. */
export function proposeConversion(sale: Row, items: Row[]): ConversionDraft {
  const end = str(sale.warranty_end).slice(0, 10);
  return {
    mc_number: '',
    // NOT GUESSED (CW-008): CMC and AMC are different promises.
    contract_type: '',
    contract_start: end ? dayAfter(end) : todayLocal(),
    contract_months: null,
    pm_visits_total: null,
    payment_schedule: '',
    bill_generate_at: '',
    // Every machine with a serial, ticked to start with; one without a serial
    // is not a machine a contract can cover.
    machines: machineKeysOf(items),
    rates: {},
  };
}

/** The contract this draft would write: the header, with end and years worked out. */
export function conversionHeader(sale: Row, d: ConversionDraft): Row {
  const base: Row = {
    mc_number: d.mc_number.trim(),
    entry_at: todayLocal(),
    party_name: sale.party_name ?? null,
    contract_type: d.contract_type || null,
    contract_start: d.contract_start,
    contract_months: d.contract_months,
    pm_visits_total: d.pm_visits_total,
    payment_schedule: d.payment_schedule || null,
    bill_generate_at: d.bill_generate_at || null,
  };
  const months = d.contract_months;
  return {
    ...base,
    contract_years: periodYears(months),
    contract_end: periodEnd(d.contract_start, months) || null,
  };
}

/** What a contract machine line carries over from a sale machine line. */
export function conversionItem(sale: Row, it: Row): Row {
  return {
    product_code: it.product_code ?? null,
    product_name: it.product_name ?? null,
    serial_number: it.serial_number ?? null,
    sa_number: str(sale.sa_number) || null,
    sa_end_date: itemWarrantyEnd(sale, it) || null,
    // Dates, type and period left EMPTY so the machine follows the contract.
  };
}

/** The suggestion for PM Visits (Total), from the months -- the form's rule. */
export const suggestedContractPmVisits = (months: number | null): number | null =>
  contractPmVisits(months);

/** Contracts that already carry a machine from this sale, so converting twice
 *  is a decision rather than an accident. */
export async function contractsFromSale(sa: string): Promise<string[]> {
  if (!sa) return [];
  const { data, error } = await client().from('contract_items')
    .select('mc_number').eq('sa_number', sa).limit(1000);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => str((r as Row).mc_number)).filter(Boolean))];
}

/** The machines of a sale that are now with a DIFFERENT customer, by
 *  coverMachineKey — product AND serial (D-105): keyed by the serial alone, a
 *  transfer of one machine hid every machine on the sale sharing its number —
 *  each with the customer who has it. Asked of machine_current_party() — the
 *  database's own rule (latest dated sale or transfer) — a few machines at a
 *  time. A failed read THROWS: a list that could not be checked must not be
 *  offered as though it had been. */
export async function machinesWithAnotherCustomer(sale: Row, items: Row[]): Promise<Map<string, string>> {
  const away = new Map<string, string>();
  const todo = items.filter((i) => str(i.serial_number));
  for (let k = 0; k < todo.length; k += 8) {
    await Promise.all(todo.slice(k, k + 8).map(async (it) => {
      const { data, error } = await client().rpc('machine_current_party', {
        p_item_name: str(it.product_name), p_serial: str(it.serial_number),
      });
      if (error) throw new Error(`Could not check who has ${coverMachineLabel(it)}: ${error.message}`);
      if (withAnotherCustomer(sale.party_name, data)) away.set(coverMachineKey(it), str(data).trim());
    }));
  }
  return away;
}

export async function convertWarrantyToContract(
  sale: Row, items: Row[], d: ConversionDraft,
): Promise<{ mc_number: string; machines: number }> {
  const mc = d.mc_number.trim();
  if (!mc) throw new Error('Give the MC Number for the new contract.');
  if (!d.contract_start) throw new Error('The new contract needs a start date.');
  // THE CONTRACT FORM'S REQUIRED FIELDS, refused by the same rule and named
  // together (FRS-220.4).
  const header = conversionHeader(sale, d);
  const missing = missingRequired(CONTRACT.headerFields, header);
  if (missing.length) throw new Error(`Fill in ${missing.join(', ')} — ${missing.length === 1 ? 'it is' : 'they are'} required on a contract.`);
  if (!d.machines.length) throw new Error('Tick at least one machine to put on the contract.');
  // ASKED AGAIN AT THE WRITE, not only when the panel opened: a transfer
  // recorded meanwhile, or a draft that never went through the panel, must not
  // put another customer's machine on this customer's contract.
  const ticked = new Set(d.machines);
  const away = await machinesWithAnotherCustomer(sale, items.filter((i) => ticked.has(coverMachineKey(i))));
  if (away.size) {
    throw new Error(`${[...away.keys()].map((k) => labelFor(items, k)).join(', ')}: ${TRANSFERRED_AWAY} — untick ${away.size === 1 ? 'it' : 'them'}; `
      + `${away.size === 1 ? 'it is' : 'they are'} not ${str(sale.party_name) || 'this customer'}'s to put on a contract.`);
  }
  if (await contractNumberExists(mc)) {
    throw new Error(`MC Number ${mc} already exists. Converting into it would merge two contracts.`);
  }
  // Every rate checked before anything is written, as on a renewal.
  const rateFor = (key: string): number | null => {
    const raw = (d.rates ?? {})[key];
    if (raw == null || String(raw).trim() === '') return null;
    const n = Number(String(raw).trim());
    if (!Number.isFinite(n)) throw new Error(`Rate for ${labelFor(items, key)} is not a number: "${raw}"`);
    if (n < 0) throw new Error(`Rate for ${labelFor(items, key)} cannot be negative.`);
    return n;
  };
  for (const k of d.machines) rateFor(k);

  await saveHeader('contract', header);
  const keep = new Set(d.machines);
  let machines = 0;
  for (const it of items.filter((i) => str(i.serial_number).trim() && keep.has(coverMachineKey(i)))) {
    const rate = rateFor(coverMachineKey(it));
    await saveItem('contract', mc, {
      ...conversionItem(sale, it),
      ...(rate === null
        ? { rate: null, item_tax_amount: null, total_after_tax: null }
        : { rate, item_tax_amount: itemTaxAmount(rate), total_after_tax: totalAfterTax(rate) }),
    });
    machines += 1;
  }
  return { mc_number: mc, machines };
}

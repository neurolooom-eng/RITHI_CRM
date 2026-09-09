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
import { getSupabase } from './supabase';
import { dayAfter, addPeriod } from './dates';

export type CoverKind = 'sale' | 'contract';

export interface CoverField {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'select' | 'textarea' | 'bool';
  options?: string[];
  section: string;
  /** On an item: this field inherits from the header unless it is pinned. */
  inherits?: boolean;
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
    { name: 'entry_at', label: 'Sale Entry Date', type: 'date', section: 'Sale' },
    { name: 'party_name', label: 'Party Name', section: 'Sale' },
    { name: 'sold_through', label: 'Sold Through', section: 'Sale' },
    { name: 'invoice_no', label: 'Invoice No', section: 'Sale' },
    { name: 'invoice_date', label: 'Invoice Date', type: 'date', section: 'Sale' },
    { name: 'party_type', label: 'Type', type: 'select', options: ['', 'CUSTOMER', 'DEALER'], section: 'Sale' },
    { name: 'profile', label: 'Profile', type: 'select', options: ['', 'PRIVATE', 'GOVERNMENT', 'DEALER', 'GENERAL'], section: 'Sale' },
    { name: 'warranty_start', label: 'Warranty Start', type: 'date', section: 'Warranty' },
    { name: 'warranty_end', label: 'Warranty End', type: 'date', section: 'Warranty' },
    { name: 'warranty_years', label: 'Warranty Period (Years)', type: 'number', section: 'Warranty' },
    { name: 'warranty_months', label: 'Warranty Period (Months)', type: 'number', section: 'Warranty' },
    { name: 'pm_visits', label: 'PM Visits', type: 'number', section: 'Warranty' },
    { name: 'warranty_status', label: 'Warranty Status (as keyed)', section: 'Warranty' },
    { name: 'other_details', label: 'Other Details', type: 'textarea', section: 'Warranty' },
    { name: 'country', label: 'Country', section: 'Installation' },
    { name: 'state', label: 'State', section: 'Installation' },
    { name: 'city', label: 'City', section: 'Installation' },
    { name: 'engineer', label: 'Service Engineer (Initial)', section: 'Installation' },
    { name: 'address', label: 'Address', type: 'textarea', section: 'Installation' },
    { name: 'pincode', label: 'Inst. Pincode', section: 'Installation' },
    { name: 'tel1', label: 'Tel 1', section: 'Installation' },
    { name: 'tel2', label: 'Tel 2', section: 'Installation' },
    { name: 'pan', label: 'PAN', section: 'Tax' },
    { name: 'gst', label: 'GST', section: 'Tax' },
    { name: 'tax', label: 'TAX', section: 'Tax' },
  ],
  itemFields: [
    { name: 'product_code', label: 'Product Code', section: 'Machine' },
    { name: 'product_name', label: 'Product Name', section: 'Machine' },
    { name: 'serial_number', label: 'Serial Number', section: 'Machine' },
    { name: 'priority', label: 'Priority', type: 'number', section: 'Machine' },
    { name: 'warranty_start', label: 'Warranty Start', type: 'date', section: 'Warranty', inherits: true },
    { name: 'warranty_end', label: 'Warranty End', type: 'date', section: 'Warranty', inherits: true },
    { name: 'warranty_years', label: 'Period (Years)', type: 'number', section: 'Warranty', inherits: true },
    { name: 'warranty_months', label: 'Period (Months)', type: 'number', section: 'Warranty', inherits: true },
    { name: 'pm_visits', label: 'PM Visits', type: 'number', section: 'Warranty', inherits: true },
    { name: 'warranty_status', label: 'Warranty Status', section: 'Warranty', inherits: true },
    { name: 'invoice_no', label: 'Invoice No', section: 'Sale', inherits: true },
    { name: 'invoice_date', label: 'Invoice Date', type: 'date', section: 'Sale', inherits: true },
    { name: 'sold_through', label: 'Sold Through', section: 'Sale', inherits: true },
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
    { name: 'party_name', label: 'Party Name', section: 'Contract' },
    { name: 'contract_type', label: 'Contract Type', type: 'select', options: ['', 'CMC', 'AMC'], section: 'Contract' },
    { name: 'prev_mc_number', label: 'Previous MC Number', section: 'Contract' },
    { name: 'status', label: 'Status (as keyed)', section: 'Contract' },
    { name: 'contract_start', label: 'Contract Start', type: 'date', section: 'Period' },
    { name: 'contract_end', label: 'Contract End', type: 'date', section: 'Period' },
    { name: 'contract_years', label: 'Period (Years)', type: 'number', section: 'Period' },
    { name: 'contract_months', label: 'Period (Months)', type: 'number', section: 'Period' },
    { name: 'pm_visits_total', label: 'PM Visits (Total)', type: 'number', section: 'Period' },
    { name: 'payment_schedule', label: 'Payment Schedule', type: 'select',
      options: ['', 'Yearly', 'Half Yearly', 'Quarterly'], section: 'Billing' },
    { name: 'bill_generate_at', label: 'Bill Generate At', type: 'select',
      options: ['', 'Beginning Of Period', 'End Of Period'], section: 'Billing' },
  ],
  itemFields: [
    { name: 'product_code', label: 'Product Code', section: 'Machine' },
    { name: 'product_name', label: 'Product Name', section: 'Machine' },
    { name: 'serial_number', label: 'Serial Number', section: 'Machine' },
    { name: 'priority', label: 'Priority', type: 'number', section: 'Machine' },
    { name: 'present_item_status', label: 'Present Item Status', section: 'Machine' },
    { name: 'contract_start', label: 'Contract Start', type: 'date', section: 'Period', inherits: true },
    { name: 'contract_end', label: 'Contract End', type: 'date', section: 'Period', inherits: true },
    { name: 'contract_type', label: 'Contract Type', section: 'Period', inherits: true },
    { name: 'contract_years', label: 'Period (Years)', type: 'number', section: 'Period', inherits: true },
    { name: 'contract_months', label: 'Period (Months)', type: 'number', section: 'Period', inherits: true },
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
const err = (e: { message?: string } | null) => new Error(e?.message ?? 'Database error');
const like = (t: string) => `%${t.replace(/[%,()]/g, ' ').trim()}%`;

export interface HeaderFilter { q?: string; party?: string; number?: string; state?: string }

/** Headers, newest first, with the machine count on each. */
export async function listHeaders(kind: CoverKind, f: HeaderFilter, offset = 0, limit = 200): Promise<Row[]> {
  const cfg = configFor(kind);
  let q = client().from(cfg.headerTable)
    .select(`*, items:${cfg.itemTable}(count)`)
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  if (f.number) q = q.ilike(cfg.key, like(f.number));
  if (f.party) q = q.ilike('party_name', like(f.party));
  if (f.q) q = q.or(`${cfg.key}.ilike.${like(f.q)},party_name.ilike.${like(f.q)}`);
  const { data, error } = await q;
  if (error) throw err(error);
  return (data ?? []).map((r) => {
    const items = r.items as { count: number }[] | undefined;
    return { ...r, item_count: items?.[0]?.count ?? 0 };
  });
}

/** The raw items under one header — raw, so an override is visible as such. */
export async function listItems(kind: CoverKind, key: string): Promise<Row[]> {
  const cfg = configFor(kind);
  const { data, error } = await client().from(cfg.itemTable).select('*').eq(cfg.key, key).order('id');
  if (error) throw err(error);
  return data ?? [];
}

/** Machines, cover resolved — the register's "by machine" view. */
export async function listMachines(
  kind: CoverKind, f: { q?: string; state?: string }, offset = 0, limit = 500,
): Promise<Row[]> {
  const cfg = configFor(kind);
  let q = client().from(cfg.detailsView).select('*')
    .order(cfg.endColumn, { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (f.q) {
    const t = like(f.q);
    q = q.or(`serial_number.ilike.${t},product_name.ilike.${t},party_name.ilike.${t},${cfg.key}.ilike.${t}`);
  }
  if (f.state) q = q.eq(cfg.stateColumn, f.state);
  const { data, error } = await q;
  if (error) throw err(error);
  return data ?? [];
}

export async function countMachines(kind: CoverKind, state: string, f: { q?: string }): Promise<number> {
  const cfg = configFor(kind);
  let q = client().from(cfg.detailsView).select('id', { count: 'exact', head: true }).eq(cfg.stateColumn, state);
  if (f.q) {
    const t = like(f.q);
    q = q.or(`serial_number.ilike.${t},product_name.ilike.${t},party_name.ilike.${t},${cfg.key}.ilike.${t}`);
  }
  const { count, error } = await q;
  if (error) throw err(error);
  return count ?? 0;
}

export async function saveHeader(kind: CoverKind, row: Row): Promise<Row> {
  const cfg = configFor(kind);
  const { id, item_count: _c, items: _i, ...rest } = row as Row & { id?: number };
  const c = client();
  const { data, error } = id
    ? await c.from(cfg.headerTable).update(rest).eq('id', id).select().single()
    : await c.from(cfg.headerTable).insert(rest).select().single();
  if (error) throw err(error);
  return data as Row;
}

export async function saveItem(kind: CoverKind, key: string, row: Row): Promise<Row> {
  const cfg = configFor(kind);
  const { id, ...rest } = row as Row & { id?: number };
  const c = client();
  const { data, error } = id
    ? await c.from(cfg.itemTable).update(rest).eq('id', id).select().single()
    : await c.from(cfg.itemTable).insert({ ...rest, [cfg.key]: key }).select().single();
  if (error) throw err(error);
  return data as Row;
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

/** The value an item shows for a field: its own if pinned, else the header's. */
export const effective = (item: Row, header: Row, field: string): unknown =>
  item[field] === null || item[field] === undefined || item[field] === '' ? header[field] : item[field];

export const isPinned = (item: Row, field: string): boolean =>
  item[field] !== null && item[field] !== undefined && item[field] !== '';

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

export interface RenewalDraft {
  mc_number: string;
  contract_type: string;
  contract_start: string;
  contract_end: string;
  contract_years: number | null;
  contract_months: number | null;
  serials: string[];          // which machines carry over
}

/** What a renewal of `header` would look like, before anybody edits it. */
export function proposeRenewal(header: Row, items: Row[]): RenewalDraft {
  const end = str(header.contract_end).slice(0, 10);
  const start = end ? dayAfter(end) : new Date().toISOString().slice(0, 10);
  const years = header.contract_years == null ? null : Number(header.contract_years);
  const months = header.contract_months == null ? null : Number(header.contract_months);
  return {
    mc_number: '',
    contract_type: str(header.contract_type),
    contract_start: start,
    contract_end: addPeriod(start, years ?? 0, months ?? 0),
    contract_years: years,
    contract_months: months,
    // Every machine on the old contract, and the caller unticks what is not
    // being renewed — dropping one is the common case, adding one is not.
    serials: items.map((i) => str(i.serial_number)).filter(Boolean),
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
  if (!d.serials.length) throw new Error('Tick at least one machine to carry over.');

  await saveHeader('contract', {
    mc_number: mc,
    entry_at: new Date().toISOString().slice(0, 10),
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

  const keep = new Set(d.serials);
  const carried = items.filter((i) => keep.has(str(i.serial_number)));
  let machines = 0;
  for (const it of carried) {
    await saveItem('contract', mc, {
      product_code: it.product_code ?? null,
      product_name: it.product_name ?? null,
      serial_number: it.serial_number ?? null,
      priority: it.priority ?? null,
      present_item_status: it.present_item_status ?? null,
      // The item's own history of where it came from.
      last_contract_number: str(from.mc_number) || null,
      last_contract_end: from.contract_end ?? null,
      sa_number: it.sa_number ?? null,
      sa_end_date: it.sa_end_date ?? null,
      // Dates, type and period are left EMPTY so each machine follows the new
      // header — the whole point of the header/item inheritance. Money is left
      // empty because a renewal is re-priced.
    });
    machines += 1;
  }
  return { mc_number: mc, machines };
}

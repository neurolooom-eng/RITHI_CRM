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
import { dayAfter, addPeriod } from './dates';
import { nextInSeries, itemTaxAmount, totalAfterTax, periodToMonths, periodYears,
         inheritAllPatch, isPinnedValue, installCallFromSale, machinesNeedingInstallCall,
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
   *  work at all, and the same box on the call registers already searches. */
  optionsFrom?: 'sellable-name' | 'sellable-code' | 'party';
  section: string;
  /** THE FORM DOES NOT ASK FOR THIS ONE — it is worked out, or it is stamped.
   *  Shown, and not typeable: a box somebody can type into is a box whose value
   *  they expect to keep, and the next keystroke elsewhere would overwrite it.
   *  `why` says what decides it, beside the field. */
  derived?: string;
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
    // STAMPED WHEN THE ENTRY IS CREATED (0230 defaults it to now()), not typed.
    // The user, 2026-09-22: "Warranty Entry date - Automatic - Timestamp".
    { name: 'entry_at', label: 'Sale Entry Date', type: 'date', section: 'Sale',
      derived: 'stamped when the entry is created' },
    { name: 'party_name', label: 'Party Name', section: 'Sale', optionsFrom: 'party' },
    { name: 'sold_through', label: 'Sold Through', section: 'Sale' },
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
    { name: 'pm_visits', label: 'PM Visits', type: 'number', section: 'Warranty',
      derived: 'the period' },
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
    { name: 'prev_mc_number', label: 'Prev MC Number', section: 'Contract' },
    { name: 'status', label: 'Status (as keyed)', section: 'Contract' },
    { name: 'contract_start', label: 'Contract Start Date', type: 'date', section: 'Period' },
    { name: 'contract_end', label: 'Contract End Date', type: 'date', section: 'Period' },
    { name: 'contract_years', label: 'Contract Period (Years)', type: 'number', section: 'Period' },
    { name: 'contract_months', label: 'Contract Period (Months)', type: 'number', section: 'Period' },
    { name: 'pm_visits_total', label: 'PM Visits (Total)', type: 'number', section: 'Period' },
    // MONTHLY IS ON THE SHEET AND WAS MISSING HERE. ContractEntry_Schema col 5
    // lists Yearly / Half Yearly / Quarterly / Monthly; three of the four were
    // transcribed. The field takes no fallback, so a monthly contract could not
    // be keyed at all — and an import carrying "Monthly" would show a value the
    // form cannot re-select.
    { name: 'payment_schedule', label: 'Payment Schedule', type: 'select',
      options: ['', 'Yearly', 'Half Yearly', 'Quarterly', 'Monthly'], section: 'Billing' },
    { name: 'bill_generate_at', label: 'Bill Generate At', type: 'select',
      options: ['', 'Beginning Of Period', 'End Of Period'], section: 'Billing' },
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
  // The same whitelist as saveItem. It used to name the two fields to DROP
  // (item_count, items) — which worked until a third arrived, and a derived
  // value with no column behind it loses the whole save rather than itself.
  const { id, ...all } = row as Row & { id?: number };
  const rest = onlyWritable(all, writableFor(cfg, 'header'));
  const c = client();
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
    const { error } = await client().from('sale_items').update({ inst_call: ucn }).eq('id', it.id);
    if (error) {
      return { created, error: `${str(it.serial_number)}: call ${ucn} was created but could not be written back to the machine — ${error.message}` };
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

export interface RenewalDraft {
  mc_number: string;
  contract_type: string;
  contract_start: string;
  contract_end: string;
  contract_years: number | null;
  contract_months: number | null;
  serials: string[];          // which machines carry over
  // THE NEW RATE PER MACHINE, keyed by serial. A missing or empty entry means
  // "leave it blank", which is what every machine starts as and what the whole
  // renewal used to do — filling these in is the revision, and it is optional.
  // Held as the TYPED STRING rather than a number so a half-typed "12" is not
  // read as a rate of twelve rupees while somebody is still typing 12000.
  rates: Record<string, string>;
}

/** What a renewal of `header` would look like, before anybody edits it. */
export function proposeRenewal(header: Row, items: Row[]): RenewalDraft {
  const end = str(header.contract_end).slice(0, 10);
  const start = end ? dayAfter(end) : new Date().toISOString().slice(0, 10);
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
    serials: items.map((i) => str(i.serial_number)).filter(Boolean),
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
  if (!d.serials.length) throw new Error('Tick at least one machine to carry over.');

  // EVERY RATE IS CHECKED BEFORE ANYTHING IS WRITTEN. The header goes in first
  // (see the note above), so a rate that turns out to be unreadable halfway
  // down the machines would leave a real contract carrying some of its prices
  // and not others — and a contract that exists is much harder to walk back
  // than one that was refused. A blank is fine and means "price it later"; a
  // value that is not a number is not.
  const rateFor = (serial: string): number | null => {
    const raw = (d.rates ?? {})[serial];
    if (raw == null || String(raw).trim() === '') return null;
    const n = Number(String(raw).trim());
    if (!Number.isFinite(n)) throw new Error(`Rate for ${serial} is not a number: "${raw}"`);
    if (n < 0) throw new Error(`Rate for ${serial} cannot be negative.`);
    return n;
  };
  for (const sn of d.serials) rateFor(sn);

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
        const rate = rateFor(str(it.serial_number));
        return rate === null
          ? { rate: null, item_tax_amount: null, total_after_tax: null }
          : { rate, item_tax_amount: itemTaxAmount(rate), total_after_tax: totalAfterTax(rate) };
      })(),
    });
    machines += 1;
  }
  return { mc_number: mc, machines };
}

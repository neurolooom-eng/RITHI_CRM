import { getSupabase } from './supabase';
import { allRows } from './paging';
import { machineKey, withEventKeys } from './machine';

// ===========================================================================
// ONE MACHINE'S WHOLE LIFE, gathered from every register that records one.
//
// The user, 2026-09-14: "If i give a product , Serial No , it should give me
// all Transactions -- Calls , Spares , Visits , Warranty , Contract , Ownership
// Transfer -- If i am missing anything add."
//
// The four that were missing and are here: FIELD FAILURE REPORTS, CUSTOMER
// FEEDBACK, ADDITIONAL ENTRIES and WORKSHOP (indoor service) JOBS. A machine
// that failed, was reported on, was commented on by the hospital and went
// through the workshop has all four in its life, and a history that stopped at
// calls and cover would read as though none of it happened.
//
// A MACHINE IS ITS MODEL PLUS ITS SERIAL, NEVER THE SERIAL ALONE — this
// project's own rule (machine.ts), written down after an ORION-G 201 request
// was offered an open call for a VEGA 201. Every query below filters on the
// SERIAL in the database (which is indexed) and then drops any row whose
// PRODUCT does not match, because that is the half no index can do for us.
//
// EVERY ROW SAYS WHICH REGISTER IT CAME FROM. These registers are governed by
// different policies and filled by different people; a single undifferentiated
// list would promise one standard of evidence for all of them.
//
// WHAT THIS CANNOT SEE: anything before the migration into this system. That
// lives in a separate archive project and is not reachable from here.
// ===========================================================================

export interface MachineEvent {
  /** THIS ROW, and nothing else. Assigned by `withEventKeys` because the row's
   *  own fields are not an identity: two visits on one call on one day with the
   *  same status and no remark are identical in every one of them, and React
   *  drops and duplicates rows that share a key. */
  key: string;
  /** yyyy-mm-dd, or '' where the register holds no date for it. */
  on: string;
  /** Which register. Also the group heading on screen. */
  source: 'Product Database' | 'Call' | 'Visit' | 'Spare' | 'Field Failure' | 'Feedback'
        | 'Sale / warranty' | 'Contract' | 'Ownership' | 'Additional entry' | 'Workshop';
  /** What happened, in a word or two. */
  what: string;
  /** The number somebody would quote: a UCN, an FFR number, an MC number. */
  ref: string;
  /** The UCN, where the row has one — so the screen can colour it. */
  ucn: string;
  party: string;
  detail: string;
}

const s = (v: unknown) => String(v ?? '').trim();
const day = (v: unknown) => s(v).slice(0, 10);

function client() {
  const c = getSupabase();
  if (!c) throw new Error('Not connected to the database (Settings → Database connection).');
  return c;
}

/** Keep only the rows whose PRODUCT matches too. The serial narrowed it in the
 *  database; this is the half that stops a VEGA appearing in an ORION's life. */
const sameMachineRows = <T extends Record<string, unknown>>(
  rows: T[], productField: keyof T, product: string, serial: string,
): T[] => {
  const want = machineKey(product, serial);
  return rows.filter((r) => machineKey(s(r[productField]), serial) === want);
};

export interface MachineNow {
  product: string; serial: string; party: string; itemStatus: string;
  /** The party the COVER names — the contract's, falling back to the sale's.
   *  Kept apart from `party` above (the Product Database's) because the two
   *  disagree whenever a machine moved on a contract without an Ownership
   *  Transfer being filed, and that disagreement is a finding rather than
   *  something to resolve silently. See `partyDiffers`. */
  coverParty: string;
  warrantyNumber: string; warrantyEnd: string; warrantyState: string;
  contractNumber: string; contractType: string; contractEnd: string; contractState: string;
  state: string; city: string; engineer: string;
  /** False when the Product Database has never heard of this machine. */
  onMaster: boolean;
}

/** WHERE IT IS NOW. The Product Database answers "whose is it"; machine_cover
 *  answers "what is it under today", and the two can disagree — which is worth
 *  showing rather than resolving silently. */
export async function machineNow(product: string, serial: string): Promise<MachineNow | null> {
  const ser = s(serial);
  if (!ser || !s(product)) return null;
  const c = client();
  const [pm, cov] = await Promise.all([
    c.from('products')
      .select('item_name,serial_number,party_name,item_status,warranty_number,warranty_end,contract_number,contract_type,contract_end')
      .eq('serial_number', ser).limit(50),
    c.from('machine_cover')
      .select('product_name,serial_number,party_name,warranty_state,contract_state,state,city,engineer,item_status')
      .eq('serial_number', ser).limit(50),
  ]);
  if (pm.error) throw new Error(pm.error.message);
  const p = sameMachineRows(pm.data ?? [], 'item_name', product, ser)[0];
  const v = cov.error ? undefined : sameMachineRows(cov.data ?? [], 'product_name', product, ser)[0];
  if (!p && !v) return null;
  return {
    product: s(p?.item_name ?? v?.product_name ?? product),
    serial: ser,
    party: s(p?.party_name ?? v?.party_name),
    coverParty: s(v?.party_name),
    itemStatus: s(p?.item_status ?? v?.item_status),
    warrantyNumber: s(p?.warranty_number), warrantyEnd: day(p?.warranty_end),
    warrantyState: s(v?.warranty_state),
    contractNumber: s(p?.contract_number), contractType: s(p?.contract_type),
    contractEnd: day(p?.contract_end), contractState: s(v?.contract_state),
    state: s(v?.state), city: s(v?.city), engineer: s(v?.engineer),
    onMaster: !!p,
  };
}

// ---------------------------------------------------------------------------
// THE TWO PARTIES, AND WHY THEY DISAGREE.
//
// Reported 2026-09-14 of ORION-G 2141: "Why is Product Database alone showing
// differently?" — the master said GOVT.THIRUVALLUR MEDICAL COLLEGE while the
// cover, every call, the visit and the feedback all said RIVER NIMS HOSPITAL.
//
// It is not a display fault. `products.party_name` is written by exactly two
// things: the Product Database upload, and `ownership_transfer_apply` (0072),
// which sets it to the transfer's `to_party`. `sync_product_cover` (0036)
// updates the cover columns and `item_status` and DOES NOT TOUCH THE PARTY.
// `machine_cover.party_name` meanwhile is `coalesce(contract.party, sale.party)`.
//
// So a machine that moved hospital on a CONTRACT, with no Ownership Transfer
// filed, keeps the old party on the master for ever. The cover, the calls and
// the feedback all follow the machine; the master does not.
//
// WHICH IS RIGHT: wherever the calls are being raised. The master is the one
// that has gone stale, and it matters because the call form and the request
// cascade read the master — so the next call for this machine is offered the
// wrong hospital until somebody files the transfer or re-imports the master.
// ---------------------------------------------------------------------------
const squashed = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]+/g, '');

/** Do the Product Database and the cover name different parties? Blank on either
 *  side is not a disagreement — it is one of them simply not knowing. */
export const partyDiffers = (n: MachineNow | null): boolean =>
  !!n && !!n.party && !!n.coverParty && squashed(n.party) !== squashed(n.coverParty);

/** What one look-up found, AND WHAT IT COULD NOT READ (D-019). A register
 *  that refused -- a policy, a timeout, a missing view -- used to come back as
 *  an empty list, so a history missing a whole register read as complete. */
export interface MachineHistory {
  events: MachineEvent[];
  /** The registers that could not be read, each with the database's reason. */
  unread: { source: MachineEvent['source']; reason: string }[];
}

type Res<T> = { data: T[] | null; error: { message?: string } | null };
type Page<T> = (from: number, to: number) => PromiseLike<Res<T>>;

/** EVERY row of one register for this machine, PAGED -- never a fixed limit
 *  (D-019: 50, 200 or 500 rows, while the screen said every count was exact).
 *  A refusal becomes an entry in `unread` rather than an empty register. */
async function readAll<T>(
  source: MachineEvent['source'], page: Page<T>, unread: MachineHistory['unread'],
): Promise<T[]> {
  try {
    return await allRows<T>(page);
  } catch (e) {
    unread.push({ source, reason: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

/** Every transaction, newest first. One request per register, in parallel —
 *  a machine's life is a handful of rows in each, so this is one round trip's
 *  latency rather than ten. */
export async function machineHistory(product: string, serial: string): Promise<MachineHistory> {
  const ser = s(serial);
  if (!ser || !s(product)) return { events: [], unread: [] };
  const unread: MachineHistory['unread'] = [];
  const c = client();
  // UNKEYED WHILE IT IS BEING BUILT, so no register can hand-write a key and
  // no two can agree on one by accident. `withEventKeys` is the only thing
  // that makes a MachineEvent, and the type says so.
  const out: Omit<MachineEvent, 'key'>[] = [];

  // ---- the calls, which also give us the UCNs the visit and spare rows hang off
  // The calls are the one register that THROWS on a refusal: the visits and
  // spares are found through their UCNs, so without the calls two more
  // registers would be silently empty as well.
  const calls = await allRows<Record<string, unknown>>((f, t) => c.from('calls')
    .select('ucn,call_number,call_type,party_name,product_name,serial,reg_date,standard_complaint,complaint_reported,allocated_to,open_state,cancelled_at')
    .eq('serial', ser).order('ucn').range(f, t));
  const mine = sameMachineRows(calls, 'product_name', product, ser);
  const ucns = [...new Set(mine.map((r) => s(r.ucn)).filter(Boolean))];

  for (const r of mine) {
    out.push({
      on: day(r.reg_date), source: 'Call', what: s(r.call_type) || 'Call',
      ref: s(r.call_number) || s(r.ucn), ucn: s(r.ucn), party: s(r.party_name),
      detail: [s(r.cancelled_at) ? 'CANCELLED' : s(r.open_state),
               s(r.standard_complaint) || s(r.complaint_reported),
               s(r.allocated_to) && `engineer ${s(r.allocated_to)}`].filter(Boolean).join(' · '),
    });
  }

  type R = Record<string, unknown>;
  const none = Promise.resolve([] as R[]);
  // EVERY REGISTER IS READ WHOLE, paged, and ordered by its own key so no row
  // falls between two pages. The visits and spares go by UCN, in chunks, so a
  // machine with hundreds of calls does not build a URL too long to send.
  const byUcn = async (source: MachineEvent['source'], table: string, cols: string, order: string) => {
    const out: R[] = [];
    for (let i = 0; i < ucns.length; i += 100) {
      const chunk = ucns.slice(i, i + 100);
      out.push(...await readAll<R>(source, (f, t) => c.from(table).select(cols).in('ucn', chunk).order(order).range(f, t) as unknown as PromiseLike<Res<R>>, unread));
    }
    return out;
  };
  const bySerial = (source: MachineEvent['source'], table: string, cols: string, col: string, order: string) =>
    readAll<R>(source, (f, t) => c.from(table).select(cols).eq(col, ser).order(order).range(f, t) as unknown as PromiseLike<Res<R>>, unread);

  const [master, visits, spares, ffrs, feedback, sale, contract, owner, extra, indoor] = await Promise.all([
    // THE MASTER IS A ROW IN THE LIST TOO (the user, 2026-09-14: "in the list
    // add Product Database also"), not only the heading. It is a register like
    // the others — somebody put the machine on it, and what it says about the
    // party can disagree with every other row, which is exactly why it belongs
    // where it can be read beside them rather than only above them.
    bySerial('Product Database', 'products', 'id,item_name,serial_number,party_name,item_status,warranty_number,contract_number,contract_type,active,created_at', 'serial_number', 'id'),
    ucns.length ? byUcn('Visit', 'reports', 'id,uid,ucn,call_status,engineer,visit_at,updated_at,pending_reason', 'id') : none,
    ucns.length ? byUcn('Spare', 'spare_consumption', 'id,ucn,part,qty,engineer,created_at,remarks', 'id') : none,
    bySerial('Field Failure', 'field_failure_reports', 'id,ffr_no,ucn,ffr_date,customer_name,product_name,product_serial,problem_reported,ffr_status,capa_no,imported_from', 'product_serial', 'id'),
    bySerial('Feedback', 'feedback', 'id,ucn,call_number,party_name,product_name,serial,complaint,entry_at,imported_from', 'serial', 'id'),
    bySerial('Sale / warranty', 'warranty_sale_details', 'id,sa_number,product_name,serial_number,party_name,sale_entry_date,invoice_no,warranty_start,warranty_end,warranty_state,already_sold_to', 'serial_number', 'id'),
    bySerial('Contract', 'contract_details', 'id,mc_number,product_name,serial_number,party_name,contract_type,contract_start,contract_end,contract_state,prev_mc_number', 'serial_number', 'id'),
    bySerial('Ownership', 'ownership_transfers', 'id,reference_no,item_name,serial_number,from_party,to_party,transfer_date,reason,remarks', 'serial_number', 'id'),
    bySerial('Additional entry', 'product_additional_entries', 'id,item_name,serial_number,party_name,warranty_number,contract_number,source_note,remarks,created_at', 'serial_number', 'id'),
    bySerial('Workshop', 'indoor_jobs', 'id,job_no,ucn,product_name,serial,party_name,received_at,status,activity,work_done,disposition', 'serial', 'id'),
  ]);

  for (const r of sameMachineRows(master, 'item_name', product, ser)) out.push({
    on: day(r.created_at), source: 'Product Database', what: s(r.item_status) || 'On the master',
    ref: s(r.serial_number), ucn: '', party: s(r.party_name),
    detail: [s(r.warranty_number) && `warranty ${s(r.warranty_number)}`,
             s(r.contract_number) && `${s(r.contract_type) || 'contract'} ${s(r.contract_number)}`,
             r.active === false && 'MARKED INACTIVE'].filter(Boolean).join(' · '),
  });

  for (const r of visits) out.push({
    on: day(r.visit_at) || day(r.updated_at), source: 'Visit',
    what: s(r.call_status) || 'Visit', ref: s(r.ucn), ucn: s(r.ucn), party: s(r.engineer),
    // THE VISIT'S OWN ID, LAST. Two visits on one call on one day with the same
    // status are identical in every other column, which made a real duplicate
    // look like a rendering fault — and the uid is what somebody needs to find
    // and remove one of them.
    detail: [!s(r.visit_at) && `no visit date — entered ${day(r.updated_at)}`,
             s(r.pending_reason), s(r.uid) && `visit ${s(r.uid)}`].filter(Boolean).join(' · '),
  });

  for (const r of spares) {
    const part = s(r.part);
    const code = part.split('|')[0].trim();
    out.push({
      on: day(r.created_at), source: 'Spare', what: code || 'Spare',
      ref: s(r.ucn), ucn: s(r.ucn), party: s(r.engineer),
      // A VOIDED line is kept, with its original quantity — a wrong consumption
      // is corrected by voiding it, never by deleting it (0049).
      detail: [`qty ${s(r.qty) || '0'}`, part.slice(part.indexOf('|') + 1).trim(),
               Number(r.qty ?? 0) === 0 && 'VOIDED', s(r.remarks)].filter(Boolean).join(' · '),
    });
  }

  for (const r of sameMachineRows(ffrs, 'product_name', product, ser)) out.push({
    on: day(r.ffr_date), source: 'Field Failure', what: s(r.ffr_status) || 'Report',
    ref: s(r.ffr_no), ucn: s(r.ucn), party: s(r.customer_name),
    detail: [s(r.problem_reported), s(r.capa_no) && `CAPA ${s(r.capa_no)}`,
             s(r.imported_from) && 'migrated'].filter(Boolean).join(' · '),
  });

  for (const r of sameMachineRows(feedback, 'product_name', product, ser)) out.push({
    on: day(r.entry_at), source: 'Feedback', what: 'Feedback',
    ref: s(r.call_number) || s(r.ucn), ucn: s(r.ucn), party: s(r.party_name),
    detail: [s(r.complaint), s(r.imported_from) ? 'uploaded' : 'entered here'].filter(Boolean).join(' · '),
  });

  for (const r of sameMachineRows(sale, 'product_name', product, ser)) out.push({
    on: day(r.sale_entry_date), source: 'Sale / warranty', what: s(r.warranty_state) || 'Sold',
    ref: s(r.sa_number), ucn: '', party: s(r.party_name),
    detail: [`warranty ${day(r.warranty_start) || '—'} to ${day(r.warranty_end) || '—'}`,
             s(r.invoice_no) && `invoice ${s(r.invoice_no)}`,
             s(r.already_sold_to) && `already sold to ${s(r.already_sold_to)}`].filter(Boolean).join(' · '),
  });

  for (const r of sameMachineRows(contract, 'product_name', product, ser)) out.push({
    on: day(r.contract_start), source: 'Contract', what: s(r.contract_type) || 'Contract',
    ref: s(r.mc_number), ucn: '', party: s(r.party_name),
    detail: [`${day(r.contract_start) || '—'} to ${day(r.contract_end) || '—'}`,
             s(r.contract_state), s(r.prev_mc_number) && `renewed from ${s(r.prev_mc_number)}`]
      .filter(Boolean).join(' · '),
  });

  for (const r of sameMachineRows(owner, 'item_name', product, ser)) out.push({
    on: day(r.transfer_date), source: 'Ownership', what: 'Transferred',
    ref: s(r.reference_no), ucn: '', party: s(r.to_party),
    detail: [`${s(r.from_party) || '(not stated)'} → ${s(r.to_party)}`,
             s(r.reason), s(r.remarks)].filter(Boolean).join(' · '),
  });

  for (const r of sameMachineRows(extra, 'item_name', product, ser)) out.push({
    on: day(r.created_at), source: 'Additional entry', what: 'Entry',
    ref: s(r.warranty_number) || s(r.contract_number), ucn: '', party: s(r.party_name),
    detail: [s(r.source_note), s(r.remarks)].filter(Boolean).join(' · '),
  });

  for (const r of sameMachineRows(indoor, 'product_name', product, ser)) out.push({
    on: day(r.received_at), source: 'Workshop', what: s(r.status) || 'Job',
    ref: s(r.job_no), ucn: s(r.ucn), party: s(r.party_name),
    detail: [s(r.activity), s(r.work_done), s(r.disposition) && `disposition: ${s(r.disposition)}`]
      .filter(Boolean).join(' · '),
  });

  // NEWEST FIRST, and a row with no date sorts LAST rather than first: an
  // undated row is one the register never dated, and putting it at the top
  // would read as the most recent thing that happened.
  // KEYED LAST, once the order is settled, so a row's key never depends on
  // which register happened to be read first.
  return {
    events: withEventKeys(out.sort((a, b) => (b.on || '').localeCompare(a.on || '')
      || a.source.localeCompare(b.source))),
    unread,
  };
}

import { getSupabase } from './supabase';
import { machineKey } from './machine';

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
  /** yyyy-mm-dd, or '' where the register holds no date for it. */
  on: string;
  /** Which register. Also the group heading on screen. */
  source: 'Call' | 'Visit' | 'Spare' | 'Field Failure' | 'Feedback'
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
  warrantyNumber: string; warrantyEnd: string; warrantyState: string;
  contractNumber: string; contractType: string; contractEnd: string; contractState: string;
  state: string; city: string; engineer: string;
  /** False when the Product Master has never heard of this machine. */
  onMaster: boolean;
}

/** WHERE IT IS NOW. The Product Master answers "whose is it"; machine_cover
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
    itemStatus: s(p?.item_status ?? v?.item_status),
    warrantyNumber: s(p?.warranty_number), warrantyEnd: day(p?.warranty_end),
    warrantyState: s(v?.warranty_state),
    contractNumber: s(p?.contract_number), contractType: s(p?.contract_type),
    contractEnd: day(p?.contract_end), contractState: s(v?.contract_state),
    state: s(v?.state), city: s(v?.city), engineer: s(v?.engineer),
    onMaster: !!p,
  };
}

/** Every transaction, newest first. One request per register, in parallel —
 *  a machine's life is a handful of rows in each, so this is one round trip's
 *  latency rather than ten. */
export async function machineHistory(product: string, serial: string): Promise<MachineEvent[]> {
  const ser = s(serial);
  if (!ser || !s(product)) return [];
  const c = client();
  const out: MachineEvent[] = [];

  // ---- the calls, which also give us the UCNs the visit and spare rows hang off
  const calls = await c.from('calls')
    .select('ucn,call_number,call_type,party_name,product_name,serial,reg_date,standard_complaint,complaint_reported,allocated_to,open_state,cancelled_at')
    .eq('serial', ser).limit(500);
  if (calls.error) throw new Error(calls.error.message);
  const mine = sameMachineRows(calls.data ?? [], 'product_name', product, ser);
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

  const [visits, spares, ffrs, feedback, sale, contract, owner, extra, indoor] = await Promise.all([
    ucns.length ? c.from('reports').select('ucn,call_status,engineer,visit_at,updated_at,pending_reason').in('ucn', ucns).limit(500)
      : Promise.resolve({ data: [], error: null }),
    ucns.length ? c.from('spare_consumption').select('ucn,part,qty,engineer,created_at,remarks').in('ucn', ucns).limit(500)
      : Promise.resolve({ data: [], error: null }),
    c.from('field_failure_reports').select('ffr_no,ucn,ffr_date,customer_name,product_name,product_serial,problem_reported,ffr_status,capa_no,imported_from').eq('product_serial', ser).limit(200),
    c.from('feedback').select('ucn,call_number,party_name,product_name,serial,complaint,entry_at,imported_from').eq('serial', ser).limit(200),
    c.from('warranty_sale_details').select('sa_number,product_name,serial_number,party_name,sale_entry_date,invoice_no,warranty_start,warranty_end,warranty_state,already_sold_to').eq('serial_number', ser).limit(200),
    c.from('contract_details').select('mc_number,product_name,serial_number,party_name,contract_type,contract_start,contract_end,contract_state,prev_mc_number').eq('serial_number', ser).limit(200),
    c.from('ownership_transfers').select('reference_no,item_name,serial_number,from_party,to_party,transfer_date,reason,remarks').eq('serial_number', ser).limit(200),
    c.from('product_additional_entries').select('item_name,serial_number,party_name,warranty_number,contract_number,source_note,remarks,created_at').eq('serial_number', ser).limit(200),
    c.from('indoor_jobs').select('job_no,ucn,product_name,serial,party_name,received_at,status,activity,work_done,disposition').eq('serial', ser).limit(200),
  ]);

  const rows = <T extends Record<string, unknown>>(r: { data: T[] | null; error: unknown }) =>
    (r.error ? [] : (r.data ?? []));   // one register refusing must not lose the other nine

  for (const r of rows(visits)) out.push({
    on: day(r.visit_at) || day(r.updated_at), source: 'Visit',
    what: s(r.call_status) || 'Visit', ref: s(r.ucn), ucn: s(r.ucn), party: s(r.engineer),
    detail: [!s(r.visit_at) && `no visit date — entered ${day(r.updated_at)}`,
             s(r.pending_reason)].filter(Boolean).join(' · '),
  });

  for (const r of rows(spares)) {
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

  for (const r of sameMachineRows(rows(ffrs), 'product_name', product, ser)) out.push({
    on: day(r.ffr_date), source: 'Field Failure', what: s(r.ffr_status) || 'Report',
    ref: s(r.ffr_no), ucn: s(r.ucn), party: s(r.customer_name),
    detail: [s(r.problem_reported), s(r.capa_no) && `CAPA ${s(r.capa_no)}`,
             s(r.imported_from) && 'migrated'].filter(Boolean).join(' · '),
  });

  for (const r of sameMachineRows(rows(feedback), 'product_name', product, ser)) out.push({
    on: day(r.entry_at), source: 'Feedback', what: 'Feedback',
    ref: s(r.call_number) || s(r.ucn), ucn: s(r.ucn), party: s(r.party_name),
    detail: [s(r.complaint), s(r.imported_from) ? 'uploaded' : 'entered here'].filter(Boolean).join(' · '),
  });

  for (const r of sameMachineRows(rows(sale), 'product_name', product, ser)) out.push({
    on: day(r.sale_entry_date), source: 'Sale / warranty', what: s(r.warranty_state) || 'Sold',
    ref: s(r.sa_number), ucn: '', party: s(r.party_name),
    detail: [`warranty ${day(r.warranty_start) || '—'} to ${day(r.warranty_end) || '—'}`,
             s(r.invoice_no) && `invoice ${s(r.invoice_no)}`,
             s(r.already_sold_to) && `already sold to ${s(r.already_sold_to)}`].filter(Boolean).join(' · '),
  });

  for (const r of sameMachineRows(rows(contract), 'product_name', product, ser)) out.push({
    on: day(r.contract_start), source: 'Contract', what: s(r.contract_type) || 'Contract',
    ref: s(r.mc_number), ucn: '', party: s(r.party_name),
    detail: [`${day(r.contract_start) || '—'} to ${day(r.contract_end) || '—'}`,
             s(r.contract_state), s(r.prev_mc_number) && `renewed from ${s(r.prev_mc_number)}`]
      .filter(Boolean).join(' · '),
  });

  for (const r of sameMachineRows(rows(owner), 'item_name', product, ser)) out.push({
    on: day(r.transfer_date), source: 'Ownership', what: 'Transferred',
    ref: s(r.reference_no), ucn: '', party: s(r.to_party),
    detail: [`${s(r.from_party) || '(not stated)'} → ${s(r.to_party)}`,
             s(r.reason), s(r.remarks)].filter(Boolean).join(' · '),
  });

  for (const r of sameMachineRows(rows(extra), 'item_name', product, ser)) out.push({
    on: day(r.created_at), source: 'Additional entry', what: 'Entry',
    ref: s(r.warranty_number) || s(r.contract_number), ucn: '', party: s(r.party_name),
    detail: [s(r.source_note), s(r.remarks)].filter(Boolean).join(' · '),
  });

  for (const r of sameMachineRows(rows(indoor), 'product_name', product, ser)) out.push({
    on: day(r.received_at), source: 'Workshop', what: s(r.status) || 'Job',
    ref: s(r.job_no), ucn: s(r.ucn), party: s(r.party_name),
    detail: [s(r.activity), s(r.work_done), s(r.disposition) && `disposition: ${s(r.disposition)}`]
      .filter(Boolean).join(' · '),
  });

  // NEWEST FIRST, and a row with no date sorts LAST rather than first: an
  // undated row is one the register never dated, and putting it at the top
  // would read as the most recent thing that happened.
  return out.sort((a, b) => (b.on || '').localeCompare(a.on || '')
    || a.source.localeCompare(b.source));
}

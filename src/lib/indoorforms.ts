// ===========================================================================
// THE TWO CONTROLLED RECORDS OF INDOOR SERVICE, as data (2026-10-02).
//
// The user photographed the paper records the workshop keeps and asked for the
// register to be "in line with these records", and then: "I will need these
// docs generated as well when completed or when printed."
//
//   R/SER/07     INDOOR SERVICE EQUIPMENT FAILURE REGISTER -- two sheets,
//                "CUSTOMER – DEVICE's" and "DEMO", eighteen columns.
//   R/SER/QC/007 PRE DELIVERY TESTING -- one form per DEMO unit of an
//                IMPORTED product (0320).
//
// ONE DEFINITION, THREE USES: the screen's register view, the .xlsx download
// and the printable page all read the columns from here, for the reason
// ffrform.ts gives -- a second transcription of a controlled form is a second
// form, and the two drift the first time a heading changes.
//
// The wording is the paper's. "HV" and "HT" are printed as the form prints
// them and are NOT interpreted: nobody has said what they measure.
// ===========================================================================
import type { IndoorJob, IndoorPdt } from './supabase';
import { formatDay } from './dates';

/** The organisation line both forms carry -- the FFR's, the same company. */
export const INDOOR_ORG = 'AIR LIQUIDE MEDICAL SYSTEMS PVT. LTD.';
export const INDOOR_NOTICE = 'This document is the property of Air Liquide Medical Systems. '
  + 'Any communication or reproduction thereof, even partial, is prohibited '
  + 'without the owner’s prior and written consent';

// ---------------------------------------------------------------------------
// R/SER/07
// ---------------------------------------------------------------------------
export const REGISTER_HEADER = {
  dept: 'SERVICE',
  title: 'INDOOR SERVICE EQUIPMENT FAILURE REGISTER',
  tmpl: 'TMPL No: R/SER/07 Rev: AUG 2025',
} as const;

export type RegisterSheet = 'customer' | 'demo';

/** Which jobs a sheet holds, by `kind`, and what each is called where. The
 *  workbook's sheet names are the user's ("Customer – Devices", "Demo"); the
 *  printed title is the paper's ("CUSTOMER – DEVICE's", "DEMO"). */
export const REGISTER_SHEETS: Record<RegisterSheet, { kind: string; xlsxName: string; printTitle: string }> = {
  customer: { kind: 'Customer property', xlsxName: 'Customer – Devices', printTitle: 'CUSTOMER – DEVICE’s' },
  demo:     { kind: 'DEMO unit',         xlsxName: 'Demo',               printTitle: 'DEMO' },
};

/** The eighteen columns, in the paper's order and in its words. */
export const REGISTER_COLUMNS = [
  'S.No', 'Incoming Date', 'UC No (Unique Call)', 'Field Service Report No', 'Engineer Name',
  'Customer Name', 'Customer Place', 'Product Name', 'Product Sl. No', 'Accessories Received',
  'Problem Reported', 'Cleaned as per WI/SER/01', 'Status', 'Indoor Service Report No',
  'DC No./Date', 'Dispatch Date', 'Remarks', 'Verified By',
] as const;
export type RegisterColumn = typeof REGISTER_COLUMNS[number];

/** The two columns that are dates on their own -- an .xlsx carries them as
 *  dates (a number plus a format), the page prints them dd-MMM-yyyy. */
export const REGISTER_DATE_COLUMNS: RegisterColumn[] = ['Incoming Date', 'Dispatch Date'];

/** A job's register row with the RAW date values (ISO strings), so each
 *  destination formats them its own way. */
export function registerRow(j: IndoorJob, sNo: number): Record<RegisterColumn, unknown> {
  const dc = [j.dispatch_ref?.trim() ?? '', j.dc_date ? formatDay(j.dc_date) : ''].filter(Boolean).join(' / ');
  return {
    'S.No': sNo,
    'Incoming Date': j.received_at ?? '',
    'UC No (Unique Call)': j.ucn ?? '',
    'Field Service Report No': j.field_report_no ?? '',
    'Engineer Name': j.engineer_name ?? '',
    'Customer Name': j.party_name ?? '',
    'Customer Place': j.customer_place ?? '',
    'Product Name': j.product_name ?? '',
    'Product Sl. No': j.serial ?? '',
    'Accessories Received': j.accessories_received?.trim() ? j.accessories_received : 'Nil',
    'Problem Reported': j.problem_reported ?? '',
    'Cleaned as per WI/SER/01': j.cleaned_at ? 'Yes' : 'No',
    'Status': j.cover ?? '',
    'Indoor Service Report No': j.indoor_report_no ?? '',
    'DC No./Date': dc,
    'Dispatch Date': j.dispatched_at ?? '',
    'Remarks': j.remarks ?? '',
    'Verified By': j.verified_by_name ?? '',
  };
}

/** The jobs of one sheet, oldest incoming first, optionally bounded by an
 *  incoming-date range (inclusive, `yyyy-mm-dd`, compared on the local day). */
export function registerJobs(jobs: IndoorJob[], sheet: RegisterSheet, from = '', to = ''): IndoorJob[] {
  const kind = REGISTER_SHEETS[sheet].kind;
  const day = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  return jobs
    .filter((j) => j.kind === kind)
    .filter((j) => { const d = day(j.received_at); return (!from || d >= from) && (!to || d <= to); })
    .sort((a, b) => (a.received_at < b.received_at ? -1 : a.received_at > b.received_at ? 1 : a.id - b.id));
}

// ---------------------------------------------------------------------------
// R/SER/QC/007
// ---------------------------------------------------------------------------
export const PDT_HEADER = {
  dept: 'QUALITY CONTROL',
  title: 'PRE DELIVERY TESTING',
  tmpl: 'TMPL No: R/SER/QC/007 Rev: AUG 2025',
} as const;

/** Checks 1-5 are judged OK / NOT OK; 6 is an instruction the form prints
 *  and nobody ticks. */
export const PDT_CHECKS: { no: number; text: string; key?: 'check1' | 'check2' | 'check3' | 'check4' | 'check5' }[] = [
  { no: 1, key: 'check1', text: 'Plugged into mains and switch on the machine working status.' },
  { no: 2, key: 'check2', text: 'Check all audible and visual alarms.' },
  { no: 3, key: 'check3', text: 'Connect gas source air and oxygen and disconnect check whether alarms are working perfectly.' },
  { no: 4, key: 'check4', text: 'Perform full auto test (if applicable).' },
  { no: 5, key: 'check5', text: 'Remove power and run the machine in internal battery mode.' },
  { no: 6, text: 'Only use the Accessories associated with the respective machine.' },
];

export const PDT_FIO2 = [21, 60, 100] as const;

type PdtNum = Exclude<{ [K in keyof IndoorPdt]: IndoorPdt[K] extends number | null ? K : never }[keyof IndoorPdt], 'id' | 'job_id'>;

/** The two mode tables: the SET values as the form prints them, and the
 *  measured rows at FiO2 21 / 60 / 100 %. */
export const PDT_MODES: { no: number; settings: string; rows: { label: string; keys: [PdtNum, PdtNum, PdtNum] }[] }[] = [
  { no: 7, settings: 'Mode CMV/ACMV, Patient category Adult, V=500 ml, RR=12bpm, I/E=33%, Peep=5',
    rows: [
      { label: 'Volume(Vte)', keys: ['cmv_vte_21', 'cmv_vte_60', 'cmv_vte_100'] },
      { label: 'Peep',        keys: ['cmv_peep_21', 'cmv_peep_60', 'cmv_peep_100'] },
      { label: 'O2%',         keys: ['cmv_o2_21', 'cmv_o2_60', 'cmv_o2_100'] },
    ] },
  { no: 8, settings: 'Mode PCMV, Patient category Adult, PI=20mbar, RR=12bpm, I/E=33%, Peep=5',
    rows: [
      { label: 'PIP',  keys: ['pcmv_pip_21', 'pcmv_pip_60', 'pcmv_pip_100'] },
      { label: 'Peep', keys: ['pcmv_peep_21', 'pcmv_peep_60', 'pcmv_peep_100'] },
      { label: 'O2%',  keys: ['pcmv_o2_21', 'pcmv_o2_60', 'pcmv_o2_100'] },
    ] },
];

/** What the database's dispatch rule (0320) would still call blank or NOT OK
 *  -- the same list, so the screen can say why Dispatch will be refused
 *  before somebody tries. The database decides; this only reports. */
export function pdtGaps(p: IndoorPdt | null): { blank: string[]; notOk: number[] } {
  if (!p) return { blank: ['the whole test'], notOk: [] };
  const blank: string[] = [];
  if (!p.test_date) blank.push('Date');
  if (!p.measuring_equipment_id?.trim()) blank.push('Measuring Equipment ID No');
  if (!p.software_version?.trim()) blank.push('Software Version');
  if (!p.hv?.trim()) blank.push('HV');
  if (!p.ht?.trim()) blank.push('HT');
  const checks = PDT_CHECKS.filter((c) => c.key).map((c) => p[c.key!]);
  if (checks.some((v) => v == null)) blank.push('checks 1-5');
  PDT_MODES.forEach((m) => {
    if (m.rows.some((r) => r.keys.some((k) => p[k] == null))) blank.push(m.no === 7 ? 'the CMV/ACMV readings' : 'the PCMV readings');
  });
  if (!p.inspected_by) blank.push('Inspected by (not signed)');
  const notOk = PDT_CHECKS.filter((c) => c.key && p[c.key] === 'NOT OK').map((c) => c.no);
  return { blank, notOk };
}

/** Does this job owe the test? Both halves of the user's rule: a DEMO unit,
 *  AND an imported product. `null` = imported-ness unknown (owes nothing until
 *  the Product Master says). */
export function pdtOwed(j: Pick<IndoorJob, 'kind' | 'product_imported'>): boolean | null {
  if (j.kind !== 'DEMO unit') return false;
  if (j.product_imported == null) return null;
  return j.product_imported === true;
}

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

export type RegisterSheet = 'customer' | 'demo' | 'newdevice';

/** Which jobs a sheet holds, by `kind`, and what each is called where. The
 *  workbook's sheet names are the user's ("Customer – Devices", "Demo"); the
 *  printed title is the paper's ("CUSTOMER – DEVICE's", "DEMO"). */
export const REGISTER_SHEETS: Record<RegisterSheet, { kind: string; xlsxName: string; printTitle: string }> = {
  customer: { kind: 'Customer property', xlsxName: 'Customer – Devices', printTitle: 'CUSTOMER – DEVICE’s' },
  demo:     { kind: 'DEMO unit',         xlsxName: 'Demo',               printTitle: 'DEMO' },
  // 0374: a New device has its own sheet, apart from the demos.
  newdevice: { kind: 'New device',       xlsxName: 'New Devices',        printTitle: 'NEW DEVICE' },
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

// ---------------------------------------------------------------------------
// INDOOR_DC -- the workshop's delivery challan (0321).
//
// THE TEMPLATE'S OWN TEXT, in one constant. Deliberately NOT the COMPANY
// constant of src/lib/dc.ts: that is the spare DC's letterhead, and this form
// prints the SERVICE CENTER's address as the user's template carries it.
// ---------------------------------------------------------------------------
export const INDOOR_DC_FORM = {
  org: 'AIR LIQUIDE MEDICAL SYSTEMS PVT. LTD.',
  // No department line (the user, 2026-10-04: "Service Center can be Removed").
  dept: '',
  address: [
    '5th Floor, Tower-B, “Tek Meadows”, 51, Rajiv Gandhi Salai,',
    'Sholinganallur, Chennai - 600 119. India.',
  ],
  tel: 'Tel : +91 44 4385 1116 / 17, 4385 1187 / 88',
  email: 'E-mail : service.almsindia@airliquide.com',
  title: 'DELIVERY CHALLAN (DC)',
  gstin: 'GSTIN : 33AAACE8420F1Z3',
  columns: ['S.No.', 'PART No.', 'DESCRIPTION', 'QTY.', 'PURPOSE'],
  // The user, 2026-10-04: "Issued By (Stores) - Rename to Issued By", and
  // "Packed & Despatch By" removed.
  signBoxes: ['ISSUED BY', 'AUTHORISED BY', 'RECEIVED BY (WITH DATE)'],
  note: 'Note : Kindly return us one copy of DC duly signed',
} as const;

/** Whom a job goes back to: its party (customer property) or the party it is
 *  going to (a DEMO unit). The DATABASE asks the same (create_indoor_dc), and
 *  refuses jobs whose consignees differ. */
export function jobConsignee(j: Pick<IndoorJob, 'kind' | 'party_name' | 'demo_for_party'>): string {
  // A New device (0374) has no customer either: it goes where it is going.
  return String((j.kind === 'DEMO unit' || j.kind === 'New device' ? j.demo_for_party : j.party_name) ?? '').trim();
}
export const consigneeKey = (s: string) => s.trim().toUpperCase();

/** The equipment line's DESCRIPTION, as the database writes it. */
export const equipmentDescription = (name: string, serial: string) =>
  `${name.trim()}${serial.trim() ? ` Sl.No ${serial.trim()}` : ''}`.trim();

// ---------------------------------------------------------------------------
// THE STAGES (0323, the user, 2026-10-02; FOUR since 2026-10-03, when the
// Indoor Service Report became the Repair stage: "Section 3 of the current form
// is covered as part of the uploaded service report"): Intake -> Cleaning ->
// Repair (the service report) -> DC (pending approval) -> Dispatched / Approved.
//
// DERIVED FROM THE JOB, never stored: a second status column would be a second
// thing to keep in step with `status`, `cleaned_at`, the uploaded report and
// the DC. Each step is DONE by a fact the database records:
//   Intake    -- the job exists;
//   Cleaning  -- cleaned_at;
//   Repair    -- report_file_url (the uploaded Indoor Service Report, which
//                carries the repair's work details);
//   DC        -- a DC No. on the job AND that DC approved (or a unit out:
//                Dispatched / Closed). A DC No. whose DC is pending approval
//                is the step IN PROGRESS.
// The CURRENT step is the first one not done. The order is enforced by the
// database where it is a rule (no report before cleaning, no DC before the
// report, no dispatch while the DC is pending); nothing is timed. What a DC
// needs beyond the report (status Ready, the QC, the PDT) is still the
// database's to refuse -- this is only where the job stands.
// ---------------------------------------------------------------------------
export const INDOOR_STAGES = ['Intake', 'Cleaning', 'Repair', 'DC'] as const;

/** THE IDENTIFICATION TAG (4.5.4) IS A YES / NO, not a typed number (the user,
 *  2026-10-04: "Identification Tag - Yes, Identified ; Not Identified"), for
 *  the unit and for each accessory. A value typed before this stays on its job
 *  and is offered beside the two, so nothing already recorded is lost. */
export const INDOOR_TAG_OPTIONS = ['Yes, Identified', 'Not Identified'] as const;
export const tagOptions = (current: string | null | undefined): string[] =>
  current && !(INDOOR_TAG_OPTIONS as readonly string[]).includes(current)
    ? [...INDOOR_TAG_OPTIONS, current] : [...INDOOR_TAG_OPTIONS];

/** THE INTAKE'S THREE WAYS IN (the user, 2026-10-04: "Split Demo / New
 *  Device -> Demo, New Device as Separate Options"): each fixes the job's kind
 *  and its activity. */
export const INTAKE_MODES = {
  call:      { label: 'Field Return', kind: 'Customer property', activity: 'Troubleshooting' },
  demo:      { label: 'Demo',         kind: 'DEMO unit',         activity: 'Demo' },
  newdevice: { label: 'New Device',   kind: 'New device',        activity: 'Troubleshooting' },
} as const;
export type IntakeMode = keyof typeof INTAKE_MODES;

/** A FIELD RETURN IS A TROUBLESHOOTING JOB (the user, 2026-10-04: "Fix it to
 *  Troubleshooting - when it is Field Return"). */
export const FIELD_RETURN_ACTIVITY = 'Troubleshooting';
export type IndoorStage = typeof INDOOR_STAGES[number];

export interface StageState {
  /** Index into INDOOR_STAGES of the step in progress; 4 = all done. */
  current: number;
  done: boolean[];
  /** The one-line state shown on the row and the stepper. */
  label: string;
  /** Condemned leaves the path altogether. */
  offPath: boolean;
}

/** One past the last stage: every step done (or off the path). */
export const STAGES_DONE = INDOOR_STAGES.length;

type StageJob = Pick<IndoorJob, 'status' | 'cleaned_at' | 'report_file_url' | 'dispatch_ref'>;

/** `dcStatus` is the approval status of the job's Indoor DC, where the job
 *  carries an IDC number and the DC is known; undefined otherwise. */
export function jobStage(j: StageJob, dcStatus?: string): StageState {
  const out = ['Dispatched', 'Closed'].includes(j.status);
  const dcNo = String(j.dispatch_ref ?? '').trim();
  const pending = !!dcNo && dcStatus === 'Pending approval';
  const done = [
    true,
    !!j.cleaned_at,
    !!String(j.report_file_url ?? '').trim(),
    out || (!!dcNo && !pending),
  ];
  if (j.status === 'Condemned') return { current: STAGES_DONE, done, label: 'Condemned', offPath: true };
  // A UNIT THAT HAS LEFT HAS LEFT, whatever an older record lacks (a job
  // dispatched before 0323 has no uploaded report): it is not "awaiting" one.
  if (out) return { current: STAGES_DONE, done, label: 'Dispatched', offPath: false };
  const current = done.findIndex((d) => !d);
  const label = current === -1
    ? 'DC approved — ready to dispatch'
    : current === 1 ? 'Awaiting cleaning'
    : current === 2 ? (j.status === 'Awaiting spares' ? 'Awaiting spares' : j.status === 'QC' ? 'Quality check' : 'Under repair')
    : pending ? 'DC pending approval'
    : j.status === 'Ready' ? 'Ready for DC'
    : 'Report uploaded — not Ready yet';
  return { current: current === -1 ? STAGES_DONE : current, done, label, offPath: false };
}

/** THE FILE NAME of an uploaded Indoor Service Report: "<report no>_<original
 *  file name>", so the file in Drive traces back to the register. Characters a
 *  Drive file name or the bridge cannot carry (/ \ : * ? " < > |) become "-". */
export function indoorReportFileName(reportNo: string, original: string): string {
  const clean = (v: string) => v.trim().replace(/[\\/:*?"<>|]/g, '-');
  return `${clean(reportNo)}_${clean(original) || 'report'}`;
}

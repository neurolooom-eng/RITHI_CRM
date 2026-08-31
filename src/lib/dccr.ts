// ---------------------------------------------------------------------------
// Daily Call Review — DCCR (Daily Customer Complaint Review Register).
//
// Every FIELD call goes through a review, every day, in three stages:
//
//   Review 1  Public Health Threat? / Death? / Serious Incident?
//             — answered on the Call Registration form itself, so its DATE is
//               the call registration date and nothing extra is stored.
//   Review 2  Risk to Patient (any clinical impact) / Warranty Failure (1yr) /
//             Frequent Failure.
//   Review 3  Complaint Grouping / Root Cause Key Word /
//             Spare · Consumable · Correction · Calibration.
//
// ANY POTENTIAL EFFECT and ACTION TAKEN are DERIVED — the database computes
// them (0044_daily_call_review.sql) and this file mirrors the same rules so a
// half-filled drawer can show the reader what their answers will produce
// before they save.
// ---------------------------------------------------------------------------

export const YES_NO = ['YES', 'NO'];

// Review 3's third answer — what closed the call out.
export const SPARE_CATEGORY = ['SPARE', 'CONSUMABLE', 'CORRECTION', 'CALIBRATION', 'OTHERS'];

// The two masters the review reads. Both are tagged per product; a value
// tagged COMM is common to every product.
export const GROUPING_MASTER = 'dccrgrouping';
export const ROOT_CAUSE_MASTER = 'rootcause';
export const COMMON_PRODUCT = 'COMM';

export type ReviewStatus = 'Review 1 Pending' | 'Review 2 Pending' | 'Review 3 Pending' | 'Review Completed';
export const REVIEW_STATUSES: ReviewStatus[] = ['Review 1 Pending', 'Review 2 Pending', 'Review 3 Pending', 'Review Completed'];

export const REVIEW_STATUS_TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary'> = {
  'Review 1 Pending': 'danger',
  'Review 2 Pending': 'warning',
  'Review 3 Pending': 'info',
  'Review Completed': 'success',
};

// One row of the register: the call, its three stages, and what they derive.
export interface ReviewRow extends Record<string, unknown> {
  id?: number;
  ucn: string;
  call_number: string;
  reg_date: string | null;
  complaint_date: string | null;
  party_name: string;
  city: string;
  state: string;
  product_name: string;
  serial: string;
  item_status: string;
  call_type: string;
  standard_complaint: string;
  complaint_reported: string;
  allocated_to: string;
  warranty_number: string;
  warranty_start: string | null;
  status: string;
  open_state: string;
  last_status: string;
  last_visit_at: string | null;
  // What the reviewer judges the call by — all of it from the report (0047)
  age_days: number | null;
  age_group: string;
  visit_details: string;      // every visit, newest first: "date : what was done"
  visit_count: number;
  sw_version: string;
  observation: string;
  job_done: string;
  pending_reason: string;
  visit_engineer: string;
  spares_consumed: string;
  spares_count: number;
  // Review 1
  public_health_threat: string;
  death: string;
  serious_incident: string;
  review1_at: string | null;
  review1_done: boolean;
  // Review 2
  risk_to_patient: string;
  warranty_failure: string;
  frequent_failure: string;
  review2_at: string | null;
  review2_by: string;
  review2_done: boolean;
  // Review 3
  complaint_grouping: string;
  root_cause_keyword: string;
  spare_category: string;
  service_observation: string;
  review3_at: string | null;
  review3_by: string;
  review3_done: boolean;
  // Derived
  any_potential_effect: string;
  action_taken: string;
  review_status: ReviewStatus;
}

// What a review drawer sends back. Only the answers — the dates, the potential
// effect and the action are the database's to decide.
export interface ReviewPatch {
  risk_to_patient?: string;
  warranty_failure?: string;
  frequent_failure?: string;
  review2_by?: string;
  complaint_grouping?: string;
  root_cause_keyword?: string;
  spare_category?: string;
  service_observation?: string;
  action_taken?: string;
  review3_by?: string;
}

const yes = (v: unknown) => String(v ?? '').trim().toUpperCase() === 'YES';
const filled = (v: unknown) => String(v ?? '').trim() !== '';

// ANY POTENTIAL EFFECT — the register's ARRAYFORMULA:
//   blank while any of the three Review 2 answers is blank, then YES if any of
//   them is YES, else NO.
export function potentialEffect(risk: unknown, warranty: unknown, frequent: unknown): string {
  if (!filled(risk) || !filled(warranty) || !filled(frequent)) return '';
  return yes(risk) || yes(warranty) || yes(frequent) ? 'YES' : 'NO';
}

// ACTION TAKEN — a potential effect calls for a Field Failure Report. Whoever
// raises it types the FFR number over this.
export const FFR_ACTION = 'FFR Generation';
export const actionFor = (effect: string, current = ''): string =>
  effect === 'YES' ? (current.trim() || FFR_ACTION) : (current.trim() === FFR_ACTION ? '' : current);

export const review1Done = (r: { public_health_threat?: unknown; death?: unknown; serious_incident?: unknown }): boolean =>
  filled(r.public_health_threat) && filled(r.death) && filled(r.serious_incident);
export const review2Done = (r: { risk_to_patient?: unknown; warranty_failure?: unknown; frequent_failure?: unknown }): boolean =>
  filled(r.risk_to_patient) && filled(r.warranty_failure) && filled(r.frequent_failure);
export const review3Done = (r: { complaint_grouping?: unknown; root_cause_keyword?: unknown; spare_category?: unknown }): boolean =>
  filled(r.complaint_grouping) && filled(r.root_cause_keyword) && filled(r.spare_category);

// Which stage is outstanding — the register's Review Status column.
export function reviewStatus(r: Parameters<typeof review1Done>[0] & Parameters<typeof review2Done>[0] & Parameters<typeof review3Done>[0]): ReviewStatus {
  if (!review1Done(r)) return 'Review 1 Pending';
  if (!review2Done(r)) return 'Review 2 Pending';
  if (!review3Done(r)) return 'Review 3 Pending';
  return 'Review Completed';
}

// ---------------------------------------------------------------------------
// THE EXPORT FORMAT — the DCCR register's own columns, in its own order and
// under its own headings, so an exported file drops straight into the workbook
// the review has always been kept in.
// ---------------------------------------------------------------------------
export interface ExportColumn { key: string; header: string }
export const DCCR_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'sl_no', header: 'Sl. NO' },
  { key: 'reg_date', header: 'CALL DATE' },
  { key: 'complaint_date', header: 'COMPLAINT DATE' },
  { key: 'call_number', header: 'Call Number' },
  { key: 'ucn', header: 'UC Number' },
  { key: 'party_name', header: 'CUSTOMER NAME' },
  { key: 'city', header: 'PLACE' },
  { key: 'product_name', header: 'PRODUCT' },
  { key: 'serial', header: 'SERIAL No.' },
  { key: 'call_type', header: 'CALL TYPE' },
  { key: 'standard_complaint', header: 'Standard Complaint' },
  { key: 'complaint_reported', header: 'NATURE OF COMPLAINT' },
  { key: 'item_status', header: 'EQUIP. STATUS' },
  { key: 'allocated_to', header: 'ENGINEER' },
  { key: 'call_status', header: 'CALL STATUS' },
  { key: 'warranty_number', header: 'WARRANTY NO' },
  { key: 'warranty_start', header: 'WARRANTY START DATE' },
  { key: 'public_health_threat', header: 'Public Health Threat?' },
  { key: 'death', header: 'Death?' },
  { key: 'serious_incident', header: 'Serious Incident?' },
  { key: 'review1_at', header: 'DATE OF REVIEW 1' },
  { key: 'review1_completed', header: 'Review1 Completed' },
  { key: 'risk_to_patient', header: 'RISK TO PATIENT/ANY CLINICAL IMPACT' },
  { key: 'warranty_failure', header: 'WARRANTY FAILURE (1YR)' },
  { key: 'frequent_failure', header: 'FREQUENT FAILURE' },
  { key: 'review2_at', header: 'DATE OF REVIEW 2' },
  { key: 'review2_completed', header: 'Review2 Completed' },
  { key: 'any_potential_effect', header: 'ANY POTENTIAL EFFECT' },
  { key: 'action_taken', header: 'ACTION TAKEN' },
  { key: 'service_observation', header: 'Service Dept Observation' },
  { key: 'complaint_grouping', header: 'COMPLAINT GROUPING' },
  { key: 'root_cause_keyword', header: 'ROOT CAUSE KEY WORD' },
  { key: 'spare_category', header: 'SPARE / CONSUMABLE / CORRECTION / CALIBRATION' },
  { key: 'review3_at', header: 'DATE OF REVIEW 3' },
  { key: 'review3_completed', header: 'Review3 Completed' },
  { key: 'review_status', header: 'Review Status' },
  { key: 'current_call_status', header: 'CURRENT CALL STATUS' },
  { key: 'last_visit_at', header: 'Call Solved Date & Time' },
  { key: 'visit_details', header: 'VISIT REMARKS (Reporting)' },
  { key: 'spares_consumed', header: 'SPARES CONSUMED' },
  { key: 'sw_version', header: 'SW Version' },
  { key: 'age_days', header: 'Failure within how many days/yrs' },
  { key: 'age_group', header: 'Failure Within Grouping' },
];

// The register's own banding of a product's age at failure. Mirrors
// failure_age_group() in 0047 — whole years, capped at 5.
export function ageGroup(days: number | null | undefined): string {
  if (days == null || days < 0) return '';
  if (days < 365) return 'With in 1 yr';
  if (days < 730) return 'More than 1 yr';
  if (days < 1095) return 'More than 2 yrs';
  if (days < 1460) return 'More than 3 yrs';
  if (days < 1825) return 'More than 4 yrs';
  return 'More than 5 yrs';
}

// dd-mmm-yyyy, the shape every date in the register carries.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function exportDate(v: unknown, withTime = false): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const day = `${String(d.getDate()).padStart(2, '0')}-${MON[d.getMonth()]}-${d.getFullYear()}`;
  if (!withTime) return day;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${day} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// One register row as the export carries it. `index` is the row's Sl. NO.
export function toExportRow(r: ReviewRow, index: number): Record<string, unknown> {
  return {
    sl_no: index + 1,
    reg_date: exportDate(r.reg_date),
    complaint_date: exportDate(r.complaint_date),
    call_number: r.call_number ?? '',
    ucn: r.ucn ?? '',
    party_name: r.party_name ?? '',
    city: r.city ?? '',
    product_name: r.product_name ?? '',
    serial: r.serial ?? '',
    call_type: r.call_type ?? '',
    standard_complaint: r.standard_complaint ?? '',
    complaint_reported: r.complaint_reported ?? '',
    item_status: r.item_status ?? '',
    allocated_to: r.allocated_to ?? '',
    call_status: r.last_status || r.status || '',
    warranty_number: r.warranty_number ?? '',
    warranty_start: exportDate(r.warranty_start),
    public_health_threat: r.public_health_threat ?? '',
    death: r.death ?? '',
    serious_incident: r.serious_incident ?? '',
    review1_at: exportDate(r.review1_at),
    review1_completed: r.review1_done ? 'Yes' : 'No',
    risk_to_patient: r.risk_to_patient ?? '',
    warranty_failure: r.warranty_failure ?? '',
    frequent_failure: r.frequent_failure ?? '',
    review2_at: exportDate(r.review2_at),
    review2_completed: r.review2_done ? 'Yes' : 'No',
    any_potential_effect: r.any_potential_effect ?? '',
    action_taken: r.action_taken ?? '',
    service_observation: r.service_observation ?? '',
    complaint_grouping: r.complaint_grouping ?? '',
    root_cause_keyword: r.root_cause_keyword ?? '',
    spare_category: r.spare_category ?? '',
    review3_at: exportDate(r.review3_at),
    review3_completed: r.review3_done ? 'Yes' : 'No',
    review_status: r.review_status ?? '',
    current_call_status: r.open_state || r.last_status || r.status || '',
    last_visit_at: exportDate(r.last_visit_at, true),
    visit_details: r.visit_details ?? '',
    spares_consumed: r.spares_consumed ?? '',
    sw_version: r.sw_version ?? '',
    age_days: r.age_days ?? '',
    age_group: r.age_group ?? '',
  };
}

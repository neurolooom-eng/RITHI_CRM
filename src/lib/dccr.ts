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

// ---------------------------------------------------------------------------
// WHICH VALUES A CALL'S PRODUCT MAY BE REVIEWED WITH.
//
// The user's rule (2026-09-07): "in case of T60 and T75 -- only the specific
// drop downs should come. in case of Other Products all the drop-downs can
// come."
//
// The two Monnal ventilators are the machines with a CURATED list — alarm
// codes and failure modes that belong to that machine and mean nothing on
// another. Offering a T60 engineer the common list alongside them buries the
// codes they actually need, so for those two the list is exactly their own.
//
// Every other product has no curated list of its own, so narrowing it to COMM
// would leave a handful of generic values and no way to say what happened.
// They get everything, and pick.
//
// Matched on the T60 / T75 TOKEN rather than the whole name: the register
// writes "MONNAL T60" and the master tags "MONNAL T60", but a name that says
// "Monnal T-60" or just "T75" must not silently fall out of the rule. The
// boundary check is what stops "T750" reading as "T75".
// ---------------------------------------------------------------------------
export const CURATED_PRODUCTS = ['T60', 'T75'] as const;
export type CuratedProduct = typeof CURATED_PRODUCTS[number];

export function curatedProduct(name: string): CuratedProduct | '' {
  const s = String(name ?? '').toUpperCase();
  for (const p of CURATED_PRODUCTS) {
    // T60 / T75 as its own token: preceded and followed by a non-digit (or an
    // edge), so MONNAL T60, T60, T-60 all match and T601 does not.
    if (new RegExp(`(^|[^0-9A-Z])${p}([^0-9]|$)`).test(s.replace(/T-(\d)/g, 'T$1'))) return p;
  }
  return '';
}

// Does a master value tagged `tag` belong in the dropdown for `product`?
export function masterValueApplies(tag: string, product: string): boolean {
  const want = curatedProduct(product);
  if (!want) return true;                          // any other product — all of them
  return curatedProduct(tag) === want;             // T60 / T75 — only their own
}

export type ReviewStatus = 'Review 1 Pending' | 'Review 2 Pending' | 'Review 3 Pending' | 'Review Completed';
export const REVIEW_STATUSES: ReviewStatus[] = ['Review 1 Pending', 'Review 2 Pending', 'Review 3 Pending', 'Review Completed'];

// THE CALL's own state, which is a different fact from the paperwork's. Kept
// beside the review tones so the two are read together and nobody colours
// "Unattended" as though it were a review stage.
export const CALL_STATE_TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary'> = {
  Unattended: 'danger',
  Unsolved: 'warning',
  'Report pending': 'info',
  Solved: 'success',
  Cancelled: 'neutral',
  Reopened: 'warning',
};

// ---------------------------------------------------------------------------
// AUTO SAVE — DCCR ONLY, AND OFF UNLESS SOMEBODY TURNS IT ON.
//
// The user asked for it and scoped it themselves: "Auto Save is RESTRICTED
// only to DCCR". So the switch lives here rather than in Settings, where it
// would read as an application-wide behaviour, and it is per-reviewer: it is a
// preference about how somebody works, not a configuration of the register.
//
// WHAT IT WILL AND WILL NOT DO, because in a quality record that distinction
// is the whole design:
//
//   * it saves the ANSWERS as they are chosen;
//   * it does NOT complete a review. `review2_by` / `review3_by` — "this stage
//     was completed by" — are stamped only by the Save button. Choosing the
//     third dropdown must not, by itself, put somebody's name against a
//     judgement they have not looked at, and "All NO" fills three boxes in one
//     click precisely so a person can then read them.
//
// Off by default: a reviewer opting into it has decided their edits should
// land as they type; nobody should discover that by accident.
// ---------------------------------------------------------------------------
export const AUTOSAVE_KEY = 'rithi.dccr.autosave';
export const AUTOSAVE_DELAY_MS = 1500;

// ---------------------------------------------------------------------------
// WHOSE SETTING IS IT? BOTH, AND THE LATER ONE WINS.
//
// An administrator can set it for everyone ("Save / Apply for Everyone", the
// user's ask 2026-09-06) and a reviewer can still set it for themselves. The
// question that then decides everything is what happens when the two disagree.
//
// Neither "the admin always wins" nor "a personal choice always wins" is
// right: the first makes the reviewer's switch a lie, the second makes "apply
// for everyone" a lie. So BOTH CARRY A TIME, and the later decision stands. An
// administrator applying it to everyone overrides the choices made before that
// moment — which is what "for everyone" has to mean — and a reviewer who
// changes it afterwards keeps their change.
//
// The same shape the ALMS theme uses for its default: a stored value is
// honoured against WHEN it was stored, not merely because it exists.
// ---------------------------------------------------------------------------
export interface AutoSaveChoice { on: boolean; at: number }

export function readMyAutoSave(): AutoSaveChoice | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    // The old shape was a bare '1'/'0'. Treat it as a choice made at the dawn
    // of time, so any admin default supersedes it — an upgrade must not look
    // like somebody actively choosing.
    if (raw === '1' || raw === '0') return { on: raw === '1', at: 0 };
    const v = JSON.parse(raw) as Partial<AutoSaveChoice>;
    return typeof v?.on === 'boolean' ? { on: v.on, at: Number(v.at ?? 0) } : null;
  } catch { return null; }
}

export function writeMyAutoSave(on: boolean): void {
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ on, at: Date.now() })); }
  catch { /* a preference is not worth an error */ }
}

// The effective setting: the later of the two decisions, or off if neither was
// ever made. `orgAt` is when an administrator last applied it to everyone.
export function effectiveAutoSave(mine: AutoSaveChoice | null, org: { on: boolean; at: number } | null): boolean {
  if (!mine && !org) return false;
  if (!mine) return org!.on;
  if (!org) return mine.on;
  return mine.at >= org.at ? mine.on : org.on;
}

// A CALL THAT FAILED INSIDE ITS FIRST YEAR IS REVIEWED ONE BY ONE.
//
// The user's rule (2026-09-06). Review 2 asks whether the failure was a
// Warranty Failure (1 yr), so a machine under a year old is precisely the case
// the question exists for — and precisely the one nobody should answer forty
// at a time. An UNKNOWN age is treated the same way: "not known to be inside
// its first year" is not "known to be outside it", and answering "not a
// warranty failure" for a machine whose age nobody can state is the one
// direction that cannot be defended afterwards.
//
// Pure, and mirrored exactly by `bulk_set_review2` (0119). The screen uses it
// to grey the row out; the database uses its own copy to refuse the write, so
// a hidden checkbox is never the only thing standing in the way.
export const FIRST_YEAR_DAYS = 366;

// DID THIS MACHINE FAIL INSIDE ITS FIRST YEAR? A different question from
// "may it be answered in bulk": a call already answered is not eligible for
// bulk but is not a warning, and a warning is what this is for.
export function firstYearFailure(row: { age_days?: unknown }): boolean {
  const age = row.age_days;
  if (age === null || age === undefined || age === '') return false;
  const n = Number(age);
  return Number.isFinite(n) && n < FIRST_YEAR_DAYS;
}

export function bulkReview2Block(row: { age_days?: unknown; review2_done?: unknown }): string {
  if (row.review2_done === true) return 'Review 2 is already answered';
  const age = row.age_days;
  if (age === null || age === undefined || age === '' || Number.isNaN(Number(age))) {
    return 'age at failure is not known — review it one by one';
  }
  if (Number(age) < FIRST_YEAR_DAYS) return 'failed within the first year — review it one by one';
  return '';
}

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
  // THE REVIEW DATES, EDITABLE BY AN ADMINISTRATOR ONLY (the user's ask,
  // 2026-09-12: "expose the DCCR register including the review date for me to
  // edit old information [Only for Admin]").
  //
  // They are normally the database's: 0044 stamps each when its stage is
  // completed. But it stamps ONLY WHEN THE COLUMN IS NULL, so a value supplied
  // here passes straight through — no migration was needed, and none should be
  // invented. Correcting history is what this is for: a review answered on
  // paper weeks ago and typed in today otherwise reads as reviewed today, and
  // the FFR it raises would carry the wrong date with it.
  review1_at?: string | null;
  review2_at?: string | null;
  review3_at?: string | null;
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
//
// THE ORDER IS WRR-2026's, columns 15-67. That is not a coincidence and it is
// not a constraint imposed on the register either: the reliability workbook has
// always pulled this same DCCR in by IMPORTRANGE, so the two lists were already
// the same 43 columns in the same relative order. The ten below were the only
// difference, and inserting them at their WRR positions makes an export drop
// straight into that sheet as well as into the review workbook.
//
// NINE OF THEM ARE DELIBERATELY BLANK (the user, 2026-09-08: "for now add those
// columns and leave it blank"). Six -- CALL DETAILS, VISIT REMARKS, CHANGE
// PRODUCT?, SEND EMAIL FOR DEFECTIVE SPARE, SL NO(T) and Complaint -- came from
// the old AppSheet export and nothing here records what they held; three of
// those are near-duplicates of columns that ARE exported, which is exactly where
// a wrong guess would go unnoticed. `Updated By` and `Updated Date` exist on
// `call_reviews` but not on the view this screen reads, so filling them is a
// migration rather than a line. `DUMMY COLUMN` is a spacer and is blank by
// design. A column present and empty still holds the sheet's shape, which is the
// point of adding them now.
export const DCCR_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'updated_by', header: 'Updated By' },
  { key: 'updated_date', header: 'Updated Date' },
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
  { key: 'pending_reason', header: 'CALL PENDING REASON' },
  { key: 'warranty_number', header: 'WARRANTY NO' },
  { key: 'warranty_start', header: 'WARRANTY START DATE' },
  { key: 'call_details', header: 'CALL DETAILS' },
  { key: 'visit_remarks', header: 'VISIT REMARKS' },
  { key: 'change_product', header: 'CHANGE PRODUCT?' },
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
  { key: 'send_email_defective_spare', header: 'SEND EMAIL FOR DEFECTIVE SPARE' },
  { key: 'current_call_status', header: 'CURRENT CALL STATUS' },
  { key: 'last_visit_at', header: 'Call Solved Date & Time' },
  { key: 'visit_details', header: 'VISIT REMARKS (Reporting)' },
  { key: 'spares_consumed', header: 'SPARES CONSUMED' },
  { key: 'sw_version', header: 'SW Version' },
  { key: 'sl_no_t', header: 'SL NO(T)' },
  { key: 'complaint', header: 'Complaint' },
  { key: 'age_days', header: 'Failure within how many days/yrs' },
  { key: 'age_group', header: 'Failure Within Grouping' },
  { key: 'dummy_column', header: 'DUMMY COLUMN' },
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
export function exportDate(v: unknown, withTime = false): string {
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
    // Blank on purpose -- see the note on DCCR_EXPORT_COLUMNS. They hold the
    // WRR-2026 shape so an export pastes into it without shifting a column.
    updated_by: '',
    updated_date: '',
    call_details: '',
    visit_remarks: '',
    change_product: '',
    send_email_defective_spare: '',
    sl_no_t: '',
    complaint: '',
    dummy_column: '',
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
    // Not blank: the register already carries this one, and a column left empty
    // where the data is in hand is a loss, not a placeholder.
    pending_reason: r.pending_reason ?? '',
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

// ---------------------------------------------------------------------------
// THE REGISTER HOLDS THE YEAR, AND STARTS FRESH IN JANUARY.
//
// It is a DAILY review, and it used to open on the last 30 days for that
// reason — which made a register with 3,850 calls in it show 425 and look like
// the upload had failed. The unit people actually work in is the YEAR: the DCCR
// folds the whole of it, and the next one starts clean (the user's rule,
// 2026-09-05).
//
// Local date parts, not `toISOString()`: that is UTC, and on 1 January before
// 05:30 IST it would still be saying last year.
// ---------------------------------------------------------------------------
export function yearStartISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-01-01`;
}

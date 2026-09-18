// ---------------------------------------------------------------------------
// REPORTS — the consumption report, and the shape of any that follow.
//
// The user's ask (2026-09-08): "i need the attached format for consumption
// report. add all the additional column present in the consumption table to the
// end. add a provision for the user to add filter before downloading and also
// the user should be able to select the required column -- whatever is in
// screenshot has to be there ( Mandatory Columns) rest the user can add or
// remove."
//
// So a report is THREE things and this file holds all three, because a column
// list that lives in one place cannot disagree with itself:
//
//   MANDATORY   the columns from the screenshot, in the screenshot's order.
//               The picker shows them ticked and DISABLED -- not hidden. A
//               reader has to be able to see that they are always there, and
//               why; a column silently missing from a picker looks like an
//               oversight rather than a rule.
//   OPTIONAL    everything else the view carries, off by default.
//   FILTERS     applied in the DATABASE, not after the download. A filter that
//               runs in the browser can only narrow what was already fetched,
//               and this register pages -- so it would quietly report on the
//               first page and call it the whole answer.
//
// The headings ARE the view's column names, quoted in 0142 to match the sheet
// exactly ("Visit Date & Time", "QTY", "Serial No"). There is no second
// spelling to keep in step.
// ---------------------------------------------------------------------------

export interface ReportColumn {
  /** The view's column name AND the heading in the file — deliberately one. */
  key: string;
  /** Always exported, never unticked. The user's screenshot. */
  mandatory?: boolean;
}

// THE SCREENSHOT, column for column and in its order. Changing this list changes
// what the report IS, so it is not a preference and not stored per user.
export const CONSUMPTION_MANDATORY: string[] = [
  'UC Number',
  'Call Number',
  'Call Type',
  'Visit Entry Date',
  'Visit Date & Time',
  'Visiting Service Engineer',
  'Spares Used',
  'Part name',
  'QTY',
  'Product',
  'Serial No',
  'Customer',
  'City',
  'Complaint',
  'Item Status',
  'Call Date',
];

// Everything else `consumption_report` carries — the rest of the consumption
// line, then the call fields worth having. Off unless asked for.
export const CONSUMPTION_OPTIONAL: string[] = [
  'Line ID',
  'Part (code|description)',
  'Source',
  'Remarks',
  'Recorded By',
  'Engineer Email',
  'Original Qty',
  'Adjusted By',
  'Adjusted At',
  'Adjustment Reason',
  'GRIR',
  'Source Ref',
  'Source Ref Key',
  'Created At',
  'Created By',
  'Extra (import)',
  'Nature of Complaint',
  'State',
  'Allocated To',
  'Call Status',
  'Warranty No',
  'Contract No',
  'Contract Type',
  // The VISIT this spare belongs to (0215). Last, because `create or replace
  // view` can only append — and this list is the view's order, so it goes last
  // here too. IT WAS MISSING FOR A DAY: the column was added to the view and
  // not to this list, and a column the picker does not offer cannot be
  // exported by anybody, whatever the database carries. `check:reports` asks a
  // DATABASE for the view's columns now, in both directions.
  'Visit UID',
];

// TICKED BY DEFAULT, AND STILL REMOVABLE (the user, 2026-09-18: "Add Default
// Columns - Line ID , Source Ref Key , Created At to the Consumption Report").
//
// A THIRD STATE, deliberately, rather than adding these to MANDATORY: the
// mandatory list IS the handed-over format and is shown ticked and DISABLED, so
// putting them there would say the report cannot be taken without them. The ask
// was for a default, which is a starting point somebody may change.
//
// Every entry must also appear in CONSUMPTION_OPTIONAL, or it would be ticked
// in the picker and dropped on the way out — `exportColumns` builds the file
// from the OPTIONAL list. `check:ui` refuses that.
export const CONSUMPTION_DEFAULT_ON: string[] = [
  'Line ID',
  'Source Ref Key',
  'Created At',
];

export const CONSUMPTION_COLUMNS: ReportColumn[] = [
  ...CONSUMPTION_MANDATORY.map((key) => ({ key, mandatory: true })),
  ...CONSUMPTION_OPTIONAL.map((key) => ({ key })),
];

// What the user has narrowed to. Every field is optional; an empty filter is
// "the whole register", which is the honest default for a report.
export interface ConsumptionFilter {
  /** So the shared ReportBuilder can hold it — see CallReportFilter below. */
  [k: string]: string;
  from: string;          // call date, inclusive
  to: string;            // call date, inclusive
  product: string;       // contains
  party: string;         // contains
  city: string;          // contains
  engineer: string;      // contains
  part: string;          // contains — matches the code OR the description
  callType: string;      // exact family
  ucn: string;           // contains
}

export const EMPTY_CONSUMPTION_FILTER: ConsumptionFilter = {
  from: '', to: '', product: '', party: '', city: '',
  engineer: '', part: '', callType: '', ucn: '',
};

/** Which filters are actually set — so the page can say so, and the file can
 *  carry it. A report whose scope is not written down is a report somebody
 *  will later mistake for the whole register. */
export function describeFilter(f: ConsumptionFilter): string {
  const bits: string[] = [];
  if (f.from || f.to) bits.push(`Call date ${f.from || '…'} to ${f.to || '…'}`);
  if (f.product) bits.push(`Product contains "${f.product}"`);
  if (f.party) bits.push(`Customer contains "${f.party}"`);
  if (f.city) bits.push(`City contains "${f.city}"`);
  if (f.engineer) bits.push(`Engineer contains "${f.engineer}"`);
  if (f.part) bits.push(`Part contains "${f.part}"`);
  if (f.callType) bits.push(`Call type = ${f.callType}`);
  if (f.ucn) bits.push(`UCN contains "${f.ucn}"`);
  return bits.length ? bits.join(' · ') : 'the whole register — no filter set';
}

/** The columns to export, in the view's own order: mandatory first (the
 *  screenshot's order), then whichever optional ones are ticked, in the order
 *  they appear in the view rather than the order they were clicked. A file whose
 *  columns move between downloads is a file nobody can build a formula against. */
export function exportColumns(picked: Set<string>): string[] {
  return [
    ...CONSUMPTION_MANDATORY,
    ...CONSUMPTION_OPTIONAL.filter((c) => picked.has(c)),
  ];
}

// ---------------------------------------------------------------------------
// THE MANUAL REPORT — the signed service report the engineer files with a visit.
//
// It is written in TWO places on the same row and always has been:
// `reports.manual_report` (the column) and `data['Manual Report']` (the report
// form's own field). Sheet-era rows carry only the second. Three screens read
// it and each wrote its own coalesce; one of them checked neither the legacy key
// nor whether the value was a URL at all, so a row whose field held a note
// rendered as a link to nowhere.
//
// So: one reader. A link is a link only if it can be opened -- anything else
// comes back empty and the caller shows nothing, which is the honest answer.
// ---------------------------------------------------------------------------
export function manualReportLink(visit: Record<string, unknown> | null | undefined): string {
  if (!visit) return '';
  const data = (visit.data as Record<string, unknown> | undefined) ?? {};
  const link = String(visit.manual_report ?? data['Manual Report'] ?? '').trim();
  return /^https?:\/\//i.test(link) ? link : '';
}


// ---------------------------------------------------------------------------
// NOT USED AS PER THE REQUEST — the columns of `unused_spare_report` (0147), in
// the order somebody chasing one of these rows needs them: what the part is,
// where it went, and whose call it was, before the reference numbers.
//
// One list, not a mandatory/optional split. The consumption report has that
// because a format was handed over and the rest is extra; this report has no
// such format behind it, and eighteen columns is a page, not a picker.
// ---------------------------------------------------------------------------
export const UNUSED_SPARE_COLUMNS: string[] = [
  'ucn', 'call_number', 'OR No', 'Part Code', 'Part name', 'Finding',
  'Qty Sent', 'Qty Used', 'Qty Short', 'Stage',
  'DC No', 'Dispatched On', 'Received On', 'Engineer', 'Customer', 'Product',
  'Serial No', 'Item Status', 'Call Registered', 'Call Status', 'Allotted To',
  'State', 'City', 'Request UID', 'Engineer Email',
];

export interface UnusedSpareFilter { from: string; to: string; engineer: string; product: string; part: string }
export const EMPTY_UNUSED_FILTER: UnusedSpareFilter = { from: '', to: '', engineer: '', product: '', part: '' };

/** The filter in words, for the sheet that travels with the file. */
export function describeUnusedFilter(f: UnusedSpareFilter): string {
  const bits: string[] = [];
  if (f.from) bits.push(`Dispatched on or after ${f.from}`);
  if (f.to) bits.push(`Dispatched on or before ${f.to}`);
  if (f.engineer) bits.push(`Engineer contains "${f.engineer}"`);
  if (f.product) bits.push(`Product contains "${f.product}"`);
  if (f.part) bits.push(`Part code contains "${f.part}"`);
  return bits.length ? bits.join(' · ') : 'every flagged line — no filter set';
}

// ---------------------------------------------------------------------------
// THE CALL REPORT AND THE CUSTOMER FEEDBACK REPORT (the user, 2026-09-14: "Add
// Call Report , Customer Feedback Report -- Follow the Same concept of
// Consumption Report").
//
// SAME CONCEPT, which means the same three properties rather than the same
// columns: a mandatory core that is shown ticked and disabled, the rest
// optional and off, and a filter that runs in the DATABASE so the count on the
// button is what is about to be exported and not what happens to be loaded.
//
// THE KEYS ARE THE VIEW'S COLUMN NAMES, quoted in 0191 to be the headings too.
// There is no second spelling to keep in step.
// ---------------------------------------------------------------------------

// One row per CALL — never per visit. A call with four visits is one call, and
// a report that repeated it four times would have every count in it wrong.
export const CALL_REPORT_MANDATORY: string[] = [
  'UC Number',
  'Call Number',
  'Call Type',
  'Call Date',
  'Customer',
  'City',
  'State',
  'Product',
  'Serial No',
  'Complaint',
  'Allocated To',
  'Call Status',
  'Last Visit Date',
  'Visits',
];

export const CALL_REPORT_OPTIONAL: string[] = [
  'Complaint Date',
  'Last Visit Entry Date',
  'Last Visit Engineer',
  'Last Visit Status',
  'Last Pending Reason',
  'Spare Lines',
  'Spare Qty',
  'Spares Used',
  'Nature of Complaint',
  'Item Status',
  'Warranty No',
  'Warranty Start',
  'Warranty End',
  'Contract No',
  'Contract Start',
  'Contract End',
  'Contract Type',
  'Mode of Reporting',
  'Person Calling',
  'Contact Name',
  'Contact Number',
  'Contact Designation',
  'Contact Email',
  'Breakdown Date',
  'Public Health Threat',
  'Death',
  'Serious Incident',
  'Engineer Email',
  'Status (as keyed)',
  'Last Status',
  'Registered At',
  'Added On',
  'Reopened At',
  'Reopen Count',
  'Cancelled At',
  'Cancel Reason',
  'Created At',
];

export interface CallReportFilter {
  /** So the shared ReportBuilder can hold it. Declared HERE rather than
   *  loosening the builder to Record<string, string>, which would lose every
   *  key name at the call site — the filter fields are checked against these
   *  names and that is most of what makes the spec safe to write. */
  [k: string]: string;
  from: string;          // call date, inclusive
  to: string;            // call date, inclusive
  product: string;       // contains
  party: string;         // contains
  city: string;          // contains
  engineer: string;      // contains — the person the call is ALLOTTED to
  callType: string;      // exact family
  status: string;        // exact open_state
  ucn: string;           // contains
}
export const EMPTY_CALL_REPORT_FILTER: CallReportFilter = {
  from: '', to: '', product: '', party: '', city: '', engineer: '',
  callType: '', status: '', ucn: '',
};

export function describeCallFilter(f: CallReportFilter): string {
  const bits: string[] = [];
  if (f.from || f.to) bits.push(`Call date ${f.from || '…'} to ${f.to || '…'}`);
  if (f.product) bits.push(`Product contains "${f.product}"`);
  if (f.party) bits.push(`Customer contains "${f.party}"`);
  if (f.city) bits.push(`City contains "${f.city}"`);
  if (f.engineer) bits.push(`Allotted to contains "${f.engineer}"`);
  if (f.callType) bits.push(`Call type = ${f.callType}`);
  if (f.status) bits.push(`Call status = ${f.status}`);
  if (f.ucn) bits.push(`UCN contains "${f.ucn}"`);
  return bits.length ? bits.join(' · ') : 'the whole register — no filter set';
}

export const callReportColumns = (picked: Set<string>): string[] => [
  ...CALL_REPORT_MANDATORY,
  ...CALL_REPORT_OPTIONAL.filter((c) => picked.has(c)),
];

// ---------------------------------------------------------------------------
// CUSTOMER FEEDBACK. The questions are the export's own, verbatim (0191).
//
// The four PM/FIELD questions and the four INSTALLATION ones are MANDATORY
// TOGETHER even though no single feedback answers both sets: which questions
// were asked is a fact about the visit, and a file that carried only the ones
// this batch happened to answer would change shape between downloads.
// ---------------------------------------------------------------------------
export const FEEDBACK_REPORT_MANDATORY: string[] = [
  'UC Number',
  'Date',
  'Visit Date',
  'Call Number',
  'Call Type',
  'Customer',
  'State',
  'Product',
  'Serial No',
  'Visiting Service Engineer',
  'Operating Feasibility',
  'General Support',
  'Product Meets Requirement',
  'Reliability of Product',
  'Reliability of Service',
  'Promptness for Service Calls',
];

export const FEEDBACK_REPORT_OPTIONAL: string[] = [
  'Complaint',
  'Startup, Training and Handover',
  'Packing and Forwarding',
  'Delivery Adherence',
  'Warranty Start Date?',
  'Advance PM Done?',
  'Remarks',
  'Engineer Email',
  'Source',
  'Loaded From',
  'Loaded On',
  'All Answers',
];

export interface FeedbackReportFilter {
  /** So the shared ReportBuilder can hold it. Declared HERE rather than
   *  loosening the builder to Record<string, string>, which would lose every
   *  key name at the call site — the filter fields are checked against these
   *  names and that is most of what makes the spec safe to write. */
  [k: string]: string;
  from: string;          // the feedback's own date, inclusive
  to: string;
  product: string;       // contains
  party: string;         // contains
  state: string;         // contains
  engineer: string;      // contains
  callType: string;      // exact family
  source: string;        // 'Uploaded' | 'Entered here'
  ucn: string;           // contains
}
export const EMPTY_FEEDBACK_REPORT_FILTER: FeedbackReportFilter = {
  from: '', to: '', product: '', party: '', state: '', engineer: '',
  callType: '', source: '', ucn: '',
};

export function describeFeedbackFilter(f: FeedbackReportFilter): string {
  const bits: string[] = [];
  // THE FEEDBACK'S OWN DATE, not when the row was loaded (0190). Saying which
  // matters here more than anywhere: the two differ by up to two years on a
  // migrated row, and a reader filtering "2025" wants the year the customer
  // spoke.
  if (f.from || f.to) bits.push(`Feedback date ${f.from || '…'} to ${f.to || '…'}`);
  if (f.product) bits.push(`Product contains "${f.product}"`);
  if (f.party) bits.push(`Customer contains "${f.party}"`);
  if (f.state) bits.push(`State contains "${f.state}"`);
  if (f.engineer) bits.push(`Engineer contains "${f.engineer}"`);
  if (f.callType) bits.push(`Call type = ${f.callType}`);
  if (f.source) bits.push(`Source = ${f.source}`);
  if (f.ucn) bits.push(`UCN contains "${f.ucn}"`);
  return bits.length ? bits.join(' · ') : 'the whole register — no filter set';
}

export const feedbackReportColumns = (picked: Set<string>): string[] => [
  ...FEEDBACK_REPORT_MANDATORY,
  ...FEEDBACK_REPORT_OPTIONAL.filter((c) => picked.has(c)),
];

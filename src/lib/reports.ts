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
];

export const CONSUMPTION_COLUMNS: ReportColumn[] = [
  ...CONSUMPTION_MANDATORY.map((key) => ({ key, mandatory: true })),
  ...CONSUMPTION_OPTIONAL.map((key) => ({ key })),
];

// What the user has narrowed to. Every field is optional; an empty filter is
// "the whole register", which is the honest default for a report.
export interface ConsumptionFilter {
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

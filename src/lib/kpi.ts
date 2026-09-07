// ===========================================================================
// THE KPI WORKBOOK'S "Field_INST" TAB.
//
// The workbook is kept by hand; `kpi_field_inst` (0128) computes the same tab
// from the register. PHASE 1 is columns A to AB — the same fields, in the same
// order, under the same headings, so the file drops straight in. AC to AG
// (Attended in Days, Solved in Days, TTA, TTS, Failure Month) are formulas in
// the workbook and are Phase 2.
//
// THE HEADINGS ARE THE VIEW'S OWN COLUMN NAMES, spelling and all — including
// "Registeration" and "Call Solved Date & Time", which is how the workbook
// spells them. They are listed once, here, and the export reads the view by
// the same strings: a heading and the column it carries cannot drift apart,
// because they are the same string.
// ===========================================================================
import { exportDate } from './dccr';

export const KPI_FIELD_INST_COLUMNS = [
  'UC Number',
  'Call Number',
  'Call Registeration Date',
  'Complaint Date',
  'Party Name',
  'City',
  'State',
  'Product Name',
  'Product Serial Number',
  'Item Status',
  'Warranty Number',
  'Warranty Start Date',
  'Warranty End Date',
  'Contract Number',
  'Contract Start Date',
  'Contract End Date',
  'Contract Type',
  'Call Type',
  'Standard Complaint',
  'Complaint Reported',
  'Call Allocated To',
  'Breakdown Date',
  'Open/Close',
  'Call Status',
  'CALL PENDING REASON',
  'Visiting Service Engineer',
  'Call Attended On',
  'Call Solved Date & Time',
] as const;

// Which of them are dates, and which carries a TIME. The registration column
// is the only one the workbook shows to the second — it is when the call was
// typed in, and the KPIs measure from it.
const DATE_COLUMNS = new Set<string>([
  'Complaint Date', 'Warranty Start Date', 'Warranty End Date',
  'Contract Start Date', 'Contract End Date', 'Breakdown Date',
  'Call Attended On', 'Call Solved Date & Time',
]);
const DATETIME_COLUMNS = new Set<string>(['Call Registeration Date']);

export const kpiExportColumns = () =>
  KPI_FIELD_INST_COLUMNS.map((h) => ({ key: h, header: h }));

// The register's own date shape (dd-mmm-yyyy), which is unambiguous wherever
// the file is opened — an ISO or a slashed date is read differently by an
// Excel set to one locale or another, and this file is opened in India.
export function toKpiExportRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const h of KPI_FIELD_INST_COLUMNS) {
    const v = row[h];
    out[h] = DATETIME_COLUMNS.has(h) ? exportDate(v, true)
      : DATE_COLUMNS.has(h) ? exportDate(v)
      : (v ?? '');
  }
  return out;
}

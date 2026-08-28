// ---------------------------------------------------------------------------
// Field / Installation Call Register — shared schema.
// Single source of truth for the mapping between the Google Sheet column
// headers (exact strings) and the app's record keys, plus the real enum
// values, table columns and add-form fields. Imported by both the Sheets
// connector (src/lib/sheets.ts) and the Field Call module UI.
// ---------------------------------------------------------------------------

// Ordered exactly as the columns appear in the sheet.
export const FIELD_HEADERS: { header: string; key: string }[] = [
  { header: 'UC Number', key: 'ucn' },
  { header: 'Call Number', key: 'callNumber' },
  { header: 'Call Registeration Date', key: 'regDate' },
  { header: 'Complaint Date', key: 'complaintDate' },
  { header: 'Party Name', key: 'partyName' },
  { header: 'City', key: 'city' },
  { header: 'State', key: 'state' },
  { header: 'Product Name', key: 'productName' },
  { header: 'Product Serial Number', key: 'serial' },
  { header: 'Item Status', key: 'itemStatus' },
  { header: 'Warranty Number', key: 'warrantyNumber' },
  { header: 'Warranty Start Date', key: 'warrantyStart' },
  { header: 'Warranty End Date', key: 'warrantyEnd' },
  { header: 'Contract Number', key: 'contractNumber' },
  { header: 'Contract Start Date', key: 'contractStart' },
  { header: 'Contract End Date', key: 'contractEnd' },
  { header: 'Contract Type', key: 'contractType' },
  { header: 'Call Type', key: 'callType' },
  { header: 'Standard Complaint', key: 'standardComplaint' },
  { header: 'Complaint Reported', key: 'complaintReported' },
  { header: 'Call Allocated To', key: 'allocatedTo' },
  { header: 'Breakdown Date', key: 'breakdownDate' },
  { header: 'Engineer Email', key: 'engineerEmail' },
  { header: 'Reporting Manager', key: 'reportingManager' },
  { header: 'Regional Manager', key: 'regionalManager' },
  { header: 'Call Acceptance', key: 'callAcceptance' },
  { header: 'Open/Close', key: 'openClose' },
  { header: 'Call Status', key: 'callStatus' },
  { header: 'Region', key: 'region' },
  { header: 'Visiting Service Engineer', key: 'visitingEngineer' },
  { header: 'Visit Date & Time', key: 'visitDateTime' },
  { header: 'CALL PENDING REASON', key: 'pendingReason' },
  { header: 'Complaint Observation', key: 'observation' },
  { header: 'Job Done', key: 'jobDone' },
  { header: 'Service Report', key: 'serviceReport' },
  { header: 'Call Solved Date & Time', key: 'solvedDateTime' },
  { header: 'Contract Quote', key: 'contractQuote' },
  { header: 'Spare Quote', key: 'spareQuote' },
];

export const HEADER_BY_KEY: Record<string, string> = Object.fromEntries(
  FIELD_HEADERS.map((f) => [f.key, f.header]),
);
export const KEY_BY_HEADER: Record<string, string> = Object.fromEntries(
  FIELD_HEADERS.map((f) => [f.header, f.key]),
);

// Convert a sheet row keyed by header -> app record keyed by key.
export function rowToRecord(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { header, key } of FIELD_HEADERS) out[key] = row[header] ?? '';
  return out;
}

// Convert an app record keyed by key -> sheet payload keyed by header.
export function recordToRow(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { header, key } of FIELD_HEADERS) {
    if (rec[key] !== undefined && rec[key] !== '') out[header] = rec[key];
  }
  return out;
}

// Enum values observed in the live sheet.
export const ITEM_STATUS = ['WGP', 'OGP', 'CMC', 'AMC'];
export const FC_CONTRACT_TYPE = ['CMC', 'AMC'];
export const CALL_ACCEPTANCE = ['Allocated - Acceptance Pending', 'Accepted', 'Rejected'];
export const OPEN_CLOSE = ['Open', 'Close'];
export const FC_CALL_STATUS = [
  'Registered',
  'Allocated',
  'Attended',
  'Unsolved',
  'Solved - Report Completed',
];
export const REGIONS = ['NORTH1', 'NORTH2', 'EAST', 'WEST1', 'WEST2', 'SOUTH1', 'SOUTH2', 'SOUTH3'];

export const FC_STATUS_TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary'> = {
  Registered: 'warning',
  Allocated: 'info',
  Attended: 'primary',
  Unsolved: 'danger',
  'Solved - Report Completed': 'success',
  Open: 'warning',
  Close: 'success',
};

// Month letter A=Jan .. L=Dec, used by the UCN format.
export function monthLetter(monthIndex0: number): string {
  return String.fromCharCode(65 + monthIndex0);
}

// Build a UCN locally (offline fallback). The Apps Script bridge is the
// authority when connected; this mirrors its format so offline entries look
// right until they sync. `existing` are UCNs already known for the same day.
export function makeLocalUcn(callType: string, when: Date, existing: string[]): string {
  const yy = String(when.getFullYear()).slice(-2);
  const ml = monthLetter(when.getMonth());
  const dd = String(when.getDate()).padStart(2, '0');
  const tl = /^INSTALL/i.test(callType) ? 'I' : /^FIELD/i.test(callType) ? 'F' : callType.charAt(0).toUpperCase() || 'F';
  const prefix = `${yy}${ml}${dd}${tl}`;
  let max = 0;
  existing.forEach((u) => {
    if (u.indexOf(prefix) === 0) {
      const n = parseInt(u.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return prefix + String(max + 1).padStart(4, '0');
}

// Format a yyyy-MM-dd (or Date) as the sheet's date style: "02-January-2026".
export function toSheetDate(value: unknown): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

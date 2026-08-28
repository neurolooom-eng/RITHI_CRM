// ---------------------------------------------------------------------------
// Field / Installation Call Register — shared schema.
// Single source of truth for the mapping between the Google Sheet column
// headers (exact strings) and the app's record keys, plus the real enum
// values, table columns and add-form fields. Imported by both the Sheets
// connector (src/lib/sheets.ts) and the Field Call module UI.
// ---------------------------------------------------------------------------

// Ordered exactly as the columns appear in the FIELD tab of the register.
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
  { header: 'Person Calling', key: 'personCalling' },
  { header: 'Public Health Threat?', key: 'publicHealthThreat' },
  { header: 'Death?', key: 'death' },
  { header: 'Serious Incident?', key: 'seriousIncident' },
  { header: 'Mode of Complaint Reporting', key: 'modeOfReporting' },
  { header: 'Customer Name', key: 'customerName' },
  { header: 'Customer Number', key: 'customerNumber' },
  { header: 'Customer Designation', key: 'customerDesignation' },
  { header: 'Email address', key: 'emailAddress' },
];

// The register tab the Field Call screen reads/writes by default.
export const FIELD_TAB = 'FIELD';

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

// Enum values observed in the live FIELD tab.
export const ITEM_STATUS = ['WGP', 'OGP', 'CMC', 'AMC'];
export const FC_CONTRACT_TYPE = ['CMC', 'AMC'];
export const PERSON_CALLING = ['DIRECT CUSTOMER', 'DIRECT ENGINEER', 'DEALER', 'Other'];
export const MODE_OF_REPORTING = ['EMAIL', 'Phone Call', 'Whatsapp', 'EXOTEL', 'Portal', 'Other'];
export const YES_NO = ['NO', 'YES'];
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

// Map a Product Master row (keyed by its own headers) onto the Field Call
// form fields, so registering a call auto-fills customer / product / warranty
// / contract from the selected item.
export function productToCallPrefill(p: Record<string, unknown>): Record<string, unknown> {
  const g = (h: string) => {
    const v = p[h];
    return v == null ? '' : String(v);
  };
  return {
    partyName: g('Party Name'),
    city: g('City'),
    state: g('State'),
    productName: g('Item Name'),
    serial: g('Item Serial Number'),
    itemStatus: g('Item Status'),
    warrantyNumber: g('Warranty Number'),
    warrantyStart: g('Warranty Start Date'),
    warrantyEnd: g('Warranty End Date'),
    contractNumber: g('Contract Number'),
    contractStart: g('Contract Start Date'),
    contractEnd: g('Contract End Date'),
    contractType: g('Contract Type'),
    allocatedTo: g('Service Engineer'),
  };
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

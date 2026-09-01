import { toDate } from './dataImport';

// ===========================================================================
// PM bulk upload — shape a monthly Preventive-Maintenance spreadsheet into
// insert-ready PM call rows. Every row is forced to call_type 'P M VISIT'
// (so it lands in pm_calls after the split); the server assigns the UCN and
// Call Number. Headers are matched case-insensitively against common names;
// anything unrecognised is kept in `extra` rather than dropped.
// ===========================================================================

const PM_TYPE = 'P M VISIT';
const norm = (s: string) => s.trim().toLowerCase();

// call column  ->  accepted header names (lowercased)
const ALIASES: Record<string, string[]> = {
  party_name:         ['party name', 'party', 'customer', 'customer name', 'hospital', 'account name', 'account'],
  city:               ['city', 'town'],
  state:              ['state'],
  product_name:       ['product', 'product name', 'equipment', 'model', 'machine'],
  serial:             ['serial', 'serial no', 'serial number', 'sl no', 'sr no', 'sr. no'],
  item_status:        ['item status', 'cover', 'warranty status', 'cmc/wgp', 'contract status'],
  allocated_to:       ['engineer', 'allocated to', 'service engineer', 'assigned to', 'allocated engineer', 'fse', 'engineer name'],
  allocated_to_email: ['engineer email', 'engineer mail', 'allocated email', 'fse email'],
  reg_date:           ['reg date', 'registration date', 'pm date', 'pm due date', 'plan date', 'planned date', 'due date', 'scheduled date', 'visit date', 'date'],
  standard_complaint: ['standard complaint', 'complaint', 'fault', 'reason'],
  complaint_reported: ['reported problem', 'remarks', 'reported complaint', 'description', 'notes', 'comments'],
  customer_name:      ['contact name', 'customer contact', 'contact person', 'contact'],
  customer_number:    ['contact number', 'phone', 'mobile', 'customer number', 'contact no'],
  email_address:      ['email', 'email address', 'customer email', 'mail id', 'e-mail id'],
  contract_number:    ['contract number', 'contract no', 'amc number', 'cmc number', 'amc no'],
  contract_type:      ['contract type'],
  warranty_number:    ['warranty number', 'warranty no'],
};
const DATE_COLS = new Set(['reg_date', 'complaint_date']);

const todayISO = () => new Date().toISOString().slice(0, 10);

// Turn raw CSV rows into PM call records for a DUE MONTH (YYYY-MM). Every row is
// dated the 1st of that month (reg_date), records today as `added_on`, and is
// forced to the PM type; the database assigns the per-month PM serial, UCN and
// Call Number. Skips rows with no identifying data.
export function shapePmRows(raw: Record<string, string>[], month: string): Record<string, unknown>[] {
  const regDate = `${month}-01`;   // 1st of the due month
  const added = todayISO();
  return raw.map((r) => {
    const byNorm: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) byNorm[norm(k)] = v;

    const out: Record<string, unknown> = { call_type: PM_TYPE, status: 'Registered' };
    const used = new Set<string>();
    for (const [col, names] of Object.entries(ALIASES)) {
      if (col === 'reg_date') continue;   // reg_date comes from the chosen month, not the sheet
      for (const n of names) {
        const v = byNorm[n];
        if (v != null && String(v).trim() !== '') {
          const val = String(v).trim();
          out[col] = DATE_COLS.has(col) ? toDate(val) : val;
          used.add(n);
          break;
        }
      }
    }
    out.reg_date = regDate;
    out.added_on = added;
    // Keep any column we didn't map (incl. a per-row PM due date), so nothing is lost.
    const extra: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      if (!used.has(norm(k)) && String(v ?? '').trim() !== '') extra[k.trim()] = String(v).trim();
    }
    if (Object.keys(extra).length) out.extra = extra;
    return out;
  }).filter((o) => o.party_name || o.serial || o.product_name);
}

// A starter template so the uploader knows the columns.
export const PM_TEMPLATE_HEADERS = [
  'Party Name', 'City', 'State', 'Product', 'Serial No', 'Item Status',
  'Engineer', 'Engineer Email', 'PM Due Date', 'Standard Complaint',
  'Reported Problem', 'Contact Name', 'Contact Number',
];
export function pmTemplateCsv(): string {
  const sample = [
    'Apollo Hospital', 'Chennai', 'SOUTH3', 'Ventilator XT', 'VN-4471', 'CMC',
    'SIVARANI', 'sivarani@example.com', '2026-09-15', 'Preventive Maintenance',
    'Monthly PM visit', 'Nurse Station', '9840000000',
  ];
  return `${PM_TEMPLATE_HEADERS.join(',')}\n${sample.map((c) => `"${c}"`).join(',')}\n`;
}

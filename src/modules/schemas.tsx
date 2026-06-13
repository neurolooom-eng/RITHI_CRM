import type { CrudConfig } from './CrudModule';
import type { BaseRecord } from '../lib/db';
import type { Column } from '../components/table/DataTable';
import type { FieldDef } from '../components/form/Form';
import {
  C,
  PARTY_TYPES,
  CALL_STATUS,
  CALL_PRIORITY,
  CONTRACT_TYPES,
  FAILURE_CATEGORIES,
  STATUS_TONES,
  PRIORITY_TONES,
  toOptions,
} from './collections';
import {
  fmtCurrency,
  fmtDate,
  nextCode,
  optionsFrom,
  lookup,
  statusBadge,
  todayISO,
} from '../lib/format';

// Helper to render a status pill column
const statusCol = <T extends BaseRecord>(key = 'status', header = 'Status', width = 120): Column<T> => ({
  key,
  header,
  width,
  wrap: false,
  render: (r) => statusBadge((r as Record<string, unknown>)[key], STATUS_TONES),
});

const priorityCol = <T extends BaseRecord>(): Column<T> => ({
  key: 'priority',
  header: 'Priority',
  width: 100,
  wrap: false,
  render: (r) => statusBadge((r as Record<string, unknown>).priority, PRIORITY_TONES),
});

const partyCol = <T extends BaseRecord>(width = 180): Column<T> => ({
  key: 'partyId',
  header: 'Customer',
  width,
  render: (r) => lookup(C.parties, (r as Record<string, unknown>).partyId, 'name'),
});

const productCol = <T extends BaseRecord>(width = 180): Column<T> => ({
  key: 'productId',
  header: 'Product',
  width,
  render: (r) => lookup(C.products, (r as Record<string, unknown>).productId, 'name'),
});

const codeCol = <T extends BaseRecord>(header = 'Code', width = 110): Column<T> => ({
  key: 'code',
  header,
  width,
  wrap: false,
});

const currencyCol = <T extends BaseRecord>(key: string, header: string, width = 120): Column<T> => ({
  key,
  header,
  width,
  align: 'right',
  wrap: false,
  render: (r) => fmtCurrency((r as Record<string, unknown>)[key]),
});

const dateCol = <T extends BaseRecord>(key: string, header: string, width = 120): Column<T> => ({
  key,
  header,
  width,
  wrap: false,
  render: (r) => fmtDate((r as Record<string, unknown>)[key]),
});

// ---------------------------------------------------------------------------
// 1. PARTY MASTER
// ---------------------------------------------------------------------------
export const partyConfig: CrudConfig<BaseRecord> = {
  collection: C.parties,
  title: 'Party Master',
  subtitle: 'Hospitals, clinics, labs & other service customers',
  icon: '🏥',
  singular: 'Party',
  storageKey: 'parties',
  searchKeys: ['code', 'name', 'city', 'contactPerson', 'phone'],
  onBeforeCreate: (v) => ({ ...v, code: nextCode(C.parties, 'PTY') }),
  columns: [
    codeCol(),
    { key: 'name', header: 'Name', width: 200 },
    { key: 'type', header: 'Type', width: 130, wrap: false },
    { key: 'city', header: 'City', width: 120 },
    { key: 'contactPerson', header: 'Contact', width: 150 },
    { key: 'phone', header: 'Phone', width: 130, wrap: false },
  ],
  fields: [
    { name: 'name', label: 'Party Name', required: true, span: 2, section: 'Identity', placeholder: 'e.g. Apollo Speciality Hospital' },
    { name: 'type', label: 'Party Type', type: 'select', options: toOptions(PARTY_TYPES), required: true, section: 'Identity' },
    { name: 'gstin', label: 'GSTIN', section: 'Identity', placeholder: '29ABCDE1234F1Z5' },
    { name: 'contactPerson', label: 'Contact Person', section: 'Contact', placeholder: 'Biomedical Engineer' },
    { name: 'designation', label: 'Designation', section: 'Contact' },
    { name: 'phone', label: 'Phone', type: 'tel', section: 'Contact', required: true },
    { name: 'email', label: 'Email', type: 'email', section: 'Contact' },
    { name: 'address', label: 'Address', type: 'textarea', span: 2, section: 'Location' },
    { name: 'city', label: 'City', section: 'Location', required: true },
    { name: 'state', label: 'State', section: 'Location' },
    { name: 'pincode', label: 'Pincode', section: 'Location' },
    { name: 'notes', label: 'Notes', type: 'textarea', span: 2, section: 'Other' },
  ],
};

// ---------------------------------------------------------------------------
// 2. PRODUCT MASTER (medical equipment)
// ---------------------------------------------------------------------------
export const productConfig: CrudConfig<BaseRecord> = {
  collection: C.products,
  title: 'Product Master',
  subtitle: 'Medical equipment catalogue',
  icon: '🩺',
  singular: 'Product',
  storageKey: 'products',
  searchKeys: ['code', 'name', 'category', 'modelNo', 'manufacturer'],
  onBeforeCreate: (v) => ({ ...v, code: nextCode(C.products, 'PRD') }),
  columns: [
    codeCol(),
    { key: 'name', header: 'Product', width: 200 },
    { key: 'category', header: 'Category', width: 150 },
    { key: 'modelNo', header: 'Model', width: 120, wrap: false },
    { key: 'manufacturer', header: 'Manufacturer', width: 150 },
    { key: 'warrantyMonths', header: 'Warranty (mo)', width: 110, align: 'right', wrap: false },
    currencyCol('listPrice', 'List Price'),
  ],
  fields: [
    { name: 'name', label: 'Product Name', required: true, span: 2, section: 'Identity', placeholder: 'e.g. Multipara Patient Monitor' },
    { name: 'category', label: 'Category', type: 'select', section: 'Identity', required: true,
      options: toOptions(['Patient Monitoring', 'Imaging', 'Laboratory', 'Surgical', 'Life Support', 'Diagnostics', 'Sterilization', 'Dialysis', 'Other']) },
    { name: 'modelNo', label: 'Model No.', section: 'Identity', required: true },
    { name: 'manufacturer', label: 'Manufacturer', section: 'Identity' },
    { name: 'hsnCode', label: 'HSN Code', section: 'Commercial' },
    { name: 'listPrice', label: 'List Price', type: 'currency', section: 'Commercial' },
    { name: 'gstRate', label: 'GST %', type: 'number', section: 'Commercial', defaultValue: 12, min: 0, max: 28 },
    { name: 'warrantyMonths', label: 'Std. Warranty (months)', type: 'number', section: 'Service', defaultValue: 12, min: 0 },
    { name: 'pmFrequency', label: 'PM Frequency', type: 'select', section: 'Service',
      options: toOptions(['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly']), defaultValue: 'Quarterly' },
    { name: 'specifications', label: 'Specifications', type: 'textarea', span: 2, section: 'Service' },
  ],
};

// ---------------------------------------------------------------------------
// 3. PART MASTER (spare parts)
// ---------------------------------------------------------------------------
export const partConfig: CrudConfig<BaseRecord> = {
  collection: C.parts,
  title: 'Part Master',
  subtitle: 'Spare parts catalogue & stock',
  icon: '🔩',
  singular: 'Part',
  storageKey: 'parts',
  searchKeys: ['code', 'name', 'partNo', 'category'],
  onBeforeCreate: (v) => ({ ...v, code: nextCode(C.parts, 'SPR') }),
  columns: [
    codeCol(),
    { key: 'name', header: 'Part Name', width: 200 },
    { key: 'partNo', header: 'Part No.', width: 130, wrap: false },
    { key: 'category', header: 'Category', width: 130 },
    { key: 'stockQty', header: 'In Stock', width: 90, align: 'right', wrap: false },
    { key: 'reorderLevel', header: 'Reorder', width: 90, align: 'right', wrap: false },
    currencyCol('unitPrice', 'Unit Price'),
  ],
  fields: [
    { name: 'name', label: 'Part Name', required: true, span: 2, section: 'Identity', placeholder: 'e.g. SpO2 Sensor Cable' },
    { name: 'partNo', label: 'Part No. / SKU', required: true, section: 'Identity' },
    { name: 'category', label: 'Category', type: 'select', section: 'Identity',
      options: toOptions(['Cable', 'Sensor', 'PCB / Board', 'Battery', 'Display', 'Mechanical', 'Consumable', 'Filter', 'Other']) },
    { name: 'compatibleProductId', label: 'Compatible Product', type: 'select', section: 'Identity',
      options: optionsFrom(C.products, 'name', { codeKey: 'code' }) },
    { name: 'unitPrice', label: 'Unit Price', type: 'currency', section: 'Commercial', required: true },
    { name: 'gstRate', label: 'GST %', type: 'number', section: 'Commercial', defaultValue: 18 },
    { name: 'uom', label: 'Unit of Measure', type: 'select', section: 'Stock',
      options: toOptions(['Nos', 'Set', 'Mtr', 'Pair', 'Pack']), defaultValue: 'Nos' },
    { name: 'stockQty', label: 'Stock Quantity', type: 'number', section: 'Stock', defaultValue: 0, min: 0 },
    { name: 'reorderLevel', label: 'Reorder Level', type: 'number', section: 'Stock', defaultValue: 2, min: 0 },
    { name: 'binLocation', label: 'Bin / Location', section: 'Stock' },
  ],
};

// ---------------------------------------------------------------------------
// 4. WARRANTY REGISTRATION
// ---------------------------------------------------------------------------
export const warrantyConfig: CrudConfig<BaseRecord> = {
  collection: C.warranties,
  title: 'Warranty Register',
  subtitle: 'Register product warranties on sale',
  icon: '🛡️',
  singular: 'Warranty',
  storageKey: 'warranties',
  searchKeys: ['code', 'serialNo', 'invoiceNo'],
  onBeforeCreate: (v) => ({ ...v, code: nextCode(C.warranties, 'WTY') }),
  defaultsForNew: () => ({ status: 'Active', startDate: todayISO() }),
  columns: [
    codeCol(),
    partyCol(),
    productCol(),
    { key: 'serialNo', header: 'Serial No.', width: 130, wrap: false },
    dateCol('startDate', 'Start'),
    dateCol('endDate', 'Expiry'),
    statusCol(),
  ],
  fields: [
    { name: 'partyId', label: 'Customer', type: 'select', required: true, section: 'Sale',
      options: optionsFrom(C.parties, 'name', { codeKey: 'code' }) },
    { name: 'productId', label: 'Product', type: 'select', required: true, section: 'Sale',
      options: optionsFrom(C.products, 'name', { codeKey: 'code' }) },
    { name: 'serialNo', label: 'Serial No.', required: true, section: 'Sale' },
    { name: 'invoiceNo', label: 'Sale Invoice No.', section: 'Sale' },
    { name: 'saleDate', label: 'Sale Date', type: 'date', section: 'Sale', defaultValue: todayISO() },
    { name: 'startDate', label: 'Warranty Start', type: 'date', required: true, section: 'Period' },
    { name: 'endDate', label: 'Warranty End', type: 'date', required: true, section: 'Period' },
    { name: 'status', label: 'Status', type: 'select', section: 'Period',
      options: toOptions(['Active', 'Expiring Soon', 'Expired']), defaultValue: 'Active' },
    { name: 'coverageNotes', label: 'Coverage Notes', type: 'textarea', span: 2, section: 'Period' },
  ],
};

// ---------------------------------------------------------------------------
// 5. CONTRACT REGISTER (AMC / CMC)
// ---------------------------------------------------------------------------
export const contractConfig: CrudConfig<BaseRecord> = {
  collection: C.contracts,
  title: 'Contract Register',
  subtitle: 'AMC / CMC service contracts',
  icon: '📋',
  singular: 'Contract',
  storageKey: 'contracts',
  searchKeys: ['code', 'serialNo'],
  onBeforeCreate: (v) => ({ ...v, code: nextCode(C.contracts, 'AMC') }),
  defaultsForNew: () => ({ status: 'Active', startDate: todayISO() }),
  columns: [
    codeCol(),
    partyCol(),
    productCol(),
    { key: 'type', header: 'Type', width: 170 },
    dateCol('startDate', 'Start'),
    dateCol('endDate', 'End'),
    currencyCol('value', 'Value'),
    statusCol(),
  ],
  fields: [
    { name: 'partyId', label: 'Customer', type: 'select', required: true, section: 'Contract',
      options: optionsFrom(C.parties, 'name', { codeKey: 'code' }) },
    { name: 'productId', label: 'Product', type: 'select', required: true, section: 'Contract',
      options: optionsFrom(C.products, 'name', { codeKey: 'code' }) },
    { name: 'serialNo', label: 'Equipment Serial No.', section: 'Contract' },
    { name: 'type', label: 'Contract Type', type: 'select', required: true, section: 'Contract', options: toOptions(CONTRACT_TYPES) },
    { name: 'startDate', label: 'Start Date', type: 'date', required: true, section: 'Period' },
    { name: 'endDate', label: 'End Date', type: 'date', required: true, section: 'Period' },
    { name: 'pmVisitsPerYear', label: 'PM Visits / Year', type: 'number', section: 'Period', defaultValue: 4 },
    { name: 'value', label: 'Contract Value', type: 'currency', required: true, section: 'Commercial' },
    { name: 'status', label: 'Status', type: 'select', section: 'Commercial',
      options: toOptions(['Active', 'Expiring Soon', 'Expired']), defaultValue: 'Active' },
    { name: 'scope', label: 'Scope of Coverage', type: 'textarea', span: 2, section: 'Commercial' },
  ],
};

// ---------------------------------------------------------------------------
// Shared call fields (installation / PM / breakdown)
// ---------------------------------------------------------------------------
const closureFields: FieldDef[] = [
  { name: 'status', label: 'Status', type: 'select', options: toOptions(CALL_STATUS), section: 'Closure', defaultValue: 'Open' },
  { name: 'closureDate', label: 'Closure Date', type: 'date', section: 'Closure' },
  { name: 'resolution', label: 'Resolution / Work Done', type: 'textarea', span: 2, section: 'Closure' },
  { name: 'timeSpentHrs', label: 'Time Spent (hrs)', type: 'number', section: 'Closure', min: 0 },
];

// ---------------------------------------------------------------------------
// 6. INSTALLATION CALLS
// ---------------------------------------------------------------------------
export const installationConfig: CrudConfig<BaseRecord> = {
  collection: C.installations,
  title: 'Installation Calls',
  subtitle: 'New equipment installation & commissioning',
  icon: '🔧',
  singular: 'Installation',
  storageKey: 'installations',
  searchKeys: ['code', 'serialNo'],
  onBeforeCreate: (v) => ({ ...v, code: nextCode(C.installations, 'INS') }),
  defaultsForNew: () => ({ status: 'Open', priority: 'Medium', callDate: todayISO() }),
  columns: [
    codeCol(),
    partyCol(),
    productCol(),
    { key: 'serialNo', header: 'Serial No.', width: 130, wrap: false },
    dateCol('callDate', 'Call Date'),
    { key: 'engineer', header: 'Engineer', width: 130 },
    statusCol(),
  ],
  fields: [
    { name: 'partyId', label: 'Customer', type: 'select', required: true, section: 'Call',
      options: optionsFrom(C.parties, 'name', { codeKey: 'code' }) },
    { name: 'productId', label: 'Product', type: 'select', required: true, section: 'Call',
      options: optionsFrom(C.products, 'name', { codeKey: 'code' }) },
    { name: 'serialNo', label: 'Serial No.', section: 'Call' },
    { name: 'callDate', label: 'Call Date', type: 'date', required: true, section: 'Call' },
    { name: 'priority', label: 'Priority', type: 'select', options: toOptions(CALL_PRIORITY), section: 'Call', defaultValue: 'Medium' },
    { name: 'engineer', label: 'Assigned Engineer', section: 'Assignment' },
    { name: 'scheduledDate', label: 'Scheduled Date', type: 'date', section: 'Assignment' },
    { name: 'siteReadiness', label: 'Site Readiness', type: 'select', section: 'Assignment',
      options: toOptions(['Ready', 'Pending Civil', 'Pending Electrical', 'Not Ready']) },
    { name: 'installNotes', label: 'Installation Notes', type: 'textarea', span: 2, section: 'Assignment' },
    ...closureFields,
  ],
};

// ---------------------------------------------------------------------------
// 7. PREVENTIVE MAINTENANCE (scheduled calls)
// ---------------------------------------------------------------------------
export const pmConfig: CrudConfig<BaseRecord> = {
  collection: C.pmcalls,
  title: 'Preventive Maintenance',
  subtitle: 'Scheduled PM visits against contracts',
  icon: '🗓️',
  singular: 'PM Call',
  storageKey: 'pmcalls',
  searchKeys: ['code', 'serialNo', 'engineer'],
  onBeforeCreate: (v) => ({ ...v, code: nextCode(C.pmcalls, 'PM') }),
  defaultsForNew: () => ({ status: 'Scheduled', dueDate: todayISO() }),
  columns: [
    codeCol(),
    partyCol(),
    productCol(),
    dateCol('dueDate', 'Due Date'),
    { key: 'engineer', header: 'Engineer', width: 130 },
    statusCol(),
  ],
  fields: [
    { name: 'contractId', label: 'Contract', type: 'select', section: 'Schedule',
      options: optionsFrom(C.contracts, 'code', { codeKey: 'code' }) },
    { name: 'partyId', label: 'Customer', type: 'select', required: true, section: 'Schedule',
      options: optionsFrom(C.parties, 'name', { codeKey: 'code' }) },
    { name: 'productId', label: 'Product', type: 'select', required: true, section: 'Schedule',
      options: optionsFrom(C.products, 'name', { codeKey: 'code' }) },
    { name: 'serialNo', label: 'Serial No.', section: 'Schedule' },
    { name: 'frequency', label: 'Frequency', type: 'select', section: 'Schedule',
      options: toOptions(['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly']) },
    { name: 'dueDate', label: 'Due Date', type: 'date', required: true, section: 'Schedule' },
    { name: 'engineer', label: 'Assigned Engineer', section: 'Visit' },
    { name: 'visitDate', label: 'Visit Date', type: 'date', section: 'Visit' },
    { name: 'status', label: 'Status', type: 'select', section: 'Visit',
      options: toOptions(['Scheduled', 'In Progress', 'Completed', 'Overdue', 'Cancelled']), defaultValue: 'Scheduled' },
    { name: 'checklist', label: 'PM Checklist / Observations', type: 'textarea', span: 2, section: 'Visit' },
    { name: 'nextDueDate', label: 'Next Due Date', type: 'date', section: 'Visit' },
  ],
};

// ---------------------------------------------------------------------------
// 8. BREAKDOWN / FIELD CALLS
// ---------------------------------------------------------------------------
export const breakdownConfig: CrudConfig<BaseRecord> = {
  collection: C.breakdowns,
  title: 'Breakdown Calls',
  subtitle: 'Field service / breakdown complaints',
  icon: '⚠️',
  singular: 'Breakdown Call',
  storageKey: 'breakdowns',
  searchKeys: ['code', 'serialNo', 'engineer', 'complaint'],
  onBeforeCreate: (v) => ({ ...v, code: nextCode(C.breakdowns, 'BD') }),
  defaultsForNew: () => ({ status: 'Open', priority: 'High', reportedDate: todayISO() }),
  columns: [
    codeCol(),
    partyCol(160),
    productCol(160),
    { key: 'complaint', header: 'Complaint', width: 220 },
    priorityCol(),
    dateCol('reportedDate', 'Reported'),
    { key: 'engineer', header: 'Engineer', width: 120 },
    statusCol(),
  ],
  fields: [
    { name: 'partyId', label: 'Customer', type: 'select', required: true, section: 'Complaint',
      options: optionsFrom(C.parties, 'name', { codeKey: 'code' }) },
    { name: 'productId', label: 'Product', type: 'select', required: true, section: 'Complaint',
      options: optionsFrom(C.products, 'name', { codeKey: 'code' }) },
    { name: 'serialNo', label: 'Serial No.', section: 'Complaint' },
    { name: 'reportedDate', label: 'Reported Date', type: 'date', required: true, section: 'Complaint' },
    { name: 'reportedVia', label: 'Reported Via', type: 'select', section: 'Complaint',
      options: toOptions(['Phone', 'Email', 'Portal', 'WhatsApp', 'On-site']) },
    { name: 'priority', label: 'Priority', type: 'select', options: toOptions(CALL_PRIORITY), section: 'Complaint', defaultValue: 'High' },
    { name: 'complaint', label: 'Complaint Description', type: 'textarea', span: 2, required: true, section: 'Complaint' },
    { name: 'underContract', label: 'Under Warranty / Contract', type: 'checkbox', section: 'Assignment' },
    { name: 'engineer', label: 'Assigned Engineer', section: 'Assignment' },
    { name: 'scheduledDate', label: 'Scheduled Visit', type: 'date', section: 'Assignment' },
    { name: 'failureCategory', label: 'Failure Category', type: 'select', options: toOptions(FAILURE_CATEGORIES), section: 'Diagnosis' },
    { name: 'rootCause', label: 'Root Cause', type: 'textarea', span: 2, section: 'Diagnosis' },
    ...closureFields,
  ],
};

// ---------------------------------------------------------------------------
// 9. SPARE REQUESTS
// ---------------------------------------------------------------------------
export const spareRequestConfig: CrudConfig<BaseRecord> = {
  collection: C.spareRequests,
  title: 'Spare Requests',
  subtitle: 'Engineer spare part requisitions',
  icon: '📦',
  singular: 'Spare Request',
  storageKey: 'spareRequests',
  searchKeys: ['code', 'engineer'],
  onBeforeCreate: (v) => ({ ...v, code: nextCode(C.spareRequests, 'REQ') }),
  defaultsForNew: () => ({ status: 'Pending', requestDate: todayISO(), qty: 1 }),
  columns: [
    codeCol(),
    { key: 'callId', header: 'Against Call', width: 130, render: (r) => lookup(C.breakdowns, (r as Record<string, unknown>).callId, 'code') },
    { key: 'partId', header: 'Part', width: 180, render: (r) => lookup(C.parts, (r as Record<string, unknown>).partId, 'name') },
    { key: 'qty', header: 'Qty', width: 70, align: 'right', wrap: false },
    { key: 'engineer', header: 'Engineer', width: 130 },
    dateCol('requestDate', 'Requested'),
    statusCol(),
  ],
  fields: [
    { name: 'callId', label: 'Against Breakdown Call', type: 'select', section: 'Request',
      options: optionsFrom(C.breakdowns, 'complaint', { codeKey: 'code' }) },
    { name: 'partId', label: 'Spare Part', type: 'select', required: true, section: 'Request',
      options: optionsFrom(C.parts, 'name', { codeKey: 'code' }) },
    { name: 'qty', label: 'Quantity', type: 'number', required: true, min: 1, section: 'Request', defaultValue: 1 },
    { name: 'engineer', label: 'Requested By (Engineer)', required: true, section: 'Request' },
    { name: 'requestDate', label: 'Request Date', type: 'date', required: true, section: 'Request' },
    { name: 'priority', label: 'Priority', type: 'select', options: toOptions(CALL_PRIORITY), section: 'Approval', defaultValue: 'Medium' },
    { name: 'status', label: 'Status', type: 'select', section: 'Approval',
      options: toOptions(['Pending', 'Approved', 'Rejected', 'Issued']), defaultValue: 'Pending' },
    { name: 'approvedBy', label: 'Approved By', section: 'Approval' },
    { name: 'reason', label: 'Reason / Remarks', type: 'textarea', span: 2, section: 'Approval' },
  ],
};

// ---------------------------------------------------------------------------
// 10. SPARE CONSUMPTION
// ---------------------------------------------------------------------------
export const spareConsumptionConfig: CrudConfig<BaseRecord> = {
  collection: C.spareConsumption,
  title: 'Spare Consumption',
  subtitle: 'Parts consumed during service',
  icon: '🧾',
  singular: 'Consumption',
  storageKey: 'spareConsumption',
  searchKeys: ['code', 'engineer'],
  onBeforeCreate: (v) => ({ ...v, code: nextCode(C.spareConsumption, 'CON') }),
  defaultsForNew: () => ({ consumeDate: todayISO(), qty: 1, billable: false }),
  columns: [
    codeCol(),
    { key: 'callId', header: 'Against Call', width: 130, render: (r) => lookup(C.breakdowns, (r as Record<string, unknown>).callId, 'code') },
    { key: 'partId', header: 'Part', width: 180, render: (r) => lookup(C.parts, (r as Record<string, unknown>).partId, 'name') },
    { key: 'qty', header: 'Qty', width: 70, align: 'right', wrap: false },
    { key: 'engineer', header: 'Engineer', width: 130 },
    dateCol('consumeDate', 'Date'),
    { key: 'billable', header: 'Billable', width: 90, wrap: false, render: (r) => ((r as Record<string, unknown>).billable ? <span className="badge badge-warning">Billable</span> : <span className="badge badge-success">Free</span>) },
  ],
  fields: [
    { name: 'callId', label: 'Against Call', type: 'select', section: 'Consumption',
      options: optionsFrom(C.breakdowns, 'complaint', { codeKey: 'code' }) },
    { name: 'partId', label: 'Spare Part', type: 'select', required: true, section: 'Consumption',
      options: optionsFrom(C.parts, 'name', { codeKey: 'code' }) },
    { name: 'qty', label: 'Quantity Consumed', type: 'number', required: true, min: 1, section: 'Consumption', defaultValue: 1 },
    { name: 'engineer', label: 'Engineer', required: true, section: 'Consumption' },
    { name: 'consumeDate', label: 'Consumption Date', type: 'date', required: true, section: 'Consumption' },
    { name: 'billable', label: 'Chargeable to customer (not under warranty/AMC)', type: 'checkbox', span: 2, section: 'Billing' },
    { name: 'remarks', label: 'Remarks', type: 'textarea', span: 2, section: 'Billing' },
  ],
};

// ---------------------------------------------------------------------------
// 11. CUSTOMER FEEDBACK
// ---------------------------------------------------------------------------
export const feedbackConfig: CrudConfig<BaseRecord> = {
  collection: C.feedback,
  title: 'Customer Feedback',
  subtitle: 'Post-service satisfaction feedback',
  icon: '⭐',
  singular: 'Feedback',
  storageKey: 'feedback',
  searchKeys: ['code'],
  onBeforeCreate: (v) => ({ ...v, code: nextCode(C.feedback, 'FBK') }),
  defaultsForNew: () => ({ feedbackDate: todayISO(), rating: 5 }),
  columns: [
    codeCol(),
    partyCol(),
    { key: 'callId', header: 'Against Call', width: 120, render: (r) => lookup(C.breakdowns, (r as Record<string, unknown>).callId, 'code') },
    { key: 'rating', header: 'Rating', width: 110, wrap: false, render: (r) => '★'.repeat(Number((r as Record<string, unknown>).rating) || 0) },
    { key: 'recommend', header: 'Recommend', width: 100, wrap: false },
    dateCol('feedbackDate', 'Date'),
  ],
  fields: [
    { name: 'partyId', label: 'Customer', type: 'select', required: true, section: 'Feedback',
      options: optionsFrom(C.parties, 'name', { codeKey: 'code' }) },
    { name: 'callId', label: 'Against Call', type: 'select', section: 'Feedback',
      options: optionsFrom(C.breakdowns, 'complaint', { codeKey: 'code' }) },
    { name: 'rating', label: 'Overall Rating (1-5)', type: 'number', min: 1, max: 5, required: true, section: 'Feedback', defaultValue: 5 },
    { name: 'responseTime', label: 'Response Time', type: 'select', section: 'Ratings',
      options: toOptions(['Excellent', 'Good', 'Average', 'Poor']) },
    { name: 'engineerConduct', label: 'Engineer Conduct', type: 'select', section: 'Ratings',
      options: toOptions(['Excellent', 'Good', 'Average', 'Poor']) },
    { name: 'recommend', label: 'Would Recommend', type: 'select', section: 'Ratings',
      options: toOptions(['Yes', 'No', 'Maybe']) },
    { name: 'feedbackDate', label: 'Feedback Date', type: 'date', section: 'Ratings' },
    { name: 'comments', label: 'Comments', type: 'textarea', span: 2, section: 'Ratings' },
  ],
};

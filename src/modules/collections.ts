// Central registry of collection names + shared option lists & tone maps.

export const C = {
  parties: 'parties',
  products: 'products',
  parts: 'parts',
  warranties: 'warranties',
  contracts: 'contracts',
  installations: 'installations',
  pmcalls: 'pmcalls',
  breakdowns: 'breakdowns',
  spareRequests: 'spareRequests',
  spareConsumption: 'spareConsumption',
  feedback: 'feedback',
  quotes: 'quotes',
  invoices: 'invoices',
} as const;

export const PARTY_TYPES = ['Hospital', 'Clinic', 'Diagnostic Lab', 'Nursing Home', 'Medical College', 'Distributor'];
export const CALL_STATUS = ['Open', 'Assigned', 'In Progress', 'On Hold', 'Closed', 'Cancelled'];
export const CALL_PRIORITY = ['Low', 'Medium', 'High', 'Critical'];
export const CONTRACT_TYPES = ['AMC (Comprehensive)', 'AMC (Non-Comprehensive)', 'CMC', 'Warranty Extension'];
export const FAILURE_CATEGORIES = [
  'Electrical',
  'Mechanical',
  'Electronic / PCB',
  'Software / Firmware',
  'Sensor / Probe',
  'Calibration Drift',
  'Wear & Tear',
  'User Error',
  'Environmental',
  'Other',
];

export const STATUS_TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary'> = {
  Open: 'warning',
  Assigned: 'info',
  'In Progress': 'primary',
  'On Hold': 'warning',
  Closed: 'success',
  Cancelled: 'neutral',
  Completed: 'success',
  Scheduled: 'info',
  Overdue: 'danger',
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Issued: 'info',
  Draft: 'neutral',
  Paid: 'success',
  Unpaid: 'danger',
  Active: 'success',
  Expired: 'danger',
  'Expiring Soon': 'warning',
};

export const PRIORITY_TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  Low: 'neutral',
  Medium: 'info',
  High: 'warning',
  Critical: 'danger',
};

export const toOptions = (arr: string[]) => arr.map((v) => ({ value: v, label: v }));

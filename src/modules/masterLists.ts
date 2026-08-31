import type { MasterList } from '../lib/supabase';

// ===========================================================================
// The master value lists the app ships with: what the sidebar offers, and the
// fallback registry when the database has no `master_lists` yet (0021 not
// applied) or when the app is running on the sheet source.
// The database registry wins wherever it is available — it carries the labels
// and the extra columns a list may have.
// ===========================================================================

export interface MasterListDef { key: string; label: string; icon: string; valueLabel: string; usedBy: string }

export const MASTER_LISTS: MasterListDef[] = [
  { key: 'calltype', label: 'Call Type', icon: '📞', valueLabel: 'Call Type', usedBy: 'Request form — Call Type' },
  { key: 'complaint', label: 'Standard Complaint', icon: '🧾', valueLabel: 'Complaint Name', usedBy: 'Call report — Standard Complaint' },
  { key: 'pendingreason', label: 'Call Pending Reason', icon: '⏸️', valueLabel: 'Reason', usedBy: 'Call report — Unsolved branch' },
  { key: 'cancelreason', label: 'Call Cancel Reason', icon: '🚫', valueLabel: 'Reason', usedBy: "Hotline's Cancel request (Pending Registrations)" },
  { key: 'feedbackrating', label: 'Feedback Rating', icon: '⭐', valueLabel: 'Rating', usedBy: 'Customer feedback — ratings' },
  { key: 'orapproval', label: 'Spare Approval Reason', icon: '✅', valueLabel: 'Reason', usedBy: 'Spare approval — reason for approval / rejection' },
  // Both tagged PER PRODUCT (masters.extra.product); a value tagged COMM is
  // common to every product. Their own tabs live in Daily Call Review.
  { key: 'dccrgrouping', label: 'DCCR Complaint Grouping', icon: '🗂️', valueLabel: 'Complaint Grouping', usedBy: 'Daily Call Review — Review 3' },
  { key: 'rootcause', label: 'Root Cause Key Word', icon: '🔍', valueLabel: 'Root Cause Key Word', usedBy: 'Daily Call Review — Review 3' },
];

export const masterListPath = (key: string) => `/masters/${key}`;
export const usedBy = (key: string): string => MASTER_LISTS.find((l) => l.key === key)?.usedBy ?? '';

// A registry entry for a list the database registry does not describe.
export const fallbackList = (key: string): MasterList => {
  const def = MASTER_LISTS.find((l) => l.key === key);
  return {
    key,
    label: def?.label ?? key,
    value_label: def?.valueLabel ?? 'Value',
    columns: [],
    sort_order: def ? (MASTER_LISTS.indexOf(def) + 1) * 10 : 100,
    active: true,
  };
};

export const fallbackRegistry = (): MasterList[] => MASTER_LISTS.map((l) => fallbackList(l.key));

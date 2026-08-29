// ---------------------------------------------------------------------------
// Role-Based Access Control (RBAC).
// Roles and the canonical action list live here; the role → allowed-actions map
// is stored in Supabase (app_roles) and editable by admins. can(action) in
// auth.tsx resolves a user's role against that map.
// ---------------------------------------------------------------------------

export interface RoleDef { key: string; label: string }
export const ROLES: RoleDef[] = [
  { key: 'admin', label: 'Admin / Super Admin' },
  { key: 'rgm', label: 'Regional Manager' },
  { key: 'rm', label: 'Reporting Manager' },
  { key: 'engineer', label: 'Engineer' },
  { key: 'hotline', label: 'Hotline Engineer' },
  { key: 'spare_coordinator', label: 'Spare Coordinator' },
  { key: 'tally_coordinator', label: 'Tally Coordinator' },
];
export const ROLE_KEYS = ROLES.map((r) => r.key);

export interface ActionDef { key: string; label: string; group: string }
export const ACTIONS: ActionDef[] = [
  { group: 'Calls', key: 'calls.view', label: 'View calls' },
  { group: 'Calls', key: 'calls.create', label: 'Create / register calls' },
  { group: 'Calls', key: 'calls.edit', label: 'Edit calls' },
  { group: 'Calls', key: 'calls.report', label: 'Report / update calls' },
  { group: 'Requests', key: 'request.create', label: 'Raise call requests' },
  { group: 'Requests', key: 'pending.register', label: 'Register pending (Hotline)' },
  { group: 'Spares', key: 'spare.request', label: 'Request spares' },
  { group: 'Spares', key: 'spare.approve_rm', label: 'Approve spare — RM' },
  { group: 'Spares', key: 'spare.approve_admin', label: 'Approve spare — Admin' },
  { group: 'Spares', key: 'spare.dispatch', label: 'Dispatch / stores' },
  { group: 'Spares', key: 'consumption.view', label: 'View consumption' },
  { group: 'Masters', key: 'masters.view', label: 'View masters' },
  { group: 'Masters', key: 'masters.edit', label: 'Edit masters' },
  { group: 'Analytics', key: 'reports.view', label: 'View reports' },
  { group: 'Analytics', key: 'dashboard.view', label: 'View dashboard' },
  { group: 'Analytics', key: 'feedback.view', label: 'View feedback' },
  { group: 'Admin', key: 'users.manage', label: 'Manage users' },
  { group: 'Admin', key: 'config.manage', label: 'Admin config' },
  { group: 'Admin', key: 'rbac.manage', label: 'Manage roles & permissions' },
];
export const ACTION_KEYS = ACTIONS.map((a) => a.key);

// Legacy can() keys used across the app → canonical actions.
export const LEGACY_ACTIONS: Record<string, string> = {
  view: 'calls.view',
  edit: 'calls.edit',
  delete: 'calls.edit',
  'manage-users': 'users.manage',
};
export const toCanonical = (action: string): string => LEGACY_ACTIONS[action] ?? action;

// Map the legacy 4-value Role to an RBAC role key (for local/demo users).
export const legacyToRbac = (role: string): string =>
  role === 'admin' ? 'admin' : role === 'manager' ? 'rm' : role === 'viewer' ? 'tally_coordinator' : 'engineer';

// Sensible starting permissions — admins can change any of these in the UI.
const ALL = ACTION_KEYS;
export const DEFAULT_PERMS: Record<string, string[]> = {
  admin: ALL,
  rgm: ['calls.view', 'calls.create', 'calls.edit', 'calls.report', 'request.create', 'spare.request', 'spare.approve_rm', 'spare.approve_admin', 'consumption.view', 'masters.view', 'reports.view', 'dashboard.view', 'feedback.view'],
  rm: ['calls.view', 'calls.create', 'calls.edit', 'calls.report', 'request.create', 'spare.request', 'spare.approve_rm', 'consumption.view', 'masters.view', 'reports.view', 'dashboard.view', 'feedback.view'],
  engineer: ['calls.view', 'calls.report', 'request.create', 'spare.request', 'consumption.view', 'reports.view', 'dashboard.view'],
  hotline: ['calls.view', 'calls.create', 'request.create', 'pending.register', 'masters.view', 'dashboard.view'],
  spare_coordinator: ['spare.request', 'spare.approve_admin', 'spare.dispatch', 'consumption.view', 'reports.view', 'dashboard.view'],
  tally_coordinator: ['consumption.view', 'reports.view', 'feedback.view', 'dashboard.view'],
};

export const permsForRole = (role: string, config: Record<string, string[]>): string[] =>
  config[role] ?? DEFAULT_PERMS[role] ?? DEFAULT_PERMS.engineer;

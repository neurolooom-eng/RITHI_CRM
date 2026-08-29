// ---------------------------------------------------------------------------
// Role-Based Access Control (RBAC).
// Roles, the canonical action list (functional actions + one per module), and
// starting defaults live here. The role → allowed-actions map is stored in
// Supabase (app_roles) and edited by admins; auth.tsx's can(action) resolves a
// user's role against it. Every module (nav item) is gated by a mod:<path> key.
// ---------------------------------------------------------------------------

export interface RoleDef { key: string; label: string }
export const ROLES: RoleDef[] = [
  { key: 'admin', label: 'Admin / Super Admin' },
  { key: 'nsm', label: 'NSM (National Sales Manager)' },
  { key: 'rgm', label: 'Regional Manager' },
  { key: 'rm', label: 'Reporting Manager' },
  { key: 'engineer', label: 'Engineer' },
  { key: 'hotline', label: 'Hotline Engineer' },
  { key: 'spare_coordinator', label: 'Spare Coordinator' },
  { key: 'stores_incharge', label: 'Stores Incharge' },
  { key: 'tally_coordinator', label: 'Tally Coordinator' },
  { key: 'commercial', label: 'Commercial' },
];
export const ROLE_KEYS = ROLES.map((r) => r.key);

// Every module (nav item). RBAC gates each by mod:<path>.
export interface ModuleDef { path: string; label: string; admin?: boolean }
export const MODULES: ModuleDef[] = [
  { path: '/', label: 'Dashboard' },
  { path: '/daily-review', label: 'Daily Call Review' },
  { path: '/parties', label: 'Party Master' },
  { path: '/product-master', label: 'Product Master' },
  { path: '/user-master', label: 'User Master' },
  { path: '/parts', label: 'Part Master' },
  { path: '/masters', label: 'All Masters' },
  { path: '/warranties', label: 'Warranty Register' },
  { path: '/contracts', label: 'Contract Register' },
  { path: '/request-registration', label: 'Request Registration' },
  { path: '/pending-registrations', label: 'Pending Registrations' },
  { path: '/field-calls', label: 'Field Call Register' },
  { path: '/installations', label: 'Installation Calls' },
  { path: '/pm-calls', label: 'Preventive (PM)' },
  { path: '/pending-calls', label: 'Pending Calls' },
  { path: '/reports', label: 'Reports' },
  { path: '/spare-requests', label: 'Spare Requests' },
  { path: '/spare-consumption', label: 'Spare Consumption' },
  { path: '/stock-transfer', label: 'Stock Transfer' },
  { path: '/feedback', label: 'Customer Feedback' },
  { path: '/failure-report', label: 'Field Failure Report' },
  { path: '/kpi', label: 'KPI & Failure Analysis' },
  { path: '/users', label: 'User Access', admin: true },
  { path: '/roles', label: 'Roles & Permissions', admin: true },
  { path: '/admin-config', label: 'Admin Config', admin: true },
  { path: '/settings', label: 'Settings' },
  { path: '/version-history', label: 'Version History' },
];
export const moduleAction = (path: string): string => `mod:${path}`;
const ADMIN_MODULES = MODULES.filter((m) => m.admin).map((m) => moduleAction(m.path));
const NON_ADMIN_MODULES = MODULES.filter((m) => !m.admin).map((m) => moduleAction(m.path));
const ALL_MODULES = MODULES.map((m) => moduleAction(m.path));

export interface ActionDef { key: string; label: string; group: string }
const FUNCTIONAL_ACTIONS: ActionDef[] = [
  { group: 'Calls', key: 'calls.view', label: 'View calls' },
  { group: 'Calls', key: 'calls.create', label: 'Create / register calls' },
  { group: 'Calls', key: 'calls.edit', label: 'Edit calls' },
  { group: 'Calls', key: 'calls.report', label: 'Report / update calls' },
  { group: 'Requests', key: 'request.create', label: 'Raise call requests' },
  { group: 'Requests', key: 'pending.register', label: 'Register pending (Hotline)' },
  { group: 'Spares', key: 'spare.request', label: 'Request spares' },
  { group: 'Spares', key: 'spare.approve_rm', label: 'Approve spare — RM stage' },
  { group: 'Spares', key: 'spare.approve_commercial', label: 'Approve spare — Commercial' },
  { group: 'Spares', key: 'spare.approve_nsm', label: 'Approve spare — NSM' },
  { group: 'Spares', key: 'spare.dispatch', label: 'Dispatch / DC (Stores)' },
  { group: 'Spares', key: 'spare.receive', label: 'Acknowledge spare receipt' },
  { group: 'Spares', key: 'consumption.view', label: 'View consumption' },
  { group: 'Spares', key: 'stock.transfer', label: 'Transfer hand-stock between engineers' },
  { group: 'Masters', key: 'masters.view', label: 'View masters' },
  { group: 'Masters', key: 'masters.edit', label: 'Edit masters' },
  { group: 'Analytics', key: 'reports.view', label: 'View reports' },
  { group: 'Analytics', key: 'dashboard.view', label: 'View dashboard' },
  { group: 'Analytics', key: 'feedback.view', label: 'View feedback' },
  { group: 'Admin', key: 'users.manage', label: 'Manage users' },
  { group: 'Admin', key: 'config.manage', label: 'Admin config' },
  { group: 'Admin', key: 'rbac.manage', label: 'Manage roles & permissions' },
];
export const ACTIONS: ActionDef[] = [
  ...FUNCTIONAL_ACTIONS,
  ...MODULES.map((m) => ({ group: 'Modules', key: moduleAction(m.path), label: `Open: ${m.label}` })),
];
export const ACTION_KEYS = ACTIONS.map((a) => a.key);

// Legacy can() keys used across the app → canonical actions.
export const LEGACY_ACTIONS: Record<string, string> = {
  view: 'calls.view', edit: 'calls.edit', delete: 'calls.edit', 'manage-users': 'users.manage',
};
export const toCanonical = (action: string): string => LEGACY_ACTIONS[action] ?? action;

// Map the legacy 4-value Role to an RBAC role key (local/demo users).
export const legacyToRbac = (role: string): string =>
  role === 'admin' ? 'admin' : role === 'manager' ? 'rm' : role === 'viewer' ? 'tally_coordinator' : 'engineer';

// Starting permissions — admins tune any of these in the UI. Functional perms
// per role, plus module access: admins get every module; everyone else gets all
// non-admin modules by default (admins remove what a role shouldn't see).
const FUNCTIONAL_DEFAULTS: Record<string, string[]> = {
  admin: FUNCTIONAL_ACTIONS.map((a) => a.key),
  nsm: ['calls.view', 'masters.view', 'consumption.view', 'reports.view', 'dashboard.view', 'feedback.view', 'spare.approve_nsm'],
  rgm: ['calls.view', 'calls.create', 'calls.edit', 'calls.report', 'request.create', 'spare.request', 'spare.approve_rm', 'stock.transfer', 'consumption.view', 'masters.view', 'reports.view', 'dashboard.view', 'feedback.view'],
  rm: ['calls.view', 'calls.create', 'calls.edit', 'calls.report', 'request.create', 'spare.request', 'spare.approve_rm', 'stock.transfer', 'consumption.view', 'masters.view', 'reports.view', 'dashboard.view', 'feedback.view'],
  // Engineers: view + report their calls; no create/edit, no spare requests.
  engineer: ['calls.view', 'calls.report', 'request.create', 'stock.transfer', 'consumption.view', 'reports.view', 'dashboard.view'],
  // Hotline: register/create calls; no spare requests.
  hotline: ['calls.view', 'calls.create', 'calls.edit', 'request.create', 'pending.register', 'spare.approve_rm', 'masters.view', 'dashboard.view'],
  spare_coordinator: ['spare.request', 'spare.approve_rm', 'spare.dispatch', 'stock.transfer', 'consumption.view', 'reports.view', 'dashboard.view'],
  stores_incharge: ['spare.dispatch', 'stock.transfer', 'consumption.view', 'reports.view', 'dashboard.view'],
  tally_coordinator: ['consumption.view', 'reports.view', 'feedback.view', 'dashboard.view'],
  commercial: ['consumption.view', 'reports.view', 'feedback.view', 'dashboard.view', 'masters.view', 'spare.approve_commercial'],
};
export const DEFAULT_PERMS: Record<string, string[]> = Object.fromEntries(
  ROLE_KEYS.map((role) => [
    role,
    role === 'admin'
      ? [...FUNCTIONAL_DEFAULTS.admin, ...ALL_MODULES]
      : [...(FUNCTIONAL_DEFAULTS[role] ?? FUNCTIONAL_DEFAULTS.engineer), ...NON_ADMIN_MODULES],
  ]),
);
void ADMIN_MODULES;

export const permsForRole = (role: string, config: Record<string, string[]>): string[] =>
  config[role] ?? DEFAULT_PERMS[role] ?? DEFAULT_PERMS.engineer;

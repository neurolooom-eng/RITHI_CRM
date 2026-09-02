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
  { path: '/spare-dispatch', label: 'Pending Dispatch' },
  { path: '/spare-consumption', label: 'Spare Consumption' },
  { path: '/handstock', label: 'Hand Stock' },
  { path: '/mrn', label: 'Material Returns (MRN)' },
  { path: '/stock-transfer', label: 'Stock Transfer' },
  { path: '/feedback', label: 'Customer Feedback' },
  { path: '/failure-report', label: 'Field Failure Report' },
  { path: '/kpi', label: 'KPI & Failure Analysis' },
  { path: '/users', label: 'User Access', admin: true },
  { path: '/roles', label: 'Roles & Permissions', admin: true },
  { path: '/audit', label: 'Audit Log', admin: true },
  { path: '/admin-config', label: 'Admin Config', admin: true },
  { path: '/settings', label: 'Settings' },
  { path: '/version-history', label: 'Version History' },
];
export const moduleAction = (path: string): string => `mod:${path}`;

// Each master value list has its own screen (/masters/<key>), but they are one
// module: whoever may open All Masters may open any of its lists. Keeps the
// role matrix from growing a row per list.
// A master list has its own key (mod:/masters/<key>) so access can be given
// list by list. It INHERITS from All Masters: can() treats mod:/masters as
// granting every list, so existing roles keep working and an admin restricts by
// turning the parent off and picking lists instead.
export const actionForPath = (path: string): string => moduleAction(path);
const ADMIN_MODULES = MODULES.filter((m) => m.admin).map((m) => moduleAction(m.path));
const NON_ADMIN_MODULES = MODULES.filter((m) => !m.admin).map((m) => moduleAction(m.path));
const ALL_MODULES = MODULES.map((m) => moduleAction(m.path));

export interface ActionDef { key: string; label: string; group: string }
const FUNCTIONAL_ACTIONS: ActionDef[] = [
  { group: 'Calls', key: 'calls.view', label: 'View calls' },
  { group: 'Calls', key: 'calls.create', label: 'Create / register calls' },
  { group: 'Calls', key: 'install.create', label: 'Create installation calls (Commercial)' },
  { group: 'Calls', key: 'calls.edit', label: 'Edit calls' },
  { group: 'Calls', key: 'calls.report', label: 'Report / update calls' },
  { group: 'Calls', key: 'review.edit', label: 'Complete the daily call review (Review 2 / 3)' },
  { group: 'Requests', key: 'request.create', label: 'Raise call requests' },
  { group: 'Requests', key: 'pending.register', label: 'Register pending (Hotline)' },
  { group: 'Spares', key: 'spare.request', label: 'Request spares' },
  { group: 'Spares', key: 'spare.approve_rm', label: 'Approve spare — RM stage' },
  { group: 'Spares', key: 'spare.approve_commercial', label: 'Approve spare — Commercial' },
  { group: 'Spares', key: 'spare.approve_nsm', label: 'Approve spare — NSM' },
  { group: 'Spares', key: 'spare.dispatch', label: 'Dispatch / DC (Stores)' },
  { group: 'Spares', key: 'spare.drop', label: 'Drop a spare (any stage)' },
  { group: 'Spares', key: 'spare.receive', label: 'Acknowledge spare receipt' },
  { group: 'Spares', key: 'stock.return', label: 'Return spares to Stores (MRN)' },
  { group: 'Spares', key: 'consumption.view', label: 'View consumption' },
  { group: 'Spares', key: 'consumption.reconcile', label: 'Add consumption against a call (reconciliation)' },
  { group: 'Spares', key: 'stock.transfer', label: 'Transfer hand-stock between engineers' },
  { group: 'Masters', key: 'masters.view', label: 'View masters' },
  { group: 'Masters', key: 'masters.edit', label: 'Edit masters' },
  { group: 'Masters', key: 'cover.edit', label: 'Edit sales / warranties / contracts' },
  { group: 'Analytics', key: 'reports.view', label: 'View reports' },
  { group: 'Analytics', key: 'dashboard.view', label: 'View dashboard' },
  { group: 'Analytics', key: 'feedback.view', label: 'View feedback' },
  { group: 'Analytics', key: 'export.data', label: 'Export / download CSV' },
  { group: 'Admin', key: 'users.manage', label: 'Manage users' },
  { group: 'Admin', key: 'config.manage', label: 'Admin config' },
  { group: 'Admin', key: 'rbac.manage', label: 'Manage roles & permissions' },
  { group: 'Admin', key: 'audit.view', label: 'View audit log' },
  // Full data visibility (see every record), regardless of allocation. Granted
  // by role for office roles; also grantable per-user (e.g. a "Permissions +
  // Data" clone). The DB honours it in can_view_all_calls / spare read policies.
  { group: 'Admin', key: 'data.view_all', label: 'View all data (every record)' },
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
  nsm: ['calls.view', 'masters.view', 'consumption.view', 'reports.view', 'dashboard.view', 'feedback.view', 'spare.approve_nsm', 'review.edit'],
  rgm: ['calls.view', 'calls.create', 'calls.edit', 'calls.report', 'request.create', 'spare.request', 'spare.approve_rm', 'stock.transfer', 'stock.return', 'consumption.view', 'masters.view', 'reports.view', 'dashboard.view', 'feedback.view', 'review.edit'],
  rm: ['calls.view', 'calls.create', 'calls.edit', 'calls.report', 'request.create', 'spare.request', 'spare.approve_rm', 'stock.transfer', 'stock.return', 'consumption.view', 'masters.view', 'reports.view', 'dashboard.view', 'feedback.view', 'review.edit'],
  // Engineers: view + report their calls; no create/edit, no spare requests.
  engineer: ['calls.view', 'calls.report', 'request.create', 'stock.transfer', 'stock.return', 'consumption.view', 'reports.view', 'dashboard.view'],
  // Hotline: register/create calls; no spare requests. May drop a spare.
  hotline: ['calls.view', 'calls.create', 'install.create', 'calls.edit', 'request.create', 'pending.register', 'spare.approve_rm', 'spare.drop', 'consumption.view', 'consumption.reconcile', 'masters.view', 'dashboard.view', 'review.edit'],
  spare_coordinator: ['calls.view', 'spare.request', 'spare.approve_rm', 'spare.dispatch', 'spare.drop', 'stock.transfer', 'stock.return', 'consumption.view', 'consumption.reconcile', 'reports.view', 'dashboard.view'],
  stores_incharge: ['calls.view', 'spare.dispatch', 'stock.transfer', 'stock.return', 'consumption.view', 'reports.view', 'dashboard.view'],
  tally_coordinator: ['calls.view', 'consumption.view', 'reports.view', 'feedback.view', 'dashboard.view'],
  commercial: ['calls.view', 'install.create', 'consumption.view', 'reports.view', 'feedback.view', 'dashboard.view', 'masters.view', 'spare.approve_commercial', 'cover.edit', 'review.edit'],
};
// Everyone but a plain engineer can export / download data by default.
// (admin already has every functional action, so it is covered.)
(['nsm', 'rgm', 'rm', 'hotline', 'spare_coordinator', 'stores_incharge', 'tally_coordinator', 'commercial'] as const)
  .forEach((r) => { if (FUNCTIONAL_DEFAULTS[r] && !FUNCTIONAL_DEFAULTS[r].includes('export.data')) FUNCTIONAL_DEFAULTS[r].push('export.data'); });

export const DEFAULT_PERMS: Record<string, string[]> = Object.fromEntries(
  ROLE_KEYS.map((role) => [
    role,
    role === 'admin'
      ? [...FUNCTIONAL_DEFAULTS.admin, ...ALL_MODULES]
      : [...(FUNCTIONAL_DEFAULTS[role] ?? FUNCTIONAL_DEFAULTS.engineer), ...NON_ADMIN_MODULES],
  ]),
);
void ADMIN_MODULES;

// Roles that see every call (office / coordination roles) rather than being
// scoped to their own or their reporting sub-tree's calls. Engineers, RMs and
// RGMs stay scoped; admins see all via `manage-users`.
export const SEE_ALL_ROLES = new Set([
  'hotline', 'nsm', 'commercial', 'spare_coordinator', 'stores_incharge', 'tally_coordinator',
]);
export const roleSeesAllCalls = (role?: string): boolean => SEE_ALL_ROLES.has((role ?? '').toLowerCase());

// A role's permissions. An EMPTY stored list means "not configured", so fall
// back to the code defaults rather than leaving the role with no access — this
// mirrors the server's has_perm() fallback and stops a blank app_roles row from
// silently disabling a whole role.
export const permsForRole = (role: string, config: Record<string, string[]>): string[] => {
  const stored = config[role];
  if (stored && stored.length) return stored;
  return DEFAULT_PERMS[role] ?? DEFAULT_PERMS.engineer;
};

// ---------------------------------------------------------------------------
// PERMISSION TREE — the shape the Roles & Permissions screen is edited in:
// Header (the left-nav group) -> Sub-page (module) -> View + the actions that
// belong to that page. Grouping by module is what makes the matrix legible:
// "what can this role do in Spare Requests" is a question about one page, not
// about a flat list of thirty actions.
//
// `view` is always the module's own mod: key, kept separate from the actions so
// seeing a page and acting on it are granted independently.
// ---------------------------------------------------------------------------
export interface PermPage { path: string; label: string; actions: string[] }
// `lists: true` — the header also carries one page per master value list, read
// from the registry at render time so a list added later needs no code change.
export interface PermHeaderOpts { lists?: boolean }
export interface PermHeader extends PermHeaderOpts { title: string; pages: PermPage[] }

export const PERM_TREE: PermHeader[] = [
  { title: 'Overview', pages: [
    { path: '/', label: 'Dashboard', actions: ['dashboard.view'] },
    { path: '/daily-review', label: 'Daily Call Review', actions: ['review.edit'] },
  ] },
  { title: 'Master', lists: true, pages: [
    { path: '/parties', label: 'Party Master', actions: ['masters.view', 'masters.edit'] },
    { path: '/product-master', label: 'Product Master', actions: ['masters.view', 'calls.create'] },
    { path: '/user-master', label: 'User Master', actions: ['users.manage'] },
    { path: '/parts', label: 'Part Master', actions: ['masters.view', 'masters.edit'] },
    // All Masters is just the overview screen; each value list is its own page
    // under this header, so access is given list by list.
    { path: '/masters', label: 'All Masters (overview)', actions: ['masters.view', 'masters.edit'] },
  ] },
  { title: 'Contracts & Warranty', pages: [
    { path: '/warranties', label: 'Warranty Register', actions: ['cover.edit'] },
    { path: '/contracts', label: 'Contract Register', actions: [] },
  ] },
  { title: 'Service Calls', pages: [
    { path: '/request-registration', label: 'Request Registration', actions: ['request.create'] },
    { path: '/pending-registrations', label: 'Pending Registrations', actions: ['pending.register'] },
    { path: '/field-calls', label: 'Field Call Register', actions: ['calls.view', 'calls.create', 'calls.edit', 'calls.report'] },
    { path: '/installations', label: 'Installation Calls', actions: ['install.create'] },
    { path: '/pm-calls', label: 'Preventive (PM)', actions: [] },
    { path: '/pending-calls', label: 'Pending Calls', actions: [] },
    { path: '/reports', label: 'Reports', actions: ['reports.view'] },
  ] },
  { title: 'Spares', pages: [
    { path: '/spare-requests', label: 'Spare Requests', actions: ['spare.request', 'spare.approve_rm', 'spare.approve_commercial', 'spare.approve_nsm', 'spare.drop', 'spare.receive'] },
    { path: '/spare-dispatch', label: 'Pending Dispatch', actions: ['spare.dispatch'] },
    { path: '/spare-consumption', label: 'Spare Consumption', actions: ['consumption.view', 'consumption.reconcile'] },
    { path: '/handstock', label: 'Hand Stock', actions: [] },
    { path: '/mrn', label: 'Material Returns (MRN)', actions: ['stock.return'] },
    { path: '/stock-transfer', label: 'Stock Transfer', actions: ['stock.transfer'] },
  ] },
  { title: 'Quality & Analytics', pages: [
    { path: '/feedback', label: 'Customer Feedback', actions: ['feedback.view'] },
    { path: '/failure-report', label: 'Field Failure Report', actions: [] },
    { path: '/kpi', label: 'KPI & Failure Analysis', actions: [] },
  ] },
  { title: 'Administration', pages: [
    { path: '/users', label: 'User Access', actions: [] },
    { path: '/roles', label: 'Roles & Permissions', actions: ['rbac.manage'] },
    { path: '/audit', label: 'Audit Log', actions: ['audit.view'] },
    { path: '/admin-config', label: 'Admin Config', actions: ['config.manage'] },
    { path: '/settings', label: 'Settings', actions: [] },
    { path: '/version-history', label: 'Version History', actions: [] },
  ] },
  { title: 'Across the system', pages: [
    { path: '', label: 'Not tied to one page', actions: ['data.view_all', 'export.data'] },
  ] },
];

// A master value list's own permissions. Lists are created in the database, so
// the keys are derived rather than enumerated: view is the list's module key,
// and the two actions are what can be done to its values. Both actions inherit
// from the global `masters.edit` (see can() in auth.tsx and the policies in
// 0067_master_list_permissions.sql), so a role that maintains every master
// keeps working without ticking anything list by list.
export const masterAction = (key: string): string => `mod:/masters/${key}`;
export const masterEditAction = (key: string): string => `master.${key}.edit`;
export const masterDeleteAction = (key: string): string => `master.${key}.delete`;
export const masterListActions = (key: string): string[] => [masterEditAction(key), masterDeleteAction(key)];

// Those keys are built per list, so they are not in ACTIONS — the matrix asks
// here for their labels.
export const dynamicActionLabel = (key: string): string | undefined => {
  const m = /^master\.(.+)\.(edit|delete)$/.exec(key);
  if (!m) return undefined;
  return m[2] === 'edit' ? 'Add / edit values in this list' : 'Delete values from this list';
};

// Does this key inherit from a broader one the role may already hold?
export const parentAction = (key: string): string | undefined => {
  if (key.startsWith('mod:/masters/')) return 'mod:/masters';
  if (/^master\..+\.(edit|delete)$/.test(key)) return 'masters.edit';
  return undefined;
};

// Every action the tree accounts for — used to spot one that has been added to
// the system but not yet placed on a page.
export const TREE_ACTION_KEYS = new Set(PERM_TREE.flatMap((h) => h.pages.flatMap((p) => p.actions)));

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
  // TECHNICAL SUPPORT — the Super Admin's reach, none of its writes (user,
  // 2026-09-08: "Map this Role to All Modules and Mimic Super Admin - But with
  // Read Only For now"). It holds EVERY module key, including the admin ones,
  // and only the view/read actions; nothing it holds lets it change a row.
  // "For now" is the operative phrase: widening it later is ticking boxes in
  // Roles & Permissions, not a code change.
  { key: 'technical_support', label: 'Technical Support' },
  { key: 'nsm', label: 'NSM (National Service Manager)' },
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
  { path: '/spare-insights', label: 'Spare Insights' },
  { path: '/lookup', label: 'Product & Party Search' },
  { path: '/daily-review', label: 'Daily Call Review' },
  { path: '/parties', label: 'Party Master' },
  { path: '/product-master', label: 'Product Master' },
  { path: '/user-master', label: 'User Master' },
  { path: '/parts', label: 'Part Master' },
  { path: '/masters', label: 'All Masters' },
  { path: '/service-manuals', label: 'Service Manuals' },
  { path: '/qms', label: 'QMS Documents' },
  { path: '/warranties', label: 'Warranty Register' },
  { path: '/contracts', label: 'Contract Register' },
  { path: '/ownership-transfer', label: 'Ownership Transfer' },
  { path: '/request-registration', label: 'Request Registration' },
  { path: '/pending-registrations', label: 'Pending Registrations' },
  { path: '/field-calls', label: 'Field Call Register' },
  { path: '/installations', label: 'Installation Calls' },
  { path: '/pm-calls', label: 'Preventive (PM)' },
  { path: '/pending-calls', label: 'Pending Calls' },
  { path: '/reports', label: 'Visit Reports / Service Reports' },
  { path: '/report-mapping', label: 'Bulk Report Mapping', admin: true },
  // IN THE MENU AND NOT IN THE MATRIX until now: both are real pages an
  // administrator can open, and neither had a permission key — so neither could
  // be granted, withheld or even seen on this screen. Found by comparing the
  // nav to MODULES rather than by reading either (check:ui now does that
  // comparison on every run).
  { path: '/pm-bulk-upload', label: 'PM Bulk Upload', admin: true },
  { path: '/bulk-uploads', label: 'Bulk Uploads', admin: true },
  { path: '/spare-requests', label: 'Spare Requests' },
  { path: '/spare-rm-approval', label: 'RM Approval' },
  { path: '/spare-dispatch', label: 'Pending Dispatch' },
  { path: '/spare-consumption', label: 'Spare Consumption' },
  { path: '/handstock', label: 'Hand Stock' },
  { path: '/mrn', label: 'Material Returns (MRN)' },
  { path: '/stock-transfer', label: 'Stock Transfer' },
  { path: '/feedback', label: 'Customer Feedback' },
  { path: '/failure-report', label: 'Field Failure Report' },
  { path: '/kpi', label: 'KPI & Failure Analysis' },
  { path: '/objective', label: 'Objective' },
  { path: '/exports', label: 'Reports' },
  // ONE REPORT AT A TIME. The user, 2026-09-09: "in Reports also i need to be
  // able to give Access at a Sub Page level." Each report is its own key, and
  // each INHERITS from `mod:/exports` (parentAction below) -- so every role
  // that could open Reports still opens all three, and an administrator
  // restricts by turning the parent off and ticking the reports they want.
  // Exactly how a master value list works, deliberately: two mechanisms for
  // one idea is how a screen stops being predictable.
  { path: '/exports/consumption', label: 'Reports — Consumption Report' },
  { path: '/exports/kpi', label: 'Reports — KPI Export' },
  { path: '/exports/unused', label: 'Reports — Not Consumed Against this Call' },
  { path: '/tracker', label: 'Tracker' },
  { path: '/users', label: 'User Access', admin: true },
  { path: '/roles', label: 'Roles & Permissions', admin: true },
  { path: '/audit', label: 'Audit Log', admin: true },
  { path: '/admin-config', label: 'Admin Config', admin: true },
  { path: '/software-validation', label: 'Software Validation', admin: true },
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
  // MOVING A CALL TO ANOTHER ENGINEER is its own right, not a corner of "Edit
  // calls". It was bundled there, so it could not be granted to a manager who
  // should not be editing the rest of the call, nor withheld from one who
  // should — and it appeared nowhere on this screen, so "where is
  // re-allocation?" had no answer to find (reported 2026-09-06).
  { group: 'Calls', key: 'calls.allot', label: 'Re-allocate a call to another engineer' },
  // "EDIT" IS NOT ONE THING. It let anybody who could correct a customer's
  // phone number also rewrite the machine, the complaint and the vigilance
  // answers. The Hotline desk does need all of that; a manager needs almost
  // none of it (user, 2026-09-06: "1 single edit permission will not suffice").
  //
  // So `calls.edit` stays as the WHOLE right — Hotline's — and is the PARENT of
  // these four, exactly as `masters.edit` is the parent of the per-list keys
  // (0067). A role holding it keeps everything, so nothing changes until an
  // administrator unticks it and picks the sections instead.
  { group: 'Calls', key: 'calls.edit.complaint', label: ' Edit the complaint (complaint, breakdown date)' },
  { group: 'Calls', key: 'calls.edit.customer', label: ' Edit customer & product (party, city, product, serial)' },
  { group: 'Calls', key: 'calls.edit.vigilance', label: ' Edit the vigilance answers (health threat, death, incident)' },
  { group: 'Calls', key: 'calls.edit.contact', label: ' Edit customer contact details (name, number, designation)' },
  { group: 'Calls', key: 'calls.report', label: 'Report / update calls' },
  { group: 'Calls', key: 'calls.cancel', label: 'Cancel a call (and restore it)' },
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
  { group: 'Masters', key: 'ownership.transfer', label: 'Transfer a machine between customers' },
  { group: 'Documents', key: 'docs.manage', label: 'Add / edit service manuals' },
  { group: 'Documents', key: 'qms.manage', label: 'Add / edit QMS documents' },
  { group: 'Analytics', key: 'reports.view', label: 'View reports' },
  { group: 'Analytics', key: 'dashboard.view', label: 'View dashboard' },
  { group: 'Analytics', key: 'feedback.view', label: 'View feedback' },
  { group: 'Analytics', key: 'export.data', label: 'Export / download CSV' },
  { group: 'Admin', key: 'users.manage', label: 'Manage users' },
  { group: 'Admin', key: 'config.manage', label: 'Admin config' },
  { group: 'Admin', key: 'rbac.manage', label: 'Manage roles & permissions' },
  { group: 'Admin', key: 'audit.view', label: 'View audit log' },
  // SEEING AN ADMIN PAGE IS NOT RUNNING IT. The administration screens gated
  // themselves on `users.manage` / `rbac.manage` -- the rights to CHANGE what
  // is on them -- so there was no way to let somebody look. This key opens
  // them read-only: every control on them still asks for the right that
  // changes something, and this grants none of those.
  { group: 'Admin', key: 'admin.view', label: 'Open the administration pages, read-only' },
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
  // TECHNICAL SUPPORT — READ ONLY, and the list is written out rather than
  // filtered by a name pattern: `.view` is not what makes an action safe.
  // `consumption.reconcile` and `ownership.transfer` do not say "edit" either,
  // and a rule that goes by the key's spelling would hand over both the day
  // somebody names a write action `x.view`. Everything here only READS.
  //
  // `data.view_all` is what makes the rest of it useful: without it the role
  // sees every PAGE and, on the call pages, only its own rows -- which for a
  // support login is nothing at all.
  technical_support: ['calls.view', 'masters.view', 'consumption.view', 'reports.view',
                      'dashboard.view', 'feedback.view', 'audit.view', 'admin.view',
                      'export.data', 'data.view_all'],
  nsm: ['calls.view', 'calls.cancel', 'docs.manage', 'masters.view', 'consumption.view', 'reports.view', 'dashboard.view', 'feedback.view', 'spare.approve_nsm', 'review.edit'],
  rgm: ['calls.view', 'calls.create', 'calls.edit', 'calls.allot', 'calls.report', 'request.create', 'spare.request', 'spare.approve_rm', 'stock.transfer', 'stock.return', 'consumption.view', 'masters.view', 'reports.view', 'dashboard.view', 'feedback.view', 'review.edit'],
  rm: ['calls.view', 'calls.create', 'calls.edit', 'calls.allot', 'calls.report', 'request.create', 'spare.request', 'spare.approve_rm', 'stock.transfer', 'stock.return', 'consumption.view', 'masters.view', 'reports.view', 'dashboard.view', 'feedback.view', 'review.edit'],
  // Engineers: view + report their calls; no create/edit, no spare requests.
  engineer: ['calls.view', 'calls.report', 'request.create', 'stock.transfer', 'stock.return', 'consumption.view', 'reports.view', 'dashboard.view'],
  // Hotline: register/create calls; no spare requests. May drop a spare.
  hotline: ['calls.view', 'calls.cancel', 'docs.manage', 'ownership.transfer', 'calls.create', 'install.create', 'calls.edit', 'calls.allot', 'request.create', 'pending.register', 'spare.approve_rm', 'spare.drop', 'consumption.view', 'consumption.reconcile', 'masters.view', 'dashboard.view', 'review.edit'],
  spare_coordinator: ['calls.view', 'docs.manage', 'spare.request', 'spare.approve_rm', 'spare.dispatch', 'spare.drop', 'stock.transfer', 'stock.return', 'consumption.view', 'consumption.reconcile', 'reports.view', 'dashboard.view'],
  stores_incharge: ['calls.view', 'spare.dispatch', 'stock.transfer', 'stock.return', 'consumption.view', 'reports.view', 'dashboard.view'],
  tally_coordinator: ['calls.view', 'consumption.view', 'reports.view', 'feedback.view', 'dashboard.view'],
  commercial: ['calls.view', 'ownership.transfer', 'install.create', 'consumption.view', 'reports.view', 'feedback.view', 'dashboard.view', 'masters.view', 'spare.approve_commercial', 'cover.edit', 'review.edit'],
};
// Everyone but a plain engineer can export / download data by default.
// (admin already has every functional action, so it is covered.)
(['nsm', 'rgm', 'rm', 'hotline', 'spare_coordinator', 'stores_incharge', 'tally_coordinator', 'commercial'] as const)
  .forEach((r) => { if (FUNCTIONAL_DEFAULTS[r] && !FUNCTIONAL_DEFAULTS[r].includes('export.data')) FUNCTIONAL_DEFAULTS[r].push('export.data'); });

// EVERY module for the two that are meant to see everything; the non-admin ones
// for the rest. Technical Support is on the admin side of that line by design --
// "map this role to all modules" is the whole point of it -- and stays read-only
// because of what it does NOT hold above, not because a page is hidden from it.
const SEES_EVERY_MODULE = new Set(['admin', 'technical_support']);
export const DEFAULT_PERMS: Record<string, string[]> = Object.fromEntries(
  ROLE_KEYS.map((role) => [
    role,
    SEES_EVERY_MODULE.has(role)
      ? [...(FUNCTIONAL_DEFAULTS[role] ?? []), ...ALL_MODULES]
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
    { path: '/spare-insights', label: 'Spare Insights', actions: ['consumption.view'] },
    { path: '/lookup', label: 'Product & Party Search', actions: ['masters.view', 'calls.create'] },
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
  { title: 'Documents', pages: [
    { path: '/service-manuals', label: 'Service Manuals', actions: ['docs.manage'] },
    { path: '/qms', label: 'QMS Documents', actions: ['qms.manage'] },
  ] },
  { title: 'Contracts & Warranty', pages: [
    { path: '/warranties', label: 'Warranty Register', actions: ['cover.edit'] },
    { path: '/contracts', label: 'Contract Register', actions: [] },
    { path: '/ownership-transfer', label: 'Ownership Transfer', actions: ['ownership.transfer', 'cover.edit'] },
  ] },
  { title: 'Service Calls', pages: [
    { path: '/request-registration', label: 'Request Registration', actions: ['request.create'] },
    { path: '/pending-registrations', label: 'Pending Registrations', actions: ['pending.register'] },
    { path: '/field-calls', label: 'Field Call Register', actions: ['calls.view', 'calls.create', 'calls.edit', 'calls.edit.complaint', 'calls.edit.customer', 'calls.edit.vigilance', 'calls.edit.contact', 'calls.allot', 'calls.report', 'calls.cancel'] },
    { path: '/installations', label: 'Installation Calls', actions: ['install.create'] },
    { path: '/pm-calls', label: 'Preventive (PM)', actions: [] },
    { path: '/pending-calls', label: 'Pending Calls', actions: [] },
    { path: '/reports', label: 'Visit Reports / Service Reports', actions: ['reports.view'] },
    { path: '/report-mapping', label: 'Bulk Report Mapping', actions: [] },
    { path: '/bulk-uploads', label: 'Bulk Uploads', actions: [] },
    { path: '/pm-bulk-upload', label: 'PM Bulk Upload', actions: [] },
  ] },
  { title: 'Spares', pages: [
    { path: '/spare-requests', label: 'Spare Requests', actions: ['spare.request', 'spare.approve_rm', 'spare.approve_commercial', 'spare.approve_nsm', 'spare.drop', 'spare.receive'] },
    { path: '/spare-rm-approval', label: 'RM Approval', actions: ['spare.approve_rm'] },
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
    { path: '/objective', label: 'Objective', actions: [] },
  ] },
  // A HEADER OF ITS OWN, because the MENU has one (2026-09-08). The matrix is
  // read next to the menu — "what can this role open?" is asked with the menu
  // in front of you — so a header here that no longer exists there makes the
  // page harder to trust than to use.
  { title: 'Reports', pages: [
    // The parent GRANTS ALL THREE below it, so a role that only needs one is
    // given that one and not this.
    { path: '/exports', label: 'Reports (all of them)', actions: [] },
    { path: '/exports/consumption', label: '↳ Consumption Report', actions: [] },
    { path: '/exports/kpi', label: '↳ KPI Export', actions: [] },
    { path: '/exports/unused', label: '↳ Not Consumed Against this Call', actions: [] },
  ] },
  { title: 'Administration', pages: [
    { path: '/tracker', label: 'Tracker', actions: [] },
    { path: '/users', label: 'User Access', actions: [] },
    { path: '/roles', label: 'Roles & Permissions', actions: ['rbac.manage'] },
    { path: '/audit', label: 'Audit Log', actions: ['audit.view'] },
    { path: '/admin-config', label: 'Admin Config', actions: ['config.manage'] },
    { path: '/software-validation', label: 'Software Validation', actions: ['config.manage'] },
    { path: '/settings', label: 'Settings', actions: [] },
    { path: '/version-history', label: 'Version History', actions: [] },
  ] },
  { title: 'Across the system', pages: [
    { path: '', label: 'Not tied to one page', actions: ['data.view_all', 'export.data', 'admin.view'] },
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
  // A single report is covered by Reports as a whole, the same way.
  if (key.startsWith('mod:/exports/')) return 'mod:/exports';
  if (/^master\..+\.(edit|delete)$/.test(key)) return 'masters.edit';
  // A section of a call is covered by the whole-call right, the same way.
  // Whoever may edit everything may edit any part of it, so a role that had
  // `calls.edit` before the sections existed loses nothing by their existing.
  if (/^calls\.edit\..+$/.test(key)) return 'calls.edit';
  return undefined;
};

// Every action the tree accounts for — used to spot one that has been added to
// the system but not yet placed on a page.
export const TREE_ACTION_KEYS = new Set(PERM_TREE.flatMap((h) => h.pages.flatMap((p) => p.actions)));

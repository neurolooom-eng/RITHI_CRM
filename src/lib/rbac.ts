import { callFamily } from './calltype';
// ---------------------------------------------------------------------------
// Role-Based Access Control (RBAC).
// Roles, the canonical action list (functional actions + one per module), and
// starting defaults live here. The role → allowed-actions map is stored in
// Supabase (app_roles) and edited by admins; auth.tsx's can(action) resolves a
// user's role against it. Every module (nav item) is gated by a mod:<path> key.
// ---------------------------------------------------------------------------

export interface RoleDef { key: string; label: string }
export const ROLES: RoleDef[] = [
  // "Admin", NOT "Admin / Super Admin" (2026-09-09). The old label promised
  // something this dropdown cannot do: SUPER ADMIN IS NOT A ROLE. It is a row
  // in `app_super_admins` matched against a hardcoded list in auth.tsx, and
  // adding one is a migration plus a code change -- on purpose, since it is the
  // account that overrides every other check. Picking this grants Admin and
  // never Super Admin, and the label now says only what it does.
  { key: 'admin', label: 'Admin' },
  // TECHNICAL SUPPORT — the Super Admin's reach, none of its writes (user,
  // 2026-09-08: "Map this Role to All Modules and Mimic Super Admin - But with
  // Read Only For now"). It holds EVERY module key, including the admin ones,
  // and only the view/read actions; nothing it holds lets it change a row.
  // "For now" is the operative phrase: widening it later is ticking boxes in
  // Roles & Permissions, not a code change.
  { key: 'technical_support', label: 'Technical Support' },
  // ZOHO MIGRATION — Technical Support's twin, and a SEPARATE role on purpose
  // (user, 2026-09-09: "Add one more Role called ZohoMigration, Use Technical
  // Support as the Cloning Role, Add this to all the Modules, Pages, Sub Pages,
  // Actions"). Reusing Technical Support would do the same job today and tangle
  // two unrelated lives tomorrow: this one ends when the migration does and can
  // be revoked in a tick, without touching the support login. Its permissions
  // are DERIVED from technical_support below rather than copied, so the two
  // cannot drift.
  { key: 'zoho_migration', label: 'Zoho Migration' },
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
  // MY WORKLOAD — the queues that used to sit as cards on top of every
  // register (the user, 2026-09-15). Beside the Dashboard because it answers
  // the same question at a glance, for one person rather than the company.
  { path: '/workload', label: 'My Workload' },
  { path: '/lookup', label: 'Product & Party Search' },
  // RENAMED to the CONTROLLED FORM'S OWN NAME (the user, 2026-09-20). The
  // ROUTE is deliberately unchanged: the module key IS the route, so moving
  // it would take the screen away from every role that holds it and need a
  // migration to put back. A rename of the LABEL alone needs none.
  { path: '/daily-review', label: 'Daily Complaint Review Register (R/SER/35)' },
  // WHAT FAILS AND WHY, from every reviewed call — and what is consumed
  // fixing it. Both moved out of Overview into Quality & Analytics (the user,
  // 2026-09-15); the ROUTE is unchanged, so no permission moves with them.
  { path: '/product-failure', label: 'Product Failure Analysis' },
  { path: '/spare-insights', label: 'Spare Insights' },
  { path: '/call-review', label: 'Call Review' },
  { path: '/parties', label: 'Party Master' },
  // RENAMED AND MOVED (2026-09-14). The install base is the PRODUCT DATABASE
  // and its key moves with it — 0192 copies `mod:/product-master` into
  // `mod:/product-database` for every role that had it, so nobody loses the
  // screen. The old key now means the CATALOGUE below, which is a different
  // screen: leaving it pointing at a new thing without moving the audience
  // would have been a silent change of what a role can see.
  { path: '/product-database', label: 'Product Database' },
  // PRODUCT DATABASE 2.0 — the same machines DERIVED from the five registers
  // rather than stored. A SECOND screen on purpose (the user, 2026-09-20: "Do
  // Not disturb the current product Database"), so the two can be compared on
  // live data before either moves.
  { path: '/product-database-2', label: 'Product Database 2.0' },
  { path: '/product-master', label: 'Product Master (product lines)' },
  { path: '/user-master', label: 'User Master' },
  { path: '/parts', label: 'Part Master' },
  { path: '/masters', label: 'All Masters' },
  // HOW RITHI FUNCTIONS — the two call flows and the masters behind them. It
  // shipped `alwaysOpen` (not a module, open to everyone) and was RESTRICTED
  // the same day at the user's request to Admin, NSM, Zoho Migration and
  // Technical Support. `admin: true` is what does three quarters of that: it
  // keeps the key out of NON_ADMIN_MODULES, so the code defaults give it to
  // exactly the three roles in SEES_EVERY_MODULE; NSM is added by name below.
  // 0209 is the other half — on a project in use, a code default reaches
  // nobody, because every role already has a stored row.
  { path: '/knowledge-base/how-it-works', label: 'How RITHI Functions', admin: true },
  { path: '/service-manuals', label: 'Service Manuals' },
  // A SUB-PAGE of Service Manuals: parentAction() lets `mod:/service-manuals`
  // open it, so every role that reads the manuals reads the notes with no
  // role changed (the user's standing rule).
  { path: '/service-manuals/notes', label: 'Technical / Service Notes' },
  { path: '/qms', label: 'QMS Documents' },
  // TRAINING (0264): assignments, sessions, everyone's records. `admin: true`
  // keeps it out of the everyday roles' code defaults; 0264 grants it to VP
  // Technical and R&D Engineer -- the only roles the user allowed to change.
  // Everybody sees their OWN training on My Profile, not here.
  { path: '/training', label: 'Training', admin: true },
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
  { path: '/data-export', label: 'Data Export', admin: true },
  // DEVICE CACHE STATUS -- administrators to begin with. `admin: true` keeps the
  // key out of NON_ADMIN_MODULES and 0249 merges it into `app_roles` for admin
  // and technical_support (row 114's property); the same key gates the ROWS
  // (dcs_read, device_cache_report()), so ticking it for another role on Roles
  // & Permissions opens both the screen and its data.
  { path: '/device-cache', label: 'Device Cache Status', admin: true },
  { path: '/spare-requests', label: 'Spare Requests' },
  { path: '/spare-rm-approval', label: 'RM Approval' },
  { path: '/spare-dispatch', label: 'Pending Dispatch' },
  // STOCK OUT — the flat list of what Stores has issued, a page since
  // 2026-09-12 (it was a tab on Pending Dispatch). Its own key rather than
  // Pending Dispatch's: the people who read it — Commercial chasing a DC, a
  // Reporting Manager checking what an engineer was sent — are not the people
  // who work the queue, and one key could not tell the two apart.
  { path: '/stock-out', label: 'Stock Out' },
  { path: '/spare-consumption', label: 'Spare Consumption' },
  { path: '/handstock', label: 'Hand Stock' },
  { path: '/mrn', label: 'Material Returns (MRN)' },
  { path: '/stock-transfer', label: 'Stock Transfer' },
  { path: '/feedback', label: 'Customer Feedback' },
  { path: '/failure-report', label: 'Field Failure Register' },
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
  { path: '/exports/calls', label: 'Reports — Call Report' },
  { path: '/exports/feedback', label: 'Reports — Customer Feedback Report' },
  // IN THE REPORTS GROUP, BUT NOT UNDER `/exports` — and that is the whole
  // reason for the path. Every `mod:/exports/...` key INHERITS from
  // `mod:/exports` (parentAction), so filing it there would hand it to every
  // role that can open Reports. The user asked for administrators only
  // (2026-09-22), and `admin: true` keeps it out of NON_ADMIN_MODULES.
  { path: '/feedback-without-report', label: 'Feedback Without a Report', admin: true },
  // HAND STOCK REPORT — in the Reports group and NOT under `/exports`, for
  // the same reason as the line above: every `mod:/exports/...` key inherits
  // from `mod:/exports`, so filing it there would hand it to every role that
  // can open Reports. The user asked for administrators to begin with
  // (2026-09-24) and said they would grant the rest themselves, so
  // `admin: true` keeps the key out of NON_ADMIN_MODULES and 0241 writes it
  // into `app_roles` for `admin` and `technical_support` (0241's own grant) --
  // not for the remaining role in SEES_EVERY_MODULE, because the standing rule
  // is to leave a role alone unless it was named.
  { path: '/handstock-report', label: 'Hand Stock Report', admin: true },
  // MACHINES WITHOUT AN INSTALLATION CALL (0319) -- "view only for Admins"
  // (the user, 2026-10-02). In the Reports group and not under `/exports`, for
  // the Hand Stock Report's reason; `admin: true` keeps it out of every other
  // role's defaults and 0319 grants the key to `admin` and `technical_support`
  // (which carries every page key the admin holds, row 114). The same key
  // gates the ROWS (install_calls_unmapped()).
  { path: '/install-calls-unmapped', label: 'Machines Without an Installation Call', admin: true },
  // INDOOR SERVICE — the workshop register (procedure §4.5). Its own module,
  // because a DEMO unit has no call to hang off: the register stands alone and
  // the call is an optional link, not the other way round.
  { path: '/machine-history', label: 'Machine History' },
  // PART SEARCH -- every role (the user, 2026-10-01); 0308 merges the key into
  // every configured role, since on a project in use a code default reaches
  // nobody.
  { path: '/part-search', label: 'Part Search' },
  { path: '/indoor', label: 'Indoor Service Register' },
  // SOLVED WITHOUT A REPORT — administrators only (the user, 2026-09-20:
  // "View only for Admins and Super Admins"). `admin: true` keeps the key out
  // of NON_ADMIN_MODULES, leaving SEES_EVERY_MODULE's three; 0224 is the other
  // half, because on a project in use a code default reaches nobody.
  { path: '/missing-visit-reports', label: 'Solved Without a Report', admin: true },
  { path: '/tracker', label: 'Tracker' },
  { path: '/roles', label: 'Roles & Permissions', admin: true },
  { path: '/audit', label: 'Audit Log', admin: true },
  { path: '/admin-config', label: 'Admin Config', admin: true },
  // SLA / OBJECTIVE CONFIGURATION (0354) -- the Admin role only by default,
  // with every action on it (the user, 2026-10-04: "By Default Grant Permission
  // to Admin - All Actions, Rest let the Admin Decide through the App").
  // `admin: true` keeps the key out of NON_ADMIN_MODULES; 0354 merges it into
  // the admin row of `app_roles`, because a code default reaches nobody.
  { path: '/sla-objective-config', label: 'SLA / Objective Configuration', admin: true },
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
// EXPORTED so a person can be shown what they hold, in words. My Profile lists
// it: "an action missing here is why a button is missing on a screen".
export const FUNCTIONAL_ACTIONS: ActionDef[] = [
  { group: 'Calls', key: 'calls.view', label: 'View calls' },
  { group: 'Calls', key: 'calls.create', label: 'Create / register calls' },
  { group: 'Calls', key: 'install.create', label: 'Create installation calls (Commercial)' },
  { group: 'Calls', key: 'calls.edit', label: 'Edit Field calls (all sections)' },
  // MOVING A CALL TO ANOTHER ENGINEER is its own right, not a corner of "Edit
  // calls". It was bundled there, so it could not be granted to a manager who
  // should not be editing the rest of the call, nor withheld from one who
  // should — and it appeared nowhere on this screen, so "where is
  // re-allocation?" had no answer to find (reported 2026-09-06).
  { group: 'Calls', key: 'calls.allot', label: 'Re-allocate a Field call to another engineer' },
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
  { group: 'Calls', key: 'calls.report', label: 'Report / update Field calls (all of the below)' },
  // THE PARTS OF REPORTING A VISIT (finding 67, the user: "Break it down").
  // `calls.report` is their PARENT, as `calls.edit` is of the sections: a role
  // holding it keeps all three until an administrator unticks it and picks.
  // Spares and feedback are the same act on every register, so they are one
  // key each, children of all three registers' report keys (perm_parents, 0286).
  { group: 'Calls', key: 'calls.report.visit', label: ' File a visit on a Field call' },
  { group: 'Calls', key: 'visit.spares', label: ' Book spares used on a visit (any register)' },
  { group: 'Calls', key: 'visit.feedback', label: ' Record customer feedback on a visit (any register)' },
  { group: 'Calls', key: 'calls.cancel', label: 'Cancel a Field call (and restore it)' },
  // RE-OPENING is its own tick (finding 63): it was "calls.create or
  // pending.register", shown on no row. Copied from those two by 0298.
  { group: 'Calls', key: 'calls.reopen', label: 'Re-open, close or close again a Field call' },
  { group: 'Calls', key: 'review.edit', label: 'Complete the daily call review (Review 2 / 3)' },
  // WHO MAY SWITCH AUTO REVIEW ON OR OFF (0269, 0285). Its answers carry the
  // name of whoever switched it on. Held by ROLE -- Admin, NSM and Technical
  // Support (0285, which replaced 0269's two names); anybody else can be given
  // it on User Master -> Access.
  { group: 'Calls', key: 'review.auto', label: 'Switch auto review on or off (Review 2 answered No in your name)' },
  // WHAT WAS ADMIN-ONLY IS A KEY NOW (the user, 2026-09-30: "All Admin Actions
  // that are greyed out now should be editable from the Role & Permissions.
  // Only the Admin Role should be Greyed out not the Actions."). Ten of them,
  // each asked for by the database as well as the screen (0302-0307). Nobody
  // but Admin holds any on the day they arrive: an administrator ticks them.
  { group: 'Calls', key: 'review.correct_date', label: 'Correct the date a review was completed' },
  // A SECOND review, on the REPORT rather than the failure -- so a separate
  // right. Somebody who completes the DCCR is not thereby entitled to sign off
  // that a closed call's report stands, and the two are held by different
  // people here. It also carries the Reco and Re-open actions on that screen.
  { group: 'Calls', key: 'callreview.mark', label: 'Review a closed call\u2019s report (mark Report Reviewed)' },
  // Deciding a failure goes to manufacturing is not the same act as coding the
  // call in the Daily Complaint Review Register, and the two are held by different people
  // here — so it is its own right rather than riding on review.edit.
  // READING THE REGISTER IS ITS OWN RIGHT (0176). The page key opens the SCREEN;
  // this is what puts rows on it. They were one thing until somebody held
  // ffr.manage, opened the register and found it empty — the data is governed
  // by RLS, which knew nothing about either permission and scoped the register
  // to call visibility instead.
  { group: 'Calls', key: 'ffr.view', label: 'Read the whole Field Failure Register' },
  { group: 'Calls', key: 'ffr.manage', label: 'Raise and complete a Field Failure Report' },
  // INSTALLATION AND PM CALLS HAVE KEYS OF THEIR OWN (findings 63/64, the user,
  // 2026-09-30: "It should show the Individual View's Control Action and its
  // Check Box"). They were governed by the Field Call keys and showed none, so
  // an administrator could neither see nor separate them. 0298 copied today's
  // grants across, so nobody gained or lost anything the day they appeared.
  { group: 'Installation Calls', key: 'install.edit', label: 'Edit installation calls (all sections)' },
  { group: 'Installation Calls', key: 'install.edit.complaint', label: ' Edit the complaint' },
  { group: 'Installation Calls', key: 'install.edit.customer', label: ' Edit customer & product' },
  { group: 'Installation Calls', key: 'install.edit.vigilance', label: ' Edit the vigilance answers' },
  { group: 'Installation Calls', key: 'install.edit.contact', label: ' Edit customer contact details' },
  { group: 'Installation Calls', key: 'install.allot', label: 'Re-allocate an installation call' },
  { group: 'Installation Calls', key: 'install.report', label: 'Report / update installation calls (all of the below)' },
  { group: 'Installation Calls', key: 'install.report.visit', label: ' File a visit on an installation call' },
  { group: 'Installation Calls', key: 'install.cancel', label: 'Cancel an installation call (and restore it)' },
  { group: 'Installation Calls', key: 'install.reopen', label: 'Re-open, close or close again an installation call' },
  { group: 'PM Calls', key: 'pm.create', label: 'Create PM calls' },
  { group: 'PM Calls', key: 'pm.edit', label: 'Edit PM calls (all sections)' },
  { group: 'PM Calls', key: 'pm.edit.complaint', label: ' Edit the complaint' },
  { group: 'PM Calls', key: 'pm.edit.customer', label: ' Edit customer & product' },
  { group: 'PM Calls', key: 'pm.edit.vigilance', label: ' Edit the vigilance answers' },
  { group: 'PM Calls', key: 'pm.edit.contact', label: ' Edit customer contact details' },
  { group: 'PM Calls', key: 'pm.allot', label: 'Re-allocate a PM call' },
  { group: 'PM Calls', key: 'pm.report', label: 'Report / update PM calls (all of the below)' },
  { group: 'PM Calls', key: 'pm.report.visit', label: ' File a visit on a PM call' },
  { group: 'PM Calls', key: 'pm.cancel', label: 'Cancel a PM call (and restore it)' },
  { group: 'PM Calls', key: 'pm.reopen', label: 'Re-open, close or close again a PM call' },
  { group: 'Requests', key: 'request.create', label: 'Raise call requests' },
  { group: 'Requests', key: 'pending.register', label: 'Register pending (Hotline)' },
  { group: 'Spares', key: 'spare.request', label: 'Request spares' },
  { group: 'Spares', key: 'spare.approve_rm', label: 'Approve spare — RM stage' },
  { group: 'Spares', key: 'spare.approve_commercial', label: 'Approve spare — Commercial' },
  { group: 'Spares', key: 'spare.approve_nsm', label: 'Approve spare — NSM' },
  { group: 'Spares', key: 'spare.dispatch', label: 'Dispatch / DC (Stores)' },
  { group: 'Spares', key: 'spare.drop', label: 'Drop a spare (any stage)' },
  { group: 'Spares', key: 'spare.receive', label: 'Acknowledge spare receipt' },
  { group: 'Spares', key: 'spare.reassign', label: 'Change the engineer on a spare request (before dispatch)' },
  { group: 'Spares', key: 'stock.return', label: 'Return spares to Stores (MRN)' },
  // Returning stock IN ANOTHER ENGINEER'S NAME (finding 64): the screen asked
  // users.manage / dispatch / RM approval, the database any approval stage or
  // dispatch. One key now, copied from what the database asked (0298).
  { group: 'Spares', key: 'stock.return.others', label: 'Return stock in another engineer\u2019s name' },
  // INDOOR SERVICE — five rights, because the procedure separates the roles.
  // `indoor.qc` being its own right is the one that matters: it is what allows
  // the quality check of 4.5.6 to be somebody other than the person who did the
  // work. All five are enforced by a database trigger (0158), not by hiding
  // buttons — a right the database does not test is a hidden button, and this
  // project has found hidden buttons twice (0126, 0127).
  { group: 'Indoor Service', key: 'indoor.receive', label: 'Receive equipment into the workshop' },
  { group: 'Indoor Service', key: 'indoor.work', label: 'Record cleaning, findings and work done' },
  { group: 'Indoor Service', key: 'indoor.qc', label: 'Sign the quality check (4.5.6)' },
  { group: 'Indoor Service', key: 'indoor.dispatch', label: 'Dispatch a unit back' },
  // GRANTED TO NOBODY BY DEFAULT, admin aside. Scrapping a machine — customer
  // property above all — is a decision somebody makes deliberately, not one
  // that arrives with the page.
  { group: 'Indoor Service', key: 'indoor.condemn', label: 'Condemn a unit (scrap it)' },
  // R/SER/07 "VERIFIED BY" (0320): a supervisor's verification of a completed
  // register row. Its own key, asked by the database and stamped from the
  // session; granted to NOBODY by the migration -- an administrator ticks it.
  { group: 'Indoor Service', key: 'indoor.verify', label: 'Verify an Indoor Service register entry' },
  // DELETING A JOB PERMANENTLY (0324, the user, 2026-10-03: "Allow Admin by
  // default, rest I will update from Roles & Permissions"). Asked by
  // delete_indoor_job(), which refuses a job any DC or filed visit names;
  // granted to NO role by the migration -- an administrator passes anyway.
  { group: 'Indoor Service', key: 'indoor.delete', label: 'Delete an Indoor Service job' },
  { group: 'Spares', key: 'consumption.view', label: 'View consumption' },
  { group: 'Spares', key: 'consumption.reconcile', label: 'Add consumption against a call (reconciliation)' },
  { group: 'Spares', key: 'stock.transfer', label: 'Transfer hand-stock between engineers' },
  { group: 'Masters', key: 'masters.view', label: 'View masters' },
  { group: 'Masters', key: 'masters.edit', label: 'Edit masters (all of the below)' },
  // THE PARTS OF "EDIT MASTERS" (finding 67). Its children, so a role holding
  // it keeps all four; untick it and pick to separate them. KYC and the part
  // rename were the two nobody could withhold from a master editor.
  { group: 'Masters', key: 'masters.edit.records', label: ' Add / edit master records (parties, parts, products, lists)' },
  { group: 'Masters', key: 'masters.edit.kyc', label: ' Verify a party\u2019s KYC' },
  { group: 'Masters', key: 'masters.edit.rename_part', label: ' Rename a part (moves every record that names it)' },
  { group: 'Masters', key: 'masters.edit.swap_serviceman', label: ' Swap the Serviceman on every party at once' },
  // ONE KEY TO ADD, ONE TO EDIT, ONE TO DELETE PER MASTER (0325, the user,
  // 2026-10-03). Add and edit are children of "Add / edit master records", so
  // a role holding it keeps both; delete is a child of "Edit masters" only and
  // otherwise granted to nobody. A delete is refused while any record still
  // names the row (master_delete_guard).
  { group: 'Masters', key: 'masters.parties.add', label: ' Party Master: add a party' },
  { group: 'Masters', key: 'masters.parties.edit', label: ' Party Master: edit a party' },
  { group: 'Masters', key: 'masters.parties.delete', label: ' Party Master: delete a party nothing names' },
  { group: 'Masters', key: 'masters.product_master.add', label: ' Product Master: add a product line' },
  { group: 'Masters', key: 'masters.product_master.edit', label: ' Product Master: edit a product line' },
  { group: 'Masters', key: 'masters.product_master.delete', label: ' Product Master: delete a line nothing names' },
  { group: 'Masters', key: 'masters.parts.add', label: ' Part Master: add a part' },
  { group: 'Masters', key: 'masters.parts.edit', label: ' Part Master: edit a part' },
  { group: 'Masters', key: 'masters.parts.delete', label: ' Part Master: delete a part nothing names' },
  { group: 'Masters', key: 'cover.edit', label: 'Edit sales / warranties (all of the below)' },
  { group: 'Masters', key: 'cover.edit.entries', label: ' Add / edit warranty entries and their machines' },
  { group: 'Masters', key: 'cover.edit.delete', label: ' Delete a whole warranty entry with its machines' },
  // THE CONTRACT REGISTER'S OWN (finding 63): it was governed by cover.edit and
  // its row showed nothing. Copied from cover.edit by 0298.
  { group: 'Masters', key: 'contract.edit', label: 'Edit contracts (all of the below)' },
  { group: 'Masters', key: 'contract.edit.entries', label: ' Add / edit contract entries and their machines' },
  { group: 'Masters', key: 'contract.edit.delete', label: ' Delete a whole contract entry with its machines' },
  { group: 'Masters', key: 'pd2.rebuild', label: 'Rebuild Product Database 2.0' },
  { group: 'Masters', key: 'ownership.transfer', label: 'Transfer a machine between customers' },
  { group: 'Documents', key: 'docs.manage', label: 'Add / edit service manuals' },
  { group: 'Documents', key: 'qms.manage', label: 'Add / edit QMS documents' },
  { group: 'Documents', key: 'training.manage', label: 'Manage training — assign, record sessions, see everyone\'s training and R&R' },
  { group: 'Analytics', key: 'reports.view', label: 'View reports' },
  { group: 'Analytics', key: 'feedback.view', label: 'View feedback' },
  { group: 'Analytics', key: 'export.data', label: 'Export / download CSV' },
  { group: 'Admin', key: 'users.manage', label: 'Manage users (all of the below)' },
  // THE PARTS OF "MANAGE USERS" (finding 67). Creating a login no longer
  // carries the right to decide what that login may do. Resetting a password
  // is NOT a part of it -- it is its own key below, so ticking Manage users
  // never hands it over.
  { group: 'Admin', key: 'users.manage.details', label: ' Edit User Master details, profiles and R&R' },
  { group: 'Admin', key: 'users.manage.create', label: ' Create logins (a new login is an Engineer; any other role needs the tick below)' },
  { group: 'Admin', key: 'users.manage.disable', label: ' Disable or delete logins' },
  { group: 'Admin', key: 'users.manage.access', label: ' Assign roles & grant permissions' },
  { group: 'Admin', key: 'users.manage.settings', label: ' Change the Settings page (connections, templates)' },
  // NOT a child of users.manage, deliberately: it lets somebody sign in as
  // anyone whose password they reset, so it is ticked on its own. The database
  // still refuses a non-administrator resetting an administrator's (0305).
  { group: 'Admin', key: 'users.reset_password', label: 'Reset a person\u2019s password' },
  { group: 'Admin', key: 'config.manage', label: 'Admin config (SLA targets, Call Registration desk, Frequent Failure rule)' },
  // SCREENS THAT BORROWED config.manage get keys of their own (finding 63);
  // 0298 copied each from config.manage, which the database asked for.
  { group: 'Admin', key: 'objective.manage', label: 'Edit, recalculate and cut off the quality objectives' },
  { group: 'Admin', key: 'objective.lock', label: 'Lock or unlock the objective cut-off' },
  { group: 'Admin', key: 'bulk.upload', label: 'Load registers in bulk (Bulk Uploads)' },
  { group: 'Admin', key: 'pm.bulk_upload', label: 'Upload PM calls in bulk' },
  { group: 'Admin', key: 'import.panel', label: 'Load data through the Data Import panel' },
  { group: 'Admin', key: 'export.tables', label: 'Export whole tables (Data Export)' },
  { group: 'Admin', key: 'export.schedules', label: 'Create, pause or delete an export schedule' },
  { group: 'Admin', key: 'audit.mode', label: 'Switch Audit Mode on or off, and read its history' },
  { group: 'Admin', key: 'charts.share', label: 'Share a chart with a role or with everyone' },
  { group: 'Admin', key: 'validation.manage', label: 'Record software validation results' },
  { group: 'Admin', key: 'layouts.share', label: 'Save a table layout for everyone or for a role' },
  { group: 'Admin', key: 'tracker.delete', label: 'Delete a Tracker item' },
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
  // TECHNICAL SUPPORT — READ ONLY but for the Auto Review switch, and the list is written out rather than
  // filtered by a name pattern: `.view` is not what makes an action safe.
  // `consumption.reconcile` and `ownership.transfer` do not say "edit" either,
  // and a rule that goes by the key's spelling would hand over both the day
  // somebody names a write action `x.view`. Everything here only READS.
  //
  // `data.view_all` is what makes the rest of it useful: without it the role
  // sees every PAGE and, on the call pages, only its own rows -- which for a
  // support login is nothing at all.
  // ONE EXCEPTION, added below the Zoho clone: review.auto (0285).
  technical_support: ['calls.view', 'masters.view', 'consumption.view', 'reports.view',
                      'feedback.view', 'audit.view', 'admin.view',
                      'export.data', 'data.view_all'],
  // NSM HOLDS THE KEY BY NAME. The module is marked `admin: true` so it stays
  // out of NON_ADMIN_MODULES, which would otherwise hand it to all twelve
  // roles; that leaves admin, technical_support and zoho_migration (the three
  // in SEES_EVERY_MODULE), and the user asked for NSM as well.
  nsm: ['mod:/knowledge-base/how-it-works', 'ffr.view', 'ffr.manage', 'callreview.mark', 'calls.view', 'calls.cancel', 'docs.manage', 'masters.view', 'consumption.view', 'reports.view', 'feedback.view', 'spare.approve_nsm', 'review.edit', 'indoor.receive', 'indoor.work', 'indoor.qc', 'indoor.dispatch'],
  rgm: ['ffr.view', 'ffr.manage', 'calls.view', 'calls.create', 'calls.edit', 'calls.allot', 'calls.report', 'request.create', 'spare.request', 'spare.approve_rm', 'stock.transfer', 'stock.return', 'consumption.view', 'masters.view', 'reports.view', 'feedback.view', 'review.edit'],
  rm: ['ffr.view', 'ffr.manage', 'callreview.mark', 'calls.view', 'calls.create', 'calls.edit', 'calls.allot', 'calls.report', 'request.create', 'spare.request', 'spare.approve_rm', 'stock.transfer', 'stock.return', 'consumption.view', 'masters.view', 'reports.view', 'feedback.view', 'review.edit'],
  // Engineers: view + report their calls; no create/edit, no spare requests.
  engineer: ['calls.view', 'calls.report', 'request.create', 'stock.transfer', 'stock.return', 'consumption.view', 'reports.view'],
  // Hotline: register/create calls; no spare requests. May drop a spare.
  hotline: ['ffr.view', 'ffr.manage', 'callreview.mark', 'calls.view', 'calls.cancel', 'docs.manage', 'ownership.transfer', 'calls.create', 'install.create', 'calls.edit', 'calls.allot', 'request.create', 'pending.register', 'spare.approve_rm', 'spare.drop', 'consumption.view', 'consumption.reconcile', 'masters.view', 'review.edit'],
  spare_coordinator: ['calls.view', 'docs.manage', 'spare.request', 'spare.approve_rm', 'spare.dispatch', 'spare.drop', 'stock.transfer', 'stock.return', 'consumption.view', 'consumption.reconcile', 'reports.view', 'indoor.receive', 'indoor.work', 'indoor.dispatch'],
  stores_incharge: ['calls.view', 'spare.dispatch', 'stock.transfer', 'stock.return', 'consumption.view', 'reports.view', 'indoor.receive', 'indoor.work', 'indoor.dispatch'],
  tally_coordinator: ['calls.view', 'consumption.view', 'reports.view', 'feedback.view'],
  commercial: ['calls.view', 'ownership.transfer', 'install.create', 'consumption.view', 'reports.view', 'feedback.view', 'masters.view', 'spare.approve_commercial', 'cover.edit', 'review.edit'],
};

// CLONED FROM TECHNICAL SUPPORT, by reference rather than by a second copy of
// the same list. A migration READS everything and writes nothing here — what it
// writes goes into Zoho — so that list is already exactly right, and deriving it
// means a change to one is a change to both. `export.data` is the permission
// doing the actual work.
FUNCTIONAL_DEFAULTS.zoho_migration = [...FUNCTIONAL_DEFAULTS.technical_support];

// WHO MAY SWITCH AUTO REVIEW IS A ROLE (0285, the user, 2026-09-30: "instead of
// hard coded names, can u change it to role - Admin, NSM, Technical Support").
// Admin already holds every functional action. Added AFTER the Zoho clone so
// that role does not inherit it: for Technical Support it is the ONE write the
// role holds, given knowingly ("Yes, include it"), not a widening to copy.
FUNCTIONAL_DEFAULTS.technical_support.push('review.auto');
FUNCTIONAL_DEFAULTS.nsm.push('review.auto');

// Everyone but a plain engineer can export / download data by default.
// (admin already has every functional action, so it is covered.)
(['nsm', 'rgm', 'rm', 'hotline', 'spare_coordinator', 'stores_incharge', 'tally_coordinator', 'commercial'] as const)
  .forEach((r) => { if (FUNCTIONAL_DEFAULTS[r] && !FUNCTIONAL_DEFAULTS[r].includes('export.data')) FUNCTIONAL_DEFAULTS[r].push('export.data'); });

// EVERY module for the two that are meant to see everything; the non-admin ones
// for the rest. Technical Support is on the admin side of that line by design --
// "map this role to all modules" is the whole point of it -- and stays read-only
// because of what it does NOT hold above, not because a page is hidden from it.
const SEES_EVERY_MODULE = new Set(['admin', 'technical_support', 'zoho_migration']);

// THE PER-SCREEN KEYS, COPIED FROM THE KEY EACH REPLACES (findings 63/64).
// The SAME list 0298_permission_grants_copied.sql applied once to the stored
// roles and people; applied here to the defaults, so a role that has never
// been configured reads exactly as a configured one did. `check:ui` compares
// the two lists pair by pair.
export const PERM_COPIES: [string, string[]][] = [
  ['install.edit', ['calls.edit']],
  ['install.edit.complaint', ['calls.edit.complaint']],
  ['install.edit.customer', ['calls.edit.customer']],
  ['install.edit.vigilance', ['calls.edit.vigilance']],
  ['install.edit.contact', ['calls.edit.contact']],
  ['install.allot', ['calls.allot']],
  ['install.report', ['calls.report']],
  ['install.cancel', ['calls.cancel']],
  ['install.reopen', ['calls.create', 'pending.register']],
  ['pm.create', ['calls.create']],
  ['pm.edit', ['calls.edit']],
  ['pm.edit.complaint', ['calls.edit.complaint']],
  ['pm.edit.customer', ['calls.edit.customer']],
  ['pm.edit.vigilance', ['calls.edit.vigilance']],
  ['pm.edit.contact', ['calls.edit.contact']],
  ['pm.allot', ['calls.allot']],
  ['pm.report', ['calls.report']],
  ['pm.cancel', ['calls.cancel']],
  ['pm.reopen', ['calls.create', 'pending.register']],
  ['calls.reopen', ['calls.create', 'pending.register']],
  ['contract.edit', ['cover.edit']],
  ['tracker.delete', ['mod:/tracker']],
  ['objective.manage', ['config.manage']],
  ['charts.share', ['config.manage']],
  ['validation.manage', ['config.manage']],
  ['layouts.share', ['config.manage']],
  ['pd2.rebuild', ['masters.edit', 'cover.edit']],
  ['stock.return.others', ['spare.approve_rm', 'spare.approve_commercial', 'spare.approve_nsm', 'spare.dispatch']],
];
const withCopies = (keys: string[]): string[] => {
  const out = [...keys];
  for (const [key, from] of PERM_COPIES) if (!out.includes(key) && from.some((k) => out.includes(k))) out.push(key);
  return out;
};

export const DEFAULT_PERMS: Record<string, string[]> = Object.fromEntries(
  ROLE_KEYS.map((role) => [
    role,
    withCopies(SEES_EVERY_MODULE.has(role)
      ? [...(FUNCTIONAL_DEFAULTS[role] ?? []), ...ALL_MODULES]
      : [...(FUNCTIONAL_DEFAULTS[role] ?? FUNCTIONAL_DEFAULTS.engineer), ...NON_ADMIN_MODULES]),
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

/** Does this reader see every record, or only their own and their team's?
 *
 *  IT TAKES THE USER, NOT A ROLE STRING, AND THAT IS THE WHOLE POINT. A `User`
 *  carries TWO role fields and only one of them is the RBAC key:
 *
 *    user.rbacRole  — the profile's role verbatim ('stores_incharge')   <- this
 *    user.role      — a COARSE app role, and `roleFromProfile()` collapses
 *                     everything that is not admin / rm / rgm / viewer into
 *                     'engineer'
 *
 *  So a Stores Incharge has `user.role === 'engineer'`. Passing that to a
 *  role test is not a near miss, it is the wrong answer for four of the six
 *  office roles — and it type-checks perfectly, exactly like `user.name`.
 *  Shipped that way on 2026-09-18: Pending Dispatch told a Stores Incharge his
 *  role was "shown its own and its team's spares" while the database was
 *  showing him everything.
 *
 *  Taking the user removes the choice, so no call site can pick the wrong
 *  field. `check:ui` also refuses `seesEveryRecord(user.role)` outright.
 *
 *  Mirrors `can_view_all_calls()`: an admin, the `data.view_all` grant, or one
 *  of the office roles in SEE_ALL_ROLES above. It exists so a screen can tell
 *  the truth when it has nothing to show — an empty list proves what the READER
 *  was shown, never what exists. */
export function seesEveryRecord(
  user: { rbacRole?: string; role?: string } | null | undefined,
  can: (action: string) => boolean,
): boolean {
  const key = String(user?.rbacRole ?? '').trim().toLowerCase();
  if (key === 'admin') return true;
  if (can('data.view_all')) return true;
  return roleSeesAllCalls(key);
}

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
// NO ADMIN-ONLY ROWS ANY MORE. Finding 65 listed the things only an
// administrator could do, greyed; the user then asked for them to be tickable
// (2026-09-30: "Only the Admin Role should be Greyed out not the Actions"), so
// each is an ordinary key on its page's row and the Admin COLUMN is what is
// greyed -- Admin holds everything and cannot be narrowed.
export interface PermPage { path: string; label: string; actions: string[] }
// `lists: true` — the header also carries one page per master value list, read
// from the registry at render time so a list added later needs no code change.
export interface PermHeaderOpts { lists?: boolean }
export interface PermHeader extends PermHeaderOpts { title: string; pages: PermPage[] }

export const PERM_TREE: PermHeader[] = [
  // THE HEADERS AND THEIR ORDER FOLLOW THE MENU (2026-09-12). The matrix is
  // read next to the menu — "what can this role open?" is asked with the menu
  // in front of you — so a page filed here under a header it no longer sits
  // under is how an administrator grants the wrong thing and believes they
  // granted the right one.
  //
  // `npm run check:ui` COMPARES THE TWO ON EVERY RUN — and from 2026-09-14 that
  // is TRUE. This comment said it for two days while NOTHING read PERM_TREE,
  // and in that time Machine History moved to Overview and kept a header of its
  // own here. A comment claiming a check exists is worse than no comment: it is
  // the reason nobody looked. The block is in check-ui.ts under "the Roles &
  // Permissions matrix follows the MENU"; it compares coverage both ways, the
  // header each page sits under, the order of headers and of pages, the label,
  // and whether a migration ever grants the key.
  { title: 'Overview', pages: [
    { path: '/', label: 'Dashboard', actions: [] },
    // NO ACTIONS OF ITS OWN. The page reads seven registers and shows a
    // section only where the reader already holds that register's key, so the
    // authority it needs is entirely theirs — granting `mod:/workload` adds
    // reach to nothing.
    { path: '/workload', label: 'My Workload', actions: [] },
    { path: '/lookup', label: 'Product & Party Search', actions: ['calls.create'] },
    // MOVED HERE WITH THE MENU (2026-09-14). It had a header of its own while
    // it sat under Reports; leaving that header behind after the screen moved
    // is how an administrator looks for it under Overview, does not find it,
    // and grants nothing. `check:ui` compares the two now, which is what the
    // comment above claimed and nothing did.
    { path: '/machine-history', label: 'Machine History', actions: ['masters.view'] },
    // READ ONLY FOR EVERYONE, Admin included: the page has no action to tick.
    { path: '/part-search', label: 'Part Search', actions: [] },
  ] },
  { title: 'Quality & Analytics', pages: [
    { path: '/daily-review', label: 'Daily Complaint Review Register (R/SER/35)', actions: ['review.edit', 'review.auto', 'review.correct_date', 'ffr.manage'] },
    { path: '/failure-report', label: 'Field Failure Register', actions: ['ffr.view', 'ffr.manage'] },
    // MOVED HERE FROM OVERVIEW WITH THE MENU (the user, 2026-09-15). The
    // header follows the menu because that is where an administrator looks
    // for the screen; the ROUTE did not change, so `mod:/product-failure` and
    // `mod:/spare-insights` still mean the same pages and no migration is
    // needed — unlike a rename, where the key IS the route and must move.
    // READ-ONLY, and it holds no action of its own: it analyses the review
    // register, which `call_reviews_read` already opens to any signed-in user.
    { path: '/product-failure', label: 'Product Failure Analysis', actions: ['charts.share'] },
    { path: '/kpi', label: 'KPI & Failure Analysis', actions: [] },
    { path: '/spare-insights', label: 'Spare Insights', actions: ['consumption.view'] },
    { path: '/objective', label: 'Objective', actions: ['objective.manage', 'objective.lock', 'reports.view'] },
  ] },
  { title: 'Documents', pages: [
    { path: '/qms', label: 'QMS Documents', actions: ['qms.manage'] },
    { path: '/training', label: 'Training', actions: ['training.manage'] },
  ] },
  { title: 'Contracts & Warranty', pages: [
    { path: '/warranties', label: 'Warranty Register', actions: ['masters.view', 'cover.edit', 'cover.edit.entries', 'cover.edit.delete', 'calls.create', 'install.create'] },
    { path: '/contracts', label: 'Contract Register', actions: ['masters.view', 'contract.edit', 'contract.edit.entries', 'contract.edit.delete', 'calls.create'] },
    { path: '/ownership-transfer', label: 'Ownership Transfer', actions: ['ownership.transfer', 'cover.edit.entries', 'install.create'] },
  ] },
  // KNOWLEDGE BASE, WHICH THE MATRIX DID NOT HAVE AT ALL until 2026-09-14.
  // Service Manuals sat under Documents here while the MENU put it under
  // Knowledge Base, so an administrator looking where the screen lives did not
  // find it. It went unnoticed because the check that compares the two parsed
  // the menu with a pattern requiring `items:` to follow `title:` immediately —
  // this group carries `flash: true` between them, so the WHOLE GROUP was
  // skipped and its pages were compared against nothing and passed.
  //
  // The other two entries in that menu group — Field Solutions and How to Use
  // RITHI CRM — are `alwaysOpen` and are not modules: they are open to
  // everyone and there is nothing to grant, which is why this header has one
  // page rather than three.
  { title: 'Knowledge Base', pages: [
    // NO ACTIONS OF ITS OWN: it is a document. Opening it is the whole right,
    // which is why restricting it is a matter of who holds `mod:` and nothing
    // else.
    { path: '/knowledge-base/how-it-works', label: 'How RITHI Functions', actions: [] },
    { path: '/service-manuals', label: 'Service Manuals', actions: ['docs.manage'] },
    { path: '/service-manuals/notes', label: 'Technical / Service Notes', actions: ['docs.manage'] },
  ] },
  { title: 'Service Calls', pages: [
    { path: '/request-registration', label: 'Request Registration', actions: ['request.create', 'calls.create', 'pending.register'] },
    { path: '/pending-registrations', label: 'Pending Registrations', actions: ['pending.register', 'calls.create', 'install.create', 'calls.edit', 'install.edit'] },
    { path: '/field-calls', label: 'Field Call Register', actions: ['calls.view', 'calls.create', 'calls.edit', 'calls.edit.complaint', 'calls.edit.customer', 'calls.edit.vigilance', 'calls.edit.contact', 'calls.allot', 'calls.report', 'calls.report.visit', 'visit.spares', 'visit.feedback', 'calls.cancel', 'calls.reopen', 'spare.request', 'consumption.reconcile'] },
    { path: '/installations', label: 'Installation Calls', actions: ['calls.view', 'install.create', 'install.edit', 'install.edit.complaint', 'install.edit.customer', 'install.edit.vigilance', 'install.edit.contact', 'install.allot', 'install.report', 'install.report.visit', 'visit.spares', 'visit.feedback', 'install.cancel', 'install.reopen', 'spare.request', 'consumption.reconcile'] },
    { path: '/pm-calls', label: 'Preventive (PM)', actions: ['calls.view', 'pm.create', 'pm.edit', 'pm.edit.complaint', 'pm.edit.customer', 'pm.edit.vigilance', 'pm.edit.contact', 'pm.allot', 'pm.report', 'pm.report.visit', 'visit.spares', 'visit.feedback', 'pm.cancel', 'pm.reopen', 'spare.request', 'consumption.reconcile'] },
    { path: '/pending-calls', label: 'Pending Calls', actions: ['calls.allot', 'install.allot', 'pm.allot'] },
    { path: '/reports', label: 'Visit Reports / Service Reports', actions: ['calls.view'] },
    { path: '/call-review', label: 'Call Review', actions: ['callreview.mark', 'consumption.reconcile', 'calls.reopen', 'install.reopen', 'pm.reopen'] },
    { path: '/feedback', label: 'Customer Feedback', actions: ['feedback.view'] },
  ] },
  { title: 'Spares', pages: [
    { path: '/spare-requests', label: 'Spare Requests', actions: ['spare.request', 'spare.approve_rm', 'spare.approve_commercial', 'spare.approve_nsm', 'spare.dispatch', 'spare.drop', 'spare.receive', 'spare.reassign'] },
    { path: '/spare-rm-approval', label: 'RM Approval', actions: ['spare.approve_rm'] },
    { path: '/spare-dispatch', label: 'Pending Dispatch', actions: ['spare.dispatch', 'spare.drop'] },
    { path: '/stock-out', label: 'Stock Out', actions: [] },
    { path: '/spare-consumption', label: 'Spare Consumption', actions: ['consumption.view', 'consumption.reconcile'] },
    { path: '/handstock', label: 'Hand Stock', actions: ['consumption.reconcile', 'stock.transfer'] },
    { path: '/mrn', label: 'Material Returns (MRN)', actions: ['stock.return', 'stock.return.others'] },
    { path: '/stock-transfer', label: 'Stock Transfer', actions: ['stock.transfer'] },
  ] },
  // A HEADER OF ITS OWN, because the MENU has one (2026-09-08). The matrix is
  // read next to the menu — "what can this role open?" is asked with the menu
  // in front of you — so a header here that no longer exists there makes the
  // page harder to trust than to use.
  { title: 'Indoor Service', pages: [
    { path: '/indoor', label: 'Indoor Service Register',
      actions: ['indoor.receive', 'indoor.work', 'indoor.qc', 'indoor.dispatch', 'indoor.condemn', 'indoor.verify', 'indoor.delete'] },
  ] },
  { title: 'Reports', pages: [
    // The parent GRANTS ALL THREE below it, so a role that only needs one is
    // given that one and not this.
    { path: '/exports', label: 'Reports (all of them)', actions: [] },
    { path: '/exports/consumption', label: '↳ Consumption Report', actions: ['reports.view'] },
    { path: '/exports/kpi', label: '↳ KPI Export', actions: [] },
    { path: '/exports/unused', label: '↳ Not Consumed Against this Call', actions: ['reports.view'] },
    { path: '/exports/calls', label: '↳ Call Report', actions: ['reports.view'] },
    { path: '/exports/feedback', label: '↳ Customer Feedback Report', actions: ['feedback.view', 'visit.feedback'] },
    // NOT a child of /exports: it does not inherit, and it is administrators
    // only. Its position here matches the menu's, which is the half of this
    // that is easy to get wrong — a page filed under the wrong neighbour is
    // how somebody grants the wrong thing believing they granted the right one.
    { path: '/feedback-without-report', label: 'Feedback Without a Report', actions: [] },
    // ALSO not a child of /exports, and also administrators to begin with. Tick
    // it here for any other role -- that is the whole point of it having a key.
    { path: '/handstock-report', label: 'Hand Stock Report', actions: [] },
    // Administrators only (0319); tick it here for any other role.
    { path: '/install-calls-unmapped', label: 'Machines Without an Installation Call', actions: [] },
  ] },
  { title: 'Master', lists: true, pages: [
    { path: '/parties', label: 'Party Master', actions: ['masters.edit', 'masters.edit.records', 'masters.parties.add', 'masters.parties.edit', 'masters.parties.delete', 'masters.edit.kyc', 'masters.edit.swap_serviceman'] },
    { path: '/product-database', label: 'Product Database', actions: ['calls.create', 'install.create'] },
    { path: '/product-database-2', label: 'Product Database 2.0', actions: ['masters.view', 'pd2.rebuild'] },
    { path: '/product-master', label: 'Product Master (product lines)', actions: ['masters.edit', 'masters.edit.records', 'masters.product_master.add', 'masters.product_master.edit', 'masters.product_master.delete'] },
    { path: '/user-master', label: 'User Master', actions: ['users.manage', 'users.manage.details', 'users.manage.create', 'users.manage.disable', 'users.manage.access', 'users.reset_password'] },
    { path: '/parts', label: 'Part Master', actions: ['masters.edit', 'masters.edit.records', 'masters.parts.add', 'masters.parts.edit', 'masters.parts.delete', 'masters.edit.rename_part'] },
    // All Masters is just the overview screen; each value list is its own page
    // under this header, so access is given list by list.
    { path: '/masters', label: 'All Masters (overview)', actions: ['masters.edit', 'masters.edit.records'] },
  ] },
  { title: 'Administration', pages: [
    { path: '/missing-visit-reports', label: 'Solved Without a Report', actions: [] },
    { path: '/tracker', label: 'Tracker', actions: ['tracker.delete'] },
    { path: '/roles', label: 'Roles & Permissions', actions: ['rbac.manage'] },
    { path: '/audit', label: 'Audit Log', actions: ['audit.view'] },
    { path: '/bulk-uploads', label: 'Bulk Uploads', actions: ['bulk.upload'] },
    { path: '/report-mapping', label: 'Bulk Report Mapping', actions: ['calls.report.visit', 'install.report.visit', 'pm.report.visit'] },
    { path: '/data-export', label: 'Data Export', actions: ['export.tables', 'export.schedules'] },
    { path: '/device-cache', label: 'Device Cache Status', actions: [] },
    { path: '/pm-bulk-upload', label: 'PM Bulk Upload', actions: ['pm.bulk_upload'] },
    { path: '/admin-config', label: 'Admin Config', actions: ['config.manage', 'import.panel', 'audit.mode'] },
    { path: '/sla-objective-config', label: 'SLA / Objective Configuration', actions: ['config.manage', 'objective.manage'] },
    { path: '/software-validation', label: 'Software Validation', actions: ['validation.manage'] },
    { path: '/settings', label: 'Settings', actions: ['users.manage.settings'] },
    { path: '/version-history', label: 'Version History', actions: [] },
  ] },
  { title: 'Across the system', pages: [
    { path: '', label: 'Not tied to one page', actions: ['data.view_all', 'export.data', 'admin.view', 'layouts.share'] },
  ] },
];

// A master value list's own permissions. Lists are created in the database, so
// the keys are derived rather than enumerated: view is the list's module key,
// and the two actions are what can be done to its values. Both actions inherit
// from the global `masters.edit` (see can() in auth.tsx and the policies in
// 0067_master_list_permissions.sql), so a role that maintains every master
// keeps working without ticking anything list by list.
export const masterAction = (key: string): string => `mod:/masters/${key}`;
export const masterAddAction = (key: string): string => `master.${key}.add`;
export const masterEditAction = (key: string): string => `master.${key}.edit`;
export const masterDeleteAction = (key: string): string => `master.${key}.delete`;
// ADD, EDIT, DELETE (0325): the list's edit key is the PARENT of its add key,
// as it always granted adding -- see parentActions below.
export const masterListActions = (key: string): string[] => [masterAddAction(key), masterEditAction(key), masterDeleteAction(key)];

// Those keys are built per list, so they are not in ACTIONS — the matrix asks
// here for their labels.
export const dynamicActionLabel = (key: string): string | undefined => {
  const m = /^master\.(.+)\.(add|edit|delete)$/.exec(key);
  if (!m) return undefined;
  return m[2] === 'add' ? 'Add values to this list'
    : m[2] === 'edit' ? 'Edit / rename / deactivate values (and add)' : 'Delete values from this list';
};

// A KEY'S PARENTS (0286, public.perm_parents): holding a parent grants the
// child. THE SAME LIST THE DATABASE READS, compared word for word by
// check:ui -- a parent honoured here and not there is a button that is offered
// and then refused, and the reverse is a right nobody can see.
export const PERM_PARENTS: Record<string, string[]> = {
  'calls.edit.complaint': ['calls.edit'], 'calls.edit.customer': ['calls.edit'],
  'calls.edit.vigilance': ['calls.edit'], 'calls.edit.contact': ['calls.edit'],
  'install.edit.complaint': ['install.edit'], 'install.edit.customer': ['install.edit'],
  'install.edit.vigilance': ['install.edit'], 'install.edit.contact': ['install.edit'],
  'pm.edit.complaint': ['pm.edit'], 'pm.edit.customer': ['pm.edit'],
  'pm.edit.vigilance': ['pm.edit'], 'pm.edit.contact': ['pm.edit'],
  'calls.report.visit': ['calls.report'], 'install.report.visit': ['install.report'],
  'pm.report.visit': ['pm.report'],
  'visit.spares': ['calls.report', 'install.report', 'pm.report'],
  'visit.feedback': ['calls.report', 'install.report', 'pm.report'],
  'cover.edit.entries': ['cover.edit'], 'cover.edit.delete': ['cover.edit'],
  'contract.edit.entries': ['contract.edit'], 'contract.edit.delete': ['contract.edit'],
  'masters.edit.records': ['masters.edit'], 'masters.edit.kyc': ['masters.edit'],
  'masters.edit.rename_part': ['masters.edit'], 'masters.edit.swap_serviceman': ['masters.edit'],
  'users.manage.details': ['users.manage'], 'users.manage.create': ['users.manage'],
  'users.manage.disable': ['users.manage'], 'users.manage.access': ['users.manage'],
  'users.manage.settings': ['users.manage'],
  'masters.parties.add': ['masters.edit.records', 'masters.edit'],
  'masters.parties.edit': ['masters.edit.records', 'masters.edit'],
  'masters.parties.delete': ['masters.edit'],
  'masters.parts.add': ['masters.edit.records', 'masters.edit'],
  'masters.parts.edit': ['masters.edit.records', 'masters.edit'],
  'masters.parts.delete': ['masters.edit'],
  'masters.product_master.add': ['masters.edit.records', 'masters.edit'],
  'masters.product_master.edit': ['masters.edit.records', 'masters.edit'],
  'masters.product_master.delete': ['masters.edit'],
};

/** Which register's keys govern a call of this type (0287): calls / install / pm.
 *  Through callFamily(), the one classifier -- a second pattern here is how a
 *  "PM VISIT" row would come to be governed by the Field keys. */
export const callPermPrefix = (callType: unknown): 'calls' | 'install' | 'pm' => {
  const f = callFamily(callType);
  return f === 'install' ? 'install' : f === 'pm' ? 'pm' : 'calls';
};

/** Any of these opens the administration menu (it was `manage-users` alone). */
export const USER_ADMIN_KEYS = ['users.manage', 'users.manage.details', 'users.manage.create',
  'users.manage.disable', 'users.manage.access', 'users.manage.settings'];

// Every key that grants this one: its declared parents, and the older
// pattern-based inheritance below.
export const parentActions = (key: string): string[] => {
  const out = [...(PERM_PARENTS[key] ?? [])];
  const p = parentAction(key);
  if (p && !out.includes(p)) out.push(p);
  // A list's add key is also granted by that list's edit key, and by "Add /
  // edit master records" -- exactly who masters_insert admits (0325).
  const add = /^master\.(.+)\.add$/.exec(key);
  if (add) out.push(`master.${add[1]}.edit`, 'masters.edit.records');
  return out;
};

// Does this key inherit from a broader one the role may already hold?
export const parentAction = (key: string): string | undefined => {
  if (key.startsWith('mod:/masters/')) return 'mod:/masters';
  // A single report is covered by Reports as a whole, the same way.
  if (key.startsWith('mod:/exports/')) return 'mod:/exports';
  // Technical / Service Notes sit under Service Manuals, and open with it.
  if (key.startsWith('mod:/service-manuals/')) return 'mod:/service-manuals';
  if (/^master\..+\.(add|edit|delete)$/.test(key)) return 'masters.edit';
  // A section of a call is covered by the whole-call right, the same way.
  // Whoever may edit everything may edit any part of it, so a role that had
  // `calls.edit` before the sections existed loses nothing by their existing.
  if (/^calls\.edit\..+$/.test(key)) return 'calls.edit';
  return undefined;
};

// Every action the tree accounts for — used to spot one that has been added to
// the system but not yet placed on a page.
export const TREE_ACTION_KEYS = new Set(PERM_TREE.flatMap((h) => h.pages.flatMap((p) => p.actions)));

// ===========================================================================
// ADDING A ROLE FROM THE APP.
// ===========================================================================

// A role key is a database value that appears in policies and in every user's
// profile, so it is a slug: lower case, letters, digits and underscores. Spaces
// and punctuation would work until the day one of them met a policy.
export const roleKeyFrom = (label: string): string =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

export const RESERVED_ROLE_KEYS = ['admin', 'super_admin', 'authenticated', 'anon', 'postgres'];

/** Why a proposed role cannot be created, or null. */
export function roleProblem(key: string, label: string, existing: string[], cloneFrom: string): string | null {
  if (!label.trim()) return 'Give the role a name.';
  if (!key) return 'That name has no letters or digits in it — the key is built from the name.';
  if (/^[0-9]/.test(key)) return 'A role key cannot start with a digit.';
  if (RESERVED_ROLE_KEYS.includes(key)) return `"${key}" is reserved.`;
  if (existing.includes(key)) return `A role with the key "${key}" already exists.`;
  // THE ONE THAT MATTERS. has_perm() falls back to the ENGINEER's permissions
  // for a role whose row is an empty array (0008), so a role created with
  // nothing does not grant nothing — it silently grants an engineer's writes.
  // Requiring a source makes that impossible rather than documenting it.
  if (!cloneFrom) return 'Choose the role to copy from — a role cannot start empty.';
  return null;
}

/** A label for a role key that is not in the built-in list: "regional_coordinator" → "Regional Coordinator". */
// ---------------------------------------------------------------------------
// THE LABELS THE DATABASE HOLDS, for roles the code does not know.
//
// A role added from the application (URS-056) exists in `app_roles` with the
// name an administrator typed — "VP Technical" — and nowhere in this file. Until
// the labels are loaded, such a key can only be humanised from itself, which
// gives "Vptechnical". Filled once by the auth provider when it reads the role
// matrix, so EVERY label in the application is right rather than each screen
// solving it again.
//
// A cache with a safe fallback, deliberately: a label that has not loaded yet
// renders as the humanised key, never as a different role's name.
// ---------------------------------------------------------------------------
let dbRoleLabels: Record<string, string> = {};

export function setRoleLabels(labels: Record<string, string>): void {
  dbRoleLabels = { ...dbRoleLabels, ...labels };
}

export const roleLabelFor = (key: string): string =>
  ROLES.find((r) => r.key === key)?.label
  ?? (key && dbRoleLabels[key]) 
  ?? (key ? key.split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : '');

/**
 * The built-in roles PLUS any the database has that the code does not know.
 * Every role picker must use this: a role added from the app that no picker
 * offers is a role nobody can be put on, which is a feature that does nothing.
 */
export function rolesWith(storedKeys: string[]): RoleDef[] {
  const seen = new Set(ROLES.map((r) => r.key));
  const extra = storedKeys.filter((k) => k && !seen.has(k)).sort()
    .map((k) => ({ key: k, label: roleLabelFor(k) }));
  return [...ROLES, ...extra];
}

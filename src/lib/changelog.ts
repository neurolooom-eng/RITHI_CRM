// ---------------------------------------------------------------------------
// Curated change log, shown in-app under Version History. Newest first.
// Add a new entry at the top whenever a release/change ships.
// ---------------------------------------------------------------------------

export interface ChangeEntry {
  version: string;
  date: string; // yyyy-MM-dd
  title: string;
  changes: string[];
}

export const CHANGELOG: ChangeEntry[] = [
  {
    version: '0.8.52',
    date: '2026-08-31',
    title: 'The daily review shows the report — and the register opens straight away',
    changes: [
      'The Daily Call Review took a very long time to open, or looked like it had hung: it was pulling the whole register down before it would show anything. It now opens on the last 30 days, a page at a time, and the first calls appear immediately — “Load more” brings the next page. Widen or clear the dates to go further back.',
      'Every filter — dates, stage, product, engineer, potential effect and the search box — is now applied by the database rather than after the fact, so filtering a big register is fast and the counters cover everything the filters match, not just what is on screen.',
      'Reviewing a call now shows what the engineer actually reported, in the review itself: the Visit Details of every visit, the Call Status, the Spares Consumed, the Software Version from the latest visit, and the Age of the Product when it failed — the days since warranty start, banded the way the register bands them (“With in 1 yr” … “More than 5 yrs”).',
      'The same five are columns on the register and are carried into the export, which now matches the workbook’s Visit Remarks, Spares Consumed, SW Version and the two failure-age columns.',
      'Export now covers every call the filters match, not just the pages loaded on screen, and says how far it has got while it reads.',
      'Needs a database script run once (daily_review.sql).',
    ],
  },
  {
    version: '0.8.51',
    date: '2026-08-31',
    title: 'Daily Call Review — the DCCR, in the app',
    changes: [
      'New module: Daily Call Review. Every field call now goes through its review here rather than in the register workbook, in the same three stages. Review 1 is the Public Health Threat / Death / Serious Incident answers already given at Call Registration — the review shows them back and takes the registration date as the Review 1 date. Review 2 asks Risk to Patient / Any Clinical Impact, Warranty Failure (1 yr) and Frequent Failure. Review 3 asks Complaint Grouping, Root Cause Key Word and Spare / Consumable / Correction / Calibration. Each stage is dated the day it is completed.',
      'Any Potential Effect works itself out, exactly as the register formula does: blank until all three Review 2 answers are in, then YES if any of them is YES. When it turns YES the Action Taken reads “FFR Generation” until whoever raises the report types the FFR number over it.',
      'Review Status says which stage a call is waiting on — Review 2 Pending, Review 3 Pending, or Review Completed — and the register colours it, so what is outstanding today is visible at a glance. Filter by date range, stage, product, engineer, or just the calls with a potential effect.',
      'Two new masters, both tagged per product: DCCR Complaint Grouping and Root Cause Key Word. Review 3 offers a call only the values for its own product plus anything tagged COMM (common to every product), so the list stays short and right. Both ship with the register\'s own values and have their own tab in the module (and a row in All Masters).',
      'Export gives the register\'s own 38 columns, in its own order and under its own headings, for whatever the Review Register tab is currently showing.',
      'Completing a review needs the new “Complete the daily call review” permission, granted by default to Admin, Hotline, NSM, Regional Manager, Reporting Manager and Commercial. Everyone who can open the module can still read every review.',
      'The old Daily Call Review screen showed sample data and was blank against the live database; this replaces it outright.',
    ],
  },
  {
    version: '0.8.50',
    date: '2026-08-31',
    title: 'Notification bell',
    changes: [
      'A bell in the top bar tells you when a call is allotted to you or a spare you requested is dispatched, with an unread count. Open it to see recent notifications; click one to jump straight to it, or mark them all read.',
      'Needs a database script run once (notifications.sql).',
    ],
  },
  {
    version: '0.8.49',
    date: '2026-08-31',
    title: 'SLA targets, editable — and flagged on the Dashboard',
    changes: [
      'New SLA targets in Admin Config: first visit (72h), call closure (5 days), closure when a spare is involved (7 days), closure when the spare is out of CMC/WGP (10 days), and Stores dispatch from final approval (72h). Edit the hours or switch any rule off.',
      'The Dashboard now highlights open calls against the active rules — an “SLA Breached” tile and a “needs attention” list showing which rule and how far over/until, so engineers see what’s slipping.',
      'Needs a database script run once (sla_rules.sql).',
    ],
  },
  {
    version: '0.8.48',
    date: '2026-08-31',
    title: 'The database scripts can be re-run without failing',
    changes: [
      'Re-running HandStock_X.sql or the consolidated all.sql on a project that already had Material Returns failed with “cannot drop columns from view”. The hand-stock views are now rebuilt rather than replaced, so either file can be run again safely whatever has already been applied.',
      'The consolidated all.sql also failed part-way on a fresh project (“column engineer_email does not exist”) because the consumption-visibility rule was applied before the column it reads was added. It no longer depends on that ordering.',
      'And once the call tables were split, re-running it failed again at “cannot create index on relation calls” — public.calls is a view now, so the older table-only steps are skipped on a project that has already been split.',
    ],
  },
  {
    version: '0.8.47',
    date: '2026-08-31',
    title: 'Installations are created by Commercial',
    changes: [
      'Creating an Installation call is now restricted to the Commercial team (plus the Hotline registration desk and admins), since installations are triggered by Commercial who are notified first. Everyone else can still see and report installations, just not create one — the “+ New Installation” button only shows for those who may.',
      'This is enforced by the database too, not just the button, so it holds however a call is created.',
      'Needs a database script run once (gate_installation_create.sql).',
    ],
  },
  {
    version: '0.8.46',
    date: '2026-08-31',
    title: 'PM Bulk Upload — the monthly batch in one file',
    changes: [
      'New PM Bulk Upload (Service Calls menu, Admin / Super-Admin only): upload the monthly Preventive Maintenance spreadsheet and every row is created as a PM call, with its UCN and Call Number assigned automatically. They land straight in the Preventive (PM) register.',
      'Columns are matched by common names (Party, Product, Serial, Engineer, PM Due Date, and more); anything extra on the sheet is kept on the call. Download the built-in template to see the expected layout, preview what will be created, then import with a progress bar.',
    ],
  },
  {
    version: '0.8.45',
    date: '2026-08-31',
    title: 'Hand Stock, Stock Transfer and Material Returns follow your team',
    changes: [
      'The same rule as Spare Requests now applies across the stock screens: a manager sees their own and their reporting engineers\u2019 hand stock, transfers and returns \u2014 and nobody else\u2019s.',
      'Stock levels were the gap: the figures behind Stock Transfer were read in a way that ignored access rules altogether, so anyone signed in could see every engineer\u2019s stock. They are now scoped like everything else.',
      'Stock transfers are visible to Stores, Commercial, NSM and the other desks again \u2014 they move stock for every team, and had been shut out.',
      'The check that stops a transfer overdrawing still counts every movement, so nobody can transfer stock they do not have by virtue of not being able to see it.',
      '\u201cView as\u201d on these three screens now shows what that person would really see, instead of the administrator\u2019s own stock wearing their name.',
      'Needs migration 0041_stock_read_scope.sql (apply bundle: HandStock_X.sql).',
    ],
  },
  {
    version: '0.8.44',
    date: '2026-08-31',
    title: 'Knowledge Base — how-to guide + team field solutions',
    changes: [
      'New Knowledge Base page (in the menu under Help, open to everyone): a step-by-step “How to use RITHI CRM” guide covering requesting and updating calls, installations, spares, spare status, customer feedback, passwords, the Build ID and Refresh/Sync/Force-update.',
      'Field Solutions — the team writes and shares fixes for real field issues. Anyone signed in can add an article and search everyone’s; the author (or an admin) can edit or delete their own.',
      'Articles are written in a built-in editor with headings, lists, links, images (upload or link) and tables — plus attachment links to files kept in Drive or on Pages.',
      'Needs a database script run once (knowledge_base.sql) to store the articles.',
    ],
  },
  {
    version: '0.8.43',
    date: '2026-08-31',
    title: 'A manager sees and approves their own team only',
    changes: [
      'A Reporting Manager now sees only their own spare requests and those of the engineers reporting to them. Requests from anyone else \u2014 other teams, administrators \u2014 are no longer visible at all, not merely un-approvable.',
      'Your own request is visible but not yours to approve: it goes to your reporting manager, as it should.',
      'The desks that process spares for every team \u2014 Commercial, NSM, Stores, Hotline, Spare Coordinator, Tally \u2014 still see everything, and administrators are unaffected.',
      '\u201cView as\u201d now shows what that person would really see, instead of the administrator\u2019s own data wearing their name.',
      'Needs migrations 0033_rm_approves_own_team.sql and 0040_spare_read_scope.sql (apply bundle: Spare_1.sql).',
    ],
  },
  {
    version: '0.8.42',
    date: '2026-08-31',
    title: 'Show password toggle',
    changes: [
      'Every password box (sign-in, first-time set password, reset and Profile → Password) now has an eye button to reveal what you typed, so you can check it before submitting.',
    ],
  },
  {
    version: '0.8.41',
    date: '2026-08-31',
    title: 'Registers read their own call table (PM isolated)',
    changes: [
      'Each register now reads directly from its own call table — the Preventive (PM) register reads only PM calls, Field reads only Field, Installation only Installation — so PM’s large volume never slows the others. Cross-type screens (Pending Calls, Dashboard, KPI) still read across all types. Follows the database split shipped earlier.',
    ],
  },
  {
    version: '0.8.40',
    date: '2026-08-31',
    title: 'MRN: Good + Defective together cannot exceed what you hold',
    changes: [
      'On a Material Return, the Good and Defective boxes were capped separately, so a spare you hold 2 of could be entered as 6 good and 4 defective. They are two halves of one returned quantity: each box is now capped at what is left of that spare once the other box (and any other line on the same MRN) is counted, and a quantity typed over the cap is pulled back with a note saying how many are in hand.',
    ],
  },
  {
    version: '0.8.39',
    date: '2026-08-31',
    title: 'Engineers see only open calls by default',
    changes: [
      'The Field / Installation / PM registers now default to showing only OPEN calls for engineers — anything not fully Solved — so an engineer’s list stays short even as closed calls pile up. A toggle (“🔵 Open only” / “⚪ All calls”) at the top reveals the closed ones. Managers, office roles and admins still see everything by default.',
    ],
  },
  {
    version: '0.8.38',
    date: '2026-08-31',
    title: 'Reports lists every report field as a column',
    changes: [
      'The Reports ⚙ Columns list now comes from the full report field spec, so every field a report can carry is available as a column — even when the currently loaded rows didn’t fill it. Nothing is trimmed to just what the current page contains.',
    ],
  },
  {
    version: '0.8.37',
    date: '2026-08-31',
    title: 'Warranty and Contract registers, live — with the entry as the parent record',
    changes: [
      'Warranty Register and Contract Register are real registers now. A Sale Entry (SA) or Contract Entry (MC) is the parent record, and the machines sold or covered under it sit inside it as a table — open an entry to see and edit both together.',
      'Change something on the entry and every machine under it changes with it: dates, period, PM visits, payment schedule, party, engineer. A machine can still carry its own value where it genuinely differs — type into the field to pin it, ↺ to hand it back to the entry.',
      'A “By machine” view lists cover per serial with Active / About to expire / Inactive tiles, shows which machines are pinned rather than following their entry, exports to CSV and registers a field call straight from a row.',
      'Your four AppSheet exports (Sale Entry, Warranty Sale Details, Contract Entry, Contract Details) import as they are, in any order, in Settings → Bulk Data Import. Every column is kept, and the repeated header values are folded back into inheritance afterwards.',
      'Warranty and contract on the machine (what a call form fills in) is now maintained by these registers, so the Product Master follows a contract renewal instead of being keyed twice.',
      'Editing sales and contracts is its own permission — Admin, Commercial and NSM have it by default; everyone who can see masters can read them.',
      'Importing the two details files no longer times out on a full Product Master, and the four exports can be re-run after a failed import without duplicating what already loaded.',
      'Both tabs work like the Field Call Register: opens from cache with a “synced X ago” stamp, ↻ Refresh, Load more, and Export CSV.',
    ],
  },
  {
    version: '0.8.36',
    date: '2026-08-31',
    title: 'Material Returns (MRN) — send a spare back to Stores',
    changes: [
      'New Material Returns module: raise an MRN for the spares an engineer is sending back to Stores, in Good and/or Defective condition, with the customer, report number and what it was removed from.',
      'You can only return what you are actually carrying — the spare list is your own hand stock and the quantity is capped at what you hold, across all the lines on one MRN.',
      'A return takes the spare off your Hand Stock: the stock level now reads Stock Out − Consumption − Transfer From + Transfer To − Returned, with a Returned column, a Returned total and the return listed in the movement trail against its MRN number.',
      'Each MRN gets its own number (MRN-YYMM-0001, restarting each month); the register lists every returned item, filters by engineer, exports to CSV, and opens a submission to show all of its lines.',
      'The old MRN sheet can be uploaded from Data Import — the register tab loads as one row per returned item.',
    ],
  },
  {
    version: '0.8.35',
    date: '2026-08-31',
    title: 'Spare consumption & hand stock scoped to you and your team',
    changes: [
      'Engineers no longer see a peer’s spare consumption or hand stock — the database now scopes those to what you raised, what is for you, and your reporting team. Admins, the office/coordination roles (Hotline, NSM, Commercial, Spare Coordinator, Stores, Tally) and “Permissions + Data” users still see everything. Spare Requests were already scoped this way.',
      'Needs a database script run once (fix_spare_scope.sql) to take effect.',
    ],
  },
  {
    version: '0.8.34',
    date: '2026-08-31',
    title: 'Wrap-text toggle on every table; Reports shows every field',
    changes: [
      'Every table has a “Wrap: on/off” button (bottom-right). Text wrapping is on by default so long cells stay fully readable; turn it off for compact single-line rows. The choice is remembered per table.',
      'Reports: the ⚙ Columns list now includes every field found across all loaded reports, not just the first page — nothing gets trimmed from the list.',
    ],
  },
  {
    version: '0.8.33',
    date: '2026-08-31',
    title: 'Honest module counts',
    changes: [
      'Module counts never show a wrong number: on screens that load in pages (Field/Installation/PM calls, Reports, Customer Feedback), when more rows exist beyond what is loaded the count reads “1,000+” rather than a misleading exact figure. Screens that load everything still show the exact total.',
    ],
  },
  {
    version: '0.8.32',
    date: '2026-08-31',
    title: 'Pending Calls & Reports load at scale',
    changes: [
      'Fixed “Load failed: canceling statement due to statement timeout” on Pending Calls (and the same risk on Reports) as call volume grows. The security check that scopes calls to your reporting tree was being recomputed for every call row; it is now computed once per load, behind an indexed lookup — the same calls stay visible to the same people, just far faster.',
      'Needs a database script run once (fix_pending_timeout.sql) to take effect.',
    ],
  },
  {
    version: '0.8.31',
    date: '2026-08-31',
    title: 'Record counts on every screen',
    changes: [
      'Each module now shows how many records it holds — a count next to the module name in the left menu and next to the page heading. The count reflects what you can see (your team, your region, your own calls), so a Reporting Manager switching between “Team calls” and “My calls” sees the number change with them.',
      'Counts cover Field/Installation/PM calls, Pending Calls, Pending & Request Registrations, Reports, Spare Requests, Pending Dispatch, Spare Consumption, Hand Stock, Stock Transfer, Customer Feedback, Field Failure, and the Party / Product / Part / User masters.',
    ],
  },
  {
    version: '0.8.30',
    date: '2026-08-31',
    title: 'See every report field — in Reports and on a call',
    changes: [
      'Reports: every field you fill on a report is now available as a column (⚙ Columns to show/hide) and is searchable and exportable; clicking a report row opens a drawer with ALL of its fields.',
      'Call view: each visit in a call\u2019s Visit history is clickable and opens the same report detail drawer.',
    ],
  },
  {
    version: '0.8.29',
    date: '2026-08-31',
    title: 'Customer Feedback — one column per field',
    changes: [
      'Customer Feedback now shows every field the engineer filled as its OWN column, instead of one consolidated “Feedback” string. Columns are discovered from the data, so any question that has answers appears; use ⚙ Columns to show/hide, and Export CSV carries them all.',
    ],
  },
  {
    version: '0.8.28',
    date: '2026-08-31',
    title: 'Drop a spare at any stage — Spare Coordinator & Hotline',
    changes: [
      'A spare can now be Dropped at ANY open stage (RM Approval, Commercial, NSM or Stores), not just at Stores.',
      'Dropping is limited to the Spare Coordinator and Hotline Engineer (a new spare.drop permission) — separate from Stores dispatch. The ⊘ Drop button shows on the spare’s row for them at every open stage, and in Pending Dispatch. Needs migration 0036_spare_drop.sql + the permission grant.',
    ],
  },
  {
    version: '0.8.27',
    date: '2026-08-31',
    title: 'Drop a spare Stores isn’t sending',
    changes: [
      'Stores can now Drop an approved spare instead of dispatching it (short supply, no longer needed, superseded) — with a reason. It closes as “Dropped”, distinct from a rejection, and no DC is generated.',
      '⊘ Drop is on the spare’s row in Spare Requests (at the Stores stage) and as a batch action in Pending Dispatch next to Dispatch. Needs the Dispatch permission.',
    ],
  },
  {
    version: '0.8.26',
    date: '2026-08-31',
    title: 'Customer Feedback shows live data',
    changes: [
      'Customer Feedback was reading the emptied demo list and showed blank. It now reads the live feedback captured on call reports — date, call, party, product, engineer and the answers — with search, role scoping, cache and CSV export.',
    ],
  },
  {
    version: '0.8.25',
    date: '2026-08-31',
    title: 'Team/My calls toggle, export controls, tidier menu',
    changes: [
      'Reporting & Regional Managers get a Team calls / My calls switch in the header — flip between your whole reporting tree and just your own calls.',
      'CSV / data download is now a permission: Admins, Managers and office roles can export; Engineers cannot download anything (the option is blocked for them).',
      'Master and Master Lists are merged into one “Master” group, and the sidebar has a Collapse all / Expand all control.',
    ],
  },
  {
    version: '0.8.24',
    date: '2026-08-31',
    title: 'Delete a User Master entry',
    changes: [
      'Open a person’s record and 🗑 Delete removes their User Master (directory) entry — for a wrong or duplicate row. Their login and history are untouched; to lock out a leaver keep using 🔒 Disable login (Inactive).',
    ],
  },
  {
    version: '0.8.23',
    date: '2026-08-31',
    title: 'Disable a leaver’s login; New User & Clone do it all in one form',
    changes: [
      'Disable login (🔒) on a user locks them out of signing in while keeping every record they entered; Enable login (🔓) restores it. A disabled login is blocked at sign-in and on the next load.',
      'New User now fills the full User Master details AND creates the sign-in login in one step (with a starting password). Clone opens the same form pre-filled with the source’s role + permissions — you just add the new person’s details.',
      'Clone now asks: Permissions only (the new person sees only their own data) or Permissions + Data (they can also see every record). Needs migration 0035_data_view_all.sql for the data option to take effect.',
    ],
  },
  {
    version: '0.8.22',
    date: '2026-08-31',
    title: 'Click a user to open their record',
    changes: [
      'In User Master, clicking a person now opens their full record with the actions at the top — Edit, 🔐 Access, ⧉ Clone and 📊 Data — the same shape as opening a call.',
    ],
  },
  {
    version: '0.8.21',
    date: '2026-08-31',
    title: 'One User Master — with Clone and a per-user activity view',
    changes: [
      'User Access is folded into User Master — one screen for everything. Each signed-in person has a 🔐 Access action (role + extra permissions, the old User Access editor) right on their row.',
      'Clone (⧉): pick someone leaving — say a Stores Incharge on notice — enter the replacement’s name and email, and it creates their login immediately with the SAME role and permissions, on a default password they change on first sign-in.',
      'Data view (📊): see everything a person entered — calls they registered, spare requests, dispatches (DC), approvals, reports and consumption — grouped for a clean handover.',
      '+ Add Login creates a fresh login from User Master too; the separate User Access page now redirects here.',
    ],
  },
  {
    version: '0.8.20',
    date: '2026-08-31',
    title: '“Call Allocated To” lists real people, not demo users',
    changes: [
      'The Call Allocated To dropdown no longer shows the old demo “ALMS Service · admin”. It defaults to the machine’s Service Engineer from Party Master (or the engineer on the request), and the list to pick from is the real User Master — with the same list now feeding the Assigned Engineer fields elsewhere.',
    ],
  },
  {
    version: '0.8.19',
    date: '2026-08-31',
    title: 'View as shows the person’s real role',
    changes: [
      '“View as” used to preview everyone as an engineer, so a Hotline or Coordinator looked like they had no access and an empty register. It now previews each user with their ACTUAL role — the list and banner show the role, and search covers role too.',
    ],
  },
  {
    version: '0.8.18',
    date: '2026-08-31',
    title: 'Hotline & office roles see everything; spare details on a call',
    changes: [
      'Hotline, NSM, Commercial, Spare Coordinator, Stores Incharge and Tally Coordinator now see every call (they are not tied to an allocation), and can act per their role — no more empty registers or greyed “New Call” for them. Engineers, RMs and RGMs stay scoped as before.',
      'A role whose permission list was left blank now falls back to its built-in defaults instead of being left with no access. (Run reset_role_perms.sql once to repair roles already saved blank, and 0034_office_roles_see_all.sql for the server-side visibility.)',
      'On a call, each requested spare now shows its OWN stage (one line can be at Stores while another is still at RM Approval), and clicking a spare row opens its full detail — approvals, DC number, courier and status.',
    ],
  },
  {
    version: '0.8.17',
    date: '2026-08-31',
    title: 'A Profile page, and adding users from inside the app',
    changes: [
      'New "My Profile" page (open it from the account menu, top-right) — your name, role, region, a change-password form, and the theme picker, all in one place.',
      'Settings is now administrators-only: the database & sheet connection details, templates and data tools no longer show for regular users.',
      'Admins can add a login from User Access → "+ Add User" (email, name, role, password) — no Supabase console needed. New users sign in and change their password under Profile.',
    ],
  },
  {
    version: '0.8.16',
    date: '2026-08-31',
    title: 'First-time sign-in and a self-cleaning audit log',
    changes: [
      'New users can now be invited straight from Supabase: an invite link opens a “Welcome — set your password” screen, the same way a “Forgot password?” reset link does. Either email is all a first-time user needs to get in — no shared temporary password.',
      'The Audit Log now keeps 7 days of history and deletes anything older automatically. Needs migration 0033_audit_retention.sql (and pg_cron enabled) to take effect.',
    ],
  },
  {
    version: '0.8.9',
    date: '2026-08-30',
    title: 'Stores Incharge can open Pending Dispatch',
    changes: [
      'The Pending Dispatch screen was missing for Stores Incharge \u2014 the role that actually does the dispatching. It is granted now, along with the Spare Requests register so Stores can see what is coming.',
      'Needs migration 0032_stores_sees_pending_dispatch.sql (apply bundle: Spare_1.sql). An administrator can also tick it under Roles & Permissions at any time.',
    ],
  },
  {
    version: '0.8.15',
    date: '2026-08-31',
    title: 'User Master: one Edit, one Save',
    changes: [
      'Editing is now a single action at the top of User Master. \u270e Edit turns every row editable at once, one Save writes everything you changed, and Cancel drops the lot \u2014 no more editing a row at a time, and no more clicking a row by accident and finding it in edit mode.',
      'While you edit, each row that will be written is marked Edited, and the toolbar counts the changes so far. Enter saves, Esc cancels.',
      'Rows are saved one at a time, so if one is refused the message names that person and everything else still goes through \u2014 and what you typed into the failed row is kept.',
      'The full form is still there behind \u22ef on a row, and behind + New User.',
    ],
  },
  {
    version: '0.8.14',
    date: '2026-08-31',
    title: 'User Master edits in the row',
    changes: [
      'Click a row in User Master and its cells become editable where they are \u2014 name, designation, role, IDs, region, active, managers, contact and address. Enter saves, Esc cancels, and the row goes back to reading normally.',
      'The full form is still there behind \u22ef on the row, and behind + New User.',
      'Regional Manager is now a column too, so the reporting tree can be corrected from the list rather than only in the form.',
    ],
  },
  {
    version: '0.8.13',
    date: '2026-08-31',
    title: 'User Master maintains people, and gives them their role',
    changes: [
      'User Master was read-only, so a new joiner could not be added and nobody\u2019s details could be corrected in the app. Administrators can now add a user and edit any of them \u2014 name, IDs, designation, reporting and regional manager, region, contact and address, and whether they are active.',
      'Each user carries a Role. Someone who has never signed in gets that role the moment they first do; someone who has signed in already has it applied to their sign-in as soon as you save.',
      'The list shows who has actually signed in and which role they hold, so it no longer takes two screens to see whether a person has the access you gave them.',
      'Fixed: a person who signed in without a profile behind them showed up as a plain engineer and never appeared in User Access at all \u2014 the screen that assigns roles could not see them. Their profile is now created from their User Master row, with the role it carries.',
      'Setting a delivery address still needs only dispatch, but it can no longer be used to hand out a role: everything except the address stays administrator-only.',
    ],
  },
  {
    version: '0.8.12',
    date: '2026-08-31',
    title: 'Every spare on a report is saved, or none is',
    changes: [
      'Consumed spares are now written in a single step: a report either records all of them or none, so a visit can no longer come back with one of the two spares you entered.',
      'If the spares (or the customer feedback) cannot be saved, the report says so instead of closing as though it worked \u2014 and because the visit itself is already filed, pressing Save Report again retries only the part that failed, without filing a second visit.',
    ],
  },
  {
    version: '0.8.11',
    date: '2026-08-31',
    title: 'Call Status follows the latest visit entered',
    changes: [
      'A call reads as Unattended until a visit is entered against it \u2014 after that its status is the status of the LATEST VISIT ENTRY, and latest now means most recently entered, not the latest visit date. A visit entered today for last week\u2019s work no longer loses to an older entry someone dated further ahead.',
      'A call left at \u201cSolved - Report Pending\u201d now shows as Report pending and stays in Pending Calls; it used to read as Solved and disappear.',
      'Needs migration 0032 (apply bundle: call_requests) to take effect on existing calls.',
    ],
  },
  {
    version: '0.8.10',
    date: '2026-08-31',
    title: 'Call Status and the work-details switch sit together',
    changes: [
      'In Update Call, \u201cUpdate Visit Work Details?\u201d has moved out of the Visit block and now sits beside Call Status \u2014 the two decide each other, so they are read together.',
    ],
  },
  {
    version: '0.8.9',
    date: '2026-08-31',
    title: 'Call Reporting follows the report spec',
    changes: [
      'The Update Call form now matches the agreed field list: UC Number, Call Number, Call Type and your email are shown as fetched, and a Service Report section carries Standard Complaint, Complaint Observation, Job Done, Hour Meter Reading, Software Version, the manual report, Add Consumption?, Accessory Serial No and the Maintenance / Filter questions in that order.',
      'Call Status is now Solved - Report Completed, Unsolved or Solved - Report Pending. A pending reason is picked from the master and is mandatory when the call is Unsolved; on a report-pending call it is filled in for you.',
      'What is mandatory is now enforced: Complaint Observation, Job Done, Hour Meter Reading, Software Version, Add Consumption? and Recomended Filter Changed? on any report that carries work details — plus the manual report itself once the call is Solved - Report Completed, and the Warranty Start Date on an installation.',
      'Update Visit Work Details? is locked to Yes on a completed report, and the visiting engineer defaults to you rather than to whoever visited last.',
      'Warranty Start Date is asked on installation calls only; Accessory Serial No suggests the CPX / ASU units already on that party\u2019s account.',
      'Consumed spares stay editable until you save \u2014 change the part, change the quantity, or delete the line. Adding one no longer locks it. Answering No to Add Consumption? clears the lines.',
      'Name, Contact Number and Designation of whoever signed the report are captured on a completed call.',
    ],
  },
  {
    version: '0.8.8',
    date: '2026-08-30',
    title: 'A spare\u2019s own status, and readable approvals',
    changes: [
      'Opening a spare now shows THAT spare \u2014 its ID and its own status at the top, with the part and quantity. Before, it showed the OR number beside one spare\u2019s status, so an order with one spare at Stores and two still with the RM read as though the whole order was at Stores.',
      'Underneath it says where the order actually stands \u2014 \u201c3 spares \u2014 2 at RM Approval \u00b7 1 at Stores\u201d \u2014 and lists every spare on it with its own stage.',
      'The Approvals column is readable: \u201cCommercial: Cleared \u2014 Under CMC \u00b7 mc1233\u201d rather than the raw record.',
    ],
  },
  {
    version: '0.8.7',
    date: '2026-08-30',
    title: 'Fixed: spares stuck at Stores never reached the dispatch queue',
    changes: [
      'Spare Requests could show spares sitting at Stores while Pending Dispatch showed an empty queue. The queue was reading a stored stage that can fall out of date; it now works out the stage from the approvals themselves, exactly as the register does, so the two can no longer disagree.',
      'The stored stage is repaired for every existing spare when the migration runs, which also corrects the stage chips and the tiles on the register.',
      'Needs migration 0031_pending_dispatch_live_stage.sql (apply bundle: Spare_1.sql).',
    ],
  },
  {
    version: '0.8.6',
    date: '2026-08-30',
    title: 'Fixed: a register could go blank',
    changes: [
      'Adding certain columns to a register \u2014 the ones holding structured data, such as the Commercial/NSM answers \u2014 could blank the whole app instead of showing the column. Those cells now show their content, and an empty one shows nothing.',
      'This was the cause of the blank Spare Requests page.',
    ],
  },
  {
    version: '0.8.5',
    date: '2026-08-30',
    title: 'A broken screen no longer shows a blank page',
    changes: [
      'If a screen hits an error it now says so, on the page, with the reason \u2014 instead of the whole app going white with nothing to go on. The menu keeps working, so you can carry on elsewhere.',
      'Two buttons on that message actually recover it: Reload, and Clear cached data and reload.',
      '\u201cForce update\u201d now really does clear the stored rows. It was only clearing the sync markers, so a screen stuck on data saved by an older version stayed stuck however many times you pressed it.',
    ],
  },
  {
    version: '0.8.4',
    date: '2026-08-30',
    title: 'Item Status comes from Product Master',
    changes: [
      'On a call, Item Status is filled from the machine\u2019s record in Product Master and locked \u2014 the same as its warranty and contract details \u2014 instead of being picked by hand and possibly contradicting the master.',
    ],
  },
  {
    version: '0.8.3',
    date: '2026-08-30',
    title: 'Every call on a request needs its problem',
    changes: [
      'Reported Problem is now mandatory on each of the five calls, so no request reaches the Hotline saying only which machine it is about.',
    ],
  },
  {
    version: '0.8.1',
    date: '2026-08-30',
    title: 'The Declaration form that travels with the parcel',
    changes: [
      'Every stock out can now print its Declaration \u2014 \u201cTO WHOMSOEVER IT MAY CONCERN\u201d \u2014 in the same format as the template: what the parcel contains, why it is being sent, its approximate value, that no money changes hands, the spares, and who it is going to.',
      'The address comes from the User Master \u2014 Address, City, State and Contact No for that engineer \u2014 so it is maintained in one place and right on every parcel. Those four now appear on the User Master screen, and are kept when the sheet is imported.',
      'If an address is wrong or missing, Stores can correct it on the form and save it back to the User Master, so the next parcel to that engineer is right. Dispatch can edit those four fields and nothing else \u2014 the rest of the directory stays with administrators.',
      'The approximate value is typed for each parcel (the form calls it approximate, and the catalogue carries no prices), and the purpose sentence can be edited \u2014 not every parcel is a ventilator part.',
      'Prints on A4 with narrow margins like the challan, and a long parcel list carries the heading and the sender block onto every sheet.',
      'Needs migrations 0029 and 0030 \u2014 apply the User Directory bundle (the address fields on the User Master) and the RBAC one (who may edit them).',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-08-30',
    title: 'The Delivery Challan prints',
    changes: [
      'Booking a stock out now opens its Delivery Challan, laid out like the v2_DCTemplate form — letterhead, the engineer it is going to, the Stock Out number and date, the spares with order number, item code, description and quantity, remarks and both signature blocks.',
      'It prints on A4 with narrow margins, and when a delivery runs past one sheet the letterhead and the signature block are on every sheet — each one is a complete challan, numbered “Sheet 1 of 3”, with the earlier sheets saying where they carry on.',
      'Any past stock out can be reprinted from the Stock outs tab.',
      'One number, not two: the challan is identified by its Stock Out number, exactly as the form and the old sheet did. The separate DC number the previous version generated is gone.',
      'Needs migration 0028_dc_number_is_stock_out.sql (apply bundle: Spare_1.sql).',
    ],
  },
  {
    version: '0.7.9',
    date: '2026-08-30',
    title: 'Pending Dispatch — Stores sends a batch, not a spare',
    changes: [
      'New Pending Dispatch screen for Stores: every approved spare still waiting, grouped by the engineer it is going to, longest wait first.',
      'Tick the spares for one engineer — or the whole engineer at once — and send them in a single go. Spares for two different engineers cannot go on one delivery.',
      'The stock-out number and the DC number are generated for you when the batch is booked out; there is nothing to type and no chance of two people using the same number.',
      'A spare counts as the engineer’s hand stock the moment it is booked out — no waiting for them to acknowledge it — so it can be used on a call report straight away.',
      'The Stock outs tab keeps every delivery: which spares went out, to whom, on which DC and whether each has been acknowledged.',
      'Dispatching from the Spare Requests register now takes you to that engineer’s queue, so there is one place a delivery is made.',
      'Needs migration 0027_spare_dispatch.sql (apply bundle: Spare_1.sql).',
    ],
  },
  {
    version: '0.7.8',
    date: '2026-08-30',
    title: 'Commercial and NSM approve on their own forms',
    changes: [
      'The Commercial step (formerly Admin Approval) now asks what the Google Form asked: the status, then either a reason for clearing \u2014 with the MC / SA number, or the four Direct PO steps behind it \u2014 or a pending reason, plus any comments.',
      'NSM has its form too: the status, the reasons behind it (several may apply, with an Other box) and remarks.',
      '\u201cAdmin Process in Progress\u201d and \u201cPut on HOLD\u201d are new: they record why a spare is waiting without approving it, so it stays in that queue instead of quietly moving on.',
      'The request view shows what each stage answered, so a spare sitting with Commercial or NSM says why.',
    ],
  },
  {
    version: '0.7.7',
    date: '2026-08-30',
    title: 'Old spare requests, and a Dropped outcome',
    changes: [
      'The 26_SpareRequest history can be brought in: every past request and each spare on it, with who approved it, when Stores sent it and on which SO number \u2014 so the register shows the full history, not only what has been raised since.',
      'Imported requests keep their original OR numbers (OR43016 and the like); the new OR-YYMM-NNNN series carries on separately for anything raised from now on.',
      'New \u201cDropped\u201d outcome for a spare Stores did not send. It is kept separate from Rejected \u2014 an approver refuses a request, Stores drops a part that was already approved \u2014 and a dropped spare no longer holds its request open.',
    ],
  },
  {
    version: '0.7.6',
    date: '2026-08-30',
    title: 'One machine, one call on a request',
    changes: [
      'A serial already chosen on another call of the same request no longer appears in the other Serial No dropdowns \u2014 the same machine cannot be raised twice on one request.',
      'When every serial of a product is already spoken for, the dropdown says so rather than looking empty.',
    ],
  },
  {
    version: '0.7.5',
    date: '2026-08-30',
    title: 'Pick the product and serial, don\u2019t type them',
    changes: [
      'On a call request, Product is now a dropdown of what that party actually owns, and Serial No a dropdown of that party\u2019s serials for the chosen product \u2014 on all five calls. No more typos putting a request on a machine that isn\u2019t there.',
      'Changing the party clears any product or serial the new party does not have, instead of leaving a stale one behind.',
      'Call Attended? must be answered before a request can be submitted.',
    ],
  },
  {
    version: '0.7.4',
    date: '2026-08-30',
    title: 'Import the old call registration requests',
    changes: [
      'The historical CRN Registration sheet can be imported as exported \u2014 drop it into Bulk Data Import and it loads into the request register: 4,077 requests from January to August, each with the engineer, party, product, serial, complaint and its UCN.',
      'A request that was registered comes in as Registered with its UCN; one that never was stays Pending and appears in Pending Registrations for the Hotline. Accidental double-submissions in the sheet are dropped.',
      'The sheet columns the register has no field for \u2014 Any Open Call?, Regional Manager, Comments / Remarks \u2014 are kept with the request rather than lost.',
    ],
  },
  {
    version: '0.7.3',
    date: '2026-08-29',
    title: 'Hand Stock \u2014 the stock level every engineer is carrying',
    changes: [
      'Stock Transfer showed what each engineer holds; Hand Stock shows how they came to hold it. One line per engineer and spare with the stock level and every term beside it: stock out from Stores \u2212 consumption \u2212 transfers out + transfers in \u2014 so a figure can be argued with instead of taken on faith.',
      'Two tabs: Stock Level, one line per engineer and spare with the level and every term behind it; and Movements, the ledger those levels are made of \u2014 every stock out, consumption and transfer, newest first, filterable by kind and engineer and exportable.',
      'Click a line on Stock Level for its own movement trail: every stock out with its DC, every consumption with its call, every transfer with the engineer on the other side.',
      'Both screens now read the same derivation, so they cannot disagree. That fixed two ways a balance could be wrong: a spare dispatched against a CALL counted when it was consumed but never when it was issued, leaving the engineer negative and blocking their transfers; and a dispatch from the sheet era, carrying a DC but no date, did not count at all.',
      'Reporting a call now consumes only from hand stock. The spare picker lists what that engineer is holding and how many, and refuses more \u2014 so a report can no longer consume a part nobody issued. Anything else needs a spare request.',
      'Filter to what is in hand, settled, or \u201cshort\u201d \u2014 more consumed or handed on than Stores ever issued, which means stock carried from before this register or a spare taken without a DC.',
      'Access follows the tables underneath: an engineer sees their own stock, an RM their team\u2019s, an admin everyone\u2019s. Needs migration 0023_handstock.sql (apply bundle: HandStock_X.sql).',
    ],
  },
  {
    version: '0.7.1',
    date: '2026-08-29',
    title: 'Every spare has its own ID',
    changes: [
      'Each spare on a request now carries its own reference \u2014 OR-2608-0001-01, OR-2608-0001-02 \u2014 shown as the first column of the register.',
      'That ID is what the RM approves against and what Stores dispatches against, so two spares on the same OR can go out on different days, each with its own DC number.',
      'The request view lists every spare by its ID with its own stage, DC and dispatch date, so you can see at a glance which part is where.',
      'The ID is fixed once issued and unique across the register \u2014 it is what gets quoted on the DC.',
    ],
  },
  {
    version: '0.7.2',
    date: '2026-08-29',
    title: 'Each master list has its own screen',
    changes: [
      'New Master Lists group in the sidebar: Call Type, Standard Complaint, Call Pending Reason, Call Cancel Reason, Feedback Rating and Spare Approval Reason each open their own screen, with that list\u2019s own table, Add and Remove.',
      'All Masters stays the overview \u2014 counts, sources and status for every master \u2014 and opening a list from there shows the same table, with a link through to its own screen.',
      'Fixed: the value lists could look like they never arrived. The previous release\u2019s cached rows were still being shown, and clicking one did nothing; and if the master-lists tables were not in the database yet, the whole screen failed instead of falling back to the lists the app knows and saying which SQL bundle to apply.',
      'The list screens need no new permission \u2014 whoever can open All Masters can open any of them.',
    ],
  },
  {
    version: '0.7.1',
    date: '2026-08-29',
    title: 'Every master value list is its own editable table',
    changes: [
      'All Masters now opens each value list as its own table \u2014 Call Type, Standard Complaint, Call Pending Reason, Call Cancel Reason, Feedback Rating and the new Spare Approval Reason \u2014 with Add and Remove on each. Changes take effect in the forms straight away (the dropdown cache is cleared on every edit).',
      'Seeded from the 200 All Masters workbook: 8 call types, 507 standard complaints, 21 pending reasons, 27 cancel reasons, 4 feedback ratings and 13 spare approval reasons, each with the Added On / Added By it came with.',
      'Spare Approval Reason carries its own Stage and Status columns \u2014 a list can have more than one column, and the registry says which.',
      'Adding a list no longer needs a release: a row in the new `master_lists` registry gives it a table, a label and its columns.',
      'A duplicate entry is refused rather than silently doubling a dropdown, and editing needs the \u201cEdit masters\u201d permission.',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-08-29',
    title: 'Stock Transfer',
    changes: [
      'New Stock Transfer screen: move hand-stock from one engineer to another, with a transfer number (ST-YYMM-NNNN) and remarks.',
      'Stock on hand is worked out from what has actually happened \u2014 hand-stock dispatched to the engineer, less what they consumed on calls, plus or minus transfers \u2014 so the figure can never disagree with the history behind it.',
      'A transfer only offers parts the sender is holding, and the quantity box will not go above what is left of that part. The database enforces the same limit, so a stale screen cannot overdraw.',
      'A \u201cStock on hand\u201d tab shows every engineer\u2019s holding, searchable and exportable to CSV.',
    ],
  },
  {
    version: '0.6.10',
    date: '2026-08-29',
    title: 'OR numbers are per month',
    changes: [
      'OR numbers now read OR-YYMM-NNNN \u2014 OR-2608-0001, OR-2608-0002 \u2014 and the count restarts at 0001 on the first of each month.',
      'A back-dated request is numbered in the month it is dated, not the month it is entered.',
      'Numbers already issued keep their old form: they are quoted on DCs and in Tally, so the old series stays as history and the new format starts from here.',
    ],
  },
  {
    version: '0.6.7',
    date: '2026-08-29',
    title: 'Spare approvals are per spare, not per request',
    changes: [
      'The RM now approves or rejects each spare on its own, so a request for five parts can go forward with three \u2014 the rejected ones stop, the rest carry on to Stores.',
      'Commercial, NSM, Stores and the engineer\u2019s receipt work the same way, and can be actioned either one spare at a time or, with the \u201call N\u201d button, for every spare of an OR still at that stage. The RM stage deliberately has no bulk button.',
      'Each spare carries its own approval trail, DC number and rejection reason; the request shows the stage of whichever spare is furthest behind.',
      'The database now refuses an approval written against the request instead of the spare, so the two can never disagree.',
    ],
  },
  {
    version: '0.6.6',
    date: '2026-08-29',
    title: 'Request Call Registration is a register',
    changes: [
      'The screen was a bare form \u2014 you could raise a request but never see one again. It is now a table of every request raised, newest first, with what became of it: Pending, Registered, Mapped (to a call that already existed) or Cancelled, and the UCN once it has one.',
      'Filter by status, search across REQID / UCN / party / product / serial / engineer, export to CSV, and click a row to read the full request.',
      '\u201cNew Request\u201d opens the same form as before, in a drawer; the list refreshes as soon as a request is saved.',
    ],
  },
  {
    version: '0.6.5',
    date: '2026-08-29',
    title: 'Call Number is assigned, not typed',
    changes: [
      'Call Number was a free-text box nobody filled, so a call created by hand could be saved blank \u2014 and reports, spare requests, consumption and feedback are all keyed by it.',
      'It is now assigned automatically: a call registered from a request carries the request\u2019s UniqueID (REQID-Product-Serial); a direct customer call gets CLYY plus a five-digit running number (CL2600081), continuing that year\u2019s series.',
      'Calls already saved without one are back-filled, each in the series for the year it was registered.',
    ],
  },
  {
    version: '0.6.4',
    date: '2026-08-29',
    title: 'Call status no longer times out',
    changes: [
      'Loading a register or Pending Calls could fail with \u201ccanceling statement due to statement timeout\u201d. The call\u2019s status was re-derived from the whole visit history on every read, and the per-row security checks on visits made that ~140\u00d7 more expensive than the same query without them.',
      'A call now carries its own latest-visit status, kept current as visits are saved. The registers get it with the rows they already load \u2014 one query instead of two \u2014 and Pending Calls reads an indexed column.',
    ],
  },
  {
    version: '0.6.3',
    date: '2026-08-29',
    title: 'File uploads are live',
    changes: [
      'The CallReg backend was redeployed with the Drive permission the uploads need, and the app now points at it \u2014 every device picks up the new address on its own.',
      'Manual Report on a call, and Installation Report / KYC on a registration request, can now actually be uploaded rather than only linked.',
    ],
  },
  {
    version: '0.6.2',
    date: '2026-08-29',
    title: 'Reporting loads again, and the manual report can be uploaded',
    changes: [
      'Fixed the Reporting page failing to sync \u2014 it asked the database to sort by a column the reports table does not have. Visits now come back newest first, by visit date.',
      'Manual Report takes a file, not just a link: upload the signed report (PDF or photo, up to 10 MB) straight from the report form and it goes to the CallReg Drive folder, filling the link for you. Pasting a link still works.',
      'The report filed on the previous visit is now one click away from the Update Call drawer.',
    ],
  },
  {
    version: '0.6.1',
    date: '2026-08-29',
    title: 'All Masters view; Part Master reads the live catalogue',
    changes: [
      'New All Masters screen (Masters \u2192 All Masters): every master the app reads in one place \u2014 the registers (Party, Product, Part, User) with their row counts, and the dropdown value lists (Standard Complaint, Call Type, Pending Reason, Cancel Reason, Feedback Rating) with their values.',
      'Each row shows where the master comes from, how many values it holds, whether it is populated and when it was last synced; picking a value list lists every value, searchable and exportable to CSV.',
      'Part Master was empty: it was still a local demo collection, and the demo data is cleared on first load. It now reads the live ITEM Master (the same parts catalogue the spare pickers use), with search on code and description, an active/inactive filter, Load more, CSV export and the cached-with-last-sync behaviour of Party Master.',
      'Roles that can already open a master register are granted the new All Masters module (migration 0013, additive \u2014 it leaves any admin edit alone).',
      'The in-call spare-consumption picker now searches the same live parts catalogue instead of the cleared demo collection, so it is no longer empty; a consumed part is stored by its catalogue name. (Amount/stock columns are gone \u2014 the live catalogue carries no price or on-hand quantity.)',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-08-29',
    title: 'Call status everywhere, and a Hotline desk for requests',
    changes: [
      'Every register now shows a colour-coded Call Status \u2014 Solved (green), Unsolved (red), Report pending (amber), Unattended (blue) \u2014 taken from the call\u2019s latest visit.',
      'New Pending Calls module: every call nobody has closed, across Field, Installation and PM, with status tiles you can click to filter and a CSV export.',
      'Pending Registrations is now a desk: click a request to see it in full and either map it to an existing call, create a new one, or cancel it with a reason. Any of the three takes it off the pending list.',
      'Requests list an Open Calls column \u2014 how many calls on that machine are still open \u2014 so a duplicate call is obvious before you create one.',
      'UCN Number (Mapped) column: type a UCN straight into the row to map a request to a call that already exists.',
      'Hotline can act on requests again \u2014 the screen now honours the \u201cRegister pending\u201d permission, not just call editing.',
    ],
  },
  {
    version: '0.5.1',
    date: '2026-08-29',
    title: 'Registers say where they actually read from',
    changes: [
      'The Field / Installation / PM registers showed \u201cSheet connected\u201d even when every row came from the database \u2014 the badge only checked that a Web App URL was set, and one ships with the app. It now reads \u201cDatabase connected\u201d when the database is connected, and \u201cSheet connected\u201d only on the sheet fallback.',
      'Screens that refused to load without a sheet URL (Dashboard, Pending Registrations, Product Master, User Master, View as, role scoping, master dropdowns) now accept either source.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-08-29',
    title: 'Spare requests move to the database',
    changes: [
      'Raising a spare request now writes to the database only \u2014 the old sheet append is gone. Each request is one record plus a row per part.',
      'OR numbers are issued by the database, continuing the sheet\u2019s series from OR47042, with a RowNo that restarts at 1 for each OR and the request date stamped on submit.',
      'Call-Based requests get a UC Number picker: search the Call Register by UCN, call number, party or serial, and the party, product, serial, complaint and item status are copied onto the request.',
      'Every role except Engineer can raise a request on behalf of one of their engineers; engineers raise their own.',
      'Up to 20 spares per request, each row editable and removable until you submit; quantity is at least 1. Remarks are now a proper multi-line field.',
      'Fixed: approving a spare request for a non-AMC item was being rejected by the database \u2014 the automatic Commercial and NSM clearance rode along in the same update and tripped their permission checks.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-08-29',
    title: 'Spare Request module — full approval-to-receipt workflow',
    changes: [
      'Spare requests now run end to end in the app: RM \u2192 Commercial \u2192 NSM \u2192 Stores (dispatch + DC) \u2192 engineer acknowledgement. Commercial and NSM auto-approve unless the item is AMC or OGP.',
      'Stage tiles on top of the register (awaiting me / in approval / awaiting dispatch / dispatched / received / rejected) and one-tap stage filters, including a "Needs my action" queue that shows only what your role can move forward.',
      'Every decision goes through a confirmation dialog: a rejection must carry a reason, a dispatch must carry a DC number (courier and remarks optional), and a receipt can note condition or short shipment.',
      'Click any line to open the request: header, call it was raised against, every part requested, and an approval trail of who did what and when \u2014 with the rejection reason inline.',
      'Engineers close the loop by acknowledging receipt of dispatched parts; only the engineer who raised the request can acknowledge it.',
      'New "Acknowledge spare receipt" permission (spare.receive), granted by default to engineers, RM/RGM and the spare coordinator, and editable in Roles & Permissions.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-08-28',
    title: 'Reporting workflow, role-based access, mobile & masters',
    changes: [
      'Role-based call visibility: engineers see only calls allotted to them (mail id → User Master name → Call Allocated To); a Regional Manager sees their whole reporting sub-tree; admins see all.',
      'Admin "View as": preview the app exactly as any engineer sees it, with a persistent banner and one-tap exit.',
      'Call reporting replaces the standalone Call Updation view: an "Update Call" action on every Field/Installation call saves to the Reporting-N tab, keyed by UCN.',
      'Reporting is sectioned by Call Status — Solved shows full report + manual report upload + spare consumption (v2Consumption, added one by one) + customer feedback (v2Feedback); Unsolved needs only the pending reason; Report Pending sets the reason automatically.',
      'Mobile & tablet friendly: off-canvas sidebar on tablets, full-screen drawers on phones, no sideways page scroll, bigger touch targets.',
      'Force-update button in the footer (clears caches and reloads the latest build).',
      'Table Filters moved to the top toolbar.',
      'Masters feed the forms: Party & Product from their masters, plus configurable Standard Complaint and Call Type masters (Admin Config → Master Value Lists).',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-08-28',
    title: 'Operational, Google-Sheet-backed service module',
    changes: [
      'Field Call Register is live against the FIELD tab of the Call Register (CallReg Apps Script bridge); new calls get a UCN written back to the sheet.',
      'Installation Calls added, live against the INST tab (same intake schema, I-type UCNs).',
      'Product Master view: search the install base and register a Field/Installation call straight from a product row.',
      'New Call form: Party → Product → Serial cascade picker (Party Master + Product Master) auto-fills the item.',
      'Google Sheet connection in Settings with tab selection; CORS-safe (JSONP) reads.',
      'Sticky footer showing version, build number, build ID and build time.',
      'Removed Billing (Quotations & Invoices); Breakdown Calls merged into the Field Call Register.',
      'Collapsible sidebar now persists across sessions.',
      'Added in-app Version History.',
      'User Master login: sign in with Air Liquide / Gmail ID, set a password on first sign-in (only Validity = TRUE users); passwords stored as salted hashes, never in the repo.',
      'Product Master: explicit Party / Product / Serial / Item Status filters plus a global search, and auto-load so the view is never blank.',
      'All tables: show/hide, reorder and resize columns (the ⚙ Columns picker lists every schema field); your layout is saved automatically, and admins can "Save for everyone" as the shared default.',
      'All tables: ⚑ Filters — add filters on any field with the right control (text contains, dropdown for small value sets, number ranges); saved per table.',
      'Collapsible sidebar groups (click a group heading); Discard changes / Reset on forms; discard unsynced pending calls (all or one).',
      'User Master directory under Masters (all users, regardless of activation).',
      'Call Registration Request workflow: engineers raise requests; the Hotline registers pending (UCN-less) calls, mapping warranty/contract from Product Master and back-filling the UCN.',
      'Admin Config: sheet links stored in the backend (CallReg), editable and verifiable in-app.',
      'Field & Installation registers: minimalistic UCN / Product / Serial / Party + global search.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-06-13',
    title: 'Field Service module POC (medical domain)',
    changes: [
      'End-to-end POC: Party/Product/Part masters, Warranty & Contract registers, Installation/PM/Breakdown calls, spares, feedback, daily review, field failure report, KPIs.',
      'Reusable design systems: Table (wrap/reorder/resize/sticky/persisted), schema Forms, KPI cards, dependency-free charts.',
      'Password-protected login with roles; 7 light/dark themes.',
      'Mobile-friendly layout and GitHub Pages deployment.',
      'Call enhancements: engineer assignment, linked spare consumption, report attachments, customer signature.',
    ],
  },
];

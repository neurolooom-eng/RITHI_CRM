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

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

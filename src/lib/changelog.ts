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

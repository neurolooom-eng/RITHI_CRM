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

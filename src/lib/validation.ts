// ===========================================================================
// SOFTWARE VALIDATION content — the deliverables for validating RITHI CRM as
// software used within a medical-device manufacturer's Quality Management
// System. Structured per the V-model and mapped to the applicable standards:
//
//   • FDA 21 CFR Part 820 (QSR) / Part 4, ISO 13485:2016 §4.1.6
//   • FDA "Computer Software Assurance for Production and Quality System
//     Software" (CSA, draft Sept 2022) — risk-based, critical-thinking approach
//   • ISO/TR 80002-2:2017 — validation of software for medical-device QMS
//   • GAMP 5 (2nd ed.) — categories & life-cycle
//   • 21 CFR Part 11 — electronic records & signatures / data integrity (ALCOA+)
//   • ISO 14971:2019 — risk management (applied to the software's QMS use)
//
// This is a DRAFT package authored to be REVIEWED, APPROVED and EXECUTED by the
// company's QA/Validation function. It does not itself assert a validated state.
// ===========================================================================

export const VAL_META = {
  system: 'RITHI CRM — Field Service Module',
  owner: 'Air Liquide Medical Systems (ALMS) — Service / Quality',
  docId: 'VAL-RITHI-CRM',
  packageVersion: '1.0 (DRAFT)',
  status: 'DRAFT — pending QA review & approval',
  standards: [
    'FDA 21 CFR Part 820 (QSR); 21 CFR Part 4',
    'FDA Computer Software Assurance (CSA), draft guidance Sept 2022',
    'ISO/TR 80002-2:2017',
    'ISO 13485:2016 §4.1.6 (validation of QMS software)',
    'GAMP 5 (2nd edition)',
    '21 CFR Part 11 (electronic records / signatures)',
    'ISO 14971:2019 (risk management)',
  ],
  gampCategory:
    'Predominantly GAMP Category 5 (custom application) running on Category 1/4 infrastructure & configured platform services (Supabase/Postgres, GitHub Pages).',
  intendedUse:
    'RITHI CRM records and manages field-service operations for medical devices: service/complaint-adjacent call registration, engineer visit reports, spare-part requests and approvals, stock movements, preventive-maintenance scheduling, warranty/contract cover and customer feedback. It is used within the QMS to create and retain quality records; it is NOT medical-device software and does not perform a medical-device function.',
};

export interface DocControl { role: string; name: string; signature: string; date: string }
// Approval block — left blank for wet/e-signature by the responsible roles.
export const APPROVALS: DocControl[] = [
  { role: 'Author', name: '', signature: '', date: '' },
  { role: 'System Owner (Service)', name: '', signature: '', date: '' },
  { role: 'Process Owner (Quality)', name: '', signature: '', date: '' },
  { role: 'QA / Validation Lead', name: '', signature: '', date: '' },
  { role: 'IT / Technical', name: '', signature: '', date: '' },
];

// ---- Validation approach (narrative) --------------------------------------
export const APPROACH: { heading: string; body: string[] }[] = [
  {
    heading: 'Purpose & scope',
    body: [
      'Establish documented evidence that RITHI CRM consistently performs its intended use within the ALMS Quality Management System, and maintains that evidence across changes (a maintained validated state).',
      'Scope covers the deployed web application, its Supabase (PostgreSQL + Auth + Row-Level Security) backend, the record types it creates, and the controls for access, audit and data integrity. Out of scope: the medical devices serviced, and third-party platform internals (addressed by supplier assessment / infrastructure qualification).',
    ],
  },
  {
    heading: 'Risk-based approach (CSA + ISO/TR 80002-2)',
    body: [
      'Following FDA CSA and ISO/TR 80002-2, validation effort is proportional to risk. Each intended-use function is assessed for its impact on product quality, patient safety and data integrity, and assigned a risk level that drives the rigor and independence of testing.',
      'High-risk functions (record integrity, access control, audit trail, call/complaint status, approvals) receive scripted testing with reviewed objective evidence. Lower-risk functions (dashboards, search, cosmetic UI) may use unscripted / exploratory testing with lighter evidence, applying critical thinking rather than exhaustive documentation.',
    ],
  },
  {
    heading: 'Life-cycle & the V-model',
    body: [
      'User Requirements (URS) are verified by User-Acceptance / Performance Qualification (PQ). System/Functional Requirements (FRS) are verified by Operational Qualification (OQ). Architecture & Detailed Design are verified by Installation Qualification (IQ), design review and integration testing.',
      'A requirements-to-test Traceability Matrix demonstrates that every requirement is designed, built and tested, and that every test traces to a requirement.',
    ],
  },
  {
    heading: 'Roles & responsibilities',
    body: [
      'Process Owner (Quality): owns the intended use and acceptance of the validated state. System Owner (Service): owns day-to-day operation, access requests and change requests. QA/Validation Lead: approves the plan, protocols and report; ensures compliance. Developer/IT: implements, maintains configuration/change control, supports IQ. Testers: execute protocols and record evidence.',
    ],
  },
  {
    heading: 'Acceptance & maintaining the validated state',
    body: [
      'The system is acceptable for use when all high-risk test cases pass (or deviations are assessed and dispositioned), the traceability matrix is complete, and the Validation Summary Report is approved by QA.',
      'The validated state is maintained by change control (each change risk-assessed and regression-tested), periodic review, supplier monitoring, and controlled decommissioning.',
    ],
  },
];

// ---- Compliance checklist --------------------------------------------------
export interface ChecklistItem { id: string; item: string; ref: string }
export interface ChecklistSection { code: string; title: string; items: ChecklistItem[] }
export const CHECKLIST: ChecklistSection[] = [
  {
    code: 'A', title: 'Validation governance & planning',
    items: [
      { id: 'A1', item: 'Approved Validation Plan defines scope, approach, roles, deliverables and acceptance criteria.', ref: 'ISO/TR 80002-2 §5; GAMP 5' },
      { id: 'A2', item: 'Intended use of the software within the QMS is documented and approved.', ref: 'ISO 13485 §4.1.6; ISO/TR 80002-2 §4' },
      { id: 'A3', item: 'GxP / quality-system impact and GAMP category are determined and recorded.', ref: 'GAMP 5; CSA' },
      { id: 'A4', item: 'Validation effort is justified as proportional to risk (CSA critical thinking).', ref: 'FDA CSA 2022' },
    ],
  },
  {
    code: 'B', title: 'Requirements & traceability',
    items: [
      { id: 'B1', item: 'User Requirements (URS) are documented, uniquely identified and approved.', ref: 'ISO/TR 80002-2 §6; 21 CFR 820.30(c)' },
      { id: 'B2', item: 'System/Functional Requirements (FRS) trace to URS.', ref: 'GAMP 5; systems engineering' },
      { id: 'B3', item: 'A Traceability Matrix links URS → FRS → design → test, with no orphans.', ref: 'GAMP 5; ISO/TR 80002-2' },
      { id: 'B4', item: 'Requirements are testable, unambiguous and risk-rated.', ref: 'ISO 14971; CSA' },
    ],
  },
  {
    code: 'C', title: 'Risk management',
    items: [
      { id: 'C1', item: 'A risk assessment identifies functions whose failure could affect product quality, safety or data integrity.', ref: 'ISO 14971; ISO/TR 80002-2 §6' },
      { id: 'C2', item: 'Risk controls (design, procedural, testing) are defined and verified; residual risk is acceptable.', ref: 'ISO 14971' },
      { id: 'C3', item: 'Test rigor and independence are driven by risk level.', ref: 'FDA CSA 2022' },
    ],
  },
  {
    code: 'D', title: 'Design & configuration',
    items: [
      { id: 'D1', item: 'Architecture (System) Design describes components, data flow, trust boundaries and platform.', ref: 'GAMP 5; 21 CFR 820.30(f)' },
      { id: 'D2', item: 'Detailed Design describes modules, data model, access rules and key algorithms.', ref: 'GAMP 5' },
      { id: 'D3', item: 'Configuration (roles, permissions, SLA rules, master lists) is specified and controlled.', ref: 'GAMP 5; Part 11 §11.10(d)' },
    ],
  },
  {
    code: 'E', title: 'Supplier / infrastructure qualification',
    items: [
      { id: 'E1', item: 'Platform suppliers (Supabase/Postgres, GitHub) are assessed for suitability and controls.', ref: 'GAMP 5 supplier assessment' },
      { id: 'E2', item: 'Installation Qualification records the deployed version, build, environment and configuration.', ref: 'IQ; 21 CFR 820.70(i)' },
      { id: 'E3', item: 'Infrastructure (hosting, database, TLS) is qualified/leveraged appropriately.', ref: 'GAMP 5 Category 1' },
    ],
  },
  {
    code: 'F', title: 'Testing & objective evidence',
    items: [
      { id: 'F1', item: 'IQ verifies correct installation, version and configuration.', ref: 'IQ' },
      { id: 'F2', item: 'OQ verifies each functional requirement under normal and challenge conditions.', ref: 'OQ; GAMP 5' },
      { id: 'F3', item: 'PQ / UAT verifies the system meets user requirements in the operational workflow.', ref: 'PQ' },
      { id: 'F4', item: 'Objective evidence (results, screenshots, reviewer sign-off) is retained for high-risk tests.', ref: 'CSA; Part 11' },
      { id: 'F5', item: 'Deviations are recorded, assessed and dispositioned before release.', ref: 'GAMP 5' },
    ],
  },
  {
    code: 'G', title: 'Data integrity & 21 CFR Part 11',
    items: [
      { id: 'G1', item: 'Records are Attributable, Legible, Contemporaneous, Original, Accurate (+ Complete, Consistent, Enduring, Available) — ALCOA+.', ref: 'FDA Data Integrity; Part 11' },
      { id: 'G2', item: 'Secure, computer-generated, time-stamped audit trail records create/modify actions and the actor; it cannot be altered by users.', ref: 'Part 11 §11.10(e)' },
      { id: 'G3', item: 'Access is limited to authorised individuals; unique user IDs; role-based authority checks.', ref: 'Part 11 §11.10(d),(g)' },
      { id: 'G4', item: 'Record retention and readiness for retrieval throughout the retention period.', ref: 'Part 11 §11.10(c); 820.180' },
      { id: 'G5', item: 'If electronic signatures are used, they meet Part 11 Subpart C (unique, non-transferable, linked to records).', ref: 'Part 11 Subpart C' },
    ],
  },
  {
    code: 'H', title: 'Security & access control',
    items: [
      { id: 'H1', item: 'Authentication enforces credentials; sessions expire; inactive/leaver accounts are disabled.', ref: 'Part 11 §11.10(d)' },
      { id: 'H2', item: 'Authorisation is enforced server-side (database Row-Level Security), not only in the UI.', ref: 'Defence in depth' },
      { id: 'H3', item: 'Least privilege: roles grant only the actions and data a function needs.', ref: 'ISO 27001 A.9' },
      { id: 'H4', item: 'Transport is encrypted (TLS); secrets are not exposed in client code.', ref: 'Security baseline' },
    ],
  },
  {
    code: 'I', title: 'Change & configuration management',
    items: [
      { id: 'I1', item: 'Source is version-controlled; each release is uniquely identified (version + build ID).', ref: 'GAMP 5; 820.30(i)' },
      { id: 'I2', item: 'Changes are requested, risk-assessed, tested (regression) and approved before release.', ref: '820.30(i); Part 11' },
      { id: 'I3', item: 'A change history / changelog is maintained and visible in-app (Version History).', ref: 'Configuration management' },
      { id: 'I4', item: 'Database schema changes are controlled migrations, tested before application.', ref: 'GAMP 5' },
    ],
  },
  {
    code: 'J', title: 'Backup, recovery & continuity',
    items: [
      { id: 'J1', item: 'Database backups are performed and periodically test-restored.', ref: '820.180; GAMP 5' },
      { id: 'J2', item: 'Recovery Time / Point objectives are defined for the QMS records held.', ref: 'Business continuity' },
    ],
  },
  {
    code: 'K', title: 'Procedures, training & maintenance',
    items: [
      { id: 'K1', item: 'SOPs/work instructions cover system use, access management and change control.', ref: 'ISO 13485; 820.40' },
      { id: 'K2', item: 'Users are trained and training is recorded before productive use.', ref: '820.25' },
      { id: 'K3', item: 'Periodic review confirms the system remains validated and fit for use.', ref: 'GAMP 5 periodic review' },
      { id: 'K4', item: 'Controlled decommissioning preserves records for the retention period.', ref: '820.180' },
    ],
  },
];

// ---- User Requirements -----------------------------------------------------
export type Risk = 'High' | 'Medium' | 'Low';
export interface Req { id: string; title: string; text: string; risk: Risk; refs?: string[] }
export const URS: Req[] = [
  { id: 'URS-001', title: 'Authenticated access', text: 'Only authenticated, authorised personnel shall access the system, each with a unique user identity.', risk: 'High' },
  { id: 'URS-002', title: 'Role-based visibility', text: 'A user shall see and act on only the records their role permits: an engineer their own calls, a manager their reporting team, office/administration roles as defined.', risk: 'High' },
  { id: 'URS-003', title: 'Register a service call', text: 'The service desk shall register a customer call capturing customer, product, serial, complaint and reported problem, and the system shall assign a unique call number (UCN).', risk: 'High' },
  { id: 'URS-004', title: 'Record a visit / call report', text: 'An engineer shall record each visit with call status, observations, work done and readings; the call status shall reflect the latest visit.', risk: 'High' },
  { id: 'URS-005', title: 'Preventive maintenance', text: 'The company shall schedule and record preventive-maintenance (PM) visits, including bulk creation of the monthly PM batch by an administrator.', risk: 'Medium' },
  { id: 'URS-006', title: 'Installation control', text: 'Creation of installation calls shall be restricted to the Commercial function; installation records shall capture the warranty start date.', risk: 'Medium' },
  { id: 'URS-007', title: 'Spare request & approval', text: 'An engineer shall request spare parts against a call; the request shall follow a defined multi-stage approval chain, each stage authorised by the correct role.', risk: 'High' },
  { id: 'URS-008', title: 'Spare dispatch & receipt', text: 'Stores shall dispatch approved spares and the requesting engineer shall acknowledge receipt; each step shall be recorded with actor and time.', risk: 'Medium' },
  { id: 'URS-009', title: 'Stock accuracy', text: 'Hand stock, stock transfers and material returns shall be tracked so an engineer cannot transfer or return more than they hold.', risk: 'Medium' },
  { id: 'URS-010', title: 'Master data', text: 'Party, product, part and user master data, and configurable value lists, shall be maintained under control.', risk: 'Medium' },
  { id: 'URS-011', title: 'Warranty & contract cover', text: 'Warranty and contract cover per machine shall be maintained and reflected on calls.', risk: 'Medium' },
  { id: 'URS-012', title: 'Customer feedback', text: 'Customer feedback captured on a call shall be recorded and retrievable per question.', risk: 'Low' },
  { id: 'URS-013', title: 'Reports & analytics', text: 'Authorised users shall retrieve visit history and analytics; export shall be permitted only to authorised roles.', risk: 'Medium' },
  { id: 'URS-014', title: 'SLA monitoring', text: 'The company shall define service-level targets and the system shall highlight open calls that are due or breached.', risk: 'Medium' },
  { id: 'URS-015', title: 'Notifications', text: 'An engineer shall be notified in-app when a call is allotted to them or a requested spare is dispatched.', risk: 'Low' },
  { id: 'URS-016', title: 'Audit trail', text: 'The system shall keep a secure, attributable, time-stamped audit trail of key actions that users cannot alter.', risk: 'High', refs: ['Part 11 §11.10(e)'] },
  { id: 'URS-017', title: 'Data integrity & retention', text: 'Records shall be complete, accurate and retained and retrievable for the required retention period (ALCOA+).', risk: 'High', refs: ['Part 11'] },
  { id: 'URS-018', title: 'Availability & recovery', text: 'The system and its records shall be backed up and recoverable.', risk: 'Medium' },
  { id: 'URS-019', title: 'Controlled change', text: 'Changes to the software shall be version-controlled, tested and approved; each release shall be uniquely identifiable in-app.', risk: 'Medium' },
  { id: 'URS-020', title: 'Knowledge base', text: 'The team shall maintain how-to guidance and field-solution knowledge within the system.', risk: 'Low' },
];

// ---- System / Functional Requirements -------------------------------------
export interface FReq extends Req { urs: string[] }
export const FRS: FReq[] = [
  { id: 'FRS-001', urs: ['URS-001'], title: 'Credential authentication', text: 'The system authenticates users against Supabase Auth (email + password); first sign-in forces a password set; sessions are token-based and expire.', risk: 'High' },
  { id: 'FRS-002', urs: ['URS-001'], title: 'Account lifecycle', text: 'Administrators create logins from User Master; a leaver’s login can be set inactive, blocking sign-in and hydration while retaining their historical records.', risk: 'High' },
  { id: 'FRS-003', urs: ['URS-002'], title: 'RBAC + reporting-tree scoping', text: 'Each role maps to a permission set (app_roles). Data visibility is scoped by a reporting tree resolved from User Master; enforced in the client and, authoritatively, by PostgreSQL Row-Level Security.', risk: 'High' },
  { id: 'FRS-004', urs: ['URS-002'], title: 'Server-side authorisation', text: 'Every read/write is governed by RLS policies keyed on the authenticated user (auth.uid()) and SECURITY DEFINER helper functions; the UI gate is secondary.', risk: 'High' },
  { id: 'FRS-005', urs: ['URS-003'], title: 'Call registration & UCN', text: 'Registering a request or a direct call inserts a call row; a database trigger assigns a unique UCN (date + type letter F/I/P + sequence) and a Call Number (request UniqueID or CLYY##### running series).', risk: 'High' },
  { id: 'FRS-006', urs: ['URS-003', 'URS-005', 'URS-006'], title: 'Call type segregation', text: 'Field, Installation and PM calls are stored in separate physical tables (field_calls / installation_calls / pm_calls) behind a compatibility view with routing triggers; a CHECK constraint prevents mis-filing.', risk: 'Medium' },
  { id: 'FRS-007', urs: ['URS-004'], title: 'Visit reporting & status', text: 'A report row is written per visit; a trigger recomputes the call’s status from the latest ENTRY (Unattended → Unsolved → Report pending → Solved). A “Solved - Report Completed” call becomes read-only to non-admins.', risk: 'High' },
  { id: 'FRS-008', urs: ['URS-006'], title: 'Installation gating', text: 'Insertion into installation_calls requires the install.create permission (Commercial, Hotline, admin); enforced by RLS.', risk: 'Medium' },
  { id: 'FRS-009', urs: ['URS-005'], title: 'PM bulk upload', text: 'An administrator uploads a CSV; rows are mapped, forced to PM type, previewed, then inserted in batches with UCN/Call Number assigned by the database.', risk: 'Medium' },
  { id: 'FRS-010', urs: ['URS-007'], title: 'Spare approval chain', text: 'A spare request creates per-part lines; each advances RM → Commercial → NSM → Stores. A per-stage database guard blocks a stage change unless the actor holds that stage’s permission.', risk: 'High' },
  { id: 'FRS-011', urs: ['URS-007'], title: 'Manager-scoped approval', text: 'A reporting manager sees and approves only their own team’s spare requests; their own request routes to their manager, not to themselves.', risk: 'High' },
  { id: 'FRS-012', urs: ['URS-008'], title: 'Dispatch & receipt', text: 'Stores dispatch generates a DC and stock-out; the engineer acknowledges receipt. Drop is available at any stage to Spare Coordinator / Hotline only.', risk: 'Medium' },
  { id: 'FRS-013', urs: ['URS-009'], title: 'Stock derivation & guard', text: 'Hand stock = stock-out − consumption − transfer-out + transfer-in − returned. A guard prevents a transfer/return exceeding holdings, counting every movement regardless of visibility.', risk: 'Medium' },
  { id: 'FRS-014', urs: ['URS-009', 'URS-002'], title: 'Stock visibility scope', text: 'Hand stock, transfers and returns are scoped to the reporting tree at the database, so a user sees only their own and their team’s stock.', risk: 'Medium' },
  { id: 'FRS-015', urs: ['URS-010'], title: 'Master maintenance', text: 'Party/Product/Part/User masters and value lists are editable by authorised roles; edits are gated by masters.edit and audit-logged where applicable.', risk: 'Medium' },
  { id: 'FRS-016', urs: ['URS-011'], title: 'Cover registers', text: 'Warranty (Sale Entry) and Contract (Contract Entry) registers hold the parent record; machines inherit its values unless individually pinned.', risk: 'Medium' },
  { id: 'FRS-017', urs: ['URS-012'], title: 'Feedback capture', text: 'Feedback answers are stored per question and surfaced as columns in the Customer Feedback view, scoped like calls.', risk: 'Low' },
  { id: 'FRS-018', urs: ['URS-013'], title: 'Reports & export gate', text: 'Visit history is retrievable with field filters; CSV export is blocked unless the user holds export.data.', risk: 'Medium' },
  { id: 'FRS-019', urs: ['URS-014'], title: 'SLA engine', text: 'Configurable SLA rules (hours + on/off) are evaluated per open call (first visit, closure, closure-with-spare, closure-spare-non-cover, stores dispatch); the Dashboard flags due/breached.', risk: 'Medium' },
  { id: 'FRS-020', urs: ['URS-015'], title: 'Notification triggers', text: 'Database triggers create a per-user notification when a call is allotted or a requested spare is dispatched; each user reads/marks only their own (RLS).', risk: 'Low' },
  { id: 'FRS-021', urs: ['URS-016'], title: 'Audit log', text: 'Client actions insert audit events; the database stamps identity so it cannot be forged; only admins can read the log; retention auto-purges after the defined window.', risk: 'High' },
  { id: 'FRS-022', urs: ['URS-017'], title: 'Record integrity', text: 'Records are written to PostgreSQL with constraints; the publishable key is public by design and access is enforced by RLS; the service_role key is never shipped.', risk: 'High' },
  { id: 'FRS-023', urs: ['URS-018'], title: 'Backup/restore', text: 'The Supabase project provides managed backups; restore is periodically verified per procedure.', risk: 'Medium' },
  { id: 'FRS-024', urs: ['URS-019'], title: 'Release identity & change log', text: 'Each build carries a version, build number and build ID shown in the footer; an in-app Version History lists changes; source and schema changes are version-controlled.', risk: 'Medium' },
  { id: 'FRS-025', urs: ['URS-020'], title: 'Knowledge base', text: 'A how-to guide plus team field-solution articles (sanitised rich text) are available to all; author or admin edits.', risk: 'Low' },
];

// ---- Architecture (System) Design -----------------------------------------
export const ARCHITECTURE: { heading: string; body: string[] }[] = [
  { heading: 'Overview', body: [
    'A single-page web application (React 18 + TypeScript, built with Vite) served as static assets from GitHub Pages. It talks directly to a Supabase project (managed PostgreSQL + Auth + PostgREST API) over HTTPS.',
    'There is no custom application server: business rules and access control live in the database (RLS policies, SECURITY DEFINER functions, triggers, generated columns), so they are enforced regardless of client.',
  ] },
  { heading: 'Components', body: [
    'Client (browser): UI, local cache (offline-first, 30-min sync), role-aware rendering.',
    'Supabase Auth: identity, sessions (JWT), password management.',
    'PostgREST: REST access to tables/views, constrained by RLS.',
    'PostgreSQL: the system of record — tables, views, RLS, triggers, generated columns, pg_cron (audit retention, digest).',
    'Legacy Apps Script bridge (CallReg.gs): Drive file uploads and sheet-era reads when Supabase is not connected.',
  ] },
  { heading: 'Trust boundaries & security', body: [
    'The browser is untrusted; all authorisation is server-side via RLS keyed on auth.uid(). The anon/publishable key is public by design; the service_role key is never present in the client.',
    'Transport is TLS. Session tokens are short-lived. Server-side helper functions run SECURITY DEFINER with fixed search_path.',
  ] },
  { heading: 'Data flow (example: register a call)', body: [
    'User submits the request → PostgREST insert into the calls view → INSTEAD OF trigger routes to the typed table → BEFORE trigger assigns UCN & Call Number → RLS confirms the actor may create → row returned → client caches and displays.',
  ] },
  { heading: 'Deployment & configuration', body: [
    'Merges to the main branch trigger a GitHub Actions build (tsc + Vite) that publishes to gh-pages (the live site). Database schema is applied as numbered, idempotent migrations / consolidated apply-bundles run in the Supabase SQL editor.',
    'Configuration items under control: roles & permissions (app_roles + per-user extra), SLA rules, master value lists, and platform secrets (Edge Function).',
  ] },
];

// ---- Detailed Design -------------------------------------------------------
export const DETAILED: { area: string; points: string[] }[] = [
  { area: 'Identity & RBAC', points: [
    'profiles (role, active) + app_roles (role → permissions jsonb) + per-user extra_permissions. has_perm() resolves effective permissions with an engineer-default fallback when a role list is empty.',
    'visible_engineer_names() resolves the reporting sub-tree via a recursive CTE over user_directory; can_view_all_calls() grants office/admin/data.view_all holders full visibility.',
  ] },
  { area: 'Calls & state', points: [
    'calls split into field_calls / installation_calls / pm_calls with a UNION view + INSTEAD OF routing triggers and per-table CHECK. Generated column open_state derives status; sync_call_last_visit() maintains last visit from reports (latest entry by updated_at).',
    'pending_calls / call_state views expose open calls and status; next_ucn() and next_direct_call_number() assign identifiers.',
  ] },
  { area: 'Spare workflow', points: [
    'spare_requests (header) + spare_request_lines (per part). spare_line_stage() computes the stage; spare_requests_stage_guard() enforces per-stage permission on write; spare_pending_dispatch view lists Stores-stage lines awaiting a DC.',
    'RLS scopes requests to creator / engineer email / reporting tree / approvers.',
  ] },
  { area: 'Stock', points: [
    'handstock_movements / handstock_balance (security_invoker) derive stock from dispatch, consumption, transfers and MRN returns; a stock guard blocks overdraw counting all movements.',
  ] },
  { area: 'Audit & data integrity', points: [
    'A DATABASE-ENFORCED audit trail (record_audit) logs every INSERT/UPDATE/DELETE on the quality-record tables with actor, timestamp and before/after row, via SECURITY DEFINER triggers; it is admin/audit.view read-only and cannot be written or altered by users. The client audit_log additionally records user actions with duration/status.',
    'Retention is configurable (app_settings.audit_retention_days, default ~10 years) — the earlier 7-day purge is replaced. A daily email digest also archives the day’s audit trail off-database.',
    'Application deletion of quality records is blocked (record-retention guard); only a controlled DBA/superuser action can remove them, and that too is audited. Records are constrained (unique UCN, FKs) in PostgreSQL.',
  ] },
  { area: 'SLA & notifications', points: [
    'sla_rules (hours + active) evaluated by evaluateCallSla() to on-track/due/breach. notifications created by SECURITY DEFINER triggers on allotment and dispatch; RLS scopes to recipient.',
  ] },
  { area: 'Client integrity controls', points: [
    'HTML authored in the Knowledge Base editor is sanitised (allowlist) before storage and render. CSV export is centrally gated. The offline cache is per-table with sync markers and a Force-update that clears caches.',
  ] },
];

// ---- Risk assessment -------------------------------------------------------
export interface RiskRow { id: string; fn: string; failure: string; effect: string; sev: Risk; controls: string; residual: Risk; refs: string[] }
export const RISKS: RiskRow[] = [
  { id: 'R-01', fn: 'Access control (RBAC/RLS)', failure: 'A user sees or edits records outside their authority', effect: 'Loss of confidentiality/integrity of quality records', sev: 'High', controls: 'Server-side RLS keyed on auth.uid(); least-privilege roles; OQ tests FRS-003/004', residual: 'Low', refs: ['FRS-003', 'FRS-004'] },
  { id: 'R-02', fn: 'Audit trail', failure: 'An action is not recorded, or a user alters the trail', effect: 'Non-attributable records; Part 11 non-compliance', sev: 'High', controls: 'DB-stamped identity; admin-only read; no user update; OQ test FRS-021', residual: 'Low', refs: ['FRS-021'] },
  { id: 'R-03', fn: 'Call status', failure: 'Status does not reflect the latest visit', effect: 'Open complaint appears closed; service KPI wrong', sev: 'High', controls: 'Trigger recomputes from latest entry; open_state generated column; OQ FRS-007', residual: 'Low', refs: ['FRS-007'] },
  { id: 'R-04', fn: 'Spare approval', failure: 'A stage is approved by an unauthorised role', effect: 'Uncontrolled spare release', sev: 'High', controls: 'Per-stage DB guard; manager-scoped approval; OQ FRS-010/011', residual: 'Low', refs: ['FRS-010', 'FRS-011'] },
  { id: 'R-05', fn: 'Identifier assignment', failure: 'Duplicate or missing UCN / Call Number', effect: 'Records cannot be uniquely traced', sev: 'High', controls: 'DB triggers + unique constraint + shared sequence; OQ FRS-005', residual: 'Low', refs: ['FRS-005'] },
  { id: 'R-06', fn: 'Call-type routing', failure: 'A call is filed under the wrong type', effect: 'Wrong workflow / reporting', sev: 'Medium', controls: 'Routing triggers + per-table CHECK constraint; OQ FRS-006', residual: 'Low', refs: ['FRS-006'] },
  { id: 'R-07', fn: 'Stock accuracy', failure: 'Overdraw of stock through a hidden movement', effect: 'Inaccurate inventory records', sev: 'Medium', controls: 'Guard counts all movements irrespective of visibility; OQ FRS-013', residual: 'Low', refs: ['FRS-013'] },
  { id: 'R-08', fn: 'Data at scale', failure: 'Queries time out as volume grows', effect: 'Records inaccessible', sev: 'Medium', controls: 'Indexed once-per-query RLS; table split; PQ performance test', residual: 'Low', refs: ['FRS-006'] },
  { id: 'R-09', fn: 'Bulk import', failure: 'PM batch imports wrong/duplicate rows', effect: 'Erroneous PM records', sev: 'Medium', controls: 'Preview before commit; DB assigns identifiers; admin-only; OQ FRS-009', residual: 'Low', refs: ['FRS-009'] },
  { id: 'R-10', fn: 'Content integrity', failure: 'Malicious HTML stored in a KB article', effect: 'Script injection', sev: 'Medium', controls: 'Allowlist sanitiser on save and render; OQ FRS-025', residual: 'Low', refs: ['FRS-025'] },
  { id: 'R-11', fn: 'Availability', failure: 'Data loss without recoverable backup', effect: 'Loss of quality records', sev: 'High', controls: 'Managed backups; periodic restore test; PQ/IQ evidence', residual: 'Medium', refs: ['FRS-023'] },
  { id: 'R-12', fn: 'Change control', failure: 'An untested change reaches production', effect: 'Regression in a quality function', sev: 'Medium', controls: 'Version control, build ID, changelog, regression tests; periodic review', residual: 'Low', refs: ['FRS-024'] },
];

// ---- Software FMEA (sFMEA) -------------------------------------------------
// S/O/D on a 1–10 scale; RPN = S × O × D. Action is required when RPN ≥ 100 or
// Severity ≥ 8 (a high-severity failure is actioned regardless of RPN). S rarely
// changes with controls (it is inherent to the effect); prevention lowers O,
// detection lowers D. "After" = residual once the listed controls are in place.
export const FMEA_SCALE = {
  severity: 'S 1 = negligible · 5 = record inaccuracy correctable · 8 = quality-record integrity / traceability loss · 10 = regulatory / patient-safety impact',
  occurrence: 'O 1 = remote · 4 = occasional · 7 = frequent · 10 = almost certain',
  detection: 'D 1 = detected with near certainty (constraint/test) · 5 = moderate · 10 = not detectable before effect',
  threshold: 'Action required when RPN ≥ 100 OR Severity ≥ 8.',
};
export interface FmeaRow {
  id: string; item: string; mode: string; cause: string; effect: string;
  s: number; o: number; d: number;             // initial
  controls: string; action: string;
  oa: number; da: number;                        // residual occurrence / detection (S unchanged)
  refs: string[];
}
export const FMEA: FmeaRow[] = [
  { id: 'FM-01', item: 'Access control (RBAC / RLS)', mode: 'A user reads or edits records outside their authority', cause: 'Missing/incorrect RLS policy; UI-only gating', effect: 'Confidentiality / integrity loss of QMS records', s: 9, o: 3, d: 3, controls: 'Server-side RLS keyed on auth.uid(); least-privilege roles; OQ-02', action: 'Verify RLS on every record table in IQ; negative access tests in OQ', oa: 2, da: 2, refs: ['FRS-003', 'FRS-004', 'IQ-02', 'OQ-02'] },
  { id: 'FM-02', item: 'Audit trail', mode: 'An action is not logged, or the trail is altered', cause: 'Client omits event; user has write on the log', effect: 'Non-attributable records; Part 11 non-compliance', s: 8, o: 3, d: 4, controls: 'DB-stamped identity; admin-only read; no user update; retention purge', action: 'OQ-09 confirms completeness and tamper-resistance', oa: 2, da: 2, refs: ['FRS-021', 'OQ-09'] },
  { id: 'FM-03', item: 'Call status', mode: 'Status does not reflect the latest visit', cause: 'Ordering by visit date not entry; trigger not fired', effect: 'Open complaint appears closed; wrong KPI', s: 7, o: 4, d: 4, controls: 'Trigger recomputes from latest entry; generated open_state; OQ-05', action: 'Regression-test status on every call-table change', oa: 2, da: 2, refs: ['FRS-007', 'OQ-05'] },
  { id: 'FM-04', item: 'Spare approval', mode: 'A stage is approved by an unauthorised role', cause: 'UI shows a button the DB does not enforce', effect: 'Uncontrolled spare release', s: 7, o: 3, d: 3, controls: 'Per-stage DB guard; manager-scoped approval; OQ-07', action: 'Negative approval tests per stage', oa: 2, da: 2, refs: ['FRS-010', 'FRS-011', 'OQ-07'] },
  { id: 'FM-05', item: 'Identifier assignment', mode: 'Duplicate or missing UCN / Call Number', cause: 'Race on sequence; trigger bypassed on import', effect: 'Records not uniquely traceable', s: 8, o: 2, d: 5, controls: 'DB triggers + UNIQUE(ucn) + shared sequence; OQ-03', action: 'Uniqueness test incl. bulk import path', oa: 1, da: 2, refs: ['FRS-005', 'OQ-03'] },
  { id: 'FM-06', item: 'Call-type routing', mode: 'A call is filed under the wrong type', cause: 'Routing logic vs data mismatch', effect: 'Wrong workflow and reporting', s: 5, o: 3, d: 3, controls: 'Routing triggers + per-table CHECK; OQ-04', action: 'Mis-file rejection test', oa: 1, da: 2, refs: ['FRS-006', 'OQ-04'] },
  { id: 'FM-07', item: 'Stock accuracy', mode: 'Overdraw via a movement the user cannot see', cause: 'Guard counts only visible movements', effect: 'Inaccurate inventory records', s: 5, o: 4, d: 4, controls: 'Guard counts every movement regardless of scope; OQ-08', action: 'Over-transfer negative test', oa: 2, da: 2, refs: ['FRS-013', 'OQ-08'] },
  { id: 'FM-08', item: 'Data access at scale', mode: 'Queries time out as call volume grows', cause: 'Per-row recursive RLS; unindexed scan', effect: 'Records inaccessible', s: 6, o: 5, d: 3, controls: 'Once-per-query RLS (InitPlan); call-table split; PQ-03', action: 'Performance test at production-like volume', oa: 2, da: 2, refs: ['FRS-006', 'PQ-03'] },
  { id: 'FM-09', item: 'Bulk import', mode: 'PM batch imports wrong or duplicate rows', cause: 'Column mis-map; re-run duplicates', effect: 'Erroneous PM records', s: 6, o: 4, d: 3, controls: 'Preview before commit; DB assigns IDs; admin-only; OQ-14', action: 'Import review + reconciliation step', oa: 2, da: 2, refs: ['FRS-009', 'OQ-14'] },
  { id: 'FM-10', item: 'Content integrity', mode: 'Malicious HTML stored in a KB article', cause: 'Unsanitised rich text', effect: 'Stored XSS / script injection', s: 6, o: 3, d: 4, controls: 'Allowlist sanitiser on save and render; OQ-13', action: 'Injection test with script/handler payloads', oa: 1, da: 2, refs: ['FRS-025', 'OQ-13'] },
  { id: 'FM-11', item: 'Availability', mode: 'Data loss with no recoverable backup', cause: 'Backup not taken / never restore-tested', effect: 'Loss of quality records', s: 9, o: 2, d: 6, controls: 'Managed backups; scheduled restore test; PQ-02', action: 'Document RPO/RTO; periodic restore verification', oa: 1, da: 3, refs: ['FRS-023', 'PQ-02'] },
  { id: 'FM-12', item: 'Change control', mode: 'An untested change reaches production', cause: 'Direct push; no regression', effect: 'Regression in a quality function', s: 6, o: 4, d: 4, controls: 'Version control, build ID, changelog, regression tests; periodic review', action: 'Change-control SOP + release checklist', oa: 2, da: 2, refs: ['FRS-024'] },
  { id: 'FM-13', item: 'Notifications', mode: 'A notification reaches the wrong user', cause: 'Name→id resolution error', effect: 'Information disclosure (low)', s: 4, o: 3, d: 5, controls: 'Resolve by email then directory; RLS scopes to recipient; OQ-12', action: 'Recipient-scope test', oa: 2, da: 3, refs: ['FRS-020', 'OQ-12'] },
  { id: 'FM-14', item: 'Session / leaver access', mode: 'A leaver retains access', cause: 'Session not expired; account not disabled', effect: 'Unauthorised access to records', s: 7, o: 3, d: 4, controls: 'Token expiry; inactive-login toggle blocks sign-in & hydrate; OQ-01', action: 'Leaver-deactivation procedure + test', oa: 2, da: 2, refs: ['FRS-002', 'OQ-01'] },
];

// ---- Test protocol (IQ / OQ / PQ) -----------------------------------------
export type TestPhase = 'IQ' | 'OQ' | 'PQ';
export interface TestCase { id: string; phase: TestPhase; reqs: string[]; risk: Risk; objective: string; steps: string[]; expected: string }
export const TESTS: TestCase[] = [
  { id: 'IQ-01', phase: 'IQ', reqs: ['FRS-024'], risk: 'Medium', objective: 'Confirm the deployed version, build and environment.', steps: ['Open the application', 'Read the footer version, build number and build ID', 'Record the Supabase project and the applied migration/apply-bundle status'], expected: 'Version, build ID and environment match the release record; expected apply-bundles report as present.' },
  { id: 'IQ-02', phase: 'IQ', reqs: ['FRS-003', 'FRS-004'], risk: 'High', objective: 'Confirm RLS is enabled on record tables and configuration is loaded.', steps: ['In the database, list RLS status for calls tables, spares, reports, audit_log, notifications, sla_rules', 'Confirm app_roles is populated and sla_rules seeded'], expected: 'RLS is enabled on all record tables; roles and SLA rules present.' },
  { id: 'OQ-01', phase: 'OQ', reqs: ['FRS-001', 'FRS-002'], risk: 'High', objective: 'Authentication and account lifecycle.', steps: ['Attempt sign-in with invalid credentials', 'Sign in with valid credentials; set password on first sign-in', 'Set a login inactive and attempt sign-in'], expected: 'Invalid rejected; valid succeeds; first-sign-in forces password; inactive login is blocked.' },
  { id: 'OQ-02', phase: 'OQ', reqs: ['FRS-003', 'FRS-004'], risk: 'High', objective: 'Role scoping is enforced server-side.', steps: ['As an engineer, list calls and attempt to read a peer’s call by direct query', 'As a reporting manager, list team calls', 'As an office role, confirm full visibility'], expected: 'Engineer sees only own; peer record not returned even by direct query; manager sees team; office sees all.' },
  { id: 'OQ-03', phase: 'OQ', reqs: ['FRS-005'], risk: 'High', objective: 'UCN and Call Number assignment.', steps: ['Register a field, an installation and a PM call', 'Inspect the assigned UCN and Call Number'], expected: 'Each gets a unique UCN (letter F/I/P) and a Call Number; no duplicates.' },
  { id: 'OQ-04', phase: 'OQ', reqs: ['FRS-006'], risk: 'Medium', objective: 'Call-type routing and mis-file prevention.', steps: ['Create one call of each type via the app', 'Attempt to insert a PM-typed row directly into field_calls'], expected: 'Each call lands in its typed table; the mis-typed direct insert is rejected by the CHECK constraint.' },
  { id: 'OQ-05', phase: 'OQ', reqs: ['FRS-007'], risk: 'High', objective: 'Visit reporting drives call status; completed calls lock.', steps: ['Report a visit as Unsolved, then a later entry as Solved - Report Completed', 'As a non-admin, attempt to edit the completed call'], expected: 'Status follows the latest entry; a completed call is read-only to non-admins.' },
  { id: 'OQ-06', phase: 'OQ', reqs: ['FRS-008'], risk: 'Medium', objective: 'Installation creation is Commercial-gated.', steps: ['As an engineer, attempt to create an installation', 'As Commercial, create an installation'], expected: 'Engineer is blocked (button hidden and DB rejects); Commercial succeeds into installation_calls.' },
  { id: 'OQ-07', phase: 'OQ', reqs: ['FRS-010', 'FRS-011'], risk: 'High', objective: 'Spare approval authority and manager scoping.', steps: ['Raise a spare; attempt to approve a stage as a role lacking that permission', 'As a reporting manager, view spares and attempt to approve own request'], expected: 'Unauthorised stage change is rejected; a manager sees only team spares and cannot approve their own.' },
  { id: 'OQ-08', phase: 'OQ', reqs: ['FRS-012', 'FRS-013'], risk: 'Medium', objective: 'Dispatch, receipt and stock guard.', steps: ['Approve through to Stores; dispatch (DC generated)', 'Acknowledge receipt', 'Attempt to transfer more stock than held'], expected: 'Dispatch creates a DC/stock-out; receipt recorded; the over-transfer is blocked.' },
  { id: 'OQ-09', phase: 'OQ', reqs: ['FRS-021'], risk: 'High', objective: 'Audit trail is complete and tamper-resistant.', steps: ['Perform a create and an update', 'As admin, view the audit log', 'As a non-admin, attempt to read or modify the audit log'], expected: 'Both actions are logged with actor and time; non-admin cannot read/modify the trail.' },
  { id: 'OQ-10', phase: 'OQ', reqs: ['FRS-018'], risk: 'Medium', objective: 'Export is authorisation-gated.', steps: ['As an engineer, attempt CSV export', 'As an authorised role, export'], expected: 'Engineer export is blocked; authorised export succeeds.' },
  { id: 'OQ-11', phase: 'OQ', reqs: ['FRS-019'], risk: 'Medium', objective: 'SLA evaluation and highlighting.', steps: ['Configure an SLA target; create/age an open call past the target', 'View the Dashboard'], expected: 'The call is flagged due/breached against the configured rule.' },
  { id: 'OQ-12', phase: 'OQ', reqs: ['FRS-020'], risk: 'Low', objective: 'Notifications on allotment/dispatch.', steps: ['Allot a call to an engineer', 'Dispatch a spare they requested', 'Sign in as that engineer'], expected: 'The engineer receives the corresponding notifications and only their own.' },
  { id: 'OQ-13', phase: 'OQ', reqs: ['FRS-025'], risk: 'Medium', objective: 'Knowledge-base content is sanitised.', steps: ['Create an article containing a script tag and an event handler', 'View the saved article'], expected: 'The script/handler is stripped; benign formatting/images/tables are preserved.' },
  { id: 'OQ-14', phase: 'OQ', reqs: ['FRS-009'], risk: 'Medium', objective: 'PM bulk upload.', steps: ['As admin, upload a PM CSV', 'Review the preview; import', 'Inspect created PM calls'], expected: 'Rows preview correctly; on import each becomes a PM call with UCN/Call Number; blanks skipped.' },
  { id: 'PQ-01', phase: 'PQ', reqs: ['URS-003', 'URS-004', 'URS-007'], risk: 'High', objective: 'End-to-end field workflow by real users.', steps: ['A user registers a customer call, an engineer reports a visit and requests a spare, approvals dispatch it, the engineer acknowledges and closes the call'], expected: 'The workflow completes; records are consistent, attributable and retrievable.' },
  { id: 'PQ-02', phase: 'PQ', reqs: ['URS-017', 'URS-018'], risk: 'High', objective: 'Record retention & recovery.', steps: ['Retrieve records after the sync/refresh cycle', 'Perform a backup restore in a test project and verify records'], expected: 'Records are complete and retrievable; a restore reproduces the records.' },
  { id: 'PQ-03', phase: 'PQ', reqs: ['URS-013', 'URS-014'], risk: 'Medium', objective: 'Operational reporting & SLA in real use.', steps: ['Run the registers, Reports and Dashboard with production-like volume', 'Confirm SLA highlighting and export controls'], expected: 'Screens load within acceptable time; SLA and export behave per role.' },
];

// ---- 21 CFR Part 11 assessment (appendix) ---------------------------------
export interface Part11Row { clause: string; requirement: string; applicable: 'Yes' | 'Partial' | 'N/A'; howMet: string }
export const PART11: Part11Row[] = [
  { clause: '§11.10(a)', requirement: 'Validation of systems to ensure accuracy, reliability, consistent intended performance.', applicable: 'Yes', howMet: 'This validation package (URS/FRS, IQ/OQ/PQ, traceability, risk/FMEA).' },
  { clause: '§11.10(b)', requirement: 'Ability to generate accurate and complete copies of records (human-readable and electronic).', applicable: 'Yes', howMet: 'On-screen views, CSV export (role-gated), and PostgreSQL/Supabase export of the underlying records.' },
  { clause: '§11.10(c)', requirement: 'Protection of records to enable accurate and ready retrieval throughout the retention period.', applicable: 'Yes', howMet: 'Records held in managed PostgreSQL with backups; retention procedure; audit retention purge is configurable.' },
  { clause: '§11.10(d)', requirement: 'Limiting system access to authorized individuals.', applicable: 'Yes', howMet: 'Supabase Auth (unique logins), inactive-login lockout, RLS-enforced RBAC.' },
  { clause: '§11.10(e)', requirement: 'Secure, computer-generated, time-stamped audit trails; retained and available for review/copy.', applicable: 'Yes', howMet: 'audit_log with DB-stamped identity/time; admin-only read; not user-editable.' },
  { clause: '§11.10(f)', requirement: 'Operational system checks to enforce permitted sequencing of steps.', applicable: 'Yes', howMet: 'Spare approval chain guard; call-status workflow; call-type routing constraints.' },
  { clause: '§11.10(g)', requirement: 'Authority checks — only authorized individuals may use, sign, access, or perform operations.', applicable: 'Yes', howMet: 'Permission (has_perm) + RLS checks per action (e.g., install.create, approvals, export.data).' },
  { clause: '§11.10(h)', requirement: 'Device (terminal) checks where appropriate.', applicable: 'N/A', howMet: 'Web application accessed over TLS; no device-specific data source requiring terminal checks.' },
  { clause: '§11.10(i)', requirement: 'Persons who develop/maintain/use the system have the education, training and experience.', applicable: 'Yes', howMet: 'Training records (procedural); developer competency (procedural).' },
  { clause: '§11.10(j)', requirement: 'Written policies holding individuals accountable for actions under their electronic signatures.', applicable: 'Partial', howMet: 'Procedural SOP required; the system attributes actions to unique users via the audit trail.' },
  { clause: '§11.10(k)', requirement: 'Controls over systems documentation (distribution, access, change control).', applicable: 'Yes', howMet: 'Version-controlled source; in-app Version History; controlled migrations; this package under document control.' },
  { clause: '§11.50 / §11.70', requirement: 'Signature manifestations and signature/record linking (if e-signatures are used).', applicable: 'N/A', howMet: 'The system does not currently implement 21 CFR Part 11 electronic signatures; approvals are role-authorized actions recorded in the audit trail. If e-signatures are introduced, Subpart C applies.' },
  { clause: '§11.100–300', requirement: 'Electronic signature uniqueness, identity verification, and controls (Subpart C).', applicable: 'N/A', howMet: 'Not applicable until e-signatures are implemented; unique user IDs + password controls already provide the identity basis.' },
];

// ---- Supplier / vendor assessment (appendix) ------------------------------
export interface Supplier { name: string; service: string; criticality: Risk; criteria: string[]; conclusion: string }
export const SUPPLIERS: Supplier[] = [
  {
    name: 'Supabase', service: 'Managed PostgreSQL, Authentication, PostgREST API, Edge Functions, backups',
    criticality: 'High',
    criteria: [
      'Hosts all quality records — highest criticality; assessed as a GAMP infrastructure/platform supplier.',
      'Data centre / cloud controls: SOC 2 Type II (via underlying AWS), encryption at rest and in transit (TLS).',
      'Access control primitives leveraged by the application: Auth (unique identities) and Row-Level Security enforced in Postgres.',
      'Backup & point-in-time recovery available per plan; restore to be periodically verified by the customer.',
      'Availability / status transparency (status page); change notifications.',
      'Residual customer responsibility: correct RLS configuration, key management (service_role never shipped), backup verification, and this validation.',
    ],
    conclusion: 'Acceptable as the platform of record, provided the customer-side controls (RLS configuration, backup verification, access management) are maintained and evidenced. Leverage supplier certifications; qualify the configured use via IQ/OQ.',
  },
  {
    name: 'GitHub (Actions + Pages)', service: 'Source control, CI build (tsc + Vite), static hosting of the web client',
    criticality: 'Medium',
    criteria: [
      'Hosts source and the build/deploy pipeline; does not store quality records (the client is static assets).',
      'Change control: pull-request/commit history, protected main branch recommended, build provenance (build number/ID surfaced in-app).',
      'Availability and integrity of the deployed bundle; served over HTTPS.',
      'Residual customer responsibility: branch protection, review of changes, release identification, and regression testing before merge to main.',
    ],
    conclusion: 'Acceptable for source control and hosting the client. Recommend enabling branch protection on main and recording release approvals as part of change control.',
  },
  {
    name: 'Resend (optional)', service: 'Transactional email for the daily digest (if deployed)',
    criticality: 'Low',
    criteria: [
      'Sends operational summary emails; does not create or hold quality records.',
      'API key held as a function secret (not in the repo); sender domain verification recommended.',
    ],
    conclusion: 'Low criticality; acceptable for operational notifications. Not in the GxP record path.',
  },
];

// ---- Validation Summary Report (template) ---------------------------------
export const VSR: { heading: string; body: string[] }[] = [
  { heading: '1. Purpose', body: ['Summarise the validation activities performed for RITHI CRM and state whether the system is fit for its intended use within the QMS. Completed at the end of execution.'] },
  { heading: '2. Scope & references', body: ['System, version and build validated: __________. References: this Validation Plan, URS, FRS, Design, Risk/FMEA, IQ/OQ/PQ protocols, and the executed test records.'] },
  { heading: '3. Summary of activities', body: ['IQ executed on ____ ; OQ executed on ____ ; PQ/UAT executed on ____ . Number of test cases executed: ____ ; passed: ____ ; failed: ____ .'] },
  { heading: '4. Deviations & dispositions', body: ['List each deviation, its risk assessment, root cause, correction, and disposition (accept / retest / defer). Confirm no open high-risk deviation remains.'] },
  { heading: '5. Requirements traceability', body: ['Confirm the traceability matrix is complete: every URS is covered by FRS and tests, and every test passed or is dispositioned.'] },
  { heading: '6. Residual risk statement', body: ['Confirm residual risks (risk assessment + FMEA) are acceptable with the controls verified, and any procedural controls (SOPs, training, backup verification) are in place.'] },
  { heading: '7. Conclusion & release', body: ['State whether RITHI CRM is validated and released for productive use in the QMS, subject to the maintaining-the-validated-state controls (change control, periodic review, supplier monitoring).'] },
  { heading: '8. Approval', body: ['Approved by System Owner, Process Owner (Quality), and QA/Validation Lead (wet or Part 11-compliant e-signature), with dates.'] },
];

// ---- Data Migration Validation --------------------------------------------
export const DATA_MIGRATION = {
  objective: 'Demonstrate that data migrated into RITHI CRM (legacy Google-Sheet / AppSheet exports, and bulk uploads such as the monthly PM batch) is complete, accurate and uncorrupted.',
  method: [
    'Identify each source (sheet/tab or export file) and its target table; record row counts at source and after load.',
    'Reconcile counts and key fields; verify identifiers (UCN, Call Number, OR No) are assigned and unique; confirm dates parsed correctly.',
    'Spot-check a risk-based sample of records field-by-field against the source; verify no truncation or encoding loss.',
    'Confirm de-duplication behaved as intended and that a re-run of an import does not duplicate already-loaded rows.',
  ],
  acceptance: [
    'Target counts reconcile to source (or discrepancies are explained and dispositioned).',
    'Sampled records match the source; identifiers unique; no data loss or corruption.',
    'Migration is documented, reviewed and approved before the migrated data is used for GxP decisions.',
  ],
  checks: [
    { id: 'DM1', check: 'Source inventory and target mapping documented.' },
    { id: 'DM2', check: 'Row-count reconciliation source ⇄ target recorded.' },
    { id: 'DM3', check: 'Sample field-level verification performed and retained.' },
    { id: 'DM4', check: 'Identifier uniqueness and date integrity verified.' },
    { id: 'DM5', check: 'Re-run/idempotency verified (no duplication).' },
    { id: 'DM6', check: 'Migration report reviewed and approved.' },
  ],
};

// ---- Backup & Restore Qualification ---------------------------------------
export const BACKUP = {
  statement: [
    'Quality records are held in the managed Supabase PostgreSQL project, which provides automated backups (and point-in-time recovery on the applicable plan).',
    'Recovery objectives are defined by the customer: RPO (max acceptable data loss) = ______ ; RTO (max acceptable downtime) = ______ .',
    'Restore capability is verified periodically by restoring to a test project and confirming record integrity — a backup is not evidence of recoverability until a restore has been demonstrated.',
  ],
  checks: [
    { id: 'BK1', check: 'Backup schedule and retention confirmed with the platform.' },
    { id: 'BK2', check: 'RPO/RTO defined and approved for the records held.' },
    { id: 'BK3', check: 'A restore to a test environment was executed and record integrity verified (date, executor recorded).' },
    { id: 'BK4', check: 'Restore procedure (SOP) exists and personnel are trained.' },
  ],
};

// ---- Security assessment ---------------------------------------------------
export const SECURITY = {
  controls: [
    { area: 'Authentication', control: 'Supabase Auth; unique credentials; first-login password set; token sessions expire; inactive-login lockout for leavers.' },
    { area: 'Authorisation', control: 'Server-side Row-Level Security keyed on auth.uid() + role permissions; least privilege; enforced independently of the UI.' },
    { area: 'Transport', control: 'HTTPS/TLS for all client↔platform traffic.' },
    { area: 'Secrets', control: 'Publishable/anon key is public by design (RLS-enforced); the service_role key is never shipped to the client; Edge-Function secrets held server-side.' },
    { area: 'Input handling', control: 'Knowledge-Base rich text is allowlist-sanitised on save and render; parameterised database access via PostgREST.' },
    { area: 'Audit & integrity', control: 'Database-enforced audit trail (record_audit); application deletion of quality records blocked; configurable long audit retention; off-database daily audit archive by email.' },
    { area: 'Availability', control: 'Managed platform; backups with verified restore.' },
  ],
  actions: [
    'Enable branch protection on the main branch (change control).',
    'Maintain a dependency inventory (SBOM) and monitor advisories for the front-end libraries.',
    'Perform a periodic vulnerability assessment / penetration test proportional to risk.',
    'Hold a Data Processing Agreement with the platform provider (GDPR / India DPDP Act) and record data-residency.',
  ],
};

// ---- Data integrity (ALCOA+) ----------------------------------------------
export const ALCOA: { principle: string; howMet: string }[] = [
  { principle: 'Attributable', howMet: 'Every record and change is tied to a unique authenticated user via the database audit trail.' },
  { principle: 'Legible', howMet: 'Records are readable on screen and exportable (CSV); audit entries are structured.' },
  { principle: 'Contemporaneous', howMet: 'Timestamps are set by the database at the time of the action (server time).' },
  { principle: 'Original', howMet: 'The PostgreSQL row is the original record; the audit trail preserves before/after.' },
  { principle: 'Accurate', howMet: 'Constraints, generated status, triggers and validation reduce error; verified by OQ.' },
  { principle: 'Complete', howMet: 'Audit trail captures create/update/delete; deletion of quality records is prevented.' },
  { principle: 'Consistent', howMet: 'Workflow sequencing (approval chain, call status) is enforced by the database.' },
  { principle: 'Enduring', howMet: 'Records held in managed, backed-up storage; long audit retention; email archive.' },
  { principle: 'Available', howMet: 'Records retrievable throughout the retention period; role-based access.' },
];

// ---- Configuration specification ------------------------------------------
export const CONFIG_SPEC: { item: string; where: string; controlled: string }[] = [
  { item: 'Roles & permissions matrix', where: 'app_roles + per-user extra_permissions', controlled: 'Admin / rbac.manage; changes are audited; baseline exported and approved.' },
  { item: 'SLA targets', where: 'sla_rules', controlled: 'Admin Config (config.manage); values baselined in this package.' },
  { item: 'Master value lists', where: 'master_lists / masters', controlled: 'masters.edit; seeded from the approved master workbook.' },
  { item: 'Audit retention period', where: 'app_settings.audit_retention_days', controlled: 'Config.manage; default 3650 days; set per the retention SOP.' },
  { item: 'Reporting tree (visibility)', where: 'user_directory (reporting/regional manager)', controlled: 'Admin; drives call/spare/stock scoping.' },
  { item: 'Release identity', where: 'version / build number / build ID (footer)', controlled: 'CI build; recorded at IQ.' },
];

// ---- Required SOPs / procedures --------------------------------------------
export const SOPS: { id: string; title: string; purpose: string }[] = [
  { id: 'SOP-01', title: 'System use & data entry', purpose: 'How to register calls, report visits, request/approve spares, and the meaning of statuses.' },
  { id: 'SOP-02', title: 'Access management', purpose: 'Requesting, granting, reviewing and revoking access; leaver deactivation; periodic access review.' },
  { id: 'SOP-03', title: 'Change control', purpose: 'How changes are requested, risk-assessed, tested (regression), approved and released; release identification.' },
  { id: 'SOP-04', title: 'Backup & restore', purpose: 'Backup verification and the restore procedure with RPO/RTO.' },
  { id: 'SOP-05', title: 'Audit-trail review', purpose: 'Periodic review of the audit trail and handling of anomalies.' },
  { id: 'SOP-06', title: 'Data migration & bulk import', purpose: 'Controls and verification for imports (incl. the monthly PM batch).' },
  { id: 'SOP-07', title: 'Periodic review', purpose: 'Schedule and criteria for confirming the system remains validated.' },
  { id: 'SOP-08', title: 'Record retention & decommissioning', purpose: 'Retention periods per record type; controlled archival and decommissioning.' },
  { id: 'SOP-09', title: 'Incident & CAPA', purpose: 'Logging deviations/incidents and driving corrective/preventive action.' },
  { id: 'SOP-10', title: 'Training', purpose: 'Role-based training and competency before productive use.' },
];

// ---- Governance narratives -------------------------------------------------
export const GOVERNANCE: { heading: string; body: string[] }[] = [
  { heading: 'Change control', body: ['Source is version-controlled; each release carries a version, build number and build ID (shown in the footer) and an in-app Version History. Every change is requested, risk-assessed for GxP impact, tested (including regression of affected quality functions) and approved before merge to the production branch. Database changes are applied as controlled, idempotent migrations validated before application.'] },
  { heading: 'Periodic review', body: ['At a defined interval (e.g. annually or on significant change), QA reviews: open changes and their validation, incidents/CAPA, access review, backup/restore evidence, supplier status and the risk assessment, and confirms the system remains fit for use or triggers revalidation.'] },
  { heading: 'Record retention & decommissioning', body: ['Retention periods are defined per record type in line with regulatory requirements (typically the device lifetime plus the applicable number of years). The audit trail is retained for the same period (configurable). On decommissioning, records are exported/archived in a readable form and retained for the balance of the retention period before controlled destruction.'] },
  { heading: 'Training', body: ['Users are trained on the relevant SOPs and their role in the system, with training recorded, before productive use. Administrators and approvers receive additional training on their controlled functions.'] },
];

// ---- CAPA / deviation log (template) --------------------------------------
export const CAPA_COLUMNS = ['Ref', 'Date', 'Source (test/incident)', 'Description', 'Risk', 'Root cause', 'Correction', 'Preventive action', 'Owner', 'Due', 'Status'];

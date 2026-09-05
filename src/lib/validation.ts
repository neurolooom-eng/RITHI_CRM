// ===========================================================================
// SOFTWARE VALIDATION content — the deliverables for validating RITHI CRM as
// software used within a medical-device manufacturer's Quality Management
// System. Structured per the V-model and mapped to the applicable standards:
//
//   • Medical Devices Rules, 2017 (CDSCO) — Fifth Schedule, the QMS a
//     manufacturer must hold; aligned to ISO 13485
//   • ISO 13485:2016 §4.1.6 — validation of software used in the QMS
//   • ISO/TR 80002-2:2017 — validation of software for medical-device QMS
//   • GAMP 5 (2nd ed.) — categories & life-cycle
//   • Computer Software Assurance (CSA) — risk-based, critical-thinking effort
//   • ISO 14971:2019 — risk management (applied to the software's QMS use)
//   • Data integrity: ALCOA+
//
// NOT 21 CFR. Part 820 and Part 11 are FDA's, and this operation is regulated
// by CDSCO. The CONTROLS Part 11 describes — an attributable, time-stamped
// trail users cannot alter, unique identities, authority checks — are kept:
// they are how record control under ISO 13485 §4.2.5 and the Fifth Schedule is
// evidenced. It is the citation that has gone, not the control.
// (Removed 2026-09-05 at the user's direction. India has no dedicated
// electronic-records rule for medical devices; electronic records and
// signatures take their legal standing from the Information Technology Act,
// 2000. Clause numbers here are the author's mapping and are for RA/QA to
// confirm against the current text of each standard.)
//
// This is a DRAFT package authored to be REVIEWED, APPROVED and EXECUTED by the
// company's QA/Validation function. It does not itself assert a validated state.
// ===========================================================================

export const VAL_META = {
  system: 'RITHI CRM — Field Service Module',
  owner: 'Air Liquide Medical Systems (ALMS) — Service / Quality',
  docId: 'VAL-RITHI-CRM',
  packageVersion: '1.7 (DRAFT)',
  status: 'DRAFT — pending QA review & approval',
  revision:
    'Rev 1.1 extends the package to the spare-stock control work: partial issue of spares (URS-021), acknowledged receipt per delivery (URS-022), reconciliation of consumption — booking, amendment and voiding (URS-023), the cap holding consumption within hand stock (URS-024), call re-opening (URS-025) and preventive-maintenance due-month scheduling (URS-026), with the corresponding FRS-026..032, design, risks R-13..R-15, FMEA FM-15/FM-16 and tests OQ-15..OQ-19 and PQ-04. Rev 1.2 adds refurbished spares (URS-027) and dispatch performance (URS-028), with FRS-033/034, R-16, FM-17 and OQ-20; hand stock is now derived from the spare ISSUE rather than the request, so a recycled part is held under its own code. Rev 1.3 adds the document library — service manuals presented on the call for the product they cover (URS-029) and controlled QMS documents (URS-030) — with FRS-035/036, R-17, FM-18 and OQ-21. Rev 1.4 covers the work asked for by the Reporting Managers and the correction that followed it: finding a machine or a customer’s machines (URS-031), allotment and bulk re-allotment of calls (URS-032), grouping a register by up to three columns (URS-033), raising a record for an engineer in one’s own team (URS-034), and correcting the engineer on a spare order before it is issued — never after — with a log of every such change (URS-035); with FRS-037..041, design for register reading, search and acting-for-a-team-member, risks R-18..R-20, FMEA FM-19/FM-20 and tests OQ-22..OQ-25. It also adds reliability and consumption analysis (URS-036, FRS-042, OQ-29) \u2014 failure rate per machine in the field, and spare use by cover and by region \u2014 and fills three requirements that had carried no test at all (OQ-26..28: master data, warranty and contract cover, customer feedback). Rev 1.5 covers the migration of the superseded system\u2019s record and what it exposed: migrated data must stay DISTINGUISHABLE from the system\u2019s own, and a figure derived from both must report the split (URS-037); a stock period may be closed, provably without changing a balance (URS-038); identifiers continue across a migration rather than being re-issued (URS-039); a bulk load alters only what its file carries (URS-040); migrated stock is opened only against an active user (URS-041); and a register returns within a working time on production volume (URS-042) \u2014 with FRS-043..048, design for migrated data, bulk loading and response time, risks R-21..R-25, FMEA FM-21..FM-23, tests OQ-30..34 and PQ-05, four further data-migration checks (DM7..DM10) and four configuration items, among them the rule that a schema bundle must carry the latest definition of everything it defines. Rev 1.6 adds decision support (URS-043, FRS-049, R-27, OQ-36) \u2014 a suggested Standard Complaint, drawn from the register, stating its grounds, never written without a person choosing it \u2014 and, found while testing it, the control that a VIEW must not defeat the policies beneath it (FRS-050, R-26, OQ-35): `calls` had lost `security_invoker` when 0057 rebuilt it, so every signed-in user could read every call, and pending_calls and call_state inherited that reach despite carrying the setting themselves. Rev 1.5 also restates FRS-021: a BULK write to a quality table is recorded as one attributable event rather than a row per record (0103), because an audit trail answers what a person changed and a data load is answered by the migration checks \u2014 the trail keeps who loaded what, how much and when. Rev 1.7 changes the package\u2019s REGULATORY BASIS and one of its controls, both at the user\u2019s direction (2026-09-05). 21 CFR is removed: Part 820 and Part 11 are FDA\u2019s, and this operation is regulated by CDSCO under the Medical Devices Rules, 2017, whose Fifth Schedule sets the QMS and is aligned to ISO 13485. Every Part 11 / Part 820 citation is re-cited to ISO 13485 or the Fifth Schedule, and the Part 11 appendix is withdrawn. The CONTROLS those clauses describe are kept \u2014 an attributable, time-stamped trail users cannot alter, unique identities, authority checks \u2014 because they are how record control is evidenced; it is the citation that has gone. India has no dedicated electronic-records rule for medical devices; electronic records and signatures take their standing from the Information Technology Act, 2000. AND THE DATABASE-ENFORCED TRAIL IS SWITCHED OFF (0112): record_audit no longer records anything. Its table is retained and readable, holding what it captured while it ran. FRS-021 now describes ONE trail and states its limits \u2014 client-written, so bypassable by a direct API call, and purged on the retention window \u2014 and R-14 is raised from Low to Medium residual because the independent before/after image of an amended consumption entry is gone. The clause mappings in this revision are the author\u2019s and are for RA/QA to confirm against the current text of each standard and of MDR-2017.',
  standards: [
    'Medical Devices Rules, 2017 (CDSCO) — Fifth Schedule (QMS)',
    'ISO 13485:2016 §4.1.6 (validation of QMS software)',
    'ISO/TR 80002-2:2017',
    'GAMP 5 (2nd edition)',
    'Computer Software Assurance (CSA) — risk-based validation effort',
    'ISO 14971:2019 (risk management)',
    'Information Technology Act, 2000 (legal standing of electronic records)',
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
      { id: 'B1', item: 'User Requirements (URS) are documented, uniquely identified and approved.', ref: 'ISO/TR 80002-2 §6; ISO 13485 §7.3.3' },
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
      { id: 'D1', item: 'Architecture (System) Design describes components, data flow, trust boundaries and platform.', ref: 'GAMP 5; ISO 13485 §7.3.6' },
      { id: 'D2', item: 'Detailed Design describes modules, data model, access rules and key algorithms.', ref: 'GAMP 5' },
      { id: 'D3', item: 'Configuration (roles, permissions, SLA rules, master lists) is specified and controlled.', ref: 'GAMP 5; ISO 13485 §4.2.4' },
    ],
  },
  {
    code: 'E', title: 'Supplier / infrastructure qualification',
    items: [
      { id: 'E1', item: 'Platform suppliers (Supabase/Postgres, GitHub) are assessed for suitability and controls.', ref: 'GAMP 5 supplier assessment' },
      { id: 'E2', item: 'Installation Qualification records the deployed version, build, environment and configuration.', ref: 'IQ; ISO 13485 §6.3, §7.5.6' },
      { id: 'E3', item: 'Infrastructure (hosting, database, TLS) is qualified/leveraged appropriately.', ref: 'GAMP 5 Category 1' },
    ],
  },
  {
    code: 'F', title: 'Testing & objective evidence',
    items: [
      { id: 'F1', item: 'IQ verifies correct installation, version and configuration.', ref: 'IQ' },
      { id: 'F2', item: 'OQ verifies each functional requirement under normal and challenge conditions.', ref: 'OQ; GAMP 5' },
      { id: 'F3', item: 'PQ / UAT verifies the system meets user requirements in the operational workflow.', ref: 'PQ' },
      { id: 'F4', item: 'Objective evidence (results, screenshots, reviewer sign-off) is retained for high-risk tests.', ref: 'CSA; ISO 13485 §4.2.5' },
      { id: 'F5', item: 'Deviations are recorded, assessed and dispositioned before release.', ref: 'GAMP 5' },
    ],
  },
  {
    code: 'G', title: 'Data integrity (ALCOA+)',
    items: [
      { id: 'G1', item: 'Records are Attributable, Legible, Contemporaneous, Original, Accurate (+ Complete, Consistent, Enduring, Available) — ALCOA+.', ref: 'ALCOA+; ISO 13485 §4.2.5' },
      { id: 'G2', item: 'Secure, computer-generated, time-stamped audit trail records create/modify actions and the actor; it cannot be altered by users.', ref: 'ISO 13485 §4.2.5; MDR-2017 Fifth Schedule' },
      { id: 'G3', item: 'Access is limited to authorised individuals; unique user IDs; role-based authority checks.', ref: 'ISO 13485 §4.2.4, §6.2' },
      { id: 'G4', item: 'Record retention and readiness for retrieval throughout the retention period.', ref: 'ISO 13485 §4.2.5; MDR-2017 Fifth Schedule (retention)' },
      { id: 'G5', item: 'Electronic signatures are not implemented; approvals are role-authorised actions attributed to a unique identity in the audit trail. If signatures are introduced they take their standing from the Information Technology Act, 2000.', ref: 'Information Technology Act, 2000' },
    ],
  },
  {
    code: 'H', title: 'Security & access control',
    items: [
      { id: 'H1', item: 'Authentication enforces credentials; sessions expire; inactive/leaver accounts are disabled.', ref: 'ISO 13485 §4.2.4, §6.2' },
      { id: 'H2', item: 'Authorisation is enforced server-side (database Row-Level Security), not only in the UI.', ref: 'Defence in depth' },
      { id: 'H3', item: 'Least privilege: roles grant only the actions and data a function needs.', ref: 'ISO 27001 A.9' },
      { id: 'H4', item: 'Transport is encrypted (TLS); secrets are not exposed in client code.', ref: 'Security baseline' },
    ],
  },
  {
    code: 'I', title: 'Change & configuration management',
    items: [
      { id: 'I1', item: 'Source is version-controlled; each release is uniquely identified (version + build ID).', ref: 'GAMP 5; ISO 13485 §7.3.9' },
      { id: 'I2', item: 'Changes are requested, risk-assessed, tested (regression) and approved before release.', ref: 'ISO 13485 §7.3.9 (design & development changes)' },
      { id: 'I3', item: 'A change history / changelog is maintained and visible in-app (Version History).', ref: 'Configuration management' },
      { id: 'I4', item: 'Database schema changes are controlled migrations, tested before application.', ref: 'GAMP 5' },
    ],
  },
  {
    code: 'J', title: 'Backup, recovery & continuity',
    items: [
      { id: 'J1', item: 'Database backups are performed and periodically test-restored.', ref: 'ISO 13485 §4.2.5; GAMP 5' },
      { id: 'J2', item: 'Recovery Time / Point objectives are defined for the QMS records held.', ref: 'Business continuity' },
    ],
  },
  {
    code: 'K', title: 'Procedures, training & maintenance',
    items: [
      { id: 'K1', item: 'SOPs/work instructions cover system use, access management and change control.', ref: 'ISO 13485 §4.2.4' },
      { id: 'K2', item: 'Users are trained and training is recorded before productive use.', ref: 'ISO 13485 §6.2' },
      { id: 'K3', item: 'Periodic review confirms the system remains validated and fit for use.', ref: 'GAMP 5 periodic review' },
      { id: 'K4', item: 'Controlled decommissioning preserves records for the retention period.', ref: 'ISO 13485 §4.2.5' },
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
  { id: 'URS-016', title: 'Audit trail', text: 'The system shall keep a secure, attributable, time-stamped audit trail of key actions that users cannot alter.', risk: 'High', refs: ['ISO 13485 §4.2.5'] },
  { id: 'URS-017', title: 'Data integrity & retention', text: 'Records shall be complete, accurate and retained and retrievable for the required retention period (ALCOA+).', risk: 'High', refs: ['ISO 13485 §4.2.5', 'MDR-2017 Fifth Schedule'] },
  { id: 'URS-018', title: 'Availability & recovery', text: 'The system and its records shall be backed up and recoverable.', risk: 'Medium' },
  { id: 'URS-019', title: 'Controlled change', text: 'Changes to the software shall be version-controlled, tested and approved; each release shall be uniquely identifiable in-app.', risk: 'Medium' },
  { id: 'URS-020', title: 'Knowledge base', text: 'The team shall maintain how-to guidance and field-solution knowledge within the system.', risk: 'Low' },
  { id: 'URS-021', title: 'Partial issue of spares', text: 'Stores shall be able to issue fewer units of a spare than were requested when only part of the quantity is available, and the outstanding balance shall remain visible as still due.', risk: 'Medium' },
  { id: 'URS-022', title: 'Acknowledged receipt', text: 'The engineer shall confirm each delivery of a spare as it is received, and a spare shall be recorded as received only when the whole quantity has been confirmed.', risk: 'Medium' },
  { id: 'URS-023', title: 'Reconciliation of consumption', text: 'Authorised office roles shall be able to record a spare consumed against a call that the engineer did not report, correct a quantity reported in error, and void an entry made in error, with a reason retained for each.', risk: 'High' },
  { id: 'URS-024', title: 'Stock integrity', text: 'No spare shall be recorded as consumed in excess of the quantity the engineer holds, so that hand-stock balances cannot become negative.', risk: 'High' },
  { id: 'URS-025', title: 'Re-opening a closed call', text: 'A closed call shall be re-openable by an authorised role where further work or correction is required, and the re-opening shall be recorded.', risk: 'Medium' },
  { id: 'URS-027', title: 'Refurbished spares', text: 'Where a recycled spare is issued in place of a new one, it shall be identified by its own part number, held and consumed as that part, and the engineer shall be told the part is refurbished. Only a part held in Part Master and active may be issued this way.', risk: 'High' },
  { id: 'URS-028', title: 'Dispatch performance', text: 'The time taken by Stores to issue an approved spare shall be measurable, from the moment the spare cleared its last approval to the moment it was issued.', risk: 'Low' },
  { id: 'URS-029', title: 'Service manuals available at the point of work', text: 'The service documentation for a product shall be held centrally and presented to the engineer on the call for that product, so the machine is worked on against its own manual rather than one found by memory or by hunting a shared folder.', risk: 'Medium' },
  { id: 'URS-030', title: 'Controlled QMS documents', text: 'Quality-system documents (SOPs, work instructions, forms) shall be held with their document number, revision and effective date, be readable by every user, and be maintainable only by the role responsible for the quality system. A superseded document shall be withdrawn from use without being destroyed.', risk: 'High' },
  { id: 'URS-031', title: 'Find a machine, or a customer\u2019s machines', text: 'A user shall be able to identify the customer holding a given product and serial number, and to list every machine and serial number recorded against a given customer, without needing to know how either is spelled in the register.', risk: 'Low' },
  { id: 'URS-032', title: 'Allotment and re-allotment of calls', text: 'A reporting manager shall be able to allot a call to, or move a call between, the engineers reporting to them and themselves, including several calls in one action, changing nothing on the call but the engineer it is allotted to.', risk: 'High' },
  { id: 'URS-033', title: 'Grouping a register', text: 'A user shall be able to group a register by the values of a column \u2014 and by more than one column at a time \u2014 so a manager can read a list by region, then by engineer, then by call status, without exporting it.', risk: 'Low' },
  { id: 'URS-034', title: 'Requesting on behalf of an engineer', text: 'A reporting manager shall be able to raise a spare request, a call registration request or a visit report for an engineer reporting to them, with the record attributed to that engineer and the manager\u2019s identity retained as its author.', risk: 'Medium' },
  { id: 'URS-035', title: 'Correcting who a spare order is for', text: 'An administrator shall be able to correct the engineer a spare order was raised against while it is still awaiting issue, and shall be prevented from doing so once any part of it has been issued. Every such change shall be retained with both names, the person who made it, the time and the reason.', risk: 'High' },
  { id: 'URS-036', title: 'Reliability and consumption analysis', text: 'Authorised users shall be able to read how often each product fails RELATIVE TO THE NUMBER IN THE FIELD, how it fails, and what spare parts are consumed under each type of cover and in each region, computed from the service record rather than maintained separately.', risk: 'Medium' },
  { id: 'URS-037', title: 'Migrated data is distinguishable from the system\u2019s own record', text: 'Where a stock or service figure is derived partly from records MIGRATED from the superseded system and partly from records this system created, a user shall be able to see how much of the figure comes from each, and to read the figure without the migrated part. Neither reading shall be presented as a correction of the other.', risk: 'High', refs: ['ALCOA+ (Attributable, Original)'] },
  { id: 'URS-038', title: 'Closing a stock period', text: 'An authorised role shall be able to close a stock period, fixing an opening figure per engineer and part that stands for every movement up to that date, so the register need not re-derive settled history. A close shall not change any balance.', risk: 'High' },
  { id: 'URS-039', title: 'Identifier continuity across a migration', text: 'Record identifiers shall remain unique and continue in sequence after historical records carrying their own identifiers are loaded; the system shall not re-issue an identifier the migrated data already uses.', risk: 'High' },
  { id: 'URS-040', title: 'A bulk load shall not silently alter what it does not carry', text: 'Loading a file shall change only the fields that file supplies. A value the file leaves empty shall take the value the system defines for it, and shall not be written as empty or null; a load that cannot honour this shall fail rather than write.', risk: 'High' },
  { id: 'URS-041', title: 'Migrated stock belongs to a person who can hold it', text: 'A stock balance shall be opened only against an active member of the user directory; identifiers appearing in a migrated file that are not people (dealers, customers) shall be excluded before loading, and what is excluded shall be reported.', risk: 'Medium' },
  { id: 'URS-042', title: 'Response within a working time', text: 'A register shall return within a time that allows the work it supports, on the full production data volume and with access rules in force.', risk: 'Medium' },
  { id: 'URS-043', title: 'Decision support', text: 'The system may SUGGEST a controlled value to the person entering it, provided the suggestion is drawn from the record, states its grounds, can be overruled, and is never written without a person choosing it. What was offered and what was accepted shall be retained so the suggestion quality can be reviewed.', risk: 'Medium' },
  { id: 'URS-026', title: 'Preventive-maintenance scheduling', text: 'The monthly preventive-maintenance batch shall be created for a stated due month, retaining the date it was uploaded, and shall support loading earlier months.', risk: 'Medium' },
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
  { id: 'FRS-015', urs: ['URS-010'], title: 'Master maintenance', text: 'Party/Product/Part/User masters and value lists are editable by authorised roles; edits are gated by masters.edit, or per value list by master.<list>.edit / master.<list>.delete, and audit-logged where applicable. A value already in use is deactivated, not deleted.', risk: 'Medium' },
  { id: 'FRS-016', urs: ['URS-011'], title: 'Cover registers', text: 'Warranty (Sale Entry) and Contract (Contract Entry) registers hold the parent record; machines inherit its values unless individually pinned.', risk: 'Medium' },
  { id: 'FRS-017', urs: ['URS-012'], title: 'Feedback capture', text: 'Feedback answers are stored per question and surfaced as columns in the Customer Feedback view, scoped like calls.', risk: 'Low' },
  { id: 'FRS-018', urs: ['URS-013'], title: 'Reports & export gate', text: 'Visit history is retrievable with field filters; CSV export is blocked unless the user holds export.data.', risk: 'Medium' },
  { id: 'FRS-019', urs: ['URS-014'], title: 'SLA engine', text: 'Configurable SLA rules (hours + on/off) are evaluated per open call (first visit, closure, closure-with-spare, closure-spare-non-cover, stores dispatch); the Dashboard flags due/breached.', risk: 'Medium' },
  { id: 'FRS-020', urs: ['URS-015'], title: 'Notification triggers', text: 'Database triggers create a per-user notification when a call is allotted or a requested spare is dispatched; each user reads/marks only their own (RLS).', risk: 'Low' },
  { id: 'FRS-021', urs: ['URS-016'], title: 'Audit log', text: 'ONE TRAIL, as of 0112 (2026-09-05). `audit_log` records what a USER DID \u2014 action, target, duration, outcome, actor and time \u2014 and its retention is configurable (app_settings.audit_retention_days, default ~10 years), with a daily digest archiving the day off-database. Its LIMITS are stated rather than glossed: it is written by the CLIENT, so it can be bypassed by a direct API call, and it is purged when the retention window passes. THE SECOND TRAIL HAS BEEN SWITCHED OFF. `record_audit` recorded what a ROW BECAME, before and after, in SECURITY DEFINER triggers that could not be bypassed and were never purged; it was added for 21 CFR Part 11, which is FDA\u2019s and does not apply here, and stopped at the user\u2019s direction. The TABLE REMAINS, readable by an administrator, holding everything it captured while it ran (2026-08 to 2026-09-05) \u2014 retained, not maintained. Re-attaching the triggers is one statement if a later assessment wants the control back.', risk: 'High' },
  { id: 'FRS-022', urs: ['URS-017'], title: 'Record integrity', text: 'Records are written to PostgreSQL with constraints; the publishable key is public by design and access is enforced by RLS; the service_role key is never shipped.', risk: 'High' },
  { id: 'FRS-023', urs: ['URS-018'], title: 'Backup/restore', text: 'The Supabase project provides managed backups; restore is periodically verified per procedure.', risk: 'Medium' },
  { id: 'FRS-024', urs: ['URS-019'], title: 'Release identity & change log', text: 'Each build carries a version, build number and build ID shown in the footer; an in-app Version History lists changes; source and schema changes are version-controlled.', risk: 'Medium' },
  { id: 'FRS-025', urs: ['URS-020'], title: 'Knowledge base', text: 'A how-to guide plus team field-solution articles (sanitised rich text) are available to all; author or admin edits.', risk: 'Low' },
  { id: 'FRS-026', urs: ['URS-021'], title: 'Partial dispatch', text: 'A stock out records a quantity per requested line in spare_dispatch_lines; spare_request_lines.dispatched_qty accumulates it. The Stores queue shows the outstanding remainder and the line stays queued until fully issued. Issuing more than the remainder is rejected by dispatch_spare_lines().', risk: 'Medium' },
  { id: 'FRS-027', urs: ['URS-022'], title: 'Per-shipment receipt', text: 'receive_spare_shipments() stamps each delivery with who confirmed it and when, accumulating spare_request_lines.received_qty. The line is marked Received (received_at) only when the acknowledged quantity reaches the requested quantity, so a part-delivered line remains at the Stores stage.', risk: 'Medium' },
  { id: 'FRS-028', urs: ['URS-023'], title: 'Reconciliation entry', text: 'Holders of consumption.reconcile (Spare Coordinator, Hotline, Admin) may insert consumption rows flagged source = Reconciliation. UCN (validated against an existing call), engineer, part and reason are mandatory and enforced by a database trigger; the entry records who made it. Parts offered are limited to the engineer\u2019s hand stock.', risk: 'High' },
  { id: 'FRS-029', urs: ['URS-023'], title: 'Quantity adjustment and voiding', text: 'The same role may amend the quantity of an existing consumption line. The original quantity, the reason, and who amended it are retained on the row; the call, part, engineer and source cannot be altered. Setting the quantity to zero voids the line, returning the stock, while the record is retained (hard deletion remains blocked).', risk: 'High' },
  { id: 'FRS-030', urs: ['URS-024'], title: 'Consumption capped at hand stock', text: 'A database trigger rejects any consumption line, reported or reconciled, exceeding the engineer\u2019s hand-stock balance for that part; an increase is checked on the delta. Rows naming no engineer or part are not checked, having no balance to check against.', risk: 'High' },
  { id: 'FRS-031', urs: ['URS-025'], title: 'Call re-open', text: 'An authorised role may re-open a closed call and close it again without inventing a visit; the transition is recorded.', risk: 'Medium' },
  { id: 'FRS-033', urs: ['URS-027'], title: 'Refurbished issue', text: 'Stores may mark a line as refurbished when issuing it. The issue records the recycled identity — R + part code, description unchanged — while the request keeps what was asked for. Hand stock is derived from the ISSUE, so the refurbished part is held and consumed under its own code. A database check refuses the swap unless that code exists in Part Master and is active, and the engineer\u2019s dispatch notification states that the part is refurbished.', risk: 'High' },
  { id: 'FRS-035', urs: ['URS-029'], title: 'Service manual library & call lookup', text: 'Service manuals are catalogued in `documents` against the product they cover and stored in Google Drive. Opening a call lists its Supporting Documents — the manuals matching the call\u2019s product, plus manuals held with no product (general to every machine) — alongside Knowledge Base articles whose title, product or tags match the call\u2019s product or standard complaint. Every signed-in user may read the library; `docs.manage` maintains it.', risk: 'Medium' },
  { id: 'FRS-037', urs: ['URS-031'], title: 'Product & Party Search', text: 'A dedicated screen answers the question from either end. By product: the product list is the distinct set of item names in the PRODUCT REGISTER (view `product_register_names`, security_invoker) with the machine count beside each, and choosing one narrows Serial Number to that product\u2019s serials \u2014 an equality match on `products.item_name`, served by the btree index of 0052, so a product name is never a prefix of another. By party: the party list opens the master and the box beside it takes any part of a name. Both land on one answer \u2014 the party, its recorded details, and every machine held against it. Export is deliberately absent from this screen.', risk: 'Low' },
  { id: 'FRS-038', urs: ['URS-032'], title: 'Bulk re-allotment', text: 'Every call register \u2014 Field, Installation, PM and Pending Calls \u2014 offers selection per row and a header box that takes exactly the rows currently listed, never rows a filter is hiding. The bar that appears edits ONE field, the allotted engineer, chosen from the manager and their reporting sub-tree, and writes every selected call in one action. The choice offered is built from `visible_engineer_names()`, and the write is independently constrained by RLS: a manager cannot allot outside their own team even by direct query.', risk: 'High' },
  { id: 'FRS-039', urs: ['URS-033'], title: 'Multi-level grouping', text: 'Any register built on the shared table component can be grouped by up to three columns at once (for calls: Region, Engineer, Call Status). Groups are formed from the rows the filters have already produced, nest in the order chosen, carry their own counts, and collapse independently; each user\u2019s choice is remembered per screen against their own identity. Region is not held on a call \u2014 it is resolved from the allotted engineer\u2019s User Master row.', risk: 'Low' },
  { id: 'FRS-040', urs: ['URS-034'], title: 'Raising on behalf of a team member', text: 'Where a manager may act for their team, the engineer is a field on the form rather than an assumption: the Spare Request, Call Registration Request and Reporting forms offer the manager and every engineer reporting to them, defaulting to the manager. The record carries the chosen engineer and their address, so it reaches that engineer\u2019s own lists, while `created_by` retains the manager as its author. The list is the same reporting sub-tree the read policies use, so a manager cannot raise for somebody they cannot see.', risk: 'Medium' },
  { id: 'FRS-041', urs: ['URS-035'], title: 'Reassigning a spare order, with a log', text: '`reassign_spare_request()` changes the engineer on a spare request and writes `spare_request_engineer_log` in the same statement, so a change cannot exist without its record or a record without its change. It refuses a non-administrator, and refuses ANY caller once the order has been issued \u2014 tested three ways: the order says dispatched, any of its lines does, or a stock-out line points at one of its lines. A BEFORE UPDATE trigger on the table enforces the dispatch rule again for every path that does not go through the function, including PostgREST and the bulk upload. The reason: hand stock is DERIVED from the request, so after issue the engineer\u2019s name is not a label on a record but the identity of whose parts they are. The log is readable by administrators, approvers, Stores, and both engineers named on the row.', risk: 'High' },
  { id: 'FRS-042', urs: ['URS-036'], title: 'KPI aggregates', text: 'Four database views (0101) compute the analysis: `spare_usage` joins each consumed part to its call for the cover and to the engineer\u2019s User Master row for the region; `spare_usage_rollup` groups it by cover, region and product; `failure_rate_by_product` divides calls in the last 365 days by the machines of that product in the Product Register, giving calls per 100 machines; `failure_modes_by_product` groups calls by standard complaint. All four are security_invoker, so the figures a person reads are computed from exactly the records they may read. The install-base denominator is NOT scoped \u2014 it is a property of the fleet \u2014 so a user without full call visibility sees their own share of a whole-fleet denominator, and the screen states this rather than leaving it to be inferred. A product with no machines on record shows no rate at all instead of a rate divided by a guess.', risk: 'Medium' },
  { id: 'FRS-043', urs: ['URS-037'], title: 'The balance declares its migrated part', text: 'Hand stock is derived from nine arms, three of which are migrated: the opening pools (`ref_type = Opening balance`) and the pre-2026 stock outs and yearly consumption exports (`ref_type = Historical`). `handstock_balance` carries `hist_stock_out`, `hist_consumed`, `hist_net` and `on_hand_live` (0102), so the register shows what the migration contributes per line and can present the balance without it. The identity `on_hand - hist_net = on_hand_live` holds for every row. The whole line is restated when the migrated part is excluded, not only the total, so the components on screen still reconcile. Both figures are labelled; neither is offered as a correction of the other.', risk: 'High' },
  { id: 'FRS-044', urs: ['URS-038'], title: 'Period close', text: '`close_handstock_period(date)` writes an opening figure per engineer and part equal to the net of every movement up to that date, then moves a cut-off (`handstock_cutoff()`) that every arm of the movement view tests. The sum and the arms divide the SAME instant \u2014 the close takes `< cutoff`, the arms `>= cutoff` \u2014 so no movement can fall on both sides. Restricted to an administrator or `consumption.reconcile`; refuses a period that has not ended. A closing figure may be negative, because it must equal exactly what it replaces.', risk: 'High' },
  { id: 'FRS-045', urs: ['URS-039'], title: 'Identifier continuity', text: 'The call-request trigger assigns a REQID from a sequence when the row does not carry one, and when it DOES carry one advances the sequence past it (0097), so loading historical records cannot leave the counter beneath them. `resync_call_req_seq()` repairs a counter already stranded. Identifiers issued out of sequence before the repair are re-lettered rather than renumbered, so a record people have seen keeps its identity while ceasing to collide.', risk: 'High' },
  { id: 'FRS-046', urs: ['URS-040'], title: 'A batch is one shape', text: 'The API writes a batch of rows as ONE insert whose column list is the union of the rows\u2019 keys; a row lacking one of those keys is written as NULL, not as the column default. The loader therefore groups rows by their column set and sends each group separately, so a column no row in the group carries genuinely defaults. Filling absent values in was rejected as a fix: it would defeat a default that carries meaning. A load that violates a NOT NULL constraint fails the batch and writes nothing of it.', risk: 'High' },
  { id: 'FRS-047', urs: ['URS-041'], title: 'Opening stock is an engineer\u2019s', text: 'Both opening-stock registers resolve each row\u2019s name against the ACTIVE user directory before writing, matching on `lower(btrim(name))` \u2014 the same normalisation the balance is keyed on. Rows that do not match are withheld and NAMED before anything is written, so the count approved is the count loaded. An empty directory is refused rather than treated as "nothing matches". `_handstock_opening_engineers.sql` applies the same rule to already-loaded data and reports what it removes.', risk: 'Medium' },
  { id: 'FRS-048', urs: ['URS-042'], title: 'Query response', text: 'Just-in-time compilation is disabled for the database (0099). The planner\u2019s cost estimate for a view carrying row-level-security sub-plans exceeds `jit_above_cost` by several times, so Postgres compiled a query for 3.7 s that then executed in 174 ms \u2014 the more access rules a query carried, the more certain it was to be compiled. Registers page rather than requesting more rows than the API will return, and search is executed by the database rather than over the page already loaded.', risk: 'Medium' },
  { id: 'FRS-049', urs: ['URS-043'], title: 'Standard Complaint suggestion', text: 'Registering a call offers up to three Standard Complaints for the reported problem, each with its grounds. The first source is the REGISTER: `suggest_standard_complaint()` (0104) ranks by what was actually chosen on past calls whose reported problem resembles this one, matched two ways \u2014 whole-string similarity and word similarity, because "O2 sensor faulty" against "Oxygen sensor defective" scores 0.24 on the first and 0.41 on the second. A count of past decisions outranks a resemblance between strings. The second, optional, source is a model (Edge Function `suggest-complaint`) which RE-RANKS those same candidates and cannot return a value outside them, enforced on both sides of the call; it exists for the paraphrase the first source cannot reach. The field is written only by the person choosing, and `complaint_suggestions` records what was offered and what was taken. The function is SECURITY DEFINER so a new engineer is not given the worst suggestions, and returns aggregates only \u2014 a value, a count, a score \u2014 so no call a reader may not see crosses the boundary.', risk: 'Medium' },
  { id: 'FRS-050', urs: ['URS-002'], title: 'A view must not defeat the policies beneath it', text: 'Every view over a table carrying row-level security is created `security_invoker`, so the policies are evaluated for the READER. `create or replace view` does not carry the setting over, and a view running as its owner returns everything with no error and no warning. `npm run check:views` fails on any view over an RLS-protected table that lacks it, and `_status.sql` reports it on a live project; views intentionally readable by every signed-in user are enumerated with their reason.', risk: 'High' },
  { id: 'FRS-036', urs: ['URS-030'], title: 'QMS document control', text: 'QMS documents are held in the same catalogue under kind = qms with document number, revision and effective date, readable by every signed-in user and maintainable only under `qms.manage` — a right distinct from the one governing service manuals, and enforced in the database so a holder of either cannot move a document onto the other shelf. Withdrawal is by RETIRING the row (active = false): it stops being offered while the record of what was in force is retained. Authorship is stamped by the database and is not editable.', risk: 'High' },
  { id: 'FRS-034', urs: ['URS-028'], title: 'Days to dispatch', text: 'spare_stock_out_lines lists every spare issued, one row each, with days_to_dispatch measured from the last approval recorded on the line (NSM where the item needs that review, else Commercial, else RM) to the stock out.', risk: 'Low' },
  { id: 'FRS-032', urs: ['URS-026'], title: 'PM due-month batch', text: 'The PM bulk upload dates every call in a batch to the first of a chosen due month (reg_date), records the upload date as added_on, and sequences a registration date-and-time (reg_at) so the batch holds a stable order. Call numbering is unchanged.', risk: 'Medium' },
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
    'The trail is `audit_log`: user actions with actor, target, duration and outcome, DB-stamped identity and time, admin/audit.view read-only and not user-editable. The database-enforced trail (record_audit) that ran alongside it was STOPPED on 2026-09-05 (0112) \u2014 it existed for 21 CFR Part 11, which does not apply to a CDSCO-regulated operation. Its table is retained and readable, holding what it captured while it ran; nothing is written to it now. The reduction is real and is recorded here rather than left implied: the remaining trail is client-written, so a direct API call bypasses it, and it is purged on the retention window.',
    'A BULK WRITE IS RECORDED AS ONE EVENT, not one row per record (0103): who, which table, how many rows, when. An audit trail answers "who changed this record and to what"; a data load is not that question, and is verified instead by the migration checks (DM1..DM10). The load stays attributable, which is what record control asks of it; what is not kept is a per-record duplicate of data already in the table it was loaded into. The line is drawn by a statement-level trigger counting the rows one statement touched \u2014 and the bulk USER actions reach the typed tables one row at a time through the calls view\u2019s INSTEAD OF triggers, so they are audited in full regardless of the threshold.',
    'Retention is configurable (app_settings.audit_retention_days, default ~10 years) — the earlier 7-day purge is replaced. A daily email digest also archives the day’s audit trail off-database.',
    'Application deletion of quality records is blocked (record-retention guard); only a controlled DBA/superuser action can remove them, and that too is audited. Records are constrained (unique UCN, FKs) in PostgreSQL.',
  ] },
  { area: 'SLA & notifications', points: [
    'sla_rules (hours + active) evaluated by evaluateCallSla() to on-track/due/breach. notifications created by SECURITY DEFINER triggers on allotment and dispatch; RLS scopes to recipient.',
  ] },
  { area: 'Spare issue, receipt and stock control', points: [
    'A stock out is a header (spare_dispatches) plus one row per issued line (spare_dispatch_lines), because a requested line may be issued across several stock outs; the delivery challan prints what that stock out carried, not the line\u2019s full request.',
    'spare_request_lines carries dispatched_qty and received_qty. The Stores queue exposes the outstanding remainder as its quantity, so every consumer counts what is still due. The line leaves the queue only when fully issued, and is marked Received only when fully acknowledged.',
    'Hand stock is derived, never stored: stock issued, less consumption, plus/minus transfers, less returns. Consumption is therefore the control point, and a before-insert trigger caps every consumption line at the engineer\u2019s balance for that part.',
    'Hand stock is derived from what was ISSUED, not what was requested, so a spare sent as a recycled part (R + code, same description) is held and consumed under that code and never merges with new stock. A legacy arm keeps any line marked Dispatched without issue rows in the ledger, so the derivation change moves no existing stock.',
    'Reconciliation rows are ordinary consumption rows flagged source = Reconciliation, so they move stock identically while remaining distinguishable in the register and in reports. Amendments retain the original quantity, the reason and the author ON THE ROW \u2014 which is now the whole of it: record_audit no longer takes an independent before/after image (0112), so the retained fields are the record.',
  ] },
  { area: 'Reading a register: scope, grouping and bulk edit', points: [
    'The shared table component owns selection, filtering and grouping, so every register inherits them identically. A header tick takes the ROWS CURRENTLY LISTED and nothing else \u2014 what a filter is hiding cannot be selected by accident. Grouping nests up to three columns, forms groups from the already-filtered rows, and remembers each user\u2019s choice per screen keyed on their own identity, so one person\u2019s view never becomes another\u2019s.',
    'The engineer chips on the calls and spare registers are the same control as the spare stage chips: a value list with its count, drawn from the rows on screen.',
    'Bulk re-allotment edits one field. The names offered come from `visible_engineer_names()` \u2014 the recursive reporting sub-tree \u2014 and the write is constrained again by RLS, so the list is a convenience and the boundary is the database.',
    'Region is NOT a column on a call. `useRegionByEngineer()` resolves it from the allotted engineer\u2019s User Master row, which is why a call allotted to nobody groups under \u201cno region\u201d rather than under a guess.',
  ] },
  { area: 'Product & Party Search', points: [
    'One screen, asked from either end, landing on one answer: the party, its details and every machine held against it.',
    'The product list is the register\u2019s own \u2014 `product_register_names`, a security_invoker view giving the distinct `item_name` and its machine count \u2014 not the hand-kept master value list, which had been short. Choosing a product narrows Serial Number to that product\u2019s serials and makes the search an EQUALITY match, so \u201cMONNAL T75\u201d cannot return \u201cMONNAL T75 NF\u201d. Equality is served by the btree index of 0052; a trigram index does not serve it.',
    'The screen has no export, deliberately: it answers a question at the desk, and a customer\u2019s installed base is not a file to be carried away.',
  ] },
  { area: 'Acting for a team member', points: [
    'Where a manager may act for their team, the engineer is an explicit field defaulting to the manager, offering the manager plus their reporting sub-tree. The record carries the chosen engineer and their address so it reaches that engineer\u2019s lists; `created_by` retains the manager, so attribution and ownership stay distinct.',
    'Correcting the engineer on a spare order is a separate, narrower right: `reassign_spare_request()` (administrators, before issue) writes the change and `spare_request_engineer_log` together. A BEFORE UPDATE trigger refuses an engineer change on an issued order by ANY path \u2014 the function, PostgREST, a script, the bulk upload. Hand stock is derived from the request, so after issue the name is not a label but whose parts they are; moving it then would move stock between balances with nothing to show for it. A stock transfer is the correct instrument at that point, and it leaves a movement.',
  ] },
  { area: 'Migrated data, and telling it apart', points: [
    'Three of the nine arms of `handstock_movements` are the superseded system\u2019s record, loaded once: the opening pools (`ref_type = Opening balance`), the pre-2026 stock outs and the yearly consumption exports (both `Historical`). They are held in their own tables and never merged into the current ones, so the distinction survives.',
    '`handstock_balance` therefore reports both readings and the split between them, and `on_hand - hist_net = on_hand_live` is an identity of the view, not an assertion of the client. One function restates a line without the migrated part, so the table, the filter chips, the summary tiles and the search results cannot disagree about what "without history" means.',
    'A PERIOD CLOSE fixes an opening figure and moves a cut-off that every arm tests. The close and the arms divide the same instant from opposite sides (`< cutoff`, `>= cutoff`), which is what makes a close provably neutral; an earlier cut that used the closed DATE against `>` counted the closing day on both sides and moved the balance.',
  ] },
  { area: 'Bulk loading', points: [
    'The API renders a batch as ONE insert over the union of the rows\u2019 keys, so a row missing a key is written as NULL rather than taking the column default. Rows are grouped by column set and each group sent separately; a column absent from every row of a group defaults as intended. Filling the gaps with empty values was tried and rejected \u2014 it defeats defaults that carry meaning, which the loader\u2019s own checks caught.',
    'Names in a migrated file are resolved against the ACTIVE user directory before writing, on the same normalisation the target is keyed by, and what is withheld is named before the write is approved. An empty directory is refused rather than read as "nothing matches".',
    'Row references are derived so that re-loading a file corrects rather than duplicates; where a reference proved insufficient the reference was widened rather than the duplicate tolerated.',
  ] },
  { area: 'Response time', points: [
    'JIT compilation is off for the database. The planner\u2019s estimate for a view carrying RLS sub-plans is several times `jit_above_cost`, so the query was compiled for 3.7 s and executed in 174 ms \u2014 and the more access rules a query carried, the more certain that became. Switching RLS off appeared to fix it, which is why the cause took three attempts to find; the JIT block of an execution plan is the first thing to read when a query is slow and its execution time is not.',
    'Registers page rather than asking for more rows than the API returns \u2014 a request for 5,000 was answered with 1,000 and nothing said so. Search is executed by the database, because filtering the page already loaded cannot find what has not been loaded.',
  ] },
  { area: 'Client integrity controls', points: [
    'HTML authored in the Knowledge Base editor is sanitised (allowlist) before storage and render. CSV export is centrally gated. The offline cache is per-table with sync markers and a Force-update that clears caches.',
  ] },
];

// ---- Risk assessment -------------------------------------------------------
export interface RiskRow { id: string; fn: string; failure: string; effect: string; sev: Risk; controls: string; residual: Risk; refs: string[] }
export const RISKS: RiskRow[] = [
  { id: 'R-01', fn: 'Access control (RBAC/RLS)', failure: 'A user sees or edits records outside their authority', effect: 'Loss of confidentiality/integrity of quality records', sev: 'High', controls: 'Server-side RLS keyed on auth.uid(); least-privilege roles; OQ tests FRS-003/004', residual: 'Low', refs: ['FRS-003', 'FRS-004'] },
  { id: 'R-02', fn: 'Audit trail', failure: 'An action is not recorded, or a user alters the trail', effect: 'Non-attributable records; record control under ISO 13485 §4.2.5 not met', sev: 'High', controls: 'DB-stamped identity; admin-only read; no user update; a bulk write is recorded as one attributable event rather than dropped; OQ test FRS-021', residual: 'Low', refs: ['FRS-021'] },
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
  { id: 'R-13', fn: 'Hand-stock integrity', failure: 'More of a spare is recorded as consumed than the engineer holds', effect: 'Negative stock; unreliable stock records and reordering', sev: 'High', controls: 'Before-insert trigger caps every consumption line at the derived balance; the engineer\u2019s picker offers only stock in hand; OQ-15', residual: 'Low', refs: ['FRS-030'] },
  { id: 'R-14', fn: 'Reconciliation of consumption', failure: 'An office user books, amends or voids a consumption entry without authority or without a reason, or alters which call/engineer it belongs to', effect: 'Unattributable adjustment of a quality record; stock and service history misstated', sev: 'High', controls: 'consumption.reconcile permission enforced by RLS; mandatory UCN/engineer/part/reason in a DB trigger; identity fields immutable on amendment; original quantity, reason and author retained on the row; audit_log entry; OQ-16, OQ-17. RAISED FROM LOW ON 2026-09-05: the independent before/after image (record_audit) was withdrawn, so the fields retained on the row are now the only record of an amendment', residual: 'Medium', refs: ['FRS-028', 'FRS-029'] },
  { id: 'R-18', fn: 'Bulk re-allotment', failure: 'A bulk edit writes rows the user did not intend, or allots outside the manager\u2019s team', effect: 'Calls moved to the wrong engineer at scale; work not done', sev: 'High', controls: 'Selection is limited to the rows currently listed, never rows a filter hides; the edit touches one field; the engineer list is the reporting sub-tree and the write is constrained again by RLS; OQ-22', residual: 'Low', refs: ['FRS-038'] },
  { id: 'R-19', fn: 'Spare order reassignment', failure: 'The engineer on a spare order is changed after the parts have been issued', effect: 'Hand stock silently moves from one engineer\u2019s balance to another\u2019s; inventory records cease to reflect what is held', sev: 'High', controls: 'Refused by the function AND by a table trigger, so no path is exempt; three independent tests for issue; every permitted change logged with both names, actor, time and reason; OQ-23', residual: 'Low', refs: ['FRS-041'] },
  { id: 'R-20', fn: 'Acting for a team member', failure: 'A record is raised for an engineer outside the manager\u2019s team, or its authorship is lost', effect: 'Unattributable record; work assigned outside the reporting line', sev: 'Medium', controls: 'The list offered is the reporting sub-tree; created_by retains the author independently of the engineer named; OQ-24', residual: 'Low', refs: ['FRS-040'] },
  { id: 'R-21', fn: 'Migrated vs. created data', failure: 'A figure derived partly from migrated records is read as though the system produced all of it', effect: 'A stock or service figure is trusted, or distrusted, for the wrong reason; a migration fault is invisible in the total', sev: 'High', controls: 'The migrated arms are held separately and never merged; the balance reports the split and both readings, with the identity on_hand - hist_net = on_hand_live holding per row; OQ-30', residual: 'Low', refs: ['FRS-043'] },
  { id: 'R-22', fn: 'Period close', failure: 'Closing a period changes the balance it was meant to preserve', effect: 'Inventory records altered by an administrative action, with no movement to explain it', sev: 'High', controls: 'The close and the arms divide the same instant from opposite sides, so no movement falls on both; verified neutral on production-scale data before release; OQ-31', residual: 'Low', refs: ['FRS-044'] },
  { id: 'R-23', fn: 'Identifier continuity', failure: 'The identifier counter is left beneath identifiers a migration loaded, and re-issues them', effect: 'Two different records carry one identifier; records cannot be uniquely traced', sev: 'High', controls: 'An explicit identifier advances the counter past itself on every write, so a load cannot strand it; a repair function; identifiers already issued out of sequence are re-lettered, not renumbered; OQ-32', residual: 'Low', refs: ['FRS-045'] },
  { id: 'R-24', fn: 'Bulk load', failure: 'A load writes NULL into a column the file did not carry, or writes an empty value over a meaningful default', effect: 'Records silently altered by a load that reported success', sev: 'High', controls: 'Rows are grouped by column set so an absent column defaults; the constraint fails the batch rather than admitting the row; the loader\u2019s checks reject filling gaps with empty values; OQ-33', residual: 'Low', refs: ['FRS-046'] },
  { id: 'R-25', fn: 'Response time', failure: 'A register does not return within a working time on production volume', effect: 'Records effectively inaccessible; work done without them', sev: 'Medium', controls: 'JIT disabled after measurement; paging; server-side search; PQ-05 measures on full volume with access rules in force', residual: 'Low', refs: ['FRS-048'] },
  { id: 'R-26', fn: 'Views and row-level security', failure: 'A view is rebuilt without `security_invoker`, so it reads as its owner and the policies beneath it stop applying', effect: 'Every signed-in user can read every record the view exposes \u2014 silently, with no error, and inherited by any view built on it', sev: 'High', controls: 'check:views fails on any view over an RLS-protected table that lacks the setting; _status.sql reports it on a live project; OQ-35', residual: 'Low', refs: ['FRS-050', 'OQ-35'] },
  { id: 'R-27', fn: 'Decision support', failure: 'A suggested value is written as though a person had chosen it, or a value outside the controlled list is offered', effect: 'A quality record carries a value nobody decided, or one that is not in the master', sev: 'Medium', controls: 'The field is written only by the person choosing; the model re-ranks candidates and cannot return one outside them, enforced in the function AND in the client; what was offered and accepted is retained; OQ-36', residual: 'Low', refs: ['FRS-049', 'OQ-36'] },
  { id: 'R-17', fn: 'Document control', failure: 'An engineer works to a superseded manual, or an uncontrolled QMS document is presented as current', effect: 'Incorrect service performed on a medical device; a quality record produced against a withdrawn instruction', sev: 'High', controls: 'Manuals are catalogued against the product and offered on the call itself rather than sought out; QMS documents carry number, revision and effective date; retiring withdraws a document from use while retaining it; the two shelves are maintained under separate rights enforced in RLS; OQ-21', residual: 'Low', refs: ['FRS-035', 'FRS-036'] },
  { id: 'R-16', fn: 'Refurbished spares', failure: 'A recycled part is issued as though it were new, or under a part number that does not exist', effect: 'Refurbished and new stock indistinguishable; an engineer unaware the part is recycled; stock held against an unorderable code', sev: 'High', controls: 'The issue records the R-code and hand stock is derived from it; Part Master existence + active check refuses the swap otherwise; the engineer\u2019s notification states the part is refurbished; OQ-20', residual: 'Low', refs: ['FRS-033'] },
  { id: 'R-15', fn: 'Partial issue & receipt', failure: 'An outstanding balance is lost, or stock is credited that never arrived', effect: 'Spares appear delivered when they are not; engineer stock overstated', sev: 'Medium', controls: 'Per-stock-out quantities held separately; the line stays queued for its remainder; receipt acknowledged per delivery and completed only in full; OQ-18', residual: 'Low', refs: ['FRS-026', 'FRS-027'] },
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
  { id: 'FM-02', item: 'Audit trail', mode: 'An action is not logged, or the trail is altered', cause: 'Client omits event; user has write on the log', effect: 'Non-attributable records; record control under ISO 13485 §4.2.5 not met', s: 8, o: 3, d: 4, controls: 'DB-stamped identity; admin-only read; no user update; retention purge', action: 'OQ-09 confirms completeness and tamper-resistance', oa: 2, da: 2, refs: ['FRS-021', 'OQ-09'] },
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
  { id: 'FM-15', item: 'Hand-stock integrity', mode: 'Consumption exceeds the quantity held', cause: 'Mis-keyed quantity on a call report; a write path that bypasses the UI', effect: 'Negative balance; unreliable stock and reordering', s: 7, o: 5, d: 4, controls: 'Database trigger caps every consumption line at the derived balance; engineer picker limited to stock in hand', action: 'OQ-15 proves the cap for a reported line and for an increase on amendment', oa: 2, da: 2, refs: ['FRS-030', 'OQ-15'] },
  { id: 'FM-18', item: 'Document control', mode: 'A withdrawn manual or QMS document stays in use, or the wrong product\u2019s manual is opened', cause: 'Documents kept in a shared folder with no product key and no revision state', effect: 'Service performed against the wrong or superseded instruction', s: 8, o: 3, d: 4, controls: 'Catalogued against the product and surfaced on the call; retire (not delete) withdraws it from every call while keeping the record; separate rights per shelf', action: 'OQ-21 covers the call lookup, the general-manual case and the retire behaviour', oa: 2, da: 2, refs: ['FRS-035', 'FRS-036', 'OQ-21'] },
  { id: 'FM-17', item: 'Refurbished issue', mode: 'A recycled spare is issued as new, or under an invented part number', cause: 'Swap recorded only as a label; no check against Part Master', effect: 'Stock identity lost; engineer unaware the part is refurbished', s: 7, o: 3, d: 3, controls: 'Hand stock derived from the issue so the R-code is held separately; Part Master active check; notification states refurbished', action: 'OQ-20 covers the refusal and the separate stock line', oa: 2, da: 2, refs: ['FRS-033', 'OQ-20'] },
  { id: 'FM-19', item: 'Bulk re-allotment', mode: 'More calls are written than were chosen, or calls are allotted outside the manager\u2019s team', cause: 'Selection follows the underlying data rather than the visible rows; the engineer list is a client convenience with no server rule behind it', effect: 'Calls moved wholesale to the wrong engineer; work not done and not noticed', s: 7, o: 2, d: 4, controls: 'A header tick takes exactly the rows currently listed; the bar edits one field; names come from visible_engineer_names() and the write is constrained again by RLS', action: 'OQ-22 selects under an active filter and attempts an out-of-team allotment by direct query', oa: 2, da: 2, refs: ['FRS-038', 'OQ-22'] },
  { id: 'FM-20', item: 'Spare order reassignment', mode: 'The engineer on an issued order is changed, by the screen or round the back of it', cause: 'The rule lives only in the client; hand stock is derived, so nothing visibly breaks at the moment of the change', effect: 'Stock moves between engineers\u2019 balances silently; the register no longer says who holds the parts', s: 8, o: 2, d: 5, controls: 'Refused by the function and again by a BEFORE UPDATE trigger, so PostgREST, a script and the bulk upload obey the same rule; three tests for issue; every permitted change logged with both names, actor, time and reason', action: 'OQ-23 attempts it through the screen, through the function and by writing the table directly', oa: 2, da: 2, refs: ['FRS-041', 'OQ-23'] },
  { id: 'FM-21', item: 'Period close', mode: 'A close moves the balance it exists to preserve', cause: 'The sum and the register divide the boundary differently \u2014 one takes the closing day, the other also takes it', effect: 'Stock changed by an administrative action with no movement behind it, and no error to notice', s: 8, o: 3, d: 5, controls: 'The close takes `< cutoff` and every arm `>= cutoff`, exact complements of one instant; neutrality measured on production-scale data before release', action: 'OQ-31 closes a period and compares the whole balance before and after', oa: 2, da: 2, refs: ['FRS-044', 'OQ-31'] },
  { id: 'FM-22', item: 'Bulk load', mode: 'A load writes NULL into a column its file did not carry', cause: 'The batch is rendered as one insert over the union of the rows\u2019 keys, so a row missing a key is sent as NULL rather than defaulting', effect: 'Records altered by a load that reported success; the error, when it comes, names the first row of the batch rather than the row at fault', s: 7, o: 4, d: 6, controls: 'Rows grouped by column set so each insert has one column list; the NOT NULL constraint fails the batch rather than admitting the row', action: 'OQ-33 loads a file where one row fills a column and the next leaves it empty', oa: 2, da: 2, refs: ['FRS-046', 'OQ-33'] },
  { id: 'FM-23', item: 'Migrated stock', mode: 'A balance is opened against a name that is not a person', cause: 'The migrated file\u2019s name column carries dealers and customers as well as engineers', effect: 'Stock attributed to parties who cannot hold it; the register\u2019s totals cease to mean what they say', s: 5, o: 6, d: 3, controls: 'Names resolved against the ACTIVE directory before writing, on the key\u2019s own normalisation; what is withheld is named before approval; a correction script for data already loaded; a status check that stays green only while it holds', action: 'OQ-34 loads a file containing a dealer name and a former user', oa: 2, da: 1, refs: ['FRS-047', 'OQ-34'] },
  { id: 'FM-16', item: 'Reconciliation entry', mode: 'A consumption entry is booked, amended or voided without authority, without a reason, or is re-pointed at another call or engineer', cause: 'UI-only gating; free-text identity fields left editable', effect: 'Unattributable change to a quality record', s: 8, o: 3, d: 3, controls: 'RLS on consumption.reconcile; mandatory fields and immutable identity enforced in a trigger; original quantity, reason and author retained on the row', action: 'OQ-16 and OQ-17 exercise each refusal and the retained record', oa: 2, da: 3, refs: ['FRS-028', 'FRS-029', 'OQ-16', 'OQ-17'] },
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
  { id: 'OQ-15', phase: 'OQ', reqs: ['FRS-030'], risk: 'High', objective: 'Consumption cannot exceed the engineer\u2019s hand stock.', steps: ['Establish a known hand-stock balance for an engineer and part', 'As the engineer, report consumption greater than the balance', 'Report consumption within the balance', 'As a reconciler, attempt to raise an existing line beyond the remaining balance'], expected: 'The excess report is refused, naming the balance and directing the user to the Spare Coordinator; the valid report is accepted; the excessive increase is refused; the balance never becomes negative.' },
  { id: 'OQ-16', phase: 'OQ', reqs: ['FRS-028'], risk: 'High', objective: 'A reconciliation entry is authorised and complete.', steps: ['As an engineer, attempt to create a consumption row flagged Reconciliation', 'As a Spare Coordinator, open RECO from a call and confirm the UCN, call number and engineer are carried across', 'Submit with a missing reason, then with an unknown UCN, then with a quantity above the engineer\u2019s stock', 'Submit a complete entry for two parts at once'], expected: 'The engineer is refused; the office user\u2019s form is pre-filled from the call; each incomplete or excessive submission is refused with a specific message; the complete entry is stored flagged Reconciliation with the author and reason, and reduces hand stock.' },
  { id: 'OQ-17', phase: 'OQ', reqs: ['FRS-029'], risk: 'High', objective: 'A quantity is amended or voided with the change retained.', steps: ['Amend the quantity of a reported line, supplying a reason', 'Attempt the same amendment without a reason', 'Attempt to change the call, part, engineer or source on the line', 'Set a line\u2019s quantity to zero with a reason', 'Attempt to delete a consumption row'], expected: 'The amendment is accepted and the line retains the original quantity, the reason and the author; the reason-less amendment and every identity change are refused; the zeroed line is retained, marked as voided, and the stock returns to the engineer; deletion is refused. The audit trail holds the before and after image of each change.' },
  { id: 'OQ-18', phase: 'OQ', reqs: ['FRS-026', 'FRS-027'], risk: 'Medium', objective: 'Partial issue and acknowledged receipt.', steps: ['Request two units of a spare and approve it to Stores', 'Issue one unit', 'Acknowledge that delivery as the engineer', 'Issue the remaining unit and acknowledge it'], expected: 'The stock out and delivery challan show one unit; the line remains queued for the remaining unit; hand stock rises by one; the line stays at the Stores stage until fully issued and is marked Received only after the final acknowledgement; hand stock totals two, never four.' },
  { id: 'OQ-19', phase: 'OQ', reqs: ['FRS-031', 'FRS-032'], risk: 'Medium', objective: 'Call re-opening and the preventive-maintenance batch.', steps: ['Re-open a closed call, then close it again without recording a visit', 'Upload a PM batch for a stated due month, including a past month'], expected: 'The re-open and subsequent closure are recorded without creating a visit; every call in the batch is dated the first of the chosen month, carries the upload date, and holds a stable order; call numbering is unchanged.' },
  { id: 'OQ-21', phase: 'OQ', reqs: ['FRS-035', 'FRS-036'], risk: 'High', objective: 'The right document reaches the point of work, and a withdrawn one does not.', steps: ['Add a service manual against one product, and a second with the product left blank', 'Open a call for that product, and a call for a different product', 'Tag a Knowledge Base article with the product, then re-open the call', 'Retire the product manual and re-open the call', 'As a user holding only docs.manage, attempt to add a QMS document; as one holding only qms.manage, attempt to add a service manual'], expected: 'The product call lists both its own manual and the general one; the other call lists the general one only; the tagged article appears alongside them; the retired manual disappears from the call while remaining on the shelf marked retired; both cross-shelf attempts are refused by the database.' },
  { id: 'OQ-20', phase: 'OQ', reqs: ['FRS-033', 'FRS-034'], risk: 'High', objective: 'Refurbished spares are identified, controlled and counted separately.', steps: ['Mark a line refurbished where the R-part is absent from Part Master, then where it is present but inactive', 'Add the R-part as active and issue one unit refurbished, and the balance as new', 'Read the engineer\u2019s hand stock and their consumption picker', 'Read the stock-out list'], expected: 'Both invalid attempts are refused, naming the part code to add; the issue records the R-code with the description unchanged while the request is unaltered; hand stock shows the original and the R-part as separate lines, both offered for consumption; the stock-out list shows the refurbished flag and the days taken from the last approval.' },
  { id: 'OQ-22', phase: 'OQ', reqs: ['FRS-038', 'FRS-039'], risk: 'High', objective: 'Bulk re-allotment moves exactly what was chosen, and only within the team.', steps: ['As a reporting manager, open the Field Call Register and apply a filter so some calls are hidden', 'Repeat the exercise on Pending Calls, whose calls span Field, Installation and PM', 'Tick the header box and confirm the count selected', 'Group the register by Region, then Engineer, then Call Status, and confirm the counts add up to the filtered total', 'Allot the selected calls to an engineer in the team and save', 'Attempt, by direct query, to allot a call to an engineer outside the reporting sub-tree'], expected: 'The header tick selects only the rows listed \u2014 hidden rows are untouched; grouping nests in the order chosen and its counts reconcile; the selected calls move together and nothing but the allotted engineer changes on them; the out-of-team write is rejected by the database, not merely absent from the list.' },
  { id: 'OQ-23', phase: 'OQ', reqs: ['FRS-041'], risk: 'High', objective: 'A spare order can be corrected before issue and not after, by any route.', steps: ['As an administrator, change the engineer on a spare order still awaiting issue, giving a reason', 'Read the change log on the order, and read it again as the engineer it was taken off', 'Issue a second order to an engineer, then attempt the same change through the screen', 'Attempt it again by calling the function directly, and once more by updating the table directly', 'As a non-administrator, attempt the change on an order still awaiting issue'], expected: 'The change succeeds before issue and is logged with both names, the actor, the time and the reason; the engineer it was taken off can read it; after issue every route is refused \u2014 the screen, the function and a direct table write \u2014 with a message naming the order; the non-administrator is refused.' },
  { id: 'OQ-24', phase: 'OQ', reqs: ['FRS-040'], risk: 'Medium', objective: 'A manager may act for their team, and only their team.', steps: ['As a reporting manager, raise a spare request naming an engineer who reports to them', 'Sign in as that engineer and confirm the request is in their list', 'Inspect the record\u2019s author', 'Attempt, by direct query, to raise a request naming an engineer outside the reporting sub-tree'], expected: 'The request is attributed to the named engineer and reaches their lists; created_by retains the manager as its author; the out-of-team attempt is rejected by the database.' },
  { id: 'OQ-25', phase: 'OQ', reqs: ['FRS-037'], risk: 'Low', objective: 'Product & Party Search identifies a machine and a customer\u2019s machines.', steps: ['Open Product & Party Search and open the product list', 'Choose a product whose name is the beginning of another product\u2019s name, and open the serial list', 'Search on that product and serial', 'Switch to By party, choose a party, and read the machines listed'], expected: 'The product list is the register\u2019s own, each name with its machine count; the serial list holds only that product\u2019s serials; the search returns that machine and its customer and does NOT return machines of the longer-named product; the party shows its recorded details and every machine held against it; no export is offered.' },
  { id: 'OQ-26', phase: 'OQ', reqs: ['FRS-015'], risk: 'Medium', objective: 'Master data is maintained under control.', steps: ['As a role without masters.edit, attempt to edit a party and a value list', 'As an authorised role, edit a party and add a value to a list', 'Attempt to delete a value that is in use on existing records', 'Read the audit trail for the edits made'], expected: 'The unauthorised edits are refused by the database, not only hidden; the authorised edits succeed; a value in use is deactivated rather than deleted, so the records that carry it still read correctly; each edit appears in the audit trail with actor and time.' },
  { id: 'OQ-27', phase: 'OQ', reqs: ['FRS-016'], risk: 'Medium', objective: 'Warranty and contract cover reaches the machine and the call.', steps: ['Create a Sale Entry covering a machine and a Contract Entry covering another', 'Open each machine in Product Master and read its cover', 'Pin a different contract end date on one machine individually', 'Register a call on each machine and read the cover shown'], expected: 'Each machine inherits its parent record\u2019s cover; the individually pinned value overrides the inherited one and is not overwritten by it; the call shows the cover in force for that machine.' },
  { id: 'OQ-28', phase: 'OQ', reqs: ['FRS-017'], risk: 'Low', objective: 'Customer feedback is captured per question and scoped like the call.', steps: ['Record feedback on a call, answering each question', 'Open Customer Feedback and read the answers as columns', 'As an engineer with no right to that call, attempt to read its feedback'], expected: 'Every answer is retained against its own question and shown in its own column; the feedback is visible to exactly those who may see the call it belongs to.' },
  { id: 'OQ-29', phase: 'OQ', reqs: ['FRS-042'], risk: 'Medium', objective: 'The KPIs are computed from the record and scoped like it.', steps: ['Note the machine count of one product in the Product Register and the calls raised on it in the last twelve months', 'Open KPI & Failure Analysis as a user with full visibility and compare the rate shown for that product', 'Record a spare consumption against a call under each of warranty, CMC, AMC and OGP, and re-read the spare-use figures', 'Open the same screen as an engineer with no right to other engineers\u2019 calls', 'Find a product held in no call and a product held in no Product Register row'], expected: 'The rate equals calls in twelve months divided by machines, times one hundred; each consumption appears under the cover of the call it was fitted to and the region of the engineer who fitted it; the engineer sees only their own calls in the numerator against the fleet-wide denominator, and the screen says so; a product with no machines on record shows no rate rather than a computed one.' },
  { id: 'OQ-30', phase: 'OQ', reqs: ['FRS-043'], risk: 'High', objective: 'The balance declares how much of itself was migrated.', steps: ['Choose an engineer and part with both migrated and system-created movements', 'Read the line: the total, the migrated figure, and the components', 'Switch the register to exclude the migrated record and read the same line', 'Confirm across the whole register that total minus migrated equals the figure without it'], expected: 'The migrated contribution is stated per line; excluding it restates the components as well as the total, so the arithmetic on screen reconciles; the identity holds for every row, not only the one examined; both readings are labelled and neither is presented as a correction.' },
  { id: 'OQ-31', phase: 'OQ', reqs: ['FRS-044'], risk: 'High', objective: 'Closing a period changes nothing.', steps: ['Record the whole balance \u2014 lines and total parts \u2014 before the close', 'Close a period that has ended', 'Record the balance again, and the number of movements the register now reads', 'Attempt a close as a role without the right, and a close of a period that has not ended'], expected: 'The balance is identical before and after, line for line and part for part, while the movements read fall to those after the cut-off; a movement dated ON the closing day is counted once, not twice; both unauthorised attempts are refused.' },
  { id: 'OQ-32', phase: 'OQ', reqs: ['FRS-045'], risk: 'High', objective: 'Identifiers continue across a migration.', steps: ['Load a batch of historical records carrying their own identifiers', 'Raise a new record in the application and read the identifier assigned', 'Inspect any identifier issued out of sequence before the repair'], expected: 'The new identifier follows the highest loaded one rather than restarting; no identifier is issued twice; those issued out of sequence are distinguishable rather than renumbered, so a record already seen keeps its identity.' },
  { id: 'OQ-33', phase: 'OQ', reqs: ['FRS-046'], risk: 'High', objective: 'A load changes only what its file carries.', steps: ['Prepare a file in which one row fills an optional column and the next leaves it empty, where that column is NOT NULL with a default', 'Load it', 'Read both rows', 'Repeat with a column carrying a meaningful default (a status) left empty throughout'], expected: 'Both rows load; the row that left the column empty carries the column\u2019s default, not an empty value and not null; the status column defaults rather than storing blanks; nothing outside the file\u2019s columns is altered.' },
  { id: 'OQ-34', phase: 'OQ', reqs: ['FRS-047'], risk: 'Medium', objective: 'Migrated stock is opened only against an active user.', steps: ['Load an opening-stock file containing an engineer, a name that is not a person, and a user who has left', 'Read what the loader reports before writing, and the count it asks to be approved', 'Read the register afterwards', 'Attempt the same load against an empty user directory'], expected: 'Only the active engineer\u2019s rows are written; the withheld names are listed BEFORE the write and the count approved is the count loaded; a name differing only in case or spacing still matches; the empty-directory load is refused rather than withholding everything.' },
  { id: 'PQ-05', phase: 'PQ', reqs: ['FRS-048'], risk: 'Medium', objective: 'The registers return within a working time on production volume.', steps: ['On the full production data, with access rules in force and as an ordinary user, open each register and record the time to first render', 'Read the execution plan of the slowest, including its JIT block', 'Page a register beyond its first page and search for a record that has not been loaded'], expected: 'Each register returns within the time its work allows; time spent compiling is not a material part of any measurement; paging returns further records and the search finds a record outside the loaded page.' },
  { id: 'OQ-35', phase: 'OQ', reqs: ['FRS-050'], risk: 'High', objective: 'A view does not defeat the policies beneath it.', steps: ['As a user entitled to see only their own calls, count the calls visible in the typed table and in the `calls` view', 'Repeat for every view built on it (pending calls, call state, the KPI views)', 'Run the view check against the database'], expected: 'The counts agree: the view shows exactly what the table shows that user, and so does every view built on it. The check reports no view over an RLS-protected table lacking security_invoker, and any listed as open by design carries a stated reason.' },
  { id: 'OQ-36', phase: 'OQ', reqs: ['FRS-049'], risk: 'Medium', objective: 'A suggestion advises; it does not decide.', steps: ['Register a call, typing a reported problem that past calls have used, and read the suggestions and their stated grounds', 'Accept one, and confirm the value stored is the one shown', 'Register another, ignore the suggestions and choose a different complaint', 'As an engineer entitled to none of the past calls, confirm the same suggestions are offered', 'Attempt, by calling the suggestion service directly, to have it return a complaint that is not in the master', 'Read the offered/accepted log'], expected: 'Suggestions state why each is offered; nothing is written until a person chooses; ignoring them is recorded as such; the engineer gets the same suggestions without gaining access to the calls behind them; a value outside the candidate list is discarded rather than offered; the log shows what was offered, what was taken, and at which rank.' },
  { id: 'PQ-04', phase: 'PQ', reqs: ['URS-021', 'URS-022', 'URS-023', 'URS-024'], risk: 'High', objective: 'The spare lifecycle works for the people who run it.', steps: ['Stores issues a part quantity against a real request and completes it on a later stock out', 'The engineer confirms each delivery', 'A spare fitted but not reported is booked by the Spare Coordinator against the call', 'A quantity reported in error is corrected and an entry made in error is voided'], expected: 'Stores, engineers and the Spare Coordinator complete each task unaided; stock balances agree with physical stock at the end of the exercise; every correction is traceable to a person, a time and a reason.' },
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
  { heading: '8. Approval', body: ['Approved by System Owner, Process Owner (Quality), and QA/Validation Lead (wet signature, or an electronic signature under the Information Technology Act, 2000), with dates.'] },
];

// ---- Data Migration Validation --------------------------------------------
export const DATA_MIGRATION = {
  objective: 'Demonstrate that data migrated into RITHI CRM (legacy Google-Sheet / AppSheet exports, and bulk uploads such as the monthly PM batch) is complete, accurate and uncorrupted.',
  method: [
    'Identify each source (sheet/tab or export file) and its target table; record row counts at source and after load.',
    'Reconcile counts and key fields; verify identifiers (UCN, Call Number, OR No) are assigned and unique; confirm dates parsed correctly.',
    'Spot-check a risk-based sample of records field-by-field against the source; verify no truncation or encoding loss.',
    'Confirm de-duplication behaved as intended and that a re-run of an import does not duplicate already-loaded rows.',
    'Confirm the load wrote only the columns its file carries: a column the file leaves empty must hold the value the system defines for it, not an empty value and not null.',
    'Confirm identifiers the migrated data carries have advanced the system\u2019s own counters, so that no identifier is later re-issued.',
    'Confirm migrated records remain DISTINGUISHABLE from records the system creates, and that any figure derived from both reports the split.',
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
    { id: 'DM7', check: 'Column-level fidelity verified: a column the file left empty carries its defined default, not null.' },
    { id: 'DM8', check: 'Identifier counters verified to stand above every migrated identifier.' },
    { id: 'DM9', check: 'Migrated records remain distinguishable from system-created ones; derived figures report the split.' },
    { id: 'DM10', check: 'Identities in the source that are not valid subjects (e.g. dealers in an engineer column) excluded before load, and the exclusions reported and retained.' },
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
    { area: 'Audit & integrity', control: 'Application deletion of quality records blocked (0049); configurable long audit retention; off-database daily audit archive by email. The database-enforced trail (record_audit) was stopped on 2026-09-05 \u2014 see FRS-021; its table is retained.' },
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
  { principle: 'Attributable', howMet: 'Every record carries the identity the database stamped on it (created_by / actor), and user actions are attributed in audit_log. NOTE: the row-level before/after trail was withdrawn on 2026-09-05 (FRS-021), so attribution of a CHANGE rests on the fields the row itself retains.' },
  { principle: 'Legible', howMet: 'Records are readable on screen and exportable (CSV); audit entries are structured.' },
  { principle: 'Contemporaneous', howMet: 'Timestamps are set by the database at the time of the action (server time).' },
  { principle: 'Original', howMet: 'The PostgreSQL row is the original record. The before/after image that preserved its prior state was withdrawn on 2026-09-05 (FRS-021); where a prior value matters — an amended or voided consumption line — the row retains it explicitly.' },
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
  { item: 'Service manuals', where: 'documents (kind = service_manual); files in Google Drive', controlled: 'docs.manage; keyed to the product they cover; superseded manuals retired, not deleted.' },
  { item: 'QMS documents', where: 'documents (kind = qms); files in Google Drive', controlled: 'qms.manage; document number, revision and effective date recorded; withdrawal is by retiring the row.' },
  { item: 'Master value lists', where: 'master_lists / masters', controlled: 'masters.edit, or per list master.<list>.edit / .delete; seeded from the approved master workbook; a used value is deactivated, not deleted.' },
  { item: 'Audit retention period', where: 'app_settings.audit_retention_days', controlled: 'Config.manage; default 3650 days; set per the retention SOP.' },
  { item: 'Reporting tree (visibility)', where: 'user_directory (reporting/regional manager)', controlled: 'Admin; drives call/spare/stock scoping.' },
  { item: 'Release identity', where: 'version / build number / build ID (footer)', controlled: 'CI build; recorded at IQ.' },
  { item: 'Database schema bundles', where: 'supabase/apply/*.sql, generated from the numbered migrations', controlled: 'Generated, never hand-edited. A bundle must carry the LATEST definition of every object it defines: the bundles are replayed one at a time, so re-running an earlier bundle would otherwise revert an object a later one redefined \u2014 silently, and reporting success. An automated check reports any object defined in two bundles; the known exceptions are enumerated in it and the list may only shrink. Until they are resolved, a single bundle is not the instrument for repairing a live system: apply the whole set.' },
  { item: 'Applied-state verification', where: 'supabase/apply/_status.sql (read-only)', controlled: 'Run before diagnosing anything. It tests for the OBJECT, not the migration number, so a migration applied and later overwritten reports as absent \u2014 which is what it is. The change record is a record, not evidence.' },
  { item: 'Query planner: JIT', where: 'database setting (jit = off)', controlled: 'Set deliberately after measurement; see FRS-048. Reverting it re-introduces multi-second compilation on access-controlled views.' },
  { item: 'Stock period cut-off', where: 'handstock_period.closed_through', controlled: 'Administrator or consumption.reconcile, via close_handstock_period(); a close is provably neutral and is recorded with actor and time.' },
];

// ---- Required SOPs / procedures --------------------------------------------
export const SOPS: { id: string; title: string; purpose: string }[] = [
  { id: 'SOP-01', title: 'System use & data entry', purpose: 'How to register calls, report visits, request/approve spares, and the meaning of statuses.' },
  { id: 'SOP-02', title: 'Access management', purpose: 'Requesting, granting, reviewing and revoking access; leaver deactivation; periodic access review.' },
  { id: 'SOP-03', title: 'Change control', purpose: 'How changes are requested, risk-assessed, tested (regression), approved and released; release identification.' },
  { id: 'SOP-04', title: 'Backup & restore', purpose: 'Backup verification and the restore procedure with RPO/RTO.' },
  { id: 'SOP-05', title: 'Audit-trail review', purpose: 'Periodic review of the audit trail and handling of anomalies.' },
  { id: 'SOP-06', title: 'Data migration & bulk import', purpose: 'Controls and verification for imports (incl. the monthly PM batch): row-count reconciliation, column-level fidelity, identifier continuity, exclusion of identities that are not valid subjects, and keeping migrated records distinguishable from those the system creates.' },
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

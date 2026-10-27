// ===========================================================================
// THE VALIDATION DOCUMENT IN THE OLD TEMPLATE'S SECTIONS (the user,
// 2026-10-27, with "SoftwareValidationRIthiXJ31jan2023.docx": "This is
// Validation Document of the Old Setup in AppSheet. Now we need to update this
// - I understand our Validation Package is extensive, but it should match with
// the Template, Sections as per this one"; asked: "Template sections,
// summarised", sign-off left blank, "Word + in-app page").
//
// Template DVP_FO_51 (R/QMS/SV/13) is ordered by PROCESS, not by screen, so
// this file is the one place that says which screens make up each process.
// Every row of the document is then COMPUTED from the package -- the
// requirements filed under those screens (the same modulesFor() REQUIREMENTS.md
// uses, so the two cannot disagree), the tests proving them and the risks
// citing them -- rather than written a second time. `unassignedScreens()` must
// be empty: a screen in no process is a screen the document would silently
// leave out, and the generator refuses to build while one exists.
// ===========================================================================
import { MODULES } from './rbac';
import { URS, FRS, TESTS, RISKS, NON_AUDITABLE, type Req, type RiskRow, type TestCase } from './validation';
import { modulesFor, modulesNamedBy } from './requirements';

export interface DocProcess {
  /** The template's own numbering: 1 Order processing ... 7 Customer feedback, then RITHI v2's. */
  id: string;
  name: string;
  paths: string[];
  /** Who performs it, in the template's words where it had them. */
  responsibility: string;
  /** The check plan, one line per activity, as the template lists them. */
  checks: string[];
  /** Words that file a risk here when its references name no screen. */
  keywords: string[];
}

export const DOC_PROCESSES: DocProcess[] = [
  { id: '1', name: 'Order processing – Spare request', responsibility: 'Service engineer · Reporting Manager · Commercial · NSM',
    paths: ['/spare-requests', '/spare-rm-approval'],
    checks: ['Ability to place a request for spares from engineers, against a call or for hand stock', 'Line-by-line approval by the Reporting Manager, Commercial and NSM as the cover requires', 'Re-assignment of a request before it is issued, with a log'],
    keywords: ['spare request', 'approval', 'commercial', 'nsm', 'rm approval', ' or number'] },
  { id: '2', name: 'Stock maintenance for service spare parts', responsibility: 'Service Stores · Spare Coordinator · Service engineer',
    paths: ['/spare-dispatch', '/stock-out', '/handstock', '/handstock-report', '/stock-transfer', '/mrn', '/spare-consumption', '/parts', '/part-search'],
    checks: ['Stock out by stores to the corresponding engineers, with the Delivery Challan', 'Acknowledged receipt per delivery', 'Hand stock derived from issues, consumption, transfers and returns', 'Consumption booked against a visit; reconciliation and voiding'],
    keywords: ['stock', 'dispatch', 'consumption', 'transfer', 'material return', 'mrn', 'challan', 'part master', 'part '] },
  { id: '3', name: 'Sales – Warranty and Non-warranty', responsibility: 'Service admin · Commercial',
    paths: ['/warranties', '/product-database', '/product-database-2', '/product-master', '/ownership-transfer', '/lookup', '/machine-history'],
    checks: ['Product sale entry with its warranty', 'The Product Database names the party of the latest sale entry or ownership transfer', 'Ownership transfer of a machine'],
    keywords: ['sale', 'warranty', 'product database', 'ownership', 'machine', 'cover', 'install base'] },
  { id: '4', name: 'Annual Maintenance Contracts', responsibility: 'Service admin · Commercial',
    paths: ['/contracts'],
    checks: ['Contract entry, renewal and PM visit count'],
    keywords: ['contract', 'amc', 'cmc'] },
  { id: '5', name: 'Complaint handling', responsibility: 'Hotline · Customer Support Manager · Service engineer',
    paths: ['/request-registration', '/pending-registrations', '/field-calls', '/pending-calls', '/daily-review', '/call-review', '/reports', '/report-mapping', '/failure-report', '/product-failure', '/missing-visit-reports'],
    checks: ['Breakdown call registration (from a call request, or directly)', 'Daily complaint review stage 1', 'Call allocation', 'Daily complaint review stage 2', 'Visit work details entry', 'Service report entry with spares used', 'Service manual report upload', 'Daily complaint review stage 3', 'Field Failure Report raised from a review'],
    keywords: ['call', 'review', 'complaint', 'visit', 'report', 'ffr', 'failure', 'registration', 'allocat', 'ucn', 'dccr'] },
  { id: '6', name: 'Installation & Preventive maintenance', responsibility: 'Service admin · Hotline · Service engineer',
    paths: ['/installations', '/pm-calls', '/pm-bulk-upload', '/pm-due', '/install-calls-unmapped'],
    checks: ['Installation call generation', 'PM call generation (bulk and PM Due)', 'Installation & PM call visit details and closure report'],
    keywords: ['installation', 'pm ', 'preventive', 'pm due'] },
  { id: '7', name: 'Customer feedback', responsibility: 'Service engineer',
    paths: ['/feedback', '/feedback-without-report', '/exports/feedback'],
    checks: ['Collection of feedback'],
    keywords: ['feedback'] },
  { id: '8', name: 'Indoor service (workshop)', responsibility: 'Service engineer (workshop) · QC',
    paths: ['/indoor', '/indoor/recycling', '/indoor/pdqc'],
    checks: ['Intake, cleaning, work, quality check and release of equipment in the workshop', 'Pre-Delivery Testing and recycled spares'],
    keywords: ['indoor', 'workshop', 'pdt', 'pre-delivery', 'recycl', 'refurb'] },
  { id: '9', name: 'Masters, users and access', responsibility: 'Administrator · Service admin',
    paths: ['/parties', '/user-master', '/new-employee-requests', '/masters', '/roles', '/admin-config', '/sla-objective-config', '/settings', '/device-cache'],
    checks: ['Party, user and master-list maintenance', 'Roles & permissions; a login only for a person on the User Master', 'Signatures, held for and placed by their owner'],
    keywords: ['user', 'role', 'permission', 'login', 'master', 'party', 'password', 'signature', 'profile'] },
  { id: '10', name: 'Training and controlled documents', responsibility: 'VP Technical · Engineer R&D and QMS',
    paths: ['/training', '/qms', '/service-manuals', '/service-manuals/notes', '/knowledge-base/how-it-works'],
    checks: ['Training assignment, sessions and Training Form R/HR/11', 'QMS documents and service manuals'],
    keywords: ['training', 'document', 'qms', 'manual', 'knowledge'] },
  { id: '11', name: 'Reports, KPI and quality objectives', responsibility: 'NSM · Customer Support Manager',
    paths: ['/', '/workload', '/kpi', '/objective', '/spare-insights', '/tracker', '/bulk-uploads', '/data-export', '/exports', '/exports/consumption', '/exports/kpi', '/exports/unused', '/exports/calls', '/exports/stores-dispatch'],
    checks: ['KPI, objectives and dashboards computed by the database', 'Reports and exports', 'Bulk uploads of historical data'],
    keywords: ['kpi', 'objective', 'dashboard', 'export', 'insight', 'tracker', 'upload', 'import'] },
  { id: '12', name: 'Data storage, audit and security', responsibility: 'Administrator · QA',
    paths: ['/audit', '/software-validation', '/version-history'],
    checks: ['Audit log and record retention; quality records never deleted', 'Row-level security; nobody signed out or unknown holds anything (security scan)', 'Backups and validation records'],
    keywords: [] },
];

/** Screens no process names -- must be empty; the generator refuses otherwise. */
export function unassignedScreens(): string[] {
  const named = new Set(DOC_PROCESSES.flatMap((p) => p.paths));
  return MODULES.map((m) => m.path).filter((p) => p && !named.has(p));
}

const processOfPath = new Map(DOC_PROCESSES.flatMap((p) => p.paths.map((path) => [path, p.id] as const)));
const reqById = new Map<string, Req>([...URS, ...FRS, ...NON_AUDITABLE].map((r) => [r.id, r]));
const testById = new Map(TESTS.map((t) => [t.id, t]));

/** The processes a requirement belongs to, by the screens it is filed under. */
function processesOfReq(r: Req): string[] {
  return [...new Set(modulesFor(r).map((f) => processOfPath.get(f.path)).filter((x): x is string => !!x))];
}

export interface ProcessCoverage {
  process: DocProcess;
  urs: Req[];
  frs: Req[];
  tests: TestCase[];
  risks: RiskRow[];
}

/** Which process a risk belongs to: the screens its cited requirements and
 *  tests are filed under, else the screens its own words name, else the
 *  keywords, else Data storage, audit and security. ONE process per risk, so
 *  the risk table counts each once. */
export function processOfRisk(r: RiskRow): string {
  const votes = new Map<string, number>();
  const vote = (ids: string[]) => ids.forEach((id) => votes.set(id, (votes.get(id) ?? 0) + 1));
  for (const ref of r.refs) {
    const req = reqById.get(ref);
    if (req) vote(processesOfReq(req));
    const t = testById.get(ref);
    if (t) t.reqs.forEach((q) => { const rq = reqById.get(q); if (rq) vote(processesOfReq(rq)); });
  }
  if (votes.size) return [...votes.entries()].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0][0];
  const named = modulesNamedBy(`${r.fn} ${r.failure}`).map((p) => processOfPath.get(p)).filter((x): x is string => !!x);
  if (named.length) return named[0];
  const text = ` ${r.fn} ${r.failure} `.toLowerCase();
  const hit = DOC_PROCESSES.find((p) => p.keywords.some((k) => text.includes(k)));
  return hit ? hit.id : '12';
}

export function coverage(): ProcessCoverage[] {
  return DOC_PROCESSES.map((process) => {
    const urs = URS.filter((r) => processesOfReq(r).includes(process.id));
    const frs = FRS.filter((r) => processesOfReq(r).includes(process.id) || r.urs.some((u) => urs.some((x) => x.id === u)));
    const ids = new Set([...urs, ...frs].map((r) => r.id));
    const tests = TESTS.filter((t) => t.reqs.some((q) => ids.has(q)));
    const risks = RISKS.filter((r) => processOfRisk(r) === process.id);
    return { process, urs, frs, tests, risks };
  });
}

/** "URS-003, URS-014 … (+12 more)" -- a summarised row names its evidence without listing all of it. */
export function idList(ids: string[], max = 8): string {
  const u = [...new Set(ids)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return u.length <= max ? u.join(', ') : `${u.slice(0, max).join(', ')} … (+${u.length - max} more)`;
}

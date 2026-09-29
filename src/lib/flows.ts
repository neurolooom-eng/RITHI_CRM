// ---------------------------------------------------------------------------
// DATA FLOWS — how a record moves from one screen to the next.
//
// The user, 2026-09-30: "I want to be able to add Flow charts … visually
// present how the Data flows. For Example, when a Field call is registered 1
// flow is Calls, Spare, Closure, Consumption, Feedback. Other flow is — Daily
// Review -> FFR -> Objective." And, asked how: DEFINED WITH THE VALIDATION —
// each flow is data here, each step names the screen it happens on and the
// requirement and test IDs that govern it, and the diagram is DRAWN from that.
// Shown in Software Validation (Data Flows) and in How RITHI Functions.
//
// WHY DATA AND NOT A PICTURE. A drawn diagram is one more copy of the truth
// that goes stale without anybody noticing; this one is checked. `check:ui`
// fails when a step names a route that is not a screen, a requirement or test
// that does not exist, or an arrow to a step that is not there — the same
// argument as the generated REQUIREMENTS.md: a description that is WRONG is
// worse than none, and one that cannot drift is the only kind worth keeping.
//
// TO ADD A FLOW: append to FLOWS. Give every step an `id`, its `route` (a
// MODULES path) where it happens on a screen, and the `reqs` that state it.
// Arrows run left to right in the order of the process; one that goes BACK
// (a re-open, a correction) is marked `loop: true` and drawn underneath.
// Nothing else is needed — the layout is computed.
// ---------------------------------------------------------------------------

export type FlowArea = 'call' | 'spare' | 'stock' | 'quality' | 'cover' | 'master' | 'report';

export interface FlowStep {
  id: string;
  /** What happens, in the user's words — the box's title. */
  label: string;
  /** The screen it happens on (a MODULES path), where it happens on one. */
  route?: string;
  area: FlowArea;
  /** One or two sentences: what the step does and what it refuses. */
  detail: string;
  /** The records it writes or reads — table or view names. */
  records?: string[];
  /** URS / FRS / test / CR / SR / CW IDs that state this step. */
  reqs: string[];
  /** Done by the database or a schedule rather than a person. */
  automatic?: boolean;
}

export interface FlowEdge {
  from: string;
  to: string;
  /** What moves along the arrow — the key or record it carries. */
  label?: string;
  /** An arrow BACK to an earlier step. Drawn underneath, and ignored when
   *  the layout ranks the steps, so a re-open cannot make the flow a knot. */
  loop?: boolean;
  /** Happens only sometimes (an MRN, a re-open). Drawn dashed. */
  optional?: boolean;
}

export interface Flow {
  id: string;
  title: string;
  /** Why this flow matters, in a sentence or two. */
  purpose: string;
  steps: FlowStep[];
  edges: FlowEdge[];
}

// ---- layout ----------------------------------------------------------------
//
// LAYERED, LEFT TO RIGHT: a step's column is the longest chain of forward
// arrows leading to it, so every forward arrow points right and parallel
// branches share a column. Pure and deterministic, so `check:ui` can test it
// without a browser.

export const NODE_W = 184;
const GAP_X = 64;
const GAP_Y = 22;
const PAD = 16;
const LINE_H = 15;
const CHARS_PER_LINE = 24;

export interface PlacedStep { step: FlowStep; x: number; y: number; w: number; h: number; lines: string[]; rank: number }
export interface PlacedEdge { edge: FlowEdge; d: string; lx: number; ly: number }
export interface FlowLayout { nodes: PlacedStep[]; edges: PlacedEdge[]; width: number; height: number }

/** Word-wrap a label to the box. A single word longer than a line is kept
 *  whole rather than broken mid-word — it overflows a little, which reads
 *  better than a hyphen the author did not write. */
export function wrapLabel(text: string, max = CHARS_PER_LINE): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) { line = word; continue; }
    if ((line + ' ' + word).length <= max) line += ' ' + word;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

/** Each step's column: the longest chain of FORWARD arrows into it. Throws on
 *  a cycle among forward arrows — that is an arrow that should be `loop`. */
export function rankSteps(flow: Flow): Map<string, number> {
  const ids = flow.steps.map((s) => s.id);
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of flow.edges) if (!e.loop) incoming.get(e.to)?.push(e.from);
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    const known = rank.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) throw new Error(`flow ${flow.id}: the forward arrows into "${id}" form a cycle — mark the arrow that goes back as loop`);
    visiting.add(id);
    const r = Math.max(-1, ...(incoming.get(id) ?? []).map(visit)) + 1;
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };
  ids.forEach(visit);
  return rank;
}

export function layoutFlow(flow: Flow): FlowLayout {
  const rank = rankSteps(flow);
  const columns: FlowStep[][] = [];
  for (const s of flow.steps) (columns[rank.get(s.id)!] ??= []).push(s);

  const sized = new Map<string, { lines: string[]; h: number }>();
  for (const s of flow.steps) {
    const lines = wrapLabel(s.label);
    sized.set(s.id, { lines, h: Math.max(52, 22 + lines.length * LINE_H + 14) });
  }
  const colHeight = columns.map((c) => (c ?? []).reduce((a, s) => a + sized.get(s.id)!.h, 0) + GAP_Y * Math.max(0, (c ?? []).length - 1));
  const inner = Math.max(...colHeight, 52);
  // Loops are drawn underneath the tallest column, so leave room for them.
  const loops = flow.edges.filter((e) => e.loop).length;
  const height = PAD * 2 + inner + (loops ? 28 + loops * 18 : 0);

  const nodes: PlacedStep[] = [];
  columns.forEach((col, r) => {
    let y = PAD + (inner - colHeight[r]) / 2;
    for (const s of col ?? []) {
      const { lines, h } = sized.get(s.id)!;
      nodes.push({ step: s, x: PAD + r * (NODE_W + GAP_X), y, w: NODE_W, h, lines, rank: r });
      y += h + GAP_Y;
    }
  });
  const at = new Map(nodes.map((n) => [n.step.id, n]));
  const width = PAD * 2 + columns.length * NODE_W + Math.max(0, columns.length - 1) * GAP_X;

  let loopNo = 0;
  const edges: PlacedEdge[] = flow.edges.map((edge) => {
    const a = at.get(edge.from)!;
    const b = at.get(edge.to)!;
    if (edge.loop) {
      // UNDERNEATH: down from the source, back along the bottom, up into the
      // target — so a return arrow never crosses the forward ones.
      const floor = PAD + inner + 20 + loopNo++ * 18;
      const x1 = a.x + a.w / 2, y1 = a.y + a.h;
      const x2 = b.x + b.w / 2, y2 = b.y + b.h;
      return { edge, d: `M ${x1} ${y1} C ${x1} ${floor}, ${x1} ${floor}, ${(x1 + x2) / 2} ${floor} S ${x2} ${floor}, ${x2} ${y2}`, lx: (x1 + x2) / 2, ly: floor - 4 };
    }
    const x1 = a.x + a.w, y1 = a.y + a.h / 2;
    const x2 = b.x, y2 = b.y + b.h / 2;
    const mx = (x1 + x2) / 2;
    return { edge, d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, lx: mx, ly: (y1 + y2) / 2 - 5 };
  });
  return { nodes, edges, width, height };
}

// ---- the flows ---------------------------------------------------------------

export const FLOWS: Flow[] = [
  {
    id: 'call-life',
    title: 'A field call — registration, spares, closure, consumption, feedback',
    purpose: 'What happens from the moment a customer reports a fault to the moment their feedback is on file: the call and its UCN, the visit that decides its status, the spare that is requested, approved, sent and fitted, the consumption that takes it off the engineer’s stock, and the feedback that follows closure.',
    steps: [
      { id: 'req', label: 'Call request raised', route: '/request-registration', area: 'call',
        detail: 'Anyone who may raise a request picks the machine by serial; the customer is read off the machine, never typed. A request can still be corrected while it is Pending.',
        records: ['call_requests'], reqs: ['URS-066', 'URS-075', 'FRS-087', 'CR-005', 'CR-010'] },
      { id: 'pend', label: 'Registered from the queue', route: '/pending-registrations', area: 'call',
        detail: 'The registration desk turns each pending request into a call, maps it to one, or cancels it. Every row leaves the queue by a stated route.',
        records: ['call_requests', 'field_calls'], reqs: ['FRS-078', 'URS-066'] },
      { id: 'direct', label: 'Call registered directly', route: '/field-calls', area: 'call',
        detail: 'A call taken by the desk is registered on the Field Call Register itself; the Standard Complaint is picked from the master, never typed.',
        records: ['field_calls'], reqs: ['URS-003', 'URS-044', 'FRS-053'] },
      { id: 'call', label: 'Field call — UCN issued, Unattended', route: '/field-calls', area: 'call', automatic: true,
        detail: 'The database issues the UCN and stamps who typed the call in. The call reads Unattended until its first visit.',
        records: ['field_calls'], reqs: ['URS-003', 'FRS-005', 'FRS-006', 'URS-044'] },
      { id: 'allot', label: 'Allotted to an engineer', route: '/field-calls', area: 'call',
        detail: 'The call is allotted, and can be re-allotted, only by a role holding the allotment right. The engineer is notified.',
        records: ['field_calls', 'notifications'], reqs: ['URS-032', 'FRS-038', 'FRS-079', 'URS-015'] },
      { id: 'visit', label: 'Visit report filed', route: '/reports', area: 'call',
        detail: 'The engineer files the visit. Its Call Status sets the call’s status: Unsolved, Solved - Report Pending or Solved.',
        records: ['reports', 'field_calls'], reqs: ['URS-004', 'FRS-007', 'URS-071'] },
      { id: 'sreq', label: 'Spare requested against the call', route: '/spare-requests', area: 'spare',
        detail: 'A part the visit needs is requested against the UCN. Each line carries its own approvals.',
        records: ['spare_requests', 'spare_request_lines'], reqs: ['URS-007', 'FRS-010'] },
      { id: 'rm', label: 'RM approval', route: '/spare-rm-approval', area: 'spare',
        detail: 'An approver with the RM right approves or rejects each line, for the engineers who report to them. Only Approved, Auto-Approved or “Cleared for Stores Processing” lets a line move on.',
        records: ['spare_request_lines'], reqs: ['FRS-010', 'FRS-011'] },
      { id: 'cn', label: 'Commercial and NSM, where needed', route: '/spare-requests', area: 'spare',
        detail: 'Commercial decides AMC and OGP lines; NSM decides those and every HandStock request. Anything else is auto-approved at RM approval.',
        records: ['spare_request_lines'], reqs: ['FRS-010'] },
      { id: 'disp', label: 'Dispatched — Stock Out and DC', route: '/spare-dispatch', area: 'spare',
        detail: 'Stores books the part out, all or part of the quantity, and raises the Delivery Challan. Who dispatched is stamped by the database, and the part enters the engineer’s hand stock now.',
        records: ['spare_dispatches', 'spare_dispatch_lines'], reqs: ['URS-008', 'URS-021', 'FRS-012', 'FRS-026'] },
      { id: 'recv', label: 'Received by the engineer', route: '/spare-requests', area: 'spare',
        detail: 'The engineer the part went to acknowledges each shipment. The part entered their hand stock when it was dispatched; receipt is their acknowledgement of it.',
        records: ['spare_request_lines'], reqs: ['URS-022', 'FRS-027'] },
      { id: 'cons', label: 'Consumption booked on the visit', route: '/spare-consumption', area: 'stock',
        detail: 'The part fitted is booked against the call on the visit report. It is refused beyond the engineer’s balance, and refused on a call with no visit.',
        records: ['spare_consumption'], reqs: ['URS-054', 'FRS-062', 'FRS-030', 'URS-047'] },
      { id: 'hs', label: 'Hand stock falls', route: '/handstock', area: 'stock', automatic: true,
        detail: 'The engineer’s balance is derived from every movement, never stored, so it moves the moment consumption is booked.',
        records: ['handstock_balance'], reqs: ['URS-009', 'FRS-013'] },
      { id: 'close', label: 'Call solved — closed', route: '/field-calls', area: 'call', automatic: true,
        detail: 'A visit filed as Solved closes the call. A closed call can be re-opened, which sends it back for another visit.',
        records: ['field_calls'], reqs: ['URS-004', 'FRS-007', 'URS-025', 'FRS-031'] },
      { id: 'fb', label: 'Customer feedback recorded', route: '/feedback', area: 'call',
        detail: 'One feedback per call, keyed on its UCN; feedback on a call that has no visit report is listed separately.',
        records: ['feedback'], reqs: ['URS-012', 'FRS-017', 'FRS-083'] },
    ],
    edges: [
      { from: 'req', to: 'pend', label: 'REQID' },
      { from: 'pend', to: 'call', label: 'becomes a call' },
      { from: 'direct', to: 'call' },
      { from: 'call', to: 'allot', label: 'UCN' },
      { from: 'allot', to: 'visit' },
      { from: 'visit', to: 'sreq', label: 'part needed', optional: true },
      { from: 'sreq', to: 'rm' },
      { from: 'rm', to: 'cn' },
      { from: 'cn', to: 'disp' },
      { from: 'disp', to: 'recv', label: 'DC' },
      { from: 'recv', to: 'cons', label: 'part fitted' },
      { from: 'visit', to: 'cons', label: 'visit filed' },
      { from: 'cons', to: 'hs' },
      { from: 'visit', to: 'close', label: 'Solved' },
      { from: 'close', to: 'fb' },
      { from: 'close', to: 'allot', label: 're-open', loop: true, optional: true },
    ],
  },
  {
    id: 'quality',
    title: 'Quality — Daily Review, Field Failure Report, Objective',
    purpose: 'How a complaint becomes quality evidence: every call is reviewed the next day, repeat failures are judged by the procedure’s rule, a potential effect raises a Field Failure Report without anybody pressing a button, and the month’s reports are counted into the Objective.',
    steps: [
      { id: 'call', label: 'Call with its Standard Complaint', route: '/field-calls', area: 'call',
        detail: 'The complaint is a master value, so every count downstream matches on the same words.',
        records: ['field_calls'], reqs: ['URS-003', 'URS-045', 'FRS-053'] },
      { id: 'dccr', label: 'Daily Complaint Review (R/SER/35)', route: '/daily-review', area: 'quality',
        detail: 'Each call is reviewed; the reviewer is stamped by the database at completion. Where a person holding review.auto has switched auto review on, a blank Review 2 on a call outside its first year is answered No in that person\u2019s name and marked as automatic. Old reviews loaded in bulk keep their own reviewers and raise nothing.',
        records: ['call_reviews'], reqs: ['URS-058', 'FRS-069', 'URS-080', 'FRS-096', 'URS-082', 'FRS-099'] },
      { id: 'ff', label: 'Frequent failure judged', area: 'quality', automatic: true,
        detail: 'The database applies the procedure’s rule: earlier calls on the same machine within the window, on the same complaint or the same part fitted, counted against the threshold.',
        records: ['frequent_failure()'], reqs: ['URS-046', 'FRS-054'] },
      { id: 'ffr', label: 'Field Failure Report raised', route: '/failure-report', area: 'quality', automatic: true,
        detail: 'A review answered YES to any potential effect raises one FFR for the call, dated the day the review was completed, with its CAPA fields blank for whoever handles the CAPA. It is never deleted; a later NO shows it as withdrawn.',
        records: ['field_failure_reports'], reqs: ['URS-059', 'FRS-070', 'URS-065', 'URS-081', 'FRS-097'] },
      { id: 'print', label: 'FFR printed and signed (R-SER-03)', route: '/failure-report', area: 'quality',
        detail: 'The report is printed from the register; a signature is applied by its owner only, on the block that names them.',
        records: ['field_failure_reports', 'user_signatures'], reqs: ['URS-057', 'FRS-066', 'FRS-067'] },
      { id: 'obj', label: 'Objective — FFRs this month', route: '/objective', area: 'report', automatic: true,
        detail: 'The Objective counts DISTINCT FFR numbers registered in the month, so a report covering several machines counts once.',
        records: ['quality_objectives'], reqs: ['URS-098', 'FRS-120'] },
      { id: 'pfa', label: 'Product Failure Analysis and KPIs', route: '/product-failure', area: 'report',
        detail: 'Failures are analysed under the product the review confirmed, not only the one on the call.',
        records: ['field_call_review'], reqs: ['URS-036', 'FRS-042'] },
    ],
    edges: [
      { from: 'call', to: 'dccr', label: 'reviewed daily' },
      { from: 'dccr', to: 'ff' },
      { from: 'ff', to: 'dccr', label: 'verdict', loop: true },
      { from: 'dccr', to: 'ffr', label: 'potential effect = YES' },
      { from: 'ffr', to: 'print' },
      { from: 'ffr', to: 'obj', label: 'counted by month' },
      { from: 'dccr', to: 'pfa', label: 'confirmed product' },
    ],
  },
  {
    id: 'hand-stock',
    title: 'Hand stock — what moves an engineer’s balance',
    purpose: 'An engineer’s stock is never typed: it is the sum of what was issued, consumed, returned, transferred and adjusted. Every arrow into the balance is a record somebody can inspect.',
    steps: [
      { id: 'open', label: 'Opening stock (migrated)', route: '/handstock', area: 'stock',
        detail: 'The balance carried in from before the system, declared as such and held by a named engineer.',
        records: ['handstock_opening'], reqs: ['FRS-043', 'FRS-047', 'URS-041'] },
      { id: 'disp', label: 'Dispatched to the engineer', route: '/spare-dispatch', area: 'spare',
        detail: 'Stores issues a part against an approved line. It counts in the engineer’s balance from dispatch.',
        records: ['spare_dispatch_lines'], reqs: ['URS-008', 'FRS-012'] },
      { id: 'recv', label: 'Receipt acknowledged', route: '/spare-requests', area: 'spare',
        detail: 'Only the engineer it went to can acknowledge it. It does not change the balance, which moved at dispatch.',
        records: ['spare_request_lines'], reqs: ['URS-022', 'FRS-027'] },
      { id: 'xfer', label: 'Transferred between engineers', route: '/stock-transfer', area: 'stock',
        detail: 'One engineer hands stock to another; it leaves one balance and enters the other.',
        records: ['stock_transfers', 'stock_transfer_lines'], reqs: ['URS-009'] },
      { id: 'bal', label: 'Balance, derived', route: '/handstock', area: 'stock', automatic: true,
        detail: 'Issued − consumed ± transfers − returns, per engineer and part, computed every time it is read.',
        records: ['handstock_balance'], reqs: ['URS-009', 'FRS-013', 'FRS-014', 'URS-024'] },
      { id: 'cons', label: 'Consumed on a call', route: '/spare-consumption', area: 'stock',
        detail: 'Capped at the balance; a wrong line is voided, never deleted, and the stock returns.',
        records: ['spare_consumption'], reqs: ['FRS-030', 'FRS-029', 'URS-023'] },
      { id: 'mrn', label: 'Returned — MRN', route: '/mrn', area: 'stock',
        detail: 'A good or defective part returned to stores; a return beyond the balance is refused.',
        records: ['material_returns'], reqs: ['URS-009'] },
      { id: 'adj', label: 'Adjusted \u00b1, with a reason', route: '/handstock', area: 'stock',
        detail: 'The office adds or removes stock with a mandatory reason. An adjustment is never edited or deleted; a wrong one is corrected by another the other way.',
        records: ['handstock_adjustments'], reqs: ['FRS-094', 'URS-009'] },
      { id: 'rep', label: 'Hand Stock Report', route: '/handstock-report', area: 'report',
        detail: 'The movements behind every balance, loaded whole before it can be exported.',
        records: ['handstock_balance'], reqs: ['URS-077', 'FRS-091'] },
    ],
    edges: [
      { from: 'open', to: 'bal', label: '+' },
      { from: 'disp', to: 'bal', label: '+' },
      { from: 'disp', to: 'recv', label: 'acknowledged' },
      { from: 'xfer', to: 'bal', label: '±', optional: true },
      { from: 'bal', to: 'cons', label: '−' },
      { from: 'bal', to: 'mrn', label: '−', optional: true },
      { from: 'adj', to: 'bal', label: '\u00b1', optional: true },
      { from: 'bal', to: 'rep' },
    ],
  },
  {
    id: 'sale-cover',
    title: 'A sale — installation, cover, the machine record, preventive maintenance',
    purpose: 'How a machine enters the install base: the sale is entered, its installation call is raised from the sale and mapped back to the machine, the warranty runs from installation, and the machine’s cover decides how every later call and spare is treated.',
    steps: [
      { id: 'sale', label: 'Sale entered (warranty register)', route: '/warranties', area: 'cover',
        detail: 'The sale and its machines, each keyed on model and serial. Only a currently-sold product line may be entered.',
        records: ['sale_entries', 'sale_items'], reqs: ['URS-011', 'FRS-016', 'FRS-072'] },
      { id: 'inst', label: 'Installation call raised from the sale', route: '/warranties', area: 'call',
        detail: 'One installation call per machine, raised from the sale and written back to the machine’s INST Call, so a second is never offered.',
        records: ['installation_calls', 'sale_items'], reqs: ['URS-073', 'FRS-085'] },
      { id: 'wty', label: 'Warranty runs from installation', area: 'cover', automatic: true,
        detail: 'The warranty starts on the installation date, and its end is computed exactly as the application computes it.',
        records: ['sale_items'], reqs: ['URS-070', 'FRS-082'] },
      { id: 'pd', label: 'Machine in the Product Database', route: '/product-database', area: 'master', automatic: true,
        detail: 'The sale puts the machine into the install base; the owner follows the latest sale or ownership transfer.',
        records: ['products', 'ownership_transfers'], reqs: ['URS-068', 'FRS-080', 'FRS-073'] },
      { id: 'cover', label: 'Cover today, derived', route: '/product-database-2', area: 'cover', automatic: true,
        detail: 'WGP, OGP, CMC or AMC, worked out warranty-first from the registers rather than typed.',
        records: ['product_database_v2'], reqs: ['URS-069', 'FRS-081'] },
      { id: 'contract', label: 'Contract, and its renewal', route: '/contracts', area: 'cover',
        detail: 'A contract covers machines after warranty; renewal carries the machines forward, not the prices.',
        records: ['contract_entries', 'contract_items'], reqs: ['URS-048', 'FRS-056'] },
      { id: 'pm', label: 'Preventive maintenance calls', route: '/pm-calls', area: 'call',
        detail: 'PM calls are raised for machines under cover, in batches by due month or by upload.',
        records: ['pm_calls'], reqs: ['URS-005', 'URS-026', 'FRS-032', 'FRS-009'] },
    ],
    edges: [
      { from: 'sale', to: 'inst', label: 'per machine' },
      { from: 'inst', to: 'wty', label: 'installed' },
      { from: 'sale', to: 'pd' },
      { from: 'wty', to: 'cover' },
      { from: 'pd', to: 'cover' },
      { from: 'contract', to: 'cover', optional: true },
      { from: 'cover', to: 'pm' },
    ],
  },
];

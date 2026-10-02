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

// 'doc' (documents, training, knowledge) and 'admin' (people, permissions,
// loads, the audit trail) joined on 2026-10-02 with the flows for every
// workflow.
export type FlowArea = 'call' | 'spare' | 'stock' | 'quality' | 'cover' | 'master' | 'report' | 'doc' | 'admin';

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
/** Width of one character of an arrow label (10.5px), for sizing the gap. */
const LABEL_CHAR = 6;
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

  // EACH GAP IS AS WIDE AS THE LONGEST LABEL THAT SITS IN IT (2026-10-02,
  // seen on a screenshot: "Commercial auto-approved" ran under the next box in
  // a fixed 64px gap). An arrow's label sits in the gap just BEFORE its target
  // -- where arrows fanning out of one box have already separated -- so that
  // gap is sized for it, even when the arrow skips columns.
  const gaps = columns.map(() => GAP_X);          // gaps[r] = the gap AFTER column r
  for (const e of flow.edges) {
    if (e.loop || !e.label) continue;
    const need = Math.ceil(e.label.length * LABEL_CHAR) + 22;
    // Sized at BOTH ends: a label sits before its target, or -- where several
    // labelled arrows converge on one box -- after its source (below).
    for (const r of [rank.get(e.to)! - 1, rank.get(e.from)!]) if (r >= 0 && r < gaps.length) gaps[r] = Math.max(gaps[r], need);
  }
  // Boxes several labelled arrows converge on.
  const labelledIn = new Map<string, number>();
  for (const e of flow.edges) if (!e.loop && e.label) labelledIn.set(e.to, (labelledIn.get(e.to) ?? 0) + 1);
  const colX: number[] = [];
  columns.forEach((_, r) => { colX[r] = r === 0 ? PAD : colX[r - 1] + NODE_W + gaps[r - 1]; });

  const nodes: PlacedStep[] = [];
  columns.forEach((col, r) => {
    let y = PAD + (inner - colHeight[r]) / 2;
    for (const s of col ?? []) {
      const { lines, h } = sized.get(s.id)!;
      nodes.push({ step: s, x: colX[r], y, w: NODE_W, h, lines, rank: r });
      y += h + GAP_Y;
    }
  });
  const at = new Map(nodes.map((n) => [n.step.id, n]));
  const last = columns.length - 1;
  const width = (last >= 0 ? colX[last] + NODE_W : 0) + PAD;

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
    // The label sits in the gap before the target: the middle of the arrow
    // when it crosses one gap; when it skips columns, the stretch into its
    // target, where the middle would be over a box and the start would sit
    // on its siblings' labels.
    const oneGap = b.rank - a.rank <= 1;
    const fanIn = (labelledIn.get(edge.to) ?? 0) > 1;
    const lx = fanIn ? x1 + gaps[a.rank] / 2 : oneGap ? mx : x2 - gaps[b.rank - 1] / 2;
    const ly = fanIn ? y1 - 5 : oneGap ? (y1 + y2) / 2 - 5 : y2 - 5;
    return { edge, d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, lx, ly };
  });

  // A LABEL STILL ON ANOTHER moves down a line at a time, never onto a box.
  const rectOf = (e: PlacedEdge) => {
    const w = (e.edge.label ?? '').length * LABEL_CHAR;
    return { x: e.lx - w / 2, y: e.ly - 10, w, h: 12 };
  };
  const hit = (p: { x: number; y: number; w: number; h: number }, q: { x: number; y: number; w: number; h: number }) =>
    p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
  const placed: PlacedEdge[] = [];
  for (const e of edges) {
    if (!e.edge.label || e.edge.loop) continue;
    for (let tries = 0; tries < 6; tries++) {
      const r = rectOf(e);
      if (!placed.some((o) => hit(r, rectOf(o)))) break;
      const down = { ...r, y: r.y + 13 };
      if (nodes.some((n) => hit(down, n))) { e.ly -= 26; continue; }
      e.ly += 13;
    }
    placed.push(e);
  }
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
        records: ['call_reviews'], reqs: ['URS-058', 'FRS-069', 'URS-080', 'FRS-097', 'URS-082', 'FRS-100'] },
      { id: 'ff', label: 'Frequent failure judged', area: 'quality', automatic: true,
        detail: 'The database applies the procedure’s two rules: Rule 1, earlier calls on the same machine within the window — always where the same part was fitted, otherwise on the same complaint (or on any complaint, if that setting is switched off); Rule 2, the same complaint on different machines across the fleet. Each is counted against its threshold, and the verdict says which fired.',
        records: ['frequent_failure()'], reqs: ['URS-046', 'FRS-054', 'URS-158', 'FRS-104', 'FRS-205'] },
      { id: 'ffr', label: 'Field Failure Report raised', route: '/failure-report', area: 'quality', automatic: true,
        detail: 'A review answered YES to any potential effect raises one FFR for the call, dated the day the review was completed, with its CAPA fields blank for whoever handles the CAPA. It is never deleted; a later NO shows it as withdrawn.',
        records: ['field_failure_reports'], reqs: ['URS-059', 'FRS-070', 'URS-065', 'URS-081', 'FRS-098'] },
      { id: 'print', label: 'FFR printed and signed (R-SER-03)', route: '/failure-report', area: 'quality',
        detail: 'The report is printed from the register; a signature is applied by its owner only, on the block that names them.',
        records: ['field_failure_reports', 'user_signatures'], reqs: ['URS-057', 'FRS-066', 'FRS-067'] },
      { id: 'obj', label: 'Objective — FFRs this month', route: '/objective', area: 'report', automatic: true,
        detail: 'The Objective counts DISTINCT FFR numbers registered in the month, so a report covering several machines counts once.',
        records: ['quality_objectives'], reqs: ['URS-098', 'FRS-121'] },
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
      { id: 'xfer', label: 'Ownership transfer recorded', route: '/ownership-transfer', area: 'cover',
        detail: 'A change of owner is a dated record, the new owner chosen from the Party Master. Where the previous owner cannot be determined it is left empty rather than guessed.',
        records: ['ownership_transfers'], reqs: ['FRS-188', 'FRS-073', 'URS-144', 'CW-011'] },
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
      { from: 'xfer', to: 'pd', label: 'new owner', optional: true },
    ],
  },
  // ---- every other workflow (the user, 2026-10-02: "Create an animated Data
  // Flow diagram for all the workflows"). Each step's detail is what its cited
  // requirement states AND the code does today: where a requirement describes a
  // target an open defect says is not yet met (D-038, D-039, D-041..043, D-053,
  // D-056..061, D-065..067, D-075), the step says what happens now.

  {
    id: 'installation',
    title: 'An installation — from the sale or the request to the machine record',
    purpose: 'How a sold machine is installed: the installation call is raised from the sale for each machine, or from an installation request once Commercial has it, only somebody holding install.create can create it, and the Warranty Start Date given on the installation visit is where the machine’s warranty begins.',
    steps: [
      { id: 'req', label: 'Installation request raised', route: '/request-registration', area: 'call',
        detail: 'An installation asks for the customer, because the machine is not on the register yet. It is the only request that accepts a customer not on the Party Master.',
        records: ['call_requests'], reqs: ['CR-017', 'CR-018', 'URS-066'] },
      { id: 'comm', label: 'Awaiting Commercial', route: '/workload', area: 'call',
        detail: 'My Workload counts the installation requests with no call raised yet, split by whether the customer is verified, not verified or absent from the customer register. Each count opens the request register filtered to those rows.',
        records: ['call_requests', 'parties'], reqs: ['FRS-088', 'URS-094', 'URS-074', 'OQ-105'] },
      { id: 'fromreq', label: 'Registered from the request', route: '/pending-registrations', area: 'call',
        detail: 'The registration form opens prefilled from the request, and the request’s call type makes it the Installation form.',
        records: ['call_requests', 'installation_calls'], reqs: ['FRS-127', 'FRS-078', 'URS-103'] },
      { id: 'fromsale', label: 'Raised from the sale, per machine', route: '/warranties', area: 'cover',
        detail: 'One installation call for each machine on the sale that has none, carrying the customer, model, serial and warranty recorded there; a machine with no model or serial gets no call. The By-machine tab raises it for a single machine.',
        records: ['sale_entries', 'sale_items', 'installation_calls'], reqs: ['FRS-085', 'FRS-186', 'URS-073', 'CW-022'] },
      { id: 'gate', label: 'Commercial gate — install.create', area: 'call', automatic: true,
        detail: 'The database refuses an installation call from anybody without install.create, whatever screen it was started from.',
        records: ['installation_calls'], reqs: ['FRS-008', 'FRS-182', 'URS-006', 'OQ-06'] },
      { id: 'call', label: 'Installation call — UCN issued, allotted', route: '/installations', area: 'call',
        detail: 'The database issues the UCN; a call raised from a sale has its number written back onto that machine, never replacing one already recorded there. It is allotted to an engineer within the allotting manager’s team.',
        records: ['installation_calls', 'sale_items'], reqs: ['FRS-005', 'FRS-186', 'FRS-038', 'URS-032'] },
      { id: 'visit', label: 'Installation visit report filed', route: '/reports', area: 'call',
        detail: 'On an installation the Warranty Start Date is required, defaults to today and stays editable, and is stored with the feedback. The visit’s Call Status sets the call’s status.',
        records: ['reports', 'feedback'], reqs: ['FRS-136', 'FRS-007', 'URS-111', 'OQ-127'] },
      { id: 'wty', label: 'Warranty runs from installation', area: 'cover', automatic: true,
        detail: 'The warranty starts on the Warranty Start Date given at installation, failing that the day the installation call was solved, and only then on the other registers. Its end is computed exactly as the application computes it.',
        records: ['product_database_v2'], reqs: ['FRS-082', 'URS-070', 'CW-006', 'OQ-66'] },
      { id: 'pd2', label: 'Machine record — Product Database 2.0', route: '/product-database-2', area: 'master', automatic: true,
        detail: 'One row per machine, keyed on model and serial, assembled from the sale, the contract, the additional entries, the ownership transfers and the installation call, each value naming the register that decided it. It is rebuilt within five minutes of a source register changing.',
        records: ['product_database_v2', 'product_database_v2_mv'], reqs: ['FRS-080', 'FRS-183', 'URS-068', 'OQ-64'] },
    ],
    edges: [
      { from: 'req', to: 'comm', label: 'no call yet' },
      { from: 'comm', to: 'fromreq' },
      { from: 'fromreq', to: 'gate' },
      { from: 'fromsale', to: 'gate', label: 'per machine' },
      { from: 'gate', to: 'call', label: 'UCN' },
      { from: 'call', to: 'visit' },
      { from: 'visit', to: 'wty', label: 'Warranty Start Date' },
      { from: 'wty', to: 'pd2' },
    ],
  },
  {
    id: 'pm',
    title: 'Preventive maintenance — the monthly batch to a closed PM call',
    purpose: 'How the month’s preventive maintenance becomes calls: the batch is loaded for a stated due month, each call is numbered by the database, allotted within the team, visited and closed by its visit — the same life as a field call, in the PM register.',
    steps: [
      { id: 'cover', label: 'Machines and their cover today', route: '/product-database-2', area: 'cover', automatic: true,
        detail: 'Each machine’s cover — WGP, OGP, CMC or AMC — is derived from the registers, warranty first, rather than typed.',
        records: ['product_database_v2'], reqs: ['FRS-081', 'URS-069', 'OQ-65'] },
      { id: 'file', label: 'Month’s PM file loaded', route: '/pm-bulk-upload', area: 'call',
        detail: 'A holder of pm.bulk_upload loads the month’s file; headings are matched by alias, every row is forced to the PM type, and cover is normalised to WGP, OGP, CMC or AMC, an unrecognised value kept as written.',
        records: ['pm_calls'], reqs: ['FRS-009', 'FRS-142', 'URS-005', 'OQ-14'] },
      { id: 'month', label: 'Dated to the due month, previewed', route: '/pm-bulk-upload', area: 'call',
        detail: 'Every call is dated the 1st of the chosen due month with the upload date kept beside it, and earlier months may be loaded. The first rows and the count are previewed before import.',
        records: ['pm_calls'], reqs: ['FRS-032', 'FRS-142', 'URS-026', 'OQ-19'] },
      { id: 'single', label: 'PM call registered singly', route: '/pm-calls', area: 'call',
        detail: 'A single PM call may also be registered on the PM register, filled from the Product Database; the PM register is governed by keys of its own.',
        records: ['pm_calls'], reqs: ['FRS-130', 'FRS-203'] },
      { id: 'call', label: 'PM call — UCN issued', route: '/pm-calls', area: 'call', automatic: true,
        detail: 'Calls are written in batches with progress, the database assigning the UCN and Call Number. The batch writer has no key yet, so loading the same file again creates its calls again.',
        records: ['pm_calls'], reqs: ['FRS-009', 'FRS-005', 'FRS-006', 'OQ-03'] },
      { id: 'allot', label: 'Allotted to an engineer', route: '/pm-calls', area: 'call',
        detail: 'PM calls are allotted, singly or several at once, to engineers in the manager’s own team; the database refuses an allotment outside it.',
        records: ['pm_calls'], reqs: ['FRS-038', 'URS-032', 'OQ-22'] },
      { id: 'visit', label: 'PM visit report filed', route: '/reports', area: 'call',
        detail: 'The engineer files the visit; its Call Status — Unsolved, Solved - Report Pending or Solved — sets the call’s status.',
        records: ['reports', 'pm_calls'], reqs: ['URS-004', 'FRS-007', 'FRS-136'] },
      { id: 'close', label: 'PM call solved — closed', route: '/pm-calls', area: 'call', automatic: true,
        detail: 'A visit filed as Solved closes the call, which is then read-only to every role. The way back is Re-open.',
        records: ['pm_calls'], reqs: ['FRS-007', 'FRS-031', 'URS-025', 'OQ-05'] },
    ],
    edges: [
      { from: 'cover', to: 'file', label: 'machines for the month', optional: true },
      { from: 'file', to: 'month' },
      { from: 'month', to: 'call', label: 'batch' },
      { from: 'single', to: 'call' },
      { from: 'call', to: 'allot', label: 'UCN' },
      { from: 'allot', to: 'visit' },
      { from: 'visit', to: 'close', label: 'Solved' },
      { from: 'close', to: 'allot', label: 're-open', loop: true, optional: true },
    ],
  },
  {
    id: 'spare-handstock',
    title: 'A HandStock spare — a request for the engineer’s own stock',
    purpose: 'The spare route with no call behind it: the engineer asks for stock to carry, RM approves, NSM always decides because there is no cover for Commercial to weigh, Stores books it out with its challan, and it counts in the engineer’s hand stock from that moment.',
    steps: [
      { id: 'raise', label: 'HandStock request raised', route: '/spare-requests', area: 'spare',
        detail: 'A HandStock request names no call and must give its reason; the whole Part Master is offered, never free text. The database assigns the OR number.',
        records: ['spare_requests', 'spare_request_lines'], reqs: ['FRS-146', 'URS-118', 'OQ-138'] },
      { id: 'rm', label: 'RM approval', route: '/spare-rm-approval', area: 'spare',
        detail: 'An approver with the RM right decides each line for their own team, and their own request routes to their manager. Approval writes Auto-Approved into the Commercial answer unless the line is AMC or OGP.',
        records: ['spare_request_lines'], reqs: ['FRS-010', 'FRS-011', 'FRS-147', 'URS-119', 'OQ-07'] },
      { id: 'nsm', label: 'NSM decides — always, for HandStock', route: '/spare-requests', area: 'spare',
        detail: 'RM approval never auto-approves NSM on a HandStock request. Only Cleared for Stores Processing moves the line on; Put on HOLD keeps it at NSM.',
        records: ['spare_request_lines'], reqs: ['FRS-147', 'FRS-150', 'URS-122', 'OQ-142'] },
      { id: 'disp', label: 'Booked out by Stores', route: '/spare-dispatch', area: 'spare',
        detail: 'Stores books out all or part of the quantity owed, to one engineer per stock out, and the stock out, its numbers and every line are written all or nothing. Dispatch needs spare.dispatch.',
        records: ['spare_dispatches', 'spare_dispatch_lines'], reqs: ['FRS-153', 'FRS-026', 'URS-124'] },
      { id: 'dc', label: 'Delivery Challan and Declaration', route: '/stock-out', area: 'spare',
        detail: 'The challan prints the quantity sent on this stock out, on A4 sheets of 20 rows under the company’s mark. The Declaration lists each part once and names any mandatory field still empty.',
        records: ['spare_dispatches', 'spare_dispatch_lines'], reqs: ['FRS-154', 'FRS-155', 'URS-125', 'OQ-147'] },
      { id: 'hs', label: 'Counted in hand stock from booking', route: '/handstock', area: 'stock', automatic: true,
        detail: 'The parts count in the engineer’s hand stock from the moment the stock out is booked — not from the DC date, and not from the acknowledgement.',
        records: ['handstock_movements', 'handstock_balance'], reqs: ['FRS-153', 'FRS-013', 'URS-009'] },
      { id: 'recv', label: 'Engineer acknowledges receipt', route: '/spare-requests', area: 'spare',
        detail: 'Only the engineer named on the request may acknowledge it, and not before it is dispatched. The acknowledgement does not change hand stock.',
        records: ['spare_request_lines'], reqs: ['FRS-152', 'FRS-027', 'URS-022'] },
      { id: 'end', label: 'Rejected or dropped, with a reason', route: '/spare-requests', area: 'spare',
        detail: 'The Spare Requests screen requires a reason to reject a line. A holder of spare.drop may drop a line before it is dispatched; a dropped line raises no challan and adds nothing to hand stock.',
        records: ['spare_request_lines'], reqs: ['FRS-148', 'FRS-012', 'URS-120'] },
    ],
    edges: [
      { from: 'raise', to: 'rm', label: 'OR number' },
      { from: 'rm', to: 'nsm', label: 'Commercial auto-approved' },
      { from: 'nsm', to: 'disp', label: 'Cleared for Stores' },
      { from: 'disp', to: 'dc', label: 'stock out' },
      { from: 'disp', to: 'hs', label: '+ from booking' },
      { from: 'dc', to: 'recv', label: 'parcel' },
      { from: 'rm', to: 'end', label: 'rejected', optional: true },
      { from: 'nsm', to: 'end', label: 'rejected / dropped', optional: true },
    ],
  },
  {
    id: 'reconciliation',
    title: 'Reconciliation — the office corrects the stock record',
    purpose: 'How the office puts the stock record right without rewriting history: a part fitted and never reported is added, a wrong line is adjusted or voided but kept, a balance is adjusted with a reason, a settled period is closed, and the report shows the movements behind every balance.',
    steps: [
      { id: 'recon', label: 'Consumption added by reconciliation', route: '/spare-consumption', area: 'stock',
        detail: 'A holder of consumption.reconcile books a part fitted but never reported against an existing call, the database requiring the engineer, part and reason. It is accepted on a call with no visit, and capped at the named engineer’s balance.',
        records: ['spare_consumption'], reqs: ['FRS-028', 'FRS-158', 'FRS-030', 'URS-023', 'OQ-16', 'OQ-150'] },
      { id: 'adj', label: 'Line adjusted or voided — never deleted', route: '/spare-consumption', area: 'stock',
        detail: 'A line’s quantity may be amended, keeping the original quantity, the reason and who amended it; the call, part, engineer and source cannot change. Zero voids the line and returns the stock, and the row is kept.',
        records: ['spare_consumption'], reqs: ['FRS-029', 'FRS-158', 'URS-023', 'OQ-17'] },
      { id: 'hsadj', label: 'Hand stock adjusted ±, with a reason', route: '/handstock', area: 'stock',
        detail: 'The office adds or removes stock with a mandatory reason; the database refuses an inactive engineer, an unknown part and a minus below zero. A wrong adjustment is reversed by another, never edited or deleted.',
        records: ['handstock_adjustments'], reqs: ['FRS-094', 'URS-009'] },
      { id: 'bal', label: 'Balance, derived', route: '/handstock', area: 'stock', automatic: true,
        detail: 'Opening + stock out − consumed ± transfers − returned ± adjustments, computed every time it is read. The drawer shows that arithmetic with every term.',
        records: ['handstock_movements', 'handstock_balance'], reqs: ['FRS-013', 'FRS-159', 'URS-009', 'OQ-151'] },
      { id: 'close', label: 'Stock period closed', area: 'stock',
        detail: 'close_handstock_period() writes an opening figure per engineer and part equal to every movement up to the date and moves the cut-off, changing no balance; it refuses a period that has not ended. It is run in the database by an administrator or a holder of consumption.reconcile — no screen offers it.',
        records: ['handstock_opening', 'handstock_period'], reqs: ['FRS-044', 'URS-038', 'OQ-31'] },
      { id: 'rep', label: 'Hand Stock Report', route: '/handstock-report', area: 'report',
        detail: 'The same derived balances, loaded whole before they can be exported. Every workbook carries a sheet stating its scope, its row count and when it was taken.',
        records: ['handstock_balance'], reqs: ['FRS-091', 'FRS-160', 'URS-077'] },
    ],
    edges: [
      { from: 'recon', to: 'bal', label: '−' },
      { from: 'recon', to: 'adj', label: 'corrected', optional: true },
      { from: 'adj', to: 'bal', label: '±' },
      { from: 'hsadj', to: 'bal', label: '±', optional: true },
      { from: 'bal', to: 'close', label: 'period ended', optional: true },
      { from: 'close', to: 'bal', label: 'opening figure', loop: true, optional: true },
      { from: 'bal', to: 'rep' },
    ],
  },
  {
    id: 'indoor',
    title: 'The workshop — Indoor Service Register',
    purpose: 'Equipment taken onto the premises: whose it is and how it arrived, cleaned to a named revision before anything is recovered from it, the job its kind requires, a quality check held as its own record and right, and either dispatch or a condemnation that credits no stock.',
    steps: [
      { id: 'recv', label: 'Unit received into the workshop', route: '/indoor', area: 'quality',
        detail: 'Receive files a job at once with a database-issued number, stamped received by and at, with the condition the unit arrived in. Whose property it is and what is done to it are set independently, and no call is needed.',
        records: ['indoor_jobs', 'indoor_job_accessories'], reqs: ['FRS-143', 'FRS-057', 'URS-049', 'SR-040', 'OQ-43'] },
      { id: 'clean', label: 'Cleaned to the work instruction', route: '/indoor', area: 'quality',
        detail: 'Cleaning is recorded against the work instruction and the revision applied, WI/SER/01 by default, and sets the status Cleaned.',
        records: ['indoor_jobs'], reqs: ['FRS-058', 'FRS-143', 'URS-050', 'SR-041'] },
      { id: 'gate', label: 'No parts recovered until decontaminated', area: 'quality', automatic: true,
        detail: 'A database trigger refuses a recovered part while the job is not marked decontaminated — the one control in the module that blocks rather than records.',
        records: ['indoor_job_parts'], reqs: ['FRS-058', 'URS-050', 'OQ-44'] },
      { id: 'job', label: 'The job, by its kind', route: '/indoor', area: 'quality',
        detail: 'A rework records its nonconformity, instruction and revision and who re-verified it; a pre-delivery inspection its checklist, firmware and result; a demonstration loan where it went and when it is due back. Activity Other is refused without a description.',
        records: ['indoor_jobs', 'indoor_job_checks'], reqs: ['FRS-144', 'URS-117'] },
      { id: 'qc', label: 'Quality check — its own record and right', route: '/indoor', area: 'quality',
        detail: 'The check is recorded on the job and needs indoor.qc, a right separate from indoor.work, enforced by the database. A Fail sends the job back to Under repair, and it cannot reach Ready, Dispatched or Closed while the check reads Fail.',
        records: ['indoor_jobs'], reqs: ['FRS-059', 'FRS-144', 'URS-051', 'SR-043', 'OQ-45'] },
      { id: 'disp', label: 'Dispatched or closed', route: '/indoor', area: 'quality',
        detail: 'Dispatch records a reference and needs indoor.dispatch, warning while accessories are outstanding. A Repair or Rework cannot reach Dispatched with no check result.',
        records: ['indoor_jobs', 'indoor_job_accessories'], reqs: ['FRS-144', 'FRS-059', 'URS-051'] },
      { id: 'condemn', label: 'Condemned — parts recovered, no stock credited', route: '/indoor', area: 'quality',
        detail: 'Condemning needs indoor.condemn, a right of its own, and a reason, the database stamping who and when. Recovered parts are recorded with a condition grade and a destination, and alter no stock balance.',
        records: ['indoor_jobs', 'indoor_job_parts'], reqs: ['FRS-060', 'URS-052', 'OQ-46'] },
    ],
    edges: [
      { from: 'recv', to: 'clean' },
      { from: 'clean', to: 'job' },
      { from: 'clean', to: 'gate', label: 'decontaminated' },
      { from: 'job', to: 'qc' },
      { from: 'qc', to: 'disp', label: 'Pass' },
      { from: 'qc', to: 'job', label: 'Fail', loop: true, optional: true },
      { from: 'job', to: 'condemn', label: 'unfit', optional: true },
      { from: 'gate', to: 'condemn', label: 'parts recovered', optional: true },
    ],
  },
  {
    id: 'documents',
    title: 'Documents and training — a controlled revision, who is trained on it, and the manuals at the call',
    purpose: 'How a controlled document reaches people: a QMS revision is entered as its own record, the people who must be trained on it are assigned at upload, completion is recorded and kept on each person’s history — and, beside it, how service manuals and notes reach the engineer on the call.',
    steps: [
      { id: 'upload', label: 'QMS document uploaded', route: '/qms', area: 'doc',
        detail: 'A QMS document needs a title, number, revision, effective date and a file or link, and is maintained only under qms.manage, enforced in the database. A number and revision identify one entry.',
        records: ['documents'], reqs: ['FRS-189', 'FRS-036', 'URS-030', 'URS-145'] },
      { id: 'rev', label: 'New revision — the old one retired', route: '/qms', area: 'doc',
        detail: 'A new revision is added as a new entry, and the screen offers to retire the one it supersedes. A retired entry stops being offered and stays on the shelf.',
        records: ['documents'], reqs: ['FRS-189', 'FRS-036', 'URS-145', 'OQ-21'] },
      { id: 'assign', label: 'Training assigned at upload', route: '/qms', area: 'doc',
        detail: 'Whoever must be trained is chosen when the document is uploaded, one assignment per person, anybody already assigned being skipped. If that fails the document is still saved and the training can be assigned on the Training screen.',
        records: ['training_assignments'], reqs: ['URS-079', 'FRS-093', 'FRS-190'] },
      { id: 'done', label: 'Training completed — session or read-and-understood', route: '/training', area: 'doc',
        detail: 'Completed means attended without a Fail, or the trainee’s own acknowledgement with no Fail recorded, and a trainee acknowledges only their own assignment. Past its due date it reads Overdue, and only training.manage may cancel one, with a reason.',
        records: ['training_sessions', 'training_attendance', 'training_assignments', 'training_status'], reqs: ['FRS-093', 'FRS-190', 'URS-146', 'URS-079'] },
      { id: 'hist', label: 'The person’s training history', route: '/training', area: 'doc',
        detail: 'My Profile’s Training tab lists every training the person received, readable by them, their reporting tree and those who manage users or training.',
        records: ['training_status', 'training_history'], reqs: ['FRS-093', 'FRS-216', 'URS-079', 'OQ-214'] },
      { id: 'man', label: 'Service manuals and technical / service notes', route: '/service-manuals', area: 'doc',
        detail: 'A manual names the product it covers, a blank meaning every product, and a note may name several products. docs.manage maintains them and every signed-in user may read them.',
        records: ['documents'], reqs: ['FRS-035', 'FRS-189', 'URS-029', 'OQ-215'] },
      { id: 'supp', label: 'Offered on a call’s Supporting documents', route: '/field-calls', area: 'call',
        detail: 'Opening a call lists the manuals for its product and those for every product, the active notes that match it and the matching Field Solutions articles. A retired note is never offered.',
        records: ['documents', 'kb_articles'], reqs: ['FRS-035', 'URS-029', 'CR-029', 'OQ-21'] },
    ],
    edges: [
      { from: 'upload', to: 'rev', label: 'supersedes', optional: true },
      { from: 'upload', to: 'assign', label: 'who must be trained' },
      { from: 'assign', to: 'done' },
      { from: 'done', to: 'hist' },
      { from: 'man', to: 'supp', label: 'matched by product' },
    ],
  },
  {
    id: 'masters',
    title: 'The masters — what every form picks from',
    purpose: 'Where the values on a call and a spare come from: the customer by its one name, the machine from the install base, the parts that fit it, and the complaints that belong to its product — each kept under control so the forms offer only what is real.',
    steps: [
      { id: 'party', label: 'Party Master — the name is the key', route: '/parties', area: 'master',
        detail: 'Holders of masters.edit maintain a customer’s type, Serviceman, addresses, contacts and KYC, but the name is shown and never offered for editing. Marking KYC Verified stamps who verified it, and leaving Verified clears that.',
        records: ['parties'], reqs: ['FRS-173', 'FRS-174', 'URS-136', 'OQ-166'] },
      { id: 'catalogue', label: 'Product Master — the catalogue', route: '/product-master', area: 'master',
        detail: 'Every product line with its code, type, category and whether it is still sold, read-only here. An Inactive line takes no new sale entry and still takes contracts, calls, visits, spares and feedback.',
        records: ['product_master'], reqs: ['FRS-182', 'URS-140'] },
      { id: 'install', label: 'Product Database — the install base', route: '/product-database', area: 'master',
        detail: 'One row per machine with its customer and cover, and no path on the screen writes one. A call can be started from a machine, already filled.',
        records: ['products'], reqs: ['FRS-182', 'URS-140', 'OQ-175'] },
      { id: 'parts', label: 'Part Master — the parts that fit', route: '/parts', area: 'master',
        detail: 'A new part needs a code in the agreed form, a description, Spare or Consumable and the products it fits or Common; an existing code is refused, a part is deactivated rather than deleted, and its HSN code is digits only. The products a part is mapped to decide which spares a call offers.',
        records: ['parts', 'product_accessories'], reqs: ['FRS-177', 'FRS-179', 'FRS-219', 'URS-138', 'OQ-170', 'OQ-172'] },
      { id: 'rename', label: 'Part renamed — its history carried', route: '/parts', area: 'master',
        detail: 'rename_part() moves the part’s identity in the catalogue and every table carrying it in one transaction, after saying how many records will move. It refuses a rename onto a part that exists, and every hand stock is the same afterwards.',
        records: ['parts', 'spare_consumption', 'handstock_adjustments'], reqs: ['FRS-178', 'URS-138', 'OQ-213'] },
      { id: 'lists', label: 'Value lists and Standard Complaints', route: '/masters', area: 'master',
        detail: 'An entry is added only by a holder of that list’s right, a duplicate is refused, and a deactivated entry stays on the records carrying it. A Standard Complaint applies to the products it is mapped to, or to every product where it names none.',
        records: ['masters', 'master_lists'], reqs: ['FRS-180', 'FRS-181', 'URS-139', 'OQ-174'] },
      { id: 'form', label: 'Call form and spare pickers', route: '/field-calls', area: 'call',
        detail: 'Registration fills product, serial, site and cover from the Product Database and the engineer from the machine or the party’s Serviceman, and the complaint is picked, never typed. The spare picker offers the engineer’s hand stock narrowed to the call’s product, its accessories and common parts.',
        records: ['field_calls', 'spare_consumption'], reqs: ['FRS-130', 'FRS-053', 'FRS-137', 'URS-045'] },
    ],
    edges: [
      { from: 'party', to: 'form', label: 'customer, Serviceman' },
      { from: 'install', to: 'form', label: 'machine, cover' },
      { from: 'catalogue', to: 'parts', label: 'main products, accessories' },
      { from: 'parts', to: 'form', label: 'parts that fit' },
      { from: 'parts', to: 'rename', optional: true },
      { from: 'lists', to: 'form', label: 'complaints for the product' },
    ],
  },
  {
    id: 'access',
    title: 'People and access — who may sign in, what they may do, what they see',
    purpose: 'How a person comes to act in the system: a User Master row, a login issued by an administrator, a role whose permissions are set per screen and per action, a reporting tree that decides whose records they see — and an audit trail of the changes.',
    steps: [
      { id: 'um', label: 'User Master row', route: '/user-master', area: 'admin',
        detail: 'Every person has a row, refused without a name because calls are allotted to it. The Reporting and Regional Manager it names build the reporting tree.',
        records: ['user_directory'], reqs: ['FRS-171', 'URS-135'] },
      { id: 'login', label: 'Login issued by an administrator', route: '/user-master', area: 'admin',
        detail: 'A login is created from the person’s row, refused without a valid e-mail, and the database accepts the profile from an administrator only. A forced replacement of the starting password at first sign-in is specified and not yet in force.',
        records: ['profiles'], reqs: ['FRS-168', 'FRS-002', 'URS-133', 'OQ-01'] },
      { id: 'reset', label: 'Password reset, or login disabled', route: '/user-master', area: 'admin',
        detail: 'A reset generates a password shown once, ends every session the person holds and is recorded by the database without the password. Disabling a login blocks sign-in and keeps every record.',
        records: ['password_resets', 'profiles'], reqs: ['FRS-169', 'URS-133'] },
      { id: 'role', label: 'Role and permissions (Roles & Permissions)', route: '/roles', area: 'admin',
        detail: 'Each screen and each action on it is granted per role, a save writes only the roles changed, and a role left with no permission is refused. An administrator may also give one person individual permissions, shown beside the role’s.',
        records: ['app_roles', 'perm_parents', 'profiles'], reqs: ['FRS-203', 'FRS-170', 'URS-156', 'OQ-196'] },
      { id: 'scope', label: 'Reporting tree scopes what each sees', area: 'admin', automatic: true,
        detail: 'An engineer sees their own records, a manager their reporting team, office roles everything; row-level security in the database enforces it.',
        records: ['user_directory'], reqs: ['FRS-003', 'URS-002', 'OQ-02'] },
      { id: 'audit', label: 'Audit trail records the changes', route: '/audit', area: 'admin', automatic: true,
        detail: 'Login creation and every access save are written to audit_log, and record_audit keeps what a row became, before and after, in triggers nothing can bypass. The record-level trail is readable only by an administrator or a holder of audit.view.',
        records: ['audit_log', 'record_audit'], reqs: ['FRS-021', 'FRS-204', 'FRS-170', 'URS-016'] },
    ],
    edges: [
      { from: 'um', to: 'login', label: 'e-mail' },
      { from: 'login', to: 'reset', label: 'forgotten / leaver', optional: true },
      { from: 'login', to: 'role', label: 'role on the sign-in' },
      { from: 'um', to: 'scope', label: 'reporting manager' },
      { from: 'role', to: 'scope' },
      { from: 'login', to: 'audit', label: 'login created' },
      { from: 'role', to: 'audit', label: 'access saved' },
      { from: 'reset', to: 'audit', label: 'password_resets' },
    ],
  },
  {
    id: 'bulk-load',
    title: 'Bulk loading — a file into the registers',
    purpose: 'How records from a file enter the registers: shaped by the same parser everywhere, seen before they are written, keyed so that a corrected file corrects rather than duplicates, and marked as imported where that matters — and how recovered visit reports are resolved before any is written.',
    steps: [
      { id: 'pick', label: 'File picked in Bulk Uploads', route: '/bulk-uploads', area: 'admin',
        detail: 'Bulk Uploads opens only for a holder of bulk.upload, and what each load writes is still decided by that table’s own policies. The header row is found below any letterhead by the register’s own column names.',
        records: ['audit_log'], reqs: ['FRS-196', 'URS-151', 'OQ-189'] },
      { id: 'shape', label: 'Shaped — headings, dates, vocabularies', area: 'admin', automatic: true,
        detail: 'A row missing a required column is held back and named; dates are read day-first; cover, approvals and part category take the controlled words, an unknown value passing through unchanged. A heading the register does not map is kept in the row’s extra data.',
        reqs: ['FRS-197', 'URS-076', 'URS-045'] },
      { id: 'preview', label: 'Previewed before it is written', route: '/bulk-uploads', area: 'admin',
        detail: 'The screen shows the rows ready, each row held back with its reason, the headings kept or ignored and a sample row. The confirmation states the rows, the register and the column a re-run is matched on, or that a re-run adds every row again.',
        reqs: ['FRS-196', 'URS-151'] },
      { id: 'write', label: 'Written in batches', route: '/bulk-uploads', area: 'admin',
        detail: 'Rows are upserted where the register has a natural key and inserted where it has none, in batches with progress. A failure states the database’s error, the row it stopped near and how many rows were written first.',
        reqs: ['FRS-196', 'FRS-074', 'URS-062'] },
      { id: 'regs', label: 'Servicing, stock and master registers', area: 'admin', automatic: true,
        detail: 'Calls are keyed on the UCN, visits on their uid, parties on the name, machines on model and serial and parts on CODE|Description, so a corrected re-load corrects them. Material returns and stock transfer lines have no key yet, and the confirmation warns that a re-run adds them again.',
        records: ['field_calls', 'reports', 'spare_consumption', 'material_returns', 'stock_transfers', 'parties', 'products', 'parts'], reqs: ['FRS-198', 'FRS-199', 'FRS-200', 'URS-154', 'OQ-193'] },
      { id: 'imported', label: 'Marked as imported', area: 'admin', automatic: true,
        detail: 'Migrated returns and transfers are stamped source = import, which exempts them from the shortfall check and from nothing else. Loaded feedback is stamped with where it was imported from.',
        records: ['material_returns', 'stock_transfers', 'feedback'], reqs: ['FRS-199', 'FRS-198', 'URS-153', 'URS-152', 'OQ-192'] },
      { id: 'mapres', label: 'Visit reports read and resolved', route: '/report-mapping', area: 'call',
        detail: 'Bulk Report Mapping, open to an administrator or the visit-report right, reads the sheet, works out which call each row belongs to and resolves its file references into links. The operator sees what each row resolved to before anything is written.',
        reqs: ['FRS-077', 'FRS-145', 'URS-065', 'OQ-128'] },
      { id: 'mapw', label: 'Only clean rows written', route: '/report-mapping', area: 'call',
        detail: 'Only rows that resolved cleanly are written into the visit history; the rest are listed with the reason, and a row with no attachment resolved is skipped.',
        records: ['reports'], reqs: ['FRS-077', 'FRS-145', 'URS-065'] },
    ],
    edges: [
      { from: 'pick', to: 'shape' },
      { from: 'shape', to: 'preview' },
      { from: 'preview', to: 'write', label: 'confirmed' },
      { from: 'write', to: 'regs' },
      { from: 'regs', to: 'imported', label: 'migrated rows', optional: true },
      { from: 'mapres', to: 'mapw', label: 'resolved' },
      { from: 'mapw', to: 'regs', label: 'visits' },
    ],
  },
  {
    id: 'reports',
    title: 'Reports and exports — what leaves the system, and the record of it',
    purpose: 'How a figure or a file is taken out: each report filters and counts the whole register in the database, its file states what it is, the right to take it is checked, and the taking is recorded — and whole tables leave only through Data Export.',
    steps: [
      { id: 'regs', label: 'The registers, through report views', area: 'report',
        detail: 'Each report reads a view in which one row means one thing — a spare booked, a call, a feedback, a part sent and not accounted for.',
        records: ['consumption_report', 'call_report', 'feedback_report', 'unused_spare_report'], reqs: ['URS-150', 'FRS-194', 'OQ-187'] },
      { id: 'hub', label: 'Reports — a tab per report', route: '/exports', area: 'report',
        detail: 'Each report is offered only to a role holding its own key, filters in the database over the whole register and shows the exact number of matching rows.',
        records: ['consumption_report', 'call_report', 'feedback_report'], reqs: ['FRS-192', 'URS-148', 'OQ-185'] },
      { id: 'file', label: 'Columns chosen, file written', route: '/exports', area: 'report',
        detail: 'Mandatory columns are always included and optional ones chosen; every matching row is read before the file is written. A workbook carries a sheet stating the report, the filter, the rows and when it was taken, with dates as dates and numbers as numbers.',
        reqs: ['FRS-192', 'URS-148', 'OQ-185'] },
      { id: 'gate', label: 'The export gate', area: 'report', automatic: true,
        detail: 'A file needs export.data and the report’s own right, and the report’s download controls are disabled for a role that may not take it. Today the gate is enforced in the CSV writer; the workbook and ZIP writers do not yet consult it.',
        reqs: ['FRS-193', 'FRS-138', 'URS-149'] },
      { id: 'dx', label: 'Data Export — whole tables, schedules', route: '/data-export', area: 'report',
        detail: 'Opens only with export.tables or export.schedules, lists the exportable tables (no audit table) and writes one CSV per table into one ZIP. Only an administrator amends, pauses or deletes a schedule, and the record of its past runs is kept.',
        records: ['export_schedules', 'export_runs'], reqs: ['FRS-202', 'URS-155'] },
      { id: 'audit', label: 'Recorded in the audit trail', route: '/audit', area: 'admin', automatic: true,
        detail: 'A report download is written to audit_log naming the report, the rows, the columns and the filter, and read on the Audit Log by those entitled to it.',
        records: ['audit_log'], reqs: ['FRS-193', 'FRS-204', 'URS-149'] },
    ],
    edges: [
      { from: 'regs', to: 'hub' },
      { from: 'hub', to: 'file', label: 'filter + exact count' },
      { from: 'file', to: 'gate' },
      { from: 'gate', to: 'audit', label: 'file taken' },
      { from: 'regs', to: 'dx', label: 'whole tables' },
    ],
  },
];

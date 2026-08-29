// ---------------------------------------------------------------------------
// Spare approval workflow state machine.
//   RM → Commercial → NSM → Stores (dispatch / DC) → Received (engineer ack).
//
// The state belongs to ONE SPARE, not to the request: the RM approves or
// rejects each part separately, so a request for five parts can go forward
// with three. The later stages read the same per-line state, which is what
// lets them be actioned either spare by spare or for a whole OR at once.
// `stage` and `status` are computed by the database from these columns
// (0016_spare_line_approvals.sql), so the patches below never set them.
// RM approval: RM / RGM / Hotline / Spare Coordinator (spare.approve_rm).
// Commercial & NSM only need a manual approval when the item is AMC or OGP;
// otherwise they auto-approve. Stores Incharge dispatches and records a DC;
// the requesting engineer then acknowledges receipt, which closes the request.
// ---------------------------------------------------------------------------

export type Decision = 'approve' | 'reject';
export type Stage = 'RM Approval' | 'Commercial' | 'NSM' | 'Stores' | 'Dispatched' | 'Received' | 'Rejected';

export interface SpareReq {
  uid?: unknown; item_status?: unknown;
  rm_approval?: unknown; commercial_approval?: unknown; nsm_approval?: unknown; stores_status?: unknown;
  received_at?: unknown;
  [k: string]: unknown;
}

const s = (v: unknown) => String(v ?? '').trim();
// Commercial / NSM must review AMC or OGP items; everything else auto-approves.
export const needsReview = (itemStatus: unknown): boolean => /^(amc|ogp)$/i.test(s(itemStatus));
const isApproved = (v: unknown) => /approv|auto/i.test(s(v)); // "Approved" or "Auto-Approved"

export function deriveStage(r: SpareReq): Stage {
  if ([r.rm_approval, r.commercial_approval, r.nsm_approval].some((v) => /reject/i.test(s(v)))) return 'Rejected';
  if (s(r.received_at)) return 'Received';
  if (/dispatch/i.test(s(r.stores_status))) return 'Dispatched';
  if (!isApproved(r.rm_approval)) return 'RM Approval';
  const review = needsReview(r.item_status);
  if (review && !isApproved(r.commercial_approval)) return 'Commercial';
  if (review && !isApproved(r.nsm_approval)) return 'NSM';
  return 'Stores';
}

// The RM decides each spare on its own — never in bulk over a whole OR. Every
// later stage may be actioned either way.
export const canBulkApprove = (stage: Stage): boolean =>
  stage === 'Commercial' || stage === 'NSM' || stage === 'Stores' || stage === 'Dispatched';

// Stage order for filter chips / KPI tiles (terminal stages last).
export const STAGES: Stage[] = ['RM Approval', 'Commercial', 'NSM', 'Stores', 'Dispatched', 'Received', 'Rejected'];

export function stageTone(stage: Stage): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (stage === 'Rejected') return 'danger';
  if (stage === 'Received') return 'success';
  if (stage === 'Dispatched') return 'info';
  if (stage === 'Stores') return 'warning';
  return 'neutral';
}

// The RBAC action needed to act on the current stage (null if terminal).
export function stageAction(stage: Stage): string | null {
  switch (stage) {
    case 'RM Approval': return 'spare.approve_rm';
    case 'Commercial': return 'spare.approve_commercial';
    case 'NSM': return 'spare.approve_nsm';
    case 'Stores': return 'spare.dispatch';
    case 'Dispatched': return 'spare.receive';
    default: return null;
  }
}

// True when the signed-in user can move this request forward right now. The
// engineer acknowledgement is additionally restricted to the raiser's own
// requests, so an approver's queue doesn't fill with other people's receipts.
export function actionable(r: SpareReq, can: (action: string) => boolean, email = ''): boolean {
  const stage = deriveStage(r);
  const action = stageAction(stage);
  if (!action || !can(action)) return false;
  if (stage === 'Dispatched') return isOwnRequest(r, email);
  return true;
}

export const isOwnRequest = (r: SpareReq, email: string): boolean =>
  !!email && s(r.engineer_email).toLowerCase() === email.trim().toLowerCase();

// Field patch for an approve/reject decision at the request's current stage.
export function buildPatch(r: SpareReq, decision: Decision, actor: string, reason = ''): Record<string, unknown> {
  const now = new Date().toISOString();
  const stage = deriveStage(r);
  const patch: Record<string, unknown> = {};
  if (decision === 'reject') {
    if (stage === 'RM Approval') Object.assign(patch, { rm_approval: 'Rejected', rm_by: actor, rm_at: now });
    else if (stage === 'Commercial') Object.assign(patch, { commercial_approval: 'Rejected', commercial_by: actor, commercial_at: now });
    else if (stage === 'NSM') Object.assign(patch, { nsm_approval: 'Rejected', nsm_by: actor, nsm_at: now });
    Object.assign(patch, { rejected_stage: stage, reject_reason: reason });
    return patch;
  }
  if (stage === 'RM Approval') {
    Object.assign(patch, { rm_approval: 'Approved', rm_by: actor, rm_at: now });
    if (!needsReview(r.item_status)) { patch.commercial_approval = 'Auto-Approved'; patch.nsm_approval = 'Auto-Approved'; }
  } else if (stage === 'Commercial') {
    Object.assign(patch, { commercial_approval: 'Approved', commercial_by: actor, commercial_at: now });
  } else if (stage === 'NSM') {
    Object.assign(patch, { nsm_approval: 'Approved', nsm_by: actor, nsm_at: now });
  }
  return patch;
}

// Stores dispatch (records the DC / stock-out).
export function dispatchPatch(dcNumber: string, actor: string, courier = '', remarks = ''): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    stores_status: 'Dispatched', dc_number: dcNumber, courier, dispatch_remarks: remarks,
    dispatched_by: actor, dispatched_at: now,
  };
}

// Engineer acknowledgement — the parts reached the field; the request closes.
export function receivePatch(actor: string, remarks = ''): Record<string, unknown> {
  const now = new Date().toISOString();
  return { received_by: actor, received_at: now, receipt_remarks: remarks };
}

// ---------------------------------------------------------------------------
// Audit trail for the detail drawer: one entry per stage that has happened.
// ---------------------------------------------------------------------------
export interface TrailEntry { stage: string; outcome: string; by: string; at: string; note?: string }

export function trail(r: SpareReq): TrailEntry[] {
  const out: TrailEntry[] = [];
  const push = (stage: string, outcome: unknown, by: unknown, at: unknown, note?: string) => {
    if (!s(outcome)) return;
    out.push({ stage, outcome: s(outcome), by: s(by), at: s(at), note });
  };
  push('Raised', r.req_type ?? 'Request', r.req_engineer ?? r.engineer, r.requested_at ?? r.created_at, s(r.remarks) || undefined);
  const rejectNote = (stage: string) => (s(r.rejected_stage) === stage ? s(r.reject_reason) || undefined : undefined);
  if (s(r.rm_approval) && !/^pending$/i.test(s(r.rm_approval)))
    push('RM Approval', r.rm_approval, r.rm_by, r.rm_at, rejectNote('RM Approval'));
  if (s(r.commercial_approval) && !/^pending$/i.test(s(r.commercial_approval)))
    push('Commercial', r.commercial_approval, r.commercial_by, r.commercial_at, rejectNote('Commercial'));
  if (s(r.nsm_approval) && !/^pending$/i.test(s(r.nsm_approval)))
    push('NSM', r.nsm_approval, r.nsm_by, r.nsm_at, rejectNote('NSM'));
  if (/dispatch/i.test(s(r.stores_status)))
    push('Stores', `Dispatched${s(r.dc_number) ? ` · DC ${s(r.dc_number)}` : ''}`, r.dispatched_by, r.dispatched_at,
      [s(r.courier) && `Courier: ${s(r.courier)}`, s(r.dispatch_remarks)].filter(Boolean).join(' · ') || undefined);
  if (s(r.received_at)) push('Received', 'Acknowledged', r.received_by, r.received_at, s(r.receipt_remarks) || undefined);
  return out;
}

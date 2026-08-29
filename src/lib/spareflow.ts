// ---------------------------------------------------------------------------
// Spare approval workflow state machine.
//   RM → Commercial → NSM → Stores (dispatch / DC).
// RM approval: RM / RGM / Hotline / Spare Coordinator (spare.approve_rm).
// Commercial & NSM only need a manual approval when the item is AMC or OGP;
// otherwise they auto-approve. Stores Incharge dispatches and records a DC.
// ---------------------------------------------------------------------------

export type Decision = 'approve' | 'reject';
export type Stage = 'RM Approval' | 'Commercial' | 'NSM' | 'Stores' | 'Dispatched' | 'Rejected';

export interface SpareReq {
  uid?: unknown; item_status?: unknown;
  rm_approval?: unknown; commercial_approval?: unknown; nsm_approval?: unknown; stores_status?: unknown;
  [k: string]: unknown;
}

const s = (v: unknown) => String(v ?? '').trim();
// Commercial / NSM must review AMC or OGP items; everything else auto-approves.
export const needsReview = (itemStatus: unknown): boolean => /^(amc|ogp)$/i.test(s(itemStatus));
const isApproved = (v: unknown) => /approv|auto/i.test(s(v)); // "Approved" or "Auto-Approved"

export function deriveStage(r: SpareReq): Stage {
  if ([r.rm_approval, r.commercial_approval, r.nsm_approval].some((v) => /reject/i.test(s(v)))) return 'Rejected';
  if (/dispatch/i.test(s(r.stores_status))) return 'Dispatched';
  if (!isApproved(r.rm_approval)) return 'RM Approval';
  const review = needsReview(r.item_status);
  if (review && !isApproved(r.commercial_approval)) return 'Commercial';
  if (review && !isApproved(r.nsm_approval)) return 'NSM';
  return 'Stores';
}

// The RBAC action needed to act on the current stage (null if terminal).
export function stageAction(stage: Stage): string | null {
  switch (stage) {
    case 'RM Approval': return 'spare.approve_rm';
    case 'Commercial': return 'spare.approve_commercial';
    case 'NSM': return 'spare.approve_nsm';
    case 'Stores': return 'spare.dispatch';
    default: return null;
  }
}

// Field patch for an approve/reject decision at the request's current stage.
export function buildPatch(r: SpareReq, decision: Decision, actor: string): Record<string, unknown> {
  const now = new Date().toISOString();
  const stage = deriveStage(r);
  const patch: Record<string, unknown> = {};
  if (decision === 'reject') {
    if (stage === 'RM Approval') Object.assign(patch, { rm_approval: 'Rejected', rm_by: actor, rm_at: now });
    else if (stage === 'Commercial') Object.assign(patch, { commercial_approval: 'Rejected', commercial_by: actor, commercial_at: now });
    else if (stage === 'NSM') Object.assign(patch, { nsm_approval: 'Rejected', nsm_by: actor, nsm_at: now });
    patch.stage = 'Rejected'; patch.status = 'Rejected';
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
  const next = deriveStage({ ...r, ...patch });
  patch.stage = next;
  patch.status = next === 'Stores' ? 'Awaiting Dispatch' : next;
  return patch;
}

// Stores dispatch (records the DC / stock-out).
export function dispatchPatch(dcNumber: string, actor: string): Record<string, unknown> {
  const now = new Date().toISOString();
  return { stores_status: 'Dispatched', dc_number: dcNumber, dispatched_by: actor, dispatched_at: now, stage: 'Dispatched', status: 'Dispatched' };
}

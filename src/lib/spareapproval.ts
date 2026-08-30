// ---------------------------------------------------------------------------
// The Commercial (formerly ADMIN) approval form.
//
// Transcribed from the "Admin Approval - Rithi" Google Form, which branches:
//
//   Admin Status
//     ├─ Cleared for Stores Processing → Reason for Clearing
//     │     ├─ Under CMC / Warranty / AMC → MC / SA number
//     │     ├─ Direct PO                  → the four-step PO checklist
//     │     └─ OGP                        → nothing further
//     └─ Admin Process in Progress    → Pending Reason
//   … and Additional Comments either way.
//
// "Cleared for Stores Processing" is an approval — it is what the sheet wrote
// in the ADMIN Approval column and what the history import maps to Approved.
// "Admin Process in Progress" is NOT: the spare stays at Commercial with the
// reason recorded, which is a third outcome the stage never had before.
//
// Answers are kept whole under approval_data.commercial, so the form can grow
// without a migration. NSM's form is the same shape and will sit beside it.
// ---------------------------------------------------------------------------

export const COMMERCIAL_STATUSES = ['Cleared for Stores Processing', 'Admin Process in Progress'] as const;
export type CommercialStatus = (typeof COMMERCIAL_STATUSES)[number];

export const CLEARING_REASONS = ['Under CMC', 'Under Warranty', 'Under AMC', 'OGP', 'Direct PO'] as const;

// Only these need the contract/warranty reference.
export const REASONS_NEEDING_MC_SA: readonly string[] = ['Under CMC', 'Under Warranty', 'Under AMC'];

export const DIRECT_PO_STEPS = [
  'Estimated Approved?', 'PO Received from Party?', 'Invoice?', 'Payment Received?',
] as const;

export const PENDING_REASONS = [
  'Estimation Given , Waiting for Customer Approval',
  'Waiting for PO / Customer Approval',
  'Advance Payment Pending',
  'Old Payment Pending',
  'Waiting for NSM Approval',
  'Invoice Pending',
  'CMC Approval not Received',
  'Customer Approval  Received , But old payment pending',
] as const;

export interface CommercialAnswer {
  status: CommercialStatus | '';
  clearing_reason?: string;
  mc_sa_number?: string;
  direct_po?: Record<string, 'Yes' | 'No'>;
  pending_reason?: string;
  comments?: string;
  by?: string;
  at?: string;
}

// The form's own instruction: "MCyyyy or SAyyyy -- Format - Please do not use
// Space." Prefix and the no-space rule are enforced; the length is not, since
// real references run longer than four characters.
export const MC_SA_RE = /^(MC|SA)\S+$/i;

// What the form still needs before it can be submitted — empty when it is
// complete. Mirrors the required (*) markers and the branch that is showing.
export function commercialGaps(a: CommercialAnswer): string[] {
  const gaps: string[] = [];
  if (!a.status) return ['Choose an Admin Status.'];

  if (a.status === 'Admin Process in Progress') {
    if (!a.pending_reason) gaps.push('Choose a Pending Reason.');
    return gaps;
  }

  if (!a.clearing_reason) { gaps.push('Choose a Reason for Clearing.'); return gaps; }
  if (REASONS_NEEDING_MC_SA.includes(a.clearing_reason)) {
    const v = (a.mc_sa_number ?? '').trim();
    if (!v) gaps.push('Enter the MC / SA number.');
    else if (!MC_SA_RE.test(v)) gaps.push('MC / SA number must start with MC or SA and contain no spaces.');
  }
  if (a.clearing_reason === 'Direct PO') {
    const missing = DIRECT_PO_STEPS.filter((s) => !a.direct_po?.[s]);
    if (missing.length) gaps.push(`Answer every Direct PO step (${missing.length} left).`);
  }
  return gaps;
}

// Does this answer clear the spare for Stores?
export const clearsForStores = (a: CommercialAnswer): boolean =>
  a.status === 'Cleared for Stores Processing';

// The line patch. Clearing approves the Commercial stage; "in progress" leaves
// the stage alone and only records why, so the spare stays in the queue.
export function commercialPatch(a: CommercialAnswer, actor: string): Record<string, unknown> {
  const now = new Date().toISOString();
  const answer: CommercialAnswer = { ...a, by: actor, at: now };
  const patch: Record<string, unknown> = { approval_data: { commercial: answer } };
  if (clearsForStores(a)) {
    patch.commercial_approval = 'Approved';
    patch.commercial_by = actor;
    patch.commercial_at = now;
  }
  return patch;
}

// One line for the register and the approval trail.
export function commercialSummary(a: CommercialAnswer | undefined): string {
  if (!a?.status) return '';
  if (a.status === 'Admin Process in Progress') return `In progress — ${a.pending_reason ?? ''}`.trim();
  const bits = [a.clearing_reason];
  if (a.mc_sa_number) bits.push(a.mc_sa_number);
  if (a.clearing_reason === 'Direct PO' && a.direct_po) {
    const done = DIRECT_PO_STEPS.filter((s) => a.direct_po?.[s] === 'Yes').length;
    bits.push(`${done}/${DIRECT_PO_STEPS.length} PO steps done`);
  }
  return `Cleared — ${bits.filter(Boolean).join(' · ')}`;
}

// ---------------------------------------------------------------------------
// The NSM approval form ("NSM Approval - Rithi").
//
// Flat where Commercial branches: a status, the reasons behind it — several
// may apply, plus a free-text "Other" — and remarks.
//
//   Status
//     ├─ Cleared for Stores Processing → approves the NSM stage
//     └─ Put on HOLD                   → the spare stays with NSM, held
//
// Only the status is required; the form marks neither the reasons nor the
// remarks with a *.
// ---------------------------------------------------------------------------

export const NSM_STATUSES = ['Cleared for Stores Processing', 'Put on HOLD'] as const;
export type NsmStatus = (typeof NSM_STATUSES)[number];

export const NSM_REASONS = [
  'KOL CUSTOMER', 'LONG PENDING', 'ENGINEER ASSURANCE', 'PAYMENT RECEIVED',
  'APPROVED FOR TESTING PURPOSE',
] as const;

export interface NsmAnswer {
  status: NsmStatus | '';
  reasons?: string[];
  other?: string;
  remarks?: string;
  by?: string;
  at?: string;
}

export function nsmGaps(a: NsmAnswer): string[] {
  return a.status ? [] : ['Choose a Status.'];
}

export const nsmClearsForStores = (a: NsmAnswer): boolean => a.status === 'Cleared for Stores Processing';

export function nsmPatch(a: NsmAnswer, actor: string): Record<string, unknown> {
  const now = new Date().toISOString();
  const answer: NsmAnswer = { ...a, by: actor, at: now };
  const patch: Record<string, unknown> = { approval_data: { nsm: answer } };
  if (nsmClearsForStores(a)) {
    patch.nsm_approval = 'Approved';
    patch.nsm_by = actor;
    patch.nsm_at = now;
  }
  return patch;
}

export function nsmSummary(a: NsmAnswer | undefined): string {
  if (!a?.status) return '';
  const why = [...(a.reasons ?? []), (a.other ?? '').trim()].filter(Boolean).join(', ');
  const head = a.status === 'Put on HOLD' ? 'On hold' : 'Cleared';
  return why ? `${head} — ${why}` : head;
}

// Both forms write under approval_data; merging keeps the other stage's answer.
export const mergeApprovalData = (
  existing: unknown, patch: Record<string, unknown>,
): Record<string, unknown> => ({
  ...(typeof existing === 'object' && existing ? (existing as Record<string, unknown>) : {}),
  ...((patch.approval_data as Record<string, unknown>) ?? {}),
});

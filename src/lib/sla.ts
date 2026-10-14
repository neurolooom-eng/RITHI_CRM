// ===========================================================================
// SLA engine. Rules are configurable (Admin Config → hours + on/off); the
// LOGIC of which event each rule measures is fixed here. Given a call's facts,
// evaluate the applicable open-call rules to on-track / due-soon / breached.
// ===========================================================================

export interface SlaRule { key: string; label: string; target_hours: number; active: boolean; sort_order: number }

export const DEFAULT_SLA_RULES: SlaRule[] = [
  { key: 'first_visit', label: 'First visit', target_hours: 72, active: true, sort_order: 1 },
  { key: 'closure', label: 'Call closure', target_hours: 120, active: true, sort_order: 2 },
  { key: 'closure_spare', label: 'Closure — call includes a spare', target_hours: 168, active: true, sort_order: 3 },
  { key: 'closure_spare_noncover', label: 'Closure — spare & not in CMC / WGP', target_hours: 240, active: true, sort_order: 4 },
  { key: 'stores_dispatch', label: 'Stores dispatch — from final approval', target_hours: 72, active: true, sort_order: 5 },
];

export type SlaStatus = 'ok' | 'due' | 'breach';

export interface CallFacts {
  regAt?: string | null;          // registration date/time
  openState: string;              // Unattended | Unsolved | Report pending | Solved
  lastVisitAt?: string | null;    // present ⇒ visited at least once
  itemStatus?: string;            // CMC / WGP ⇒ under cover
  hasSpare?: boolean;             // a spare was requested against the call
}

export interface SlaPart { key: string; label: string; status: SlaStatus; dueAt: number; hoursLeft: number }
export interface SlaResult { worst: SlaStatus | 'na'; parts: SlaPart[] }

const ruleBy = (rules: SlaRule[], key: string) => rules.find((r) => r.key === key);
const isCover = (s?: string) => /\b(cmc|wgp)\b/i.test(s ?? '');
const rank: Record<SlaStatus | 'na', number> = { na: 0, ok: 1, due: 2, breach: 3 };

function statusFor(dueAt: number, targetHours: number, now: number): { status: SlaStatus; hoursLeft: number } {
  const hoursLeft = (dueAt - now) / 3.6e6;
  if (hoursLeft < 0) return { status: 'breach', hoursLeft };
  // "due soon" once within a quarter of the target (min 6h) of the deadline.
  const window = Math.max(6, targetHours * 0.25);
  return { status: hoursLeft <= window ? 'due' : 'ok', hoursLeft };
}

// Evaluate the open-call SLAs (first visit + the applicable closure) for one
// call. Closed calls, or calls with no registration time, return 'na'.
export function evaluateCallSla(rules: SlaRule[], facts: CallFacts, now = Date.now()): SlaResult {
  const parts: SlaPart[] = [];
  const closed = /^solved/i.test(facts.openState) && !/report pending/i.test(facts.openState);
  // A CANCELLED CALL HAS NO SLA (the user, 2026-10-13: "Remove Cancelled Calls
  // from SLA"): nobody is going, so no visit or closure can be late. It used to
  // fall through and read "Call closure · 273d over".
  const cancelled = /^cancel/i.test(facts.openState.trim());
  const reg = facts.regAt ? new Date(facts.regAt).getTime() : NaN;
  if (closed || cancelled || isNaN(reg)) return { worst: 'na', parts };

  // First visit — only while nothing has been reported yet.
  const visited = !!facts.lastVisitAt || !/unattended/i.test(facts.openState);
  const fv = ruleBy(rules, 'first_visit');
  if (!visited && fv?.active) {
    const dueAt = reg + fv.target_hours * 3.6e6;
    const { status, hoursLeft } = statusFor(dueAt, fv.target_hours, now);
    parts.push({ key: fv.key, label: fv.label, status, dueAt, hoursLeft });
  }

  // Closure — pick the most specific active rule that applies.
  const closureRule =
    (facts.hasSpare && !isCover(facts.itemStatus) && ruleBy(rules, 'closure_spare_noncover')?.active && ruleBy(rules, 'closure_spare_noncover'))
    || (facts.hasSpare && ruleBy(rules, 'closure_spare')?.active && ruleBy(rules, 'closure_spare'))
    || (ruleBy(rules, 'closure')?.active && ruleBy(rules, 'closure'))
    || null;
  if (closureRule) {
    const dueAt = reg + closureRule.target_hours * 3.6e6;
    const { status, hoursLeft } = statusFor(dueAt, closureRule.target_hours, now);
    parts.push({ key: closureRule.key, label: closureRule.label, status, dueAt, hoursLeft });
  }

  const worst = parts.reduce<SlaStatus | 'na'>((w, p) => (rank[p.status] > rank[w] ? p.status : w), 'na');
  return { worst, parts };
}

export const slaTone = (s: SlaStatus | 'na'): string =>
  s === 'breach' ? 'danger' : s === 'due' ? 'warning' : s === 'ok' ? 'success' : 'neutral';
export const slaLabel = (s: SlaStatus | 'na'): string =>
  s === 'breach' ? 'SLA breached' : s === 'due' ? 'SLA due soon' : s === 'ok' ? 'On track' : '—';

// Human "in 6h" / "3h over".
export function slaWhen(hoursLeft: number): string {
  const h = Math.abs(hoursLeft);
  const txt = h >= 48 ? `${Math.round(h / 24)}d` : h >= 1 ? `${Math.round(h)}h` : `${Math.round(h * 60)}m`;
  return hoursLeft < 0 ? `${txt} over` : `in ${txt}`;
}

// ---------------------------------------------------------------------------
// ONE LIST PER SLA (the user, 2026-10-13: "Segregate the SLA Breach. Name it.
// Add Provision to Name the SLA. And use that name to Display. Every SLA
// should display a List separately").
//
// Each call is judged against every rule that applies to it, so a call late
// for its first visit AND its closure belongs on BOTH lists -- that is the
// point of separating them. A list holds the calls whose part for that rule is
// breached or due soon, breached first and then the nearest deadline. Lists
// come out in the rules' own order and carry the rule, whose `label` is the
// name an administrator gives it on SLA Targets. A rule nothing was judged
// against (switched off, or not a call rule, like Stores dispatch) gets no
// list.
// ---------------------------------------------------------------------------
export interface SlaRuleList<T> {
  rule: SlaRule;
  items: { item: T; part: SlaPart }[];
  breached: number;
  due: number;
}
export function slaByRule<T>(rules: SlaRule[], judged: { item: T; sla: SlaResult }[]): SlaRuleList<T>[] {
  const by = new Map<string, { item: T; part: SlaPart }[]>();
  for (const { item, sla } of judged) {
    for (const part of sla.parts) {
      if (part.status !== 'breach' && part.status !== 'due') continue;
      by.set(part.key, [...(by.get(part.key) ?? []), { item, part }]);
    }
  }
  return [...rules]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((r) => by.has(r.key))
    .map((rule) => {
      const items = (by.get(rule.key) ?? []).sort((a, b) =>
        (a.part.status === 'breach' ? 0 : 1) - (b.part.status === 'breach' ? 0 : 1) || a.part.hoursLeft - b.part.hoursLeft);
      return {
        rule, items,
        breached: items.filter((x) => x.part.status === 'breach').length,
        due: items.filter((x) => x.part.status === 'due').length,
      };
    });
}

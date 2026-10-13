// ===========================================================================
// THE DASHBOARD READ THE FAILURE INSIGHTS WAY (the user, 2026-10-13: "Add the
// Design Ideas in Failure Insights for the Dashboard as well. Add a Provision
// to Download the Data").
//
// The same four ideas, chosen by the user:
//   * click a bar, slice or period to narrow EVERY figure on the page to it,
//     again to clear -- the picks shown as chips;
//   * the calls trend read by Year / Quarter / Month, with its numbers beside
//     it (calls, change on the period before, share, running total);
//   * a small table of figures beside each chart;
//   * a download per block (gated on the role's export right, not here).
//
// PURE, like partfit.ts and paging.ts, so check:ui can run it. One list of
// dimensions drives the filtering, the chips and the charts, so a dimension
// cannot be filterable but unnamed. Each chart counts the rows left by every
// OTHER pick (the cross-filter rule FieldFailureInsights states): filtering the
// product chart by the product just clicked would collapse it to one bar.
// ===========================================================================
import { parseAnyDate } from './dates';

type Row = Record<string, unknown>;
const s = (r: Row, k: string) => String(r[k] ?? '').trim();

export type DashPeriod = 'month' | 'quarter' | 'year';
export const DASH_PERIODS: { key: DashPeriod; label: string }[] = [
  { key: 'month', label: 'Monthly' },
  { key: 'quarter', label: 'Quarterly' },
  { key: 'year', label: 'Yearly' },
];

export const DASH_DIMS = [
  { key: 'productName', label: 'Product' },
  { key: 'allocatedTo', label: 'Engineer' },
  { key: 'itemStatus', label: 'Item status' },
  { key: 'period', label: 'Period' },
] as const;
export type DashDimKey = (typeof DASH_DIMS)[number]['key'];
export type DashPicked = Partial<Record<DashDimKey, string>>;

export const NOT_STATED = '(not stated)';
export const NO_DATE = '(no date)';

/** The day a call counts in: its registration date, else its complaint date
 *  -- the rule Calls This Month always used. Day-first, through the one parser. */
export function callDay(r: Row): Date | null {
  return parseAnyDate(r.regDate) ?? parseAnyDate(r.complaintDate);
}

/** The period bucket a call falls in: 2026-03, 2026-Q1 or 2026; '' undated. */
export function dashPeriodKey(d: Date | null, p: DashPeriod): string {
  if (!d || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear(), m = d.getMonth() + 1;
  if (p === 'year') return String(y);
  if (p === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** What a row holds for a dimension, as the chart labels it -- including the
 *  blank label, so clicking "(not stated)" picks exactly the rows it counted. */
export function dashValue(r: Row, k: DashDimKey, p: DashPeriod): string {
  if (k === 'period') return dashPeriodKey(callDay(r), p) || NO_DATE;
  return s(r, k) || NOT_STATED;
}

/** Rows matching every pick EXCEPT `except` (a chart's own dimension). */
export function applyDashPicks<T extends Row>(rows: T[], picked: DashPicked, p: DashPeriod, except?: DashDimKey): T[] {
  const keys = (Object.keys(picked) as DashDimKey[]).filter((k) => k !== except && picked[k]);
  if (!keys.length) return rows;
  return rows.filter((r) => keys.every((k) => dashValue(r, k, p) === picked[k]));
}

export interface DashCount { label: string; value: number; share: number }

/** Count by a dimension, biggest first; blanks gathered, never dropped. */
export function dashTally(rows: Row[], k: Exclude<DashDimKey, 'period'>): DashCount[] {
  const m = new Map<string, number>();
  for (const r of rows) { const v = dashValue(r, k, 'month'); m.set(v, (m.get(v) ?? 0) + 1); }
  const total = rows.length;
  return [...m.entries()].map(([label, value]) => ({ label, value, share: total ? value / total : 0 }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export interface DashTrendRow { label: string; value: number; change: number | null; share: number; running: number }

/** Calls per period, OLDEST first, with the change on the row before (null for
 *  the first -- "no period before" is not "no change"), share and running
 *  total. An undated call is in no period, so the shares add up to the dated
 *  calls, and the caller says how many were undated. */
export function dashTrend(rows: Row[], p: DashPeriod): { rows: DashTrendRow[]; total: number; undated: number } {
  const m = new Map<string, number>();
  let undated = 0;
  for (const r of rows) {
    const k = dashPeriodKey(callDay(r), p);
    if (!k) { undated++; continue; }
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const sorted = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const total = sorted.reduce((n, [, v]) => n + v, 0);
  let run = 0;
  const out = sorted.map(([label, value], i) => {
    run += value;
    return { label, value, change: i === 0 ? null : value - sorted[i - 1][1], share: total ? value / total : 0, running: run };
  });
  return { rows: out, total, undated };
}

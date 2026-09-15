// ===========================================================================
// MY WORKLOAD — the counts that used to sit on top of every register.
//
// The user, 2026-09-15: "Remove such cards in Main Views. Move those to a
// Separate KPI Cards Page where ever applicable. It should be interactive -
// Say if i click on Pending, it should give me the List." Asked which cards,
// the answer was every card off every register; asked what to call it, My
// Workload, under Overview.
//
// A SECTION IS DEFINED HERE, NOT ON THE REGISTER, and the counts are derived
// with the register's OWN helpers (`spareflow.ts`, `callstate.tsx`) rather than
// re-implemented. A count that disagrees with the register it links to is worse
// than no count: somebody opens the list to find a different number and stops
// trusting both.
//
// TWO KINDS OF CARD AND THEY ARE NOT INTERCHANGEABLE:
//   • a QUEUE has a list behind it, so it opens the register with that filter;
//   • a FIGURE counts units, engineers or days. There is no list of 12 "units
//     in the field" and none of an ageing of 4.2 days, so it opens nothing and
//     does not look as though it would. `KpiCard` renders the two differently
//     by whether `onOpen` is given, which is why `to` is optional here.
//
// EVERY COUNT IS OVER WHAT LOADED. These registers page a thousand rows at a
// time, so a section that has not read everything says `more`, and the card
// shows `+` — the rule this project applies everywhere else and would be
// easiest to drop on a screen made of counts.
// ===========================================================================
import type { KpiTone } from '../components/kpi/Kpi';

export interface WorkloadCard {
  label: string;
  value: number;
  sub: string;
  icon: string;
  tone: KpiTone;
  /** The register this opens, with the filter it should arrive carrying.
   *  Absent = a figure, not a queue: it opens nothing and must not look as
   *  though it would. */
  to?: { path: string; state?: Record<string, unknown>; opens: string };
}

export interface WorkloadSection {
  key: string;
  title: string;
  /** The register these came off, for the "open the whole register" link. */
  path: string;
  /** Which permission the reader needs — a section whose register they cannot
   *  open is not shown at all, rather than shown and refused on the click. */
  needs: string;
  cards: WorkloadCard[];
  /** True while rows are still waiting behind Load more, so every count in the
   *  section is a lower bound. */
  more: boolean;
}

// ---------------------------------------------------------------------------
// THE SECTIONS.
//
// Each loads the register's OWN data through the register's OWN loader, and
// counts it with the register's OWN helper (`summarise`, `deriveStage`,
// `countCallReviews`). Nothing is re-derived: a count that disagrees with the
// register it links to is worse than no count, because somebody opens the list,
// finds a different number, and stops trusting both.
//
// ALL MASTERS IS NOT HERE, deliberately. Its cards ARE the register — one per
// master list, which is what that screen is for — rather than a header above a
// list of something else. Moving them would leave the page with nothing on it.
// ---------------------------------------------------------------------------
import {
  listSpareRequestLines, listPendingRmApproval, listPendingDispatch,
  listMaterialReturns, listStockTransfers, listHandstockBalance, countCallReviews,
} from './supabase';
import { deriveStage, actionable, type Stage } from './spareflow';
import { summarise as summariseQueue, toPendingLine, daysWaiting } from './sparedispatch';
import { summarise as summariseStock, type HandstockBalance } from './handstock';

const g = (r: Record<string, unknown>, k: string) => String(r[k] ?? '').trim();
const num = (v: unknown) => Number(v ?? 0) || 0;
/** The page reads a thousand rows per request like every register; this is the
 *  budget beyond which a section admits it is showing a lower bound. */
const SCAN = 4000;

export type Can = (action: string) => boolean;

/** Spare Requests — the six stages, and the one that is yours to act on.
 *
 *  `actionable` is the register's own test, so "Awaiting me" here is the same
 *  question the ⚡ chip answers there. It needs the reader's identity, which is
 *  why this takes `can` and `email` rather than working them out again. */
export async function spareRequestSection(
  can: Can, email: string, mayRmApprove: (engineer: unknown) => boolean,
): Promise<WorkloadSection> {
  const rows = await listSpareRequestLines(SCAN, 0);
  const c: Record<string, number> = {};
  let mine = 0;
  rows.forEach((r) => {
    const s = deriveStage(r);
    c[s] = (c[s] ?? 0) + 1;
    if (actionable(r, can, email, mayRmApprove)) mine += 1;
  });
  const at = (s: Stage) => c[s] ?? 0;
  const open = (stage: string, opens: string) =>
    ({ path: '/spare-requests', state: { stageFilter: stage }, opens });
  return {
    key: 'spares', title: 'Spare Requests', path: '/spare-requests', needs: 'mod:/spare-requests',
    more: rows.length >= SCAN,
    cards: [
      { label: 'Awaiting me', value: mine, sub: 'requests you can action', icon: '⚡', tone: 'primary',
        to: open('mine', 'the requests you can action') },
      { label: 'In approval', value: at('RM Approval') + at('Commercial') + at('NSM'),
        sub: 'RM · Commercial · NSM', icon: '🕒', tone: 'warning',
        to: open('RM Approval', 'the requests waiting for an RM') },
      { label: 'Awaiting dispatch', value: at('Stores'), sub: 'cleared, with Stores', icon: '📦', tone: 'info',
        to: open('Stores', 'the requests cleared for Stores') },
      { label: 'Dispatched', value: at('Dispatched'), sub: 'in transit to the field', icon: '🚚', tone: 'info',
        to: open('Dispatched', 'the dispatched requests') },
      { label: 'Received', value: at('Received'), sub: 'acknowledged by the engineer', icon: '✅', tone: 'success',
        to: open('Received', 'the received requests') },
      { label: 'Rejected', value: at('Rejected'), sub: 'closed without dispatch', icon: '✕', tone: 'danger',
        to: open('Rejected', 'the rejected requests') },
    ],
  };
}

/** RM Approval — the first gate. `Longest waiting` is a figure in DAYS: there
 *  is no list of "7 days" to open, so it carries no `to`. */
export async function rmApprovalSection(): Promise<WorkloadSection> {
  const rows = await listPendingRmApproval(SCAN);
  // `raised_at` is what the register measures the wait from, through the same
  // `daysWaiting`. THE NUMBER IS OVER THE WHOLE QUEUE here, where the register's
  // card was over the reader's own share — so the label says which, rather than
  // two screens showing "Longest waiting" and meaning different things.
  const oldest = rows.reduce((n, r) => Math.max(n, daysWaiting(g(r, 'raised_at'))), 0);
  return {
    key: 'rm', title: 'RM Approval', path: '/spare-rm-approval', needs: 'mod:/spare-rm-approval',
    more: rows.length >= SCAN,
    cards: [
      { label: 'Waiting for an RM', value: rows.length, sub: 'first approval outstanding', icon: '⏳', tone: 'primary',
        to: { path: '/spare-rm-approval', opens: 'the RM approval queue' } },
      { label: 'Engineers', value: new Set(rows.map((r) => g(r, 'engineer'))).size, sub: 'with something waiting',
        icon: '👷', tone: 'neutral' },
      { label: 'Longest waiting', value: oldest, sub: 'days, oldest in the queue', icon: '⏱️',
        tone: oldest >= 7 ? 'danger' : oldest >= 3 ? 'warning' : 'neutral' },
    ],
  };
}

/** Pending Dispatch — Stores' queue, counted by the register's own summary. */
export async function dispatchSection(): Promise<WorkloadSection> {
  const rows = await listPendingDispatch(SCAN);
  const t = summariseQueue(rows.map(toPendingLine));
  return {
    key: 'dispatch', title: 'Pending Dispatch', path: '/spare-dispatch', needs: 'mod:/spare-dispatch',
    more: rows.length >= SCAN,
    cards: [
      { label: 'Spares waiting', value: t.spares, sub: 'cleared every approval', icon: '📦', tone: 'primary',
        to: { path: '/spare-dispatch', opens: 'the dispatch queue' } },
      { label: 'Ageing', value: t.ageing, sub: 'waiting a week or more', icon: '⏳',
        tone: t.ageing ? 'danger' : 'neutral',
        to: t.ageing ? { path: '/spare-dispatch', opens: 'the dispatch queue' } : undefined },
      { label: 'Units', value: t.qty, sub: 'to be booked out', icon: '🔩', tone: 'info' },
      { label: 'Engineers', value: t.engineers, sub: 'waiting for a delivery', icon: '👤', tone: 'info' },
      { label: 'Orders', value: t.orders, sub: 'ORs represented', icon: '📄', tone: 'neutral' },
    ],
  };
}

/** Hand Stock — what the field is holding, and the two lines that are queries.
 *  `Short` is a finding (taken without a stock out), so it opens the register. */
export async function handStockSection(): Promise<WorkloadSection> {
  const rows = await listHandstockBalance(SCAN, 0) as unknown as HandstockBalance[];
  const t = summariseStock(rows);
  return {
    key: 'handstock', title: 'Hand Stock', path: '/handstock', needs: 'mod:/handstock',
    more: rows.length >= SCAN,
    cards: [
      { label: 'Short', value: t.shortLines, sub: 'taken without a stock out', icon: '⚠️',
        tone: t.shortLines ? 'danger' : 'neutral',
        to: t.shortLines
          ? { path: '/handstock', state: { holding: 'short' }, opens: 'the short lines' }
          : undefined },
      { label: 'Units in the field', value: t.onHand, sub: 'held across every engineer', icon: '🎒', tone: 'primary' },
      { label: 'Engineers holding', value: t.engineers, sub: 'with at least one spare in hand', icon: '👤', tone: 'info' },
      { label: 'Spares held', value: t.partCodes, sub: 'distinct part codes', icon: '🔩', tone: 'info' },
      { label: 'Stock out', value: t.stockOut, sub: 'issued by Stores on a DC', icon: '📤', tone: 'success' },
      { label: 'Consumed', value: t.consumed, sub: 'used on calls', icon: '🧾', tone: 'neutral' },
      { label: 'Returned', value: t.returned, sub: 'sent back on an MRN', icon: '↩️', tone: 'info' },
    ],
  };
}

/** Material Returns — all figures. Nothing here is a queue somebody works. */
export async function materialReturnsSection(): Promise<WorkloadSection> {
  const rows = await listMaterialReturns(SCAN, 0);
  const notes = new Set(rows.map((r) => g(r, 'uid'))).size;
  return {
    key: 'mrn', title: 'Material Returns', path: '/mrn', needs: 'mod:/mrn',
    more: rows.length >= SCAN,
    cards: [
      { label: 'Returns', value: notes, sub: 'MRNs raised', icon: '↩️', tone: 'primary',
        to: { path: '/mrn', opens: 'the returns register' } },
      { label: 'Items returned', value: rows.length, sub: 'lines across every MRN', icon: '🔩', tone: 'info' },
      { label: 'Good', value: rows.reduce((n, r) => n + num(r.good_qty), 0), sub: 'back to Stores, usable',
        icon: '✅', tone: 'success' },
      { label: 'Defective', value: rows.reduce((n, r) => n + num(r.defective_qty), 0), sub: 'back to Stores, faulty',
        icon: '⚠️', tone: 'warning' },
    ],
  };
}

/** Stock Transfer — all figures, for the same reason. */
export async function stockTransferSection(): Promise<WorkloadSection> {
  const rows = await listStockTransfers(SCAN);
  return {
    key: 'transfer', title: 'Stock Transfer', path: '/stock-transfer', needs: 'mod:/stock-transfer',
    more: rows.length >= SCAN,
    cards: [
      { label: 'Transfers', value: new Set(rows.map((r) => g(r, 'uid'))).size, sub: 'movements recorded',
        icon: '🔄', tone: 'primary', to: { path: '/stock-transfer', opens: 'the transfer register' } },
      { label: 'Transfer lines', value: rows.length, sub: 'parts moved', icon: '📦', tone: 'info' },
      { label: 'Units moved', value: rows.reduce((n, r) => n + num(r.qty), 0), sub: 'across every transfer',
        icon: 'Σ', tone: 'success' },
      { label: 'Engineers involved', value: new Set(rows.flatMap((r) => [g(r, 'from_engineer'), g(r, 'to_engineer')])
        .filter(Boolean)).size, sub: 'sending or receiving', icon: '👷', tone: 'neutral' },
    ],
  };
}

/** Daily Call Review — the only section whose counts are EXACT.
 *
 *  `countCallReviews` walks every page in the database rather than counting
 *  what a screen has loaded, so this section never says `more` and its cards
 *  take no `+`. "3,850+" would be wrong in the other direction. */
export async function reviewSection(): Promise<WorkloadSection> {
  const c = await countCallReviews({});
  const at = (s: string) => c.byStatus[s] ?? 0;
  const open = (status: string, opens: string) =>
    ({ path: '/daily-review', state: { status }, opens });
  return {
    key: 'review', title: 'Daily Call Review', path: '/daily-review', needs: 'mod:/daily-review',
    more: false,
    cards: [
      { label: 'Review 1 Pending', value: at('Review 1 Pending'), sub: 'the first look', icon: '1️⃣',
        tone: at('Review 1 Pending') ? 'danger' : 'neutral',
        to: open('Review 1 Pending', 'the calls awaiting review 1') },
      { label: 'Review 2 Pending', value: at('Review 2 Pending'), sub: 'the failure questions', icon: '2️⃣',
        tone: at('Review 2 Pending') ? 'warning' : 'neutral',
        to: open('Review 2 Pending', 'the calls awaiting review 2') },
      { label: 'Review 3 Pending', value: at('Review 3 Pending'), sub: 'the closing review', icon: '3️⃣',
        tone: at('Review 3 Pending') ? 'info' : 'neutral',
        to: open('Review 3 Pending', 'the calls awaiting review 3') },
      { label: 'Any Potential Effect', value: c.effects, sub: 'FFR to be raised', icon: '⚠️',
        tone: c.effects ? 'danger' : 'neutral',
        to: open('', 'the Daily Call Review') },
      { label: 'Review Completed', value: at('Review Completed'), sub: 'nothing left to answer', icon: '✅',
        tone: 'success', to: open('Review Completed', 'the completed reviews') },
      { label: 'Calls in view', value: c.total, sub: 'on the register', icon: '📋', tone: 'neutral' },
    ],
  };
}

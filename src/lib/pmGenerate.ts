// ===========================================================================
// CREATE PM CALLS FOR CHOSEN VISITS -- one step, used by PM Due and by the PM
// schedule in a Warranty / Contract entry (0407), so the two cannot create a
// call differently.
//
// The visits are grouped by the month they are DATED to; for each month the
// first call is registered 10 seconds after the largest registration time
// among ALL PM calls of that month (pm_due_latest_reg_at, read now, not when
// the list was loaded), each next 10 seconds later -- 00:30 on the 1st, 5
// seconds apart, for a month with none (the user, 2026-10-08). The rows are
// shaped by shapePmDueRows -> shapePmRows, the monthly upload's shaping, and
// written through the `calls` view, where the database numbers each call.
// ===========================================================================
import { pmDueLatestRegAt, uploadRows } from './supabase';
import { shapePmDueRows, pmStartDefaults, type PmDueMachine } from './pmImport';

export interface PmCreateResult { ok: boolean; written: number; error?: string; firstAt?: string; latestBefore?: string | null }

export async function createPmCalls(
  byMonth: { month: string; visits: PmDueMachine[] }[],
  onProgress?: (done: number, total: number) => void,
): Promise<PmCreateResult> {
  const total = byMonth.reduce((n, g) => n + g.visits.length, 0);
  let written = 0;
  let firstAt: string | undefined;
  let latestBefore: string | null | undefined;
  for (const g of byMonth) {
    if (!g.visits.length) continue;
    const latest = await pmDueLatestRegAt(g.month);
    const { startLocal, stepSec } = pmStartDefaults(g.month, latest);
    if (firstAt === undefined) { firstAt = startLocal; latestBefore = latest; }
    const shaped = shapePmDueRows(g.visits, g.month, startLocal, stepSec);
    const base = written;
    const res = await uploadRows('calls', shaped, undefined, (done) => onProgress?.(base + done, total));
    written += res.written;
    if (!res.ok) return { ok: false, written, error: res.error, firstAt, latestBefore };
  }
  return { ok: true, written, firstAt, latestBefore };
}

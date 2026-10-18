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
import { pmDueLatestRegAt, pmDueNextCallSeq, uploadRows } from './supabase';
import { shapePmDueRows, pmStartDefaults, type PmDueMachine } from './pmImport';

export interface PmCreateResult { ok: boolean; written: number; error?: string; firstAt?: string; latestBefore?: string | null; firstCallNumber?: string }

export async function createPmCalls(
  // `latest` is the month's latest registration time when the caller has just
  // read it and shown it (PM Due's confirmation), so the batch follows exactly
  // the call it was told it follows; left out, it is read here.
  // `seq` likewise: the month's next running number, as just read and shown.
  byMonth: { month: string; visits: PmDueMachine[]; latest?: string | null; seq?: number }[],
  onProgress?: (done: number, total: number) => void,
): Promise<PmCreateResult> {
  const total = byMonth.reduce((n, g) => n + g.visits.length, 0);
  let written = 0;
  let firstAt: string | undefined;
  let latestBefore: string | null | undefined;
  let firstCallNumber: string | undefined;
  for (const g of byMonth) {
    if (!g.visits.length) continue;
    const latest = g.latest !== undefined ? g.latest : await pmDueLatestRegAt(g.month);
    const { startLocal, stepSec } = pmStartDefaults(g.month, latest);
    if (firstAt === undefined) { firstAt = startLocal; latestBefore = latest; }
    // THE MONTH'S NUMBERING CONTINUES (0447, the user 2026-10-18): each call
    // is numbered <YY>PM<MON><NNNN>-<letter>-<product>-<serial> from the next
    // running number, in the order of its registration time.
    const seq = g.seq !== undefined ? g.seq : await pmDueNextCallSeq(g.month);
    const shaped = shapePmDueRows(g.visits, g.month, startLocal, stepSec, seq);
    if (firstCallNumber === undefined) firstCallNumber = String(shaped[0]?.call_number ?? '');
    const base = written;
    const res = await uploadRows('calls', shaped, undefined, (done) => onProgress?.(base + done, total));
    written += res.written;
    if (!res.ok) return { ok: false, written, error: res.error, firstAt, latestBefore, firstCallNumber };
  }
  return { ok: true, written, firstAt, latestBefore, firstCallNumber };
}

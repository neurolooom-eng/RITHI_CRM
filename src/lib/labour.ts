// ===========================================================================
// LABOUR CHARGES — booked on a consumption, never held as stock (0413, D-163).
//
// The user, 2026-10-12: "These 3 are Labour charges, Stock need not be
// maintained since it not something physically accounted for. And Users can
// add these to Consumption -- It is meant more for tracking -- the Qty should
// always be 1 when it is being selected." (SC001 service, TC001 transport,
// INS-001 installation.)
//
// WHICH parts are labour is the Part Master's `labour_charge` tick, never a
// list in this file. A labour part is offered on every consumption picker
// whatever the engineer holds, its quantity is 1 and cannot be typed, and it
// has no hand stock — the database leaves it out of `handstock_movements`,
// refuses any other quantity, and sends no negative-stock notice for it.
//
// Pure functions only, for the `paging.ts` reason: `supabase.ts` reads
// `import.meta.env`, so the hook that loads the list is `useLabourParts.ts`.
// ===========================================================================
import { partCode, partName } from './parts';

export interface LabourPart {
  /** Upper-case, as `part_code()` writes it. */
  code: string;
  /** The catalogue string a consumption line carries: "CODE|Description". */
  part: string;
}

/** A labour charge is booked once: quantity 1, always. */
export const LABOUR_QTY = 1;

export const isLabourPart = (part: unknown, codes: ReadonlySet<string>): boolean =>
  !!String(part ?? '').trim() && codes.has(partCode(part));

/** The picker's label: the part, and that it is a charge, not stock. */
export const labourOptionLabel = (p: LabourPart): string =>
  `${p.code} — ${partName(p.part) || p.code} · labour charge, qty 1`;

/** One part per code, from Part Master rows; a row without a code is skipped. */
export const labourPartsFrom = (rows: { code?: unknown; item_detail?: unknown }[]): LabourPart[] => {
  const seen = new Map<string, LabourPart>();
  for (const r of rows) {
    const code = partCode(r.code ?? r.item_detail);
    if (!code || seen.has(code)) continue;
    seen.set(code, { code, part: String(r.item_detail ?? '').trim() || code });
  }
  return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code));
};

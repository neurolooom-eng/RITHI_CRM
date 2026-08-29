// ---------------------------------------------------------------------------
// Hand stock — what an engineer is holding right now.
//
// Nothing is entered for hand stock: it is the running difference between two
// movements the app already records.
//   IN   a spare request the engineer acknowledged as received
//   OUT  a spare consumed against a call report
// Postgres nets them per engineer + part (views `handstock_movements` and
// `handstock_balance`, migration 0016). This module is the shape of those rows
// and the small amount of judgement the register applies on top: which part
// codes are short, and how a balance reads.
// ---------------------------------------------------------------------------

export interface HandstockBalance {
  engineer_key: string;
  engineer: string;
  engineer_email: string;
  part_code: string;
  part: string;
  received: number;
  consumed: number;
  on_hand: number;
  last_in: string | null;
  last_out: string | null;
  last_movement: string | null;
  movements: number;
}

export interface HandstockMovement {
  direction: 'IN' | 'OUT';
  engineer_key: string;
  engineer: string;
  engineer_email: string;
  part_code: string;
  part: string;
  qty: number;
  moved_at: string | null;
  ref: string;
  ref_type: string;
  ref_uid: string;
  ucn: string;
  call_number: string;
  party_name: string;
  remarks: string;
}

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// The part's catalogue string is "CODE|Description"; only the code identifies
// it, and the description is what a human reads.
export const partCode = (part: unknown): string => String(part ?? '').split('|')[0]!.trim().toUpperCase();
export const partDescription = (part: unknown): string => {
  const s = String(part ?? '');
  const i = s.indexOf('|');
  return (i === -1 ? '' : s.slice(i + 1)).trim();
};

// How a balance reads. Negative is a real state, not a glitch: parts were
// consumed that no acknowledged receipt covers — stock carried from before the
// receipt step, or a delivery nobody acknowledged.
export type StockTone = 'success' | 'neutral' | 'danger';
export const balanceTone = (onHand: number): StockTone =>
  onHand < 0 ? 'danger' : onHand > 0 ? 'success' : 'neutral';

export interface HandstockSummary {
  engineers: number;   // people holding at least one part
  partCodes: number;   // distinct parts held
  onHand: number;      // total units in the field
  shortLines: number;  // engineer+part lines that have gone negative
  received: number;
  consumed: number;
}

export function summarise(rows: HandstockBalance[]): HandstockSummary {
  const engineers = new Set<string>();
  const parts = new Set<string>();
  let onHand = 0; let shortLines = 0; let received = 0; let consumed = 0;
  for (const r of rows) {
    const bal = num(r.on_hand);
    received += num(r.received);
    consumed += num(r.consumed);
    if (bal > 0) { engineers.add(r.engineer_key); parts.add(r.part_code); onHand += bal; }
    if (bal < 0) shortLines += 1;
  }
  return { engineers: engineers.size, partCodes: parts.size, onHand, shortLines, received, consumed };
}

// One engineer's position, for the per-engineer view and the drawer header.
export interface EngineerHolding { engineer_key: string; engineer: string; lines: number; onHand: number }

export function byEngineer(rows: HandstockBalance[]): EngineerHolding[] {
  const map = new Map<string, EngineerHolding>();
  for (const r of rows) {
    const cur = map.get(r.engineer_key) ?? { engineer_key: r.engineer_key, engineer: r.engineer, lines: 0, onHand: 0 };
    const bal = num(r.on_hand);
    if (bal !== 0) cur.lines += 1;
    cur.onHand += bal;
    map.set(r.engineer_key, cur);
  }
  return [...map.values()].sort((a, b) => b.onHand - a.onHand || a.engineer.localeCompare(b.engineer));
}

// ---------------------------------------------------------------------------
// Hand stock — the stock level an engineer is carrying, per spare.
//
//   Stock Level = Stock Out (from Stores) − Consumption
//               − Stock Transfer From    + Stock Transfer To
//               − Returned to Stores on an MRN
//
// Nothing is entered for a stock level: a Stores dispatch against an OR, a
// spare consumed on a call, and a hand-over recorded on Stock Transfer are all
// movements the app already has. Postgres nets them per engineer + spare (views
// `handstock_movements` / `handstock_balance`, migration 0022). This module is
// the shape of those rows and the judgement the register applies on top.
// ---------------------------------------------------------------------------

export interface HandstockBalance {
  engineer_key: string;
  engineer: string;
  engineer_email: string;
  part_code: string;
  part: string;
  // What the engineer was already carrying before the movement history begins
  // (WinMax HS, and the yearly pools alongside it — 0074).
  opening: number;
  stock_out: number;
  consumed: number;
  transferred_in: number;
  transferred_out: number;
  returned: number;
  on_hand: number;
  last_in: string | null;
  last_out: string | null;
  last_movement: string | null;
  movements: number;
  // WHERE THE NUMBER CAME FROM (0102). Three of the nine arms are not this
  // system's own record — they are the sheet era, loaded once: the opening
  // pools, every stock out before 2026, and the yearly consumption exports.
  // A level that looks wrong is usually a question about those, so the balance
  // says how much of itself they account for.
  //
  //   on_hand - hist_net = on_hand_live, always.
  //
  // Neither figure is a correction of the other: they answer different
  // questions. `on_hand` is everything on record; `on_hand_live` is what this
  // application has itself recorded.
  hist_stock_out: number;
  hist_consumed: number;
  hist_net: number;
  on_hand_live: number;
}

export type MovementKind = 'Stock out' | 'Consumption' | 'Transfer in' | 'Transfer out' | 'Return';

export interface HandstockMovement {
  direction: 'IN' | 'OUT';
  movement: MovementKind;
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
  // For a transfer this is the engineer on the other side of it; for a Stores
  // dispatch, the party the OR was raised against.
  party_name: string;
  remarks: string;
}

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// A spare's catalogue string is "CODE|Description"; only the code identifies
// it, and the description is what a human reads. Both must match Postgres's
// part_code() / handstock_key(), which is how the two sides are joined.
export const partDescription = (part: unknown): string => {
  const s = String(part ?? '');
  const i = s.indexOf('|');
  return (i === -1 ? '' : s.slice(i + 1)).trim();
};
export const engineerKey = (name: unknown): string => String(name ?? '').trim().toLowerCase();

// How a stock level reads. Negative is a real state, not a glitch: more was
// consumed or handed on than Stores has issued — stock carried from before the
// register existed, or a spare taken without a DC.
export type StockTone = 'success' | 'neutral' | 'danger';
export const balanceTone = (onHand: number): StockTone =>
  onHand < 0 ? 'danger' : onHand > 0 ? 'success' : 'neutral';

export const movementTone = (m: MovementKind): 'success' | 'neutral' | 'info' | 'warning' =>
  m === 'Stock out' ? 'success' : m === 'Consumption' ? 'neutral' : m === 'Return' ? 'warning' : 'info';

export interface HandstockSummary {
  engineers: number;   // people holding at least one spare
  partCodes: number;   // distinct spares held
  onHand: number;      // total units in the field
  shortLines: number;  // engineer+spare lines that have gone negative
  stockOut: number;
  consumed: number;
  returned: number;   // sent back to Stores on an MRN
  transferred: number; // units handed between engineers (counted once)
}

export function summarise(rows: HandstockBalance[]): HandstockSummary {
  const engineers = new Set<string>();
  const parts = new Set<string>();
  let onHand = 0; let shortLines = 0; let stockOut = 0; let consumed = 0; let transferred = 0; let returned = 0;
  for (const r of rows) {
    const bal = num(r.on_hand);
    stockOut += num(r.stock_out);
    consumed += num(r.consumed);
    returned += num(r.returned);
    transferred += num(r.transferred_out); // out and in are the same movement
    if (bal > 0) { engineers.add(r.engineer_key); parts.add(r.part_code); onHand += bal; }
    if (bal < 0) shortLines += 1;
  }
  return { engineers: engineers.size, partCodes: parts.size, onHand, shortLines, stockOut, consumed, transferred, returned };
}

// One engineer's position, for the per-engineer filter and the transfer form.
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

// ---------------------------------------------------------------------------
// THE SAME LINE, WITH THE IMPORTED RECORD LEFT OUT.
//
// Not just the total: the WHOLE row is restated. A screen showing 4 in hand
// beside a stock out of 27 invites the reader to check the arithmetic and find
// it broken, so each component loses its imported part too. Transfers and
// returns are untouched — they are not part of the sheet era.
//
// One function, so the table, the chips, the KPI tiles and the search results
// cannot restate it four slightly different ways.
// ---------------------------------------------------------------------------
export function withoutHistory<T extends HandstockBalance>(r: T): T {
  return {
    ...r,
    on_hand: r.on_hand_live,
    opening: 0,
    stock_out: r.stock_out - r.hist_stock_out,
    consumed: r.consumed - r.hist_consumed,
    hist_stock_out: 0,
    hist_consumed: 0,
    hist_net: 0,
  };
}

// What one engineer can actually hand over or consume: their positive lines.
export const availableFor = (rows: HandstockBalance[], engineer: string): HandstockBalance[] => {
  const key = engineerKey(engineer);
  return rows.filter((r) => r.engineer_key === key && num(r.on_hand) > 0)
    .sort((a, b) => a.part_code.localeCompare(b.part_code));
};

// The label the pickers show: the spare, and how many of it are in hand.
export const stockOptionLabel = (r: HandstockBalance): string =>
  `${r.part} — ${num(r.on_hand)} in hand`;

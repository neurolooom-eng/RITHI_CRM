// ===========================================================================
// THE PRODUCT DATABASE, SEARCHED ON THE DEVICE.
//
// The user, 2026-09-29: "Remote location = Weak network Signal and possible
// frequent disconnection. Whole machine register on every phone / laptop as a
// cached data." ... "Search every thing relevant to Product Database from
// cached data."
//
// This module is the SEARCH half and nothing else: plain functions over an
// array of machines, no network, no storage, no `import.meta.env` -- so a node
// check can run every one of them (the paging.ts reason). machinestore.ts keeps
// the copy; supabase.ts decides when to use it.
//
// EACH FUNCTION HERE HAS A SERVER TWIN IN supabase.ts, and each keeps its
// twin's rules rather than inventing friendlier ones, because a picker that
// answers differently offline from online is a picker nobody can trust:
//
//   * A MACHINE IS ITS MODEL AND ITS SERIAL. `bySerial` with a product matches
//     the stored machine_key (lower/trim of both, hyphen KEPT -- not the
//     squashing key the app compares hand-typed values with); without one, an
//     ambiguous serial returns NULL rather than a guess. The eleven machines
//     numbered 219 are why.
//   * THE PRODUCT IS MATCHED AS OFFERED, NOT TRIMMED. The "Extend XT only" fault
//     of 2026-09-24 was a `.trim()` on one side of an equality.
//   * A PARTY is matched by the same key the server compares with in JS
//     (lower + trim) for the party screens, and exactly for the machine search,
//     which used `.eq('party_name', party.trim())`.
//   * SERIAL SEARCH RANKS THROUGH `rankSerialHits`, the same function the
//     server path ends in. Locally it sees EVERY match rather than three capped
//     reads, so it can only offer more, never less.
// ===========================================================================
import { rankSerialHits } from './callrequest';

export interface CachedMachine {
  id: number;
  createdAt: string;      // for "newest first" on the register screen
  itemName: string;       // AS STORED -- matched exactly
  serial: string;         // as stored
  party: string;          // as stored
  itemStatus: string;     // the view's worked-out cover
  serialKey: string;      // lower(btrim(serial))
  machineKey: string;     // lower(btrim(item)) | lower(btrim(serial)) -- as the DB stores it
  sheet: Record<string, unknown>;   // productRowToSheet(row): what every screen receives
  row: Record<string, unknown>;     // EVERY COLUMN of product_database, as the server sent it
}

export interface MachineHit { serial: string; product: string; party: string; city: string; state: string; address: string }

const low = (v: unknown) => String(v ?? '').trim().toLowerCase();
export const dbMachineKey = (product: unknown, serial: unknown) => `${low(product)}|${low(serial)}`;

/** One cached machine from one `product_database` row and its sheet shape. */
export function toCached(row: Record<string, unknown>, sheet: Record<string, unknown>): CachedMachine {
  return {
    id: Number(row.id ?? 0),
    createdAt: String(row.created_at ?? ''),
    itemName: String(row.item_name ?? ''),
    serial: String(row.serial_number ?? ''),
    party: String(row.party_name ?? ''),
    itemStatus: String(row.item_status ?? ''),
    serialKey: low(row.serial_number),
    machineKey: dbMachineKey(row.item_name, row.serial_number),
    sheet,
    row,
  };
}

// ---- the product names: product_register_names ---------------------------
// `where coalesce(item_name,'') <> '' group by item_name`, ordered by name.
export function productNames(ms: CachedMachine[]): { name: string; machines: number }[] {
  const n = new Map<string, number>();
  for (const m of ms) if (m.itemName !== '') n.set(m.itemName, (n.get(m.itemName) ?? 0) + 1);
  return [...n].map(([name, machines]) => ({ name, machines })).sort((a, b) => a.name.localeCompare(b.name));
}

// ---- one product's serials: sbListProductSerials --------------------------
export function productSerials(ms: CachedMachine[], product: string): string[] {
  const s = new Set<string>();
  for (const m of ms) if (m.itemName === product) { const v = m.serial.trim(); if (v) s.add(v); }
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// ---- one party's product names: sbListPartyProducts -----------------------
export function partyProducts(ms: CachedMachine[], party: string): string[] {
  const want = low(party);
  const out = new Set<string>();
  for (const m of [...ms].sort((a, b) => a.id - b.id)) if (low(m.party) === want && m.itemName) out.add(m.itemName);
  return [...out];
}

// ---- one party's machines: sbListPartyItems -------------------------------
export function partyItems(ms: CachedMachine[], party: string, product = ''): Record<string, unknown>[] {
  const want = low(party);
  return ms.filter((m) => low(m.party) === want && (!product || m.itemName === product))
    .sort((a, b) => a.id - b.id).map((m) => m.sheet);
}

// ---- one machine: sbProductBySerial ---------------------------------------
// `undefined` = not in the copy (the caller may still ask the server, since the
// copy can be up to six hours old); `null` = found but ambiguous, which is an
// ANSWER and must not be second-guessed by a server call that would say the same.
export function bySerial(ms: CachedMachine[], serial: string, product = ''): Record<string, unknown> | null | undefined {
  const key = low(serial);
  if (!key) return null;
  if (String(product ?? '').trim()) {
    const mk = dbMachineKey(product, serial);
    const hit = ms.find((m) => m.machineKey === mk);
    return hit ? hit.sheet : undefined;
  }
  const hits = ms.filter((m) => m.serialKey === key);
  if (hits.length === 0) return undefined;
  return hits.length === 1 ? hits[0].sheet : null;
}

// ---- the serial picker: sbSearchMachines ----------------------------------
export function searchMachines(ms: CachedMachine[], product: string, query: string, limit = 50, party = ''): MachineHit[] {
  const term = query.trim();
  const t = term.toLowerCase();
  const p = party.trim();
  let rows = ms.filter((m) => (!product.trim() || m.itemName === product) && (!p || m.party === p) && m.serial);
  if (t) rows = rows.filter((m) => m.serial.toLowerCase().includes(t));
  else rows = [...rows].sort((a, b) => a.serial.localeCompare(b.serial)).slice(0, limit);
  const hits = rows.map((m) => ({
    serial: m.serial, product: m.itemName, party: m.party,
    city: String(m.sheet['City'] ?? ''), state: String(m.sheet['State'] ?? ''), address: String(m.sheet['Address'] ?? ''),
  }));
  return rankSerialHits(hits, term, limit);
}

// ---- the party box on Product & Party Search: sbSearchProductParties ------
export function searchProductParties(ms: CachedMachine[], query: string, limit = 50): string[] {
  const t = query.trim().toLowerCase();
  const seen = new Set<string>(); const out: string[] = [];
  for (const m of ms) {
    const v = m.party.trim(); if (!v) continue;
    if (t && !v.toLowerCase().includes(t)) continue;
    const k = v.toLowerCase(); if (seen.has(k)) continue;
    seen.add(k); out.push(v);
  }
  return out.sort((a, b) => a.localeCompare(b)).slice(0, limit);
}

// ---- the register screen: sbSearchProducts -------------------------------
export interface ProductFilters { q?: string; party?: string; product?: string; serial?: string; status?: string; exact?: boolean }
export function searchProducts(ms: CachedMachine[], f: ProductFilters, limit = 100, offset = 0): Record<string, unknown>[] {
  const has = (v: string, n: string) => v.toLowerCase().includes(n.toLowerCase());
  const rows = ms.filter((m) => {
    if (f.serial && !(f.exact ? m.serialKey === low(f.serial) : has(m.serial, f.serial))) return false;
    if (f.party && !has(m.party, f.party)) return false;
    if (f.product && !(f.exact ? m.itemName === f.product : has(m.itemName, f.product))) return false;
    if (f.q && !(has(m.serial, f.q) || has(m.itemName, f.q) || has(m.party, f.q))) return false;
    if (f.status && m.itemStatus !== f.status.trim().toUpperCase()) return false;
    return true;
  });
  // NEWEST FIRST, nulls last, id as the tiebreak -- the server's own order.
  // Compared as INSTANTS, not strings: the server trims trailing zeros off the
  // fraction, so two timestamps can differ in length and still be one moment.
  const t = (m: CachedMachine) => { const v = Date.parse(m.createdAt); return Number.isFinite(v) ? v : null; };
  rows.sort((a, b) => {
    const ta = t(a), tb = t(b);
    if ((ta === null) !== (tb === null)) return ta === null ? 1 : -1;
    if (ta !== null && tb !== null && ta !== tb) return tb - ta;
    return b.id - a.id;
  });
  return rows.slice(offset, offset + limit).map((m) => m.sheet);
}

// ===========================================================================
// THE DOWNLOAD, WRITTEN FOR A SIGNAL THAT COMES AND GOES.
//
// KEYSET, NOT OFFSET: each request asks for the thousand machines AFTER THE
// LAST ID IT HAS, so a dropped connection loses one request, never the walk.
// The next attempt -- a retry here, or the phone coming back online an hour
// later -- carries on from where it stopped instead of starting again at row 1,
// which on a weak signal is the difference between finishing and never
// finishing. An offset walk cannot do that safely: a machine added between two
// attempts shifts every later offset by one.
//
// A SHORT PAGE IS THE ONLY END SIGNAL (paging.ts). Anything else returns
// `complete: false` with what it has, and the caller KEEPS ITS OLD COPY: a half
// register served as the whole one is the prefix bug again, the one that hid
// VEGA from the product list.
// ===========================================================================
export interface DownloadState<T extends { id: number } = CachedMachine> { rows: T[]; lastId: number }
export interface DownloadResult<T extends { id: number } = CachedMachine> extends DownloadState<T> { complete: boolean; error?: string }

export const DOWNLOAD_PAGE = 1000;
export async function downloadAfter<T extends { id: number }>(
  fetchAfter: (afterId: number, size: number) => Promise<T[]>,
  from: DownloadState<T>,
  opts: { waits?: number[]; wait?: (ms: number) => Promise<void>; onProgress?: (n: number) => void; max?: number } = {},
): Promise<DownloadResult<T>> {
  const waits = opts.waits ?? [2000, 5000, 15000, 30000];
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const max = opts.max ?? 200000;
  const rows = [...from.rows];
  let lastId = from.lastId;
  while (rows.length < max) {
    let page: T[] | null = null;
    let error = '';
    for (let attempt = 0; page === null; attempt++) {
      try { page = await fetchAfter(lastId, DOWNLOAD_PAGE); }
      catch (e) {
        error = e instanceof Error ? e.message : String(e);
        if (attempt >= waits.length) return { rows, lastId, complete: false, error };
        await wait(waits[attempt]);
      }
    }
    // Ids must RISE, or the walk could loop for ever on a server that ignored
    // the filter. Refuse rather than trust it.
    for (const m of page) {
      if (!(m.id > lastId)) return { rows, lastId, complete: false, error: `machine ids out of order after ${lastId}` };
      rows.push(m); lastId = m.id;
    }
    opts.onProgress?.(rows.length);
    if (page.length < DOWNLOAD_PAGE) return { rows, lastId, complete: true };
  }
  return { rows, lastId, complete: false, error: `stopped at ${max} machines` };
}

// ---- stored compactly --------------------------------------------------------
// EVERY COLUMN IS KEPT (the user, 2026-09-29: "keep all columns in the cache").
// The column names are written ONCE rather than on each of twenty thousand
// rows; a column one row lacks is stored as `undefined` and dropped on the way
// back, so an unpacked row has exactly the keys the server sent.
export interface PackedRows { cols: string[]; rows: unknown[][] }
export function packRows(rows: Record<string, unknown>[]): PackedRows {
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k);
  const cols = [...seen];
  return { cols, rows: rows.map((r) => cols.map((c) => r[c])) };
}
export function unpackRows(p: PackedRows): Record<string, unknown>[] {
  return p.rows.map((v) => {
    const r: Record<string, unknown> = {};
    p.cols.forEach((c, i) => { if (v[i] !== undefined) r[c] = v[i]; });
    return r;
  });
}
/** A cached machine from its sheet alone -- for the checks, which have no row. */
export function fromSheet(id: number, createdAt: string, sheet: Record<string, unknown>): CachedMachine {
  return toCached({
    id, created_at: createdAt,
    item_name: sheet['Item Name'], serial_number: sheet['Item Serial Number'],
    party_name: sheet['Party Name'], item_status: sheet['Item Status'],
  }, sheet);
}

// ===========================================================================
// THE PARTY MASTER ON THE DEVICE -- every column of `public.parties`. It is
// what fills the customer's details on a Call Request once the machine has
// named the customer, and an installation's customer, who may own no machine
// yet. Same rules as the server reads it replaces.
// ===========================================================================
export type CachedParty = Record<string, unknown> & { id: number };
const partyNameKey = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** `.eq('name_key', lower(btrim(name)))` -- the unique key, so one or none. */
export function partyByName(ps: CachedParty[], name: string): CachedParty | undefined {
  const k = partyNameKey(name);
  if (!k) return undefined;
  return ps.find((p) => String(p.name_key ?? partyNameKey(p.party_name)) === k);
}

/** sbSearchParties: `ilike '%term%'` on the name, ordered by name, capped. */
export function searchPartyMaster(ps: CachedParty[], query: string, limit = 50): string[] {
  const t = query.trim().toLowerCase();
  return ps.map((p) => String(p.party_name ?? ''))
    .filter((n) => n && (!t || n.toLowerCase().includes(t)))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit);
}

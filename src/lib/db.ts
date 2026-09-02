// ---------------------------------------------------------------------------
// Tiny reactive localStorage "database".
// Each collection is an array of records persisted under a namespaced key.
// Components subscribe through the useCollection() hook (see hooks.ts) and
// re-render on any mutation. This keeps the POC backend-free while still
// behaving like a real data layer (CRUD + persistence + reactivity).
// ---------------------------------------------------------------------------

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  ownerId?: string; // user id who created the record (for user-specific data)
  [key: string]: unknown;
}

type Listener = () => void;

const PREFIX = 'rithi.db.';

class Database {
  private cache = new Map<string, BaseRecord[]>();
  private listeners = new Map<string, Set<Listener>>();

  private read(collection: string): BaseRecord[] {
    if (this.cache.has(collection)) return this.cache.get(collection)!;
    const raw = localStorage.getItem(PREFIX + collection);
    const data: BaseRecord[] = raw ? JSON.parse(raw) : [];
    this.cache.set(collection, data);
    return data;
  }

  // Persistence is a CONVENIENCE, not the source of truth — the live data is in
  // Supabase and is re-fetched on load. So a storage failure must never take the
  // app down with it.
  //
  // It did: localStorage holds ~5 MB, and one register's worth of imported calls
  // (each carrying its whole AppSheet row in `extra`) goes past that. The
  // unguarded setItem threw QuotaExceededError out of the load, and the page
  // crashed on the second "Load more". The in-memory cache is kept either way,
  // so the screen keeps working; only the offline copy is lost.
  private quotaWarned = false;
  private write(collection: string, data: BaseRecord[]) {
    this.cache.set(collection, data);
    try {
      localStorage.setItem(PREFIX + collection, JSON.stringify(data));
    } catch (e) {
      if (!this.quotaWarned) {
        this.quotaWarned = true;
        console.warn(`[db] ${collection} is too large for local storage (${e instanceof Error ? e.name : 'error'}) — kept in memory for this session only.`);
      }
      // Drop the stale copy rather than leave a half-truth on disk: a partial
      // cache read back on the next load is worse than no cache at all.
      try { localStorage.removeItem(PREFIX + collection); } catch { /* nothing more to do */ }
    }
    this.emit(collection);
  }

  private emit(collection: string) {
    this.listeners.get(collection)?.forEach((l) => l());
  }

  subscribe(collection: string, listener: Listener): () => void {
    if (!this.listeners.has(collection)) this.listeners.set(collection, new Set());
    this.listeners.get(collection)!.add(listener);
    return () => this.listeners.get(collection)?.delete(listener);
  }

  list(collection: string): BaseRecord[] {
    return this.read(collection);
  }

  get(collection: string, id: string): BaseRecord | undefined {
    return this.read(collection).find((r) => r.id === id);
  }

  insert(collection: string, record: Partial<BaseRecord>): BaseRecord {
    const now = new Date().toISOString();
    const full: BaseRecord = {
      ...record,
      id: record.id ?? genId(),
      createdAt: now,
      updatedAt: now,
    } as BaseRecord;
    const data = [...this.read(collection), full];
    this.write(collection, data);
    return full;
  }

  update(collection: string, id: string, patch: Partial<BaseRecord>): BaseRecord | undefined {
    const data = this.read(collection);
    const idx = data.findIndex((r) => r.id === id);
    if (idx === -1) return undefined;
    const updated = { ...data[idx], ...patch, updatedAt: new Date().toISOString() };
    const next = [...data];
    next[idx] = updated;
    this.write(collection, next);
    return updated;
  }

  remove(collection: string, id: string): void {
    this.write(
      collection,
      this.read(collection).filter((r) => r.id !== id),
    );
  }

  // Insert many rows in ONE write.
  //
  // `insert` rewrites — and re-serialises — the whole collection every time, so
  // loading a page of 800 calls one row at a time did that 800 times, over a
  // growing array. Quadratic, and the reason a second "Load more" took the page
  // from slow to dead. Loading a page is one write now.
  insertMany(collection: string, records: Partial<BaseRecord>[]): void {
    if (!records.length) return;
    const now = new Date().toISOString();
    const add = records.map((r) => ({
      ...r, id: r.id ?? genId(), createdAt: now, updatedAt: now,
    })) as BaseRecord[];
    this.write(collection, [...this.read(collection), ...add]);
  }

  // Remove everything matching, in one write — for the same reason.
  removeWhere(collection: string, match: (r: BaseRecord) => boolean): void {
    const data = this.read(collection);
    const kept = data.filter((r) => !match(r));
    if (kept.length !== data.length) this.write(collection, kept);
  }

  // Replace an entire collection (updates cache + storage + notifies).
  replaceAll(collection: string, data: BaseRecord[]): void {
    this.write(collection, data);
  }

  // Seed a collection only if it is currently empty (idempotent demo data).
  seedIfEmpty(collection: string, records: Partial<BaseRecord>[]) {
    if (this.read(collection).length > 0) return;
    const now = new Date().toISOString();
    const seeded = records.map((r, i) => ({
      ...r,
      id: r.id ?? genId(),
      createdAt: r.createdAt ?? now,
      updatedAt: r.updatedAt ?? now,
      _seedOrder: i,
    })) as BaseRecord[];
    this.write(collection, seeded);
  }
}

export function genId(): string {
  return 'r_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const db = new Database();

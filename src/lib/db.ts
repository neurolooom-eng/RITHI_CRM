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

  private write(collection: string, data: BaseRecord[]) {
    this.cache.set(collection, data);
    localStorage.setItem(PREFIX + collection, JSON.stringify(data));
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

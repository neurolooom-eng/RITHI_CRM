import { useCallback, useSyncExternalStore } from 'react';
import { db, type BaseRecord } from './db';

// Reactive read of a whole collection. Re-renders on any mutation.
export function useCollection<T extends BaseRecord = BaseRecord>(collection: string): T[] {
  const subscribe = useCallback(
    (cb: () => void) => db.subscribe(collection, cb),
    [collection],
  );
  const getSnapshot = useCallback(() => db.list(collection) as T[], [collection]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

// Convenience CRUD bound to a collection.
export function useCrud(collection: string) {
  return {
    insert: (r: Partial<BaseRecord>) => db.insert(collection, r),
    update: (id: string, p: Partial<BaseRecord>) => db.update(collection, id, p),
    remove: (id: string) => db.remove(collection, id),
    get: (id: string) => db.get(collection, id),
  };
}

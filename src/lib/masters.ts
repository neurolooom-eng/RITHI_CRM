import { useEffect, useState } from 'react';
import { listMaster, dataConfigured } from './sheets';

// ===========================================================================
// Master value lists for form dropdowns (Party, Product, Standard Complaint,
// Call Type, ...). Values are read once per session from the configured master
// sheet via CallReg and cached. If a master isn't configured or reachable, the
// caller's static fallback list is used so the form still works.
// ===========================================================================

const cache = new Map<string, string[]>();
const inflight = new Map<string, Promise<string[]>>();

function load(name: string): Promise<string[]> {
  if (cache.has(name)) return Promise.resolve(cache.get(name)!);
  if (inflight.has(name)) return inflight.get(name)!;
  const p = listMaster(name)
    .then((v) => { cache.set(name, v); inflight.delete(name); return v; })
    .catch(() => { inflight.delete(name); return [] as string[]; });
  inflight.set(name, p);
  return p;
}

// Clear cached master values (e.g. after editing the registry, or a force sync).
export function clearMasterCache(name?: string) {
  if (name) { cache.delete(name); inflight.delete(name); }
  else { cache.clear(); inflight.clear(); }
}

export function useMaster(name: string, fallback: string[] = []): { values: string[]; ready: boolean } {
  const [values, setValues] = useState<string[]>(() => cache.get(name) ?? fallback);
  const [ready, setReady] = useState<boolean>(() => cache.has(name) || !dataConfigured());

  useEffect(() => {
    let cancelled = false;
    if (!dataConfigured()) { setValues(fallback); setReady(true); return; }
    if (cache.has(name)) { setValues(cache.get(name)!.length ? cache.get(name)! : fallback); setReady(true); return; }
    void load(name).then((v) => {
      if (cancelled) return;
      setValues(v.length ? v : fallback);
      setReady(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  return { values, ready };
}

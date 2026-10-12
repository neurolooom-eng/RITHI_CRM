// The labour charges on the Part Master (0413) — see labour.ts.
import { useEffect, useMemo, useState } from 'react';
import { listLabourParts, supabaseConfigured } from './supabase';
import { isLabourPart, type LabourPart } from './labour';

export function useLabourParts(enabled = true): {
  parts: LabourPart[];
  isLabour: (part: unknown) => boolean;
} {
  const [parts, setParts] = useState<LabourPart[]>([]);
  useEffect(() => {
    if (!enabled || !supabaseConfigured()) return;
    let alive = true;
    // A failed read offers no labour charge rather than blocking the form:
    // the spares in hand still work, and the database still guards the rest.
    listLabourParts().then((p) => { if (alive) setParts(p); }).catch(() => { /* none offered */ });
    return () => { alive = false; };
  }, [enabled]);
  const codes = useMemo(() => new Set(parts.map((p) => p.code)), [parts]);
  return { parts, isLabour: (part: unknown) => isLabourPart(part, codes) };
}

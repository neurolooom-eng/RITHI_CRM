// ===========================================================================
// A FILTER THAT ARRIVES WITH THE NAVIGATION.
//
// My Workload sends the reader to a register WITH the slice they clicked:
// "Review 2 Pending" must open those calls, not the whole register. Without
// this the card lands on the right page and the wrong list — the click is
// half-kept, which is worse than a card that plainly does nothing, because the
// reader believes the list in front of them is the one they asked for.
//
// APPLIED ONCE, ON ARRIVAL. React Router keeps `location.state` for the life of
// the entry, so re-reading it would fight every filter change the reader makes
// afterwards: they clear the stage, the effect puts it back, and the screen
// appears stuck. The key is the navigation, so going BACK and clicking a
// different card applies the new one.
// ===========================================================================
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export function useArrivingFilter<T>(key: string, apply: (value: T) => void): void {
  const location = useLocation();
  const done = useRef<unknown>(null);
  useEffect(() => {
    const st = location.state as Record<string, unknown> | null;
    if (!st || !(key in st)) return;
    // `location.key` changes on every navigation, including one to the same
    // path with different state — which is exactly the back-then-click-another
    // case.
    if (done.current === location.key) return;
    done.current = location.key;
    apply(st[key] as T);
    // `apply` is a setState function and stable; listing it would re-run this
    // on every render of a parent that rebuilds the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, location.state, key]);
}

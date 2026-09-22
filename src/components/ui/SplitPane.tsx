import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import './splitpane.css';

// ===========================================================================
// TWO WINDOWS, SIDE BY SIDE, WITH A DIVIDER YOU CAN DRAG.
//
//   The user, 2026-09-22: "Make the Warranty Entry and Contract as a 2 window
//   view [Adjustable width]."
//
// The registers opened their entry in a drawer over the list, which is right
// when you are looking at ONE record and wrong when the job is working down a
// list — every entry meant open, read, close, find your place again. Side by
// side, the list stays where it was.
//
// PERCENTAGES RATHER THAN PIXELS, so the panes keep their proportions when the
// window changes size or the sidebar collapses. A pixel width remembered on a
// wide monitor is a pane that fills a laptop.
//
// THE WIDTH IS REMEMBERED PER SCREEN, and a failure to remember it is not worth
// an error: a private window throws on the storage accessor itself, and a
// layout preference is not a reason to stop somebody working.
//
// FLOORS AT BOTH ENDS. A pane can be made small, and cannot be dragged out of
// existence — a divider at the edge is indistinguishable from a broken screen,
// and there is nothing left to grab to undo it.
// ===========================================================================

export function SplitPane({
  storageKey, left, right, defaultLeft = 42, min = 22, max = 72, className = '',
}: {
  /** Which remembered width this split uses. */
  storageKey: string;
  left: ReactNode;
  right: ReactNode;
  /** Percent of the width the left pane starts with. */
  defaultLeft?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  const key = `rithi.split.${storageKey}`;
  const host = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(key) ?? 0);
      return Number.isFinite(v) && v >= min && v <= max ? v : defaultLeft;
    } catch { return defaultLeft; }
  });

  const drag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const box = host.current;
    if (!box) return;
    const move = (ev: PointerEvent) => {
      const r = box.getBoundingClientRect();
      const pct = ((ev.clientX - r.left) / Math.max(1, r.width)) * 100;
      setW(Math.min(Math.max(pct, min), max));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setW((cur) => {
        try { localStorage.setItem(key, String(Math.round(cur))); } catch { /* a layout is not worth an error */ }
        return cur;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div ref={host} className={`split-pane ${className}`} style={{ gridTemplateColumns: `${w}% 6px 1fr` }}>
      <div className="split-side">{left}</div>
      <div className="split-bar" onPointerDown={drag} role="separator"
           aria-orientation="vertical" title="Drag to resize" />
      <div className="split-side">{right}</div>
    </div>
  );
}

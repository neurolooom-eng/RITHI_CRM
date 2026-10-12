import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

// ===========================================================================
// WHERE A PICK LIST'S MENU OPENS -- against the WINDOW, not its container.
//
// The user, 2026-10-03, on the Add entry pop-up: "The drop down list is getting
// truncated". The menu was `position: absolute` inside the field, so any
// container that scrolls (a pop-up's body, a drawer, a table cell) cut it off
// at its own edge. Placed `position: fixed` from the field's own box, it
// floats above everything and is never clipped; it opens UPWARDS when there is
// not room below (a phone with its keyboard up), and follows the field when the
// page or any container scrolls or the window resizes.
// ===========================================================================

const GAP = 3;
const WANT = 280;   // the menu's max-height in ui.css

export function useMenuPosition(boxRef: RefObject<HTMLElement | null>, open: boolean): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);
  useLayoutEffect(() => {
    if (!open) { setStyle(undefined); return; }
    const place = () => {
      const el = boxRef.current;
      if (!el) return;
      // TWO VIEWPORTS, AND THE MENU WAS PLACED IN ONE AND MEASURED IN THE OTHER.
      // `position: fixed` and getBoundingClientRect() are both in LAYOUT
      // viewport coordinates; the part of the page actually on screen is the
      // VISUAL viewport, which is smaller whenever the phone's keyboard is up or
      // the page is pinch-zoomed. This used to take the visual height as if it
      // were the layout one, so "open upwards" set `bottom` against a bottom
      // edge hidden behind the keyboard and the whole list was drawn under it
      // (the user, 2026-10-08: Standard Complaint and Add Consumption? on the
      // Visit Entry opened blank). Everything is in layout coordinates now: the
      // visible band is visualViewport's offset plus its size, and `bottom` is
      // measured from the layout viewport's own bottom edge.
      const r = el.getBoundingClientRect();
      const vv = window.visualViewport;
      const layoutH = document.documentElement.clientHeight || window.innerHeight;
      const layoutW = document.documentElement.clientWidth || window.innerWidth;
      const visTop = vv?.offsetTop ?? 0;
      const visBottom = visTop + (vv?.height ?? layoutH);
      const visLeft = vv?.offsetLeft ?? 0;
      const visRight = visLeft + (vv?.width ?? layoutW);
      const below = visBottom - r.bottom - GAP - 8;
      const above = r.top - visTop - GAP - 8;
      const up = below < Math.min(WANT, 160) && above > below;
      const room = Math.max(120, Math.min(WANT, up ? above : below));
      setStyle({
        position: 'fixed',
        left: Math.max(visLeft + 8, Math.min(r.left, visRight - 8 - Math.max(r.width, 160))),
        minWidth: r.width,
        maxHeight: room,
        ...(up ? { bottom: layoutH - r.top + GAP, top: 'auto' } : { top: r.bottom + GAP }),
        zIndex: 1000,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    // A pinch-zoomed page pans the visual viewport without scrolling anything.
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [open, boxRef]);
  return style;
}

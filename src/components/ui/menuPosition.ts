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
      const r = el.getBoundingClientRect();
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const below = vh - r.bottom - GAP - 8;
      const above = r.top - GAP - 8;
      const up = below < Math.min(WANT, 160) && above > below;
      const room = Math.max(120, Math.min(WANT, up ? above : below));
      setStyle({
        position: 'fixed',
        left: Math.max(8, Math.min(r.left, window.innerWidth - 8 - Math.max(r.width, 160))),
        minWidth: r.width,
        maxHeight: room,
        ...(up ? { bottom: vh - r.top + GAP, top: 'auto' } : { top: r.bottom + GAP }),
        zIndex: 1000,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [open, boxRef]);
  return style;
}

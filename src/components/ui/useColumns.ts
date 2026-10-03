import { useEffect, useState } from 'react';

/** How many form columns fit in `ref`'s width: 3, 2 or 1.
 *
 *  MEASURED, NOT A CONTAINER QUERY. `container-type` gives the form layout
 *  containment, which makes it the containing block for `position: fixed`
 *  descendants -- and the pick-list menus are fixed to the WINDOW
 *  (`useMenuPosition`) precisely so a modal cannot clip them. A container
 *  query here would bring that clipping straight back.
 *
 *  A CALLBACK REF, not a RefObject: the forms this serves are a modal and a
 *  drawer that mount long after the page, and an effect keyed on a RefObject
 *  runs once, sees null, and never measures again. */
export function useColumns(three = 700, two = 420): [(el: HTMLElement | null) => void, 1 | 2 | 3] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [cols, setCols] = useState<1 | 2 | 3>(1);
  useEffect(() => {
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setCols(w >= three ? 3 : w >= two ? 2 : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, three, two]);
  return [setEl, cols];
}

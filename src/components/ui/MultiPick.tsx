import { useEffect, useMemo, useRef, useState } from 'react';
import './picklist.css';

// ===========================================================================
// MANY VALUES, ONE CONTROL — the multi-select half of PickList.
//
// The user, 2026-09-14: "In the Filter in FFR , I need Multi Select Option."
//
// A SIBLING OF PickList RATHER THAN A MODE INSIDE IT, deliberately. PickList is
// on every form in this application and its whole contract is "one value, and
// choosing closes the list". Multi-select inverts both halves — a click TOGGLES
// and the list STAYS OPEN, because picking three things through a menu that
// shuts after each one is the interaction everybody complains about. Threading
// that through PickList would put an `if (multi)` in each of its branches, on
// the control the Daily Call Review's Auto Save depends on. It borrows the same
// stylesheet, so the two read as one control on screen.
//
// THE STANDING RULE STILL HOLDS: typing FILTERS, it never SELECTS. A native
// multiple <select> picks on the first keystroke exactly as a single one does,
// which is the fault that made PickList exist (a stray key wrote a Root Cause
// nobody chose).
//
// EMPTY MEANS ALL, and that is the only sane default for a filter: a control
// that starts with nothing ticked and therefore shows nothing would read as a
// broken screen. It also makes "clear" and "select everything" the same
// gesture, so there is one way back rather than two.
// ===========================================================================

export interface MultiPickProps {
  /** Chosen values. EMPTY MEANS ALL — see above. */
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  /** What the closed box reads when nothing is chosen. "All years", "Any product". */
  allLabel?: string;
  /** Singular noun for the summary: 2 → "2 years". */
  noun?: string;
  /** Below this many options the search box is not shown — the list IS the answer. */
  searchThreshold?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function MultiPick({
  values, options, onChange, allLabel = '— all —', noun = 'selected',
  searchThreshold = 8, disabled, id, className,
}: MultiPickProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const chosen = useMemo(() => new Set(values), [values]);
  const searchable = options.length >= searchThreshold;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // The same cap PickList uses, and for the same reason: nobody scrolls two
  // thousand rows to find one, and rendering them all builds the DOM before the
  // menu appears. The footer states the TRUE total, so only the drawing is
  // capped and the number is never a lie.
  const RENDER_CAP = 200;
  const shown = useMemo(() => matches.slice(0, RENDER_CAP), [matches]);

  const close = () => { setOpen(false); setQuery(''); setHi(0); };

  // Clicking away closes and changes nothing. Leaving a control alone must
  // never alter what it holds.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const toggle = (v: string) => {
    // THE MENU STAYS OPEN. That is the whole difference from PickList.
    onChange(chosen.has(v) ? values.filter((x) => x !== v) : [...values, v]);
  };

  const label = values.length === 0 ? allLabel
    : values.length === 1 ? values[0]
    : `${values.length} ${noun}`;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, shown.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); return; }
    // Enter TOGGLES the highlighted row and leaves the list open, so a keyboard
    // reader ticks several the way a mouse does. With nothing matching it does
    // nothing at all rather than inventing a value from the search.
    if (e.key === 'Enter') { e.preventDefault(); if (shown[hi] != null) toggle(shown[hi]); return; }
    if (e.key === 'Escape') { e.preventDefault(); close(); inputRef.current?.blur(); }
  };

  return (
    <div className={`picklist${className ? ` ${className}` : ''}`} ref={boxRef}>
      <button
        id={id}
        type="button"
        className={`input picklist-value${values.length ? '' : ' picklist-empty'}`}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => { if (disabled) return; if (open) close(); else { setOpen(true); setQuery(''); setHi(0); } }}
      >
        <span>{label}</span>
        <span className="picklist-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="picklist-menu">
          {searchable && (
            <input
              ref={inputRef}
              className="input picklist-input picklist-input-inline"
              autoFocus
              value={query}
              placeholder="Type to narrow…"
              onChange={(e) => { setQuery(e.target.value); setHi(0); }}
              onKeyDown={onKey}
            />
          )}
          <button type="button" className="picklist-opt picklist-clear"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onChange([])}>
            {allLabel}
          </button>
          {shown.map((o, i) => (
            <button
              key={o}
              type="button"
              className={`picklist-opt${i === hi ? ' picklist-hi' : ''}${chosen.has(o) ? ' picklist-cur' : ''}`}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggle(o)}
            >
              <span className="mp-tick" aria-hidden="true">{chosen.has(o) ? '✓' : ''}</span>
              {o}
            </button>
          ))}
          {matches.length === 0 && (
            <div className="picklist-none">Nothing matches “{query}”.</div>
          )}
          <div className="picklist-foot">
            {values.length === 0
              ? <>nothing ticked — showing everything</>
              : <>{values.length} ticked · click to untick · Esc to leave it alone</>}
          </div>
        </div>
      )}
    </div>
  );
}

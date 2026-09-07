import { useEffect, useMemo, useRef, useState } from 'react';

// ===========================================================================
// TYPE TO SEARCH, THEN PICK. NOTHING IS CHOSEN BY TYPING.
//
// A native <select> does type-ahead: press "A" and it SELECTS the first option
// beginning with A. On the Daily Call Review that is a quality record, and with
// Auto Save on it is written the moment the key lands — so a stray keystroke
// while the box has focus silently commits a Root Cause nobody chose (reported
// 2026-09-07: "currently if I start typing it is getting selected
// automatically -- I see that as a risk with Auto Save in place").
//
// So the rule this control exists for: TYPING FILTERS, IT NEVER SELECTS.
// `onPick` fires on a click, or on Enter over a highlighted row, and at no
// other time. Escape or clicking away restores what was there and writes
// nothing — an abandoned search must leave the record exactly as it was.
//
// It is not a free-text box either. The value is always one of `options` (or
// empty), because these fields come from the masters and a typed-in value
// would be a master entry that does not exist.
// ===========================================================================

export interface PickListProps {
  value: string;
  options: string[];
  onPick: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  // Shown under the list when a search matches nothing — the place to say
  // where new values come from.
  emptyHint?: string;
  id?: string;
}

export function PickList({
  value, options, onPick, disabled, placeholder = 'Type to search…', emptyHint, id,
}: PickListProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  // Clicking anywhere else abandons the search. It does NOT pick the
  // highlighted row: leaving a box alone must never change what it holds.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const close = () => { setOpen(false); setQuery(''); setHi(0); };
  const choose = (v: string) => { onPick(v); close(); };

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    // Start on the row that is already chosen, so ↓ moves from where you are.
    setHi(Math.max(0, options.indexOf(value)));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      // Enter picks the HIGHLIGHTED row and nothing else. With no matches it
      // does nothing at all rather than inventing a value from the search.
      if (matches[hi] != null) choose(matches[hi]);
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); inputRef.current?.blur(); }
  };

  return (
    <div className="picklist" ref={boxRef}>
      {open ? (
        <input
          id={id}
          ref={inputRef}
          className="input picklist-input"
          autoFocus
          value={query}
          placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); setHi(0); }}
          onKeyDown={onKey}
        />
      ) : (
        <button
          id={id}
          type="button"
          className={`input picklist-value${value ? '' : ' picklist-empty'}`}
          disabled={disabled}
          onClick={openList}
        >
          <span>{value || '— select —'}</span>
          <span className="picklist-caret" aria-hidden="true">▾</span>
        </button>
      )}

      {open && (
        <div className="picklist-menu">
          <button type="button" className="picklist-opt picklist-clear" onMouseDown={(e) => e.preventDefault()} onClick={() => choose('')}>
            — none —
          </button>
          {matches.map((o, i) => (
            <button
              key={o}
              type="button"
              className={`picklist-opt${i === hi ? ' picklist-hi' : ''}${o === value ? ' picklist-cur' : ''}`}
              onMouseEnter={() => setHi(i)}
              // The list must not steal focus before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
            >
              {o}
            </button>
          ))}
          {matches.length === 0 && (
            <div className="picklist-none">
              Nothing matches “{query}”.{emptyHint ? ` ${emptyHint}` : ''}
            </div>
          )}
          <div className="picklist-foot">
            {matches.length} of {options.length} · ↑↓ to move, Enter to choose, Esc to leave it alone
          </div>
        </div>
      )}
    </div>
  );
}

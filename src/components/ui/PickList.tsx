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
  // What the CLOSED box reads when nothing is chosen. Defaults to "— select —",
  // but an empty list often means something specific and worth saying: the
  // request form's serial box has four of these ("pick a product first", "every
  // serial is already on this request"), and losing them to a generic label
  // would make the screen quieter and less useful at the same time.
  emptyLabel?: string;
  // What each row READS, where the value alone does not say enough. Spare
  // Consumption is the case: the value is the part, but the engineer choosing
  // it needs "— 3 in hand" beside it to know whether the part is even there.
  // DISPLAY ONLY — the search still matches the VALUE, because nobody searches
  // for "in hand", and `onPick` still returns the value, so what is stored is
  // never the decorated string.
  labelFor?: (value: string) => React.ReactNode;
  // Below this many options the search box is not shown — the list IS the
  // answer. A type-to-search field over "Yes / No" is worse than the dropdown
  // it replaced: it costs a click and a decision to reach two items you could
  // already see. Set 0 to always search.
  searchThreshold?: number;
  // Rows that show but cannot be chosen. Spare Consumption is the case: a part
  // the engineer has none of is still worth SEEING (it says why it is not an
  // option) but picking it would only earn a refusal from the trigger that caps
  // consumption at the balance.
  isDisabled?: (value: string) => boolean;
  // MAY A VALUE BE TYPED THAT IS NOT ON THE LIST? The default is no, and that
  // is the right default: these fields come from masters, and a typed-in value
  // is a master entry that does not exist. But it is a per-FORM decision, not a
  // per-control one (the user, 2026-09-09: "FallBack is dependent on the Module
  // and Form") — a Standard Complaint typed by hand still reads as a fault,
  // while a PART typed by hand is a code that dispatch and consumption will
  // both fail to match. The form that knows the difference passes this.
  allowFreeText?: boolean;
  // ASK THE SERVER INSTEAD OF DOWNLOADING THE LIST.
  //
  // For a list of a few thousand — the customers, above all — shipping the whole
  // thing to the browser is the wrong shape however well it is cached: it is
  // three paged requests and a few hundred KB before the field is usable, and
  // it gets worse as the register grows. Reported three times over two days
  // (2026-09-10: "party name and Product - both are taking about 8 & 4 sec").
  //
  // With this set, the box opens INSTANTLY on a short first page and every
  // keystroke asks the database for matches instead of filtering an array that
  // had to be downloaded first. One small request per search, debounced, and it
  // costs the same whether the register holds two thousand customers or fifty.
  //
  // `options` is still honoured when it is given: it seeds the first frame and
  // keeps the CURRENT value selectable, so opening a saved record never blanks
  // a field while the search is in flight.
  onSearch?: (query: string) => Promise<string[]>;
  id?: string;
}

export function PickList({
  value, options, onPick, disabled, placeholder = 'Type to search…', emptyHint,
  emptyLabel = '— select —', labelFor, searchThreshold = 8, allowFreeText = false,
  isDisabled, onSearch, id,
}: PickListProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  // Server-side results, when the form asked for them — WITH THE QUERY THAT
  // PRODUCED THEM. Holding the rows alone let the previous answer sit on screen
  // while a new search was in flight, so typing "The principal" showed a list of
  // hospitals beginning with A and a quiet "searching…" underneath (reported
  // 2026-09-11). Rows that contradict what has been typed are worse than no
  // rows: they read as the answer.
  const [remote, setRemote] = useState<{ q: string; rows: string[] } | null>(null);
  const [searching, setSearching] = useState(false);
  // WHY THE LIST IS EMPTY, when it is empty because the request failed.
  const [failed, setFailed] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A server-searched list ALWAYS gets the search box: the row count on screen
  // is a page of results, not the size of the list, so the "short list needs no
  // search" rule would hide the only way to reach the rest.
  const searchable = !!onSearch || options.length >= Math.max(0, searchThreshold);
  // THE SEARCH RUNS ON THE SERVER when the form asked for it, and DEBOUNCED —
  // a request per keystroke would be worse than the download it replaces. Only
  // while the box is open: a closed picker must cost nothing.
  useEffect(() => {
    if (!onSearch || !open) return;
    let alive = true;
    setSearching(true);
    const t = window.setTimeout(() => {
      const q = query.trim();
      onSearch(q)
        // Keyed on the NORMALISED query, because the memo below compares against
        // a lower-cased one — storing "The principal" and comparing it with
        // "the principal" would never match, and the list would stay empty for
        // any query with a capital in it.
        .then((rows) => { if (alive) { setRemote({ q: q.toLowerCase(), rows }); setFailed(null); setHi(0); } })
        // A FAILED SEARCH SAYS SO. This used to swallow the error — and the
        // comment here claimed the opposite of what the code did, which is how
        // it survived review: "nothing matches" and "the request failed" must
        // not look the same, and then they did.
        //
        // It matters more than a tidy message. Reported 2026-09-11: real
        // customers — "Nagapattinam Medical College", "HKSD" — came back as
        // "Nothing matches", on a database whose product searches were timing
        // out. The person at the desk concludes the customer is not on the
        // system and raises them again as a duplicate. A search that cannot
        // reach the database must never answer the question it was asked.
        .catch((e) => { if (alive) setFailed(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (alive) setSearching(false); });
    }, 220);
    return () => { alive = false; window.clearTimeout(t); setSearching(false); };
  }, [onSearch, open, query]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    // SERVER-SIDE: the database already did the matching, so do not filter
    // again here — a second filter would drop rows it matched on something this
    // side cannot see, and would hide everything until the first result lands.
    if (onSearch) {
      // ONLY results that answer THE QUERY ON SCREEN. While a search is in
      // flight for something else, the list is empty and the footer says it is
      // searching — see the note on `remote` above.
      const fresh = remote && remote.q === q ? remote.rows : null;
      const rows = fresh ?? (remote === null ? options : []);
      // The CURRENT value stays selectable even when it is not in the page of
      // results, or opening a saved record and pressing Enter would blank it.
      return value && !rows.includes(value) && !q ? [value, ...rows] : rows;
    }
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query, onSearch, remote, value]);

  // ONLY THIS MANY ROWS ARE PUT ON SCREEN, however many match.
  //
  // The Party Master has thousands of rows, and opening a list that renders one
  // button per party built thousands of DOM nodes before the menu appeared —
  // which is the slowness reported on the call request (2026-09-09). Nobody
  // scrolls three thousand parties to find one; they type. So the list shows a
  // screenful and the footer says how many matched, which is the honest form:
  // the number is the TRUE total and only the rendering is capped.
  const RENDER_CAP = 200;
  const shown = useMemo(() => matches.slice(0, RENDER_CAP), [matches]);
  const hidden = matches.length - shown.length;
  // A typed value that is on no row, offered only where the form allows it.
  const typed = query.trim();
  const canTake = allowFreeText && !!typed
    && !options.some((o) => o.toLowerCase() === typed.toLowerCase());

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
  const choose = (v: string) => { if (v && isDisabled?.(v)) return; onPick(v); close(); };

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    // Start on the row that is already chosen, so ↓ moves from where you are.
    // Clamped into the rendered window: with thousands of options the chosen
    // one may sit past the cap, and starting the highlight off-screen would
    // make the first ↓ appear to do nothing.
    setHi(Math.min(Math.max(0, options.indexOf(value)), RENDER_CAP - 1));
  };

  const onKey = (e: React.KeyboardEvent) => {
    // Bounded by what is RENDERED, not by what matched: arrowing past the last
    // visible row would highlight a button that is not on screen.
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, shown.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      // Enter picks the HIGHLIGHTED row and nothing else. With no matches it
      // does nothing at all rather than inventing a value from the search --
      // unless this form allows free text, where the typed value IS the answer.
      if (shown[hi] != null) choose(shown[hi]);
      else if (canTake) choose(typed);
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); inputRef.current?.blur(); }
  };

  return (
    <div className="picklist" ref={boxRef}>
      {open && searchable ? (
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
          <span>{value ? (labelFor?.(value) ?? value) : emptyLabel}</span>
          <span className="picklist-caret" aria-hidden="true">▾</span>
        </button>
      )}

      {open && !searchable && (
        // SHORT LIST: no search box, and the trigger stays put so the menu
        // opens under the thing that was clicked rather than replacing it.
        <button id={id} type="button" className={`input picklist-value${value ? '' : ' picklist-empty'}`}
                disabled={disabled} onClick={() => close()}>
          <span>{value ? (labelFor?.(value) ?? value) : emptyLabel}</span>
          <span className="picklist-caret" aria-hidden="true">▴</span>
        </button>
      )}

      {open && (
        <div className="picklist-menu">
          <button type="button" className="picklist-opt picklist-clear" onMouseDown={(e) => e.preventDefault()} onClick={() => choose('')}>
            — none —
          </button>
          {shown.map((o, i) => (
            <button
              key={o}
              type="button"
              className={`picklist-opt${i === hi ? ' picklist-hi' : ''}${o === value ? ' picklist-cur' : ''}${isDisabled?.(o) ? ' picklist-off' : ''}`}
              disabled={isDisabled?.(o)}
              onMouseEnter={() => setHi(i)}
              // The list must not steal focus before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
            >
              {labelFor?.(o) ?? o}
            </button>
          ))}
          {canTake && (
            <button type="button" className="picklist-opt picklist-take"
                    onMouseDown={(e) => e.preventDefault()} onClick={() => choose(typed)}>
              Use “{typed}” — not on the list
            </button>
          )}
          {failed && !searching && (
            <div className="picklist-none picklist-failed">
              The search could not reach the database, so this list is empty —
              it does <b>not</b> mean the customer is missing. {failed}
            </div>
          )}
          {matches.length === 0 && !canTake && !searching && !failed && (
            <div className="picklist-none">
              Nothing matches “{query}”.{emptyHint ? ` ${emptyHint}` : ''}
            </div>
          )}
          <div className="picklist-foot">
            {/* A SERVER-SEARCHED LIST DOES NOT KNOW THE TOTAL, and must not
                pretend to: "12 of 40" where 40 is whatever happened to be
                seeded would be a number somebody acts on. It says what it is
                showing and that more may exist — the project's own rule that a
                count over partly-loaded data is a LOWER BOUND. */}
            {onSearch
              ? (failed && !searching
                  ? <>the search failed · Esc to leave it alone</>
                  : searching
                  ? <>searching…</>
                  : <>{matches.length} shown{matches.length ? '+' : ''} · keep typing to narrow · Enter to choose, Esc to leave it alone</>)
              : searchable
              ? <>
                  {matches.length} of {options.length}
                  {/* SAY WHEN THE LIST IS TRUNCATED. A reader who cannot see
                      their party must know the answer is "keep typing" and not
                      "it is not here" — an unexplained cut-off is how somebody
                      concludes a customer is missing from the master. */}
                  {hidden > 0 ? <> · showing {shown.length}, keep typing to narrow</> : null}
                  {' '}· ↑↓ to move, Enter to choose, Esc to leave it alone
                </>
              : <>{options.length} option{options.length === 1 ? '' : 's'} · Esc to leave it alone</>}
          </div>
        </div>
      )}
    </div>
  );
}

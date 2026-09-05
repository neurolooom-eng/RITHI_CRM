import { useEffect, useState } from 'react';
import { sbSuggestComplaintText, supabaseConfigured, type TextSuggestion } from '../../lib/supabase';
import { withAlarm } from '../../lib/alarm';

// ===========================================================================
// THE COMPLAINT IS ALREADY WRITTEN IN A HOUSE STYLE. THIS HELPS KEEP IT.
//
// Reported Problem is free text, but this register's is not freely written:
// the alarm number is used wherever the machine gives one, the terms are the
// manufacturer's, and the same fault comes back in the same words. That style
// is why searching the register works, and it is what the Standard Complaint
// suggestions have to go on. It survives on habit — which a new joiner has not
// got yet.
//
// So, under the box, from evidence and nothing else:
//   • the alarm number in THIS PRODUCT'S spelling, when one has been typed in
//     some other form ("al 12" → "Alarm 012"). It rewrites that token and
//     leaves the rest of the sentence alone.
//   • how this fault has been written before on this product, counted.
//   • a WARNING when the alarm number does not exist on this product — the one
//     row here that is not something to click, and the one that catches a
//     mistake rather than saving keystrokes.
//
// NOTHING IS REWRITTEN WITHOUT A CLICK, and taking a phrasing can be undone,
// because it replaces a sentence somebody wrote rather than filling a blank.
// ===========================================================================

interface Props {
  reported: string;
  product: string;
  onPick: (value: string) => void;
}

export function ComplaintTextHelp({ reported, product, onPick }: Props) {
  const [list, setList] = useState<TextSuggestion[]>([]);
  const [undo, setUndo] = useState<string | null>(null);
  const text = reported.trim();

  useEffect(() => {
    if (!supabaseConfigured() || text.length < 4) { setList([]); return; }
    let dead = false;
    const id = window.setTimeout(() => {
      void (async () => {
        let rows: TextSuggestion[] = [];
        try { rows = await sbSuggestComplaintText(text, product, 4); } catch { rows = []; }
        if (!dead) setList(rows);
      })();
    }, 450);   // typing settles first; one lookup, not one per keystroke
    return () => { dead = true; window.clearTimeout(id); };
  }, [text, product]);

  if (text.length < 4 || !list.length) return null;

  // The alarm chip rewrites the NUMBER, not the sentence: everything the person
  // wrote about the fault has to survive being helped.
  const takeAlarm = (canonical: string) => {
    setUndo(reported);
    onPick(withAlarm(reported, canonical));
  };
  const takePhrase = (phrase: string) => {
    setUndo(reported);
    onPick(phrase);
  };

  const warn = list.filter((s) => s.kind === 'unknown');
  const picks = list.filter((s) => s.kind !== 'unknown');

  return (
    <div className="cs-wrap">
      {warn.map((w) => (
        <span key={w.value} className="cs-warn" title="Nothing is changed — check the number against the machine.">
          ⚠ {w.why}
        </span>
      ))}
      {picks.length > 0 && <span className="cs-lead">Written here as:</span>}
      {picks.map((s) => (
        <button
          key={`${s.kind}-${s.value}`}
          type="button"
          className="chip cs-chip"
          title={`${s.why}. Click to use it — you can undo.`}
          onClick={() => (s.kind === 'alarm' ? takeAlarm(s.value) : takePhrase(s.value))}
        >
          {s.value}
          <small className="cs-why">{s.why}</small>
        </button>
      ))}
      {undo !== null && undo !== reported && (
        <button type="button" className="chip cs-undo" onClick={() => { onPick(undo); setUndo(null); }}>
          ↩ Undo
        </button>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  sbSuggestComplaints, sbAiRankComplaints, supabaseConfigured, type ComplaintSuggestion,
} from '../../lib/supabase';

// ===========================================================================
// WHAT IS THIS FAULT, IN THE WORDS THE REGISTER USES?
//
// The desk types what the customer said and then has to find the right one of
// FIVE HUNDRED AND SEVEN Standard Complaints. This offers the two or three most
// likely, with the reason each is offered, and fills the field when one is
// clicked.
//
// IT SAYS WHY. "chosen on 12 similar calls" is a fact about the register and
// can be checked; "wording match" is weaker and says so. A suggestion whose
// grounds are invisible is a suggestion nobody can sensibly disagree with, and
// the person here is meant to be deciding.
//
// The register answers first and alone. The model, if it is switched on at all,
// only re-ranks the same candidates — so the worst it can do is order them
// badly, never invent a complaint that is not in the master.
// ===========================================================================

interface Props {
  reported: string;
  product: string;
  current: string;
  onPick: (value: string) => void;
  // Told what was on offer, so the module can log what was ultimately taken.
  onOffer?: (offered: ComplaintSuggestion[]) => void;
}

export function ComplaintSuggest({ reported, product, current, onPick, onOffer }: Props) {
  const [list, setList] = useState<ComplaintSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiTried, setAiTried] = useState(false);
  const offered = useRef<(l: ComplaintSuggestion[]) => void>();
  offered.current = onOffer;

  const text = reported.trim();

  useEffect(() => {
    if (!supabaseConfigured() || text.length < 4) { setList([]); return; }
    let dead = false;
    setBusy(true); setAiTried(false);
    const id = window.setTimeout(() => {
      void (async () => {
        // 1. The register's own evidence — always, and on its own it is enough.
        let rows: ComplaintSuggestion[] = [];
        try { rows = await sbSuggestComplaints(text, product, 6); } catch { rows = []; }
        if (dead) return;
        setList(rows.slice(0, 3));
        setBusy(false);
        offered.current?.(rows.slice(0, 3));

        // 2. The model re-ranks the SAME candidates, for the paraphrase the
        //    register cannot reach. Silent when it is not configured.
        if (!rows.length) return;
        const ranked = await sbAiRankComplaints(text, product, rows.map((r) => r.value));
        if (dead || !ranked.length) return;
        // Keep the register's evidence on the row the model promoted: the count
        // is the useful part, and the model's sentence explains the ordering.
        const byValue = new Map(rows.map((r) => [r.value, r]));
        const merged = ranked.map((a) => {
          const reg = byValue.get(a.value);
          return reg && reg.chosen > 0 ? { ...reg, why: `${reg.why} · ${a.why}`, source: 'ai' as const } : a;
        });
        setList(merged.slice(0, 3));
        setAiTried(true);
        offered.current?.(merged.slice(0, 3));
      })();
    }, 450);   // typing settles first; this fires once, not per keystroke
    return () => { dead = true; window.clearTimeout(id); setBusy(false); };
  }, [text, product]);

  if (text.length < 4) return null;
  if (busy && !list.length) return <div className="field-help">Looking for similar calls…</div>;
  if (!list.length) return null;

  return (
    <div className="cs-wrap">
      <span className="cs-lead">
        {aiTried ? 'Likely, from past calls and a reading of the wording:' : 'Likely, from past calls:'}
      </span>
      {list.map((s) => (
        <button
          key={s.value}
          type="button"
          className={`chip cs-chip ${current === s.value ? 'chip-on' : ''}`}
          title={`${s.why}. Click to use it — you can still change it.`}
          onClick={() => onPick(s.value)}
        >
          {s.value}
          <small className="cs-why">{s.why}</small>
        </button>
      ))}
      <span className="cs-note">Suggestions — you choose.</span>
    </div>
  );
}

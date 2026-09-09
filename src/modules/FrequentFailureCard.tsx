import { useEffect, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { supabaseConfigured, getFrequentFailureRule, setFrequentFailureRule } from '../lib/supabase';

// ===========================================================================
// ADMIN CONFIG → THE FREQUENT-FAILURE RULE.
//
// The user, 2026-09-06, in the same breath as the rule itself: "2 or More
// including the call in question -- Maybe make it editable in Admin Pannel."
//
// THREE NUMBERS, AND THE DEFAULTS ARE THE PROCEDURE'S. A project that never
// opens this screen gets what DCCR Review 2 says: two or more failures within
// a month. Nothing here has to be set for the rule to be right.
//
// WHY THE THIRD SETTING EXISTS, said plainly rather than left as a checkbox.
// The written procedure says "same equipment"; the user's own rule of
// 2026-09-06 said the complaint had to match too. Both readings are defensible
// and they give different answers, so it is a setting rather than a decision
// taken quietly in SQL — and it defaults to the stricter one, which is what
// this system has done since 0117. The "same part in the same machine" path is
// NOT affected by it: the procedure adds that path without mentioning the
// complaint at all.
//
// CHANGING IT DOES NOT RE-ANSWER ANYTHING. Review 2 answers already recorded
// are quality records and stay exactly as they were; the new rule applies to
// what is reviewed from here on. The card says so, because an administrator
// moving a threshold is entitled to know whether they are restating history.
// ===========================================================================

const DEFAULTS = { window_months: 1, threshold: 2, equipment_needs_complaint: true };

export function FrequentFailureCard() {
  const { isAdmin } = useAuth();
  const onDb = supabaseConfigured();
  const [rule, setRule] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (!onDb) { setMsg({ tone: 'info', text: 'Connect the database to use this.' }); return; }
    void getFrequentFailureRule()
      .then((r) => { setRule(r); setLoaded(true); })
      .catch((e) => setMsg({ tone: 'error', text: `Could not read the rule: ${e instanceof Error ? e.message : String(e)}` }));
  }, [onDb]);

  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await setFrequentFailureRule(rule);
    setBusy(false);
    setMsg(r.ok
      ? { tone: 'ok', text: 'Saved. It applies to reviews from here on — answers already recorded are unchanged.' }
      : { tone: 'error', text: r.error ?? 'Could not save.' });
  };

  const num = (v: string, min: number) => Math.max(min, Math.round(Number(v) || min));

  return (
    <SectionCard title="Frequent Failure — the rule Review 2 applies">
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        A call is a <b>frequent failure</b> when there have been <b>{rule.threshold} or more</b> failures on the
        same machine — <b>counting the call being reviewed</b> — within <b>{rule.window_months === 1 ? 'a month' : `${rule.window_months} months`}</b> before it.
        A failure counts if it is on the same equipment{rule.equipment_needs_complaint ? ' with the same complaint' : ''},
        or if <b>the same part</b> was fitted in that machine.
      </p>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        The defaults are the procedure's own. Changing these does <b>not</b> re-answer reviews already
        recorded — they are quality records and stay as they are.
      </p>

      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field-label" style={{ display: 'grid', gap: 4 }}>Window (months)
          <input className="input" type="number" min={1} style={{ width: 110 }}
                 disabled={!isAdmin || !loaded}
                 value={rule.window_months}
                 onChange={(e) => setRule((r) => ({ ...r, window_months: num(e.target.value, 1) }))} />
        </label>
        <label className="field-label" style={{ display: 'grid', gap: 4 }}>Failures needed
          <input className="input" type="number" min={1} style={{ width: 110 }}
                 disabled={!isAdmin || !loaded}
                 value={rule.threshold}
                 onChange={(e) => setRule((r) => ({ ...r, threshold: num(e.target.value, 1) }))} />
        </label>
        <label className="field-label" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" disabled={!isAdmin || !loaded}
                 checked={rule.equipment_needs_complaint}
                 onChange={(e) => setRule((r) => ({ ...r, equipment_needs_complaint: e.target.checked }))} />
          The same-equipment match also needs the same complaint
        </label>
        {isAdmin && (
          <button className="btn btn-primary" disabled={busy || !loaded} onClick={() => void save()}>Save</button>
        )}
      </div>

      <p className="muted" style={{ fontSize: 12.5 }}>
        <b>Failures needed</b> counts the call under review, so <b>2</b> means one earlier failure is enough.
      </p>
      {!isAdmin && <p className="muted" style={{ fontSize: 12.5 }}>Only an administrator can change these.</p>}
      {msg && <div className={`sheet-banner sheet-banner-${msg.tone === 'ok' ? 'ok' : msg.tone}`}><span>{msg.text}</span></div>}
    </SectionCard>
  );
}

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

// RULE 2 (0198) — the same complaint across DIFFERENT units of one model. Its
// window is in DAYS rather than months because the user asked for thirty days,
// and those are different lengths in February. Its threshold counts DISTINCT
// SERIALS, not calls: five visits to one machine are rule 1's finding.
const DEFAULTS = {
  window_months: 1, threshold: 2, equipment_needs_complaint: true,
  rule2_enabled: true, rule2_window_days: 30, rule2_serials: 2,
};

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

      {/* RULE 2 — kept visually apart because it answers a DIFFERENT question,
          and running the two sets of numbers together is how somebody changes
          the wrong one. Rule 1 asks whether THIS MACHINE keeps failing; rule 2
          asks whether THIS MODEL keeps failing the same way on other units. */}
      <p className="field-help" style={{ marginTop: 16, marginBottom: 6 }}>
        <b>Rule 2 — the same complaint across the fleet.</b> The same complaint on
        <b> different serial numbers</b> of one product inside the window. It counts
        SERIALS, not calls: several visits to one machine are rule 1&rsquo;s finding, not this
        one&rsquo;s. A call meeting <i>either</i> rule is a frequent failure.
      </p>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field-label" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" disabled={!isAdmin || !loaded}
                 checked={rule.rule2_enabled}
                 onChange={(e) => setRule((r) => ({ ...r, rule2_enabled: e.target.checked }))} />
          Rule 2 is in force
        </label>
        <label className="field-label" style={{ display: 'grid', gap: 4 }}>Window (days)
          {/* DAYS, not months, and the field says so: thirty days and "a month"
              are different lengths in February, and the ask was thirty days. */}
          <input className="input" type="number" min={1} style={{ width: 110 }}
                 disabled={!isAdmin || !loaded || !rule.rule2_enabled}
                 value={rule.rule2_window_days}
                 onChange={(e) => setRule((r) => ({ ...r, rule2_window_days: num(e.target.value, 1) }))} />
        </label>
        <label className="field-label" style={{ display: 'grid', gap: 4 }}>Serials needed
          {/* MINIMUM TWO. One serial is not "multiple", and a rule that fired on
              one would fire on every call ever reviewed. */}
          <input className="input" type="number" min={2} style={{ width: 110 }}
                 disabled={!isAdmin || !loaded || !rule.rule2_enabled}
                 value={rule.rule2_serials}
                 onChange={(e) => setRule((r) => ({ ...r, rule2_serials: Math.max(2, num(e.target.value, 2)) }))} />
        </label>
      </div>

      <p className="muted" style={{ fontSize: 12.5 }}>
        <b>Failures needed</b> counts the call under review, so <b>2</b> means one earlier failure is enough.
      </p>
      {!isAdmin && <p className="muted" style={{ fontSize: 12.5 }}>Only an administrator can change these.</p>}
      {msg && <div className={`sheet-banner sheet-banner-${msg.tone === 'ok' ? 'ok' : msg.tone}`}><span>{msg.text}</span></div>}
    </SectionCard>
  );
}

import { isMissingTable } from '../lib/dberror';
import { useEffect, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { listSlaRules, saveSlaRule, supabaseConfigured, getRecycleSla, setRecycleSla, type SlaRuleRow } from '../lib/supabase';
import { useAuditMode } from '../lib/auditMode';
import { DEFAULT_SLA_RULES } from '../lib/sla';
import { useAuth } from '../lib/auth';

// Admin Config → SLA targets. Each rule's hours and on/off are editable; the
// app highlights open calls against the active rules.
const asDays = (h: number) => (h % 24 === 0 ? `${h / 24} day${h / 24 === 1 ? '' : 's'}` : `${h} h`);

export function SlaRulesCard() {
  const onDb = supabaseConfigured();
  // GATED ON SCREEN as the database is (finding 58): Admin config. Technical
  // Support opens this page by default and holds neither.
  const { can, isAdmin } = useAuth();
  const mayEdit = onDb && (isAdmin || can('config.manage'));
  const [rules, setRules] = useState<SlaRuleRow[]>([]);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  const load = async () => {
    if (!onDb) { setRules(DEFAULT_SLA_RULES); setMsg({ tone: 'info', text: 'Showing defaults — connect the database to edit.' }); return; }
    try {
      const r = await listSlaRules();
      setRules(r.length ? r : DEFAULT_SLA_RULES);
      if (!r.length) setMsg({ tone: 'info', text: 'SLA table not set up yet — run 0044_sla_rules.sql, then Refresh.' });
    } catch (e) {
      setRules(DEFAULT_SLA_RULES);
      setMsg({ tone: 'error', text: isMissingTable(e, 'sla_rules') ? 'Run 0044_sla_rules.sql in the Supabase SQL editor to enable editing.' : `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const edit = (key: string, patch: Partial<SlaRuleRow>) => {
    setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty((d) => ({ ...d, [key]: true }));
  };

  const save = async () => {
    if (!onDb) return;
    setBusy(true);
    const changed = rules.filter((r) => dirty[r.key]);
    for (const r of changed) {
      const res = await saveSlaRule(r.key, { target_hours: Math.max(1, Math.round(r.target_hours)), active: r.active });
      if (!res.ok) { setMsg({ tone: 'error', text: `Save failed: ${res.error}` }); setBusy(false); return; }
    }
    setDirty({}); setBusy(false); setMsg({ tone: 'ok', text: `Saved ${changed.length} rule${changed.length === 1 ? '' : 's'}.` });
  };

  const changedCount = Object.values(dirty).filter(Boolean).length;

  return (
    <SectionCard title="SLA Targets">
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Service-level targets used to highlight open calls (on track / due soon / breached) for engineers on the Dashboard.
        Edit the hours or switch a rule off.
      </p>
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`} style={{ marginBottom: 10 }}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      <div className="assoc-scroll">
        <table className="assoc-table" style={{ minWidth: 480 }}>
          <thead><tr><th>Rule</th><th style={{ width: 120 }}>Target (hours)</th><th style={{ width: 90 }}>=</th><th style={{ width: 70 }}>Active</th></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.key} style={{ opacity: r.active ? 1 : 0.55 }}>
                <td>{r.label}</td>
                <td>
                  <input className="input" type="number" min={1} value={r.target_hours}
                    onChange={(e) => edit(r.key, { target_hours: Number(e.target.value) })}
                    style={{ width: 90 }} disabled={!mayEdit} />
                </td>
                <td className="muted">{asDays(r.target_hours)}</td>
                <td>
                  <label className="switch-lite">
                    <input type="checkbox" checked={r.active} onChange={(e) => edit(r.key, { active: e.target.checked })} disabled={!mayEdit} />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy || !mayEdit || !changedCount}>
          {busy ? 'Saving…' : changedCount ? `Save ${changedCount} change${changedCount === 1 ? '' : 's'}` : 'Saved'}
        </button>
        <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>↻ Refresh</button>
      </div>
      <RecycleSlaSection mayEdit={mayEdit} />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// SPARE RECYCLING SLA (0365, the user, 2026-10-04: "SLA is 3 Working Days.
// Saturday, Sunday Holiday, But make it configurable through SLA Page"). The
// recycling track's own setting, kept apart from the call rules above so it
// can never change how a call is judged; counted from Start Work. Hidden --
// and refused by the database -- while Audit Mode is on, like the track.
// ---------------------------------------------------------------------------
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function RecycleSlaSection({ mayEdit }: { mayEdit: boolean }) {
  const audit = useAuditMode();
  const [days, setDays] = useState(3);
  const [weekend, setWeekend] = useState<number[]>([0, 6]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!supabaseConfigured() || audit.on || !audit.known) return;
    getRecycleSla()
      .then((r) => { setDays(r.working_days); setWeekend(r.weekend_days); setLoaded(true); })
      .catch((e) => setNote({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` }));
  }, [audit.on, audit.known]);
  if (!supabaseConfigured() || audit.on || !audit.known) return null;

  const toggle = (d: number) => { setWeekend((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort())); setDirty(true); };
  const save = async () => {
    setBusy(true);
    const res = await setRecycleSla(Math.round(days), weekend);
    setBusy(false);
    if (!res.ok) { setNote({ tone: 'error', text: res.error ?? 'Not saved.' }); return; }
    setDirty(false); setNote({ tone: 'ok', text: 'Spare Recycling SLA saved.' });
  };
  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <h4 style={{ margin: '0 0 4px' }}>Spare Recycling SLA</h4>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Counted in <b>working days</b> from <b>Start Work</b> on a recycling request. The days ticked below are holidays and are skipped.
      </p>
      {note && <div className={`sheet-banner sheet-banner-${note.tone}`} style={{ marginBottom: 8 }}><span>{note.text}</span></div>}
      <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="field-label" style={{ margin: 0 }}>Working days</label>
        <input className="input" type="number" min={1} max={60} value={days} disabled={!mayEdit || !loaded}
          onChange={(e) => { setDays(Number(e.target.value)); setDirty(true); }} style={{ width: 80 }} />
        <span className="field-label" style={{ margin: 0 }}>Holidays</span>
        {WEEKDAYS.map((w, i) => (
          <label key={w} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={weekend.includes(i)} disabled={!mayEdit || !loaded} onChange={() => toggle(i)} />{w.slice(0, 3)}
          </label>
        ))}
        <button className="btn btn-primary btn-sm" disabled={!mayEdit || !dirty || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>
    </div>
  );
}

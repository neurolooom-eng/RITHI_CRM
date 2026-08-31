import { useEffect, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { listSlaRules, saveSlaRule, supabaseConfigured, type SlaRuleRow } from '../lib/supabase';
import { DEFAULT_SLA_RULES } from '../lib/sla';

// Admin Config → SLA targets. Each rule's hours and on/off are editable; the
// app highlights open calls against the active rules.
const asDays = (h: number) => (h % 24 === 0 ? `${h / 24} day${h / 24 === 1 ? '' : 's'}` : `${h} h`);

export function SlaRulesCard() {
  const onDb = supabaseConfigured();
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
      setMsg({ tone: 'error', text: /sla_rules|does not exist|schema cache/i.test(String(e)) ? 'Run 0044_sla_rules.sql in the Supabase SQL editor to enable editing.' : `Load failed: ${e instanceof Error ? e.message : String(e)}` });
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
                    style={{ width: 90 }} disabled={!onDb} />
                </td>
                <td className="muted">{asDays(r.target_hours)}</td>
                <td>
                  <label className="switch-lite">
                    <input type="checkbox" checked={r.active} onChange={(e) => edit(r.key, { active: e.target.checked })} disabled={!onDb} />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy || !onDb || !changedCount}>
          {busy ? 'Saving…' : changedCount ? `Save ${changedCount} change${changedCount === 1 ? '' : 's'}` : 'Saved'}
        </button>
        <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>↻ Refresh</button>
      </div>
    </SectionCard>
  );
}

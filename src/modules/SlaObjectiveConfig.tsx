import { useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { SlaRulesCard } from './SlaRulesCard';
import {
  listObjectiveSettings, saveObjectiveSetting, supabaseConfigured, type ObjectiveSettingRow,
} from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { isMissingTable } from '../lib/dberror';
import { formatDayTime } from '../lib/dates';

// ===========================================================================
// SLA / OBJECTIVE CONFIGURATION — the targets the service is measured against
// (the user, 2026-10-04: "For Product Failures, The Concept is - Failure Within
// 3 Months, But a Rolling Average for 12 Months - Add this to a Page under
// Admin, Call the page - SLA / Objective Configuration").
//
// Two cards: the SLA Targets (moved here from Admin Config) and the Product
// Failure rule the Objective page's "Recent Failure Rate" figures are worked
// out by (0356). Opened by mod:/sla-objective-config, which only the Admin role
// is given by default; every other role is ticked on Roles & Permissions.
// ===========================================================================

const DEFAULTS: ObjectiveSettingRow[] = [
  { key: 'failure_window_months', label: 'Failure within', value: 3, unit: 'months', sort_order: 1 },
  { key: 'failure_rolling_months', label: 'Rolling period', value: 12, unit: 'months', sort_order: 2 },
];
const SHORT: Record<string, string> = {
  failure_window_months: 'Failure within … of installation',
  failure_rolling_months: 'Rolling period',
};

function ProductFailureRuleCard() {
  const onDb = supabaseConfigured();
  // objective.manage, the key that edits the objectives themselves; its parent
  // config.manage grants it too. The database asks the same (os_update).
  const { can } = useAuth();
  const mayEdit = onDb && can('objective.manage');
  const [rows, setRows] = useState<ObjectiveSettingRow[]>(DEFAULTS);
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  const load = async () => {
    if (!onDb) { setMsg({ tone: 'info', text: 'Showing the defaults — connect the database to edit.' }); return; }
    try {
      const r = await listObjectiveSettings();
      if (!r.length) {
        setRows(DEFAULTS);
        setMsg({ tone: 'info', text: 'The rule is not on this project yet — run objective.sql (0356), then Refresh. The figures use 3 and 12 until then.' });
        return;
      }
      setRows(r);
      setSaved(Object.fromEntries(r.map((x) => [x.key, x.value])));
      setMsg(null);
    } catch (e) {
      setRows(DEFAULTS);
      setMsg({ tone: 'error', text: isMissingTable(e, 'objective_settings')
        ? 'The rule is not on this project yet — run objective.sql (0356), then Refresh.'
        : `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const valueOf = (key: string) => rows.find((r) => r.key === key)?.value ?? 0;
  const changed = rows.filter((r) => saved[r.key] !== undefined && saved[r.key] !== r.value);
  const invalid = rows.some((r) => !Number.isInteger(r.value) || r.value < 1 || r.value > 120);

  const save = async () => {
    if (!mayEdit || invalid) return;
    setBusy(true);
    for (const r of changed) {
      const res = await saveObjectiveSetting(r.key, r.value);
      if (!res.ok) { setMsg({ tone: 'error', text: `Save failed: ${res.error}` }); setBusy(false); return; }
    }
    setBusy(false);
    await load();
    setMsg({ tone: 'ok', text: 'Saved. It applies from the next Re-Calculate on the Objective page — figures already written keep the rule they were worked out under until then.' });
  };

  const w = valueOf('failure_window_months');
  const roll = valueOf('failure_rolling_months');
  const lastChange = rows.map((r) => r.updated_at).filter(Boolean).sort().pop();

  return (
    <SectionCard title="Product Failure Rate (Objective)">
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        How every <b>Recent Failure Rate</b> objective is worked out. A machine counts as <b>failed</b> when a
        field call on its serial is registered within <b>{w || '…'} month{w === 1 ? '' : 's'}</b> of its installation
        (the <b>warranty start</b>). The rate is a <b>rolling {roll || '…'} months</b>: of the machines of that product
        installed in the {roll || '…'} months up to the month&rsquo;s cut-off, the share that failed. A machine with
        several calls inside its window counts once; a machine with no warranty start is in neither number.
      </p>
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`} style={{ marginBottom: 10 }}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      <div className="assoc-scroll">
        <table className="assoc-table" style={{ minWidth: 420 }}>
          <thead><tr><th>Setting</th><th style={{ width: 120 }}>Months</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td title={r.label}>{SHORT[r.key] ?? r.label}</td>
                <td>
                  <input className="input" type="number" min={1} max={120} step={1} value={r.value}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, value: v } : x)));
                    }}
                    style={{ width: 90 }} disabled={!mayEdit} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invalid && <p className="muted" style={{ color: 'var(--danger)', fontSize: 13 }}>Each value must be a whole number of months from 1 to 120.</p>}
      <p className="muted" style={{ fontSize: 12 }}>
        Re-Calculate on the Objective page applies a change; nothing is rewritten when you save.
        {lastChange ? ` Last changed ${formatDayTime(lastChange)}.` : ''}
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy || !mayEdit || invalid || !changed.length}>
          {busy ? 'Saving…' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Saved'}
        </button>
        <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>↻ Refresh</button>
      </div>
    </SectionCard>
  );
}

export function SlaObjectiveConfig() {
  return (
    <div>
      <PageHeader
        title="SLA / Objective Configuration"
        subtitle="The service-level targets open calls are measured against, and the rule the Product Failure Rate objectives are worked out by."
        icon="🎯"
      />
      <SlaRulesCard />
      <div style={{ height: 16 }} />
      <ProductFailureRuleCard />
    </div>
  );
}

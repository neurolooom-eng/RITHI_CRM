import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PageHeader } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { listValidationResults, saveValidationResult, supabaseConfigured, type ValidationResult } from '../lib/supabase';
import {
  VAL_META, APPROVALS, APPROACH, CHECKLIST, URS, FRS, ARCHITECTURE, DETAILED, RISKS, TESTS,
  FMEA, FMEA_SCALE, PART11, SUPPLIERS, VSR,
  DATA_MIGRATION, BACKUP, SECURITY, ALCOA, CONFIG_SPEC, SOPS, GOVERNANCE, CAPA_COLUMNS, type Risk,
} from '../lib/validation';
import './softwarevalidation.css';

// ===========================================================================
// SOFTWARE VALIDATION — Admin-only. Renders the CSV/CSA + ISO/TR 80002-2
// validation package (plan, checklist, URS, SRS, design, risk, test protocol,
// traceability) authored in src/lib/validation.ts. Read-only reference for QA
// to review, approve and execute; printable.
// ===========================================================================

const riskBadge = (r: Risk) => <span className={`sv-risk sv-risk-${r.toLowerCase()}`}>{r}</span>;

type TabKey = 'overview' | 'approach' | 'checklist' | 'urs' | 'srs' | 'arch' | 'design' | 'config' | 'risk' | 'fmea'
  | 'part11' | 'security' | 'alcoa' | 'datamig' | 'backup' | 'supplier' | 'procedures' | 'tests' | 'trace' | 'capa' | 'vsr';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'approach', label: 'Validation Plan' },
  { key: 'checklist', label: 'Compliance Checklist' },
  { key: 'urs', label: 'User Requirements' },
  { key: 'srs', label: 'System Requirements' },
  { key: 'arch', label: 'Architecture Design' },
  { key: 'design', label: 'Detailed Design' },
  { key: 'config', label: 'Configuration Spec' },
  { key: 'risk', label: 'Risk Assessment' },
  { key: 'fmea', label: 'FMEA' },
  { key: 'part11', label: 'Part 11 Assessment' },
  { key: 'security', label: 'Security Assessment' },
  { key: 'alcoa', label: 'Data Integrity' },
  { key: 'datamig', label: 'Data Migration' },
  { key: 'backup', label: 'Backup & Recovery' },
  { key: 'supplier', label: 'Supplier Assessment' },
  { key: 'procedures', label: 'Procedures & Governance' },
  { key: 'tests', label: 'Test Protocol' },
  { key: 'trace', label: 'Traceability' },
  { key: 'capa', label: 'CAPA / Deviations' },
  { key: 'vsr', label: 'Summary Report' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="sv-sec"><h3 className="sv-h3">{title}</h3>{children}</section>;
}

export function SoftwareValidation() {
  const { can } = useAuth();
  const canRecord = can('config.manage') || can('manage-users');
  const [tab, setTab] = useState<TabKey>('overview');
  const [all, setAll] = useState(false); // render every section (for printing the full package)
  const show = (k: TabKey) => all || tab === k;
  const printAll = () => { setAll(true); setTimeout(() => { window.print(); setAll(false); }, 60); };

  // Execution results (DB-backed tracker).
  const [results, setResults] = useState<Record<string, ValidationResult>>({});
  const loadResults = async () => { if (!supabaseConfigured()) return; try { setResults(await listValidationResults()); } catch { /* not migrated yet */ } };
  useEffect(() => { void loadResults(); /* eslint-disable-next-line */ }, []);
  const record = async (testId: string, patch: { result?: string; actual?: string; tester?: string }) => {
    const res = await saveValidationResult(testId, patch);
    if (res.ok) void loadResults();
  };
  const summary = useMemo(() => {
    let pass = 0, fail = 0, done = 0;
    TESTS.forEach((t) => { const r = results[t.id]?.result; if (r === 'Pass') { pass++; done++; } else if (r === 'Fail') { fail++; done++; } else if (r === 'N/A') done++; });
    return { pass, fail, done, total: TESTS.length };
  }, [results]);

  // Traceability: URS → FRS → Test cases.
  const trace = useMemo(() => URS.map((u) => {
    const frs = FRS.filter((f) => f.urs.includes(u.id));
    const tests = TESTS.filter((t) => t.reqs.some((r) => r === u.id || frs.some((f) => f.id === r)));
    return { u, frs, tests };
  }), []);
  const orphanFrs = useMemo(() => FRS.filter((f) => !TESTS.some((t) => t.reqs.includes(f.id))), []);

  return (
    <div className="sv">
      <PageHeader title="Software Validation" subtitle="CSV / CSA (FDA) & ISO/TR 80002-2 validation package — draft for QA review, approval and execution." icon="🧪"
        actions={<><button className="btn btn-sm" onClick={() => window.print()}>🖨️ Print tab</button><button className="btn btn-sm btn-primary" onClick={printAll}>🖨️ Print full package</button></>} />

      <div className="sv-doc-banner">
        <div><b>{VAL_META.system}</b> · Doc {VAL_META.docId} · Package {VAL_META.packageVersion}</div>
        <div className="sv-status">{VAL_META.status}</div>
      </div>

      <div className="sv-tabs no-print">
        {TABS.map((t) => (
          <button key={t.key} className={`sv-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* OVERVIEW */}
      {show('overview') && (
        <>
          <Section title="1. System & intended use">
            <table className="sv-kv"><tbody>
              <tr><td>System</td><td>{VAL_META.system}</td></tr>
              <tr><td>Owner</td><td>{VAL_META.owner}</td></tr>
              <tr><td>Intended use</td><td>{VAL_META.intendedUse}</td></tr>
              <tr><td>Software category</td><td>{VAL_META.gampCategory}</td></tr>
            </tbody></table>
          </Section>
          <Section title="2. Regulatory & standards basis">
            <ul className="sv-list">{VAL_META.standards.map((s) => <li key={s}>{s}</li>)}</ul>
          </Section>
          <Section title="3. Document approval">
            <p className="sv-note">This package is a DRAFT. It becomes effective only when reviewed and approved (wet or Part 11-compliant e-signature) by the roles below, and its test protocols are executed with retained objective evidence.</p>
            <table className="sv-table"><thead><tr><th>Role</th><th>Name</th><th>Signature</th><th>Date</th></tr></thead>
              <tbody>{APPROVALS.map((a) => <tr key={a.role}><td>{a.role}</td><td className="sv-blank" /><td className="sv-blank" /><td className="sv-blank" /></tr>)}</tbody>
            </table>
          </Section>
        </>
      )}

      {/* APPROACH */}
      {show('approach') && APPROACH.map((s, i) => (
        <Section key={i} title={`${i + 1}. ${s.heading}`}>
          {s.body.map((p, j) => <p className="sv-p" key={j}>{p}</p>)}
        </Section>
      ))}

      {/* CHECKLIST */}
      {show('checklist') && (
        <>
          <p className="sv-note">Verification checklist mapping each requirement to its standard basis. Complete the Evidence and Result columns during execution (reference IQ/OQ/PQ test IDs, records or SOPs).</p>
          {CHECKLIST.map((sec) => (
            <Section key={sec.code} title={`${sec.code}. ${sec.title}`}>
              <table className="sv-table"><thead><tr><th style={{ width: 46 }}>#</th><th>Requirement</th><th style={{ width: 210 }}>Basis</th><th style={{ width: 150 }}>Evidence</th><th style={{ width: 90 }}>Result</th></tr></thead>
                <tbody>{sec.items.map((it) => <tr key={it.id}><td>{it.id}</td><td>{it.item}</td><td className="sv-ref">{it.ref}</td><td className="sv-blank" /><td className="sv-blank" /></tr>)}</tbody>
              </table>
            </Section>
          ))}
        </>
      )}

      {/* URS */}
      {show('urs') && (
        <Section title="User Requirements Specification (URS)">
          <table className="sv-table"><thead><tr><th style={{ width: 84 }}>ID</th><th>Requirement</th><th style={{ width: 80 }}>Risk</th></tr></thead>
            <tbody>{URS.map((u) => <tr key={u.id}><td className="sv-id">{u.id}</td><td><b>{u.title}.</b> {u.text}{u.refs ? <span className="sv-ref"> [{u.refs.join('; ')}]</span> : null}</td><td>{riskBadge(u.risk)}</td></tr>)}</tbody>
          </table>
        </Section>
      )}

      {/* SRS / FRS */}
      {show('srs') && (
        <Section title="System / Functional Requirements Specification (FRS)">
          <table className="sv-table"><thead><tr><th style={{ width: 84 }}>ID</th><th>Requirement</th><th style={{ width: 90 }}>Traces to</th><th style={{ width: 80 }}>Risk</th></tr></thead>
            <tbody>{FRS.map((f) => <tr key={f.id}><td className="sv-id">{f.id}</td><td><b>{f.title}.</b> {f.text}</td><td className="sv-ref">{f.urs.join(', ')}</td><td>{riskBadge(f.risk)}</td></tr>)}</tbody>
          </table>
        </Section>
      )}

      {/* ARCHITECTURE */}
      {show('arch') && ARCHITECTURE.map((s, i) => (
        <Section key={i} title={`${i + 1}. ${s.heading}`}>
          {s.body.map((p, j) => <p className="sv-p" key={j}>{p}</p>)}
        </Section>
      ))}

      {/* DETAILED DESIGN */}
      {show('design') && DETAILED.map((d, i) => (
        <Section key={i} title={`${i + 1}. ${d.area}`}>
          <ul className="sv-list">{d.points.map((p, j) => <li key={j}>{p}</li>)}</ul>
        </Section>
      ))}

      {/* RISK */}
      {show('risk') && (
        <Section title="Risk Assessment (ISO 14971 / CSA risk-based)">
          <p className="sv-note">Failure modes of quality-relevant functions, their controls and residual risk. Test rigor follows the severity/residual rating.</p>
          <div className="sv-scroll">
            <table className="sv-table sv-wide"><thead><tr><th>ID</th><th>Function</th><th>Failure</th><th>Effect</th><th>Sev</th><th>Controls</th><th>Residual</th></tr></thead>
              <tbody>{RISKS.map((r) => <tr key={r.id}><td className="sv-id">{r.id}</td><td>{r.fn}</td><td>{r.failure}</td><td>{r.effect}</td><td>{riskBadge(r.sev)}</td><td>{r.controls} <span className="sv-ref">[{r.refs.join(', ')}]</span></td><td>{riskBadge(r.residual)}</td></tr>)}</tbody>
            </table>
          </div>
        </Section>
      )}

      {/* FMEA */}
      {show('fmea') && (
        <Section title="Software FMEA (S · O · D · RPN)">
          <p className="sv-note">{FMEA_SCALE.severity}. {FMEA_SCALE.occurrence}. {FMEA_SCALE.detection}. {FMEA_SCALE.threshold}</p>
          <div className="sv-scroll">
            <table className="sv-table sv-wide"><thead><tr>
              <th>ID</th><th>Item / function</th><th>Failure mode</th><th>Cause</th><th>Effect</th>
              <th>S</th><th>O</th><th>D</th><th>RPN</th><th>Controls / action</th><th>Resid. RPN</th>
            </tr></thead>
              <tbody>{FMEA.map((f) => {
                const rpn = f.s * f.o * f.d; const after = f.s * f.oa * f.da;
                const cls = (n: number, sev: number) => n >= 100 || sev >= 8 ? 'sv-risk-high' : n >= 50 ? 'sv-risk-medium' : 'sv-risk-low';
                return (
                  <tr key={f.id}>
                    <td className="sv-id">{f.id}</td><td>{f.item}</td><td>{f.mode}</td><td>{f.cause}</td><td>{f.effect}</td>
                    <td>{f.s}</td><td>{f.o}</td><td>{f.d}</td>
                    <td><span className={`sv-risk ${cls(rpn, f.s)}`}>{rpn}</span></td>
                    <td>{f.controls}. <b>Action:</b> {f.action} <span className="sv-ref">[{f.refs.join(', ')}]</span></td>
                    <td><span className={`sv-risk ${cls(after, f.s)}`}>{after}</span></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </Section>
      )}

      {/* PART 11 */}
      {show('part11') && (
        <Section title="21 CFR Part 11 assessment (appendix)">
          <p className="sv-note">Applicability of each Part 11 control to RITHI CRM and how it is met. Electronic signatures (Subpart C) are not currently implemented; approvals are role-authorised actions recorded in the audit trail.</p>
          <div className="sv-scroll">
            <table className="sv-table"><thead><tr><th style={{ width: 110 }}>Clause</th><th>Requirement</th><th style={{ width: 80 }}>Applies</th><th>How met</th></tr></thead>
              <tbody>{PART11.map((p) => <tr key={p.clause}><td className="sv-id">{p.clause}</td><td>{p.requirement}</td><td><span className={`sv-risk ${p.applicable === 'Yes' ? 'sv-risk-low' : p.applicable === 'Partial' ? 'sv-risk-medium' : 'sv-risk-high'}`}>{p.applicable}</span></td><td>{p.howMet}</td></tr>)}</tbody>
            </table>
          </div>
        </Section>
      )}

      {/* SUPPLIER */}
      {show('supplier') && (
        <Section title="Supplier / infrastructure assessment (appendix)">
          {SUPPLIERS.map((s) => (
            <div className="sv-test" key={s.name}>
              <div className="sv-test-head"><b>{s.name}</b> — {s.service} <span className={`sv-risk sv-risk-${s.criticality.toLowerCase()}`}>{s.criticality} criticality</span></div>
              <ul className="sv-list">{s.criteria.map((c, i) => <li key={i}>{c}</li>)}</ul>
              <div className="sv-exp"><b>Conclusion:</b> {s.conclusion}</div>
            </div>
          ))}
        </Section>
      )}

      {/* CONFIGURATION SPEC */}
      {show('config') && (
        <Section title="Configuration Specification">
          <p className="sv-note">Controlled configuration items and where each is held. Baseline values are approved in this package and changes are controlled.</p>
          <table className="sv-table"><thead><tr><th>Item</th><th>Held in</th><th>Control</th></tr></thead>
            <tbody>{CONFIG_SPEC.map((c) => <tr key={c.item}><td><b>{c.item}</b></td><td className="sv-ref">{c.where}</td><td>{c.controlled}</td></tr>)}</tbody>
          </table>
        </Section>
      )}

      {/* SECURITY */}
      {show('security') && (
        <Section title="Security Assessment">
          <table className="sv-table"><thead><tr><th style={{ width: 150 }}>Area</th><th>Control</th></tr></thead>
            <tbody>{SECURITY.controls.map((c) => <tr key={c.area}><td><b>{c.area}</b></td><td>{c.control}</td></tr>)}</tbody>
          </table>
          <div className="sv-h3" style={{ fontSize: 14, marginTop: 14 }}>Recommended actions</div>
          <ul className="sv-list">{SECURITY.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </Section>
      )}

      {/* ALCOA+ */}
      {show('alcoa') && (
        <Section title="Data Integrity — ALCOA+ assessment">
          <table className="sv-table"><thead><tr><th style={{ width: 150 }}>Principle</th><th>How it is met</th></tr></thead>
            <tbody>{ALCOA.map((a) => <tr key={a.principle}><td><b>{a.principle}</b></td><td>{a.howMet}</td></tr>)}</tbody>
          </table>
        </Section>
      )}

      {/* DATA MIGRATION */}
      {show('datamig') && (
        <Section title="Data Migration Validation">
          <p className="sv-p">{DATA_MIGRATION.objective}</p>
          <div className="sv-h3" style={{ fontSize: 14 }}>Method</div>
          <ul className="sv-list">{DATA_MIGRATION.method.map((m, i) => <li key={i}>{m}</li>)}</ul>
          <div className="sv-h3" style={{ fontSize: 14 }}>Acceptance criteria</div>
          <ul className="sv-list">{DATA_MIGRATION.acceptance.map((m, i) => <li key={i}>{m}</li>)}</ul>
          <table className="sv-table" style={{ marginTop: 8 }}><thead><tr><th style={{ width: 46 }}>#</th><th>Check</th><th style={{ width: 150 }}>Evidence</th><th style={{ width: 90 }}>Result</th></tr></thead>
            <tbody>{DATA_MIGRATION.checks.map((c) => <tr key={c.id}><td>{c.id}</td><td>{c.check}</td><td className="sv-blank" /><td className="sv-blank" /></tr>)}</tbody>
          </table>
        </Section>
      )}

      {/* BACKUP */}
      {show('backup') && (
        <Section title="Backup & Restore Qualification">
          {BACKUP.statement.map((p, i) => <p className="sv-p" key={i}>{p}</p>)}
          <table className="sv-table" style={{ marginTop: 8 }}><thead><tr><th style={{ width: 46 }}>#</th><th>Check</th><th style={{ width: 150 }}>Evidence</th><th style={{ width: 90 }}>Result</th></tr></thead>
            <tbody>{BACKUP.checks.map((c) => <tr key={c.id}><td>{c.id}</td><td>{c.check}</td><td className="sv-blank" /><td className="sv-blank" /></tr>)}</tbody>
          </table>
        </Section>
      )}

      {/* PROCEDURES & GOVERNANCE */}
      {show('procedures') && (
        <>
          <Section title="Required procedures (SOPs)">
            <table className="sv-table"><thead><tr><th style={{ width: 84 }}>Ref</th><th>SOP</th><th>Purpose</th></tr></thead>
              <tbody>{SOPS.map((s) => <tr key={s.id}><td className="sv-id">{s.id}</td><td><b>{s.title}</b></td><td>{s.purpose}</td></tr>)}</tbody>
            </table>
          </Section>
          {GOVERNANCE.map((g, i) => <Section key={i} title={g.heading}>{g.body.map((p, j) => <p className="sv-p" key={j}>{p}</p>)}</Section>)}
        </>
      )}

      {/* TESTS + execution tracker */}
      {show('tests') && (
        <>
          <div className="sv-exec-summary">
            Execution: <b>{summary.done}</b>/{summary.total} recorded · <span className="sv-risk sv-risk-low">{summary.pass} Pass</span> · <span className="sv-risk sv-risk-high">{summary.fail} Fail</span>
            {!supabaseConfigured() && <span className="sv-ref"> · connect the database to record results</span>}
            {supabaseConfigured() && !canRecord && <span className="sv-ref"> · results are read-only for your role</span>}
          </div>
          {(['IQ', 'OQ', 'PQ'] as const).map((phase) => (
            <Section key={phase} title={`${phase === 'IQ' ? 'Installation' : phase === 'OQ' ? 'Operational' : 'Performance'} Qualification (${phase})`}>
              {TESTS.filter((t) => t.phase === phase).map((t) => {
                const r = results[t.id];
                return (
                  <div className="sv-test" key={t.id}>
                    <div className="sv-test-head">
                      <b>{t.id}</b> — {t.objective} {riskBadge(t.risk)}
                      <span className="sv-ref">traces: {t.reqs.join(', ')}</span>
                      {r?.result && <span className={`sv-risk ${r.result === 'Pass' ? 'sv-risk-low' : r.result === 'Fail' ? 'sv-risk-high' : 'sv-risk-medium'}`}>{r.result}</span>}
                    </div>
                    <ol className="sv-steps">{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                    <div className="sv-exp"><b>Expected result:</b> {t.expected}</div>
                    {canRecord && supabaseConfigured() ? (
                      <div className="sv-exec">
                        <select className="select" value={r?.result ?? ''} onChange={(e) => void record(t.id, { result: e.target.value })}>
                          <option value="">— result —</option><option>Pass</option><option>Fail</option><option>N/A</option>
                        </select>
                        <input className="input" placeholder="Actual result / observation" defaultValue={r?.actual ?? ''} onBlur={(e) => { if (e.target.value !== (r?.actual ?? '')) void record(t.id, { actual: e.target.value }); }} />
                        <input className="input sv-exec-tester" placeholder="Tester" defaultValue={r?.tester ?? ''} onBlur={(e) => { if (e.target.value !== (r?.tester ?? '')) void record(t.id, { tester: e.target.value }); }} />
                        {r?.executed_at && <span className="sv-ref">{new Date(r.executed_at).toLocaleDateString()}</span>}
                      </div>
                    ) : (
                      <div className="sv-result">
                        <span>Actual: {r?.actual || <span className="sv-blank-inline" />}</span>
                        <span>Result: {r?.result || <span className="sv-blank-inline sm" />}</span>
                        <span>Tester: {r?.tester || <span className="sv-blank-inline" />}</span>
                        <span>{r?.executed_at ? new Date(r.executed_at).toLocaleDateString() : ''}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </Section>
          ))}
        </>
      )}

      {/* TRACEABILITY */}
      {show('trace') && (
        <Section title="Requirements Traceability Matrix">
          <p className="sv-note">Every user requirement traces forward to system requirements and test cases; every requirement is covered.</p>
          <div className="sv-scroll">
            <table className="sv-table"><thead><tr><th style={{ width: 84 }}>URS</th><th>User requirement</th><th style={{ width: 160 }}>System (FRS)</th><th style={{ width: 200 }}>Test cases</th></tr></thead>
              <tbody>{trace.map(({ u, frs, tests }) => (
                <tr key={u.id}>
                  <td className="sv-id">{u.id}</td><td>{u.title}</td>
                  <td className="sv-ref">{frs.map((f) => f.id).join(', ') || <span className="sv-gap">—</span>}</td>
                  <td className="sv-ref">{tests.map((t) => t.id).join(', ') || <span className="sv-gap">none</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {orphanFrs.length > 0 && <p className="sv-note">System requirements without a direct test (verified via higher-level PQ / review): {orphanFrs.map((f) => f.id).join(', ')}.</p>}
        </Section>
      )}

      {/* CAPA / DEVIATIONS */}
      {show('capa') && (
        <Section title="CAPA / Deviation Log">
          <p className="sv-note">Record each test failure, deviation or incident here, its root cause and corrective/preventive action. No open high-risk item may remain when the Summary Report is approved.</p>
          <div className="sv-scroll">
            <table className="sv-table sv-wide"><thead><tr>{CAPA_COLUMNS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{Array.from({ length: 6 }).map((_, i) => <tr key={i}>{CAPA_COLUMNS.map((c) => <td key={c} className="sv-blank" style={{ height: 26 }} />)}</tr>)}</tbody>
            </table>
          </div>
        </Section>
      )}

      {/* VALIDATION SUMMARY REPORT */}
      {show('vsr') && (
        <Section title="Validation Summary Report (template)">
          <p className="sv-note">Completed after execution. The live execution figures below are drawn from the tracker; the narrative is filled in and approved by QA.</p>
          <div className="sv-exec-summary">Recorded to date: <b>{summary.done}</b>/{summary.total} · <span className="sv-risk sv-risk-low">{summary.pass} Pass</span> · <span className="sv-risk sv-risk-high">{summary.fail} Fail</span></div>
          {VSR.map((s, i) => (
            <div key={i} style={{ marginTop: 10 }}>
              <div className="sv-h3" style={{ fontSize: 14, border: 'none', display: 'block', marginBottom: 2 }}>{s.heading}</div>
              {s.body.map((p, j) => <p className="sv-p" key={j}>{p}</p>)}
            </div>
          ))}
          <table className="sv-table" style={{ marginTop: 10 }}><thead><tr><th>Approver role</th><th>Name</th><th>Signature</th><th>Date</th></tr></thead>
            <tbody>{APPROVALS.filter((a) => a.role !== 'Author' && a.role !== 'IT / Technical').map((a) => <tr key={a.role}><td>{a.role}</td><td className="sv-blank" /><td className="sv-blank" /><td className="sv-blank" /></tr>)}</tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

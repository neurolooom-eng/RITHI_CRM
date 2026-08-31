import { useMemo, useState, type ReactNode } from 'react';
import { PageHeader } from '../components/ui/ui';
import {
  VAL_META, APPROVALS, APPROACH, CHECKLIST, URS, FRS, ARCHITECTURE, DETAILED, RISKS, TESTS,
  type Risk,
} from '../lib/validation';
import './softwarevalidation.css';

// ===========================================================================
// SOFTWARE VALIDATION — Admin-only. Renders the CSV/CSA + ISO/TR 80002-2
// validation package (plan, checklist, URS, SRS, design, risk, test protocol,
// traceability) authored in src/lib/validation.ts. Read-only reference for QA
// to review, approve and execute; printable.
// ===========================================================================

const riskBadge = (r: Risk) => <span className={`sv-risk sv-risk-${r.toLowerCase()}`}>{r}</span>;

type TabKey = 'overview' | 'approach' | 'checklist' | 'urs' | 'srs' | 'arch' | 'design' | 'risk' | 'tests' | 'trace';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'approach', label: 'Validation Plan' },
  { key: 'checklist', label: 'Compliance Checklist' },
  { key: 'urs', label: 'User Requirements' },
  { key: 'srs', label: 'System Requirements' },
  { key: 'arch', label: 'Architecture Design' },
  { key: 'design', label: 'Detailed Design' },
  { key: 'risk', label: 'Risk Assessment' },
  { key: 'tests', label: 'Test Protocol' },
  { key: 'trace', label: 'Traceability' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="sv-sec"><h3 className="sv-h3">{title}</h3>{children}</section>;
}

export function SoftwareValidation() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [all, setAll] = useState(false); // render every section (for printing the full package)
  const show = (k: TabKey) => all || tab === k;
  const printAll = () => { setAll(true); setTimeout(() => { window.print(); setAll(false); }, 60); };

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

      {/* TESTS */}
      {show('tests') && (['IQ', 'OQ', 'PQ'] as const).map((phase) => (
        <Section key={phase} title={`${phase === 'IQ' ? 'Installation' : phase === 'OQ' ? 'Operational' : 'Performance'} Qualification (${phase})`}>
          {TESTS.filter((t) => t.phase === phase).map((t) => (
            <div className="sv-test" key={t.id}>
              <div className="sv-test-head">
                <b>{t.id}</b> — {t.objective} {riskBadge(t.risk)}
                <span className="sv-ref">traces: {t.reqs.join(', ')}</span>
              </div>
              <ol className="sv-steps">{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              <div className="sv-exp"><b>Expected result:</b> {t.expected}</div>
              <div className="sv-result"><span>Actual result: <span className="sv-blank-inline" /></span><span>Pass / Fail: <span className="sv-blank-inline sm" /></span><span>Tester / Date: <span className="sv-blank-inline" /></span></div>
            </div>
          ))}
        </Section>
      ))}

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
    </div>
  );
}

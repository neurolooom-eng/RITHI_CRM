import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FLOWS, layoutFlow, type Flow, type FlowStep } from '../../lib/flows';
import { URS, FRS, TESTS } from '../../lib/validation';
import { MODULES } from '../../lib/rbac';
import './flow.css';

// ---------------------------------------------------------------------------
// A DATA FLOW, DRAWN FROM ITS DEFINITION (src/lib/flows.ts). Boxes are steps,
// arrows are what moves between them; a box is a button that opens what the
// step does, the screen it happens on and the requirements that state it.
//
// SVG, NOT A CHARTING LIBRARY: the layout is twenty lines of arithmetic in
// flows.ts and a dependency would be one more supplier to assess in the
// validation package for a picture of boxes. It takes the theme's own colours,
// so it reads in light and dark alike, and it prints.
// ---------------------------------------------------------------------------

const TITLES = new Map<string, string>([
  ...URS.map((r) => [r.id, r.title] as [string, string]),
  ...FRS.map((r) => [r.id, r.title] as [string, string]),
  ...TESTS.map((t) => [t.id, t.objective] as [string, string]),
]);
const SCREEN = new Map(MODULES.map((m) => [m.path, m.label]));

function StepDetail({ step }: { step: FlowStep }) {
  return (
    <div className="fl-detail">
      <div className="fl-detail-head">
        <b>{step.label}</b>
        {step.automatic && <span className="badge badge-info">automatic</span>}
        {step.route && <Link className="btn btn-sm" to={step.route}>Open {SCREEN.get(step.route) ?? step.route} →</Link>}
      </div>
      <p>{step.detail}</p>
      {!!step.records?.length && <p className="fl-muted">Records: {step.records.map((r) => <code key={r}>{r}</code>).reduce<ReactNode[]>((a, c, i) => (i ? [...a, ', ', c] : [c]), [])}</p>}
      <ul className="fl-reqs">
        {step.reqs.map((id) => (
          <li key={id}><code>{id}</code> {TITLES.get(id) ?? <span className="fl-muted">(stated in {id.split('-')[0]} requirements document)</span>}</li>
        ))}
      </ul>
    </div>
  );
}

export function FlowDiagram({ flow, printAll = false }: { flow: Flow; printAll?: boolean }) {
  const layout = useMemo(() => layoutFlow(flow), [flow]);
  const [picked, setPicked] = useState<string | null>(null);
  const step = flow.steps.find((s) => s.id === picked) ?? null;
  const markerId = `fl-arrow-${flow.id}`;

  return (
    <div className="fl-flow">
      <div className="fl-scroll">
        <svg className="fl-svg" width={layout.width} height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`} role="img"
          aria-label={`${flow.title}: ${flow.steps.map((s) => s.label).join(', then ')}`}>
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fl-arrowhead" />
            </marker>
          </defs>
          {layout.edges.map((e, i) => (
            <g key={i}>
              <path d={e.d} className={`fl-edge${e.edge.optional ? ' fl-edge-opt' : ''}${e.edge.loop ? ' fl-edge-loop' : ''}`}
                markerEnd={`url(#${markerId})`} />
              {e.edge.label && <text x={e.lx} y={e.ly} className="fl-edge-label" textAnchor="middle">{e.edge.label}</text>}
            </g>
          ))}
          {layout.nodes.map((n) => (
            <g key={n.step.id} className={`fl-node fl-${n.step.area}${picked === n.step.id ? ' fl-on' : ''}`}
              transform={`translate(${n.x},${n.y})`} role="button" tabIndex={0}
              aria-label={`${n.step.label}. Show details`}
              onClick={() => setPicked(picked === n.step.id ? null : n.step.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(picked === n.step.id ? null : n.step.id); } }}>
              <rect width={n.w} height={n.h} rx={8} className="fl-box" />
              <rect width={5} height={n.h} rx={2} className="fl-stripe" />
              {n.lines.map((l, i) => <text key={i} x={14} y={20 + i * 15} className="fl-label">{l}</text>)}
              <text x={14} y={n.h - 9} className="fl-sub">
                {n.step.automatic ? '⚙ ' : ''}{n.step.route ? (SCREEN.get(n.step.route) ?? n.step.route) : 'database'}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {printAll ? (
        <table className="sv-table fl-table">
          <thead><tr><th>Step</th><th>Screen</th><th>What happens</th><th>Requirements</th></tr></thead>
          <tbody>
            {flow.steps.map((s) => (
              <tr key={s.id}>
                <td><b>{s.label}</b>{s.automatic ? ' (automatic)' : ''}</td>
                <td>{s.route ? (SCREEN.get(s.route) ?? s.route) : '—'}</td>
                <td>{s.detail}</td>
                <td>{s.reqs.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : step ? <StepDetail step={step} /> : (
        <p className="fl-muted fl-hint">Select a box to see what that step does, where it happens and which requirements state it.</p>
      )}
    </div>
  );
}

/** Every flow, one chosen at a time — or all of them, for printing. */
export function FlowGallery({ printAll = false }: { printAll?: boolean }) {
  const [id, setId] = useState<string>(FLOWS[0]?.id ?? '');
  if (!FLOWS.length) return <p className="fl-muted">No data flows are defined yet.</p>;
  const shown = printAll ? FLOWS : FLOWS.filter((f) => f.id === id).slice(0, 1);
  return (
    <div>
      {!printAll && (
        <div className="fl-chips" role="tablist" aria-label="Data flow">
          {FLOWS.map((f) => (
            <button key={f.id} role="tab" aria-selected={f.id === id}
              className={`chip ${f.id === id ? 'chip-on' : ''}`} onClick={() => setId(f.id)}>{f.title}</button>
          ))}
        </div>
      )}
      {shown.map((f) => (
        <section key={f.id} className="fl-section">
          <h3 className="sv-h3">{f.title}</h3>
          <p>{f.purpose}</p>
          <FlowDiagram flow={f} printAll={printAll} />
        </section>
      ))}
      <p className="fl-muted fl-legend">
        <span className="fl-key fl-call" /> Calls <span className="fl-key fl-spare" /> Spares
        <span className="fl-key fl-stock" /> Hand stock <span className="fl-key fl-quality" /> Quality
        <span className="fl-key fl-cover" /> Cover <span className="fl-key fl-master" /> Masters
        <span className="fl-key fl-report" /> Reports · a dashed arrow happens only sometimes; an arrow underneath goes back.
      </p>
    </div>
  );
}

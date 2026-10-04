import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FLOWS as ALL_FLOWS, layoutFlow, type Flow, type FlowStep } from '../../lib/flows';
import { useAuditMode } from '../../lib/auditMode';
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
      {/* AND THE TESTS THAT SHOW IT: every test whose trace names one of the
          step's requirements, so the step reads need → mechanism → evidence. */}
      {(() => {
        const tests = TESTS.filter((t) => t.reqs.some((r) => step.reqs.includes(r)));
        return tests.length
          ? <p className="fl-muted">Tests: {tests.map((t) => t.id).join(', ')}</p>
          : <p className="fl-muted">No test traces to these requirements yet.</p>;
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ▶ PLAY — the flow walked through one step at a time (the user, 2026-10-02:
// "Create an animated Data Flow diagram for all the workflows", and asked how:
// "Play step by step"). The order is the order of the process — the layout's
// columns, left to right, top to bottom within a column — so a step is never
// shown before the steps that feed it. Played steps stay solid, the current one
// is lifted (contrast, the project's highlight), the rest wait faded, and the
// arrows INTO the current step run. Pause, step back or forward, or click a box
// to stop and read it. With reduced motion asked for, nothing moves by itself:
// the arrows stay still and Play advances only on Next.
// ---------------------------------------------------------------------------
const STEP_MS = 3400;
const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export function FlowDiagram({ flow, printAll = false }: { flow: Flow; printAll?: boolean }) {
  const layout = useMemo(() => layoutFlow(flow), [flow]);
  const [picked, setPicked] = useState<string | null>(null);
  const markerId = `fl-arrow-${flow.id}`;
  const liveMarkerId = `fl-arrow-live-${flow.id}`;

  // The walk order: column, then position down the column.
  const order = useMemo(() => [...layout.nodes].sort((a, b) => a.rank - b.rank || a.y - b.y).map((n) => n.step.id), [layout]);
  const [pos, setPos] = useState<number | null>(null);      // index into `order` while walking
  const [playing, setPlaying] = useState(false);
  const still = useMemo(reducedMotion, []);
  const scroller = useRef<HTMLDivElement>(null);

  // A new flow starts at rest.
  useEffect(() => { setPos(null); setPlaying(false); setPicked(null); }, [flow.id]);

  // Advance on a timer while playing; stop at the last step.
  useEffect(() => {
    if (!playing || still) return;
    const t = window.setTimeout(() => {
      setPos((p) => {
        const next = (p ?? -1) + 1;
        if (next >= order.length - 1) setPlaying(false);
        return Math.min(next, order.length - 1);
      });
    }, pos === null ? 0 : STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, pos, order.length, still]);

  const current = pos === null ? null : order[pos];
  const shownId = current ?? picked;
  const step = flow.steps.find((s) => s.id === shownId) ?? null;
  const doneSet = useMemo(() => new Set(pos === null ? [] : order.slice(0, pos)), [order, pos]);

  // Keep the current step in view in a wide diagram.
  useEffect(() => {
    if (!current || !scroller.current) return;
    const n = layout.nodes.find((x) => x.step.id === current);
    if (!n) return;
    const box = scroller.current;
    const left = Math.max(0, n.x + n.w / 2 - box.clientWidth / 2);
    box.scrollTo({ left, behavior: still ? 'auto' : 'smooth' });
  }, [current, layout, still]);

  const play = () => {
    if (pos !== null && pos >= order.length - 1) setPos(null);   // finished: start again
    setPicked(null);
    if (still) setPos((p) => (p === null ? 0 : p));
    else setPlaying(true);
  };
  const goto = (i: number) => { setPlaying(false); setPicked(null); setPos(Math.max(0, Math.min(order.length - 1, i))); };
  const nodeClass = (id: string) => {
    if (pos === null) return picked === id ? ' fl-on' : '';
    if (id === current) return ' fl-on';
    return doneSet.has(id) ? ' fl-done' : ' fl-later';
  };
  const edgeLive = (from: string, to: string) => !!current && to === current && (doneSet.has(from) || from === current);

  return (
    <div className="fl-flow">
      {!printAll && (
        <div className="fl-player" role="group" aria-label="Play the flow step by step">
          {playing
            ? <button className="btn btn-sm btn-primary" onClick={() => setPlaying(false)} aria-label="Pause">⏸ Pause</button>
            : <button className="btn btn-sm btn-primary" onClick={play} aria-label="Play the flow step by step">▶ {pos === null ? 'Play' : pos >= order.length - 1 ? 'Play again' : 'Resume'}</button>}
          <button className="btn btn-sm" onClick={() => goto((pos ?? 0) - 1)} disabled={pos === null || pos === 0} aria-label="Previous step">⏮ Previous</button>
          <button className="btn btn-sm" onClick={() => goto(pos === null ? 0 : pos + 1)} disabled={pos !== null && pos >= order.length - 1} aria-label="Next step">Next ⏭</button>
          {pos !== null && <button className="btn btn-sm btn-ghost" onClick={() => { setPlaying(false); setPos(null); }}>↺ Reset</button>}
          <span className="fl-muted fl-player-pos" aria-live="polite">
            {pos === null ? `${order.length} steps` : `Step ${pos + 1} of ${order.length}`}
          </span>
        </div>
      )}
      <div className={`fl-scroll${pos !== null ? ' fl-walking' : ''}${still ? ' fl-still' : ''}`} ref={scroller}>
        <svg className="fl-svg" width={layout.width} height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`} role="img"
          aria-label={`${flow.title}: ${flow.steps.map((s) => s.label).join(', then ')}`}>
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fl-arrowhead" />
            </marker>
            <marker id={liveMarkerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fl-arrowhead-live" />
            </marker>
          </defs>
          {layout.edges.map((e, i) => {
            const live = edgeLive(e.edge.from, e.edge.to);
            const dim = pos !== null && !live && !(doneSet.has(e.edge.from) && (doneSet.has(e.edge.to) || e.edge.to === current));
            return (
            <g key={i} className={dim ? 'fl-edge-dim' : undefined}>
              <path d={e.d} className={`fl-edge${e.edge.optional ? ' fl-edge-opt' : ''}${e.edge.loop ? ' fl-edge-loop' : ''}${live ? ' fl-edge-live' : ''}`}
                markerEnd={`url(#${live ? liveMarkerId : markerId})`} />
              {e.edge.label && <text x={e.lx} y={e.ly} className="fl-edge-label" textAnchor="middle">{e.edge.label}</text>}
            </g>
            );
          })}
          {layout.nodes.map((n) => (
            <g key={n.step.id} className={`fl-node fl-${n.step.area}${nodeClass(n.step.id)}`}
              transform={`translate(${n.x},${n.y})`} role="button" tabIndex={0}
              aria-label={`${n.step.label}. Show details`}
              onClick={() => { setPlaying(false); setPos(null); setPicked(picked === n.step.id ? null : n.step.id); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlaying(false); setPos(null); setPicked(picked === n.step.id ? null : n.step.id); } }}>
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
        <p className="fl-muted fl-hint">Press ▶ Play to walk through the flow one step at a time, or select a box to see what that step does, where it happens and which requirements state it.</p>
      )}
    </div>
  );
}

/** Every flow, one chosen at a time — or all of them, for printing. */
export function FlowGallery({ printAll = false, pick }: { printAll?: boolean; pick?: string }) {
  // A non-auditable flow (auditHidden) is left out while Audit Mode is on.
  const auditOn = useAuditMode().on;
  const FLOWS = ALL_FLOWS.filter((f) => !(f.auditHidden && auditOn));
  const [id, setId] = useState<string>(pick && FLOWS.some((f) => f.id === pick) ? pick : (FLOWS[0]?.id ?? ''));
  // Opened from elsewhere on a named flow (the module guide's "Part of" chips).
  useEffect(() => { if (pick && FLOWS.some((f) => f.id === pick)) setId(pick); }, [pick]);
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
        <span className="fl-key fl-report" /> Reports <span className="fl-key fl-doc" /> Documents &amp; training
        <span className="fl-key fl-admin" /> Administration · a dashed arrow happens only sometimes; an arrow underneath goes back.
      </p>
    </div>
  );
}

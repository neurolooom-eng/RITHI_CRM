import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import './charts.css';

// ===========================================================================
// Lightweight dependency-free charts for the Dashboard system.
// BarChart (horizontal), ColumnChart (vertical) and DonutChart cover the
// analytics needs (product-wise volumes, failure rates, status mixes).
// ===========================================================================

export interface Datum {
  label: string;
  value: number;
  tone?: string; // a CSS color or theme var
}

/** Optional interaction, shared by all three charts.
 *
 *  `onPick` turns each mark into a BUTTON — so a chart that can be clicked is
 *  also reachable by keyboard and announced as pressable, rather than being a
 *  div that happens to respond to a mouse.
 *
 *  `active` is the label currently chosen. Selection is drawn by INVERTING
 *  against the page (the project's rule: highlight means CONTRAST, not a tint)
 *  and by dimming what is not chosen, so the choice reads in either theme
 *  without a hand-picked highlight colour. */
export interface Pickable {
  onPick?: (label: string) => void;
  active?: string | null;
}

/** Shared by the three charts so a mark behaves the same wherever it is drawn. */
function markProps(d: Datum, { onPick, active }: Pickable) {
  if (!onPick) return { className: '', props: {} as Record<string, unknown> };
  const on = active === d.label;
  return {
    className: `ch-pick${on ? ' is-active' : ''}${active && !on ? ' is-dimmed' : ''}`,
    props: {
      role: 'button' as const,
      tabIndex: 0,
      'aria-pressed': on,
      title: on ? `${d.label} — chosen. Click to clear.` : `Show only ${d.label}`,
      onClick: () => onPick(d.label),
      onKeyDown: (e: { key: string; preventDefault: () => void }) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(d.label); }
      },
    },
  };
}

const TONE_VARS = ['--primary', '--info', '--warning', '--success', '--danger', '--accent'];
const toneAt = (i: number) => `var(${TONE_VARS[i % TONE_VARS.length]})`;

/** How wide the label column is, remembered per chart. A width that suits root
 *  causes ("SOLENOID BLOCK ASSEMBLY") does not suit covers ("WGP"), so each
 *  chart keeps its own under its own key rather than one setting for all. */
const BAR_LABEL_KEY = 'rithi.charts.barLabel';
const readLabelWidth = (id: string, fallback: number): number => {
  try {
    const v = Number(JSON.parse(localStorage.getItem(`${BAR_LABEL_KEY}.${id}`) ?? 'null'));
    return Number.isFinite(v) && v >= 60 ? v : fallback;
  } catch { return fallback; }   // a remembered width is not worth an error
};

export function BarChart({
  data, unit = '', onPick, active, labelWidth = 190, widthKey,
}: { data: Datum[]; unit?: string;
     /** Starting width of the label column, in px. */
     labelWidth?: number;
     /** Remember the reader's own width under this name. Without it the chart
      *  is still draggable, it just forgets. */
     widthKey?: string } & Pickable) {
  const max = Math.max(1, ...data.map((d) => d.value));
  // ---------------------------------------------------------------------------
  // LABEL, THEN TOTAL, THEN BAR — and the label column is DRAGGABLE.
  //
  // The user, 2026-09-14, of the Root Cause chart: "not able to read these -
  // Make those Columns Adjustable , Move the Total next to the RootCause , the
  // Bar can be the last Column."
  //
  // The order matters more than it looks. The two things a reader is comparing
  // are the NAME and the NUMBER, and they had a bar between them — so reading
  // "SOLENOID BLOCK AS… 3" meant crossing the whole width twice. Put together
  // they read as a list, and the bar becomes what it actually is: the shape of
  // the list, not a column to read across.
  //
  // AND THE NAMES ARE AS LONG AS SOMEBODY TYPED THEM. A fixed 130px truncated
  // every root cause this register holds. A wider fixed column would only move
  // the cut, because the right width depends on the chart — so it is the
  // reader's to set, and remembered.
  // ---------------------------------------------------------------------------
  const [lw, setLw] = useState(() => (widthKey ? readLabelWidth(widthKey, labelWidth) : labelWidth));
  const drag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();                     // never let the handle pick a bar
    const host = e.currentTarget.closest('.ch-bars') as HTMLElement | null;
    if (!host) return;
    const move = (ev: PointerEvent) => {
      const r = host.getBoundingClientRect();
      // Capped so the bar cannot be dragged out of existence: a chart with no
      // bar left is a table, and the reader still has to see the shape.
      setLw(Math.min(Math.max(ev.clientX - r.left, 60), Math.max(120, r.width - 160)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setLw((w) => {
        if (widthKey) {
          try { localStorage.setItem(`${BAR_LABEL_KEY}.${widthKey}`, JSON.stringify(w)); }
          catch { /* as above */ }
        }
        return w;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="ch-bars" style={{ ['--ch-label-w' as string]: `${lw}px` }}>
      {data.length === 0 && <div className="ch-empty">No data</div>}
      {data.map((d, i) => {
      const m = markProps(d, { onPick, active });
      return (
        <div className={`ch-bar-row ${m.className}`} key={d.label + i} {...m.props}>
          <span className="ch-bar-label" title={d.label}>
            {d.label}
          </span>
          <span className="ch-bar-value">
            {d.value}
            {unit}
          </span>
          <div className="ch-bar-track">
            <div
              className="ch-bar-fill"
              style={{ width: `${(d.value / max) * 100}%`, background: d.tone ?? toneAt(i) }}
            />
          </div>
        </div>
      );
      })}
      {/* THE HANDLE SITS OVER THE COLUMN EDGE, once for the whole chart rather
          than once per row — dragging is about the chart's layout, not about
          any one bar. It is a real separator so a keyboard reader is told it
          is there, and it must not fall through to the bar underneath. */}
      {data.length > 0 && (
        <div className="ch-bar-grip" role="separator" aria-orientation="vertical"
             aria-label="Drag to widen the label column" title="Drag to widen the label column"
             onPointerDown={drag} onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  );
}

export function ColumnChart({ data, unit = '', onPick, active }: { data: Datum[]; unit?: string } & Pickable) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="ch-cols">
      {data.map((d, i) => {
      const m = markProps(d, { onPick, active });
      return (
        <div className={`ch-col ${m.className}`} key={d.label + i} {...m.props}>
          <div className="ch-col-track">
            <div className="ch-col-value-top">
              {d.value}
              {unit}
            </div>
            <div
              className="ch-col-fill"
              style={{ height: `${(d.value / max) * 100}%`, background: d.tone ?? toneAt(i) }}
            />
          </div>
          <span className="ch-col-label">{d.label}</span>
        </div>
      );
      })}
    </div>
  );
}

export function DonutChart({ data, size = 150, onPick, active }: { data: Datum[]; size?: number } & Pickable) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2;
  const inner = r * 0.62;
  let acc = 0;
  const segs = data.map((d, i) => {
    const start = (acc / total) * 360;
    acc += d.value;
    const end = (acc / total) * 360;
    return { ...d, start, end, color: d.tone ?? toneAt(i) };
  });
  const polar = (deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [r + radius * Math.cos(rad), r + radius * Math.sin(rad)];
  };
  const arc = (s: number, e: number, radius: number) => {
    const [x1, y1] = polar(s, radius);
    const [x2, y2] = polar(e, radius);
    const large = e - s > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };
  return (
    <div className="ch-donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segs.map((s, i) =>
          s.end > s.start ? (
            <path
              key={i}
              d={arc(s.start, s.end === 360 ? 359.99 : s.end, (r + inner) / 2)}
              stroke={s.color}
              // The chosen segment thickens and the rest fade, so the ring says
              // which slice the page is answering for without a second colour.
              strokeWidth={onPick && active === s.label ? (r - inner) * 1.25 : r - inner}
              opacity={onPick && active && active !== s.label ? 0.3 : 1}
              fill="none"
              style={onPick ? { cursor: 'pointer' } : undefined}
              onClick={onPick ? () => onPick(s.label) : undefined}
            />
          ) : null,
        )}
        <text x={r} y={r - 4} textAnchor="middle" className="ch-donut-total">
          {total}
        </text>
        <text x={r} y={r + 14} textAnchor="middle" className="ch-donut-cap">
          total
        </text>
      </svg>
      <div className="ch-legend">
        {segs.map((s, i) => {
          const m = markProps(s, { onPick, active });
          return (
            <div className={`ch-legend-row ${m.className}`} key={i} {...m.props}>
              <span className="ch-legend-dot" style={{ background: s.color }} />
              <span className="ch-legend-label">{s.label}</span>
              <span className="ch-legend-val">{s.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// LINE AND PARETO — the two the Field Failure Insights tab asked for.
//
// The user, 2026-09-14: "Add a Pareto Chart , Make it a Line Chart 'Reports
// raised, month by month' , Allow me to adjust it [Monthly , Quarterly ,
// Yearly]".
//
// STILL DEPENDENCY-FREE, like the three above. A charting library would be
// 40kB+ on a page that draws two shapes, and the CSP on this deployment admits
// scripts from a short list of CDNs only — a build-time dependency is not the
// same bargain as a two-file component.
//
// DRAWN IN SVG WITH A viewBox and PROPORTIONAL scaling, so both fit whatever
// width they are given rather than a pixel size measured at render. NOT
// `preserveAspectRatio="none"`, which is the obvious way to make a chart fill
// its box and shears every glyph and stroke in it as the page widens — the
// axis numbers come out visibly stretched. Every colour comes from a
// theme token: a hand-picked hue works in one theme and not the other, which is
// the project's standing rule about highlighting.
// ===========================================================================

/** Room for the axis labels. Left for the value scale, bottom for the
 *  category, and the viewBox includes them — an SVG whose outermost label sits
 *  outside its box is clipped in exactly the browsers nobody tests in. */
const PAD = { l: 34, r: 12, t: 14, b: 26 };
const VB_W = 640;
const VB_H = 200;

/** Ticks that land on ROUND NUMBERS, so the gridlines mean something. A scale
 *  topped at the exact maximum puts a line through the tallest point and labels
 *  it 37, which is a number nobody chose. */
function niceMax(max: number): number {
  if (max <= 5) return Math.max(1, Math.ceil(max));
  const pow = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / (pow / 2)) * (pow / 2);
}

export function LineChart({
  data, unit = '', onPick, active, showLabels = false,
}: { data: Datum[]; unit?: string;
     /** Print each point's value above it. OFF by default: on a dense series
      *  the numbers collide and read as noise, so it is the reader's call. */
     showLabels?: boolean } & Pickable) {
  if (!data.length) return <div className="ch-empty">No data</div>;
  const top = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const w = VB_W - PAD.l - PAD.r;
  const h = VB_H - PAD.t - PAD.b;
  // A SINGLE POINT HAS NO LINE, and dividing by zero would put it at NaN. It is
  // drawn in the middle instead, which is the honest picture of one reading.
  const x = (i: number) => PAD.l + (data.length === 1 ? w / 2 : (i / (data.length - 1)) * w);
  const y = (v: number) => PAD.t + h - (v / top) * h;
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const ticks = [0, top / 2, top];

  // Every label would overlap past a dozen or so points, so only some are
  // drawn — and the FIRST and LAST always are, because a trend with no idea
  // when it starts or ends is not a trend.
  const every = Math.max(1, Math.ceil(data.length / 12));
  const labelled = (i: number) => i === 0 || i === data.length - 1 || i % every === 0;

  return (
    <div className="ch-line">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="ch-line-svg" role="img"
           aria-label={`Line chart, ${data.length} points, highest ${Math.max(...data.map((d) => d.value))}${unit}`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={VB_W - PAD.r} y1={y(t)} y2={y(t)} className="ch-grid" />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="ch-axis">{Math.round(t)}</text>
          </g>
        ))}
        {/* The area first, so the line and the points sit on top of it. */}
        <polygon className="ch-line-area"
                 points={`${PAD.l},${y(0)} ${pts} ${x(data.length - 1)},${y(0)}`} />
        <polyline className="ch-line-path" points={pts} />
        {data.map((d, i) => {
          const on = active === d.label;
          return (
            <g key={d.label + i}>
              <circle cx={x(i)} cy={y(d.value)} r={on ? 5.5 : 3.5}
                      className={`ch-line-dot${on ? ' is-active' : ''}${active && !on ? ' is-dimmed' : ''}`} />
              {/* A GENEROUS INVISIBLE TARGET. A 3.5px dot is not something
                  anybody hits on a phone, and a chart that can be clicked in
                  theory only is worse than one that cannot. */}
              {onPick && (
                <circle cx={x(i)} cy={y(d.value)} r={14} fill="transparent" className="ch-hit"
                        role="button" tabIndex={0} aria-pressed={on}
                        aria-label={`${d.label}: ${d.value}${unit}`}
                        onClick={() => onPick(d.label)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(d.label); }
                        }}>
                  <title>{`${d.label}: ${d.value}${unit}`}</title>
                </circle>
              )}
              {labelled(i) && (
                <text x={x(i)} y={VB_H - 8} textAnchor="middle"
                      className={`ch-axis${on ? ' is-active' : ''}`}>{d.label}</text>
              )}
              {/* THE VALUE, above its own point. Nudged INWARD at the two ends
                  so the first and last numbers stay inside the drawing instead
                  of being clipped by the viewBox — the one place a centred
                  label cannot be centred. */}
              {showLabels && (
                <text
                  x={x(i)}
                  y={y(d.value) - 8}
                  textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                  className={`ch-line-tag${on ? ' is-active' : ''}`}
                >
                  {d.value}{unit}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A Pareto: the count per category descending, with the CUMULATIVE SHARE as a
 *  line against a second scale, and the 80% mark drawn.
 *
 *  The point of the shape is the answer to "how few do I have to fix": the
 *  categories left of where the line crosses 80% are the ones worth a CAPA.
 *  Nothing here decides that for the reader — the crossing is MARKED rather
 *  than the bars being recoloured, because "vital few" is a judgement about
 *  the process and this chart only reports the arithmetic. */
export function ParetoChart({ data, onPick, active, showLabels = false }:
  { data: Datum[]; showLabels?: boolean } & Pickable) {
  if (!data.length) return <div className="ch-empty">No data</div>;
  const sorted = [...data].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const total = sorted.reduce((s2, d) => s2 + d.value, 0) || 1;
  const top = niceMax(Math.max(1, ...sorted.map((d) => d.value)));
  const PAD2 = { ...PAD, r: 36 };
  const w = VB_W - PAD2.l - PAD2.r;
  const h = VB_H - PAD2.t - PAD2.b;
  const band = w / sorted.length;
  const bx = (i: number) => PAD2.l + i * band;
  const y = (v: number) => PAD2.t + h - (v / top) * h;
  const yPct = (p: number) => PAD2.t + h - (p / 100) * h;

  let acc = 0;
  const cum = sorted.map((d) => { acc += d.value; return (acc / total) * 100; });
  const line = cum.map((p, i) => `${bx(i) + band / 2},${yPct(p)}`).join(' ');
  // The first category at or past 80% — where the "vital few" stop.
  const crossing = cum.findIndex((p) => p >= 80);

  return (
    <div className="ch-pareto">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="ch-line-svg" role="img"
           aria-label={`Pareto chart of ${sorted.length} categories over ${total} reports`}>
        {[0, top / 2, top].map((t, i) => (
          <g key={i}>
            <line x1={PAD2.l} x2={VB_W - PAD2.r} y1={y(t)} y2={y(t)} className="ch-grid" />
            <text x={PAD2.l - 6} y={y(t) + 4} textAnchor="end" className="ch-axis">{Math.round(t)}</text>
          </g>
        ))}
        {/* THE 80% LINE, and its label on the RIGHT so it cannot be read as a
            count — the two scales on this chart mean different things. */}
        <line x1={PAD2.l} x2={VB_W - PAD2.r} y1={yPct(80)} y2={yPct(80)} className="ch-pareto-80" />
        <text x={VB_W - PAD2.r + 4} y={yPct(80) + 4} className="ch-axis">80%</text>
        <text x={VB_W - PAD2.r + 4} y={yPct(100) + 4} className="ch-axis">100%</text>

        {sorted.map((d, i) => {
          const on = active === d.label;
          return (
            <g key={d.label + i}>
              <rect x={bx(i) + band * 0.14} width={band * 0.72}
                    y={y(d.value)} height={Math.max(0, PAD2.t + h - y(d.value))}
                    className={`ch-pareto-bar${on ? ' is-active' : ''}${active && !on ? ' is-dimmed' : ''}${
                      crossing >= 0 && i <= crossing ? ' is-vital' : ''}`}
                    {...(onPick ? {
                      role: 'button' as const, tabIndex: 0, 'aria-pressed': on,
                      onClick: () => onPick(d.label),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(d.label); }
                      },
                    } : {})}>
                <title>{`${d.label}: ${d.value} — ${cum[i].toFixed(0)}% cumulative`}</title>
              </rect>
              {/* THE COUNT, above its own bar. A Pareto carries TWO scales, so
                  each label sits against the mark it belongs to and nowhere
                  else: the count on the bar, the percentage on the dot below.
                  Clamped INSIDE the drawing — the tallest bar reaches the top
                  of the plot and a label eight units above it would be cut off
                  by the viewBox. */}
              {showLabels && (
                <text x={bx(i) + band / 2} y={Math.max(PAD2.t + 9, y(d.value) - 5)}
                      textAnchor="middle" className={`ch-line-tag${on ? ' is-active' : ''}`}>
                  {d.value}
                </text>
              )}
            </g>
          );
        })}
        <polyline className="ch-pareto-line" points={line} />
        {cum.map((p, i) => (
          <circle key={i} cx={bx(i) + band / 2} cy={yPct(p)} r={2.5} className="ch-pareto-dot" />
        ))}
        {/* THE CUMULATIVE PERCENTAGE, under its own dot — under, not over,
            because the line climbs to the top right and a label above the last
            few points would leave the drawing. Whole numbers: the line is read
            for where it crosses 80, not to one decimal place. */}
        {showLabels && cum.map((pc, i) => (
          <text key={`c${i}`} x={bx(i) + band / 2} y={Math.min(PAD2.t + h - 3, yPct(pc) + 13)}
                textAnchor={i === 0 ? 'start' : i === cum.length - 1 ? 'end' : 'middle'}
                className="ch-pareto-tag">
            {pc.toFixed(0)}%
          </text>
        ))}
      </svg>
      {/* THE LABELS ARE BELOW THE DRAWING, NOT INSIDE IT. A category name is
          as long as somebody typed it, and rotated text inside an SVG that
          stretches with the page shears. */}
      <div className="ch-pareto-keys" style={{ gridTemplateColumns: `repeat(${sorted.length}, 1fr)` }}>
        {sorted.map((d, i) => (
          <span key={d.label + i}
                className={`ch-pareto-key${active === d.label ? ' is-active' : ''}${
                  crossing >= 0 && i <= crossing ? ' is-vital' : ''}`}
                title={`${d.label} — ${d.value} (${cum[i].toFixed(0)}% cumulative)`}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

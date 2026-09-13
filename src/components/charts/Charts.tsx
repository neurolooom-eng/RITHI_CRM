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

export function BarChart({ data, unit = '', onPick, active }: { data: Datum[]; unit?: string } & Pickable) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="ch-bars">
      {data.length === 0 && <div className="ch-empty">No data</div>}
      {data.map((d, i) => {
      const m = markProps(d, { onPick, active });
      return (
        <div className={`ch-bar-row ${m.className}`} key={d.label + i} {...m.props}>
          <span className="ch-bar-label" title={d.label}>
            {d.label}
          </span>
          <div className="ch-bar-track">
            <div
              className="ch-bar-fill"
              style={{ width: `${(d.value / max) * 100}%`, background: d.tone ?? toneAt(i) }}
            />
          </div>
          <span className="ch-bar-value">
            {d.value}
            {unit}
          </span>
        </div>
      );
      })}
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

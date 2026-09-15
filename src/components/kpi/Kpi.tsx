import type { ReactNode } from 'react';
import './kpi.css';

// ===========================================================================
// KPI CARD SYSTEM — shared metric cards used on dashboards & analytics.
// A card shows a label, a primary value, an optional delta (trend) and an
// optional sparkline/footnote. Tone maps to the status palette.
// ===========================================================================

export type KpiTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: { value: number; goodWhenUp?: boolean; suffix?: string };
  icon?: ReactNode;
  tone?: KpiTone;
  spark?: number[];
  // WHAT THIS CARD OPENS. Given one, the card becomes a button: it looks
  // pressable, takes keyboard focus and says where it goes.
  //
  // A CARD WITHOUT ONE IS NOT A DEAD BUTTON, it is a figure. Half of these
  // count units, engineers or days — there is no list of 12 "units in the
  // field" to open — and a card that looked clickable and did nothing would be
  // worse than one that plainly does not. So the two are told apart by how they
  // LOOK, not only by whether the click lands.
  onOpen?: () => void;
  // Where it goes, for the title and for anyone reading with a screen reader.
  // Required alongside `onOpen`: "opens something" is not a destination.
  opens?: string;
}

export function KpiCard({ label, value, sub, delta, icon, tone = 'primary', spark, onOpen, opens }: KpiCardProps) {
  const inner = (
    <>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {icon && <span className="kpi-icon">{icon}</span>}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-bottom">
        {delta && <DeltaBadge {...delta} />}
        {sub && <span className="kpi-sub">{sub}</span>}
      </div>
      {spark && spark.length > 1 && <Sparkline data={spark} />}
    </>
  );
  if (onOpen) {
    return (
      <button type="button" className={`kpi kpi-${tone} kpi-open`} onClick={onOpen}
        title={opens ? `Open ${opens}` : undefined}>
        {inner}
        <span className="kpi-go" aria-hidden="true">›</span>
      </button>
    );
  }
  return (
    <div className={`kpi kpi-${tone}`}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {icon && <span className="kpi-icon">{icon}</span>}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-bottom">
        {delta && <DeltaBadge {...delta} />}
        {sub && <span className="kpi-sub">{sub}</span>}
      </div>
      {spark && spark.length > 1 && <Sparkline data={spark} />}
    </div>
  );
}

function DeltaBadge({
  value,
  goodWhenUp = true,
  suffix = '%',
}: {
  value: number;
  goodWhenUp?: boolean;
  suffix?: string;
}) {
  const up = value >= 0;
  const good = up === goodWhenUp;
  return (
    <span className={`kpi-delta ${good ? 'kpi-delta-good' : 'kpi-delta-bad'}`}>
      {up ? '▲' : '▼'} {Math.abs(value)}
      {suffix}
    </span>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const w = 120;
  const h = 30;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / range) * h}`)
    .join(' ');
  return (
    <svg className="kpi-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

export function KpiGrid({ children, min = 200 }: { children: ReactNode; min?: number }) {
  return (
    <div
      className="kpi-grid"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  );
}

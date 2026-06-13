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
}

export function KpiCard({ label, value, sub, delta, icon, tone = 'primary', spark }: KpiCardProps) {
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

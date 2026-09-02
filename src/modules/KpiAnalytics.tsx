import { PageHeader, SectionCard } from '../components/ui/ui';

// ===========================================================================
// KPI & FAILURE ANALYSIS — not built on live data yet.
//
// This screen used to render charts from the local demo collections, which
// clearDemoData() empties on every load — so against the live database it
// showed empty tiles and an empty table and looked broken rather than absent.
// Better to say plainly what it is: a placeholder for the KPI analysis, which needs its
// own table before it can be loaded or reported on (docs/BACKLOG.md).
// ===========================================================================
export function KpiAnalytics() {
  return (
    <div>
      <PageHeader title="KPI & Failure Analysis" subtitle="Product-wise reliability metrics & failure-rate analysis" icon="📈" />
      <SectionCard title="Not available yet">
        <p className="muted" style={{ margin: 0 }}>
          This report is not built on the live database yet. It needs the KPI analysis as its own
          register — a table to load the history into and to record new entries against — before
          anything can be shown here. Until then this page stays as a placeholder so the menu
          reflects what exists.
        </p>
      </SectionCard>
    </div>
  );
}

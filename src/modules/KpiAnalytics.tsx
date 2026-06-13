import { useMemo } from 'react';
import { useCollection } from '../lib/hooks';
import { C } from './collections';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { BarChart } from '../components/charts/Charts';
import type { BaseRecord } from '../lib/db';

interface ProductKpi extends BaseRecord {
  productName: string;
  installedBase: number;
  calls: number;
  closed: number;
  failureRate: number; // % calls / installed base
  closureRate: number;
  mttr: number; // mean time to repair (hrs)
}

// KPI Analytics — product-wise reliability metrics & failure-rate analysis.
export function KpiAnalytics() {
  const products = useCollection(C.products);
  const breakdowns = useCollection(C.breakdowns);
  const warranties = useCollection(C.warranties);
  const contracts = useCollection(C.contracts);

  const kpis = useMemo<ProductKpi[]>(() => {
    return products.map((p) => {
      const installedBase =
        warranties.filter((w) => w.productId === p.id).length +
        contracts.filter((c) => c.productId === p.id).length;
      const calls = breakdowns.filter((b) => b.productId === p.id);
      const closed = calls.filter((b) => b.status === 'Closed');
      const mttrVals = closed.map((b) => Number(b.timeSpentHrs) || 0).filter((v) => v > 0);
      const mttr = mttrVals.length ? mttrVals.reduce((a, b) => a + b, 0) / mttrVals.length : 0;
      return {
        id: p.id,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        productName: String(p.name),
        installedBase,
        calls: calls.length,
        closed: closed.length,
        failureRate: installedBase ? (calls.length / installedBase) * 100 : 0,
        closureRate: calls.length ? (closed.length / calls.length) * 100 : 0,
        mttr,
      };
    });
  }, [products, breakdowns, warranties, contracts]);

  const totalInstalled = kpis.reduce((s, k) => s + k.installedBase, 0);
  const totalCalls = kpis.reduce((s, k) => s + k.calls, 0);
  const overallFailureRate = totalInstalled ? (totalCalls / totalInstalled) * 100 : 0;
  const overallClosure = totalCalls ? (kpis.reduce((s, k) => s + k.closed, 0) / totalCalls) * 100 : 0;
  const avgMttr = (() => {
    const v = kpis.map((k) => k.mttr).filter((x) => x > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  })();

  const failureRateChart = [...kpis]
    .filter((k) => k.calls > 0)
    .sort((a, b) => b.failureRate - a.failureRate)
    .slice(0, 8)
    .map((k) => ({ label: k.productName, value: Math.round(k.failureRate) }));

  const volumeChart = [...kpis]
    .filter((k) => k.calls > 0)
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 8)
    .map((k) => ({ label: k.productName, value: k.calls }));

  const columns: Column<ProductKpi>[] = [
    { key: 'productName', header: 'Product', width: 200 },
    { key: 'installedBase', header: 'Installed Base', width: 120, align: 'right', wrap: false },
    { key: 'calls', header: 'Total Calls', width: 100, align: 'right', wrap: false },
    { key: 'closed', header: 'Closed', width: 90, align: 'right', wrap: false },
    {
      key: 'failureRate',
      header: 'Failure Rate',
      width: 130,
      align: 'right',
      wrap: false,
      render: (r) => {
        const tone = r.failureRate >= 100 ? 'danger' : r.failureRate >= 50 ? 'warning' : 'success';
        return <span className={`badge badge-${tone}`}>{r.failureRate.toFixed(0)}%</span>;
      },
    },
    {
      key: 'closureRate',
      header: 'Closure Rate',
      width: 120,
      align: 'right',
      wrap: false,
      render: (r) => `${r.closureRate.toFixed(0)}%`,
    },
    { key: 'mttr', header: 'MTTR (hrs)', width: 110, align: 'right', wrap: false, render: (r) => (r.mttr ? r.mttr.toFixed(1) : '—') },
  ];

  return (
    <div>
      <PageHeader title="KPI & Failure Analysis" subtitle="Product-wise reliability metrics & failure-rate analysis" icon="📈" />

      <KpiGrid min={210}>
        <KpiCard label="Overall Failure Rate" value={`${overallFailureRate.toFixed(0)}%`} tone={overallFailureRate >= 50 ? 'danger' : 'warning'} icon="📉"
          sub={`${totalCalls} calls / ${totalInstalled} installed`} />
        <KpiCard label="Closure Rate" value={`${overallClosure.toFixed(0)}%`} tone="success" icon="✅" />
        <KpiCard label="Avg. MTTR" value={avgMttr ? `${avgMttr.toFixed(1)} hrs` : '—'} tone="info" icon="⏱️" />
        <KpiCard label="Installed Base" value={totalInstalled} tone="neutral" icon="🏭" sub="warranties + contracts" />
      </KpiGrid>

      <div className="dash-grid">
        <SectionCard title="Failure Rate by Product (Top 8)">
          <BarChart data={failureRateChart} unit="%" />
        </SectionCard>
        <SectionCard title="Call Volume by Product (Top 8)">
          <BarChart data={volumeChart} />
        </SectionCard>
      </div>

      <SectionCard title="Product-wise KPI Matrix">
        <DataTable<ProductKpi>
          columns={columns}
          rows={kpis}
          getRowId={(r) => r.id}
          storageKey="kpi-matrix"
          rowsBeforeScroll={12}
          emptyText="Add products to see KPIs."
        />
      </SectionCard>
    </div>
  );
}

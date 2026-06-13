import { useMemo, useState } from 'react';
import { useCollection } from '../lib/hooks';
import { C, STATUS_TONES } from './collections';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { BarChart, DonutChart } from '../components/charts/Charts';
import { fmtDate, lookup, statusBadge, csvExport } from '../lib/format';
import { TemplatePlaceholder } from './TemplatePlaceholder';
import type { BaseRecord } from '../lib/db';

// Field Failure Report — aggregates breakdown calls by failure category and
// product, the basis for reliability / quality feedback to manufacturing.
export function FieldFailureReport() {
  const breakdowns = useCollection(C.breakdowns);
  const [category, setCategory] = useState('');
  const [productId, setProductId] = useState('');

  const products = useCollection(C.products);

  const failures = useMemo(() => {
    let r = breakdowns.filter((b) => b.failureCategory); // only diagnosed failures
    if (category) r = r.filter((b) => b.failureCategory === category);
    if (productId) r = r.filter((b) => b.productId === productId);
    return r;
  }, [breakdowns, category, productId]);

  const byCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    breakdowns.forEach((b) => {
      if (!b.failureCategory) return;
      const c = String(b.failureCategory);
      counts[c] = (counts[c] ?? 0) + 1;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [breakdowns]);

  const byProduct = useMemo(() => {
    const counts: Record<string, number> = {};
    breakdowns.forEach((b) => {
      if (!b.failureCategory) return;
      const name = lookup(C.products, b.productId, 'name');
      counts[name] = (counts[name] ?? 0) + 1;
    });
    return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [breakdowns]);

  const categories = [...new Set(breakdowns.map((b) => b.failureCategory).filter(Boolean))] as string[];
  const topCategory = byCategory[0]?.label ?? '—';

  const columns: Column<BaseRecord>[] = [
    { key: 'code', header: 'Call No.', width: 100, wrap: false },
    { key: 'reportedDate', header: 'Date', width: 110, wrap: false, render: (r) => fmtDate(r.reportedDate) },
    { key: 'productId', header: 'Product', width: 180, render: (r) => lookup(C.products, r.productId, 'name') },
    { key: 'serialNo', header: 'Serial', width: 120, wrap: false },
    { key: 'partyId', header: 'Customer', width: 170, render: (r) => lookup(C.parties, r.partyId, 'name') },
    { key: 'failureCategory', header: 'Failure Category', width: 150, render: (r) => <span className="badge badge-danger">{String(r.failureCategory)}</span> },
    { key: 'rootCause', header: 'Root Cause', width: 220 },
    { key: 'status', header: 'Status', width: 110, wrap: false, render: (r) => statusBadge(r.status, STATUS_TONES) },
  ];

  return (
    <div>
      <PageHeader
        title="Field Failure Report"
        subtitle="Diagnosed field failures by category & product"
        icon="🧪"
        actions={
          <button
            className="btn"
            onClick={() =>
              csvExport('field-failure-report.csv', columns.filter((c) => c.key !== '_actions').map((c) => ({ key: c.key, header: c.header })), failures as Record<string, unknown>[])
            }
          >
            ⭳ Export CSV
          </button>
        }
      />

      <TemplatePlaceholder
        templateKey="field-failure-report"
        title="Field Failure Report Template"
        description="Plug in your standard FFR / 8D format here. Aggregations below are computed live."
      />

      <div className="filter-bar" style={{ marginTop: 16 }}>
        <div>
          <label className="field-label">Failure Category</label>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Product</label>
          <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{String(p.name)}</option>)}
          </select>
        </div>
      </div>

      <KpiGrid min={200}>
        <KpiCard label="Total Failures" value={failures.length} tone="danger" icon="🧪" />
        <KpiCard label="Failure Categories" value={byCategory.length} tone="warning" />
        <KpiCard label="Top Category" value={topCategory} tone="info" sub={`${byCategory[0]?.value ?? 0} failures`} />
        <KpiCard label="Products Affected" value={byProduct.length} tone="neutral" />
      </KpiGrid>

      <div className="dash-grid">
        <SectionCard title="Failures by Category">
          {byCategory.length ? <DonutChart data={byCategory} /> : <div className="muted">No diagnosed failures yet</div>}
        </SectionCard>
        <SectionCard title="Failures by Product (Top 8)">
          <BarChart data={byProduct} />
        </SectionCard>
      </div>

      <SectionCard title="Failure Records">
        <DataTable<BaseRecord>
          columns={columns}
          rows={[...failures].reverse()}
          getRowId={(r) => r.id}
          storageKey="ffr"
          rowsBeforeScroll={10}
          emptyText="No diagnosed failures. Set a Failure Category on breakdown calls to populate this report."
        />
      </SectionCard>
    </div>
  );
}

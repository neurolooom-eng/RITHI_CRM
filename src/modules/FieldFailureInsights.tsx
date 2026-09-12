// ===========================================================================
// FIELD FAILURE — INSIGHTS.
//
// The user, 2026-09-12: "In Field Failure -- Add an Insights tab and Register."
//
// WHAT THIS ANSWERS THAT THE REGISTER DOES NOT. The register is a record: one
// row per failure, read one at a time. These are the questions asked ACROSS the
// record — which machine fails most, what it fails with, how many reports are
// open, and which have not been looked at this week. A register answers "what
// happened to this one"; this answers "what is happening".
//
// COMPUTED FROM THE ROWS ALREADY LOADED, not from a second set of queries. The
// register loads every report it may see (listFfrs pages to 5,000), so the
// aggregates here are over the WHOLE set rather than a page of it — which is
// why they carry no "+" (the count rule in CLAUDE.md: a number that looks exact
// and is not is worse than no number).
//
// THE COUNTS ARE OF REPORTS, NOT OF FAILURES. One report is one failure
// reported; a machine that failed twice has two. Said on the page rather than
// left to be assumed.
// ===========================================================================
import { useMemo } from 'react';
import { SectionCard } from '../components/ui/ui';
import { KpiCard, KpiGrid } from '../components/kpi/Kpi';
import { BarChart, ColumnChart, DonutChart } from '../components/charts/Charts';
import { ffrDueForReview, ffrEffectWithdrawn } from '../lib/ffr';

type Row = Record<string, unknown>;

const s = (r: Row, k: string) => String(r[k] ?? '').trim();

/** Count by a key, biggest first, with blanks gathered rather than dropped —
 *  "not stated" is a finding about the register, and silently omitting it makes
 *  the chart add up to less than the total with nothing saying why. */
function tally(rows: Row[], key: string, blankLabel = '(not stated)'): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = s(r, key) || blankLabel;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** Reports per month of their FFR date, oldest first — a trend reads left to
 *  right in time, not in size. */
function byMonth(rows: Row[]): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const d = s(r, 'ffr_date').slice(0, 7);          // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(d)) continue;          // undated: counted nowhere rather than in the wrong month
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label: label.slice(2), value }));   // YY-MM, so 12 fit
}

export function FieldFailureInsights({ rows }: { rows: Row[] }) {
  const stats = useMemo(() => {
    // A WEEK AGO, for "not looked at since". The weekly cycle is the reason
    // reviewed_at exists (0168) — updated_at cannot answer it, because any edit
    // moves that.
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return {
      total: rows.length,
      open: rows.filter((r) => s(r, 'ffr_status') === 'Open').length,
      closed: rows.filter((r) => s(r, 'ffr_status') === 'Closed').length,
      cancelled: rows.filter((r) => s(r, 'ffr_status') === 'Cancelled').length,
      due: rows.filter((r) => ffrDueForReview(r, weekAgo)).length,
      withdrawn: rows.filter((r) => ffrEffectWithdrawn(r)).length,
      capaOpen: rows.filter((r) => /^(open|in-progress)$/i.test(s(r, 'capa_status'))).length,
      unsolved: rows.filter((r) => {
        const st = s(r, 'live_call_status') || s(r, 'current_call_status');
        return st !== '' && !/^solved/i.test(st);
      }).length,
    };
  }, [rows]);

  const byProduct = useMemo(() => tally(rows, 'product_name'), [rows]);
  const byCover = useMemo(() => tally(rows, 'cover'), [rows]);
  const byStatus = useMemo(() => tally(rows, 'ffr_status'), [rows]);
  const byCapa = useMemo(() => tally(rows, 'capa_status'), [rows]);
  const byRootCause = useMemo(() => tally(rows, 'live_root_cause_keyword'), [rows]);
  const byGrouping = useMemo(() => tally(rows, 'live_complaint_grouping'), [rows]);
  const byCustomer = useMemo(() => tally(rows, 'customer_name'), [rows]);
  const months = useMemo(() => byMonth(rows), [rows]);

  if (!rows.length) {
    return (
      <SectionCard title="Insights">
        <div className="muted">No Field Failure Reports on the register yet — there is nothing to analyse.</div>
      </SectionCard>
    );
  }

  return (
    <div>
      <KpiGrid>
        <KpiCard label="Reports" value={stats.total} icon="🧪" tone="primary" sub="on the register" />
        <KpiCard label="Open" value={stats.open} icon="📂" tone={stats.open ? 'warning' : 'neutral'} sub="not yet closed" />
        <KpiCard label="Due a review" value={stats.due} icon="⏳" tone={stats.due ? 'danger' : 'success'}
                 sub="open, not looked at this week" />
        <KpiCard label="CAPA in hand" value={stats.capaOpen} icon="🛠" tone={stats.capaOpen ? 'warning' : 'neutral'}
                 sub="Open or In-Progress" />
        <KpiCard label="Call still open" value={stats.unsolved} icon="🔥" tone={stats.unsolved ? 'danger' : 'neutral'}
                 sub="report raised, call unsolved" />
        {/* An FFR raised on Any Potential Effect = YES whose review now reads NO.
            The record stands (0049) — this is how somebody SEES that happened,
            which is the whole reason the live columns are on the register. */}
        <KpiCard label="Effect withdrawn" value={stats.withdrawn} icon="↩" tone={stats.withdrawn ? 'warning' : 'neutral'}
                 sub="raised on YES, review now says otherwise" />
        <KpiCard label="Closed" value={stats.closed} icon="✅" tone="success" sub="" />
        <KpiCard label="Cancelled" value={stats.cancelled} icon="✕" tone="neutral" sub="marked, never deleted" />
      </KpiGrid>

      <SectionCard title="Which machines fail">
        <div className="muted" style={{ marginBottom: 10 }}>
          One report is one failure reported — a machine that failed twice appears twice.
        </div>
        <BarChart data={byProduct.slice(0, 12).map((p) => ({ label: p.label.slice(0, 46), value: p.value }))} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Under what cover">
        <div className="muted" style={{ marginBottom: 10 }}>
          A failure under warranty (WGP) is the company’s cost and the one worth watching.
        </div>
        <DonutChart data={byCover} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Reports raised, month by month">
        <ColumnChart data={months} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Root cause, from the Daily Call Review">
        <div className="muted" style={{ marginBottom: 10 }}>
          Taken from the review as it stands now, not as it stood when the report was raised —
          a cause corrected later should read corrected here.
        </div>
        <BarChart data={byRootCause.slice(0, 12).map((p) => ({ label: p.label.slice(0, 46), value: p.value }))} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Complaint grouping">
        <BarChart data={byGrouping.slice(0, 12).map((p) => ({ label: p.label.slice(0, 46), value: p.value }))} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Where they are raised">
        <BarChart data={byCustomer.slice(0, 12).map((p) => ({ label: p.label.slice(0, 46), value: p.value }))} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="Report status">
        <DonutChart data={byStatus} />
      </SectionCard>

      <div style={{ height: 12 }} />

      <SectionCard title="CAPA status">
        <BarChart data={byCapa} />
      </SectionCard>
    </div>
  );
}

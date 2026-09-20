import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox, FacetChips } from '../components/ui/ui';
import { csvExport } from '../lib/format';
import { formatDay, formatDayTime } from '../lib/dates';
import { listSolvedWithoutReport, supabaseConfigured } from '../lib/supabase';
import { loadFailure } from '../lib/dberror';
import { Ucn } from '../lib/callstate';

// ===========================================================================
// SOLVED, BUT NOBODY FILED THE REPORT.
//
//   The user, 2026-09-20: "Create a Report - Call is Solved, but Report or
//   Visit Entry is missing - View only for Admins and Super Admins."
//
// This is the list that says WHICH visits to re-upload. It exists because the
// alternative was loading every report again and hoping.
//
// IT NAMES THE GAP RATHER THAN THE PROBLEM, and there are four, each needing a
// different fix — the `Missing` column carries EVERY one on a row rather than
// the first, because being told about a gap, fixing it, and being told about
// the next is three round trips for one call.
//
// ADMINISTRATORS ONLY, by the module key (`mod:/missing-visit-reports`, merged
// by 0224) rather than by a rule inside the view. The view is
// `security_invoker`, so the ordinary call policies decide the rows; inventing
// a second, different rule there is how a screen and its data come to
// disagree.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

const day = (v: unknown) => (v ? formatDay(v) : '');

const COLUMNS: Column<Row>[] = [
  { key: 'ucn', header: 'UCN', width: 130, wrap: false,
    // A UCN carries the call's colour wherever it appears — every module.
    render: (r) => <Ucn ucn={String(r.ucn ?? '')} /> },
  { key: 'call_number', header: 'Call No', width: 100, wrap: false },
  { key: 'reg_date', header: 'Registered', width: 110, render: (r) => day(r.reg_date) },
  { key: 'open_state', header: 'Status', width: 140, wrap: false },
  { key: 'missing', header: 'Missing', width: 320 },
  { key: 'party_name', header: 'Party', width: 220 },
  { key: 'product_name', header: 'Product', width: 130 },
  { key: 'serial', header: 'Serial', width: 100, wrap: false },
  { key: 'visit_date', header: 'Visit date', width: 110, render: (r) => day(r.visit_date) },
  { key: 'visit_entry_date', header: 'Entry date', width: 150,
    render: (r) => (r.visit_entry_date ? formatDayTime(r.visit_entry_date) : '') },
];

const ALL_COLUMNS = [
  'ucn', 'call_number', 'reg_date', 'open_state', 'missing', 'party_name',
  'product_name', 'serial', 'state', 'last_visit_at', 'visit_uid', 'visit_date',
  'visit_entry_date', 'visits_sharing_entry_stamp', 'service_report', 'visit_engineer',
];

export function SolvedWithoutReport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [gap, setGap] = useState('');

  const load = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true); setErr(null);
    try {
      const r = await listSolvedWithoutReport();
      setRows(r.map((x, i) => ({ ...x, id: String(x.ucn ?? i) } as Row)));
    } catch (e) {
      setErr(loadFailure(e, {
        tables: ['solved_without_report'],
        hint: 'This report is not on the project yet — run daily_review.sql.',
      }));
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // ONE ROW CAN CARRY SEVERAL GAPS, so a row counts towards each chip it has.
  // The chips therefore sum to MORE than the row count, which is correct and
  // is why the heading says calls and the chips say gaps.
  const facets = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => String(r.missing ?? '').split(' · ').filter(Boolean).forEach((k) => {
      // The import-stamp gap carries its own count in the text, so group on the
      // kind rather than on the number or every batch is its own chip.
      const key = k.startsWith('entry date looks like an import stamp') ? 'entry date is an import stamp' : k;
      m.set(key, (m.get(key) ?? 0) + 1);
    }));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
  }, [rows]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      const miss = String(r.missing ?? '');
      if (gap) {
        const hit = gap === 'entry date is an import stamp'
          ? miss.includes('entry date looks like an import stamp')
          : miss.split(' · ').includes(gap);
        if (!hit) return false;
      }
      if (!s) return true;
      return `${r.ucn} ${r.call_number} ${r.party_name} ${r.product_name} ${r.serial}`
        .toLowerCase().includes(s);
    });
  }, [rows, q, gap]);

  return (
    <div>
      <PageHeader
        title="Solved Without a Report" icon="📭"
        subtitle="Calls that read Solved while their visit record is incomplete — the list of what to re-upload."
        count={visible.length} onRefresh={() => void load()} refreshing={busy} />

      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}

      {!err && !busy && rows.length === 0 && (
        <div className="sheet-banner sheet-banner-ok">
          <span>Every solved call has a dated visit and a service report behind it.</span>
        </div>
      )}

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="UCN, call number, party, product or serial" />
      </Toolbar>

      {/* The read pages until the view is exhausted, so these are EXACT and
          take no "+" — the rule cuts both ways and a "+" here would be wrong
          in the other direction. */}
      <FacetChips options={facets} value={gap} onChange={setGap} more={false} />

      <DataTable<Row>
        columns={COLUMNS} rows={visible} getRowId={(r) => r.id}
        toolbar={(
          <button className="btn btn-ghost btn-sm" onClick={() => csvExport(
            `solved-without-a-report-${new Date().toISOString().slice(0, 10)}.csv`,
            ALL_COLUMNS.map((k) => ({ key: k, header: k })), visible)}>
            ⭳ Export CSV
          </button>
        )} />
    </div>
  );
}

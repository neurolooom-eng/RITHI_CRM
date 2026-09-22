import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox, FacetChips } from '../components/ui/ui';
import { csvExport, fmtLongDate } from '../lib/format';
import { xlsxDownload, xlsxCell, xlsxText } from '../lib/xlsx';
import { logAudit } from '../lib/audit';
import { formatDay, formatDayTime } from '../lib/dates';
import { listFeedbackWithoutReport, supabaseConfigured } from '../lib/supabase';
import { loadFailure } from '../lib/dberror';
import { Ucn } from '../lib/callstate';

// ===========================================================================
// THE CUSTOMER ANSWERED, AND NOBODY FILED THE REPORT.
//
//   The user, 2026-09-22: "If a Customer Feedback is Present for the Said
//   Call, there should be a Report which is Solved - Report Completed. If it
//   is not Present then list it."
//
// A feedback form is filled in AFTER a visit — somebody went, did the work and
// asked the customer what they thought of it. So a call carrying feedback and
// no completed report is a visit that happened and was never written up: the
// feedback is the evidence the work occurred, the report is the record of it,
// and the two cannot both be right when they disagree.
//
// FOUR FINDINGS, EACH NEEDING A DIFFERENT FIX, so the `Missing` column names
// which one applies rather than the screen simply listing rows — the same
// argument as Solved Without a Report. The commonest is the last of them, and
// it is the only one where the answer is already on screen: `Latest visit
// status` says what the visit reads INSTEAD, so "Solved - Report Pending" (the
// system stating a known absence) is distinguishable from "Unsolved" (a
// different problem entirely).
//
// ADMINISTRATORS ONLY, by the module key (`mod:/feedback-without-report`,
// merged by 0229) rather than by a rule inside the view. The view is
// `security_invoker`, so the ordinary call and feedback policies decide the
// rows; a second, different rule there is how a screen and its data come to
// disagree.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };

const day = (v: unknown) => (v ? formatDay(v) : '');

const COLUMNS: Column<Row>[] = [
  { key: 'ucn', header: 'UCN', width: 130, wrap: false,
    // A UCN carries the call's colour wherever it appears — every module.
    render: (r) => <Ucn ucn={String(r.ucn ?? '')} /> },
  { key: 'call_number', header: 'Call No', width: 100, wrap: false },
  { key: 'missing', header: 'Missing', width: 300 },
  { key: 'latest_visit_status', header: 'Latest visit status', width: 170, wrap: false },
  { key: 'open_state', header: 'Call status', width: 140, wrap: false },
  { key: 'party_name', header: 'Party', width: 220 },
  { key: 'product_name', header: 'Product', width: 130 },
  { key: 'serial', header: 'Serial', width: 100, wrap: false },
  { key: 'feedback_engineer', header: 'Engineer', width: 140 },
  { key: 'feedback_entered_at', header: 'Feedback entered', width: 150,
    render: (r) => (r.feedback_entered_at ? formatDayTime(r.feedback_entered_at) : '') },
  { key: 'reg_date', header: 'Registered', width: 110, render: (r) => day(r.reg_date) },
];

// THE FILE'S HEADINGS ARE THE SCREEN'S, NOT THE DATABASE'S — this file is
// handed to somebody to work through, and `latest_visit_entry_at` is a column
// name rather than a heading.
const EXPORT: { key: string; header: string }[] = [
  { key: 'ucn', header: 'UCN' },
  { key: 'call_number', header: 'Call No' },
  { key: 'call_type', header: 'Call Type' },
  { key: 'missing', header: 'Missing' },
  { key: 'latest_visit_status', header: 'Latest visit status' },
  { key: 'open_state', header: 'Call status' },
  { key: 'party_name', header: 'Party' },
  { key: 'state', header: 'State' },
  { key: 'product_name', header: 'Product' },
  { key: 'serial', header: 'Serial' },
  { key: 'complaint', header: 'Complaint' },
  { key: 'feedback_engineer', header: 'Engineer on the feedback' },
  { key: 'visit_engineer', header: 'Engineer on the visit' },
  { key: 'feedback_visit_at', header: 'Visit date on the feedback' },
  { key: 'feedback_entered_at', header: 'Feedback entered' },
  { key: 'reg_date', header: 'Registered' },
  { key: 'latest_visit_at', header: 'Latest visit date' },
  { key: 'latest_visit_entry_at', header: 'Latest visit entry date' },
  { key: 'service_report', header: 'Service Report' },
  { key: 'latest_visit_uid', header: 'Visit UID' },
  { key: 'feedback_id', header: 'Feedback row' },
];

export function FeedbackWithoutReport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [gap, setGap] = useState('');

  const load = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true); setErr(null);
    try {
      const r = await listFeedbackWithoutReport();
      setRows(r.map((x, i) => ({ ...x, id: String(x.feedback_id ?? i) } as Row)));
    } catch (e) {
      setErr(loadFailure(e, {
        tables: ['feedback_without_report'],
        functions: ['is_report_completed'],
        hint: 'This report is not on the project yet — run supabase/apply/feedback_checks.sql in the Supabase SQL editor.',
      }));
    } finally { setBusy(false); }
  };

  const download = (kind: 'xlsx' | 'csv') => {
    if (!visible.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `feedback-without-a-report-${stamp}`;
    const scope = [gap ? `finding: ${gap}` : '', q.trim() ? `search: ${q.trim()}` : '']
      .filter(Boolean).join(' · ') || 'every row';
    if (kind === 'csv') {
      // A DOWNLOAD IS NOT THE WIRE: a CSV can only carry text, so the dates go
      // out as dd-MMM-yyyy HH:mm:ss rather than the ISO string the API sent.
      csvExport(`${name}.csv`, EXPORT,
        visible.map((r) => Object.fromEntries(EXPORT.map((c) => [c.key, xlsxText(r[c.key])]))));
    } else {
      xlsxDownload(`${name}.xlsx`, [
        { name: 'Feedback Without a Report',
          columns: EXPORT.map((c) => c.header),
          rows: visible.map((r) => Object.fromEntries(EXPORT.map((c) => [c.header, xlsxCell(r[c.key])]))) },
        // THE FILE CARRIES ITS OWN SCOPE: one whose filter is not written down
        // is one somebody later mistakes for the whole register.
        { name: 'About',
          columns: ['Item', 'Value'],
          rows: [
            { Item: 'Report', Value: 'Feedback Without a Report' },
            { Item: 'What it lists', Value: 'Customer feedback with no "Solved - Report Completed" visit behind it.' },
            { Item: 'Why it is a finding', Value: 'Feedback is filled in after a visit, so it is evidence the work happened. A call carrying feedback and no completed report is a visit that was never written up.' },
            { Item: 'the feedback records no UCN', Value: 'Nothing can be checked against it. Listed rather than dropped, so a report about missing records does not itself drop records.' },
            { Item: 'no call with that UCN', Value: 'The feedback names a call this system does not hold. Load the call, or the UCN is wrong.' },
            { Item: 'no visit at all', Value: 'The call has no visit record. Load the visit (Bulk Uploads → Visit Reports).' },
            { Item: 'a visit exists but none reads Solved - Report Completed',
              Value: 'The commonest one. "Latest visit status" says what it reads instead — Report Pending is a known absence, Unsolved is a different problem.' },
            { Item: 'How the status is matched', Value: 'On its letters and digits only, so "Solved - Report Completed " with a trailing space, a lower-case spelling and an en-dash all count as completed. The exports carry the trailing-space spelling.' },
            { Item: 'A re-visit does not undo it', Value: 'ANY visit on the call reading completed is enough — a call written up and then visited again still has its report.' },
            { Item: 'Scope of this file', Value: scope },
            { Item: 'Rows', Value: String(visible.length) },
            { Item: 'Taken', Value: fmtLongDate(new Date().toISOString()) },
          ] },
      ]);
    }
    logAudit({ action: 'report.feedback_without_report', meta: { rows: visible.length, scope, kind } });
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // ONE FINDING PER ROW here — unlike Solved Without a Report, where a call can
  // carry several — so these chips DO sum to the row count.
  const facets = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = String(r.missing ?? '').trim();
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
  }, [rows]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (gap && String(r.missing ?? '').trim() !== gap) return false;
      if (!s) return true;
      return `${r.ucn} ${r.call_number} ${r.party_name} ${r.product_name} ${r.serial} ${r.feedback_engineer}`
        .toLowerCase().includes(s);
    });
  }, [rows, q, gap]);

  return (
    <div>
      <PageHeader
        title="Feedback Without a Report" icon="⭐"
        subtitle="Calls the customer gave feedback on that have no “Solved - Report Completed” visit behind them — the visit happened, the write-up did not."
        count={visible.length} onRefresh={() => void load()} refreshing={busy} />

      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}

      {!err && !busy && rows.length === 0 && (
        <div className="sheet-banner sheet-banner-ok">
          <span>Every customer feedback has a completed service report behind it.</span>
        </div>
      )}

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="UCN, call number, party, product, serial or engineer" />
      </Toolbar>

      {/* The read pages until the view is exhausted, so these are EXACT and
          take no "+" — the rule cuts both ways and a "+" here would be wrong
          in the other direction. */}
      <FacetChips options={facets} value={gap} onChange={setGap} more={false} />

      <DataTable<Row>
        columns={COLUMNS} rows={visible} getRowId={(r) => r.id}
        storageKey="feedback-without-report"
        toolbar={(
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => download('xlsx')}>⭳ Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={() => download('csv')}>⭳ CSV</button>
            <div className="spacer" />
            <span className="muted">{visible.length} shown</span>
          </>
        )}
        emptyText={busy ? 'Loading…' : 'Nothing to show.'}
      />
    </div>
  );
}

export default FeedbackWithoutReport;

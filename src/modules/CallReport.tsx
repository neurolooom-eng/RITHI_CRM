import { ReportBuilder, type ReportSpec } from './ReportBuilder';
import { supabaseConfigured, countCallReport, listCallReport } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  CALL_REPORT_MANDATORY, CALL_REPORT_OPTIONAL, EMPTY_CALL_REPORT_FILTER,
  describeCallFilter, callReportColumns, type CallReportFilter,
} from '../lib/reports';

// ===========================================================================
// THE CALL REPORT — one row per call, filtered in the database, taken as a file.
//
// The user, 2026-09-14: "Add Call Report , Customer Feedback Report -- Follow
// the Same concept of Consumption Report." Everything that makes that concept
// what it is lives in ReportBuilder; this file is the report's own definition
// and nothing else.
// ===========================================================================

export function CallReport() {
  const { can } = useAuth();
  const spec: ReportSpec<CallReportFilter> = {
    key: 'call-report',
    title: 'Call Report',
    icon: '📞',
    subtitle: 'One row per call, with its latest visit and what was fitted.',
    // SAID OUT LOUD, and it is the thing a reader most often assumes wrongly.
    rowMeaning: 'One row per CALL — not per visit, so a call attended four times appears once.',
    mandatory: CALL_REPORT_MANDATORY,
    optional: CALL_REPORT_OPTIONAL,
    emptyFilter: EMPTY_CALL_REPORT_FILTER,
    describe: describeCallFilter,
    columns: callReportColumns,
    count: countCallReport,
    list: listCallReport,
    live: supabaseConfigured(),
    // The same right that opens the register. A report is a different SHAPE of
    // the calls, not a different set of them — and the rows are governed by RLS
    // regardless, so this only decides whether the button is offered.
    mayExport: can('calls.view') || can('reports.view'),
    fields: [
      { key: 'from', label: 'Call date from', type: 'date' },
      { key: 'to', label: 'Call date to', type: 'date' },
      { key: 'product', label: 'Product', placeholder: 'e.g. MONNAL' },
      { key: 'party', label: 'Customer', placeholder: 'contains' },
      { key: 'city', label: 'City', placeholder: 'contains' },
      { key: 'engineer', label: 'Allotted to', placeholder: 'contains' },
      { key: 'ucn', label: 'UCN', placeholder: 'contains' },
      { key: 'callType', label: 'Call type', type: 'select',
        options: [{ value: 'FIELD', label: 'Field' }, { value: 'INSTALL', label: 'Installation' },
                  { value: 'P M', label: 'PM' }] },
      // EXACT, not contains: "Solved" and "Solved - Report Pending" are
      // different answers and a contains-match would fold the second into the
      // first, which is the distinction open_state exists to keep.
      { key: 'status', label: 'Call status', type: 'select',
        options: ['Unattended', 'Unsolved', 'Solved - Report Pending', 'Solved']
          .map((v) => ({ value: v, label: v })) },
    ],
    notes: [
      { Item: 'A note on the visit',
        Value: 'Last Visit is the LATEST ENTRY, not the latest visit date — the same rule the '
          + 'call’s own status follows. A report written up late does not outrank a visit '
          + 'made after it.' },
      { Item: 'A note on the status',
        Value: 'Call Status is worked out from the visits (Unattended / Unsolved / Solved - '
          + 'Report Pending / Solved). "Status (as keyed)" is what somebody typed, and the two '
          + 'can disagree — that disagreement is worth seeing, which is why both are available.' },
      { Item: 'A note on the spares',
        Value: 'Spare Lines, Spare Qty and Spares Used are the parts booked against the CALL. '
          + 'Voided lines (qty 0) are excluded, so this agrees with the Consumption Report.' },
      { Item: 'What you can see',
        Value: 'Exactly the calls your role may see — the report reads them under the same rules '
          + 'as the register, never more.' },
    ],
    deniedNote: (
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        You can open this page but not take the file — that needs the right to read calls or
        visit reports. Ask an administrator under Roles &amp; Permissions.
      </p>
    ),
  };
  return <ReportBuilder spec={spec} />;
}

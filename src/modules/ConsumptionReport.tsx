import { ReportBuilder, type ReportSpec } from './ReportBuilder';
import { supabaseConfigured, countConsumptionReport, listConsumptionReport } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  CONSUMPTION_DEFAULT_ON, CONSUMPTION_MANDATORY, CONSUMPTION_OPTIONAL, EMPTY_CONSUMPTION_FILTER,
  describeFilter, exportColumns, type ConsumptionFilter,
} from '../lib/reports';

// ===========================================================================
// THE CONSUMPTION REPORT — the first of these, and now one of three.
//
// The user's ask (2026-09-08): the consumption report in the format they
// already keep by hand, every other consumption column available at the end, a
// filter BEFORE the download, and a column picker in which the screenshot's
// columns are mandatory.
//
// EVERYTHING THAT MADE THIS SCREEN WORTH TRUSTING NOW LIVES IN ReportBuilder,
// unchanged — the database-side filter, the exact count, the locked mandatory
// columns, the view's column order, and the scope sheet that travels with the
// file. It moved there when the user asked for two more reports "following the
// same concept" (2026-09-14): three copies of those four properties would have
// been three chances to lose one of them quietly, and the one most likely to go
// is the database-side filter, because fetching and then narrowing LOOKS the
// same until the register passes a thousand rows.
//
// What is left here is what is particular to consumption: its columns, its
// filters, and the two notes that would be wrong on any other report.
// ===========================================================================

export function ConsumptionReport() {
  const { can } = useAuth();
  const spec: ReportSpec<ConsumptionFilter> = {
    key: 'consumption',
    title: 'Spare Consumption',
    icon: '🔩',
    subtitle: "One row per spare booked, with its call and that call's latest visit around it.",
    rowMeaning: "One row per spare booked, with its call and that call’s latest visit around it.",
    mandatory: CONSUMPTION_MANDATORY,
    optional: CONSUMPTION_OPTIONAL,
    defaults: CONSUMPTION_DEFAULT_ON,
    emptyFilter: EMPTY_CONSUMPTION_FILTER,
    describe: describeFilter,
    columns: exportColumns,
    count: countConsumptionReport,
    list: listConsumptionReport,
    live: supabaseConfigured(),
    mayExport: can('consumption.view') || can('calls.view') || can('reports.view'),
    fields: [
      { key: 'from', label: 'Call date from', type: 'date' },
      { key: 'to', label: 'Call date to', type: 'date' },
      { key: 'product', label: 'Product', placeholder: 'e.g. MONNAL' },
      { key: 'party', label: 'Customer', placeholder: 'contains' },
      { key: 'city', label: 'City', placeholder: 'contains' },
      { key: 'engineer', label: 'Engineer', placeholder: 'contains' },
      // The part is ONE string in the table and TWO columns in the report, so a
      // search for "MP-010" and one for "OXYGEN SENSOR" both have to work. The
      // undivided column is what carries both.
      { key: 'part', label: 'Part (code or name)', placeholder: 'e.g. MP-010 or SENSOR' },
      { key: 'ucn', label: 'UCN', placeholder: 'contains' },
      { key: 'callType', label: 'Call type', type: 'select',
        options: [{ value: 'FIELD', label: 'Field' }, { value: 'INSTALL', label: 'Installation' },
                  { value: 'P M', label: 'PM' }] },
    ],
    notes: [
      { Item: 'A note on dates',
        Value: 'Visit Entry Date is when the register was told; Visit Date & Time is when the '
          + 'engineer was there. They differ, and both are here on purpose.' },
      { Item: 'A note on the three default columns',
        Value: 'Line ID, Source Ref Key and Created At are ticked to start with. Source Ref Key '
          + 'is the row id from the file a line was IMPORTED from, so it is blank on anything '
          + 'booked here; Created At is when the line was written, which on an imported row is '
          + 'the date the file gave.' },
      { Item: 'A note on the visit',
        Value: 'A consumption line is booked against the CALL, not against one visit, so the two '
          + 'dates are the call’s LATEST visit. Where there is no visit they fall back to what '
          + 'the import file said, and then to when the spare was first booked — read those as '
          + '“no later than”, not “on”. Visit UID is blank on exactly those rows, '
          + 'which is how to tell them apart.' },
    ],
    deniedNote: (
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        You can open this page but not take the file — that needs the right to read consumption,
        calls or visit reports. Ask an administrator under Roles &amp; Permissions.
      </p>
    ),
  };
  return <ReportBuilder spec={spec} />;
}

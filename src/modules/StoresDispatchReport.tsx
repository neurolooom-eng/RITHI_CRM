import { ReportBuilder, type ReportSpec } from './ReportBuilder';
import { supabaseConfigured, countStoresDispatch, listStoresDispatch } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  STORES_DISPATCH_MANDATORY, STORES_DISPATCH_OPTIONAL, EMPTY_STORES_DISPATCH_FILTER, STORES_DISPATCH_BANDS,
  describeStoresDispatchFilter, storesDispatchColumns, type StoresDispatchFilter,
} from '../lib/reports';

// ===========================================================================
// THE STORES DISPATCH REPORT -- the AppSheet "Stores" view (the user,
// 2026-10-05: "I need Objective Data for Stores. Attached the Format."). One
// row per spare line dispatched, with how long Stores took after the request's
// final approval. The view is stores_dispatch_report (0385).
// ===========================================================================

export function StoresDispatchReport() {
  const { can } = useAuth();
  const spec: ReportSpec<StoresDispatchFilter> = {
    key: 'stores-dispatch-report',
    title: 'Stores Dispatch Report',
    icon: '🚚',
    subtitle: 'Every spare dispatched, with the days Stores took after the final approval — the AppSheet Stores format.',
    rowMeaning: 'One row per SPARE LINE DISPATCHED. A line sent in two parts is two rows, one per stock out.',
    mandatory: STORES_DISPATCH_MANDATORY,
    optional: STORES_DISPATCH_OPTIONAL,
    emptyFilter: EMPTY_STORES_DISPATCH_FILTER,
    describe: describeStoresDispatchFilter,
    columns: storesDispatchColumns,
    count: countStoresDispatch,
    list: listStoresDispatch,
    live: supabaseConfigured(),
    mayExport: can('spare.dispatch') || can('reports.view'),
    fields: [
      { key: 'from', label: 'Dispatched from', type: 'date' },
      { key: 'to', label: 'Dispatched to', type: 'date' },
      { key: 'engineer', label: 'Engineer (TO)', placeholder: 'contains' },
      { key: 'part', label: 'Part', placeholder: 'code or description' },
      { key: 'orNo', label: 'Spare Request NO', placeholder: 'e.g. OR-2610' },
      { key: 'band', label: 'Days band', type: 'select',
        options: STORES_DISPATCH_BANDS.map((b) => ({ value: b, label: b })) },
      { key: 'indImp', label: 'IND/IMP', type: 'select',
        options: [{ value: 'INDIGENOUS', label: 'Indigenous' }, { value: 'IMPORTED', label: 'Imported' },
                  { value: 'TBD', label: 'TBD' }] },
      { key: 'itemStatus', label: 'Item Status', placeholder: 'e.g. CMC' },
    ],
    notes: [
      { Item: '2025',
        Value: 'Calendar 2025 (January to December, India time) comes from the historical stock outs loaded through '
          + 'Bulk Uploads -> "Stock Out -- all years"; later dispatches are the ones made in RITHI. The optional Source '
          + 'column says which. For 2025 the approval and OR dates are read from that file, the days are worked out '
          + 'by the same rule as below, and Requested Qty is blank because the file does not carry it. A 2025 stock '
          + 'out with no date in the file is not shown.' },
      { Item: 'Dispatched in (Days)',
        Value: 'Exact time from the Request Final Approval Date to the dispatch (Timestamp), in days to one '
          + 'decimal -- 0.7 is about 17 hours. Not date-minus-date: an approval at 17:00 and a dispatch at '
          + '09:00 the next morning is 0.7, not 1.' },
      { Item: 'Request Final Approval Date',
        Value: 'The LATEST of the line\'s RM, Commercial and NSM decisions -- when the line became Stores\' to send.' },
      { Item: 'No approval date',
        Value: 'Where no approval time was recorded the date and days are BLANK and the band reads "No approval '
          + 'date". AppSheet counted those from an empty date and filed them under ">5 yrs"; they are a missing '
          + 'value, not five years.' },
      { Item: 'Bands',
        Value: '00-03D up to 3 days, 04-07D up to 7, 08-15D up to 15, 16-30D up to 30, 31-60D up to 60, >60D '
          + 'beyond. A dispatch recorded before its approval (negative days) is in 00-03D, as AppSheet had it.' },
      { Item: 'Year, Month, YY - MM',
        Value: 'Of the DISPATCH, in India time.' },
      { Item: 'Pending QTY',
        Value: 'What is still to send on the line after every dispatch so far. The line\'s own requested quantity '
          + 'is the optional Requested Qty column.' },
      { Item: 'IND/IMP',
        Value: 'From the Part Master (Indigenous / Imported / TBD). Blank where the part has none recorded.' },
      { Item: 'ADDRESS',
        Value: 'The engineer\'s address, city, state and phone from the User Master.' },
    ],
    deniedNote: (
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        You can open this page but not take the file — that needs the right to dispatch spares or to view
        reports. Ask an administrator under Roles &amp; Permissions.
      </p>
    ),
  };
  return <ReportBuilder spec={spec} />;
}

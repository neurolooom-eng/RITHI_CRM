import { ReportBuilder, type ReportSpec } from './ReportBuilder';
import { supabaseConfigured, countFeedbackReport, listFeedbackReport } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  FEEDBACK_REPORT_MANDATORY, FEEDBACK_REPORT_OPTIONAL, EMPTY_FEEDBACK_REPORT_FILTER,
  describeFeedbackFilter, feedbackReportColumns, type FeedbackReportFilter,
} from '../lib/reports';

// ===========================================================================
// THE CUSTOMER FEEDBACK REPORT — one row per feedback, the questions as columns.
// ===========================================================================

export function FeedbackReport() {
  const { can } = useAuth();
  const spec: ReportSpec<FeedbackReportFilter> = {
    key: 'feedback-report',
    title: 'Customer Feedback Report',
    icon: '⭐',
    subtitle: 'One row per feedback, with each question as its own column.',
    rowMeaning: 'One row per FEEDBACK — one per call, since a second feedback for a call '
      + 'replaces the first.',
    mandatory: FEEDBACK_REPORT_MANDATORY,
    optional: FEEDBACK_REPORT_OPTIONAL,
    emptyFilter: EMPTY_FEEDBACK_REPORT_FILTER,
    describe: describeFeedbackFilter,
    columns: feedbackReportColumns,
    count: countFeedbackReport,
    list: listFeedbackReport,
    live: supabaseConfigured(),
    mayExport: can('feedback.view') || can('calls.report'),
    fields: [
      // THE FEEDBACK'S OWN DATE, never "Loaded On" (0190). On a migrated row
      // the two differ by up to two years, and somebody filtering for 2025
      // wants the year the customer spoke.
      { key: 'from', label: 'Feedback date from', type: 'date' },
      { key: 'to', label: 'Feedback date to', type: 'date' },
      { key: 'product', label: 'Product', placeholder: 'e.g. MONNAL' },
      { key: 'party', label: 'Customer', placeholder: 'contains' },
      { key: 'state', label: 'State', placeholder: 'contains' },
      { key: 'engineer', label: 'Engineer', placeholder: 'contains' },
      { key: 'ucn', label: 'UCN', placeholder: 'contains' },
      { key: 'callType', label: 'Call type', type: 'select',
        options: [{ value: 'FIELD', label: 'Field' }, { value: 'INSTALL', label: 'Installation' },
                  { value: 'P M', label: 'PM' }] },
      { key: 'source', label: 'Source', type: 'select',
        options: [{ value: 'Uploaded', label: 'Uploaded' },
                  { value: 'Entered here', label: 'Entered here' }] },
    ],
    notes: [
      // THE MOST IMPORTANT NOTE ON THIS FILE. A blank on a question is not a
      // missing answer, and a reader sorting a spreadsheet cannot tell the
      // difference unless somebody says so.
      { Item: 'A BLANK IS NOT A MISSING ANSWER',
        Value: 'Three kinds of visit are asked three sets of questions. Operating Feasibility '
          + 'and General Support are asked of every visit. The four PM/FIELD questions are asked '
          + 'of a PM or field visit; the four INSTALLATION ones of an installation. A blank means '
          + 'the question was not put, not that nobody answered it.' },
      { Item: 'A note on the date',
        Value: 'Date is the FEEDBACK’S OWN date — for a migrated row the date the export '
          + 'gave it, for one taken here the moment it was taken. "Loaded On" is when the row '
          + 'reached this system and can be two years later; the filter uses Date, never that.' },
      { Item: 'A note on the source',
        Value: 'Uploaded = loaded from the v2Feedback export. Entered here = recorded in this '
          + 'system. A figure drawn from both should be able to report the split, which is why '
          + 'the column exists.' },
      { Item: 'One feedback per call',
        Value: 'The register is keyed on the UC Number, so a second feedback for a call REPLACES '
          + 'the first. This report cannot show two for one call because the register cannot '
          + 'hold two.' },
      { Item: 'All Answers',
        Value: 'The optional "All Answers" column carries every answer as it was given, '
          + 'including any question not named above — so nothing the file held is lost even if '
          + 'no column has been made for it yet.' },
    ],
    deniedNote: (
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        You can open this page but not take the file — that needs the right to read customer
        feedback. Ask an administrator under Roles &amp; Permissions.
      </p>
    ),
  };
  return <ReportBuilder spec={spec} />;
}

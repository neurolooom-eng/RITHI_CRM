// ===========================================================================
// WHAT ACTUALLY HAPPENED ON THE CALL — the visits and the spares.
//
// This is the RIGHT-HAND PANE of the Review Desk, lifted out of CallReview when
// the Field Failure Register asked for the same thing (the user, 2026-09-12:
// "Right Side Details of the Call's Visit Details + Spares Used [Spares Used in
// a Tabular Format]").
//
// EXTRACTED, NOT COPIED. Two panes showing "what happened on this call" would
// drift the first time one of them learned to render a new field — and the
// thing they render is a quality record, so the two disagreeing is worse than
// either being slightly wrong. Both desks render this.
//
// PRESENTATION ONLY. Each desk loads its own visits and spares, because each
// reaches them differently (Call Review has the call in hand; the Field Failure
// Register has a UCN on a report). Loading here would mean one of them fetching
// twice or passing a shape it does not have.
// ===========================================================================
import { isUrl, linkLabel } from '../../lib/callreview';
import { fmtLongDate, fmtLongSmart } from '../../lib/format';

// EVERY DATE ON THIS PANE READS DD-MMM-YYYY (the user, 2026-09-12: "Fix the
// Date Field -- follow the DD-MMM-YYYY"). It used to render the visit's own
// heading through toLocaleDateString('en-GB') — "01/09/2026" — which is a
// FIFTH format in an application that already settled on one, and the ambiguous
// one: 01/09 and 09/01 are the same string in two countries.
//
// fmtLongSmart is the register's own formatter: it adds the time only when the
// value carries one, so a date stays a date and a timestamp stays a timestamp.
const fmt = (v: unknown) => fmtLongDate(v);

// ---------------------------------------------------------------------------
// WHAT A VISIT IS NOT WORTH SHOWING HERE (the user, 2026-09-12, with the eight
// fields highlighted on screen).
//
// Two kinds, and both are noise on a pane read beside a REPORT:
//
//  * THE FORM'S OWN ANSWERS — "Add Consumption?", "Maintenance Done?",
//    "Recomended Filter Changed?", "Update Visit Work Details?". These steer
//    the visit form while it is being filled in; they say nothing about the
//    failure. Four rows of "Yes" between the reader and the work done.
//  * WHAT THE RECORD ALREADY CARRIES — Call Type and Standard Complaint are
//    facts about the CALL, repeated identically on every one of its visits and
//    printed on the report itself; Visit Entry Date is when the form was
//    saved, beside the Visit Date & Time that says when the engineer was there.
//
// MATCHED ON A NORMALISED KEY — lower-cased with punctuation removed — because
// these labels are data, typed into the visit form, and one of them is
// misspelt in the live data ("Recomended"). Matching the exact string would
// hide it today and stop the day somebody corrects the spelling.
// ---------------------------------------------------------------------------
const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

const HIDDEN_VISIT_FIELDS = new Set([
  'emailid',                    // was already hidden
  'calltype',
  'addconsumption',
  'visitentrydate',
  'maintenancedone',
  'standardcomplaint',
  'complaintobservation',
  'recomendedfilterchanged', 'recommendedfilterchanged',   // as typed, and as corrected
  'updatevisitworkdetails',
]);

/** A date field, shown the way the rest of the application shows dates. Gated
 *  on the KEY rather than on whether the value happens to parse: "V1.2.9" and
 *  an hour-meter reading are not dates, and a formatter that guessed would
 *  eventually rewrite one. */
const looksLikeDate = (k: string) => /date|time/i.test(k);

export interface CallContextProps {
  visits: Record<string, unknown>[];
  spares: Record<string, unknown>[];
  busy: boolean;
  /** What to say when there is no visit. The Call Review lists SOLVED calls, so
   *  "no visit" is itself a finding there; a Field Failure Report can be raised
   *  on an open call, where it is not. The same words would be wrong on one of
   *  them, so each desk supplies its own. */
  noVisitsNote?: string;
}

export function CallContext({ visits, spares, busy, noVisitsNote }: CallContextProps) {
  return (
    <>
      {/* THE COUNT IS NOT STATED WHILE IT IS STILL LOADING. It used to read
          "0 visits" beside "Loading…", which is a claim the screen cannot yet
          make — and "no visit on a solved call" is a FINDING on the Call Review
          desk, so showing it falsely for a moment is worse here than a blank. */}
      <div className="cr-h">
        <b>Visit work details</b>{' '}
        <span className="muted">
          {busy ? '…' : `${visits.length} visit${visits.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {busy && <div className="muted cr-note">Loading…</div>}
      {!busy && !visits.length && (
        <div className="muted cr-note">{noVisitsNote ?? 'No visit on record for this call.'}</div>
      )}
      {visits.map((v, i) => {
        const d = (v.data && typeof v.data === 'object' ? v.data : {}) as Record<string, unknown>;
        return (
          <div className="cr-visit" key={i}>
            <div className="cr-visit-h">
              <b>{fmt(v.visit_at) || fmt(v.updated_at)}</b>
              <span className="muted">{String(v.engineer ?? '')}</span>
            </div>
            <dl className="cr-dl">
              {Object.entries(d)
                .filter(([k, val]) => String(val ?? '').trim() && !HIDDEN_VISIT_FIELDS.has(norm(k)))
                .map(([k, val]) => (
                  <div className="cr-dl-row" key={k}>
                    <dt>{k}</dt>
                    {/* THE SIGNED REPORT IS THE POINT OF THE REVIEW, and it was
                        a wall of URL to copy by hand. Any http(s) value opens;
                        the rest stays text. `noopener` because the target is
                        Drive, not this app. */}
                    <dd>{isUrl(String(val))
                      ? <a href={String(val)} target="_blank" rel="noopener noreferrer">{linkLabel(k, String(val))}</a>
                      : looksLikeDate(k) ? fmtLongSmart(val) : String(val)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        );
      })}

      <div className="cr-h cr-h-gap">
        <b>Spares consumed</b>{' '}
        <span className="muted">
          {busy ? '…' : `${spares.length} line${spares.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {!busy && !spares.length && <div className="muted cr-note">Nothing booked against this call.</div>}
      {spares.length > 0 && (
        <table className="cr-spares">
          <thead><tr><th>Part</th><th>Qty</th><th>GRIR</th><th>Source</th></tr></thead>
          <tbody>
            {spares.map((s, i) => (
              // A VOIDED LINE IS SHOWN, NOT HIDDEN. A wrong consumption is
              // voided rather than deleted (0049) — the row stays with its
              // original quantity, and the register says so.
              <tr key={i} className={Number(s.qty ?? 0) === 0 ? 'cr-void' : ''}>
                <td>{String(s.part ?? '')}</td>
                <td>{String(s.qty ?? '')}{Number(s.qty ?? 0) === 0 ? ' (voided)' : ''}</td>
                <td>{String(s.grir ?? '')}</td>
                <td>{String(s.source ?? '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

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
import { parseAnyDate } from '../../lib/dates';

const fmt = (v: unknown) => {
  const d = parseAnyDate(String(v ?? ''));
  return d ? d.toLocaleDateString('en-GB') : String(v ?? '');
};

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
                .filter(([k, val]) => String(val ?? '').trim() && !/^email-id$/i.test(k))
                .map(([k, val]) => (
                  <div className="cr-dl-row" key={k}>
                    <dt>{k}</dt>
                    {/* THE SIGNED REPORT IS THE POINT OF THE REVIEW, and it was
                        a wall of URL to copy by hand. Any http(s) value opens;
                        the rest stays text. `noopener` because the target is
                        Drive, not this app. */}
                    <dd>{isUrl(String(val))
                      ? <a href={String(val)} target="_blank" rel="noopener noreferrer">{linkLabel(k, String(val))}</a>
                      : String(val)}</dd>
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

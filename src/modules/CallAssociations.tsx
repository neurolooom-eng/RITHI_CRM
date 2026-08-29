import { useEffect, useState } from 'react';
import { reportsByCall, spareRequestsByCall, spareConsumptionByCall, feedbackByCall, supabaseConfigured } from '../lib/supabase';
import './fieldcalls.css';

// ===========================================================================
// CALL ASSOCIATIONS — every record tied to one call (by UCN), shown as small
// tables in the call's own view: visit history, spares requested, spares
// consumed, and customer feedback.
// ===========================================================================

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const d = (v: unknown) => s(v).slice(0, 10);

function MiniTable({ title, icon, cols, rows, empty }: {
  title: string; icon: string; cols: { key: string; label: string; fmt?: (r: Row) => string }[]; rows: Row[]; empty: string;
}) {
  return (
    <section className="rep-sec">
      <div className="rep-sec-title">{icon} {title} <span className="muted">({rows.length})</span></div>
      {rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>{empty}</div>
      ) : (
        <div className="assoc-scroll">
          <table className="assoc-table">
            <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{cols.map((c) => <td key={c.key}>{c.fmt ? c.fmt(r) : s(r[c.key])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Keyed by CALL NUMBER — every visit/spare/feedback tied to this call.
export function CallAssociations({ callNumber }: { callNumber: string }) {
  const [visits, setVisits] = useState<Row[]>([]);
  const [requested, setRequested] = useState<Row[]>([]);
  const [consumed, setConsumed] = useState<Row[]>([]);
  const [feedback, setFeedback] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!callNumber || !supabaseConfigured()) return;
    let alive = true;
    setLoading(true);
    Promise.all([reportsByCall(callNumber), spareRequestsByCall(callNumber), spareConsumptionByCall(callNumber), feedbackByCall(callNumber)])
      .then(([v, rq, cs, fb]) => { if (!alive) return; setVisits(v); setRequested(rq); setConsumed(cs); setFeedback(fb); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [callNumber]);

  if (!supabaseConfigured()) return null;

  return (
    <div className="rep-form" style={{ marginTop: 8 }}>
      {loading && <div className="muted" style={{ fontSize: 13 }}>Loading associated records…</div>}

      <MiniTable
        title="Visit history" icon="🕓" rows={visits}
        empty="No visits reported yet."
        cols={[
          { key: 'visit_at', label: 'Visit', fmt: (r) => d(r.visit_at) },
          { key: 'call_status', label: 'Status' },
          { key: 'engineer', label: 'Engineer' },
          { key: 'pending_reason', label: 'Pending Reason' },
          { key: 'job', label: 'Job Done', fmt: (r) => s((r.data as Row)?.['Job Done']).slice(0, 80) },
        ]}
      />

      <MiniTable
        title="Spares requested" icon="📦" rows={requested}
        empty="No spare requests raised."
        cols={[
          { key: 'requested_at', label: 'Date', fmt: (r) => d(r.requested_at) },
          { key: 'uid', label: 'Req UID' },
          { key: 'part', label: 'Part' },
          { key: 'qty', label: 'Qty' },
          { key: 'req_status', label: 'Status' },
        ]}
      />

      <MiniTable
        title="Spares consumed" icon="🧾" rows={consumed}
        empty="No spares consumed."
        cols={[
          { key: 'created_at', label: 'Date', fmt: (r) => d(r.created_at) },
          { key: 'part', label: 'Part' },
          { key: 'qty', label: 'Qty' },
          { key: 'engineer', label: 'Engineer' },
        ]}
      />

      {feedback.length > 0 && (
        <MiniTable
          title="Customer feedback" icon="⭐" rows={feedback}
          empty="No feedback."
          cols={[
            { key: 'created_at', label: 'Date', fmt: (r) => d(r.created_at) },
            { key: 'engineer', label: 'Engineer' },
            { key: 'answers', label: 'Answers', fmt: (r) => Object.entries((r.answers as Row) ?? {}).map(([k, v]) => `${k.split('-').pop()}: ${v}`).join(' · ').slice(0, 120) },
          ]}
        />
      )}
    </div>
  );
}

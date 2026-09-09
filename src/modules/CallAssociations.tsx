import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  reportsByCall, spareRequestsByCall, spareConsumptionByCall, feedbackByCall, supabaseConfigured,
  serviceManualsForProduct, kbForCall, type DocRow, type KbLite,
} from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { deriveStage, type SpareReq } from '../lib/spareflow';
import { manualReportLink } from '../lib/reports';
import { fmtLongDate } from '../lib/format';
import { DocPreview } from '../components/doc/DocPreview';
import { ReportDetail } from './ReportDetail';
import './fieldcalls.css';

// ===========================================================================
// CALL ASSOCIATIONS — every record tied to one call (by UCN), shown as small
// tables in the call's own view: visit history, spares requested, spares
// consumed, customer feedback — and the SUPPORTING DOCUMENTS for the machine.
//
// Supporting documents are the reason the document library exists: an engineer
// opening a call should be handed the service manual for THAT product, plus any
// knowledge-base article tagged for it, without going looking. Matched on the
// call's product, its standard complaint AND what was reported — so an
// ACCESSORY's manual reaches the call that names the accessory, whatever
// machine it is fitted to (lib/docmatch.ts). A manual with no product is a
// general one and is offered on every call.
// ===========================================================================

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
// EVERY DATE THROUGH THE ONE FORMATTER (the user, 2026-09-08: "Make all the
// Date Formats alligned -- DD-MMM-YYYY"). This used to slice the ISO string,
// which is why the visit history read 2026-09-03 while the call above it read
// 03-Sep-2026 — the same day, twice, in two languages. `format.tsx` has been
// dd-mmm-yyyy all along; what was wrong was going round it.
const d = (v: unknown) => fmtLongDate(v);

// `fmt` returns a NODE, not a string: the visit history carries the service
// report, and a link is not text. Every existing column returns a string, which
// is a node too, so nothing else changed.
function MiniTable({ title, icon, cols, rows, empty, onRowClick }: {
  title: string; icon: string; cols: { key: string; label: string; fmt?: (r: Row) => ReactNode }[]; rows: Row[]; empty: string;
  onRowClick?: (r: Row) => void;
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
                <tr
                  key={i}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                  title={onRowClick ? 'Click for details' : undefined}
                >{cols.map((c) => <td key={c.key}>{c.fmt ? c.fmt(r) : s(r[c.key])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Full detail of one spare-request line, shown when its row is clicked.
function SpareDetail({ row, onClose }: { row: Row; onClose: () => void }) {
  const stage = deriveStage(row);
  const appr = (v: unknown, by: unknown, at: unknown) => {
    const val = s(v) || '—';
    const who = s(by); const when = d(at);
    return who || when ? `${val}${who ? ` · ${who}` : ''}${when ? ` · ${when}` : ''}` : val;
  };
  const fields: [string, string][] = [
    ['OR Number', s(row.or_no)],
    ['Part', s(row.part)],
    ['Quantity', s(row.qty)],
    ['Item Status', s(row.item_status)],
    ['Stage', stage],
    ['Line Status', s(row.status)],
    ['RM Approval', appr(row.rm_approval, row.rm_by, row.rm_at)],
    ['Commercial', appr(row.commercial_approval, row.commercial_by, row.commercial_at)],
    ['NSM', appr(row.nsm_approval, row.nsm_by, row.nsm_at)],
    ['Stores', appr(row.stores_status, row.dispatched_by, row.dispatched_at)],
    ['DC Number', s(row.dc_number)],
    ['Courier', s(row.courier)],
    ['Received', d(row.received_at)],
    ['Rejected At Stage', s(row.rejected_stage)],
    ['Reject Reason', s(row.reject_reason)],
    ['Request UID', s(row.uid)],
    ['Party', s(row.party)],
    ['Product', s(row.product)],
  ].filter(([, v]) => v && v !== '—') as [string, string][];

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface, #fff)', color: 'var(--text, inherit)', borderRadius: 12, maxWidth: 480, width: '100%', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
          <b style={{ flex: 1 }}>📦 Spare Request · {s(row.or_no) || s(row.part)}</b>
          <span className="badge badge-neutral">{stage}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <table className="assoc-table" style={{ width: '100%' }}>
          <tbody>
            {fields.map(([k, v]) => (
              <tr key={k}><td style={{ width: 150, color: 'var(--muted)' }}>{k}</td><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Keyed by CALL NUMBER — every visit/spare/feedback tied to this call.
// The manuals + articles that speak to this machine. Read-only, and quiet when
// there is nothing to show — an empty panel on every call would be noise.
//
// EXPORTED, because a call REQUEST needs exactly this and nothing about it is
// specific to a registered call (the user, 2026-09-09: "Add Supporting Docs
// logic to Call Request list / Page / View"). It takes a product, a standard
// complaint and what was reported — a request has all three before it has a
// UCN, which is the whole point: the engineer raising it can read the manual
// while describing the fault, rather than after somebody registers it.
// One component, so the matching rule cannot start differing between the two
// screens — which is what a second copy of this would guarantee.
export function SupportingDocs({ product, complaint, reported }: { product: string; complaint: string; reported: string }) {
  const navigate = useNavigate();
  const [manuals, setManuals] = useState<DocRow[]>([]);
  const [articles, setArticles] = useState<KbLite[]>([]);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    let alive = true;
    // DEBOUNCED, because `reported` is a LIVE TEXTAREA on the call-request form:
    // the panel there sits under a Reported Problem box somebody is typing into,
    // and this effect depends on its value. Without the delay every keystroke
    // fetched the whole service-manual table — the match is done in JS, so
    // there is no narrowing query to lean on. On a call, where all three props
    // are fixed, the timer simply fires once and nothing is different.
    const t = window.setTimeout(() => {
      // Either side may be missing (no library applied yet, no articles written);
      // each resolves to [] on its own rather than taking the panel down.
      void serviceManualsForProduct(product, complaint, reported).then((m) => { if (alive) setManuals(m); }).catch(() => {});
      void kbForCall(product, complaint).then((a) => { if (alive) setArticles(a); }).catch(() => {});
    }, 350);
    return () => { alive = false; window.clearTimeout(t); };
  }, [product, complaint, reported]);

  // IT USED TO VANISH WHEN NOTHING MATCHED, and that was the wrong call.
  // "Quiet when there is nothing to show" reads on screen as the feature having
  // been REMOVED — which is exactly how it was reported (2026-09-09). A panel
  // that is sometimes absent cannot be told from one that is broken, and the
  // person looking at it has no way to learn that the answer is "no manual is
  // filed for this machine yet".
  //
  // So it always renders once there is something to match ON, and says which of
  // the two it is: nothing filed, or nothing matching. It still disappears
  // entirely where the call names no product and no complaint, because then
  // there is genuinely no question to answer.
  const nothingToMatchOn = !product.trim() && !complaint.trim() && !reported.trim();
  if (nothingToMatchOn) return null;
  const empty = !manuals.length && !articles.length;

  return (
    <section className="rep-sec">
      <div className="rep-sec-title">
        📄 Supporting documents <span className="muted">({manuals.length + articles.length})</span>
      </div>
      {empty && (
        <div className="detail-hint">
          No service manual or article is filed for {product.trim() ? <b>{product}</b> : 'this machine'} yet.
          Manuals are added under <b>Knowledge Base → Service Manuals</b>; a manual with no
          product set is offered on every call.
        </div>
      )}
      {!empty && (
      <div className="assoc-scroll">
        <table className="assoc-table">
          <thead><tr><th>Type</th><th>Title</th><th>Covers</th><th>Tags</th></tr></thead>
          <tbody>
            {manuals.map((m) => (
              <tr key={`m${m.id}`}>
                <td>📘 Service manual</td>
                <td><a href={m.url} target="_blank" rel="noreferrer">{m.title}</a></td>
                <td>{m.product || 'Every product'}{m.revision ? ` · Rev ${m.revision}` : ''}</td>
                <td>{m.tags}</td>
              </tr>
            ))}
            {articles.map((a) => (
              <tr key={`k${a.id}`} style={{ cursor: 'pointer' }} title="Open in the Knowledge Base"
                  onClick={() => navigate('/knowledge-base', { state: { openArticle: a.id } })}>
                <td>📚 Knowledge Base</td>
                <td>{a.title}</td>
                <td>{a.product || a.category || '—'}</td>
                <td>{a.tags}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}

export function CallAssociations({ callNumber, product = '', complaint = '', reported = '', solved = false }:
  { callNumber: string; product?: string; complaint?: string; reported?: string; solved?: boolean }) {
  const [visits, setVisits] = useState<Row[]>([]);
  const [requested, setRequested] = useState<Row[]>([]);
  const [consumed, setConsumed] = useState<Row[]>([]);
  const [feedback, setFeedback] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [spareDetail, setSpareDetail] = useState<Row | null>(null);
  const [visitDetail, setVisitDetail] = useState<Row | null>(null);
  // The report of ONE visit, shown in the app. The row is kept rather than the
  // link, so the viewer's heading can say which visit it belongs to.
  const [docFor, setDocFor] = useState<Row | null>(null);

  useEffect(() => {
    if (!callNumber || !supabaseConfigured()) return;
    let alive = true;
    setLoading(true);
    Promise.all([reportsByCall(callNumber), spareRequestsByCall(callNumber), spareConsumptionByCall(callNumber), feedbackByCall(callNumber)])
      .then(([v, rq, cs, fb]) => { if (!alive) return; setVisits(v); setRequested(rq); setConsumed(cs); setFeedback(fb); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [callNumber]);

  // A part is the CODE, not the code-plus-description: consumption and the
  // request line both carry "CODE|Description" and the description drifts
  // (case, spacing, a renamed part), so matching the whole string would report
  // a part as unused because somebody re-typed its name.
  const partKey = (v: unknown) => s(v).split('|')[0].trim().toUpperCase();

  // NEITHER REJECTED NOR DROPPED IS SHOWN (the user, 2026-09-08: "Dropped
  // Spares also should not be Listed in the Call or in the Flag Report").
  //
  // I had kept dropped lines here, reasoning that Stores dropping an approved
  // part is a supply failure worth seeing on the call. That is overruled, and
  // the rule it leaves is simpler and better: THIS TABLE SHOWS PARTS THAT
  // REACHED THIS CALL. Refused and dropped are both "nothing arrived", and on a
  // call a line that reads like a part is a part somebody will go looking for in
  // the machine. A drop is chased on the spare register, where it was decided.
  //
  // The flag report (0147) already excludes both, for the same reason.
  const requestedLive = useMemo(
    () => requested.filter((r) => {
      const stage = deriveStage(r as SpareReq);
      return stage !== 'Rejected' && stage !== 'Dropped';
    }),
    [requested],
  );

  // WHAT REACHED THIS CALL AND IS NOT ACCOUNTED FOR — by QUANTITY, not by mere
  // presence (the user, 2026-09-08: "Flag if there is a Qty Mismatch as well -
  // Say 2 Nos are requested but only 1 Consumed").
  //
  // Summed on both sides before comparing, for the same reason the report is
  // (0147): a part sent twice on one call and booked once in a single entry
  // would otherwise show as short on both lines.
  const shortfall = useMemo(() => {
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const used = new Map<string, number>();
    consumed.forEach((c) => {
      const k = partKey(c.part);
      if (k) used.set(k, (used.get(k) ?? 0) + num(c.qty));
    });
    const sent = new Map<string, number>();
    requestedLive.forEach((r) => {
      const stage = deriveStage(r as SpareReq);
      if (stage !== 'Dispatched' && stage !== 'Received') return;
      const k = partKey(r.part);
      if (!k) return;
      const q = num(r.dispatched_qty) || num(r.qty);
      sent.set(k, (sent.get(k) ?? 0) + q);
    });
    const out = new Map<string, { sent: number; used: number }>();
    // NOT UNTIL THE CALL IS SOLVED (the user, 2026-09-08). While it is open the
    // part is legitimately still in the van -- the engineer has not finished,
    // and consumption is booked when the work is done. The report (0147) draws
    // the same line, in SQL, for the same reason.
    if (!solved) return out;
    sent.forEach((qty, k) => {
      const u = used.get(k) ?? 0;
      if (u < qty) out.set(k, { sent: qty, used: u });
    });
    return out;
  }, [requestedLive, consumed, solved]);

  if (!supabaseConfigured()) return null;

  return (
    <div className="rep-form" style={{ marginTop: 8 }}>
      {loading && <div className="muted" style={{ fontSize: 13 }}>Loading associated records…</div>}

      <SupportingDocs product={product} complaint={complaint} reported={reported} />

      <MiniTable
        title="Visit history" icon="🕓" rows={visits}
        empty="No visits reported yet."
        onRowClick={setVisitDetail}
        cols={[
          { key: 'visit_at', label: 'Visit', fmt: (r) => d(r.visit_at) },
          { key: 'call_status', label: 'Status' },
          { key: 'engineer', label: 'Engineer' },
          { key: 'pending_reason', label: 'Pending Reason' },
          // THE SIGNED REPORT, ON THE VISIT THAT FILED IT. A call can be
          // visited several times and each visit files its own; hanging one
          // link off the call would have to pick one and could not say which.
          // The cell swallows the row click so opening the report is not also
          // opening the visit behind it.
          { key: 'manual_report', label: 'Service Report', fmt: (r) => {
            const link = manualReportLink(r);
            return link
              ? (
                <button type="button" className="svc-report-link"
                        onClick={(e) => { e.stopPropagation(); setDocFor(r); }}
                        title="Show the signed service report">📄 Show</button>
              )
              : <span className="muted">—</span>;
          } },
          { key: 'job', label: 'Job Done', fmt: (r) => s((r.data as Row)?.['Job Done']).slice(0, 80) },
        ]}
      />

      <MiniTable
        title="Spares requested" icon="📦" rows={requestedLive}
        empty="No spare requests raised."
        onRowClick={setSpareDetail}
        cols={[
          { key: 'requested_at', label: 'Date', fmt: (r) => d(r.requested_at) },
          // THE OR NUMBER, not the request UID (the user, 2026-09-08). The uid
          // is this system's own handle; the OR is what the paperwork, Stores
          // and the customer all say, so it is the one somebody can act on.
          { key: 'or_no', label: 'OR No' },
          { key: 'part', label: 'Part' },
          { key: 'qty', label: 'Qty' },
          { key: 'stage', label: 'Stage', fmt: (r) => deriveStage(r) },
          { key: 'dc_number', label: 'DC No' },
          // REQUESTED, SENT, AND NOT BOOKED. A part that reached the engineer
          // and appears nowhere in this call's consumption is either fitted and
          // unrecorded or still in the van — both worth knowing, neither
          // visible until now. A part that never got past an approver is NOT
          // flagged: it was never supplied, so there was nothing to use.
          { key: '_unused', label: '', fmt: (r) => {
            const gap = shortfall.get(partKey(r.part));
            if (!gap) return null;
            // The row says WHICH: nothing booked at all, or some of it missing.
            // "Short 1 of 2" and "none of it" are different conversations.
            return gap.used === 0
              ? <span className="assoc-flag" title="Sent to the engineer, and nothing booked against this call">Not Consumed Against this Call</span>
              : <span className="assoc-flag" title={`${gap.used} of ${gap.sent} booked against this call`}>Short {gap.sent - gap.used} of {gap.sent}</span>;
          } },
        ]}
      />
      {spareDetail && <SpareDetail row={spareDetail} onClose={() => setSpareDetail(null)} />}

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

      {visitDetail && <ReportDetail report={visitDetail} onClose={() => setVisitDetail(null)} />}

      {docFor && (
        <DocPreview
          url={manualReportLink(docFor)}
          title={`Service Report — ${s(docFor.ucn) || callNumber}`}
          subtitle={[d(docFor.visit_at) && `Visit ${d(docFor.visit_at)}`, s(docFor.engineer), s(docFor.call_status)]
            .filter(Boolean).join(' · ')}
          onClose={() => setDocFor(null)}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  reportsByCall, spareRequestsByCall, spareConsumptionByCall, feedbackByCall, supabaseConfigured,
  serviceManualsForProduct, kbForCall, type DocRow, type KbLite,
} from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { deriveStage } from '../lib/spareflow';
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
// call's product and its standard complaint; a manual with no product is a
// general one and is offered on every call.
// ===========================================================================

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const d = (v: unknown) => s(v).slice(0, 10);

function MiniTable({ title, icon, cols, rows, empty, onRowClick }: {
  title: string; icon: string; cols: { key: string; label: string; fmt?: (r: Row) => string }[]; rows: Row[]; empty: string;
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
    ['OR Number', s(row.or_number)],
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
          <b style={{ flex: 1 }}>📦 Spare Request · {s(row.or_number) || s(row.part)}</b>
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
function SupportingDocs({ product, complaint }: { product: string; complaint: string }) {
  const navigate = useNavigate();
  const [manuals, setManuals] = useState<DocRow[]>([]);
  const [articles, setArticles] = useState<KbLite[]>([]);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    let alive = true;
    // Either side may be missing (no library applied yet, no articles written);
    // each resolves to [] on its own rather than taking the panel down.
    void serviceManualsForProduct(product).then((m) => { if (alive) setManuals(m); }).catch(() => {});
    void kbForCall(product, complaint).then((a) => { if (alive) setArticles(a); }).catch(() => {});
    return () => { alive = false; };
  }, [product, complaint]);

  if (!manuals.length && !articles.length) return null;

  return (
    <section className="rep-sec">
      <div className="rep-sec-title">
        📄 Supporting documents <span className="muted">({manuals.length + articles.length})</span>
      </div>
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
    </section>
  );
}

export function CallAssociations({ callNumber, product = '', complaint = '' }: { callNumber: string; product?: string; complaint?: string }) {
  const [visits, setVisits] = useState<Row[]>([]);
  const [requested, setRequested] = useState<Row[]>([]);
  const [consumed, setConsumed] = useState<Row[]>([]);
  const [feedback, setFeedback] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [spareDetail, setSpareDetail] = useState<Row | null>(null);
  const [visitDetail, setVisitDetail] = useState<Row | null>(null);

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

      <SupportingDocs product={product} complaint={complaint} />

      <MiniTable
        title="Visit history" icon="🕓" rows={visits}
        empty="No visits reported yet."
        onRowClick={setVisitDetail}
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
        onRowClick={setSpareDetail}
        cols={[
          { key: 'requested_at', label: 'Date', fmt: (r) => d(r.requested_at) },
          { key: 'uid', label: 'Req UID' },
          { key: 'part', label: 'Part' },
          { key: 'qty', label: 'Qty' },
          { key: 'stage', label: 'Stage', fmt: (r) => deriveStage(r) },
          { key: 'dc_number', label: 'DC No' },
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
    </div>
  );
}

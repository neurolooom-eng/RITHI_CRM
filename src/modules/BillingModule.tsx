import { useMemo, useState } from 'react';
import { useCollection, useCrud } from '../lib/hooks';
import type { BaseRecord } from '../lib/db';
import { db } from '../lib/db';
import { useAuth } from '../lib/auth';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { fmtCurrency, fmtDate, nextCode, lookup, statusBadge, optionsFrom, todayISO } from '../lib/format';
import { C, STATUS_TONES, toOptions } from './collections';
import { TemplatePlaceholder } from './TemplatePlaceholder';
import './billing.css';

// ===========================================================================
// Billing documents (Quote / Invoice) with line items for both PRODUCTS and
// SPARES. Totals (sub-total, GST, grand total) compute live. A template
// placeholder is mounted so the user's real print template can be slotted in.
// ===========================================================================

export type BillingKind = 'quote' | 'invoice';

interface LineItem {
  id: string;
  kind: 'product' | 'spare';
  refId: string;
  description: string;
  qty: number;
  rate: number;
  gst: number;
}

interface BillingDoc extends BaseRecord {
  code: string;
  kind: BillingKind;
  partyId: string;
  docDate: string;
  status: string;
  items: LineItem[];
  notes?: string;
  paymentStatus?: string;
}

const KIND_META: Record<BillingKind, { collection: string; title: string; icon: string; prefix: string; singular: string; statuses: string[] }> = {
  quote: { collection: C.quotes, title: 'Quotations', icon: '🧮', prefix: 'QT', singular: 'Quote', statuses: ['Draft', 'Issued', 'Approved', 'Rejected'] },
  invoice: { collection: C.invoices, title: 'Invoices', icon: '💳', prefix: 'INV', singular: 'Invoice', statuses: ['Draft', 'Issued', 'Paid', 'Cancelled'] },
};

const lineTotal = (l: LineItem) => l.qty * l.rate;
const lineGst = (l: LineItem) => (lineTotal(l) * l.gst) / 100;

function totals(items: LineItem[]) {
  const sub = items.reduce((s, l) => s + lineTotal(l), 0);
  const gst = items.reduce((s, l) => s + lineGst(l), 0);
  return { sub, gst, grand: sub + gst };
}

export function BillingModule({ kind }: { kind: BillingKind }) {
  const meta = KIND_META[kind];
  const rows = useCollection<BillingDoc>(meta.collection);
  const crud = useCrud(meta.collection);
  const { user, can } = useAuth();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<BillingDoc | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<BillingDoc | null>(null);

  const visible = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (d) =>
          d.code.toLowerCase().includes(q) ||
          lookup(C.parties, d.partyId, 'name').toLowerCase().includes(q),
      );
    }
    return [...r].reverse();
  }, [rows, search]);

  const columns: Column<BillingDoc>[] = [
    { key: 'code', header: meta.singular + ' No.', width: 120, wrap: false },
    { key: 'partyId', header: 'Customer', width: 200, render: (r) => lookup(C.parties, r.partyId, 'name') },
    { key: 'docDate', header: 'Date', width: 120, wrap: false, render: (r) => fmtDate(r.docDate) },
    { key: 'items', header: 'Items', width: 70, align: 'right', wrap: false, render: (r) => r.items?.length ?? 0 },
    { key: '_grand', header: 'Grand Total', width: 130, align: 'right', wrap: false, render: (r) => fmtCurrency(totals(r.items ?? []).grand) },
    { key: 'status', header: 'Status', width: 110, wrap: false, render: (r) => statusBadge(r.status, STATUS_TONES) },
    ...(kind === 'invoice'
      ? [{ key: 'paymentStatus', header: 'Payment', width: 100, wrap: false, render: (r: BillingDoc) => statusBadge(r.paymentStatus, STATUS_TONES) } as Column<BillingDoc>]
      : []),
    {
      key: '_actions',
      header: 'Actions',
      width: 190,
      sortable: false,
      wrap: false,
      render: (r) => (
        <div className="row" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-sm" onClick={() => setPreviewDoc(r)}>Preview</button>
          {can('edit') && <button className="btn btn-sm" onClick={() => setEditing(r)}>Edit</button>}
          {can('delete') && (
            <button className="btn btn-sm btn-ghost" onClick={() => confirm('Delete?') && crud.remove(r.id)}>🗑</button>
          )}
        </div>
      ),
    },
  ];

  const startCreate = () => {
    setEditing({
      id: '',
      code: '',
      kind,
      partyId: '',
      docDate: todayISO(),
      status: 'Draft',
      items: [],
      createdAt: '',
      updatedAt: '',
      ...(kind === 'invoice' ? { paymentStatus: 'Unpaid' } : {}),
    } as BillingDoc);
    setCreating(true);
  };

  const save = (doc: BillingDoc) => {
    if (creating) {
      crud.insert({ ...doc, code: nextCode(meta.collection, meta.prefix), ownerId: user?.id });
    } else {
      crud.update(doc.id, doc);
    }
    setEditing(null);
    setCreating(false);
  };

  return (
    <div>
      <PageHeader
        title={meta.title}
        subtitle={`${meta.singular} generation for products & spares`}
        icon={meta.icon}
        actions={can('edit') && <button className="btn btn-primary" onClick={startCreate}>+ New {meta.singular}</button>}
      />
      <DataTable<BillingDoc>
        columns={columns}
        rows={visible}
        getRowId={(r) => r.id}
        storageKey={meta.collection}
        onRowClick={(r) => setPreviewDoc(r)}
        emptyText={`No ${meta.title.toLowerCase()} yet.`}
        toolbar={
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder={`Search ${meta.title.toLowerCase()}…`} />
          </Toolbar>
        }
      />

      <Drawer
        open={!!editing}
        onClose={() => { setEditing(null); setCreating(false); }}
        title={creating ? `New ${meta.singular}` : `Edit ${editing?.code}`}
        width={860}
      >
        {editing && <BillingEditor doc={editing} meta={meta} onSave={save} onCancel={() => { setEditing(null); setCreating(false); }} />}
      </Drawer>

      <Drawer open={!!previewDoc} onClose={() => setPreviewDoc(null)} title={`${meta.singular} Preview`} width={780}>
        {previewDoc && <BillingPreview doc={previewDoc} meta={meta} />}
      </Drawer>
    </div>
  );
}

// ---- editor with line items ----------------------------------------------
function BillingEditor({
  doc,
  meta,
  onSave,
  onCancel,
}: {
  doc: BillingDoc;
  meta: (typeof KIND_META)[BillingKind];
  onSave: (d: BillingDoc) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<BillingDoc>(doc);
  const partyOpts = optionsFrom(C.parties, 'name', { codeKey: 'code' })();
  const productOpts = db.list(C.products);
  const spareOpts = db.list(C.parts);

  const update = (patch: Partial<BillingDoc>) => setState((s) => ({ ...s, ...patch }));

  const addItem = (kind: 'product' | 'spare') => {
    const newItem: LineItem = { id: Math.random().toString(36).slice(2), kind, refId: '', description: '', qty: 1, rate: 0, gst: kind === 'product' ? 12 : 18 };
    update({ items: [...state.items, newItem] });
  };

  const updateItem = (id: string, patch: Partial<LineItem>) =>
    update({ items: state.items.map((l) => (l.id === id ? { ...l, ...patch } : l)) });

  const pickRef = (id: string, kind: 'product' | 'spare', refId: string) => {
    const src = kind === 'product' ? productOpts : spareOpts;
    const rec = src.find((r) => r.id === refId);
    if (rec) {
      updateItem(id, {
        refId,
        description: String(rec.name ?? ''),
        rate: Number(rec.listPrice ?? rec.unitPrice ?? 0),
        gst: Number(rec.gstRate ?? (kind === 'product' ? 12 : 18)),
      });
    } else {
      updateItem(id, { refId });
    }
  };

  const t = totals(state.items);
  const valid = state.partyId && state.items.length > 0;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="sf-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        <div className="sf-field">
          <label className="field-label">Customer <span className="field-req">*</span></label>
          <select className="select" value={state.partyId} onChange={(e) => update({ partyId: e.target.value })}>
            <option value="">— Select —</option>
            {partyOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="sf-field">
          <label className="field-label">{meta.singular} Date</label>
          <input type="date" className="input" value={state.docDate} onChange={(e) => update({ docDate: e.target.value })} />
        </div>
        <div className="sf-field">
          <label className="field-label">Status</label>
          <select className="select" value={state.status} onChange={(e) => update({ status: e.target.value })}>
            {meta.statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {state.kind === 'invoice' && (
          <div className="sf-field">
            <label className="field-label">Payment Status</label>
            <select className="select" value={state.paymentStatus} onChange={(e) => update({ paymentStatus: e.target.value })}>
              {['Unpaid', 'Paid', 'Partial'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>

      <div>
        <div className="row" style={{ marginBottom: 8 }}>
          <h3 className="section-card-title">Line Items</h3>
          <div className="spacer" />
          <button className="btn btn-sm" onClick={() => addItem('product')}>+ Product</button>
          <button className="btn btn-sm" onClick={() => addItem('spare')}>+ Spare</button>
        </div>
        <table className="bill-items">
          <thead>
            <tr>
              <th>Type</th><th>Item</th><th>Qty</th><th>Rate</th><th>GST%</th><th>Amount</th><th></th>
            </tr>
          </thead>
          <tbody>
            {state.items.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 16 }}>Add product or spare line items</td></tr>}
            {state.items.map((l) => {
              const src = l.kind === 'product' ? productOpts : spareOpts;
              return (
                <tr key={l.id}>
                  <td><span className={`badge badge-${l.kind === 'product' ? 'primary' : 'info'}`}>{l.kind}</span></td>
                  <td>
                    <select className="select" value={l.refId} onChange={(e) => pickRef(l.id, l.kind, e.target.value)}>
                      <option value="">— Select —</option>
                      {src.map((r) => <option key={r.id} value={r.id}>{String(r.code)} · {String(r.name)}</option>)}
                    </select>
                  </td>
                  <td><input type="number" className="input bill-num" value={l.qty} min={1} onChange={(e) => updateItem(l.id, { qty: Number(e.target.value) })} /></td>
                  <td><input type="number" className="input bill-num" value={l.rate} onChange={(e) => updateItem(l.id, { rate: Number(e.target.value) })} /></td>
                  <td><input type="number" className="input bill-num bill-num-sm" value={l.gst} onChange={(e) => updateItem(l.id, { gst: Number(e.target.value) })} /></td>
                  <td className="bill-amt">{fmtCurrency(lineTotal(l) + lineGst(l))}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => update({ items: state.items.filter((x) => x.id !== l.id) })}>✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="bill-totals">
          <div><span className="muted">Sub-total</span><b>{fmtCurrency(t.sub)}</b></div>
          <div><span className="muted">GST</span><b>{fmtCurrency(t.gst)}</b></div>
          <div className="bill-grand"><span>Grand Total</span><b>{fmtCurrency(t.grand)}</b></div>
        </div>
      </div>

      <div className="sf-field">
        <label className="field-label">Notes / Terms</label>
        <textarea className="textarea" value={state.notes ?? ''} onChange={(e) => update({ notes: e.target.value })} />
      </div>

      <div className="sf-actions">
        <div className="spacer" />
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={!valid} onClick={() => onSave(state)}>Save {meta.singular}</button>
      </div>
    </div>
  );
}

// ---- preview (template placeholder) --------------------------------------
function BillingPreview({ doc, meta }: { doc: BillingDoc; meta: (typeof KIND_META)[BillingKind] }) {
  const t = totals(doc.items ?? []);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <TemplatePlaceholder
        templateKey={`${meta.collection}-print`}
        title={`${meta.singular} Print Template`}
        description={`Slot your official ${meta.singular.toLowerCase()} template here. The data below is wired and ready to bind.`}
      />
      <div className="bill-doc card card-pad">
        <div className="bill-doc-head">
          <div>
            <h2>{meta.title.slice(0, -1)}</h2>
            <div className="muted">{doc.code}</div>
          </div>
          <div className="bill-doc-meta">
            <div><span className="muted">Date:</span> {fmtDate(doc.docDate)}</div>
            <div><span className="muted">Status:</span> {statusBadge(doc.status, STATUS_TONES)}</div>
          </div>
        </div>
        <div className="bill-doc-party">
          <div className="muted">Bill To</div>
          <b>{lookup(C.parties, doc.partyId, 'name')}</b>
          <div className="muted">{lookup(C.parties, doc.partyId, 'city')}</div>
        </div>
        <table className="bill-items bill-items-print">
          <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Rate</th><th>GST</th><th>Amount</th></tr></thead>
          <tbody>
            {(doc.items ?? []).map((l, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td>{l.description || '—'} <span className={`badge badge-${l.kind === 'product' ? 'primary' : 'info'}`}>{l.kind}</span></td>
                <td>{l.qty}</td>
                <td>{fmtCurrency(l.rate)}</td>
                <td>{l.gst}%</td>
                <td>{fmtCurrency(lineTotal(l) + lineGst(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="bill-totals">
          <div><span className="muted">Sub-total</span><b>{fmtCurrency(t.sub)}</b></div>
          <div><span className="muted">GST</span><b>{fmtCurrency(t.gst)}</b></div>
          <div className="bill-grand"><span>Grand Total</span><b>{fmtCurrency(t.grand)}</b></div>
        </div>
        {doc.notes && <div className="bill-notes"><span className="muted">Notes:</span> {doc.notes}</div>}
        <button className="btn" style={{ marginTop: 14 }} onClick={() => window.print()}>🖨 Print</button>
      </div>
    </div>
  );
}

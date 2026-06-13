import { useRef, useState, useEffect } from 'react';
import { db, genId, type BaseRecord } from '../lib/db';
import { useCollection } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { C, toOptions } from './collections';
import { fmtCurrency, fmtDateTime, lookup, nextCode, todayISO } from '../lib/format';
import './callextras.css';

// ===========================================================================
// Detail panels shown inside a call (installation / PM / breakdown):
//   • Spares Consumed — linked spareConsumption records for THIS call
//   • Attachments — service reports / photos stored on the call record
//   • Customer Signature — captured on a canvas, stored on the call record
// All persist through the same localStorage data layer.
// ===========================================================================

interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  category: string;
  uploadedAt: string;
}

export function CallExtras({ collection, row }: { collection: string; row: BaseRecord }) {
  // Read the live record so attachments/signature updates reflect immediately
  // (the row passed in is the snapshot captured when the drawer opened).
  const live = useCollection(collection).find((r) => r.id === row.id) ?? row;
  return (
    <div className="call-extras">
      <SparesPanel collection={collection} row={live} />
      <AttachmentsPanel collection={collection} row={live} />
      <SignaturePanel collection={collection} row={live} />
    </div>
  );
}

// ---- Spares consumed (linked to this call) -------------------------------
function SparesPanel({ collection, row }: { collection: string; row: BaseRecord }) {
  const consumption = useCollection(C.spareConsumption);
  const parts = useCollection(C.parts);
  const { user } = useAuth();
  const linked = consumption.filter((c) => c.callId === row.id);

  const [partId, setPartId] = useState('');
  const [qty, setQty] = useState(1);
  const [billable, setBillable] = useState(false);

  const add = () => {
    if (!partId) return;
    db.insert(C.spareConsumption, {
      code: nextCode(C.spareConsumption, 'CON'),
      callId: row.id,
      callCollection: collection,
      partId,
      qty,
      engineer: row.engineer ?? '',
      consumeDate: todayISO(),
      billable,
      remarks: '',
      ownerId: user?.id,
    });
    // decrement stock for the part (POC inventory effect)
    const part = parts.find((p) => p.id === partId);
    if (part) db.update(C.parts, partId, { stockQty: Math.max(0, Number(part.stockQty ?? 0) - qty) });
    setPartId('');
    setQty(1);
    setBillable(false);
  };

  const partPrice = (id: unknown) => Number(parts.find((p) => p.id === id)?.unitPrice ?? 0);
  const total = linked.reduce((s, c) => s + partPrice(c.partId) * Number(c.qty ?? 0), 0);

  return (
    <section className="call-panel">
      <div className="call-panel-head">
        <h4>🧾 Spares Consumed <span className="call-count">{linked.length}</span></h4>
        <span className="muted">Linked to {String(row.code ?? 'this call')}</span>
      </div>

      {linked.length > 0 && (
        <table className="call-mini-table">
          <thead><tr><th>Part</th><th>Qty</th><th>Amount</th><th>Billing</th><th></th></tr></thead>
          <tbody>
            {linked.map((c) => (
              <tr key={c.id}>
                <td>{lookup(C.parts, c.partId, 'name')}</td>
                <td>{String(c.qty)}</td>
                <td>{fmtCurrency(partPrice(c.partId) * Number(c.qty ?? 0))}</td>
                <td>{c.billable ? <span className="badge badge-warning">Billable</span> : <span className="badge badge-success">Free</span>}</td>
                <td><button className="btn btn-ghost btn-sm" title="Remove" onClick={() => db.remove(C.spareConsumption, c.id)}>✕</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={2}><b>Total</b></td><td colSpan={3}><b>{fmtCurrency(total)}</b></td></tr></tfoot>
        </table>
      )}

      <div className="call-add-row">
        <select className="select" value={partId} onChange={(e) => setPartId(e.target.value)}>
          <option value="">— Select spare part —</option>
          {parts.map((p) => (
            <option key={p.id} value={p.id}>{String(p.code)} · {String(p.name)} (stock {String(p.stockQty ?? 0)})</option>
          ))}
        </select>
        <input className="input call-qty" type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
        <label className="call-billable"><input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} /> Billable</label>
        <button className="btn btn-primary btn-sm" onClick={add} disabled={!partId}>+ Add</button>
      </div>
    </section>
  );
}

// ---- Attachments (reports / photos) --------------------------------------
function AttachmentsPanel({ collection, row }: { collection: string; row: BaseRecord }) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState('Service Report');
  const attachments = (row.attachments as Attachment[]) ?? [];

  const onPick = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 4 * 1024 * 1024) {
      alert('File too large for this POC store (max ~4 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const att: Attachment = {
        id: genId(),
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: String(reader.result),
        category,
        uploadedAt: new Date().toISOString(),
      };
      db.update(collection, row.id, { attachments: [...attachments, att], ownerId: row.ownerId ?? user?.id });
      if (fileRef.current) fileRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const remove = (id: string) =>
    db.update(collection, row.id, { attachments: attachments.filter((a) => a.id !== id) });

  const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

  return (
    <section className="call-panel">
      <div className="call-panel-head">
        <h4>📎 Attachments / Reports <span className="call-count">{attachments.length}</span></h4>
      </div>

      {attachments.length > 0 && (
        <div className="att-grid">
          {attachments.map((a) => (
            <div className="att-card" key={a.id}>
              {a.type.startsWith('image/') ? (
                <a href={a.dataUrl} download={a.name} title={a.name}>
                  <img src={a.dataUrl} alt={a.name} className="att-thumb" />
                </a>
              ) : (
                <div className="att-file">📄</div>
              )}
              <div className="att-meta">
                <a href={a.dataUrl} download={a.name} className="att-name" title={a.name}>{a.name}</a>
                <div className="muted att-sub">
                  <span className="badge badge-neutral">{a.category}</span> {kb(a.size)}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm att-del" onClick={() => remove(a.id)} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="call-add-row">
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
          {toOptions(['Service Report', 'Field Failure Report', 'Test Certificate', 'Photo', 'Delivery Note', 'Other']).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input ref={fileRef} type="file" className="input att-input" onChange={(e) => onPick(e.target.files)} />
      </div>
      <div className="field-help">Stored with the call record. Images preview; any file can be downloaded.</div>
    </section>
  );
}

// ---- Customer signature (canvas capture) ---------------------------------
interface Signature {
  dataUrl: string;
  signedBy: string;
  signedAt: string;
}

function SignaturePanel({ collection, row }: { collection: string; row: BaseRecord }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signedBy, setSignedBy] = useState('');
  const [dirty, setDirty] = useState(false);
  const existing = row.signature as Signature | undefined;

  // prepare canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
  }, [existing]);

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDirty(true);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
  };

  const save = () => {
    const dataUrl = canvasRef.current!.toDataURL('image/png');
    db.update(collection, row.id, {
      signature: { dataUrl, signedBy: signedBy.trim() || 'Customer', signedAt: new Date().toISOString() },
    });
    setDirty(false);
  };

  const removeSig = () => db.update(collection, row.id, { signature: undefined });

  return (
    <section className="call-panel">
      <div className="call-panel-head">
        <h4>✍️ Customer Signature</h4>
        {existing && <span className="badge badge-success">Signed</span>}
      </div>

      {existing ? (
        <div className="sig-saved">
          <img src={existing.dataUrl} alt="signature" className="sig-image" />
          <div className="sig-info">
            <div><b>{existing.signedBy}</b></div>
            <div className="muted">{fmtDateTime(existing.signedAt)}</div>
            <button className="btn btn-sm" onClick={removeSig}>Re-capture</button>
          </div>
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            width={460}
            height={150}
            className="sig-canvas"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
          <div className="call-add-row">
            <input className="input" placeholder="Signed by (customer name)" value={signedBy} onChange={(e) => setSignedBy(e.target.value)} />
            <button className="btn btn-sm" onClick={clear} disabled={!dirty}>Clear</button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={!dirty}>Save Signature</button>
          </div>
          <div className="field-help">Sign with finger (touch) or mouse, then Save.</div>
        </>
      )}
    </section>
  );
}

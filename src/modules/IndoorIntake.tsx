// ===========================================================================
// STAGE 1 -- INTAKE (0323, the user, 2026-10-02).
//
// "Receive equipment" opens THIS form, not a blank job. Two ways in:
//
//   FROM A CALL -- pick the PRODUCT and the SERIAL, which lists the machine's
//   OPEN calls (openCallsFor, the lookup Pending Registrations uses), or type
//   the UCN. Once the UCN is chosen the job fills from the call: UC No, the
//   customer and their city, the engineer the call is ALLOTTED to now, the
//   product and serial, the complaint (Problem Reported <- Complaint Reported)
//   and, read-only, the call's Standard Complaint; the Status (cover) is the
//   MACHINE'S cover now, from the Product Database (coverCode), else the one
//   the call recorded. Every filled value stays editable.
//
//   A DEMO / NEW DEVICE -- no call: product, serial and what is being done.
//
// Then the RECEIVED ACCESSORIES, as an add-item list: item + quantity (and its
// serial / tag where it has one). Filing creates the job (indoor.receive) and
// its accessory lines; the job number is the database's.
// ===========================================================================
import { useEffect, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import {
  addIndoorJob, addIndoorAccessory, callByUcn, openCallsFor, sbListProductNames, sbSearchMachines,
  sbProductBySerial, INDOOR_ACTIVITIES, type OpenCall,
} from '../lib/supabase';
import { coverCode } from '../lib/fieldcall';
import { formatDay } from '../lib/dates';
import { logAudit } from '../lib/audit';

interface AccLine { name: string; qty: string; serial: string; tag: string }
const EMPTY_ACC: AccLine = { name: '', qty: '1', serial: '', tag: '' };

interface Filled {
  ucn: string; party_name: string; customer_place: string; engineer_name: string;
  product_name: string; serial: string; problem_reported: string; standard_complaint: string; cover: string;
}
const EMPTY: Filled = {
  ucn: '', party_name: '', customer_place: '', engineer_name: '', product_name: '', serial: '',
  problem_reported: '', standard_complaint: '', cover: '',
};

export function IndoorIntake({ onFiled, onCancel }: {
  onFiled: (id: number, jobNo: string) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<'call' | 'demo'>('call');
  const [products, setProducts] = useState<string[]>([]);
  const [product, setProduct] = useState('');
  const [serial, setSerial] = useState('');
  const [open, setOpen] = useState<OpenCall[] | null>(null);
  const [typedUcn, setTypedUcn] = useState('');
  const [f, setF] = useState<Filled>(EMPTY);
  const [activity, setActivity] = useState('Repair');
  const [tag, setTag] = useState('');
  const [condition, setCondition] = useState('');
  const [acc, setAcc] = useState<AccLine[]>([{ ...EMPTY_ACC }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (p: Partial<Filled>) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    let live = true;
    sbListProductNames().then((p) => { if (live) setProducts(p.map((x) => x.name)); }).catch(() => { /* typed instead */ });
    return () => { live = false; };
  }, []);

  // THE MACHINE'S OPEN CALLS, once product and serial are both chosen.
  useEffect(() => {
    if (mode !== 'call' || !product.trim() || !serial.trim()) { setOpen(null); return; }
    let live = true;
    openCallsFor([{ product, serial }])
      .then((c) => { if (live) setOpen(c); })
      .catch((e) => { if (live) { setOpen([]); setErr(`Could not read the open calls: ${e instanceof Error ? e.message : String(e)}`); } });
    return () => { live = false; };
  }, [mode, product, serial]);

  // FILL FROM THE CALL. The cover is the machine's NOW (Product Database),
  // else what the call recorded; nothing is guessed.
  const pickUcn = async (ucn: string) => {
    const u = ucn.trim();
    if (!u) return;
    setErr('');
    const c = await callByUcn(u).catch(() => null);
    if (!c) { setErr(`Call ${u} was not found, or you cannot view it.`); return; }
    const g = (k: string) => String(c[k] ?? '').trim();
    const m = await sbProductBySerial(g('serial'), g('productName')).catch(() => null);
    set({
      ucn: g('ucn') || u, party_name: g('partyName'), customer_place: g('city'), engineer_name: g('allocatedTo'),
      product_name: g('productName'), serial: g('serial'), problem_reported: g('complaintReported'),
      standard_complaint: g('standardComplaint'),
      cover: coverCode(m ? m['Item Status'] : '') || coverCode(g('itemStatus')),
    });
  };

  const file = async () => {
    if (mode === 'call' && !f.ucn.trim()) { setErr('Choose the call (UCN) the unit came in on — or receive it as a DEMO / new device.'); return; }
    if (!f.product_name.trim() && !(mode === 'demo' && product.trim())) { setErr('Name the product.'); return; }
    const lines = acc.filter((a) => a.name.trim() || a.serial.trim());
    const bad = lines.find((a) => !(Number(a.qty) > 0));
    if (bad) { setErr(`Quantity must be more than 0 (${bad.name || bad.serial}).`); return; }
    setBusy(true); setErr('');
    const job = mode === 'call'
      ? { kind: 'Customer property', activity, status: 'Received', ...f, ucn: f.ucn.trim(), tag_no: tag, condition_on_arrival: condition }
      : { kind: 'DEMO unit', activity, status: 'Received', ucn: null, product_name: product.trim() || f.product_name,
          serial: serial.trim() || f.serial, party_name: null, engineer_name: 'Indoor Service',
          problem_reported: f.problem_reported, tag_no: tag, condition_on_arrival: condition };
    const r = await addIndoorJob(job as never);
    if (!r.ok || !r.id) { setBusy(false); setErr(r.error ?? 'Could not file the intake'); return; }
    for (const a of lines) {
      const x = await addIndoorAccessory(r.id, { name: a.name.trim(), qty: Number(a.qty), serial: a.serial.trim(), tag_no: a.tag.trim() });
      if (!x.ok) { setBusy(false); setErr(`Filed as ${r.job_no}, but an accessory was not: ${x.error} — add it on the job.`); onFiled(r.id, r.job_no ?? ''); return; }
    }
    setBusy(false);
    logAudit({ action: 'indoor.receive', target: r.job_no ?? '', meta: { ucn: f.ucn || null, accessories: lines.length } });
    onFiled(r.id, r.job_no ?? '');
  };

  return (
    <div className="ind-drawer">
      {err ? <div className="ind-warn">{err}</div> : null}
      <div className="ind-filters">
        <label className="ind-toggle"><input type="radio" checked={mode === 'call'} onChange={() => { setMode('call'); setF(EMPTY); }} /> From a call</label>
        <label className="ind-toggle"><input type="radio" checked={mode === 'demo'} onChange={() => { setMode('demo'); setF(EMPTY); setActivity('Demo'); }} /> DEMO / new device (no call)</label>
      </div>

      <div className="ind-grid">
        <label className="ind-field"><span className="ind-label">Product Name</span>
          <SelectPicker value={product} onChange={(v) => { setProduct(v); setSerial(''); }} options={products}
            allowFreeText={mode === 'demo'} placeholder="— pick the product —" /></label>
        <label className="ind-field"><span className="ind-label">Serial Number</span>
          {mode === 'call' ? (
            <SelectPicker value={serial} onChange={setSerial} options={serial ? [serial] : []} disabled={!product}
              onSearch={(q) => sbSearchMachines(product, q, 50).then((h) => h.map((x) => x.serial))}
              placeholder={product ? '— type to find the serial —' : 'pick the product first'} />
          ) : (
            <input className="mono" value={serial} onChange={(e) => setSerial(e.target.value)} />
          )}</label>
      </div>

      {mode === 'call' ? (
        <>
          {open !== null ? (
            <div className="table-wrap">
              <table className="table ind-child">
                <thead><tr><th /><th>UCN</th><th>Call type</th><th>Customer</th><th>Allotted to</th><th>Registered</th><th>Complaint</th></tr></thead>
                <tbody>
                  {open.map((c) => (
                    <tr key={c.ucn} className="row-click" onClick={() => void pickUcn(c.ucn)}>
                      <td><input type="radio" readOnly checked={f.ucn === c.ucn} /></td>
                      <td className="mono">{c.ucn}</td><td>{c.callType}</td><td>{c.partyName}</td>
                      <td>{c.allocatedTo}</td><td>{formatDay(c.regDate)}</td><td>{c.complaint}</td>
                    </tr>
                  ))}
                  {open.length === 0 ? <tr><td colSpan={7} className="ind-empty">No open call on this machine — type the UCN below, or receive it as a DEMO / new device.</td></tr> : null}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="ind-grid">
            <label className="ind-field"><span className="ind-label">…or type the UCN</span>
              <input className="mono" value={typedUcn} onChange={(e) => setTypedUcn(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void pickUcn(typedUcn); }} /></label>
            <div className="ind-field"><span className="ind-label">&nbsp;</span>
              <button className="btn" disabled={!typedUcn.trim()} onClick={() => void pickUcn(typedUcn)}>Fill from this call</button></div>
          </div>

          {f.ucn ? (
            <>
              <h4 className="ind-sub">From call {f.ucn} — edit anything that is wrong</h4>
              <div className="ind-grid">
                <label className="ind-field"><span className="ind-label">UC No</span><input className="mono" value={f.ucn} disabled /></label>
                <label className="ind-field"><span className="ind-label">Customer Name</span><input value={f.party_name} onChange={(e) => set({ party_name: e.target.value })} /></label>
                <label className="ind-field"><span className="ind-label">Customer Place</span><input value={f.customer_place} onChange={(e) => set({ customer_place: e.target.value })} /></label>
                <label className="ind-field"><span className="ind-label">Engineer Name</span><input value={f.engineer_name} onChange={(e) => set({ engineer_name: e.target.value })} />
                  <span className="ind-hint">The engineer the call is allotted to now.</span></label>
                <label className="ind-field"><span className="ind-label">Product Name</span><input value={f.product_name} onChange={(e) => set({ product_name: e.target.value })} /></label>
                <label className="ind-field"><span className="ind-label">Product Sl. No</span><input className="mono" value={f.serial} onChange={(e) => set({ serial: e.target.value })} /></label>
                <label className="ind-field"><span className="ind-label">Status (cover)</span><input value={f.cover} onChange={(e) => set({ cover: e.target.value })} />
                  <span className="ind-hint">The machine’s item status now — WGP / OGP / CMC / AMC.</span></label>
                {f.standard_complaint ? (
                  <label className="ind-field"><span className="ind-label">Standard Complaint</span><input value={f.standard_complaint} disabled />
                    <span className="ind-hint">As the call records it.</span></label>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      <div className="ind-grid">
        <label className="ind-field"><span className="ind-label">What is being done to it?</span>
          <SelectPicker value={activity} onChange={setActivity} options={[...INDOOR_ACTIVITIES]} /></label>
        <label className="ind-field"><span className="ind-label">Identification tag (4.5.4)</span>
          <input className="mono" value={tag} onChange={(e) => setTag(e.target.value)} /></label>
      </div>
      {mode === 'demo' || f.ucn ? (
        <label className="ind-field"><span className="ind-label">Problem Reported</span>
          <textarea rows={2} value={f.problem_reported} onChange={(e) => set({ problem_reported: e.target.value })} /></label>
      ) : null}
      <label className="ind-field"><span className="ind-label">Condition on arrival</span>
        <textarea rows={2} value={condition} onChange={(e) => setCondition(e.target.value)} /></label>

      <h4 className="ind-sub">Accessories received</h4>
      <table className="table ind-child">
        <thead><tr><th>Item</th><th>Qty</th><th>Serial</th><th>Tag</th><th /></tr></thead>
        <tbody>
          {acc.map((a, i) => (
            <tr key={i}>
              <td><input value={a.name} onChange={(e) => setAcc((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} /></td>
              <td><input type="number" min={1} step="any" style={{ width: 70 }} value={a.qty}
                onChange={(e) => setAcc((x) => x.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)))} /></td>
              <td><input className="mono" value={a.serial} onChange={(e) => setAcc((x) => x.map((y, j) => (j === i ? { ...y, serial: e.target.value } : y)))} /></td>
              <td><input className="mono" value={a.tag} onChange={(e) => setAcc((x) => x.map((y, j) => (j === i ? { ...y, tag: e.target.value } : y)))} /></td>
              <td><button className="btn-link" onClick={() => setAcc((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [{ ...EMPTY_ACC }]))}>remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn" onClick={() => setAcc((x) => [...x, { ...EMPTY_ACC }])}>＋ Add an item</button>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={() => void file()} disabled={busy}>{busy ? 'Filing…' : 'Receive the equipment'}</button>
      </div>
    </div>
  );
}

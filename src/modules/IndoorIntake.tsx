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
import { INDOOR_TAG_OPTIONS, INTAKE_MODES, FIELD_RETURN_ACTIVITY, type IntakeMode } from '../lib/indoorforms';

// No serial (the user, 2026-10-04: "Remove Serial from Accessory Received");
// the tag is the Yes / No pick.
interface AccLine { name: string; qty: string; tag: string }
const EMPTY_ACC: AccLine = { name: '', qty: '1', tag: '' };

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
  const [mode, setMode] = useState<IntakeMode>('call');
  // The two ways in with no call share the device form (0374).
  const noCall = mode !== 'call';
  const [products, setProducts] = useState<string[]>([]);
  const [product, setProduct] = useState('');
  const [serial, setSerial] = useState('');
  const [open, setOpen] = useState<OpenCall[] | null>(null);
  const [typedUcn, setTypedUcn] = useState('');
  const [f, setF] = useState<Filled>(EMPTY);
  const [activity, setActivity] = useState<string>(FIELD_RETURN_ACTIVITY);
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
    if (mode === 'call' && !f.ucn.trim()) { setErr('Choose the call (UCN) the unit came in on — or receive it as a Demo or a New Device.'); return; }
    if (!f.product_name.trim() && !(noCall && product.trim())) { setErr('Name the product.'); return; }
    const lines = acc.filter((a) => a.name.trim());
    const bad = lines.find((a) => !(Number(a.qty) > 0));
    if (bad) { setErr(`Quantity must be more than 0 (${bad.name}).`); return; }
    setBusy(true); setErr('');
    const job = mode === 'call'
      ? { kind: 'Customer property', activity: FIELD_RETURN_ACTIVITY, status: 'Received', ...f, ucn: f.ucn.trim(), tag_no: tag, condition_on_arrival: condition }
      : { kind: INTAKE_MODES[mode].kind, activity: INTAKE_MODES[mode].activity, status: 'Received', ucn: null, product_name: product.trim() || f.product_name,
          serial: serial.trim() || f.serial, party_name: null, engineer_name: 'Indoor Service',
          problem_reported: f.problem_reported, tag_no: tag, condition_on_arrival: condition };
    const r = await addIndoorJob(job as never);
    if (!r.ok || !r.id) { setBusy(false); setErr(r.error ?? 'Could not file the intake'); return; }
    for (const a of lines) {
      const x = await addIndoorAccessory(r.id, { name: a.name.trim(), qty: Number(a.qty), tag_no: a.tag.trim() });
      if (!x.ok) { setBusy(false); setErr(`Filed as ${r.job_no}, but an accessory was not: ${x.error} — add it on the job.`); onFiled(r.id, r.job_no ?? ''); return; }
    }
    setBusy(false);
    logAudit({ action: 'indoor.receive', target: r.job_no ?? '', meta: { ucn: f.ucn || null, accessories: lines.length } });
    onFiled(r.id, r.job_no ?? '');
  };

  const setLine = (i: number, p: Partial<AccLine>) => setAcc((x) => x.map((y, j) => (j === i ? { ...y, ...p } : y)));

  return (
    <div className="ind-form">
      {err ? <div className="ind-warn" role="alert">{err}</div> : null}

      <div className="ind-seg" role="radiogroup" aria-label="How the unit came in">
        {(Object.keys(INTAKE_MODES) as IntakeMode[]).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'is-on' : ''}
            onClick={() => { setMode(m); setF(EMPTY); setActivity(INTAKE_MODES[m].activity); }}>{INTAKE_MODES[m].label}</button>
        ))}
      </div>

      <section className="ind-group">
        <div className="ind-group-head"><h4 className="ind-eyebrow">{mode === 'call' ? 'Find the machine' : 'The device'}</h4></div>
        <div className="ind-grid">
          <label className="ind-field"><span className="ind-label">Product Name</span>
            <SelectPicker value={product} onChange={(v) => { setProduct(v); setSerial(''); }} options={products}
              allowFreeText={noCall} placeholder="Pick the product" /></label>
          <label className="ind-field"><span className="ind-label">Serial Number</span>
            {mode === 'call' ? (
              <SelectPicker value={serial} onChange={setSerial} options={serial ? [serial] : []} disabled={!product}
                onSearch={(q) => sbSearchMachines(product, q, 50).then((h) => h.map((x) => x.serial))}
                placeholder={product ? 'Type to find the serial' : 'Pick the product first'} />
            ) : (
              <input className="mono" value={serial} onChange={(e) => setSerial(e.target.value)} />
            )}</label>
        </div>

        {mode === 'call' ? (
          <>
            {open !== null ? (
              <div className="ind-calls" role="radiogroup" aria-label="Open calls on this machine">
                <div className="ind-calls-head">Open calls on this machine</div>
                {open.map((c) => (
                  <button type="button" key={c.ucn} role="radio" aria-checked={f.ucn === c.ucn}
                    className={`ind-call${f.ucn === c.ucn ? ' is-on' : ''}`} onClick={() => void pickUcn(c.ucn)}>
                    <span className="ind-call-radio" aria-hidden="true" />
                    <span className="ind-call-main">
                      <span className="ind-call-top"><b className="mono">{c.ucn}</b><span>{c.callType}</span><span>{formatDay(c.regDate)}</span></span>
                      <span className="ind-call-sub">{[c.partyName, c.allocatedTo, c.complaint].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                ))}
                {open.length === 0 ? <div className="ind-rows-empty">No open call on this machine — type the UCN, or receive it as a demo / new device.</div> : null}
              </div>
            ) : null}
            <div className="ind-ucnrow">
              <span className="ind-label">or type the UCN</span>
              <input className="mono" value={typedUcn} aria-label="UCN" placeholder="e.g. 26H11F0014"
                onChange={(e) => setTypedUcn(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void pickUcn(typedUcn); }} />
              <button type="button" className="btn btn-ghost btn-sm" disabled={!typedUcn.trim()} onClick={() => void pickUcn(typedUcn)}>Fill from this call</button>
            </div>
          </>
        ) : null}
      </section>

      {mode === 'call' && f.ucn ? (
        <section className="ind-group">
          <div className="ind-group-head"><h4 className="ind-eyebrow">From call {f.ucn}</h4>
            <div className="ind-group-aside"><span className="ind-meta">Edit anything that is wrong</span></div></div>
          <div className="ind-grid">
            <div className="ind-field"><span className="ind-label">UC No</span><span className="ind-value mono">{f.ucn}</span></div>
            {f.standard_complaint ? (
              <div className="ind-field" title="As the call records it."><span className="ind-label">Standard Complaint</span><span className="ind-value">{f.standard_complaint}</span></div>
            ) : <span />}
            <label className="ind-field"><span className="ind-label">Customer Name</span><input value={f.party_name} onChange={(e) => set({ party_name: e.target.value })} /></label>
            <label className="ind-field"><span className="ind-label">Customer Place</span><input value={f.customer_place} onChange={(e) => set({ customer_place: e.target.value })} /></label>
            <label className="ind-field" title="The engineer the call is allotted to now."><span className="ind-label">Engineer Name</span><input value={f.engineer_name} onChange={(e) => set({ engineer_name: e.target.value })} /></label>
            <label className="ind-field" title="The machine’s item status now — WGP / OGP / CMC / AMC."><span className="ind-label">Status (cover)</span><input value={f.cover} onChange={(e) => set({ cover: e.target.value })} /></label>
            <label className="ind-field"><span className="ind-label">Product Name</span><input value={f.product_name} onChange={(e) => set({ product_name: e.target.value })} /></label>
            <label className="ind-field"><span className="ind-label">Product Sl. No</span><input className="mono" value={f.serial} onChange={(e) => set({ serial: e.target.value })} /></label>
          </div>
        </section>
      ) : null}

      <section className="ind-group">
        <div className="ind-group-head"><h4 className="ind-eyebrow">The job</h4></div>
        <div className="ind-grid">
          <label className="ind-field"><span className="ind-label">What is being done to it?</span>
            {/* FIXED BY THE WAY IN (the user, 2026-10-04): Field Return and New
                Device are Troubleshooting, Demo is Demo. */}
            <SelectPicker value={INTAKE_MODES[mode].activity} onChange={() => { /* fixed */ }} options={[INTAKE_MODES[mode].activity]} disabled /></label>
          <label className="ind-field"><span className="ind-label">Identification tag (4.5.4)</span>
            <SelectPicker value={tag} onChange={setTag} options={[...INDOOR_TAG_OPTIONS]} placeholder="Choose…" /></label>
          {noCall || f.ucn ? (
            <label className="ind-field is-wide"><span className="ind-label">Problem Reported</span>
              <textarea rows={2} value={f.problem_reported} onChange={(e) => set({ problem_reported: e.target.value })} /></label>
          ) : null}
          <label className="ind-field is-wide"><span className="ind-label">Condition on arrival</span>
            <textarea rows={2} value={condition} onChange={(e) => setCondition(e.target.value)} /></label>
        </div>
      </section>

      <section className="ind-group">
        <div className="ind-group-head"><h4 className="ind-eyebrow">Accessories received</h4></div>
        <div className="ind-rows" role="table" aria-label="Accessories received">
          <div className="ind-rows-head" role="row">
            <span role="columnheader">Item</span><span role="columnheader">Qty</span>
            <span role="columnheader">Tag</span><span />
          </div>
          {acc.map((a, i) => (
            <div className="ind-rows-row" role="row" key={i}>
              <input aria-label="Item" placeholder="Item" value={a.name} onChange={(e) => setLine(i, { name: e.target.value })} />
              <input aria-label="Quantity" type="number" min={1} step="any" value={a.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
              <SelectPicker value={a.tag} onChange={(v) => setLine(i, { tag: v })} options={[...INDOOR_TAG_OPTIONS]} placeholder="Tag…" />
              <button type="button" className="ind-x" aria-label={`Remove ${a.name || 'item'}`} title="Remove"
                onClick={() => setAcc((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [{ ...EMPTY_ACC }]))}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="ind-add" onClick={() => setAcc((x) => [...x, { ...EMPTY_ACC }])}>+ Add item</button>
      </section>

      <nav className="ind-pager">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <div className="ind-pager-end">
          <button type="button" className="btn btn-primary" onClick={() => void file()} disabled={busy}>{busy ? 'Filing…' : 'Receive the equipment'}</button>
        </div>
      </nav>
    </div>
  );
}

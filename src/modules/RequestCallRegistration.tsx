import { useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { addCallRequestBatch, sbPartyInfo, supabaseConfigured } from '../lib/supabase';
import { listPartyItems } from '../lib/sheets';
import { useAuth } from '../lib/auth';
import { useMaster } from '../lib/masters';
import { todayISO } from '../lib/format';
import { logAudit } from '../lib/audit';
import './fieldcalls.css';

// ===========================================================================
// REQUEST CALL REGISTRATION → Supabase `call_requests`. Adapts to call type
// (Installation vs Other). Up to 5 Product/Serial pairs per request — each pair
// becomes its own row sharing the REQID (UniqueID = REQID-Product-SerialNo).
// ===========================================================================

const MAX_PRODUCTS = 5;
const blank = {
  callType: 'FIELD', partyName: '', state: '', city: '', address: '',
  customerContactDetails: '', customerContactNumber: '',
  standardComplaint: '', reportedProblem: '', installationReport: '', kyc: '',
  callAttended: '', attendedDate: '', planDate: '', additionalComments: '',
};
type Form = typeof blank;
type Pair = { product: string; serial: string };

export function RequestCallRegistration() {
  const { user } = useAuth();
  const callTypeMaster = useMaster('calltype', ['FIELD', 'INSTALLATION CALL']);
  const partyMaster = useMaster('party');
  const complaintMaster = useMaster('complaint');
  const productMaster = useMaster('product');

  const [f, setF] = useState<Form>(blank);
  const [products, setProducts] = useState<Pair[]>([{ product: '', serial: '' }]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to submit requests.' },
  );
  const set = (k: keyof Form, v: string) => setF((c) => ({ ...c, [k]: v }));
  const isInstall = /install/i.test(f.callType);
  const attended = /^yes$/i.test(f.callAttended);

  useEffect(() => {
    if (isInstall) setF((c) => ({ ...c, standardComplaint: 'INSTALLATION CALL', reportedProblem: c.reportedProblem || 'INSTALLATION CALL' }));
  }, [isInstall]);

  const fillParty = async (party: string) => {
    if (!party.trim() || !supabaseConfigured()) return;
    const info = await sbPartyInfo(party).catch(() => null);
    if (info) setF((c) => ({ ...c, state: info.state || c.state, city: info.city || c.city, address: info.address || c.address }));
  };

  // For non-installation calls, the products + serials are filtered by the party.
  const [partyItems, setPartyItems] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    if (isInstall || !f.partyName.trim()) { setPartyItems([]); return; }
    listPartyItems(f.partyName).then(setPartyItems).catch(() => setPartyItems([]));
  }, [isInstall, f.partyName]);

  const productOptions = useMemo(
    () => (isInstall ? productMaster.values : [...new Set(partyItems.map((r) => String(r['Item Name'] ?? '')).filter(Boolean))]),
    [isInstall, productMaster.values, partyItems],
  );
  const serialsFor = (product: string) => (isInstall ? [] : partyItems.filter((r) => String(r['Item Name'] ?? '') === product).map((r) => String(r['Item Serial Number'] ?? '')).filter(Boolean));

  const setPair = (i: number, k: keyof Pair, v: string) => setProducts((s) => s.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const addPair = () => setProducts((s) => (s.length < MAX_PRODUCTS ? [...s, { product: '', serial: '' }] : s));
  const removePair = (i: number) => setProducts((s) => (s.length > 1 ? s.filter((_, j) => j !== i) : s));

  const validate = (): string => {
    if (!f.callType) return 'Choose a Call Type.';
    if (!f.partyName.trim()) return 'Enter the Party Name.';
    if (!products.some((p) => p.product.trim())) return 'Add at least one Product.';
    if (attended && !f.attendedDate) return 'Attended Date is required when Call Attended? = Yes.';
    return '';
  };

  const submit = async () => {
    const v = validate();
    if (v) { setMsg({ tone: 'error', text: v }); return; }
    setBusy(true); setMsg({ tone: 'info', text: 'Submitting request…' });
    const base: Record<string, unknown> = {
      email: user?.email ?? '', engineer: user?.fullName ?? '', call_type: f.callType,
      party_name: f.partyName, state: f.state, city: f.city, address: f.address,
      customer_contact_details: f.customerContactDetails, customer_contact_number: f.customerContactNumber,
      standard_complaint: f.standardComplaint, reported_problem: f.reportedProblem,
      installation_report: isInstall ? f.installationReport : '', kyc: isInstall ? f.kyc : '',
      call_attended: f.callAttended, attended_date: f.attendedDate || null, plan_date: f.planDate || null,
      additional_comments: f.additionalComments,
    };
    const pairs = products.filter((p) => p.product.trim());
    const t0 = performance.now();
    try {
      const res = await addCallRequestBatch(base, pairs);
      logAudit({ action: 'request.create', target: res.reqid ?? '', status: res.ok && !res.error ? 'ok' : 'error', error: res.error, duration_ms: Math.round(performance.now() - t0), meta: { products: pairs.length, callType: f.callType } });
      if (res.ok) {
        setMsg({ tone: res.error ? 'error' : 'ok', text: res.error ?? `Request ${res.reqid} submitted — ${res.count} product${res.count === 1 ? '' : 's'}. Now in Pending Registrations.` });
        if (!res.error) { setF(blank); setProducts([{ product: '', serial: '' }]); }
      } else setMsg({ tone: 'error', text: `Submit failed: ${res.error}` });
    } catch (e) {
      setMsg({ tone: 'error', text: `Submit failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  const field = (label: string, node: React.ReactNode, span2 = false) => (
    <label className={`rep-field ${span2 ? 'rep-span2' : ''}`}><span className="field-label">{label}</span>{node}</label>
  );

  return (
    <div>
      <PageHeader title="Request Call Registration" subtitle="Raise a call registration request. REQID is assigned automatically." icon="📝" />
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <SectionCard title="New Request">
        <div className="rep-form">
          <section className="rep-sec">
            <div className="rep-grid">
              {field('Call Type *', (
                <select className="select" value={f.callType} onChange={(e) => set('callType', e.target.value)}>
                  {callTypeMaster.values.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ))}
              {field('Submitted by', <input className="input" value={user?.email ?? ''} readOnly />)}
              {field('Engineer', <input className="input" value={user?.fullName ?? ''} readOnly />)}
            </div>
          </section>

          <section className="rep-sec">
            <div className="rep-sec-title">Customer</div>
            <div className="rep-grid">
              {field('Party Name *', (
                <>
                  <input className="input" list="dl-party" value={f.partyName}
                    onChange={(e) => set('partyName', e.target.value)} onBlur={() => void fillParty(f.partyName)}
                    placeholder={isInstall ? 'Existing customer or type a new one' : 'Pick from Party Master'} />
                  <datalist id="dl-party">{partyMaster.values.slice(0, 8000).map((v) => <option key={v} value={v} />)}</datalist>
                </>
              ), true)}
              {field('State', <input className="input" value={f.state} onChange={(e) => set('state', e.target.value)} />)}
              {field('City', <input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} />)}
              {field('Address', <textarea className="input" rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} />, true)}
              {field('Customer Contact Details', <textarea className="input" rows={2} value={f.customerContactDetails} onChange={(e) => set('customerContactDetails', e.target.value)} />)}
              {field('Customer Contact Number', <input className="input" value={f.customerContactNumber} onChange={(e) => set('customerContactNumber', e.target.value)} />)}
            </div>
          </section>

          <section className="rep-sec">
            <div className="rep-sec-title">Products <span className="muted">(up to {MAX_PRODUCTS} — each becomes its own UniqueID)</span></div>
            <datalist id="dl-product">{productOptions.slice(0, 8000).map((v) => <option key={v} value={v} />)}</datalist>
            {products.map((p, i) => (
              <div className="spare-row" key={i}>
                <input className="input spare-part" list="dl-product" placeholder={`Product ${i + 1}${isInstall ? ' (Product Master)' : ' (filtered by party)'}`} value={p.product} onChange={(e) => setPair(i, 'product', e.target.value)} />
                {isInstall ? (
                  <input className="input spare-part" placeholder="Serial (free text)" value={p.serial} onChange={(e) => setPair(i, 'serial', e.target.value)} />
                ) : (
                  <>
                    <input className="input spare-part" list={`dl-serial-${i}`} placeholder="Serial (filtered)" value={p.serial} onChange={(e) => setPair(i, 'serial', e.target.value)} />
                    <datalist id={`dl-serial-${i}`}>{serialsFor(p.product).slice(0, 2000).map((v) => <option key={v} value={v} />)}</datalist>
                  </>
                )}
                <button className="btn btn-ghost btn-sm" title="Remove" onClick={() => removePair(i)} disabled={products.length === 1}>✕</button>
              </div>
            ))}
            {products.length < MAX_PRODUCTS && <button className="btn btn-sm" onClick={addPair}>＋ Add product</button>}
          </section>

          <section className="rep-sec">
            <div className="rep-sec-title">Complaint</div>
            <div className="rep-grid">
              {field('Standard Complaint', (
                isInstall
                  ? <input className="input" value={f.standardComplaint} readOnly />
                  : <>
                    <input className="input" list="dl-complaint" value={f.standardComplaint} onChange={(e) => set('standardComplaint', e.target.value)} />
                    <datalist id="dl-complaint">{complaintMaster.values.slice(0, 5000).map((v) => <option key={v} value={v} />)}</datalist>
                  </>
              ))}
              {field('Reported Problem', (
                isInstall
                  ? <input className="input" value={f.reportedProblem} onChange={(e) => set('reportedProblem', e.target.value)} />
                  : <textarea className="input" rows={2} value={f.reportedProblem} onChange={(e) => set('reportedProblem', e.target.value)} />
              ), true)}
              {isInstall && field('Installation Report (if available)', <input className="input" value={f.installationReport} onChange={(e) => set('installationReport', e.target.value)} placeholder="Optional — link/notes" />, true)}
              {isInstall && field('KYC', <input className="input" value={f.kyc} onChange={(e) => set('kyc', e.target.value)} placeholder="Optional" />, true)}
            </div>
          </section>

          <section className="rep-sec">
            <div className="rep-sec-title">Visit</div>
            <div className="rep-grid">
              {field('Call Attended?', (
                <select className="select" value={f.callAttended} onChange={(e) => set('callAttended', e.target.value)}>
                  <option value="">—</option><option value="Yes">Yes</option><option value="No">No</option>
                </select>
              ))}
              {attended && field('Attended Date *', <input type="date" className="input" value={f.attendedDate} onChange={(e) => set('attendedDate', e.target.value)} />)}
              {!attended && field('Planned Visit Date', <input type="date" className="input" value={f.planDate || todayISO()} onChange={(e) => set('planDate', e.target.value)} />)}
              {field('Additional Comments', <textarea className="input" rows={2} value={f.additionalComments} onChange={(e) => set('additionalComments', e.target.value)} />, true)}
            </div>
          </section>

          <div className="rep-actions">
            <button className="btn" onClick={() => { setF(blank); setProducts([{ product: '', serial: '' }]); }} disabled={busy}>Clear</button>
            <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || !supabaseConfigured()}>{busy ? 'Submitting…' : 'Submit Request'}</button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

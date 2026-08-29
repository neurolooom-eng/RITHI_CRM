import { useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { addCallRequest, sbPartyInfo, supabaseConfigured } from '../lib/supabase';
import { listPartyProducts, listPartyItems } from '../lib/sheets';
import { useAuth } from '../lib/auth';
import { useMaster } from '../lib/masters';
import { todayISO } from '../lib/format';
import './fieldcalls.css';

// ===========================================================================
// REQUEST CALL REGISTRATION → Supabase `call_requests`. The form adapts to the
// call type (Installation Call vs everything else) per the field spec:
//   • REQID (R20000…) + UniqueID (REQID-Product-SerialNo) assigned server-side.
//   • Installation: Party free-type, Product from Product Master, Serial free
//     text, Standard Complaint / Reported Problem auto = "INSTALLATION CALL",
//     Installation Report + KYC optional.
//   • Other: Party/Product/Serial cascade from the masters, Standard Complaint
//     from master, Reported Problem free text; Installation Report + KYC hidden.
// Requests appear in Pending Registrations until a UCN is assigned.
// ===========================================================================

const blank = {
  callType: 'FIELD', partyName: '', state: '', city: '', address: '',
  customerContactDetails: '', customerContactNumber: '', product: '', serialNo: '',
  standardComplaint: '', reportedProblem: '', installationReport: '', kyc: '',
  callAttended: '', attendedDate: '', planDate: '', additionalComments: '',
};
type Form = typeof blank;

export function RequestCallRegistration() {
  const { user } = useAuth();
  const callTypeMaster = useMaster('calltype', ['FIELD', 'INSTALLATION CALL']);
  const partyMaster = useMaster('party');
  const complaintMaster = useMaster('complaint');
  const productMaster = useMaster('product');

  const [f, setF] = useState<Form>(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to submit requests.' },
  );
  const set = (k: keyof Form, v: string) => setF((c) => ({ ...c, [k]: v }));

  const isInstall = /install/i.test(f.callType);

  // Installation → complaint/problem auto = "INSTALLATION CALL".
  useEffect(() => {
    if (isInstall) setF((c) => ({ ...c, standardComplaint: 'INSTALLATION CALL', reportedProblem: c.reportedProblem || 'INSTALLATION CALL' }));
  }, [isInstall]);

  // Party autofill (state / city / address) from Party Master.
  const fillParty = async (party: string) => {
    if (!party.trim() || !supabaseConfigured()) return;
    const info = await sbPartyInfo(party).catch(() => null);
    if (info) setF((c) => ({ ...c, state: info.state || c.state, city: info.city || c.city, address: info.address || c.address }));
  };

  // Product cascade for non-installation calls (filtered by party, then serial).
  const [partyProducts, setPartyProducts] = useState<string[]>([]);
  const [serialOptions, setSerialOptions] = useState<string[]>([]);
  useEffect(() => {
    if (isInstall || !f.partyName.trim()) { setPartyProducts([]); return; }
    listPartyProducts(f.partyName).then(setPartyProducts).catch(() => setPartyProducts([]));
  }, [isInstall, f.partyName]);
  useEffect(() => {
    if (isInstall || !f.partyName.trim() || !f.product.trim()) { setSerialOptions([]); return; }
    listPartyItems(f.partyName, f.product).then((rows) => setSerialOptions(rows.map((r) => String(r['Item Serial Number'] ?? '')).filter(Boolean))).catch(() => setSerialOptions([]));
  }, [isInstall, f.partyName, f.product]);

  const productOptions = useMemo(() => (isInstall ? productMaster.values : partyProducts), [isInstall, productMaster.values, partyProducts]);
  const attended = /^yes$/i.test(f.callAttended);

  const validate = (): string => {
    if (!f.callType) return 'Choose a Call Type.';
    if (!f.partyName.trim()) return 'Enter the Party Name.';
    if (!f.product.trim()) return 'Enter the Product.';
    if (attended && !f.attendedDate) return 'Attended Date is required when Call Attended? = Yes.';
    return '';
  };

  const submit = async () => {
    const v = validate();
    if (v) { setMsg({ tone: 'error', text: v }); return; }
    setBusy(true); setMsg({ tone: 'info', text: 'Submitting request…' });
    const rec: Record<string, unknown> = {
      email: user?.email ?? '', engineer: user?.fullName ?? '', call_type: f.callType,
      party_name: f.partyName, state: f.state, city: f.city, address: f.address,
      customer_contact_details: f.customerContactDetails, customer_contact_number: f.customerContactNumber,
      product: f.product, serial_no: f.serialNo, standard_complaint: f.standardComplaint, reported_problem: f.reportedProblem,
      installation_report: isInstall ? f.installationReport : '', kyc: isInstall ? f.kyc : '',
      call_attended: f.callAttended, attended_date: f.attendedDate || null, plan_date: f.planDate || null,
      additional_comments: f.additionalComments,
    };
    try {
      const res = await addCallRequest(rec);
      if (res.ok) {
        setMsg({ tone: 'ok', text: `Request ${res.reqid} submitted (${res.unique_key}). It's now in Pending Registrations.` });
        setF(blank);
      } else setMsg({ tone: 'error', text: `Submit failed: ${res.error}` });
    } catch (e) {
      setMsg({ tone: 'error', text: `Submit failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  const field = (label: string, node: React.ReactNode, span2 = false) => (
    <label className={`rep-field ${span2 ? 'rep-span2' : ''}`}>
      <span className="field-label">{label}</span>
      {node}
    </label>
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
                  <datalist id="dl-party">{partyMaster.values.slice(0, 3000).map((v) => <option key={v} value={v} />)}</datalist>
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
            <div className="rep-sec-title">Equipment & complaint</div>
            <div className="rep-grid">
              {field('Product *', (
                <>
                  <input className="input" list="dl-product" value={f.product} onChange={(e) => set('product', e.target.value)}
                    placeholder={isInstall ? 'Product Master' : 'Filtered by party'} />
                  <datalist id="dl-product">{productOptions.slice(0, 3000).map((v) => <option key={v} value={v} />)}</datalist>
                </>
              ))}
              {field('Serial No', (
                isInstall
                  ? <input className="input" value={f.serialNo} onChange={(e) => set('serialNo', e.target.value)} placeholder="Free text" />
                  : <>
                    <input className="input" list="dl-serial" value={f.serialNo} onChange={(e) => set('serialNo', e.target.value)} placeholder="Filtered by party + product" />
                    <datalist id="dl-serial">{serialOptions.slice(0, 2000).map((v) => <option key={v} value={v} />)}</datalist>
                  </>
              ))}
              {field('Standard Complaint', (
                isInstall
                  ? <input className="input" value={f.standardComplaint} readOnly />
                  : <>
                    <input className="input" list="dl-complaint" value={f.standardComplaint} onChange={(e) => set('standardComplaint', e.target.value)} />
                    <datalist id="dl-complaint">{complaintMaster.values.slice(0, 3000).map((v) => <option key={v} value={v} />)}</datalist>
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
            <button className="btn" onClick={() => setF(blank)} disabled={busy}>Clear</button>
            <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || !supabaseConfigured()}>{busy ? 'Submitting…' : 'Submit Request'}</button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

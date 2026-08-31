import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { addCallRequestBatch, listCallRequests, sbPartyInfo, supabaseConfigured, type CallRequestItem } from '../lib/supabase';
import { csvExport, fmtDateTime, fmtLongDate } from '../lib/format';
import { listPartyItems, uploadToDrive, MAX_UPLOAD_BYTES } from '../lib/sheets';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { useMaster } from '../lib/masters';
import { todayISO } from '../lib/format';
import './fieldcalls.css';

// ===========================================================================
// REQUEST CALL REGISTRATION — the register of every request raised, whatever
// became of it (Pending / Mapped / Registered / Cancelled), with "New Request"
// raising one. The Hotline actions a pending request in Pending Registrations.
//
// The form below writes to Supabase `call_requests`. It adapts to call type
// (Installation vs Other). Up to 5 calls per request — a call is a
// Product + Serial No + Standard Complaint + Reported Problem group. Every
// group becomes its own row sharing the REQID (UniqueID = REQID-Product-Serial).
// ===========================================================================

const MAX_ITEMS = 5;
const blank = {
  callType: 'FIELD', partyName: '', state: '', city: '', address: '',
  customerContactDetails: '', customerContactNumber: '',
  callAttended: '', attendedDate: '', planDate: '', additionalComments: '',
};
type Form = typeof blank;
type Item = CallRequestItem;
type Doc = { name: string; url: string } | null;
type Docs = { installationReport: Doc; kyc: Doc };
const blankItem = (install = false): Item => ({
  product: '', serial: '',
  standardComplaint: install ? 'INSTALLATION CALL' : '',
  reportedProblem: install ? 'INSTALLATION CALL' : '',
});


type Row = Record<string, unknown> & { id: string };

const STATUS_TONE: Record<string, string> = {
  Pending: 'badge-warning', Mapped: 'badge-info', Registered: 'badge-success', Cancelled: 'badge-neutral',
};
const STATUSES = ['', 'Pending', 'Registered', 'Mapped', 'Cancelled'];

const COLUMNS: Column<Row>[] = [
  { key: 'submittedAt', header: 'Requested', width: 160, wrap: false, render: (r) => fmtDateTime(r.submittedAt) },
  { key: 'reqid', header: 'REQID', width: 90, wrap: false },
  {
    key: 'status', header: 'Status', width: 110, wrap: false,
    render: (r) => {
      const st = String(r.status ?? 'Pending');
      return <span className={`badge ${STATUS_TONE[st] ?? 'badge-neutral'}`} title={String(r.cancelReason || r.actionedBy || '')}>{st}</span>;
    },
  },
  { key: 'ucn', header: 'UCN', width: 120, wrap: false, render: (r) => (r.ucn ? String(r.ucn) : <span className="muted">—</span>) },
  { key: 'engineer', header: 'Engineer', width: 150 },
  { key: 'callType', header: 'Call Type', width: 120, wrap: false },
  { key: 'partyName', header: 'Party', width: 210 },
  { key: 'city', header: 'City', width: 110 },
  { key: 'product', header: 'Product', width: 130 },
  { key: 'serial', header: 'Serial', width: 90, wrap: false },
  { key: 'standardComplaint', header: 'Standard Complaint', width: 180 },
  { key: 'reportedProblem', header: 'Reported Problem', width: 220 },
  { key: 'planDate', header: 'Plan Date', width: 120, wrap: false, render: (r) => fmtLongDate(r.planDate) },
];

export function RequestCallRegistration() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load requests.' },
  );

  const load = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true);
    try {
      const r = await listCallRequests();
      setRows(r.map((x, i) => ({ ...x, id: String(x.id ?? i) })) as Row[]);
      setMsg(null);
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!status || String(r.status ?? '') === status) &&
      (!needle || ['reqid', 'ucn', 'engineer', 'partyName', 'city', 'product', 'serial', 'reportedProblem', 'standardComplaint'].some(
        (k) => String(r[k] ?? '').toLowerCase().includes(needle),
      )),
    );
  }, [rows, q, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => { const s = String(r.status ?? 'Pending'); c[s] = (c[s] ?? 0) + 1; });
    return c;
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Request Call Registration"
        subtitle="Every call registration request raised, and what became of it. REQID is assigned automatically."
        icon="📝"
        actions={can('request.create') ? <button className="btn btn-primary" onClick={() => setNewOpen(true)}>＋ New Request</button> : undefined}
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <DataTable<Row>
        columns={COLUMNS}
        rows={visible}
        getRowId={(r) => r.id}
        storageKey="callRequests"
        rowsBeforeScroll={16}
        dense
        onRowClick={(r) => setDetail(r)}
        emptyText={busy ? 'Loading…' : 'No requests yet — raise one with New Request.'}
        toolbar={
          <Toolbar>
            <SearchBox value={q} onChange={setQ} placeholder="REQID, UCN, party, product, serial, engineer…" />
            <div className="row">
              {STATUSES.map((s) => (
                <button key={s || 'all'} className={`chip ${status === s ? 'chip-on' : ''}`} onClick={() => setStatus(s)}>
                  {s || 'All'}{s && counts[s] ? <b>{counts[s]}</b> : null}
                </button>
              ))}
            </div>
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <button
              className="btn btn-sm"
              onClick={() => csvExport('call-requests.csv', COLUMNS.map((c) => ({ key: c.key, header: c.header })), visible as unknown as Record<string, unknown>[])}
            >
              ⭳ Export CSV
            </button>
          </Toolbar>
        }
      />

      <Drawer open={newOpen} onClose={() => setNewOpen(false)} title="New Call Registration Request" width={900}>
        <NewRequestForm onSaved={() => void load()} />
      </Drawer>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={`Request ${String(detail?.reqid ?? '')}`} width={620}>
        {detail && (
          <div className="reg-detail-list">
            {Object.entries(detail)
              .filter(([k, v]) => k !== 'id' && !k.startsWith('_') && v != null && String(v).trim() !== '')
              .map(([k, v]) => (
                <div className="reg-detail-row" key={k}>
                  <div className="reg-detail-k">{LABELS[k] ?? k}</div>
                  <div className="reg-detail-v">{String(v)}</div>
                </div>
              ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}

const LABELS: Record<string, string> = {
  reqid: 'REQID', uniqueKey: 'Unique ID', submittedAt: 'Requested', engineer: 'Engineer', email: 'Submitted by',
  callType: 'Call Type', partyName: 'Party Name', state: 'State', city: 'City', address: 'Address',
  product: 'Product', serial: 'Serial No', standardComplaint: 'Standard Complaint', reportedProblem: 'Reported Problem',
  customerContactDetails: 'Customer Contact Details', customerContactNumber: 'Customer Contact Number',
  installationReport: 'Installation Report', kyc: 'KYC', callAttended: 'Call Attended?', attendedDate: 'Attended Date',
  planDate: 'Plan Date', additionalComments: 'Additional Comments', ucn: 'UCN', status: 'Status',
  cancelReason: 'Cancel Reason', actionedBy: 'Actioned By', actionedAt: 'Actioned At',
};

function NewRequestForm({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const callTypeMaster = useMaster('calltype', ['FIELD', 'INSTALLATION CALL']);
  const partyMaster = useMaster('party');
  const complaintMaster = useMaster('complaint');
  const productMaster = useMaster('product');

  const [f, setF] = useState<Form>(blank);
  const [items, setItems] = useState<Item[]>([blankItem()]);
  // Installation Report / KYC are documents: uploaded to the Drive folder and
  // stored on the request as their Drive link.
  const [docs, setDocs] = useState<Docs>({ installationReport: null, kyc: null });
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to submit requests.' },
  );
  const set = (k: keyof Form, v: string) => setF((c) => ({ ...c, [k]: v }));
  const isInstall = /install/i.test(f.callType);
  const attended = /^yes$/i.test(f.callAttended);

  // Installation calls carry a fixed complaint on every item.
  useEffect(() => {
    if (!isInstall) return;
    setItems((s) => s.map((it) => ({
      ...it,
      standardComplaint: 'INSTALLATION CALL',
      reportedProblem: it.reportedProblem || 'INSTALLATION CALL',
    })));
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
  // Serial numbers this party owns of this product, minus the ones another
  // call on the request has already taken — one machine cannot be two calls
  // (its UniqueID is REQID-Product-Serial, so the DB would reject the pair
  // twice anyway).
  const serialsFor = (product: string, forIndex = -1) => {
    if (isInstall || !product) return [];
    const taken = new Set(
      items.filter((it, j) => j !== forIndex && it.product === product && it.serial)
        .map((it) => it.serial),
    );
    return [...new Set(
      partyItems.filter((r) => String(r['Item Name'] ?? '') === product)
        .map((r) => String(r['Item Serial Number'] ?? '')).filter(Boolean),
    )].filter((v) => !taken.has(v));
  };

  // Changing the party changes what the dropdowns can offer, so a product or
  // serial the new party does not have is dropped rather than left showing a
  // value the list no longer contains.
  useEffect(() => {
    if (isInstall) return;
    setItems((s) => s.map((it) => {
      if (!it.product) return it;
      if (!productOptions.includes(it.product)) return { ...it, product: '', serial: '' };
      const serials = partyItems.filter((r) => String(r['Item Name'] ?? '') === it.product)
        .map((r) => String(r['Item Serial Number'] ?? ''));
      return it.serial && !serials.includes(it.serial) ? { ...it, serial: '' } : it;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyItems, isInstall]);

  const setItem = (i: number, k: keyof Item, v: string) => setItems((s) => s.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const addItem = () => setItems((s) => (s.length < MAX_ITEMS ? [...s, blankItem(isInstall)] : s));
  const removeItem = (i: number) => setItems((s) => (s.length > 1 ? s.filter((_, j) => j !== i) : s));
  const reset = () => { setF(blank); setItems([blankItem()]); setDocs({ installationReport: null, kyc: null }); };

  const filled = items.filter((it) => it.product.trim() || it.serial.trim() || it.standardComplaint.trim() || it.reportedProblem.trim());

  const validate = (): string => {
    if (!f.callType) return 'Choose a Call Type.';
    if (!f.partyName.trim()) return 'Enter the Party Name.';
    if (!filled.some((it) => it.product.trim())) return 'Add at least one call (Product is required).';
    const bad = filled.findIndex((it) => !it.product.trim());
    if (bad >= 0) return `Call ${bad + 1}: Product is required (or clear the other fields).`;
    const noProblem = filled.findIndex((it) => !it.reportedProblem.trim());
    if (noProblem >= 0) return `Call ${noProblem + 1}: Reported Problem is required.`;
    // One row per Product + Serial within a request (its UniqueID), so the same
    // pair can't appear twice.
    const seen = new Set<string>();
    for (let i = 0; i < filled.length; i++) {
      const key = `${filled[i].product.trim().toLowerCase()}|${filled[i].serial.trim().toLowerCase()}`;
      if (seen.has(key)) return `Call ${i + 1}: this Product + Serial is already on the request.`;
      seen.add(key);
    }
    if (!f.callAttended) return 'Answer Call Attended?';
    if (attended && !f.attendedDate) return 'Attended Date is required when Call Attended? = Yes.';
    if (uploading > 0) return 'Wait for the document upload to finish.';
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
      installation_report: isInstall ? docs.installationReport?.url ?? '' : '',
      kyc: isInstall ? docs.kyc?.url ?? '' : '',
      call_attended: f.callAttended, attended_date: f.attendedDate || null, plan_date: f.planDate || null,
      additional_comments: f.additionalComments,
    };
    const t0 = performance.now();
    try {
      const res = await addCallRequestBatch(base, filled);
      logAudit({ action: 'request.create', target: res.reqid ?? '', status: res.ok && !res.error ? 'ok' : 'error', error: res.error, duration_ms: Math.round(performance.now() - t0), meta: { products: filled.length, callType: f.callType } });
      if (res.ok) {
        setMsg({ tone: res.error ? 'error' : 'ok', text: res.error ?? `Request ${res.reqid} submitted — ${res.count} call${res.count === 1 ? '' : 's'}. Now in Pending Registrations.` });
        if (!res.error) { reset(); onSaved(); }
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
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

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
          <div className="rep-sec-title">
            Calls <span className="muted">(up to {MAX_ITEMS} — Product + Serial + Complaint + Reported Problem; each becomes its own UniqueID)</span>
          </div>
          <datalist id="dl-complaint">{complaintMaster.values.slice(0, 5000).map((v) => <option key={v} value={v} />)}</datalist>

          {items.map((it, i) => (
            <div className="req-item" key={i}>
              <div className="req-item-head">
                <span className="req-item-title">Call {i + 1}</span>
                <button className="btn btn-ghost btn-sm" title="Remove this call" onClick={() => removeItem(i)} disabled={items.length === 1}>✕</button>
              </div>
              <div className="rep-grid">
                {field('Product *', (
                  <select
                    className="select"
                    value={it.product}
                    onChange={(e) => setItems((s) => s.map((x, j) => (j === i ? { ...x, product: e.target.value, serial: '' } : x)))}
                  >
                    <option value="">
                      {isInstall ? '— pick from Product Master —'
                        : !f.partyName.trim() ? '— pick a Party first —'
                        : productOptions.length ? '— pick a product —'
                        : '— no products for this party —'}
                    </option>
                    {productOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                    {/* a value the current list cannot offer (e.g. imported) stays selectable */}
                    {it.product && !productOptions.includes(it.product) && <option value={it.product}>{it.product}</option>}
                  </select>
                ))}
                {field('Serial No', (
                  // An installation is a machine the party does not own yet, so
                  // its serial is typed. Otherwise it is picked from what this
                  // party owns of this product.
                  isInstall
                    ? <input className="input" placeholder="Serial (new machine)" value={it.serial} onChange={(e) => setItem(i, 'serial', e.target.value)} />
                    : (() => {
                      const serials = serialsFor(it.product, i);
                      const allTaken = !serials.length && !it.serial && !!it.product
                        && items.some((o, j) => j !== i && o.product === it.product && o.serial);
                      return (
                        <select className="select" value={it.serial} onChange={(e) => setItem(i, 'serial', e.target.value)} disabled={!it.product}>
                          <option value="">
                            {!it.product ? '— pick a product first —'
                              : serials.length ? '— pick a serial —'
                              : allTaken ? '— every serial is already on this request —'
                              : '— no serial on record —'}
                          </option>
                          {serials.map((v) => <option key={v} value={v}>{v}</option>)}
                          {it.serial && !serials.includes(it.serial) && <option value={it.serial}>{it.serial}</option>}
                        </select>
                      );
                    })()
                ))}
                {field('Standard Complaint', (
                  isInstall
                    ? <input className="input" value={it.standardComplaint} readOnly />
                    : <input className="input" list="dl-complaint" value={it.standardComplaint} onChange={(e) => setItem(i, 'standardComplaint', e.target.value)} />
                ))}
                {field('Reported Problem *', (
                  isInstall
                    ? <input className="input" value={it.reportedProblem} onChange={(e) => setItem(i, 'reportedProblem', e.target.value)} />
                    : <textarea className="input" rows={2} value={it.reportedProblem} onChange={(e) => setItem(i, 'reportedProblem', e.target.value)} />
                ), true)}
              </div>
            </div>
          ))}
          {items.length < MAX_ITEMS && <button className="btn btn-sm" onClick={addItem}>＋ Add call</button>}
        </section>

        {isInstall && (
          <section className="rep-sec">
            <div className="rep-sec-title">Installation documents <span className="muted">(uploaded to the Drive folder)</span></div>
            <div className="rep-grid">
              <DriveFileField
                label="Installation Report (if available)"
                doc={docs.installationReport}
                prefix={`${f.partyName || 'Request'} - Installation Report`}
                onBusy={(b) => setUploading((n) => n + (b ? 1 : -1))}
                onChange={(d) => setDocs((c) => ({ ...c, installationReport: d }))}
              />
              <DriveFileField
                label="KYC"
                doc={docs.kyc}
                prefix={`${f.partyName || 'Request'} - KYC`}
                onBusy={(b) => setUploading((n) => n + (b ? 1 : -1))}
                onChange={(d) => setDocs((c) => ({ ...c, kyc: d }))}
              />
            </div>
          </section>
        )}

        <section className="rep-sec">
          <div className="rep-sec-title">Visit</div>
          <div className="rep-grid">
            {field('Call Attended? *', (
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
          <button className="btn" onClick={reset} disabled={busy}>Clear</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || uploading > 0 || !supabaseConfigured()}>{busy ? 'Submitting…' : uploading > 0 ? 'Uploading…' : 'Submit Request'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A document field: pick a file → uploaded straight to the CallReg Drive folder
// → the request stores the resulting link.
// ---------------------------------------------------------------------------
function DriveFileField({
  label, doc, prefix, onChange, onBusy,
}: {
  label: string;
  doc: Doc;
  prefix: string;
  onChange: (d: Doc) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setErr(''); setBusy(true); onBusy(true);
    try {
      const res = await uploadToDrive(file, prefix);
      if (res.ok && res.url) onChange({ name: file.name, url: res.url });
      else setErr(res.error ?? 'Upload failed.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); onBusy(false); }
  };

  return (
    <label className="rep-field rep-span2">
      <span className="field-label">{label}</span>
      {doc ? (
        <div className="req-doc">
          <a className="req-doc-link" href={doc.url} target="_blank" rel="noreferrer">📎 {doc.name}</a>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>Remove</button>
        </div>
      ) : (
        <input
          type="file"
          className="input"
          disabled={busy}
          onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
        />
      )}
      <span className="muted req-doc-hint">
        {busy ? 'Uploading to Drive…' : err || `Optional — max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB, saved to the Drive folder.`}
      </span>
    </label>
  );
}

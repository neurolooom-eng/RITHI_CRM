import { useEffect, useMemo, useState } from 'react';
import { SelectPicker } from '../components/ui/SelectPicker';
import { PageHeader, Drawer, Toolbar, SearchBox } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { addCallRequestBatch, listCallRequests, sbPartyInfo, supabaseConfigured, type CallRequestItem } from '../lib/supabase';
import { csvExport, timeAgo, fmtDateTime, fmtLongDate } from '../lib/format';
import { listPartyItems, uploadToDrive, MAX_UPLOAD_BYTES } from '../lib/sheets';
import { logAudit } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { useTeamEngineers } from '../lib/access';
import { useMaster } from '../lib/masters';
import { PickList } from '../components/ui/PickList';
import { machineRowProblem } from '../lib/callrequest';
import { sbSearchPartiesForCall, sbSearchPartiesForInstall, partyOwnsNoMachine, sbSearchMachines, type MachineHit } from '../lib/supabase';
import { SupportingDocs } from './CallAssociations';
import { todayISO } from '../lib/format';
import './fieldcalls.css';
import { Ucn } from '../lib/callstate';
import { useCallStates, callStateFor } from '../lib/callstates';

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
  product: '', serial: '', party: '', city: '',
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
  { key: 'ucn', header: 'UCN', width: 130, wrap: false, render: (r) => <Ucn ucn={r.ucn} state={callStateFor(r.ucn)} /> },
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


  // The register is read newest-first in pages. `limit` is what "Load more"
  // raises; it is a lower bound on what exists, not a page size.
  const SYNC_KEY = 'rithi.sync.callRequests';
  const [limit, setLimit] = useState(2000);
  const [lastSync, setLastSync] = useState(() => { try { return localStorage.getItem(SYNC_KEY) ?? ''; } catch { return ''; } });

  const load = async (n = limit) => {
    if (!supabaseConfigured()) return;
    setBusy(true);
    try {
      const r = await listCallRequests(n);
      setRows(r.map((x, i) => ({ ...x, id: String(x.id ?? i) })) as Row[]);
      const now = new Date().toISOString();
      try { localStorage.setItem(SYNC_KEY, now); } catch { /* ignore */ }
      setLastSync(now);
      setMsg(null);
    } catch (e) {
      setMsg({ tone: 'error', text: `Load failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(limit); /* eslint-disable-next-line */ }, [limit]);

  // More exist beyond what is loaded — only meaningful with no filter applied,
  // since a filtered view is a subset of what was fetched, not of the register.
  const moreAvailable = rows.length >= limit;

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!status || String(r.status ?? '') === status) &&
      (!needle || ['reqid', 'ucn', 'engineer', 'partyName', 'city', 'product', 'serial', 'reportedProblem', 'standardComplaint'].some(
        (k) => String(r[k] ?? '').toLowerCase().includes(needle),
      )),
    );
  }, [rows, q, status]);

  // The UCNs on screen, coloured by their calls' status (the standing rule,
  // 2026-09-06). This register does not carry the state — a spare line knows
  // the UCN it was raised against, not what happened to that call — so they
  // are looked up in ONE request and shared. A UCN whose state has not arrived,
  // or that this reader may not see, stays uncoloured rather than guessed.
  useCallStates(visible.map((r) => String((r as { ucn?: unknown }).ucn ?? '')).filter(Boolean));

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => { const s = String(r.status ?? 'Pending'); c[s] = (c[s] ?? 0) + 1; });
    return c;
  }, [rows]);

  return (
    <div>
      <PageHeader
        syncedAt={lastSync}
        onRefresh={() => void load()}
        refreshing={busy}
        title="Request Call Registration"
        subtitle="Every call registration request raised, and what became of it. REQID is assigned automatically."
        icon="📝"
        count={visible.length}
        countMore={moreAvailable && !q.trim() && !status}
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
        onLoadMore={() => setLimit((l) => l + 2000)}
        moreAvailable={moreAvailable}
        loadingMore={busy}
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
            {/* THE SUBMITTED REQUEST, not just the form. This drawer was missed
                when supporting documents were added to the request (reported
                2026-09-09): they reached the NEW-request form and the Pending
                Registrations pane, but not the view of a request already sent —
                which is the one somebody opens days later to ask what happened.
                Same component, same matching rule, everywhere the three fields
                exist. */}
            <SupportingDocs
              product={String(detail.product ?? '')}
              complaint={String(detail.standardComplaint ?? '')}
              reported={String(detail.reportedProblem ?? '')}
            />
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
  // WHO THIS REQUEST IS FOR. A Reporting Manager raises one on behalf of any
  // engineer reporting to them; an engineer raises their own. It used to be
  // stamped from the login with no say in it, so a manager could not raise a
  // request for their own team. Same list as the spare request and the report.
  const team = useTeamEngineers();
  const [engineer, setEngineer] = useState('');
  useEffect(() => { if (!engineer && user?.fullName) setEngineer(user.fullName); }, [user?.fullName, engineer]);
  const callTypeMaster = useMaster('calltype', ['FIELD', 'INSTALLATION CALL']);
  const complaintMaster = useMaster('complaint');
  const productMaster = useMaster('product');

  const [f, setF] = useState<Form>(blank);
  const [items, setItems] = useState<Item[]>([blankItem()]);
  // The machines the last serial search returned, kept so a PICK can find the
  // customer that came with the row. PickList hands back the value, not the
  // object, and the customer is the whole point of the search.
  const [machineHits, setMachineHits] = useState<MachineHit[]>([]);
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

  // THE MACHINE NAMES THE CUSTOMER, not the other way round (the user's
  // design, 2026-09-11). The old order made you find the customer first, and
  // finding a customer is an infix search over five thousand names -- which is
  // the search that kept timing out on a phone. A serial is a prefix on an
  // indexed column (0.21 ms over all 19,253 machines) and it is what the
  // engineer is looking at while they stand there.
  //
  // So the product list is now the WHOLE register -- about forty names, already
  // held on the device -- and the serial is searched across every customer.
  const [partyItems, setPartyItems] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    if (!isInstall || !f.partyName.trim()) { setPartyItems([]); return; }
    listPartyItems(f.partyName).then(setPartyItems).catch(() => setPartyItems([]));
  }, [isInstall, f.partyName]);

  const productOptions = useMemo(() => productMaster.values, [productMaster.values]);
  // Serial numbers this party owns of this product, minus the ones another
  // call on the request has already taken — one machine cannot be two calls
  // (its UniqueID is REQID-Product-Serial, so the DB would reject the pair
  // twice anyway).
  const serialsFor = (product: string, forIndex = -1) => {
    if (!isInstall || !product) return [];
    const taken = new Set(
      items.filter((it, j) => j !== forIndex && it.product === product && it.serial)
        .map((it) => it.serial),
    );
    return [...new Set(
      partyItems.filter((r) => String(r['Item Name'] ?? '') === product)
        .map((r) => String(r['Item Serial Number'] ?? '')).filter(Boolean),
    )].filter((v) => !taken.has(v));
  };

  // ONE MACHINE CANNOT BE TWO CALLS on the same request: its UniqueID is
  // REQID-Product-Serial, so the database would refuse the pair anyway. The
  // check now spans customers, because the rows may be for different ones.
  const serialTakenElsewhere = (serial: string, forIndex: number) =>
    items.some((it, j) => j !== forIndex && it.serial.trim().toLowerCase() === serial.trim().toLowerCase() && it.serial.trim());

  // Picking a machine fills its customer IN THAT ROW. City comes with it --
  // the user's decision (2026-09-11): city per row, State / Address / Contact
  // stay on the request, since those describe where the engineer is going.
  const takeMachine = (i: number, m: MachineHit) =>
    setItems((s) => s.map((it, j) => (j === i
      ? { ...it, product: m.product || it.product, serial: m.serial, party: m.party, city: m.city }
      : it)));

  const setItem = (i: number, k: keyof Item, v: string) => setItems((s) => s.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const addItem = () => setItems((s) => (s.length < MAX_ITEMS ? [...s, blankItem(isInstall)] : s));
  const removeItem = (i: number) => setItems((s) => (s.length > 1 ? s.filter((_, j) => j !== i) : s));
  const reset = () => { setF(blank); setItems([blankItem()]); setDocs({ installationReport: null, kyc: null }); };

  const filled = items.filter((it) => it.product.trim() || it.serial.trim() || it.standardComplaint.trim() || it.reportedProblem.trim());

  const validate = (): string => {
    if (!f.callType) return 'Choose a Call Type.';
    // The customer is asked for only on an INSTALLATION now; everywhere else
    // it arrives with the machine, per row, and is checked there.
    if (isInstall && !f.partyName.trim()) return 'Enter the Party Name.';
    if (!filled.some((it) => it.product.trim())) return 'Add at least one call (Product is required).';
    const bad = filled.findIndex((it) => !it.product.trim());
    if (bad >= 0) return `Call ${bad + 1}: Product is required (or clear the other fields).`;
    // The serial is what ties the call to ONE machine. Without it the request's
    // UniqueID reads REQID-Product-NA, every downstream lookup matches the
    // wrong unit or none, and the call has to be corrected by hand afterwards.
    // On an installation it is typed (the machine is new); everywhere else it
    // comes from the Product Master, so an empty one is a MASTER to fix, not a
    // field to skip.
    const noSerial = filled.findIndex((it) => !it.serial.trim());
    if (noSerial >= 0)
      return isInstall
        ? `Call ${noSerial + 1}: Serial No is required — type the serial of the machine being installed.`
        : `Call ${noSerial + 1}: Serial No is required. If the serial is not on the list, the machine is missing from Product Master — have it added there.`;
    // AND THE MACHINE MUST HAVE NAMED A CUSTOMER. On a field or PM call the
    // customer is not typed, so a row without one means the serial matched no
    // machine — which would file the call against nobody. The rule is in
    // lib/callrequest.ts so it can be run with real inputs.
    const machineProblem = machineRowProblem(filled, isInstall);
    if (machineProblem) return machineProblem;
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
      email: user?.email ?? '', engineer: engineer.trim() || (user?.fullName ?? ''), call_type: f.callType,
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

  // A complaint the row already carries but the master no longer lists still has
  // to be offered, or opening a saved request would silently blank it.
  const withCurrent = (list: string[], current: string) =>
    current && !list.includes(current) ? [current, ...list] : list;

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
              <SelectPicker value={f.callType} onChange={(v) => set('callType', v)}
                            options={callTypeMaster.values} />
            ))}
            {field('Submitted by', <input className="input" value={user?.email ?? ''} readOnly />)}
            {field('Engineer', team.canPick ? (
              <SelectPicker value={engineer} onChange={setEngineer} options={team.names}
                            emptyHint="Only engineers on your team are listed." />
            ) : <input className="input" value={engineer} readOnly title="Taken from your login" />)}
          </div>
        </section>

        <section className="rep-sec">
          {/* A heading has to describe what is under it. On a field or PM call
              the customer is no longer here -- it comes off each machine below --
              so this section is now what is left: where the engineer is going
              and who to ask for. Calling it "Customer" with no customer in it
              was the confusing part of the new layout. */}
          <div className="rep-sec-title">
            {isInstall ? 'Customer' : <>Site &amp; contact <span className="muted" style={{ fontWeight: 400 }}>— the customer comes from the machine, on each call below</span></>}
          </div>
          <div className="rep-grid">
            {/* THE PARTY IS PICKED, NOT TYPED — and this is the fix for "it is
                taking a very long time to accept the party" (2026-09-09).
                Two faults, one cause, both cured by the same control:

                1. It was an `<input list>` backed by a datalist of up to EIGHT
                   THOUSAND options. `value` is state, so every keystroke
                   re-rendered all eight thousand `<option>` nodes.
                2. The products effect below depends on `f.partyName`, which the
                   old onChange set PER CHARACTER — so typing a party name fired
                   one products query per letter, each of them an ilike over the
                   whole products table. That is what was "impacting on listing
                   the products": the cascade was being run forty times and the
                   last answer won whenever it happened to arrive.

                A PickList commits ONCE, on a click or Enter, so the cascade runs
                once with the finished name. It is also the app's design default
                for a dropdown, which this field had been missed out of.

                FREE TEXT ONLY FOR AN INSTALLATION, where the customer may be
                new and is therefore legitimately not in the master. For every
                other call type the party must exist, because the products are
                looked up BY it — a typed name matches no machine. */}
            {/* THE PARTY FIELD IS NOW THE INSTALLATION'S ALONE (the user's
                design, 2026-09-11). On a FIELD or PM call the customer is read
                off the machine, per row, so asking for it here would be asking
                somebody to find by an infix search over five thousand names
                what a serial answers in a prefix — and that search is the one
                that kept timing out. On an INSTALLATION there is no machine on
                the register yet, so the question still has to be asked. */}
            {isInstall && field('Party Name *', (
              <PickList
                value={f.partyName}
                // SEARCHED ON THE SERVER, not downloaded. Thousands of customers
                // was three paged requests and a few hundred KB before this
                // field worked at all — reported as 8 seconds on a phone. Now
                // one small request per search, debounced, and the same cost
                // whatever the register grows to.
                //
                // Only the CURRENT value is seeded, so a re-opened draft keeps
                // its customer while a search is in flight.
                options={f.partyName ? [f.partyName] : []}
                onSearch={isInstall ? sbSearchPartiesForInstall : sbSearchPartiesForCall}
                // A customer on the Party Master with no machine against them is
                // SHOWN and unpickable, with the reason — about a thousand of
                // them exist. "Nothing matches" on a customer somebody is
                // looking straight at is a lie by omission.
                isDisabled={isInstall ? undefined : partyOwnsNoMachine}
                labelFor={isInstall ? undefined : (v) => (partyOwnsNoMachine(v)
                  ? <>{v} <span className="muted">— no machine on record</span></>
                  : v)}
                onPick={(v) => { set('partyName', v); void fillParty(v); }}
                allowFreeText={isInstall}
                placeholder={isInstall ? 'Type to search, or enter a new customer' : 'Type to search customers'}
                emptyLabel="— pick the customer —"
                emptyHint={isInstall
                  ? 'A new customer can be typed in — installations reach people who are not on the master yet.'
                  : 'Only customers who own a machine are listed: the products and serials are looked up by this name.'}
              />
            ), true)}
            {field('State', <input className="input" value={f.state} onChange={(e) => set('state', e.target.value)} />)}
            {/* CITY IS PER ROW NOW (the user's decision, 2026-09-11): it comes
                off the machine, and two machines on one request can be in two
                cities. State, Address and Contact stay here — they describe
                where the engineer is going and who to ask for. The installation
                keeps its own City box, having no machine to read one from. */}
            {isInstall && field('City', <input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} />)}
            {field('Address', <textarea className="input" rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} />, true)}
            {field('Customer Contact Details', <textarea className="input" rows={2} value={f.customerContactDetails} onChange={(e) => set('customerContactDetails', e.target.value)} />)}
            {field('Customer Contact Number', <input className="input" value={f.customerContactNumber} onChange={(e) => set('customerContactNumber', e.target.value)} />)}
          </div>
        </section>

        <section className="rep-sec">
          <div className="rep-sec-title">
            Calls <span className="muted">(up to {MAX_ITEMS} — Product + Serial + Complaint + Reported Problem; each becomes its own UniqueID)</span>
          </div>

          {items.map((it, i) => (
            <div className="req-item" key={i}>
              <div className="req-item-head">
                <span className="req-item-title">Call {i + 1}</span>
                <button className="btn btn-ghost btn-sm" title="Remove this call" onClick={() => removeItem(i)} disabled={items.length === 1}>✕</button>
              </div>
              <div className="rep-grid">
                {field('Product *', (
                  <SelectPicker
                    value={it.product}
                    onChange={(v) => setItems((s) => s.map((x, j) => (j === i ? { ...x, product: v, serial: '' } : x)))}
                    placeholder={isInstall ? '— pick from Product Master —'
                      : !f.partyName.trim() ? '— pick a Party first —'
                      : productOptions.length ? '— pick a product —'
                      : '— no products for this party —'}
                    // a value the current list cannot offer (e.g. imported) stays selectable
                    options={withCurrent(productOptions, it.product)} />
                ))}
                {field('Serial No *', (
                  // An installation is a machine the party does not own yet, so
                  // its serial is typed. Otherwise it is picked from what this
                  // party owns of this product.
                  isInstall
                    ? <input className="input" placeholder="Serial (new machine)" value={it.serial} onChange={(e) => setItem(i, 'serial', e.target.value)} />
                    : (() => {
                      // THE MACHINE PICKER. It searches SERIALS ACROSS EVERY
                      // CUSTOMER, because the customer is what it is going to
                      // tell us — the old order asked you to find the customer
                      // first, and finding a customer is an infix search over
                      // five thousand names, which is what kept timing out on a
                      // phone. A serial is a prefix on an indexed column.
                      //
                      // Each row reads "serial · customer · city", so the person
                      // can see they have the right machine BEFORE picking it —
                      // two hospitals own the same model and the serial is all
                      // that tells them apart.
                      const taken = (v: string) => serialTakenElsewhere(v, i);
                      return (
                        <PickList
                          value={it.serial}
                          options={withCurrent(machineHits.map((m: MachineHit) => m.serial), it.serial)}
                          onSearch={async (qq) => {
                            const hits = await sbSearchMachines(it.product, qq);
                            setMachineHits(hits);
                            return hits.map((m: MachineHit) => m.serial);
                          }}
                          onPick={(v) => {
                            const m = machineHits.find((x: MachineHit) => x.serial === v);
                            if (m) takeMachine(i, m); else setItem(i, 'serial', v);
                          }}
                          labelFor={(v: string) => {
                            const m = machineHits.find((x: MachineHit) => x.serial === v);
                            if (!m) return v;
                            return `${m.serial} · ${m.party}${m.city ? ` · ${m.city}` : ''}${taken(v) ? ' — already on this request' : ''}`;
                          }}
                          isDisabled={taken}
                          // The rows carry the customer; the BOX carries the
                          // machine. Decorating both turned this field into two
                          // wrapped lines of hospital name.
                          plainValue
                          placeholder="Type any part of the serial…"
                          emptyLabel="— type a serial to find the machine —"
                          emptyHint={it.product
                            ? `Serials of ${it.product}, across every customer. The customer is filled in from the machine.`
                            : 'Every machine on the register. Pick a product above to narrow it.'}
                        />
                      );
                    })()
                ))}
                {/* WHAT THE MACHINE SAID. Read-only, because it is the
                    register's answer and not an opinion — and shown rather than
                    hidden, so a wrong serial is caught here instead of on the
                    call. */}
                {!isInstall && it.serial.trim() !== '' && (
                  <div className="req-machine-party">
                    {it.party
                      ? <>Customer: <b>{it.party}</b>{it.city ? <> · {it.city}</> : null}</>
                      : <span className="muted">This serial is not on the register, so no customer came with it — check it, or have the machine added to Product Master.</span>}
                  </div>
                )}
                {/* TYPE TO SEARCH, because the master is five hundred entries
                    long and a native dropdown offers no way through it but the
                    scrollbar (user's ask, 2026-09-09). The same PickList the
                    Daily Call Review uses: typing FILTERS and never selects, so
                    a keystroke over the box cannot quietly change the complaint.
                    The row's own value is kept when it is not on the list.

                    NO FREE-TEXT FALLBACK (the user, 2026-09-09). An empty
                    master is a MASTER problem: the box says so and stays a
                    picker, rather than quietly accepting a complaint that
                    every later count, filter and frequent-failure match will
                    fail to recognise. */}
                {field('Standard Complaint', (
                  isInstall
                    ? <input className="input" value={it.standardComplaint} readOnly />
                    : (
                      <PickList
                        value={it.standardComplaint}
                        options={withCurrent(complaintMaster.values, it.standardComplaint)}
                        onPick={(v) => setItem(i, 'standardComplaint', v)}
                        disabled={!complaintMaster.values.length && !it.standardComplaint}
                        placeholder={complaintMaster.values.length ? '— pick the standard complaint —'
                          : complaintMaster.ready ? '— the Standard Complaint master is empty —'
                          : '— loading the complaints… —'}
                        emptyHint="If it is not here, it needs adding under Masters."
                      />
                    )
                ))}
                {field('Reported Problem *', (
                  isInstall
                    ? <input className="input" value={it.reportedProblem} onChange={(e) => setItem(i, 'reportedProblem', e.target.value)} />
                    : <textarea className="input" rows={2} value={it.reportedProblem} onChange={(e) => setItem(i, 'reportedProblem', e.target.value)} />
                ), true)}
              </div>
              {/* THE MANUAL WHILE THE FAULT IS BEING DESCRIBED, not after
                  somebody registers it (the user, 2026-09-09). Per MACHINE,
                  because a request may carry several and they are not the same
                  machine — one panel under the whole form would offer the
                  wrong product's manual for every row but the first.
                  It is the call's own component, so the matching rule is the
                  same one; it renders nothing until there is a product, and
                  nothing when nothing matches. */}
              <SupportingDocs
                product={it.product}
                complaint={it.standardComplaint}
                reported={it.reportedProblem}
              />
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
              <SelectPicker value={f.callAttended} onChange={(v) => set('callAttended', v)}
                            placeholder="—" options={['Yes', 'No']} />
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

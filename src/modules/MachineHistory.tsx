import { useLocation } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader, SectionCard, Toolbar } from '../components/ui/ui';
import { SelectPicker } from '../components/ui/SelectPicker';
import { DataTable, type Column } from '../components/table/DataTable';
import { supabaseConfigured, sbListProductNames, sbListProductSerials } from '../lib/supabase';
import { archiveNote, machineHistory, machineNow, partyDiffers, type MachineEvent, type MachineNow } from '../lib/machineHistory';
import { Ucn } from '../lib/callstate';
import { useCallStates, callStateFor } from '../lib/callstates';
import { csvExport, fmtLongDate } from '../lib/format';
import { logAudit } from '../lib/audit';
import './fieldcalls.css';

// ===========================================================================
// MACHINE HISTORY — one machine, everything that ever happened to it.
//
// The user, 2026-09-14: "Analyse ORION-G - 2141 -- Where is the Product? Fetch
// all Transactions of this Product" and then "Build me in UI Also -- If i give
// a product , Serial No , it should give me all Transactions -- Calls , Spares
// , Visits , Warranty , Contract , Ownership Transfer -- If i am missing
// anything add".
//
// THE FOUR THAT WERE MISSING FROM THAT LIST and are here: Field Failure
// Reports, Customer Feedback, Additional Entries and Workshop (indoor service)
// jobs. A machine that failed, was reported on, was commented on by the
// hospital and went through the workshop has all four in its life.
//
// PRODUCT FIRST, THEN SERIAL — never serial alone. Serials repeat across
// models (eleven machines numbered "219"; 3,794 serials appear more than once),
// so the serial box is filled FROM the chosen product and the answer is keyed
// on both. The rule and the incident behind it are in src/lib/machine.ts.
//
// EVERY ROW SAYS WHICH REGISTER IT CAME FROM, because they are filled by
// different people under different policies and one undifferentiated list
// would promise the same standard of evidence for all of them.
// ===========================================================================

const SOURCES: MachineEvent['source'][] = [
  'Product Database', 'Call', 'Visit', 'Spare', 'Field Failure', 'Feedback',
  'Sale / warranty', 'Contract', 'Ownership', 'Additional entry', 'Workshop',
];

export function MachineHistory() {
  const live = supabaseConfigured();
  const [products, setProducts] = useState<string[]>([]);
  const [serials, setSerials] = useState<string[]>([]);
  const [product, setProduct] = useState('');
  const [serial, setSerial] = useState('');
  const [now, setNow] = useState<MachineNow | null>(null);
  const [events, setEvents] = useState<MachineEvent[] | null>(null);
  const [only, setOnly] = useState<MachineEvent['source'] | ''>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // ARRIVING FROM A MACHINE SOMEWHERE ELSE (Product Database 2.0 links every
  // row here). IT CANNOT SET BOTH BOXES AT ONCE: choosing a product CLEARS the
  // serial on purpose — the guard this screen is arranged around — and the
  // serial list is fetched for the product afterwards. So the serial is held
  // and applied once its list has arrived, and only if the list actually
  // contains it: a serial that belongs to another model must not be typed in
  // by a link any more than by a person.
  const location = useLocation();
  const wanted = useRef<string | null>(null);
  useEffect(() => {
    const st = location.state as { product?: string; serial?: string } | null;
    if (!st?.product) return;
    wanted.current = st.serial ?? null;
    setProduct(st.product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  useEffect(() => {
    if (!live) return;
    void sbListProductNames()
      .then((rows) => setProducts(rows.map((r) => r.name)))
      .catch(() => setMsg('Could not read the product list.'));
  }, [live]);

  // The serial list follows the product, and CHOOSING A NEW PRODUCT CLEARS THE
  // SERIAL: keeping it would leave a serial that belongs to another model in
  // the box, which is the exact mistake this screen is arranged to prevent.
  useEffect(() => {
    setSerial(''); setSerials([]); setEvents(null); setNow(null);
    if (!live || !product) return;
    void sbListProductSerials(product).then(setSerials).catch(() => setSerials([]));
  }, [product, live]);

  // The serial list has arrived — apply the one the link asked for, and look it
  // up, so a link lands on the ANSWER rather than on a filled-in form.
  useEffect(() => {
    const want = wanted.current;
    if (!want || !serials.length) return;
    wanted.current = null;
    if (serials.includes(want)) { setSerial(want); setPending(true); }
    else setMsg(`${product} has no serial ${want} on the master.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serials]);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending || !product || !serial) return;
    setPending(false);
    void look();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, product, serial]);

  const look = async () => {
    if (!product || !serial) return;
    setBusy(true); setMsg(''); setEvents(null); setNow(null);
    try {
      const [n, e] = await Promise.all([
        machineNow(product, serial),
        machineHistory(product, serial),
      ]);
      setNow(n); setEvents(e);
      if (!n && !e.length) setMsg('Nothing anywhere mentions this machine.');
      logAudit({ action: 'machine.history', target: `${product} ${serial}`,
                 meta: { events: e.length, onMaster: !!n?.onMaster } });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  const shown = useMemo(
    () => (events ?? []).filter((e) => !only || e.source === only),
    [events, only],
  );
  // ONLY THE LIVE UCNs. An archived call belongs to a system this project has
  // never heard of, so there is no state to look up — asking would be a request
  // that can only come back empty, and colouring the chip from an empty answer
  // is the wrong-colour-on-a-code fault the rule exists to prevent.
  useCallStates(shown.filter((e) => !e.archive).map((e) => e.ucn).filter(Boolean));

  const archiveRows = (events ?? []).filter((e) => e.archive).length;

  // WHAT THE SCREEN CANNOT SEE, said where the counts are. An archive that is
  // unconfigured or unreachable must not read as a machine with no past.
  const ArchiveLine = () => {
    const note = archiveNote();
    if (!note) return <span className="muted">{archiveRows} of these are from the 2016 archive.</span>;
    if (note === 'not-connected') {
      return (
        <span className="muted">
          Showing the registers only — the 2016 archive is not connected on this device
          (Settings → Archive).
        </span>
      );
    }
    return <span className="muted">The 2016 archive could not be read ({note.replace(/^unreadable: /, '')}).</span>;
  };

  const columns: Column<Record<string, unknown>>[] = [
    { key: 'on', header: 'When', width: 120, wrap: false,
      render: (r) => (r.on ? fmtLongDate(r.on) : <span className="muted">no date</span>) },
    // WHICH DATABASE, in words rather than a second colour: the one colour
    // language on this row is the call state, and a second would weaken it.
    { key: 'source', header: 'Register', width: 150, wrap: false,
      render: (r) => (r.archive
        ? <span>{String(r.source)} <span className="muted">· archive</span></span>
        : String(r.source)) },
    { key: 'what', header: 'What', width: 150 },
    { key: 'ref', header: 'Reference', width: 150, wrap: false,
      render: (r) => (r.ucn
        // An archived UCN renders PLAIN — the archive cannot know the call's
        // state, and a wrong colour on a code people have learned to read is
        // worse than no colour (the same rule the spare registers follow).
        ? <Ucn ucn={String(r.ucn)} state={r.archive ? undefined : callStateFor(String(r.ucn))} />
        : String(r.ref ?? '')) },
    { key: 'party', header: 'Who', width: 180 },
    { key: 'detail', header: 'Detail' },
  ];

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events ?? []) m.set(e.source, (m.get(e.source) ?? 0) + 1);
    return m;
  }, [events]);

  return (
    <div>
      <PageHeader
        title="Machine History" icon="🔎"
        subtitle="One machine — where it is now, and everything ever recorded against it."
        count={events ? shown.length : undefined} countMore={false}
        status={events ? <ArchiveLine /> : undefined}
      />
      {!live && (
        <div className="sheet-banner sheet-banner-error">
          <span>Not connected to the database — this screen reads the registers directly.</span>
        </div>
      )}
      {msg && <div className="sheet-banner sheet-banner-info"><span>{msg}</span></div>}

      <SectionCard title="Which machine">
        <p className="muted" style={{ marginTop: 0 }}>
          Pick the <b>product first</b>, then its serial. A serial on its own is not a machine —
          the same number belongs to several models, and the wrong one would be a different
          hospital&rsquo;s.
        </p>
        <div className="sf-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div>
            <label className="field-label">Product</label>
            <SelectPicker value={product} onChange={setProduct} options={products}
                          placeholder="— choose the model —" />
          </div>
          <div>
            <label className="field-label">Serial No</label>
            <SelectPicker value={serial} onChange={setSerial} options={serials}
                          disabled={!product}
                          placeholder={product ? '— choose the serial —' : 'pick a product first'}
                          emptyHint="Serials come from the Product Database. A machine that is not on it has none here."
                          // A serial the master has never heard of is still worth
                          // looking up: calls and reports can name a machine the
                          // master is missing, and that gap is itself a finding.
                          allowFreeText />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <button className="btn btn-primary" disabled={!live || busy || !product || !serial}
                    onClick={() => void look()}>
              {busy ? 'Looking…' : '🔎 Show everything'}
            </button>
          </div>
        </div>
      </SectionCard>

      {now && (
        <>
          <div style={{ height: 12 }} />
          <SectionCard title="Where it is now">
            <div className="sf-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              <Fact label="With" value={now.party || '—'} />
              <Fact label="Status" value={now.itemStatus || '—'} />
              <Fact label="Where" value={[now.city, now.state].filter(Boolean).join(', ') || '—'} />
              <Fact label="Engineer" value={now.engineer || '—'} />
              <Fact label="Warranty" value={now.warrantyNumber
                ? `${now.warrantyNumber} to ${fmtLongDate(now.warrantyEnd) || '—'}${now.warrantyState ? ` (${now.warrantyState})` : ''}`
                : '—'} />
              <Fact label="Contract" value={now.contractNumber
                ? `${now.contractType || 'Contract'} ${now.contractNumber} to ${fmtLongDate(now.contractEnd) || '—'}${now.contractState ? ` (${now.contractState})` : ''}`
                : '—'} />
            </div>
            {/* THE TWO PARTIES DISAGREEING IS THE FINDING, not a display fault.
                Reported of ORION-G 2141: the master said one hospital and the
                cover, the calls, the visit and the feedback all said another.
                `products.party_name` is written only by the Product Database
                upload and by an Ownership Transfer (0072); a CONTRACT moves the
                cover and never the party. So a machine that moved on a contract
                with no transfer filed keeps the old hospital on the master for
                ever — and the master is what the call form and the request
                cascade read, so the next call is offered the wrong one. */}
            {partyDiffers(now) && (
              <div className="sheet-banner sheet-banner-warn" style={{ marginTop: 10 }}>
                <span>
                  The <b>Product Database</b> says this machine is with <b>{now.party}</b>, but its
                  cover — and the calls below — say <b>{now.coverParty}</b>. Go by where the calls
                  are being raised. The master only moves when an <b>Ownership Transfer</b> is
                  filed or the master is re-imported; a contract for a new hospital moves the
                  cover and leaves the party behind. Until it is corrected, raising a call for
                  this machine will offer the wrong hospital.
                </span>
              </div>
            )}
            {/* A MACHINE WITH A HISTORY AND NO MASTER ROW IS A FINDING, not an
                error: the registers know it and the Product Database does not. */}
            {!now.onMaster && (
              <div className="sheet-banner sheet-banner-info" style={{ marginTop: 10 }}>
                <span>
                  This machine is <b>not on the Product Database</b> — what you see above is worked
                  out from its cover. Everything below still happened to it.
                </span>
              </div>
            )}
          </SectionCard>
        </>
      )}

      {events && (
        <>
          <div style={{ height: 12 }} />
          <SectionCard title={`Everything recorded against it — ${events.length} entr${events.length === 1 ? 'y' : 'ies'}`}>
            <Toolbar>
              <button className={`chip ${only === '' ? 'chip-on' : ''}`} onClick={() => setOnly('')}>
                All <b>{events.length}</b>
              </button>
              {SOURCES.filter((x) => counts.get(x)).map((x) => (
                <button key={x} className={`chip ${only === x ? 'chip-on' : ''}`}
                        onClick={() => setOnly((c) => (c === x ? '' : x))}>
                  {x} <b>{counts.get(x)}</b>
                </button>
              ))}
              <div className="spacer" />
              {shown.length > 0 && (
                <button className="btn btn-sm"
                        onClick={() => csvExport(
                          `machine-${product}-${serial}.csv`.replace(/[^a-z0-9.-]+/gi, '-'),
                          columns.filter((c) => c.key !== 'ucn').map((c) => ({ key: c.key, header: String(c.header) })),
                          shown as unknown as Record<string, unknown>[])}>
                  ⭳ Export CSV
                </button>
              )}
            </Toolbar>
            {/* EVERY COUNT HERE IS EXACT — each register was read whole for this
                one machine, not paged — so none of them carries a "+". */}
            <DataTable<Record<string, unknown>>
              columns={columns}
              rows={shown as unknown as Record<string, unknown>[]}
              getRowId={(r) => `${r.source}-${r.ref}-${r.on}-${r.detail}`}
            />
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              This is what <b>this</b> system holds. Anything from before the migration lives in
              the old system and is not shown here.
            </p>
          </SectionCard>
        </>
      )}
    </div>
  );
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="field-label">{label}</div>
    <div style={{ fontWeight: 600 }}>{value}</div>
  </div>
);

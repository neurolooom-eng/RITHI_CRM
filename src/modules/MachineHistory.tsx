import { useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { SelectPicker } from '../components/ui/SelectPicker';
import { supabaseConfigured, sbListProductNames, sbListProductSerials } from '../lib/supabase';
import { archiveNote, machineHistory, machineNow, type MachineEvent, type MachineNow } from '../lib/machineHistory';
// ONE RENDERING OF A MACHINE'S LIFE, shared with the pop-up the Daily
// Complaint Review Register opens. A second copy would drift, and the drift
// would be invisible -- both would look perfectly reasonable.
import { MachineHistoryView } from '../components/machine/MachineHistoryView';
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

  const archiveRows = (events ?? []).filter((e) => e.archive).length;

  // WHAT THE SCREEN CANNOT SEE, said where the counts are. An archive that is
  // unconfigured or unreachable must not read as a machine with no past.
  // It stays on the SCREEN rather than moving into MachineHistoryView: the
  // shared view has no header, and the pop-up opened from the review desk is
  // about one call's machine rather than about how this device is configured.
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

  return (
    <div>
      <PageHeader
        title="Machine History" icon="🔎"
        subtitle="One machine — where it is now, and everything ever recorded against it."
        count={events ? events.length : undefined} countMore={false}
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

      <MachineHistoryView product={product} serial={serial} now={now} events={events} />
    </div>
  );
}

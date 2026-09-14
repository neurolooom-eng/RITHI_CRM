import { useEffect, useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { FacetChips, PageHeader, SectionCard } from '../components/ui/ui';
import { PickList } from '../components/ui/PickList';
import { Ucn } from '../lib/callstate';
import { useCallStates, callStateFor } from '../lib/callstates';
import { archiveConfigured, archiveSearchMachines, type ArchiveMachine } from '../lib/archive';
import { loadMachineHistory, type HistoryEvent, type MachineHistory } from '../lib/prodhistory';
import { sbListProductNames, sbSearchMachines, supabaseConfigured, type MachineHit, type ProductName } from '../lib/supabase';
import './fieldcalls.css';
import './prodhistory.css';

// ===========================================================================
// PRODUCT HISTORY — everything that has ever happened to ONE machine.
//
// "Has this happened to this machine before?" is the oldest question on the
// service desk and the hardest one to answer here, because the answer was
// split across five registers and, from 2016 to the cut-over, across a
// different system entirely.
//
// This screen is one machine, one timeline, in date order: the calls, the
// visits, the parts fitted and the cover it was under. The live half comes
// from the registers; the half before the cut-over comes from the archive
// project, which src/lib/archive.ts reaches and nothing else here knows about.
//
// ── Three decisions worth not undoing ──────────────────────────────────────
//
// THE MACHINE IS THE MODEL AND THE SERIAL. The picker is product-then-serial
// and never serial alone. Serials repeat — this install base has eleven
// machines numbered "219" — and a history screen keyed on the number would
// show one hospital's faults to another. The same rule that made the Hotline
// desk offer VEGA 201 for a call about ORION-G 201.
//
// WHERE EACH ROW CAME FROM IS ON THE ROW. The two halves are not equally
// trustworthy: a live call's state is derived from its latest visit under
// policies that decide whether you may see it at all, while an archive call
// carries whatever the old system was told when somebody closed it. One list
// without that column would promise the same standard of evidence for both.
//
// AN ARCHIVE THAT IS NOT THERE IS A LINE, NOT A FAILURE. Unconfigured,
// unreachable, or simply not loaded yet — the live half still renders and the
// screen says what is missing. A history that shows 2024 and admits it cannot
// see 2016 is useful; an error page instead of both halves is not.
// ===========================================================================

const g = (r: HistoryEvent, k: keyof HistoryEvent) => String(r[k] ?? '');

export function ProductHistory() {
  const [product, setProduct] = useState('');
  const [serial, setSerial] = useState('');
  const [products, setProducts] = useState<ProductName[]>([]);
  const [hits, setHits] = useState<{ serial: string; party: string; city: string; from: string }[]>([]);
  const [hist, setHist] = useState<MachineHistory | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState('');
  const [source, setSource] = useState('');

  const onDb = supabaseConfigured();
  const onArchive = archiveConfigured();

  useEffect(() => {
    if (!onDb) return;
    let cancelled = false;
    void sbListProductNames()
      .then((rows) => { if (!cancelled) setProducts(rows); })
      .catch(() => { if (!cancelled) setProducts([]); });
    return () => { cancelled = true; };
  }, [onDb]);

  // ─────────────────────────────────────────────────────────────────────────
  // THE SERIAL PICKER ASKS BOTH DATABASES.
  //
  // A ventilator sold in 2016 and retired in 2021 is in the archive and NOT in
  // Product Master — so a picker fed only by the live register cannot reach the
  // history of exactly the machines the archive exists to cover. Both are
  // searched, the results are merged on the serial, and a machine only the
  // archive knows says so in its row: it is a machine nobody can raise a call
  // against, and finding that out after picking it would be worse.
  // ─────────────────────────────────────────────────────────────────────────
  const searchSerials = async (q: string): Promise<string[]> => {
    const [live, arc] = await Promise.all([
      onDb ? sbSearchMachines(product, q, 50).catch((): MachineHit[] => []) : Promise.resolve([] as MachineHit[]),
      onArchive ? archiveSearchMachines(product, q, 50) : Promise.resolve([] as ArchiveMachine[]),
    ]);
    const merged = new Map<string, { serial: string; party: string; city: string; from: string }>();
    for (const m of live) merged.set(m.serial, { serial: m.serial, party: m.party, city: m.city, from: 'Live' });
    for (const m of arc) {
      if (merged.has(m.serial)) continue;
      merged.set(m.serial, { serial: m.serial, party: m.party_name, city: m.city, from: 'Archive only' });
    }
    const rows = [...merged.values()];
    setHits(rows);
    return rows.map((r) => r.serial);
  };

  const open = async (p: string, s: string) => {
    if (!p.trim() || !s.trim()) { setHist(null); return; }
    setBusy(true); setErr(''); setKind(''); setSource('');
    try {
      setHist(await loadMachineHistory(p, s));
    } catch (e) {
      setErr((e as Error).message || 'Could not load this machine.');
      setHist(null);
    } finally {
      setBusy(false);
    }
  };

  const events = hist?.events ?? [];
  const shown = useMemo(
    () => events.filter((e) => (!kind || e.kind === kind) && (!source || e.source === source)),
    [events, kind, source],
  );

  // THE COLOUR ON A UCN IS THE CALL'S STATE, wherever the UCN appears — and
  // this screen knows the UCNs but not their states, so it asks for them in one
  // request, exactly as the spare registers do. ARCHIVE UCNs ARE NOT ASKED
  // ABOUT: they belong to calls the live project has never heard of, so they
  // render plain. A wrong colour on a code people read is worse than no colour.
  useCallStates(events.filter((e) => e.source === 'Live').map((e) => e.ucn).filter(Boolean));

  const facet = (pick: (e: HistoryEvent) => string) => {
    const n = new Map<string, number>();
    // COUNTED OVER EVERYTHING, not over what the other chip has already
    // filtered out — a facet row whose numbers change when you click the row
    // above it cannot be read as "how much of each is there".
    for (const e of events) {
      const k = pick(e);
      if (k) n.set(k, (n.get(k) ?? 0) + 1);
    }
    return [...n.entries()].map(([key, count]) => ({ key, count }));
  };

  const columns: Column<HistoryEvent>[] = [
    { key: 'at', header: 'Date', width: 110, wrap: false,
      render: (r) => (r.at ? <span>{r.at}</span> : <span className="muted">—</span>) },
    { key: 'kind', header: 'What', width: 90, wrap: false },
    // WHERE IT CAME FROM, as a word rather than a colour: the colour code in
    // this application means the CALL STATE and nothing else, and a second
    // colour language on the same row would break the first one.
    { key: 'source', header: 'Source', width: 100, wrap: false,
      render: (r) => (r.source === 'Archive'
        ? <span className="muted" title={r.origin || 'Loaded from the archive project'}>Archive</span>
        : <span>Live</span>) },
    { key: 'ucn', header: 'UCN', width: 130, wrap: false,
      render: (r) => (r.source === 'Live'
        ? <Ucn ucn={r.ucn} state={callStateFor(r.ucn)} />
        : <Ucn ucn={r.ucn} />) },
    { key: 'what', header: 'Detail', width: 320,
      render: (r) => (
        <span>
          {g(r, 'what') || <span className="muted">—</span>}
          {r.detail ? <span className="muted"> · {r.detail}</span> : null}
        </span>
      ) },
    { key: 'status', header: 'Status', width: 150 },
    { key: 'engineer', header: 'Engineer', width: 150 },
  ];

  const facts = hist?.facts ?? null;
  const capped = hist?.capped ?? false;

  return (
    <div className="page">
      <PageHeader
        title="Product History"
        subtitle="Every call, visit, part and cover for one machine — the live registers and the 2016 archive in one timeline."
        icon={<span>🕰️</span>}
        count={hist ? shown.length : undefined}
        // EXACT UNLESS A PAGE CAME BACK FULL. One machine's whole history is
        // loaded in one go, so this is normally the real number and a "+" would
        // be wrong in the other direction — the Daily Call Review's lesson.
        countMore={capped}
        onRefresh={hist ? () => open(product, serial) : undefined}
        refreshing={busy}
        status={
          <span className={onArchive ? 'muted' : 'ph-unset'}>
            {onArchive
              ? 'Archive connected.'
              : 'Archive not connected — showing the live registers only. Settings → Archive (Product History).'}
          </span>
        }
      />

      <SectionCard title="Which machine">
        <div className="muted" style={{ marginBottom: 10 }}>
          A machine is its <b>model and its serial</b>, never the serial alone — serials repeat
          across models, and the number by itself lands on a different machine at a different
          hospital. Pick the product first; the serial box then searches both databases.
        </div>
        <div className="ph-grid">
          <label className="ph-field">
            <span className="field-label">Product</span>
            <PickList
              value={product}
              options={products.map((p) => p.name)}
              onPick={(v) => { setProduct(v); setSerial(''); setHist(null); }}
              placeholder="Type to search products"
              emptyLabel="— pick the product —"
              emptyHint="Products come from the register of machines actually on site."
            />
          </label>
          <label className="ph-field">
            <span className="field-label">Serial</span>
            <PickList
              value={serial}
              options={serial ? [serial] : []}
              onSearch={searchSerials}
              plainValue
              onPick={(v) => { setSerial(v); void open(product, v); }}
              disabled={!product}
              placeholder="Type a serial to find the machine"
              emptyLabel={product ? '— pick the machine —' : 'Pick a product above first'}
              emptyHint="Searched across the live register and the archive."
              labelFor={(v) => {
                const m = hits.find((h) => h.serial === v);
                if (!m) return v;
                return (
                  <>
                    {v} <span className="muted">· {m.party || '—'}{m.city ? ` · ${m.city}` : ''}
                      {m.from === 'Archive only' ? ' · archive only' : ''}</span>
                  </>
                );
              }}
            />
          </label>
        </div>
      </SectionCard>

      {err && <div className="sheet-banner-error" style={{ marginTop: 12 }}>{err}</div>}

      {facts && (
        <SectionCard title={`${facts.product} ${facts.serial}`}>
          <div className="ph-grid">
            <div className="ph-field"><span className="field-label">Customer</span><div>{facts.party || '—'}</div></div>
            <div className="ph-field"><span className="field-label">Site</span><div>{[facts.city, facts.state].filter(Boolean).join(', ') || '—'}</div></div>
            <div className="ph-field"><span className="field-label">Status</span><div>{facts.itemStatus || '—'}</div></div>
            <div className="ph-field"><span className="field-label">Warranty</span>
              <div>{facts.warrantyNumber || '—'}{facts.warrantyEnd ? ` · to ${facts.warrantyEnd}` : ''}</div></div>
            <div className="ph-field"><span className="field-label">Contract</span>
              <div>{facts.contractNumber || '—'}{facts.contractType ? ` · ${facts.contractType}` : ''}
                {facts.contractEnd ? ` · to ${facts.contractEnd}` : ''}</div></div>
            <div className="ph-field"><span className="field-label">Known from</span>
              <div>
                {facts.from === 'Live'
                  ? 'Product Master'
                  : 'The archive only — this machine is not on the live register'}
                {facts.installedOn ? ` · installed ${facts.installedOn}` : ''}
              </div></div>
          </div>
        </SectionCard>
      )}

      {hist && (
        <>
          <div className="muted ph-summary">
            {/* WHAT WAS FOUND, AND WHAT COULD NOT BE LOOKED FOR. An archive that
                is unreachable must not read as a machine with no past. */}
            Live: {hist.live.calls} calls · {hist.live.visits} visits · {hist.live.parts} parts.
            {' '}
            {hist.archive.ok
              ? `Archive: ${hist.archive.calls} calls · ${hist.archive.visits} visits · ${hist.archive.parts} parts.`
              : hist.archive.reason === 'not-configured'
                ? 'Archive: not connected, so nothing before the cut-over is shown.'
                : `Archive: could not be read (${hist.archive.reason}).`}
          </div>

          <FacetChips
            options={facet((e) => e.kind)}
            value={kind}
            onChange={setKind}
            allLabel="Everything"
            more={capped}
          />
          <FacetChips
            options={facet((e) => e.source)}
            value={source}
            onChange={setSource}
            allLabel="Both databases"
            more={capped}
          />

          <DataTable
            columns={columns}
            rows={shown}
            getRowId={(r) => r.id}
            storageKey="product-history"
            emptyText={busy ? 'Loading…' : 'Nothing recorded against this machine.'}
          />
        </>
      )}
    </div>
  );
}

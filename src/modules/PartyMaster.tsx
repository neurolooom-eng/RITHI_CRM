import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, Drawer } from '../components/ui/ui';
import { PickList } from '../components/ui/PickList';
import { SelectPicker } from '../components/ui/SelectPicker';
import { csvExport, timeAgo } from '../lib/format';
import {
  queryParties, updateParty, getParty, supabaseConfigured,
  partyServiceEngineerCounts, renamePartyServiceEngineer, sbDirectoryNames,
  type PartyFilter, type PartyPatch,
} from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS } from '../lib/cache';
import { useAuth } from '../lib/auth';
import { MAX_UPLOAD_BYTES, uploadToDrive } from '../lib/sheets';
import { kycDocs, withKycDoc, withoutKycDoc, isKycVerified, type KycDoc } from '../lib/kyc';
// `kb-form` / `kb-form-actions` live here. Imported rather than relied on:
// they reach this screen today only because another module happens to pull the
// file in, and a form that loses its layout when somebody code-splits the app
// is a bug waiting for a build change.
import './knowledgebase.css';
import { partial } from '../lib/exportscope';

// ===========================================================================
// PARTY MASTER — live from Supabase `parties`, with a local browser cache +
// last-sync (like the Call Register): instant load from cache, 30-min auto
// refresh, manual force-sync. Field filters (Party / City / State / Type)
// query the server live; the unfiltered browse set is what gets cached.
// ===========================================================================

const CACHE_KEY = 'partyMaster';
const PAGE = 1000;
type Row = Record<string, unknown> & { id: string };

// THE CURATED SET IS WHAT YOU SEE WITHOUT ASKING, and that is the whole
// reason this list exists beside `allFields`. Everything on the row is
// ADDABLE from the ⚙ Columns picker; only what is here is visible by default.
//
// So a column added to the table (0200's Serviceman, 0201's contact blocks and
// KYC) reaches a reader only when it is added HERE too. Reported the day after
// they shipped: "Why is the party Master not showing any of the Columns?" —
// they were in the database and in the picker, and on screen there were still
// six. A field nobody can see is a field nobody fills in.
const COLUMNS: Column<Row>[] = [
  // Assigned once, on first load, and never reassigned (0076).
  { key: 'party_key', header: 'Key', width: 95, wrap: false },
  { key: 'party_name', header: 'Party Name', width: 300 },
  { key: 'city', header: 'City', width: 150 },
  { key: 'state', header: 'State', width: 150 },
  { key: 'party_type', header: 'Type', width: 130 },
  // PRIVATE / GOVERNMENT — its own question, and its own column since 0201.
  { key: 'profile', header: 'Profile', width: 120 },
  { key: 'address', header: 'Address', width: 300 },
  { key: 'pincode', header: 'Pincode', width: 100, wrap: false },
  // WHO LOOKS AFTER THIS CUSTOMER (0200) — what fills "Call Allocated To" on a
  // new call where the machine has no Service Engineer of its own.
  { key: 'service_engineer', header: 'Serviceman', width: 170 },
  { key: 'phone', header: 'Phone', width: 130, wrap: false },
  { key: 'email', header: 'Email', width: 200, wrap: false },
  // KYC. The status is on the face of the register because it is the thing
  // being worked THROUGH — every party starts Pending, and a queue you cannot
  // see is not a queue.
  // THE STATUS AND ITS EVIDENCE, BOTH IN THE TABLE (the user, 2026-09-22:
  // "Display KYC and Report in the table view itself"). Commercial decides
  // whether to proceed from this row; opening a drawer per customer to find out
  // is the step the request is about.
  { key: 'kyc_status', header: 'KYC', width: 130, wrap: false,
    render: (r) => <KycChip status={r.kyc_status} /> },
  { key: 'kyc_docs', header: 'KYC Records', width: 150, wrap: false,
    // A LINK PER RECORD, not a count: the point is to open the certificate, and
    // a number tells somebody there is one without letting them see it.
    render: (r) => {
      const docs = kycDocs(r.kyc_docs);
      if (!docs.length) return <span className="muted">—</span>;
      return (
        <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          {docs.map((d, i) => (
            <a key={d.url} href={d.url} target="_blank" rel="noreferrer" title={d.name || d.url}
               onClick={(e) => e.stopPropagation()}>
              📄 {docs.length > 1 ? i + 1 : 'Open'}
            </a>
          ))}
        </span>
      );
    } },
  { key: 'gstin', header: 'GSTIN', width: 160, wrap: false },
  { key: 'pan', header: 'PAN', width: 120, wrap: false },
];

// WHAT THE DRAWER EDITS, and the order it reads in. The PARTY NAME is not on
// it: everything else names this customer by that string — every machine, call
// and contract — and there is no foreign key to `parties`, so renaming it from
// a text box would strand all of them. Same reason a part is renamed by a
// function that carries its history (0196) and not by typing over it.
const EDIT_GROUPS: { title: string; note?: string; fields: { key: keyof PartyPatch; label: string }[] }[] = [
  { title: 'The customer', fields: [
    { key: 'party_type', label: 'Type' },
    { key: 'profile', label: 'Profile' },
    { key: 'service_engineer', label: 'Serviceman' },
    { key: 'route', label: 'Route' },
  ] },
  { title: 'Where the machine is', note: 'The installation address — this is what a call sends somebody to.', fields: [
    { key: 'address', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'pincode', label: 'Pincode' },
    { key: 'phone', label: 'Phone' },
    { key: 'phone_2', label: 'Phone 2' },
    { key: 'fax', label: 'Fax' },
    { key: 'email', label: 'Email' },
  ] },
  { title: 'Where the bill goes', note: 'Left blank means the same as above.', fields: [
    { key: 'billing_address', label: 'Address' },
    { key: 'billing_pincode', label: 'Pincode' },
    { key: 'billing_phone', label: 'Phone' },
    { key: 'billing_phone_2', label: 'Phone 2' },
    { key: 'billing_fax', label: 'Fax' },
    { key: 'billing_email', label: 'Email' },
  ] },
];

const KYC_STATUSES = ['Pending', 'Verified', 'Rejected'];

// KYC VERIFIED, SAID ONCE, WHEREVER IT APPEARS. Commercial reads this before a
// sale entry and an installation call; the register and the drawer must not
// describe the same customer differently.
const KycChip = ({ status }: { status: unknown }) => (
  isKycVerified(status)
    ? <span className="badge badge-ok" title="Cleared for a Sale Entry and an installation call">✓ KYC Verified</span>
    : <span className="muted">{String(status ?? 'Pending') || 'Pending'}</span>
);

const toRows = (data: Record<string, unknown>[], base: number): Row[] => data.map((p, i) => ({ ...p, id: String(p.id ?? base + i) } as Row));

export function PartyMaster() {
  const cached = loadCache<Row>(CACHE_KEY);
  const [filter, setFilter] = useState<PartyFilter>({ name: '', city: '', state: '', type: '' });
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [offset, setOffset] = useState(cached?.rows.length ?? 0);
  const [more, setMore] = useState((cached?.rows.length ?? 0) >= PAGE);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load Party Master.' },
  );
  const { can, user } = useAuth();
  const mayEdit = can('masters.edit') && supabaseConfigured();
  const [uploading, setUploading] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);

  // ---- Change engineer: one spelling, every customer that names it ---------
  // 32 of the 49 Servicemen on the supplied export match no User Master name,
  // and `allocated_to` on a call is a NAME — so those prefill a box with
  // somebody who does not exist and notify nobody. 328 customers share the
  // worst one. Correcting that by opening 328 parties is not a repair anybody
  // performs, which is why this exists.
  const [swap, setSwap] = useState<{ from: string; to: string; cleared?: boolean } | null>(null);
  const [svcCounts, setSvcCounts] = useState<{ key: string; count: number }[] | null>(null);
  const [dirNames, setDirNames] = useState<string[]>([]);

  const openSwap = async () => {
    setSwap({ from: '', to: '' });
    setSvcCounts(null);
    try {
      const [counts, names] = await Promise.all([partyServiceEngineerCounts(), sbDirectoryNames()]);
      setSvcCounts(counts);
      setDirNames(names);
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not read the servicemen: ${e instanceof Error ? e.message : String(e)}` });
      setSwap(null);
    }
  };

  const applySwap = async () => {
    if (!swap) return;
    setSaving(true);
    const res = await renamePartyServiceEngineer(swap.from, swap.to);
    setSaving(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not change it.' }); return; }
    setSwap(null);
    setMsg({ tone: 'ok', text: res.changed
      ? `${res.changed} customer${res.changed === 1 ? '' : 's'} now read ${swap.to || '— nobody —'}.`
      : 'Nothing named that spelling, so nothing changed.' });
    await refresh();
  };
  const set = (k: keyof PartyFilter, v: string) => setFilter((c) => ({ ...c, [k]: v }));
  const setEditField = (k: string, v: string) => setEdit((r) => r && ({ ...r, [k]: v }));

  // ATTACHING A KYC RECORD SAVES IMMEDIATELY, rather than waiting for Save.
  // The file is already in Drive by then; leaving the link in an unsaved draft
  // means a Cancel loses it and the document sits in Drive attached to nothing.
  const writeDocs = async (docs: KycDoc[], note: string) => {
    if (!edit) return;
    setSaving(true);
    const res = await updateParty(Number(edit.id), { kyc_docs: docs });
    setSaving(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not save the KYC record.' }); return; }
    setEdit((r) => r && ({ ...r, kyc_docs: docs }));
    setRows((rs) => rs.map((r) => (r.id === edit.id ? { ...r, kyc_docs: docs } as Row : r)));
    setMsg({ tone: 'ok', text: note });
  };

  const attachKyc = async (f: File | null) => {
    if (!f || !edit) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      setMsg({ tone: 'error', text: `${f.name} is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` });
      return;
    }
    setUploading(true);
    setMsg({ tone: 'info', text: `Uploading ${f.name} to Drive…` });
    // THE KYC FOLDER, named after the customer -- so a record is findable in
    // Drive by the name somebody would look for it under.
    const res = await uploadToDrive(f, `KYC - ${String(edit.party_name ?? '')}`, 'kyc');
    setUploading(false);
    if (!res.ok || !res.url) { setMsg({ tone: 'error', text: res.error ?? 'Upload failed.' }); return; }
    // WHO ATTACHED IT AND WHEN. A KYC record whose provenance is unknown is the
    // same problem one step along. `fullName`, never `name` -- that field does
    // not exist and type-checks anyway.
    const doc: KycDoc = {
      name: f.name, url: res.url,
      at: new Date().toISOString(),
      by: String(user?.fullName ?? user?.email ?? ''),
    };
    await writeDocs(withKycDoc(edit.kyc_docs, doc), `${f.name} attached.`);
  };

  const removeKyc = async (d: KycDoc) => {
    if (!edit) return;
    // THE FILE STAYS IN DRIVE. This unlinks the record from the party; deleting
    // the document itself is not something a register should do silently, and a
    // KYC record somebody relied on is worth keeping wherever it sits.
    if (!window.confirm(`Remove "${d.name || 'this record'}" from this customer's KYC records?\n\nThe file itself stays in Drive.`)) return;
    await writeDocs(withoutKycDoc(edit.kyc_docs, d.url), 'Record removed.');
  };

  const saveEdit = async () => {
    if (!edit) return;
    setSaving(true);
    // ONLY THE EDITABLE KEYS ARE SENT. The row carries generated columns
    // (`name_key`), the stamps the database owns (`kyc_verified_by`) and the
    // kept-as-is blob; writing the row back whole would either be refused or
    // would let this form sign somebody else's name to a verification.
    const patch: PartyPatch = {};
    EDIT_GROUPS.forEach((g) => g.fields.forEach(({ key }) => {
      (patch as Record<string, unknown>)[key] = String(edit[key as string] ?? '');
    }));
    (['gstin', 'pan', 'kyc_status', 'kyc_notes'] as const).forEach((k) => {
      patch[k] = String(edit[k] ?? '');
    });
    const res = await updateParty(Number(edit.id), patch);
    setSaving(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not save.' }); return; }
    // RE-READ THE ONE ROW rather than patching it in place: the database
    // DERIVES things this form did not send — the GSTIN and PAN out of the Tax
    // columns, and who verified it and when (0201) — so the row on screen would
    // otherwise disagree with the row that was written. One row rather than a
    // whole refresh, so a reader who has pressed "Load more" keeps their place.
    try {
      const fresh = await getParty(Number(edit.id));
      if (fresh) setRows((rs) => rs.map((r) => (r.id === edit.id ? { ...fresh, id: r.id } as Row : r)));
    } catch { /* the write succeeded; a failed re-read is not worth an error */ }
    setEdit(null);
    setMsg({ tone: 'ok', text: 'Saved.' });
  };
  const hasFilter = !!(filter.name || filter.city || filter.state || filter.type);

  // Force-sync the browse set (no filters) and cache it.
  const refresh = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true);
    try {
      const data = await queryParties({}, 0, PAGE);
      const r = toRows(data, 0);
      setRows(r); setOffset(r.length); setMore(r.length === PAGE);
      setLastSync(saveCache(CACHE_KEY, r));
      setMsg({ tone: 'ok', text: `Synced ${r.length}${r.length === PAGE ? '+' : ''} parties.` });
    } catch (e) {
      setMsg({ tone: 'error', text: `Sync failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  // Mount: show cache, refresh if stale/empty. 30-min auto force-sync.
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return; mounted.current = true;
    if (!supabaseConfigured()) return;
    if (!rows.length || isStale(lastSync)) void refresh();
    else setMsg({ tone: 'info', text: `Showing cached data — synced ${timeAgo(lastSync)}. ↻ Refresh to update.` });
    const id = window.setInterval(() => { if (!hasFilter) void refresh(); }, SYNC_TTL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filters: query the server live (debounced). Clearing them restores the cache.
  useEffect(() => {
    if (!mounted.current || !supabaseConfigured()) return;
    if (!hasFilter) {
      const c = loadCache<Row>(CACHE_KEY);
      if (c) { setRows(c.rows); setOffset(c.rows.length); setMore(c.rows.length >= PAGE); setLastSync(c.at); }
      return;
    }
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const data = await queryParties(filter, 0, PAGE);
        setRows(toRows(data, 0)); setOffset(data.length); setMore(data.length === PAGE);
        setMsg({ tone: 'ok', text: `${data.length}${data.length === PAGE ? '+' : ''} parties matched (live).` });
      } catch (e) {
        setMsg({ tone: 'error', text: `Search failed: ${e instanceof Error ? e.message : String(e)}` });
      } finally { setBusy(false); }
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.name, filter.city, filter.state, filter.type]);

  const loadMore = async () => {
    setBusy(true);
    try {
      const data = await queryParties(hasFilter ? filter : {}, offset, PAGE);
      const merged = [...rows, ...toRows(data, rows.length)];
      setRows(merged); setOffset(offset + data.length); setMore(data.length === PAGE);
      if (!hasFilter) setLastSync(saveCache(CACHE_KEY, merged));
    } catch (e) {
      setMsg({ tone: 'error', text: `Load more failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  // Every other field on the row, addable from the ⚙ Columns picker.
  //
  // NO `header` HERE, and that is the fix rather than an omission: passing the
  // raw column name made the picker offer "billing_phone_2". DataTable falls
  // back to `humanize(key)` when a field has no header of its own, which reads
  // "Billing Phone 2" — the name of the thing rather than the name of the
  // column. A curated header in COLUMNS above still wins for the ones that
  // need a better word than their key ("Serviceman", "KYC").
  const allFields = useMemo(() => {
    const ks = new Set<string>();
    rows.slice(0, 40).forEach((r) => Object.keys(r).forEach((k) => { if (k && k !== 'id' && k !== 'extra') ks.add(k); }));
    return [...ks].map((k) => ({ key: k }));
  }, [rows]);

  return (
    <div>
      <PageHeader
        onRefresh={() => void refresh()}
        refreshing={busy}
        syncedAt={lastSync} title="Party Master" subtitle="Customers / parties — cached locally, synced from the database." icon="🏥"
        // A COUNT OVER PARTLY-LOADED DATA IS A LOWER BOUND AND MUST SAY SO.
        // This register pages a thousand at a time and the real file has 4,752
        // parties, so the badge read a flat "1,000" — a number that looks exact,
        // is not, and is the one somebody quotes.
        count={rows.length} countMore={more} />
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      <DataTable<Row>
        columns={COLUMNS}
        allFields={allFields}
        rows={rows}
        getRowId={(r) => r.id}
        storageKey="partyMaster"
        rowsBeforeScroll={16}
        dense
        onLoadMore={loadMore}
        moreAvailable={more}
        loadingMore={busy}
        emptyText={busy ? 'Loading…' : 'No parties match.'}
        onRowClick={mayEdit ? (r) => setEdit(r) : undefined}
        toolbar={
          <Toolbar>
            <div className="call-search">
              <input className="input" placeholder="Party name" value={filter.name} onChange={(e) => set('name', e.target.value)} />
              <input className="input" placeholder="State" value={filter.state} onChange={(e) => set('state', e.target.value)} />
              <input className="input" placeholder="City" value={filter.city} onChange={(e) => set('city', e.target.value)} />
              <input className="input" placeholder="Type" value={filter.type} onChange={(e) => set('type', e.target.value)} />
            </div>
            <div className="spacer" />
            {mayEdit && (
              <button className="btn btn-sm" onClick={() => void openSwap()} title="Change one Serviceman everywhere it appears">
                ✎ Change engineer
              </button>
            )}
            {rows.length > 0 && (
              <button className="btn btn-sm" onClick={() => csvExport('party-master.csv', COLUMNS.map((c) => ({ key: c.key, header: c.header })), rows as unknown as Record<string, unknown>[], partial(more))}>⭳ Export CSV</button>
            )}
          </Toolbar>
        }
      />

      {swap && (() => {
        const chosen = svcCounts?.find((o) => o.key === swap.from);
        const known = new Set(dirNames.map((n) => n.toLowerCase()));
        // WHICH SPELLINGS ARE THE PROBLEM, said on the list itself rather than
        // left to be worked out. A name the User Master does not hold is the
        // one worth changing; one it does hold is probably fine.
        const fromOptions = (svcCounts ?? []).map((o) => ({
          value: o.key,
          label: `${o.key} · ${o.count}${known.has(o.key.toLowerCase()) ? '' : '  ⚠ not in User Master'}`,
        }));
        return (
          <Drawer open title="Change engineer" onClose={() => setSwap(null)} width={560} storeKey="partySwap">
            <div className="kb-form">
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                Changes one Serviceman everywhere it appears on the Party Master, in one go.
                It is worth doing when a spelling here does not match the <b>User Master</b>:
                a call is allotted by NAME, so a name nobody holds fills the box with somebody
                who does not exist and notifies no one.
              </p>

              <div className="field">
                <label className="field-label">Change this</label>
                {svcCounts === null
                  ? <span className="muted">Reading every party…</span>
                  : (
                    <SelectPicker
                      value={swap.from}
                      options={fromOptions}
                      onChange={(v) => setSwap((w) => w && ({ ...w, from: v }))}
                      placeholder="Pick the spelling to correct…"
                    />
                  )}
              </div>

              <div className="field">
                <label className="field-label">To this</label>
                {/* FROM THE USER MASTER, AND NO FREE TEXT. The whole reason to
                    do this is that the name must MATCH; letting somebody type
                    one recreates exactly the fault being repaired.
                    CLEARING IS ITS OWN CONTROL rather than an empty option:
                    SelectPicker drops a blank-valued option (PickList has its
                    own "— none —" and two of them read as a bug), so an entry
                    for it would silently not be there. */}
                <label className="kb-check" style={{ marginBottom: 6 }}>
                  <input type="checkbox" checked={swap.to === '' && swap.cleared}
                    onChange={(e) => setSwap((w) => w && ({ ...w, to: '', cleared: e.target.checked }))} />
                  Leave nobody — this engineer has gone
                </label>
                <SelectPicker
                  value={swap.to}
                  disabled={swap.cleared}
                  options={dirNames}
                  onChange={(v) => setSwap((w) => w && ({ ...w, to: v, cleared: false }))}
                  placeholder="Pick the User Master name…"
                />
              </div>

              {/* THE SIZE OF WHAT IS ABOUT TO MOVE, BEFORE it moves. A count
                  afterwards is a report; a count beforehand is a decision.
                  Same rule as renaming a part (0196). */}
              {swap.from && (
                <div className={`sheet-banner ${(chosen?.count ?? 0) > 50 ? 'sheet-banner-warn' : 'sheet-banner-info'}`}>
                  <span>
                    <b>{chosen?.count ?? 0}</b> customer{(chosen?.count ?? 0) === 1 ? '' : 's'} name
                    {' '}<b>{swap.from}</b> and will read{' '}
                    <b>{swap.to || '— nobody —'}</b> instead.
                    {' '}Calls already registered keep the engineer they were allotted to.
                  </span>
                </div>
              )}

              <div className="kb-form-actions">
                <button className="btn btn-primary"
                  disabled={saving || !swap.from || swap.from === swap.to || (!swap.to && !swap.cleared)}
                  onClick={() => void applySwap()}>
                  {saving ? 'Changing…' : `Change ${chosen?.count ?? 0} customer${(chosen?.count ?? 0) === 1 ? '' : 's'}`}
                </button>
                <button className="btn" disabled={saving} onClick={() => setSwap(null)}>Cancel</button>
              </div>
            </div>
          </Drawer>
        );
      })()}

      {edit && (
        <Drawer open title={String(edit.party_name ?? 'Party')} onClose={() => setEdit(null)} width={620} storeKey="partyEdit">
          <div className="kb-form">
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              The <b>party name</b> is not editable here. Every machine, call and contract names this
              customer by it, so changing it would strand them — ask for a rename rather than typing over it.
            </p>

            {EDIT_GROUPS.map((g) => (
              <div key={g.title}>
                <h4 style={{ margin: '14px 0 4px' }}>{g.title}</h4>
                {g.note && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{g.note}</div>}
                {g.fields.map(({ key, label }) => (
                  <div className="field" key={key}>
                    <label className="field-label">{label}</label>
                    <input className="input" value={String(edit[key as string] ?? '')}
                      onChange={(e) => setEditField(key as string, e.target.value)} />
                  </div>
                ))}
              </div>
            ))}

            <h4 style={{ margin: '14px 0 4px' }}>KYC</h4>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Every customer starts <b>Pending</b>. Marking one <b>Verified</b> records who did it and
              when, from your sign-in — and sending it back to Pending clears that again.
            </div>
            <div className="field">
              <label className="field-label">GSTIN</label>
              <input className="input" value={String(edit.gstin ?? '')}
                onChange={(e) => setEditField('gstin', e.target.value)} />
              <span className="muted" style={{ fontSize: 12 }}>
                15 characters. A GSTIN contains a PAN, so filling this fills the PAN too.
              </span>
            </div>
            <div className="field">
              <label className="field-label">PAN</label>
              <input className="input" value={String(edit.pan ?? '')}
                onChange={(e) => setEditField('pan', e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Status</label>
              {/* THREE OPTIONS, SO NO SEARCH BOX — PickList shows just the list
                  under eight, and making somebody type to reach "Verified" is
                  worse than the dropdown it replaced. */}
              <PickList
                value={String(edit.kyc_status ?? 'Pending')}
                options={KYC_STATUSES}
                onPick={(v) => setEditField('kyc_status', v)}
                placeholder="Pending, Verified or Rejected…"
              />
            </div>
            <div className="field">
              <label className="field-label">Notes</label>
              <textarea className="input" rows={3} value={String(edit.kyc_notes ?? '')}
                onChange={(e) => setEditField('kyc_notes', e.target.value)} />
            </div>
            {String(edit.kyc_verified_at ?? '') && (
              <div className="muted" style={{ fontSize: 12 }}>
                Verified {timeAgo(String(edit.kyc_verified_at))}.
              </div>
            )}

            {/* THE EVIDENCE BEHIND THE STATUS (the user, 2026-09-22). A
                verification with no record behind it is an assertion, and
                Commercial -- who relies on it before a sale entry and an
                installation call -- cannot check it.

                VERIFIED IS STILL VERIFIED WITH NOTHING ATTACHED. The status is
                a decision a person made; refusing to honour it because the
                paperwork was filed elsewhere would make this screen stricter
                than the people it serves. It says separately whether a record
                is here, which is the thing somebody can act on. */}
            <div className="field">
              <label className="field-label">KYC records</label>
              {kycDocs(edit.kyc_docs).length === 0 && (
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                  {isKycVerified(edit.kyc_status)
                    ? 'Marked Verified with no record attached. The status stands — attaching the certificate is what lets somebody else check it.'
                    : 'Nothing attached yet.'}
                </div>
              )}
              {kycDocs(edit.kyc_docs).map((d) => (
                <div key={d.url} className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <a href={d.url} target="_blank" rel="noreferrer">📄 {d.name || 'Record'}</a>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {d.by ? `${d.by} · ` : ''}{d.at ? timeAgo(d.at) : ''}
                  </span>
                  {mayEdit && (
                    <button className="btn btn-sm" disabled={saving}
                      onClick={() => void removeKyc(d)}>Remove</button>
                  )}
                </div>
              ))}
              {mayEdit && (
                <label className="btn btn-sm" style={{ marginTop: 6, display: 'inline-block' }}>
                  {uploading ? 'Uploading…' : '⤴ Attach a KYC record'}
                  <input type="file" style={{ display: 'none' }} disabled={uploading || saving}
                    onChange={(e) => { void attachKyc(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                </label>
              )}
            </div>

            <div className="kb-form-actions">
              <button className="btn btn-primary" disabled={saving} onClick={() => void saveEdit()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn" disabled={saving} onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}

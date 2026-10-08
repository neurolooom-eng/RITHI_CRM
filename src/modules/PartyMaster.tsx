import { partyMissing, type PartyFieldOptions } from '../lib/partyRules';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useColumns } from '../components/ui/useColumns';
import { useLocation } from 'react-router-dom';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, Drawer, Modal } from '../components/ui/ui';
import { PickList } from '../components/ui/PickList';
import { SelectPicker } from '../components/ui/SelectPicker';
import { csvExport, timeAgo } from '../lib/format';
import {
  queryParties, updateParty, getParty, addParty, deleteMasterRecord, supabaseConfigured,
  partyServiceEngineerCounts, renamePartyServiceEngineer, sbDirectoryNames,
  sbActiveUserNames, sbPartyFieldOptions,
  type PartyFilter, type PartyPatch,
} from '../lib/supabase';
import { loadCache, saveCache, isStale, SYNC_TTL_MS, startBackgroundSync } from '../lib/cache';
import { useAuth } from '../lib/auth';
import { MAX_UPLOAD_BYTES, uploadToDrive } from '../lib/sheets';
import { kycDocs, withKycDoc, withoutKycDoc, isKycVerified, type KycDoc } from '../lib/kyc';
// `kb-form` / `kb-form-actions` live here. Imported rather than relied on:
// they reach this screen today only because another module happens to pull the
// file in, and a form that loses its layout when somebody code-splits the app
// is a bug waiting for a build change.
import './knowledgebase.css';
import { partial } from '../lib/exportscope';
import { isSysColumn } from '../lib/syscols';

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
  { key: 'country', header: 'Country', width: 130 },
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
const EDIT_GROUPS: { title: string; note?: string; fields: { key: keyof PartyPatch; label: string; wide?: boolean }[] }[] = [
  { title: 'The customer', fields: [
    { key: 'party_type', label: 'Type' },
    { key: 'profile', label: 'Profile' },
    { key: 'service_engineer', label: 'Serviceman' },
    { key: 'route', label: 'Route' },
  ] },
  { title: 'Where the machine is', note: 'The installation address — this is what a call sends somebody to.', fields: [
    { key: 'address', label: 'Address', wide: true },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    // CITY · STATE · COUNTRY ON ONE ROW (the user, 2026-10-03), so the three
    // sit together in the grid, Pincode starting the next.
    { key: 'country', label: 'Country' },
    { key: 'pincode', label: 'Pincode' },
    { key: 'phone', label: 'Phone' },
    { key: 'phone_2', label: 'Phone 2' },
    { key: 'fax', label: 'Fax' },
    { key: 'email', label: 'Email' },
  ] },
  { title: 'Where the bill goes', note: 'Left blank means the same as above.', fields: [
    { key: 'billing_address', label: 'Address', wide: true },
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
    ? <span className="badge badge-ok" title="KYC verified: status, number and documents checked">✓ KYC Verified</span>
    : <span className="muted">{String(status ?? 'Pending') || 'Pending'}</span>
);

const toRows = (data: Record<string, unknown>[], base: number): Row[] => data.map((p, i) => ({ ...p, id: String(p.id ?? base + i) } as Row));

/** One section of the party form: its full-width fields (an address), then
 *  the rest in the 2/3-column grid. Shared by Add entry and the Edit panel so
 *  the two lay a party out the same way. */
// THE DROPDOWNS (the user, 2026-10-08: "Type, Profile, ServiceMan, City,
// State, Country -- all of this should be Drop-down. SERVICEMAN should list
// from user master (Filter Active)"). Type-search-and-select, as every
// dropdown here. CITY, STATE AND COUNTRY also take a value not on their list
// (the user, 2026-10-08: "Allow new values in City, State, Country. Customer,
// Type and Profile should not take new values") -- a customer in a place the
// Party Master has never named is a real customer. TYPE and PROFILE are the
// fixed vocabulary every count groups by, and the SERVICEMAN must be an active
// person on the User Master, so those three take nothing else. The cities
// follow the State chosen.
export function partyPick(k: string, opts: PartyFieldOptions | null, active: string[], state: string):
  { options: string[]; freeText: boolean; empty: string } | null {
  if (k === 'service_engineer') return { options: active, freeText: false, empty: 'Active people on the User Master.' };
  if (!opts) return null;
  if (k === 'party_type' || k === 'profile')
    return { options: opts[k], freeText: false, empty: 'Values already on the Party Master.' };
  if (k === 'state' || k === 'country')
    return { options: opts[k], freeText: true, empty: 'Values already on the Party Master — or type a new one.' };
  if (k === 'city') {
    const inState = opts.cityByState[state.trim().toLowerCase()];
    return { options: inState && inState.length ? inState : opts.city, freeText: true,
             empty: 'Cities already on the Party Master for this state — or type a new one.' };
  }
  return null;
}

function PartyGroupFields({ fields, value, set, pick }: {
  fields: { key: keyof PartyPatch; label: string; wide?: boolean }[];
  value: (k: string) => string;
  set: (k: string, v: string) => void;
  pick?: (k: string) => { options: string[]; freeText: boolean; empty: string } | null;
}) {
  const field = ({ key, label }: { key: keyof PartyPatch; label: string }) => {
    const p = pick?.(key as string) ?? null;
    const v = value(key as string);
    return (
      <div className="ml-field" key={key}>
        <label className="field-label">{label}</label>
        {p
          ? <SelectPicker value={v} placeholder={`— ${label.toLowerCase()} —`}
              options={v && !p.options.some((o) => o.toLowerCase() === v.trim().toLowerCase()) ? [v, ...p.options] : p.options}
              allowFreeText={p.freeText} emptyHint={p.empty}
              onChange={(nv) => set(key as string, nv)} />
          : <input className="input" value={v} onChange={(e) => set(key as string, e.target.value)} />}
        {/* A SERVICEMAN NOT ACTIVE ON THE USER MASTER is said, not silently
            kept or cleared -- the Warranty Entry's rule. */}
        {key === 'service_engineer' && p && p.options.length > 0 && v.trim()
          && !p.options.some((o) => o.toLowerCase() === v.trim().toLowerCase()) && (
          <span className="muted" style={{ fontSize: 12, color: 'var(--danger, #b91c1c)' }}>
            Not an active user on the User Master — choose one from the list.
          </span>
        )}
      </div>
    );
  };
  const narrow = fields.filter((f) => !f.wide);
  return (
    <>
      {fields.filter((f) => f.wide).map(field)}
      {narrow.length > 0 && <div className="pf-grid">{narrow.map(field)}</div>}
    </>
  );
}

export function PartyMaster() {
  const cached = loadCache<Row>(CACHE_KEY);
  const [filter, setFilter] = useState<PartyFilter>({ name: '', city: '', state: '', type: '' });
  const [rows, setRows] = useState<Row[]>(cached?.rows ?? []);
  const [offset, setOffset] = useState(cached?.rows.length ?? 0);
  const [more, setMore] = useState((cached?.rows.length ?? 0) >= PAGE);
  const [lastSync, setLastSync] = useState(cached?.at ?? '');
  const [busy, setBusy] = useState(false);
  // Read by the background sync, which waits while a read is in flight.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    supabaseConfigured() ? null : { tone: 'info', text: 'Connect the database in Settings to load Party Master.' },
  );
  const { can, user } = useAuth();
  // THREE RIGHTS HERE, NOT ONE (finding 67, 0290): editing a party's record,
  // verifying its KYC, and changing the Serviceman on every party at once.
  // ADD, EDIT AND DELETE ARE SEPARATE KEYS (0325, 2026-10-03); "Add / edit
  // master records" still grants the first two.
  const mayAdd = can('masters.parties.add') && supabaseConfigured();
  const mayEdit = can('masters.parties.edit') && supabaseConfigured();
  const mayDelete = can('masters.parties.delete') && supabaseConfigured();
  const mayKyc = can('masters.edit.kyc') && supabaseConfigured();
  const maySwap = can('masters.edit.swap_serviceman') && supabaseConfigured();
  const [uploading, setUploading] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  // WHAT THE DROPDOWNS OFFER: the Party Master's own values (this device's
  // copy first) and the User Master's ACTIVE people for the Serviceman.
  const [fieldOpts, setFieldOpts] = useState<PartyFieldOptions | null>(null);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  useEffect(() => {
    if (!supabaseConfigured()) return;
    void sbPartyFieldOptions().then(setFieldOpts).catch(() => setFieldOpts(null));
    void sbActiveUserNames().then(setActiveUsers).catch(() => setActiveUsers([]));
  }, []);
  // READ-ONLY VIEW of one party (2026-10-01) -- for anybody who may open the
  // Party Master but not change it; until now a click on a row did nothing for
  // them. And FROM THE HEADER SEARCH: the party is fetched by id and opened in
  // the editor for an editor, in this view for everybody else.
  const [view, setView] = useState<Row | null>(null);
  const location = useLocation();
  useEffect(() => {
    const id = (location.state as { openPartyId?: number } | null)?.openPartyId;
    if (!id || !supabaseConfigured()) return;
    window.history.replaceState({}, '');
    void getParty(Number(id)).then((p) => {
      if (!p) { setMsg({ tone: 'error', text: 'That party could not be opened.' }); return; }
      const row = { ...p, id: String(p.id) } as Row;
      if (mayEdit) setEdit(row); else setView(row);
    }).catch((e) => setMsg({ tone: 'error', text: `That party could not be opened: ${e instanceof Error ? e.message : String(e)}` }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);
  const [saving, setSaving] = useState(false);
  const [addRef, addCols] = useColumns();
  const [editRef, editCols] = useColumns();

  // ---- Add entry: a pop-up form, the same as Part Master's ------------------
  // NAME, CITY AND STATE ARE REQUIRED (the user, 2026-10-03); everything else
  // is the Edit form's fields and may be filled later. The Party Key is the
  // database's to give (0076), and a name already on the register is refused.
  const [adding, setAdding] = useState<Record<string, string> | null>(null);
  const [addTried, setAddTried] = useState(false);
  // The list is SHARED with the Warranty sale that adds a party on save
  // (partyRules.ts), so the two cannot ask for different things.
  const addMissing = (a: Record<string, string>) => partyMissing(a);
  const [addErr, setAddErr] = useState('');
  const saveAdd = async () => {
    if (!adding) return;
    setAddTried(true);
    const missing = addMissing(adding);
    if (missing.length) { setAddErr(`Fill ${missing.join(', ')}.`); return; }
    const fields: Record<string, string> = {};
    Object.entries(adding).forEach(([k, v]) => { if (String(v).trim()) fields[k] = String(v).trim(); });
    setSaving(true); setAddErr('');
    const res = await addParty(fields as unknown as PartyPatch & { party_name: string });
    setSaving(false);
    if (!res.ok) { setAddErr(res.error); return; }
    setAdding(null);
    setMsg({ tone: 'ok', text: `${fields.party_name} added to the Party Master${res.partyKey ? ` as ${res.partyKey}` : ''}.` });
    try {
      const fresh = await getParty(res.id);
      if (fresh) setRows((rs) => [{ ...fresh, id: String(fresh.id) } as Row, ...rs]);
    } catch { /* it was written; the next refresh shows it */ }
  };

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
  // ---- Delete: refused by the database while anything names the party -----
  const removeParty = async (r: Row) => {
    const name = String(r.party_name ?? '');
    if (!window.confirm(`Delete "${name}" from the Party Master?\n\nThis cannot be undone. It is refused while any machine, call, sale, contract or spare still names this party.`)) return;
    const res = await deleteMasterRecord('parties', 'id', Number(r.id));
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not delete it.' }); return; }
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    setMsg({ tone: 'ok', text: `${name} deleted from the Party Master.` });
  };
  // THE ACTION BUTTONS ON THE ROW (the user, 2026-10-03: "Action button on the
  // table"). FIRST, not last: the register is thirty columns wide and a
  // button at the far end is a button nobody finds. A click on the row still
  // opens it too.
  const actionColumn: Column<Row> = {
    key: '_actions', header: 'Actions', width: 150, sortable: false, wrap: false,
    render: (r) => (
      <div className="row" style={{ gap: 6 }}>
        {mayEdit && (
          <button className="btn btn-sm" title="Edit this party"
            onClick={(e) => { e.stopPropagation(); setEdit(r); }}>✎ Edit</button>
        )}
        {mayDelete && (
          <button className="btn btn-ghost btn-sm" title="Delete this party — refused while any record names it"
            onClick={(e) => { e.stopPropagation(); void removeParty(r); }}>🗑</button>
        )}
      </div>
    ),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // THE 30-MINUTE SYNC, IN ITS OWN EFFECT so it sees the CURRENT filter.
  // Registered inside the mount-only effect above, its `hasFilter` was the
  // first render's `false` for ever -- so half an hour after somebody filtered
  // the list, it was silently replaced by the unfiltered first page while the
  // filter boxes still showed the filter. Rebuilt whenever the filter turns on
  // or off; no timer at all while one is set.
  useEffect(() => {
    if (!supabaseConfigured() || hasFilter) return;
    return startBackgroundSync(() => { void refresh(); }, () => busyRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFilter]);

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
    rows.slice(0, 40).forEach((r) => Object.keys(r).forEach((k) => { if (k && k !== 'id' && k !== 'extra' && !isSysColumn(k)) ks.add(k); }));
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
        count={rows.length} countMore={more}
        actions={mayAdd && (
          <button className="btn btn-primary" onClick={() => { setAdding({}); setAddTried(false); setAddErr(''); }}>＋ Add entry</button>
        )} />
      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}
      <DataTable<Row>
        columns={mayEdit || mayDelete ? [actionColumn, ...COLUMNS] : COLUMNS}
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
        onRowClick={mayEdit ? (r) => setEdit(r) : (r) => setView(r)}
        toolbar={
          <Toolbar>
            <div className="call-search">
              <input className="input" placeholder="Party name" value={filter.name} onChange={(e) => set('name', e.target.value)} />
              <input className="input" placeholder="State" value={filter.state} onChange={(e) => set('state', e.target.value)} />
              <input className="input" placeholder="City" value={filter.city} onChange={(e) => set('city', e.target.value)} />
              <input className="input" placeholder="Type" value={filter.type} onChange={(e) => set('type', e.target.value)} />
            </div>
            <div className="spacer" />
            {maySwap && (
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

      {view && (
        <Drawer open title={String(view.party_name ?? 'Party')} onClose={() => setView(null)} width={620}>
          <div className="assoc-scroll">
            <table className="assoc-table">
              <tbody>
                {COLUMNS.map((c) => {
                  const v = (view as Record<string, unknown>)[c.key];
                  const txt = v == null || v === '' ? '—' : typeof v === 'object' ? (Array.isArray(v) ? `${v.length}` : '—') : String(v);
                  return <tr key={c.key}><td style={{ width: 180, color: 'var(--muted)' }}>{c.header}</td><td>{txt}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="muted rep-hint" style={{ marginTop: 8 }}>Read only. Changing a party needs the right to edit masters.</div>
        </Drawer>
      )}
      {edit && (
        <Drawer open title={String(edit.party_name ?? 'Party')} onClose={() => setEdit(null)} width={820} storeKey="partyEdit">
          <div className={`kb-form pf-section pf-c${editCols}`} ref={editRef}>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              The <b>party name</b> is not editable here. Every machine, call and contract names this
              customer by it, so changing it would strand them — ask for a rename rather than typing over it.
            </p>

            {EDIT_GROUPS.map((g) => (
              <div key={g.title} className="pf-section">
                <h4>{g.title}</h4>
                {g.note && <div className="muted" style={{ fontSize: 12 }}>{g.note}</div>}
                <PartyGroupFields fields={g.fields} value={(k) => String(edit[k] ?? '')} set={setEditField}
                  pick={(k) => partyPick(k, fieldOpts, activeUsers, String(edit.state ?? ''))} />
              </div>
            ))}

            <h4>KYC</h4>
            <div className="muted" style={{ fontSize: 12 }}>
              Every customer starts <b>Pending</b>. Marking one <b>Verified</b> records who did it and
              when, from your sign-in — and sending it back to Pending clears that again.
            </div>
            <div className="pf-grid">
              <div className="ml-field">
                <label className="field-label">GSTIN</label>
                <input className="input" value={String(edit.gstin ?? '')}
                  onChange={(e) => setEditField('gstin', e.target.value)} />
                <span className="muted" style={{ fontSize: 12 }}>
                  15 characters. A GSTIN contains a PAN, so filling this fills the PAN too.
                </span>
              </div>
              <div className="ml-field">
                <label className="field-label">PAN</label>
                <input className="input" value={String(edit.pan ?? '')}
                  onChange={(e) => setEditField('pan', e.target.value)} />
              </div>
              <div className="ml-field">
                <label className="field-label">Status</label>
                {/* THREE OPTIONS, SO NO SEARCH BOX — PickList shows just the list
                    under eight, and making somebody type to reach "Verified" is
                    worse than the dropdown it replaced. */}
                <PickList
                  value={String(edit.kyc_status ?? 'Pending')}
                  options={KYC_STATUSES}
                  onPick={(v) => setEditField('kyc_status', v)}
                  placeholder="Pending, Verified or Rejected…"
                  disabled={!mayKyc}
                />
                {!mayKyc && <div className="muted" style={{ fontSize: 12 }}>Changing the status needs the “Verify a party’s KYC” permission.</div>}
              </div>
            </div>
            <div className="ml-field">
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
      {adding && (
        <Modal open title="Add to Party Master" onClose={() => setAdding(null)} width={900}>
          <form className={`kb-form pf-section pf-c${addCols}`} ref={addRef} onSubmit={(e) => { e.preventDefault(); void saveAdd(); }}>
            <div className="ml-field">
              <label className="field-label">Party Name <span style={{ color: 'var(--danger, #c00)' }}>*</span></label>
              <input className="input" value={adding.party_name ?? ''} autoFocus
                onChange={(e) => setAdding((a) => ({ ...(a ?? {}), party_name: e.target.value }))} />
            </div>
            <div className="pf-grid">
              {([['city', 'City'], ['state', 'State'], ['country', 'Country']] as const).map(([k, l]) => {
                const p = partyPick(k, fieldOpts, activeUsers, adding.state ?? '');
                return (
                  <div className="ml-field" key={k}>
                    <label className="field-label">{l} {k !== 'country' && <span style={{ color: 'var(--danger, #c00)' }}>*</span>}</label>
                    {p
                      ? <SelectPicker value={adding[k] ?? ''} placeholder={`— ${l.toLowerCase()} —`}
                          options={p.options} allowFreeText={p.freeText} emptyHint={p.empty}
                          onChange={(v) => setAdding((a) => ({ ...(a ?? {}), [k]: v }))} />
                      : <input className="input" value={adding[k] ?? ''}
                          onChange={(e) => setAdding((a) => ({ ...(a ?? {}), [k]: e.target.value }))} />}
                  </div>
                );
              })}
            </div>
            <div className="muted ml-hint">Everything below is optional and can be filled in later from the party's Edit form. The Party Key is given when it is saved.</div>
            {EDIT_GROUPS.map((g) => (
              <div key={g.title} className="pf-section">
                <h4>{g.title}</h4>
                {g.note && <div className="muted ml-hint">{g.note}</div>}
                <PartyGroupFields fields={g.fields.filter(({ key }) => key !== 'city' && key !== 'state' && key !== 'country')}
                  value={(k) => adding[k] ?? ''}
                  set={(k, v) => setAdding((a) => ({ ...(a ?? {}), [k]: v }))}
                  pick={(k) => partyPick(k, fieldOpts, activeUsers, adding.state ?? '')} />
              </div>
            ))}
            <div className="pf-section">
              <h4>Tax</h4>
              <div className="pf-grid">
                {([['gstin', 'GSTIN'], ['pan', 'PAN']] as const).map(([k, l]) => (
                  <div className="ml-field" key={k}>
                    <label className="field-label">{l}</label>
                    <input className="input" value={adding[k] ?? ''}
                      onChange={(e) => setAdding((a) => ({ ...(a ?? {}), [k]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
            {(addErr || (addTried && addMissing(adding).length > 0)) && (
              <div className="field-err">{addErr || `Fill ${addMissing(adding).join(', ')}.`}</div>
            )}
            <div className="kb-form-actions">
              <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setAdding(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add entry'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

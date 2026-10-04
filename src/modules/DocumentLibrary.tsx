import { useEffect, useMemo, useRef, useState } from 'react';
import { AudiencePicker } from '../components/people/AudiencePicker';
import { audienceIds, audienceIsEmpty, EMPTY_AUDIENCE, type Audience } from '../lib/audience';
import { assignTraining } from '../lib/training';
import { metaFromFileName } from '../lib/docname';
import { PageHeader, Drawer, Toolbar } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { useAuth } from '../lib/auth';
import { useMaster } from '../lib/masters';
import { fmtLongDate } from '../lib/format';
import { formatDay, formatDayTime } from '../lib/dates';
import { MultiPick } from '../components/ui/MultiPick';
import { MAX_UPLOAD_BYTES, uploadToDrive, sheetsConfigured } from '../lib/sheets';
import {
  listDocuments, addDocument, updateDocument, setDocumentActive, refreshServiceNoteLatest,
  supabaseConfigured, type DocRow, type DocKind,
  listDirectory, type DirectoryRow,
} from '../lib/supabase';

// ===========================================================================
// DOCUMENT LIBRARY — the service-manual shelf and the QMS shelf, the same
// screen twice.
//
// The FILE goes to Google Drive (through the CallReg bridge, the same route a
// manual report already takes). What is kept here is the CATALOGUE ENTRY that
// makes it findable: above all which PRODUCT a manual covers, because the whole
// point is that a call hands the engineer the manual for the machine in front
// of them rather than a folder to hunt through.
//
// A superseded document is DEACTIVATED, never deleted — calls were worked from
// it, and the shelf is the record of what the field was told.
// ===========================================================================

interface Cfg {
  kind: DocKind;
  title: string;
  icon: string;
  subtitle: string;
  perm: string;
  drivePrefix: string;
  // QMS documents are controlled — number, revision and effective date are the
  // point of them. A service manual is keyed by product instead.
  controlled: boolean;
  // TECHNICAL / SERVICE NOTES ONLY (the user, 2026-09-30):
  //  * a note may cover SEVERAL products ("Product should be Multi Select"),
  //    kept comma-separated in `product`;
  //  * Added / Added By / Updated show what DRIVE says about the file (0299),
  //    with RITHI's own record of the entry kept in the record details.
  multiProduct?: boolean;
  driveDetails?: boolean;
  // TECHNICAL / SERVICE NOTES ONLY (the user, 2026-10-04): grouped per
  // product, a hand-entered Dated, newest first, and the latest note of each
  // product tagged Latest -- stored by the database (0350), recalculated on
  // every save and by the Refresh Latest tags button.
  latestByProduct?: boolean;
}

// The products on a note, however the cell separated them.
const splitProducts = (v: string): string[] =>
  Array.from(new Set(String(v ?? '').split(/[,;|\n]/).map((x) => x.trim()).filter(Boolean)));
// A row the Drive listing described. A note entered on this screen has none of
// the three, and shows RITHI's own dates and name instead.
const fromDrive = (r: DocRow) => !!(r.source_created_at || r.source_modified_at || (r.source_modified_by ?? '').trim());

const MANUALS: Cfg = {
  kind: 'service_manual', title: 'Service Manuals', icon: '📘',
  subtitle: 'One shelf per product. What is here is what a call offers the engineer as a supporting document.',
  perm: 'docs.manage', drivePrefix: 'Service Manual', controlled: false,
};
// TECHNICAL / SERVICE NOTES (the user, 2026-09-30: "Add a placeholder for
// storing Technical Notes / Service Notes similar to Service Manual"). The
// manuals' shelf exactly -- keyed by product, docs.manage to maintain, read by
// everyone signed in -- under its own kind, so neither list crowds the other.
const NOTES: Cfg = {
  kind: 'service_note', title: 'Technical / Service Notes', icon: '📝',
  subtitle: 'Technical bulletins and service notes, by product — the field fixes and advisories that are not in the manual.',
  perm: 'docs.manage', drivePrefix: 'Service Note', controlled: false,
  multiProduct: true, driveDetails: true, latestByProduct: true,
};
const QMS: Cfg = {
  kind: 'qms', title: 'QMS Documents', icon: '📗',
  subtitle: 'Controlled quality documents — SOPs, work instructions and forms, with their number, revision and effective date.',
  perm: 'qms.manage', drivePrefix: 'QMS', controlled: true,
};

type Draft = {
  title: string; product: string; doc_no: string; revision: string;
  effective_date: string; tags: string; notes: string;
  url: string; file_name: string; dated: string;
};
// Where a link points, for the File column. A Drive URL carries no filename —
// `/file/d/<id>/view` — so the host is the most it can honestly be labelled.
const hostOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'link'; }
};

const EMPTY: Draft = { title: '', product: '', doc_no: '', revision: '', effective_date: '', tags: '', notes: '', url: '', file_name: '', dated: '' };

// ONE ROW PER NOTE PER PRODUCT, for the grouped notes shelf: a note covering
// two products is listed under both, and is Latest for whichever of them the
// database marked (latest_for, 0350). A note naming no product is the
// "Every product" group, which the database spells ''.
const EVERY_PRODUCT = 'Every product';
type ShelfRow = DocRow & { _key: string; _product: string; _latest: boolean };
const perProduct = (r: DocRow): ShelfRow[] => {
  const marks = new Set((r.latest_for ?? []).map((p) => p.trim().toLowerCase()));
  const prods = splitProducts(r.product);
  return (prods.length ? prods : ['']).map((p) => ({
    ...r, _key: `${r.id}|${p.toLowerCase()}`, _product: p || EVERY_PRODUCT, _latest: marks.has(p.toLowerCase()),
  }));
};
// Newest Dated first; an undated note after every dated one, then by title.
const byDatedDesc = (a: DocRow, b: DocRow) =>
  (b.dated ?? '').localeCompare(a.dated ?? '') || a.title.localeCompare(b.title);

function Library({ cfg }: { cfg: Cfg }) {
  const { user, can } = useAuth();
  const live = supabaseConfigured();
  const mayEdit = live && can(cfg.perm);
  const products = useMaster('product').values;

  const [rows, setRows] = useState<DocRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<DocRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // WHO MUST BE TRAINED ON A NEW QMS DOCUMENT -- chosen here, at upload (the
  // user, 2026-09-30: "Trigger Training if a New QMS document is Uploaded").
  const departments = useMaster('department', [], live && !!cfg.controlled).values;
  const [dirRows, setDirRows] = useState<DirectoryRow[]>([]);
  const [trainees, setTrainees] = useState<Audience>(EMPTY_AUDIENCE);
  const [trainDue, setTrainDue] = useState('');
  useEffect(() => {
    if (!draft || editing || !cfg.controlled || !live || dirRows.length) return;
    void listDirectory().then(setDirRows).catch(() => setDirRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, editing]);

  const load = async () => {
    if (!live) { setMsg({ tone: 'info', text: 'Connect the database in Settings to load documents.' }); return; }
    setBusy(true);
    try { setRows(await listDocuments(cfg.kind)); }
    catch (e) { setMsg({ tone: 'error', text: `Could not read the library: ${e instanceof Error ? e.message : String(e)}` }); }
    finally { setBusy(false); }
  };
  useEffect(() => { setSearch(''); setMsg(null); void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.kind]);

  // The file goes to Drive first; only a stored link becomes a catalogue entry,
  // so the shelf can never list a document that is not actually there.
  const pickFile = async (f: File | null) => {
    if (!f || !draft) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      setMsg({ tone: 'error', text: `${f.name} is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` });
      return;
    }
    setUploading(true);
    setMsg({ tone: 'info', text: `Uploading ${f.name} to Drive…` });
    const res = await uploadToDrive(f, `${cfg.drivePrefix} - ${draft.product || draft.title || 'General'}`);
    setUploading(false);
    if (!res.ok || !res.url) { setMsg({ tone: 'error', text: res.error ?? 'Upload failed.' }); return; }
    // WHAT THE FILENAME ALREADY SAYS. `SM-SER-XT Rev.05.pdf` carries the
    // document number and the revision — the two fields most worth having and
    // the two most often left blank. They are SUGGESTIONS: only ever written
    // into a field that is empty, never over something typed, and named in the
    // message so nothing arrives silently.
    const guess = metaFromFileName(f.name);
    setDraft((d) => {
      if (!d) return d;
      const took: string[] = [];
      const next = { ...d, url: res.url!, file_name: f.name, title: d.title || f.name.replace(/\.[^.]+$/, '') };
      if (!d.doc_no.trim() && guess.docNo) { next.doc_no = guess.docNo; took.push(`Document No “${guess.docNo}”`); }
      if (!d.revision.trim() && guess.revision) { next.revision = guess.revision; took.push(`Revision “${guess.revision}”`); }
      setMsg({
        tone: 'ok',
        text: took.length
          ? `${f.name} stored in Drive. Read from the file name: ${took.join(' and ')} — check them, and change them if the name is not the record.`
          : `${f.name} stored in Drive.`,
      });
      return next;
    });
  };

  const problem = (d: Draft): string => {
    if (!d.title.trim()) return 'Give the document a title.';
    if (!d.url.trim()) return 'Upload the file, or paste the link to it.';
    if (cfg.controlled && !d.doc_no.trim()) return 'A QMS document needs its document number.';
    return '';
  };

  const save = async () => {
    if (!draft) return;
    const p = problem(draft);
    if (p) { setMsg({ tone: 'error', text: p }); return; }
    setBusy(true);
    const payload = {
      kind: cfg.kind,
      title: draft.title.trim(),
      product: cfg.multiProduct ? splitProducts(draft.product).join(', ') : draft.product.trim(),
      doc_no: draft.doc_no.trim(),
      revision: draft.revision.trim(),
      effective_date: draft.effective_date || null,
      tags: draft.tags.trim(),
      url: draft.url.trim(),
      file_name: draft.file_name,
      notes: draft.notes.trim(),
      uploaded_by_name: user?.fullName || user?.email || '',
      ...(cfg.latestByProduct ? { dated: draft.dated || null } : {}),
    };
    const res = editing ? await updateDocument(editing.id, payload) : await addDocument(payload);
    if (!res.ok) { setBusy(false); setMsg({ tone: 'error', text: res.error ?? 'Could not save the document.' }); return; }
    // THE TRAINING, assigned to whoever was chosen above. The document is saved
    // either way; a failure here says so and can be redone on the Training screen.
    let trained = '';
    const newId = !editing && 'id' in res && typeof res.id === 'number' ? res.id : undefined;
    if (cfg.controlled && newId && !audienceIsEmpty(trainees)) {
      const ids = audienceIds(dirRows, trainees);
      const topic = `${payload.doc_no}${payload.revision ? ` Rev ${payload.revision}` : ''} — ${payload.title}`;
      const t = await assignTraining(ids, { document_id: newId, topic, due_date: trainDue || null, assigned_by_name: payload.uploaded_by_name });
      trained = t.ok ? ` Training assigned to ${t.created} ${t.created === 1 ? 'person' : 'people'}.`
        : ` The training could NOT be assigned (${t.error}) — assign it on the Training screen.`;
    }
    setBusy(false);
    setDraft(null); setEditing(null); setTrainees(EMPTY_AUDIENCE); setTrainDue('');
    setMsg({ tone: trained.includes('NOT') ? 'error' : 'ok', text: `“${payload.title}” ${editing ? 'updated' : 'added'}.${trained}` });
    await load();
  };

  const toggleActive = async (r: DocRow) => {
    if (r.active && !confirm(`Retire “${r.title}”? It stops being offered on calls, but stays on the shelf as the record of what the field was told.`)) return;
    const res = await setDocumentActive(r.id, !r.active);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not update the document.' }); return; }
    setMsg({ tone: 'ok', text: `“${r.title}” ${r.active ? 'retired' : 'brought back'}.` });
    await load();
  };

  const openEdit = (r: DocRow) => {
    setEditing(r);
    setDraft({
      title: r.title, product: r.product, doc_no: r.doc_no, revision: r.revision,
      effective_date: r.effective_date ?? '', tags: r.tags, notes: r.notes,
      url: r.url, file_name: r.file_name, dated: r.dated ?? '',
    });
  };

  // THE BUTTON: re-mark the latest note of every product. Saving a note already
  // does this in the database; this is for when the marks are in doubt.
  const refreshLatest = async () => {
    setBusy(true);
    const res = await refreshServiceNoteLatest();
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: `Could not refresh the Latest tags: ${res.error}` }); return; }
    setMsg({ tone: 'ok', text: res.changed
      ? `Latest tags refreshed — ${res.changed} ${res.changed === 1 ? 'note' : 'notes'} changed.`
      : 'Latest tags checked — they were already right.' });
    await load();
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => showInactive || r.active)
      .filter((r) => !q || [r.title, r.product, r.doc_no, r.revision, r.tags, r.notes,
        (r.latest_for ?? []).length ? 'latest' : ''].some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, search, showInactive]);
  // What the table lists: the notes shelf one row per note per product, newest
  // Dated first; every other shelf as it is.
  const shelf = useMemo(() => (cfg.latestByProduct
    ? [...visible].sort(byDatedDesc).flatMap(perProduct)
    : visible.map((r) => ({ ...r, _key: String(r.id), _product: '', _latest: false }))), [visible, cfg.latestByProduct]);

  const columns: Column<ShelfRow & Record<string, unknown>>[] = useMemo(() => {
    const cols: Column<ShelfRow & Record<string, unknown>>[] = [
      {
        key: 'title', header: 'Title', width: 260,
        render: (r) => (
          <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Open in Drive">{r.title}</a>
        ),
      },
    ];
    if (cfg.latestByProduct) {
      cols.push(
        { key: 'dated', header: 'Dated', width: 120, wrap: false,
          accessor: (r) => r.dated ?? '',
          render: (r) => (r.dated ? formatDay(r.dated) : <span className="muted">—</span>) },
        { key: '_product', header: 'Product', width: 170 },
      );
    }
    if (cfg.controlled) {
      cols.push(
        { key: 'doc_no', header: 'Doc No', width: 130, wrap: false },
        { key: 'revision', header: 'Rev', width: 70, wrap: false },
        { key: 'effective_date', header: 'Effective', width: 110, wrap: false, render: (r) => fmtLongDate(r.effective_date) },
      );
    } else {
      cols.push({
        key: 'product', header: cfg.multiProduct ? 'Products' : 'Product', width: 180,
        render: (r) => (r.product ? r.product : <span className="muted">Every product</span>),
      });
    }
    cols.push(
      cfg.latestByProduct
        // LATEST is the database's mark for THIS product (0350), shown before
        // the tags somebody typed and never written into them.
        ? { key: 'tags', header: 'Tags', width: 200,
            accessor: (r) => [r._latest ? 'Latest' : '', r.tags].filter(Boolean).join(', '),
            render: (r) => (
              <>
                {r._latest && <span className="badge badge-success" title={`The newest dated live note for ${r._product}`} style={{ marginRight: 6 }}>Latest</span>}
                {r.tags}
              </>
            ) }
        : { key: 'tags', header: 'Tags', width: 180 },
      // A STORED COPY AND A LINK ARE NOT THE SAME THING, and this is the column
      // where the difference shows. `file_name` is only ever set by the upload
      // path, so a document added by pasting a link left this cell EMPTY —
      // which read as "no file" when it was in fact a perfectly good link, and
      // hid the one distinction that matters: a stored copy is fixed at the
      // revision it was uploaded as, a link serves whatever that document says
      // today. A Drive link carries no filename to derive one from, so a linked
      // row shows where it points instead.
      {
        key: 'file_name', header: 'File', width: 190, wrap: false,
        accessor: (r) => r.file_name || (r.url ? `Link · ${hostOf(r.url)}` : ''),
        render: (r) => (r.file_name
          ? <span title="A copy stored in Drive — fixed at the revision it was uploaded as">📄 {r.file_name}</span>
          : r.url
            ? (
              <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                 className="muted" title={`Linked, not stored: ${r.url}\nThis opens whatever that document says today, which may not be the revision recorded here.`}>
                🔗 Link · {hostOf(r.url)}
              </a>
            )
            : <span className="muted">—</span>),
      },
      ...(cfg.driveDetails
        // The Drive listing's own facts where the note came from one; RITHI's
        // where it did not. The entry's own record is in the edit drawer.
        ? [
            { key: '_added', header: 'Added', width: 160, wrap: false,
              accessor: (r: DocRow) => (fromDrive(r) ? r.source_created_at ?? '' : r.created_at),
              render: (r: DocRow) => formatDayTime(fromDrive(r) ? r.source_created_at ?? '' : r.created_at) },
            { key: '_added_by', header: 'Added By', width: 150,
              accessor: (r: DocRow) => (fromDrive(r) ? r.source_modified_by ?? '' : r.uploaded_by_name) },
            { key: '_updated', header: 'Updated', width: 160, wrap: false,
              accessor: (r: DocRow) => (fromDrive(r) ? r.source_modified_at ?? '' : r.updated_at),
              render: (r: DocRow) => formatDayTime(fromDrive(r) ? r.source_modified_at ?? '' : r.updated_at) },
          ] as Column<ShelfRow & Record<string, unknown>>[]
        : [
            { key: 'uploaded_by_name', header: 'Added By', width: 150 },
            // dd-MMM-yyyy HH:mm:ss, never the stored UTC string (D-064).
            { key: 'updated_at', header: 'Updated', width: 160, wrap: false,
              render: (r: DocRow) => formatDayTime(r.updated_at) },
          ] as Column<ShelfRow & Record<string, unknown>>[]),
      {
        key: 'active', header: 'Live', width: 70, wrap: false,
        render: (r) => (r.active ? <span className="badge badge-success">Yes</span> : <span className="badge badge-neutral">No</span>),
      },
    );
    if (mayEdit) {
      cols.push({
        key: '_act', header: '', width: 160, sortable: false, wrap: false,
        render: (r) => (
          <div className="row" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-sm" onClick={() => openEdit(r)}>✏️ Edit</button>
            <button className="btn btn-sm" title={r.active ? 'Stop offering this document' : 'Offer it again'}
              onClick={() => void toggleActive(r)}>{r.active ? '⊘ Retire' : '↩ Restore'}</button>
          </div>
        ),
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.controlled, cfg.driveDetails, cfg.multiProduct, cfg.latestByProduct, mayEdit]);

  return (
    <div>
      <PageHeader
        onRefresh={() => void load()}
        refreshing={busy}
        title={cfg.title} subtitle={cfg.subtitle} icon={cfg.icon} count={visible.length}
        actions={mayEdit && (
          <>
            {cfg.latestByProduct && (
              <button className="btn" disabled={busy} onClick={() => void refreshLatest()}
                title="Re-mark the newest dated live note of every product as Latest">↻ Refresh Latest tags</button>
            )}
            <button className="btn btn-primary" onClick={() => { setEditing(null); setDraft({ ...EMPTY }); }}>＋ Add document</button>
          </>
        )}
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <DataTable<ShelfRow & Record<string, unknown>>
        columns={columns}
        rows={shelf as (ShelfRow & Record<string, unknown>)[]}
        getRowId={(r) => r._key}
        groupable={cfg.latestByProduct ? [{ key: '_product', label: 'Product' }] : undefined}
        defaultGroup={cfg.latestByProduct ? ['_product'] : undefined}
        storageKey={`documents-${cfg.kind}`}
        rowsBeforeScroll={14}
        dense
        emptyText={busy ? 'Loading…' : 'Nothing on this shelf yet.'}
        toolbar={
          <Toolbar>
            <input className="input" placeholder="Search title, product, tags…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show retired
            </label>
            <div className="spacer" />
            <span className="muted">{visible.length.toLocaleString()} {visible.length === 1 ? 'document' : 'documents'}</span>
          </Toolbar>
        }
      />

      <Drawer open={!!draft} onClose={() => { setDraft(null); setEditing(null); }} title={editing ? `Edit — ${editing.title}` : `Add ${cfg.controlled ? 'a QMS document' : cfg.kind === 'service_note' ? 'a technical note' : 'a service manual'}`}>
        {draft && (
          <div className="rep-form">
            <label className="field">
              <span className="field-label">Title *</span>
              <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={cfg.controlled ? 'e.g. Calibration of oxygen sensors' : 'e.g. VEGA service manual'} />
            </label>

            {cfg.latestByProduct && (
              <label className="field">
                <span className="field-label">Dated</span>
                <input className="input" type="date" value={draft.dated} onChange={(e) => setDraft({ ...draft, dated: e.target.value })} />
                <span className="muted" style={{ fontSize: 12 }}>
                  The note's own date. The newest dated note of each product is tagged Latest; a note with no date is never Latest.
                </span>
              </label>
            )}

            {cfg.controlled ? (
              <>
                <label className="field">
                  <span className="field-label">Document No *</span>
                  <input className="input" value={draft.doc_no} onChange={(e) => setDraft({ ...draft, doc_no: e.target.value })} placeholder="e.g. QMS-SOP-014" />
                </label>
                <label className="field">
                  <span className="field-label">Revision</span>
                  <input className="input" value={draft.revision} onChange={(e) => setDraft({ ...draft, revision: e.target.value })} placeholder="e.g. 03" />
                </label>
                <label className="field">
                  <span className="field-label">Effective date</span>
                  <input className="input" type="date" value={draft.effective_date} onChange={(e) => setDraft({ ...draft, effective_date: e.target.value })} />
                </label>
              </>
            ) : cfg.multiProduct ? (
              <div className="field">
                <span className="field-label">Products</span>
                <MultiPick values={splitProducts(draft.product)}
                  options={Array.from(new Set([...products, ...splitProducts(draft.product)]))}
                  onChange={(v) => setDraft({ ...draft, product: v.join(', ') })}
                  noun="products" allLabel="Every product" />
                <span className="muted" style={{ fontSize: 12 }}>
                  Tick every product this note applies to. None ticked means it applies to every product.
                </span>
              </div>
            ) : (
              <label className="field">
                <span className="field-label">Product</span>
                <input className="input" list="doc-products" value={draft.product}
                  onChange={(e) => setDraft({ ...draft, product: e.target.value })}
                  placeholder="Leave blank for a manual that covers every product" />
                <datalist id="doc-products">{products.map((p) => <option key={p} value={p} />)}</datalist>
                <span className="muted" style={{ fontSize: 12 }}>
                  This is what a call matches on. Blank means the manual is offered on every call.
                </span>
              </label>
            )}

            <label className="field">
              <span className="field-label">Tags</span>
              <input className="input" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="Comma separated — e.g. ventilator, oxygen sensor, calibration" />
            </label>

            <label className="field">
              <span className="field-label">Notes</span>
              <textarea className="input" rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>

            <div className="field">
              <span className="field-label">File *</span>
              {draft.url ? (
                <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                  <a href={draft.url} target="_blank" rel="noreferrer">{draft.file_name || 'Open the stored file'}</a>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...draft, url: '', file_name: '' })}>✕ Replace</button>
                </div>
              ) : (
                <>
                  <input ref={fileRef} type="file" className="input" disabled={uploading || !sheetsConfigured()}
                    onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} />
                  {!sheetsConfigured() && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      Drive upload needs the CallReg bridge — set its URL in Settings, or paste a link below.
                    </span>
                  )}
                  <input className="input" style={{ marginTop: 6 }} value={draft.url}
                    onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                    placeholder="…or paste a Drive / SharePoint link" />
                  {/* THE TWO ARE NOT INTERCHANGEABLE, and the difference only
                      bites later, so it is said here rather than discovered.
                      Choosing a file takes a COPY, fixed at this revision.
                      A link is a live pointer: edit that document in place and
                      everyone opening it here gets the new content while the
                      revision recorded on this row still says the old one. */}
                  <span className="muted" style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
                    <b>Choose a file</b> and a copy is stored, fixed at this revision.
                    <b> Paste a link</b> and it stays live — if that document is edited, everyone
                    here sees the new content while the <b>Revision</b> recorded on this row still
                    says the old one.
                    {cfg.kind === 'qms' && (
                      <> {' '}<b>For a controlled QMS document, upload the file.</b> A revision that can
                        change underneath the record is not controlled; publish a new revision as its
                        own entry and retire this one.</>
                    )}
                  </span>
                </>
              )}
            </div>

            {cfg.controlled && !editing && (
              <div className="field">
                <span className="field-label">Who must be trained on it? (optional)</span>
                <AudiencePicker dir={dirRows} departments={departments} value={trainees} onChange={setTrainees} />
                {!audienceIsEmpty(trainees) && (
                  <label className="row" style={{ gap: 6, alignItems: 'center', marginTop: 6 }}>
                    <span className="muted">Due by</span>
                    <input className="input" type="date" value={trainDue} onChange={(e) => setTrainDue(e.target.value)} />
                  </label>
                )}
                <span className="muted" style={{ fontSize: 12 }}>
                  Each person gets it on their training list (My Profile) and on the Training screen, and completes it by
                  attending a session or confirming they have read and understood it.
                </span>
              </div>
            )}

            {cfg.driveDetails && editing && (
              <div className="field">
                <span className="field-label">Record details</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {fromDrive(editing) ? (
                    <>In Drive: created {formatDayTime(editing.source_created_at ?? '') || '—'}, last
                      modified {formatDayTime(editing.source_modified_at ?? '') || '—'}
                      {editing.source_modified_by ? ` by ${editing.source_modified_by}` : ''}.<br /></>
                  ) : null}
                  Entered in RITHI {formatDayTime(editing.created_at)}
                  {editing.uploaded_by_name ? ` by ${editing.uploaded_by_name}` : ''}; last changed here {formatDayTime(editing.updated_at)}.
                </span>
              </div>
            )}

            <div className="rep-actions">
              <button className="btn" onClick={() => { setDraft(null); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void save()} disabled={busy || uploading}>
                {uploading ? 'Uploading…' : busy ? 'Saving…' : editing ? 'Save changes' : 'Add to the shelf'}
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export function ServiceManuals() { return <Library cfg={MANUALS} />; }
export function QmsDocuments() { return <Library cfg={QMS} />; }
export function ServiceNotes() { return <Library cfg={NOTES} />; }

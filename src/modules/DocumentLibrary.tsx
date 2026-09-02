import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader, Drawer, Toolbar } from '../components/ui/ui';
import { DataTable, type Column } from '../components/table/DataTable';
import { useAuth } from '../lib/auth';
import { useMaster } from '../lib/masters';
import { fmtLongDate } from '../lib/format';
import { MAX_UPLOAD_BYTES, uploadToDrive, sheetsConfigured } from '../lib/sheets';
import {
  listDocuments, addDocument, updateDocument, setDocumentActive,
  supabaseConfigured, type DocRow, type DocKind,
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
}

const MANUALS: Cfg = {
  kind: 'service_manual', title: 'Service Manuals', icon: '📘',
  subtitle: 'One shelf per product. What is here is what a call offers the engineer as a supporting document.',
  perm: 'docs.manage', drivePrefix: 'Service Manual', controlled: false,
};
const QMS: Cfg = {
  kind: 'qms', title: 'QMS Documents', icon: '📗',
  subtitle: 'Controlled quality documents — SOPs, work instructions and forms, with their number, revision and effective date.',
  perm: 'qms.manage', drivePrefix: 'QMS', controlled: true,
};

type Draft = {
  title: string; product: string; doc_no: string; revision: string;
  effective_date: string; tags: string; notes: string;
  url: string; file_name: string;
};
const EMPTY: Draft = { title: '', product: '', doc_no: '', revision: '', effective_date: '', tags: '', notes: '', url: '', file_name: '' };

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
    setDraft((d) => (d ? { ...d, url: res.url!, file_name: f.name, title: d.title || f.name.replace(/\.[^.]+$/, '') } : d));
    setMsg({ tone: 'ok', text: `${f.name} stored in Drive.` });
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
      product: draft.product.trim(),
      doc_no: draft.doc_no.trim(),
      revision: draft.revision.trim(),
      effective_date: draft.effective_date || null,
      tags: draft.tags.trim(),
      url: draft.url.trim(),
      file_name: draft.file_name,
      notes: draft.notes.trim(),
      uploaded_by_name: user?.fullName || user?.email || '',
    };
    const res = editing ? await updateDocument(editing.id, payload) : await addDocument(payload);
    setBusy(false);
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Could not save the document.' }); return; }
    setDraft(null); setEditing(null);
    setMsg({ tone: 'ok', text: `“${payload.title}” ${editing ? 'updated' : 'added'}.` });
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
      url: r.url, file_name: r.file_name,
    });
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => showInactive || r.active)
      .filter((r) => !q || [r.title, r.product, r.doc_no, r.revision, r.tags, r.notes].some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [rows, search, showInactive]);

  const columns: Column<DocRow & Record<string, unknown>>[] = useMemo(() => {
    const cols: Column<DocRow & Record<string, unknown>>[] = [
      {
        key: 'title', header: 'Title', width: 260,
        render: (r) => (
          <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Open in Drive">{r.title}</a>
        ),
      },
    ];
    if (cfg.controlled) {
      cols.push(
        { key: 'doc_no', header: 'Doc No', width: 130, wrap: false },
        { key: 'revision', header: 'Rev', width: 70, wrap: false },
        { key: 'effective_date', header: 'Effective', width: 110, wrap: false, render: (r) => fmtLongDate(r.effective_date) },
      );
    } else {
      cols.push({
        key: 'product', header: 'Product', width: 180,
        render: (r) => (r.product ? r.product : <span className="muted">Every product</span>),
      });
    }
    cols.push(
      { key: 'tags', header: 'Tags', width: 180 },
      { key: 'file_name', header: 'File', width: 170, wrap: false },
      { key: 'uploaded_by_name', header: 'Added By', width: 150 },
      { key: 'updated_at', header: 'Updated', width: 150, wrap: false },
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
  }, [cfg.controlled, mayEdit]);

  return (
    <div>
      <PageHeader
        title={cfg.title} subtitle={cfg.subtitle} icon={cfg.icon} count={visible.length}
        actions={mayEdit && <button className="btn btn-primary" onClick={() => { setEditing(null); setDraft({ ...EMPTY }); }}>＋ Add document</button>}
      />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <DataTable<DocRow & Record<string, unknown>>
        columns={columns}
        rows={visible as (DocRow & Record<string, unknown>)[]}
        getRowId={(r) => String(r.id)}
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
            <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>{busy ? '…' : '↻ Refresh'}</button>
            <div className="spacer" />
            <span className="muted">{visible.length.toLocaleString()} {visible.length === 1 ? 'document' : 'documents'}</span>
          </Toolbar>
        }
      />

      <Drawer open={!!draft} onClose={() => { setDraft(null); setEditing(null); }} title={editing ? `Edit — ${editing.title}` : `Add ${cfg.controlled ? 'a QMS document' : 'a service manual'}`}>
        {draft && (
          <div className="rep-form">
            <label className="field">
              <span className="field-label">Title *</span>
              <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={cfg.controlled ? 'e.g. Calibration of oxygen sensors' : 'e.g. VEGA service manual'} />
            </label>

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
                </>
              )}
            </div>

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

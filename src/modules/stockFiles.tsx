import { useEffect, useState } from 'react';
import { uploadToDrive, MAX_UPLOAD_BYTES } from '../lib/sheets';
import type { DriveFolder } from '../lib/drivefolders';
import { addStockRecordFiles, listStockRecordFiles, type StockFileKind, type StockRecordFile } from '../lib/supabase';
import { formatDayTime } from '../lib/dates';

// ===========================================================================
// FILES KEPT WITH A STOCK TRANSFER OR A MATERIAL RETURN (0426, the user,
// 2026-10-13: "Add File Upload Option in Stock Transfer and Material Return").
//
// Shared by both screens so they behave alike: any number of files, optional,
// chosen on the New form (uploaded to Drive as each is picked, saved with the
// record) or attached later to the saved record. A saved file is never edited
// or removed -- the database refuses both -- so only a file still on an
// unsaved form has a Remove.
// ===========================================================================

export const FOLDER_FOR: Record<StockFileKind, DriveFolder> = {
  stock_transfer: 'stocktransfer',
  material_return: 'materialreturn',
};

export type PickedFile = { name: string; url: string };

/** The files of the records on screen, keyed by ref; `reload` after attaching. */
export function useStockFiles(kind: StockFileKind, refs: string[]): { files: Map<string, StockRecordFile[]>; reload: () => void } {
  const [files, setFiles] = useState<Map<string, StockRecordFile[]>>(new Map());
  const [tick, setTick] = useState(0);
  const key = [...new Set(refs.filter(Boolean))].join('|');
  useEffect(() => {
    if (!key) { setFiles(new Map()); return; }
    let alive = true;
    void listStockRecordFiles(kind, key.split('|')).then((m) => { if (alive) setFiles(m); });
    return () => { alive = false; };
  }, [kind, key, tick]);
  return { files, reload: () => setTick((n) => n + 1) };
}

/** Upload one chosen file to the kind's Drive folder. */
export async function uploadStockFile(f: File, kind: StockFileKind, label: string): Promise<{ ok: boolean; file?: PickedFile; error?: string }> {
  if (f.size > MAX_UPLOAD_BYTES) return { ok: false, error: `${f.name} is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` };
  const res = await uploadToDrive(f, label, FOLDER_FOR[kind]);
  if (!res.ok || !res.url) return { ok: false, error: res.error ?? 'Upload failed.' };
  return { ok: true, file: { name: f.name, url: res.url } };
}

/** The files on a NEW, unsaved form: attach as many as wanted, remove any. */
export function PendingFiles({ kind, label, files, onChange, disabled, hint }: {
  kind: StockFileKind; label: string; files: PickedFile[];
  onChange: (fs: PickedFile[]) => void; disabled?: boolean; hint: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (f: File | null) => {
    if (!f) return;
    setBusy(true); setErr('');
    const r = await uploadStockFile(f, kind, label);
    setBusy(false);
    if (!r.ok || !r.file) { setErr(r.error ?? 'Upload failed.'); return; }
    onChange([...files, r.file]);
  };
  return (
    <section className="rep-sec">
      <div className="rep-sec-title">Files <span className="muted">(optional)</span></div>
      {files.map((f) => (
        <div key={f.url} className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 4 }}>
          <a href={f.url} target="_blank" rel="noreferrer">📄 {f.name}</a>
          <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => onChange(files.filter((x) => x.url !== f.url))}>Remove</button>
        </div>
      ))}
      <label className="btn btn-sm" style={{ display: 'inline-block' }}>
        {busy ? 'Uploading…' : '⤴ Attach a file'}
        <input type="file" style={{ display: 'none' }} disabled={busy || disabled}
          onChange={(e) => { void pick(e.target.files?.[0] ?? null); e.target.value = ''; }} />
      </label>
      {err && <div className="sheet-banner sheet-banner-error" style={{ marginTop: 6 }}><span>{err}</span></div>}
      <div className="muted" style={{ fontSize: 12 }}>{hint}</div>
    </section>
  );
}

/** A saved record's files, with Attach for whoever may add one. */
export function SavedFiles({ kind, refNo, label, files, canAttach, onOpen, onAttached, compact }: {
  kind: StockFileKind; refNo: string; label: string; files: StockRecordFile[]; canAttach: boolean;
  onOpen: (f: StockRecordFile) => void; onAttached: (msg: string, ok: boolean) => void; compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const attach = async (f: File | null) => {
    if (!f) return;
    setBusy(true);
    const up = await uploadStockFile(f, kind, label);
    if (!up.ok || !up.file) { setBusy(false); onAttached(up.error ?? 'Upload failed.', false); return; }
    const res = await addStockRecordFiles(kind, refNo, [up.file]);
    setBusy(false);
    onAttached(res.ok ? `${f.name} attached to ${refNo}.` : `${f.name} was uploaded but not attached: ${res.error}`, res.ok);
  };
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 4, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
      {files.map((f) => (
        <button key={f.id} type="button" className="btn btn-ghost btn-sm"
          title={`Attached by ${f.attached_by_name || '—'} on ${formatDayTime(f.attached_at)}`}
          onClick={() => onOpen(f)}>📄 {f.file_name}</button>
      ))}
      {!files.length && compact && !canAttach && <span className="muted">—</span>}
      {canAttach && (
        <label className="btn btn-sm" style={{ display: 'inline-block' }} title="Attach a file to this record">
          {busy ? 'Uploading…' : compact ? '⤴' : '⤴ Attach a file'}
          <input type="file" style={{ display: 'none' }} disabled={busy}
            onChange={(e) => { void attach(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}

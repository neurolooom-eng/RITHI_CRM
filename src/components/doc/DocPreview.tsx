import { useEffect, useState } from 'react';
import { driveFileId, drivePreviewUrl } from '../../lib/drive';
import { fetchAppDocument, base64ToBlob, sheetsConfigured } from '../../lib/sheets';
import './docpreview.css';

// ===========================================================================
// DOCUMENT PREVIEW — the report, in the app.
//
// The user, 2026-09-08: "is it possible to render the reports -- those saved in
// drive directly in app? instead of going to drive?" … and then the fact that
// decides HOW: "my org doesn't allow anyone with link can view".
//
// SO THE BYTES COME THROUGH THE BRIDGE, NOT FROM DRIVE. CallReg.gs is deployed
// "Execute as: Me" and already has the folder access the browser does not --
// that is how it wrote the file in the first place. It reads the file back and
// hands it over, the app builds a blob from it and renders that. Nothing about
// the file's sharing changes, and the person reading it needs no Google account.
//
// DRIVE'S OWN PREVIEW IS THE FALLBACK, not the first choice. It works only for
// somebody already signed in to Google WITH access to the folder -- which, under
// a domain policy that forbids link sharing, is a small set. It stays because
// where it does work it costs nothing, and because a bridge that is down is not
// a reason to show nothing.
//
// "OPEN IN DRIVE" IS ALWAYS THERE, never a fallback that appears when something
// fails. When Drive's frame is the one being shown, the app cannot be told that
// it failed -- the frame is cross-origin, so a refusal renders inside it with no
// error to catch. A permanent way out is the only honest answer.
//
// ONE VIEWER, EVERY SCREEN. The report is opened from four places (the top of a
// closed call, a call's visit history, the Daily Call Review, and the visit
// entry form). Four screens each rendering their own frame is how the same
// document ends up behaving differently depending on where you found it.
// ===========================================================================

type Mode = 'loading' | 'bytes' | 'drive' | 'plain';

export function DocPreview({ url, title, subtitle, onClose }: {
  url: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const fileId = driveFileId(url);
  const driveSrc = drivePreviewUrl(url);

  const [mode, setMode] = useState<Mode>(fileId && sheetsConfigured() ? 'loading' : driveSrc ? 'drive' : 'plain');
  const [blobUrl, setBlobUrl] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [fileName, setFileName] = useState('');
  // WHY it fell back, kept and shown. "It just showed something else" is the
  // report nobody can act on; "the bridge said the file is not one of ours" is.
  const [why, setWhy] = useState('');
  // Drive's frame takes a moment to draw; without this it is a grey rectangle
  // for a second or two, which reads as "nothing happened".
  const [frameLoaded, setFrameLoaded] = useState(false);

  // Ask the bridge for the bytes. A blob URL is a live handle into this tab's
  // memory, so it is released when the viewer closes or the document changes --
  // a viewer opened forty times in a shift would otherwise hold forty files.
  useEffect(() => {
    if (!fileId || !sheetsConfigured()) return;
    let alive = true;
    let made = '';
    setMode('loading'); setWhy('');
    void fetchAppDocument(fileId).then((r) => {
      if (!alive) return;
      if (r.ok && r.doc) {
        made = URL.createObjectURL(base64ToBlob(r.doc.dataBase64, r.doc.mimeType));
        setBlobUrl(made); setMimeType(r.doc.mimeType); setFileName(r.doc.name);
        setMode('bytes');
        return;
      }
      setWhy(r.error ?? 'The bridge could not read that file.');
      setMode(driveSrc ? 'drive' : 'plain');
    });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [fileId, driveSrc]);

  // Escape closes it. A viewer opened over a register is the one place people
  // reach for the key without thinking.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isImage = mimeType.startsWith('image/');

  return (
    <div className="modal-overlay docprev-overlay" onMouseDown={onClose}>
      <div className="docprev" onMouseDown={(e) => e.stopPropagation()}>
        <div className="docprev-head">
          <div className="docprev-titles">
            <h2 className="drawer-title">{title}</h2>
            {subtitle && <span className="muted docprev-sub">{subtitle}</span>}
          </div>
          {/* A DOWNLOAD ONLY WHERE THERE ARE BYTES TO SAVE. Under a policy that
              blocks link sharing this is the one route to a copy that works
              without a Google account. */}
          {mode === 'bytes' && (
            <a className="btn btn-sm" href={blobUrl} download={fileName || 'report'} title="Save a copy">⭳ Download</a>
          )}
          <a className="btn btn-sm" href={url} target="_blank" rel="noreferrer"
             title="Open the original in Google Drive — needs an account with access to the folder">
            Open in Drive ↗
          </a>
          <button className="btn btn-ghost btn-sm" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        {mode === 'loading' && (
          <div className="docprev-frame">
            <div className="docprev-loading muted">Fetching the report…</div>
          </div>
        )}

        {mode === 'bytes' && (
          <div className="docprev-frame">
            {isImage
              ? <img className="docprev-img" src={blobUrl} alt={fileName || title} />
              /* A blob URL is same-origin, so a PDF renders in the browser's own
                 viewer with no Drive involved at all. */
              : <iframe src={blobUrl} title={title} />}
          </div>
        )}

        {mode === 'drive' && (
          <>
            {why && (
              <div className="docprev-note muted">
                Showing Drive’s own preview — {why} It will only open for a Google account with access to the folder.
              </div>
            )}
            <div className="docprev-frame">
              {!frameLoaded && <div className="docprev-loading muted">Loading the report from Drive…</div>}
              {/* NO `sandbox` ATTRIBUTE, deliberately. It reads like the safer
                  choice and is the opposite of one: dropping `allow-same-origin`
                  gives the framed page an OPAQUE origin, so Drive's viewer loses
                  its own cookies and cannot authenticate the reader -- the
                  preview would then fail for exactly the files a signed-in
                  person is entitled to see. The frame is cross-origin
                  regardless, which is what stops it touching this app. */}
              <iframe
                src={driveSrc}
                title={title}
                onLoad={() => setFrameLoaded(true)}
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </>
        )}

        {mode === 'plain' && (
          <div className="docprev-plain">
            <p>{why || 'This report is not a Google Drive file, so it cannot be shown here.'}</p>
            <p className="muted">
              It opens in a new tab exactly as it always has — reports uploaded through the app are
              shown here; this one was linked from somewhere else.
            </p>
            <a className="btn btn-primary" href={url} target="_blank" rel="noreferrer">Open it ↗</a>
          </div>
        )}
      </div>
    </div>
  );
}

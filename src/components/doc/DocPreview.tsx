import { useEffect, useState } from 'react';
import { drivePreviewUrl } from '../../lib/drive';
import './docpreview.css';

// ===========================================================================
// DOCUMENT PREVIEW — the report, in the app.
//
// The user, 2026-09-08: "is it possible to render the reports -- those saved in
// drive directly in app? instead of going to drive?"
//
// ONE VIEWER, EVERY SCREEN. The service report is opened from four places (the
// top of a closed call, a call's visit history, the Daily Call Review, and the
// visit-entry form itself). Four screens each rendering their own frame is how
// the same document ends up behaving differently depending on where you found
// it -- which is the same reason the link itself has one reader and one class.
//
// "OPEN IN DRIVE" IS ALWAYS THERE, never a fallback that appears when something
// fails. The frame is cross-origin: if the file is not shared, Drive renders its
// "you need access" page INSIDE it and the app cannot tell -- no error, no
// callback, nothing to react to. A permanent way out is the only honest answer,
// and it is also what somebody wanting to print or download reaches for.
//
// A LINK THAT CANNOT BE FRAMED IS NOT AN ERROR. Historical rows point at all
// sorts of things; one that is not a Drive file says so plainly and offers the
// tab, rather than showing an empty grey box that reads as a broken app.
// ===========================================================================

export function DocPreview({ url, title, subtitle, onClose }: {
  url: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const src = drivePreviewUrl(url);
  // Drive takes a moment to draw. Without this the frame is a grey rectangle
  // for a second or two, which reads as "nothing happened".
  const [loaded, setLoaded] = useState(false);

  // Escape closes it. A viewer opened over a register is the one place people
  // reach for the key without thinking.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay docprev-overlay" onMouseDown={onClose}>
      <div className="docprev" onMouseDown={(e) => e.stopPropagation()}>
        <div className="docprev-head">
          <div className="docprev-titles">
            <h2 className="drawer-title">{title}</h2>
            {subtitle && <span className="muted docprev-sub">{subtitle}</span>}
          </div>
          <a className="btn btn-sm" href={url} target="_blank" rel="noreferrer"
             title="Open the original in Google Drive — for printing, downloading, or if it will not show here">
            Open in Drive ↗
          </a>
          <button className="btn btn-ghost btn-sm" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        {src ? (
          <div className="docprev-frame">
            {!loaded && <div className="docprev-loading muted">Loading the report from Drive…</div>}
            {/* NO `sandbox` ATTRIBUTE, deliberately. It reads like the safer
                choice and is the opposite of one here: dropping
                `allow-same-origin` gives the framed page an OPAQUE origin, so
                Drive's viewer loses its own cookies and storage and cannot
                authenticate the reader -- the preview would fail for exactly
                the files a signed-in person is entitled to see. The frame is
                cross-origin regardless, which is what actually stops it
                touching this app; the browser enforces that with or without
                the attribute. This is the embed Google documents. */}
            <iframe
              src={src}
              title={title}
              onLoad={() => setLoaded(true)}
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ) : (
          <div className="docprev-plain">
            <p>This report is not a Google Drive file, so it cannot be shown here.</p>
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

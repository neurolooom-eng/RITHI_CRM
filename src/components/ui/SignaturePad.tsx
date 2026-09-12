// ===========================================================================
// SIGNING, ON SCREEN.
//
// The user's ask (2026-09-12): "Add a Provision for users to Save their
// signatures." What that has to produce is an image the printed documents can
// carry — the Delivery Challan's blocks, the Declaration, the Field Failure
// Report's "Signature:" line.
//
// TWO WAYS IN, because people sign in two different situations:
//
//   * DRAW IT. On a phone or a tablet a finger is the natural instrument, and
//     most of the field uses one. Pointer events rather than mouse or touch
//     events, so a stylus, a finger and a mouse are one code path instead of
//     three that drift.
//
//   * UPLOAD A PICTURE of a signature already on paper. Somebody at a desk with
//     a mouse cannot draw their own name and the result looks it. The upload is
//     put on the same canvas, so what is stored is one kind of thing either
//     way and the preview is honest about what will print.
//
// TRANSPARENT, NOT WHITE. A signature with a white background prints as a white
// box over the ruled line it is meant to sit on. The canvas is left clear and
// only the ink is drawn, so the PNG carries alpha and the line shows through.
//
// TRIMMED TO THE INK before it is stored. Somebody signing in the top-left
// corner of the pad would otherwise save a mostly-empty image that renders
// tiny inside a document's signature block. The trim reads the alpha channel
// and crops to what was actually drawn.
// ===========================================================================
import { useEffect, useRef, useState } from 'react';

const W = 600;
const H = 200;
const INK = '#111111';

/** Crop a canvas to its non-transparent content, with a small margin, and
 *  return a PNG data URI. Returns '' when nothing was drawn — an empty
 *  signature must not be storable as if it were one. */
export function trimToInk(src: HTMLCanvasElement, pad = 6): string {
  const ctx = src.getContext('2d');
  if (!ctx) return '';
  const { data } = ctx.getImageData(0, 0, src.width, src.height);
  let minX = src.width, minY = src.height, maxX = -1, maxY = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      // The ALPHA byte, not the colour: the pad is transparent, so a pixel is
      // ink exactly when it is not see-through.
      if (data[(y * src.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return '';
  const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad);
  const x1 = Math.min(src.width, maxX + pad + 1), y1 = Math.min(src.height, maxY + pad + 1);
  const out = document.createElement('canvas');
  out.width = x1 - x0; out.height = y1 - y0;
  out.getContext('2d')?.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

export function SignaturePad({ value, onChange }: {
  value: string;
  onChange: (dataUrl: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = useState(false);
  const [err, setErr] = useState('');

  // Load an existing signature onto the pad so "what you see is what is saved".
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!value) { setInked(false); return; }
    const img = new Image();
    img.onload = () => {
      // Fit inside the pad without stretching it — a signature is a shape, and
      // a stretched one is somebody else's.
      const s = Math.min(cv.width / img.width, cv.height / img.height, 1);
      const w = img.width * s, h = img.height * s;
      ctx.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
      setInked(true);
    };
    img.src = value;
  }, [value]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = ref.current!;
    const r = cv.getBoundingClientRect();
    // The canvas is drawn at W×H and displayed at whatever width it gets, so
    // the pointer has to be scaled into canvas space or the ink lags the finger.
    return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    ref.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = at(e);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const cv = ref.current!; const ctx = cv.getContext('2d'); if (!ctx) return;
    const p = at(e); const q = last.current ?? p;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
    setInked(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false; last.current = null;
    // Committed on release rather than on every stroke: a data URI per pixel of
    // movement is a lot of string-building for no benefit.
    const cv = ref.current; if (cv) onChange(trimToInk(cv));
  };

  const clear = () => {
    const cv = ref.current; if (!cv) return;
    cv.getContext('2d')?.clearRect(0, 0, cv.width, cv.height);
    setInked(false);
    onChange('');
  };

  const upload = (file: File | null) => {
    setErr('');
    if (!file) return;
    if (!/^image\//.test(file.type)) { setErr('That is not an image file.'); return; }
    // 4 MB of camera photograph is not a signature; it is a photograph of one.
    if (file.size > 4 * 1024 * 1024) { setErr('That picture is over 4 MB — crop it to the signature first.'); return; }
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const cv = ref.current; if (!cv) return;
        const ctx = cv.getContext('2d'); if (!ctx) return;
        ctx.clearRect(0, 0, cv.width, cv.height);
        const s = Math.min(cv.width / img.width, cv.height / img.height);
        const w = img.width * s, h = img.height * s;
        ctx.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
        setInked(true);
        onChange(trimToInk(cv));
      };
      img.onerror = () => setErr('That image could not be read.');
      img.src = String(rd.result ?? '');
    };
    rd.onerror = () => setErr('That file could not be read.');
    rd.readAsDataURL(file);
  };

  return (
    <div>
      <canvas
        ref={ref}
        width={W}
        height={H}
        className="sig-pad"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={clear} disabled={!inked}>✕ Clear</button>
        <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
          ⬆ Upload a picture
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => { upload(e.target.files?.[0] ?? null); e.target.value = ''; }}
          />
        </label>
        <span className="muted">Sign with a finger, a stylus or the mouse — or upload a photograph of your signature on paper.</span>
      </div>
      {err && <div className="muted" style={{ color: 'var(--danger)', marginTop: 6 }}>{err}</div>}
    </div>
  );
}

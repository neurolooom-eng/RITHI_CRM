import { useEffect, useRef, useState } from 'react';
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import './richeditor.css';

// ===========================================================================
// A self-contained rich-text editor (contentEditable) for Knowledge Base
// articles: bold/italic/underline, headings, lists, quote, code, links,
// images (upload — downscaled — or by URL) and tables. Emits sanitized HTML.
// No external editor dependency.
// ===========================================================================

// Downscale a picked image so a pasted screenshot doesn't bloat the row.
async function fileToDataUrl(file: File, maxW = 1280): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  if (file.size < 260_000) return dataUrl; // small enough already
  return await new Promise<string>((res) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) { res(dataUrl); return; }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}

export function RichEditor({ value, onChange, placeholder }: {
  value: string; onChange: (html: string) => void; placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(!value);

  // Seed the editor once (and if the value is swapped in from outside while not
  // focused), without stomping the caret mid-typing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el && el.innerHTML !== value) {
      el.innerHTML = value || '';
      setEmpty(!el.textContent?.trim() && !el.querySelector('img,table'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    setEmpty(!el.textContent?.trim() && !el.querySelector('img,table'));
    onChange(sanitizeHtml(el.innerHTML));
  };

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };
  const insertHTML = (html: string) => exec('insertHTML', html);

  const addLink = () => {
    const url = window.prompt('Link URL (https://…)');
    if (url) exec('createLink', url);
  };
  const addImageUrl = () => {
    const url = window.prompt('Image URL (a Drive / Pages / web link to an image)');
    if (url) insertHTML(`<img src="${url.replace(/"/g, '&quot;')}" alt="" />`);
  };
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const src = await fileToDataUrl(f);
    insertHTML(`<img src="${src}" alt="${f.name.replace(/"/g, '')}" />`);
  };
  const addTable = () => {
    const spec = window.prompt('Table size as rows x columns (e.g. 3x4)', '3x3');
    if (!spec) return;
    const [r, c] = spec.toLowerCase().split(/[x×,\s]+/).map((n) => Math.max(1, Math.min(20, parseInt(n, 10) || 0)));
    if (!r || !c) return;
    let html = '<table><thead><tr>';
    for (let j = 0; j < c; j++) html += '<th>Head</th>';
    html += '</tr></thead><tbody>';
    for (let i = 0; i < r - 1; i++) { html += '<tr>'; for (let j = 0; j < c; j++) html += '<td>&nbsp;</td>'; html += '</tr>'; }
    html += '</tbody></table><p><br/></p>';
    insertHTML(html);
  };

  const Btn = ({ cmd, arg, label, title, onClick }: { cmd?: string; arg?: string; label: string; title: string; onClick?: () => void }) => (
    <button type="button" className="re-btn" title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick ? onClick() : exec(cmd!, arg); }}>
      {label}
    </button>
  );

  return (
    <div className="re-wrap">
      <div className="re-bar">
        <Btn cmd="bold" label="B" title="Bold" />
        <Btn cmd="italic" label="I" title="Italic" />
        <Btn cmd="underline" label="U" title="Underline" />
        <span className="re-sep" />
        <Btn cmd="formatBlock" arg="<h2>" label="H2" title="Heading" />
        <Btn cmd="formatBlock" arg="<h3>" label="H3" title="Subheading" />
        <Btn cmd="formatBlock" arg="<blockquote>" label="❝" title="Quote" />
        <Btn cmd="formatBlock" arg="<pre>" label="{ }" title="Code block" />
        <span className="re-sep" />
        <Btn cmd="insertUnorderedList" label="•" title="Bullet list" />
        <Btn cmd="insertOrderedList" label="1." title="Numbered list" />
        <span className="re-sep" />
        <Btn label="🔗" title="Insert link" onClick={addLink} />
        <Btn label="🖼️" title="Insert image by URL" onClick={addImageUrl} />
        <Btn label="⬆️" title="Upload an image" onClick={() => fileRef.current?.click()} />
        <Btn label="▦" title="Insert table" onClick={addTable} />
        <span className="re-sep" />
        <Btn cmd="removeFormat" label="⌫" title="Clear formatting" />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
      </div>
      <div className="re-editor-wrap">
        {empty && <div className="re-placeholder">{placeholder || 'Write the solution…'}</div>}
        <div
          ref={ref}
          className="re-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
        />
      </div>
    </div>
  );
}

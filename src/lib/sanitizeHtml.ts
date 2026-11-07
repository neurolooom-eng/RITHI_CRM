// ===========================================================================
// Allowlist HTML sanitizer for Knowledge Base articles. Articles are written in
// a rich editor and stored as HTML, then rendered with dangerouslySetInnerHTML,
// so every stored/rendered string passes through here: only known-safe tags and
// attributes survive, scripts / event handlers / javascript: URLs are stripped.
// ===========================================================================

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'div', 'span',
  'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'mark', 'small',
  'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'a', 'img',
  'blockquote', 'code', 'pre',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
]);

// Attributes allowed per tag (plus a small global set).
const GLOBAL_ATTRS = new Set(['class']);
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
};

// DROPPED WITH EVERYTHING INSIDE, never unwrapped: what these hold is code,
// markup in another namespace, or a document of its own, not article text.
const DROP_TAGS = new Set([
  'script', 'style', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'svg', 'math', 'noscript', 'noembed', 'noframes', 'xmp', 'plaintext', 'textarea',
  'select', 'option', 'button', 'input', 'link', 'meta', 'base', 'head', 'title',
]);

const SAFE_URL = /^(https?:|mailto:|tel:|data:image\/(png|jpe?g|gif|webp|svg\+xml);|\/|#|\.\.?\/)/i;

function cleanEl(el: Element) {
  const tag = el.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    const parent = el.parentNode;
    if (!parent) return;
    if (DROP_TAGS.has(tag)) { parent.removeChild(el); return; }
    // Unwrap unknown tags: keep their text/children, drop the tag itself --
    // and CLEAN WHAT IS MOVED UP. The caller's list of children was taken
    // before this element was unwrapped, so nothing else would reach them:
    // `<section><img onerror=…></section>` kept the handler until 2026-11-07
    // (security re-scan, F-13).
    const moved = [...el.children];
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    for (const child of moved) cleanEl(child);
    return;
  }
  const allowed = TAG_ATTRS[tag];
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    const ok = GLOBAL_ATTRS.has(name) || (allowed?.has(name) ?? false);
    if (!ok || name.startsWith('on')) { el.removeAttribute(attr.name); continue; }
    if ((name === 'href' || name === 'src') && !SAFE_URL.test(attr.value.trim())) {
      el.removeAttribute(attr.name); continue;
    }
    if (name === 'target' && attr.value === '_blank') el.setAttribute('rel', 'noopener noreferrer');
  }
  for (const child of [...el.children]) cleanEl(child);
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return '';
    for (const child of [...root.children]) cleanEl(child);
    return root.innerHTML;
  } catch {
    // Last resort: strip all tags.
    return html.replace(/<[^>]*>/g, '');
  }
}

// Plain-text preview (for cards / search), from sanitized HTML.
export function htmlToText(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html');
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

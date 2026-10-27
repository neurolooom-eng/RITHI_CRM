// ===========================================================================
// A LINK BUILT FROM STORED DATA OPENS ONLY IF IT IS A LINK (security scan,
// 2026-10-27). React 18 renders `href="javascript:..."` as given -- it warns,
// it does not refuse -- so a document, attachment or call-request link that
// somebody saved as `javascript:...` would run script in RITHI's own origin,
// under whoever clicked it. An engineer can attach links to a Call Request; an
// office user opens them. Every href and window.open taken from a record goes
// through here: http(s), mailto, tel, a same-origin blob, or a link within the
// app. Anything else gives no link at all -- the text still shows.
// ===========================================================================
const SAFE = /^(https?:\/\/|mailto:|tel:|blob:|\/(?!\/)|#|\.\.?\/)/i;

export function safeUrl(u: unknown): string | undefined {
  const s = String(u ?? '').trim();
  if (!s) return undefined;
  // Control characters and whitespace inside a scheme are how "java\tscript:"
  // slips past a naive test; a real link has none.
  if (/[\u0000-\u001f\u007f]/.test(s)) return undefined;
  return SAFE.test(s) ? s : undefined;
}

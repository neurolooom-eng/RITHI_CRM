import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/ui/ui';
import { useTheme } from '../theme/ThemeProvider';
import './howrithifunctions.css';

// ===========================================================================
// HOW RITHI FUNCTIONS — the shared diagram, embedded.
//
// The user, 2026-09-16: "is it possible to embed the Artifact? I want the same
// Look and Feel of how the Artifact is."
//
// NOT THE claude.ai URL, and that is a fact about the internet rather than a
// preference. Asked directly, that host answers:
//
//     x-frame-options: SAMEORIGIN
//     cross-origin-resource-policy: same-origin
//
// so an <iframe> pointing at it renders an EMPTY BOX from this domain — and the
// page is private besides, needing a claude.ai sign-in the field engineers do
// not have. Embedding it that way would look right to whoever built it and show
// nothing to everybody else.
//
// SO THE DOCUMENT ITSELF LIVES HERE: `public/docs/how-a-call-works.html`, in
// this repository, served from this app's own origin. Same file, same CSS, same
// typography — the look and feel is identical because it IS the artifact, not a
// reproduction of it. The shared copy is published FROM that file, so the two
// cannot drift into two documents that disagree.
//
// WHY A FRAME RATHER THAN A PORT INTO JSX. The page is a self-contained design
// — its own type scale, its own palette, its own dark mode — and pulling it
// into the app's stylesheet would mean maintaining that design twice and
// watching the two diverge. A frame keeps exactly one copy of the markup and
// exactly one copy of the CSS. What it costs is handled below: the theme is
// passed in, and the height is read back so there is no scrollbar inside a
// scrollbar.
//
// IT IS ALSO NOW PERMISSIONED (the user, same message: "Limit Exposure to
// Admin, NSM, Zoho, Technical Support"). It was `alwaysOpen` when it shipped
// this morning; it is a module with a key now, granted to those four roles by
// migration 0209 — a page is not restricted by having a menu entry removed.
// ===========================================================================

/** THE DOCUMENTS, in the repo at `public/docs/` so they are served beside the
 *  app rather than from anywhere else. `BASE_URL` because the site is published
 *  under a path.
 *
 *  ONE PAGE, SEVERAL MODULES. The page is "How RITHI Functions", not "how a
 *  call works" — a second module (spares, 2026-09-16) is another entry here and
 *  nothing else. Each document is self-contained and shares one design, so
 *  adding a third costs a file and a line. */
const DOCS = [
  {
    id: 'call',
    label: 'The Call module',
    file: 'how-a-call-works.html',
    blurb: 'Two flows: registering a direct customer call, and the whole life of a call raised from a request.',
    title: 'How a call works — the two flows, the masters behind them, and what each step refuses',
  },
  {
    id: 'spare',
    label: 'The Spare module',
    file: 'how-a-spare-moves.html',
    blurb: 'Two routes in — Call Based and HandStock — one approval chain, and what each cycle writes.',
    title: 'How a spare moves — the two routes, the approval chain, and what every stage records',
  },
] as const;

const urlFor = (file: string) => `${import.meta.env.BASE_URL}docs/${file}`;

export function HowRithiFunctions() {
  // WHICH DOCUMENT, remembered per viewer. Somebody who came here for the
  // spare chain is usually coming back for the spare chain; `localStorage` is
  // the right home for that and the wrong one for anything that must persist —
  // so every read and write is wrapped, and an empty answer is simply the
  // first document.
  const [docId, setDocId] = useState<string>(() => {
    try { return localStorage.getItem('rithi.hrf.doc') ?? DOCS[0].id; } catch { return DOCS[0].id; }
  });
  const doc = DOCS.find((d) => d.id === docId) ?? DOCS[0];
  const DOC = urlFor(doc.file);
  const pick = (id: string) => {
    setDocId(id);
    try { localStorage.setItem('rithi.hrf.doc', id); } catch { /* private window: it just does not stick */ }
  };

  // THE APP HAS SEVERAL THEMES, and the framed document has two. `scheme` is
  // the bridge: every theme declares whether it is a light or a dark one, so
  // "Midnight Dark" and "Slate Dark" both hand the document `dark` rather than
  // a name it has never heard of.
  const { theme } = useTheme();
  const scheme = theme.scheme === 'dark' ? 'dark' : 'light';
  const frame = useRef<HTMLIFrameElement>(null);
  // A FIRST HEIGHT THAT IS NOT ZERO. Until the document reports its own, the
  // frame still has to be readable: a collapsed iframe is indistinguishable
  // from a page that failed to load.
  const [height, setHeight] = useState(1400);
  const [failed, setFailed] = useState(false);

  // A NEW DOCUMENT IS A NEW HEIGHT. Without this the frame keeps the last
  // one's, so a shorter document trails a screen of blank space and a taller
  // one is clipped until its first message arrives.
  useEffect(() => { setHeight(1400); setFailed(false); }, [docId]);

  // The document posts its height on load, on resize and whenever its content
  // changes. Only messages from THIS frame are honoured — a page that resizes
  // itself on anyone's say-so is a page anyone can distort.
  const onMessage = useCallback((e: MessageEvent) => {
    if (e.source !== frame.current?.contentWindow) return;
    const d = e.data as { type?: string; height?: number } | null;
    if (d?.type !== 'rithi-doc-height' || typeof d.height !== 'number') return;
    if (d.height > 200 && d.height < 40000) setHeight(d.height);
  }, []);

  useEffect(() => {
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onMessage]);

  // IF THE DOCUMENT IS NOT THERE, SAY SO. A silently blank frame is the failure
  // this whole page was rewritten to avoid — and the reason it could be missing
  // is worth naming, since it is always the same one: a deploy that did not
  // carry `public/`.
  useEffect(() => {
    let live = true;
    fetch(DOC, { method: 'HEAD' })
      .then((r) => { if (live && !r.ok) setFailed(true); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [DOC]);

  return (
    <div>
      <PageHeader
        title="How RITHI Functions"
        subtitle="Where every field on a call comes from — the masters behind the form, what the system refuses, and what it will not proceed without."
        icon="🧭"
      />

      <div className="hf-bar">
        {/* CHIPS RATHER THAN A DROPDOWN: there are two, and a picker that hides
            one of two options hides the fact that the other exists. */}
        <div className="hf-docs" role="tablist" aria-label="Module">
          {DOCS.map((d) => (
            <button key={d.id} role="tab" aria-selected={d.id === doc.id}
              className={`chip ${d.id === doc.id ? 'chip-on' : ''}`}
              onClick={() => pick(d.id)}>{d.label}</button>
          ))}
        </div>
        <span className="hf-bar-note">{doc.blurb}</span>
        <span className="hf-bar-spacer" />
        {/* A LONG DOCUMENT IS OFTEN WANTED ON ITS OWN — printed, or beside the
            screen it describes. The same file, without the app around it. */}
        <a className="btn btn-sm" href={DOC} target="_blank" rel="noreferrer">
          ⧉ Open on its own
        </a>
      </div>

      {failed ? (
        <div className="sheet-banner sheet-banner-error">
          <span>
            The document could not be loaded from <code>{DOC}</code>. It ships with the app in{' '}
            <code>public/docs/</code>, so this usually means the last deploy did not carry it —
            a rebuild puts it back.
          </span>
        </div>
      ) : (
        <iframe
          ref={frame}
          className="hf-frame"
          // THE HOST'S THEME TRAVELS WITH IT. The framed page cannot see the
          // app's toggle, so it is told; `key` on the theme reloads the frame
          // when somebody switches, which is cheap on a static file and exact.
          key={`${doc.id}-${scheme}`}
          src={`${DOC}?theme=${scheme}`}
          title={doc.title}
          style={{ height }}
          loading="eager"
        />
      )}
    </div>
  );
}

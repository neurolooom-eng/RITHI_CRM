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

/** In the repo at `public/docs/`, so it is served beside the app rather than
 *  from anywhere else. `BASE_URL` because the site is published under a path. */
const DOC = `${import.meta.env.BASE_URL}docs/how-a-call-works.html`;

export function HowRithiFunctions() {
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
  }, []);

  return (
    <div>
      <PageHeader
        title="How RITHI Functions"
        subtitle="Where every field on a call comes from — the masters behind the form, what the system refuses, and what it will not proceed without."
        icon="🧭"
      />

      <div className="hf-bar">
        <span className="hf-bar-note">
          Two flows: registering a direct customer call, and the whole life of a call raised from
          a request.
        </span>
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
          key={scheme}
          src={`${DOC}?theme=${scheme}`}
          title="How a call works — the two flows, the masters behind them, and what each step refuses"
          style={{ height }}
          loading="eager"
        />
      )}
    </div>
  );
}

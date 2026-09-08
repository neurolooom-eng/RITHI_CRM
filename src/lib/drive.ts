// ---------------------------------------------------------------------------
// DRIVE LINKS — turning a stored link into something the app can SHOW.
//
// The user, 2026-09-08: "is it possible to render the reports -- those saved in
// drive directly in app? instead of going to drive?" -- and then the rule that
// makes it work: "most of it are uploaded.. or rather has to be uploaded -
// pasting link shouldnt be an option".
//
// Drive has ONE supported embed endpoint, `/preview`, and it is not the URL
// anything stores: an upload comes back as `…/file/d/<ID>/view?usp=drivesdk`,
// which is the page a person opens, and which Drive refuses to be framed in.
// So the file ID is pulled out and the embed URL is built from it.
//
// WHAT MAKES THE EMBED WORK IS THE SHARING, NOT THE URL. CallReg.gs sets
// `ANYONE_WITH_LINK / VIEW` on every file it uploads (and on every AppSheet-era
// file it resolves). A file WITHOUT that renders Google's "you need access"
// page inside the frame -- and because the frame is cross-origin, JavaScript
// cannot tell that it did. Nothing here can detect it either. That is exactly
// why the report field became upload-only rather than a box somebody can paste
// a link to a file in their own Drive into, and why every preview keeps an
// "Open in Drive" beside it rather than offering one only when something fails.
//
// AN UNKNOWN LINK IS NOT A FAILURE. A link this cannot read comes back as an
// empty string and the caller opens it in a tab, exactly as before. Historical
// rows point at all sorts of things and none of them should stop working
// because the app learned a new trick.
// ---------------------------------------------------------------------------

// A Drive file ID: the opaque run of characters between /d/ and the next slash,
// or the `id` parameter of the older link shapes. Not validated beyond its
// shape -- whether the file exists is Drive's answer to give, not ours.
const ID = '([A-Za-z0-9_-]{10,})';

export function driveFileId(url: string): string {
  const u = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(u)) return '';
  // …/file/d/<ID>/view · …/document/d/<ID>/edit · …/spreadsheets/d/<ID>/…
  const path = new RegExp(`/d/${ID}`).exec(u);
  if (path) return path[1];
  // …/open?id=<ID> · …/uc?id=<ID>&export=download
  const query = new RegExp(`[?&]id=${ID}`).exec(u);
  if (query) return query[1];
  return '';
}

/** The URL to put in an iframe, or '' when this link cannot be shown in one.
 *  Docs, Sheets and Slides each preview under their own path -- a Doc served
 *  from `drive.google.com/file/d/…/preview` renders nothing at all. */
export function drivePreviewUrl(url: string): string {
  const u = String(url ?? '').trim();
  const id = driveFileId(u);
  if (!id) return '';
  // A FOLDER is not a document. `/drive/folders/<ID>` has no /d/ segment so it
  // does not reach here, but a folder opened from a search does, and framing it
  // shows a Drive chrome nobody asked for.
  if (/\/drive\/folders\//i.test(u)) return '';
  const editor = /\/(document|spreadsheets|presentation)\/d\//i.exec(u);
  if (editor) return `https://docs.google.com/${editor[1].toLowerCase()}/d/${id}/preview`;
  if (/^https?:\/\/(drive|docs)\.google\.com/i.test(u)) return `https://drive.google.com/file/d/${id}/preview`;
  // Some other host that happens to carry an id= parameter is not Drive.
  return '';
}

/** Can this link be shown inside the app at all? */
export const isPreviewable = (url: string): boolean => drivePreviewUrl(url) !== '';

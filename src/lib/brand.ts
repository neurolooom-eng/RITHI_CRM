// ---------------------------------------------------------------------------
// THE TWO MARKS, IN ONE PLACE.
//
// Everything that shows a logo imports it from here, so replacing a logo is
// replacing ONE FILE in `src/assets/` — no hunting through screens for the
// second and third copy of an import.
//
// THEY ARE NOT INTERCHANGEABLE, and that is the reason this file exists rather
// than a single export:
//
//   COMPANY_LOGO  Air Liquide Medical Systems. It goes on anything that leaves
//                 the building — the Delivery Challan, the Declaration. A
//                 printed document carries the COMPANY's mark, always (the
//                 user's rule, 2026-09-05), never the application's.
//
//   RITHI_LOGO    the RITHI CRM mark. The application's own chrome: the sign-in
//                 page and the menu bar. It says which system you are in, which
//                 is not something a customer document should say.
//
// To change one: drop the new file over `src/assets/<name>` keeping the name,
// or repoint the import below. Both places using it follow.
// ---------------------------------------------------------------------------
import almsLogo from '../assets/alms-logo.jpg';
// The MARK on its own (no wordmark): it sits in a 30px tile in the menu bar,
// where the full lockup's text would be unreadable. `rithi-crm-logo.svg` is the
// lockup, kept for anywhere it can be shown at size.
import rithiLogo from '../assets/rithi-crm-logo-only.svg';

export const COMPANY_LOGO = almsLogo;
export const RITHI_LOGO = rithiLogo;

// ---------------------------------------------------------------------------
// THE COMPANY'S MARK AS BYTES, for a document that has to CARRY it rather than
// link to it. The Word copy of the Field Failure Report embeds the logo as a
// part of the file; a `src` attribute is no use inside a .docx.
//
// Fetched from the built asset rather than inlined as a base64 constant, so
// replacing the logo stays what this file promises: dropping one file into
// src/assets. It is same-origin, so no CORS question arises.
//
// RETURNS NULL RATHER THAN THROWING. A document without its logo is a document;
// a download that fails because an image could not be read is not.
// ---------------------------------------------------------------------------
let logoBytesCache: Uint8Array | null | undefined;

export async function companyLogoBytes(): Promise<Uint8Array | null> {
  if (logoBytesCache !== undefined) return logoBytesCache;
  try {
    const res = await fetch(COMPANY_LOGO);
    if (!res.ok) { logoBytesCache = null; return null; }
    logoBytesCache = new Uint8Array(await res.arrayBuffer());
  } catch {
    logoBytesCache = null;
  }
  return logoBytesCache;
}

/** Which kind of picture the mark is, from the asset's own file name — the
 *  .docx must declare a content type for the extension it stores, and getting
 *  that wrong is a file Word refuses to open. */
export const COMPANY_LOGO_TYPE: 'jpeg' | 'png' =
  /\.png(\?|$)/i.test(COMPANY_LOGO) ? 'png' : 'jpeg';

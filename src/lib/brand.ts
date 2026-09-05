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
import rithiLogo from '../assets/rithi-crm-logo.svg';

export const COMPANY_LOGO = almsLogo;
export const RITHI_LOGO = rithiLogo;

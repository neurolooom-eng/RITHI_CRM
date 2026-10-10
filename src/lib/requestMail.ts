// ===========================================================================
// "NEED MORE DETAILS" -- A MAIL TO WHOEVER RAISED A CALL REQUEST (the user,
// 2026-10-08: "Add a provision to compose a mail to the requestor asking for
// more details ... This is for Pending Registrations - Commercial Team will be
// doing it.").
//
//   Subject  Need more details | <Product> <Sl No> | <Installation Call>
//   Body     the details of the request
//   To       the requestor's email (the request's E-Mail ID)
//   Cc       the requestor's Reporting Manager's email (the User Master)
//   From     the person composing it
//
// COMPOSED, NOT SENT: it opens a new mail in GMAIL, in a new tab, signed in as
// the person composing it -- so it goes FROM them, from their own account, and
// they can read and change it before it leaves; RITHI sends no mail of its own.
// GMAIL, NOT A mailto: LINK (the user, 2026-10-10: "it is opening Outlook, but
// the official mail box is Gmail.. It has to open a new mail from my gmail"):
// a mailto: link opens whatever mail program the computer has as its default,
// which on the office machines is Outlook. The third part
// of the subject is the request's call family (Installation / Field / PM Call)
// by `callFamily()`, the one matcher every screen uses, so an installation
// request reads "Installation Call" as asked whatever spelling it was stored in.
//
// Kept apart from the screen and from supabase.ts (which reads import.meta.env)
// so a check script can load it.
// ===========================================================================
import { callFamily } from './calltype';

type Row = Record<string, unknown>;
const v = (r: Row, k: string) => String(r[k] ?? '').trim();

const FAMILY_LABEL = { install: 'Installation Call', field: 'Field Call', pm: 'PM Call' } as const;

/** THE TABLE'S ROWS (the user, 2026-10-10: "Make the Mail Compose into a
 *  tabular Format, I want only a few Fields" -- these twelve, in this order).
 *  EVERY ROW IS SHOWN, a blank one as "—": the mail asks for MORE details, so a
 *  field the request left empty is exactly what the reader should see. */
export const REQUEST_MAIL_FIELDS: [string, string][] = [
  ['Request ID', 'REQID'],
  ['Product', 'PRODUCT'],
  ['Serial No', 'SERIAL NO'],
  ['Party Name', 'PARTY NAME'],
  ['Call Type', 'CALL TYPE'],
  ['Standard Complaint', 'Standard Complaint'],
  ['Reported Problem', 'Reported Problem'],
  ['Raised on', 'Timestamp'],
  ['City', 'City'],
  ['State', 'State'],
  ['Customer Contact', 'CUSTOMER CONTACT DETAILS'],
  ['Contact Number', 'CUSTOMER CONTACT Number'],
];

export function requestMailSubject(row: Row): string {
  const machine = [v(row, 'PRODUCT'), v(row, 'SERIAL NO')].filter(Boolean).join(' ');
  return `Need more details | ${machine || '—'} | ${FAMILY_LABEL[callFamily(row['CALL TYPE'])]}`;
}

/** `fmt` renders a value for the reader -- the screen passes its date
 *  formatter, so a timestamp reads dd-MMM-yyyy HH:mm:ss rather than the wire. */
export type MailFmt = (label: string, value: string) => string;
const asIs: MailFmt = (_l, x) => x;

export function requestMailRows(row: Row, fmt: MailFmt = asIs): [string, string][] {
  return REQUEST_MAIL_FIELDS.map(([label, key]) => {
    const x = v(row, key);
    return [label, x ? fmt(label, x) : '—'];
  });
}

const greeting = (row: Row) => (v(row, 'ENGINEER') ? `Dear ${v(row, 'ENGINEER')},` : 'Hello,');
const ASK = 'We need more details to register the call request below. Please reply with the missing information.';

/** The whole mail as plain text: the clipboard's text form, and the body the
 *  Gmail link carries when the clipboard is refused. */
export function requestMailBody(row: Row, fromName: string, fmt: MailFmt = asIs): string {
  return [
    greeting(row), '', ASK, '',
    ...requestMailRows(row, fmt).map(([label, x]) => `${label}: ${x}`),
    '', 'Regards,', fromName || '',
  ].join('\n').replace(/\n+$/, '\n');
}

const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The whole mail as HTML with a real table, put on the clipboard to be pasted
 *  into Gmail. INLINE STYLES ONLY: a pasted mail keeps those and drops any
 *  stylesheet. */
export function requestMailHtml(row: Row, fromName: string, fmt: MailFmt = asIs): string {
  const cell = 'border:1px solid #9aa4b2;padding:6px 10px;vertical-align:top;font-family:Arial,sans-serif;font-size:13px;';
  const rows = requestMailRows(row, fmt).map(([label, x]) =>
    `<tr><td style="${cell}background:#eef1f5;font-weight:bold;white-space:nowrap;">${esc(label)}</td>`
    + `<td style="${cell}">${esc(x).replace(/\n/g, '<br>')}</td></tr>`).join('');
  const p = (t: string) => `<p style="font-family:Arial,sans-serif;font-size:13px;margin:0 0 10px;">${t}</p>`;
  return p(esc(greeting(row))) + p(esc(ASK))
    + `<table style="border-collapse:collapse;margin:0 0 12px;">${rows}</table>`
    + p(`Regards,<br>${esc(fromName || '')}`);
}

/** Gmail's compose window, filled in. `from` is the composer's own address:
 *  Gmail's `authuser` opens the compose in THAT signed-in account when the
 *  browser holds several, and asks which account where it is not signed in --
 *  it never sends from anybody else. Addresses are joined with commas and
 *  every part is percent-encoded, so an ampersand in a party name cannot cut
 *  the body short. */
export function requestGmailUrl(to: string[], cc: string[], subject: string, body: string, from = ''): string {
  const list = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].join(',');
  const q = [
    from.trim() ? `authuser=${encodeURIComponent(from.trim())}` : '',
    'view=cm', 'fs=1',
    `to=${encodeURIComponent(list(to))}`,
    list(cc) ? `cc=${encodeURIComponent(list(cc))}` : '',
    `su=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(body)}`,
  ].filter(Boolean).join('&');
  return `https://mail.google.com/mail/?${q}`;
}

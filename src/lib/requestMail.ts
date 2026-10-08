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
// COMPOSED, NOT SENT: it opens the person's own mail program through a mailto:
// link, so it goes FROM them, from their own account, and they can read and
// change it before it leaves -- RITHI sends no mail of its own. The third part
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

/** The request's details, in the order the request form asks for them, each
 *  only where it holds something -- an empty line says nothing to the reader. */
export const REQUEST_MAIL_FIELDS: [string, string][] = [
  ['Request ID', 'REQID'],
  ['Raised on', 'Timestamp'],
  ['Engineer', 'ENGINEER'],
  ['Engineer email', 'E-Mail ID'],
  ['Call type', 'CALL TYPE'],
  ['Party name', 'PARTY NAME'],
  ['City', 'City'],
  ['State', 'State'],
  ['Address', 'Address'],
  ['Product', 'PRODUCT'],
  ['Serial no.', 'SERIAL NO'],
  ['Standard complaint', 'Standard Complaint'],
  ['Reported problem', 'Reported Problem'],
  ['Customer contact', 'CUSTOMER CONTACT DETAILS'],
  ['Customer contact number', 'CUSTOMER CONTACT Number'],
  ['Call attended?', 'Call Attended?'],
  ['Attended date', 'Attended Date'],
  ['Plan date', 'PLAN DATE (Visit Planned Date)'],
  ['Additional comments', 'Additional Comments'],
];

export function requestMailSubject(row: Row): string {
  const machine = [v(row, 'PRODUCT'), v(row, 'SERIAL NO')].filter(Boolean).join(' ');
  return `Need more details | ${machine || '—'} | ${FAMILY_LABEL[callFamily(row['CALL TYPE'])]}`;
}

/** `fmt` renders a value for the reader -- the screen passes its date
 *  formatter, so a timestamp reads dd-MMM-yyyy HH:mm:ss rather than the wire. */
export function requestMailBody(row: Row, fromName: string, fmt: (label: string, value: string) => string = (_l, x) => x): string {
  const lines = REQUEST_MAIL_FIELDS
    .map(([label, key]) => [label, v(row, key)] as const)
    .filter(([, x]) => x)
    .map(([label, x]) => `${label}: ${fmt(label, x)}`);
  const hello = v(row, 'ENGINEER') ? `Dear ${v(row, 'ENGINEER')},` : 'Hello,';
  return [
    hello,
    '',
    'We need more details to register the call request below. Please reply with the missing information.',
    '',
    ...lines,
    '',
    'Regards,',
    fromName || '',
  ].join('\n').replace(/\n+$/, '\n');
}

/** The mailto: link. Addresses are joined with commas and every part is
 *  percent-encoded, so an ampersand in a party name cannot cut the body short. */
export function requestMailto(to: string[], cc: string[], subject: string, body: string): string {
  const list = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].join(',');
  const q = [
    cc.length && list(cc) ? `cc=${encodeURIComponent(list(cc))}` : '',
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(body)}`,
  ].filter(Boolean).join('&');
  return `mailto:${encodeURIComponent(list(to)).replace(/%2C/gi, ',').replace(/%40/g, '@')}?${q}`;
}

// ---------------------------------------------------------------------------
// The Declaration form — the second sheet of v2_DCTemplate, the one that
// travels with the parcel so a courier or a checkpoint can see what is inside.
//
// Three things on the printed sheet have no source in the app, and each is
// handled where it belongs:
//   • the recipient's address — the User Master's Address / City / State /
//     Contact for that engineer (0029_engineer_address.sql), so it is
//     maintained in one place and right on every parcel;
//   • the approximate value — declared by Stores at print time. The form calls
//     it approximate, and the parts catalogue carries no prices to total;
//   • the purpose sentence — the sheet's own wording is the default, but a
//     parcel is not always a ventilator part, so it is editable.
// ---------------------------------------------------------------------------

export const DECLARATION_FORM = {
  title: 'DECLARATION FORM',
  gstNo: '33AAACE8420FIZ3',
  areaCode: '042',
  heading: 'TO WHOMSOEVER IT MAY CONCERN',
  contains: 'This is to declare that the parcel contains spares/accessories for medical equipment.',
  // The sheet's wording, kept verbatim as the starting point.
  purpose: 'This delivery challan materials are sent for service purpose for ICU VENTILATOR for COVD-19 HOSPITAL',
  valueLabel: 'Approximate value for the below list is Rs. ',
  noTransaction: 'This does not involve any financial transaction',
  forCompany: 'FOR AIR LIQUIDE MEDICAL SYSTEMS PVT LTD',
  senderName: 'JAGADEESAN C',
  senderDept: 'SERVICE STORES',
} as const;

// What the person printing may set. Held together so the form, the defaults
// and what is remembered per engineer are one shape.
export interface DeclarationInput {
  to: string;        // recipient name — the engineer, by default
  address: string;   // street address, as typed in the User Master
  city: string;
  state: string;
  phone: string;
  value: string;     // as declared, free text: it may be "Approx 12,000"
  purpose: string;
  courier: string;
}

export interface EngineerAddressFields { address?: string; city?: string; state?: string; phone?: string }

// How the four fields read on a parcel: the street address as typed, then
// "City, State" on its own line, then the phone. Anything missing is simply
// left out rather than printing a stray comma.
export function addressBlock(a: EngineerAddressFields): string[] {
  const street = s(a.address).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const place = [s(a.city), s(a.state)].filter(Boolean).join(', ');
  const phone = s(a.phone);
  return [...street, ...(place ? [place] : []), ...(phone ? [`Ph: ${phone}`] : [])];
}

const s = (v: unknown) => String(v ?? '').trim();

export function defaultInput(
  engineer: string, courier: string, from: EngineerAddressFields = {},
): DeclarationInput {
  return {
    to: s(engineer),
    address: s(from.address), city: s(from.city), state: s(from.state), phone: s(from.phone),
    value: '',
    purpose: DECLARATION_FORM.purpose,
    courier: s(courier),
  };
}

// The courier line reads "BY DTDC COURIER" on the sheet. Whatever is typed in
// the dispatch is put in the same shape, and a blank courier leaves the line
// generic rather than printing "BY  COURIER".
export function courierLine(courier: string): string {
  const c = s(courier);
  if (!c) return 'BY COURIER';
  return /courier|hand|delivery|post/i.test(c) ? `BY ${c.toUpperCase()}` : `BY ${c.toUpperCase()} COURIER`;
}

// A blank address is the one thing that makes the form useless — it is what
// the parcel is addressed by. Flagged before printing, not after.
export function gaps(input: DeclarationInput): string[] {
  const out: string[] = [];
  if (!s(input.to)) out.push('Who the parcel is addressed to');
  if (!addressBlock(input).length) out.push('The delivery address (User Master → Address / City / State)');
  if (!s(input.value)) out.push('The approximate value');
  return out;
}

// The sheet's grid is 18 rows (rows 17–34), which is what one page holds
// beside its declaration paragraphs and the sender block.
export const DECLARATION_ROWS_PER_PAGE = 18;

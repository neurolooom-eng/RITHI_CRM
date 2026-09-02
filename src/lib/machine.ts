// ---------------------------------------------------------------------------
// WHICH MACHINE.
//
// A machine is its MODEL plus its SERIAL, never the serial alone. Serials
// repeat across models — the install base has eleven machines numbered "219",
// and 3,794 serials in all appear more than once — so keying on the number
// alone points at a different machine, usually at a different hospital.
//
// This was live on the Hotline desk: a request for ORION-G 201 at V-Care
// Hyderabad was offered an open call for VEGA 201 at Star Multispeciality
// Varansi, one click from being mapped onto it.
//
// Compared with punctuation and spacing removed, because "ORION-G", "ORION G"
// and "ORIONG" are one model and splitting them would hide a real match.
//
// Pure, and its own module so it can be tested without the Supabase client.
// ---------------------------------------------------------------------------
const squash = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const machineKey = (product: unknown, serial: unknown): string =>
  `${squash(product)}|${squash(serial)}`;

/** Do these two refer to the same machine? Blank on either side is not a match. */
export const sameMachine = (aProduct: unknown, aSerial: unknown, bProduct: unknown, bSerial: unknown): boolean => {
  const a = machineKey(aProduct, aSerial);
  const b = machineKey(bProduct, bSerial);
  return a === b && !a.startsWith('|') && !a.endsWith('|');
};

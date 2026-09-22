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
import { squash as squashText } from './headers';
const squash = (v: unknown) => squashText(String(v ?? ''));

export const machineKey = (product: unknown, serial: unknown): string =>
  `${squash(product)}|${squash(serial)}`;

/** Do these two refer to the same machine? Blank on either side is not a match. */
export const sameMachine = (aProduct: unknown, aSerial: unknown, bProduct: unknown, bSerial: unknown): boolean => {
  const a = machineKey(aProduct, aSerial);
  const b = machineKey(bProduct, bSerial);
  return a === b && !a.startsWith('|') && !a.endsWith('|');
};

// ---------------------------------------------------------------------------
// A ROW NEEDS AN IDENTITY OF ITS OWN, AND "EVERY FIELD IT HAS" IS NOT ONE.
//
// Machine History keyed each row on source + reference + date + detail, and two
// visits filed against the same call on the same day with the same status and
// no remark are identical in all four. Reported from use (2026-09-22): with
// the Spare chip selected the table showed three spares and TWO VISITS, five
// rows in total -- React's own warning for duplicate keys is that children may
// be "duplicated and/or omitted", and that is exactly what it did. Two spare
// rows were omitted and the two colliding visits were duplicated in. Nothing
// errored, the counts were right, and the table was wrong.
//
// It is not a display accident either way: two visits identical in every shown
// field IS a duplicate visit, which the uid derivation exists to prevent. The
// key makes the screen correct; showing the visit's own uid beside it is what
// makes the duplicate visible rather than looking like this bug again.
//
// NUMBERED WITHIN ITS REGISTER rather than given a random id: `Visit#2` is
// stable across renders (a random one would remount every row on every
// keystroke), and it reads as something when it turns up in a bug report.
// ---------------------------------------------------------------------------
export function withEventKeys<T extends { source: string }>(events: T[]): (T & { key: string })[] {
  const seen = new Map<string, number>();
  return events.map((e) => {
    const n = (seen.get(e.source) ?? 0) + 1;
    seen.set(e.source, n);
    return { ...e, key: `${e.source}#${n}` };
  });
}

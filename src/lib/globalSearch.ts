// ===========================================================================
// GLOBAL SEARCH — the header box searches records, not only screen names.
//
// The user, 2026-10-01, pointing at "Search modules…": "This has to search
// Modules / Content / Calls / Spare Request -- basically all Content." Asked
// which registers: calls and call requests, spare requests and consumption,
// the masters (parties, machines, parts), and documents, the Knowledge Base
// and FFRs. Asked what a click does: OPEN THAT RECORD DIRECTLY.
//
// This file is the part that can be tested without a database: what each kind
// of hit is called, where it goes, what it carries there, and which page key
// must be held for it to be offered at all. The reads live in supabase.ts and
// are bounded by row-level security, so a person is only ever shown records
// they could already open on the register itself; the page key is the second
// half -- a hit whose screen the person may not open is not offered.
// ===========================================================================

import { callFamily } from './calltype';

export type HitKind =
  | 'call' | 'request' | 'spare' | 'consumption'
  | 'party' | 'machine' | 'part'
  | 'document' | 'kb' | 'ffr';

export interface SearchHit {
  kind: HitKind;
  /** Unique within the results, for React and de-duplication. */
  key: string;
  title: string;
  sub: string;
  /** In-app route to open, with navigation state the screen reads. */
  to?: string;
  state?: Record<string, unknown>;
  /** An outside link (a document in Drive), opened in a new tab. */
  href?: string;
  /** The page whose key must be held for the hit to be offered. EMPTY for a
   *  page open to everyone (Field Solutions, the Knowledge Base, is
   *  `alwaysOpen` in the menu and has no key to hold). */
  route: string;
}

/** The groups, in the order they are listed, with how each is named. */
export const HIT_GROUPS: { kind: HitKind; label: string; icon: string }[] = [
  { kind: 'call', label: 'Calls', icon: '📞' },
  { kind: 'request', label: 'Call Requests', icon: '📝' },
  { kind: 'spare', label: 'Spare Requests', icon: '📦' },
  { kind: 'consumption', label: 'Spare Consumption', icon: '🔧' },
  { kind: 'party', label: 'Parties', icon: '🏥' },
  { kind: 'machine', label: 'Machines', icon: '🩺' },
  { kind: 'part', label: 'Parts', icon: '🧩' },
  { kind: 'document', label: 'Documents', icon: '📄' },
  { kind: 'kb', label: 'Knowledge Base', icon: '📚' },
  { kind: 'ffr', label: 'Field Failure Reports', icon: '⚠️' },
];

/** How many of each kind are SHOWN. One more is fetched (`PER_KIND + 1`) so the
 *  panel can say a group has more rather than let five read as all (D-117). */
export const PER_KIND = 5;
/** The hits a group shows, and whether the register holds more than that. */
export function shownHits<T>(list: T[]): { shown: T[]; more: boolean } {
  return { shown: list.slice(0, PER_KIND), more: list.length > PER_KIND };
}
/** Below this many characters nothing is searched: two letters match half a
 *  register, and every keystroke would be a round trip to all ten. */
export const MIN_CHARS = 3;

/** Safe inside a PostgREST `or(...)` ilike: the characters that delimit its
 *  grammar are flattened to spaces, the same as supabase.ts's own search. */
export function searchTerm(q: string): string {
  return String(q ?? '').replace(/[%,()*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Which register a call belongs to -- by `callFamily()`, the one matcher
 *  the database's own `call_table_for()` mirrors. */
export function callRoute(callType: unknown): string {
  const fam = callFamily(callType);
  return fam === 'install' ? '/installations' : fam === 'pm' ? '/pm-calls' : '/field-calls';
}

const s = (v: unknown) => (v == null ? '' : String(v)).trim();
const join = (...xs: unknown[]) => xs.map(s).filter(Boolean).join(' · ');

export const hitFor = {
  call: (r: Record<string, unknown>): SearchHit => {
    const to = callRoute(r.call_type);
    return {
      kind: 'call', key: `call:${s(r.ucn)}`, route: to, to, state: { viewUcn: s(r.ucn) },
      title: join(r.ucn, r.party_name),
      sub: join(r.product_name, r.serial, r.call_number, r.open_state || r.status),
    };
  },
  request: (r: Record<string, unknown>): SearchHit => ({
    kind: 'request', key: `request:${s(r.reqid) || s(r.id)}`, route: '/pending-registrations',
    to: '/pending-registrations', state: { openReqId: s(r.reqid) },
    title: join(r.reqid, r.party_name), sub: join(r.product, r.serial_no, r.call_type, 'Pending registration'),
  }),
  spare: (r: Record<string, unknown>): SearchHit => ({
    kind: 'spare', key: `spare:${s(r.uid)}`, route: '/spare-requests',
    to: '/spare-requests', state: { openSpareUid: s(r.uid) },
    title: join(r.uid, r.party_name), sub: join(r.part, r.ucn, r.engineer, r.stage || r.status),
  }),
  consumption: (r: Record<string, unknown>): SearchHit => ({
    kind: 'consumption', key: `consumption:${s(r.id)}`, route: '/spare-consumption',
    to: '/spare-consumption', state: { openConsumptionId: Number(r.id) },
    title: join(r.part), sub: join(r.ucn, r.engineer, r.qty != null ? `Qty ${s(r.qty)}` : ''),
  }),
  party: (r: Record<string, unknown>): SearchHit => ({
    kind: 'party', key: `party:${s(r.id)}`, route: '/parties',
    to: '/parties', state: { openPartyId: Number(r.id) },
    title: s(r.party_name), sub: join(r.city, r.state, r.party_key),
  }),
  machine: (r: Record<string, unknown>): SearchHit => ({
    kind: 'machine', key: `machine:${s(r.item_name)}|${s(r.serial_number)}`, route: '/machine-history',
    to: '/machine-history', state: { product: s(r.item_name), serial: s(r.serial_number) },
    title: join(r.item_name, r.serial_number), sub: join(r.party_name),
  }),
  part: (r: Record<string, unknown>): SearchHit => ({
    kind: 'part', key: `part:${s(r.id)}`, route: '/part-search',
    to: '/part-search', state: { code: s(r.code) },
    title: join(r.code), sub: join(r.description, r.category),
  }),
  document: (r: Record<string, unknown>): SearchHit => {
    const kind = s(r.kind);
    const route = kind === 'qms' ? '/qms' : kind === 'service_note' ? '/service-manuals/notes' : '/service-manuals';
    const label = kind === 'qms' ? 'QMS' : kind === 'service_note' ? 'Technical note' : 'Service manual';
    return {
      kind: 'document', key: `document:${s(r.id)}`, route, href: s(r.url) || undefined,
      // No link on the row: open its shelf instead, so the hit still goes somewhere.
      to: s(r.url) ? undefined : route,
      title: s(r.title), sub: join(label, r.doc_no, r.revision ? `Rev ${s(r.revision)}` : '', r.product),
    };
  },
  kb: (r: Record<string, unknown>): SearchHit => ({
    kind: 'kb', key: `kb:${s(r.id)}`, route: '',
    to: '/knowledge-base', state: { openArticle: Number(r.id) },
    title: s(r.title), sub: join(r.category, r.product),
  }),
  ffr: (r: Record<string, unknown>): SearchHit => ({
    kind: 'ffr', key: `ffr:${s(r.ffr_no)}`, route: '/failure-report',
    to: `/ffr/${encodeURIComponent(s(r.ffr_no))}`,
    title: join(r.ffr_no, r.customer_name), sub: join(r.product_name, r.product_serial, r.ucn, r.ffr_status),
  }),
};

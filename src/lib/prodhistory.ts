// ---------------------------------------------------------------------------
// ONE MACHINE'S WHOLE LIFE, out of two databases.
//
// The question this answers is the oldest one on the service desk: "has this
// happened to this machine before?" Until now it could only be asked of the
// live registers, which start where the data migration started — so a 2016
// ventilator with nine years of faults behind it looked new.
//
// The live half and the archive half are assembled into ONE list, ordered by
// date, each row carrying WHERE IT CAME FROM. That last part is not decoration:
// the two halves are not equally trustworthy. A live call has a state the
// register derives from its latest visit and policies that decided whether you
// may see it at all; an archive call has whatever the old system was told when
// somebody closed it. Showing them in one list without saying which is which
// would quietly promise the same standard of evidence for both.
//
// WHAT IS DELIBERATELY NOT DONE HERE: no de-duplication between the halves.
// If a call exists in both, both are shown. The archive is closed data and the
// cut-over date is a fact about the migration, not about this machine — so a
// row appearing twice is information ("the migration copied this one"), while a
// row silently dropped by a matching rule I guessed is a call that vanished.
// ---------------------------------------------------------------------------

import { getSupabase } from './supabase';
import { machineKey, sameMachine } from './machine';
import { archiveHistory, type ArchiveHistory, EMPTY_HISTORY } from './archive';

export type EventKind = 'Call' | 'Visit' | 'Part' | 'Cover';
export type EventSource = 'Live' | 'Archive';

export interface HistoryEvent {
  id: string;
  // YYYY-MM-DD, or '' when the source had no usable date. An undated row is
  // kept and sorted last rather than dropped: "we did something to this machine
  // and nobody wrote down when" is worth knowing.
  at: string;
  kind: EventKind;
  source: EventSource;
  ucn: string;
  what: string;          // the headline — the complaint, the part, the cover
  detail: string;        // the supporting line
  engineer: string;
  status: string;
  origin: string;        // which old export an archive row came out of
}

export interface MachineFacts {
  product: string; serial: string; party: string; city: string; state: string;
  itemStatus: string; warrantyNumber: string; warrantyEnd: string;
  contractNumber: string; contractType: string; contractEnd: string;
  installedOn: string;
  // Where these facts came from. The live Product Master is the register of
  // record; the archive answers only for a machine the live one has forgotten.
  from: EventSource | 'none';
}

export interface MachineHistory {
  facts: MachineFacts | null;
  events: HistoryEvent[];
  // A LIST THAT CAME BACK FULL. Every count on the screen is then a lower
  // bound and shows a "+", on the title badge and on every facet chip alike.
  capped: boolean;
  live: { calls: number; visits: number; parts: number; cover: number };
  archive: { ok: boolean; reason: string; calls: number; visits: number; parts: number; cover: number };
}

const str = (v: unknown) => String(v ?? '').trim();
const day = (v: unknown): string => {
  const s = str(v);
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};

// How much of one machine's past is fetched per request. No real machine comes
// near these; they are checked rather than trusted, because a count over
// partly-loaded rows is a LOWER BOUND and has to show a "+" (CLAUDE.md).
const CALL_PAGE = 1000;
const CHILD_PAGE = 2000;

interface Page { rows: Record<string, unknown>[]; capped: boolean }

const CALL_COLS =
  'ucn,call_number,reg_date,complaint_date,party_name,city,product_name,serial,call_type,'
  + 'standard_complaint,complaint_reported,allocated_to,status,last_status,open_state,cancelled_at';

// ---------------------------------------------------------------------------
// THE LIVE CALLS, from the three base tables rather than the `calls` view.
//
// Two reasons, and the first is speed: ProdHistory_05 gives each base table a
// stored `serial_key` a client can filter on as an equality. The view cannot
// carry it — it was created as `select *`, which expands to a fixed column list
// — and re-creating that view is the one statement in this repository that has
// twice cost every user sight of every call, because `create or replace view`
// drops `security_invoker` silently.
//
// The second is that it costs no access: 0040 put the RLS policies on the base
// tables (`calls_scoped_read`), and the view only inherits them. A call you may
// not see through the register is not returned here either.
//
// THE FALLBACK IS THE POINT OF THE try/catch. Before ProdHistory_05 is run
// there is no `serial_key` column and PostgREST rejects the filter outright. A
// screen that breaks until an optional performance file has been applied is not
// an optional file — so it drops back to the view and an exact, case-insensitive
// match on the serial, which is slower and equally correct.
// ---------------------------------------------------------------------------
async function liveCalls(serial: string): Promise<Page> {
  const c = getSupabase();
  if (!c) return { rows: [], capped: false };
  const key = serial.trim().toLowerCase();
  if (!key) return { rows: [], capped: false };
  const tables = ['field_calls', 'installation_calls', 'pm_calls'];
  try {
    const pages = await Promise.all(tables.map((t) =>
      c.from(t).select(CALL_COLS).eq('serial_key', key).limit(CALL_PAGE).then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as Record<string, unknown>[];
      })));
    return { rows: pages.flat(), capped: pages.some((p) => p.length >= CALL_PAGE) };
  } catch {
    const { data, error } = await c.from('calls').select(CALL_COLS)
      .ilike('serial', serial.trim()).limit(CALL_PAGE);
    if (error) return { rows: [], capped: false };
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    return { rows, capped: rows.length >= CALL_PAGE };
  }
}

async function liveVisits(ucns: string[]): Promise<Page> {
  const c = getSupabase();
  if (!c || ucns.length === 0) return { rows: [], capped: false };
  const { data, error } = await c.from('reports')
    .select('uid,ucn,call_number,call_status,engineer,visit_at,updated_at')
    .in('ucn', ucns).limit(CHILD_PAGE);
  if (error) return { rows: [], capped: false };
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return { rows, capped: rows.length >= CHILD_PAGE };
}

async function liveParts(ucns: string[]): Promise<Page> {
  const c = getSupabase();
  if (!c || ucns.length === 0) return { rows: [], capped: false };
  const { data, error } = await c.from('spare_consumption')
    .select('ucn,call_number,part,qty,engineer,created_at')
    .in('ucn', ucns).limit(CHILD_PAGE);
  if (error) return { rows: [], capped: false };
  // A VOIDED LINE IS NOT A FITTED PART. Quality records are never deleted here
  // (0049) — a wrong consumption line is voided by setting the quantity to 0,
  // and the row is kept with its original quantity and reason. On a history
  // screen that row would read as a part that went into this machine.
  //
  // The cap is measured BEFORE the voided lines are dropped: the page was full
  // of rows whether or not they survive the filter.
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return { rows: rows.filter((r) => Number(r.qty ?? 0) > 0), capped: rows.length >= CHILD_PAGE };
}

async function liveMachine(serial: string): Promise<Record<string, unknown> | null> {
  const c = getSupabase();
  if (!c) return null;
  const key = serial.trim().toLowerCase();
  if (!key) return null;
  const { data, error } = await c.from('products')
    .select('item_name,serial_number,party_name,item_status,warranty_number,warranty_start,warranty_end,'
      + 'contract_number,contract_start,contract_end,contract_type,extra')
    .eq('serial_key', key).limit(50);
  if (error || !data) return null;
  return (data as unknown as Record<string, unknown>[])[0] ?? null;
}

// ---------------------------------------------------------------------------
// The timeline. Every builder below answers the same two questions — WHEN, and
// WHAT IN ONE LINE — because a history people scan has to be readable down a
// single column, not reconstructed from six.
// ---------------------------------------------------------------------------
function liveEvents(
  calls: Record<string, unknown>[],
  visits: Record<string, unknown>[],
  parts: Record<string, unknown>[],
  machine: Record<string, unknown> | null,
): HistoryEvent[] {
  const out: HistoryEvent[] = [];

  for (const r of calls) {
    const ucn = str(r.ucn);
    // The register's own rule, not a second copy of it: cancelled first (a call
    // cancelled while re-opened is cancelled), then the derived open state.
    const state = str(r.cancelled_at) ? 'Cancelled' : str(r.open_state) || str(r.status);
    out.push({
      id: `live-call-${ucn || str(r.call_number)}`,
      at: day(r.reg_date) || day(r.complaint_date),
      kind: 'Call', source: 'Live', ucn,
      what: str(r.standard_complaint) || str(r.complaint_reported) || str(r.call_type) || 'Call',
      detail: [str(r.call_type), str(r.complaint_reported)].filter(Boolean).join(' · '),
      engineer: str(r.allocated_to),
      status: state,
      origin: '',
    });
  }

  for (const r of visits) {
    out.push({
      id: `live-visit-${str(r.uid) || `${str(r.ucn)}-${str(r.visit_at)}`}`,
      at: day(r.visit_at) || day(r.updated_at),
      kind: 'Visit', source: 'Live', ucn: str(r.ucn),
      what: str(r.call_status) || 'Visit',
      detail: '',
      engineer: str(r.engineer),
      status: str(r.call_status),
      origin: '',
    });
  }

  for (const r of parts) {
    const qty = Number(r.qty ?? 0);
    out.push({
      id: `live-part-${str(r.ucn)}-${str(r.part)}-${str(r.created_at)}`,
      at: day(r.created_at),
      kind: 'Part', source: 'Live', ucn: str(r.ucn),
      what: str(r.part),
      detail: qty ? `${qty} fitted` : '',
      engineer: str(r.engineer),
      status: '',
      origin: '',
    });
  }

  // Cover is a PERIOD, and the event is its start — that is the date somebody
  // scanning the timeline is looking for ("when did the AMC begin?"). The end
  // rides on the detail line.
  if (machine) {
    const push = (kind: string, number: string, start: unknown, end: unknown, type: string) => {
      if (!str(number) && !day(start) && !day(end)) return;
      out.push({
        id: `live-cover-${kind}-${str(number)}`,
        at: day(start),
        kind: 'Cover', source: 'Live', ucn: '',
        what: `${kind}${type ? ` (${type})` : ''}${str(number) ? ` ${str(number)}` : ''}`,
        detail: day(end) ? `to ${day(end)}` : '',
        engineer: '',
        status: '',
        origin: '',
      });
    };
    push('Warranty', str(machine.warranty_number), machine.warranty_start, machine.warranty_end, '');
    push('Contract', str(machine.contract_number), machine.contract_start, machine.contract_end,
      str(machine.contract_type));
  }

  return out;
}

function archiveEvents(h: ArchiveHistory): HistoryEvent[] {
  const out: HistoryEvent[] = [];
  for (const r of h.calls) {
    out.push({
      id: `arc-call-${r.ucn || r.call_number}-${r.reg_date ?? ''}`,
      at: day(r.reg_date) || day(r.complaint_date),
      kind: 'Call', source: 'Archive', ucn: r.ucn,
      what: r.standard_complaint || r.complaint_reported || r.call_type || 'Call',
      detail: [r.call_type, r.complaint_reported].filter(Boolean).join(' · '),
      engineer: r.allocated_to,
      // The archive cannot derive a state — it has no guarantee its visits came
      // across — so it shows what the old system closed the call as, and
      // nothing more. See ProdHistory_01.sql on `closing_status`.
      status: r.closing_status || r.status,
      origin: r.source_system,
    });
  }
  for (const r of h.visits) {
    out.push({
      id: `arc-visit-${r.uid || `${r.ucn}-${r.visit_at ?? ''}`}`,
      at: day(r.visit_at),
      kind: 'Visit', source: 'Archive', ucn: r.ucn,
      what: r.call_status || 'Visit',
      detail: [r.work_done, r.root_cause].filter(Boolean).join(' · '),
      engineer: r.engineer,
      status: r.call_status,
      origin: r.source_system,
    });
  }
  for (const r of h.parts) {
    out.push({
      id: `arc-part-${r.ucn}-${r.part}-${r.consumed_on ?? ''}`,
      at: day(r.consumed_on),
      kind: 'Part', source: 'Archive', ucn: r.ucn,
      what: r.part || r.part_name,
      detail: [r.part && r.part_name && r.part_name !== r.part ? r.part_name : '',
        r.qty ? `${r.qty} fitted` : ''].filter(Boolean).join(' · '),
      engineer: r.engineer,
      status: '',
      origin: r.source_system,
    });
  }
  for (const r of h.cover) {
    out.push({
      id: `arc-cover-${r.cover_kind}-${r.cover_number}-${r.cover_start ?? ''}`,
      at: day(r.cover_start),
      kind: 'Cover', source: 'Archive', ucn: '',
      what: `${r.cover_kind || 'Cover'}${r.contract_type ? ` (${r.contract_type})` : ''}`
        + `${r.cover_number ? ` ${r.cover_number}` : ''}`,
      detail: day(r.cover_end) ? `to ${day(r.cover_end)}` : '',
      engineer: '',
      status: r.status,
      origin: r.source_system,
    });
  }
  return out;
}

/** Newest first; an undated row sorts last rather than to 1970. */
export function sortEvents(events: HistoryEvent[]): HistoryEvent[] {
  return [...events].sort((a, b) => {
    if (!a.at && !b.at) return a.kind.localeCompare(b.kind);
    if (!a.at) return 1;
    if (!b.at) return -1;
    return b.at.localeCompare(a.at) || a.kind.localeCompare(b.kind);
  });
}

// ---------------------------------------------------------------------------
// THE WHOLE HISTORY OF ONE MACHINE.
//
// Both halves are fetched at once and neither can sink the other: an archive
// that is unconfigured or unreachable leaves the live half on screen with a
// line saying so, which is the useful failure. The live half failing is the
// ordinary Supabase path and surfaces as an empty register would.
// ---------------------------------------------------------------------------
export async function loadMachineHistory(product: string, serial: string): Promise<MachineHistory> {
  const key = machineKey(product, serial);
  const blank: MachineHistory = {
    facts: null, events: [], capped: false,
    live: { calls: 0, visits: 0, parts: 0, cover: 0 },
    archive: { ok: false, reason: 'no-machine', calls: 0, visits: 0, parts: 0, cover: 0 },
  };
  if (key.startsWith('|') || key.endsWith('|')) return blank;

  const [callPage, machineRow, arc] = await Promise.all([
    liveCalls(serial),
    liveMachine(serial),
    archiveHistory(product, serial),
  ]);

  // A SERIAL IS NOT A MACHINE. Serials repeat across models — 3,794 of them in
  // this install base — so everything fetched by serial alone is now held to
  // the model as well. Without this, ORION-G 201 shows VEGA 201's faults, which
  // is the exact confusion machine.ts exists to prevent.
  const calls = callPage.rows.filter((r) => sameMachine(product, serial, r.product_name, r.serial));
  const machine = machineRow && sameMachine(product, serial, machineRow.item_name, machineRow.serial_number)
    ? machineRow : null;

  const ucns = [...new Set(calls.map((r) => str(r.ucn)).filter(Boolean))];
  const [visitPage, partPage] = await Promise.all([liveVisits(ucns), liveParts(ucns)]);
  const visits = visitPage.rows;
  const parts = partPage.rows;

  const live = liveEvents(calls, visits, parts, machine);
  const history = arc.ok ? arc.history : EMPTY_HISTORY;

  const ex = (machine?.extra as Record<string, unknown>) ?? {};
  const am = history.machine;
  const facts: MachineFacts | null = machine
    ? {
      product: str(machine.item_name), serial: str(machine.serial_number), party: str(machine.party_name),
      city: str(ex.City), state: str(ex.State), itemStatus: str(machine.item_status),
      warrantyNumber: str(machine.warranty_number), warrantyEnd: day(machine.warranty_end),
      contractNumber: str(machine.contract_number), contractType: str(machine.contract_type),
      contractEnd: day(machine.contract_end), installedOn: '', from: 'Live',
    }
    : am
      ? {
        product: am.product_name, serial: am.serial, party: am.party_name, city: am.city,
        state: am.state, itemStatus: am.item_status, warrantyNumber: '', warrantyEnd: '',
        contractNumber: '', contractType: '', contractEnd: '',
        installedOn: day(am.installed_on), from: 'Archive',
      }
      : null;

  return {
    facts,
    events: sortEvents([...live, ...archiveEvents(history)]),
    capped: callPage.capped || visitPage.capped || partPage.capped || history.capped,
    live: {
      calls: calls.length, visits: visits.length, parts: parts.length,
      cover: live.filter((e) => e.kind === 'Cover').length,
    },
    archive: {
      ok: arc.ok, reason: arc.reason,
      calls: history.calls.length, visits: history.visits.length,
      parts: history.parts.length, cover: history.cover.length,
    },
  };
}

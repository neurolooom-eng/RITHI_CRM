// ===========================================================================
// "VIEW AS" WRITES NOTHING — and this is the one place that makes it so
// (D-069, FRS-212.2).
//
// The preview changes what the CLIENT applies — permissions, visibility, the
// menu — while every request still runs under the administrator's own session.
// So a call registered or a spare approved during a preview used to be written
// AS THE ADMINISTRATOR, on a screen showing somebody else: a record attributed
// to neither of the people who believe they made it. The component said
// "Nothing is written — a read-only preview" and nothing made it true.
//
// ONE CHOKE POINT, NOT ONE PER SCREEN. Every Supabase client is created with
// `global: { fetch: guardFetch(fetch) }`, so every request the application
// makes to the database — REST, RPC, Storage, Edge Functions and Auth — passes
// through `previewRefuses()` below. A screen added tomorrow is covered without
// knowing this file exists; a per-screen guard is the one somebody forgets.
//
// FAIL-CLOSED. While a preview is active, a request is let through only when it
// is KNOWN to be a read:
//   - GET / HEAD / OPTIONS, to anything (PostgREST runs a GET rpc read-only);
//   - POST /rest/v1/rpc/<name> where <name> is on PREVIEW_READ_RPCS — a
//     function whose LATEST definition is `stable` or `immutable`, which
//     Postgres itself refuses to let write (`check:ui` re-derives that from
//     supabase/migrations on every run, so a later redefinition as volatile
//     fails the check rather than silently re-opening the hole);
//   - POST /functions/v1/<name> where <name> is on PREVIEW_READ_EDGE;
//   - the session upkeep under /auth/v1/ (token refresh, sign-out, reading the
//     user) — except creating somebody ELSE's login (signup / invite / admin),
//     which is a write about another person and is paired with a profile write
//     the guard refuses anyway, so letting it through would leave a login with
//     no profile.
// Everything else — insert, update, upsert, delete, a volatile function, a
// Storage upload, a path nobody has classified — is refused.
//
// A REFUSAL IS AN ERROR RESPONSE, not an exception, so every caller's existing
// error path shows it: a 403 with a PostgREST-shaped body whose message is
// PREVIEW_REFUSAL. Its code is deliberately NOT 42501 — `errMsg()` rewrites
// that into "Your role does not have permission", which would blame the role
// the administrator is previewing for a refusal that is the preview's.
//
// THIS FILE IMPORTS NOTHING, for the `paging.ts` reason: supabase.ts reads
// `import.meta.env` at load, so nothing defined there can be tested as
// behaviour. `check:ui` imports this file directly.
// ===========================================================================

/** The message every refused write carries, word for word. */
export const PREVIEW_REFUSAL = 'View as is a read-only preview — nothing is written';

/** The browser-storage key the preview identity is kept under (it survives a
 *  reload, FRS-212.1). Owned here so the guard can come up READ-ONLY at boot,
 *  before the session has even been read. */
export const VIEWAS_KEY = 'rithi.viewAs';

/**
 * RPCs a preview may call. EVERY ONE is declared `stable` in its latest
 * definition (the migration named beside it) — Postgres refuses an INSERT,
 * UPDATE or DELETE inside a non-volatile function — and each only reads.
 * `check:ui` asserts the volatility against supabase/migrations; the reason is
 * for the reader. A function that is not here is REFUSED during a preview,
 * however much its name sounds like a read.
 */
export const PREVIEW_READ_RPCS: Readonly<Record<string, string>> = {
  audit_mode:                 'stable (0114) — reads whether Audit Mode is on',
  auto_review_state:          'stable (0269) — reads the DCCR auto-review switch',
  device_cache_report:        'stable (0380) — reads each device\'s cache status',
  exportable_tables:          'stable (0306) — lists the tables a role may export',
  ffr_call_context:           'stable (0178) — reads a call\'s context for an FFR',
  frequent_failure:           'stable (0198) — counts earlier failures of a machine',
  frequent_failure_rule:      'stable (0198) — reads the frequent-failure rule',
  handstock_balance_all:      'stable (0384) — reads every engineer\'s hand-stock balance',
  indoor_dc_authorisers:      'stable (0327) — lists who may approve an indoor DC',
  indoor_job_product_code:    'stable (0321) — looks up a product code',
  install_calls_unmapped:     'stable (0319) — lists installation calls with no sale',
  machine_current_party:      'stable (0240) — reads which customer holds a machine',
  machine_warranty_preview:   'stable (0332) — previews a machine\'s warranty dates',
  my_table_view:              'stable (0120) — reads a saved table layout',
  objective_cutoff_locked:    'stable (0138) — reads whether a month is locked',
  objective_evidence:         'stable (0359) — reads the evidence behind an objective',
  objective_notes:            'stable (0357) — reads an objective\'s notes',
  objective_period:           'stable (0139) — reads an objective period',
  part_rename_impact:         'stable (0309) — counts what a part rename would touch',
  product_line_name_uses:     'stable (0366) — counts where a product-line name is used',
  recycle_mrn_lines:          'stable (0365) — lists MRN lines for recycling',
  recycle_sla_settings:       'stable (0365) — reads the recycling SLA settings',
  registrant_desks:           'stable (0114) — lists the Hotline desks',
  spare_insights:             'stable (0254) — reads the Spare Insights aggregates',
  suggest_complaint_text:     'stable (0107) — suggests complaint wording',
  suggest_standard_complaint: 'stable (0104) — suggests a Standard Complaint',
  visible_engineer_names:     'stable (0212) — reads whose records the caller may see',
};

/**
 * Edge Functions a preview may call. `check:ui` asserts each one's source
 * touches no table, function or bucket of this project.
 */
export const PREVIEW_READ_EDGE: Readonly<Record<string, string>> = {
  'suggest-complaint': 're-ranks complaint candidates the screen already holds; reads and writes nothing in the database',
};

/** Auth paths that act on somebody OTHER than the session — refused in a preview. */
const AUTH_WRITES = /^\/auth\/v1\/(signup|invite|admin)(\/|$)/;

// Up at boot when a preview was stored — the guard must not start OPEN and wait
// for the session to be read, because a screen can write before that happens.
// auth.tsx lowers it once the session proves the preview is not honoured (a
// non-administrator, or nobody signed in).
let previewing = (() => {
  try { return !!globalThis.localStorage?.getItem(VIEWAS_KEY); } catch { return false; }
})();

/** Raise or lower the guard. auth.tsx is the only caller. */
export function setPreviewGuard(on: boolean): void { previewing = on; }
export function isPreviewing(): boolean { return previewing; }

/**
 * Would this request be refused during a preview? Pure — it does not read the
 * flag, so it can be tested on its own. `url` is the full request URL.
 */
export function previewRefuses(url: string, method: string | undefined): boolean {
  const m = (method || 'GET').toUpperCase();
  let path: string;
  try { path = new URL(url).pathname; } catch { path = String(url); }
  if (path.startsWith('/auth/v1/')) return AUTH_WRITES.test(path);
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  const rpc = /^\/rest\/v1\/rpc\/([A-Za-z0-9_]+)\/?$/.exec(path);
  if (rpc) return m !== 'POST' || !Object.prototype.hasOwnProperty.call(PREVIEW_READ_RPCS, rpc[1]);
  const fn = /^\/functions\/v1\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  if (fn) return m !== 'POST' || !Object.prototype.hasOwnProperty.call(PREVIEW_READ_EDGE, fn[1]);
  // A table write, a Storage upload, anything unclassified.
  return true;
}

/** The response a refused request gets: PostgREST's error shape, so
 *  `{ error }` arrives with `.message` === PREVIEW_REFUSAL on every client. */
export function previewRefusalResponse(): Response {
  const body = JSON.stringify({
    code: 'RITHI_PREVIEW', message: PREVIEW_REFUSAL, details: null,
    hint: 'Exit the preview to make a change in your own name.',
    // Auth and Storage read these instead of `message`.
    msg: PREVIEW_REFUSAL, error: PREVIEW_REFUSAL, error_description: PREVIEW_REFUSAL,
  });
  return new Response(body, { status: 403, statusText: 'Forbidden', headers: { 'Content-Type': 'application/json' } });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}
function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method;
  if (typeof input === 'object' && !(input instanceof URL) && 'method' in input) return input.method;
  return 'GET';
}

/** Wrap a fetch so a preview refuses every write. Passed to createClient. */
export function guardFetch(inner: typeof fetch): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    if (previewing && previewRefuses(requestUrl(input), requestMethod(input, init)))
      return Promise.resolve(previewRefusalResponse());
    return inner(input, init);
  };
}

// ---- the CallReg bridge ----------------------------------------------------
// The Apps Script bridge is not a Supabase client, so it does not pass through
// guardFetch — and it WRITES over GET (`?action=update`, `setmasters`, …) as
// well as over POST (file uploads to Drive, sheet exports). Same rule, same
// direction: an action is let through a preview only when it is KNOWN to read.
export const PREVIEW_READ_BRIDGE_ACTIONS: readonly string[] = [
  'ping', 'list', 'parties', 'products', 'items', 'prodsearch', 'config', 'configcheck',
  'pending', 'users', 'getview', 'reportget', 'tabmeta', 'master', 'masters',
  'driveref', 'drivefile', 'drivefind',
];

/** Throws PREVIEW_REFUSAL when a bridge call would write during a preview.
 *  `action` is the bridge action; a POST is always a write (an upload). */
export function assertBridgeMayRun(action: string | undefined, method: 'GET' | 'POST' = 'GET'): void {
  if (!previewing) return;
  if (method === 'POST' || !PREVIEW_READ_BRIDGE_ACTIONS.includes(String(action ?? '')))
    throw new Error(PREVIEW_REFUSAL);
}

// Checks for the bits of UI logic that are worth pinning down — the rules a
// screen must follow that reading the component will not tell you.
// No test runner in this repo, so: `npm run check:ui`.
import { groupRowsBy, groupTree, NO_GROUP } from '../src/components/table/group';
import { partCode, partName } from '../src/lib/parts';
import { URS, FRS, TESTS } from '../src/lib/validation';
import { mergeDcLines } from '../src/lib/dc';
import { callFamily } from '../src/lib/calltype';
import { withoutHistory } from '../src/lib/handstock';
import { metaFromFileName } from '../src/lib/docname';
import { alarmNumber, withAlarm } from '../src/lib/alarm';
import { dayAfter, addPeriod } from '../src/lib/dates';
import { configFor } from '../src/lib/cover';
import { localIsoDate, formatDayTime, excelSerial, hasClockTime } from '../src/lib/dates';
import { periodKey } from '../src/modules/FieldFailureInsights';
import { periodYears, periodEnd, warrantyPmVisits, contractPmVisits, itemTaxAmount, totalAfterTax,
         splitProductDetails, itemDetailsLong, itemDetails, addCallPrefix, coverStatus,
         ABOUT_TO_EXPIRE_DAYS, SERIES, nextInSeries, deriveHeader, deriveItem,
         upliftRate, itemTaxAmount, totalAfterTax, periodToMonths } from '../src/lib/coverspec';
import { callDateFromRequest, consumptionProblem, CONSUMPTION_YES, CONSUMPTION_NONE } from '../src/lib/fieldcall';
import { machineRowProblem, productPlaceholder, PICK_A_PRODUCT } from '../src/lib/callrequest';
import { FFR_COLUMNS, FFR_LIVE_COLUMNS, ffrFromReview, ffrCallNotSolved, ffrEffectWithdrawn, ffrDocFrom, FFR_NO_SHAPE, FFR_CAPA_STATUS , FFR_WRITABLE, ffrWritable } from '../src/lib/ffr';
import { buildFfrDocx, ffrDocName } from '../src/lib/ffrdoc';
import { localIsoDate } from '../src/lib/dates';
import { periodKey } from '../src/modules/FieldFailureInsights';
import { trail } from '../src/lib/spareflow';
import { generatePassword, PASSWORD_ALPHABET } from '../src/lib/password';
import { yearStartISO } from '../src/lib/dccr';
import { manualMatchesCall, docTags } from '../src/lib/docmatch';
import { visitDateProblem } from '../src/lib/visitdate';
import { isReviewable, REVIEW_DONE, isUrl, linkLabel } from '../src/lib/callreview';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { timeAgo, fmtLongDate } from '../src/lib/format';
import { bulkReview2Block, effectiveAutoSave, curatedProduct, masterValueApplies } from '../src/lib/dccr';
import { stateColour, stateBucket } from '../src/lib/callstate';
import { driveFolderForCall, DRIVE_FOLDER_NAMES } from '../src/lib/drivefolders';
import { KPI_FIELD_INST_COLUMNS, toKpiExportRow } from '../src/lib/kpi';
import { buildXlsx } from '../src/lib/xlsx';
import { TESTS } from '../src/lib/validation';
import { shortForms, type ProductLine } from '../src/lib/productLines';
import { DEFAULT_PERMS, MODULES, PERM_TREE, ROLES, moduleAction, parentAction, roleKeyFrom, roleProblem, rolesWith, roleLabelFor, setRoleLabels, RESERVED_ROLE_KEYS } from '../src/lib/rbac';
import { URS, FRS, TESTS, MODULES_WITHOUT_REQUIREMENT } from '../src/lib/validation';
import { modulesWithNoRequirement, badDeclarations, traceabilityMatrix } from '../src/lib/requirements';
import { UPLOADS, shapeUpload } from '../src/lib/uploads';
import { manualReportLink } from '../src/lib/reports';
import { drivePreviewUrl } from '../src/lib/drive';
import { callAging, agingTone } from '../src/lib/aging';

let fail = 0;
// CODE ONLY, COMMENTS STRIPPED.
//
// Written after the same mistake twice in one session: an assertion that a
// module no longer calls `fmtLongDate` matched the COMMENT above the fix
// explaining what had been wrong, and an assertion that a picker contains no
// `<select>` matched the comment explaining why it must not. Both would have
// been "fixed" by rewording a comment, which is how a guard quietly stops
// guarding. Search `code(src)` when the question is about what the module DOES;
// search the raw source when the question is about what it SAYS.
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`  ✓ ${label}`); return; }
  console.log(`  ✗ ${label}\n      got  ${g}\n      want ${w}`);
  fail += 1;
};

console.log('\n-- grouping a register by engineer --');
const rows = [
  { id: 1, allocatedTo: 'PAWAN' },
  { id: 2, allocatedTo: '' },
  { id: 3, allocatedTo: 'anuj' },
  { id: 4, allocatedTo: 'PAWAN' },
  { id: 5, allocatedTo: '  ' },
];
const g = groupRowsBy(rows, 'allocatedTo');
eq('one group per engineer, blanks folded into one', g.map(([n]) => n), ['anuj', 'PAWAN', NO_GROUP]);
eq('...with nobody-allotted LAST', g[g.length - 1][0], NO_GROUP);
eq('rows keep the order they arrived in', g.find(([n]) => n === 'PAWAN')?.[1].map((r) => r.id), [1, 4]);
eq('every row lands in exactly one group', g.reduce((n, [, rs]) => n + rs.length, 0), rows.length);
eq('a key no row carries makes one group of everything', groupRowsBy(rows, 'nope').map(([n, rs]) => [n, rs.length]), [[NO_GROUP, 5]]);

console.log('\n-- region, then engineer, then status --');
const calls = [
  { id: 1, region: 'North', allocatedTo: 'PAWAN', callState: 'Solved' },
  { id: 2, region: 'North', allocatedTo: 'PAWAN', callState: 'Unattended' },
  { id: 3, region: 'North', allocatedTo: 'ANUJ', callState: 'Solved' },
  { id: 4, region: 'South', allocatedTo: 'MEGHA', callState: 'Solved' },
  { id: 5, region: '', allocatedTo: 'MEGHA', callState: 'Solved' },
];
const t = groupTree(calls, ['region', 'allocatedTo', 'callState']);
eq('the top level is the first key', t.map((n) => n.name), ['North', 'South', NO_GROUP]);
eq('a node counts every row beneath it, at any depth', t[0].rows.length, 3);
eq('the second level nests inside the first', t[0].children?.map((n) => n.name), ['ANUJ', 'PAWAN']);
eq('the third level nests inside the second',
  t[0].children?.find((n) => n.name === 'PAWAN')?.children?.map((n) => n.name), ['Solved', 'Unattended']);
eq('the last level has no children of its own',
  t[0].children?.[0].children?.every((n) => n.children === null), true);
eq('a path identifies a node, so two regions may both have "Solved"',
  [t[0].children?.find((n) => n.name === 'PAWAN')?.children?.[0].path,
    t[1].children?.[0].children?.[0].path],
  ['North › PAWAN › Solved', 'South › MEGHA › Solved']);
eq('every row still lands in exactly one leaf',
  t.flatMap((a) => a.children!.flatMap((b) => b.children!.map((c) => c.rows.length))).reduce((a, b) => a + b, 0),
  calls.length);
eq('one key behaves exactly like the flat grouping',
  groupTree(calls, ['region']).map((n) => [n.name, n.rows.length]),
  groupRowsBy(calls, 'region').map(([n, rs]) => [n, rs.length]));
eq('no keys means no grouping', groupTree(calls, []), []);

console.log('\n-- the declaration lists one line per part --');
const dcLines = [
  { sr: 1, orderNo: 'OR-1', itemCode: 'KB030100', description: 'HEPA FILTER', qty: 1 },
  { sr: 2, orderNo: 'OR-1', itemCode: 'KY650300', description: 'AIR INTAKE', qty: 1 },
  { sr: 3, orderNo: 'OR-2', itemCode: 'KB030100', description: 'HEPA FILTER', qty: 1 },
  { sr: 4, orderNo: 'OR-2', itemCode: 'MP-010', description: 'OXYGEN SENSOR', qty: 2 },
];
const merged = mergeDcLines(dcLines);
eq('the same part twice is one line', merged.map((l) => l.itemCode), ['KB030100', 'KY650300', 'MP-010']);
eq('...with the quantities added up', merged.find((l) => l.itemCode === 'KB030100')?.qty, 2);
eq('a quantity above one still adds', merged.find((l) => l.itemCode === 'MP-010')?.qty, 2);
eq('the total is unchanged', merged.reduce((t, l) => t + l.qty, 0), dcLines.reduce((t, l) => t + l.qty, 0));
eq('and the serial numbers close up', merged.map((l) => l.sr), [1, 2, 3]);
eq('the challan itself is untouched', dcLines.length, 4);

// ---------------------------------------------------------------------------
// The validation package must stay COVERED: every user requirement traced to a
// system requirement and to at least one test. A requirement added without a
// test is the failure this catches — it reads as complete in the matrix and is
// verified by nothing.
// ---------------------------------------------------------------------------
{
  const frsFor = (u: string) => FRS.filter((f) => f.urs.includes(u));
  const testFor = (u: string) =>
    TESTS.filter((t) => t.reqs.includes(u) || frsFor(u).some((f) => t.reqs.includes(f.id)));

  const noFrs = URS.filter((u) => frsFor(u.id).length === 0).map((u) => u.id);
  const noTest = URS.filter((u) => testFor(u.id).length === 0).map((u) => u.id);
  eq('every user requirement has a system requirement', noFrs.join(',') || 'none', 'none');
  eq('every user requirement has a test', noTest.join(',') || 'none', 'none');

  const ids = [...URS.map((u) => u.id), ...FRS.map((f) => f.id), ...TESTS.map((t) => t.id)];
  eq('no duplicate requirement or test id', String(ids.length - new Set(ids).size), '0');

  // The Reporting Managers' asks, and the correction that followed, are in it.
  ['URS-031', 'URS-032', 'URS-033', 'URS-034', 'URS-035', 'URS-036',
   'URS-037', 'URS-038', 'URS-039', 'URS-040', 'URS-041', 'URS-042',
   // The Indoor Service requirements (Rev 2.0). Named rather than left to the
   // sweep above because these four are the ones a customer's property and a
   // worker's safety rest on, and a requirement that quietly loses its test
   // still reads as covered in the matrix.
   'URS-049', 'URS-050', 'URS-051', 'URS-052'].forEach((id) => {
    eq(`${id} traces to a test`, testFor(id).length > 0 ? 'yes' : 'no', 'yes');
  });
  // Every risk and every failure mode has to point at a requirement that exists,
  // or the matrix reads as covered while referring to nothing.
  {
    const { RISKS, FMEA } = await import('../src/lib/validation');
    const known = new Set([...FRS.map((f) => f.id), ...TESTS.map((t) => t.id), ...URS.map((u) => u.id)]);
    const dangling = [...RISKS, ...FMEA]
      .flatMap((r) => (r.refs ?? []).map((x) => ({ id: r.id, ref: x })))
      .filter((x) => !known.has(x.ref));
    eq('every risk / FMEA reference points at something real',
      dangling.map((d) => `${d.id}->${d.ref}`).join(',') || 'none', 'none');
  }
}

// ---------------------------------------------------------------------------
// One matcher for the call type. `call_table_for()` in the database accepts any
// of these spellings, and a screen that compares with === against one of them
// finds nothing while the calls sit in the list under exactly that type — which
// is what emptied Pending Calls' Installation and PM chips.
// ---------------------------------------------------------------------------
console.log('\n-- a call type is recognised however it is spelled --');
[['INSTALLATION CALL', 'install'], ['INSTALLATION', 'install'], ['Installation Call', 'install'],
 ['P M VISIT', 'pm'], ['PM VISIT', 'pm'], ['PM', 'pm'], ['pm visit', 'pm'],
 ['FIELD', 'field'], ['', 'field'], ['ANYTHING ELSE', 'field']].forEach(([given, want]) => {
  eq(`"${given}" is ${want}`, callFamily(given), want);
});

// ---------------------------------------------------------------------------
// Hand stock with the imported sheet era left out. The identity that has to
// hold is `on_hand - hist_net = on_hand_live`, and the components have to be
// restated with the total — a level of 4 beside a stock out of 27 reads as a
// broken sum, whatever the total says.
// ---------------------------------------------------------------------------
console.log('\n-- hand stock, with the imported record left out --');
{
  // Opening 10, 20 issued and 25 consumed historically; 7 issued and 3 consumed
  // by this system. Everything: 10+20-25+7-3 = 9. This system alone: 7-3 = 4.
  const line = {
    engineer_key: 'ravi kumar', engineer: 'Ravi Kumar', engineer_email: '',
    part_code: 'P-1', part: 'P-1|Pump',
    opening: 10, stock_out: 27, consumed: 28,
    transferred_in: 2, transferred_out: 1, returned: 0,
    on_hand: 9, last_in: null, last_out: null, last_movement: null, movements: 5,
    hist_stock_out: 20, hist_consumed: 25, hist_net: 5, on_hand_live: 4,
  };
  const live = withoutHistory(line);
  eq('the total is the one without the history', live.on_hand, 4);
  eq('the imported stock outs come off too', live.stock_out, 7);
  eq('...and the imported consumption', live.consumed, 3);
  eq('the opening pool is gone', live.opening, 0);
  eq('and nothing is left attributed to history', live.hist_net, 0);
  eq('transfers are NOT the sheet era, so they stay', live.transferred_in, 2);
  eq('nor are returns', live.transferred_out, 1);
  eq('the identity holds: on_hand - hist_net = on_hand_live',
    line.on_hand - line.hist_net, line.on_hand_live);
  eq('the row it was given is untouched', line.on_hand, 9);
}

// ---------------------------------------------------------------------------
// What a document's filename already says. These are SUGGESTIONS that fill an
// empty field, so a miss costs a keystroke and a wrong hit costs a correction —
// which is why the patterns can be generous. What must NOT happen is a
// confident wrong answer on a name that carries no revision at all.
// ---------------------------------------------------------------------------
console.log('\n-- document number and revision, read off the file name --');
{
  const cases: [string, string, string][] = [
    ['SM-SER-XT Rev.05.pdf', 'SM-SER-XT', 'Rev.05'],          // the project's own convention
    ['SM-SER-XT REV05.PDF', 'SM-SER-XT', 'REV05'],            // shouted, no separator
    ['QMS-014_Rev-3.docx', 'QMS-014', 'Rev-3'],               // underscore: \b does not fire here
    ['ORION-G Service Manual v1.2.pdf', 'ORION-G Service Manual', 'v1.2'],
    ['WI-22 Issue 3.pdf', 'WI-22', 'Issue 3'],
    ['SOP-07 R05.pdf', 'SOP-07', 'R05'],
  ];
  cases.forEach(([name, docNo, revision]) => {
    const got = metaFromFileName(name);
    eq(`"${name}" -> ${docNo} / ${revision}`, `${got.docNo} / ${got.revision}`, `${docNo} / ${revision}`);
  });

  // A code with a hyphenated R-number is ONE code, not a code and a revision.
  eq('"SM-R05-XT Manual.pdf" suggests nothing',
    JSON.stringify(metaFromFileName('SM-R05-XT Manual.pdf')), '{"docNo":"","revision":""}');
  // No revision in the name means no document number either: without that split
  // point, anything taken from the name is a guess about a guess.
  eq('a name with no revision suggests nothing',
    JSON.stringify(metaFromFileName('Extend-XT Maintenance Manual.pdf')), '{"docNo":"","revision":""}');
  eq('and neither does an empty name',
    JSON.stringify(metaFromFileName('')), '{"docNo":"","revision":""}');
}

// ---------------------------------------------------------------------------
// THE CALL FORM'S LISTS TRAVEL WITH THE CALL FORM.
//
// Three screens render the same call schema, and the lists it needs — the
// Standard Complaint master and its suggestions, the party datalist, the
// engineers — are injected at render, not held in the schema. Miss the
// injection on one screen and it renders a bare text box and an EMPTY
// "Allocated To" dropdown, with no error: that is exactly what the Register
// panel on a pending request did. So: any form fed the call schema must feed it
// through `useCallFieldMasters().inject` first.
console.log('\n-- every screen rendering the call form injects its lists --');
{
  const dir = `${process.cwd()}/src/modules/`;
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
  const uses: string[] = [];
  const strays: string[] = [];
  // SCANNED PER STATEMENT, NOT PER LINE. The line-based version failed the
  // moment the `fields={...}` prop was wrapped across three lines to take a
  // second argument: the schema was named on one line and `inject` sat on
  // another, so a working screen reported as an uninjected one. A check that
  // goes red when the formatting changes gets weakened or ignored, and this one
  // guards a failure with NO error behind it — a bare text box and an empty
  // "Allocated To".
  const statements = (src: string): { text: string; from: number; to: number }[] => {
    const out: { text: string; from: number; to: number }[] = [];
    // Everything from `fields={` to the newline-and-dedent that ends the prop:
    // close enough to a statement, and it cannot swallow the next prop because
    // it stops at the first line that starts a new `foo={` at the same depth.
    const re = /fields=\{[\s\S]*?\n\s{0,14}[a-zA-Z]+[={]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      // The LINE SPAN too, so the per-line sweep below can skip what has
      // already been judged as a whole. Without it the sweep re-reports the
      // inside of a multi-line prop it just passed.
      const from = src.slice(0, m.index).split('\n').length;
      out.push({ text: m[0], from, to: from + m[0].split('\n').length - 1 });
    }
    return out;
  };
  files.forEach((f) => {
    const src = readFileSync(dir + f, 'utf8');
    // 1. Every RENDER of the schema — a `fields={...}` prop naming it.
    const stmts = statements(src);
    stmts.forEach((st, n) => {
      if (!/FIELD_CALL_FIELDS|buildCreateFields|viewFields/.test(st.text)) return;
      uses.push(`${f}#${n + 1}`);
      eq(`${f}: the call form at render ${n + 1} injects the masters`, /inject/i.test(st.text), true);
    });
    // 2. ...AND NO OTHER USE SLIPS BY. A helper that DERIVES a field list from
    //    the schema is legitimate (`viewFields()` drops three fields for the
    //    view); it is not a render, and it is still fed through `inject` at the
    //    render above. Anything else naming the schema outside a `fields` prop
    //    is named here so it has to be looked at.
    const stray = src.split('\n')
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => /FIELD_CALL_FIELDS|buildCreateFields/.test(line))
      // Already judged as part of a `fields={...}` prop above.
      .filter(({ i }) => !stmts.some((st) => i + 1 >= st.from && i + 1 <= st.to))
      .filter(({ line }) => !/^\s*(import|export)\b/.test(line)
        && !/return FIELD_CALL_FIELDS/.test(line)
        && !/inject/i.test(line)
        // a derivation, not a render
        && !/^\s*const \w+ = \(\) => FIELD_CALL_FIELDS/.test(line))
      .map(({ i }) => `${f}:${i + 1}`);
    strays.push(...stray);
  });
  // ONE ASSERTION ACROSS EVERY FILE, not one per file: sixty green ticks for
  // sixty files that never mention the call form is noise, and noise is how a
  // red one goes unread.
  eq('nothing renders the call schema outside an injected fields prop', strays, []);
  eq('the call schema is still rendered somewhere', uses.length > 0, true);
}

// ---------------------------------------------------------------------------
// THE ALARM PATTERN THE SCREEN USES AND THE ONE 0107 USES MUST AGREE.
//
// The database finds the canonical value for a typed alarm number; the screen
// rewrites that token in place. If the two disagree about what counts as an
// alarm number, the chip appears and clicking it changes nothing — which reads
// as a broken button, not as a mismatch.
console.log('\n-- the alarm number, however it was typed --');
{
  const forms = ['al 12', 'AL-012', 'alarm12', 'Alarm  12', 'al.12', 'AL_12', 'ALARM 012'];
  forms.forEach((f) => eq(`"${f}" reads as 12`, alarmNumber(`${f} air supply low`), 12));
  // Not an alarm: a part code, a version, a bare number.
  ['AL2000 board', 'v12 firmware', 'pressure 12 bar', 'CALIBRATION 12']
    .forEach((f) => eq(`"${f}" is not an alarm number`, alarmNumber(f), null));
  // The rewrite keeps the sentence and touches only the token — and only the
  // first, because two alarms are two faults.
  eq('the sentence survives the rewrite',
    withAlarm('al 12 low pressure on air supply', 'Alarm 012'),
    'Alarm 012 low pressure on air supply');
  eq('only the first alarm is rewritten',
    withAlarm('al 12 then al 45 came up', 'Alarm 012'),
    'Alarm 012 then al 45 came up');
  eq('a text with no alarm is left exactly as it was',
    withAlarm('leak from air inlet', 'Alarm 012'), 'leak from air inlet');
}

// ---------------------------------------------------------------------------
// A CALL REGISTERED FROM A REQUEST IS ABOUT THE DAY IT HAPPENED, NOT TODAY.
//
// The engineer raised the request on the 31st; the hotline registers it on the
// 5th. Complaint Date defaulted to today, so every such call was dated to the
// day somebody found time for it.
console.log('\n-- the day a call registered from a request is about --');
{
  const d = (r: Parameters<typeof callDateFromRequest>[0]) => {
    const g = callDateFromRequest(r);
    return `${g.iso}/${g.source}`;
  };
  eq('not attended -> the day the request was logged',
    d({ loggedAt: '2026-08-31T07:11:00+00:00' }), '2026-08-31/logged');
  eq('attended -> the day the engineer was there, not the logged day',
    d({ attended: 'Yes', attendedDate: '2026-09-01', loggedAt: '2026-08-31T07:11:00+00:00' }),
    '2026-09-01/attended');
  eq('attended flag with no date falls back to the logged day',
    d({ attended: 'Yes', attendedDate: '', loggedAt: '2026-08-31T07:11:00+00:00' }),
    '2026-08-31/logged');
  eq('an attended date with the flag unset is NOT used',
    d({ attended: '', attendedDate: '2026-09-01', loggedAt: '2026-08-31T07:11:00+00:00' }),
    '2026-08-31/logged');
  eq('nothing readable -> the caller falls back to today',
    d({}), '/none');
  // The timezone trap: read as written, a request logged at 01:00 IST dates to
  // the day before, because it is stored as the previous day in UTC.
  const late = new Date('2026-08-31T19:30:00Z');   // 01:00 IST on 1 September
  eq('an instant is dated by the local calendar, not by the front of the string',
    localIsoDate(late.toISOString()),
    `${late.getFullYear()}-${String(late.getMonth() + 1).padStart(2, '0')}-${String(late.getDate()).padStart(2, '0')}`);
  // A plain date carries no timezone and must not be shifted by one.
  eq('a plain yyyy-mm-dd is left exactly as it is', localIsoDate('2026-08-31'), '2026-08-31');
  eq('a day-first export date still reads day-first', localIsoDate('31/08/2026'), '2026-08-31');
}

// ---------------------------------------------------------------------------
// THE CALL'S ACTIONS ARE ONE LIST, WRITTEN ONCE.
//
// They appear on the row and again at the top of the open call. Written out
// twice, they drifted: a different order in each place, a third order in the
// form's footer, and the two newest (cancel / restore) in the row only. A
// button that moves depending on where you opened the call is one you have to
// read every time. So each label may appear ONCE in the module — the list —
// and both places map over it.
console.log('\n-- the call actions are declared once --');
{
  const src = readFileSync(`${process.cwd()}/src/modules/FieldCalls.tsx`, 'utf8');
  ['Visit Entry', 'Request Spares', 'Re-open call', 'Close again', 'Cancel call', 'Restore call']
    .forEach((label) => {
      const n = src.split(`label: '${label}'`).length - 1;
      eq(`"${label}" is declared once`, n, 1);
      // ...and nowhere else as a button's own text.
      const loose = src.split(`>${label}<`).length - 1;
      eq(`"${label}" is not also hand-written as a button`, loose, 0);
    });
  eq('both places render the shared list', src.split('callActions(').length - 1 >= 3, true);
}

// ---------------------------------------------------------------------------
// A REQUEST WAS RAISED ON THE DAY IT WAS RAISED, NOT THE DAY IT WAS UPLOADED.
//
// `spare_requests.created_at` defaults to now(), and the importer fills it only
// when the export carried a "Raised on" column — so for every request loaded
// without one it is the moment of the upload. The audit trail said "Raised …
// 03-Sep-2026" about a request whose OR Req Date was 16-Mar-2026.
console.log('\n-- the raised date is the request\'s, not the import\'s --');
{
  const raised = (r: Record<string, unknown>) => trail(r).find((e) => e.stage === 'Raised')?.at;
  eq('the OR Req Date wins over the upload timestamp',
    raised({ req_type: 'Call Based', engineer: 'X', or_req_date: '2026-03-16', created_at: '2026-09-03T12:00:00Z' }),
    '2026-03-16');
  eq('...and is used even when requested_at is also present',
    raised({ req_type: 'Call Based', engineer: 'X', or_req_date: '2026-03-16', requested_at: '2026-09-03T12:00:00Z' }),
    '2026-03-16');
  eq('a request with no OR Req Date still falls back to when it was created',
    raised({ req_type: 'Call Based', engineer: 'X', created_at: '2026-09-03T12:00:00Z' }),
    '2026-09-03T12:00:00Z');
}

// ---------------------------------------------------------------------------
// A COUNT OVER PARTLY-LOADED DATA IS A LOWER BOUND, AND MUST SAY SO.
//
// Every register loads in pages. A chip reading "MAYANK GUPTA 90" over the
// first 800 rows is not 90 — it is at least 90 — and a number that looks exact
// and is not is worse than no number, because somebody acts on it. The title
// badge and the footer row count already carry the "+"; the facet chips and the
// group headings did not.
//
// So every FacetChips must decide: pass `more` (true while rows are still
// coming, false when the screen genuinely holds everything). Leaving it off is
// not allowed — that is how it was missed the first time.
console.log('\n-- every count over a partial load carries the + --');
{
  const dir = `${process.cwd()}/src/modules/`;
  readdirSync(dir).filter((f) => f.endsWith('.tsx')).forEach((f) => {
    const src = readFileSync(dir + f, 'utf8');
    src.split('<FacetChips').slice(1).forEach((rest, i) => {
      const tag = rest.slice(0, rest.indexOf('/>'));
      eq(`${f} FacetChips #${i + 1} says whether more is coming`, /\bmore=/.test(tag), true);
    });
  });
  // The shared components render it.
  const ui = readFileSync(`${process.cwd()}/src/components/ui/ui.tsx`, 'utf8');
  eq('FacetChips renders the + on each chip', ui.includes("{o.count}{more ? '+' : ''}"), true);
  eq('FacetChips renders the + on the All total', ui.includes("{total}{more ? '+' : ''}"), true);
  const dt = readFileSync(`${process.cwd()}/src/components/table/DataTable.tsx`, 'utf8');
  eq('a group heading renders the +', dt.includes("{n.rows.length}{moreAvailable ? '+' : ''}"), true);
}

// ---------------------------------------------------------------------------
// THE TWO MARKS ARE NOT INTERCHANGEABLE.
//
// A PRINTED DOCUMENT CARRIES THE COMPANY'S MARK — the Delivery Challan and the
// Declaration leave the building and go to a customer, who is dealing with Air
// Liquide, not with a piece of software. The RITHI mark belongs to the app's
// own chrome: the sign-in page and the menu bar.
//
// Both come from `lib/brand.ts`, so replacing a logo is replacing one file. A
// screen that imports the asset directly is a second copy that a swap would
// miss, which is the whole thing this is meant to prevent.
console.log('\n-- the company mark on documents, the app mark on the app --');
{
  const read = (f: string) => readFileSync(`${process.cwd()}/${f}`, 'utf8');
  const files = ['src/modules/DeliveryChallan.tsx', 'src/modules/Declaration.tsx',
                 'src/modules/Login.tsx', 'src/components/layout/Layout.tsx'];
  files.forEach((f) => {
    const src = read(f);
    eq(`${f.split('/').pop()} takes its logo from lib/brand`, /from '.*lib\/brand'/.test(src), true);
    eq(`${f.split('/').pop()} does not import the asset directly`, /assets\/(alms-logo|rithi-crm-logo)/.test(src), false);
  });
  ['src/modules/DeliveryChallan.tsx', 'src/modules/Declaration.tsx'].forEach((f) => {
    eq(`${f.split('/').pop()} uses the COMPANY mark`, read(f).includes('COMPANY_LOGO'), true);
    eq(`${f.split('/').pop()} does NOT use the app mark`, read(f).includes('RITHI_LOGO'), false);
  });
  ['src/modules/Login.tsx', 'src/components/layout/Layout.tsx'].forEach((f) => {
    eq(`${f.split('/').pop()} uses the app mark`, read(f).includes('RITHI_LOGO'), true);
  });
  // Only brand.ts reaches for the files themselves.
  // Not pinned to a FILENAME: swapping the file is the point of this module.
  // What must hold is that brand.ts is the one place that reaches into assets.
  eq('lib/brand imports both marks from src/assets',
    (read('src/lib/brand.ts').match(/from '\.\.\/assets\//g) ?? []).length, 2);
}

// ---------------------------------------------------------------------------
// THE GENERATED PASSWORD IS READ OUT LOUD, AND IS NOT GUESSABLE.
//
// An administrator resets a password and then passes it on — spoken, typed,
// forwarded. Two things have to hold and neither is visible by reading the
// screen: no character that is ambiguous when read (O/0, l/1, S/5, Z/2, B/8),
// and real randomness, so the next one cannot be guessed from the last.
console.log('\n-- the generated password --');
{
  const many = Array.from({ length: 400 }, () => generatePassword());
  eq('always three groups of four', many.every((p) => /^[^-]{4}-[^-]{4}-[^-]{4}$/.test(p)), true);
  eq('clears the database\'s 10-character floor', many.every((p) => p.length >= 10), true);
  eq('uses only the unambiguous alphabet',
    many.every((p) => p.replace(/-/g, '').split('').every((c) => PASSWORD_ALPHABET.includes(c))), true);
  ['0', 'O', 'o', '1', 'l', 'I', '5', 'S', 's', '2', 'Z', 'z', '8', 'B'].forEach((c) => {
    eq(`never contains "${c}"`, many.some((p) => p.includes(c)), false);
  });
  // 400 draws from a 45-character alphabet: a repeat means it is not random.
  eq('400 passwords, 400 different ones', new Set(many).size, 400);
  // Every position varies — a fixed character anywhere would be a bug in the
  // sampling loop that the tests above would not catch.
  [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13].forEach((i) => {
    eq(`position ${i} is not fixed`, new Set(many.map((p) => p[i])).size > 1, true);
  });
}

// ---------------------------------------------------------------------------
// THE DCCR HOLDS THE YEAR, AND STARTS FRESH IN JANUARY.
//
// It opened on the last 30 days, being a DAILY review — which made a register
// holding 3,850 calls show 425 and read as an upload that had failed. The unit
// people work in is the year.
//
// The trap here is `toISOString()`, which is UTC: on 1 January before 05:30 IST
// it still says last year, and the register would open on a year that has ended
// on the one day it matters most.
console.log('\n-- the review register opens on the whole year --');
{
  eq('mid-year', yearStartISO(new Date(2026, 8, 5)), '2026-01-01');
  eq('1 January', yearStartISO(new Date(2027, 0, 1)), '2027-01-01');
  eq('31 December is still that year', yearStartISO(new Date(2026, 11, 31)), '2026-01-01');
  // 1 January 00:30 IST is 31 December 19:00 UTC — the case toISOString gets wrong.
  eq('the small hours of 1 January read as the NEW year',
    yearStartISO(new Date(2027, 0, 1, 0, 30)), '2027-01-01');
}

// ---------------------------------------------------------------------------
// AN ACCESSORY'S MANUAL REACHES THE CALL THAT NAMES THE ACCESSORY.
//
// Call 26I05F0051: product EXTEND-XT, fault in a CPX Care. The CPX Care manual
// was tagged "CPX Care Failure" for exactly this and did not appear, because
// the matcher compared only the document's PRODUCT with the call's — "cpx care"
// against "extend-xt" — and never read `documents.tags` at all.
console.log('\n-- which manuals belong on a call --');
{
  const extendXT = { product: 'EXTEND-XT', complaint: 'NO OUTPUT PRESSURE-ASU,CPX', reported: 'CPX care failure - No output pressure' };
  const cpxManual = { product: 'CPX CARE', tags: 'CPX Care Failure, CPX' };
  const xtManual  = { product: 'EXTEND-XT', tags: '' };
  const t60Manual = { product: 'MONNAL T60', tags: 'Alarm 012' };
  const general   = { product: '', tags: '' };

  eq('the accessory manual reaches the call that names it', manualMatchesCall(cpxManual, extendXT), true);
  eq("the machine's own manual still does", manualMatchesCall(xtManual, extendXT), true);
  eq('a general manual is on every call', manualMatchesCall(general, extendXT), true);
  eq('another product\'s manual is NOT dragged in', manualMatchesCall(t60Manual, extendXT), false);

  // The tag has to be in the CALL's words, not the other way round — otherwise
  // a one-word tag swallows the shelf.
  eq('a tag the call does not mention stays away',
    manualMatchesCall({ product: 'HORUS', tags: 'humidifier' }, extendXT), false);
  // Punctuation and case are flattened on both sides.
  eq('"CPX-Care" finds "CPX care failure"',
    manualMatchesCall({ product: 'CPX CARE', tags: 'CPX-Care' }, extendXT), true);
  // A call with no accessory named gets no accessory manual.
  eq('a plain EXTEND-XT call gets no CPX manual',
    manualMatchesCall(cpxManual, { product: 'EXTEND-XT', complaint: 'AIR SUPPLY FAILURE', reported: 'no air' }), false);
  // Tags below the floor cannot match everything.
  eq('a 2-character tag is ignored', docTags('xt, ab, CPX Care'), ['cpx care']);
}

// ---------------------------------------------------------------------------
// "EMAIL ADDRESS" ON A CALL IS WHO REGISTERED IT.
//
// It sat under Customer Contact, filled from the request's E-Mail ID on one
// screen and left blank on the other — so it answered a different question
// depending on where the call was raised. It is the registering user's email
// now, defaulted from the login in `callFields.tsx`.
//
// `initial` beats `defaultValue` in SchemaForm, so ANY prefill that sets
// `emailAddress` silently switches the default off. That is exactly how the
// Register panel kept putting the requesting engineer's address in.
console.log('\n-- the call records who registered it, and the database says so --');
{
  const dir = `${process.cwd()}/src/modules/`;
  const calls = readFileSync(`${dir}FieldCalls.tsx`, 'utf8');
  // The engineer's email is NOT a field on the call form — it is not the
  // customer's, not needed, and was being mistaken for both.
  eq('the call form has no emailAddress field',
    /\{ name: 'emailAddress'/.test(calls), false);
  // What IS on it is the database's stamp — TWO of them since 0114, and both
  // read-only. `created_by` is the Hotline DESK the call is filed to, which is
  // hers whoever typed it in; `actual_created_by` is the person who did. Only
  // the second answers "who registered this?", so a screen carrying one without
  // the other is worse than carrying neither: it looks like an answer.
  eq('the call form shows the Hotline desk, read-only',
    /\{ name: 'registeredBy'[^}]*readOnly: true/.test(calls), true);
  eq('the call form shows who ACTUALLY registered it, read-only',
    /\{ name: 'actuallyRegisteredBy'[^}]*readOnly: true/.test(calls), true);
  eq('neither is editable: no registrant field is writable',
    /\{ name: '(registeredBy|actuallyRegisteredBy)'(?![^}]*readOnly: true)[^}]*\}/.test(calls), false);
  eq('the register has a Created By (desk) column',
    /key: 'createdBy', header: 'Created By \(Hotline Desk\)'/.test(calls), true);
  eq('the register has an Actually Registered By column',
    /key: 'actualCreatedBy', header: 'Actually Registered By'/.test(calls), true);
  // The two fields are injected from ONE place, so the Register panel on a
  // pending request and the pre-mapping editor get them too — that is the bug
  // callFields.tsx exists to stop repeating.
  {
    const cf = readFileSync(`${dir}callFields.tsx`, 'utf8');
    eq('callFields fills the Hotline desk for every registration screen',
      /f\.name === 'registeredBy'/.test(cf), true);
    eq('callFields fills the signed-in person for every registration screen',
      /f\.name === 'actuallyRegisteredBy'/.test(cf), true);
  }
  // The mapping the whole control rests on: the row's second stamp has to reach
  // the client, or the column above is permanently blank.
  {
    const sb = readFileSync(`${process.cwd()}/src/lib/supabase.ts`, 'utf8');
    eq('dbToCall carries actual_created_by',
      /out\.actualCreatedBy = row\.actual_created_by/.test(sb), true);
    // callToDb writes only what is in CALL_COLS. Neither registrant column is
    // there, and neither may be: the database sets both, and a column the app
    // can write is not evidence of anything.
    eq('the app never SENDS either registrant column',
      /createdBy: 'created_by'|actualCreatedBy: 'actual_created_by'/.test(sb), false);
  }
  // Nothing may prefill it: a value in `initial` beats anything the form
  // computes, and this one has to come from the row the database stamped.
  readdirSync(dir).filter((f) => f.endsWith('.tsx')).forEach((f) => {
    eq(`${f} does not prefill emailAddress`,
      /^\s*emailAddress:/m.test(readFileSync(dir + f, 'utf8')), false);
  });
}

// ---------------------------------------------------------------------------
// WHEN A VISIT CAN HAVE HAPPENED.
//
// Two rules, both the user's (2026-09-06): not in the future, and not before
// the complaint. Pinned on the RULE rather than the screen, so it is testable
// without a DOM and cannot drift from the database trigger that enforces the
// same thing (0115).
console.log('\n-- a visit date that could not have happened --');
{
  const C = '2026-09-01';        // complaint
  const T = '2026-09-06';        // today
  const ok = (v: string) => visitDateProblem(v, C, T) === '';
  eq('today is fine',                       ok('2026-09-06'), true);
  eq('the complaint day itself is fine',    ok('2026-09-01'), true);
  eq('a day in between is fine',            ok('2026-09-03'), true);
  eq('tomorrow is refused',                 ok('2026-09-07'), false);
  eq('next year is refused',                ok('2027-01-02'), false);
  eq('the day before the complaint is refused', ok('2026-08-31'), false);
  eq('a blank date is refused',             ok(''), false);
  // A call with no complaint date is held to the future rule ONLY — refusing
  // the visit would invent a requirement the call never carried.
  eq('no complaint date: an old visit is fine',
    visitDateProblem('2020-01-01', '', T) === '', true);
  eq('no complaint date: a future visit is still refused',
    visitDateProblem('2026-09-07', '', T) === '', false);
  // The message has to name the date, or the person cannot tell WHICH rule
  // they hit or what to type instead.
  eq('the future message names the day', /07-Sep-2026/.test(visitDateProblem('2026-09-07', C, T)), true);
  eq('the complaint message names the complaint day',
    /01-Sep-2026/.test(visitDateProblem('2026-08-31', C, T)), true);

  // ...and on the screen: the picker is bounded AND the value is re-checked on
  // submit, because min/max stop the PICKER, not a pasted value.
  const rep = readFileSync(`${process.cwd()}/src/modules/CallReporting.tsx`, 'utf8');
  eq('the visit date picker cannot reach the future', /max=\{todayISO\(\)\}/.test(rep), true);
  eq('the visit date picker cannot reach before the complaint',
    /min=\{complaintISO \|\| undefined\}/.test(rep), true);
  eq('and the rule is checked again on submit',
    /visitDateProblem\(visitDate, complaintISO, todayISO\(\)\)/.test(rep), true);
  // THE LOWER BOUND IS THE COMPLAINT DATE AND NOTHING ELSE. It briefly fell
  // back to the REGISTRATION date, which a PM batch sets to the first of the
  // due month — so an October PM refused a visit entered on 28 September, and
  // said "before the complaint" about a date the call does not carry. The
  // database (0115) only ever tested complaint_date, so the form was also
  // stricter than the rule it claims to enforce.
  eq('the lower bound never falls back to the registration date',
    /complaintISO[\s\S]{0,400}?regDate/.test(rep), false);
}

// ---------------------------------------------------------------------------
// THE DAILY CALL REVIEW OPENS GROUPED BY REVIEW STATUS.
//
// The register is worked stage by stage, so it should say which pile each call
// is in before anybody filters for it (the user's ask, 2026-09-06).
console.log('\n-- the DCCR is grouped by review status --');
{
  const dccr = readFileSync(`${process.cwd()}/src/modules/DailyCallReview.tsx`, 'utf8');
  eq('the register offers grouping at all',
    /groupable=\{\[/.test(dccr), true);
  eq('Review Status is the first grouping offered',
    /groupable=\{\[\s*\{ key: 'review_status', label: 'Review Status' \}/.test(dccr), true);
  eq('and it is how the register opens',
    /defaultGroup=\{\['review_status'\]\}/.test(dccr), true);
  // The group headings count LOADED rows, so they must carry the "+" — the
  // exact per-stage totals are the KPI cards, which come from a full walk.
  eq('the group headings still say when more is coming',
    /moreAvailable=\{more\}/.test(dccr), true);

  // NOTHING STORED is not the same as STORED EMPTY: a reader who deliberately
  // ungroups must stay ungrouped, or the default fights them on every visit.
  const dt = readFileSync(`${process.cwd()}/src/components/table/DataTable.tsx`, 'utf8');
  eq('a default grouping applies only when nothing is stored',
    /if \(raw === null\) return defaultGroup \?\? \[\];/.test(dt), true);
  eq('an empty stored grouping is honoured, not overridden',
    /if \(!raw\) return defaultGroup/.test(dt), false);
}

// ---------------------------------------------------------------------------
// THE REVIEW DESK — three adjustable panes, and the two facts Review 2 needs.
console.log('\n-- the DCCR review desk --');
{
  const dccr = readFileSync(`${process.cwd()}/src/modules/DailyCallReview.tsx`, 'utf8');
  eq('there is a Review Desk tab', /key: 'desk'/.test(dccr), true);
  // The two worklists somebody sits down to clear are TABS, not a filter to
  // set each morning — and they are the DESK narrowed, not a second copy of it.
  eq('Review 2 Pending and Review 3 Pending are tabs',
    /key: 'r2', label: 'Review 2 Pending'/.test(dccr) && /key: 'r3', label: 'Review 3 Pending'/.test(dccr), true);
  eq('they render the same desk, scoped',
    /tab === 'desk' \|\| tab === 'todo' \|\| tab === 'r2' \|\| tab === 'r3'/.test(dccr), true);
  // TO BE REVIEWED is the same desk again, and the one worklist neither stage
  // tab can express: two stages AND a call state. It overrides the Call State
  // box while it is open — a tab that says Solved and shows unsolved calls
  // because a filter was left set is worse than no tab.
  eq('To be Reviewed is solved calls awaiting either review',
    /key: 'todo', label: 'To be Reviewed'/.test(dccr)
    && /statuses: todo \? \['Review 2 Pending', 'Review 3 Pending'\] : undefined/.test(dccr)
    && /callState: todo \? 'Solved' :/.test(dccr), true);
  // Its badge cannot come from the tab's own filter — see the counter rule
  // below — so the count carries the figure, from the same full walk.
  // A MODAL ON ONE BRANCH OF A TWO-RETURN COMPONENT is a bug waiting for
  // somebody to open the other branch — which is exactly what happened: the
  // viewer went in on the `drawer` path, the Review Desk and its worklist tabs
  // are the `panes` path, and pressing "Service Report" there did nothing at
  // all. One variable, rendered on both.
  eq('the report viewer is mounted on BOTH of the review component’s layouts',
    (dccr.match(/\{reportViewer\}/g) ?? []).length === 2
    && /const reportViewer = docFor \? \(/.test(dccr), true);
  eq('...and it is defined before the first return that uses it',
    dccr.indexOf('const reportViewer = docFor') < dccr.indexOf("if (layout === 'panes')"), true);

  eq('...and its count is not scoped by the tab that shows it',
    /solvedPending/.test(dccr)
    && /countCallReviews\(\{ \.\.\.countFilterRef\.current, status: undefined, statuses: undefined \}\)/.test(dccr), true);
  eq('and scope it by review status',
    /deskStage = tab === 'r2' \? 'Review 2 Pending' : tab === 'r3' \? 'Review 3 Pending' : ''/.test(dccr), true);
  // Their tab counts come from the full walk, so they are exact and take no "+".
  eq('the worklist tab counts are the exact ones',
    /t\.key === 'r2' && statusCount\('Review 2 Pending'\)/.test(dccr), true);
  eq('the calls are grouped by review stage, then call status',
    /review_status[\s\S]{0,200}open_state[\s\S]{0,120}deskGroups|const deskGroups[\s\S]{0,400}review_status[\s\S]{0,200}open_state/.test(dccr), true);
  eq('the panes are draggable', /onPointerDown=\{drag\(0\)\}/.test(dccr) && /onPointerDown=\{drag\(1\)\}/.test(dccr), true);
  eq('and their widths are remembered', /rithi\.dccr\.desk\.widths/.test(dccr), true);
  // ONE BODY IN TWO FRAMES. If the desk ever grew its own copy of the review
  // fields, the two would drift and one of them would stop matching the rules.
  eq('the desk reuses the review body rather than copying it',
    /layout="panes"/.test(dccr) && (dccr.match(/Review 2 · Risk assessment/g) ?? []).length === 1, true);
  // The splitter has to be a GRID CHILD between the two panes, not appended
  // after them — otherwise it lands in the wrong column and the details pane
  // gets the 6px track.
  eq('the divider sits BETWEEN the review and the details',
    /\{separator\}\s*\n\s*<div className="dccr-pane dccr-pane-details">/.test(dccr), true);

  // Review 2's two new facts, each under the question it answers.
  // UNDER A YEAR IS THE ANSWER to the question above it, so it is a warning
  // and not a note. 366, not 365 — the user's line. If the comparison ever
  // becomes <= 365 or < 365 the boundary day changes silently.
  eq('a failure inside the first year is shown as a warning',
    /ctx\.age_days < 366 \? \([\s\S]{0,200}dccr-warn/.test(dccr), true);
  eq('...with a warning symbol', /dccr-warn[\s\S]{0,200}⚠️/.test(dccr), true);
  eq('...and over a year old stays a plain note',
    /over a year old/.test(dccr), true);
  // The four facts the review is about, lifted out of the reference ones.
  eq('customer, machine, call status and complaint are lifted',
    (dccr.match(/className="[^"]*\bis-key\b[^"]*"/g) ?? []).length, 4);
  // HIGHLIGHT MEANS CONTRAST, NOT A TINT (the user's standing rule). A wash of
  // --primary-soft was the first attempt and it barely read on screen.
  {
    const css = readFileSync(`${process.cwd()}/src/modules/dccr.css`, 'utf8');
    eq('the lifted facts INVERT against the page rather than tinting it',
      /\.dccr-callcard div\.is-key \{[^}]*background: var\(--text\);[^}]*color: var\(--surface\);/.test(css), true);
    eq('...and the first-year warning is solid, not a wash',
      /\.dccr-warn \{[\s\S]*?background: var\(--danger\);/.test(css), true);
    // Call Status gets the same projection by a different route: the SOLID
    // state colour, not an inversion, because that colour is carrying a fact.
    eq('...and Call Status is a solid state colour, not a tint',
      /\.dccr-callcard div\.is-state \.badge-danger\s*\{ background: var\(--danger\); \}/.test(css)
      && /\.dccr-callcard div\.is-state \.badge-success \{ background: var\(--success\); \}/.test(css), true);
  }
  eq('the call status carries its own state colour, not a review-stage one',
    /statusBadge\(String\(row\.open_state[\s\S]{0,80}CALL_STATE_TONES\)/.test(dccr), true);

  eq('the product age sits under Warranty Failure',
    /Warranty Failure \(1 yr\)[\s\S]{0,1400}Age (of the product )?at failure/.test(dccr), true);
  eq('the frequent-failure history sits under Frequent Failure',
    /label="Frequent Failure"[\s\S]{0,900}earlier failure/.test(dccr), true);
  // A FAILED READ MUST NOT READ AS "no earlier failures" — that is the one
  // wrong answer that would talk somebody out of raising an FFR.
  eq('a history that could not be read says so, rather than showing zero',
    /history === null[\s\S]{0,120}could not be read/.test(dccr), true);
  eq('Review 2 can be answered NO in one action', /All NO/.test(dccr), true);
  // ...but it FILLS the answers, it does not save them: nothing is recorded
  // that nobody looked at.
  eq('“All NO” fills the boxes and does not save',
    // setDraft is on the button's onClick, which precedes its label in the JSX.
    /setDraft\(\(d\) => \(\{ \.\.\.d, risk_to_patient: 'NO', warranty_failure: 'NO', frequent_failure: 'NO' \}\)\)[\s\S]{0,200}All NO/.test(dccr)
    && !/All NO[\s\S]{0,300}void save\(\)/.test(dccr), true);

  eq('the spares are a table with number, part, description and quantity',
    /<th style=\{\{ width: 34 \}\}>#<\/th>[\s\S]{0,300}Part No[\s\S]{0,200}Description[\s\S]{0,200}Qty/.test(dccr), true);
  // The call's status is already on the card above, in its own colour. Saying
  // it twice on one screen buys nothing; the hours do.
  eq('the report section shows the Hour Meter Reading, not the call status again',
    /<ReadOnly label="Hour Meter Reading"/.test(dccr) && !/<ReadOnly label="Call Status"/.test(dccr), true);
  eq('...read from the LATEST visit by entry',
    /visits\[0\]\.data[\s\S]{0,80}Hour Meter Reading/.test(dccr), true);
  // It is no longer a LINK OUT: the report opens in the app (the user,
  // 2026-09-08 — "instead of going to drive"). What must stay true is that the
  // review can reach the document it is judging without leaving the screen, and
  // that the button appears only where a visit actually filed one.
  eq('the service report opens in the app, from the visit that filed it',
    /const link = manualReportLink\(v\);/.test(dccr)
    && /\{link && \([\s\S]{0,200}setDocFor\(v\)/.test(dccr), true);
}

// ---------------------------------------------------------------------------
// ONE PLACE FOR "IS THIS CURRENT, AND IS THERE MORE?"
//
// The user's rule (2026-09-06): Load more, Refresh and the sync age go
// TOGETHER, beside the count in the page heading — not scattered between the
// heading and each table's toolbar. They answer the same question the count
// does; the toolbar is for acting on the rows, not describing them. Every
// register carried its own copy in its own order, which is how they drifted.
console.log('\n-- Load more, Refresh and the sync age live together --');
{
  const dir = `${process.cwd()}/src/modules/`;
  // MasterListTable is the one exception, and it is a principled one: it is
  // EMBEDDED inside All Masters, the Daily Call Review's two master tabs and
  // the master list page, so it has no heading of its own to put them in.
  const EMBEDDED = new Set(['MasterListTable.tsx']);
  const offenders: string[] = [];
  readdirSync(dir).filter((f) => f.endsWith('.tsx') && !EMBEDDED.has(f)).forEach((f) => {
    const src = readFileSync(dir + f, 'utf8');
    for (const m of src.matchAll(/<Toolbar>([\s\S]*?)<\/Toolbar>/g)) {
      if (/↻ Refresh/.test(m[1])) offenders.push(`${f}: Refresh`);
      if (/timeAgo\(/.test(m[1])) offenders.push(`${f}: sync age`);
    }
  });
  eq(`no Refresh or sync age is left in a table toolbar${offenders.length ? ` (${offenders.join(', ')})` : ''}`,
    offenders.length, 0);

  // The heading is what offers them, and it offers them next to Load more.
  const ui = readFileSync(`${process.cwd()}/src/components/ui/ui.tsx`, 'utf8');
  eq('the page heading takes a Refresh', /onRefresh\?: \(\) => void \| Promise<void>;/.test(ui), true);
  eq('...and a sync time', /syncedAt\?: string \| number \| null;/.test(ui), true);
  eq('...and renders them beside Load more',
    /Load more[\s\S]{0,400}onRefresh &&[\s\S]{0,400}syncedAt &&/.test(ui), true);

  // A NUMBER IS EPOCH MILLISECONDS. `new Date(String(1757…))` is an Invalid
  // Date, so a register holding Date.now() showed "⟳ synced never" — which
  // Pending Calls had been doing, silently, because "never" looks like an
  // answer rather than a fault.
  eq('timeAgo reads epoch milliseconds', timeAgo(Date.now() - 30_000), '30s ago');
  eq('timeAgo still reads an ISO string', timeAgo(new Date(Date.now() - 30_000).toISOString()), '30s ago');
  eq('timeAgo still says never for rubbish', timeAgo('not a date'), 'never');
}

// ---------------------------------------------------------------------------
// A BULK DECISION IS CONFIRMED BEFORE IT HAPPENS.
//
// Approving, rejecting or dropping forty spares is not something to discover
// you have done (the user's ask, 2026-09-06). The button opens a confirmation
// naming the decision and the count; the reject and the drop take the reason
// the database requires, so the form asks for it rather than the error message.
console.log('\n-- bulk approve / reject / drop are confirmed --');
{
  const dir = `${process.cwd()}/src/modules/`;
  for (const f of ['SpareRequests.tsx', 'SpareRmApproval.tsx']) {
    const src = readFileSync(dir + f, 'utf8');
    eq(`${f}: the bulk button opens a confirmation, it does not act`,
      /onClick=\{\(\) => \{ setWhy\(''\); setConfirm\(\{ decision: 'approve'/.test(src), true);
    eq(`${f}: reject is offered in bulk`, /decision: 'reject'/.test(src), true);
    eq(`${f}: the decision runs only from the confirmation`,
      /onClick=\{\(\) => void runDecision\(\)\}/.test(src), true);
    // The database refuses a reasonless reject or drop. Asking in the form is
    // the difference between a question and an error message.
    eq(`${f}: a reject cannot be confirmed without a reason`,
      /disabled=\{[a-zA-Z]+ \|\| \(confirm\.decision !== 'approve' && !why\.trim\(\)\)\}/.test(src), true);
    // Both numbers, always: "12 approved" over a selection of 14 leaves
    // somebody wondering about the other two.
    eq(`${f}: the result reports what was skipped too`, /skipped \(\$\{res\.reason/.test(src), true);
  }
  // Drop is offered where the permission is, and only there.
  const sr = readFileSync(dir + 'SpareRequests.tsx', 'utf8');
  eq("SpareRequests.tsx: drop is offered to whoever holds spare.drop",
    /mayDrop = can\('spare\.drop'\)/.test(sr) && /decision: 'drop'/.test(sr), true);
}

// ---------------------------------------------------------------------------
// GROUPS OPEN CLOSED (the user's rule, 2026-09-06).
//
// Held as the set of groups deliberately OPENED, not the set closed. That is
// the part worth pinning: with `collapsed`, a group that appears later — Load
// more brings rows for an engineer who was not on the first page — would
// arrive OPEN, and every new group would need bookkeeping to keep it shut.
console.log('\n-- grouping opens collapsed --');
{
  const dt = readFileSync(`${process.cwd()}/src/components/table/DataTable.tsx`, 'utf8');
  eq('the register tracks what is EXPANDED, not what is collapsed',
    /const \[expanded, setExpanded\] = useState<Set<string>>/.test(dt) && !/const \[collapsed,/.test(dt), true);
  eq('...so an untouched group is shut', /const shut = !expanded\.has\(n\.path\);/.test(dt), true);

  const dccr = readFileSync(`${process.cwd()}/src/modules/DailyCallReview.tsx`, 'utf8');
  eq('the Review Desk list follows the same rule',
    /const \[expanded, setExpanded\] = useState<Set<string>>/.test(dccr) && !/const \[collapsed,/.test(dccr), true);
  eq('...at both levels',
    /const shut = !expanded\.has\(key\);/.test(dccr) && /const shut2 = !expanded\.has\(k2\);/.test(dccr), true);
}

// ---------------------------------------------------------------------------
// REVIEW 2 IN BULK — AND THE ONE IT MUST REFUSE.
//
// The rule (2026-09-06): "if the Age at failure is less than 366, then it has
// to be done 1 by 1". Review 2 is where "Warranty Failure (1 yr)" is answered,
// so a machine under a year old is the case the question exists for. Pinned on
// the RULE, which the screen and the database (0119) both read.
console.log('\n-- Review 2 in bulk, except inside the first year --');
{
  const blocked = (age: unknown, done = false) => bulkReview2Block({ age_days: age, review2_done: done }) !== '';
  eq('366 days may be answered in bulk',        blocked(366), false);
  eq('367 days may be answered in bulk',        blocked(367), false);
  eq('2,435 days may be answered in bulk',      blocked(2435), false);
  eq('365 days may NOT — it is inside the first year', blocked(365), true);
  eq('1 day may NOT',                            blocked(1), true);
  eq('0 days may NOT',                           blocked(0), true);
  // "Not known to be inside the first year" is not "known to be outside it".
  eq('an unknown age may NOT — nobody can state it is over a year',
    blocked(null) && blocked(undefined) && blocked(''), true);
  // Bulk fills what is pending; it does not rewrite a judgement.
  eq('a Review 2 already answered may NOT be overwritten', blocked(2435, true), true);
  eq('the reason names the first year', /first year/.test(bulkReview2Block({ age_days: 100 })), true);

  const dccr = readFileSync(`${process.cwd()}/src/modules/DailyCallReview.tsx`, 'utf8');
  eq('only eligible rows can be ticked',
    /const ok = new Set\(eligible\.map\(\(r\) => r\.ucn\)\);/.test(dccr), true);
  eq('the bulk button opens a confirmation, it does not act',
    /onClick=\{\(\) => setConfirmBulk\(ids\)\}/.test(dccr), true);
  // SAID, NOT HIDDEN: a count of what the button will not take answers "why
  // is it not all of them?" where the question is asked.
  // WHERE THE WORK IS. It shipped on the Review Register only and the first
  // question was "where is it?" — asked from the Review 2 Pending tab, which
  // is the list being cleared.
  eq('the worklist tabs offer the bulk button too',
    /Mark \{eligible\.length\} as NO/.test(dccr), true);
  eq('Expand all / Collapse all are offered on the grouped list',
    /⌄ Expand all/.test(dccr) && /⌃ Collapse all/.test(dccr), true);
  {
    const dt = readFileSync(`${process.cwd()}/src/components/table/DataTable.tsx`, 'utf8');
    eq('...and on every grouped register',
      /⌄ Expand all/.test(dt) && /⌃ Collapse all/.test(dt), true);
    // Expand all has to reach every depth, or a nested grouping still needs a
    // click per branch — which is the work the button exists to remove.
    eq('Expand all opens every level, not just the top',
      /if \(n\.children\?\.length\) walk\(n\.children\);/.test(dt), true);
  }
  // AUTO SAVE writes the answers and never the "completed by" stamps.
  eq('auto save does not complete a review',
    /if \(!auto\) \{[\s\S]{0,220}review2_by = reviewer;[\s\S]{0,120}review3_by = reviewer;/.test(dccr), true);
  eq('...and it is off unless somebody turns it on',
    effectiveAutoSave(null, null), false);
  // TWO DECISIONS, AND THE LATER ONE WINS. Neither "the admin always wins" nor
  // "a personal choice always wins" is right: the first makes the reviewer's
  // switch a lie, the second makes "apply for everyone" a lie.
  eq('a reviewer with no admin default keeps their own choice',
    effectiveAutoSave({ on: true, at: 100 }, null), true);
  eq('an admin default reaches a reviewer who never chose',
    effectiveAutoSave(null, { on: true, at: 100 }), true);
  eq('“apply for everyone” overrides a choice made BEFORE it',
    effectiveAutoSave({ on: true, at: 100 }, { on: false, at: 200 }), false);
  eq('...and a reviewer who changes it AFTERWARDS keeps their change',
    effectiveAutoSave({ on: true, at: 300 }, { on: false, at: 200 }), true);
  // The pre-existing '1'/'0' shape must read as "chosen at the dawn of time",
  // or upgrading would look like somebody actively choosing and would beat the
  // administrator.
  eq('an old stored preference does not outrank an admin default',
    effectiveAutoSave({ on: true, at: 0 }, { on: false, at: 1 }), false);
  // A MODULE SETTING, not a per-record one: one switch, in the register's own
  // controls, inherited by every review opened. A tick box repeated on each
  // review invited the reading that it applied to that one call.
  eq('...and the switch is on the module, not on each review',
    /autoSave=\{autoSave\}/.test(dccr) && /autoSave\?: boolean;/.test(dccr), true);
  eq('...and it says when it last saved',
    /answers saved \{timeAgo\(savedAt\)\}/.test(dccr), true);

  eq('the excluded ones are counted on screen',
    /must be reviewed one by one/.test(dccr), true);

  // The Service Report is the document the review is judging; it was a faint
  // link. Contrast, like every other highlight here. The look moved to
  // styles.css when the call's own screens started showing the same document --
  // one class, so it cannot end up a chip on one screen and faint text on
  // another; dccr.css keeps only where it sits on THIS one.
  const css = readFileSync(`${process.cwd()}/src/styles.css`, 'utf8');
  eq('the Service Report link is a contrast chip, not faint text',
    /\.svc-report-link \{[^}]*background: var\(--text\);[^}]*color: var\(--surface\);/.test(css), true);
}

// ---------------------------------------------------------------------------
// THE CALL-STATUS COLOUR CODE, AND THE UCN THAT CARRIES IT.
//
// The user's specification (2026-09-06): Unattended RED, Unsolved BLUE,
// Solved - Report Pending PINK, Solved GREEN — and "during colour theme switch,
// don't change the colours, instead make a box around it". A colour people have
// learned to read is a CODE; a code that means something else in dark mode is
// not one. So these are literal hex, not theme tokens, and the theme changes
// the BOX instead.
console.log('\n-- the call-status colour code --');
{
  const c = (v: string) => stateColour(v)?.bg ?? '';
  eq('Unattended is red',                       c('Unattended'), '#d32f2f');
  eq('Unsolved is blue',                        c('Unsolved'), '#1565c0');
  eq('Solved - Report Pending is pink',         c('Solved - Report Pending'), '#c2185b');
  eq('Solved is green',                         c('Solved'), '#2e7d32');
  eq('Solved - Report Completed is green too',  c('Solved - Report Completed'), '#2e7d32');
  // THE ONE CONFUSION THAT MATTERS: "Solved - Report Pending" begins with
  // "Solved". Read it as green and the register says a call is closed when a
  // report is still owed.
  eq('“Solved - Report Pending” is NOT green',
    stateColour('Solved - Report Pending')?.bg !== stateColour('Solved')?.bg, true);
  eq('an unknown status gets no colour rather than a wrong one', stateColour('Whatever'), null);
  eq('an empty status gets no colour', stateColour(''), null);

  const css = readFileSync(`${process.cwd()}/src/styles.css`, 'utf8');
  // The theme must change the BOX, never the hue. If a colour ever appears in
  // a dark-theme block, the code has started meaning two things.
  const darkBlocks = css.match(/:root\[data-theme="dark"\] \.state-chip[\s\S]{0,240}?\}/g) ?? [];
  eq('the dark theme adds a border, it does not restate the colour',
    darkBlocks.length > 0 && darkBlocks.every((b) => /border-color/.test(b) && !/background:/.test(b)), true);

  // EVERYWHERE a UCN is shown — that was the instruction.
  const dir = `${process.cwd()}/src/modules/`;
  const WITH_UCN = ['FieldCalls.tsx', 'PendingCalls.tsx', 'DailyCallReview.tsx', 'Reports.tsx',
                    'SpareRequests.tsx', 'SpareRmApproval.tsx', 'CustomerFeedback.tsx',
                    'RequestCallRegistration.tsx'];
  const bare = WITH_UCN.filter((f) => {
    const src = readFileSync(dir + f, 'utf8');
    return /key: 'ucn'/.test(src) && !/<Ucn /.test(src);
  });
  eq(`every UCN column is coloured by its call's status${bare.length ? ` (bare: ${bare.join(', ')})` : ''}`,
    bare.length, 0);
}

// ---------------------------------------------------------------------------
// A REGISTER'S LAYOUT CAN BE SET FOR A ROLE (0120).
//
// The same rule as the Auto Save default, and for the same reason: the
// reader's own arrangement and the administrator's are ranked BY WHEN, not by
// who. "The admin always wins" makes every reader's column picker a lie; "your
// own always wins" makes "apply to a role" a lie.
console.log('\n-- a layout can be set for a role --');
{
  const dt = readFileSync(`${process.cwd()}/src/components/table/DataTable.tsx`, 'utf8');
  eq('a layout can be applied to one role', /const applyToRole = async \(role: string\)/.test(dt), true);
  eq('...and cleared again', /const clearForRole = async \(role: string\)/.test(dt), true);
  // EVERYONE IS THE SAME MECHANISM with an empty role, or the two drift.
  eq('“everyone” goes through the same path as a role',
    /if \(supabaseConfigured\(\)\) \{ await applyToRole\(''\); return; \}/.test(dt), true);
  // The layout must carry the GROUPING too — a "view" that restored the
  // columns and left the reader grouped by something else is not the view
  // anybody arranged.
  eq('the layout carries the grouping, not just the columns',
    /const currentView = \(\): RoleTableView[\s\S]{0,160}group: groupKeys/.test(dt), true);
  // The reader's own arrangement carries a TIME, or it cannot be ranked.
  eq("the reader's own arrangement is stamped", /hidden: \[\.\.\.nextHidden\], at: Date\.now\(\)/.test(dt), true);
  eq('...and the later decision wins',
    /if \(mine && Number\(mine\.at \?\? 0\) >= role\.setAt\) return;/.test(dt), true);
  // A layout saved before 0120 has no `at`, so it reads as time 0 and yields —
  // an upgrade must not look like somebody actively arranging.
  eq('an older stored layout does not outrank an administrator',
    /at\?: number;/.test(dt), true);
  eq('the panel says whose layout is in force', /In force here: the layout set for/.test(dt), true);
}

// ---------------------------------------------------------------------------
// THE DIRECTORY SUGGESTS ITSELF — AND DOES NOT INSIST.
//
// Reporting Manager, Regional Manager and Region offer what is already in the
// directory (the user's ask, 2026-09-06) "but not mandatory to choose from
// that". A <select> would refuse anything new: the first person entered could
// then have no manager, and a new region could never be started. So a
// datalist, the same shape the call form uses for Party Name.
console.log('\n-- the user directory suggests, it does not insist --');
{
  const um = readFileSync(`${process.cwd()}/src/modules/UserMasterView.tsx`, 'utf8');
  eq('the three boxes offer what is already in the directory',
    /'reporting_manager'[^)]*names\)/.test(um)
    && /'regional_manager'[^)]*names\)/.test(um)
    && /'region'[^)]*regions\)/.test(um), true);
  // The distinction that matters: suggested, not required.
  eq('...as a datalist, so a new one can still be typed',
    /<datalist id=\{listId\}>/.test(um) && /<input className="input"[^>]*list=\{listId\}/.test(um), true);
  eq('...and they are not selects', /<select[^>]*value=\{String\(row\[k\]/.test(um), false);
  // Every name, because any of them can be somebody's manager — the tree is
  // built by matching these strings.
  eq('the names offered are every name in the directory',
    /const dirNames = useMemo\([\s\S]{0,320}dir\.forEach/.test(um), true);
  eq('...case-folded, so one spelling is offered once',
    /seen\.has\(n\.toLowerCase\(\)\)/.test(um), true);
  eq('the box says how many are on offer', /already in the directory — or type a new one/.test(um), true);
}

// Signing out clears the bell IN THE DATABASE, so the next session starts empty
// on every device. The ordering is the whole risk: `clear_my_notifications()`
// works from auth.uid(), so calling it after signOut() clears nothing at all
// and would fail silently — the sign-out would still look like it worked.
console.log('\n-- signing out clears the notifications --');
{
  const auth = readFileSync(`${process.cwd()}/src/lib/auth.tsx`, 'utf8');
  eq('logout clears them', /clearMyNotifications\(\)/.test(auth), true);
  eq('...BEFORE signing out, or auth.uid() is already gone',
    /clearMyNotifications\(\)[\s\S]{0,120}await sbSignOut\(\)/.test(auth), true);
  // A bell that will not empty is no reason to leave somebody signed in.
  eq('...and a failure to clear still signs you out',
    /try \{ await clearMyNotifications\(\); \} catch/.test(auth), true);
  // The two paths that are NOT a person signing out: abandoning a recovery
  // link (never really signed in) and ejecting a login that was deactivated.
  eq('cancelling a password recovery does not clear anything',
    /cancelRecovery = \(\) => \{ setRecovering\(false\); void sbSignOut\(\); \}/.test(auth), true);

  const sb = readFileSync(`${process.cwd()}/src/lib/supabase.ts`, 'utf8');
  // Through the function, never a delete from the client: the rule about whose
  // rows go lives in one place, in the database.
  eq('it goes through clear_my_notifications(), not a delete',
    /rpc\('clear_my_notifications'\)/.test(sb)
    && /from\('notifications'\)\.delete\(\)/.test(sb) === false, true);
}

// Review 2 answers itself the morning after (0124). A scheduled job does it at
// 9:15; the register does it again on load, so the rule holds on a project
// where pg_cron was never enabled. Both call the SAME function, which gates
// itself on the time — the screen must not carry its own copy of the rule.
console.log('\n-- Review 2 answers itself the morning after --');
{
  const dccr = readFileSync(`${process.cwd()}/src/modules/DailyCallReview.tsx`, 'utf8');
  eq('the register runs the sweep on load', /void autoAnswerReview2\(\)/.test(dccr), true);
  // Once per mount. It sweeps the whole register; re-running it on every
  // keystroke of the search box would be absurd.
  eq('...once per mount, not per filter change',
    /autoRan\.current = true;[\s\S]{0,80}void autoAnswerReview2/.test(dccr)
    && /\}, \[live\]\);/.test(dccr), true);
  // Rows changing state between one visit and the next, unannounced, is how an
  // automatic answer stops being trusted.
  eq('...and says what it did, including what it LEFT',
    /answered No automatically for \$\{res\.marked\}/.test(dccr)
    && /res\.heldFirstYear/.test(dccr) && /res\.heldUnknownAge/.test(dccr), true);
  // The screen holds no copy of the 9:15 rule or the 366-day rule: both live
  // in the function, so the scheduled run and this one cannot disagree.
  eq('the screen does not re-implement the timing rule',
    /9\s*:\s*15/.test(dccr.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')), false);
}

// Re-allocating a call is its own right (0126), not a corner of "Edit calls".
// The report that produced it was in two halves — the control was not visible,
// AND there was nothing in Roles & Permissions to look for — so both halves
// are pinned: the permission exists on the Roles screen, both registers gate
// on it, and a person who lacks it is TOLD rather than shown nothing.
console.log('\n-- re-allocating a call is its own permission --');
{
  const rbacSrc = readFileSync(`${process.cwd()}/src/lib/rbac.ts`, 'utf8');
  eq('it is offered on the Roles & Permissions screen',
    /key: 'calls\.allot', label: 'Re-allocate a call to another engineer'/.test(rbacSrc), true);
  // Nobody may lose the ability on the day it lands: every default that has
  // calls.edit must also have calls.allot. (The migration does the same by
  // merging into app_roles, which is what the live project actually reads.)
  const defaults = rbacSrc.slice(rbacSrc.indexOf('const FUNCTIONAL_DEFAULTS'));
  const lost = [...defaults.matchAll(/^ {2}([a-z_]+): \[([^\]]*)\]/gm)]
    .filter(([, , perms]) => perms.includes("'calls.edit'") && !perms.includes("'calls.allot'"))
    .map(([, role]) => role);
  eq('every role default that can edit a call can also re-allocate one', lost.join(',') || 'none', 'none');

  for (const mod of ['FieldCalls', 'PendingCalls']) {
    const src = readFileSync(`${process.cwd()}/src/modules/${mod}.tsx`, 'utf8');
    eq(`${mod} gates re-allocation on calls.allot, not calls.edit`,
      /mayAllot = can\('calls\.allot'\)/.test(src), true);
    // "Bulk only, but say why it is hidden" (user's choice, 2026-09-06): a
    // control that is simply absent teaches nobody anything.
    eq(`${mod} says why the tick-boxes are not there`,
      /allotBlocked = !can\('calls\.allot'\) && allotTeam\.canPick/.test(src)
      && /Re-allocating a call needs the/.test(src), true);
  }
  // The drawer is the OTHER way to move a call, so it obeys the same right —
  // otherwise the permission would be decoration on one route out of two.
  const fc = readFileSync(`${process.cwd()}/src/modules/FieldCalls.tsx`, 'utf8');
  eq('the drawer locks the engineer box without it too',
    /allocatedTo: +\{ perm: 'calls\.allot'/.test(fc) && /lockByRight/.test(fc), true);
}

// "Edit calls" was one right over the whole call — right for the Hotline desk,
// wrong for everybody else (user, 2026-09-06). It is four now, with calls.edit
// as the parent, so a role that had the whole thing still has it.
console.log('\n-- editing a call is four rights, not one --');
{
  const rbacSrc = readFileSync(`${process.cwd()}/src/lib/rbac.ts`, 'utf8');
  const SECTIONS = ['complaint', 'customer', 'vigilance', 'contact'];
  eq('all four sections are on the Roles & Permissions screen',
    SECTIONS.every((k) => rbacSrc.includes(`key: 'calls.edit.${k}'`)), true);
  // The parent rule is what makes this safe to ship: without it, every role
  // holding calls.edit would lose the lot the moment the sections existed.
  eq('...and calls.edit is their PARENT, so nobody loses anything',
    /\/\^calls\\\.edit\\\..\+\$\/\.test\(key\)\) return 'calls\.edit'/.test(rbacSrc), true);
  eq('they are listed on the Field Call Register page in the tree',
    SECTIONS.every((k) => rbacSrc.includes(`'calls.edit.${k}'`)) && rbacSrc.includes("'calls.allot', 'calls.report'"), true);

  const fc = readFileSync(`${process.cwd()}/src/modules/FieldCalls.tsx`, 'utf8');
  // Every field the database guards must be locked on the form, or the screen
  // offers a box that saving will refuse — which is worse than not offering it.
  const guarded: Record<string, string> = {
    standardComplaint: 'complaint', complaintReported: 'complaint', breakdownDate: 'complaint',
    partyName: 'customer', city: 'customer', state: 'customer',
    productName: 'customer', serial: 'customer', itemStatus: 'customer',
    publicHealthThreat: 'vigilance', death: 'vigilance', seriousIncident: 'vigilance',
    customerName: 'contact', customerNumber: 'contact', customerDesignation: 'contact',
  };
  const missing = Object.entries(guarded)
    .filter(([field, sec]) => !new RegExp(`${field}: +\\{ perm: 'calls\\.edit\\.${sec}'`).test(fc))
    .map(([field]) => field);
  eq('every field the database guards is locked on the form too', missing.join(',') || 'none', 'none');
  // Read-only with a reason, not removed: a field that vanishes is how "where
  // has it gone?" starts.
  eq('...read-only with the reason, not hidden',
    /readOnly: true, help: `Needs the "\$\{r\.what\}" permission`/.test(fc), true);
}

// THE THREE VIGILANCE QUESTIONS ARE PROMINENT AND NEVER GO MISSING (user's
// instruction, 2026-09-06), and the two ordinary questions that used to sit
// with them have moved in with the customer.
console.log('\n-- the vigilance questions stand on their own --');
{
  const fc = readFileSync(`${process.cwd()}/src/modules/FieldCalls.tsx`, 'utf8');
  const sectionOf = (field: string): string => {
    const m = new RegExp(`\\{ name: '${field}',[^\\n]*?section: (VIGILANCE_SECTION|'[^']+')`).exec(fc);
    return m ? m[1].replace(/'/g, '') : '(not found)';
  };
  for (const f of ['publicHealthThreat', 'death', 'seriousIncident']) {
    eq(`${f} is in the vigilance section`, sectionOf(f), 'VIGILANCE_SECTION');
  }
  // "move the other 2 questions in reporting to customer section"
  for (const f of ['personCalling', 'modeOfReporting']) {
    eq(`${f} has moved to Customer Contact`, sectionOf(f), 'Customer Contact');
  }
  // Nothing else may join them: the section is prominent BECAUSE it is only
  // these three. One ordinary field in it and the emphasis starts to read as
  // decoration.
  const inVital = [...fc.matchAll(/\{ name: '([a-zA-Z]+)',[^\n]*?section: VIGILANCE_SECTION/g)].map((m) => m[1]);
  eq('...and nothing else is in it', inVital.sort().join(','), 'death,publicHealthThreat,seriousIncident');
  // The old "Reporting" section is gone entirely — an empty heading would be
  // worse than none.
  eq('the old Reporting section is gone', /section: 'Reporting'/.test(fc), false);

  // Every form that renders the call schema must ask for the emphasis, or the
  // section exists on that screen and simply does not stand out.
  eq('the register asks for the emphasis', /emphasisSections=\{\[VIGILANCE_SECTION\]\}/.test(fc), true);
  const pr = readFileSync(`${process.cwd()}/src/modules/PendingRegistrations.tsx`, 'utf8');
  eq('...and BOTH forms on Pending Registrations do too',
    (pr.match(/emphasisSections=\{\[VIGILANCE_SECTION\]\}/g) ?? []).length, 2);

  // CONTRAST PROJECTION, NOT A TINT. The standing preference, and the thing
  // this project got wrong first: a pale wash of the accent did not read at
  // all on screen. Inverting against the page works in either theme by
  // construction, which a hand-picked highlighter colour does not.
  const css = readFileSync(`${process.cwd()}/src/components/form/form.css`, 'utf8');
  const vital = /\.sf-section-vital \{[\s\S]*?\}/.exec(css)?.[0] ?? '';
  eq('the emphasis INVERTS against the page',
    /background: var\(--text\)/.test(vital) && /color: var\(--surface\)/.test(vital), true);
  eq('...it is not a tint of the accent colour',
    /color-mix[^;]*--primary/.test(vital), false);
}

// WHICH MASTER VALUES A CALL MAY BE REVIEWED WITH (user, 2026-09-07): "in case
// of T60 and T75 -- only the specific drop downs should come. in case of Other
// Products all the drop-downs can come."
console.log('\n-- the DCCR dropdowns are scoped to the product --');
{
  // The register writes "MONNAL T60"; the master tags "MONNAL T60"; and a
  // hand-typed "T-60" or a bare "T75" must not fall out of the rule.
  for (const [name, want] of [
    ['MONNAL T60', 'T60'], ['MONNAL T75', 'T75'], ['Monnal T-60', 'T60'], ['T75', 'T75'],
    ['VEGA', ''], ['EXTEND-XT', ''], ['COMM', ''], ['', ''],
    // The boundary: a longer number that merely starts with 60/75 is NOT one.
    ['T750', ''], ['MONNAL T601', ''],
  ] as [string, string][]) {
    eq(`curatedProduct("${name}")`, curatedProduct(name), want);
  }

  // A MONNAL gets its own list and NOTHING else — not COMM, not the other
  // Monnal's. That is the whole instruction: the alarm codes mean nothing on
  // another machine, and the common list buries them.
  eq('a T60 call is NOT offered the COMM values', masterValueApplies('COMM', 'MONNAL T60'), false);
  eq('a T60 call is NOT offered the T75 values', masterValueApplies('MONNAL T75', 'MONNAL T60'), false);
  eq('a T60 call IS offered its own', masterValueApplies('MONNAL T60', 'MONNAL T60'), true);
  eq('...and an untagged value is not one of its own either',
    masterValueApplies('', 'MONNAL T60'), false);

  // Everything else gets the lot: narrowing a product with no curated list to
  // COMM alone would leave a handful of generic values and nothing to say.
  for (const tag of ['COMM', 'MONNAL T60', 'MONNAL T75', '']) {
    eq(`a VEGA call is offered the "${tag || '(untagged)'}" values`, masterValueApplies(tag, 'VEGA'), true);
  }

  const dccr = readFileSync(`${process.cwd()}/src/modules/DailyCallReview.tsx`, 'utf8');
  // The note, in the user's own words. Somebody staring at a list that does
  // not have what they need should be told where it comes from, there.
  eq('the review says where to add a missing value',
    /If what you are looking for is not available here, please add it to Masters/.test(dccr), true);
  // And the hint under each box must say WHICH of the two rules is in force —
  // "12 values" reads as a short list either way.
  eq('...and each box says whether the list is the product\'s own or everyone\'s',
    /only`/.test(dccr) && /every product's, because/.test(dccr), true);
  // The old wording promised COMM on top, which is no longer true anywhere.
  eq('nothing still promises the COMM values on top of the product\'s',
    /incl\. COMM/.test(dccr) || /plus anything tagged <b>COMM<\/b>/.test(dccr), false);
}

// THE KPI WORKBOOK'S Field_INST TAB. Phase 1 is columns A-AB, "same format,
// same fields" — so the headings are not ours to tidy. "Registeration" is the
// workbook's spelling and it stays, because a heading that does not match is a
// column the workbook will not accept.
console.log('\n-- the KPI export matches the workbook --');
{
  // A to AG as the workbook has them, then the one it does not have.
  eq('columns A to AG, then Pending Days', KPI_FIELD_INST_COLUMNS.length, 34);
  eq('the first is UC Number', KPI_FIELD_INST_COLUMNS[0], 'UC Number');
  eq('AB is the solved date', KPI_FIELD_INST_COLUMNS[27], 'Call Solved Date & Time');
  eq('AA is the attended date', KPI_FIELD_INST_COLUMNS[26], 'Call Attended On');
  // The workbook's own spelling, not ours.
  eq('the workbook\'s spelling is kept', KPI_FIELD_INST_COLUMNS[2], 'Call Registeration Date');
  // AC-AG in the sheet's order, so the file drops into the tab unchanged.
  eq('AC to AG are the workbook\'s five, in its order',
    KPI_FIELD_INST_COLUMNS.slice(28, 33).join('|'),
    'Attended in Days|Solved in Days|TTA ( R )|TTS ( R )|Failure Month');
  // Ours goes LAST, so A-AG still line up with the workbook exactly.
  eq('...and Pending Days is appended after them, not among them',
    KPI_FIELD_INST_COLUMNS[33], 'Pending Days');

  // Dates in the register's own dd-mmm-yyyy, unambiguous wherever the file is
  // opened; the registration column is the only one carrying a time.
  const row = toKpiExportRow({
    'UC Number': '26I06F0001',
    'Call Registeration Date': '2026-09-06T10:43:51+05:30',
    'Complaint Date': '2026-09-01',
    'Call Attended On': '2026-09-03',
    'Call Solved Date & Time': null,
    'Open/Close': 'Open',
  });
  eq('a date is dd-mmm-yyyy', row['Complaint Date'], '01-Sep-2026');
  eq('...and the registration date carries its time', String(row['Call Registeration Date']).slice(0, 12), '06-Sep-2026 ');
  eq('a missing date is blank, not a zero date', row['Call Solved Date & Time'], '');
  eq('a plain value is passed through', row['Open/Close'], 'Open');
  // Every column is present in every row, or the CSV's columns slide.
  eq('every column is written, even when the view has no value',
    KPI_FIELD_INST_COLUMNS.every((c) => c in row), true);

  // The export moved to Reports (2026-09-08) -- KPI & Failure Analysis, then
  // Objective, now its own tab. THE RULES MOVE WITH IT: a screen that hands
  // somebody a file has to say what the file counts, wherever it now lives.
  const objPage = readFileSync(`${process.cwd()}/src/modules/KpiExport.tsx`, 'utf8');
  eq('the screen says the three rules it was given',
    /earlier of the first visit and the first spare request/.test(objPage)
    && /Solved - Report Completed/.test(objPage)
    && /cancelled calls are not included at\s*\n?\s*all/i.test(objPage), true);
  // The page must say how each computed column is arrived at: a number nobody
  // can account for is not evidence.
  eq('...and says how the computed columns are worked out',
    /LATER of complaint and\s*\n?\s*registration/.test(objPage)
    && /finer of its two lookup tables/.test(objPage)
    && /attended and solved the same\s*\n?\s*day/.test(objPage), true);
}

// LOOKING UP ONE MACHINE BY SERIAL IS AN EQUALITY (0129). It was a
// leading-wildcard substring scan, which is what kept timing out on Pending
// Registrations — and which could miss the serial entirely.
console.log('\n-- one machine, by its serial --');
{
  const sb = readFileSync(`${process.cwd()}/src/lib/supabase.ts`, 'utf8');
  eq('there is an exact lookup, on the indexed key',
    /eq\('serial_key', key\)/.test(sb), true);
  // The EXACT branch of the search must use the key too: eq('serial_number')
  // is case-sensitive and has no plain btree behind it, so the one filter that
  // meant equality was the one that could not use an index.
  eq('...and the exact SEARCH uses it as well',
    /q\.eq\('serial_key', filters\.serial\.trim\(\)\.toLowerCase\(\)\)/.test(sb), true);
  eq('nothing looks a serial up with eq on the raw column',
    /eq\('serial_number'/.test(sb), false);

  const pr = readFileSync(`${process.cwd()}/src/modules/PendingRegistrations.tsx`, 'utf8');
  // STRENGTHENED 2026-09-21, not relaxed. This asserted `productBySerial(serial)`
  // literally, which pinned the very shape that was wrong: the serial ALONE
  // does not name a machine, so the lookup returned an arbitrary one of the
  // machines wearing it and filled ITS cover onto the call. The intent -- ONE
  // machine, by equality, never 25 substring matches -- is unchanged and is now
  // held at the right key.
  eq('registering from a request asks for the ONE machine, by MODEL and serial',
    /await productBySerial\(serial, g\(row, 'PRODUCT', 'Product Name'\)\)/.test(pr), true);
  eq('...and never by the serial alone, which names no machine',
    /await productBySerial\(serial\)/.test(pr), false);
  // The shape that timed out: read 25 substring matches, then find the exact
  // one here. If it ever comes back, so does the timeout.
  eq('...not 25 substring matches sifted in the browser',
    /searchProducts\(\{ serial \}/.test(pr), false);

  const sh = readFileSync(`${process.cwd()}/src/lib/sheets.ts`, 'utf8');
  eq('the sheet-era path still has an answer', /export async function productBySerial/.test(sh), true);
}

// THE OBJECTIVE PAGE (0130). "create a separate page called objective.. and
// move the phase 1 to that", then "I need all these there".
console.log('\n-- the Objective page --');
{
  const rbacSrc = readFileSync(`${process.cwd()}/src/lib/rbac.ts`, 'utf8');
  const layout = readFileSync(`${process.cwd()}/src/components/layout/Layout.tsx`, 'utf8');
  const app = readFileSync(`${process.cwd()}/src/App.tsx`, 'utf8');
  eq('it is a module, so a role can be given or refused it',
    /\{ path: '\/objective', label: 'Objective' \}/.test(rbacSrc), true);
  eq('...it is on the permission tree, or it can never be granted',
    /path: '\/objective', label: 'Objective', actions: \[\]/.test(rbacSrc), true);
  eq('...in the menu', /to: '\/objective'/.test(layout), true);
  eq('...and routed', /path="\/objective"/.test(app), true);

  const obj = readFileSync(`${process.cwd()}/src/modules/Objective.tsx`, 'utf8');
  const kpi = readFileSync(`${process.cwd()}/src/modules/KpiAnalytics.tsx`, 'utf8');
  const kpiExport = readFileSync(`${process.cwd()}/src/modules/KpiExport.tsx`, 'utf8');
  const hub = readFileSync(`${process.cwd()}/src/modules/ReportsHub.tsx`, 'utf8');
  // MOVED, not copied -- twice now. Two export buttons writing the same file
  // from two screens is how they drift apart, so each move must leave NOTHING
  // behind: the check names every screen it has ever lived on.
  eq('the KPI export lives on Reports', /KPI workbook — Field_INST/.test(kpiExport)
    && /KpiExport/.test(hub), true);
  eq('...and is gone from KPI & Failure Analysis',
    /Export — KPI workbook/.test(kpi) || /listKpiFieldInst/.test(kpi), false);
  eq('...and gone from Objective',
    /Export — KPI workbook/.test(obj) || /listKpiFieldInst/.test(obj), false);
  // Phase 2 has landed: the screen explains each computed column instead of
  // promising it. It said "not exported yet" for a while AFTER they shipped,
  // which is worse than saying nothing -- it told the reader a column was
  // missing that was right there in the file.
  eq('...and the computed columns are explained, not promised',
    /are computed\s*\n?\s*here, by the workbook/.test(kpiExport)
    && /not exported yet/.test(kpiExport) === false, true);

  // A month that was not measured is NOT zero. On a rate that is the difference
  // between "we did not measure" and "it was perfect".
  eq('a blank month is stored as null, not zero', /value: number \| null = null;/.test(obj), true);
  eq('...and the screen says so', /NOT MEASURED, which is not the same as zero/.test(obj), true);
  // Every figure is typed today, and the page says it rather than letting a
  // number look computed.
  eq('the page admits the figures are typed', /Every figure here is <b>typed<\/b> today/.test(obj), true);
  // A target reads "<5%" / ">75%" / "To Monitor" — the last has no line, so it
  // must not be coloured as met or missed.
  eq('an unparseable target is neither met nor missed',
    /if \(!m\) return '';/.test(obj), true);
}

// TYPING MUST NEVER CHOOSE AN ANSWER (2026-09-07): "currently if I start
// typing it is getting selected automatically -- I see that as a risk with
// Auto Save in place." A native <select> does type-ahead, and on a record that
// saves itself the wrong answer is written before anybody sees it.
console.log('\n-- typing filters, it never selects --');
{
  const pl = readFileSync(`${process.cwd()}/src/components/ui/PickList.tsx`, 'utf8');
  // onPick may be called from exactly one place: `choose`. If a second call
  // site appears, typing can commit again.
  const pickCalls = (pl.match(/onPick\(/g) ?? []).length;
  eq('onPick is called from ONE place', pickCalls, 1);
  // Matched on SHAPE, not on the line verbatim: pinning the exact text made
  // this fail the first time `choose` gained a guard, which is a false alarm
  // about a change that kept the property intact. What must hold is that the
  // single onPick call lives inside `choose` and closes after it.
  eq('...and that place is `choose`',
    /const choose = \(v: string\) => \{[^}]*onPick\(v\); close\(\); \};/.test(pl), true);
  // A row the form marked unpickable must not commit either.
  eq('...which refuses a disabled row', /if \(v && isDisabled\?\.\(v\)\) return;/.test(pl), true);
  // Typing sets the query and the highlight, never the value.
  eq('typing only filters', /onChange=\{\(e\) => \{ setQuery\(e\.target\.value\); setHi\(0\); \}\}/.test(pl), true);
  // Walking away must leave the record alone — the whole point with auto-save.
  eq('clicking away abandons, it does not pick', /if \(boxRef\.current && !boxRef\.current\.contains\(e\.target as Node\)\) close\(\);/.test(pl), true);
  eq('Escape leaves it alone too', /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); close\(\);/.test(pl), true);
  // Enter with nothing matching must not invent a value from the search box.
  //
  // TESTS THE PROPERTY, not the variable name. This pinned `matches[hi]`
  // verbatim and broke the day the rendered list was capped and the highlight
  // moved to `shown[hi]` — identical behaviour, failing assertion. What matters
  // is that Enter commits an element of the visible list and reaches `canTake`
  // only as a fallback; which array holds it is an implementation detail.
  eq('Enter with no match does nothing',
    /if \((?:matches|shown)\[hi\] != null\) choose\((?:matches|shown)\[hi\]\);\s*\n\s*else if \(canTake\) choose\(typed\);/.test(pl), true);

  const dccr = readFileSync(`${process.cwd()}/src/modules/DailyCallReview.tsx`, 'utf8');
  // All THREE Review 3 answers, not just the two that were reported: same
  // drawer, same auto-save, same risk.
  for (const f of ['complaint_grouping', 'root_cause_keyword', 'spare_category']) {
    eq(`${f} is a pick list`, new RegExp(`value=\\{String\\(draft\\.${f} \\?\\? ''\\)\\}`).test(dccr), true);
  }
  eq('...and none of them is a native select any more',
    /<select className="select" value=\{draft\.(complaint_grouping|root_cause_keyword|spare_category)/.test(dccr), false);
  // The two master-backed ones say where a missing value comes from.
  eq('a search that matches nothing points at Masters',
    (dccr.match(/emptyHint="If it is not here, add it to Masters\."/g) ?? []).length, 2);
}

// THE OBJECTIVES COMPUTE THEMSELVES, AND CAN SHOW THEIR WORKING (0132).
// "calculated values should be fed automatically upon Re-Calc [Explicitly done
// at the time of Submission]. Add a Provision to download evidence ... if the
// value is not calculated by us, leave it to be editable."
console.log('\n-- Re-Calc, evidence, and nothing hardcoded --');
{
  const obj = readFileSync(`${process.cwd()}/src/modules/Objective.tsx`, 'utf8');
  // EXPLICIT. A figure that moves because somebody opened a screen is not one
  // anybody can stand behind at an audit, so Re-Calc must never be in an effect.
  eq('Re-Calc is a button, never a page load',
    /onClick=\{\(\) => setConfirmRecalc\(true\)\}/.test(obj)
    && /useEffect\([^)]*recalcObjectives/.test(obj) === false, true);
  // The dialog's promises moved with the rules: closure is now the VISIT date,
  // and a cut-off never changes which calls are counted. Both are things
  // somebody acts on, so the dialog has to say them.
  eq('...and it asks first, saying what it will and will not touch',
    /A typed figure is never touched/.test(obj)
    && /the date it was <b>visited<\/b>/.test(obj)
    && /a cut-off never changes which calls\s+are counted/.test(obj), true);
  // The evidence is offered only where we computed the figure: a typed number
  // has no working to show.
  eq('evidence is downloadable, and only for a computed figure',
    /o\.calc_key && v != null && \(/.test(obj) && /downloadEvidence\(o, MONTH_KEYS\.indexOf\(k\)\)/.test(obj), true);
  // Nothing about an objective is baked in: the definition, the formula and its
  // parameters are all editable by an administrator.
  // Matched on the FIELD being set, not on the expression that sets it: pinning
  // `e.target.value` made this fail the day the formula picker became a
  // SelectPicker (which hands over the value directly) — a false alarm about a
  // change that kept the property intact. What must hold is that both the
  // formula and its parameters are still writable from the definition screen.
  eq('every part of an objective is editable, formula included',
    /saveObjectiveDef/.test(obj) && /calc_key: [^,}]+/.test(obj)
    && /calc_params: [^,}]+/.test(obj), true);
  eq('...and objectives can be added and removed',
    /addObjective\(YEAR/.test(obj) && /deleteObjective\(defOpen\.id\)/.test(obj), true);
  // A row that computes itself is marked, or nobody can tell which figures are
  // evidence and which are somebody's typing.
  eq('a computed row is marked on the screen', /className="obj-calc"/.test(obj), true);
}

// THE EVIDENCE IS A WORKBOOK (user, 2026-09-07): "List of Field Calls
// (Sheet1), Installation Base (Sheet2), Calculation (Sheet3)".
console.log('\n-- the evidence workbook --');
{
  // A real .xlsx, written without a dependency. The bytes are checked rather
  // than the code: a ZIP whose CRC or offsets are wrong opens as a corrupt file.
  const bytes = buildXlsx([
    { name: 'List of Field Calls', columns: ['UCN', 'Days'], rows: [{ UCN: 'x & <y>', Days: 3 }] },
    { name: 'Installation Base', columns: ['Serial'], rows: [{ Serial: 'INXT 1' }] },
    { name: 'Calculation', columns: ['Item', 'Value'], rows: [{ Item: 'Rate', Value: 0.2 }] },
  ]);
  const s = Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
  eq('it is a ZIP', s.slice(0, 2), 'PK');
  eq('...with an end-of-directory record', s.includes('\x50\x4b\x05\x06'), true);
  eq('...carrying the workbook part', s.includes('xl/workbook.xml'), true);
  eq('...and one worksheet per sheet',
    ['sheet1.xml', 'sheet2.xml', 'sheet3.xml'].every((n) => s.includes(`xl/worksheets/${n}`)), true);
  eq('the tabs are named as asked',
    s.includes('List of Field Calls') && s.includes('Installation Base') && s.includes('Calculation'), true);
  // A number must be a number, or the Calculation tab cannot be added up.
  eq('a number is written as a number, not text', s.includes('<v>0.2</v>'), true);
  // XML-unsafe text must not break the part.
  eq('...and text is escaped', s.includes('x &amp; &lt;y&gt;'), true);

  // THE DCCR EXPORT IS WRR-2026's COLUMNS 15-67, in that order -- the
  // reliability workbook pulls this same register in by IMPORTRANGE, so an
  // export has to paste into it without shifting a column. The ten added on
  // 2026-09-08 are mostly blank ON PURPOSE and must stay in the list: a missing
  // column moves every column after it.
  const dccrSrc = readFileSync(`${process.cwd()}/src/lib/dccr.ts`, 'utf8');
  const dccrHeaders = [...dccrSrc
    .slice(dccrSrc.indexOf('DCCR_EXPORT_COLUMNS: ExportColumn[]'), dccrSrc.indexOf('// The register'))
    .matchAll(/header: '([^']+)'/g)].map((m) => m[1]);
  eq('the DCCR export still carries all 53 of WRR-2026 columns 15-67',
    dccrHeaders.length, 53);
  eq('...starting with Updated By / Updated Date and ending with DUMMY COLUMN',
    dccrHeaders[0] === 'Updated By' && dccrHeaders[1] === 'Updated Date'
    && dccrHeaders[dccrHeaders.length - 1] === 'DUMMY COLUMN', true);
  // CALL PENDING REASON is the one of the ten the register already holds, so it
  // is filled rather than blank -- an empty column where the data is in hand is
  // a loss, not a placeholder.
  eq('CALL PENDING REASON is filled, not blank',
    /pending_reason: r\.pending_reason/.test(dccrSrc), true);

  // -------------------------------------------------------------------------
  // A DATE INPUT TAKES A VALUE, NOT A RENDERING.
  //
  // Reported 2026-09-14: "Why the Dates are not loaded in the Form even though
  // the information is very much available?" The Contract Register listed
  // START 06-Sep-2025 and END 05-Sep-2031 while the drawer showed three blank
  // `dd --- yyyy` boxes. `fromDb` was running every date field through
  // `fmtLongDate`, and `<input type="date">` accepts ONLY `yyyy-MM-dd` --
  // anything else renders EMPTY, with no error in the console and none on the
  // page. The value was there the whole time and was saved correctly; it was
  // simply never visible, which is the worst shape a bug can take on a form
  // somebody is about to edit.
  //
  // Asserted two ways: the CONVERSION (which this check can run) and the CALL
  // SITE (which it can only read), because either alone would pass while the
  // screen stayed blank.
  // -------------------------------------------------------------------------
  {
    const cov = readFileSync(`${process.cwd()}/src/modules/CoverRegister.tsx`, 'utf8');
    // ---- the register opens on as much as the server will give -------------
    // The user, 2026-09-14: "Make the Default Load Row to Max And Load More
    // should load 2x". It opened at 200 entries / 500 machines.
    eq('the register opens on a full page from the server',
      /const PAGE: Record<Tab, number> = \{ entries: 1000, machines: 1000 \}/.test(cov), true);
    // "paging - Keep it at 1000 then" ... "But perform that action once more
    // automatically": the REQUEST stays at what the server will actually
    // return, and the register makes two of them before showing anything.
    eq('...twice over, before anything is shown',
      /const OPEN_PAGES = 2/.test(cov)
      && /const r = await fetchPages\(t, 0, OPEN_PAGES\)/.test(cov), true);
    // The "+" and the Load more button must be judged against what was ASKED
    // FOR, not one page — else a full 2,000-row open reads as the end.
    eq('...and "more" is judged against the whole opening request',
      /more: r\.length >= OPEN_PAGES \* PAGE\[t\]/.test(cov), true);
    eq('...and Load more doubles what it fetches',
      /step: feed\.step \* 2/.test(cov), true);
    // THE DOUBLING IS IN THE NUMBER OF REQUESTS, not the size of one. PostgREST
    // caps a response (db-max-rows), so asking for 4,000 returns 1,000 and the
    // page would conclude there was nothing more — a register that looks
    // complete and is not.
    eq('...as more requests, never as a bigger one a server would truncate',
      /const r = await fetchPages\(tab, feed\.offset, feed\.step\)/.test(cov)
      && /if \(r\.length < PAGE\[t\]\) break;/.test(cov), true);
    eq('the cover form feeds its date inputs an ISO value',
      /const dateVal = \(v: unknown\) => localIsoDate\(v\) \?\? ''/.test(cov), true);
    // The formatter must be GONE from the value path, not merely joined by the
    // converter: the first fix for a fault like this is usually an addition.
    // Tested on the IMPORT rather than on a call, because the first version of
    // this assertion searched the whole file for `fmtLongDate(` and matched the
    // COMMENT above the fix explaining what had been wrong. A check that a
    // comment can fail is a check that will be edited until it stops failing.
    eq('...and no display formatter is left in it',
      /field\.type === 'date' \? dateVal\(v\)/.test(cov)
      && /fmtLongDate/.test(code(cov)) === false, true);

    // The conversion itself, over the two shapes these columns actually hold:
    // `contract_start` is a DATE and `entry_at` is a TIMESTAMPTZ.
    eq('a plain date column passes straight through', localIsoDate('2025-09-06'), '2025-09-06');
    eq('...and a timestamptz becomes the reader\'s own day',
      localIsoDate(new Date(2026, 8, 11, 16, 33).toISOString()), '2026-09-11');
    // The shape that was being handed to the input. It must NOT come back out
    // as an ISO date by accident — if a display string round-tripped, the bug
    // would be invisible again.
    eq('a rendered date is not a valid input value', /^\d{4}-\d{2}-\d{2}$/.test(fmtLongDate('2025-09-06')), false);
    eq('...though it is still what a reader should SEE', fmtLongDate('2025-09-06'), '06-Sep-2025');
    eq('nothing at all is empty, never today', localIsoDate(null) ?? '', '');
  }

  // -------------------------------------------------------------------------
  // THE DATE ON A FEEDBACK IS THE FEEDBACK'S, NOT THE ROW'S.
  //
  // Reported 2026-09-14: "the Date is taken as 14Sep2026 for all Uploads ... It
  // creates a Complaint issue." The column read `created_at` — when the ROW was
  // written — so every feedback in a 24,749-row export read as the afternoon it
  // was loaded.
  // -------------------------------------------------------------------------
  {
    const fb = readFileSync(`${process.cwd()}/src/modules/CustomerFeedback.tsx`, 'utf8');
    eq('the Date column is the feedback\'s own date',
      /\{ key: 'entry_at', header: 'Date' \}/.test(fb), true);
    // `created_at` is NOT hidden — it is a real and separate fact, and hiding
    // it would make the correction unverifiable.
    eq('...and when it was loaded is still shown, under that name',
      /\{ key: 'created_at', header: 'Loaded on' \}/.test(fb), true);
    eq('...and the upload date is no longer called "Date"',
      /\{ key: 'created_at', header: 'Date' \}/.test(code(fb)), false);
    eq('every date column is rendered as a date',
      /const DATE_COLS = new Set\(\['entry_at', 'visit_at', 'created_at'\]\)/.test(fb), true);
    // "Can I segregate the Uploaded ones and the Ones that were entered in the
    // new CRM?" — empty `imported_from` means nobody loaded it.
    eq('uploaded and entered-here can be told apart',
      /const originOf = \(r: Record<string, unknown>\) =>/.test(fb)
      && /String\(r\.imported_from \?\? ''\)\.trim\(\) \? 'Uploaded' : 'Entered here'/.test(fb), true);
    eq('...and filtered on', /setOrigin\(\(c\) => \(c === o \? '' : o\)\)/.test(fb), true);
    // The chip counts are over the SCOPED rows, so the two always add up to the
    // register and neither reads zero because the other one is on.
    eq('...with counts that add up to the register',
      /scoped\.filter\(\(r\) => originOf\(r\) === o\)\.length/.test(fb), true);
    // The importer has to fill the column, or 0190 backfills history and every
    // NEW upload starts the problem again.
    const up = readFileSync(`${process.cwd()}/src/lib/uploads.ts`, 'utf8');
    eq('the importer maps the export\'s own date',
      /TS\('entry_at', 'visit entry date'/.test(up), true);
    eq('...and stamps where the row came from',
      /stamp: \{ imported_from: 'v2Feedback export' \}/.test(up), true);
  }

  // -------------------------------------------------------------------------
  // THE FIELD FAILURE REGISTER'S YEAR FILTER (user's ask, 2026-09-14).
  // -------------------------------------------------------------------------
  {
    const ffr = readFileSync(`${process.cwd()}/src/modules/FieldFailureReport.tsx`, 'utf8');
    eq('the register filters by year and defaults to the current one',
      /const thisYear = String\(new Date\(\)\.getFullYear\(\)\)/.test(ffr)
      && /useState<string\[\]>\(\[thisYear\]\)/.test(ffr), true);
    // MULTI-SELECT, both filters (the user's second ask on this screen). An
    // EMPTY selection means ALL, which is what lets the Product filter sit
    // beside the Year one costing nothing: it starts ticking nothing and
    // therefore hides nothing. A control that opened with everything unticked
    // AND showed nothing would read as a broken screen.
    eq('both filters take several values at once',
      /<MultiPick values=\{years\}/.test(ffr) && /<MultiPick values=\{products\}/.test(ffr), true);
    eq('...and the product filter starts empty, so it hides nothing',
      /const \[products, setProducts\] = useState<string\[\]>\(\[\]\)/.test(ffr), true);
    // The products offered are the ones the CHOSEN YEARS hold: listing a model
    // with nothing behind it offers a click that can only empty the screen.
    eq('the products offered are the ones the chosen years hold',
      /const pool = years\.length \? rows\.filter\(\(r\) => years\.includes\(ffrYear\(r\)\)\) : rows/.test(ffr), true);
    // By the FFR DATE, the same date the Objective register counts by (0142),
    // so the two cannot report different years for one report.
    eq('...by the FFR date, not the date it was typed',
      /const ffrYear = \(r: Row\) => String\(r\.ffr_date \?\? ''\)\.slice\(0, 4\)/.test(ffr), true);
    // The current year has to be offered even when it holds nothing, or the
    // default is not selectable and the control reads as broken.
    eq('the current year is always on the list', /seen\.add\(thisYear\)/.test(ffr), true);
    // A default landing on an empty year looks like an empty register. This
    // page already carries that lesson for access; the same applies here.
    eq('an empty result says so rather than looking empty',
      /Nothing matches/.test(ffr) && /Clear the filters/.test(ffr), true);
    // A YEAR is a reporting period, so it reaches Insights — unlike the search
    // box and the status chips, which deliberately do not.
    eq('Insights follows the year', /<FieldFailureInsights rows=\{inYear\}/.test(ffr), true);
    eq('...and not the search box', /<FieldFailureInsights rows=\{visible\}/.test(ffr), false);
    // Every dropdown is type-search-and-select — the standing rule, which a
    // multi-select must keep: a native `<select multiple>` picks on the first
    // keystroke exactly as a single one does.
    {
      const mp = readFileSync(`${process.cwd()}/src/components/ui/MultiPick.tsx`, 'utf8');
      eq('the multi-picker filters on typing and never selects on it',
        /placeholder="Type to narrow…"/.test(mp) && /<select/.test(code(mp)) === false, true);
      // The one behaviour that separates it from PickList, and the reason it is
      // a separate component rather than a flag: picking must NOT close.
      eq('...and ticking leaves the list open',
        /\/\/ THE MENU STAYS OPEN\. That is the whole difference from PickList\./.test(mp), true);
      // Empty is ALL, in the control as well as in the screen that uses it.
      eq('...and an empty selection means everything',
        /nothing ticked — showing everything/.test(mp), true);
    }
  }

  // AN ACCESS REFUSAL IS NOT A FAULT, and must not read as one. The FFR count
  // (0142) gates its evidence on `ffr.view`, and SEVEN of the twelve roles that
  // can open the Objective page do not hold it — commercial, engineer,
  // spare_coordinator, stores_incharge, tally_coordinator, technical support
  // and zoho_migration. Every one of them would have got a raw "RBAC: ..."
  // string in a red banner, which reads as the page being broken rather than as
  // the register being closed to them. Measured against app_roles, not guessed.
  eq('a refusal to show the rows behind a figure explains itself',
    /\/\^RBAC:\/\.test\(raw\)/.test(readFileSync(`${process.cwd()}/src/modules/Objective.tsx`, 'utf8'))
    && /the figure is yours to see, the reports behind it/.test(readFileSync(`${process.cwd()}/src/modules/Objective.tsx`, 'utf8')), true);

  const obj = readFileSync(`${process.cwd()}/src/modules/Objective.tsx`, 'utf8');
  const objSb = readFileSync(`${process.cwd()}/src/lib/supabase.ts`, 'utf8');
  // Sheet 1 is named for the register the objective actually read — the user's
  // shape ("List of Field Calls") for a field objective, and the truth for a PM
  // or Installation one, which is a different register and not field calls.
  eq('the three sheets are the ones asked for',
    /: fam === 'pm' \? 'List of PM Calls'/.test(obj)
    && /: 'List of Field Calls'/.test(obj)
    && /name: 'Installation Base'/.test(obj)
    && /name: 'Calculation'/.test(obj), true);
  // ...and sheet 1 is named for the register a COUNT read, which is not a call
  // register at all. Objective 1 counts Field Failure Reports (0142).
  eq('a count names its own register on sheet 1',
    /isCount \? 'Field Failure Reports'/.test(obj), true);
  // The user asked for the assumptions and the hard stops IN the sheet, and for
  // them to be told apart: an assumption is a choice somebody may want changed,
  // a hard stop is what the number means.
  eq('the calculation sheet states its assumptions and its hard stops',
    /'ASSUMPTION', 'HARD STOP'/.test(obj)
    && /ASSUMPTIONS/.test(obj) && /HARD STOPS/.test(obj), true);
  // A quarterly objective carries no figure in ten months of the year. Saying
  // "nothing to download" there reads as a broken export.
  eq('a month that carries no figure says why, not "nothing to download"',
    /if \(period && !period\.applies\)/.test(obj), true);
  // The user asked for the ACTUAL closure date in the export, and for a call
  // solved after the cut-off to be called out rather than left looking like
  // one that was never solved at all.
  eq('the export carries the closure date and the after-cut-off callout',
    /'closure_date', 'closure_recorded_on', 'after_cutoff'/.test(obj), true);
  eq('...and the calculation sheet counts how many the cut-off excluded',
    /of which SOLVED AFTER THE CUT-OFF/.test(obj), true);
  // A grace and a fixed date are two answers to one question; holding both
  // would leave the screen unable to say which is in force.
  eq('the cut-off controls clear one another',
    /setParam\('cutoff_days', e\.target\.value, 'cutoff_date'\)/.test(obj)
    && /setParam\('cutoff_date', e\.target\.value, 'cutoff_days'\)/.test(obj), true);
  // ONE CUT-OFF PER MONTH. A single date across the year silently re-bases
  // every figure already reported — the bug this replaced.
  eq('there is a cut-off date for every month, not one for the year',
    /MONTHS\.map\(\(mo, i\) => \(/.test(obj)
    && /saveCutoff\(i \+ 1, e\.target\.value\)/.test(obj), true);
  // Re-Calculate READS them; setting is its own act. Two ways to set one thing
  // is how a figure ends up disagreeing with the setting behind it.
  eq('Re-calculate reads the cut-offs and does not set one',
    /recalcObjectives\(YEAR\)/.test(obj)
    && !/recalcObjectives\(YEAR,/.test(obj), true);
  // Clearing a date must put the month back — otherwise the first mistyped
  // date is permanent.
  eq('a blank date clears the month rather than storing an empty one',
    /p_date: date && date\.trim\(\) \? date\.trim\(\) : null/.test(objSb), true);
  // The lock is an ADMIN's switch; config.manage is who it holds back, so
  // config.manage must not be what unlocks it.
  eq('the cut-off lock is an admin switch, not a config.manage one',
    /const \{ can, isAdmin \} = useAuth\(\)/.test(obj)
    && /\{isAdmin && \(/.test(obj)
    && /!cutoffLocked \|\| isAdmin/.test(obj), true);
  // Sheet 3 is counted from sheets 1 and 2 — the file has to add up to itself.
  eq('the calculation is counted from the rows, not read off the page',
    /const numerator = isRate \? calls\.length/.test(obj)
    && /const denominator = isRate \? machines\.length/.test(obj), true);
  // ...and it says so when the page disagrees, rather than hiding it.
  eq('...and it flags a figure that no longer agrees',
    /re-calculate; the \$\{isCount \? 'reports' : 'calls'\} have changed since the figure was written/.test(obj), true);

  // A COUNT IS NOT A RATIO, and the whole sheet was built for a ratio. Objective
  // 1 (Field failures registered in FFR) is the first plain count here, and a
  // Calculation sheet reading "12 ÷ 12 = 1" would be arithmetic nobody
  // performed — on a page whose entire purpose is that a figure can be checked.
  eq('a count is laid out as a count, not as a division',
    /const isCount = o\.calc_key === 'ffr_count_monthly'/.test(obj)
    && /const computed = isCount \? reports :/.test(obj)
    && /Machine rows behind them \(Sheet 1\)/.test(obj), true);
  // The figure counts REPORTS and the sheet lists MACHINES, because one report
  // covers several (0181). The two differ by design, so the file says so rather
  // than leaving a reader to find it.
  eq('...and it explains why the sheet out-numbers the figure',
    /ONE PER REPORT NUMBER/.test(obj), true);
  // The evidence rows come back in the CALL register's column names, so an FFR
  // sheet under those headings would label the FFR number "call_number" and the
  // person who raised it "allocated_to".
  eq('an FFR sheet carries FFR headings, not call ones',
    /\['FFR No\.', 'call_number'\]/.test(obj) && /\['Raised by', 'allocated_to'\]/.test(obj), true);
  // An empty tab reads as a bug; the open rate has no install base and says so.
  eq('an objective with no install base says so on the tab',
    /it has no installed base/.test(obj), true);
}

console.log('\n-- Technical Support: the Super Admin\'s reach, none of its writes --');
{
  const rbacSrc = readFileSync('src/lib/rbac.ts', 'utf8');
  const layout  = readFileSync('src/components/layout/Layout.tsx', 'utf8');
  const users   = readFileSync('src/modules/UsersAdmin.tsx', 'utf8');
  const settings = readFileSync('src/modules/Settings.tsx', 'utf8');
  const roles   = readFileSync('src/modules/RolePermissions.tsx', 'utf8');

  // EVERY module, admin ones included — that is the whole of "map this role to
  // all modules", and a defaults table that quietly gave it the non-admin set
  // would look right and hide half the app.
  eq('Technical Support holds every module, not the non-admin set',
    DEFAULT_PERMS.technical_support?.length === new Set([
      ...MODULES.map((m) => moduleAction(m.path)),
      ...(DEFAULT_PERMS.technical_support ?? []).filter((k) => !k.startsWith('mod:')),
    ]).size
    && MODULES.every((m) => DEFAULT_PERMS.technical_support?.includes(moduleAction(m.path))), true);

  // READ ONLY, and the list is checked rather than trusted: this is the one
  // property of the role somebody could undo by ticking a box in the defaults.
  const WRITES = ['calls.create', 'calls.edit', 'calls.report', 'calls.cancel', 'calls.allot',
    'masters.edit', 'cover.edit', 'ownership.transfer', 'review.edit', 'spare.request',
    'spare.approve_rm', 'spare.approve_nsm', 'spare.approve_commercial', 'spare.dispatch',
    'spare.drop', 'spare.receive', 'stock.transfer', 'stock.return', 'consumption.reconcile',
    'pending.register', 'request.create', 'install.create', 'docs.manage', 'qms.manage',
    'users.manage', 'config.manage', 'rbac.manage'];
  eq('...and not one action that writes',
    WRITES.filter((w) => DEFAULT_PERMS.technical_support?.includes(w)), []);

  // Without this it opens every page and the call pages are empty, which reads
  // as a broken login rather than as a scoped one.
  eq('...but data.view_all, or every call page is empty',
    !!DEFAULT_PERMS.technical_support?.includes('data.view_all'), true);

  // The admin pages gated themselves on the right to CHANGE what is on them,
  // so there was no way to let somebody look. One key, checked in one place.
  eq('an admin-only nav item opens on admin.view too, not just manage-users',
    /can\('manage-users'\) \|\| can\('admin.view'\)/.test(layout)
    && !/adminOnly \? can\('manage-users'\) :/.test(layout), true);

  // Seeing an admin screen is not running it: each one keeps its own right for
  // everything that changes something.
  eq('User Access opens read-only but is still managed by manage-users',
    /const mayManage = can\('manage-users'\)/.test(users)
    && /const mayOpen = mayManage \|\| can\('admin.view'\)/.test(users)
    && /actions=\{mayManage \?/.test(users), true);
  eq('Settings shows the connection but does not let a read-only login change it',
    /const mayOpen = mayManage \|\| can\('admin.view'\)/.test(settings)
    && /<DbConnection readOnly=\{!mayManage\} \/>/.test(settings)
    && /<SheetConnection readOnly=\{!mayManage\} \/>/.test(settings), true);
  eq('the permission matrix can be read without rbac.manage, and not saved',
    /const mayEdit = can\('rbac.manage'\)/.test(roles)
    && /disabled=\{!mayEdit \|\| r\.key === 'admin'\}/.test(roles)
    && /You can read this matrix but not change it/.test(roles), true);

  // The role is a matrix column, so it has to be in ROLES — and the label is
  // what the person picking a role in User Master reads.
  eq('the role is on the matrix with a name people recognise',
    /\{ key: 'technical_support', label: 'Technical Support' \}/.test(rbacSrc), true);
}

console.log('\n-- the service report on a closed call --');
{
  // ONE READER for a field written in two places. The column is what the app
  // writes today; the report form's own key is what the sheet era left behind.
  eq('the column is read', manualReportLink({ manual_report: 'https://drive.google.com/file/d/abc' }),
    'https://drive.google.com/file/d/abc');
  eq('...and the legacy field on the report itself',
    manualReportLink({ data: { 'Manual Report': 'https://drive.google.com/file/d/old' } }),
    'https://drive.google.com/file/d/old');
  eq('the column wins where a row carries both',
    manualReportLink({ manual_report: 'https://a/new', data: { 'Manual Report': 'https://a/old' } }),
    'https://a/new');
  // A LINK IS A LINK ONLY IF IT OPENS. A row whose field holds a note used to
  // render as a link to nowhere on the review screen.
  eq('a note is not a link', manualReportLink({ manual_report: 'given to customer' }), '');
  eq('a blank row is not a link', manualReportLink({}), '');
  eq('no row at all is not a link', manualReportLink(null), '');

  const calls = readFileSync('src/modules/FieldCalls.tsx', 'utf8');
  const assoc = readFileSync('src/modules/CallAssociations.tsx', 'utf8');
  const dccr  = readFileSync('src/modules/DailyCallReview.tsx', 'utf8');

  // ONLY FOR A CLOSED CALL, and only when one is open: an open call has no
  // report to show, so asking would be a request that always comes back empty.
  eq('the report is fetched for a closed call, not for every call',
    /if \(!drawerUcn \|\| !drawerClosed \|\| !supabaseConfigured\(\)\) return;/.test(calls), true);
  // Absent is a fact, not a blank space: a closed call with no report says so.
  eq('...and a closed call with no report says so rather than showing nothing',
    /No service report was filed on this call/.test(calls), true);
  // The visit filed it, so the visit is named — a call closed twice has a later
  // visit that filed none, and an unlabelled link would look like the last one.
  eq('the link names the visit it came from',
    /svcReport\.visitAt \? ` · \$\{fmtLongDate\(svcReport\.visitAt\)\}` : ''/.test(calls), true);

  // Same document, same look, on all three screens that show it.
  eq('one class for the report link everywhere',
    /className="svc-report-link"/.test(calls)
    && /className="svc-report-link"/.test(assoc)
    && /className="svc-report-link dccr-report-link"/.test(dccr), true);
  // Opening the report must not also open the visit behind it.
  eq('the report cell swallows the row click',
    /onClick=\{\(e\) => e\.stopPropagation\(\)\}/.test(assoc), true);
  // Every screen reads the field through the one reader.
  eq('no screen re-implements the read',
    !/manual_report \?\?/.test(calls) && !/manual_report \?\?/.test(assoc) && !/manual_report \?\?/.test(dccr), true);
}

console.log('\n-- the report, shown in the app --');
{
  // WHAT IS STORED IS NOT WHAT CAN BE FRAMED. An upload comes back as the page
  // a person opens; Drive refuses to be framed at that URL and serves /preview
  // instead, so the id is pulled out and the embed URL built from it.
  eq('an uploaded report becomes an embeddable preview',
    drivePreviewUrl('https://drive.google.com/file/d/1AbC_dEfGhIjKlMnOpQr/view?usp=drivesdk'),
    'https://drive.google.com/file/d/1AbC_dEfGhIjKlMnOpQr/preview');
  // The older shapes the sheet era left behind.
  eq('...and the open?id= shape', drivePreviewUrl('https://drive.google.com/open?id=1AbC_dEfGhIjKlMnOpQr'),
    'https://drive.google.com/file/d/1AbC_dEfGhIjKlMnOpQr/preview');
  eq('...and the uc?id= download shape',
    drivePreviewUrl('https://drive.google.com/uc?id=1AbC_dEfGhIjKlMnOpQr&export=download'),
    'https://drive.google.com/file/d/1AbC_dEfGhIjKlMnOpQr/preview');
  // A Doc is not a file: served from drive.google.com/file/... it renders
  // nothing at all, so each editor previews under its own path.
  eq('a Google Doc previews under its own path',
    drivePreviewUrl('https://docs.google.com/document/d/1AbC_dEfGhIjKlMnOpQr/edit'),
    'https://docs.google.com/document/d/1AbC_dEfGhIjKlMnOpQr/preview');
  eq('...and a Sheet', drivePreviewUrl('https://docs.google.com/spreadsheets/d/1AbC_dEfGhIjKlMnOpQr/edit#gid=0'),
    'https://docs.google.com/spreadsheets/d/1AbC_dEfGhIjKlMnOpQr/preview');
  // AN UNKNOWN LINK IS NOT A FAILURE — it opens in a tab as it always has.
  eq('a folder is not a document', drivePreviewUrl('https://drive.google.com/drive/folders/1AbC_dEfGhIjKlMnOpQr'), '');
  eq('another host is not Drive', drivePreviewUrl('https://example.com/report.pdf?id=1AbC_dEfGhIjKlMnOpQr'), '');
  eq('a note is not a link', drivePreviewUrl('handed to the customer'), '');
  eq('nothing is nothing', drivePreviewUrl(''), '');

  const rep = readFileSync('src/modules/CallReporting.tsx', 'utf8');
  const prev = readFileSync('src/components/doc/DocPreview.tsx', 'utf8');
  const sheets = readFileSync('src/lib/sheets.ts', 'utf8');

  // UPLOADED, NEVER PASTED (the user, 2026-09-08). This is what makes the
  // preview trustworthy: an upload is shared by CallReg.gs, a pasted link is
  // whatever somebody had open.
  eq('the Manual Report cannot be typed in',
    !/Paste the Drive link/.test(rep)
    && !/value=\{manualLink\} onChange=/.test(rep), true);
  eq('...and what is mandatory no longer offers a way that is gone',
    /upload the signed report\.'/.test(rep) && !/or paste its link/.test(rep), true);

  // The frame is cross-origin: a file that is not shared renders Google's "you
  // need access" page inside it and nothing can detect that. So the way out is
  // permanent, never a fallback that appears when something fails.
  eq('every preview keeps a way out to Drive',
    /Open in Drive ↗/.test(prev), true);
  // NOT sandboxed, and that is the considered choice: without
  // `allow-same-origin` the framed page gets an opaque origin and Drive's
  // viewer loses the cookies it needs to authenticate the reader -- the preview
  // would fail for exactly the files a signed-in person may see. The frame is
  // cross-origin either way, which is what stops it touching the app.
  eq('the frame is not sandboxed into losing its own cookies',
    !/sandbox=/.test(prev), true);
  // A link it cannot frame says so rather than showing an empty grey box.
  eq('a link that cannot be framed says so',
    /cannot be shown here/.test(prev), true);

  // A WAIT NOBODY CAN TELL FROM A FAILURE IS A FAILURE. This shipped at 60s +
  // a 45s fallback behind an unchanging line of text, and was reported as a
  // hang within the hour. Both halves are pinned: the budget ends in an answer,
  // and the screen shows the wait moving while it does.
  // THE PATH THAT WORKS IS TRIED FIRST. The browser cannot read a cross-origin
  // Apps Script response, so the fetch attempt was 25 seconds spent proving
  // that again on every single report before JSONP did the work.
  // Scoped to this function's body: `getJson` above has the same fetch call and
  // tries it FIRST, which is right for a one-line answer and is what made a
  // naive whole-file search pass no matter which order this one used.
  const fetchDoc = sheets.slice(sheets.indexOf('export async function fetchAppDocument('));
  eq('the report is fetched by the transport that actually works, first',
    /r = await jsonp\(url, 40000\);/.test(fetchDoc)
    && fetchDoc.indexOf('await jsonp(url, 40000)') < fetchDoc.indexOf('await fetch(url'), true);
  eq('...and it is still bounded, so it ends in an answer',
    /controller\.abort\(\), 20000\)/.test(sheets), true);
  eq('...and both failures are reported, not just the second\u2019s',
    /\(then: \$\{b\}\)/.test(sheets), true);
  eq('the viewer counts the seconds it has waited',
    /setWaited\(\(n\) => n \+ 1\)/.test(prev)
    && /<b>\{waited\}s<\/b>/.test(prev), true);
  eq('...and offers the way out once the wait is noticeable',
    /waited >= 5 &&/.test(prev), true);

  const gs = readFileSync('apps-script/CallReg.gs', 'utf8');

  // THE BYTES COME THROUGH THE BRIDGE FIRST, not from Drive. The org forbids
  // link sharing, so Drive's own preview only works for somebody already signed
  // in with folder access — a small set, and not the engineers.
  eq('the report is fetched through the bridge before Drive is tried',
    /fetchAppDocumentBlob\(fileId\)/.test(prev)
    && /setMode\(driveSrc \? 'drive' : 'plain'\)/.test(prev), true);
  // A blob URL is a live handle into this tab's memory.
  eq('...and the blob is released when the viewer closes',
    /URL\.revokeObjectURL\(made\)/.test(prev), true);
  // Paying the transfer twice for the same report is the part that WAS fixable.
  // Revoking an object URL does not touch the Blob it came from, so a cached
  // document survives the viewer closing.
  eq('a report already fetched is not fetched again',
    /const docCache = new Map<string, AppDocumentBlob>\(\)/.test(sheets)
    && /if \(hit\) return \{ ok: true, doc: hit, cached: true \}/.test(sheets), true);
  eq('...and the cache is bounded, because each entry is megabytes',
    /DOC_CACHE_MAX = 4/.test(sheets)
    && /docCache\.delete\(oldest\)/.test(sheets), true);
  // Under a policy that blocks link sharing this is the only route to a copy
  // that does not need a Google account.
  eq('...and bytes in hand mean a download is offered',
    /download=\{fileName \|\| 'report'\}/.test(prev), true);
  // Falling back silently would leave "it showed something else" as the only
  // report anybody could make.
  eq('the fallback says why it fell back',
    /Showing Drive’s own preview — \{why\}/.test(prev), true);

  // THE ONE GUARD THAT MUST NOT BE RELAXED. Without it the action is a reader
  // for the whole of the deploying account's Drive, not the service reports it
  // exists to show.
  eq('the bridge serves ONLY files in the app’s own folders',
    /if \(!_isAppDocument\(file\)\) return \{ ok: false, error: 'not a document this app uploaded' \};/.test(gs)
    && /function _isAppDocument\(file\)/.test(gs)
    && /file\.getParents\(\)/.test(gs), true);
  // A name can be anything; the folder is what says the app put it there.
  eq('...checked by PARENT, never by name',
    !/_isAppDocument[\s\S]{0,400}getName\(\)/.test(gs), true);
  // The upload cap, mirrored — an unbounded read is a way to hang the bridge.
  eq('...and a size ceiling, so a huge file is refused rather than attempted',
    /DRIVE_SERVE_MAX_BYTES/.test(gs) && /too large to show here/.test(gs), true);
}

console.log('\n-- Not Consumed Against this Call --');
{
  const view = readFileSync('supabase/migrations/0147_unused_spare_report.sql', 'utf8');
  const scr  = readFileSync('src/modules/UnusedSpareReport.tsx', 'utf8');
  const assoc = readFileSync('src/modules/CallAssociations.tsx', 'utf8');

  // WHAT IT DOES NOT SAY is the whole value. A flag that fires on a refused
  // request sends somebody to look for a part that was never in the van, and
  // after two of those nobody reads the report again.
  // TWO FINDINGS, and quantities on both sides. Presence alone missed "2 sent,
  // 1 used" entirely.
  eq('a shortfall is a finding, not just a total absence',
    /coalesce\(b\.qty_used, 0\) < s\.qty_sent/.test(view)
    && /then 'Not used' else 'Short' end/.test(view), true);
  // A part sent twice on one call and booked once would otherwise flag BOTH
  // lines as short — the false finding that makes this an aggregate report.
  eq('...summed per call and part, never compared line by line',
    /sent_total as \(/.test(view)
    && /group by ucn, part_code/.test(view), true);
  eq('the call flags a shortfall too, and says which',
    /Short \{gap\.sent - gap\.used\} of \{gap\.sent\}/.test(assoc), true);

  // NOT UNTIL THE CALL IS SOLVED. While it is open the part is legitimately
  // still in the van, and a report that cries wolf on live work is one people
  // learn to close. The view and the call draw the same line.
  eq('an open call is not a finding',
    /c\.open_state = 'Solved'/.test(view)
    && /if \(!solved\) return out;/.test(assoc), true);

  eq('only lines that actually arrived are flagged',
    /l\.received_at is not null or coalesce\(l\.stores_status, ''\) ilike '%dispatch%'/.test(view)
    && /not ilike '%drop%'/.test(view)
    && /coalesce\(l\.rm_approval, ''\)\s+!~\* 'reject'/.test(view), true);
  // Both sides store CODE|Description and the description drifts.
  eq('...matched on the part CODE, not the description',
    /split_part\(l\.part, '\|', 1\)/.test(view)
    && /split_part\(c\.part, '\|', 1\)/.test(view), true);
  // dispatched_qty defaults to 0, not null — a plain coalesce reported every
  // line as "0 sent", which the test suite caught on its first run.
  eq('...and the quantity sent is the real one',
    /coalesce\(nullif\(l\.dispatched_qty, 0\), l\.qty\)/.test(view), true);
  eq('the report reads as the reader',
    /alter view public\.unused_spare_report set \(security_invoker = on\)/.test(view), true);

  // The register pages, so a browser-side filter reports on the first page and
  // calls it the answer — the same rule the consumption report follows.
  eq('the filter runs in the database and the count is exact',
    /countUnusedSpares\(filter\)/.test(scr) && /listUnusedSpares\(filter/.test(scr), true);
  eq('...and the file carries its own scope',
    /describeUnusedFilter\(filter\)/.test(scr) && /name: 'About'/.test(scr), true);

  // A DRAWER IS READ, NOT SCANNED. The mini-table styling clips every cell to
  // one ellipsised line, which is right where ten visits have to fit and wrong
  // in the detail drawer — it turned the two fields somebody opens it FOR, Job
  // Done and the Complaint Observation, into "…calibration d…".
  const detail = readFileSync('src/modules/ReportDetail.tsx', 'utf8');
  const fcss = readFileSync('src/modules/fieldcalls.css', 'utf8');
  eq('the report drawer wraps its values instead of clipping them',
    /assoc-table assoc-read/.test(detail)
    && /\.assoc-table\.assoc-read td \{[^}]*white-space: pre-wrap/.test(fcss), true);
  // …while the mini tables keep clipping, which is what makes them scannable.
  eq('...and the mini tables still clip, because they are scanned',
    /\.assoc-table th, \.assoc-table td \{[\s\S]{0,120}white-space: nowrap/.test(fcss), true);
  // It was rendered as its raw Drive URL: too long to read and not clickable.
  // A 90-CHARACTER URL AS TEXT made every row of the register four times taller
  // than it needed to be and still could not be clicked. The register's own
  // rules apply: a cell is one line, and what you do with the thing in it is a
  // control. Both keys, because the value is on the row twice — the column and
  // the report form's own field.
  const reg = readFileSync('src/modules/Reports.tsx', 'utf8');
  eq('the register shows the report as a control, not its address',
    /const reportCell = \(r: Row\)/.test(reg)
    && /Open in Drive ↗/.test(reg)
    && /REPORT_KEYS = \['manual_report', 'Manual Report'\]/.test(reg), true);
  eq('...and opening it does not also open the row',
    /onClick=\{\(e\) => \{ e\.stopPropagation\(\); setDocFor\(r\); \}\}/.test(reg), true);

  eq('the manual report in the drawer opens the viewer',
    /isManualReport\(k\) && reportUrl/.test(detail)
    && /<DocPreview/.test(detail), true);

  // The OR number is what Stores, the paperwork and the customer all say. It is
  // `or_no`; the detail pane had asked for `or_number` since it was written, so
  // it rendered blank.
  // NOTHING THAT NEVER ARRIVED, on the call or in the report. A line that reads
  // like a part is a part somebody will go looking for in the machine.
  eq('the call lists neither rejected nor dropped spares',
    /stage !== 'Rejected' && stage !== 'Dropped'/.test(assoc), true);

  eq('the call shows the OR number, by its real column name',
    /\{ key: 'or_no', label: 'OR No' \}/.test(assoc)
    && !/or_number/.test(assoc), true);
}

console.log('\n-- call aging, and where the clock stops --');
{
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));

  // An OPEN call ages against today.
  eq('an open call counts to today',
    callAging({ regDate: daysAgo(10), callState: 'Unattended' }).days, 10);
  eq('...and says it has not stopped',
    callAging({ regDate: daysAgo(10), callState: 'Unsolved' }).stopped, false);

  // THE COUNTER STOPS ONCE THE CALL IS SOLVED (the user, 2026-09-08). It stops
  // on the VISIT that closed it, not on today and not on the day the report was
  // typed up — the same rule the objectives use, so a call that took nine days
  // reads as nine on both screens.
  const solved = callAging({ regDate: daysAgo(30), callState: 'Solved', lastVisitAt: daysAgo(21) });
  eq('a solved call stops at the closing visit', solved.days, 9);
  eq('...and is marked stopped', solved.stopped, true);
  eq('...and does not drift with today',
    callAging({ regDate: '2026-01-01', callState: 'Solved', lastVisitAt: '2026-01-10' }).days, 9);

  // A missing keystroke should not age a finished call forever.
  eq('a solved call with no visit date stops rather than running on',
    callAging({ regDate: daysAgo(40), callState: 'Solved' }).days, 0);

  // Cancelled is the same case for the same reason: nobody is waiting.
  eq('a cancelled call stops on its cancellation',
    callAging({ regDate: daysAgo(20), callState: 'Cancelled', cancelledAt: daysAgo(14) }).days, 6);

  // A re-opened call is open again, and counts from the ORIGINAL registration:
  // the customer has been waiting since the day they first called.
  eq('a re-opened call ages again, from the original registration',
    callAging({ regDate: daysAgo(12), callState: 'Reopened', lastVisitAt: daysAgo(5) }).days, 12);

  eq('no registration date is no age, not zero',
    callAging({ regDate: '', callState: 'Unattended' }).days, null);

  // A STOPPED CLOCK IS NEVER COLOURED — the call is finished, and colouring a
  // finished thing red says something is wrong when nothing is. The thresholds
  // are the SLA's own shape: 3 days to attend on every row of ANNEXURE A, 15 as
  // its longest completion target.
  eq('a finished call is not coloured',
    agingTone(callAging({ regDate: daysAgo(90), callState: 'Solved', lastVisitAt: daysAgo(2) })), 'none');
  eq('an open call past the attending target warns',
    agingTone(callAging({ regDate: daysAgo(9), callState: 'Unsolved' })), 'warn');
  eq('...and past the longest completion target it is late',
    agingTone(callAging({ regDate: daysAgo(40), callState: 'Unsolved' })), 'late');

  // The value rides on the ROW so the column sorts numerically — rendered text
  // would put "10 d" before "9 d" on a register people scan for the oldest.
  const sb = readFileSync('src/lib/supabase.ts', 'utf8');
  eq('the age is on the row, so the column sorts as a number',
    /out\.agingDays = age\.days;/.test(sb), true);
}

console.log('\n-- every page in the menu has a permission --');
{
  const lay = readFileSync('src/components/layout/Layout.tsx', 'utf8');
  const paths = new Set(MODULES.map((m) => m.path));

  // A PAGE WITH NO KEY CANNOT BE GRANTED, WITHHELD OR SEEN on Roles &
  // Permissions. Two shipped that way — PM Bulk Upload and Software Validation
  // — and neither was noticeable, because an admin-only item is gated on
  // `manage-users` and appears for an administrator regardless. Found by
  // comparing the two lists rather than by reading either, which is what this
  // does on every run.
  const navItems = [...lay.matchAll(/\{ to: '([^']+)'[^}]*\}/g)].map((m) => m[0]);
  const unkeyed = navItems
    .filter((s) => !/alwaysOpen/.test(s))          // help pages are deliberately open to all
    .map((s) => ({
      to: (/to: '([^']+)'/.exec(s) ?? [])[1] ?? '',
      perm: (/perm: '([^']+)'/.exec(s) ?? [])[1] ?? '',
    }))
    .filter((x) => !paths.has(x.perm ? x.perm.replace('mod:', '') : x.to))
    .map((x) => x.to);
  eq('every RBAC-gated menu item is a module', unkeyed, []);

  // The matrix is read next to the menu, so its headers follow the menu's.
  const rb = readFileSync('src/lib/rbac.ts', 'utf8');
  eq('Reports is a header in the matrix, as it is in the menu',
    /\{ title: 'Reports', pages: \[/.test(rb), true);
}

console.log('\n-- the Standard Complaint is searched, not scrolled --');
{
  const rq = readFileSync('src/modules/RequestCallRegistration.tsx', 'utf8');

  // FIVE HUNDRED ENTRIES BEHIND A NATIVE DROPDOWN is a scrollbar and nothing
  // else. The PickList is also the control that cannot select by keystroke, so
  // going back to a <select> would return both faults at once.
  eq('the request form picks the complaint with a PickList',
    /<PickList[\s\S]{0,400}standardComplaint/.test(rq), true);
  eq('...and no native <option> list is left over the master',
    /complaintMaster\.values\.map\(\(v\) => <option/.test(rq), false);

  // The row's own value survives a master that no longer lists it.
  eq('a complaint off the master is still offered',
    /withCurrent\(complaintMaster\.values, it\.standardComplaint\)/.test(rq), true);

  // SERIAL TOO (2026-09-09), and since 2026-09-11 the serial is the MACHINE
  // PICKER: it searches across every customer and fetches the customer with the
  // machine. A hospital can own dozens of the same model whose serials differ by
  // a digit in the middle, so it still has to be type-to-search.
  eq('the serial is picked with a PickList that searches the server',
    /<PickList[\s\S]{0,900}onSearch=\{async \(qq\) => \{[\s\S]{0,400}sbSearchMachines/.test(rq), true);
  eq('...and no native <option> list is left over the serials',
    /\{serials\.map\(\(v\) => <option/.test(rq), false);
  eq('a serial the list no longer offers is still shown',
    /withCurrent\(hitsFor\(i\)\.map\(\(m: MachineHit\) => m\.serial\), it\.serial\)/.test(rq), true);

  // THE EMPTY BOX AND THE ROWS ARE STILL DOING WORK, and they have to say
  // DIFFERENT things now: the list spans customers, so a row must show WHOSE
  // machine it is before somebody picks it — two hospitals own the same model
  // and the serial is all that tells them apart. And a machine already on the
  // request is shown, disabled, with the reason, rather than vanishing and
  // sending somebody hunting for it.
  eq('each row names the customer and city',
    /\$\{m\.serial\} · \$\{m\.party\}/.test(rq), true);
  eq('a machine already on the request says so rather than disappearing',
    /already on this request/.test(rq) && /isDisabled=\{taken\}/.test(rq), true);
  for (const phrase of ['type a serial to find the machine',
                        'across every customer', 'Pick a product above to narrow it']) {
    eq(`the serial box says "${phrase}"`, rq.includes(phrase), true);
  }
  const pl = readFileSync('src/components/ui/PickList.tsx', 'utf8');
  eq('...and PickList shows it rather than a generic label',
    /: emptyLabel\}/.test(pl), true);
}

console.log('\n-- Reports: access one report at a time --');
{
  const lay = readFileSync('src/components/layout/Layout.tsx', 'utf8');
  const hub = readFileSync('src/modules/ReportsHub.tsx', 'utf8');
  const paths = new Set(MODULES.map((m) => m.path));

  // EVERY report, not the three that were here first. A report added to the hub
  // without its own module key is one nobody can be given or refused
  // separately — the whole point of the per-report keys.
  for (const k of ['consumption', 'kpi', 'unused', 'calls', 'feedback']) {
    eq(`/exports/${k} is a module of its own`, paths.has(`/exports/${k}`), true);
    eq(`...and the menu asks for that key, not the parent`,
      new RegExp(`to: '/exports/${k}'[^}]*perm: 'mod:/exports/${k}'`).test(lay), true);
    // It must INHERIT, or every role that could open Reports loses it the day
    // this ships and a migration is needed to give back what nobody removed.
    eq(`...and it falls back to mod:/exports`, parentAction(`mod:/exports/${k}`), 'mod:/exports');
  }

  // A hidden tab that still opens when somebody pastes the link is not a
  // permission, it is a suggestion. The strip and the URL are both checked.
  eq('the tab strip renders only the permitted reports', /\{allowed\.map\(\(r\) => \(/.test(hub), true);
  eq('...and a link to a report the role may not open is redirected',
    /if \(!asked \|\| !permitted\) navigate/.test(hub), true);

  // ONE SCREEN, THREE REPORTS. "Follow the Same concept of Consumption Report"
  // is four properties — the filter runs in the DATABASE, the mandatory columns
  // are shown ticked and locked, the column ORDER is the view's, and the file
  // carries its own scope — and three copies of that would be three chances to
  // lose one of them quietly.
  {
    const rb = readFileSync('src/modules/ReportBuilder.tsx', 'utf8');
    for (const m of ['CallReport', 'FeedbackReport', 'ConsumptionReport']) {
      const src = readFileSync(`src/modules/${m}.tsx`, 'utf8');
      eq(`${m} is built by the shared builder`, /<ReportBuilder spec=\{spec\} \/>/.test(src), true);
    }
    // The filter must reach the database, or it narrows only what was already
    // fetched — and these registers page, so it would report on the first
    // thousand rows and call it the answer.
    eq('the count comes from the database, not the page', /spec\.count\(filter\)/.test(rb), true);
    eq('...and the rows are paged until the register is exhausted',
      /if \(rows\.length < page\) return out;/.test(readFileSync('src/lib/supabase.ts', 'utf8')), true);
    // Shown, ticked, DISABLED — a column absent from a picker reads as an
    // oversight; one visibly locked reads as a rule.
    eq('the mandatory columns are shown and locked',
      /\{spec\.mandatory\.map\(\(c\) => \([\s\S]{0,260}checked disabled readOnly/.test(rb), true);
    // A file whose columns move between downloads is one nobody can build a
    // formula against.
    eq('the column order is the view\'s, not the click order',
      /\.\.\.CALL_REPORT_MANDATORY,\s*\n\s*\.\.\.CALL_REPORT_OPTIONAL\.filter/.test(
        readFileSync('src/lib/reports.ts', 'utf8')), true);
    // The scope travels WITH the file: these exist to be sent to people who
    // were not there when they were made.
    eq('the workbook carries its own scope',
      /name: 'Filter'/.test(rb) && /Item: 'Filter applied', Value: spec\.describe\(filter\)/.test(rb)
      && /Item: 'One row is', Value: spec\.rowMeaning/.test(rb), true);
    // Switching report must not carry a filter across — a date typed for calls
    // silently applied to feedback is a wrong file that looks right.
    eq('...and switching report starts from a clean filter',
      /setFilter\(spec\.emptyFilter\); setPicked\(new Set\(spec\.defaults \?\? \[\]\)\)/.test(rb), true);

    // DEFAULT-ON COLUMNS (the user, 2026-09-18: "Add Default Columns - Line ID,
    // Source Ref Key, Created At"). A third state between mandatory and
    // optional: ticked to start with, and still removable — which is why they
    // are NOT in the mandatory list, where they would be shown locked.
    eq('the picker starts from the spec\'s default columns',
      /useState<Set<string>>\(\(\) => new Set\(spec\.defaults \?\? \[\]\)\)/.test(rb), true);
    eq('...and the consumption report names its three',
      /defaults: CONSUMPTION_DEFAULT_ON/.test(readFileSync('src/modules/ConsumptionReport.tsx', 'utf8')), true);
    {
      // A DEFAULT THAT IS NOT OPTIONAL IS TICKED AND THEN DROPPED, because the
      // file is built from the OPTIONAL list (`exportColumns`) and not from
      // whatever happens to be ticked. Nothing would error: the reader sees the
      // tick, the column is missing from the workbook, and the only way to find
      // out is to open the file and count. `check:reports` holds this too,
      // against a database; it is here as well so `npm run build`'s own checks
      // catch it with no Postgres to hand.
      const rep = readFileSync('src/lib/reports.ts', 'utf8');
      const listOf = (name: string) => (rep.match(
        new RegExp(`export const ${name}: string\\[\\] = \\[([\\s\\S]*?)\\n\\];`)) ?? ['', ''])[1]
        .split('\n').map((l) => l.replace(/\/\/.*$/, '').trim())
        .map((l) => (l.match(/^'((?:[^'\\]|\\.)*)',?$/) ?? [])[1])
        .filter((v): v is string => v !== undefined);
      const defaults = listOf('CONSUMPTION_DEFAULT_ON');
      const optional = listOf('CONSUMPTION_OPTIONAL');
      eq('the three default columns are read back from the file',
        defaults, ['Line ID', 'Source Ref Key', 'Created At']);
      eq('...and every default is an OPTIONAL column, or it would never reach the file',
        defaults.filter((c) => !optional.includes(c)), []);
      // The column added for the user on 2026-09-18 and offered to nobody for a
      // day: it was in the view and in neither list, so the picker could not
      // show it and `exportColumns` could not emit it. `check:reports` is the
      // one that asks a DATABASE for the whole set; this names the one that got
      // away, so it cannot get away the same way twice.
      eq('...and Visit UID is offered at all', optional.includes('Visit UID'), true);
    }

    // THE BULK LOAD FILES THE VISIT BEFORE THE SPARES (0214 + the prepare step).
    // The planner is in `uploads.ts` rather than `supabase.ts` for the
    // `paging.ts` reason -- that module reads `import.meta.env`, so no node
    // script can import it and nothing in it can be tested as behaviour.
    {
      const sb = readFileSync('src/lib/supabase.ts', 'utf8');
      eq('the consumption upload files its visits through the tested planner',
        /planConsumptionVisits\(rows, have\)/.test(sb), true);
      eq('...and supabase.ts does not decide any of it itself',
        /IMP-\$\{ucn\}/.test(sb), false);
      eq('...the register asks for the step',
        /prepare: 'consumption-visits'/.test(readFileSync('src/lib/uploads.ts', 'utf8')), true);
    }

    // THE FEEDBACK REPORT'S DATE IS THE FEEDBACK'S OWN (0190), never the day
    // the row was loaded — on a migrated row the two differ by up to two years.
    const sb = readFileSync('src/lib/supabase.ts', 'utf8');
    const fq = sb.split('function feedbackReportQuery')[1]?.split('export async function countFeedbackReport')[0] ?? '';
    eq('the feedback report filters on the feedback\'s own date',
      /q\.gte\('Date', f\.from\)/.test(fq) && /Loaded On/.test(code(fq)) === false, true);
    // A blank on a question means it was not ASKED of that kind of visit. A
    // reader sorting a spreadsheet cannot tell that from a missing answer
    // unless the file says so.
    eq('...and the file says a blank is not a missing answer',
      /A BLANK IS NOT A MISSING ANSWER/.test(readFileSync('src/modules/FeedbackReport.tsx', 'utf8')), true);
    // One row per CALL, never per visit — the thing a reader most often
    // assumes wrongly about a call report.
    eq('the call report says one row is one call',
      /One row per CALL — not per visit/.test(readFileSync('src/modules/CallReport.tsx', 'utf8')), true);
  }
}

console.log('\n-- Part Master upload: the category is normalised, not rejected --');
{
  const parts = UPLOADS.find((u) => u.key === 'parts')!;
  const shape = (v: string) => {
    const out = shapeUpload(parts, [{
      'Item Code': 'X1', 'Item Details': 'X1|Widget', 'Item Name': 'Widget', 'Spare / Consumable': v,
    }]);
    if (!out.rows.length) return '<row skipped>';
    // A key that is ABSENT is not the same as one written empty: the upsert
    // leaves the column alone, so re-loading a file whose category column is
    // blank cannot wipe a category somebody set by hand on Part Master.
    return 'category' in out.rows[0] ? String(out.rows[0].category) : '<not written>';
  };

  // THE FILE WRITES IN CAPITALS. Every non-blank row went in raw and the check
  // constraint refused it 173 rows into a 1,324-row load. The normaliser was
  // there; it ran only where the cell was EMPTY, so it never saw one of these.
  eq('SPARE', shape('SPARE'), 'Spare');
  eq('CONSUMABLE', shape('CONSUMABLE'), 'Consumable');
  eq('PRODUCT', shape('PRODUCT'), 'Product');
  eq('LABOUR', shape('LABOUR'), 'Labour');
  eq('a plural still lands on the vocabulary', shape('Consumables'), 'Consumable');
  eq('blank writes nothing, so a hand-set category survives a re-upload', shape(''), '<not written>');
  // A word the vocabulary does not know is KEPT, not dropped: it shows up in
  // Spare Insights as its own bar, which is how somebody notices it. Safe
  // because 0152 took the check constraint off.
  eq('an unknown word survives, title-cased', shape('ACCESSORY'), 'Accessory');
}

console.log('\n-- Frequent Failure: the rule the procedure states --');
{
  const dccr = readFileSync('src/modules/DailyCallReview.tsx', 'utf8');
  const sb = readFileSync('src/lib/supabase.ts', 'utf8');

  // THE VERDICT IS THE DATABASE'S. The old shape returned rows and left the
  // screen to apply the threshold, which is how the count came to be read one
  // short of what the procedure counts.
  eq('the screen asks for the verdict, not just the rows',
    /rpc\('frequent_failure', \{ p_ucn: ucn \}\)/.test(sb), true);
  eq('...and the old rows-only call is gone', /frequent_failure_history/.test(sb), false);

  // The number on screen must be the one the rule uses. "1 earlier failure"
  // beside a rule that says "2 or more" produces a wrong answer from a reader
  // who has made no mistake.
  eq('the count shown includes the call under review',
    /<b>\{history\.total\}<\/b>/.test(dccr), true);

  // "Cannot tell" and "no history" are different things to record a judgement
  // on, and only one of them should ever read as a clean bill of health.
  eq('a machine with no serial says so instead of "no earlier failure"',
    /!history\.known/.test(dccr), true);
  eq('...and the no-serial wording does not claim there was no failure',
    /cannot be identified/.test(dccr), true);

  // A call caught by the same-part path is not one a reviewer would find by
  // looking for the same complaint, so the row says which rule caught it.
  eq('each earlier call says why it matched', /\{h\.match_on\}/.test(dccr), true);
  // An administrator can move the window, so a verdict read months later has
  // to carry the rule that produced it.
  eq('the rule in force is on the screen with the verdict',
    /threshold is \{history\.threshold\}/.test(dccr), true);
}

console.log('\n-- Spare Request and Consumption pick the part the same way --');
{
  const sr = readFileSync('src/modules/SpareRequests.tsx', 'utf8');
  const sc = readFileSync('src/modules/SpareConsumption.tsx', 'utf8');
  const pl = readFileSync('src/components/ui/PickList.tsx', 'utf8');

  eq('the request picks its part with a PickList',
    /<PickList[\s\S]{0,400}setSpare\(i, 'spare', v\)/.test(sr), true);
  eq('...and the 2,000-entry datalist is gone', /dl-spares/.test(sr), false);
  eq('a part off the master is still offered',
    /withCurrent\(spareMaster\.values, s\.spare\)/.test(sr), true);
  // NO FREE-TEXT FALLBACK HERE (the user, 2026-09-09), unlike the call
  // request's complaint field: a complaint typed by hand still reads as a
  // fault, but a PART typed by hand is a code that dispatch, hand stock and
  // consumption will all fail to match. An empty master disables the box and
  // says which — loading, or genuinely empty.
  eq('there is no free-text box for the part',
    /className="input spare-part"/.test(sr), false);
  eq('an empty master disables the picker instead',
    /disabled=\{!spareMaster\.values\.length\}/.test(sr), true);
  eq('...and says whether it is loading or empty',
    /no parts in the master/.test(sr) && /loading parts/.test(sr), true);

  eq('consumption picks its part with a PickList',
    /<PickList[\s\S]{0,600}setLine\(i, 'part', v\)/.test(sc), true);
  eq('...and no native <option> list is left over the stock',
    /\{stock\.map\(\(r\) => \(\s*<option/.test(sc), false);
  // THE NUMBER THAT DECIDES WHETHER THE LINE CAN BE BOOKED AT ALL. A trigger
  // caps consumption at the balance, so a picker that dropped "in hand" would
  // send people to a refusal they could have seen coming.
  eq('every row still shows what is in hand', /in hand/.test(sc), true);
  eq('...and the picker can render a label without storing it',
    /labelFor\?\.\(o\) \?\? o/.test(pl), true);
  // Display only: what is stored must stay the part, never the decorated
  // string, or every downstream match on the CODE breaks.
  eq('the search still matches the value, not the label',
    /options\.filter\(\(o\) => o\.toLowerCase\(\)\.includes\(q\)\)/.test(pl), true);
}

console.log('\n-- every SQL bundle named in the docs actually exists there --');
{
  // THE LINK IS THE DELIVERABLE. Applying SQL is the user's step and the
  // standing rule is to hand over the link, not the file name — so a link to a
  // path that does not exist wastes the one action being asked for. It has
  // happened once: `Spare_1.sql` and `HandStock_X.sql` are written to the
  // REPOSITORY ROOT, not `supabase/apply/`, being the two numbered consolidated
  // files handed round, and both were linked under supabase/apply/ and 404'd.
  const texts: [string, string][] = [
    ['docs/BACKLOG.md', readFileSync('docs/BACKLOG.md', 'utf8')],
    ['src/lib/changelog.ts', readFileSync('src/lib/changelog.ts', 'utf8')],
  ];
  const missing: string[] = [];
  for (const [where, text] of texts) {
    // Paths as they appear in a raw/blob URL after the branch, and bare
    // `supabase/apply/x.sql` mentions in prose.
    const paths = new Set<string>();
    for (const m of text.matchAll(/(?:RITHI_CRM\/(?:blob|main)\/main\/|RITHI_CRM\/main\/)([A-Za-z0-9_./-]+\.sql)/g)) paths.add(m[1]);
    for (const m of text.matchAll(/(?<![\w/])(supabase\/apply\/[A-Za-z0-9_.-]+\.sql)/g)) paths.add(m[1]);
    for (const p of paths) if (!existsSync(p)) missing.push(`${where} → ${p}`);
  }
  eq('no doc links to a bundle that is not there', missing, []);
}

console.log('\n-- spare_pending_rm: one definition, in two places, never dropped --');
{
  const a = readFileSync('supabase/migrations/0116_spare_bulk_approval.sql', 'utf8');
  const b = readFileSync('supabase/migrations/0154_rm_queue_request_fields.sql', 'utf8');
  const body = (src: string) => {
    const i = src.indexOf('create or replace view public.spare_pending_rm as');
    const j = src.indexOf(';', i);
    return src.slice(i, j).replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  };

  // NEVER DROPPED, on either. `drop view` takes an AccessExclusiveLock and has
  // to wait out every reader, which deadlocked against the running app the day
  // it shipped; outside a transaction it also leaves a window where the view is
  // gone and app queries fail outright. Both carry the full column list
  // instead, so `create or replace` only ever appends.
  for (const [name, src] of [['0116', a], ['0154', b]] as const) {
    eq(`${name} does not drop the view`, /drop view[^\n]*spare_pending_rm/i.test(src), false);
  }
  // And the copies must stay copies, or a replay silently narrows the view.
  eq('0116 and 0154 define it identically', body(a) === body(b), true);
  eq('...and that definition carries the complaint', /as complaint/.test(body(a)), true);
}

console.log('\n-- renewing a contract: the dates continue, they do not overlap --');
{
  // NO GAP AND NO OVERLAP. `machine_cover` answers "what is this serial under
  // today?", and two contracts covering one day makes that ambiguous — so a
  // renewal starts the day AFTER the old one ends, and a period ends the day
  // BEFORE the anniversary.
  eq('the renewal starts the day after the old contract ends',
    dayAfter('2027-03-31'), '2027-04-01');
  eq('...across a year boundary', dayAfter('2026-12-31'), '2027-01-01');
  eq('...and a leap day is a real day', dayAfter('2028-02-28'), '2028-02-29');
  eq('a bad date proposes nothing rather than guessing', dayAfter(''), '');

  eq('a one-year contract ends the day before its anniversary',
    addPeriod('2026-04-01', 1, 0), '2027-03-31');
  eq('...so renewing it lands exactly on the next day',
    dayAfter(addPeriod('2026-04-01', 1, 0)), '2027-04-01');
  eq('months work the same way', addPeriod('2026-04-01', 0, 6), '2026-09-30');
  eq('years and months combine', addPeriod('2026-04-01', 1, 6), '2027-09-30');
  // No period is not a zero-day contract; it is an unknown end date.
  eq('no period gives no end date, not the start date', addPeriod('2026-04-01', 0, 0), '');

  // THE MONEY MUST NOT BE CARRIED FROM THE OLD CONTRACT — which is a different
  // statement from "the renewal writes no money", and the difference is the
  // whole of the price-revision feature (2026-09-16).
  //
  // The first version of this check asserted that `rate:` never appears in
  // `renewContract` at all. That was right while the flow could not price
  // anything, and it would have been WRONG the moment it could: it forbids the
  // feature rather than the hazard. The hazard is reading the money off `it` —
  // the machine on the EXPIRING contract — because that is last year's price
  // arriving unannounced in this year's record.
  const cov = readFileSync('src/lib/cover.ts', 'utf8');
  const renew = cov.slice(cov.indexOf('export async function renewContract'));
  for (const money of ['rate', 'item_tax_amount', 'total_after_tax']) {
    // `it` is the old machine row; `from` is the old header. Neither may supply
    // a price.
    eq(`a renewal does not copy ${money} off the old contract`,
      new RegExp(`\\b(it|from)\\.${money}\\b`).test(renew), false);
  }
  // It writes money only from the DRAFT, and derives tax and total through the
  // one pricing rule rather than restating 18% here.
  eq('the new rate comes from the renewal draft', /rateFor\(/.test(renew), true);
  eq('...and tax and total are derived, not re-invented',
    /itemTaxAmount\(rate\)/.test(renew) && /totalAfterTax\(rate\)/.test(renew), true);
  eq('...with GST stated in exactly one place',
    /GST_PERCENT/.test(readFileSync('src/lib/coverspec.ts', 'utf8'))
      && !/\b18\b/.test(code(renew)), true);
  // A blank rate still means "price it later" — the default the flow had before
  // it could price anything, and the one every box starts in.
  eq('a machine with no rate is written blank, not zero',
    /rate: null, item_tax_amount: null, total_after_tax: null/.test(renew), true);
  // ---- ONE PERIOD, NOT TWO ADDED TOGETHER --------------------------------
  // Found 2026-09-16 with a realistic fixture: a contract states its period
  // TWICE (years = months / 12), and the renewal read both and added them. A
  // one-year contract proposed a TWO-year renewal; a two-year one, four. That
  // is a service contract covering twice what anybody agreed, and it feeds
  // `machine_cover` — "what is this serial under today?".
  eq('a 12-month contract is twelve months, not twenty-four', periodToMonths(1, 12), 12);
  eq('...and a 24-month one is not forty-eight', periodToMonths(2, 24), 24);
  // Months wins because months is what the form drives from.
  eq('months wins when the two disagree', periodToMonths(1, 18), 18);
  // ...but years alone must still mean something, or an old row loses its period.
  eq('years alone is still a period', periodToMonths(3, null), 36);
  eq('neither is no period', periodToMonths(null, null), null);
  // Zero months is a real stored value and not a missing one.
  eq('zero months is zero, not a fallback to years', periodToMonths(1, 0), 0);
  // And the end date that follows from it.
  eq('a one-year renewal ends a year out, not two',
    addPeriod('2026-04-01', 0, periodToMonths(1, 12) ?? 0), '2027-03-31');

  // ---- revising the rate at renewal, as arithmetic -----------------------
  // The user, 2026-09-16: "I will need provision to revise the price."
  eq('a 10% uplift on 1,000 is 1,100', upliftRate(1000, 10), 1100);
  eq('...and on 12,500 is 13,750', upliftRate(12500, 10), 13750);
  // 0 IS AN ANSWER, not a missing one: holding last year's price is a decision
  // somebody makes, and it must survive the falsy check that eats it.
  eq('0% holds the price rather than clearing it', upliftRate(1000, 0), 1000);
  // A REDUCTION IS LEGITIMATE. Renewals go down as well as up, and a rule that
  // only adds quietly refuses half of what it is for.
  eq('a negative percentage reduces', upliftRate(1000, -10), 900);
  // NO OLD RATE IS NOT A RATE OF ZERO. "We do not know what this was on" and
  // "it was free" are different facts; writing 0 asserts the false one.
  eq('no old rate gives nothing, not zero', upliftRate(null, 10), null);
  eq('...an empty string likewise', upliftRate('', 10), null);
  eq('...and no percentage gives nothing', upliftRate(1000, null), null);
  // FLOATING POINT REACHES AN INVOICE. 7% of 1000 is 1070, not
  // 1070.0000000000001, and the difference shows up in a box somebody signs.
  eq('the result is rounded to paise', upliftRate(1000, 7), 1070);
  eq('...and keeps real paise', upliftRate(1234.5, 7.5), 1327.09);
  // The panel previews the total through the same two functions that write it.
  eq('tax is 18% of the revised rate', itemTaxAmount(1100), 198);
  eq('...and the total is rate plus tax', totalAfterTax(1100), 1298);

  // ...and the link back must be written, or "what was this machine on before?"
  // has no answer.
  eq('the new contract points back at the old one', /prev_mc_number:/.test(renew), true);
  eq('...and each machine carries its own history', /last_contract_number:/.test(renew), true);
}

console.log('\n-- who sees every record: the client copy matches the SQL --');
{
  // A SECOND COPY OF A RULE GOES STALE — and this list already had two copies
  // in the client before a third was added on top of them on 2026-09-18.
  // SEE_ALL_ROLES is the one; everything else must go through it.
  const sql = readFileSync('supabase/migrations/0035_data_view_all.sql', 'utf8');
  const m = sql.match(/lower\(coalesce\(p\.role, ''\)\) in\s*\(([^)]*)\)/);
  eq('0035 still states the office roles in one place', !!m, true);
  const inSql = (m ? m[1] : '').match(/'([a-z_]+)'/g)?.map((x) => x.replace(/'/g, '')).sort() ?? [];
  const ts = readFileSync('src/lib/rbac.ts', 'utf8');
  const t = ts.match(/SEE_ALL_ROLES = new Set\(\[([\s\S]*?)\]\)/);
  const inTs = (t ? t[1] : '').match(/'([a-z_]+)'/g)?.map((x) => x.replace(/'/g, '')).sort() ?? [];
  eq('...and the client lists exactly the same roles', inTs, inSql);
  eq('...which is six of them', inSql.length, 6);
  eq('stores_incharge is one of them', inSql.includes('stores_incharge'), true);
  // ONE list in the client, not two. A duplicate was added and removed the
  // same day; this is what stops the third. It counts the six-role SEQUENCE —
  // counting the word 'spare_coordinator' instead failed on correct code,
  // because that name also appears as a role definition and in DEFAULT_PERMS.
  const seq = /'hotline',\s*'nsm',\s*'commercial',\s*'spare_coordinator',\s*'stores_incharge',\s*'tally_coordinator'/g;
  eq('the client states those six roles in exactly one place',
    (code(ts).match(seq) ?? []).length, 1);
}

console.log('\n-- the scope test reads rbacRole, never the coarse role --');
{
  // `User` carries TWO role fields and only `rbacRole` is the RBAC key:
  // `roleFromProfile()` collapses everything that is not admin/rm/rgm/viewer
  // into 'engineer', so a Stores Incharge has `user.role === 'engineer'`.
  // Passing that to a role test type-checks and is wrong for four of the six
  // office roles — which shipped, and told a Stores Incharge his role saw only
  // its own team while the database was showing him everything.
  const rb = code(readFileSync('src/lib/rbac.ts', 'utf8'));
  eq('seesEveryRecord takes the USER, so no call site can pick the wrong field',
    /export function seesEveryRecord\(\s*user:/.test(rb), true);
  eq('...and reads rbacRole', /user\?\.rbacRole/.test(rb), true);
  eq('...and never the coarse one', /user\?\.role\b/.test(rb), false);
  for (const f of readdirSync('src/modules').filter((x) => x.endsWith('.tsx'))) {
    const src = code(readFileSync(`src/modules/${f}`, 'utf8'));
    if (!/seesEveryRecord\(/.test(src)) continue;
    eq(`${f} passes the user, not user.role`,
      /seesEveryRecord\(\s*user\s*,/.test(src) && !/seesEveryRecord\(\s*String\(/.test(src), true);
  }
}

console.log('\n-- the update banner does not offer you the version you have --');
{
  // It compares BUILD IDS and used to print the VERSION, so a deploy that
  // changed no version announced "a newer version (v0.9.293) is out -- this
  // tab is still on v0.9.293".
  const lay = code(readFileSync('src/components/layout/Layout.tsx', 'utf8'));
  eq('the banner checks whether the version actually differs',
    /newBuild !== __APP_VERSION__/.test(lay), true);
  eq('...and says something else when it does not',
    /running an earlier build/.test(lay), true);
}

console.log('\n-- the role list does not promise Super Admin --');
{
  const rb = readFileSync('src/lib/rbac.ts', 'utf8');
  // SUPER ADMIN IS NOT A ROLE. It is a row in `app_super_admins` matched
  // against a hardcoded list in auth.tsx; a migration plus a code change, on
  // purpose. A dropdown labelled "Admin / Super Admin" promised something it
  // could not do, and somebody trying to make a Super Admin found no way to.
  eq('the admin role is labelled Admin, not Admin / Super Admin',
    /\{ key: 'admin', label: 'Admin' \}/.test(rb), true);
  const auth = readFileSync('src/lib/auth.tsx', 'utf8');
  eq('...because the super admins are a fixed list in code', /const SUPER_ADMINS = new Set\(\[/.test(auth), true);
}

console.log('\n-- Zoho Migration is a clone, and stays one --');
{
  const rb = readFileSync('src/lib/rbac.ts', 'utf8');
  eq('the role exists', /\{ key: 'zoho_migration', label: 'Zoho Migration' \}/.test(rb), true);

  // DERIVED, NOT COPIED. A second literal list is a second thing to keep in
  // step, and the two would differ the first time somebody edited one.
  eq('its actions are taken from technical_support, not restated',
    /FUNCTIONAL_DEFAULTS\.zoho_migration = \[\.\.\.FUNCTIONAL_DEFAULTS\.technical_support\]/.test(rb), true);
  eq('...and it sees every module, as asked',
    /SEES_EVERY_MODULE = new Set\(\['admin', 'technical_support', 'zoho_migration'\]\)/.test(rb), true);

  // The clone is only worth anything while it matches. DEFAULT_PERMS is the
  // app-side fallback; this compares the two lists it builds.
  const a = [...(DEFAULT_PERMS.technical_support ?? [])].sort();
  const b = [...(DEFAULT_PERMS.zoho_migration ?? [])].sort();
  eq('the two roles default to exactly the same rights', b, a);

  // READ ONLY, by what it does not hold. Nothing here is hidden from it; the
  // refusal on a write is Postgres's.
  const writes = ['calls.edit', 'calls.create', 'masters.edit', 'users.manage', 'rbac.manage',
                  'spare.dispatch', 'review.edit', 'cover.edit', 'consumption.reconcile'];
  eq('it holds nothing that writes',
    writes.filter((w) => (DEFAULT_PERMS.zoho_migration ?? []).includes(w)), []);
  // ...and the one that makes it useful.
  eq('it can export, which is the job', (DEFAULT_PERMS.zoho_migration ?? []).includes('export.data'), true);
}

console.log('\n-- dropdowns are one control --');
{
  const sp = readFileSync('src/components/ui/SelectPicker.tsx', 'utf8');
  const pl = readFileSync('src/components/ui/PickList.tsx', 'utf8');

  // A SHORT LIST GETS NO SEARCH BOX. "Yes / No" behind a type-to-search field
  // costs a click and a decision to reach two items you could already see —
  // the sweep must not make small dropdowns worse than the ones it replaced.
  // Still true for a DOWNLOADED list; a server-searched one always gets the box,
  // because the rows on screen are a page of results and not the size of the
  // list — suppressing it would hide the only way to reach the rest.
  eq('the search box is suppressed for short lists',
    /searchThreshold = 8/.test(pl)
    && /const searchable = !!onSearch \|\| options\.length >= /.test(pl), true);

  // THE FALLBACK IS THE FORM'S DECISION, off by default (the user's own rule
  // for spare parts: a hand-typed code is one nothing downstream can match).
  eq('free text is opt-in, per form', /allowFreeText = false/.test(pl), true);
  eq('...and the form can turn it on', /allowFreeText\?: boolean/.test(sp), true);

  // A row that shows but cannot be chosen: a spare with nothing left in hand.
  // Hiding it instead would leave somebody hunting for a part that is there.
  eq('an option can be shown without being pickable',
    /isDisabled\?: \(value: string\) => boolean/.test(pl), true);

  // The value stored is never the LABEL, or every downstream match breaks.
  // The PROPERTY: whatever a row reads, `onPick` still returns the VALUE — the
  // label is never what gets stored. Written to tolerate an override in front
  // of the map, which is how a disabled row carries its reason.
  eq('the label is display-only; the value is what is stored',
    /labelFor=\{\(v\) => (?:labelForOption\?\.\(v\) \?\? )?labels\.get\(v\) \?\? v\}/.test(sp)
    && /onPick=\{onChange\}/.test(sp), true);

  // The converted screens, and the ENGINE — which is what makes the rule true
  // in every FieldDef form (Field Call, Installation, PM, Pending
  // Registrations) without touching them one by one.
  for (const f of ['src/modules/CallReporting.tsx', 'src/modules/RequestCallRegistration.tsx',
                   'src/components/form/Form.tsx']) {
    eq(`${f.split('/').pop()} has no native <select> left`,
      /<select/.test(readFileSync(f, 'utf8')), false);
  }

  // THE SWEEP IS FINISHED, so the rule is now absolute rather than a shrinking
  // list of exceptions: NOT ONE native <select> anywhere in src/. A list of
  // "still to convert" was right while the conversion was in flight and is a
  // loophole once it is done.
  //
  // The two component files are allowed to mention it in PROSE — they exist to
  // explain what they replace — so the test looks for the JSX tag, not the word.
  const withSelect: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) { walk(full); continue; }
      if (!e.name.endsWith('.tsx')) continue;
      const src = readFileSync(full, 'utf8');
      // `<select` followed by whitespace, > or a prop — a JSX tag, not the word
      // inside a comment.
      if (/<select[\s>]/.test(src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))) {
        withSelect.push(full.replace('src/', ''));
      }
    }
  };
  walk('src');
  eq('not one native <select> is left in the app', withSelect, []);
}

console.log('\n-- the drawer can be widened, and remembers --');
{
  const ui = readFileSync('src/components/ui/ui.tsx', 'utf8');
  const css = readFileSync('src/components/ui/ui.css', 'utf8');

  eq('there is a grip to drag', /className="drawer-grip"/.test(ui), true);
  // MEASURED FROM THE RIGHT EDGE, because the drawer is pinned there. Anything
  // else and the panel drifts away from the cursor as you drag.
  eq('the width follows the cursor exactly',
    /window\.innerWidth - e\.clientX/.test(ui), true);

  // A REMEMBERED WIDTH MUST NOT OPEN OFF-SCREEN. 1400px saved on a monitor,
  // then opened on a laptop, has to come back inside the window.
  eq('the width is clamped on open and on resize',
    (ui.match(/Math\.min\(Math\.max\(/g) ?? []).length >= 3, true);
  eq('...and never narrower than the head needs', /DRAWER_MIN = 360/.test(ui), true);

  // localStorage throws in a private window and during thumbnail capture, and
  // a drawer that cannot remember its width must still open.
  // Counted on the CALLS, not on the word: the first version of this counted
  // the comments explaining the guard as unguarded uses of it.
  const calls = ui.match(/window\.localStorage\.\w+\(/g) ?? [];
  const guarded = ui.match(/try \{ [^}]*window\.localStorage\.\w+\([^}]*\} catch/g) ?? [];
  eq('every localStorage call is guarded', guarded.length, calls.length);
  eq('...and there is at least one', calls.length > 0, true);

  // Written on RELEASE: a write per mousemove makes localStorage the slow part
  // of the drag.
  eq('the width is saved on release, not on every move',
    /const up = \(\) => \{[\s\S]*?localStorage\.setItem/.test(ui), true);

  // A 2px line nobody can hit is not a handle.
  eq('the hit area is wider than the line it draws',
    /\.drawer-grip \{[\s\S]*?width: 10px;/.test(css) && /\.drawer-grip::after \{[\s\S]*?width: 2px;/.test(css), true);
  // Reachable without a mouse.
  eq('the arrow keys resize it too', /e\.key === 'ArrowLeft'/.test(ui), true);
}

console.log('\n-- super admins: the two lists agree --');
{
  // SUPER ADMIN IS TWO THINGS IN TWO PLACES: `SUPER_ADMINS` in auth.tsx decides
  // what the BROWSER offers, `app_super_admins` decides what POSTGRES allows.
  // Remove an address from one and not the other and you get either an account
  // with real access behind a screen that hides it, or a screen full of buttons
  // the database refuses one by one — which reads as the app being broken
  // rather than as access having been withdrawn. So they are compared.
  const auth = readFileSync('src/lib/auth.tsx', 'utf8');
  const inCode = new Set(
    (/const SUPER_ADMINS = new Set\(\[([\s\S]*?)\]\)/.exec(auth)?.[1] ?? '')
      .split('\n').map((l) => /'([^']+)'/.exec(l)?.[1] ?? '').filter(Boolean).map((e) => e.toLowerCase()),
  );

  const seed = readFileSync('supabase/migrations/0008_rbac_enforcement.sql', 'utf8');
  const seeded = new Set(
    (/insert into public\.app_super_admins \(email\) values([\s\S]*?);/.exec(seed)?.[1] ?? '')
      .split('\n').map((l) => /'([^']+)'/.exec(l)?.[1] ?? '').filter(Boolean).map((e) => e.toLowerCase()),
  );

  // Anything a later migration revokes.
  const revoked = new Set<string>();
  for (const f of readdirSync('supabase/migrations').filter((n) => /remove_super_admin/.test(n))) {
    const sql = readFileSync(`supabase/migrations/${f}`, 'utf8');
    const m = /v_email\s+text\s*:=\s*'([^']+)'/.exec(sql);
    if (m) revoked.add(m[1].toLowerCase());
  }

  const effective = [...seeded].filter((e) => !revoked.has(e)).sort();
  eq('the code list matches the database list, minus revocations',
    [...inCode].sort(), effective);
  // And the revoked address is in NEITHER, which is the thing just asked for.
  for (const e of revoked) {
    eq(`${e} is not a super admin in code`, inCode.has(e), false);
    eq(`...nor seeded back without a revocation`, seeded.has(e) && !revoked.has(e), false);
  }
}

console.log('\n-- every Party->Product->Serial cascade reads the product register --');
{
  // "loop the Product Master instead of Party Master + Product Master. Party
  // Name = Unique of Party Name from Product Master" (2026-09-10).
  const sql = readFileSync('supabase/migrations/0160_product_party_names.sql', 'utf8');
  const cf = readFileSync('src/modules/callFields.tsx', 'utf8');
  const rq = readFileSync('src/modules/RequestCallRegistration.tsx', 'utf8');
  const lk = readFileSync('src/modules/Lookup.tsx', 'utf8');
  const lib = readFileSync('src/lib/supabase.ts', 'utf8');

  // The list is distinct party_name FROM PRODUCTS, done in Postgres — the
  // client helper pages 1,000 rows at a time, which was 21 round trips per form.
  eq('the party list is distinct from the product register',
    /from public\.products/.test(sql) && /group by party_name/.test(sql), true);
  eq('...and the view applies RLS to the reader',
    /alter view public\.product_party_names set \(security_invoker = on\)/.test(sql), true);

  // ALL THREE cascade screens SEARCH THE SERVER — the call registers, the call
  // request and Product & Party Search. Downloading the list was the wrong
  // shape however well it was cached: three paged requests and a few hundred KB
  // before the field worked at all, reported as eight seconds on a phone.
  for (const [name, src] of [['the call registers', cf], ['the call request', rq], ['Product & Party Search', lk]] as const) {
    eq(`${name} searches the server for a customer`,
      /onSearch=\{|onSearch: /.test(src)
      && /sbSearchPartiesForCall|sbSearchProductParties/.test(src), true);
  }
  // AND THE DOWNLOAD IS GONE, not merely unused. Dead code that still looks
  // alive is how somebody reintroduces the problem by calling the
  // convenient-looking helper.
  eq('...and the whole-list download no longer exists',
    /sbListProductParties/.test(lib) === false
    && /name === 'productParty'/.test(lib) === false, true);

  // INSTALLATION searches BOTH and puts the owners first — it reaches a
  // customer who may have no machine yet, so the product register alone cannot
  // find them.
  eq('an installation searches the Party Master too, owners first',
    /sbSearchPartiesForInstall/.test(lib)
    && /\[\.\.\.owners, \.\.\.master\.filter/.test(lib), true);
  eq('...and only an installation gets it',
    /opts\.newPartyAllowed \? sbSearchPartiesForInstall : sbSearchPartiesForCall/.test(cf)
    && /isInstall \? sbSearchPartiesForInstall : sbSearchPartiesForCall/.test(rq), true);

  // A CUSTOMER WHO EXISTS BUT OWNS NO MACHINE IS SHOWN AND SAID SO. Their
  // register has ~1,000 of them (5,873 parties, 4,851 owning a machine), and
  // answering "Nothing matches" on a customer somebody is looking straight at
  // is a lie by omission.
  eq('a customer with no machine is listed, not hidden',
    /export async function sbSearchPartiesForCall/.test(lib)
    && /nonOwners\.add/.test(lib), true);
  eq('...and cannot be picked on a call that needs a machine',
    /isDisabled=\{isInstall \? undefined : partyOwnsNoMachine\}/.test(rq)
    && /isDisabled: opts\.newPartyAllowed \? undefined : partyOwnsNoMachine/.test(cf), true);
  eq('...and the row says why',
    /no machine on record/.test(rq) && /no machine on record/.test(cf), true);
  // EITHER rule disables a row. A field adding its own must not replace the
  // list's — that is how a spare with no stock would quietly become pickable.
  // Added because a mutation that broke exactly this went unnoticed.
  const selPick = readFileSync('src/components/ui/SelectPicker.tsx', 'utf8');
  eq('...and a field rule ADDS to the list\'s own disabled rows',
    /off\.has\(v\) \|\| \(isDisabled\?\.\(v\) \?\? false\)/.test(selPick), true);

  // The search is DEBOUNCED — a request per keystroke would be worse than the
  // download it replaces — and only runs while the box is open.
  const pl2 = readFileSync('src/components/ui/PickList.tsx', 'utf8');
  // The PROPERTY: the call to onSearch sits inside a setTimeout (debounced) and
  // the effect gives up early when the box is closed. Not the expression that
  // happens to produce the query — that has now cost a cycle twice.
  eq('the search is debounced and only runs while open',
    /if \(!hasSearch \|\| !open\) return;/.test(pl2)
    && /setTimeout\([\s\S]{0,900}run\(q\)/.test(pl2)
    && /\}, \d+\);/.test(pl2), true);
  // AND IT DOES NOT DEPEND ON THE HANDLER'S IDENTITY. An inline handler is a
  // new function every render, so an effect keyed on it re-runs forever when
  // that handler sets state — thirteen searches from one keystroke, and a box
  // that never stopped saying "searching…". `npm run check:picklist` proves the
  // behaviour in a browser; this keeps the mechanism from being undone by a
  // well-meant dependency-array tidy-up.
  eq('the search effect is not keyed on the handler identity',
    /\}, \[hasSearch, open, query\]\);/.test(pl2), true);
  eq('and the handler is reached through a ref',
    /const onSearchRef = useRef\(onSearch\)/.test(pl2), true);

  // AND IT NEVER SHOWS ROWS THAT CONTRADICT WHAT IS TYPED. The results are kept
  // WITH the query that produced them: holding the rows alone left the previous
  // answer on screen mid-search, so typing "The principal" listed hospitals
  // beginning with A under a quiet "searching…".
  eq('...and results are keyed to the query that produced them',
    /setRemote\(\{ q: q\.toLowerCase\(\), rows \}\)/.test(pl2)
    && /remote\.q === q \? remote\.rows : null/.test(pl2), true);
  // A server-searched list does not know the total and must not claim one: the
  // project's rule that a count over partly-loaded data is a LOWER BOUND.
  eq('...and it does not claim a total it cannot know',
    /\{matches\.length\} shown\{matches\.length \? '\+' : ''\}/.test(pl2), true);
  // "Nothing matches" must not appear while a search is still in flight.
  eq('...and it does not say "nothing matches" mid-search',
    /matches\.length === 0 && !canTake && !searching &&/.test(pl2), true);

  // THE 1000-ROW CAP NO LONGER APPLIES HERE, because nothing downloads the
  // customer list any more — the assertions that guarded the paging went with
  // it. The lesson is kept in docs/BACKLOG.md rather than in a check with
  // nothing left to check: PostgREST caps a single response at ~1000 rows and
  // says nothing about it, and a TRUNCATED list is the worst shape a list can
  // fail in, because it looks like a working list that lacks your row.
  // What replaces it: the search never asks for more than it renders.
  eq('the customer search asks for a bounded page',
    /sbSearchProductParties\(query: string, limit = 50\)/.test(lib), true);

  // THE PRODUCT LIST IS ONE REQUEST, not a walk of the whole products table.
  // distinctColumn pages 1,000 rows at a time, so on 21,000 machines it was 21
  // sequential round trips to arrive at about forty names — most of why the
  // form was slow to open on a phone.
  eq('the product list reads the register view, not every product row',
    /if \(name === 'product'\)[\s\S]{0,400}sbListProductNames\(\)/.test(lib), true);

  // THE LISTS SURVIVE A RELOAD. Stale-while-revalidate: the stored copy goes on
  // screen first and the fetch still runs, or it is just a slow fetch with
  // extra steps.
  const mst = readFileSync('src/lib/masters.ts', 'utf8');
  eq('master lists are cached in the browser and revalidated',
    /const stored = readStored\(name\);/.test(mst)
    && /if \(stored\) \{ setValues\(/.test(mst)
    && /void load\(name\)\.then/.test(mst), true);
  // Every localStorage access guarded: a private window throws on the accessor
  // itself, and a form that will not open because a cache is unavailable is
  // worse than one that is slow.
  eq('...and every stored access is guarded',
    (mst.match(/try \{/g) ?? []).length >= 4 && /catch \{ return null; \}/.test(mst), true);
  // "Clear Cache and Update" must clear this too, or it leaves behind the very
  // thing somebody pressed it to get rid of.
  eq('...and clearing the cache clears the stored copy',
    /export function clearMasterCache[\s\S]{0,500}localStorage\.removeItem\(STORE_PREFIX/.test(mst), true);
  // An empty answer is usually a failed request or a missing permission —
  // storing it would serve that emptiness back for a week.
  eq('...and an empty list is never stored',
    /if \(v\.length\) writeStored\(name, v\);/.test(mst), true);
}

console.log('\n-- a failed search never reads as "no such customer" --');
{
  // Reported 2026-09-11: real customers — "Nagapattinam Medical College",
  // "HKSD" — came back as "Nothing matches", on a database whose product
  // searches were timing out. The person at the desk concludes the customer is
  // not on the system and raises them again as a duplicate.
  //
  // The comment in PickList already said "nothing matches and the request
  // failed must not look the same" — above a `.catch(() => {})` that made them
  // identical. A comment is not a check, which is why this one exists.
  const pk = readFileSync('src/components/ui/PickList.tsx', 'utf8');
  eq('a failed search is captured, not swallowed',
    /\.catch\(\(e\) => \{ if \(alive\) setFailed\(/.test(pk)
    && /\.catch\(\(\) => \{\}\)/.test(pk) === false, true);
  eq('...and says the list is empty because the search failed',
    /does <b>not<\/b> mean the customer is missing/.test(pk), true);
  // "Nothing matches" must be suppressed while a failure is showing, or both
  // messages appear and the reader picks the wrong one.
  eq('...and does not also claim nothing matches',
    /matches\.length === 0 && !canTake && !searching && !failed &&/.test(pk), true);
  // A success must CLEAR it, or one timeout marks the box failed for ever.
  eq('...and a later success clears it',
    /setRemote\(\{ q: q\.toLowerCase\(\), rows \}\); setFailed\(null\);/.test(pk), true);

  // The diagnostic is read-only: it is handed to somebody to run against the
  // live project, so it must not be able to change it.
  const diag = readFileSync('supabase/apply/_search_diagnose.sql', 'utf8');
  const diagSql = diag.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  // The ONE thing it may create is a function in `pg_temp` — the throwaway
  // schema that lives for one connection and cannot outlive it. EXPLAIN cannot
  // otherwise be put in a UNION, and a single result is one screenshot rather
  // than four. Anything else that writes is refused.
  eq('the search diagnostic only reads',
    /\b(insert|update|delete|drop|alter|truncate|grant)\b/i.test(diagSql) === false
    && /\bcreate\b/i.test(diagSql.replace(/create or replace function pg_temp\.[\s\S]*?end \$\$;/i, '')) === false, true);
  // AND IT MUST RUN WHERE IT IS ACTUALLY RUN. The first version used psql's
  // \\echo and \\pset, which the Supabase SQL editor does not have — it is not
  // psql, and every other file in supabase/apply/ is pure SQL for that reason.
  eq('...and is pure SQL, not psql meta-commands',
    /^\s*\\/m.test(diag) === false, true);
  // A plan sorted alphabetically is a word list, not a plan.
  eq('...and keeps each plan in its own line order',
    /with ordinality/.test(diag) && /order by ord, seq;/.test(diag), true);
}

console.log('\n-- the role on the list reaches the sign-in --');
{
  // Reported 2026-09-11: "Why is it now Engineer" — a user whose User Master row
  // said Zoho Migration and whose SIGN-IN said Engineer. The sign-in is what
  // can() reads, so Engineer is what she had.
  //
  // The role only ever reached `profiles` through UserMasterView.persist — one
  // row, saved by hand on that screen. A bulk import of the directory, or any
  // other path, left the two disagreeing silently.
  const um = readFileSync('src/modules/UserMasterView.tsx', 'utf8');
  eq('the drift between the list and the sign-in is counted',
    /const roleDrift = useMemo/.test(um) && /signedIn\.role !== r\.role/.test(um), true);
  eq('...and shown, not left to be noticed in a column',
    /roleDrift\.length > 0 && \(/.test(um) && /sheet-banner/.test(um), true);
  eq('...and fixable in one action',
    /const applyRoleDrift = async/.test(um)
    && /updateProfile\(d\.profileId, \{ role: d\.row\.role \}\)/.test(um), true);
  // A failure must be NAMED. "3 of 5 applied" without saying which two is a
  // report nobody can act on — and these are permissions.
  eq('...and names the ones it could not apply',
    /failed\.push\(`\$\{d\.row\.name \|\| d\.row\.email\}/.test(um)
    && /Could not apply \$\{failed\.length\}: \$\{failed\.join/.test(um), true);
  // Applying somebody's role is an access change and belongs in the trail.
  eq('...and records each one in the audit trail',
    /action: 'user\.role\.apply'/.test(um), true);
}

console.log('\n-- a person can see what their own access actually is --');
{
  // Reported 2026-09-11: an administrator using "View as" saw three actions on
  // a call and the engineer signing in himself saw one. Both go through the
  // SAME can(), so the difference was in the inputs — and neither screen showed
  // what those inputs were. Two people comparing screenshots is not a diagnosis.
  const prof = readFileSync('src/modules/Profile.tsx', 'utf8');
  eq('My Profile says which role is in effect',
    /const roleKey = user\.rbacRole \|\| legacyToRbac\(user\.role\)/.test(prof), true);
  // THE DISTINCTION THIS PROJECT KEEPS BEING CAUGHT BY: a stored row that is
  // absent or empty falls back to the built-in defaults SILENTLY, so a role can
  // look configured on Roles & Permissions and behave like something else.
  eq('...and whether they come from the stored role or the defaults',
    /const fromStored = !!\(stored && stored\.length\)/.test(prof)
    && /the built-in defaults/.test(prof), true);
  eq('...and what is granted to them personally',
    /user\.extraPermissions \?\? \[\]/.test(prof), true);
  // While previewing, the panel must say it is the PREVIEW identity — or it
  // becomes another way to mistake one person's access for another's.
  eq('...and says when it is describing a preview, not you',
    /previewing && \(/.test(prof), true);

  // A FAILED PROFILE READ MUST NOT SILENTLY DOWNGRADE SOMEBODY. It used to drop
  // the error and fall through to a bare-engineer identity; a person quietly
  // downgraded looks like a broken app rather than like access not granted.
  const sbLib = readFileSync('src/lib/supabase.ts', 'utf8');
  eq('a failed profile read is not swallowed',
    /const \{ data, error \} = await c\.from\('profiles'\)[\s\S]{0,200}if \(error\) throw/.test(sbLib), true);
  // ...and throwing must not hang the boot either.
  const au = readFileSync('src/lib/auth.tsx', 'utf8');
  eq('...and the failure still finishes booting',
    /catch \{[\s\S]{0,300}setSupaBooting\(false\);/.test(au), true);
}

console.log('\n-- the KPI export narrows the calls before it reads the visits --');
{
  // "Sivarani is unable to download KPI Report" — statement timeout on a range
  // of 455 calls (2026-09-10). The view pre-aggregated the WHOLE of `reports`
  // and `spare_requests`, so the caller's date range could not reach them.
  const kpi = readFileSync('supabase/migrations/0159_kpi_export_lateral.sql', 'utf8');

  // LATERAL, keyed on the call in hand — the property that makes the date range
  // matter at all. Four of them: latest entry, solved entry, first visit, first
  // spare.
  eq('the per-call lookups are lateral, not pre-aggregated',
    (kpi.match(/left join lateral \(/g) ?? []).length === 4
    && /from public\.reports rl\s*\n\s*where rl\.ucn = c\.ucn/.test(kpi), true);

  // create-or-replace DROPS security_invoker. Without re-asserting it the export
  // reads as the view's OWNER and hands every signed-in user every call — the
  // fault that has hit this project three times and never announces itself.
  eq('...and security_invoker is re-asserted after the replace',
    /create or replace view public\.kpi_field_inst[\s\S]*alter view public\.kpi_field_inst set \(security_invoker = on\)/.test(kpi), true);

  // NOT dropped and recreated: an AccessExclusiveLock on this view is what made
  // 0154 deadlock against the live app.
  eq('...and the view is replaced, never dropped',
    /drop view[^\n]*kpi_field_inst/i.test(kpi) === false, true);

  // THE INDEX MUST NOT BE PARTIAL. The first attempt guarded it with the same
  // predicate as the lateral — but that predicate is about the OUTER row, so
  // Postgres could not prove it applied and ignored the index, leaving a
  // sequential scan per call. A partial index is usable only when its predicate
  // follows from the query's own restriction on that table.
  const spareIdx = /create index if not exists spare_requests_ucn_idx[\s\S]*?;/.exec(kpi)?.[0] ?? '';
  eq('...and the spare_requests index is plain, so the planner can use it',
    spareIdx !== '' && !/where/i.test(spareIdx), true);
}

console.log('\n-- the call request accepts a party without a stall --');
{
  // "It is taking a very long time to accept the party -- which is impacting on
  // listing the products" (2026-09-09). Two faults, one cause.
  const req = readFileSync('src/modules/RequestCallRegistration.tsx', 'utf8');
  const pick = readFileSync('src/components/ui/PickList.tsx', 'utf8');

  // 1. The party field was an <input list> over a datalist of up to EIGHT
  //    THOUSAND options, re-rendered on every keystroke — and because the
  //    products effect depends on f.partyName, which that onChange set per
  //    CHARACTER, typing a party name fired one products query per letter.
  //    A PickList commits once, so the cascade runs once.
  // TESTS THE PROPERTY, not the expression. This pinned
  // `options={partyMaster.values}` verbatim and broke the day the installation
  // fallback made it a ternary — same behaviour, failing assertion. THIRD time
  // this session an assertion has cost a cycle for pinning a detail; what
  // matters is that the party is a PickList fed from the party list, and that
  // the eight-thousand-option datalist is gone.
  eq('the party is picked, not typed into a datalist',
    /<datalist id="dl-party"/.test(req) === false
    && /<PickList[\s\S]{0,900}onSearch=\{/.test(req), true);
  // The products effect still keys off the committed name — if it ever went
  // back to a per-keystroke value the storm returns with no visible symptom
  // until somebody times it.
  eq('...and the products cascade keys off the committed party',
    /\}, \[isInstall, f\.partyName\]\);/.test(req), true);
  // Free text belongs to installations alone: for every other call type the
  // machines are looked up BY the party, so a typed name matches nothing.
  eq('...with free text only where the customer may genuinely be new',
    /allowFreeText=\{isInstall\}/.test(req), true);

  // 2. PickList rendered one button per match. Opening the party list built
  //    thousands of DOM nodes before the menu appeared.
  eq('PickList renders a bounded number of rows',
    /const RENDER_CAP = \d+;/.test(pick) && /matches\.slice\(0, RENDER_CAP\)/.test(pick), true);
  // The keyboard has to move within what is RENDERED, or the highlight walks
  // off the visible list and Enter picks something nobody can see.
  eq('...and the keyboard moves within the rendered rows',
    /Math\.min\(h \+ 1, shown\.length - 1\)/.test(pick)
    && /if \(shown\[hi\] != null\) choose\(shown\[hi\]\);/.test(pick), true);
  // A truncated list must SAY it is truncated: a reader who cannot see their
  // party has to know the answer is "keep typing", not "they are not here".
  eq('...and it says when the list is cut short',
    /hidden > 0 \?/.test(pick) && /keep typing to narrow/.test(pick), true);
}

console.log('\n-- Knowledge Base is a heading, and supporting docs reach a request --');
{
  const nav = readFileSync('src/components/layout/Layout.tsx', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  const howto = readFileSync('src/modules/HowToUse.tsx', 'utf8');
  const kb = readFileSync('src/modules/KnowledgeBase.tsx', 'utf8');

  // The heading exists and carries the topics. Checked as a GROUP TITLE, not
  // merely as text somewhere in the file — a comment mentioning it would pass
  // a looser test.
  // Tolerant of other properties between the title and the items — `flash: true`
  // sits there now, and pinning the two as adjacent broke three assertions the
  // moment it was added. Match up to `items:` rather than assuming what follows
  // the title.
  const kbGroup = /title: 'Knowledge Base',[\s\S]*?items: \[([\s\S]*?)\n\s*\],/.exec(nav)?.[1] ?? '';
  eq('Knowledge Base is a nav heading, not an item under Help',
    kbGroup !== '' && !/title: 'Help'/.test(nav), true);
  // FIRST, not merely present: it is what a new starter needs first, and the
  // order of the entries is the claim. Read the first line that is actually an
  // entry — the captured block opens with a newline and carries comments.
  const firstTopic = kbGroup.split('\n').map((l) => l.trim()).find((l) => l.startsWith('{ to:')) ?? '';
  eq('...with How to Use as its first topic',
    firstTopic.startsWith("{ to: '/knowledge-base/how-to'"), true);
  eq('...and Service Manuals moved under it',
    /to: '\/service-manuals'/.test(kbGroup), true);
  // ...and OUT of Documents, or it is in the menu twice, which is worse than
  // being in the wrong place: two entries that go to one page.
  const docGroup = /title: 'Documents',[\s\S]*?items: \[([\s\S]*?)\n\s*\],/.exec(nav)?.[1] ?? '';
  eq('...and is no longer under Documents as well',
    docGroup !== '' && !/to: '\/service-manuals'/.test(docGroup), true);
  // ABOVE Service Calls, because it is read BEFORE the work rather than after
  // it. Compared by POSITION in the file, which is the order the menu renders.
  eq('...and the whole group sits above Service Calls',
    nav.indexOf("title: 'Knowledge Base'") < nav.indexOf("title: 'Service Calls'"), true);


  // The guide is a real route, or the nav entry is a dead link.
  eq('How to Use has a route of its own',
    /path="\/knowledge-base\/how-to" element=\{<HowToUse \/>\}/.test(app), true);

  // ALL the how-to content is on it: the written sections AND the articles
  // filed as How-To, which used to sit among the field solutions.
  eq('the written guide moved to the How to Use page',
    /const SECTIONS: Sec\[\] = \[/.test(howto) && !/const SECTIONS/.test(kb), true);
  eq('How-To articles are read there, not among the field solutions',
    /a\.category === HOWTO_CATEGORY/.test(howto) && /a\.category !== HOWTO_CATEGORY/.test(kb), true);
  // ONE constant, so the two lists cannot disagree about which is which and an
  // article cannot land on both pages or on neither.
  eq('both lists split on the same constant',
    /export const HOWTO_CATEGORY/.test(howto) && /import \{ HOWTO_CATEGORY \} from '\.\/HowToUse'/.test(kb), true);

  // SUPPORTING DOCS ON A CALL REQUEST — the call's own component, imported and
  // not copied, so the matching rule cannot drift between the two screens.
  const assoc = readFileSync('src/modules/CallAssociations.tsx', 'utf8');
  const pend = readFileSync('src/modules/PendingRegistrations.tsx', 'utf8');
  const req = readFileSync('src/modules/RequestCallRegistration.tsx', 'utf8');
  eq('SupportingDocs is exported once', /export function SupportingDocs/.test(assoc), true);
  // THE FLASHING HEADING must be able to STOP. A heading that flashes for ever
  // is wallpaper: people stop seeing it within a day, and it has cost them
  // attention for nothing. Two independent stops, and both are asserted.
  const navCss = readFileSync('src/components/layout/layout.css', 'utf8');
  const flashRule = /\.nav-group-flash \{[\s\S]*?\}/.exec(navCss)?.[0] ?? '';
  eq('the flash runs a fixed number of times, never infinite',
    flashRule !== '' && /animation: nav-group-flash [^;]*\s\d+\s/.test(flashRule)
    && !/infinite/.test(flashRule), true);
  eq('...and opening a page in the group ends it for good',
    /markSeen\(group\.title\)/.test(nav) && /localStorage\.setItem\('rithi\.nav\.seen'/.test(nav), true);
  // A CONTRAST COLOUR, and specifically NOT the page's invert pair. The heading
  // lives in the SIDEBAR, whose ground is dark in all eight themes; `--text` is
  // a near-black, so inverting with the page's tokens put a dark box on a dark
  // ground and the flash barely showed. This asserts the peak frame is a solid
  // literal, and that the page tokens have not crept back in.
  const flashFrames = /@keyframes nav-group-flash \{[\s\S]*?\n\}/.exec(navCss)?.[0] ?? '';
  eq('the flash peaks on a solid contrast colour, not the page invert',
    /50%\s*\{ background: #[0-9a-f]{6}; color: #[0-9a-f]{3,6}; \}/i.test(flashFrames)
    && !/var\(--text\)|var\(--surface\)/.test(flashFrames), true);
  // ...and it must not borrow a call-status hue: those are a code people have
  // learned to read, and a nav heading is not a call state.
  eq('...and it is none of the call-status colours',
    !/#dc2626|#ef4444|#2563eb|#3b82f6|#ec4899|#db2777|#16a34a|#22c55e/i.test(flashFrames), true);
  // A repeated luminance change is exactly what some readers cannot have.
  // The steady marker carries the SAME colour — a fallback in a different
  // colour is a second thing to learn for no reason.
  eq('...and reduced motion gets a steady marker in that same colour',
    /prefers-reduced-motion: reduce\)\s*\{[\s\S]{0,300}\.nav-group-flash[\s\S]{0,200}box-shadow[^;]*#fbbf24/.test(navCss), true);
  // THE PANEL MUST NOT BE ABLE TO VANISH. It used to return null whenever
  // nothing matched, which on screen is indistinguishable from the feature
  // having been removed — and that is exactly how it was reported. It now
  // renders a note instead, and only disappears when the call names nothing to
  // match on at all.
  eq('supporting documents say why they are empty rather than disappearing',
    /const empty = !manuals\.length && !articles\.length/.test(assoc)
    && /No service manual or article is filed/.test(assoc), true);

  // EVERY place a request is looked at, not just two of them. The submitted
  // request drawer was missed the first time.
  eq('the SUBMITTED request drawer offers them too',
    /detail\.standardComplaint[\s\S]{0,200}\/>/.test(req)
    && (req.match(/<SupportingDocs/g) ?? []).length >= 2, true);
  eq('the request VIEW offers them',
    /import \{ SupportingDocs \} from '\.\/CallAssociations'/.test(pend)
    && /<SupportingDocs/.test(pend), true);
  eq('the request FORM offers them too',
    /import \{ SupportingDocs \} from '\.\/CallAssociations'/.test(req)
    && /<SupportingDocs/.test(req), true);
  // Neither screen may grow its own copy of the lookup: two implementations of
  // "which manual applies" is how they start answering differently.
  eq('...and neither screen matches documents itself',
    /serviceManualsForProduct/.test(pend) || /serviceManualsForProduct/.test(req), false);
  // The panel sits under a LIVE textarea on the form, so the fetch is debounced.
  // Without this, every keystroke in Reported Problem pulled the whole
  // service-manual table — the match is done in JS, so no query narrows it.
  eq('the lookup is debounced, because it sits under a textarea',
    /setTimeout\([\s\S]{0,600}serviceManualsForProduct/.test(assoc), true);
}

console.log('\n-- Indoor Service: the two axes, and the rights the database keeps --');
{
  // The register is the workshop side of procedure §4.5. What is tested here is
  // what could silently regress into something that still LOOKS right.
  const sql = readFileSync('supabase/migrations/0158_indoor_service.sql', 'utf8');

  // TWO AXES. `kind` says whose property it is (which turns the custody duties
  // of §7.5.10 on or off) and `activity` says what is being done to it. Collapse
  // them into one column and a DEMO unit in for repair stops being a DEMO unit.
  eq('kind and activity are separate columns, each with its own vocabulary',
    /kind\s+text not null default 'Customer property'[\s\S]{0,200}check \(kind in/.test(sql)
    && /activity\s+text not null default 'Repair'[\s\S]{0,300}check \(activity in/.test(sql), true);

  // The call is OPTIONAL. If `ucn` ever gains `not null`, DEMO units need a fake
  // call raised for them and the register stops standing on its own.
  eq('the call is optional — a DEMO unit has none', /\n  ucn\s+text,\n/.test(sql), true);

  // THE RIGHTS ARE THE DATABASE'S. Each of these three is refused by the guard
  // trigger, not by hiding a button; a right only the browser tests is a hidden
  // button, which this project has shipped twice (0126, 0127).
  for (const right of ['indoor.qc', 'indoor.dispatch', 'indoor.condemn']) {
    eq(`${right} is refused by the trigger, not just by the screen`,
      new RegExp(`has_perm\\('${right.replace('.', '\\.')}'\\)[\\s\\S]{0,200}raise exception`).test(sql), true);
  }

  // The one HARD GATE: nothing is harvested from a unit that has not been
  // decontaminated. Everything else in the module records; this one blocks.
  eq('nothing is harvested before the unit is decontaminated',
    /indoor_job_parts_guard[\s\S]{0,600}not coalesce\(v_ok, false\)[\s\S]{0,200}raise exception/.test(sql), true);

  // A machine does not leave with a failed check (4.5.6).
  eq('a failed quality check stops the unit leaving',
    /status in \('Ready', 'Dispatched', 'Closed'\)[\s\S]{0,120}qc_result = 'Fail'[\s\S]{0,200}raise exception/.test(sql), true);

  // security_invoker on the list view. Without it the view reads as its OWNER
  // and every signed-in user sees every job — the fault that has hit this
  // project three times (0040, 0050, 0057) and never announces itself.
  eq('indoor_job_list applies RLS to the reader',
    /create view public\.indoor_job_list[\s\S]*?alter view public\.indoor_job_list set \(security_invoker = on\)/.test(sql), true);

  // The job number is ISSUED, not accepted. The trigger must assign
  // unconditionally: "fill it in when blank" lets a client mint its own.
  eq('the job number is issued by the database, never taken from the client',
    /new\.job_no := public\.next_indoor_job_no\(\);/.test(sql)
    && /if new\.job_no is null or btrim\(new\.job_no\) = ''/.test(sql) === false, true);

  // CONDEMN IS GRANTED TO NOBODY BUT ADMIN on apply. Scrapping a machine is a
  // decision an administrator makes deliberately, not one that arrives with the
  // page — so it must not appear in any other role's grant list.
  const grantBlock = sql.slice(sql.indexOf('$indoor_perms$'));
  const condemnLines = grantBlock.split('\n').filter((l) => l.includes('indoor.condemn'));
  eq('indoor.condemn is granted to admin alone',
    condemnLines.length === 1 && /r\.role = 'admin'/.test(
      grantBlock.split('\n')[grantBlock.split('\n').findIndex((l) => l.includes('indoor.condemn')) - 1]), true);

  // The page is reachable and grantable. A module in the nav but not in MODULES
  // cannot be given to anybody; one in MODULES but not the nav cannot be found.
  const nav = readFileSync('src/components/layout/Layout.tsx', 'utf8');
  const rbac = readFileSync('src/lib/rbac.ts', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  eq('the register has a route, a nav entry and a permission key',
    /path="\/indoor"/.test(app) && /to: '\/indoor'/.test(nav) && /path: '\/indoor'/.test(rbac), true);
  eq('...and its five rights are on the role matrix',
    /'indoor\.receive', 'indoor\.work', 'indoor\.qc', 'indoor\.dispatch', 'indoor\.condemn'/.test(rbac), true);

  // The screen must not invent a third axis by folding kind into activity.
  const page = readFileSync('src/modules/IndoorService.tsx', 'utf8');
  eq('the screen edits both axes as separate fields',
    /onChange=\{\(v\) => set\(\{ kind: v \}\)\}/.test(page)
    && /onChange=\{\(v\) => set\(\{ activity: v \}\)\}/.test(page), true);
  // The QC segregation is a WARNING. If this ever becomes a block it is a
  // decision somebody made, and it should not happen by drift.
  eq('QC by the same person warns rather than refuses',
    /selfChecked/.test(page) && /ind-warn/.test(page), true);
}

console.log('\n-- the Standard Complaint is picked, never typed --');
{
  // "standard complaint drop-down has to be type search and select in all
  // modules ( Field Call , PM , Installation, Visit report , Call Registration
  // request) No fall back to Free text" (2026-09-09).
  //
  // Field Call, Installation and PM are ONE component built from FieldDefs, so
  // the engine covers all three; the other two are their own screens.
  const cf = readFileSync('src/modules/callFields.tsx', 'utf8');
  eq('the register complaint is a picker with free text OFF',
    /type: 'select' as const,\s*\n\s*allowFreeText: false,/.test(cf), true);
  // It used to fall back to a plain box when the master was empty. An empty
  // master is a MASTER problem: the field says so and stays a picker.
  eq('...and it no longer falls back to a text box when the master is empty',
    /below: complaintSuggestions,\s*\n\s*help:/.test(cf), false);

  const cr = readFileSync('src/modules/CallReporting.tsx', 'utf8');
  eq('the visit report complaint is a picker',
    /f\.kind === 'complaint' \? \([\s\S]{0,900}<SelectPicker/.test(cr), true);

  const rq = readFileSync('src/modules/RequestCallRegistration.tsx', 'utf8');
  eq('the call request complaint has no free-text branch',
    /list="dl-complaint"/.test(rq), false);

  // Nowhere at all: the datalists that made it typeable are gone.
  for (const f of ['src/modules/CallReporting.tsx', 'src/modules/RequestCallRegistration.tsx',
                   'src/modules/callFields.tsx']) {
    eq(`${f.split('/').pop()} has no complaint datalist`,
      /dl-(standard)?complaint/.test(readFileSync(f, 'utf8')), false);
  }
}

// ---------------------------------------------------------------------------
// THE SERIAL IS MANDATORY EVERYWHERE A CALL IS RAISED.
// A call with no serial gets the UniqueID REQID-Product-NA, which points at no
// machine: its warranty, contract and item status all have to be put right by
// hand afterwards (R18627-MONNAL T75-NA, 2026-09-11). Asserted as the BEHAVIOUR
// — the schema field carries `required`, and the hand-written request form
// refuses to submit a row without one — not as the text of either.
{
  console.log('\n-- the product serial is required --');

  const fc = readFileSync('src/modules/FieldCalls.tsx', 'utf8');
  const serialDef = /\{[^{}]*name: 'serial'[^{}]*\}/.exec(fc)?.[0] ?? '';
  eq('the call schema marks serial required', /required:\s*true/.test(serialDef), true);
  // The one field it must not be confused with: productName was already
  // required, so a check that passes on either proves nothing.
  eq('serial is its own field def', /label: 'Product Serial Number'/.test(serialDef), true);

  // The request form is hand-validated, so `required` on a schema cannot
  // reach it. Run its validator's rule rather than matching its source: an
  // item with a product and a problem but no serial must be refused.
  const rq = readFileSync('src/modules/RequestCallRegistration.tsx', 'utf8');
  const validate = /const validate = \(\): string => \{[\s\S]*?\n  \};/.exec(rq)?.[0] ?? '';
  eq('the request form validates the serial before the problem',
    validate.indexOf('it.serial.trim()') >= 0
      && validate.indexOf('it.serial.trim()') < validate.indexOf('it.reportedProblem.trim()'), true);
  eq('and it returns a message, not a silent pass',
    /Serial No is required/.test(validate), true);
  eq('the request form labels the serial as required',
    /field\('Serial No \*'/.test(rq), true);
}

// ---------------------------------------------------------------------------
// "Required" must mean required. A field satisfied by the space bar is not.
{
  console.log('\n-- required rejects whitespace --');
  const form = readFileSync('src/components/form/Form.tsx', 'utf8');
  const req = /if \(f\.required\) \{[\s\S]*?\n    \}/.exec(form)?.[0] ?? '';
  eq('the required check trims strings', /\.trim\(\) === ''/.test(req), true);
}

// ---------------------------------------------------------------------------
// THE TRACKER'S ASSIGNEE IS A TEAM, NEVER A TOOL (the user's rule,
// 2026-09-11). Everyone reading the tracker is on the customer's side of the
// table; an item parked "with Claude" names nobody they can chase. 0162
// renames what the seed migrations left, and this stops the next seed putting
// it back — which is the only way it can return, since the seeds are replayed.
{
  console.log('\n-- the tracker assignee is NL Team --');
  const RENAMER = '0162_tracker_nl_team.sql';
  const offenders: string[] = [];
  for (const f of readdirSync('supabase/migrations').filter((n) => /tracker/i.test(n) && n !== RENAMER)) {
    const sql = readFileSync(`supabase/migrations/${f}`, 'utf8');
    // Only the OWNER column matters: prose in a comment is not an assignee.
    const body = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
    if (/'Claude'/.test(body)) offenders.push(f);
  }
  // The three seed migrations are applied history and are not edited; 0162
  // runs after them. Any NEW one is a fault.
  eq('no tracker migration beyond the known seeds writes Claude as an owner',
    offenders.filter((f) => !['0144_tracker_seed_backlog.sql', '0150_tracker_sync_backlog.sql',
                              '0157_tracker_sync_0909.sql'].includes(f)), []);

  const renamer = readFileSync(`supabase/migrations/${RENAMER}`, 'utf8');
  eq('the renamer sets NL Team', /set owner = 'NL Team'/.test(renamer), true);
  eq('and it is case- and space-insensitive about what it replaces',
    /ilike 'claude'/.test(renamer) && /btrim\(/.test(renamer), true);

  // It only works if it runs LAST in its module: the bundles replay one at a
  // time, so a seed running afterwards would put 'Claude' straight back.
  const gen = readFileSync('scripts/build-apply-bundles.mjs', 'utf8');
  const files = /tracker: \{[\s\S]*?files: \[([^\]]*)\]/.exec(gen)?.[1] ?? '';
  const list = [...files.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  eq('the renamer is last in the tracker module', list[list.length - 1], RENAMER);
}

// ---------------------------------------------------------------------------
// THE SPARE STILL IN THE PICKER IS SAVED TOO.
// Reported 2026-09-11: "Always 1 Consumption is getting Missed." The report
// wrote `spares` — the lines committed with the Add button — and the draft
// line sitting filled-in on screen was thrown away. Exactly one line short,
// silently, on a record that is both a quality record and the hand-stock
// balance. Asserted as behaviour: the insert must carry the draft, and the
// draft must pass the SAME rules the Add button applies.
{
  console.log('\n-- the spare in the picker is saved --');
  const cr = readFileSync('src/modules/CallReporting.tsx', 'utf8');

  // What is handed to addConsumptionRows must not be the committed-only list.
  const insert = /addConsumptionRows\(([A-Za-z]+)\.map/.exec(cr)?.[1] ?? '';
  eq('the consumption insert carries more than the added lines', insert !== 'spares' && insert !== '', true);

  // …and that list must actually be the committed lines PLUS the draft.
  const built = new RegExp(`const ${insert} = [^;]*spares[^;]*\\.line`).test(cr)
             || new RegExp(`const ${insert} = [^;]*\\.\\.\\.spares`).test(cr);
  eq('and it is the added lines plus the draft', built, true);

  // One rule set, not two: Save must refuse a draft Add would refuse rather
  // than saving it on easier terms or dropping it.
  const save = /const save = async \(\) => \{[\s\S]*?const t0 = performance\.now\(\);/.exec(cr)?.[0] ?? '';
  eq('Save validates the draft before writing', /draftLine\(\)/.test(save), true);
  eq('and a draft it refuses stops the save instead of being dropped',
    /'error' in d\) \{ setErr\(d\.error\); return; \}/.test(save), true);
  eq('the Add button runs that same validator',
    /const addSpare = [\s\S]{0,300}draftLine\(\)/.test(cr), true);
}

// ---------------------------------------------------------------------------
// A consumption line is CORRECTED by voiding it (0049 blocks deletion), and
// that needs the database id. Rows past the first page had none, so a line
// below 1,000 could not be put right at all — Refresh reloads page one.
{
  console.log('\n-- every loaded consumption line can be corrected --');
  const sc = readFileSync('src/modules/SpareConsumption.tsx', 'utf8');
  const loadMore = /const loadMore = async \(\) => \{[\s\S]*?\n  \};/.exec(sc)?.[0] ?? '';
  eq('loadMore keeps the database id', /_dbId: x\.id/.test(loadMore), true);
  // The first page always did; both paths must, or the bug is half-fixed.
  const load = /const load = async \(\) => \{[\s\S]*?\n  \};/.exec(sc)?.[0] ?? '';
  eq('and so does the first page', /_dbId: x\.id/.test(load), true);
}

// ---------------------------------------------------------------------------
// A PANEL THAT HOLDS DROPDOWNS MUST NOT BE THE THING THAT SCROLLS.
// Reported 2026-09-11: the Filters panel was unusable in every register. It
// inherits .dt-cols-panel's max-height + overflow-y, and a picker menu is
// position:absolute, so the option list was clipped to a couple of rows inside
// the panel's scroll box. One DataTable draws every register, so it was every
// module at once.
{
  console.log('\n-- the filter panel does not clip its own dropdowns --');
  const css = readFileSync('src/components/table/table.css', 'utf8');
  const panel = /\.dt-filter-panel \{[^}]*\}/.exec(css)?.[0] ?? '';
  eq('the filter panel does not scroll', /overflow:\s*visible/.test(panel), true);
  eq('and it is not height-capped into one', /max-height:\s*none/.test(panel), true);
  // The columns panel SHOULD still scroll — it is a long list of checkboxes
  // with no dropdowns in it, so the two must not be conflated.
  const cols = /\.dt-cols-panel \{[^}]*\}/.exec(css)?.[0] ?? '';
  eq('the columns panel still scrolls', /overflow-y:\s*auto/.test(cols), true);
}

// ---------------------------------------------------------------------------
// A MENU IS AS WIDE AS ITS LONGEST OPTION, NOT AS WIDE AS ITS BOX.
// Pinned left:0/right:0 it could only be the trigger's width, so in a narrow
// control every option read as a few truncated characters.
{
  console.log('\n-- dropdown options are not truncated --');
  const ui = readFileSync('src/components/ui/ui.css', 'utf8');
  const menu = /\.picklist-menu \{[^}]*\}/.exec(ui)?.[0] ?? '';
  eq('the menu is not pinned to the trigger width', /right:\s*0/.test(menu), false);
  eq('it is at least as wide as the box', /min-width:\s*100%/.test(menu), true);
  eq('and grows to its content', /width:\s*max-content/.test(menu), true);
  eq('but is capped so it cannot run off screen', /max-width:\s*min\(/.test(menu), true);
  const opt = /\.picklist-opt \{[^}]*\}/.exec(ui)?.[0] ?? '';
  eq('a long option wraps rather than clipping', /overflow-wrap:\s*anywhere/.test(opt), true);
  eq('and is never ellipsised', /text-overflow/.test(opt), false);
}

// ---------------------------------------------------------------------------
// "Add Consumption?" IS NOT A YES/NO QUESTION (the user's rule, 2026-09-11).
// "None Consumed" is a stated answer; "No" reads as "not filling this in".
// And Yes MAKES the spare list mandatory, so neither answer is a skip.
{
  console.log('\n-- Add Consumption is answered, not skipped --');
  const cr = readFileSync('src/modules/CallReporting.tsx', 'utf8');
  // The answers themselves, from the module that defines them — so a rename
  // reaches this check instead of leaving it matching a string nobody uses.
  eq('the two answers are Yes and None Consumed', [CONSUMPTION_YES, CONSUMPTION_NONE], ['Yes', 'None Consumed']);
  eq('and the field offers exactly those two',
    /const CONSUMPTION_OPTS = \[CONSUMPTION_YES, CONSUMPTION_NONE\]/.test(cr), true);
  eq('and the field uses them rather than the yes/no list',
    /key: 'Add Consumption\?'[^}]*opts: CONSUMPTION_OPTS/.test(cr), true);

  // The RULE, run with real inputs. A regex over the form's source proves only
  // that a line of code is present: the first version of this check passed
  // happily against `if (false && ...)`.
  eq('Yes with no spare at all is refused',
    consumptionProblem(CONSUMPTION_YES, 0, '') !== null, true);
  eq('Yes with an added line is fine',
    consumptionProblem(CONSUMPTION_YES, 1, ''), null);
  eq('Yes with the spare still in the picker is fine — it is an answer',
    consumptionProblem(CONSUMPTION_YES, 0, 'FILTER-X'), null);
  eq('a picker holding only spaces is not an answer',
    consumptionProblem(CONSUMPTION_YES, 0, '   ') !== null, true);
  eq('None Consumed never demands a spare',
    consumptionProblem(CONSUMPTION_NONE, 0, ''), null);
  eq('and an unanswered field is left to the required-field check',
    consumptionProblem('', 0, ''), null);
  eq('the message names both ways out',
    /add the spare/.test(consumptionProblem(CONSUMPTION_YES, 0, '') ?? '')
      && (consumptionProblem(CONSUMPTION_YES, 0, '') ?? '').includes(CONSUMPTION_NONE), true);
  eq('and the form asks the rule rather than restating it',
    /consumptionProblem\(String\(work\['Add Consumption\?'\]/.test(cr), true);

  // None Consumed must hide the section, not merely grey it.
  eq('None Consumed hides the spare section',
    /wantsConsumption = \(work\['Add Consumption\?'\] \?\? ''\) === 'Yes'/.test(cr)
      && /\{status && workOpen && wantsConsumption && \(/.test(cr), true);
}

// ---------------------------------------------------------------------------
// CALL REVIEW — a second review, on the REPORT rather than the failure.
// What it lists is the whole basis of the screen, so the rule is a function
// and gets run, not a regex over the component.
{
  console.log('\n-- Call Review lists solved calls only --');
  eq('a solved call is listed', isReviewable('Solved', 'Solved - Report Completed'), true);
  // "Solved - Report Pending" is NOT solved for this purpose: there is no
  // report to review, and listing it sends a reviewer to an empty pane.
  eq('report-pending is not reviewable', isReviewable('Solved', 'Solved - Report Pending'), false);
  eq('an unsolved call is not listed', isReviewable('Unsolved', ''), false);
  eq('an unattended call is not listed', isReviewable('Unattended', ''), false);
  // A re-opened or cancelled call renders a state that is not "Solved", so
  // these hold — but they are NOT what excludes a call whose open_state still
  // reads Solved with reopened_at set. That is listSolvedCalls(), below.
  eq('a re-opened call drops out', isReviewable('Reopened', 'Solved - Report Completed'), false);
  eq('a cancelled call is not listed', isReviewable('Cancelled', 'Solved - Report Completed'), false);
  eq('and REVIEW_DONE is the state that gets recorded', REVIEW_DONE, 'Report Reviewed');
  eq('the state test is not case-sensitive', isReviewable('solved', 'Solved - Report Completed'), true);

  const cr = readFileSync('src/modules/CallReview.tsx', 'utf8');
  // It must not pull the whole register to keep the solved third of it: that is
  // the screen that stops responding, and it caps out silently besides.
  eq('the solved filter runs in the database', /listSolvedCalls\(\)/.test(cr), true);
  eq('and it does not load every call', /listCalls\(/.test(cr), false);
  const sb = readFileSync('src/lib/supabase.ts', 'utf8');
  const reader = /export async function listSolvedCalls[\s\S]*?\n\}/.exec(sb)?.[0] ?? '';
  eq('the reader filters on the state', /ilike\('open_state', 'solved%'\)/.test(reader), true);
  eq('and excludes cancelled and re-opened at the database',
    /is\('cancelled_at', null\)/.test(reader) && /is\('reopened_at', null\)/.test(reader), true);
  eq('and it pages rather than trusting one response', /range\(from,/.test(reader), true);

  // A count over partly-loaded data is a LOWER BOUND and must say so.
  eq('the title count carries the + when the read was capped', /countMore=\{capped\}/.test(cr), true);
  eq('and so do the pane and tab counts',
    (cr.match(/capped \? '\+' : ''/g) ?? []).length >= 2, true);

  // Marking is a right, and the screen must not offer what the database will
  // refuse — nor hide the screen from someone who may read it.
  eq('the write is gated on the permission', /can\('callreview\.mark'\)/.test(cr), true);
  eq('and a reader without it is told why, not shown dead buttons',
    /\{!mayMark && \(/.test(cr) && /\{mayMark && \(/.test(cr), true);

  // The three panes the user asked for, in their order.
  eq('three panes: calls, the call, what happened on it',
    /dccr-pane-list[\s\S]*dccr-pane-review[\s\S]*dccr-pane-details/.test(cr), true);
  // THE RIGHT PANE IS A SHARED COMPONENT NOW. It was lifted out of this screen
  // when the Field Failure Register asked for the same pane (2026-09-12) — two
  // copies of "what happened on this call" would drift, and what they render is
  // a quality record. So the content is asserted where it LIVES, and this
  // screen is asserted to USE it: checking only the file it used to be in would
  // have started passing again the moment somebody inlined a second copy.
  const ctx = readFileSync('src/components/callcontext/CallContext.tsx', 'utf8');
  eq('the right pane carries the visit work AND the spares',
    /Visit work details/.test(ctx) && /Spares consumed/.test(ctx), true);
  eq('and the Call Review renders that one pane', /<CallContext\b/.test(cr), true);
  eq('rather than a second copy of it',
    /Visit work details/.test(cr) || /Spares consumed/.test(cr), false);
  // The spares are a TABLE, which is how the user asked for them.
  eq('the spares are tabular',
    /<table className="cr-spares">[\s\S]*?<th>Part<\/th>[\s\S]*?<th>Qty<\/th>/.test(ctx), true);
  eq('and the three actions are on it', /Report Reviewed/.test(cr) && /Reco/.test(cr) && /Re-open/.test(cr), true);
}

// ---------------------------------------------------------------------------
// Consumption on a call is matched by UCN **or** call number. They are written
// together, but a call registered before its number was issued carries only the
// UCN — and a review screen that silently missed those lines would report the
// opposite of the truth about what went into a machine.
{
  console.log('\n-- the review sees every consumption line --');
  const sb = readFileSync('src/lib/supabase.ts', 'utf8');
  const fn = /export async function consumptionForCall[\s\S]*?\n\}/.exec(sb)?.[0] ?? '';
  eq('matched on both keys', /ucn\.eq\.\$\{k\},call_number\.eq\.\$\{k\}/.test(fn), true);
  eq('and a row matching both is not shown twice', /seen\.has\(r\.id\)/.test(fn), true);
}

// ---------------------------------------------------------------------------
// The signed manual report is what the reviewer has come to look at, so it is
// a LINK, not 80 characters of Drive URL to copy by hand.
{
  console.log('\n-- the report link is clickable --');
  eq('an https link is one', isUrl('https://drive.google.com/file/d/1o9mfd/view'), true);
  eq('http too', isUrl('http://example.com/r.pdf'), true);
  eq('a plain answer is not', isUrl('No'), false);
  eq('nor a sentence that mentions one', isUrl('see https://x.test for the report'), false);
  eq('nor an empty field', isUrl('   '), false);
  // A Drive id tells nobody anything, so the report takes the field's name.
  eq('the report link reads as the report',
    linkLabel('Manual Report', 'https://drive.google.com/file/d/1o9mfd/view'), 'Open the report ↗');
  eq('another link keeps its host', linkLabel('Reference', 'https://example.com/a/b'), 'example.com ↗');

  // The visit fields are rendered by the shared pane, so the link rule is
  // asserted there rather than in the screen it used to sit in.
  const ctx = readFileSync('src/components/callcontext/CallContext.tsx', 'utf8');
  eq('the link opens away from the app, and cannot reach back into it',
    /target="_blank" rel="noopener noreferrer"/.test(ctx), true);
}

// ---------------------------------------------------------------------------
// ADDING A ROLE FROM THE APP.
// The rule that matters is that a role can NEVER be created empty: has_perm()
// falls back to the ENGINEER's permissions for a role whose row is an empty
// array (0008), so an empty role does not grant nothing — it silently grants
// an engineer's writes to everyone put on it.
{
  console.log('\n-- a role added from the app is never empty --');
  const have = ['admin', 'engineer', 'rm'];
  eq('a role with no source is refused',
    roleProblem('regional_coordinator', 'Regional Coordinator', have, '') !== null, true);
  eq('and the message says to copy one',
    /copy from/i.test(roleProblem('x_role', 'X Role', have, '') ?? ''), true);
  eq('with a source it is allowed',
    roleProblem('regional_coordinator', 'Regional Coordinator', have, 'rm'), null);

  eq('an unnamed role is refused', roleProblem('', '', have, 'rm') !== null, true);
  eq('a duplicate key is refused', roleProblem('engineer', 'Engineer', have, 'rm') !== null, true);
  eq('a reserved key is refused', roleProblem('admin', 'Admin', [], 'rm') !== null, true);
  eq('and every reserved key really is', RESERVED_ROLE_KEYS.includes('admin'), true);
  eq('a key starting with a digit is refused', roleProblem('2nd_line', '2nd Line', have, 'rm') !== null, true);

  // The key is a database value that appears in policies and in every user's
  // profile, so it is a slug.
  eq('the key is slugged from the name', roleKeyFrom('Regional Coordinator'), 'regional_coordinator');
  eq('punctuation and spaces do not survive it', roleKeyFrom('  Zonal / Area  Head! '), 'zonal_area_head');
  eq('a name with nothing usable gives no key', roleKeyFrom('!!! ???'), '');

  // A role the database has and the code does not must still be offered
  // everywhere, or it is a role nobody can be put on.
  const merged = rolesWith(['engineer', 'regional_coordinator']);
  eq('a stored role joins the list', merged.some((r) => r.key === 'regional_coordinator'), true);
  eq('a built-in role is not duplicated by it',
    merged.filter((r) => r.key === 'engineer').length, 1);
  eq('and it gets a readable label', roleLabelFor('regional_coordinator'), 'Regional Coordinator');
  eq('a built-in keeps its own label', roleLabelFor('rm'), 'Reporting Manager');

  // The pickers must ask for the merged list, not the code's.
  const um = readFileSync('src/modules/UserMasterView.tsx', 'utf8');
  eq('the User Master pickers offer every role',
    (um.match(/options=\{roleOptions\} \/>/g) ?? []).length, 3);
  eq('and the options come from the stored keys', /rolesWith\(Object\.keys\(rolePerms/.test(um), true);
  const rp = readFileSync('src/modules/RolePermissions.tsx', 'utf8');
  eq('the matrix draws a column per stored role, not per coded one',
    /roles\.map\(\(r\) => <th/.test(rp) && !/ROLES\.map\(\(r\) => <th/.test(rp), true);
  eq('and saving walks the same list', /for \(const r of roles\)/.test(rp), true);
}

// ---------------------------------------------------------------------------
// A READ POLICY ASKS ITS QUESTIONS ONCE PER QUERY, NOT ONCE PER ROW.
// Reported 2026-09-11 as "the Party drop-down keeps failing for the engineers,
// it works fine for me". cr_read called can_view_all_calls(), auth.uid() and
// auth.email() BARE, so each ran for every row of call_requests. The OR
// short-circuits at is_admin() for an administrator and not for an engineer,
// which is exactly why one person saw it and the other did not. Measured on
// 3,000 requests: engineer 1,840 ms -> 7.4 ms, admin 189 ms -> 5.5 ms.
//
// The cost is the WHOLE TABLE, not what the reader sees: an engineer entitled
// to 112 requests still makes the database test every row to find them.
{
  console.log('\n-- the call-request read policy is an InitPlan --');
  const sql = readFileSync('supabase/migrations/0164_cr_read_initplan.sql', 'utf8');
  const body = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

  // Each helper wrapped as (select f()) — that is what makes it an InitPlan.
  for (const fn of ['public.can_view_all_calls()', 'auth.uid()', 'auth.email()']) {
    eq(`${fn} is wrapped`, new RegExp(`\\(\\s*select\\s+${fn.replace(/[.()]/g, '\\$&')}`, 'i').test(body), true);
  }
  // …and none of them left bare. A bare call is the defect itself.
  const bare = body.replace(/\(\s*select\s+[a-z_.]+\(\)/gi, '(');
  eq('no helper is left calling per row',
    /\b(can_view_all_calls|auth\.uid|auth\.email|is_admin|has_perm)\s*\(/i.test(bare), false);

  // It only holds if it runs LAST in its module: 0003 and 0053 both define
  // cr_read, and the bundles are replayed one at a time.
  const gen = readFileSync('scripts/build-apply-bundles.mjs', 'utf8');
  const files = /call_requests: \{[\s\S]*?files: \[([\s\S]*?)\n    \]/.exec(gen)?.[1] ?? '';
  const list = [...files.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  eq('the fix is last in the call_requests module', list[list.length - 1], '0164_cr_read_initplan.sql');
  eq('and the earlier definitions it must outrank are in the same module',
    list.includes('0053_call_requests_view_all.sql'), true);
}

// ---------------------------------------------------------------------------
// THE CUSTOMER SEARCH DOES NOT AGGREGATE.
// Reported 2026-09-11: the Party picker timed out on a phone ("Vada") while the
// PRODUCT picker beside it stayed instant. The difference is structural, not
// network: the product list is ~40 names, fetched ONCE and filtered in the
// browser, so there is no product search at all; the customers are ~4,851 names
// over 19,253 machines, so every keystroke went to the server -- through a
// GROUP BY over the whole register, which cannot stop early.
{
  console.log('\n-- the customer search is bounded, and complete --');
  const sb = readFileSync('src/lib/supabase.ts', 'utf8');
  const fn = /export async function sbSearchProductParties[\s\S]*?\n\}/.exec(sb)?.[0] ?? '';

  eq('it no longer reads the aggregate view', /product_party_names/.test(fn), false);
  eq('it reads the rows and caps them', /\.limit\(PARTY_SCAN_CAP\)/.test(fn), true);
  eq('and collapses the duplicates itself', /seen\.has\(k\)/.test(fn), true);
  // Ordering a FILTERED read defeats the cap: it must find every match to sort.
  eq('the filtered read is not ordered by the database',
    /term \? q\.ilike\([^)]*\) : q\.order\('party_name'\)/.test(fn), true);
  eq('so the names are sorted here instead', /out\.sort\(/.test(fn), true);

  // THE CAP IS ONLY SAFE BECAUSE THE OTHER SIDE IS COMPLETE. A capped read can
  // miss a customer past the cap — the fault that hid KARUNALAYA TRUST. The
  // Party Master read is one ordered row per customer, so it carries the
  // guarantee; this one carries owner-priority. Both must therefore RUN.
  const call = /export async function sbSearchPartiesForCall[\s\S]*?\n\}/.exec(sb)?.[0] ?? '';
  eq('both sources are queried', /sbSearchProductParties\(/.test(call) && /sbSearchParties\(/.test(call), true);
  eq('and together, not one waiting on the other', /Promise\.allSettled/.test(call), true);
  eq('owners still lead, so the product cascade works',
    call.indexOf('sbSearchProductParties(') < call.indexOf('sbSearchParties('), true);
  // One failing source must not blank the list; only both failing is a failure.
  eq('a single failure still answers',
    /ownersR\.status === 'rejected' && masterR\.status === 'rejected'/.test(call), true);
  eq('and the master-only names stay flagged as owning no machine',
    /extras\.forEach\(\(v\) => nonOwners\.add/.test(call), true);
}

// ---------------------------------------------------------------------------
// THE MACHINE NAMES THE CUSTOMER (the user's design, 2026-09-11).
// The old order asked for the customer FIRST — an infix search over ~5,000
// names, which is the search that kept timing out on a phone. A serial is a
// prefix on an indexed column (0.21 ms over all 19,253 machines) and it is what
// the engineer is holding. So Product + Serial now fetch the customer, per row.
{
  console.log('\n-- the machine names the customer --');
  const rq = readFileSync('src/modules/RequestCallRegistration.tsx', 'utf8');

  // Per row, and carried to the database per row.
  eq('a call row carries its own customer and city',
    /product: '', serial: '', party: '', city: ''/.test(rq), true);
  const sb = readFileSync('src/lib/supabase.ts', 'utf8');
  const cols = /const itemCols = [\s\S]*?\n\}\);/.exec(sb)?.[0] ?? '';
  eq('and the row writes them', /party_name: it\.party/.test(cols) && /city: it\.city/.test(cols), true);
  // An installation row has neither; writing '' would blank what the form asked.
  eq('but only when the row actually has one',
    /it\.party\?\.trim\(\) \? \{ party_name/.test(cols), true);

  // The customer field is the INSTALLATION's alone now — there is no machine on
  // the register for a new install, so the question still has to be asked.
  eq('the customer box is shown only for an installation',
    /\{isInstall && field\('Party Name \*'/.test(rq), true);
  eq('and so is the City box', /\{isInstall && field\('City'/.test(rq), true);
  eq('the customer is required only where it is asked for',
    /isInstall && !f\.partyName\.trim\(\)/.test(rq), true);

  // THE RULE, RUN WITH REAL INPUTS. The first version of this check tested that
  // the identifier `noParty` appeared in the source — which it still did after
  // the rule was replaced with `-1`. A regex proves a line is present, not that
  // it fires.
  const ok = { product: 'MONNAL T75', serial: '10915', party: 'JAIPUR HOSPITAL' };
  eq('a machine that named its customer is accepted', machineRowProblem([ok], false), null);
  eq('a serial that named no customer is refused',
    machineRowProblem([{ ...ok, party: '' }], false) !== null, true);
  eq('and a whitespace customer is not a customer',
    machineRowProblem([{ ...ok, party: '   ' }], false) !== null, true);
  // "Product Database" since 2026-09-14 — the install base's name. The
  // Product Master is now the CATALOGUE of product lines, a different register.
  eq('the message says where to go next',
    /Product Database/.test(machineRowProblem([{ ...ok, party: '' }], false) ?? ''), true);
  // An INSTALLATION has no machine on the register — that is why it still asks.
  eq('an installation is exempt', machineRowProblem([{ ...ok, party: '' }], true), null);
  // One machine, one call — the check spans customers now.
  eq('the same machine twice is refused',
    machineRowProblem([ok, { ...ok, party: 'ANOTHER HOSPITAL' }], false) !== null, true);
  eq('and it names which row it clashes with',
    /already on this request as call 1/.test(machineRowProblem([ok, ok], false) ?? ''), true);
  eq('two different machines are fine',
    machineRowProblem([ok, { ...ok, serial: '10916' }], false), null);
  eq('an empty row is not a duplicate of another empty row',
    machineRowProblem([{ product: '', serial: '', party: '' }, { product: '', serial: '', party: '' }], false), null);
  eq('and the form asks the rule rather than restating it',
    /machineRowProblem\(filled, isInstall\)/.test(rq), true);

  // The serial search must span customers — narrowing it by party would put
  // the slow search back in front of the fast one.
  const fn = /export async function sbSearchMachines[\s\S]*?\n\}/.exec(sb)?.[0] ?? '';
  // THE CUSTOMER FILTER IS OPTIONAL, AND THAT IS THE POINT.
  //
  // This began as "the machine search is never narrowed by customer", which
  // protected something real: finding a customer is an infix search over ~5,000
  // names and it must never come BEFORE the machine search — that ordering is
  // what timed out on a phone. Since 2026-09-12 calls 2..5 DO narrow, because
  // call 1 has already established the customer for nothing extra.
  //
  // So the rule is not "never" but "never REQUIRED": the filter must stay
  // conditional, and call 1 must pass no customer at all. An unconditional
  // party filter would put the search back in the wrong order.
  // (NOT split('return')[0] — the function's first `return` is its opening
  // guard, so an earlier version of this examined one line and could never
  // have failed.)
  eq('the customer filter is conditional, never unconditional',
    /if \(party\.trim\(\)\) q = q\.eq\('party_name'/.test(fn), true);
  eq('and there is no other party filter in it',
    (fn.match(/\.(eq|ilike)\('party_name'/g) ?? []).length, 1);
  eq('it filters by product when there is one', /\.eq\('item_name'/.test(fn), true);
  eq('and it is capped so a short serial costs no more than a precise one',
    /\.limit\(limit\)/.test(fn), true);
  eq('it returns the customer with the machine',
    /party: String\(r\.party_name/.test(fn) && /city: String\(ex\['City'\]/.test(fn), true);

  // One machine cannot be two calls on a request — and that check now has to
  // span customers, because the rows may be for different ones.
  eq('the duplicate-machine check is by serial alone',
    /const serialTakenElsewhere = \(serial: string, forIndex: number\)/.test(rq), true);
}

// ---------------------------------------------------------------------------
// THE MACHINE ROW'S LAYOUT. Three separate faults, reported together
// 2026-09-12 ("fix this whole thing in one go"), each of which made the new
// flow read as broken even though it worked.
{
  console.log('\n-- the machine row lays out --');
  const rq = readFileSync('src/modules/RequestCallRegistration.tsx', 'utf8');
  const css = readFileSync('src/modules/fieldcalls.css', 'utf8');
  const pl = readFileSync('src/components/ui/PickList.tsx', 'utf8');

  // 1. The CLOSED box shows the machine, not the decorated row. Undecorated it
  //    became two wrapped lines of hospital name in a field labelled Serial No.
  eq('the serial box shows the serial alone', /plainValue\n/.test(rq) || /plainValue$/m.test(rq), true);
  eq('and PickList honours that for both closed states',
    (pl.match(/plainValue \? value : \(labelFor\?\.\(value\) \?\? value\)/g) ?? []).length, 2);
  // Spare Consumption still WANTS the decoration ("part — 3 in hand"), so the
  // default must stay decorated.
  eq('a picker that does not ask still gets its label',
    /plainValue\?: boolean;/.test(pl), true);

  // 2. The resolved customer spans the row. It did not, because .rep-span2
  //    only spans when paired with .rep-field — so it sat in the left column
  //    and pushed the complaint into the right one.
  const line = /\.req-machine-party \{[^}]*\}/.exec(css)?.[0] ?? '';
  eq('the customer line spans the row on its own', /grid-column: 1 \/ -1/.test(line), true);
  // 3. …and it must NOT borrow .rep-field, which is a flex COLUMN: that stacked
  //    "Customer:" and the name onto separate lines.
  eq('and does not inherit the flex column', /className="req-machine-party"/.test(rq), true);
  eq('so it is not also a rep-field', /rep-field[^"]*req-machine-party/.test(rq), false);

  // 4. THE WHOLE SITE BLOCK IS THE INSTALLATION'S. On a field or PM call the
  //    customer, city, state, address and contact are all per call, so a
  //    request cannot carry one site at the top — the section is not rendered
  //    at all rather than sitting there empty or mislabelled.
  eq('the site block is gated on the installation path',
    /\{isInstall && \(\n\s*<section className="rep-sec">/.test(rq), true);
  // …and those five fields are on the ROW instead.
  for (const f of ['City', 'State', 'Address', 'Customer Contact Details', 'Customer Contact Number']) {
    eq(`"${f}" is asked per call`,
      new RegExp(`field\\('${f}',[\\s\\S]{0,200}setItem\\(i, '`).test(rq), true);
  }
}

// ---------------------------------------------------------------------------
// FIVE CALLS, FIVE SEARCHES. The machine results were held in ONE variable for
// the whole form, so a search in call 2 replaced call 1's options — and picking
// in call 1 then found no machine, giving that row a serial with NO CUSTOMER
// and a request refused for a serial that is on the register.
{
  console.log('\n-- each call keeps its own machine results --');
  const rq = readFileSync('src/modules/RequestCallRegistration.tsx', 'utf8');

  eq('the results are held per row', /useState<Record<number, MachineHit\[\]>>\(\{\}\)/.test(rq), true);
  eq('and written under that row', /setMachineHits\(\(h\) => \(\{ \.\.\.h, \[i\]: hits \}\)\)/.test(rq), true);
  // Every read must go through the per-row accessor; one stray shared read
  // brings the whole fault back.
  eq('every read is scoped to the row',
    /machineHits\.(find|map)\(/.test(rq), false);
  eq('the options come from this row', /withCurrent\(hitsFor\(i\)/.test(rq), true);
  eq('and so does the pick', /hitsFor\(i\)\.find/.test(rq), true);

  // CHANGING THE PRODUCT DROPS THE WHOLE MACHINE. It used to clear only the
  // serial, leaving the previous machine's customer and site on the row — and
  // takeMachine deliberately keeps what is already there, so the OLD site would
  // have stuck to the NEW machine.
  eq('changing the product clears the machine it resolved',
    /product: v, serial: '', party: '', city: '', state: '', address: ''/.test(rq), true);

  // …and the product box no longer tells anybody to pick a party first.
  eq('the product box does not ask for a party that is gone',
    /pick a Party first/.test(rq), false);
  eq('nor mentions the party having no products', /no products for this party/.test(rq), false);
}

// ---------------------------------------------------------------------------
// THE FIRST CALL FIXES THE CUSTOMER FOR THE REQUEST (the user's rule,
// 2026-09-12). A request is one visit to one site: once call 1 has named the
// customer, the later calls look among THAT customer's machines and share its
// site and contact.
{
  console.log('\n-- call 1 sets the customer for the rest --');
  const rq = readFileSync('src/modules/RequestCallRegistration.tsx', 'utf8');
  const sb = readFileSync('src/lib/supabase.ts', 'utf8');

  eq('the request takes its customer from call 1',
    /const lockedParty = \(items\[0\]\?\.party \?\? ''\)\.trim\(\)/.test(rq), true);

  // A new call inherits rather than asking for the same hospital five times.
  eq('a new call inherits the customer', /\.\.\.fresh, \.\.\.customerOf\(s\[0\]\)/.test(rq), true);
  eq('and it inherits the whole site, not just the name',
    /party: it\.party[\s\S]{0,240}contactNumber: it\.contactNumber/.test(rq), true);

  // The product list narrows to what that customer owns…
  // NO SILENT FALLBACK TO THE WHOLE REGISTER. The first version fell back to
  // every product when the customer's list came back empty — and it came back
  // empty, because it was loaded through a DIFFERENT match rule from the one
  // the serial search uses. Call 2 then offered every product in the company
  // (reported 2026-09-12) and the fallback is what hid the cause.
  // Comments stripped: this file EXPLAINS the paths it stopped using, and an
  // assertion that reads the prose would fail on its own documentation.
  const rqCode = rq.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  eq('calls 2+ are narrowed to the customer',
    /const narrowed = !isInstall && i > 0 && !!lockedParty;/.test(rq), true);
  // THE PROPERTY: once narrowed, the list is this customer's or it is EMPTY.
  // It is never widened back to the register — that is what hid the fault.
  eq('and a narrowed list is never widened to the register',
    /const list = narrowed \? \(ownedState === 'ready' \? ownedProducts : \[\]\) : productOptions;/.test(rq), true);
  eq('so productOptions appears once, on the un-narrowed side',
    (rqCode.match(/: productOptions;/g) ?? []).length, 1);
  // WHAT THE BOX READS, run with real inputs. THE RULE THAT BROKE: a message
  // explaining an empty list must appear ONLY when the list is empty. Used as
  // the placeholder outright it read "<customer> has no machines on the
  // register" over a good list of two, contradicting the dropdown beneath it.
  const P = (o: Partial<Parameters<typeof productPlaceholder>[0]>) => productPlaceholder({
    isInstall: false, isFirstCall: false, party: 'HKSD SARVODAYA', state: 'ready', count: 2, ...o,
  });
  eq('a list with options just says pick one', P({}), PICK_A_PRODUCT);
  eq('and the no-machines message appears ONLY when there are none',
    /no machines found for HKSD SARVODAYA/.test(P({ count: 0 })), true);
  eq('loading says loading, not "no machines"',
    /loading HKSD SARVODAYA/.test(P({ state: 'loading', count: 0 })), true);
  eq('a failure says so rather than blaming the customer',
    /could not load/.test(P({ state: 'failed', count: 0 })), true);
  // Call 1 is not narrowed, so it never carries a customer's name…
  eq('call 1 just says pick a product', P({ isFirstCall: true, count: 0 }), PICK_A_PRODUCT);
  eq('…and neither does a call with no customer yet', P({ party: '  ', count: 0 }), PICK_A_PRODUCT);
  eq('an installation names the register it picks from',
    /Product Database/.test(P({ isInstall: true, count: 0 })), true);
  eq('and the form asks the rule rather than restating it',
    /placeholder: productPlaceholder\(\{/.test(rq), true);
  // ONE MATCH RULE. The owned list and the serial search must agree, so both go
  // through sbSearchMachines' equality on the column the name came from.
  eq('the owned list is read the same way the serials are',
    /sbSearchMachines\('', '', 500, lockedParty\)/.test(rq), true);
  eq('and not through the ilike path that disagreed with it',
    /sbListPartyItems/.test(rqCode), false);
  // …and the serial search is party + product.
  eq('and the serial search is narrowed by customer too',
    /sbSearchMachines\(it\.product, qq, 50, i > 0 \? lockedParty : ''\)/.test(rq), true);
  const fn = /export async function sbSearchMachines[\s\S]*?\n\}/.exec(sb)?.[0] ?? '';
  eq('the search takes a customer and filters on equality',
    /if \(party\.trim\(\)\) q = q\.eq\('party_name', party\.trim\(\)\)/.test(fn), true);
  // Call 1 must NOT be narrowed — there is no customer yet, and narrowing it
  // would put the customer search back in front of the machine search.
  eq('call 1 is not narrowed', /i > 0 \? lockedParty : ''/.test(rq), true);

  // CHANGING CALL 1'S CUSTOMER cannot leave another call pointing at a machine
  // the new customer does not own.
  eq('a machine belonging to the replaced customer is cleared',
    /staleMachine\s*\n?\s*\? \{ \.\.\.it, \.\.\.src, product: '', serial: '' \}/.test(rq), true);
  eq('and the rest just take the new details', /: \{ \.\.\.it, \.\.\.src \}/.test(rq), true);
}

// ---------------------------------------------------------------------------
// THE FIELD FAILURE REGISTER. Format: the Field_Failure_Register workbook's
// 2026 tab. Report: R-SER-03 Rev 02.
{
  console.log('\n-- the field failure register --');

  // The register is the SHEET's columns in the SHEET's order, so somebody who
  // has used it for years reads the same thing. The AutoCrat plumbing columns
  // are deliberately absent: they exist to make a spreadsheet behave like an
  // application, and the document is generated here.
  const heads = FFR_COLUMNS.map((c) => c.header);
  eq('the register leads with the FFR number and its date',
    heads.slice(0, 2), ['FFR NO: (No/Yr)', 'FFR Date']);
  for (const h of ['CRN NO', 'Customer Name', 'Product S. No', 'Problem reported by customer',
                   'Service Dept Observation', 'SPARES CONSUMED']) {
    eq(`the sheet's "${h}" is carried`, heads.includes(h), true);
  }
  for (const h of ['Merged Doc ID - FFR-2022', 'Document Merge Status - FFR-2022', 'Add Attachments',
                   'Raise CAPA', 'Update(Link)']) {
    eq(`the AutoCrat column "${h}" is not`, heads.includes(h), false);
  }
  eq('every column maps to a stored field', FFR_COLUMNS.every((c) => /^[a-z_]+$/.test(c.key)), true);

  // THE REVIEW FILLS THE REPORT IN, and the mapping was checked against the 35
  // rows already in the 2026 tab rather than guessed.
  const fromCall = ffrFromReview({
    ucn: '26I10F0002', reg_date: '2026-01-09', party_name: 'DHANVANTRI', city: 'MEERUT',
    product_name: 'MONNAL T75', serial: '11125', item_status: 'WGP',
    warranty_start: '2025-07-08',
    complaint_reported: 'Alarm 030', open_state: 'Solved', call_type: 'FIELD',
    service_observation: 'Alarm 030 confirmed by the engineer',
    job_done: 'Replaced the solenoid valve unit',
    visit_details: '13-Jan-2026 : Replaced spare, calibrated, unit working',
    spares_consumed: 'KY560500|SOLENOID VALVE UNIT-MT75',
    last_visit_at: '2026-01-13T00:00:00Z',
  });
  eq('the call names the machine and the customer',
    [fromCall.ucn, fromCall.customer_name, fromCall.product_serial, fromCall.cover],
    ['26I10F0002', 'DHANVANTRI', '11125', 'WGP']);
  eq('and the complaint becomes the problem reported', fromCall.problem_reported, 'Alarm 030');
  // REVIEW 3's OWN FIELD is headed "Service Dept Observation" — the FFR column
  // of that name. Re-deriving it from the visit is how the review and the
  // report come to disagree about one failure.
  eq('the review\u2019s Service Dept Observation carries straight across',
    fromCall.service_observation, 'Alarm 030 confirmed by the engineer');
  eq('the visit list is already the sheet\u2019s VISIT REMARKS format',
    fromCall.visit_remarks, '13-Jan-2026 : Replaced spare, calibrated, unit working');
  eq('the spares come joined, not re-fetched',
    fromCall.spares_consumed, 'KY560500|SOLENOID VALVE UNIT-MT75');
  // Filled in all 35 rows of the sheet, and the register keeps it as the
  // warranty start.
  eq('the installation date is filled from the machine', fromCall.installation_date, '2025-07-08');
  // The sheet's own defaults, from its LookupValues tab.
  eq('the CAPA columns take the sheet\u2019s defaults',
    [fromCall.capa_responsibility, fromCall.capa_no, fromCall.capa_status],
    ['No closed in FFR', 'NA', 'Not required']);
  eq('and the source is the only one the 2026 tab uses', fromCall.source, 'PC');
  // A status the register already uses and the picker will not offer is a value
  // somebody has to work around.
  // THE UPDATE FORM'S OWN LIST (the screenshots, 2026-09-12). 'NA' is on the
  // sheet's older LookupValues tab but NOT on the form, and the form is the
  // instrument in use — a historic row carrying it still displays, because the
  // column takes no CHECK constraint (0152's lesson).
  for (const st of ['Not required', 'Open', 'In-Progress', 'Closed', 'TBD']) {
    eq(`"${st}" is offered as a CAPA status`, FFR_CAPA_STATUS.includes(st), true);
  }
  // Every one of the 35 is a solved call — said, not enforced.
  eq('an unsolved call is flagged', ffrCallNotSolved('Unsolved'), true);
  eq('a solved one is not', ffrCallNotSolved('Solved - Report Completed'), false);
  // THE NUMBER IS NEVER SENT. It is issued by the database and seeded past what
  // is already on the sheet; a client-chosen one could collide with FFR - 035/26.
  eq('no FFR number is sent from the client', 'ffr_no' in fromCall, false);
  eq('nor a raiser', 'raised_by' in fromCall, false);

  // THE DOCUMENT. One mapping from the register row, so the register and the
  // report cannot disagree about what a box contains.
  const row = {
    ffr_no: 'FFR - 036/26', ffr_date: '12-Sep-2026', customer_name: 'DHANVANTRI', place: 'MEERUT',
    ucn: '26A09F0040', crn_date: '09-Jan-2026', product_name: 'MONNAL T75', item_code: 'MT75',
    product_serial: '11125', cover: 'WGP', problem_reported: 'Alarm 030',
    additional_problem: '', service_observation: 'Line one\nLine two', problem_status: 'Solved',
    capa_no: '', raised_by_name: 'P.M.Bagyaraj',
  };
  const f = ffrDocFrom(row, '');
  eq('the report takes the register\u2019s number', f.ffrNo, 'FFR - 036/26');
  eq('the UCN fills the CRN box', f.crnNo, '26A09F0040');
  eq('an empty CAPA reads NA rather than blank', f.capaNo, 'NA');
  eq('and it is a real number shape', FFR_NO_SHAPE.test(f.ffrNo), true);

  // The file is a ZIP of XML and must actually be one — a .docx Word refuses to
  // open is worse than no button.
  const bytes = buildFfrDocx(f);
  eq('the document is a ZIP', [bytes[0], bytes[1], bytes[2], bytes[3]], [0x50, 0x4b, 0x03, 0x04]);
  const text = new TextDecoder().decode(bytes);
  eq('it declares the WordprocessingML part',
    text.includes('wordprocessingml.document.main+xml'), true);
  // THE FORM'S OWN IDENTITY, as the template prints it in its footer. This used
  // to look for 'R-SER-03' — the name of the form, which the template does not
  // actually put anywhere. Now it tests the string the controlled document
  // carries, so the check would fail if the footer were dropped.
  eq('and carries the controlled form it follows',
    text.includes('TMPL No: R/SER/03 Rev: MAR 2020'), true);
  eq('with the header band on every page',
    text.includes('FIELD FAILURE REPORT') && text.includes('AIR LIQUIDE MEDICAL SYSTEMS PVT. LTD.'), true);
  eq('and the page numbered by a field, not a literal', text.includes(' PAGE '), true);
  // A newline inside <w:t> is whitespace, not a line break — the observation is
  // where somebody notices, so multi-line text becomes separate paragraphs.
  eq('a multi-line observation becomes paragraphs, not one run',
    text.includes('Line one') && text.includes('Line two') && !text.includes('Line one\nLine two'), true);
  // The name is the register's own, with the slash made safe for a file system.
  eq('the file is named as the register names it',
    ffrDocName(f), 'FFR - 036-26 - MONNAL T75 ( 11125 ).docx');
  eq('and carries no path separator', /[\\/:*?"<>|]/.test(ffrDocName(f).replace(/\.docx$/, '')), false);

  // RAISED FROM THE DAILY CALL REVIEW, which is where the decision is made.
  const dcr = readFileSync('src/modules/DailyCallReview.tsx', 'utf8');
  eq('the review offers to raise one', /Raise FFR/.test(dcr), true);
  eq('and hands the call over rather than making the person re-type it',
    /state: \{ ffrFromCall: \{/.test(dcr), true);
  // The WHOLE row's worth: a subset would make the FFR screen fetch again.
  //
  // SCOPED TO THE HAND-OVER BLOCK. The first version tested the whole file and
  // passed with the line deleted, because `service_observation: row.service_
  // observation` also appears where the review's own draft is initialised —
  // an assertion that matches a different line is not an assertion.
  const handover = /state: \{ ffrFromCall: \{[\s\S]*?last_visit_at: row\.last_visit_at,/.exec(dcr)?.[0] ?? '';
  eq('the hand-over block was found', handover.length > 200, true);
  for (const f of ['service_observation', 'visit_details', 'spares_consumed', 'warranty_start', 'job_done']) {
    eq(`the review hands over ${f}`, new RegExp(`${f}: row\\.${f}`).test(handover), true);
  }
  const ffrMod = readFileSync('src/modules/FieldFailureReport.tsx', 'utf8');
  eq('so the report does not re-read the visits',
    /reportsByCall|consumptionForCall/.test(ffrMod), false);
  eq('it is gated on its own right, not on review.edit', /canDo\('ffr\.manage'\)/.test(dcr), true);
  eq('and an existing report for that call is shown, not hidden',
    /ffrsForCall\(/.test(dcr) && /Already reported/.test(dcr), true);
}

// ---------------------------------------------------------------------------
// THE REVIEW RAISES THE FFR, NOT A BUTTON (the user's rule, 2026-09-12).
// `any_potential_effect` is a GENERATED column — YES when any of Risk to
// Patient / Warranty Failure / Frequent Failure is YES, blank while any is
// unanswered — so the answer is made by writing the review, and the report must
// follow it. A register that depends on a screen being opened has holes in it.
{
  console.log('\n-- the review raises the FFR --');
  const sql = readFileSync('supabase/migrations/0167_ffr_from_review.sql', 'utf8');
  const body = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

  eq('it fires on the review, not on a screen',
    /create trigger zz_ffr_from_review after insert or update on public\.call_reviews/.test(body), true);
  eq('only on YES', /upper\(coalesce\(btrim\(new\.any_potential_effect\), ''\)\) <> 'YES'/.test(body), true);
  // ONE FFR PER CALL. Review 2 is edited, re-saved and corrected; every write
  // fires this and all but the first must do nothing.
  eq('and only once per call',
    /if exists \(select 1 from public\.field_failure_reports f where f\.ucn = v_ucn\) then return new/.test(body), true);
  // THE DATE IS REVIEW 2's COMPLETION (the user's rule), not the day the row
  // happened to be written.
  eq('the FFR date is the review 2 completion date',
    /coalesce\(new\.review2_at,/.test(body), true);
  // Reading the `calls` VIEW inside a definer would apply the CALLER's policies
  // — a call the trigger cannot see is an FFR it fails to raise, silently, for
  // exactly the reviewer whose answer triggered it (0125's reasoning).
  eq('it reads the base tables, not the calls view',
    /from public\.field_calls where ucn = v_ucn/.test(body)
      && !/from public\.calls\b/.test(body.split('create or replace view')[0]), true);
  // WHY it was raised is kept: "Any Potential Effect = YES" does not say WHICH.
  for (const k of ['risk_to_patient', 'warranty_failure', 'frequent_failure']) {
    eq(`the record keeps ${k}`, new RegExp(`'${k}', coalesce\\(new\\.${k}`).test(body), true);
  }
  // A quality record is not deleted because somebody revised an opinion.
  eq('nothing deletes the FFR when the answer changes',
    /delete from public\.field_failure_reports/.test(body), false);

  // THE LIVE CALL BESIDE THE RECORD, which is what the register is read for.
  // DROPPED AND RECREATED, not `create or replace` — 0197 widens this view, and
  // a replace can only ADD columns, so replaying the bundle onto a database
  // already carrying the wider one failed with "cannot drop columns from view".
  // Both definitions drop first now, which is the property a bundle needs: a
  // statement true whatever shape the view is in when it runs.
  eq('the register view carries the live call',
    /drop view if exists public\.field_failure_register;\s*\ncreate view public\.field_failure_register/.test(body), true);
  eq('and applies RLS to the reader', /security_invoker = on/.test(body), true);
  const sb = readFileSync('src/lib/supabase.ts', 'utf8');
  eq('the screen reads the view, not the bare table',
    /from\('field_failure_register'\)/.test(sb), true);

  // The live columns are SEPARATE from the record's — a reader has to be able
  // to tell which is the report and which is today.
  eq('the live columns are their own set', FFR_LIVE_COLUMNS.length >= 8, true);
  eq('and none of them collides with a record column',
    FFR_LIVE_COLUMNS.some((c) => FFR_COLUMNS.some((r) => r.key === c.key)), false);
  eq('every live column is named "(now)" or is a review answer',
    FFR_LIVE_COLUMNS.every((c) => /\(now\)|Risk|Warranty|Frequent|Grouping|Root Cause|Spare \//.test(c.header)), true);

  // An FFR raised on YES whose review now reads NO: the record stands, and a
  // reader should see it at a glance.
  const raised = { extra: { raised_by_rule: 'any_potential_effect=YES' } };
  eq('a withdrawn finding is flagged',
    ffrEffectWithdrawn({ ...raised, live_any_potential_effect: 'NO' }), true);
  eq('one that still says YES is not',
    ffrEffectWithdrawn({ ...raised, live_any_potential_effect: 'YES' }), false);
  eq('an unanswered review is not "withdrawn"',
    ffrEffectWithdrawn({ ...raised, live_any_potential_effect: '' }), false);
  eq('and a hand-raised FFR is never flagged',
    ffrEffectWithdrawn({ extra: {}, live_any_potential_effect: 'NO' }), false);
}

// ---------------------------------------------------------------------------
// NO HOOK AFTER AN EARLY RETURN.
//
// React counts hooks per render, so a hook below a conditional `return` makes
// the count depend on the condition — and a count that changes between renders
// is error #310, a white screen with a stack trace. The Daily Call Review hit
// exactly that on its View button (reported 2026-09-12): `if (!row) return
// null` sat above two useEffects, so the component ran seven hooks with a call
// selected and five without.
//
// Checked across every module, not just the one that broke: this is a whole
// CLASS of fault and the next one will be somewhere else.
{
  console.log('\n-- no hook sits after an early return --');
  const HOOK = /\b(useState|useEffect|useMemo|useRef|useCallback|useLayoutEffect|useNavigate|useLocation|useAuth|useTeamEngineers|useMaster|useCallStates)\s*\(/;
  // A `return` that ends a component, as opposed to one inside a callback: at
  // the component's own indentation, two spaces.
  const EARLY_RETURN = /^ {2}(if \s*\(.*\)\s*)?return\b/;
  const offenders: string[] = [];

  for (const file of readdirSync('src/modules').filter((f) => f.endsWith('.tsx'))) {
    const lines = readFileSync(`src/modules/${file}`, 'utf8').split('\n');
    let seenReturn = 0;
    lines.forEach((line, i) => {
      // A new component resets the reckoning.
      if (/^(export )?function [A-Z]/.test(line)) seenReturn = 0;
      if (EARLY_RETURN.test(line) && !/^ {2}return \(/.test(line)) seenReturn = i + 1;
      if (seenReturn && HOOK.test(line) && !/^\s*(\/\/|\*)/.test(line)) {
        offenders.push(`${file}:${i + 1} (after the return on line ${seenReturn})`);
      }
    });
  }
  eq('no module calls a hook below a conditional return', offenders, []);
}

// ---------------------------------------------------------------------------
// THE CATCH-UP ("create all the FFRs till date", 2026-09-12). Every review
// already answered YES before 0167 shipped has no report; this raises them.
{
  console.log('\n-- the FFR back-fill --');
  const sql = readFileSync('supabase/migrations/0169_ffr_backfill.sql', 'utf8');
  const body = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

  // ONE CODE PATH. The trigger and the back-fill must produce identical
  // records, or the catch-up is a second, subtly different register.
  eq('the record has one definition', /create or replace function public\.raise_ffr/.test(body), true);
  eq('and the trigger calls it', /perform public\.raise_ffr\(new\)/.test(body), true);
  eq('as does the back-fill', /v_no := public\.raise_ffr\(r\)/.test(body), true);

  // THE NUMBER IS IN THE REVIEW'S YEAR. A 2025 review numbered /26 is wrong on
  // the face of the document.
  eq('the number takes a year', /next_ffr_no\(p_yr smallint default null\)/.test(body), true);
  eq('and the year comes from the FFR date',
    /next_ffr_no\(\(extract\(year from v_date\)::int % 100\)::smallint\)/.test(body), true);
  // The old zero-argument signature must GO, or the call site is ambiguous
  // between two functions and Postgres refuses it.
  eq('the old signature is dropped', /drop function if exists public\.next_ffr_no\(\);/.test(body), true);

  // DRY RUN BY DEFAULT: the numbers are permanent, and a count discovered
  // afterwards is discovered too late.
  eq('it reports before it writes',
    /backfill_ffrs\(p_dry_run boolean default true\)/.test(body), true);
  // …and a dry run must not consume numbers: a reserved-and-unused number is a
  // gap in a numbered series that somebody has to explain.
  const dry = /if p_dry_run then[\s\S]*?else/.exec(body)?.[0] ?? '';
  eq('a dry run issues no number', /next_ffr_no|raise_ffr/.test(dry), false);

  // THE GATE IS 0170's, NOT THIS FILE's, and the check has to follow it there
  // or it goes on asserting a fact about a definition nothing runs — the exact
  // "a bundle must carry the LATEST definition" hazard, in check form.
  //
  // 0169 guarded with is_admin(), which reads auth.uid(); in the Supabase SQL
  // editor that is NULL, so it refused the administrator typing the catch-up in
  // — reported from use, 2026-09-12. 0170 aims it at API callers instead.
  const gate = readFileSync('supabase/migrations/0170_ffr_backfill_gate.sql', 'utf8')
    .split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  eq('a signed-in non-administrator is refused',
    /if v_by_api and not public\.is_admin\(\) then/.test(gate), true);
  eq('…and the API is told apart by its jwt claim',
    /current_setting\('request\.jwt\.claims', true\)/.test(gate), true);
  // anon must still be kept out by the grant, not by that test alone.
  eq('anon cannot reach it at all',
    /revoke all on function public\.backfill_ffrs\(boolean\) from public/.test(gate)
    && /grant execute on function public\.backfill_ffrs\(boolean\) to authenticated/.test(gate), true);
  // Oldest first, so the numbering runs the way the register was written.
  eq('in review order', /order by cr\.review2_at nulls last, cr\.ucn/.test(body), true);
  // Idempotent: raise_ffr returns NULL for a call that already has one.
  eq('and it skips calls that already have a report',
    /if exists \(select 1 from public\.field_failure_reports f where f\.ucn = v_ucn\) then return null/.test(body), true);
}

// ---------------------------------------------------------------------------
// A SAVED SIGNATURE (0172) — "Add a Provision for users to Save their
// signatures", 2026-09-12.
//
// The one property worth checking mechanically: NOBODY READS ANYBODY ELSE'S.
// Everything else about the feature is visible on screen; this is the part that
// would fail silently and would not look like a fault.
// ---------------------------------------------------------------------------
{
  console.log('\n-- a saved signature --');
  const sql = readFileSync('supabase/migrations/0172_user_signatures.sql', 'utf8');
  const body = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

  // READ AND WRITE ARE YOUR OWN ROW, with no `or is_admin()` anywhere near
  // them: an administrator who can read the image can put it on anything.
  const read = /create policy usig_read[\s\S]*?;/.exec(body)?.[0] ?? '';
  eq('the read policy exists', read !== '', true);
  eq('a signature is read only by its owner',
    /using \(user_id = \(select auth\.uid\(\)\)\)/.test(read), true);
  eq('…and not by an administrator', /is_admin|users\.manage|has_perm/.test(read), false);

  const upd = /create policy usig_update[\s\S]*?;/.exec(body)?.[0] ?? '';
  eq('nor written by one', /is_admin|users\.manage|has_perm/.test(upd), false);

  // DELETE IS THE OWNER'S TOO. `or is_admin()` here looks like it grants
  // something and does not: PostgreSQL applies the SELECT policy to a DELETE
  // that has to find its row, so an administrator who cannot read it reported
  // `DELETE 0` with no error. Removal is a function instead.
  const del = /create policy usig_delete[\s\S]*?;/.exec(body)?.[0] ?? '';
  eq('delete carries no is_admin that cannot work', /is_admin/.test(del), false);
  eq('removing a leaver\'s signature is an explicit act',
    /create or replace function public\.remove_user_signature/.test(body), true);
  eq('…which only an administrator may do',
    /if not public\.is_admin\(\) then[\s\S]{0,200}raise exception/.test(body), true);

  // WHO HAS ONE, without the image. A definer function, deliberately not a
  // view: a definer view over RLS tables is the fault 0040/0050/0057 shipped
  // three times, and check:views refuses one.
  eq('who-has-one is a function, not a view',
    /create or replace function public\.user_signature_status/.test(body)
    && !/create (or replace )?view public\.user_signature_status/.test(body), true);
  const status = /create or replace function public\.user_signature_status[\s\S]*?\$\$;/.exec(body)?.[0] ?? '';
  eq('and it returns no ink', /s\.signature(?!\))/.test(status.replace(/btrim\(s\.signature\)/g, '')), false);

  // THE CLIENT NEVER ASKS FOR SOMEBODY ELSE'S. Belt and braces — the policies
  // above are the real control, but a query written for another user id is a
  // clear statement of intent and should not appear.
  const lib = readFileSync('src/lib/supabase.ts', 'utf8');
  const sigFns = /export interface MySignature[\s\S]*?export async function sbClearMySignature[\s\S]*?\n}/.exec(lib)?.[0] ?? '';
  eq('the client reads its own signature only', sigFns !== '' && !/eq\('user_id', (?!user\.id)/.test(sigFns), true);

  // THE DOCUMENT RULE: a signature prints only in the block that names you.
  const rule = readFileSync('src/lib/signature.ts', 'utf8');
  eq('the match is exact, never a substring',
    /a === name/.test(rule) && !/\.includes\(|startsWith\(/.test(rule), true);
  for (const [file, label] of [
    ['src/modules/DeliveryChallan.tsx', 'the Delivery Challan'],
    ['src/modules/FieldFailureReport.tsx', 'the Field Failure Report'],
  ] as const) {
    const src = readFileSync(file, 'utf8');
    eq(`${label} signs only the block that names the printer`,
      /signatureBelongsTo\(/.test(src), true);
  }
}

// ---------------------------------------------------------------------------
// R-SER-03 — THE WORD COPY IS THE CONTROLLED FORM ("FFR word copy has to be
// exactly same as the template", 2026-09-12), AND THE PRINTABLE PAGE IS THE
// SAME FORM.
// ---------------------------------------------------------------------------
{
  console.log('\n-- the Field Failure Report form --');
  const form = readFileSync('src/lib/ffrform.ts', 'utf8');

  // THE TEMPLATE'S OWN LABELS, padding included — the padding is how the
  // printed form aligns its colons, so trimming it changes the form.
  for (const label of [
    'Hospital Name : ', 'Complaint Date  : ', 'Address             : ',
    'Phone No   :', 'Mobile No           :', 'Email                   :',
    'UC Number: ', 'Model                   :', 'Equipment Name: ',
    'Software Details  :', 'Serial No: ', 'Software               :',
    'Punched S. No   :', 'Equipment status : ',
    'Problem Description  :', 'Service Department Observation',
    'CAPA No: ', 'Problem Status: ', 'Raised by: ', 'Signature:',
  ]) {
    eq(`the form carries "${label.trim()}"`, form.includes(`'${label}'`), true);
  }
  eq('both section headings', form.includes("'Customer Information'") && form.includes("'Equipment Information'"), true);
  eq('the form identity is on the page', form.includes('TMPL No: R/SER/03 Rev: MAR 2020'), true);
  eq('so is the property notice', form.includes('property of Air Liquide Medical Systems'), true);
  eq('the template’s column split', /left: 6435, right: 4500/.test(form), true);
  eq('and its page setup', /w: 11906, h: 16838/.test(form), true);

  // THE NUMBER AND DATE ARE NOT INVENTED AT THE TOP. The template has neither
  // field; the first generated version added both, which is what made it a
  // different form.
  eq('no FFR-number field is added to the form',
    !/label: 'FFR No/.test(form) && !/label: 'Date/.test(form), true);

  // ONE DEFINITION, TWO RENDERINGS. Either renderer growing its own copy of a
  // label is the drift this file exists to prevent.
  const docSrc = readFileSync('src/lib/ffrdoc.ts', 'utf8');
  const pageSrc = readFileSync('src/modules/FieldFailureReportPrint.tsx', 'utf8');
  for (const [src, who] of [[docSrc, 'the Word copy'], [pageSrc, 'the printable page']] as const) {
    eq(`${who} renders the shared rows`, /FFR_ROWS/.test(src), true);
    eq(`${who} does not hand-write a label`, /'Hospital Name|'Serial No:|'CAPA No:/.test(src), false);
  }
  eq('the printable page uses the COMPANY mark', /COMPANY_LOGO/.test(pageSrc), true);
  eq('…from brand.ts, never a direct asset import', /from '\.\.\/assets\//.test(pageSrc), false);
}

// ---------------------------------------------------------------------------
// WHO REVIEWED IT (0173) and THE UPDATE LOG (0174).
// ---------------------------------------------------------------------------
{
  console.log('\n-- who reviewed it, and what changed --');
  const r = readFileSync('supabase/migrations/0173_dccr_reviewer.sql', 'utf8');
  const body = r.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

  eq('the reviewer comes from the session', /new\.review2_by_uid := v_uid/.test(body), true);
  eq('…and only when the review is COMPLETED', /if now2 and not was2 then/.test(body), true);
  // A SCREEN IS NEVER RECORDED AS A PERSON. Scoped to raise_ffr's own body:
  // the string still appears in the back-fill's WHERE clause, which is where it
  // is MATCHED in order to be replaced — the opposite of assigning it.
  const raise = /create or replace function public\.raise_ffr[\s\S]*?\n\$\$;|create or replace function public\.raise_ffr[\s\S]*?end \$\$;/.exec(body)?.[0] ?? '';
  eq('raise_ffr() was found', raise !== '', true);
  eq('a screen is never recorded as a person', /'Daily Call Review'/.test(raise), false);
  eq('…and Review 3’s reviewer is preferred',
    /nullif\(btrim\(coalesce\(p_review\.review3_by, ''\)\), ''\),\s*\n\s*nullif\(btrim\(coalesce\(p_review\.review2_by, ''\)\), ''\)/.test(raise), true);

  // THE MIRROR. A generated column is computed AFTER the BEFORE triggers, so
  // the trigger cannot read review2_done and evaluates 0044's expression
  // itself. A mirror is only safe while it stays a copy — so compare them.
  const gen = readFileSync('supabase/migrations/0044_daily_call_review.sql', 'utf8');
  const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
  const genExpr = (col: string) => {
    const m = new RegExp(`add column if not exists ${col} boolean[\\s\\S]*?generated always as \\(([\\s\\S]*?)\\) stored`).exec(gen);
    return m ? norm(m[1]) : '';
  };
  const mirrored = (v: string) => {
    const m = new RegExp(`${v} boolean := ([^;]+);`).exec(body);
    return m ? norm(m[1]).replace(/new\./g, '') : '';
  };
  for (const [col, v] of [['review2_done', 'now2'], ['review3_done', 'now3']] as const) {
    const a = genExpr(col), b = mirrored(v);
    eq(`${col}’s mirror matches 0044 word for word`, a !== '' && a === b, true);
  }

  // FINDING THE REVIEWER BY NAME **AND** ROLE (0175). "Bagyaraj would be mapped
  // as nsm" — the role is the second key, and a far better one than a spelling.
  const n = readFileSync('supabase/migrations/0175_ffr_reviewer_nsm.sql', 'utf8');
  const nbody = n.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  eq('the lookup takes a role as well as a name',
    /p_role\s+text\s+default 'nsm'/.test(nbody), true);
  // A PREFIX match misses "M Bagyaraj"; the match is on the whole name.
  eq('the name is matched anywhere in it, not as a prefix',
    /'%' \|\| lower\(btrim\(coalesce\(p_name_like, ''\)\)\) \|\| '%'/.test(nbody), true);
  eq('it refuses to guess when several match',
    /if v_count > 1 then[\s\S]*?nothing changed/.test(nbody), true);
  eq('a left user is never chosen', /coalesce\(d\.validity, true\)/.test(nbody), true);
  // DRY RUN BY DEFAULT, like the FFR back-fill: naming a person on a quality
  // record is not something to discover afterwards.
  eq('it reports before it writes', /p_apply\s+boolean default false/.test(nbody), true);
  eq('and it fills silence rather than reassigning work',
    /where coalesce\(btrim\(raised_by_name\), ''\) in \('', 'Daily Call Review'\)/.test(nbody), true);
  // Run from the SQL editor, so the 0170 gate applies here too.
  eq('the SQL editor is not locked out of it',
    /current_setting\('request\.jwt\.claims', true\)/.test(nbody), true);

  const h = readFileSync('supabase/migrations/0174_ffr_history.sql', 'utf8');
  const hbody = h.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  eq('the log is written by a trigger, not the client',
    /create trigger zz_ffr_history after update on public\.field_failure_reports/.test(hbody), true);
  eq('an update that changes nothing writes nothing',
    /if v_diff = '\{\}'::jsonb then return null/.test(hbody), true);
  eq('updated_at is never an entry on its own', /skip\s+text\[\] := array\[[^\]]*'updated_at'/.test(hbody), true);
  // APPEND-ONLY BY OMISSION: no insert, update or delete policy exists.
  for (const cmd of ['insert', 'update', 'delete']) {
    eq(`no ${cmd} policy on the log`,
      new RegExp(`create policy [a-z_]+ on public\\.ffr_history for ${cmd}`).test(hbody), false);
  }
  eq('a read needs ffr.manage or admin',
    /create policy ffrh_read on public\.ffr_history for select[\s\S]*?has_perm\('ffr\.manage'\)/.test(hbody), true);
}

// ---------------------------------------------------------------------------
// THE REGISTER READS A VIEW AND THE FORM SAVES A TABLE.
//
// Reported from use, 2026-09-12: "Could not find the
// 'live_any_potential_effect' column of 'field_failure_reports' in the schema
// cache". Clicking a row seeded the edit form with the VIEW's row — record plus
// live_* columns — and saving sent the lot to the table, which has none of
// them. PostgREST refused the whole write, so the edit was simply lost.
// ---------------------------------------------------------------------------
{
  console.log('\n-- what may be written to a Field Failure Report --');

  // THE WHITELIST MUST MATCH THE TABLE. Derived from the migrations rather than
  // trusted, because a column added to one and not the other is exactly the
  // drift this check exists to catch.
  const create = readFileSync('supabase/migrations/0165_field_failure_register.sql', 'utf8');
  const weekly = readFileSync('supabase/migrations/0168_ffr_weekly_review.sql', 'utf8');
  const body = /create table if not exists public\.field_failure_reports \(([\s\S]*?)\n\);/.exec(create)?.[1] ?? '';
  eq('the table definition was found', body !== '', true);
  const declared = body.split('\n')
    .map((l) => l.replace(/--.*$/, '').trim())
    .filter((l) => /^[a-z_]+\s+\S/.test(l))
    .map((l) => l.split(/\s+/)[0]);
  const added = [...weekly.matchAll(/add column if not exists\s+([a-z_]+)/g)].map((m) => m[1]);
  const tableCols = new Set([...declared, ...added]);

  // What the DATABASE owns and a client must never send.
  const dbOwned = new Set(['id', 'ffr_no', 'raised_by', 'created_at', 'updated_at']);
  const expected = [...tableCols].filter((c) => !dbOwned.has(c)).sort();
  const actual = [...FFR_WRITABLE].sort();
  eq('every writable column of the table is on the list',
    expected.filter((c) => !actual.includes(c)), []);
  eq('and the list invents none', actual.filter((c) => !expected.includes(c)), []);
  eq('the columns the database owns are NOT writable',
    [...dbOwned].filter((c) => (FFR_WRITABLE as readonly string[]).includes(c)), []);

  // AND IT ACTUALLY STRIPS. Run the function over a row shaped like the view's,
  // rather than reading the source and believing it.
  const viewRow = {
    ffr_no: 'FFR - 001/26', id: 7, updated_at: 'x', raised_by: 'u',
    problem_status: 'Closed', capa_status: 'Open',
    live_any_potential_effect: 'YES', live_call_status: 'Solved',
    live_engineer: 'E', live_visit_count: 3, live_spares_consumed: 'p',
  };
  const out = ffrWritable(viewRow);
  eq('a live_ column never reaches the table',
    Object.keys(out).filter((k) => k.startsWith('live_')), []);
  eq('nor does anything the database owns',
    Object.keys(out).filter((k) => dbOwned.has(k)), []);
  eq('and the real edits survive',
    [out.problem_status, out.capa_status], ['Closed', 'Open']);

  // …AND THE WRITERS ACTUALLY USE IT. Without this the fix could be reverted in
  // supabase.ts and every check above would still pass — the list would be
  // right and nothing would consult it.
  const lib = readFileSync('src/lib/supabase.ts', 'utf8');
  for (const fn of ['addFfr', 'updateFfr']) {
    const src = new RegExp(`export async function ${fn}[\\s\\S]*?\\n\\}`).exec(lib)?.[0] ?? '';
    eq(`${fn}() was found`, src !== '', true);
    eq(`${fn}() reduces the row to the table's columns`, /ffrWritable\(/.test(src), true);
    eq(`${fn}() does not spread the row straight through`,
      /\.\.\.rest|\.insert\(row\)|\.update\(patch\)/.test(src), false);
  }

  // RAISED BY IS SET ONCE. It used to be stamped with the editor's e-mail on
  // every save, so correcting a typo on somebody else's report replaced the
  // raiser with whoever touched it last — and with an address rather than the
  // name the register shows everywhere else.
  const screen = readFileSync('src/modules/FieldFailureReport.tsx', 'utf8');
  const saveFn = /const save = async \(\) => \{[\s\S]*?\n  \};/.exec(screen)?.[0] ?? '';
  eq('the save path was found', saveFn !== '', true);
  eq('an edit does not restamp raised_by_name',
    /editing == null[\s\S]*?raised_by_name/.test(saveFn) && !/^\s*const payload = \{ \.\.\.form, raised_by_name/m.test(saveFn), true);
}

// ---------------------------------------------------------------------------
// READING THE FIELD FAILURE REGISTER IS ITS OWN RIGHT (0176).
//
// Reported from use, 2026-09-12: a role holding ffr.manage and the page key
// opened the register and it was EMPTY. ffr_read tested neither permission — it
// scoped the register to CALL visibility, so ffr.manage granted the right to
// WRITE a register its holder could not READ.
// ---------------------------------------------------------------------------
{
  console.log('\n-- reading the Field Failure Register --');
  const m = readFileSync('supabase/migrations/0176_ffr_view_right.sql', 'utf8');
  const body = m.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  const read = /create policy ffr_read[\s\S]*?\n  \);/.exec(body)?.[0] ?? '';
  eq('the read policy was found', read !== '', true);
  eq('ffr.view grants the register', /has_perm\('ffr\.view'\)/.test(read), true);
  // THE OLD SCOPE IS KEPT. Removing it would take away what people have today —
  // a report on your own call — which nobody asked for.
  eq('…and your own call still is', /from public\.calls c where c\.ucn/.test(read), true);
  eq('as are your own reports and the office roles',
    /raised_by = \(select auth\.uid\(\)\)/.test(read) && /can_view_all_calls\(\)/.test(read), true);
  // IT WIDENS NOTHING ON APPLY: only roles that already held ffr.manage.
  eq('the grant is scoped to roles that already write',
    /where ar\.permissions \? 'ffr\.manage'/.test(body), true);
  eq('and it MERGES rather than overwrites', /jsonb_agg\(distinct v\)/.test(body), true);
  // THE HISTORY FOLLOWS THE REGISTER — in 0177, and in its own file for a
  // reason: ffrh_read belongs to the `data_integrity` module while ffr_read
  // belongs to `daily_review`, and one migration redefining both would be
  // reverted by a replay of the other. check:bundles caught exactly that here.
  const hist = readFileSync('supabase/migrations/0177_ffr_history_view_right.sql', 'utf8');
  eq('the update log follows the register',
    /create policy ffrh_read[\s\S]*?has_perm\('ffr\.view'\)/.test(hist), true);
  eq('…and the two policies stay in separate files',
    /ffrh_read/.test(body), false);

  // THE RIGHT MUST BE GRANTABLE FROM THE SCREEN, or it is a permission nobody
  // can give — which is how this started.
  const rbac = readFileSync('src/lib/rbac.ts', 'utf8');
  eq('ffr.view is on the action list', /key: 'ffr\.view'/.test(rbac), true);
  eq('and on the Field Failure page in the matrix',
    /'\/failure-report', label: 'Field Failure Register', actions: \['ffr\.view', 'ffr\.manage'\]/.test(rbac), true);

  // AN EMPTY REGISTER MUST SAY WHY. "There are no reports" and "you cannot see
  // the reports" look identical and mean opposite things.
  const screen = readFileSync('src/modules/FieldFailureReport.tsx', 'utf8');
  eq('an empty register names the right to ask for',
    /!can\('ffr\.view'\)/.test(screen) && /Read the whole Field Failure Register/.test(screen), true);
}

// ---------------------------------------------------------------------------
// A ROLE'S NAME IS THE ROLE THE PERSON IS ON.
//
// Reported 2026-09-12: "I have assigned a different Role, but he is on a
// Different Role." A key the static ROLES list did not know fell through to the
// LEGACY role's label, so somebody on `vptechnical` was shown as "Field
// Engineer" — while their access ran on vptechnical the whole time.
// ---------------------------------------------------------------------------
{
  console.log('\n-- a role is named as itself --');
  const auth = readFileSync('src/lib/auth.tsx', 'utf8');
  const fn = /export function roleLabel\([\s\S]*?\n\}/.exec(auth)?.[0] ?? '';
  eq('roleLabel was found', fn !== '', true);
  // The legacy label is only right when there is NO rbac key at all.
  eq('an rbac key is never labelled from the legacy role',
    /if \(!rb\) return ROLE_LABELS\[u\.role\]/.test(fn) && !/\|\| ROLE_LABELS\[u\.role\]/.test(fn), true);
  eq('and it uses the one labeller', /roleLabelFor\(rb\)/.test(fn), true);

  // A role the code does not know is named from the database, and failing that
  // from its own key — never from another role.
  eq('database labels are consulted', /dbRoleLabels\[key\]/.test(readFileSync('src/lib/rbac.ts', 'utf8')), true);
  eq('an unknown key humanises to itself', roleLabelFor('vptechnical'), 'Vptechnical');
  eq('a built-in key keeps its name', roleLabelFor('nsm'), 'NSM (National Service Manager)');
  setRoleLabels({ vptechnical: 'VP Technical' });
  eq('…and the database label wins once loaded', roleLabelFor('vptechnical'), 'VP Technical');
}

// ---------------------------------------------------------------------------
// THE VISITS AND SPARES BEHIND A REPORT (0178).
//
// Reported with two screenshots: an administrator saw the register's right-hand
// pane populated; somebody granted `ffr.view` saw "0 visits" on the SAME
// report. `reports` and `spare_consumption` are scoped to CALL visibility,
// which reading the register does not confer.
// ---------------------------------------------------------------------------
{
  console.log('\n-- the call behind a Field Failure Report --');
  const m = readFileSync('supabase/migrations/0178_ffr_call_context.sql', 'utf8');
  const body = m.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

  eq('it is a definer function', /security definer/.test(body), true);
  eq('gated on the right to read the register',
    /has_perm\('ffr\.view'\)[\s\S]{0,120}can_view_all_calls\(\)[\s\S]{0,60}is_admin\(\)/.test(body), true);
  // THE SCOPING CONDITION is what stops it being a general call reader: without
  // it, knowing any UCN would return that call's visits.
  eq('and it opens ONLY calls that have a report',
    /if not exists \(select 1 from public\.field_failure_reports f where f\.ucn = v_ucn\) then\s*\n\s*return null;/.test(body), true);
  // NULL rather than an exception: "not for you" is not an error here — the
  // caller reads the tables under their own policies instead.
  eq('a caller who does not qualify gets null, not an error',
    /return null;/.test(body) && !/raise exception/.test(body), true);

  // …AND THE DESK FALLS BACK, so nobody loses a visit they can already see.
  const desk = readFileSync('src/modules/FieldFailureDesk.tsx', 'utf8');
  eq('the desk asks for the register context first', /ffrCallContext\(ucn\)/.test(desk), true);
  eq('and falls back to the tables when it gets nothing',
    /ctx \?\? \{[\s\S]{0,160}reportHistory\(ucn\)[\s\S]{0,120}consumptionForCall\(ucn/.test(desk), true);

  const lib = readFileSync('src/lib/supabase.ts', 'utf8');
  const fn = /export async function ffrCallContext[\s\S]*?\n\}/.exec(lib)?.[0] ?? '';
  eq('the client helper was found', fn !== '', true);
  // A database without 0178 must not break the pane.
  eq('a missing function reads as "fall back", not an error',
    /if \(error \|\| !data\) return null;/.test(fn), true);
}

// ---------------------------------------------------------------------------
// THE VISIT PANE, TIDIED (the user, 2026-09-12, with eight fields highlighted).
// ---------------------------------------------------------------------------
{
  console.log('\n-- what a visit shows --');
  const ctx = readFileSync('src/components/callcontext/CallContext.tsx', 'utf8');

  // THE EIGHT, matched on a NORMALISED key — these labels are DATA, typed into
  // the visit form, and one is misspelt in the live data ("Recomended").
  // Matching the exact string would hide it today and stop the day somebody
  // corrects the spelling, so both are listed.
  for (const k of ['calltype', 'addconsumption', 'visitentrydate', 'maintenancedone',
                   'standardcomplaint', 'complaintobservation',
                   'recomendedfilterchanged', 'recommendedfilterchanged',
                   'updatevisitworkdetails',
                   // The second round: already on the screen — the visit's own
                   // heading, and a call-level fact repeated on every visit.
                   'visitdatetime', 'visitdateandtime', 'complaintdate']) {
    eq(`a visit hides "${k}"`, new RegExp(`'${k}'`).test(ctx), true);
  }
  eq('and the key is normalised before matching',
    /replace\(\/\[\^a-z0-9\]\/g, ''\)/.test(ctx), true);
  // What a visit is FOR must survive the tidy.
  eq('Job Done is not hidden', /'jobdone'/.test(ctx), false);
  eq('nor the hour meter', /'hourmeterreading'/.test(ctx), false);

  // EVERY DATE READS DD-MMM-YYYY. toLocaleDateString('en-GB') gives 01/09/2026
  // — a fifth format, and the ambiguous one.
  eq('dates use the application’s formatter', /fmtLongSmart|fmtLongDate/.test(ctx), true);
  // COMMENTS STRIPPED FIRST. The note explaining why toLocaleDateString was
  // removed contains the word, so reading the whole file failed this — a check
  // that was testing prose rather than code.
  const ctxCode = ctx.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  eq('and not a locale string', /toLocaleDateString/.test(ctxCode), false);
  // Gated on the KEY: "V1.2.9" and an hour-meter reading are not dates.
  eq('only date-ish fields are reformatted', /looksLikeDate\(k\) \? fmtLongSmart/.test(ctx), true);

  // THE ACTIONS ARE AT THE TOP of the Field Failure desk's middle pane.
  const desk = readFileSync('src/modules/FieldFailureDesk.tsx', 'utf8');
  const idx = (re: RegExp) => desk.search(re);
  eq('Edit and Print sit in the header', idx(/ffr-h-actions/) > 0, true);
  eq('…above the record, not below it',
    idx(/ffr-h-actions/) < idx(/>The report</), true);
  eq('and there is only one pair of them',
    (desk.match(/Edit \/ weekly review/g) ?? []).length, 1);
}

// ---------------------------------------------------------------------------
// THE PART CODE AND THE PART NAME, SPLIT ONCE (the user, 2026-09-12: "Split the
// part code and description into separate columns").
//
// A spare is stored as one string, "CODE|Description". The Delivery Challan has
// always cut it; the Field Failure desk's spares table was printing it raw.
// ---------------------------------------------------------------------------
{
  console.log('\n-- the part code and the part name --');

  eq('a normal catalogue string splits', partCode('TOUCH PANEL|Touch panel assembly'), 'TOUCH PANEL');
  eq('…and its description', partName('TOUCH PANEL|Touch panel assembly'), 'Touch panel assembly');
  // A code is a code however it was typed.
  eq('the code is upper-cased', partCode('touch panel|x'), 'TOUCH PANEL');
  // NO PIPE: the whole string is the part. A blank cell where a part has only a
  // code is worse than showing the code twice — this is the case the two
  // pre-existing parsers disagreed on.
  eq('no pipe: the code is the string', partCode('WIDGET'), 'WIDGET');
  eq('no pipe: the name is the string too', partName('WIDGET'), 'WIDGET');
  // A description carrying a pipe of its own keeps it: only the FIRST cut counts.
  eq('only the first pipe cuts', partName('CODE|a|b'), 'a|b');
  eq('surrounding space is trimmed', partName('  CODE |  Thing  '), 'Thing');
  eq('and so is the code', partCode('  code | x '), 'CODE');
  eq('nothing in, nothing out', [partCode(''), partName(null)], ['', '']);

  // ONE DEFINITION. dc.ts must not keep a second copy — that is how the two
  // start disagreeing, which is exactly what had begun here.
  const dc = readFileSync('src/lib/dc.ts', 'utf8');
  eq('the challan uses the shared split, not its own',
    /codeOf = partCode/.test(dc) && /descOf = partName/.test(dc), true);
  eq('and defines no second parser', /split\('\|'\)/.test(dc), false);

  // THE TABLE HAS BOTH COLUMNS, and prints neither raw.
  const ctx = readFileSync('src/components/callcontext/CallContext.tsx', 'utf8');
  eq('the spares table has a Code column and a Part column',
    /<th>Code<\/th><th>Part<\/th>/.test(ctx), true);
  eq('and renders them through the split',
    /partCode\(s\.part\)/.test(ctx) && /partName\(s\.part\)/.test(ctx), true);
  eq('rather than the raw string', /\{String\(s\.part \?\? ''\)\}/.test(ctx), false);
}

// ---------------------------------------------------------------------------
// LOADING THE FIELD FAILURE REGISTER BACK TO 2016 (0179) — where every year is
// a different sheet and they all have to land in one table.
// ---------------------------------------------------------------------------
{
  console.log('\n-- loading the register, any year --');
  const def = UPLOADS.find((u) => u.key === 'ffr');
  eq('the upload exists', !!def, true);
console.log('\n-- the How to Use guide points at real screens --');
{
  const guide = readFileSync('src/modules/HowToUse.tsx', 'utf8');
  const rbac = readFileSync('src/lib/rbac.ts', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  // Modules AND plain routes: /profile is a real screen that is deliberately not
  // a module, because it is personal and no permission gates it. Checking only
  // MODULES called it broken.
  const paths = new Set([
    ...[...rbac.matchAll(/path: '([^']*)'/g)].map((m) => m[1]),
    ...[...app.matchAll(/path="([^"]*)"/g)].map((m) => m[1]),
  ]);

  // EVERY "Open …" BUTTON MUST REACH A REAL MODULE. A typo here is a button
  // that lands on the Dashboard, which is how the jump strip failed before
  // (reported 2026-09-08) — it looks like the guide working, right up until
  // somebody presses it.
  const gone = [...guide.matchAll(/to: '(\/[a-z0-9/-]*)'/g)].map((m) => m[1])
    .filter((t) => !paths.has(t));
  eq('every Open button names a module that exists', [...new Set(gone)], []);

  // The guide grew from 15 call-and-spare tasks to cover every area. These are
  // the ones that had NO instructions at all and are the reason it was updated;
  // if one is dropped the guide has gone backwards without anybody noticing.
  for (const id of ['dccr', 'callreview', 'ffr', 'ffr-insights', 'cover-entry', 'ownership',
                    'handstock', 'mrn', 'bulk', 'ffr-years', 'indoor', 'objective',
                    'exports', 'masters', 'lookup', 'signature', 'tracker', 'access']) {
    eq(`the guide covers ${id}`, guide.includes(`id: '${id}'`), true);
  }
  // Numbered without a gap or a repeat, because the numbers are how somebody is
  // sent to one ("read step 18").
  // `group` sits between `id` and `n` on the first task of each group, so the
  // pattern has to allow it — the first version did not and matched only the 23
  // tasks that open no group, reporting a gap the file did not have.
  const ns = [...guide.matchAll(/id: '[a-z0-9-]+',(?: group: '[^']*',)? n: '(\d+)'/g)].map((m) => Number(m[1]));
  eq('the task numbers run 1..n with no gap', ns, ns.map((_, i) => i + 1));

  // GROUPED, AND EACH GROUP CONTIGUOUS. The guide was 15 call-and-spare tasks
  // with 18 appended, so "Quality" and "Your account" each appeared twice and
  // the order read as random. A heading opening a group that has already been
  // opened means the sections have drifted apart again.
  const groups = [...guide.matchAll(/group: '([^']*)'/g)].map((m) => m[1]);
  eq('no group heading appears twice', groups.length, new Set(groups).size);
  eq('every group is named', groups.filter((g) => !g.trim()), []);
}

console.log('\n-- the cover registers carry the AppSheet arithmetic --');
{
  const spec = readFileSync('docs/APPSHEET_ADMIN_APPDEF.md', 'utf8');
  // THE SPEC IS IN THE REPO, so these assertions can be checked against it
  // rather than against a PDF nobody here can open.
  eq('the source document is kept', spec.includes('ContractEntry_Schema'), true);

  // Each formula matched to the expression the document actually prints. If the
  // spec is ever re-transcribed and an expression changes, these stop passing.
  eq('the spec states Years = Months / 12',
    spec.includes('[Contract Period (Months)] / 12'), true);
  eq('the spec states the EOMONTH end date',
    spec.includes('EOMONTH([Contract Start Date],[Contract Period (Months)]-1)+DAY([Contract Start Date])-1'), true);
  eq('the spec states warranty PM visits',
    spec.includes('([Warranty Period (in Months)] / 12) * 3'), true);
  eq('the spec states contract PM visits',
    spec.includes('[Contract Period (Months)] / 6'), true);
  eq('the spec states the 18% tax', spec.includes('((18 * [Rate])/100)'), true);
  eq('the spec states the split', spec.includes('INDEX(SPLIT([Product Details],"|"),1)'), true);
  eq('the spec states Item Details Long',
    spec.includes('CONCATENATE([Product Code],"|",[Product Name],"|",[Product Serial Number])'), true);

  // And the transcription produces those values. Worked by hand from the
  // expressions above, so a wrong implementation fails rather than a wrong
  // expectation agreeing with it.
  eq('18 months is 1.5 years', periodYears(18), 1.5);
  eq('24 months warranty is 6 PM visits', warrantyPmVisits(24), 6);
  eq('24 months contract is 4 PM visits', contractPmVisits(24), 4);
  eq('warranty and contract PM rates DIFFER', warrantyPmVisits(12) === contractPmVisits(12), false);
  eq('a 12-month cover from 15 Jan ends 14 Jan', periodEnd('2024-01-15', 12), '2025-01-14');
  eq('...and a month from 31 Jan ends 1 Mar', periodEnd('2024-01-31', 1), '2024-03-01');
  eq('1000 at 18% is 180 tax', itemTaxAmount(1000), 180);
  eq('...and 1180 after tax', totalAfterTax(1000), 1180);
  eq('the machine string splits three ways',
    splitProductDetails('ORION-G|Orion G|SN1'), { code: 'ORION-G', name: 'Orion G', serial: 'SN1' });
  eq('a short string does not shift the parts along',
    splitProductDetails('ORION-G|Orion G').serial, '');
  eq('Item Details Long is built back', itemDetailsLong('ORION-G', 'Orion G', 'SN1'), 'ORION-G|Orion G|SN1');

  // The numbering DEVIATES from the spec deliberately: _RowNumber is a
  // spreadsheet row, and a contract number that changes when a row is deleted
  // is not a number. The floors are the spec's, so this system's first number
  // follows the sheet's last rather than colliding with it.
  eq('the SA floor is the spec\'s', SERIES.sale.floor, 1183);
  eq('the MC floor is the spec\'s', SERIES.contract.floor, 13);
  eq('an empty register starts above the floor', nextInSeries('contract', []), 'MC14');
  eq('the series follows the highest issued', nextInSeries('sale', ['SA1200', 'SA1199']), 'SA1201');
  eq('...and junk in the column does not derail it', nextInSeries('sale', ['SA1200', 'n/a', '']), 'SA1201');

  // Derivation is keyed on the field EDITED. Editing the end date must not
  // re-derive it from the period — that is what makes a part-month contract
  // possible, and it has always been typeable here.
  eq('editing the period derives the end date',
    Object.keys(deriveHeader('contract', 'contract_months', { contract_months: 12, contract_start: '2024-01-15' })).sort(),
    ['contract_end', 'contract_years', 'pm_visits_total']);
  eq('editing the end date derives nothing',
    Object.keys(deriveHeader('contract', 'contract_end', { contract_end: '2025-06-30' })).length, 0);
  eq('a rate derives its tax and total',
    deriveItem('contract', 'rate', { rate: 1000 }), { item_tax_amount: 180, total_after_tax: 1180 });
  // ...on a CONTRACT only. A sale has no rate: the spec puts those three
  // columns on ContractDetails alone, and sale_items has no such columns.
  eq('a sale line has no rate, tax or total', deriveItem('sale', 'rate', { rate: 1000 }), {});

  // THE NUMBER IS OFFERED, NOT RESERVED. It must land in the key field, stay
  // editable, and never block opening the form — a lookup that fails is no
  // reason to refuse a new entry.
  {
    const reg = readFileSync('src/modules/CoverRegister.tsx', 'utf8');
    const lib = readFileSync('src/lib/cover.ts', 'utf8');
    eq('a new entry asks for the next number', reg.includes('await nextCoverNumber(kind)'), true);
    // Read the HANDLER, not the file: splitting on the name found the import
    // line first, so the check passed on text that proved nothing.
    const body = (reg.split('const newEntry')[1] ?? '').split('\n  const ')[0];
    eq('the form opens BEFORE the lookup', body.indexOf('setOpen({})') < body.indexOf('await nextCoverNumber'), true);
    eq('...and a failed lookup does not stop it', /catch/.test(body), true);
    // Ordered by id, NOT by the number: 'SA999' sorts after 'SA1200' as text,
    // so the database's "largest" is the wrong one past 999.
    eq('the series is read newest-first by id, not by the number',
      /order\('id', \{ ascending: false \}\)\.limit\(500\)/.test(lib), true);
    eq('a series past 999 still reads correctly',
      nextInSeries('sale', ['SA999', 'SA1200']), 'SA1201');
  }

  // THE LABELS PEOPLE ARE MIGRATING FROM. Reconciled against schemas 3.6/3.7 so
  // a field is recognisable to somebody who used the AppSheet app.
  //
  // NOT matched: the spec's SHOUTING (INVOICE NO, PM VISITS, COUNTRY). Those are
  // COLUMN names, and the document's own boundary note says the AppSheet Label
  // property is recorded only "where it materially identifies a field" — so what
  // the old screen displayed is not in the document, and copying the column's
  // case would assert something it does not support while making the form shout
  // in four places and nowhere else.
  //
  // NOT matched either: `Timestamp`, which is a Google-Forms artefact meaning
  // nothing to a reader — and the spec's own detail table calls the same value
  // "Sale Entry Date". And "(as keyed)" stays on the two status fields, because
  // the register computes a status elsewhere and the bare word would make two
  // different things look like one.
  {
    const lbl = (kind: 'sale' | 'contract', name: string) =>
      [...configFor(kind).headerFields, ...configFor(kind).itemFields].find((f) => f.name === name)?.label;
    for (const [name, want] of [
      ['warranty_start', 'Warranty Start Date'], ['warranty_end', 'Warranty End Date'],
      ['warranty_years', 'Warranty Period (in Years)'], ['warranty_months', 'Warranty Period (in Months)'],
      ['engineer', 'Service Engineer - Initial'], ['pincode', 'Inst. Pincode'],
    ] as const) eq(`sale: ${name} reads as the spec names it`, lbl('sale', name), want);
    for (const [name, want] of [
      ['contract_start', 'Contract Start Date'], ['contract_end', 'Contract End Date'],
      ['contract_years', 'Contract Period (Years)'], ['contract_months', 'Contract Period (Months)'],
      ['prev_mc_number', 'Prev MC Number'], ['bill_generate_at', 'Bill Generate At'],
    ] as const) eq(`contract: ${name} reads as the spec names it`, lbl('contract', name), want);
    // The two registers must not borrow each other's wording: "Period (Years)"
    // appeared in BOTH, so a global rename would have mislabelled one of them.
    eq('a warranty period is never called a contract period',
      lbl('sale', 'warranty_years')!.includes('Contract'), false);
    eq('...and the reverse', lbl('contract', 'contract_years')!.includes('Warranty'), false);
  }
  // The two registers derive the machine string in OPPOSITE directions, and
  // that is in the spec: a contract picks an existing machine, a sale names one.
  eq('a contract line splits the machine string',
    deriveItem('contract', 'product_details', { product_details: 'A|B|C' }).product_code, 'A');
  // THE GUARD THAT WAS MISSING. Every key a derivation puts on a row must be a
  // column the register declares — because saveHeader/saveItem send the row and
  // PostgREST refuses the WHOLE write for one unknown column, losing the save
  // rather than the field. `item_detail_long` was derived here and has no
  // column on sale_items (item_detail exists on `parts` alone); it shipped in
  // 0.9.235 and broke saving a machine line. Same fault as the Field Failure
  // Register's live_* columns, one module over.
  {
    const declared = (k: 'sale' | 'contract') => new Set([
      ...configFor(k).headerFields.map((f) => f.name),
      ...configFor(k).itemFields.map((f) => f.name),
      configFor(k).key,
    ]);
    const derivedKeys: string[] = [];
    for (const k of ['sale', 'contract'] as const) {
      const fields = [...configFor(k).headerFields, ...configFor(k).itemFields].map((f) => f.name);
      const row: Record<string, unknown> = { rate: 1000, product_details: 'A|B|C', product_code: 'A',
        product_name: 'B', serial_number: 'C', warranty_months: 12, contract_months: 12,
        warranty_start: '2024-01-15', contract_start: '2024-01-15', already_sold_to: 'APOLLO' };
      for (const f of [...new Set([...fields, 'rate', 'product_details'])]) {
        for (const out of [deriveHeader(k, f, row), deriveItem(k, f, row)]) {
          for (const key of Object.keys(out)) {
            if (!declared(k).has(key)) derivedKeys.push(`${k}.${f} -> ${key}`);
          }
        }
      }
    }
    eq('every derived field is a real column on the register', derivedKeys, []);
  }

  // -------------------------------------------------------------------------
  // THE EXPIRY BAND IS THIRTY DAYS, AND IT IS WRITTEN DOWN ONCE.
  //
  // It used to be sixty, in three places: this module, cover_state() in SQL,
  // and a hand-rolled stateOf inside the register screen. 0036 said plainly
  // that the number was a guess, because the supplied PDF printed the Status
  // columns' OUTPUTS and withheld their formula. The formula export supplies
  // it, the same on all four sheets:
  //
  //   IF(end>=Today(), IF(end<=(Today()+30),"ABOUT TO EXPIRE","ACTIVE"), "INACTIVE")
  //
  // Boundaries worked by hand off that expression, not read back off the
  // implementation: end=today is ABOUT TO EXPIRE (>= is inclusive), end=+30 is
  // ABOUT TO EXPIRE (<= is inclusive), end=+31 is ACTIVE, end=-1 is INACTIVE.
  // -------------------------------------------------------------------------
  {
    const spec = readFileSync('docs/APPSHEET_ADMIN_APPDEF.md', 'utf8');
    const day = (n: number) => {
      const d = new Date(2026, 5, 15); d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const on = (n: number) => coverStatus(day(n), new Date(2026, 5, 15));

    eq('the band is the sheet\'s thirty days', ABOUT_TO_EXPIRE_DAYS, 30);
    eq('an end date today is about to expire', on(0), 'ABOUT TO EXPIRE');
    eq('...and so is the thirtieth day', on(30), 'ABOUT TO EXPIRE');
    eq('...but the thirty-first is active', on(31), 'ACTIVE');
    eq('yesterday is inactive', on(-1), 'INACTIVE');
    // NOT the sheet's answer, deliberately: a blank cell compared with
    // >=Today() is TRUE in Sheets, so the sheet calls an unknown ACTIVE.
    eq('no end date is not covered', coverStatus(''), 'NOT COVERED');
    eq('...and neither is a junk one', coverStatus('not a date'), 'NOT COVERED');
    // THE DOCUMENT MUST CARRY THE FORMULA, not just the number. This
    // assertion started life the other way round — asserting the spec did NOT
    // print it, which was true of the PDF alone and became false the moment
    // the formula export was recorded in §3.4a. It fired, which is the point:
    // the guess and its justification are now both wrong, and the code and the
    // standing reference have to move together or one of them lies.
    eq('the spec records the sheet\'s status formula', spec.includes('Today()+30'), true);
    eq('...on all four sheets that carry the column',
      ['SaleEntry', 'WarrantySaleDetails', 'ContractEntry', 'ContractDetails']
        .every((sheet) => new RegExp(`\`${sheet}\`\\s*\\|\\s*\`[A-Z]\\d+\`\\s*\\|[^\\n]*Today\\(\\)\\+30`).test(spec)), true);
    eq('...and states the band this code implements',
      new RegExp(`Today\\(\\)\\+${ABOUT_TO_EXPIRE_DAYS}\\)`).test(spec), true);

    // ONE NUMBER, TWO LANGUAGES. The register's MACHINES tab reads
    // cover_state() through the details views and its ENTRIES tab reads
    // coverStatus, so the two disagreeing labels the same contract two ways.
    // Read the LAST definition in the bundle — the bundle is what a rebuild
    // applies, and an earlier definition in it is the one that got replaced.
    const bundle = readFileSync('supabase/apply/sales_contracts.sql', 'utf8');
    const defs = bundle.split('create or replace function public.cover_state');
    eq('the bundle defines cover_state', defs.length > 1, true);
    const last = defs[defs.length - 1].split('$$;')[0];
    const sqlDays = /current_date \+ (\d+) then 'ABOUT TO EXPIRE'/.exec(last)?.[1];
    eq('the SQL band is the same number as the TypeScript one',
      Number(sqlDays), ABOUT_TO_EXPIRE_DAYS);
    eq('...and the SQL calls a missing end date NOT COVERED too',
      last.includes("when p_end is null then 'NOT COVERED'"), true);
    eq('...and its inactive edge is the same', last.includes('p_end < current_date'), true);

    // THE THIRD COPY IS GONE. The screen must not carry its own arithmetic.
    const reg = readFileSync('src/modules/CoverRegister.tsx', 'utf8');
    eq('the register screen holds no band of its own',
      /days\s*<=\s*\d+\s*\?/.test(reg), false);
    eq('...it calls coverStatus', /stateOf\s*=\s*\(end: string\): string => coverStatus\(end\)/.test(reg), true);
  }

  // -------------------------------------------------------------------------
  // THE THREE FORMULAS THE EXPORT ADDED, each worked from the expression.
  // -------------------------------------------------------------------------
  {
    // WarrantySaleDetails col 4 `=J&"|"&L` and ContractDetails col 5
    // `=Q&"|"&R` — both are Product Name | Serial, which is why it is one
    // function. NOT the same string as Item Details LONG, which carries the
    // code as well and is the Product Master key.
    eq('Item Details is name and serial', itemDetails('Orion G', 'SN1'), 'Orion G|SN1');
    eq('...and is NOT Item Details Long',
      itemDetails('Orion G', 'SN1') === itemDetailsLong('ORION-G', 'Orion G', 'SN1'), false);

    // WarrantySaleDetails col 31 `=if(LEN(U)<2,"WI-","RWI-")`, U = Already Sold TO.
    eq('a machine nobody has owned takes a warranty installation', addCallPrefix(''), 'WI-');
    eq('...and the sheet\'s LEN<2 is kept verbatim', addCallPrefix('X'), 'WI-');
    eq('a machine already sold takes a RE-warranty installation', addCallPrefix('APOLLO'), 'RWI-');
    eq('Add Call follows Already Sold To on a sale line',
      deriveItem('sale', 'already_sold_to', { already_sold_to: 'APOLLO' }), { add_call: 'RWI-' });
    eq('...and a contract line has no such column',
      deriveItem('contract', 'already_sold_to', { already_sold_to: 'APOLLO' }), {});

    // ContractEntry_Schema col 5 lists four values; three were transcribed, so
    // a monthly contract could not be keyed at all (the field takes no
    // free-text fallback).
    const sched = configFor('contract').headerFields.find((f) => f.name === 'payment_schedule');
    eq('every payment schedule on the sheet can be chosen',
      sched?.options, ['', 'Yearly', 'Half Yearly', 'Quarterly', 'Monthly']);
    eq('the spec lists Monthly',
      readFileSync('docs/APPSHEET_ADMIN_APPDEF.md', 'utf8').includes('`Monthly`'), true);
  }

}


console.log('\n-- every banner tone has a rule behind it --');
{
  // A class name in use with no CSS renders as a PLAIN banner, which for a
  // warning is worse than not marking it at all. `sheet-banner-warn` shipped
  // that way (2026-09-14) and was caught before it reached anybody.
  const css = readFileSync('src/modules/fieldcalls.css', 'utf8');
  const used = new Set<string>();
  for (const f of readdirSync('src/modules').filter((x) => x.endsWith('.tsx'))) {
    for (const m of readFileSync(`src/modules/${f}`, 'utf8').matchAll(/sheet-banner-([a-z]+)/g)) used.add(m[1]);
  }
  const missing = [...used].filter((tone) => !new RegExp(`\\.sheet-banner-${tone}\\s*\\{`).test(css));
  eq('banners are actually used', used.size > 0, true);
  eq('every banner tone a screen uses has a rule', missing, []);
}

console.log('\n-- the Product Database and the Product Master are two registers --');
{
  // RENAMED 2026-09-14 and the names SWAPPED, which is the whole risk:
  //   products        the INSTALL BASE — one row per MACHINE  → "Product Database"
  //   product_master  the CATALOGUE    — one row per LINE     → "Product Master"
  // A screen or a label that drifts back conflates twenty thousand machines
  // with fifty-three product lines.
  const rbacSrc = readFileSync('src/lib/rbac.ts', 'utf8');
  const lay = readFileSync('src/components/layout/Layout.tsx', 'utf8');
  const paths = new Set(MODULES.map((m) => m.path));

  eq('the install base has its own route', paths.has('/product-database'), true);
  eq('...and the catalogue has its own', paths.has('/product-master'), true);
  eq('the install base is named Product Database',
    MODULES.find((m) => m.path === '/product-database')?.label, 'Product Database');
  eq('...and the menu agrees',
    /to: '\/product-database', label: 'Product Database'/.test(lay), true);
  eq('the catalogue is named Product Master',
    /^Product Master/.test(MODULES.find((m) => m.path === '/product-master')?.label ?? ''), true);
  // THE PERMISSION HAD TO MOVE WITH THE SCREEN. The key IS the route, so
  // without 0192 every role holding `mod:/product-master` would silently stop
  // seeing the install base and start seeing the catalogue.
  {
    const mig = readFileSync('supabase/migrations/0192_product_database_rename.sql', 'utf8');
    eq('the old audience is carried to the new key',
      /select 'mod:\/product-database' as v/.test(mig)
      && /where ar\.permissions \? 'mod:\/product-master'/.test(mig), true);
    // MERGED, never overwritten — has_perm falls back to the engineer defaults
    // only on an EMPTY permission set.
    eq('...by merging, never overwriting', /jsonb_agg\(distinct v\)/.test(mig), true);
  }

  // -------------------------------------------------------------------------
  // A COLUMN THE IMPORTER FILLS THAT NO SCREEN CAN READ IS NOT RETAINED.
  //
  // That is not a hypothetical: `Item Code` was a COLUMN ON THE PRODUCT
  // DATABASE SCREEN and always came back blank, because nothing ever put it
  // there — the importer had no `item_code` and `productRowToSheet` did not
  // emit the heading. The user saw it as "discrepancies in Product Master".
  // 0194 gave the twenty-one remaining export columns a column each; this is
  // what stops the twenty-second from landing in the database and nowhere else.
  // -------------------------------------------------------------------------
  {
    const db = UPLOADS.find((u) => u.key === 'products')!;
    const sbSrc = readFileSync('src/lib/supabase.ts', 'utf8');
    const body = sbSrc.slice(sbSrc.indexOf('export function productRowToSheet'));
    const mapper = body.slice(0, body.indexOf('\n}'));
    // `g('col')` takes the column as it is; `c('col', 'Heading')` prefers the
    // column and falls back to the file's own word for it.
    const emitted = new Set([...mapper.matchAll(/[gc]\('([a-z_]+)'/g)].map((m) => m[1]));
    const orphan = db.cols.map((col) => col.to).filter((k) => !emitted.has(k));
    eq('every column the Product Database importer fills is readable on a screen', orphan, []);
    // THE FALLBACK ORDER IS THE POINT, and it is what lets this ship before the
    // migration reaches the live project: the column is what this system holds
    // and may have been corrected on screen, `extra` is what the FILE said.
    eq('...column first, the file\u2019s own word second',
      /v === undefined \|\| v === null \|\| v === '' \? \(ex\[heading\] \?\? ''\) : v/.test(mapper), true);

    // ...AND THE SCREEN OFFERS THEM. The eleven default columns are what it
    // OPENS with; the picker and the export must reach all 32, or "retain all
    // columns" means retained where nobody can get at them.
    const scr = readFileSync('src/modules/ProductMaster.tsx', 'utf8');
    const listed = scr.slice(scr.indexOf('const ALL_FIELDS'), scr.indexOf('].map((k) =>'));
    eq('the screen offers all 32 columns of the export',
      (listed.match(/'/g) ?? []).length / 2, 32);
    eq('...to the Columns picker', /allFields=\{ALL_FIELDS\}/.test(scr), true);
    // The export carries ALL of them, not the eleven on screen: getting every
    // column OUT of the register is the concrete meaning of retaining them.
    eq('...and the export carries all of them, not the ones on screen',
      /csvExport\('product-database\.csv', ALL_FIELDS,/.test(scr), true);
    // THE COVER STATUSES ARE THE FILE'S WORDS, NOT THE COMPUTED STATE, and the
    // `_keyed` suffix is what keeps the two from being mistaken for one
    // another. This project already draws that distinction on the cover
    // registers; losing it here would mean a register filtering on a value it
    // computed while reporting the one the sheet typed.
    eq('the export\u2019s own cover statuses keep their own names',
      db.cols.some((c) => c.to === 'warranty_status_keyed')
      && db.cols.some((c) => c.to === 'contract_status_keyed'), true);
    // ...and the machine's own status no longer BORROWS one of them when a
    // file has no `Item Status` of its own. OGP is not INACTIVE.
    eq('...and the machine\u2019s status never borrows the warranty\u2019s',
      db.cols.find((c) => c.to === 'item_status')?.from.includes('warranty status'), false);
  }
  eq('the module list still reads the install base table',
    /path: '\/product-database'/.test(rbacSrc), true);

  // THE RULE: an inactive line takes no NEW SALE ENTRY, and nothing else.
  const cover = readFileSync('src/lib/cover.ts', 'utf8');
  const saleBlock = cover.split('export const SALE')[1]?.split('export const CONTRACT')[0] ?? '';
  const contractBlock = cover.split('export const CONTRACT')[1] ?? '';
  eq('a new sale picks from the active lines',
    /optionsFrom: 'sellable-code'/.test(saleBlock) && /optionsFrom: 'sellable-name'/.test(saleBlock), true);
  // A CONTRACT MAY NAME A RETIRED LINE — the machine it covers was sold when
  // the line was current, and refusing it would refuse the work, not the sale.
  eq('...and a contract may still name a retired one',
    /optionsFrom/.test(contractBlock), false);
  // Free text stays ON: the catalogue is hand-maintained and may be incomplete
  // or unreadable to this reader, and a Sale Entry that could not be typed at
  // all would be a worse fault than the one this prevents.
  const reg = readFileSync('src/modules/CoverRegister.tsx', 'utf8');
  eq('...and a line the catalogue has not got can still be typed',
    /if \(field\.optionsFrom\) \{[\s\S]{0,400}allowFreeText/.test(reg), true);
  eq('...with the reason a product is missing said out loud',
    /retired line takes no new sale/.test(reg), true);
}

console.log('\n-- one machine, across every register --');
{
  const mh = readFileSync('src/modules/MachineHistory.tsx', 'utf8');
  const lib = readFileSync('src/lib/machineHistory.ts', 'utf8');

  // PRODUCT FIRST, THEN SERIAL — never the serial alone. Serials repeat across
  // models, and this project wrote that rule down after an ORION-G 201 request
  // was offered an open call for a VEGA 201.
  eq('the serial list is filled from the chosen product',
    /sbListProductSerials\(product\)/.test(mh), true);
  // Changing the product must CLEAR the serial, or a serial belonging to
  // another model stays in the box — the exact mistake the two-step prevents.
  eq('...and changing the product clears the serial',
    /setSerial\(''\); setSerials\(\[\]\); setEvents\(null\); setNow\(null\);/.test(mh), true);
  // Every register is filtered on the serial in the DATABASE and then narrowed
  // by product in the page, because no index can do the second half.
  eq('every register is narrowed by the product too',
    /const sameMachineRows =/.test(lib) && /machineKey\(s\(r\[productField\]\), serial\) === want/.test(lib), true);
  eq('...using the project\'s own machine key, not a private one',
    /from '\.\/machine'/.test(lib), true);

  // THE FOUR THE USER'S OWN LIST DID NOT NAME. "If i am missing anything add."
  for (const src of ['Field Failure', 'Feedback', 'Additional entry', 'Workshop']) {
    eq(`${src} is in the history`, new RegExp(`source: '${src}'`).test(lib), true);
  }
  // ...and the six that were named.
  for (const src of ['Call', 'Visit', 'Spare', 'Sale / warranty', 'Contract', 'Ownership']) {
    eq(`${src} is in the history`, new RegExp(`source: '${src}'`).test(lib), true);
  }

  // One register refusing must not lose the other nine — they are read in
  // parallel and a reader may hold rights to some and not others.
  eq('a register that refuses does not empty the page',
    /one register refusing must not lose the other nine/.test(lib), true);
  // An undated row sorts LAST: putting it first would read as the most recent
  // thing that happened.
  eq('an undated row does not pose as the newest',
    /\(b\.on \|\| ''\)\.localeCompare\(a\.on \|\| ''\)/.test(lib), true);
  // A UCN carries its call's colour wherever it appears — the standing rule.
  eq('a UCN is coloured here too', /<Ucn ucn=\{String\(r\.ucn\)\}/.test(mh), true);
  // The counts are over whole registers read for one machine, not pages, so
  // they are exact and take no "+".
  eq('the counts are exact, so they take no plus', /countMore=\{false\}/.test(mh), true);
  // A machine the Product Master has never heard of is a FINDING, not an error.
  eq('a machine missing from the register says so',
    /not on the Product Database/.test(mh), true);
}

console.log('\n-- every hand-run SQL file runs where it is actually pasted --');
{
  // THE SUPABASE SQL EDITOR IS NOT psql. Everything in `supabase/apply/`, and
  // the two consolidated files at the repository root, is handed to the user as
  // a link and pasted into that editor — where `\\set`, `\\echo` and `\\i` are
  // not commands but a syntax error on the line they appear.
  //
  // Written after doing it: `_dccr_undo.sql` shipped with ten of them and came
  // back as `ERROR: 42601: syntax error at or near "\\"` on line 44. Every
  // other file in that folder was already plain SQL, so the convention existed
  // and was simply not written down anywhere a check could see.
  const files = [
    ...readdirSync('supabase/apply').filter((f) => f.endsWith('.sql')).map((f) => `supabase/apply/${f}`),
    // EVERY hand-run file at the root, not a list of the ones that existed when
    // this check was written. `ProdHistory_01..06` are pasted into the same
    // editor and were outside the pattern — clean, as it happens, which is the
    // only reason it did not matter. A check that names yesterday's files is
    // the drift it exists to catch.
    ...readdirSync('.').filter((f) => /^(Spare|HandStock|ProdHistory)_\w+\.sql$/.test(f)),
  ];
  eq('there are hand-run SQL files to check', files.length > 0, true);
  const bad: string[] = [];
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => {
      // A meta-command is a backslash at the START of a line. A backslash
      // inside a string or a regex (E'\\n', '~ ^\\d{4}$') is ordinary SQL and
      // must not be flagged, which is most of what this pattern is for.
      if (/^\s*\\[a-z]/.test(l)) bad.push(`${f}:${i + 1}  ${l.trim().slice(0, 40)}`);
    });
  }
  eq('no hand-run SQL file uses a psql meta-command', bad, []);

  // ...AND A BUNDLE NAMED IN THE DOCS MUST EXIST.
  //
  // CLAUDE.md claimed this check "resolves every SQL path in the docs". It did
  // not — it checked meta-commands and nothing else, which is the exact fault
  // that file warns about elsewhere: a comment claiming a check exists is worse
  // than no comment, because it is the reason nobody looks.
  //
  // Written after doing it TWICE in one week: a raw link to a file that was
  // only on a branch (404), and `_status.sql` row 166 plus a changelog entry
  // telling somebody to run `handstock.sql` — a bundle whose real name is
  // `HandStock_X.sql`, at the repository ROOT. A name in a "Restore:" clause is
  // read by somebody deciding WHAT TO RUN, so a wrong one sends them looking
  // for a file that has never existed.
  const bundles = new Set([
    ...readdirSync('supabase/apply').filter((f) => f.endsWith('.sql')),
    ...readdirSync('.').filter((f) => /^(Spare|HandStock)_\w+\.sql$/.test(f)),
  ]);
  const named: string[] = [];
  const status = readFileSync('supabase/apply/_status.sql', 'utf8');
  for (const m of status.matchAll(/Restore:\s*([A-Za-z0-9_]+\.sql)/g)) named.push(m[1]);
  eq('_status.sql names a bundle to restore from', named.length > 0, true);
  eq('...and every one of those bundles exists',
    [...new Set(named)].filter((f) => !bundles.has(f)), []);

  // A DESTRUCTIVE HAND-RUN FILE MAY ONLY TOUCH WHAT IT SAYS IT TOUCHES.
  // `_dccr_undo.sql` is pasted whole into the SQL Editor and its deletes are
  // the DCCR register's alone — the user's own scoping, 2026-09-14: "this is
  // specific to DCCR Only and not any other tables". A second table appearing
  // in a delete here would be a much bigger operation wearing this file's name.
  {
    const dccr = readFileSync('supabase/apply/_dccr_undo.sql', 'utf8');
    const targets = [...dccr.matchAll(/delete\s+from\s+([a-z_.]+)/gi)].map((m) => m[1].toLowerCase());
    eq('the DCCR tool deletes something', targets.length > 0, true);
    eq('...and only ever from call_reviews',
      [...new Set(targets)], ['public.call_reviews']);
  }
}

console.log('\n-- the Insights tab can be interrogated --');
{
  const ins = readFileSync('src/modules/FieldFailureInsights.tsx', 'utf8');
  const charts = readFileSync('src/components/charts/Charts.tsx', 'utf8');
  const css = readFileSync('src/components/charts/charts.css', 'utf8');

  // EVERY DIMENSION IS BOTH FILTERABLE AND CLICKABLE. A dimension listed in
  // DIMS but never wired to a chart is a chip nobody can raise; a chart wired
  // to a key that is not in DIMS filters by something the chip bar cannot name.
  // SCRAPED FROM THE `DIMS` ARRAY ALONE, not from the whole file. This used to
  // match every `{ key: …, label: … }` anywhere in the module, which was fine
  // while DIMS was the only such list — and broke the moment the page grew a
  // period selector and a Pareto dimension list, reporting 'quarter' as an
  // unwired dimension and 'product_name' as a duplicate. A guard that reads
  // more of a file than it means to fails on unrelated work, which is how one
  // gets weakened.
  const dimsBlock = ins.split('const DIMS = [')[1]?.split('] as const;')[0] ?? '';
  eq('the DIMS array is where the check thinks it is', dimsBlock.length > 0, true);
  const dims = [...dimsBlock.matchAll(/\{\s*key:\s*'([a-z_]+)'\s*,\s*label:/g)].map((m) => m[1]);
  eq('every dimension is declared once', dims.length, new Set(dims).size);
  for (const d of dims) {
    eq(`${d} is wired to a chart`, ins.includes(`pick('${d}')`), true);
    eq(`${d} passes its own active mark`, ins.includes(`picked.${d} ??`), true);
  }
  const picks = [...ins.matchAll(/pick\('([a-z_]+)'\)/g)].map((m) => m[1]);
  for (const p of picks) eq(`the chart key ${p} is a declared dimension`, dims.includes(p), true);

  // THE CROSS-FILTER RULE. Each chart must count the rows left by every OTHER
  // choice — filtering a chart by its own dimension collapses it to the single
  // bar that was just clicked, which answers nothing.
  eq('a chart excludes its own dimension', /except\?: DimKey/.test(ins), true);
  eq('...and the charts go through forDim', ins.includes("tally(forDim('live_product_name'), 'live_product_name')"), true);
  eq('the KPIs read the FULLY filtered rows',
    /const rows = useMemo\(\(\) => applyPicks\(allRows, picked, period\)/.test(ins), true);

  // -------------------------------------------------------------------------
  // THE TREND'S PERIOD (the user's ask: "Allow me to adjust it [Monthly,
  // Quarterly, Yearly]").
  //
  // The marks on that chart are CLICKABLE, so a bucket key is also a FILTER
  // VALUE — which makes the period a correctness question, not a display one.
  // -------------------------------------------------------------------------
  eq('the trend is a line chart', /<LineChart data=\{trend\}/.test(ins), true);
  eq('...readable three ways', /'month' \| 'quarter' \| 'year'/.test(ins)
    && /label: 'Monthly'/.test(ins) && /label: 'Quarterly'/.test(ins)
    && /label: 'Yearly'/.test(ins), true);
  // ONE function buckets a date, and the cross-filter uses the SAME one. If the
  // chart grouped by quarter while dimValue still answered in months, clicking
  // 2026-Q1 would filter on a value no row has and the page would empty.
  eq('the cross-filter buckets dates the way the chart does',
    /const dimValue = \(r: Row, k: DimKey, p: Period\)/.test(ins)
    && /periodLabel\(periodKey\(s\(r, 'ffr_date'\), p\), p\)/.test(ins), true);
  // Changing the scale must CLEAR the chosen bucket: "2026-03" is not a
  // quarter, so keeping it leaves a chip filtering on nothing.
  eq('...and changing the scale clears a chosen bucket',
    /setPicked\(\(q\) => \(\{ \.\.\.q, month: undefined \}\)\);\s*\n\s*setPeriod\(p\.key\);/.test(ins), true);
  // The chip must not read "Month: 2026-Q1".
  eq('...and the chip is named for what it holds',
    /period === 'year' \? 'Year' : period === 'quarter' \? 'Quarter' : 'Month'/.test(ins), true);

  // The bucketing itself, worked by hand rather than read off the code.
  eq('a month bucket is the month', periodKey('2026-03-14', 'month'), '2026-03');
  eq('March is Q1', periodKey('2026-03-14', 'quarter'), '2026-Q1');
  eq('...April is Q2', periodKey('2026-04-01', 'quarter'), '2026-Q2');
  eq('...and December is Q4', periodKey('2026-12-31', 'quarter'), '2026-Q4');
  eq('a year bucket is the year', periodKey('2026-03-14', 'year'), '2026');
  // An unparseable date is counted NOWHERE rather than in the wrong period.
  eq('a junk date falls in no bucket at all', periodKey('', 'month'), '');
  eq('...however it is malformed', periodKey('not a date', 'quarter'), '');

  // -------------------------------------------------------------------------
  // THE PARETO.
  // -------------------------------------------------------------------------
  eq('there is a Pareto', /<ParetoChart data=\{pareto/.test(ins), true);
  // THREE LEVELS, and every one of them a REAL dimension — or clicking a bar
  // filters by a key the chip bar cannot name and cannot clear.
  const paretoBlock = ins.split('const PARETO_LEVELS = [')[1]?.split('] as const;')[0] ?? '';
  const pDims = [...paretoBlock.matchAll(/\{\s*key:\s*'([a-z_]+)'\s*,\s*label:/g)].map((m) => m[1]);
  eq('the Pareto drills three levels', pDims.length, 3);
  eq('...machine, grouping, root cause', pDims,
    ['live_product_name', 'live_complaint_grouping', 'live_root_cause_keyword']);
  for (const d of pDims) eq(`Pareto by ${d} is a declared dimension`, dims.includes(d), true);
  // NOT over a period or a status: a Pareto ranks CONTRIBUTORS to a total, and
  // a period is a sequence while a status is an outcome.
  eq('...and not over a period', pDims.includes('month'), false);

  // THE LEVEL IS DERIVED FROM THE FILTERS, never held separately. Two sources
  // of truth for "where am I" is how a drill-down shows one thing and claims
  // another — and it is also what lets picking a machine on the bar chart ABOVE
  // advance this chart, which is the same question asked from the other end.
  eq('the level follows the filters',
    /const paretoOpen = PARETO_LEVELS\.filter\(\(l\) => !picked\[l\.key\]\)/.test(ins), true);
  // "The 2nd and the 3rd are interchangeable or can be skipped": the open
  // levels are OFFERED, so the reader picks the next question rather than being
  // marched through a fixed order.
  eq('...and the remaining levels can be taken in any order',
    /paretoOpen\.map\(\(l\) => \(/.test(ins)
    && /onClick=\{\(\) => setParetoWant\(l\.key\)\}/.test(ins), true);
  // Dropping ONE level must not drop the others: with the order free there is
  // no "under", and keeping the machine while re-asking the grouping is a
  // coherent question.
  eq('...and dropping one level keeps the rest',
    /const paretoDrop = \(k: ParetoKey\) => \{ setPicked\(\(q\) => \(\{ \.\.\.q, \[k\]: undefined \}\)\)/.test(ins), true);
  // A chosen level that is re-opened must not leave the chart pointing at a
  // closed one.
  eq('...and the chart never ranks a level that is already chosen',
    /paretoWant && paretoOpen\.some\(\(l\) => l\.key === paretoWant\) \? paretoWant : paretoOpen\[0\]\?\.key/.test(ins), true);
  // Blanks are KEPT and CALLED OUT, matching the page's existing rule that a
  // chart which quietly adds up to less than the total is worse than one that
  // admits the gap.
  eq('a gap in the record is stated, not dropped', /paretoBlank > 0 &&/.test(ins), true);
  eq('...and the 80% line is drawn and explained',
    /ch-pareto-80/.test(charts) && /the dashes mark 80%/.test(ins), true);

  // Both new charts follow the shared contract.
  for (const c of ['LineChart', 'ParetoChart']) {
    eq(`${c} takes the interaction as optional`, new RegExp(`export function ${c}\\([^)]*Pickable`).test(charts), true);
  }
  // An SVG that fills its width by stretching shears every glyph in it.
  eq('the new charts scale proportionally, never stretched',
    /preserveAspectRatio="none"/.test(code(charts)), false);
  // The empty state must test the WHOLE register, not the filtered set —
  // otherwise narrowing to nothing reads as "no reports on the register".
  eq('"nothing on the register" tests the whole register', ins.includes('if (!allRows.length)'), true);
  eq('...and a filter matching nothing says so separately', ins.includes('Nothing matches'), true);

  // WHAT THE PAGE IS ANSWERING FOR IS ON SCREEN. Every figure moves when a mark
  // is clicked; a page that changed what it counted without saying so would be
  // worse than one that could not be filtered.
  eq('the count of shown vs total is stated', /\{rows\.length\} of \{allRows\.length\}/.test(ins), true);
  eq('there is a clear-all', ins.includes('Clear all'), true);

  // -------------------------------------------------------------------------
  // THE HORIZONTAL BAR: LABEL, TOTAL, BAR — and an adjustable label column.
  //
  // "not able to read these - Make those Columns Adjustable , Move the Total
  // next to the RootCause , the Bar can be the last Column. Follow the same
  // Practice for all Horizontal Bar Charts in Insights."
  //
  // The two things being compared are the NAME and the NUMBER, and they had a
  // bar between them — so reading "SOLENOID BLOCK AS… 3" meant crossing the
  // whole width twice.
  // -------------------------------------------------------------------------
  eq('the bar row reads label, total, bar',
    /grid-template-columns: var\(--ch-label-w, 190px\) 52px 1fr/.test(css), true);
  // Order in the MARKUP too, not only in the grid: a row that is drawn in one
  // order and read by a screen reader in another is only half fixed.
  {
    const row = charts.split('className={`ch-bar-row')[1]?.split('</div>')[0] ?? '';
    eq('...in that order in the markup as well',
      row.indexOf('ch-bar-label') < row.indexOf('ch-bar-value')
      && row.indexOf('ch-bar-value') < row.indexOf('ch-bar-track'), true);
  }
  eq('the label column is draggable', /className="ch-bar-grip"/.test(charts)
    && /cursor: col-resize/.test(css), true);
  // Capped, or the bar can be dragged out of existence and the chart becomes a
  // table — the reader still has to see the shape.
  eq('...within limits that keep a bar on screen',
    /Math\.min\(Math\.max\(ev\.clientX - r\.left, 60\), Math\.max\(120, r\.width - 160\)\)/.test(charts), true);
  eq('...and remembered per chart', /localStorage\.setItem\(`\$\{BAR_LABEL_KEY\}\.\$\{widthKey\}`/.test(charts), true);
  // The handle must not fall through and pick the bar underneath it.
  eq('...without the handle picking a bar', /e\.stopPropagation\(\);\s*\/\/ never let the handle pick a bar/.test(charts), true);
  // EVERY horizontal bar chart on Insights, which is what "the same practice"
  // means — and none of them may pre-truncate the label, or widening the
  // column would reveal a name that was already cut before it arrived.
  eq('every Insights bar chart takes a remembered width',
    (ins.match(/<BarChart /g) ?? []).length, (ins.match(/widthKey="/g) ?? []).length);
  eq('...and none of them truncates the label first', /label\.slice\(0, 46\)/.test(code(ins)), false);

  // -------------------------------------------------------------------------
  // DATA LABELS ON THE TREND, and a toggle.
  // -------------------------------------------------------------------------
  eq('the trend can print its values', /showLabels\?: boolean/.test(charts)
    && /showLabels && \(/.test(charts), true);
  // OFF by default: over twenty-odd periods the numbers collide, and which it
  // is depends on how many are on screen — so it is the reader's call.
  eq('...off until asked for', /showLabels = false/.test(charts), true);
  eq('...with a toggle that says which way it is',
    /aria-pressed=\{trendLabels\}/.test(ins) && /setTrendLabels\(\(v\) => !v\)/.test(ins), true);
  // The first and last labels must stay inside the drawing.
  eq('...and the end labels are nudged inward rather than clipped',
    /textAnchor=\{i === 0 \? 'start' : i === data\.length - 1 \? 'end' : 'middle'\}/.test(charts), true);

  // -------------------------------------------------------------------------
  // THE PARETO'S NUMBERS, BESIDE THE CHART AND DOWNLOADABLE.
  //
  // "Give me the Pareto Data right next to the Chart -- Provide a Provision to
  // download the Data - Provide Clean Split Up and how that data point / % was
  // arrived at."
  // -------------------------------------------------------------------------
  eq('the Pareto shows its numbers beside the chart', /ffr-split/.test(ins)
    && /<table className="ffr-mini">/.test(ins), true);
  // ONE ARRAY, DRAWN TWICE. A table built from its own pass over the same rows
  // is a second implementation of the same arithmetic, and the two only have to
  // disagree once to be worthless.
  eq('...from the same array the chart draws',
    /<ParetoChart data=\{paretoRows\.map\(\(r\) => \(\{ label: r\.label, value: r\.value \}\)\)\}/.test(ins), true);
  eq('...showing the split-up per row',
    /Reports<\/th>/.test(ins) && /Share<\/th>/.test(ins) && /Cum\. %<\/th>/.test(ins), true);
  // HOW each figure was arrived at, not just what it is.
  eq('...and how each figure was arrived at',
    /Share = reports ÷ \{paretoTotal\}/.test(ins)
    && /Cum\. % = the running total ÷ \{paretoTotal\}/.test(ins), true);
  eq('the numbers can be taken away', /onClick=\{downloadPareto\}/.test(ins)
    && /xlsxDownload\(`ffr-pareto-/.test(ins), true);
  // The file carries the working, to the same standard as the Objective
  // evidence pack: a number somebody may act on has to be checkable without
  // this screen.
  eq('...with the arithmetic beside it in the file',
    /'Share worked out'/.test(ins) && /'Cumulative worked out'/.test(ins)
    && /name: 'How this was worked out'/.test(ins), true);
  // The percentages are over EVERYTHING, not over the fourteen drawn — so the
  // file has to say what it left out or the reader will assume otherwise.
  eq('...and says what it did not draw',
    /Item: 'Not shown'/.test(ins), true);

  // -------------------------------------------------------------------------
  // THE RAW ROWS, THE PARETO'S LABELS, AND THE TREND'S OWN TABLE.
  //
  // The user, 2026-09-14: "In the Download, i want the Raw data of how that
  // Number was arrived at. Need Data Label option in Pareto. Same kinda Data
  // table on the Side for 'Reports raised, month by month' -- Line Chart as
  // well."
  // -------------------------------------------------------------------------
  // THE REPORTS THEMSELVES. A summary whose own arithmetic is consistent can
  // still be counting the WRONG ROWS, and nothing in the file would show it.
  eq('the download carries the reports behind the number',
    /name: 'The reports behind it'/.test(ins) && /'FFR No'/.test(ins) && /UCN:/.test(ins), true);
  // THE SAME ARRAY THE CHART COUNTED, named once and used twice — two calls to
  // forDim() would be two arrays that only have to disagree once for the file
  // to stop reconciling with its own summary.
  eq('...from the same rows the chart counted',
    /const paretoSrc = useMemo\(\(\) => forDim\(paretoBy\)/.test(ins)
    && /tally\(paretoSrc, paretoBy\)/.test(ins)
    && /rawSheet\(paretoSrc, paretoBy, paretoAt\.label\)/.test(ins), true);
  eq('...and the trend the same way',
    /const trendSrc = useMemo\(\(\) => forDim\('month'\)/.test(ins)
    && /byPeriod\(trendSrc, period\)/.test(ins)
    && /rawSheet\(trendSrc, 'ffr_date'/.test(ins), true);
  // A row counted under a blank is still a row, and the raw sheet must say so
  // rather than leave the cell empty — an empty cell reads as a missing export.
  eq('...with a blank bucket named, not left empty',
    /\[bucketLabel\]: s\(r, bucketKey\) \|\| BLANK/.test(ins), true);

  // DATA LABELS ON THE PARETO, off by default as the trend's are.
  eq('the Pareto can show its data labels',
    /const \[paretoLabels, setParetoLabels\] = useState\(false\)/.test(ins)
    && /showLabels=\{paretoLabels\}/.test(ins)
    && /setParetoLabels\(\(v\) => !v\)/.test(ins), true);
  // TWO SCALES, TWO LABELS, each against its own mark — the count on the bar,
  // the cumulative percentage on the line. One label for both would be read
  // against whichever scale the eye landed on.
  eq('...the count on the bar and the percentage on the line',
    /className=\{`ch-line-tag\$\{on \? ' is-active' : ''\}`\}>\s*\{d\.value\}/.test(charts)
    && /className="ch-pareto-tag"/.test(charts), true);
  // BOTH CLAMPED INSIDE THE DRAWING. The tallest bar reaches the top of the
  // plot and the line ends at 100% in the corner; an unclamped label at either
  // is cut off by the viewBox.
  eq('...and both stay inside the drawing',
    /Math\.max\(PAD2\.t \+ 9, y\(d\.value\) - 5\)/.test(charts)
    && /Math\.min\(PAD2\.t \+ h - 3, yPct\(pc\) \+ 13\)/.test(charts), true);

  // THE TREND'S NUMBERS, beside its line, from the same array.
  eq('the trend shows its numbers beside the line',
    /<LineChart data=\{trend\} showLabels=\{trendLabels\}/.test(ins)
    && /\{trendRows\.map\(\(r\) => \(/.test(ins), true);
  eq('...with the change on the period before it',
    /Change<\/th>/.test(ins) && /r\.change === null \? '—'/.test(ins), true);
  // A DASH, NOT A ZERO, on the first row: "no period before it" and "no change"
  // are different answers and a zero states the wrong one.
  eq('...and the first period reads a dash rather than no change',
    /change: prev === null \? null : d\.value - prev/.test(ins), true);
  eq('...and can be taken away too',
    /onClick=\{downloadTrend\}/.test(ins) && /xlsxDownload\(`ffr-trend-/.test(ins), true);

  // THE LAYOUT CLASS IS NAMED FOR THE LAYOUT, not for the Pareto — the trend
  // uses it now, and a class called `ffr-pareto-split` on a line chart is the
  // kind of small lie that makes the next reader distrust the rest.
  {
    const fc = readFileSync('src/modules/fieldcalls.css', 'utf8');
    eq('the split layout is not named after one chart',
      /\.ffr-split \{/.test(fc) && !/\.ffr-pareto-split \{/.test(fc), true);
  }

  // Interaction is OPTIONAL on the shared charts, so every other dashboard
  // renders exactly as before.
  for (const c of ['BarChart', 'ColumnChart', 'DonutChart']) {
    eq(`${c} takes the interaction as optional`, new RegExp(`export function ${c}\\([^)]*Pickable`).test(charts), true);
  }
  eq('a pickable mark is a real button', charts.includes("role: 'button'"), true);
  eq('...reachable by keyboard', charts.includes("e.key === 'Enter'"), true);
  // Selection is CONTRAST, not a tint (the project's rule).
  eq('the chosen mark inverts against the page',
    /\.ch-pick\.is-active\s*\{[^}]*background:\s*var\(--text\)[^}]*color:\s*var\(--surface\)/.test(css), true);
}

  if (def) {
    eq('it writes the register table', def.table, 'field_failure_reports');
    // THE NUMBER AND THE MACHINE ARE THE KEY, or a re-run adds the year again
    // instead of correcting it — the one thing a multi-year load cannot afford.
    // The number ALONE is not the identity: one paper report covers several
    // units (16/18 in the 2018 register covers serials 252-255), and keying on
    // it alone silently overwrote twelve machines across 2016-2019.
    eq('re-loading a year corrects rather than duplicates', def.conflict, 'ffr_no,product_serial');
    eq('...and the machine is half of that key',
      def.conflict!.split(',').includes('product_serial'), true);
    // The pair only works because the serial can never be NULL — NULLs do not
    // collide, so a report with no serial would arrive again on every load.
    eq('the serial column the key depends on is declared not-null in 0165',
      /product_serial\s+text\s+not null\s+default\s+''/.test(
        readFileSync('supabase/migrations/0165_field_failure_register.sql', 'utf8')), true);
    eq('and the number is required', !!def.cols.find((c) => c.to === 'ffr_no')?.required, true);
    // AN UNKNOWN COLUMN IS KEPT. This is what makes "a different format every
    // year" safe: nothing is dropped, and the screen lists what it kept.
    eq('an unrecognised column is kept on the row', def.extraInto, 'extra');
    // MIGRATED DATA STAYS DISTINGUISHABLE (URS-037).
    eq('every imported row is marked as migrated',
      String((def.stamp ?? {}).imported_from ?? '') !== '', true);
    // THE SHEET'S "Raised by" IS A NAME, not a user account.
    const raisedBy = def.cols.find((c) => c.from.includes('raised by'));
    eq('the sheet’s Raised by lands in the NAME column', raisedBy?.to, 'raised_by_name');
    eq('and never in raised_by', def.cols.some((c) => c.to === 'raised_by'), false);

    // THE SAME THING UNDER DIFFERENT HEADINGS MUST REACH THE SAME COLUMN —
    // that IS the ask. Spot-checked on the ones the years are most likely to
    // disagree about.
    const colFor = (h: string) => def.cols.find((c) => c.from.includes(h))?.to;
    for (const [heading, target] of [
      ['hospital name', 'customer_name'], ['customer name', 'customer_name'],
      ['crn no', 'ucn'], ['uc number', 'ucn'],
      ['equipment name', 'product_name'], ['product name', 'product_name'],
      ['serial no', 'product_serial'], ['product s. no', 'product_serial'],
      ['complaint date', 'crn_date'], ['crn date', 'crn_date'],
      ['equipment status', 'cover'], ['wgp/ ogp/ amc', 'cover'],
    ] as const) {
      eq(`"${heading}" reaches ${target}`, colFor(heading), target);
    }
    // A DATE COLUMN MUST BE TYPED, or a day-first sheet date lands as text and
    // every ordering over it is wrong.
    for (const k of ['ffr_date', 'crn_date', 'installation_date']) {
      eq(`${k} is parsed as a date`, def.cols.find((c) => c.to === k)?.type, 'date');
    }
  }

  // THE SPLIT IS SHOWN, not merely stored: URS-037 asks a figure drawn from
  // both to REPORT it, and every aggregate on Insights is drawn from both.
  const ins = readFileSync('src/modules/FieldFailureInsights.tsx', 'utf8');
  eq('Insights reports the migrated split',
    /imported_from/.test(ins) && /label="Migrated"/.test(ins), true);
}

console.log('\n-- the Roles & Permissions matrix follows the MENU, and every screen can be granted --');
{
  // -------------------------------------------------------------------------
  // THE USER'S STANDING RULE (2026-09-14): "Update the Roles & Permissions -
  // Always when a New UI is introduced or when a UI is re-arranged -- This is
  // often missed."
  //
  // It was missed, and `rbac.ts` said "check:ui compares the two on every run"
  // while NOTHING read PERM_TREE. A comment claiming a check exists is worse
  // than no comment: it is why nobody looked. This block is that check.
  //
  // What had drifted when it was written:
  //   * Machine History moved to Overview in the menu (v0.9.254) and kept a
  //     header of its own in the matrix — so an administrator looking for it
  //     under Overview would not find it.
  //   * The header ORDER had Reports and Indoor Service the other way round.
  //   * THREE MODULE KEYS HAD NEVER BEEN GRANTED IN THE DATABASE AT ALL
  //     (mod:/machine-history, mod:/exports/calls, mod:/exports/feedback) —
  //     0195 is the repair, and the last assertion here is what stops a fourth.
  // -------------------------------------------------------------------------
  const lay = readFileSync('src/components/layout/Layout.tsx', 'utf8');
  const nav = lay.slice(lay.indexOf('title:'), lay.indexOf('\n];', lay.indexOf('title:')));
  const menu: { title: string; items: { to: string; label: string }[] }[] = [];
  for (const m of nav.matchAll(/title: '([^']+)',[^[]*?items: \[([\s\S]*?)\n\s*\],/g)) {
    menu.push({ title: m[1], items: [...m[2].matchAll(/\{ to: '([^']+)', label: '([^']+)'/g)].map((x) => ({ to: x[1], label: x[2] })) });
  }
  // EVERY GROUP, not "more than five". The first version trusted a floor and a
  // whole group went missing without a word: `Knowledge Base` carries
  // `flash: true` between its title and its items, the pattern required them
  // adjacent, and the group was skipped — so Service Manuals and the two
  // Knowledge Base pages were compared against nothing and PASSED. A parse that
  // silently drops input makes every assertion built on it vacuous, which is a
  // worse failure than the one this block was written to catch.
  eq('every menu group parsed, not just most of them',
    menu.length, (nav.match(/^\s*title: '/gm) ?? []).length);

  const headerOf = new Map<string, string>();      // matrix: path -> header
  const labelOf = new Map<string, string>();       // matrix: path -> label
  PERM_TREE.forEach((h) => h.pages.forEach((pg) => {
    if (pg.path) { headerOf.set(pg.path, h.title); labelOf.set(pg.path, pg.label); }
  }));
  const menuGroup = new Map<string, string>();
  const menuLabel = new Map<string, string>();
  menu.forEach((g) => g.items.forEach((i) => { menuGroup.set(i.to, g.title); menuLabel.set(i.to, i.label); }));

  // 1. A NEW SCREEN THAT IS NOT IN THE MATRIX CANNOT BE GRANTED BY ANYBODY.
  const modPaths = MODULES.map((m) => m.path).filter((x) => x !== '');
  eq('every module can be granted from the matrix', modPaths.filter((x) => !headerOf.has(x)), []);
  eq('...and the matrix invents no page that is not a module',
    [...headerOf.keys()].filter((x) => !modPaths.includes(x)), []);

  // 2. RE-ARRANGING THE MENU MOVES THE MATRIX ENTRY WITH IT. This is the half
  //    the user named second, and the half that leaves no error behind.
  const misfiled: string[] = [];
  menuGroup.forEach((grp, path) => {
    const h = headerOf.get(path);
    if (h && h !== grp) misfiled.push(`${path}: menu "${grp}" vs matrix "${h}"`);
  });
  eq('every page is filed under the header the MENU puts it under', misfiled, []);

  // 3. AND IN THE SAME ORDER — both of headers and of pages within one. The
  //    matrix is read next to the menu; a different order is read as a
  //    different thing.
  const menuTitles = menu.map((g) => g.title);
  const treeTitles = PERM_TREE.map((h) => h.title).filter((t) => menuTitles.includes(t));
  eq('the headers are in the menu\u2019s order', treeTitles, menuTitles);
  // "Across the system" is the one header with no menu group, and it is last:
  // it holds the rights that belong to no page.
  eq('...and the only header with no menu group is the last one',
    PERM_TREE.filter((h) => !menuTitles.includes(h.title)).map((h) => h.title),
    ['Across the system']);
  const orderBad: string[] = [];
  PERM_TREE.forEach((h) => {
    const g = menu.find((x) => x.title === h.title);
    if (!g) return;
    const inTree = h.pages.map((pg) => pg.path).filter((pth) => menuLabel.has(pth));
    const inMenu = g.items.map((i) => i.to).filter((pth) => inTree.includes(pth));
    if (inTree.join(',') !== inMenu.join(',')) orderBad.push(h.title);
  });
  eq('...and the pages under each header too', orderBad, []);

  // 4. A RENAME IN THE MENU REACHES THE MATRIX. Not equality: the matrix adds
  //    clarifiers the menu has no room for ("\u21b3 Call Report", "Product Master
  //    (product lines)"), which are deliberate. It must CONTAIN the menu's name,
  //    so renaming the screen cannot leave the matrix calling it the old thing.
  const named: string[] = [];
  menuLabel.forEach((ml, path) => {
    const tl = labelOf.get(path);
    if (tl && !tl.includes(ml)) named.push(`${path}: menu "${ml}" vs matrix "${tl}"`);
  });
  eq('the matrix calls every screen what the menu calls it', named, []);

  // NOT ASSERTED HERE: "every module is held by some role in DEFAULT_PERMS".
  // It was, and it was DEAD — DEFAULT_PERMS is DERIVED from MODULES
  // (`...ALL_MODULES` / `...NON_ADMIN_MODULES`), so every module is in at least
  // the admin's list by construction and the assertion could not fail. It was
  // removed rather than left green: a tick that can never go red is what let
  // this whole area drift in the first place. The next one is the real question
  // anyway, and it is the one that was actually failing.

  // 5. ...AND THE CODE DEFAULT IS NOT ENOUGH. `permsForRole()` returns the
  //    STORED set whenever it is non-empty, so on a project in use — where
  //    every role has a tuned row — a key that no migration ever writes into
  //    `app_roles` reaches NOBODY, however many roles hold it in DEFAULT_PERMS.
  //    The screen ships, the menu entry exists, the permission is ticked in the
  //    code, and the page is invisible to all twelve roles. That is exactly
  //    what happened to Machine History and the two new reports.
  //
  //    A key inheriting from a granted parent is covered (parentAction makes
  //    `mod:/exports` stand in for every `mod:/exports/*`).
  const sqlAll = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n');
  // EITHER QUOTE. A migration writes the key as a SQL literal ('mod:/x') or
  // inside a jsonb one ('["mod:/x"]'::jsonb) — 0163 grants Call Review the
  // second way, and a check that only knew the first reported it missing when
  // it was not. A row that answers NO when nothing is missing is worse than no
  // row, because somebody acts on it.
  const granted = (k: string) => sqlAll.includes(`'${k}'`) || sqlAll.includes(`"${k}"`);
  eq('every module key is written into app_roles by some migration',
    MODULES.map((m) => moduleAction(m.path))
      .filter((k) => !granted(k))
      .filter((k) => { const par = parentAction(k); return !par || !granted(par); }), []);
}

console.log('\n-- a request for more than a thousand rows is PAGED, or it is a lie --');
{
  // -------------------------------------------------------------------------
  // POSTGREST CAPS A RESPONSE AT 1,000 ROWS HOWEVER LARGE THE `limit` SAYS, and
  // silently. `.limit(20000)` therefore reads as a precaution and is the
  // opposite: it is the line that makes the truncation invisible.
  //
  // Reported from use, 2026-09-14: Product & Party Search on ORION-G — 2,547
  // machines, and the serial box said "0 of 1000" and could not find serial
  // 2410. The count beside the product came from a VIEW and was right; the
  // serials were `.limit(20000)` and were the first thousand.
  //
  // It had been diagnosed ONCE, for listCallRequests, whose comment says
  // exactly this — and the same `.limit(n)` was left in twelve other places.
  // A fix applied to one of thirteen call sites is a fix that will be reported
  // again, which is what happened. `allRows()` is the shared one.
  // -------------------------------------------------------------------------
  const sb = code(readFileSync('src/lib/supabase.ts', 'utf8'));
  const over = [...sb.matchAll(/\.limit\((\d+)\)/g)].map((m) => Number(m[1])).filter((n) => n > 1000);
  eq('no request asks for more rows than a single response can carry', over, []);

  // A LITERAL WAS NOT WHERE IT WAS HIDING. The check above reads `.limit(5000)`
  // and finds nothing, because the number is a PARAMETER: `listAllStock(limit =
  // 5000)` then writes `.limit(limit)`, and `listPendingDispatch(limit = 2000)`
  // writes `.range(0, limit - 1)` — which is not a bigger request either, since
  // the cap is on the RESPONSE and not on the span asked for.
  //
  // SIX FUNCTIONS SAT IN THAT HOLE, found while building a page that counts
  // from them: the dispatch queue and the RM approval queue (both stopping at a
  // thousand lines with no Load more), every dispatched stock-out line, all
  // hand stock across the field, the whole User Master — which is the list every
  // "Call Allocated To" box is built from — and any master value list past a
  // thousand entries, whose picker then refuses a value that IS on the master.
  //
  // So the rule is about the DEFAULT, not the call: a function in this file
  // whose row budget starts above a single response must PAGE. The parameter is
  // named `cap` on the ones that do, which is what `allRows` calls it.
  const budgets = [...sb.matchAll(/export async function (\w+)\(([^)]*)\)[\s\S]{0,700}?\n\}/g)]
    .filter((m) => /\b(limit|cap)\s*=\s*(\d{4,})/.test(m[2]))
    .filter((m) => Number(/\b(?:limit|cap)\s*=\s*(\d{4,})/.exec(m[2])?.[1] ?? 0) > 1000)
    .filter((m) => !/allRows/.test(m[0]))
    // A hand-rolled 1,000-row loop is paging too — several predate `allRows`.
    .filter((m) => !/PAGE\s*=\s*1000|for \(let from = 0/.test(m[0]))
    // A FUNCTION THAT MAKES NO REQUEST CANNOT TRUNCATE ONE. `listMasterValues-
    // ForProduct` passes its budget to `listMasterItems` and filters what comes
    // back; it has no `.from()` of its own, so the cap applies where the query
    // is, and that function is checked on its own terms. Without this the guard
    // named it — a FALSE FINDING on a function that was already correct, which
    // is the one outcome worse than not checking at all.
    .filter((m) => /\.from\(/.test(m[0]))
    .map((m) => m[1]);
  eq('a function whose row budget exceeds one response pages for it', budgets, []);
  // THE HELPER LIVES IN ITS OWN MODULE so it can be imported and RUN — this
  // file reads `import.meta.env` at load and no node script can import it.
  // `npm run check:paging` tests the pager's behaviour against a fake server
  // that honours the cap; this only checks it is still the thing being used.
  eq('the pager is a module of its own, so it can be tested',
    existsSync('src/lib/paging.ts') && /from '\.\/paging'/.test(sb), true);
  // EVERY PAGED READ IS ORDERED. Without a deterministic order the pages can
  // overlap, and a row is then doubled or dropped — worse than truncation,
  // because the result looks complete.
  const unordered = [...sb.matchAll(/allRows<[^>]*>\(\(a, b\) =>([\s\S]{0,400}?)\), \d+\)/g)]
    .map((m) => m[1]).filter((body) => !/\.order\(/.test(body));
  eq('...and every paged read names an order, so the pages cannot overlap', unordered.length, 0);
}

console.log('\n-- a part can be renamed, and the rename carries its history --');
{
  // -------------------------------------------------------------------------
  // The user, 2026-09-14: "I need to be able to Edit Part Master", and — asked
  // before building, because the readings are very different work — the
  // decision: "Rename carries the history".
  //
  // A part's identity is the STRING `CODE|Description`, and NOTHING HAS A
  // FOREIGN KEY TO `parts`: nine tables carry that string as a value, and HAND
  // STOCK IS DERIVED from them. So the screen must not offer a plain edit of
  // those two fields — that would silently change an engineer's balance.
  // -------------------------------------------------------------------------
  const pm = code(readFileSync('src/modules/PartMaster.tsx', 'utf8'));
  const sbp = code(readFileSync('src/lib/supabase.ts', 'utf8'));

  eq('the screen can edit a part at all', /const \[edit, setEdit\] = useState<EditForm \| null>/.test(pm)
    && /\u270e Edit/.test(pm), true);
  // THE CODE AND DESCRIPTION GO THROUGH THE RENAME, never through a column
  // update. This is the assertion that stops the whole feature becoming a
  // stock bug: `updatePart` must not be able to write either of them.
  eq('the identity is never written as a plain column update',
    /export async function updatePart\(\s*id: number, patch: \{ category\?: string; product\?: string; purchase_cost\?: number \| null \}/.test(sbp), true);
  eq('...it goes through rename_part instead',
    /rpc\('rename_part'/.test(sbp) && /await renamePart\(edit\.id, edit\.code, edit\.description\)/.test(pm), true);

  // WHAT WOULD MOVE, SHOWN BEFORE IT MOVES. A count afterwards is a report; a
  // count beforehand is a decision.
  eq('what the rename will move is shown first',
    /rpc\('part_rename_impact'/.test(sbp) && /\{renaming && \(/.test(pm)
    && /record\(s\) will be renamed with it/.test(pm), true);
  // ...AND THE BUTTON WAITS FOR IT. Offering "Rename" while the count is still
  // loading is offering a decision without the fact it turns on.
  eq('...and the button waits for that count',
    /disabled=\{saving \|\| !!editProblem\(\) \|\| \(renaming && impact === null\)\}/.test(pm), true);
  // "NOTHING ELSE NAMES THIS" IS AN ANSWER, not a reason to say nothing: it is
  // what makes a rename easy, and hiding it leaves the reader assuming the worst.
  eq('...including when nothing references the part',
    /Nothing else names this part yet/.test(pm), true);

  // THE MIGRATION'S OWN SHAPE. The exemption that lets the rename touch a
  // consumption line must be a CAPABILITY, not a flag: `set_config` is callable
  // by anybody, so the first version was forgeable by exactly the person the
  // guard exists to stop.
  const mig = readFileSync('supabase/migrations/0196_rename_part.sql', 'utf8');
  eq('the rename exemption is a ticket, not a set_config flag',
    /create table if not exists public\.part_rename_ticket/.test(mig)
    && /from public\.part_rename_ticket t/.test(mig)
    && !/current_setting\('app\.part_rename'/.test(mig), true);
  eq('...with RLS on and no policy, so nobody can write one',
    /alter table public\.part_rename_ticket enable row level security/.test(mig)
    && !/create policy [a-z_]+ on public\.part_rename_ticket/.test(mig), true);
  // ALL NINE TABLES OR NONE. Hand stock is derived; a rename that misses one
  // changes a balance.
  for (const t of ['spare_consumption', 'spare_consumption_history', 'spare_issue_history',
                   'handstock_opening', 'spare_request_lines', 'spare_dispatch_lines',
                   'stock_transfer_lines', 'material_returns', 'indoor_job_parts']) {
    eq(`...and it moves ${t}`, new RegExp(`update ${t}\\s+set part`).test(mig), true);
  }
  // A RENAME IS NOT A MERGE: two parts means two sets of stock, which is not a
  // decision a rename should make silently.
  eq('a rename refuses to merge two parts',
    /a rename cannot merge two parts/.test(mig), true);
}

console.log('\n-- a test protocol that claims to be automated IS --');
{
  // -------------------------------------------------------------------------
  // `auto` on a TestCase names the check or suite that EXECUTES that protocol.
  // A claim like that is worth exactly its truthfulness: a package saying "this
  // requirement is automatically tested" while naming a file that does not
  // exist is worse than one saying nothing, because nobody goes looking.
  //
  // It was already wrong once, on the run that introduced the field: OQ-61
  // named `supabase/tests/retention_test.sql` before that suite was written.
  // Caught here, and the suite written rather than the claim dropped — FRS-022
  // is a HIGH-risk requirement and was one of four carrying no test at all.
  // -------------------------------------------------------------------------
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
  const bad: string[] = [];
  for (const t of TESTS) {
    if (!t.auto) continue;
    const a = t.auto.trim();
    if (a.startsWith('npm run ')) {
      if (!pkg.scripts[a.slice(8).trim()]) bad.push(`${t.id} → no such script: ${a}`);
    } else if (!existsSync(a)) {
      bad.push(`${t.id} → no such file: ${a}`);
    }
  }
  eq('every automated protocol names something that exists', bad, []);
  // AND THE PACKAGE KNOWS ITS OWN RATIO. Stating how many protocols a command
  // runs, versus how many wait for a person, is the honest form of "we test
  // this" — and it can only be stated if it is counted.
  const n = TESTS.filter((t) => t.auto).length;
  eq('...and at least some protocols are executed by a command', n > 0, true);
}

console.log('\n-- Part Master: the category is chosen, the product is many --');
{
  // -------------------------------------------------------------------------
  // The user, 2026-09-15: "In Part Master- the Spare / Consumable should be a
  // drop-down. product should be a multiple select drop-down from product list
  // (Short Form)."
  // -------------------------------------------------------------------------
  const pm = code(readFileSync('src/modules/PartMaster.tsx', 'utf8'));

  // A DROP-DOWN, AND A PickList ONE — a native <select> picks on the first
  // keystroke, which is why this application has none in a module.
  eq('Spare / Consumable is a pick list, not a text box',
    /<label className="field-label">Spare \/ Consumable<\/label>/.test(pm)
    && /<PickList\s+value=\{edit\.category\}/.test(pm), true);
  eq('...offering the four the importer normalises to',
    /const PART_CATEGORIES = \['Spare', 'Consumable', 'Product', 'Labour'\]/.test(pm), true);
  // OFFERED, NOT ENFORCED. 0152 dropped the CHECK on this column because it
  // aborted a 1,300-row load part-written; a form that silently replaced a
  // value the file brought would undo that decision from the other end.
  eq('...and a value the file brought is kept rather than dropped',
    /edit\.category && !PART_CATEGORIES\.includes\(edit\.category\)/.test(pm), true);

  // MANY, because a shared spare fits more than one machine.
  eq('Product is a multi-select', /<MultiPick\s+values=\{edit\.product\.split\(','\)/.test(pm), true);
  eq('...from the catalogue\u2019s SHORT FORMS',
    /shortForms\(v\)/.test(pm) && /options=\{families\}/.test(pm), true);
  // EMPTY MEANS NONE HERE, NOT ALL. MultiPick's own default is a FILTER's:
  // empty means every row. On a form that reading is wrong, so the label has to
  // say so rather than let the control imply it.
  eq('...and empty reads as none recorded, not as every product',
    /allLabel="\u2014 none recorded \u2014"/.test(pm), true);

  const pl = code(readFileSync('src/lib/productLines.ts', 'utf8'));
  eq('the short form is actually selected from the catalogue',
    /short_form/.test(pl) && /shortForm: s\(r\.short_form\)/.test(pl), true);
  // DE-DUPLICATED: all nine CPX CARE codes carry CPX, and a list offering it
  // nine times is a list nobody can use.
  eq('...and the list is de-duplicated',
    /new Set\(lines\.map\(\(l\) => l\.shortForm\)/.test(pl), true);

  // ---- AND THE BEHAVIOUR, not only the source ------------------------------
  // Shaped like the user's own ProductList export: nine CPX CARE codes all
  // carrying CPX, two EXTEND-XT carrying EXT, a line with no short form at all,
  // and a retired one.
  {
    const L = (name: string, shortForm: string, active = true): ProductLine =>
      ({ code: name + shortForm, name, active, category: '', shortForm });
    const out = shortForms([
      ...Array.from({ length: 9 }, () => L('CPX CARE', 'CPX')),
      L('EXTEND-XT', 'EXT'), L('EXTEND-XT', 'EXT'),
      L('ORION-G', 'ORG'), L('MONNAL T75', 'MT75'),
      L('NITRIC OXIDE REGULATOR', ''),
      L('HORUS', 'HO', false),
    ]);
    eq('nine CPX CARE codes give ONE option', out.filter((x) => x === 'CPX').length, 1);
    eq('...a line with no short form contributes nothing', out.includes(''), false);
    // A PART STILL FITS A MACHINE NO LONGER SOLD, and most of this catalogue is
    // for exactly those — `active` stops a new SALE ENTRY and nothing else.
    eq('...a RETIRED line is still offered', out.includes('HO'), true);
    eq('...and the list is sorted and whole', out, ['CPX', 'EXT', 'HO', 'MT75', 'ORG']);

    // THE ROUND TRIP the form performs: stored string -> choices -> stored
    // string. A column holding one text value has to survive being read back as
    // a set, or a saved part re-opens with the wrong boxes ticked.
    const parse = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
    eq('a stored value parses back to its choices', parse('ORG, MT75'), ['ORG', 'MT75']);
    eq('...an empty column is NO choices, not one empty one', parse(''), []);
    eq('...odd spacing from a hand-edited row still parses', parse(' ORG ,MT75,, '), ['ORG', 'MT75']);
    eq('...and it round-trips unchanged', parse('ORG, MT75').join(', '), 'ORG, MT75');
  }
}

console.log('\n-- frequent failure: two rules, and they answer different questions --');
{
  // -------------------------------------------------------------------------
  // The user, 2026-09-15: "Add more rule. Rule 2, Same Complaint across same
  // product, but multiple serial nos in the last 30 days."
  //
  // A second rule that merely fires more often is not a second rule. What has
  // to hold is the SEPARATION: rule 1 is one MACHINE repeating, rule 2 is one
  // MODEL failing the same way on DIFFERENT units — which rule 1 can never see,
  // because each of those calls is a first failure on its own machine.
  // -------------------------------------------------------------------------
  const mig = readFileSync('supabase/migrations/0198_frequent_failure_rule2.sql', 'utf8');

  // COUNTS DISTINCT SERIALS, NOT CALLS. The load-bearing choice: five visits to
  // one machine are rule 1's finding and must not read as a batch problem.
  eq('rule 2 counts distinct serials, not calls',
    /count\(distinct f\.serial_key\)/.test(mig), true);
  // ...AND A COMPLAINT IS REQUIRED. Matching on the product alone would flag
  // every busy model in the register.
  eq('...and a complaint is required, or every busy model would flag',
    /if v_r2_on and \(v_std <> '' or v_reported <> ''\) then/.test(mig), true);
  // DAYS, NOT MONTHS. Thirty days and "a month" are different lengths in
  // February, and the ask was thirty days.
  eq('...over a window measured in DAYS',
    /c\.reg_date >  v_on - v_r2_days/.test(mig)
    && /'rule2_window_days'/.test(mig), true);
  // EITHER RULE. A rule that did not change the verdict would be a report.
  eq('the verdict is either rule', /'is_frequent', v_rule1 or v_rule2/.test(mig), true);
  eq('...and says WHICH fired',
    /'rule1_is_frequent', v_rule1/.test(mig) && /'rule2_is_frequent', v_rule2/.test(mig), true);

  // RULE 1 MUST SURVIVE THE REWRITE. 0198 replaces frequent_failure() whole, and
  // the first draft rewrote `equipment_needs_complaint`'s truthiness test as
  // `in ('true',...)` while the stored value is `on` — so it silently read
  // FALSE and rule 1 would have flagged more calls than it does today.
  eq('rule 1\u2019s own setting keeps the test that matches its stored value',
    /\(select lower\(btrim\(value\)\) = 'on'\s*\n\s*from public\.app_settings where key = 'ffr\.equipment_needs_complaint'\)/.test(mig), true);

  // THE SCREEN SAYS WHICH RULE, because the action differs completely: a unit
  // to swap, or a batch to investigate.
  const dc = code(readFileSync('src/modules/DailyCallReview.tsx', 'utf8'));
  eq('the review screen names the rule that fired',
    /history\.rule1_is_frequent &&/.test(dc) && /history\.rule2_is_frequent &&/.test(dc), true);
  // AND AN ADMINISTRATOR CAN TUNE IT, as they can rule 1.
  const card = code(readFileSync('src/modules/FrequentFailureCard.tsx', 'utf8'));
  eq('...and an administrator can tune rule 2 too',
    /rule2_enabled/.test(card) && /rule2_window_days/.test(card) && /rule2_serials/.test(card), true);
  // ONE SERIAL IS NOT "MULTIPLE" — floored in the form as well as in SQL.
  eq('...with at least two serials, in the form as well as the database',
    /Math\.max\(2, num\(e\.target\.value, 2\)\)/.test(card)
    && /greatest\(coalesce\(\(select nullif\(btrim\(value\), ''\)::integer\s*\n\s*from public\.app_settings where key = 'ffr\.rule2_serials'\), 2\), 2\)/.test(mig), true);
}

console.log('\n-- who a new call is allotted to (0200) --');
{
  // -------------------------------------------------------------------------
  // The user, 2026-09-15: "During any new field call or Installation calls or
  // PM Call, it has to map the engineer as per the party master. In case of
  // creating a call from a request, then it has to map it to the requestor."
  //
  // TWO RULES THAT PULL AGAINST EACH OTHER, which is why both are checked here:
  // the party master widens where an engineer is FOUND, and the request path
  // must be the one place it does not reach.
  // -------------------------------------------------------------------------
  const fc = code(readFileSync('src/lib/fieldcall.ts', 'utf8'));
  const pend = code(readFileSync('src/modules/PendingRegistrations.tsx', 'utf8'));
  const mod = code(readFileSync('src/modules/FieldCalls.tsx', 'utf8'));

  // THE MACHINE WINS. The user chose this precedence before it was built, and
  // reversing it would silently re-allot every call on a machine whose own
  // Service Engineer is set — which is most of them.
  eq('the machine\'s Service Engineer still wins, the party is the fallback',
    /allocatedTo:\s*g\('Service Engineer'\)\.trim\(\)\s*\|\|\s*\(partyEngineer \?\? ''\)\.trim\(\)/.test(fc), true);

  // THE INSTALLATION CASE. A customer with no machine here cannot be answered
  // for by a machine, so the party has to be able to answer on its own.
  eq('a party with no machine can still name the engineer',
    /export function partyToCallPrefill/.test(fc), true);
  eq('...and it writes only the customer and the engineer, never a blank over the form',
    /return \{\s*partyName: party\.partyName,\s*allocatedTo: \(party\.serviceEngineer \?\? ''\)\.trim\(\),\s*\}/.test(fc), true);

  // THE CASCADE HAS TO ASK. A fallback nothing looks up is not a fallback.
  eq('the cascade looks the party engineer up and hands it on',
    /partyServiceEngineer\(val\)/.test(mod) && /onPick\(row, partyEngineer\)/.test(mod), true);
  eq('...and the party alone prefills the call, for an installation',
    /onPartyPick=\{\(party, serviceEngineer\)/.test(mod) && /partyToCallPrefill\(/.test(mod), true);

  // THE REQUEST WINS, and this is the line that used to lose it: spreading the
  // product prefill whole overwrote the engineer the request names, on a picker
  // whose own hint says it is only for correcting party/product/serial.
  eq('registering FROM A REQUEST keeps the request\'s engineer',
    /if \(String\(cur\.allocatedTo \?\? ''\)\.trim\(\)\) delete fromProduct\.allocatedTo;/.test(pend), true);

  // AND THE SERVICEMAN HAS TO ARRIVE. A column nothing fills answers nothing.
  const up = code(readFileSync('src/lib/uploads.ts', 'utf8'));
  eq('the Party Master upload maps Serviceman to a column of its own',
    /TEXT\('service_engineer', 'serviceman', 'service engineer', 'service man'\)/.test(up), true);
  // A REPEATED HEADING IS KEPT. Four of that file's 25 columns repeat, and they
  // used to reach no importer at all — not even `extra`.
  const csv = code(readFileSync('src/lib/csv.ts', 'utf8'));
  eq('a repeated heading is kept under a suffixed name, not dropped',
    /const key = n === 1 \? h : `\$\{h\} \[\$\{n\}\]`;/.test(csv), true);
  // SQUARE brackets are load-bearing: `loose()` strips a PARENTHESISED suffix,
  // so "Tel 1 (2)" loosens back to "tel 1" and the billing alias would bind to
  // the INSTALLATION column — silently, and only on files that repeat.
  eq('...in SQUARE brackets, which loose() does not strip',
    /\\\(\[\^\)\]\*\\\)/.test(code(readFileSync('src/lib/headers.ts', 'utf8'))), true);
}

console.log('\n-- the Party Master\'s columns, and its KYC (0201) --');
{
  // -------------------------------------------------------------------------
  // The user, 2026-09-15: "Additionally add provision to capture the KYC
  // details of the customer. Clean up the columns, de-dupe the column headers."
  //
  // Asked WHICH KYC fields, the answer was "I don't know.. there is some format
  // for KYC, I will update." So the fields are not invented: what is checked
  // here is the frame that WAS decided, and that nothing guessed its way in.
  // -------------------------------------------------------------------------
  const mig = readFileSync('supabase/migrations/0201_party_columns_and_kyc.sql', 'utf8');
  const up = code(readFileSync('src/lib/uploads.ts', 'utf8'));

  // EVERY PARTY STARTS PENDING — the user's answer, and the one KYC decision
  // that was actually made.
  eq('KYC starts Pending on every party',
    /add column if not exists kyc_status\s+text default 'Pending'/.test(mig), true);
  // A COUNTED VALUE IS A CLOSED LIST. A fourth spelling makes every count
  // wrong rather than merely untidy.
  eq('...and the status is a closed list, because it is counted',
    /check \(coalesce\(kyc_status, ''\) in \('', 'Pending', 'Verified', 'Rejected'\)\)/.test(mig), true);
  // WHO VERIFIED IT IS THE DATABASE'S TO RECORD — 0113's rule for who
  // registered a call, and 0173's for who reviewed one.
  eq('a caller cannot say who verified it',
    /new\.kyc_verified_by := auth\.uid\(\);/.test(mig), true);
  eq('...and un-verifying clears the stamp rather than leaving a stale name',
    /new\.kyc_verified_by := null;/.test(mig), true);

  // ONE DEFINITION OF THE PARSE, called by the backfill AND the trigger — or a
  // file loaded next year is read differently from the file loaded today.
  eq('the number is found by SHAPE, in one place',
    /create or replace function public\.kyc_gstin/.test(mig)
    && /create or replace function public\.kyc_pan/.test(mig), true);
  eq('...and the trigger calls it, so an upload is read like the migration',
    /new\.gstin := coalesce\(public\.kyc_gstin\(/.test(mig), true);
  eq('a typed number is never overwritten by a spreadsheet',
    /if coalesce\(btrim\(new\.gstin\), ''\) = '' then/.test(mig), true);

  // THE COLUMNS ARE DE-DUPED BY NAME, not numbered: two contact blocks.
  ['billing_address', 'billing_pincode', 'billing_phone', 'billing_phone_2', 'billing_fax', 'billing_email']
    .forEach((c) => eq(`the billing block has a ${c} of its own`,
      new RegExp(`add column if not exists ${c}\\s`).test(mig), true));
  eq('the billing contacts are read from the REPEATED headings',
    /'tel 1 \[2\]'/.test(up) && /'email id \[2\]'/.test(up), true);
  // AND Profile STOPPED BEING AN ALIAS OF party_type the moment it got a
  // column: on a file with Profile and no Type, both would bind the same
  // heading and party_type would come out holding "GOVERNMENT".
  eq('Profile is its own column and no longer an alias of party_type',
    /TEXT\('party_type', 'type'\),/.test(up) && /TEXT\('profile'\),/.test(up), true);
}

console.log('\n-- a new column reaches the Party Master screen, not just the table --');
{
  // -------------------------------------------------------------------------
  // Reported the day after 0200/0201 shipped: "Why is the party Master not
  // showing any of the Columns?" They were in the database AND in the ⚙ picker,
  // and the screen still showed six — because the CURATED list is what a reader
  // sees without asking, and nobody had added them to it.
  //
  // A FIELD NOBODY CAN SEE IS A FIELD NOBODY FILLS IN, which on KYC is the
  // whole feature. So the columns the two migrations added are checked here
  // against the screen, not against the schema.
  // -------------------------------------------------------------------------
  const pm = code(readFileSync('src/modules/PartyMaster.tsx', 'utf8'));
  ['service_engineer', 'profile', 'pincode', 'phone', 'email', 'kyc_status', 'gstin', 'pan']
    .forEach((k) => eq(`the register shows ${k} without being asked`,
      new RegExp(`key: '${k}'`).test(pm), true));

  // A COUNT OVER PARTLY-LOADED DATA IS A LOWER BOUND AND MUST SAY SO. This
  // register pages a thousand at a time over 4,752 parties, and the badge read
  // a flat "1,000" — a number that looks exact, is not, and is the one somebody
  // quotes.
  eq('...and the count says it is a lower bound', /count=\{rows\.length\} countMore=\{more\}/.test(pm), true);

  // KYC HAS TO BE CAPTURABLE, or the columns are a report on an empty table.
  eq('a party can be edited, by whoever may edit masters',
    /can\('masters\.edit'\)/.test(pm) && /onRowClick=\{mayEdit/.test(pm), true);
  // THE PARTY NAME IS NOT EDITABLE. Every machine, call and contract names the
  // customer by that string and there is no foreign key to `parties`.
  eq('...but never its NAME, which everything else points at by string',
    !/setEditField\('party_name'/.test(pm), true);
  // NOR THE VERIFICATION STAMP: the database sets it, or this form could sign
  // somebody else's name to a verification.
  eq('...nor who verified it, which the database stamps',
    !/setEditField\('kyc_verified_by'/.test(pm), true);
  // THREE OPTIONS, SO NO SEARCH BOX — the PickList rule for a short list.
  eq('the KYC status is a picker over the closed list',
    /options=\{KYC_STATUSES\}/.test(pm), true);
}

console.log('\n-- a facet row can be put away, and never hides a live filter --');
{
  // -------------------------------------------------------------------------
  // The user, 2026-09-15: "The Grouping at the top ... Seems to be very
  // Congested for a Few but Useful for a Few — Is it possible to Expand and
  // Collapse it? or Enable / Disable?"
  //
  // THE ONE RULE THAT MATTERS HERE is what a SHUT row does with a filter that
  // is still applied. Putting the chips away must not put the FILTER away: a
  // reader who sees 90 rows where there are 3,850, with nothing on screen
  // saying why, concludes the register is broken. So the chosen chip stays out
  // and stays clickable.
  // -------------------------------------------------------------------------
  const ui = code(readFileSync('src/components/ui/ui.tsx', 'utf8'));

  eq('a shut row still shows the chip that is filtering',
    /if \(!isOpen\) \{[\s\S]*?picked[\s\S]*?chip-on/.test(ui), true);
  eq('...and clearing it is one click from there',
    /className="chip chip-on" onClick=\{\(\) => onChange\(''\)\}/.test(ui), true);

  // THE DEFAULT IS A FACT ABOUT THE ROW, not a guess about the screen: a row is
  // congested exactly when it has more options than fit, and that changes as
  // the data does.
  eq('long rows start shut, short rows start open',
    /const isOpen = open \?\? sorted\.length <= max;/.test(ui), true);
  // ...AND THE PERSON'S OWN CHOICE OVERRULES IT, or the default is a preference
  // imposed rather than offered.
  eq('...and a choice once made is remembered',
    /localStorage\.setItem\(lsKey, next \? '1' : '0'\)/.test(ui), true);
  // A private window throws on localStorage, and BOTH accesses are wrapped —
  // reading at mount as well as writing. A filter row is not worth a blank
  // screen. Asserted structurally: `code()` strips comments, so the sentence
  // that says so is not there to match.
  eq('...without a private window taking the row down',
    /localStorage\.getItem\(lsKey\)[\s\S]{0,60}catch/.test(ui)
    && /localStorage\.setItem\(lsKey[\s\S]{0,40}catch/.test(ui), true);

  // EVERY ROW NEEDS A NAME TO BE PUT AWAY UNDER. A bare caret says only that
  // something is hidden; "Engineer 90" says what. Counted by the KEYS
  // themselves, not by `storeKey=` — Drawer takes that prop too, so counting
  // the attribute measured the wrong thing and the check failed on a file that
  // was correct.
  const FACETS: [string, number, string[]][] = [
    ['src/modules/FieldCalls.tsx', 1, ['engineer']],
    ['src/modules/PendingCalls.tsx', 1, ['pending.engineer']],
    ['src/modules/SpareRequests.tsx', 1, ['spares.engineer']],
    ['src/modules/IndoorService.tsx', 3, ['indoor.status', 'indoor.activity', 'indoor.kind']],
    ['src/modules/KpiAnalytics.tsx', 2, ['kpi.product', 'kpi.region']],
  ];
  FACETS.forEach(([f, n, keys]) => {
    const src = code(readFileSync(f, 'utf8'));
    eq(`${f.split('/').pop()} still has its ${n} facet row(s)`,
      (src.match(/<FacetChips/g) ?? []).length, n);
    eq('...each one named', (src.match(/title="/g) ?? []).length >= n, true);
    keys.forEach((k) => eq(`...and remembered under ${k}`, src.includes(k), true));
  });

  // THE CLASSES EXIST. A class with no CSS rule is the wart this project keeps
  // finding; a collapsed row styled by nothing reads as a broken one.
  const css = readFileSync('src/modules/fieldcalls.css', 'utf8');
  ['facet-head', 'facet-caret', 'facet-shut', 'facet-all']
    .forEach((c) => eq(`.${c} has a rule of its own`, new RegExp(`\\.${c}[\\s,{:]`).test(css), true));
}

console.log('\n-- one Serviceman, changed everywhere it appears --');
{
  // -------------------------------------------------------------------------
  // The user, 2026-09-15: "In Party Master - Give me an Option to Change the
  // Engineer Name in one go - Like Ctrl H."
  //
  // It is the repair for a measured fault: 32 of the 49 Servicemen on the
  // supplied export match no User Master name, and `allocated_to` on a call is
  // a NAME that `notify_call_allotted()` resolves through `user_directory`. So
  // a spelling nobody holds prefills the box with somebody who does not exist
  // and notifies no one — 328 customers on the worst one.
  // -------------------------------------------------------------------------
  const sb = code(readFileSync('src/lib/supabase.ts', 'utf8'));
  const pm = code(readFileSync('src/modules/PartyMaster.tsx', 'utf8'));

  // ONE STATEMENT, so every party moves together or none does. A row at a time
  // is 328 requests and a half-finished rename if one fails.
  eq('the rename is one statement, not one per party',
    /\.update\(\{ service_engineer: to \}, \{ count: 'exact' \}\)\s*\.eq\('service_engineer', from\)/.test(sb), true);
  // MATCHED EXACTLY. A rename that quietly caught a second spelling would be
  // one nobody asked for.
  eq('...matched exactly, never trimmed or case-folded',
    !/ilike\('service_engineer'/.test(sb), true);
  // THE LIST IS READ IN PAGES. There are 4,752 parties and PostgREST caps a
  // response at a thousand: counting the first page reports 49 names as 20 and
  // says nothing.
  eq('the spellings are counted over EVERY party, not the first thousand',
    /allRows<\{ service_engineer: string \| null \}>/.test(sb), true);

  // THE SIZE OF WHAT MOVES, BEFORE it moves — the rule renaming a part already
  // follows (0196). A count afterwards is a report; a count beforehand is a
  // decision.
  eq('the number of customers is shown before it is applied',
    /customer\{\(chosen\?\.count \?\? 0\) === 1 \? '' : 's'\} name/.test(pm), true);
  // THE NEW NAME COMES FROM THE USER MASTER, with no free text: letting
  // somebody type one recreates exactly the fault being repaired.
  eq('the new name comes from the User Master, not a text box',
    /options=\{dirNames\}/.test(pm) && !/allowFreeText/.test(pm), true);
  // AND THE LIST SAYS WHICH SPELLINGS ARE THE PROBLEM, rather than leaving it
  // to be worked out against another screen.
  eq('...and a spelling the directory lacks is flagged on the list',
    /not in User Master/.test(pm), true);
  // GATED. `parties_write` is has_perm('masters.edit'); the button must not be
  // offered to somebody the database will refuse.
  eq('only somebody who may edit masters is offered it',
    /\{mayEdit && \([\s\S]{0,200}openSwap/.test(pm), true);
}

console.log('\n-- the requirements document and the requirements PAGE are one document --');
{
  // -------------------------------------------------------------------------
  // The user, 2026-09-15: "Add this Requirements Page to the Validation
  // Package." It is the same set of requirements in two places, and A DOCUMENT
  // THAT SAYS DIFFERENT THINGS IN TWO PLACES IS WORSE THAN EITHER ALONE. So
  // what is checked here is not that both exist — it is that neither carries
  // its own copy of the rule that decides what they say.
  // -------------------------------------------------------------------------
  const lib = code(readFileSync('src/lib/requirements.ts', 'utf8'));
  const doc = code(readFileSync('scripts/requirements-doc.ts', 'utf8'));
  const page = code(readFileSync('src/modules/SoftwareValidation.tsx', 'utf8'));

  eq('the matcher has ONE definition', /export function modulesNamedBy/.test(lib), true);
  eq('...and the document imports it rather than repeating it',
    /from '\.\.\/src\/lib\/requirements'/.test(doc) && !/const named = /.test(doc), true);
  eq('...and so does the page',
    /from '\.\.\/lib\/requirements'/.test(page), true);

  // `/` MUST BE EXCLUDED or the Dashboard claims every requirement written:
  // every route contains it.
  eq('the root route cannot claim every requirement',
    /m\.path !== '\/' && t\.includes\(m\.path\.toLowerCase\(\)\)/.test(lib), true);

  // A TEST MAY NAME THE USER REQUIREMENT OR THE SYSTEM REQUIREMENT that
  // implements it. Counting only one of the two reported requirements as
  // unproved that a whole OQ case covers.
  eq('a requirement is proved through its FRS as well as directly',
    /const ids = new Set<string>\(\[req\.id, \.\.\.frs\.map\(\(f\) => f\.id\)\]\);/.test(lib), true);

  // AND THE STRICT MATCH IS NOT INVERTED to claim a screen is uncovered —
  // 31 of 54 false positives, including the Field Call Register.
  eq('neither reader claims a screen is uncovered from this match',
    !/no requirement names/i.test(doc) || /REQUIREMENT_COVERAGE/.test(doc), true);

  // THE TAB EXISTS AND IS REACHABLE. A page nothing lists is a page nobody
  // opens.
  eq('the Validation Package lists it as a tab',
    /\{ key: 'bymodule', label: 'Requirements by Module' \}/.test(page), true);

  // CLASSES WITH RULES. A block styled by nothing reads as a broken one.
  const css = readFileSync('src/modules/softwarevalidation.css', 'utf8');
  ['sv-group', 'sv-module', 'sv-module-head', 'sv-req', 'sv-req-text', 'sv-req-proof']
    .forEach((c) => eq(`.${c} has a rule of its own`, new RegExp(`\\.${c}[\\s,{:]`).test(css), true));
}

console.log('\n-- My Workload: the queues left the registers, and open what they count --');
{
  // -------------------------------------------------------------------------
  // The user, 2026-09-15: "Remove such cards in Main Views. Move those to a
  // Separate KPI Cards Page where ever applicable. It should be interactive."
  // Asked which cards: every card off every register. Asked what to call it:
  // My Workload, under Overview.
  // -------------------------------------------------------------------------
  const REGISTERS = [
    'SpareRequests', 'SpareRmApproval', 'SpareDispatch', 'MaterialReturns',
    'StockTransfer', 'HandStock', 'DailyCallReview',
  ];
  REGISTERS.forEach((m) => {
    const src = code(readFileSync(`src/modules/${m}.tsx`, 'utf8'));
    eq(`${m} no longer carries a card header`, /<KpiCard/.test(src), false);
  });
  // ALL MASTERS KEEPS ITS CARDS, and that is a decision rather than an
  // oversight: there the cards ARE the register — one per master list, which is
  // what the screen is for — not a header above a list of something else.
  eq('All Masters keeps its cards, because there they ARE the register',
    /<KpiCard/.test(code(readFileSync('src/modules/AllMasters.tsx', 'utf8'))), true);

  const wl = code(readFileSync('src/lib/workload.ts', 'utf8'));
  const page = code(readFileSync('src/modules/Workload.tsx', 'utf8'));

  // THE COUNTS USE THE REGISTER'S OWN HELPERS. A count that disagrees with the
  // register it links to is worse than no count: somebody opens the list, finds
  // a different number, and stops trusting both.
  eq('the counts are the registers\' own, not re-derived',
    /from '\.\/spareflow'/.test(wl) && /from '\.\/sparedispatch'/.test(wl)
    && /from '\.\/handstock'/.test(wl) && /countCallReviews/.test(wl), true);

  // A SECTION THE READER CANNOT OPEN IS NEVER REQUESTED. Counting a queue for
  // somebody who may not read it is a number they cannot act on and a leak:
  // "Spares waiting 240" is the size of a queue the register would refuse them.
  eq('a register the reader cannot open is not even counted',
    /\.filter\(\(j\) => can\(j\.needs\)\)/.test(page), true);

  // EVERY COUNT IS OVER WHAT LOADED, so a section still reading says so — the
  // rule this project applies everywhere and would be easiest to drop on a
  // screen made of counts.
  eq('a partly-read section shows its counts as a lower bound',
    /\$\{s\.more \? '\+' : ''\}/.test(page), true);
  // ...AND THE ONE EXACT SECTION DOES NOT. countCallReviews walks every page in
  // the database, so "3,850+" would be wrong in the other direction.
  eq('...and the Daily Call Review, counted in the database, does not',
    /key: 'review'[\s\S]{0,200}more: false/.test(wl), true);

  // A FIGURE OPENS NOTHING. There is no list of an ageing of 4 days.
  eq('a card with no list behind it is not given one',
    /onOpen=\{c\.to \? \(\) => navigate/.test(page), true);

  // THE THREE THINGS A NEW SCREEN NEEDS, and the third is the one that bites.
  const rbac = code(readFileSync('src/lib/rbac.ts', 'utf8'));
  const layout = code(readFileSync('src/components/layout/Layout.tsx', 'utf8'));
  eq('it is a module, on the menu, and in the matrix',
    /path: '\/workload', label: 'My Workload'/.test(rbac)
    && /to: '\/workload'/.test(layout), true);
  eq('...and a migration writes the key into app_roles',
    existsSync('supabase/migrations/0202_workload_module_key.sql'), true);

  // -------------------------------------------------------------------------
  // EVERY FILTER A CARD SENDS IS READ BY THE REGISTER IT SENDS IT TO.
  //
  // This is the failure the feature is most likely to have and least likely to
  // show: the card navigates, the right page opens, and the list is the WHOLE
  // register. The click looks answered. It shipped that way for one build —
  // three registers were handed `stageFilter`, `status` and `holding` and NONE
  // of them read `location.state` at all — and nothing anywhere would have said
  // so; the reader would simply have believed the list in front of them was the
  // one they asked for. A half-kept promise is worse than a card that plainly
  // does nothing.
  // -------------------------------------------------------------------------
  const app = code(readFileSync('src/App.tsx', 'utf8'));
  const routeOf = new Map<string, string>();
  [...app.matchAll(/<Route path="([^"]+)" element=\{<(\w+)/g)].forEach((m) => routeOf.set(m[1], m[2]));
  // `(\w+):` MISSED THE SHORTHAND. `state: { status }` is how the Daily Call
  // Review's helper passes it, so the first version of this check silently
  // covered two of the three registers — and the one it skipped was the one
  // most likely to be wrong. A check that looks like it covers everything and
  // covers two thirds is the shape this project keeps finding.
  const sent = [...wl.matchAll(/path: '([^']+)', state: \{ (\w+)/g)]
    .map((m) => ({ path: m[1], key: m[2] }));
  const pairs = new Set(sent.map((x) => `${x.path}|${x.key}`));
  eq('every register a card filters is covered here', pairs.size, 3);
  sent.forEach(({ path, key }) => {
    const mod = routeOf.get(path);
    const src = mod && existsSync(`src/modules/${mod}.tsx`)
      ? code(readFileSync(`src/modules/${mod}.tsx`, 'utf8')) : '';
    eq(`${path} reads the '${key}' it is sent`,
      !!src && new RegExp(`useArrivingFilter<[^>]*>\\('${key}'`).test(src), true);
  });
  // APPLIED ONCE, ON ARRIVAL. Re-reading `location.state` would fight every
  // filter change the reader makes afterwards — they clear the stage, the
  // effect puts it back, and the screen appears stuck.
  const arrive = code(readFileSync('src/lib/arriveWith.ts', 'utf8'));
  eq('...and applies it once, so it cannot fight the reader',
    /done\.current === location\.key/.test(arrive), true);
}

console.log('\n-- Product Failure Analysis: the four things asked for --');
{
  // -------------------------------------------------------------------------
  // The user, 2026-09-15: "Idea is to focus on the product failure analysis in
  // this new page.. so stick to Pareto, failures per cover.. give data table,
  // download option, data label toggle."
  //
  // They were asked for TOGETHER and are checked together: a chart is read, a
  // table is CHECKED, labels are what make a chart quotable, and a download is
  // what makes it arguable with somebody who was not at the screen. One block
  // carries all four, so a dimension added later cannot arrive with three.
  // -------------------------------------------------------------------------
  const di = code(readFileSync('src/modules/ProductFailureAnalysis.tsx', 'utf8'));

  eq('one block carries chart, labels, table and download',
    /function ParetoBlock\(/.test(di), true);
  ['ParetoChart', 'Data labels', 'assoc-table', 'xlsxDownload']
    .forEach((x) => eq(`...and it has the ${x}`, di.includes(x), true));

  // FAILURES PER COVER was named explicitly.
  eq('failures per cover is on the page', /title="Failures per cover"/.test(di), true);
  // AND THE PRODUCT IS THE CORRECTED ONE, or the page undoes 0197 on the screen
  // built to see it.
  eq('products are counted under the corrected one',
    /rows=\{byProduct\}[\s\S]{0,80}dim="live_product_name"/.test(di), true);

  // THE DOWNLOAD CARRIES THE ROWS, not only the ranking. A ranked list is an
  // assertion; the rows are the evidence (the user's ask on FFR Insights).
  eq('the download carries the reviews behind the number',
    /name: 'The reviews counted'/.test(di), true);
  eq('...and how the number was worked out',
    /name: 'How this was worked out'/.test(di), true);

  // THE FORM FOLLOWS THE QUESTION (the user, 2026-09-15: "For Root Cause Pareto
  // makes sense -- but for the rest use appropriate charts"). Three forms, and
  // each is a claim about what is being asked:
  //   pareto  — which FEW account for most of it (ranked, cumulative line)
  //   share   — composition across a handful that add up to the whole
  //   ordered — an ORDINAL scale whose own order IS the finding
  eq('the block offers the three forms', /form\?: 'pareto' \| 'share' \| 'ordered'/.test(di), true);
  eq('root cause stays a Pareto',
    /title="Root cause"[\s\S]{0,300}?dim="root_cause_keyword"/.test(di)
    && !/title="Root cause"[\s\S]{0,200}?form="/.test(di), true);
  // COVER IS COMPOSITION, not a vital-few question: a Pareto over four slices
  // with a running total says only "these four are 100% of the four".
  eq('cover is read as a share', /title="Failures per cover"[\s\S]{0,400}?form="share"/.test(di), true);
  // AN ORDINAL DIMENSION IS NOT RANKED. Sorting the age bands by count destroys
  // the one thing that chart is for — early life against late. Software version
  // is the same: ranking hides whether the NEWER release fails more.
  eq('age at failure keeps its own order',
    /title="Age at failure"[\s\S]{0,400}?form="ordered"/.test(di), true);
  eq('...and the software version is in VERSION order, not count order',
    /title="Software version"[\s\S]{0,400}?form="ordered"/.test(di)
    && /rows=\{bySwOrdered\}/.test(di), true);
  eq('...and a non-ranked block shows no cumulative share',
    /\{rank && <th style=\{\{ textAlign: 'right' \}\}>Cumulative<\/th>\}/.test(di), true);

  // A COMPOSED KEY IS NOT A COLUMN. The repeat-machine chart counts model +
  // serial, so clicking one must be MATCHED the same way it was counted —
  // reading it as a column would find nothing and the page would silently empty.
  eq('the repeat-machine filter matches the way it was counted',
    /if \(dim === '__machine'\)/.test(di), true);
  // KEYED ON MODEL AND SERIAL, never the serial alone: 3,794 serials repeat
  // across models, so counting by serial merges different machines.
  eq('...and a machine is its model AND its serial',
    /\$\{s\(r, 'live_product_name'\) \|\| '\(no product\)'\} · \$\{serial\}/.test(di), true);

  // THE CLASSES EXIST. A row that filters must look pressable, and a chosen one
  // must look chosen — by INVERSION, not a tint (the user's standing rule).
  const css = readFileSync('src/modules/productfailure.css', 'utf8');
  eq('.linkish has a rule of its own', /\.linkish[\s,{:]/.test(css), true);
  eq('the chosen row INVERTS rather than tints',
    /tr\.row-on > td \{ background: var\(--text\); color: var\(--surface\); \}/.test(css), true);

  // -------------------------------------------------------------------------
  // A CHART SOMEBODY BUILDS AND KEEPS (the user, 2026-09-15: "Add a provision
  // to create a chart by myself and save it").
  // -------------------------------------------------------------------------
  // IT IS DRAWN THROUGH THE SAME BLOCK as the built-in charts, so a saved one
  // arrives with the table, the labels and the download rather than being a
  // lesser kind of chart.
  eq('a saved chart is drawn through the same block',
    /saved\.map\(\(c\) => \{[\s\S]{0,1400}?<ParetoBlock/.test(di), true);
  // A DIMENSION THE PAGE NO LONGER KNOWS IS SAID, not silently dropped: a chart
  // that quietly shows nothing is worse than one that says the column has gone.
  eq('...and a chart on a column that has gone says so',
    /is no longer on the review/.test(di), true);
  // SHARING IS A DIFFERENT ACT FROM KEEPING. It decides what a GROUP sees when
  // they open a screen — the same thing setting a register layout for a role
  // does — so it takes the same authority, and somebody without it is told
  // rather than offered the choice and refused later.
  eq('sharing is gated on config.manage, and the reader is told',
    /const maySh: boolean = can\('config\.manage'\)/.test(di)
    && /Manage configuration/.test(di), true);
  // THE OWNER IS NOT SENT. The database stamps it, so a chart cannot be filed
  // under somebody else's name even by a client that means to.
  const sb2 = code(readFileSync('src/lib/supabase.ts', 'utf8'));
  eq('the client never sends an owner',
    /\.insert\(\{ page, name: name\.trim\(\), role, spec \}\)/.test(sb2), true);
  // ONE PAGE KEY, because the value is written to the database and read back.
  eq('the page key has one spelling', /const PAGE_KEY = 'product-failure';/.test(di), true);
  // AND THE LIST OF WHAT MAY BE CHARTED IS NAMED, not "any column": the view
  // has 57 and most answer nothing worth a chart — an id, a uuid, a free-text
  // observation whose every value is unique.
  eq('what may be charted is a named list',
    /const BUILDABLE: \{ key: string; label: string; form:/.test(di), true);

  // -------------------------------------------------------------------------
  // THE PAGE OPENS ON THIS YEAR (the user, 2026-09-15: "Always default it to
  // 2026"), and the register carries nine years of migrated history against one
  // of its own — so opening on everything makes every Pareto a chart of the old
  // system.
  // -------------------------------------------------------------------------
  // READ AS THE CURRENT YEAR, not the literal number. A hard-coded 2026 becomes
  // wrong on the first of January and shows an empty page with nothing saying
  // why; "ALWAYS" is what makes the current year the honest reading.
  eq('the year defaults to the current one, not a hard-coded number',
    /const thisYear = \(\) => String\(new Date\(\)\.getFullYear\(\)\);/.test(di)
    && /useState<string>\(thisYear\(\)\)/.test(di), true);
  eq('...and there is no year literal pinning it', !/\byear = '20\d\d'/.test(di), true);

  // A FAILURE'S YEAR IS WHEN THE MACHINE FAILED, not when somebody reviewed it:
  // one that broke in December and was reviewed in January did not fail in
  // January. The trend reads the same date, so the chart and the filter above it
  // cannot disagree about which year a failure is in.
  eq('a failure is dated by when it FAILED',
    /const failedOn = \(r: Row\) => s\(r, 'complaint_date'\) \|\| s\(r, 'reg_date'\);/.test(di), true);
  eq('...and the trend reads the same date', /periodKey\(failedOn\(r\), period\)/.test(di), true);

  // THE WINDOW IS NEVER IMPLIED. A page quietly showing one year of nine makes
  // every number a fraction of what the reader thinks they are looking at.
  eq('the year is on screen and says what it is counting',
    /<SectionCard title="Year">/.test(di) && /out of \{allRows\.length/.test(di), true);
  // ...AND IT TRAVELS WITH THE DOWNLOAD, which is read by somebody who never
  // saw the filter.
  eq('...and every download says which year it was taken through',
    /\{ Item: 'Year', Value: yearNote \}/.test(di), true);

  // A RENAMED SCREEN MUST NOT STRAND ITS OLD ADDRESS. The page shipped at
  // /dccr-insights the day before; a bookmark to it has to land somewhere
  // rather than on a blank page.
  const app2 = code(readFileSync('src/App.tsx', 'utf8'));
  eq('the address it shipped at still lands on the page',
    /<Route path="\/dccr-insights" element=\{<Navigate to="\/product-failure" replace \/>\}/.test(app2), true);
  // AND THE MODULE KEY IS THE ROUTE, so a rename is a permissions change: every
  // role's old key stopped opening anything the moment the route moved.
  eq('...and a migration grants the renamed key',
    existsSync('supabase/migrations/0205_product_failure_module_key.sql'), true);

  // -------------------------------------------------------------------------
  // THE DATA TABLE SITS BESIDE THE CHART, NEVER UNDER IT (the user's standing
  // rule, 2026-09-15: "Always position the Data table on the Side Right or Left
  // Depending on the Asthetics of the look").
  //
  // Underneath, the table took the chart's full width and the counts ended up a
  // screenshot's width from the bar they describe. This is the kind of layout
  // that reverts silently when the next chart is added by copying the one above
  // it, so the rule is checked rather than remembered.
  // -------------------------------------------------------------------------
  eq('the chart and its data table share one row',
    /className=\{`chart-with-table\$\{tableSide === 'left' \? ' table-first' : ''\}`\}/.test(di), true);
  eq('...and which side it sits on is a prop, not a rewrite',
    /tableSide\?: 'right' \| 'left';/.test(di), true);
  const fcss = readFileSync('src/modules/fieldcalls.css', 'utf8');
  eq('...and the grid it needs has a rule of its own', /\.chart-with-table \{/.test(fcss), true);
  // A GRID ITEM'S DEFAULT `min-width: auto` IS WHAT TURNS A SIDE-BY-SIDE CHART
  // INTO A HORIZONTAL PAGE SCROLL: an SVG refuses to shrink below its content
  // and pushes the whole track wider. Easy to leave out and invisible until a
  // narrow window.
  eq('...and the chart cannot push the page sideways',
    /\.chart-with-table > \* \{ min-width: 0; \}/.test(fcss), true);
  eq('...and the two stack rather than squeeze on a narrow screen',
    /@media \(max-width: 880px\)[\s\S]{0,400}\.chart-with-table/.test(fcss), true);
}

{
  // -------------------------------------------------------------------------
  // ONE VOCABULARY FOR COVER, IN TWO PLACES THAT MUST AGREE.
  //
  // The user, 2026-09-15: "What is this Warranty? It has to be Normalized --
  // Warranty is WGP -- Where ever this DAta is feeding - Fix that as well."
  //
  // The DATABASE is the enforcement (`public.cover_code`, 0208, with a trigger
  // on every table that stores a cover); `coverCode` in `fieldcall.ts` is the
  // same rule on the client so an import PREVIEW shows the value that will
  // actually be stored. Two copies of one rule drift — that is what this is
  // for. A synonym added to one and not the other means the preview and the
  // stored row disagree, which is worse than no preview at all.
  // -------------------------------------------------------------------------
  const fc = readFileSync('src/lib/fieldcall.ts', 'utf8');
  const sql = readFileSync('supabase/migrations/0208_cover_code_normalised.sql', 'utf8');

  const tsPairs = [...fc.matchAll(/(\w+): '(WGP|OGP|CMC|AMC)'/g)].map((m) => `${m[1]}=${m[2]}`).sort();
  const sqlPairs = [...sql.matchAll(/\('([a-z0-9]+)',\s*'(WGP|OGP|CMC|AMC)'\)/g)].map((m) => `${m[1]}=${m[2]}`).sort();
  eq('the client and the database know the same cover synonyms', tsPairs, sqlPairs);
  // The parse is asserted too: a regex that matched nothing would make the
  // comparison above pass by agreeing that neither side has any rule at all.
  eq('...and that list is not empty', tsPairs.length > 12, true);

  // THE TRAP, ASSERTED IN BOTH: "out of warranty" contains the word "warranty",
  // so a substring rule turns one cover into its opposite. Both match on the
  // WHOLE squashed string, and both are checked here because getting this wrong
  // is worse than the split it was written to fix.
  eq('OUT OF WARRANTY is OGP on the client', tsPairs.includes('outofwarranty=OGP'), true);
  eq('...and on the database', sqlPairs.includes('outofwarranty=OGP'), true);

  // AN UNRECOGNISED VALUE IS RETURNED UNCHANGED, never guessed into a bucket: a
  // wrong cover on a failure answers "manufacturing or wear?" wrongly.
  eq('an unknown cover is left alone, not bucketed',
    /\?\? raw;/.test(fc), true);

  // EVERY IMPORTER THAT CARRIES A COVER READS IT THROUGH THAT RULE. One of them
  // not doing so is how "WARRANTY" and "WGP" became two slices of one pie.
  const up = readFileSync('src/lib/uploads.ts', 'utf8');
  eq('the bulk uploader normalises cover', /COVER\('item_status'/.test(up), true);
  eq('...and no register still takes it as plain text',
    /TEXT\('item_status'/.test(up), false);
  eq('the PM importer normalises cover',
    /col === 'item_status' \? coverCode\(val\)/.test(readFileSync('src/lib/pmImport.ts', 'utf8')), true);
  eq('the AppSheet cover export normalises its own spelling of it',
    /present_item_status: coverCode\(/.test(readFileSync('src/lib/coverImport.ts', 'utf8')), true);
}

{
  // -------------------------------------------------------------------------
  // EVERY SCREEN HAS A REQUIREMENT FILED UNDER IT, OR A WRITTEN REASON WHY NOT.
  //
  // The user asked why registering a field call was not "called out loud" in the
  // requirements. It was — URS-003 — but the document filed it under "not tied
  // to one screen", because the grouping was DERIVED from the requirement's
  // words and URS-003 says "register a customer call" and never says "field".
  // 34 of 56 screens had no requirement section at all.
  //
  // The repair is `Req.modules`: derived by default, DECLARED by exception.
  // This block is what stops the gap re-opening one screen at a time.
  //
  // IT IS THE FORWARD DIRECTION THAT WAS MISSING. The inverse — "claim a screen
  // is uncovered" — was guarded, loudly, and that guard is why nobody looked at
  // this one: a comment saying a check exists is worse than no comment.
  // -------------------------------------------------------------------------
  const ungoverned = modulesWithNoRequirement();
  const recorded = Object.keys(MODULES_WITHOUT_REQUIREMENT);
  eq('every screen with no requirement has a written reason',
    ungoverned.map((m) => m.path).filter((p) => !recorded.includes(p)), []);
  // ...AND A REASON LEFT BEHIND IS REMOVED. A screen that has since gained a
  // requirement must not keep an entry saying it has none — the record would
  // then be describing a state of affairs that no longer holds, which is the
  // way every stale document in this project started.
  eq('...and no reason outlives the gap it explains',
    recorded.filter((p) => !ungoverned.some((m) => m.path === p)), []);

  // A DECLARATION POINTING AT A ROUTE THAT DOES NOT EXIST files the requirement
  // NOWHERE while reading as though it files it somewhere — the exact failure
  // this mechanism was added to fix, reintroduced by a typo.
  eq('every declared module is a real route', badDeclarations(), []);

  // THE PROVENANCE IS CARRIED, not dropped at the last step: "the text says so"
  // and "somebody said so" are different kinds of claim.
  const svx = readFileSync('src/modules/SoftwareValidation.tsx', 'utf8');
  eq('the in-app tab says which of the two filed each requirement',
    /filed here because \{e\.how === 'declared'/.test(svx), true);
  const rdoc = readFileSync('scripts/requirements-doc.ts', 'utf8');
  eq('...and so does the generated document',
    /the requirement declares this screen/.test(rdoc), true);

  // -------------------------------------------------------------------------
  // THE TRACEABILITY MATRIX — six columns, in the order asked for (the user,
  // 2026-09-15). Both readers render it, so both are checked: a matrix in the
  // document and not in the app is the same document saying two things.
  // -------------------------------------------------------------------------
  const cols = ['URS ID', 'URS Details', 'FRS ID', 'FRS Details', 'Test Case ID', 'Test Case Details'];
  cols.forEach((c) => eq(`the document's matrix has a "${c}" column`, rdoc.includes(c), true));
  cols.forEach((c) => eq(`...and so does the app's`, svx.includes(`>${c}</th>`), true));

  const trace = traceabilityMatrix();
  // ONE ROW PER LINK. A requirement with two mechanisms is at least two rows —
  // if this ever equals the requirement count, the matrix has been collapsed
  // back into lists and stopped answering which test proves which mechanism.
  eq('the matrix is one row per LINK, not per requirement', trace.length > URS.length, true);
  // A GAP STILL GETS A ROW. Dropping the untraced rows would make the matrix
  // answer "everything here is traced" by leaving out everything that is not.
  const noTest = URS.filter((r) => !TESTS.some((t) => t.reqs.includes(r.id)
    || FRS.filter((f) => f.urs.includes(r.id)).some((f) => t.reqs.includes(f.id))));
  eq('...and a requirement nothing proves still appears in it',
    noTest.every((r) => trace.some((x) => x.ursId === r.id)), true);
  // EVERY REQUIREMENT IS IN IT. A matrix missing one is worse than no matrix.
  eq('every user requirement has at least one row',
    URS.filter((r) => !trace.some((x) => x.ursId === r.id)), []);
  // NO LINK APPEARS TWICE. The link is the TRIPLE, and only the triple: one
  // test legitimately proves several mechanisms of one requirement (OQ-51 does
  // it for three), so a repeated URS+test pair is two real links and not a
  // duplicate. Asserting on the pair FAILED here with 98 against 90, and the
  // eight it named were all of that kind — the check was wrong, not the matrix.
  const links = trace.map((r) => `${r.ursId}|${r.frsId}|${r.testId}`);
  eq('no link appears twice', links.length, new Set(links).size);
  // THE DUPLICATE THAT IS REAL: a test naming BOTH a requirement and its own
  // system requirement (`OQ-58 { reqs: ['URS-065','FRS-077'] }` — most of them)
  // put one piece of evidence on two rows of the same block, once against the
  // FRS and once against nothing, and read as two.
  const onBoth = trace.filter((r) => r.testId && !r.frsId)
    .filter((r) => trace.some((x) => x.ursId === r.ursId && x.testId === r.testId && x.frsId));
  eq('...and no test sits both against a requirement and against its mechanism', onBoth, []);
}

{
  // -------------------------------------------------------------------------
  // THE FIELD CALL DRAWER — four rules from one report (the user, 2026-09-15).
  // Each of them is the kind that reverts by being copied from an older screen.
  // -------------------------------------------------------------------------
  const fc = readFileSync('src/modules/FieldCalls.tsx', 'utf8');

  // 1. "Remove the Close call option doesn't make sense." It closed a call
  //    without a visit entry, producing a closed call whose own history says
  //    nobody went. "Close AGAIN" is a different act and stays: it withdraws a
  //    re-open on a call already closed by a real visit.
  eq('there is no Close call action', /label: 'Close call'/.test(fc), false);
  eq('...and nothing still calls closeCall()', /\bcloseCall\(/.test(fc), false);
  eq('...but Close again, which withdraws a re-open, is untouched',
    /label: 'Close again'/.test(fc), true);

  // 2. "Cancel call option should not be shown on a solved call. Only if it's
  //    pending [Unsolved, Unattended]." Cancelling says the call should not
  //    exist; once an engineer has closed it, the visit happened.
  eq('cancelling is offered only while the call is still open',
    /const OPEN_STATES = \['', 'Unattended', 'Unsolved'\];/.test(fc), true);
  eq('...and the Cancel action asks that question',
    /show: mayCancel && !row\._pending && canCancelRow\(row\)/.test(fc), true);

  // 3. "Make it 3 columns ... Minimize the no of rows", and three fields that
  //    are not needed on a registered call. Each is still STAMPED and still in
  //    the register — removed from the view, not from the record.
  eq('the call drawer is three columns', /columns=\{3\}/.test(fc), true);
  eq('...and the view drops the two registrant fields and the complaint date',
    /const VIEW_HIDDEN = \['complaintDate', 'registeredBy', 'actuallyRegisteredBy'\];/.test(fc), true);
  // THE RECORD IS UNCHANGED. If the create form ever lost the complaint date,
  // the register would stop capturing what the DCCR dates a failure by — which
  // is a different and much worse change than hiding it on a view.
  eq('...and the complaint date is still captured when a call is registered',
    /\{ name: 'complaintDate'[^}]*required: true/.test(fc), true);

  // 4. "Once a call us created don't show the suggestions anymore."
  eq('suggestions are passed only on create',
    /\{ suggest: drawer\.mode === 'create' \}/.test(fc), true);
  const cfx = readFileSync('src/modules/callFields.tsx', 'utf8');
  eq('...and inject honours that by dropping the chips, not the master',
    /o\.suggest === false \? \{ \.\.\.complaintField\(f\), below: undefined \}/.test(cfx), true);

  // 5. ONE DATE FORMATTER, beside the one parser. A native date input renders
  //    in the BROWSER'S locale, so the drawer showed `2026-09-12` beside
  //    `09/11/2026` — and 09/11 is either 9 November or 11 September depending
  //    on who reads it. There used to be four date PARSERS here and they had
  //    started to disagree; a second formatter is the same mistake.
  eq('the day-first formatter lives in dates.ts',
    /export function formatDay/.test(readFileSync('src/lib/dates.ts', 'utf8')), true);
  eq('...and visitdate.ts uses it rather than keeping a copy',
    /const fmt = formatDay;/.test(readFileSync('src/lib/visitdate.ts', 'utf8')), true);
  // FORMATTED ONLY WHERE IT CANNOT BE SAVED. A formatted string in a field the
  // form can submit is a corrupted date.
  eq('...and a date is reformatted for the VIEW only',
    /drawer\.mode === 'view' \? \{\s*\n\s*regDate: formatDay/.test(fc), true);

  // 6. A TIMESTAMP IN A DOWNLOAD, as a person reads it. Reported 2026-09-18:
  //    the Consumption Report carried `2026-09-18T08:51:02.55+00:00` — the wire
  //    format, in a file somebody opens in Excel.
  //    THE OFFSET IS THE POINT, not the punctuation. The database stores UTC,
  //    so printing the front of that string puts the wrong TIME on the row and,
  //    before 05:30 IST, the wrong DAY.
  process.env.TZ = 'Asia/Kolkata';
  eq('a stored timestamp reads in the reader\u2019s own time',
    formatDayTime('2026-09-18T08:51:02.55+00:00'), '18-Sep-2026 14:21:02');
  // The day rolls back across midnight, which is the case that makes this a
  // correctness fix rather than a formatting one.
  eq('...and the DAY rolls with it',
    formatDayTime('2026-09-18T19:30:00+00:00'), '19-Sep-2026 01:00:00');
  eq('Z is an offset too', formatDayTime('2026-09-18T08:51:02Z'), '18-Sep-2026 14:21:02');
  // NO OFFSET IS A WALL CLOCK somebody already wrote down; shifting it would
  // invent an hour it never had.
  eq('a value with no offset is printed as written',
    formatDayTime('2026-09-18 08:51:02'), '18-Sep-2026 08:51:02');
  eq('...seconds default to 00 when absent',
    formatDayTime('2026-09-18 08:51'), '18-Sep-2026 08:51:00');
  // A DATE IS NOT A MIDNIGHT. Inventing 00:00:00 reads as a real instant.
  eq('a date with no time stays a date', formatDayTime('2026-09-18'), '18-Sep-2026');
  // ANYTHING ELSE COMES BACK UNTOUCHED — the same contract as formatDay. A
  // report column holds part codes and remarks as well as dates.
  eq('a part code is not a date', formatDayTime('MP-010'), 'MP-010');
  eq('a UCN is not a date', formatDayTime('26I08F0006'), '26I08F0006');
  // ...including a remark that merely BEGINS with one. The pattern is anchored
  // at both ends for exactly this.
  eq('a remark starting with a date survives',
    formatDayTime('2026-09-18 pump replaced'), '2026-09-18 pump replaced');
  eq('empty stays empty', formatDayTime(''), '');
  eq('null stays empty', formatDayTime(null), '');

  // 7. A DATE IN AN .XLSX IS A NUMBER, NOT A STRING THAT LOOKS LIKE ONE.
  //    Reported 2026-09-18: "those Date Fields are not Complaint with the Long
  //    Date Format of Excel". A formatted string is TEXT — it cannot be sorted
  //    into order, filtered by month, subtracted, or given the reader's own
  //    format, and each of those quietly returns something rather than
  //    refusing.
  //    Serial 46283 is 18-Sep-2026; the fraction is the time of day.
  eq('a timestamp becomes a serial, in local time',
    Math.round((excelSerial('2026-09-18T08:51:02+00:00') ?? 0) * 1e5) / 1e5, 46283.59794);
  // A DATE-ONLY VALUE IS A WHOLE DAY. The first version went through
  // `new Date('2026-09-18')` — UTC midnight read back locally — and gave every
  // date-only value a 05:30 fraction in India.
  eq('a date with no time is a whole day', excelSerial('2026-09-18'), 46283);
  eq('...and is formatted without a clock', hasClockTime('2026-09-18'), false);
  eq('...while a timestamp asks for one', hasClockTime('2026-09-18T08:51:02Z'), true);
  // A PART CODE MUST NOT BECOME A NUMBER. The first version used
  // `parseAnyDate` — the lenient DISPLAY parser — and turned MP-010 into the
  // serial 37165. In a spreadsheet that is not a wrong-looking string but a
  // NUMBER under a date format: the column stops being a part code silently.
  eq('a part code is not a serial', excelSerial('MP-010'), null);
  eq('a UCN is not a serial', excelSerial('26I08F0006'), null);
  eq('a remark starting with a date is not a serial',
    excelSerial('2026-09-18 pump replaced'), null);
  eq('empty is not a serial', excelSerial(''), null);
}

{
  // -------------------------------------------------------------------------
  // A MIGRATION HINT IS AN INSTRUCTION, SO IT MUST BE RIGHT.
  //
  // Fourteen screens carried a line of the shape
  //
  //     /spare_stock_out_lines|does not exist|schema cache/i.test(err)
  //
  // and the middle alternative is the bug: "does not exist" is not a question
  // about the TABLE. Postgres says it about a missing column, a missing
  // function and a missing operator in the same words, so any of those became
  // "run this migration".
  //
  // Reported 2026-09-16: Stock Out told the reader to run 0027 on a project
  // that had it. The real fault was a paged read ordering by `id` on a view
  // that publishes `line_id`; PostgREST answered `column … does not exist`,
  // the register came back empty, and the message was overwritten by a hint.
  // It is the expensive kind of wrong — it is ACTED ON, and it teaches people
  // that the instruction may mean nothing, which is the same argument this
  // project makes about a `_status.sql` row that answers NO for nothing.
  // -------------------------------------------------------------------------
  const modFiles = readdirSync(`${process.cwd()}/src/modules/`).filter((f) => f.endsWith('.tsx'));
  const loose: string[] = [];
  modFiles.forEach((f) => {
    code(readFileSync(`${process.cwd()}/src/modules/${f}`, 'utf8')).split('\n').forEach((line, i) => {
      // The whole shape, not the words on their own: a screen may legitimately
      // print an error that contains them.
      if (/\/[^/\n]*\bdoes not exist\b[^/\n]*\/[a-z]*\.test\(/.test(line)
        || /\/[^/\n]*\bschema cache\b[^/\n]*\/[a-z]*\.test\(/.test(line)) {
        loose.push(`${f}:${i + 1}`);
      }
    });
  });
  eq('no screen decides a table is missing by matching "does not exist"', loose, []);

  // ...AND THE ONE PLACE THAT DOES DECIDE IT ASKS THE RIGHT QUESTION.
  const dbe = readFileSync('src/lib/dberror.ts', 'utf8');
  eq('the shared test rules a missing COLUMN out first',
    /if \(\/\\bcolumn\\b\/i\.test\(m\)\) return false;/.test(dbe), true);
  eq('...and a missing function or operator too',
    /\\bfunction\\b\|\\boperator\\b/.test(dbe), true);
  eq('...and it is proved by a check of its own',
    existsSync('scripts/check-dberror.ts'), true);

  // THE SCREENS THAT DECIDE IT USE THE HELPER. A file that names a migration
  // in a user-facing string and reaches that string from its own `catch` is
  // deciding the question some other way.
  //
  // NOT every file holding the words: `StockOut.tsx` writes the hint and is
  // HANDED the decision by the component it renders (`onMigrationError`), which
  // is right — one decision, two screens. Requiring the import there would push
  // somebody to duplicate the test, which is the shape this whole change
  // removes.
  const offenders: string[] = [];
  modFiles.forEach((f) => {
    const src = readFileSync(`${process.cwd()}/src/modules/${f}`, 'utf8');
    if (!/needs migration \d{4}|run it in the Supabase SQL editor|run it in the SQL editor/i.test(src)) return;
    const decides = /catch\s*\(/.test(src) && !/onMigrationError/.test(src);
    if (decides && !/isMissingTable/.test(src)) offenders.push(f);
  });
  eq('every screen that decides a table is missing asks isMissingTable()', offenders, []);

  // AND THE CHECK THAT WOULD HAVE CAUGHT THE ROOT CAUSE EXISTS AND IS RUN.
  // `check:orders` asks a DATABASE whether every paged ORDER column is real —
  // the column is a string in a chained call, so nothing else can know.
  eq('the ORDER columns are checked against a database',
    existsSync('scripts/check-order-columns.mjs'), true);
  const pkgj = JSON.parse(readFileSync('package.json', 'utf8'));
  eq('...and it has a script', typeof pkgj.scripts['check:orders'], 'string');
  // A CHECK NOBODY RUNS RECORDS WHAT USED TO BE TRUE — two of this project's
  // own assertions had been failing on main unnoticed for exactly that reason.
  // `validate` collects every `check:*`, but one needing a connection must say
  // so or it is run without one and fails for the wrong reason.
  eq('...and validate knows it needs a database',
    /'check:orders': 'db'/.test(readFileSync('scripts/validate-run.mjs', 'utf8')), true);
}

{
  // -------------------------------------------------------------------------
  // A SPREADSHEET COLUMN IS A LOOKUP KEY, NOT A CAPTION.
  //
  // `buildXlsx` fills each cell with `row[columnName]`, so two columns sharing
  // a name read the SAME key twice: the second one comes out with the first
  // one's value on every row, or empty, and the sheet looks like headings with
  // nothing beside them. No error anywhere.
  //
  // Found in my own first draft of the permission-matrix export (2026-09-16),
  // which gave the "How to read this" sheet `columns: ['', '']` — every
  // explanation would have shipped with an empty second column.
  // -------------------------------------------------------------------------
  const dupCols: string[] = [];
  readdirSync(`${process.cwd()}/src/modules/`).filter((f) => f.endsWith('.tsx')).forEach((f) => {
    const src = readFileSync(`${process.cwd()}/src/modules/${f}`, 'utf8');
    // Only literal lists — a computed one (`[...roles.map(r => r.label)]`) is
    // not judged here, and could not be judged without running it.
    for (const m of src.matchAll(/columns:\s*\[((?:\s*'[^']*'\s*,?)+)\]/g)) {
      const cols = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
      const dupes = cols.filter((c, i2) => cols.indexOf(c) !== i2);
      if (dupes.length) {
        const line = src.slice(0, m.index ?? 0).split('\n').length;
        dupCols.push(`${f}:${line} ${JSON.stringify([...new Set(dupes)])}`);
      }
    }
  });
  eq('no export sheet has two columns of the same name', dupCols, []);

  // -------------------------------------------------------------------------
  // THE PERMISSION MATRIX EXPORT SAYS THE THREE THINGS THE SCREEN SAYS
  // IMPLICITLY (the user, 2026-09-16: "Add a Provision to Export the
  // Permission matrix").
  //
  // A file is read away from the screen that produced it, so each of these is
  // the difference between a document and a misleading one. The third is the
  // one this project has been bitten by repeatedly.
  // -------------------------------------------------------------------------
  const rp = readFileSync('src/modules/RolePermissions.tsx', 'utf8');
  eq('the matrix can be exported', /xlsxDownload\(`permission-matrix-/.test(rp), true);
  // A ROLE WITH AN EMPTY STORED SET IS NOT A ROLE WITH NO PERMISSIONS: it falls
  // back to the ENGINEER defaults, so its row shows something the database does
  // not contain. Exporting that silently produces a document wrong in the most
  // expensive direction — it reads as evidence of what is granted.
  eq('...and it says when a role is showing the fallback rather than a stored list',
    /NOT CONFIGURED/.test(rp), true);
  eq('...which it works out from the STORED set, not the screen',
    /const stored = rolePerms\[key\];/.test(rp), true);
  // UNSAVED TICKS. Exporting mid-edit is legitimate — it is how a change is
  // reviewed before it is committed — but the file must say which it is.
  eq('...and whether the file includes unsaved changes', /unsaved: edited/.test(rp), true);
  // ADMIN IS ALWAYS FULL, which reads on screen as disabled boxes and in a file
  // as somebody having ticked four hundred of them.
  eq('...and why Admin is Yes everywhere', /Admin always holds everything/.test(rp), true);
  // READ-ONLY VIEWERS TOO. Reading this matrix is how somebody answers "why can
  // this person not see that page?", and that reader is the one who most needs
  // to take it away — `admin.view` holds it without `rbac.manage`.
  eq('...and the button is not behind rbac.manage',
    /onClick=\{exportMatrix\}/.test(rp) && !/mayEdit && \(\s*<button className="btn btn-sm" onClick=\{exportMatrix\}/.test(rp), true);
  eq('...and taking a copy is recorded', /action: 'rbac\.export'/.test(rp), true);
}

{
  // -------------------------------------------------------------------------
  // HOW RITHI FUNCTIONS — RESTRICTED, AND THE DOCUMENT IT EMBEDS IS PRESENT.
  //
  // The user, 2026-09-16: "Limit Exposure to Admin, NSM, Zoho, Technical
  // Support", and "is it possible to embed the Artifact? I want the same Look
  // and Feel".
  //
  // Two failure modes, both silent:
  //   * A page "restricted" by dropping its menu entry is not restricted. The
  //     route still answers and anyone sent the address still reaches it.
  //   * A frame whose document is not deployed renders an EMPTY BOX, and looks
  //     exactly like a page that is merely slow.
  // -------------------------------------------------------------------------
  const HOW = '/knowledge-base/how-it-works';

  // 1. IT IS A MODULE, so there is a key to withhold at all.
  eq('How RITHI Functions is a module with a key',
    MODULES.some((m) => m.path === HOW), true);
  eq('...and it is no longer alwaysOpen in the menu',
    /to: '\/knowledge-base\/how-it-works', label: 'How RITHI Functions', icon: '🧭' \}/
      .test(readFileSync('src/components/layout/Layout.tsx', 'utf8')), true);

  // 2. THE CODE DEFAULTS REACH EXACTLY THE FOUR ROLES NAMED. Asserted as a SET,
  //    so a fifth role gaining it fails here rather than being noticed on a
  //    screen somebody happens to open.
  const holders = ROLES.map((r) => r.key)
    .filter((k) => (DEFAULT_PERMS[k] ?? []).includes(moduleAction(HOW))).sort();
  eq('the defaults give it to exactly Admin, NSM, Zoho Migration and Technical Support',
    holders, ['admin', 'nsm', 'technical_support', 'zoho_migration']);

  // 3. ...AND A MIGRATION SAYS SO IN THE DATABASE. On a project in use every
  //    role has a tuned row, so `permsForRole()` never reaches the defaults and
  //    the tick above grants nobody anything. This is the standing rule, and it
  //    applies to NARROWING a page just as much as to adding one.
  const mig = 'supabase/migrations/0209_how_rithi_functions_key.sql';
  eq('a migration grants the key on a live project', existsSync(mig), true);
  const msql = readFileSync(mig, 'utf8');
  eq('...to those four roles and no others',
    /in \('admin', 'nsm', 'zoho_migration', 'technical_support'\)/.test(msql), true);
  // MERGE, NEVER OVERWRITE — an administrator may have tuned the role — and
  // leave a role with ZERO permissions alone, since an empty array means "not
  // configured" and one key written into it turns the fallback off.
  eq('...by merging, and skipping an unconfigured role',
    /jsonb_agg\(distinct v\)/.test(msql) && /jsonb_array_length\(ar\.permissions\) > 0/.test(msql), true);
  eq('...and a suite proves it grants the four and leaks to nobody',
    existsSync('supabase/tests/how_rithi_functions_key_test.sql'), true);

  // 4. THE EMBEDDED DOCUMENT IS IN THE REPOSITORY, not fetched from claude.ai.
  //    That host answers `x-frame-options: SAMEORIGIN` and the page is private,
  //    so an iframe at it would render an empty box for everybody but its
  //    author — which is the kind of thing that looks right to whoever built it.
  const hrf = readFileSync('src/modules/HowRithiFunctions.tsx', 'utf8');
  // EVERY DOCUMENT THE PAGE OFFERS IS A FILE THAT EXISTS. A listed document
  // whose file is missing renders the error banner instead of the page — and
  // the list is the only place the two are connected, so nothing else can
  // catch a typo in a filename.
  const listed = [...hrf.matchAll(/file: '([^']+)'/g)].map((m) => m[1]);
  eq('the page offers more than one module', listed.length > 1, true);
  eq('...and every document it offers ships with the app',
    listed.filter((f) => !existsSync(`public/docs/${f}`)), []);
  eq('...including the two written so far',
    ['how-a-call-works.html', 'how-a-spare-moves.html'].filter((f) => !listed.includes(f)), []);
  // ONE DESIGN, NOT TWO. The spare document reuses the call document's shell,
  // so both carry the theme hand-off and the height message; a document that
  // lost either would flash the wrong theme or scroll inside the frame.
  listed.forEach((f) => {
    const d = readFileSync(`public/docs/${f}`, 'utf8');
    eq(`${f} honours the host theme`, /data-theme', t\)/.test(d), true);
    eq(`${f} reports its own height`, /rithi-doc-height/.test(d), true);
  });
  // ASSERTED ON THE CODE, NOT THE PROSE. The first version of this line matched
  // `<iframe` inside the comment that EXPLAINS why claude.ai cannot be framed,
  // and failed on a file that was correct — a check that reads documentation as
  // if it were code fails exactly where the reasoning is best written down.
  const hrfCode = code(hrf);
  eq('...not a claude.ai URL, which cannot be framed',
    /claude\.ai/.test(hrfCode), false);
  eq('...and the frame\u2019s src is the local document',
    /src=\{`\$\{DOC\}\?theme=\$\{scheme\}`\}/.test(hrfCode), true);

  // 5. THE TWO THINGS A FRAME COSTS, both handled. A framed page cannot see the
  //    host's theme, and a fixed-height frame gives a scrollbar inside a
  //    scrollbar.
  eq('the host\u2019s theme is passed in', /\?theme=\$\{scheme\}/.test(hrf), true);
  eq('...and the frame is sized to what the document reports',
    /rithi-doc-height/.test(hrf), true);
  // A NEW DOCUMENT IS A NEW HEIGHT. Keeping the last one's leaves a shorter
  // document trailing blank space and a taller one clipped until its first
  // message arrives.
  eq('...and the height resets when the module changes',
    /setHeight\(1400\); setFailed\(false\); \}, \[docId\]\)/.test(hrf), true);
  // ONLY FROM THIS FRAME. A page that resizes itself on anyone's say-so is a
  // page anyone can distort.
  eq('...from this frame alone', /e\.source !== frame\.current\?\.contentWindow/.test(hrf), true);
  // A MISSING DOCUMENT IS SAID, not left as an empty box.
  eq('a missing document says so rather than rendering blank', /setFailed\(true\)/.test(hrf), true);
}

{
  // -------------------------------------------------------------------------
  // NEVER CALL SUPABASE FROM INSIDE AN onAuthStateChange LISTENER.
  //
  // The listener runs while the auth client holds its internal lock, so an
  // `await c.auth.getUser()` — or any PostgREST read, which needs the token —
  // made from in there waits on a lock its own caller is holding. supabase-js
  // documents it, and it is easy to write by accident because IT WORKS THE
  // FIRST TIME: the direct call at boot is outside the callback and returns
  // real data. Only a LATER event goes through the broken path.
  //
  // Reported from use (2026-09-16): "For 1 user alone - in 10Secs, it is going
  // into ? instead of Profile Details ... no matter which user logins in, it is
  // the same." The profile loaded, and seconds later the name and email went
  // blank and the role fell back to Engineer.
  // -------------------------------------------------------------------------
  const sb = readFileSync('src/lib/supabase.ts', 'utf8');
  eq('the auth listener hands its work to a fresh task',
    /onAuthStateChange\(\(event\) => \{[\s\S]{0,400}setTimeout\(\(\) => cb\(event\), 0\);/.test(sb), true);
  // A MICROTASK IS NOT ENOUGH — a promise continuation can still run before the
  // lock is released — so the deferral must be a real task.
  eq('...a task, not a microtask',
    /onAuthStateChange\([\s\S]{0,400}queueMicrotask|onAuthStateChange\([\s\S]{0,400}Promise\.resolve\(\)\.then/.test(sb), false);
  // AND THE EVENT REACHES THE CALLER. It was swallowed, so every event looked
  // alike and the identity was re-read on a timer tick that cannot change it.
  eq('...and the event is passed on, not swallowed',
    /export function sbOnAuthChange\(cb: \(event: AuthEvent\) => void\)/.test(sb), true);
  const authx = readFileSync('src/lib/auth.tsx', 'utf8');
  eq('...so a token refresh does not re-read the profile',
    /if \(event === 'TOKEN_REFRESHED'\) return;/.test(authx), true);

  // -------------------------------------------------------------------------
  // AN IDENTITY THAT COULD NOT BE READ SAYS SO.
  //
  // The last-resort profile used to be `full_name: user.email ?? ''` with the
  // fallback role — so where the session carries no email it is a person with
  // NO NAME ANYWHERE, shown as "—", "—" and "Engineer" with nothing saying
  // why. `supabase.ts` condemns exactly that fifteen lines above the line that
  // did it: a person quietly downgraded is the worst kind of permission bug,
  // because it looks like the app is broken rather than like access was never
  // granted.
  //
  // They stay SIGNED IN — locking somebody out of an app they can authenticate
  // to is worse — so the fix is that every screen showing who they are admits
  // the profile did not load.
  // -------------------------------------------------------------------------
  eq('an unreadable profile is marked, not dressed up as a real one',
    /unresolved: true,/.test(sb), true);
  eq('...and it is never a blank name', /full_name: user\.email \|\| 'Profile not loaded'/.test(sb), true);
  eq('...the flag reaches the app\u2019s own user', /unresolved: p\.unresolved === true/.test(authx), true);
  eq('...My Profile says so outright',
    /user\?\.unresolved && \(/.test(readFileSync('src/modules/Profile.tsx', 'utf8')), true);
  eq('...and the "?" avatar is marked rather than left looking like a glitch',
    /user\?\.unresolved \? ' user-avatar-unresolved' : ''/.test(readFileSync('src/components/layout/Layout.tsx', 'utf8')), true);
  eq('...with a rule of its own',
    /\.user-avatar-unresolved \{/.test(readFileSync('src/components/layout/layout.css', 'utf8')), true);
}

{
  // -------------------------------------------------------------------------
  // `user.name` DOES NOT EXIST, AND TYPESCRIPT CANNOT SAY SO.
  //
  // The `User` type has `fullName`. It has no `name` — but `BaseRecord` carries
  // an index signature (`[key: string]: unknown`), so `user?.name` type-checks
  // and is `undefined` at runtime, every time, with no error anywhere.
  //
  // Reported from use (2026-09-16): the name on a DELIVERY CHALLAN. Stores
  // booked a stock out and `SpareDispatch.tsx` sent `user?.name ?? user?.email`
  // — so it never sent a name at all. A document that leaves the building with
  // the company's mark on it said the wrong thing, and nothing failed.
  //
  // The database stamps that column from the session now (0211), so the value
  // the client sends no longer decides it — but the same phantom field would
  // read as blank anywhere else it is used, so it is refused outright.
  // -------------------------------------------------------------------------
  const phantom: string[] = [];
  ['src/modules', 'src/components', 'src/lib'].forEach((dir) => {
    const walk = (d: string) => {
      readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const full = `${d}/${e.name}`;
        if (e.isDirectory()) { walk(full); return; }
        if (!/\.tsx?$/.test(e.name)) return;
        code(readFileSync(full, 'utf8')).split('\n').forEach((line, i) => {
          // `user.name` / `user?.name`, but not `user.name_line`, `userName`,
          // or a different object that happens to end in "user".
          if (/\buser\s*\??\.\s*name\b(?!_)/.test(line)) {
            phantom.push(`${full.replace(`${process.cwd()}/`, '')}:${i + 1}`);
          }
        });
      });
    };
    walk(`${process.cwd()}/${dir}`);
  });
  {
    // THE DESIGNATION AND THE PERMISSION ARE DIFFERENT THINGS (the user,
    // 2026-09-18, pointing at a User Master row reading Designation "Regional
    // Manager" beside Role "Reporting Manager"). The header used to show only
    // the role, unlabelled, in the place a reader looks for a job title -- so
    // the two were read as one. Both are shown now and the ROLE says which it
    // is; an unlabelled second line would have recreated the confusion.
    const lay = readFileSync('src/components/layout/Layout.tsx', 'utf8');
    eq('the header shows the designation', /className="user-designation">\{designation\}/.test(lay), true);
    // It comes off the USER, from the User Master through `profiles` (0199).
    // Naming a field that does not exist type-checks here -- `BaseRecord` carries
    // an index signature -- and renders blank for ever, which is the `user.name`
    // trap in a third place.
    eq('...read from the user\'s own field, not invented',
      /const designation = String\(user\?\.designation \?\? ''\)\.trim\(\)/.test(lay), true);
    // "Permission", the user's own word (2026-09-18), not "RITHI role" — it
    // says what the value DOES rather than which system it belongs to.
    eq('...and the role line is labelled Permission',
      /Permission · \{roleLabel\(user\)\}/.test(lay), true);
    // Blank for most of a part-filled directory, so it must not leave a gap.
    eq('...a person with no designation gets no empty line',
      /\{!!designation && <span className="user-designation">/.test(lay), true);
    eq('...and the menu labels both', /<dt>Designation<\/dt>/.test(lay) && /<dt>Permission<\/dt>/.test(lay), true);
  }
  {
    // PENDING REGISTRATIONS IS REGISTER-SIZED FOR AN OFFICE ROLE, so it pages.
    // The Hotline desk sees EVERY engineer's requests -- `cr_read` consults
    // `can_view_all_calls()`, which names hotline -- so this one screen's list
    // is the whole company's rather than one person's. It was capped at 300 and
    // unpaged, which `check:ui`'s `.limit(n > 1000)` rule cannot see: 300 is
    // UNDER the PostgREST cap, so nothing was lying about truncation, the
    // screen simply stopped at 300 and called it "300 pending call
    // registrations" with no `+` on the badge.
    const sb = readFileSync('src/lib/supabase.ts', 'utf8');
    const fn = sb.split('export async function listCallRequestsAsPending')[1]?.split('export ')[0] ?? '';
    eq('the pending register pages rather than capping', /allRows</.test(fn), true);
    // Without a tiebreaker `submitted_at` ties -- which a bulk import makes
    // certain -- and a tie can put one row on two pages or on neither.
    eq('...with a tiebreaker after submitted_at',
      /order\('submitted_at'[^)]*\)\s*\.order\('id'/.test(fn), true);
    eq('...and the screen asks for no cap of its own',
      /await listPending\(\)/.test(readFileSync('src/modules/PendingRegistrations.tsx', 'utf8')), true);
  }
  {
    // A PROBE'S "CHANGE ME" LINE MUST NOT DEFAULT TO SOMEBODY REAL. Two of
    // these carried a live address, so running the file unchanged returned a
    // complete, plausible grid ABOUT THE WRONG PERSON -- worse than no answer,
    // because nothing in it reads as an error. `example.com` is reserved for
    // exactly this (RFC 2606) and can match no profile, so an unchanged run
    // says so instead.
    const probes = readdirSync('supabase/apply').filter((f) => f.startsWith('_') && f.endsWith('.sql'));
    const bad: string[] = [];
    for (const f of probes) {
      const body = readFileSync(`supabase/apply/${f}`, 'utf8');
      for (const m of body.matchAll(/lower\('([^']*@[^']*)'\)/g)) {
        if (!/@example\.(com|org|net)$/i.test(m[1])) bad.push(`${f}: ${m[1]}`);
      }
    }
    eq('no hand-run probe defaults to a real person\'s email', bad, []);
  }
  {
    // WHICH MACHINE — ONE DEFINITION, TWO LANGUAGES. `machineKey()` in
    // `src/lib/machine.ts` and `public.machine_key()` (0218) must squash the
    // same way, or Product Database 2.0 groups machines the client would not
    // and the two disagree about which rows are one machine. Same argument as
    // `coverCode`/`cover_code`: the SQL is compared with the client here.
    const sqlKey = readFileSync('supabase/migrations/0218_product_database_v2.sql', 'utf8')
      .split('create or replace function public.machine_key')[1]?.split('$$')[1] ?? '';
    eq('the SQL machine key squashes to letters and digits, like machineKey()',
      (sqlKey.match(/\[\^a-z0-9\]/g) ?? []).length, 2);
    eq('...and joins the two halves with a pipe', /\|\|\s*'\|'\s*\|\|/.test(sqlKey), true);
    eq('...and it is MODEL then SERIAL, never the serial alone',
      sqlKey.indexOf('p_product') < sqlKey.indexOf('p_serial')
      && sqlKey.includes('p_product') && sqlKey.includes('p_serial'), true);
    eq('the client key is still the one it is being matched against',
      /export const machineKey = \(product: unknown, serial: unknown\): string =>/
        .test(readFileSync('src/lib/machine.ts', 'utf8')), true);
  }
  {
    // A `Restore:` CLAUSE MUST NAME A BUNDLE THAT ACTUALLY CARRIES THE
    // MIGRATION. Checking only that the FILE EXISTS is what let row 167 tell
    // somebody to run `HandStock_X.sql` to restore 0215, which lives in the
    // `performance` module and is in no other bundle — so the row went on
    // reading NO however many times they ran what it named, and the Product
    // Database 2.0 bundle then died on `function public.imported_ts(jsonb,
    // unknown) does not exist`.
    //
    // MATCHED ON THE PARENTHESISED CONVENTION ONLY — `(0215)`, which is how a
    // row names its OWN migration. A bare number in the prose is not one: row
    // 81 says "notify_spare_dispatched carries 0064", and a rule reading that
    // as its migration would fail a correct row, which is the one thing a
    // check here must never do.
    const statusSql = readFileSync('supabase/apply/_status.sql', 'utf8');
    const rows = statusSql.split(/\n    \((?=\d+, ')/);
    const wrong: string[] = [];
    for (const row of rows) {
      const head = /^(\d+), '((?:[^']|'')*)', '((?:[^']|'')*)'/.exec(row);
      if (!head) continue;
      const restore = /Restore: ([A-Za-z_0-9.]+)/.exec(head[3]);
      const named = [...head[3].matchAll(/\((0\d{3})[),]/g)].map((m) => m[1]);
      if (!restore || !named.length) continue;
      const file = restore[1];
      const path = existsSync(file) ? file : `supabase/apply/${file}`;
      if (!existsSync(path)) { wrong.push(`row ${head[1]}: ${file} does not exist`); continue; }
      const body = readFileSync(path, 'utf8');
      // ANCHORED TO THE SECTION HEADER a bundle emits per migration
      // (`-- 0208_cover_code_normalised.sql` at line start), not to any mention
      // of the name. A bare `includes` reads the bundle's own PREFLIGHT
      // COMMENT — which names the migrations it needs — as proof it carries
      // them, and row 160 passed on exactly that.
      const carries = (n: string) =>
        new RegExp(`^-- ${n}_[a-z0-9_]+\\.sql\\s*$`, 'm').test(body);
      if (named.every((n) => !carries(n))) {
        wrong.push(`row ${head[1]}: ${file} carries none of ${named.join(', ')}`);
      }
    }
    eq('every Restore: names a bundle that CARRIES the migration', wrong, []);
  }
  {
    // A CONSTRAINT ADDED BY ONE MIGRATION AND DROPPED BY A LATER ONE IS DEAD
    // CODE THAT STILL EXECUTES — and a bundle is re-run WHOLE, so it executes
    // on EVERY re-apply. 0148 added `parts_category_check`; 0152 drops it four
    // files later, deliberately, because a check there aborts a bulk import
    // part-written. The `add` stayed, guarded by `if not exists` — and after
    // 0152 the constraint's ABSENCE is the correct state, so every re-run tried
    // to put it back.
    //
    // ON AN EMPTY DATABASE THAT SUCCEEDS and 0152 removes it again, which is
    // why every check here passed for months. On the live project, where a part
    // had since been loaded with a category outside the five words, the bundle
    // stopped at 0148 with `check constraint ... is violated by some row` —
    // BEFORE reaching the file that would have dropped it.
    const migDir = 'supabase/migrations';
    const migs = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    const added = new Map<string, string[]>();
    const dropped = new Map<string, string[]>();
    for (const f of migs) {
      const body = readFileSync(`${migDir}/${f}`, 'utf8');
      for (const m of body.matchAll(/add\s+constraint\s+([a-z0-9_]+)/gi)) {
        added.set(m[1], [...(added.get(m[1]) ?? []), f]);
      }
      for (const m of body.matchAll(/drop\s+constraint\s+(?:if\s+exists\s+)?([a-z0-9_]+)/gi)) {
        dropped.set(m[1], [...(dropped.get(m[1]) ?? []), f]);
      }
    }
    const zombies: string[] = [];
    for (const [name, addFiles] of added) {
      const later = (dropped.get(name) ?? []).filter((d) => addFiles.some((a) => d > a));
      if (later.length) zombies.push(`${name}: added in ${addFiles.join(', ')}, dropped later in ${later.join(', ')}`);
    }
    eq('no constraint is added by one migration and dropped by a later one', zombies, []);
  }
  {
    // A VIEW A SCREEN READS MUST BE GRANTED TO `authenticated`. 28 of the 30
    // views these migrations create carry `grant select ... to authenticated`;
    // `product_database_v2` shipped without one. Supabase's default privileges
    // usually cover a view created by `postgres`, which is exactly why the
    // omission HIDES — and "usually" is not a rule to rely on for the one
    // object a new screen reads, nor for a project rebuilt in a different
    // order.
    //
    // `calls` is the one legitimate exception: it REPLACED a table and
    // inherited that table's privileges, so granting again would say something
    // untrue about where its rights come from.
    const GRANT_EXEMPT = new Set(['calls']);
    const migFiles = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
    const created = new Set<string>();
    const granted = new Set<string>();
    for (const f of migFiles) {
      const body = readFileSync(`supabase/migrations/${f}`, 'utf8');
      for (const m of body.matchAll(/create\s+(?:or\s+replace\s+)?view\s+public\.([a-z0-9_]+)/gi)) created.add(m[1]);
      for (const m of body.matchAll(/grant\s+select\s+on\s+public\.([a-z0-9_]+)/gi)) granted.add(m[1]);
    }
    const ungranted = [...created].filter((v) => !granted.has(v) && !GRANT_EXEMPT.has(v)).sort();
    eq('every view a migration creates is granted to authenticated', ungranted, []);
  }
  eq('nothing reads user.name — the field is called fullName', phantom, []);

  // AND THE COLUMN IS STAMPED RATHER THAN SENT, which is what makes the client
  // no longer able to get it wrong. Same rule as a call's registrant (0113).
  eq('who dispatched a stock out is stamped from the session',
    existsSync('supabase/migrations/0211_dispatched_by_is_stamped.sql'), true);
  const st = readFileSync('supabase/migrations/0211_dispatched_by_is_stamped.sql', 'utf8');
  eq('...by a trigger, leaving the dispatch function alone',
    /before insert on public\.spare_dispatches/.test(st), true);
  // THE FUNCTION IS NOT REDEFINED. Its live version carries partial dispatch —
  // per-line quantities, the outstanding balance, the refurbished flags — and
  // this migration's first draft rewrote it from a four-revision-old copy,
  // which would have deleted all of it.
  eq('...and does NOT redefine dispatch_spare_lines',
    /create or replace function public\.dispatch_spare_lines/.test(st), false);
  // AN ADMINISTRATIVE CONNECTION HAS NO SESSION, and blanking there would lose
  // the only record of who booked the stock out.
  eq('...and keeps the supplied value when there is no session',
    /if me is not null then/.test(st), true);
  eq('...with a suite behind it',
    existsSync('supabase/tests/dispatched_by_stamped_test.sql'), true);
}


console.log('\n-- a document is filed in the folder it belongs to --');
{
  // The user, 2026-09-20: everything landed in ONE flat Drive folder, so a
  // Field report, an Installation KYC and a PM report were indistinguishable
  // the moment they were uploaded.
  const gs = readFileSync('apps-script/CallReg.gs', 'utf8');

  // THE CLIENT'S KEYS AND THE BRIDGE'S NAMES ARE TWO COPIES OF ONE MAPPING.
  // The client sends a key, the bridge looks a NAME up in Drive — so a rename
  // on one side alone does not error, it files the document in the drive root
  // and nothing says so.
  const m = gs.match(/var DRIVE_FOLDERS = \{([\s\S]*?)\};/);
  eq('CallReg states the folders in one place', !!m, true);
  const inGs: Record<string, string> = {};
  for (const line of (m ? m[1] : '').split('\n')) {
    const kv = line.match(/^\s*([a-z]+):\s*'([^']+)'/);
    if (kv) inGs[kv[1]] = kv[2];
  }
  eq('...and the client names exactly the same five folders',
    Object.keys(inGs).sort(), Object.keys(DRIVE_FOLDER_NAMES).sort());
  eq('...spelled identically on both sides', inGs, { ...DRIVE_FOLDER_NAMES });
  eq('...which is the mapping that was asked for',
    [DRIVE_FOLDER_NAMES.field, DRIVE_FOLDER_NAMES.installation, DRIVE_FOLDER_NAMES.pm,
     DRIVE_FOLDER_NAMES.kyc, DRIVE_FOLDER_NAMES.additional],
    ['Field Reports', 'Installation Reports', 'PM Reports', 'KYC', 'Additional Reports']);

  // RESOLVED BY NAME, because a shared drive's subfolder ids cannot be read
  // from outside it — a pasted id is a guess, and a wrong one files the
  // document somewhere nobody looks rather than failing.
  eq('the shared drive is the one storage root', /var DRIVE_ROOT_ID = '0AEcWDaijkhs_Uk9PVA'/.test(gs), true);
  eq('...and the subfolders are found by name under it',
    /root\.getFoldersByName\(name\)/.test(gs), true);

  // A KEY THAT WILL NOT RESOLVE FALLS BACK, never throws: losing an engineer's
  // signed report is worse than filing it one level up.
  eq('an unresolvable folder falls back to the drive root',
    /return _driveRoot\(\) \|\| _legacyFolder\(\);/.test(gs), true);

  // THE OLD FLAT FOLDER MUST STAY IN THE SERVE GUARD. Every report uploaded
  // before the re-route lives in it, and dropping it would make all of them
  // stop opening in the app with no error to explain why.
  const guard = gs.slice(gs.indexOf('function _isAppDocument'));
  eq('the serve guard still admits the folder used before the re-route',
    /want\[_legacyFolder\(\)\.getId\(\)\] = true/.test(guard), true);
  eq('...and every folder now written to', /for \(var key in DRIVE_FOLDERS\)/.test(guard), true);

  // WHICH FOLDER A VISIT REPORT GOES IN — `call_table_for()` (0040) word for
  // word. The PREFIX tests are the whole point: a sheet-era 'P M VISIT' and a
  // bulk-loaded 'PM' must reach the same folder, and an equality test sends
  // the first one to Field.
  eq('installation is matched as a PREFIX, as the SQL has it',
    /startsWith\('INSTALL'\)/.test(readFileSync('src/lib/drivefolders.ts', 'utf8')), true);
  eq('...and PM with the spaces removed, also as a prefix',
    /replace\(\/ \/g, ''\)\.startsWith\('PM'\)/.test(readFileSync('src/lib/drivefolders.ts', 'utf8')), true);
  eq('FIELD files under Field', driveFolderForCall('FIELD'), 'field');
  eq('INSTALLATION files under Installation', driveFolderForCall('INSTALLATION'), 'installation');
  eq('PM files under PM', driveFolderForCall('PM'), 'pm');
  eq('a sheet-era "P M VISIT" is still PM', driveFolderForCall('P M VISIT'), 'pm');
  eq('...and so is "INSTALLATION CALL"', driveFolderForCall('INSTALLATION CALL'), 'installation');
  eq('anything else is a Field call', driveFolderForCall('BREAKDOWN'), 'field');
  eq('...including nothing at all', driveFolderForCall(''), 'field');

  // THE BRIDGE READS THE SAME THING OFF THE UCN, for the legacy `upload`
  // action which carries no call type: next_ucn builds
  // <YY><MonthLetter><DD><TypeLetter><nnnn>, so charAt(5) is the type.
  eq('the bridge reads the type letter off the UCN', /charAt\(5\)/.test(gs), true);

  // THE TWO REQUEST DOCUMENTS ARE THE REASON TWO OF THE FOLDERS EXIST, so the
  // field REQUIRES a folder — optional, and a field added later silently goes
  // back to heaping them in the root.
  const rq = readFileSync('src/modules/RequestCallRegistration.tsx', 'utf8');
  eq('the document field demands a folder', /\n  folder: DriveFolder;/.test(rq), true);
  eq('...and passes it on', /uploadToDrive\(file, prefix, folder\)/.test(rq), true);
  eq('KYC goes to the KYC folder', /folder="kyc"/.test(rq), true);
  eq('the Installation Report goes to Additional Reports', /folder="additional"/.test(rq), true);
  const fields = (rq.match(/<DriveFileField/g) ?? []).length;
  eq('...and every document field on the form names one',
    (rq.match(/\n\s+folder="/g) ?? []).length, fields);

  // A VISIT REPORT IS FILED BY THE CALL'S OWN TYPE.
  const cr = readFileSync('src/modules/CallReporting.tsx', 'utf8');
  eq('the visit report is filed by call type',
    /uploadToDrive\([^)]*driveFolderForCall\(callType\)\)/.test(cr), true);
  // And the key must actually travel.
  const sh = readFileSync('src/lib/sheets.ts', 'utf8');
  eq('the folder key is sent with the upload', /action: 'driveupload'[^}]*folder: folder \?\? ''/.test(sh), true);
  // THE RULE LIVES WHERE IT CAN BE TESTED. `sheets.ts` reaches `supabase.ts`
  // and its `import.meta.env`, so nothing defined there can be imported by a
  // node script — the `paging.ts` reason, in a second place.
  eq('...and the rule itself imports nothing',
    /^import /m.test(readFileSync('src/lib/drivefolders.ts', 'utf8')), false);
}


console.log('\n-- a list that FAILED to load does not read as an empty list --');
{
  // Reported 2026-09-21 with a screenshot: CALL 1's Product box said
  // `Nothing matches ""` over an empty list. The master fetch had FAILED, and
  // `load()` swallows the error and returns [] -- right for rendering, and the
  // reason the screen stated the opposite fact. An empty list and an
  // unreachable one are OPPOSITE claims: one says "there is nothing to
  // choose", the other says "I could not reach the list". Same argument as an
  // empty register proving what the READER was shown, not what exists.
  const base = { isInstall: false, isFirstCall: true, party: '', state: 'idle' as const };
  eq('a failed master fetch says so, on the FIRST call',
    productPlaceholder({ ...base, count: 0, masterFailed: true }).includes('could not load'), true);
  eq('...and does not claim there is nothing to pick',
    productPlaceholder({ ...base, count: 0, masterFailed: true }), '— could not load the product list — check your connection and reopen —');
  // IT MUST NOT FIRE WHEN THE LIST ARRIVED. A list that loaded and happens to
  // be short is not a failure, and saying so would be the mirror of the bug.
  eq('a list that DID load is untouched',
    productPlaceholder({ ...base, count: 6, masterFailed: true }), PICK_A_PRODUCT);
  eq('...and so is the ordinary first call', productPlaceholder({ ...base, count: 6 }), PICK_A_PRODUCT);
  // The flag has to REACH it; an optional field that no caller passes is worse
  // than none, because the check above passes and the screen never changes.
  const rq = readFileSync('src/modules/RequestCallRegistration.tsx', 'utf8');
  eq('the request form passes the flag', /masterFailed: productMaster\.failed/.test(rq), true);
  // AND THE OTHER HALF, which is what the screenshot actually showed. The
  // master read had not FAILED, it had not FINISHED: `useMaster` reports
  // `ready`, the form ignored it, and PickList had no notion of "still
  // loading" -- so an empty-because-loading list rendered as
  // `Nothing matches ""` at somebody who was simply early.
  const pl = readFileSync('src/components/ui/PickList.tsx', 'utf8');
  eq('PickList knows the options may still be loading', /\n  loading\?: boolean;/.test(pl), true);
  eq('...and says so instead of "Nothing matches"',
    /\{loading && options\.length === 0 && !searching && !failed && \(/.test(pl), true);
  // ONLY WHILE THE LIST IS EMPTY. Once options arrive, a search matching none
  // of them really does match none -- saying "loading" there is the same bug
  // mirrored, which is how the first fix for this class went wrong.
  eq('...and only while no options have arrived',
    /!\(loading && options\.length === 0\)/.test(pl), true);
  eq('SelectPicker passes it through',
    /loading=\{loading\}/.test(readFileSync('src/components/ui/SelectPicker.tsx', 'utf8')), true);
  eq('the product field tells it which list it is waiting on',
    /loading=\{i === 0 \|\| isInstall \? !productMaster\.ready : ownedState === 'loading'\}/.test(rq), true);
  const ms = readFileSync('src/lib/masters.ts', 'utf8');
  eq('...and useMaster reports it', /return \{ values, ready, failed \}/.test(ms), true);
  eq('...set only where the fetch was caught', /failedNames\.add\(name\)/.test(ms), true);
  eq('...and cleared when a later fetch succeeds', /failedNames\.delete\(name\)/.test(ms), true);
}


console.log('\n-- a cancelled call is Cancelled on BOTH sides --');
{
  // The client has known this since the colour code was written; the database
  // did not, and five screens read `open_state` straight out of it -- so a
  // call the register would colour slate read "Report pending" and sat in a
  // queue of work somebody was chasing. 19 of them in one upload.
  eq('the client calls it Cancelled', stateBucket('Canceled'), 'Cancelled');
  eq('...whichever way it is spelled', stateBucket('Cancelled'), 'Cancelled');
  const sql = readFileSync('supabase/migrations/0226_cancelled_is_not_report_pending.sql', 'utf8');
  eq('and so does the database now', /like '%cancel%'\s+then 'Cancelled'/.test(sql), true);
  // ORDER IS THE RULE, not decoration: `%cancel%` must be tested before the
  // others, exactly as stateBucket does, or "Cancelled - Unsolved" splits the
  // two sides apart again.
  eq('...tested BEFORE unsolved, as the client tests it',
    sql.indexOf("like '%cancel%'") < sql.indexOf("like '%unsolved%'"), true);
  // THE COLUMN IS CONVERTED, NOT DROPPED. Dropping it takes eleven views with
  // it, each needing security_invoker re-asserted -- the rebuild this project
  // has got wrong three times.
  eq('the column is converted in place, not dropped',
    /alter column open_state drop expression/.test(sql) && !/drop column open_state/.test(sql), true);
  eq('...and the derived value is STAMPED, not accepted',
    /new\.open_state := public\.call_open_state/.test(sql), true);
  eq('...with a suite behind it',
    existsSync('supabase/tests/call_cancelled_state_test.sql'), true);
}


console.log('\n-- a party is read through the index, not scanned for --');
{
  // Reported 2026-09-21: clicking a customer on Product & Party Search came
  // back "canceling statement due to statement timeout". `ilike` CANNOT USE A
  // BTREE, so the read was a sequential scan of every machine -- with
  // `select *`, so each row's `extra` payload too. Measured on 19,253
  // machines: ilike 65.8ms cold / 11.5ms warm (Seq Scan, 18,733 rows
  // discarded) against 0.7ms / 0.5ms for equality (Bitmap Index Scan).
  // `products_party_name_eq` was there all along; this read never used it.
  const sb = code(readFileSync('src/lib/supabase.ts', 'utf8'));
  eq('the exact match is tried first', /const hit = await read\(true\);/.test(sb), true);
  eq('...and ilike is the FALLBACK, not the route',
    /return hit\.length \? hit : read\(false\);/.test(sb), true);
  // BOTH party reads must go through it. One converted and one left behind is
  // the "fix went into one of thirteen call sites" fault this project has
  // already had once, with `allRows`.
  eq('both party reads use it', (sb.match(/await partyRows</g) ?? []).length, 2);
  // COUNT THE EXACT MATCHES ONLY. The `%fragment%` reads are SEARCHES -- a
  // reader typing part of a name -- and an infix ilike is right for those; they
  // have the trigram index for it. What must never be a scan is looking up a
  // party whose WHOLE name is already known. Writing this assertion against
  // every `ilike('party_name'` is what caught that I had converted two of the
  // three exact reads and left sbPartyInfo behind.
  const exactIlike = (sb.match(/ilike\('party_name', *(party|partyLike)/g) ?? []).length;
  eq('every EXACT party read goes through an index', exactIlike,
    (sb.match(/exact \? base\.eq\('party_name'/g) ?? []).length);
  eq('...including the parties table, on its unique name_key',
    /\.eq\('name_key', partyKey\(party\)\)/.test(sb), true);
  eq('...which no longer scans for the name', /from\('parties'\)[\s\S]{0,120}ilike\('party_name', party\)/.test(sb), false);
  // The fallback exists for a REASON and deleting it is the tempting
  // simplification: on this screen the name is verbatim from the register, but
  // the call-request form passes a typed one, and a party whose machines
  // silently vanish is worse than a slow screen.
  eq('the fallback is still reachable', /base\.ilike\('party_name', partyLike\(party\)\)/.test(sb), true);
}


console.log('\n-- a machine is its MODEL and its serial, in the cover lookup too --');
{
  // Reported 2026-09-21: "the item status is under WGP, but when I register
  // the call it shows as OGP". `serial_key` is lower(btrim(serial_number)) and
  // is NOT unique; `machine_key` is model|serial and IS. The lookup used
  // `.eq('serial_key', ...).limit(1)` -- an ARBITRARY one of the machines
  // wearing that serial -- and Pending Registrations filled its item status,
  // warranty and contract onto a call for a different machine.
  const sb = code(readFileSync('src/lib/supabase.ts', 'utf8'));
  eq('the lookup takes the product', /sbProductBySerial\(serial: string, product = ''\)/.test(sb), true);
  eq('...and keys on machine_key when it has one', /\.eq\('machine_key', dbMachineKey\(product, serial\)\)/.test(sb), true);
  // WITHOUT a product, an ambiguous serial must NOT be guessed at. Asking for
  // TWO rows is what makes the difference visible: one is an answer, two is a
  // question, and `.limit(1)` cannot tell them apart.
  eq('...asks for TWO rows when it has no product', /\.eq\('serial_key', key\)\.limit\(2\)/.test(sb), true);
  eq('...and returns nothing when the serial is ambiguous',
    /rows\.length === 1 \? productRowToSheet\(rows\[0\]\) : null/.test(sb), true);
  // THE KEY MUST BE THE ONE THE DATABASE STORES. `machineKey()` in ./machine
  // SQUASHES -- ORION-G becomes oriong -- and the column keeps the hyphen, so
  // using it here would match nothing and fill no cover anywhere, which is
  // worse than the bug. Verified against real rows before shipping.
  eq('the key is built the database way, not the squashing way',
    /const dbMachineKey = [\s\S]{0,160}trim\(\)\.toLowerCase\(\)\}\|\$\{/.test(sb), true);
  eq('...and does NOT squash', /dbMachineKey[\s\S]{0,200}replace\(/.test(sb), false);
  // The call site has to PASS it, or the widened signature changes nothing.
  const pr = readFileSync('src/modules/PendingRegistrations.tsx', 'utf8');
  eq('Pending Registrations passes the product',
    /productBySerial\(serial, g\(row, 'PRODUCT', 'Product Name'\)\)/.test(pr), true);
  eq('...and tells "not found" apart from "ambiguous"',
    /on more than one machine/.test(pr) && /No machine in Product Database is/.test(pr), true);
}


console.log('\n-- bulk report mapping never overwrites a report that is there --');
{
  // The user's rule, 2026-09-22: a completed visit that already has a report is
  // not touched; one without gets the link; a call with no completed visit gets
  // a new visit. The decision itself is tested in check:mapping; these hold the
  // WIRING, which no pure test can see.
  const rm = readFileSync('src/modules/ReportMapping.tsx', 'utf8');
  const sb = code(readFileSync('src/lib/supabase.ts', 'utf8'));

  // ATTACH IS A NARROW UPDATE, NOT AN UPSERT. The visit being written to is an
  // engineer's record -- their job done, their readings. An upsert would carry
  // the recovery file's whole payload over it and blank every column the file
  // does not have.
  eq('attaching writes three columns, not a row',
    /\.update\(\{ manual_report: r\.manual_report, source_ref: r\.source_ref, call_status: status,/.test(sb), true);
  eq('...and does NOT touch updated_at', /attachReportsToVisits[\s\S]{0,700}updated_at:/.test(sb), false);
  eq('...keyed on the EXISTING visit', /\.eq\('uid', r\.uid\)/.test(sb), true);

  // THE PREVIEW MUST SAY WHICH OF THE THREE WILL HAPPEN. A screen that decides
  // at write time is the thing this module exists to avoid.
  eq('the preview shows the action per row', /key: '_action', header: 'Will do'/.test(rm), true);
  eq('...and the button states the plan', /⤵ Attach \{plan\.attach\} · file \{plan\.create\}/.test(rm), true);
  eq('...counted from the decision, not from the row count',
    /summariseActions\(rows\.filter\(\(r\) => !r\.problem\)\.map\(decisionFor\)\)/.test(rm), true);

  // The call's EXISTING visits have to be read, or there is nothing to decide
  // against and every row would look like a new visit.
  eq('the existing visits are fetched with the calls', /await visitsForCalls\(/.test(rm), true);
  // ATTACH RUNS FIRST: it only adds a document to a visit that has none, so a
  // run that stops half way leaves the register consistent.
  eq('attach runs before create', rm.indexOf('attachReportsToVisits(') < rm.indexOf('upsertRecoveredReports('), true);
  // A NEW visit carries the status the rule names, whatever the file said.
  eq('a filed visit is marked completed',
    /call_status: SOLVED_REPORT_COMPLETED/.test(rm), true);
}

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);
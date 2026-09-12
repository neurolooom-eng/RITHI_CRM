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
import { callDateFromRequest, consumptionProblem, CONSUMPTION_YES, CONSUMPTION_NONE } from '../src/lib/fieldcall';
import { machineRowProblem, productPlaceholder, PICK_A_PRODUCT } from '../src/lib/callrequest';
import { FFR_COLUMNS, FFR_LIVE_COLUMNS, ffrFromReview, ffrCallNotSolved, ffrEffectWithdrawn, ffrDocFrom, FFR_NO_SHAPE, FFR_CAPA_STATUS , FFR_WRITABLE, ffrWritable } from '../src/lib/ffr';
import { buildFfrDocx, ffrDocName } from '../src/lib/ffrdoc';
import { localIsoDate } from '../src/lib/dates';
import { trail } from '../src/lib/spareflow';
import { generatePassword, PASSWORD_ALPHABET } from '../src/lib/password';
import { yearStartISO } from '../src/lib/dccr';
import { manualMatchesCall, docTags } from '../src/lib/docmatch';
import { visitDateProblem } from '../src/lib/visitdate';
import { isReviewable, REVIEW_DONE, isUrl, linkLabel } from '../src/lib/callreview';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { timeAgo } from '../src/lib/format';
import { bulkReview2Block, effectiveAutoSave, curatedProduct, masterValueApplies } from '../src/lib/dccr';
import { stateColour } from '../src/lib/callstate';
import { KPI_FIELD_INST_COLUMNS, toKpiExportRow } from '../src/lib/kpi';
import { buildXlsx } from '../src/lib/xlsx';
import { DEFAULT_PERMS, MODULES, moduleAction, parentAction, roleKeyFrom, roleProblem, rolesWith, roleLabelFor, setRoleLabels, RESERVED_ROLE_KEYS } from '../src/lib/rbac';
import { UPLOADS, shapeUpload } from '../src/lib/uploads';
import { manualReportLink } from '../src/lib/reports';
import { drivePreviewUrl } from '../src/lib/drive';
import { callAging, agingTone } from '../src/lib/aging';

let fail = 0;
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
  files.forEach((f) => {
    const src = readFileSync(dir + f, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (!/FIELD_CALL_FIELDS|buildCreateFields/.test(line)) return;
      // The definitions and the imports themselves are not renders.
      if (/^\s*(import|export)\b/.test(line) || /return FIELD_CALL_FIELDS/.test(line)) return;
      uses.push(`${f}:${i + 1}`);
      eq(`${f}:${i + 1} injects the masters`, /inject/i.test(line), true);
    });
  });
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
  eq('registering from a request asks for the ONE machine',
    /await productBySerial\(serial\)/.test(pr), true);
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

  const obj = readFileSync(`${process.cwd()}/src/modules/Objective.tsx`, 'utf8');
  const objSb = readFileSync(`${process.cwd()}/src/lib/supabase.ts`, 'utf8');
  // Sheet 1 is named for the register the objective actually read — the user's
  // shape ("List of Field Calls") for a field objective, and the truth for a PM
  // or Installation one, which is a different register and not field calls.
  eq('the three sheets are the ones asked for',
    /sheet1Name = fam === 'pm' \? 'List of PM Calls'/.test(obj)
    && /: 'List of Field Calls'/.test(obj)
    && /name: 'Installation Base'/.test(obj)
    && /name: 'Calculation'/.test(obj), true);
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
    /re-calculate; the calls have changed since the figure was written/.test(obj), true);
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

  for (const k of ['consumption', 'kpi', 'unused']) {
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

  // The money must NOT be carried: a rate copied forward is a price nobody
  // agreed that looks exactly like one they did.
  const cov = readFileSync('src/lib/cover.ts', 'utf8');
  const renew = cov.slice(cov.indexOf('export async function renewContract'));
  for (const money of ['rate', 'item_tax_amount', 'total_after_tax']) {
    eq(`a renewal does not carry ${money} over`, new RegExp(`\\b${money}:`).test(renew), false);
  }
  // ...and the link back must be written, or "what was this machine on before?"
  // has no answer.
  eq('the new contract points back at the old one', /prev_mc_number:/.test(renew), true);
  eq('...and each machine carries its own history', /last_contract_number:/.test(renew), true);
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
  eq('the message says where to go next',
    /Product Master/.test(machineRowProblem([{ ...ok, party: '' }], false) ?? ''), true);
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
  eq('an installation names the master it picks from',
    /Product Master/.test(P({ isInstall: true, count: 0 })), true);
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
  eq('the register view carries the live call',
    /create or replace view public\.field_failure_register/.test(body), true);
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

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);

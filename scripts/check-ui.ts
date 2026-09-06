// Checks for the bits of UI logic that are worth pinning down — the rules a
// screen must follow that reading the component will not tell you.
// No test runner in this repo, so: `npm run check:ui`.
import { groupRowsBy, groupTree, NO_GROUP } from '../src/components/table/group';
import { URS, FRS, TESTS } from '../src/lib/validation';
import { mergeDcLines } from '../src/lib/dc';
import { callFamily } from '../src/lib/calltype';
import { withoutHistory } from '../src/lib/handstock';
import { metaFromFileName } from '../src/lib/docname';
import { alarmNumber, withAlarm } from '../src/lib/alarm';
import { callDateFromRequest } from '../src/lib/fieldcall';
import { localIsoDate } from '../src/lib/dates';
import { trail } from '../src/lib/spareflow';
import { generatePassword, PASSWORD_ALPHABET } from '../src/lib/password';
import { yearStartISO } from '../src/lib/dccr';
import { manualMatchesCall, docTags } from '../src/lib/docmatch';
import { visitDateProblem } from '../src/lib/visitdate';
import { readdirSync, readFileSync } from 'node:fs';
import { timeAgo } from '../src/lib/format';
import { bulkReview2Block } from '../src/lib/dccr';
import { stateColour } from '../src/lib/callstate';

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
   'URS-037', 'URS-038', 'URS-039', 'URS-040', 'URS-041', 'URS-042'].forEach((id) => {
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
    /tab === 'desk' \|\| tab === 'r2' \|\| tab === 'r3'/.test(dccr), true);
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
  eq('the service report is a link',
    /href=\{link\}[\s\S]{0,120}Service Report/.test(dccr), true);
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
  eq('...and it is off unless the reviewer turns it on',
    /const \[autoSave, setAutoSave\] = useState<boolean>\(\(\) => autoSaveOn\(\)\)/.test(dccr), true);
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
  // link. Contrast, like every other highlight here.
  const css = readFileSync(`${process.cwd()}/src/modules/dccr.css`, 'utf8');
  eq('the Service Report link is a contrast chip, not faint text',
    /\.dccr-report-link \{[^}]*background: var\(--text\);[^}]*color: var\(--surface\);/.test(css), true);
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

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);

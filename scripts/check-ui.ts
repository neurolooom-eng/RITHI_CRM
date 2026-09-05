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
import { readdirSync, readFileSync } from 'node:fs';

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

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);

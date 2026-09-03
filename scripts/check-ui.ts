// Checks for the bits of UI logic that are worth pinning down — the rules a
// screen must follow that reading the component will not tell you.
// No test runner in this repo, so: `npm run check:ui`.
import { groupRowsBy, groupTree, NO_GROUP } from '../src/components/table/group';
import { URS, FRS, TESTS } from '../src/lib/validation';
import { mergeDcLines } from '../src/lib/dc';

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
  ['URS-031', 'URS-032', 'URS-033', 'URS-034', 'URS-035'].forEach((id) => {
    eq(`${id} traces to a test`, testFor(id).length > 0 ? 'yes' : 'no', 'yes');
  });
}

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);

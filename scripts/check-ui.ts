// Checks for the bits of UI logic that are worth pinning down — the rules a
// screen must follow that reading the component will not tell you.
// No test runner in this repo, so: `npm run check:ui`.
import { groupRowsBy, NO_GROUP } from '../src/components/table/group';

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

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);

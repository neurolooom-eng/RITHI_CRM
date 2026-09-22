// ===========================================================================
// A ROW'S KEY IS ITS OWN, NOT A RECIPE MADE OF ITS FIELDS.
//
// Machine History keyed each row on source + reference + date + detail. Two
// visits filed against the same call on the same day with the same status and
// no remark are identical in all four, so they got the same key — and React's
// own warning for that is that children may be "duplicated and/or omitted".
// Reported from use (2026-09-22): with the Spare chip selected the table
// showed THREE spares and TWO VISITS. Five rows, the count was right, the
// filter was right, and two spare rows had been replaced by the colliding
// visits. Nothing errored.
//
// `withEventKeys` lives in `machine.ts` rather than beside the fetch for the
// `paging.ts` reason: `machineHistory.ts` reaches `supabase.ts`, which reads
// `import.meta.env`, so nothing in it can be imported by a node script and
// nothing in it can be tested as behaviour. This is the part that can be.
// ===========================================================================
import { withEventKeys } from '../src/lib/machine';

let fail = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  if (cond) console.log(`  ok   ${label}`);
  else { console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ''}`); fail++; }
};

console.log('\nmachine history row keys\n');

// THE EXACT SHAPE THAT BROKE IT: two visits, identical in every field the
// table shows, on one call on one day.
const twin = { on: '2026-09-09', source: 'Visit', what: 'Solved - Report Completed',
               ref: '26I01P0080', ucn: '26I01P0080', party: 'BIO LIFES', detail: '' };
const events = [
  { on: '2026-09-11', source: 'Spare', what: 'KY650300', ref: '26I07F0025', ucn: '26I07F0025', party: 'BIO LIFES', detail: 'qty 1' },
  { ...twin },
  { ...twin },
  { on: '2026-05-25', source: 'Spare', what: 'MP-010', ref: '26E25F0006', ucn: '26E25F0006', party: 'BIO LIFES', detail: 'qty 1' },
  { on: '2026-05-25', source: 'Spare', what: 'KY632200', ref: '26E25F0006', ucn: '26E25F0006', party: 'BIO LIFES', detail: 'qty 1' },
];

const keyed = withEventKeys(events);
ok('every row is keyed', keyed.every((e) => typeof e.key === 'string' && e.key.length > 0));
ok('two rows identical in every field still get different keys',
  keyed[1].key !== keyed[2].key, `${keyed[1].key} vs ${keyed[2].key}`);
ok('no two keys collide across the whole list',
  new Set(keyed.map((e) => e.key)).size === keyed.length,
  `${new Set(keyed.map((e) => e.key)).size} of ${keyed.length}`);
ok('the key names its register, so it reads as something in a bug report',
  keyed[1].key.startsWith('Visit#') && keyed[0].key.startsWith('Spare#'),
  keyed.map((e) => e.key).join(', '));
ok('numbering runs within a register, not across the list',
  keyed.map((e) => e.key).join(',') === 'Spare#1,Visit#1,Visit#2,Spare#2,Spare#3',
  keyed.map((e) => e.key).join(','));

// STABLE ACROSS RENDERS. A random id would give every row a new key on every
// keystroke, remounting the whole table and losing the scroll position — a
// different bug in the same place.
ok('the same events always get the same keys',
  JSON.stringify(withEventKeys(events).map((e) => e.key))
    === JSON.stringify(keyed.map((e) => e.key)));

// IT DOES NOT MUTATE WHAT IT IS GIVEN. The events come from the registers and
// are handed to the view; a helper that rewrote them in place would make the
// second call disagree with the first.
ok('the input is left alone', !('key' in events[1]));
ok('every other field survives',
  keyed[1].ref === twin.ref && keyed[1].what === twin.what && keyed[1].detail === twin.detail);

ok('an empty list is an empty list', withEventKeys([]).length === 0);

// FILTERING IS WHERE IT BIT. The keys of any subset must still be unique —
// that is the whole claim, since the chips render a subset.
const spares = keyed.filter((e) => e.source === 'Spare');
ok('a filtered subset has unique keys too',
  new Set(spares.map((e) => e.key)).size === spares.length && spares.length === 3);

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);

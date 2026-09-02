// Checks for src/lib/reportMapping.ts — the pure half of the bulk report → call
// mapping. No test runner in this repo, so: `npm run check:mapping`.
// Exits non-zero on the first mismatch, and prints every case either way.

import { parseRef, baseName, matchCall, toTimestamp, shapeRow, summarise, fileNamesToResolve, type CallKey } from '../src/lib/reportMapping';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log(`  ✗ ${label}\n      got  ${g}\n      want ${w}`); fail++; }
  else console.log(`  ✓ ${label} = ${g}`);
};

console.log('\n-- AppSheet reference shapes --');
eq('full appsheet url -> file name',
   parseRef('https://www.appsheet.com/template/gettablefileurl?appName=RithiService-123&tableName=Reports&fileName=Reports_Images%2FRow%2042_Photo.204512.png').fileName,
   'Row 42_Photo.204512.png');
eq('appsheet url kind', parseRef('https://www.appsheet.com/template/gettablefileurl?fileName=a%2Fb.png').kind, 'appsheet-url');
eq('bare relative path', parseRef('Reports_Images/Row 42_Photo.204512.png').fileName, 'Row 42_Photo.204512.png');
eq('backslash path', parseRef('Reports_Images\\sub\\scan.pdf').fileName, 'scan.pdf');
eq('existing drive link untouched',
   parseRef('https://drive.google.com/file/d/1AbC/view').url, 'https://drive.google.com/file/d/1AbC/view');
eq('bare drive id -> link',
   parseRef('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms').url,
   'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view');
eq('empty', parseRef('').kind, 'empty');
eq('a plain filename is NOT a drive id', parseRef('photo.png').kind, 'appsheet-path');
eq('junk is flagged not guessed', parseRef('see attached').kind, 'unknown');
eq('non-appsheet url left alone', parseRef('https://example.com/x.pdf').kind, 'other-url');

console.log('\n-- date reading (day-first) --');
eq('03/04/2026 is 3 April', toTimestamp('03/04/2026').slice(0, 10), '2026-04-03');
eq('with time', toTimestamp('03-04-2026 14:30').slice(11, 16), '14:30');
eq('iso passes through', toTimestamp('2026-04-03').slice(0, 10), '2026-04-03');
eq('junk -> empty', toTimestamp('not a date'), '');

console.log('\n-- matching --');
const calls: CallKey[] = [
  { ucn: '26A02F0001', call_number: 'CL2600001', serial: 'S1', party_name: 'HOSP', product_name: 'VEGA' },
  { ucn: '26A02F0002', call_number: 'CL2600002', serial: 'S2', party_name: 'HOSP', product_name: 'VEGA' },
];
eq('by ucn', matchCall({ ucn: '26A02F0001' }, calls).how, 'ucn');
eq('by ucn, case/space tolerant', matchCall({ ucn: ' 26a02f0001 ' }, calls).how, 'ucn');
eq('by call number', matchCall({ call_number: 'CL2600002' }, calls).how, 'call-number');
eq('ucn wins over call number', matchCall({ ucn: '26A02F0001', call_number: 'CL2600002' }, calls).ucn, '26A02F0001');
eq('no match', matchCall({ ucn: 'NOPE' }, calls).how, 'none');
eq('nothing to match on', matchCall({}, calls).how, 'none');
const dupes: CallKey[] = [calls[0], { ...calls[0], call_number: 'CL2600009' }];
eq('ambiguous ucn held back', matchCall({ ucn: '26A02F0001' }, dupes).how, 'ambiguous');

console.log('\n-- whole rows --');
const rows = [
  { 'UCN': '26A02F0001', 'Visit Date': '03/04/2026', 'Engineer': 'A Kumar', 'Call Status': 'Unsolved',
    'Manual Report': 'Reports_Images/Row 42_Photo.png', 'Job Done': 'Replaced sensor', 'Hour Meter': '1200' },
  { 'Call Number': 'CL2600002', 'Visit Date': '2026-04-05', 'Engineer': 'B Rao',
    'Manual Report': 'https://drive.google.com/file/d/1zz/view' },
  { 'UCN': 'GHOST', 'Visit Date': '01/01/2026', 'Manual Report': '' },
];
const shaped = rows.map((r, i) => shapeRow(r, calls, i));
eq('row1 uid derived from call+visit', shaped[0].uid, 'REC-26A02F0001-20260403000000');
eq('row1 keeps unknown columns in data', shaped[0].data, { 'Job Done': 'Replaced sensor', 'Hour Meter': '1200' });
eq('row1 source_ref kept', shaped[0].source_ref, 'Reports_Images/Row 42_Photo.png');
eq('row1 needs a lookup', shaped[0].ref.fileName, 'Row 42_Photo.png');
eq('row1 no problem', shaped[0].problem, '');
eq('row2 matched by call number', shaped[1].ucn, '26A02F0002');
eq('row2 link kept as-is', shaped[1].manual_report, 'https://drive.google.com/file/d/1zz/view');
eq('row3 held back', shaped[2].problem.length > 0, true);
eq('row3 has no uid to write', shaped[2].uid, '');
eq('summary', summarise(shaped), { total: 3, matched: 2, unmatched: 1, ambiguous: 0, needLookup: 1, alreadyLinked: 1, ready: 2 });
eq('lookup list deduped', fileNamesToResolve([parseRef('a/x.png'), parseRef('b/x.png'), parseRef('c/y.png')]), ['x.png', 'y.png']);

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);

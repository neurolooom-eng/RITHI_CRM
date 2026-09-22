// Checks for src/lib/reportMapping.ts — the pure half of the bulk report → call
// mapping. No test runner in this repo, so: `npm run check:mapping`.
// Exits non-zero on the first mismatch, and prints every case either way.

import { parseRef, baseName, matchCall, toTimestamp, shapeRow, summarise, fileNamesToResolve, decideVisit, isCompletedVisit, summariseActions, SOLVED_REPORT_COMPLETED, ALIASES, type CallKey, type ExistingVisit } from '../src/lib/reportMapping';
import { REPORT_COLS } from '../src/lib/uploads';
import { loose } from '../src/lib/headers';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log(`  ✗ ${label}\n      got  ${g}\n      want ${w}`); fail++; }
  else console.log(`  ✓ ${label} = ${g}`);
};

// ===========================================================================
// THE TWO HEADER LISTS MUST AGREE, AND NOTHING USED TO CHECK THAT.
//
// Bulk Uploads' visit registers (REPORT_COLS) and this screen read the SAME
// exported files, and the comment beside this screen's alias list has said
// "keep the two lists in step" since the day it was written. They drifted, and
// the drift was invisible: REPORT_COLS reads `Service Report` -- which is what
// the Field, Installation and PM registers actually call the attachment -- and
// this screen did not. A 378-row export was loaded on 2026-09-22 and EVERY row
// read as "no attachment on this row". Nothing errored. The screen counted the
// calls correctly, matched 377 of them, and offered to write nothing at all.
//
// That is the expensive kind of wrong: a file that loads on one screen and
// produces nothing on the other, with both screens behaving exactly as
// designed. Two assertions, and the second is the one that is easy to miss --
// alias ORDER decides which column wins when a file carries several, so two
// lists holding the same names in a different order still disagree.
// ===========================================================================
console.log('\n-- Bulk Uploads and Bulk Report Mapping read the same headings --');
{
  for (const col of REPORT_COLS) {
    const mine = ALIASES[col.to];
    if (!mine) continue;            // a column this screen does not map at all
    // DE-DUPLICATED FIRST. `visit_date` and `visit date` loosen to one name, so
    // a list holding both is not a list that disagrees with itself.
    const uniq = (xs: string[]) => [...new Set(xs)];
    const theirs = uniq(col.from.map(loose));
    const ours = uniq(mine.map(loose));
    const missing = theirs.filter((a) => !ours.includes(a));
    eq(`${col.to}: every heading the register reads is one this screen reads`, missing, []);

    // ORDER, for the shared names only. `findHeaderFor` takes the FIRST alias
    // the file has, so a file carrying both `Service Report` and `Report` gets
    // a different column on each screen if the two lists rank them differently.
    const shared = ours.filter((a) => theirs.includes(a));
    eq(`${col.to}: ...and ranks them the same way`, shared, theirs.filter((a) => ours.includes(a)));
  }
}

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


console.log('\n-- what to do with each row (the user rule, 2026-09-22) --');
{
  const V = (uid: string, call_status: string, manual_report = '', updated_at = '2026-01-01'): ExistingVisit =>
    ({ uid, call_status, manual_report, updated_at });
  const D = 'REC-26A01F0001-20260601000000';

  // 1. A completed visit that ALREADY has a report is never touched. This is
  //    the rule that protects what an engineer filed.
  eq('a completed visit with a report is left alone',
    decideVisit([V('a', SOLVED_REPORT_COMPLETED, 'https://drive/x')], D, true).action, 'skip');

  // 2. A completed visit with NO report gets the link -- on that visit's uid,
  //    not a new one.
  const attach = decideVisit([V('a', SOLVED_REPORT_COMPLETED)], D, true);
  eq('a completed visit with no report is attached to', attach.action, 'attach');
  eq('...on ITS uid, not a derived one', attach.uid, 'a');

  // 3. No completed visit at all -> file one.
  const create = decideVisit([V('a', 'Unsolved')], D, true);
  eq('no completed visit means a new one', create.action, 'create');
  eq('...with the derived uid', create.uid, D);
  eq('a call with no visits at all also creates', decideVisit([], D, true).action, 'create');

  // 4. "Solved - Report PENDING" IS NOT COMPLETED, and a prefix match would
  //    say it was. Both squash to something, and the somethings differ.
  eq('report PENDING is not report completed', isCompletedVisit('Solved - Report Pending'), false);
  eq('...so it does not count as the completed visit',
    decideVisit([V('a', 'Solved - Report Pending')], D, true).action, 'create');
  // ...while the spellings an export produces DO match.
  eq('SOLVED - REPORT COMPLETED matches', isCompletedVisit('SOLVED - REPORT COMPLETED'), true);
  eq('Solved-Report Completed matches', isCompletedVisit('Solved-Report Completed'), true);
  eq('plain Solved does not', isCompletedVisit('Solved'), false);

  // 5. A row with NO document cannot improve anything, and filing an empty
  //    visit for it would be inventing history.
  eq('a row with no document writes nothing',
    decideVisit([V('a', SOLVED_REPORT_COMPLETED)], D, false).action, 'skip');
  eq('...even where there is no visit to attach to',
    decideVisit([], D, false).action, 'skip');

  // 6. SEVERAL completed visits: one carrying a report anywhere means skip;
  //    otherwise the LATEST ENTRY is the one a reader sees (0032's ordering).
  eq('a report on ANY completed visit means skip',
    decideVisit([V('a', SOLVED_REPORT_COMPLETED), V('b', SOLVED_REPORT_COMPLETED, 'link')], D, true).action, 'skip');
  eq('otherwise the latest ENTRY is attached to',
    decideVisit([V('old', SOLVED_REPORT_COMPLETED, '', '2026-01-01'),
                 V('new', SOLVED_REPORT_COMPLETED, '', '2026-06-01')], D, true).uid, 'new');

  eq('the three outcomes are counted for the preview',
    summariseActions([{ action: 'skip', uid: '', why: '' }, { action: 'attach', uid: 'a', why: '' },
                      { action: 'create', uid: D, why: '' }, { action: 'skip', uid: '', why: '' }]),
    { skip: 2, attach: 1, create: 1, skipReasons: [{ text: '', n: 2 }] });

  // A SKIP IS NOT ONE REASON, AND THE FOOTER USED TO SAY IT WAS. It read
  // "N left alone because a report is already on the call's completed visit"
  // however the rows had been decided — so a file whose attachment column was
  // not being read at all reported that its reports were already in place. The
  // summary now carries the reasons it measured, commonest first.
  eq('the skip REASONS are counted, commonest first',
    summariseActions([
      { action: 'skip', uid: '', why: 'This row carries no document to attach.' },
      { action: 'skip', uid: 'x', why: 'A completed visit on this call already has a report.' },
      { action: 'skip', uid: '', why: 'This row carries no document to attach.' },
      { action: 'attach', uid: 'a', why: 'anything' },
    ]).skipReasons,
    [{ text: 'This row carries no document to attach.', n: 2 },
     { text: 'A completed visit on this call already has a report.', n: 1 }]);
  eq('an attach or a create contributes no reason',
    summariseActions([{ action: 'attach', uid: 'a', why: 'w' }, { action: 'create', uid: D, why: 'w' }]).skipReasons,
    []);
}

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);


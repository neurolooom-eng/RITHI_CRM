// Checks for src/lib/uploads.ts — the shaping behind the individual register
// uploads. No test runner in this repo, so: `npm run check:uploads`.
import { shapeUpload, UPLOADS, masterUpload, toDate, toTs, coerce, uploadGroups } from '../src/lib/uploads';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log(`  ✗ ${label}\n      got  ${g}\n      want ${w}`); fail++; }
  else console.log(`  ✓ ${label}`);
};
const def = (k: string) => UPLOADS.find((d) => d.key === k)!;

console.log('\n-- coercion --');
eq('day-first date', toDate('03/04/2026'), '2026-04-03');
eq('dd-Mon-yyyy', toDate('03-Apr-2026'), '2026-04-03');
eq('iso passes', toDate('2026-04-03'), '2026-04-03');
eq('junk date -> null', toDate('n/a'), null);
eq('timestamp day-first', (toTs('03/04/2026 14:30') ?? '').slice(0, 16).replace('T', ' ').slice(0, 10), '2026-04-03');
eq('number with commas', coerce('1,250', 'num'), 1250);
eq('blank number -> null', coerce('', 'num'), null);
eq('bool yes', coerce('Yes', 'bool'), true);
eq('bool unknown -> null', coerce('maybe', 'bool'), null);

console.log('\n-- the register stamps what the file cannot say --');
const pm = shapeUpload(def('pm_calls'), [{ 'UCN': '26A02P0001', 'Party Name': 'HOSP', 'Registration Date': '03/04/2026' }]);
eq('pm sheet is stamped PM', pm.rows[0].call_type, 'PM');
eq('...and cannot land as FIELD', shapeUpload(def('field_calls'), [{ 'UCN': 'X' }]).rows[0].call_type, 'FIELD');
eq('date read day-first', pm.rows[0].reg_date, '2026-04-03');

console.log('\n-- two master lists, same headers, different lists --');
const ct = masterUpload({ key: 'calltype', label: 'Call Type' });
const pr = masterUpload({ key: 'pendingreason', label: 'Call Pending Reason' });
const sheet = [{ 'Call Type Name': 'BREAKDOWN' }];
eq('call type sheet -> calltype', shapeUpload(ct, sheet).rows[0], { name: 'calltype', value: 'BREAKDOWN', extra: {} });
eq('generic "Value" header also works', shapeUpload(pr, [{ 'Value': 'AWAITING SPARE' }]).rows[0],
   { name: 'pendingreason', value: 'AWAITING SPARE', extra: {} });
eq('a list added later needs no code', masterUpload({ key: 'newlist', label: 'Brand New' }).stamp, { name: 'newlist' });

console.log('\n-- required columns hold a fragment back --');
const cons = shapeUpload(def('spare_consumption'), [
  { 'Part': 'TP-1|X', 'Qty': '2', 'UCN': '26A02F0001', 'Job Note': 'kept' },
  { 'Part': '', 'Qty': '1' },
  { 'Part': 'TP-2|Y', 'Qty': '' },
]);
eq('only the complete row loads', cons.rows.length, 1);
eq('skipped rows name the file row', cons.skipped, [{ row: 3, why: 'no part' }, { row: 4, why: 'no qty' }]);
eq('unrecognised column kept in data', cons.rows[0].data, { 'Job Note': 'kept' });

console.log('\n-- a mis-picked register is visible before writing --');
const wrong = shapeUpload(def('stock_transfers'), [{ 'UID': 'T1', 'From Engineer': 'A', 'To Engineer': 'B', 'Totally Unknown': 'x' }]);
eq('unmatched headers reported', wrong.unmatched, ['Totally Unknown']);

console.log('\n-- re-run corrects, never duplicates --');
const dup = shapeUpload(def('field_calls'), [
  { 'UCN': '26A02F0001', 'Party Name': 'FIRST' },
  { 'UCN': '26A02F0001', 'Party Name': 'SECOND' },
]);
eq('same key deduped inside the file', dup.rows.length, 1);
eq('last one wins', dup.rows[0].party_name, 'SECOND');

console.log('\n-- approvals are columns, not their own register --');
const lines = shapeUpload(def('spare_request_lines'), [
  { 'Line UID': 'L1', 'Request UID': 'OR1', 'Part': 'TP-1|X', 'Qty': '2', 'RM Approval': 'Approved', 'NSM Approval': 'Auto-Approved' },
]);
eq('rm + nsm land on the same row', [lines.rows[0].rm_approval, lines.rows[0].nsm_approval], ['Approved', 'Auto-Approved']);

console.log('\n-- a blank cell never clears a stamp --');
eq('blank call type does not unset the stamp',
   shapeUpload(def('installation_calls'), [{ 'UCN': 'X', 'call_type': '' }]).rows[0].call_type, 'INSTALLATION');

console.log('\n-- every register is coherent --');
UPLOADS.forEach((d) => {
  if (!d.cols.some((c) => c.required)) { console.log(`  ✗ ${d.key} has no required column`); fail++; }
  if (d.conflict && !d.conflict.split(',').every((k) => d.cols.some((c) => c.to === k) || Object.keys(d.stamp ?? {}).includes(k))) {
    console.log(`  ✗ ${d.key}: conflict key "${d.conflict}" is not a column it fills`); fail++;
  }
});
eq('registers defined', UPLOADS.length, 22);
eq('grouped in reading order', uploadGroups(UPLOADS).map((g) => g.title),
   ['Calls', 'Visit Reports', 'Spares', 'Quality', 'Masters', 'Cover']);

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);

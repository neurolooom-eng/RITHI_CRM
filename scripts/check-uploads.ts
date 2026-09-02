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

console.log('\n-- several aliases present at once: the FIRST wins, the rest are kept --');
const party = shapeUpload(def('parties'), [
  { 'Party Name': 'HOSP', 'Type': 'CUSTOMER', 'Profile': 'GOVERNMENT', 'Address': 'Main St', 'Billing Address': 'PO Box 9', 'COUNTRY': 'BD' },
]);
eq('Type beats Profile (alias order)', party.rows[0].party_type, 'CUSTOMER');
eq('Address beats Billing Address', party.rows[0].address, 'Main St');
eq('the losing aliases are kept, not dropped', party.rows[0].extra,
   { 'Profile': 'GOVERNMENT', 'Billing Address': 'PO Box 9', 'COUNTRY': 'BD' });

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

console.log('\n-- the real Field Call export headers --');
const fc = shapeUpload(def('field_calls'), [{
  'UCN': '26A02F0001', 'Call Number': 'CL2303042-VEGA-36',
  'Call Registeration Date': '02/01/2026', 'Product Serial Number': '36',
  'Warranty Start Date': '01/04/2023', 'Warranty End Date': '31/03/2024',
  'Contract Start Date': '01/04/2024', 'Contract End Date': '31/03/2025',
  'Call Type': 'PM VISIT', 'Call Allocated To': 'A KUMAR',
  'Public Health Threat?': 'NO', 'Death?': 'NO', 'Serious Incident?': 'NO',
  'Mode of Complaint Reporting': 'PHONE', 'Party Name': 'METRO', 'Product Name': 'VEGA',
}]);
eq('registration date (their spelling) is read', fc.rows[0].reg_date, '2026-01-02');
eq('product serial number is read', fc.rows[0].serial, '36');
eq('warranty + contract dates read', [fc.rows[0].warranty_start, fc.rows[0].contract_end], ['2023-04-01', '2025-03-31']);
eq('call allocated to is read', fc.rows[0].allocated_to, 'A KUMAR');
eq('a trailing ? is not a different column', [fc.rows[0].public_health_threat, fc.rows[0].death, fc.rows[0].serious_incident], ['NO', 'NO', 'NO']);
eq('mode of complaint reporting is read', fc.rows[0].mode_of_reporting, 'PHONE');
eq('Call Type is STAMPED, not unknown', [fc.rows[0].call_type, fc.stamped], ['FIELD', ['Call Type']]);
eq('nothing left unrecognised', fc.unmatched, []);

console.log('\n-- an exact header beats a punctuation-stripped one --');
// The Installation Call export carries BOTH `Warranty Start Date` (the date)
// and `Warranty Start Date?` (a label). Matching loosely in one pass bound the
// label, and every installation loaded with no warranty start date.
const inst = shapeUpload(def('installation_calls'), [{
  'UCN': '26A02I0001', 'Warranty Start Date': '24-December-2025',
  'Warranty Start Date?': 'Installation Call Solved Date',
  'Timestamp': '02-Jan-2026 12:54:54', 'Death?': 'NO',
}]);
eq('the real date column wins', inst.rows[0].warranty_start, '2025-12-24');
eq('the label column is kept aside', (inst.rows[0].extra as Record<string, unknown>)['Warranty Start Date?'], 'Installation Call Solved Date');
eq('a ?-suffixed column with no exact twin still matches', inst.rows[0].death, 'NO');
eq('Timestamp is the registration moment', [inst.rows[0].reg_date, String(inst.rows[0].reg_at).slice(0, 10)], ['2026-01-02', '2026-01-02']);
eq('...and an explicit registration date outranks it',
   shapeUpload(def('field_calls'), [{ 'UCN': 'X', 'Call Registeration Date': '05/03/2026', 'Timestamp': '02-Jan-2026 12:54:54' }]).rows[0].reg_date,
   '2026-03-05');

console.log('\n-- the real DCCR export headers --');
const dc = shapeUpload(def('call_reviews'), [{
  'UC Number': '26A02F0001', 'CALL NUMBER': 'CL1',
  'RISK TO PATIENT/ANY CLINICAL IMPACT': 'NO', 'WARRANTY FAILURE (1YR)': 'YES',
  'DATE OF REVIEW 2': '23-Jul-2026', 'DATE OF REVIEW 3': '10-Jan-2026',
  'COMPLAINT GROUPING': 'SCREEN : HANGING ISSUE', 'ROOT CAUSE KEY WORD': 'DAUGHTER BOARD',
  'SPARE / CONSUMABLE / CORRECTION / CALIBRATION': 'SPARE', 'Service Dept Observation': 'seen',
  'Review Status': 'Review Completed', 'ANY POTENTIAL EFFECT': 'NO',
}]);
eq('UC Number is the ucn', dc.rows[0].ucn, '26A02F0001');
eq('a bracketed suffix is not a different column', dc.rows[0].warranty_failure, 'YES');
eq('a slashed name is not a different column', dc.rows[0].risk_to_patient, 'NO');
eq('dd-Mon-yyyy review dates', [dc.rows[0].review2_at, dc.rows[0].review3_at], ['2026-07-23', '2026-01-10']);
eq('the two DCCR master fields land', [dc.rows[0].complaint_grouping, dc.rows[0].root_cause_keyword],
   ['SCREEN : HANGING ISSUE', 'DAUGHTER BOARD']);
eq('spare category from its long header', dc.rows[0].spare_category, 'SPARE');
eq('DERIVED columns are not loaded', [dc.rows[0].review_status, dc.rows[0].any_potential_effect], [undefined, undefined]);

console.log('\n-- every register is coherent --');
UPLOADS.forEach((d) => {
  // A register with its own shaper declares no columns — it owns the job.
  if (!d.shape && !d.cols.some((c) => c.required)) { console.log(`  ✗ ${d.key} has no required column`); fail++; }
  const keys = d.conflictFrom ?? d.conflict?.split(',') ?? [];
  if (!d.shape && d.conflict && !keys.every((k) => d.cols.some((c) => c.to === k) || Object.keys(d.stamp ?? {}).includes(k))) {
    console.log(`  ✗ ${d.key}: conflict key "${d.conflict}" is not derived from anything it fills`); fail++;
  }
});
eq('registers defined', UPLOADS.length, 26);

console.log('\n-- historical consumption --');
const hist = shapeUpload(def('spare_consumption_history'), [
  { 'Engineer': 'A Kumar', 'Part': 'WM-1|Valve', 'Qty': '2', 'Source': 'AppSheet 2023', 'Row ID': 'R7', 'Date': '15/03/2023', 'Job Note': 'kept' },
  { 'Engineer': 'A Kumar', 'Part': 'WM-1|Valve', 'Qty': '1' },
]);
// `ref` is required too now: without it a re-run cannot match the row.
eq('the sourced row loads, the unsourced is held back', [hist.rows.length, hist.skipped[0].why], [1, 'no source, ref']);
eq('ref carried for re-run matching', hist.rows[0].ref, 'R7');
eq('unknown columns kept', hist.rows[0].data, { 'Job Note': 'kept' });
eq('upserts on source + ref', def('spare_consumption_history').conflictFrom, ['source', 'ref']);

console.log('\n-- opening stock pools --');
const hso = shapeUpload(def('handstock_opening'), [
  { 'Engineer': 'A Kumar', 'Part': 'WM-1|Valve', 'Stock Level': '5', 'Source': 'WinMax HS', 'As On': '01/06/2022' },
  { 'Engineer': 'A Kumar', 'Part': 'WM-1|Valve', 'Stock Level': '3', 'Source': '22 H2' },
  { 'Engineer': 'A Kumar', 'Part': 'WM-1|Valve', 'Stock Level': '2' },
]);
eq('two labelled pools load, the unlabelled one is held back', hso.rows.length, 2);
eq('the unlabelled row says why', hso.skipped[0].why, 'no source');
eq('pools stay distinct (not deduped together)', hso.rows.map((r) => r.source), ['WinMax HS', '22 H2']);
eq('as-of read day-first', hso.rows[0].as_of, '2022-06-01');

console.log('\n-- ownership transfer --');
const ot = shapeUpload(def('ownership_transfers'), [{ 'Serial Number': 'SN-1', 'To Party': 'HOSP TWO', 'Transfer Date': '01/06/2024' }]);
eq('from party may be blank (filled in by the database)', ot.rows[0].from_party, undefined);
eq('transfer date day-first', ot.rows[0].transfer_date, '2024-06-01');
eq('a row with no destination is held back',
   shapeUpload(def('ownership_transfers'), [{ 'Serial Number': 'SN-1' }]).skipped[0].why, 'no to party');

console.log('\n-- recovered warranty --');
const ae = shapeUpload(def('product_additional_entries'), [
  { 'Serial No': 'SN-2', 'Warranty Start': '01-Apr-2019', 'Warranty End': '31-Mar-2021', 'Source': "Customer's invoice" },
]);
eq('dd-Mon-yyyy read', [ae.rows[0].warranty_start, ae.rows[0].warranty_end], ['2019-04-01', '2021-03-31']);
eq('provenance kept', ae.rows[0].source_note, "Customer's invoice");
// On the STORED serial_key, not the raw column: `on conflict` cannot infer the
// expression index the first version relied on (0077).
eq('upserts on the machine', def('product_additional_entries').conflict, 'serial_key');
eq('...derived from the column the file supplies', def('product_additional_entries').conflictFrom, ['serial_number']);
eq('grouped in reading order', uploadGroups(UPLOADS).map((g) => g.title),
   ['Calls', 'Visit Reports', 'Spares', 'Quality', 'Masters', 'Cover']);

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);

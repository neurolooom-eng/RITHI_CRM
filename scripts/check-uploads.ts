// Checks for src/lib/uploads.ts — the shaping behind the individual register
// uploads. No test runner in this repo, so: `npm run check:uploads`.
import { shapeUpload, UPLOADS, masterUpload, toDate, toTs, coerce, uploadGroups } from '../src/lib/uploads';
import { parseDateParts, toIsoDate, toIsoTimestamp, parseAnyDate } from '../src/lib/dates';
import { findHeaderFor, strict, loose, squash } from '../src/lib/headers';
import { toDate as coverDate, toTimestamp as coverTs } from '../src/lib/coverImport';
import { toTimestamp as mappingTs, pick } from '../src/lib/reportMapping';
import { machineKey } from '../src/lib/machine';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log(`  ✗ ${label}\n      got  ${g}\n      want ${w}`); fail++; }
  else console.log(`  ✓ ${label}`);
};
const def = (k: string) => UPLOADS.find((d) => d.key === k)!;

console.log('\n-- ONE date parser, read the same way by every importer --');
for (const [label, v] of [['ISO', '2026-09-03'], ['dd-Month-yyyy', '03-September-2026'], ['dd Mon yyyy', '03 Sep 2026'],
                          ['dd mm yyyy (spaces)', '03 09 2026'], ['dd/mm/yyyy', '03/09/2026'], ['dd.mm.yyyy', '03.09.2026']] as const) {
  eq(`${label} -> 2026-09-03 everywhere`,
     [toIsoDate(v), toDate(v), coverDate(v), mappingTs(v).slice(0, 10)],
     ['2026-09-03', '2026-09-03', '2026-09-03', '2026-09-03']);
}
eq('day-first, not US: 03/04 is 3 April', toIsoDate('03/04/2026'), '2026-04-03');
eq('13/04 is 13 April (day-first), not swapped', toIsoDate('13/04/2026'), '2026-04-13');
eq('04/13 (US order) is refused, never re-read as 13 April', toIsoDate('04/13/2026'), null);
eq('the time of day is carried', parseDateParts('03-Sep-2026 14:30:15')?.hh, 14);
eq('...and its absence is known', parseDateParts('03-Sep-2026')?.hasTime, false);
eq('junk is null, never a guess', [toIsoDate('n/a'), toIsoDate(''), toIsoDate('#REF!')], [null, null, null]);

// One consumption export writes "02 Jul 26". Refusing it was not neutral: the
// visit date was dropped and all 8,356 rows silently took today's date.
eq('a TWO-digit year with a month name reads', [toIsoDate('02 Jul 26'), toIsoDate('02-Jul-26')], ['2026-07-02', '2026-07-02']);
eq('the usual pivot: 69-99 is last century', toIsoDate('02 Jul 99'), '1999-07-02');
// All-numeric with two digits is ambiguous (03/04/26 could be d/m/y or y/m/d)
// and there is nothing in it to say which, so it is refused, not guessed.
eq('all-numeric two-digit years are REFUSED, not guessed', toIsoDate('03/04/26'), null);

console.log('\n-- wall-clock times are LOCAL in every importer (settled 2026-09-03) --');
const wall = '02-Jan-2026 12:54:54';
const local = toIsoTimestamp(wall, 'local');
eq('cover import now reads local like the rest', coverTs(wall), local);
eq('uploads and report mapping read local', [toTs(wall), mappingTs(wall)], [local, local]);
eq('a local reading is the instant the export meant',
   new Date(local!).getHours() + ':' + new Date(local!).getMinutes(), '12:54');

console.log('\n-- display reads day-first too (settled 2026-09-03) --');
eq('03/04/2026 on a report shows 3 April, not 4 March', parseAnyDate('03/04/2026')?.getMonth(), 3);
eq('ISO still reads as ISO', parseAnyDate('2026-04-03')?.getMonth(), 3);
eq('a full timestamp still reads as itself', parseAnyDate('2026-04-03T10:20:30Z')?.toISOString(), '2026-04-03T10:20:30.000Z');
eq('dd-Mon-yyyy hh:mm:ss displays with its time', parseAnyDate('03-Sep-2026 14:30:00')?.getHours(), 14);

console.log('\n-- ONE header matcher, shared --');
eq('strict then loose then squash', findHeaderFor(['Warranty Start Date?', 'Warranty Start Date'], ['warranty start date']), 'Warranty Start Date');
eq('E-Mail ID is Email ID', findHeaderFor(['E-Mail ID'], ['email id']), 'E-Mail ID');
eq('report mapping uses it too', pick({ 'UC Number': '26A02F0001' }, 'ucn'), '26A02F0001');
eq('...including loosened headings', pick({ 'Visit Date & Time': '08 06 2026' }, 'visit_at'), '08 06 2026');
eq('strict/loose/squash agree on a plain name', [strict('Call Number'), loose('Call Number'), squash('Call Number')], ['call number', 'call number', 'callnumber']);
eq('machine identity uses the same squash', machineKey('ORION-G', ' 201 '), 'oriong|201');

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
// The reason names the HEADER the file should carry, not the database column —
// that is what the operator has to go and look for.
eq('skipped rows name the file row', cons.skipped, [{ row: 3, why: 'no spares used' }, { row: 4, why: 'no consumed qty' }]);
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

console.log('\n-- the (F) columns are the maintained ones and win --');
const pmF = shapeUpload(def('pm_calls'), [{
  'UC Number': '24I01P0053', 'Call Allocated To': 'SHAHABAS', 'Call Allocated To (F)': 'ANUGRAH',
  'Standard Complaint': 'PM', 'Standard Complaint (F)': 'SCHEDULED PM VISIT',
}]);
eq('the (F) engineer wins over the stale one', pmF.rows[0].allocated_to, 'ANUGRAH');
eq('...and the (F) complaint too', pmF.rows[0].standard_complaint, 'SCHEDULED PM VISIT');
eq('the stale column is kept aside', (pmF.rows[0].extra as Record<string, unknown>)['Call Allocated To'], 'SHAHABAS');

console.log('\n-- the real Field Report export headers --');
const fr = shapeUpload(def('field_reports'), [{
  'UID': 'M_3698', 'UC Number': '26F15F0034', 'Call Number': 'R17697-MONNAL T75-10261',
  'Visit Date & Time': '08 06 2026', 'Visit Entry Date': '03-September-2026 01:45:36',
  'Visiting Service Engineer': 'A Kumar', 'Email-ID': 'a@x.com',
  'Call Status': 'Solved - Report Completed', 'CALL PENDING REASON': 'AWAITING SPARE',
  'Job Done': 'replaced sensor',
}]);
eq('space-separated dd mm yyyy is the visit', String(fr.rows[0].visit_at).slice(0, 10), '2026-06-08');
eq('dd-Month-yyyy hh:mm:ss is the ENTRY', String(fr.rows[0].updated_at).slice(0, 10), '2026-09-03');
eq('the visiting engineer is the engineer', fr.rows[0].engineer, 'A Kumar');
eq('Email-ID is the engineer email', fr.rows[0].engineer_email, 'a@x.com');
eq('call pending reason read', fr.rows[0].pending_reason, 'AWAITING SPARE');
eq('what the engineer wrote is kept', fr.rows[0].data, { 'Job Done': 'replaced sensor' });

console.log('\n-- a call register carries its latest visit, with no row id --');
const pmr = shapeUpload(def('pm_reports'), [
  { 'UC Number': '24I01P0053', 'Visit Date & Time': '02-April-2026',
    'Visiting Service Engineer': 'VICTORY MEDICAL SYSTEMS', 'Call Status': 'Solved - Report Completed',
    'Job Done': 'CHECKED THE UNIT FULLY', 'Service Report': '42v4ReportingP_Images/v2_N1.jpg' },
  { 'UC Number': '24I01P0099', 'Call Status': 'Unsolved' },   // no visit yet
]);
eq('a key is derived from the call and the visit', pmr.rows[0].uid, 'IMP-24I01P0053-20260402000000');
eq('the same file twice derives the SAME key', shapeUpload(def('pm_reports'), [
  { 'UC Number': '24I01P0053', 'Visit Date & Time': '02-April-2026' }]).rows[0].uid, 'IMP-24I01P0053-20260402000000');
eq('a call with NO visit is not made to look attended', [pmr.rows.length, pmr.skipped[0].why], [1, 'no visit date & time']);
eq('the attachment is kept', pmr.rows[0].manual_report, '42v4ReportingP_Images/v2_N1.jpg');
eq('what the engineer wrote is kept', pmr.rows[0].data, { 'Job Done': 'CHECKED THE UNIT FULLY' });

console.log('\n-- consumption, with GRIR / traceability --');
const cons2 = shapeUpload(def('spare_consumption'), [
  { 'UID': 'v2_N1-e2fdf5c5', 'UC Number': '26C23F0028', 'Call Number': 'R16813-EXTEND-XT',
    'Spares Used': 'MP-010|OXYGEN SENSOR', 'QTY': '1.00', 'Consumed Qty': '2',
    'GRIR / Traceability': 'GR-2026-118', 'Visiting Service Engineer': 'FRANKLIN',
    'Visit Date & Time': '02-July-2026', 'Part Code': '#VALUE!' },
  { 'Part Code': '#VALUE!', 'PM DCCR': '2', 'Duplicate?': 'No' },   // a filler row
]);
eq('the real row loads, the filler row does not', cons2.rows.length, 1);
eq('traceability is carried', cons2.rows[0].grir, 'GR-2026-118');
eq('Consumed Qty is the authoritative quantity', cons2.rows[0].qty, 2);
eq('the export row id becomes the key', cons2.rows[0].source_ref, 'v2_N1-e2fdf5c5');
// On the NULLABLE source_ref_key, not the raw column: NULLs are distinct in a
// unique index, so app-entered lines (which have no source ref) coexist while
// imported lines stay unique — and the index is full, so it can be inferred.
eq('...so a re-run corrects rather than duplicates', def('spare_consumption').conflict, 'source_ref_key');

console.log('\n-- the real ITEM Master (Part Master) --');
const pm2 = shapeUpload(def('parts'), [
  { 'Item Code': 'ACC-0081', 'Item Name': 'REUSABLE PATIENT TUBING',
    'Item Details': 'ACC-0081|REUSABLE PATIENT TUBING', 'Active/Inactive?': 'Inactive',
    'Added On': '09-May-2023 15:13:28', 'Purchase Cost': '15' },
  { 'Item Code': 'EM-600', 'Item Name': 'BUZZER MH1-OR', 'Active/Inactive?': 'Active' },
]);
eq('Item Code is the code', pm2.rows[0].code, 'ACC-0081');
eq('"Inactive" means not active', pm2.rows[0].active, false);
eq('"Active" means active', pm2.rows[1].active, true);
eq('a file with no Item Details builds one', pm2.rows[1].item_detail, 'EM-600|BUZZER MH1-OR');
eq('the cost and the rest are kept', (pm2.rows[0].extra as Record<string, unknown>)['Purchase Cost'], '15');
// On CODE|Description, not the code: the real register uses YR134500 for two
// different parts (LOUDSPEAKER V2-MT50 and SPEAKER V2-MT75), so the code would
// have merged them — and a unique index on it would have refused the load.
eq('matched on CODE|Description', def('parts').conflictFrom, ['item_detail']);
eq('two parts sharing a code both survive',
   shapeUpload(def('parts'), [
     { 'Item Code': 'YR134500', 'Item Name': 'LOUDSPEAKER V2-MT50', 'Item Details': 'YR134500|LOUDSPEAKER V2-MT50' },
     { 'Item Code': 'YR134500', 'Item Name': 'SPEAKER V2-MT75', 'Item Details': 'YR134500|SPEAKER V2-MT75' },
   ]).rows.length, 2);

console.log('\n-- a machine is model + serial, not serial alone --');
const prod = shapeUpload(def('products'), [
  { 'Item Name': 'VEGA', 'Item Serial Number': '219', 'Party Name': 'A' },
  { 'Item Name': 'ORION-G', 'Item Serial Number': '219', 'Party Name': 'B' },
  { 'Item Name': 'VEGA', 'Item Serial Number': '219', 'Party Name': 'C' },
]);
eq('the same serial on two models is two machines', prod.rows.length, 2);
eq('the same model+serial twice is one', prod.rows.filter((x) => x.item_name === 'VEGA').length, 1);
eq('...and the last one wins', prod.rows.find((x) => x.item_name === 'VEGA')?.party_name, 'C');

console.log('\n-- the spare request register: two files, joined by the OR number --');
const sr = shapeUpload(def('spare_requests'), [
  { 'UID': 'S1-30793a25', 'OR NO': 'OR43016', 'Req Type': 'Call Based', 'ENGINEER NAME': 'MEGHANATH',
    'UC Number': '26A02F0001', 'Product Serial Number': '0752', 'Spare (1)': 'MP-010|SENSOR', 'Qty (1)': '1' },
]);
// The OR number is the conflict target, and `uid` is deliberately absent: rows
// loaded earlier carry the sheet's row id there, and writing over it collided
// with the or_no unique index and stopped the file at row 1. 0085 fills it in.
eq('the request is keyed on the OR number', [sr.rows[0].or_no, def('spare_requests').conflict], ['OR43016', 'or_no']);
eq('...and no uid is sent, so the database keeps the one it has', sr.rows[0].uid, undefined);
eq('...and the sheet row id is kept, not lost', (sr.rows[0].extra as Record<string, unknown>)['UID'], 'S1-30793a25');
eq('the wide Spare (n) columns ride along', (sr.rows[0].extra as Record<string, unknown>)['Spare (1)'], 'MP-010|SENSOR');

const srl = shapeUpload(def('spare_request_lines'), [
  { 'Spare Request No|Part Number': 'OR42608|MWP-026', 'OR NO': 'OR42608', 'Spare': 'MWP-026|COMPRESSOR',
    'Requested Qty': '1', 'Qty': '9', 'RMApproval': 'Approved', 'RMApproval Date': '03-December-2025',
    'ADMIN Approval': 'Cleared for Stores Processing', 'ADMIN Approval Date': '04-December-2025',
    'NSM Approval': 'Cleared for Stores Processing', 'Stores Status': 'Dispatched',
    'SO NO': 'SO17517', 'SO Date': '08-January-2026', 'Dispatched Qty': '1', 'POD': 'not available' },
]);
eq('the line points at its request by OR number', [srl.rows[0].line_uid, srl.rows[0].request_uid], ['OR42608|MWP-026', 'OR42608']);
// The parents are made BEFORE the write, in statements of their own. A trigger's
// insert is invisible to the command inserting the line, so the row-level check
// refused row 1 and with it the whole file.
eq('...and the register prepares those parents itself', def('spare_request_lines').prepare, 'spare-line-parents');
eq('"ADMIN Approval" is the COMMERCIAL stage the flow reads', srl.rows[0].commercial_approval, 'Cleared for Stores Processing');
eq('...with its date', String(srl.rows[0].commercial_at).slice(0, 10), '2025-12-04');
eq('Requested Qty wins over the raw Qty column', srl.rows[0].qty, 1);
eq('the stock-out number and date land', [srl.rows[0].stock_out_no, String(srl.rows[0].dispatched_at).slice(0, 10)], ['SO17517', '2026-01-08']);
eq('the rest is kept', (srl.rows[0].extra as Record<string, unknown>)['POD'], 'not available');

console.log('\n-- a return of nothing is not a return --');
const mr = shapeUpload(def('material_returns'), [
  { 'Item Details': 'KY632200|SENSOR', 'Good Qty': '1', 'Defective Qty': '0' },
  { 'Item Details': 'KY632200|SENSOR', 'Good Qty': '0', 'Defective Qty': '0' },
]);
eq('the real return loads', mr.rows.length, 1);
eq('the empty one is held back by name', mr.skipped[0].why, 'nothing returned — good and defective are both zero');

console.log('\n-- a transfer to the same engineer is not a transfer --');
const st = shapeUpload(def('stock_transfers'), [
  { 'Stock Transfer Number': 'ST387', 'From': 'PRATIK', 'To': 'SAIKIRAN' },
  { 'Stock Transfer Number': 'ST999', 'From': 'eBizWiz Admin', 'To': 'eBizWiz Admin' },
]);
eq('the real transfer loads', st.rows.length, 1);
eq('the self-transfer is held back by name', st.skipped[0].why, 'from and to are the same engineer (eBizWiz Admin)');

console.log('\n-- ownership transfer: FROM and TO must not be confused --');
const ot2 = shapeUpload(def('ownership_transfers'), [{
  'Item Serial Number': '2354', 'Party Name (FROM)': 'HOSP ONE', 'Party Name (TO)': 'HOSP TWO',
  'OT Number': 'OT-118', 'Product Details': 'ORION-G', 'File Upload': 'https://drive/x',
  'SA Number': 'SA9765', 'ENGINEER': 'A Kumar',
}]);
eq('the TO party is the destination', ot2.rows[0].to_party, 'HOSP TWO');
eq('the FROM party is the origin', ot2.rows[0].from_party, 'HOSP ONE');
eq('serial and machine read', [ot2.rows[0].serial_number, ot2.rows[0].item_name], ['2354', 'ORION-G']);
eq('the OT number is the reference', ot2.rows[0].reference_no, 'OT-118');
eq('the upload is the document', ot2.rows[0].document_url, 'https://drive/x');
eq('the rest is kept, not dropped', ot2.rows[0].extra, { 'SA Number': 'SA9765', 'ENGINEER': 'A Kumar' });
eq('a row with no destination is held back',
   shapeUpload(def('ownership_transfers'), [{ 'Item Serial Number': 'X' }]).skipped[0].why, 'no party name (to)');

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
eq('registers defined', UPLOADS.length, 27);

console.log('\n-- call registration requests --');
const cr = shapeUpload(def('call_requests'), [
  { 'ID': 'R15818', 'UNIQUE ID': 'R15818-ORION-G-1099', 'Timestamp': '02-Jan-2026 12:54:54', 'PARTY NAME': 'METRO',
    'Product Serial Number': '2354', 'UC Number': '26A02F0001', 'Reported Problem': 'no power',
    'Something Else': 'kept' },
  { 'PARTY NAME': 'NO KEY' },
]);
eq('the request id is taken from the file', cr.rows[0].reqid, 'R15818');
eq('the keyed row loads, the unkeyed is held back', [cr.rows.length, cr.skipped[0].why], [1, 'no id']);
// unique_key is rebuilt by the database from reqid + product + serial, so
// sending the file's copy would be a lie about what decides the match.
eq('unique_key is not sent — the database builds it', def('call_requests').cols.some((c) => c.to === 'unique_key'), false);
eq('a registered request keeps its UCN', cr.rows[0].ucn, '26A02F0001');
eq('serial and party read', [cr.rows[0].serial_no, cr.rows[0].party_name], ['2354', 'METRO']);
// The file's own UNIQUE ID rides along as provenance — the database rebuilds
// the real one, but what the source called this row is worth keeping.
eq('unknown columns are kept', cr.rows[0].extra,
   { 'UNIQUE ID': 'R15818-ORION-G-1099', 'Something Else': 'kept' });

// The real export keeps cancellations in the UCN column.
const crc = shapeUpload(def('call_requests'), [
  { 'ID': 'R1', 'UCN number': '26A02F0001' },
  { 'ID': 'R2', 'UCN number': 'Request cancel' },
]);
eq('a UCN-shaped value is the UCN', crc.rows[0].ucn, '26A02F0001');
eq('...and a request with a UCN previews as Registered', crc.rows[0].status, 'Registered');
eq('one without a UCN is left for the app to show as Pending', crc.rows[1].status, undefined);
eq('a status the file DOES carry is kept',
   shapeUpload(def('call_requests'), [{ 'ID': 'R3', 'UCN number': '26A02F0003', 'Status': 'Mapped' }]).rows[0].status, 'Mapped');
eq('"Request cancel" is NOT filed as a UCN', crc.rows[1].ucn, undefined);
eq('...but it is kept, not lost', (crc.rows[1].extra as Record<string, unknown>)['UCN number'], 'Request cancel');
eq('E-Mail ID matches Email ID', shapeUpload(def('call_requests'), [{ 'ID': 'R1', 'E-Mail ID': 'a@x.com' }]).rows[0].email, 'a@x.com');
eq('the export\u2019s ID column is the request id', shapeUpload(def('call_requests'), [{ 'ID': 'R15847' }]).rows[0].reqid, 'R15847');

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
// The reason names the header the file should carry.
eq('a row with no destination is held back',
   shapeUpload(def('ownership_transfers'), [{ 'Serial Number': 'SN-1' }]).skipped[0].why, 'no party name (to)');

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

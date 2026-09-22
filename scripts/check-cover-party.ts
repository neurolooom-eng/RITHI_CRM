// ===========================================================================
// THE PARTY FILLS THE SALE IN — and what it does with a blank is the whole
// question.
//
//   The user, 2026-09-22: "In Warranty Sale - Party Name should be a drop-down
//   from Party Master... All relevant fields like city, state, address should
//   fill in Automatically based on the selected Party."
//
// The mapping is not one-to-one — `phone` is `tel1`, `gstin` is `gst`,
// `service_engineer` is `engineer` — and the dangerous case is not a wrong
// name, it is a MISSING value: keeping the previous party's address where the
// new one has none produces a sale carrying a different customer's address,
// with nothing on screen saying so. That is the assertion this file exists for.
// ===========================================================================
import { partyFillForSale, SALE_PARTY_FIELDS, pairProductCodeAndName,
         summarisePinned, inheritAllPatch, isPinnedValue,
         installCallFromSale, machinesNeedingInstallCall, INSTALL_COMPLAINT,
         partyFillChanges, deriveHeader, suggestedPmVisits } from '../src/lib/coverspec';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log(`  ✗ ${label}\n      got  ${g}\n      want ${w}`); fail++; }
  else console.log(`  ✓ ${label} = ${g}`);
};

const FULL = {
  state: 'KERALA', city: 'KOTTAYAM', address: '  Medical College Road  ',
  pincode: '686008', phone: '0481-2597000', phone_2: '9447000000',
  pan: 'AAACT1234D', gstin: '32AAACT1234D1ZQ',
  party_type: 'customer', profile: 'Government', service_engineer: 'MEGHANATH',
};

console.log('\n-- the party fills the sale --');
{
  const f = partyFillForSale(FULL);
  eq('state', f.state, 'KERALA');
  eq('city', f.city, 'KOTTAYAM');
  eq('the address is trimmed', f.address, 'Medical College Road');
  eq('pincode', f.pincode, '686008');
  // THE NAMES DIFFER ON THE TWO SIDES, which is the reason this is a function.
  eq('phone becomes tel1', f.tel1, '0481-2597000');
  eq('phone_2 becomes tel2', f.tel2, '9447000000');
  eq('gstin becomes gst', f.gst, '32AAACT1234D1ZQ');
  eq('service_engineer becomes engineer', f.engineer, 'MEGHANATH');
  eq('pan keeps its name', f.pan, 'AAACT1234D');
  // The two pick-lists have a fixed vocabulary and the master is free-typed.
  eq('party_type is upper-cased to match the list', f.party_type, 'CUSTOMER');
  eq('profile likewise', f.profile, 'GOVERNMENT');
}

console.log('\n-- a value the form cannot offer is dropped, not forced in --');
{
  // A box holding a value its own list cannot re-select reads as a form that
  // has lost the value.
  eq('an unknown party type', partyFillForSale({ ...FULL, party_type: 'HOSPITAL' }).party_type, '');
  eq('an unknown profile', partyFillForSale({ ...FULL, profile: 'TRUST' }).profile, '');
  eq('...and a known one still gets through',
    partyFillForSale({ ...FULL, party_type: ' Dealer ' }).party_type, 'DEALER');
}

console.log('\n-- THE ONE THAT MATTERS: a blank clears, it does not inherit --');
{
  // Changing from a party with an address to one without must not leave the
  // first party's address on the sale.
  const f = partyFillForSale({ state: 'TAMIL NADU', city: 'CHENNAI' });
  eq('every field is present even when the party has none',
    Object.keys(f).sort().join(','), SALE_PARTY_FIELDS.slice().sort().join(','));
  eq('the address is blank rather than absent', f.address, '');
  eq('so is the pincode', f.pincode, '');
  eq('and the tax numbers', [f.pan, f.gst], ['', '']);
  eq('what the party DOES have still arrives', [f.state, f.city], ['TAMIL NADU', 'CHENNAI']);
}

console.log('\n-- nothing in, nothing claimed --');
{
  const f = partyFillForSale(null);
  eq('a party the master has not got fills every field blank',
    Object.values(f).every((v) => v === ''), true);
  eq('...and still names every field it owns', Object.keys(f).length, SALE_PARTY_FIELDS.length);
  eq('eleven fields follow the party', SALE_PARTY_FIELDS.length, 11);
}

console.log('\n-- the product code and the name are one choice --');
{
  // The catalogue's real shape: one name with one code, and a name that nine
  // codes share.
  const lines = [
    { code: 'MT75', name: 'MONNAL T75', active: true },
    { code: 'MT60', name: 'MONNAL T60', active: true },
    { code: 'CPX1', name: 'CPX CARE', active: true },
    { code: 'CPX2', name: 'CPX CARE', active: true },
    { code: 'OLD1', name: 'MONNAL T50', active: false },
  ];
  eq('choosing a name fills its code where there is one',
    pairProductCodeAndName('product_name', 'MONNAL T75', lines), { product_code: 'MT75' });
  eq('...case and spacing do not matter',
    pairProductCodeAndName('product_name', '  monnal t60 ', lines), { product_code: 'MT60' });
  eq('choosing a code fills its name',
    pairProductCodeAndName('product_code', 'CPX2', lines), { product_name: 'CPX CARE' });

  // THE ONE THAT MATTERS: a guessed code on a machine record gets believed.
  eq('a name several codes share fills NOTHING',
    pairProductCodeAndName('product_name', 'CPX CARE', lines), {});
  eq('a name the catalogue has not got fills nothing',
    pairProductCodeAndName('product_name', 'SOMETHING ELSE', lines), {});
  eq('a RETIRED line is not offered as an answer either',
    pairProductCodeAndName('product_name', 'MONNAL T50', lines), {});
  eq('nothing typed, nothing filled',
    pairProductCodeAndName('product_name', '   ', lines), {});
  // It never clears the other field: an unrecognised name is one the catalogue
  // has not got, not a reason to throw away a code somebody typed.
  eq('and it never returns a blank to overwrite with',
    Object.values(pairProductCodeAndName('product_name', 'SOMETHING ELSE', lines)).length, 0);
}

console.log('\n-- what Force Update Child Records is about to clear --');
{
  // A pinned field holds a value of its own. null, undefined and '' all mean
  // "follow the entry" -- and '' is the one that matters, because the form
  // writes it when somebody clears a box.
  eq('a value is pinned', isPinnedValue('CHENNAI'), true);
  eq('null is not', isPinnedValue(null), false);
  eq('undefined is not', isPinnedValue(undefined), false);
  eq('an empty string is not', isPinnedValue(''), false);
  eq('zero IS a value', isPinnedValue(0), true);

  const fields = [
    { name: 'warranty_start', label: 'Warranty Start Date', inherits: true },
    { name: 'city', label: 'City', inherits: true },
    { name: 'serial_number', label: 'Serial Number' },        // the machine's own
  ];
  const header = { warranty_start: '2026-01-01', city: 'CHENNAI' };
  const items = [
    { serial_number: 'A1', warranty_start: '2026-01-01', city: null },   // repeats the entry
    { serial_number: 'A2', warranty_start: '2026-03-15', city: 'PUNE' }, // both differ
    { serial_number: 'A3', warranty_start: null, city: '' },             // follows already
  ];
  const p = summarisePinned(fields, items, header);

  eq('machines carrying at least one pinned value', p.machines, 2);
  eq('every pinned value, differing or not', p.total, 3);
  // THE NUMBER THAT MATTERS. Clearing a value identical to the entry changes
  // nothing anybody can see; clearing one that differs destroys a decision
  // somebody made about ONE machine, with no undo.
  eq('...of which these DIFFER from the entry', p.differing, 2);
  eq('the fields are named, commonest first',
    p.fields.map((f) => `${f.label}:${f.machines}/${f.differing}`),
    ['Warranty Start Date:2/1', 'City:1/1']);

  // A FIELD THE REGISTER DOES NOT DECLARE AS INHERITING IS NOT TOUCHED. The
  // serial is the machine's identity, not the entry's, and clearing it would
  // delete the machine.
  eq('a non-inheriting field is never counted',
    p.fields.some((f) => f.name === 'serial_number'), false);

  // ...and the write agrees with the count about which fields those are.
  eq('the patch clears exactly the inheriting fields',
    Object.keys(inheritAllPatch(fields)).sort(), ['city', 'warranty_start']);
  eq('...and clears them to null, not to an empty string',
    Object.values(inheritAllPatch(fields)).every((v) => v === null), true);

  eq('nothing pinned, nothing to offer', summarisePinned(fields, [
    { serial_number: 'B1', warranty_start: null, city: null },
  ], header), { fields: [], machines: 0, differing: 0, total: 0 });
  eq('no machines at all', summarisePinned(fields, [], header).total, 0);
}

console.log('\n-- the installation call a sale entry raises --');
{
  const header = {
    party_name: 'MAXWELL SUPER MULTISPECIALITY HOSPITAL', city: 'VARANASI', state: 'UTTAR PRADESH',
    sa_number: 'SA9891', warranty_start: '2026-04-20', warranty_end: '2028-04-19', warranty_months: 24,
  };
  const item = { product_name: 'MONNAL T75', serial_number: '11389' };
  const call = installCallFromSale(header, item);

  eq('it is an installation call', call.callType, 'INSTALLATION');
  eq('the party comes from the entry', call.partyName, 'MAXWELL SUPER MULTISPECIALITY HOSPITAL');
  eq('...with its city and state', [call.city, call.state], ['VARANASI', 'UTTAR PRADESH']);
  // A machine is its MODEL and its SERIAL, both off the sale line.
  eq('the machine comes from the sale line', [call.productName, call.serial], ['MONNAL T75', '11389']);
  eq('both complaint columns read Installation Calls',
    [call.standardComplaint, call.complaintReported], [INSTALL_COMPLAINT, INSTALL_COMPLAINT]);

  // THE THREE VIGILANCE QUESTIONS. Answered No on instruction, and they are
  // the honest answer for a machine that has not been switched on yet.
  eq('every vigilance question is answered No',
    [call.publicHealthThreat, call.death, call.seriousIncident], ['NO', 'NO', 'NO']);

  // NOBODY REPORTED THIS, so nobody is recorded as having reported it. Filling
  // these from the sale would put a name against a report that never happened.
  eq('the customer contact is left blank',
    [call.personCalling, call.customerName, call.customerNumber, call.customerDesignation, call.emailAddress],
    ['', '', '', '', '']);

  // A call raised with no cover reads as OGP and feeds every count that asks
  // who is paying.
  eq('the cover comes from the sale', [call.warrantyNumber, call.itemStatus], ['SA9891', 'WGP']);
  eq('...with its dates', [call.warrantyStart, call.warrantyEnd], ['2026-04-20', '2028-04-19']);
  eq('a machine that pinned its own warranty keeps it',
    installCallFromSale(header, { ...item, warranty_start: '2026-06-01', warranty_end: '2028-05-31' }).warrantyStart,
    '2026-06-01');

  // AN UNKNOWN COVER GETS ASKED ABOUT; A WRONG ONE GETS BELIEVED.
  const noWarranty = installCallFromSale(
    { party_name: 'X', warranty_months: null, warranty_end: null }, item);
  eq('a sale recording no warranty leaves the cover blank rather than guessing',
    [noWarranty.itemStatus, noWarranty.warrantyNumber, noWarranty.warrantyEnd], ['', '', '']);
}

console.log('\n-- which machines still need one --');
{
  const items = [
    { product_name: 'MONNAL T75', serial_number: '11389' },                        // needs one
    { product_name: 'MONNAL T60', serial_number: '20788', inst_call: '26I01P0080' }, // has one
    { product_name: 'MONNAL T60', serial_number: '20789', inst_call: '' },          // '' is not a call
    { product_name: '', serial_number: '' },                                        // not a machine yet
    { product_name: 'ORION-G', serial_number: '' },                                 // half a machine
  ];
  eq('a machine with a call is not offered another',
    machinesNeedingInstallCall(items).map((i) => i.serial_number), ['11389', '20789']);
  // THE BUTTON DISABLES ITSELF BY THE MAPPING, not by a flag somebody keeps.
  eq('nothing left to raise', machinesNeedingInstallCall([items[1]]).length, 0);
  eq('...so a line with no serial never gets a call about nothing',
    machinesNeedingInstallCall([items[4]]).length, 0);
}

console.log('\n-- PM visits follow the period until somebody changes them --');
{
  // The user, 2026-09-22: "PM visit should editable by the user. It varies
  // based on PO." Three a year under warranty is the standard OFFER; what was
  // sold is on the purchase order.
  eq('a two-year warranty suggests six', suggestedPmVisits('sale', 24), 6);
  eq('a two-year contract suggests four', suggestedPmVisits('contract', 24), 4);

  // FOLLOWING: nothing typed, so the period decides.
  eq('an untouched count follows the period',
    deriveHeader('sale', 'warranty_months', { warranty_months: 24, warranty_start: '2026-01-01', pm_visits: 6 },
                 { warranty_months: 12, warranty_start: '2026-01-01', pm_visits: 3 }).pm_visits, 6);
  eq('...and a blank one is filled',
    deriveHeader('sale', 'warranty_months', { warranty_months: 12, pm_visits: null },
                 { warranty_months: null, pm_visits: null }).pm_visits, 3);

  // OVERRIDDEN: the PO said four a year, so correcting the START DATE must not
  // snap it back to the standard offer. This is the whole point.
  {
    const out = deriveHeader('sale', 'warranty_start',
      { warranty_months: 12, warranty_start: '2026-02-01', pm_visits: 4 },
      { warranty_months: 12, warranty_start: '2026-01-01', pm_visits: 4 });
    eq('a typed count survives a change to the start date', 'pm_visits' in out, false);
    eq('...while the end date still moves with it', out.warranty_end, '2027-01-31');
  }
  eq('a typed count survives a change to the PERIOD too',
    'pm_visits' in deriveHeader('sale', 'warranty_months',
      { warranty_months: 24, pm_visits: 4 }, { warranty_months: 12, pm_visits: 4 }), false);

  // THE COMPARISON IS AGAINST THE PERIOD BEFORE THE EDIT. Against the new one
  // it would read as overridden on every period change, and the count would
  // never follow anything.
  eq('the contract count behaves the same way',
    deriveHeader('contract', 'contract_months', { contract_months: 24, pm_visits_total: 2 },
                 { contract_months: 12, pm_visits_total: 2 }).pm_visits_total, 4);
  eq('...and is left alone once typed',
    'pm_visits_total' in deriveHeader('contract', 'contract_months',
      { contract_months: 24, pm_visits_total: 9 }, { contract_months: 12, pm_visits_total: 9 }), false);

  // A caller with no previous row keeps the old behaviour: it simply follows.
  eq('with no previous row it follows',
    deriveHeader('sale', 'warranty_months', { warranty_months: 12, pm_visits: 99 }).pm_visits, 3);
}

console.log('\n-- re-reading the customer onto a sale that already names them --');
{
  const fill = partyFillForSale(FULL);
  const sale = { ...fill, city: 'OLD CITY', address: '' };
  const changes = partyFillChanges(sale, fill);
  eq('only the fields that differ are listed',
    changes.map((c) => c.field).sort(), ['address', 'city']);
  eq('...with what they were and what they become',
    changes.find((c) => c.field === 'city'), { field: 'city', from: 'OLD CITY', to: 'KOTTAYAM' });
  eq('a blank becoming a value is a change',
    changes.find((c) => c.field === 'address')?.from, '');

  // TELLING SOMEBODY ELEVEN FIELDS CHANGED WHEN NINE DID NOT is a number they
  // stop reading.
  eq('nothing to do is nothing listed', partyFillChanges(fill, fill), []);
  // Whitespace alone is not a change.
  eq('...and neither is trailing space',
    partyFillChanges({ ...fill, city: '  KOTTAYAM  ' }, fill), []);
  // A value the sale has and the master does not IS a change: that is the
  // master being authoritative, which is what the button is for.
  eq('a value the master no longer holds is cleared',
    partyFillChanges({ ...fill, pan: 'AAACT1234D' }, { ...fill, pan: '' }),
    [{ field: 'pan', from: 'AAACT1234D', to: '' }]);
}

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);

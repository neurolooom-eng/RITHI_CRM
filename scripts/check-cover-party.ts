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
import { partyFillForSale, SALE_PARTY_FIELDS, pairProductCodeAndName } from '../src/lib/coverspec';

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

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);

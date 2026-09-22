// ===========================================================================
// THE KYC RECORDS ATTACHED TO A PARTY.
//
//   The user, 2026-09-22: "In Party Master, add a provision to attach the KYC
//   records. If the customer is already KYC Verified, then display as KYC
//   Verified so that commercial department can proceed with Sale Entry and
//   Installation call."
//
// Two things are worth proving rather than reading. First, the ASYMMETRY:
// Verified is verified with nothing attached (the status is a decision a person
// made), and documents alone never make a party verified (attaching a file is
// not a decision). Second, that a malformed column cannot take the screen down
// — the value is jsonb, rows predate the column, and a reader that throws on it
// is a register nobody can open.
// ===========================================================================
import { kycDocs, withKycDoc, withoutKycDoc, isKycVerified, kycSummary, type KycDoc } from '../src/lib/kyc';

let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log(`  ✗ ${label}\n      got  ${g}\n      want ${w}`); fail++; }
  else console.log(`  ✓ ${label} = ${g}`);
};

const A: KycDoc = { name: 'GST.pdf', url: 'https://drive.google.com/file/d/1/view', at: '2026-09-22T10:00:00Z', by: 'Rithi Admin' };
const B: KycDoc = { name: 'PAN.pdf', url: 'https://drive.google.com/file/d/2/view', at: '2026-09-22T11:00:00Z', by: 'Rithi Admin' };

console.log('\n-- verified is a decision, not a file count --');
{
  eq('Verified', isKycVerified('Verified'), true);
  eq('...whatever the case and spacing', isKycVerified('  verified '), true);
  eq('Pending is not', isKycVerified('Pending'), false);
  eq('Rejected is not', isKycVerified('Rejected'), false);
  eq('nothing recorded is not', isKycVerified(''), false);
  eq('null is not', isKycVerified(null), false);

  // THE ASYMMETRY, both ways round. A verification recorded without the
  // paperwork is still a decision somebody made; a pile of documents with no
  // decision is not a verification.
  eq('Verified with NO record attached is still verified',
    kycSummary('Verified', []), { verified: true, records: 0 });
  eq('records with no verification are NOT a verification',
    kycSummary('Pending', [A, B]), { verified: false, records: 2 });
}

console.log('\n-- a malformed column cannot take the register down --');
{
  // The value is jsonb and rows predate the column (0231).
  eq('absent', kycDocs(undefined), []);
  eq('null', kycDocs(null), []);
  eq('an object where a list belongs', kycDocs({ name: 'x', url: 'y' }), []);
  eq('a string', kycDocs('[]'), []);
  eq('nulls inside the list', kycDocs([null, A]), [A]);
  // A LINK TO NOWHERE IS WORSE THAN AN ABSENT ONE: it reads as evidence that
  // exists, and somebody clicks it to check the verification.
  eq('an entry with no URL is dropped', kycDocs([{ name: 'GST.pdf' }, A]), [A]);
  eq('missing names and stamps become blanks, not undefined',
    kycDocs([{ url: 'https://x/1' }]), [{ name: '', url: 'https://x/1', at: '', by: '' }]);
}

console.log('\n-- attaching and removing --');
{
  eq('attaching the first record', withKycDoc([], A), [A]);
  eq('...and the second keeps the first', withKycDoc([A], B), [A, B]);
  // Re-attaching after a failed save is the ordinary way this happens, and two
  // identical rows in an evidence list is a question somebody answers later.
  eq('the same file twice is one record', withKycDoc([A], A), [A]);
  eq('...matched on the URL, not the name',
    withKycDoc([A], { ...A, name: 'GST-copy.pdf' }), [A]);
  eq('attaching onto a malformed column still works', withKycDoc(null, A), [A]);

  eq('removing one leaves the rest', withoutKycDoc([A, B], A.url), [B]);
  eq('removing something that is not there changes nothing', withoutKycDoc([A], B.url), [A]);

  // IT RETURNS A NEW LIST. The caller sends it to the database and re-reads;
  // mutating the row on screen would make a failed write look like it worked.
  const before = [A];
  withKycDoc(before, B);
  eq('the list it was given is not modified', before.length, 1);
}

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);

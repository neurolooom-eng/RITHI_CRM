// ===========================================================================
// WHERE A DOCUMENT IS FILED — the five folders of the "Reports" shared drive.
//
// The user, 2026-09-20: "RE-route the File Storage ... Map it to the appropriate
// folders. Field to Field, Installation to Installation, PM to PM -- KYC to
// Call Request [Installation KYC], Additional Reports to Call Request
// [Report - Installation]". Everything used to land in ONE flat folder, which
// is why a Field report, an Installation KYC and a PM report were
// indistinguishable the moment they were uploaded.
//
// A MODULE OF ITS OWN, for the `paging.ts` reason and no other: `sheets.ts`
// reaches `supabase.ts`, which reads `import.meta.env`, so nothing that lives
// there can be imported by a node script and nothing in it can be TESTED AS
// BEHAVIOUR. The rule below is the one part of this worth testing — it decides
// which folder an engineer's signed report is filed in, and a wrong answer is
// not an error anybody sees, it is a document in the wrong place.
//
// The KEYS are what travels to the bridge; the NAMES are what the bridge looks
// up in Drive (`DRIVE_FOLDERS` in apps-script/CallReg.gs). Keep the two lists
// in step — `check:ui` compares them word for word.
// ===========================================================================

export type DriveFolder = 'field' | 'installation' | 'pm' | 'kyc' | 'additional';

export const DRIVE_FOLDER_NAMES: Record<DriveFolder, string> = {
  field: 'Field Reports',
  installation: 'Installation Reports',
  pm: 'PM Reports',
  kyc: 'KYC',
  additional: 'Additional Reports',
};

// WHICH FOLDER A VISIT REPORT BELONGS IN, from the call's own type — and this
// is `call_table_for()` (0040) word for word, deliberately:
//
//   INSTALL% on the value as written, then PM% with the SPACES REMOVED.
//
// Both halves are load-bearing. The PREFIX test is why a 'PM' stamped by a bulk
// load and a sheet-era 'P M VISIT' reach the same folder, where an equality
// test would send the second one to Field; and the space-stripping is only on
// the PM branch, exactly as the SQL has it. Change one, change the other.
export function driveFolderForCall(callType: string): DriveFolder {
  const t = String(callType ?? '').toUpperCase();
  if (t.startsWith('INSTALL')) return 'installation';
  if (t.replace(/ /g, '').startsWith('PM')) return 'pm';
  return 'field';
}

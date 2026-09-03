// ---------------------------------------------------------------------------
// WHICH OF THE THREE IS THIS CALL? One matcher, used wherever a call type has
// to be recognised rather than displayed.
//
// The stored value varies — "P M VISIT", "PM VISIT", "PM", "INSTALLATION CALL",
// "INSTALLATION" — because it has come from three exports and two eras, and the
// database's CHECK constraints accept all of them: `call_table_for()` decides a
// call's table with exactly these three tests, in this order. This is its
// mirror, so a screen and the table a call actually lives in cannot disagree.
//
// Pending Calls used to compare the type with `===` against one spelling. Its
// Installation and PM chips returned nothing at all while those very calls were
// listed under All, a few rows down, with the type written in the column.
//
// Kept in its own module, with no imports, so a check script can load it
// without pulling in the Supabase client and its `import.meta.env`.
// ---------------------------------------------------------------------------
export type CallFamily = 'field' | 'install' | 'pm';

export function callFamily(callType: unknown): CallFamily {
  const t = String(callType ?? '').toUpperCase();
  if (t.startsWith('INSTALL')) return 'install';
  if (t.replace(/\s/g, '').startsWith('PM')) return 'pm';
  return 'field';
}

// The physical table a call type reads from (the 0040 split). A specific type
// reads its own table — so the PM register never scans field/installation, and
// vice-versa; an empty type reads the `calls` union view. Writes always go
// through `calls` (the INSTEAD OF triggers route them), so this is for reads.
export function callTable(callType = ''): string {
  if (!String(callType ?? '').trim()) return 'calls';
  const fam = callFamily(callType);
  return fam === 'install' ? 'installation_calls' : fam === 'pm' ? 'pm_calls' : 'field_calls';
}

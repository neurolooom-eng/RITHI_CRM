// ===========================================================================
// A MANAGER NAME THAT MATCHES NOBODY (D-053, FRS-171.4).
//
// The Reporting and Regional Manager on a User Master row are NAMES, and the
// reporting tree is built by matching them against other rows' names:
// visible_engineer_names() (0212) walks down from a manager by them, and since
// 0327 indoor_dc_authorisers() reads the same two names to decide who may
// approve an Indoor DC. A mistyped one is not refused anywhere — it simply
// joins nobody, and the person drops out of their manager's view.
//
// So the screen says so before saving and saves only on confirmation. It does
// NOT refuse: a manager who is not on the list yet must still be typeable.
//
// COMPARED AS THE DATABASE COMPARES, and the two functions do not compare alike:
//   - indoor_dc_authorisers(): upper(btrim(name)) = upper(btrim(manager))
//   - visible_engineer_names(): lower(manager) = lower(name) -- NOT trimmed.
// The value saved here is always trimmed (UserMasterView's persist()), so the
// two differ only where the MATCHED ROW's own name carries spaces before or
// after it: the trimmed test finds it and the reporting tree does not. That
// case is stated separately, because "matches nobody" would be untrue of it.
//
// Pure, imports nothing, so `check:ui` runs it.
// ===========================================================================

const fold = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * What to say about one manager name before it is saved, or '' when there is
 * nothing to say (blank, or it names a row exactly as the tree will find it).
 * `names` are the User Master names AS STORED (not trimmed), including any
 * name being typed in the same edit.
 */
export function managerNameProblem(label: string, value: string, names: readonly string[]): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  const want = v.toLowerCase();
  // Exactly as visible_engineer_names() will compare the saved (trimmed) value.
  if (names.some((n) => String(n ?? '').toLowerCase() === want)) return '';
  const near = names.find((n) => fold(n) === want);
  if (near != null) {
    return `${label} “${v}” matches the User Master row “${near}”, whose name has spaces before or after it — `
      + 'the reporting tree compares names as stored and will not find them until that row is saved again (saving trims it).';
  }
  return `${label} “${v}” matches no one on the User Master — compared ignoring case and surrounding spaces. `
    + 'The reporting tree and the Indoor DC approver are built from these names, so nobody will be found as this person’s manager until a row carries that name.';
}

/** Both manager fields of one row. `was` is the row as loaded (absent for a new
 *  row): only a value that CHANGED is asked about, so re-saving a row for an
 *  unrelated field does not raise a question about a name nobody typed. */
export function managerNameProblems(
  row: { reporting_manager?: string; regional_manager?: string },
  names: readonly string[],
  was?: { reporting_manager?: string; regional_manager?: string },
): string[] {
  const out: string[] = [];
  const ask = (label: string, now: string | undefined, before: string | undefined) => {
    if (was && fold(now) === fold(before)) return;
    const p = managerNameProblem(label, now ?? '', names);
    if (p) out.push(p);
  };
  ask('Reporting Manager', row.reporting_manager, was?.reporting_manager);
  ask('Regional Manager', row.regional_manager, was?.regional_manager);
  return out;
}

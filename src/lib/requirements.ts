// ===========================================================================
// THE REQUIREMENTS, GROUPED BY THE MODULE THEY GOVERN.
//
// ONE DEFINITION, used by both readers: `docs/REQUIREMENTS.md`
// (`scripts/requirements-doc.ts`) and the Requirements tab of the in-app
// Validation Package. They are the same document in two places, and a document
// that says different things in two places is worse than either alone — which
// is the whole reason this file exists rather than the grouping being written
// out twice.
//
// DERIVED BY DEFAULT, DECLARED BY EXCEPTION — and the document says WHICH OF
// THE TWO filed each one. A requirement belongs to a module when its own words
// NAME that module (its route, or every distinctive word of its label), so the
// grouping is evidence from the text rather than an opinion about it and it
// moves when the text does. Where the words name nothing, the requirement may
// DECLARE its modules (`Req.modules`), which is a deliberate, auditable
// statement about one requirement rather than a field filled in 146 times.
//
// Derivation alone left 34 of 56 screens with no requirement section and the
// FIELD CALL REGISTER among them — URS-003 says "register a customer call" and
// never says "field", so it was filed under "not tied to one screen" while the
// user went looking for it under the register. That is the gap the declaration
// closes.
//
// THE TWO ARE UNIONED, never one instead of the other: a requirement that
// later gains the words keeps being filed by them, so a declaration cannot
// quietly become the only thing holding a requirement in place.
//
// THE MATCH IS STRICT BECAUSE IT DECIDES WHERE A REQUIREMENT IS FILED, and
// over-filing puts requirements under screens they do not govern. **Do not
// invert it to claim a screen is uncovered.** That shipped for one run and
// reported 31 of 54 screens as named by no requirement — including the Field
// Call Register, which URS-003 plainly governs ("register a customer call")
// without using the word "field". Inverting a strict match reports every
// near-miss as a gap, and a false finding is worse than none because somebody
// acts on it. `REQUIREMENT_COVERAGE.md` asks that question against the whole
// package instead.
// ===========================================================================
import { MODULES, PERM_TREE, moduleAction } from './rbac';
import { URS, FRS, TESTS, type Req, type FReq, type TestCase, type Risk } from './validation';

/** Words distinctive enough to identify a screen by. Short ones ("the", "and",
 *  "call") match everything, so they are dropped — the same threshold
 *  `requirement-coverage.ts` uses to ask whether a screen is mentioned. */
export const distinctiveWords = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3);

/** The routes a piece of requirement text NAMES.
 *
 *  `/` is excluded deliberately: every route contains it, so the Dashboard
 *  would claim every requirement ever written. */
export function modulesNamedBy(text: string): string[] {
  const t = text.toLowerCase();
  return MODULES.filter((m) => {
    if (!m.path) return false;
    if (m.path !== '/' && t.includes(m.path.toLowerCase())) return true;
    const w = distinctiveWords(m.label);
    return w.length > 0 && w.every((x) => t.includes(x));
  }).map((m) => m.path);
}

/** HOW A REQUIREMENT CAME TO BE FILED UNDER A MODULE. Carried through to both
 *  readers, because "the text says so" and "somebody said so" are different
 *  kinds of claim and an auditor is entitled to tell them apart. */
export type Filing = 'derived' | 'declared';

export interface ModuleFiling { path: string; how: Filing }

/** Every module a requirement belongs to, with WHY. Derived first — a
 *  declaration that merely repeats what the words already say is recorded as
 *  derived, since the evidence is the stronger claim of the two. */
export function modulesFor(req: Req): ModuleFiling[] {
  const derived = modulesNamedBy(`${req.title} ${req.text}`);
  const out: ModuleFiling[] = derived.map((path) => ({ path, how: 'derived' as const }));
  (req.modules ?? []).forEach((path) => {
    if (!derived.includes(path)) out.push({ path, how: 'declared' });
  });
  return out;
}

/** A DECLARATION POINTING AT A SCREEN THAT DOES NOT EXIST files the requirement
 *  NOWHERE while reading as though it files it somewhere — the failure this
 *  whole mechanism was added to stop, reintroduced by a typo. `check:ui` fails
 *  on any of these. */
export function badDeclarations(): { id: string; path: string }[] {
  const paths = new Set(MODULES.map((m) => m.path).filter(Boolean));
  return URS.flatMap((r) => (r.modules ?? [])
    .filter((p) => !paths.has(p))
    .map((path) => ({ id: r.id, path })));
}

export const testsFor = (id: string): TestCase[] => TESTS.filter((t) => t.reqs.includes(id));
export const frsFor = (ursId: string): FReq[] => FRS.filter((f) => f.urs.includes(ursId));

export interface UrsEntry { req: Req; frs: FReq[]; tests: TestCase[]; how?: Filing }
export interface ModuleReqs { path: string; label: string; action: string; urs: UrsEntry[] }
export interface GroupReqs { title: string; modules: ModuleReqs[] }

const entry = (req: Req): UrsEntry => {
  const frs = frsFor(req.id);
  // A test may name the USER requirement directly or the system requirement
  // implementing it. Both prove it, so both count — reading only one of the two
  // reported requirements as unproved that a whole OQ case covers.
  const ids = new Set<string>([req.id, ...frs.map((f) => f.id)]);
  const tests = TESTS.filter((t) => t.reqs.some((r) => ids.has(r)));
  return { req, frs, tests };
};

/** Every module that at least one requirement names, in MENU ORDER.
 *
 *  Menu order because this is read beside the application: `PERM_TREE` follows
 *  the menu and `check:ui` proves it does, so following `PERM_TREE` means a
 *  reader meets the modules here in the order they meet them on screen. */
export function requirementsByModule(): GroupReqs[] {
  const named = new Map<string, { req: Req; how: Filing }[]>();
  URS.forEach((r) => modulesFor(r).forEach(({ path, how }) => {
    if (!named.has(path)) named.set(path, []);
    named.get(path)!.push({ req: r, how });
  }));
  const out: GroupReqs[] = [];
  for (const header of PERM_TREE) {
    const modules: ModuleReqs[] = [];
    for (const page of header.pages) {
      const mine = named.get(page.path);
      if (!mine?.length) continue;
      modules.push({
        path: page.path, label: page.label, action: moduleAction(page.path),
        urs: mine.map(({ req, how }) => ({ ...entry(req), how })),
      });
    }
    if (modules.length) out.push({ title: header.title, modules });
  }
  return out;
}

/** The ones whose words name no screen — most are system-wide (access control,
 *  audit, retention). Listed apart rather than forced under a module, because
 *  filing them somewhere would say something the requirement does not. */
export function systemWideRequirements(): UrsEntry[] {
  return URS.filter((r) => modulesFor(r).length === 0).map(entry);
}

/** PAGES NO REQUIREMENT GOVERNS — asked of the FILED set, which is why it can
 *  be asked at all now.
 *
 *  It could not be asked of derivation alone: inverting a strict text match
 *  reports every near-miss as a gap, and it did — 31 of 54 screens, including
 *  the Field Call Register, which URS-003 plainly governs. With declarations
 *  the question is about where requirements ACTUALLY SIT, and a screen with
 *  nothing under it is a real hole in the set rather than a word the author
 *  happened not to use.
 *
 *  Still not a defect on its own: some screens are genuinely governed by the
 *  servicing reference or by nothing yet. `check:ui` fails on a NEW one, so the
 *  list is a decision somebody made rather than a drift nobody saw. */
export function modulesWithNoRequirement(): { path: string; label: string }[] {
  const filed = new Set<string>();
  URS.forEach((r) => modulesFor(r).forEach(({ path }) => filed.add(path)));
  return MODULES.filter((m) => m.path && !filed.has(m.path))
    .map((m) => ({ path: m.path, label: m.label }));
}

/** Where the set is not complete. Stated rather than left to be noticed — none
 *  is a defect on its own, each is a question for a person. */
export function requirementGaps() {
  const unimplemented = URS.filter((r) => frsFor(r.id).length === 0);
  const unproved = FRS.filter((f) => testsFor(f.id).length === 0);
  const untested = URS.filter((r) => entry(r).tests.length === 0);
  return { unimplemented, unproved, untested };
}

// ===========================================================================
// THE TRACEABILITY MATRIX.
//
// The user, 2026-09-15: "I want the REquirements like Traceability. Column1 URS
// ID, Column 2 URS Details, Column 3 FRS ID, Column 4 FRS Details, Column 5
// Test Case ID, Column 6 Test Case Details."
//
// SIX COLUMNS, ONE ROW PER LINK — not per requirement. A URS implemented by two
// FRS, each proved by two tests, is FOUR rows, because the thing being traced
// is the LINK: "this need is met by this mechanism and that is shown by this
// test". Collapsing them into one row with three lists puts the reader back to
// working out which test proves which mechanism, which is the question the
// matrix exists to answer.
//
// THE REPEATED CELLS ARE LEFT EMPTY on the rows that continue a requirement
// (`ursRepeat` / `frsRepeat` say which), so the eye follows one URS down its
// own block — the way a traceability matrix is read on paper. The IDENTIFIERS
// are still on every row in the DOWNLOAD, because a spreadsheet gets sorted and
// filtered and a blank cell there is a lost link.
//
// A REQUIREMENT WITH NO FRS, OR AN FRS WITH NO TEST, STILL GETS A ROW — with
// the gap named in the empty column. Dropping it would make the matrix answer
// "everything here is traced" by leaving out everything that is not, which is
// the one thing a traceability matrix must never do.
// ===========================================================================
export interface TraceRow {
  ursId: string; ursTitle: string; ursText: string; risk: Risk;
  frsId: string; frsText: string;
  testId: string; testText: string;
  /** This row continues the requirement above it, so the URS cells are a
   *  repeat. The reader is shown a blank; the download is given the value. */
  ursRepeat: boolean;
  frsRepeat: boolean;
  /** The modules it is filed under, and whether the text or a declaration put
   *  it there — so the matrix can be read per module without being regrouped. */
  modules: ModuleFiling[];
}

const NO_FRS = '— no system requirement names this yet —';
const NO_TEST = '— no test names this yet —';

export function traceabilityMatrix(only?: (r: Req) => boolean): TraceRow[] {
  const out: TraceRow[] = [];
  for (const req of URS) {
    if (only && !only(req)) continue;
    const frs = frsFor(req.id);
    const base = {
      ursId: req.id, ursTitle: req.title, ursText: req.text, risk: req.risk,
      modules: modulesFor(req),
    };
    let firstOfUrs = true;

    // A test may name the USER requirement directly rather than an FRS. Those
    // rows belong to the URS itself, not to an arbitrary one of its mechanisms.
    //
    // ...BUT ONLY WHERE IT NAMES NO FRS OF THIS REQUIREMENT. Most OQ cases name
    // both — `OQ-58 { reqs: ['URS-065','FRS-077'] }` — and counting that as two
    // links put the same test on two rows of the same block, which reads as two
    // pieces of evidence where there is one.
    const frsIds = new Set(frs.map((f) => f.id));
    const direct = TESTS.filter((t) => t.reqs.includes(req.id) && !t.reqs.some((x) => frsIds.has(x)));
    const rowsFor = (frsId: string, frsText: string, tests: TestCase[]) => {
      if (!tests.length) {
        out.push({ ...base, frsId, frsText, testId: '', testText: NO_TEST,
          ursRepeat: !firstOfUrs, frsRepeat: false });
        firstOfUrs = false;
        return;
      }
      tests.forEach((t, i) => {
        out.push({
          ...base, frsId, frsText,
          testId: t.id,
          testText: `${t.phase} · ${t.objective} Expected: ${t.expected}`,
          ursRepeat: !firstOfUrs, frsRepeat: i > 0,
        });
        firstOfUrs = false;
      });
    };

    if (!frs.length && !direct.length) {
      out.push({ ...base, frsId: '', frsText: NO_FRS, testId: '', testText: NO_TEST,
        ursRepeat: false, frsRepeat: false });
      continue;
    }
    if (direct.length) rowsFor('', frs.length ? '(tested against the user requirement itself)' : NO_FRS, direct);
    frs.forEach((f) => rowsFor(f.id, f.text, testsFor(f.id)));
  }
  return out;
}

/** What the matrix says about itself, for the line under it. Counted from the
 *  ROWS rather than restated, so the two cannot disagree. */
export function traceabilitySummary(rows: TraceRow[]) {
  const urs = new Set(rows.map((r) => r.ursId));
  const untraced = new Set(rows.filter((r) => !r.testId).map((r) => r.ursId));
  const proved = new Set(rows.filter((r) => r.testId).map((r) => r.ursId));
  return {
    rows: rows.length,
    urs: urs.size,
    frs: new Set(rows.filter((r) => r.frsId).map((r) => r.frsId)).size,
    tests: new Set(rows.filter((r) => r.testId).map((r) => r.testId)).size,
    // A TEST THAT IS IN NO ROW IS NAMED, not quietly left out of the count. One
    // is (OQ-38, which proves NAR-001 — a NON-AUDITABLE requirement, outside
    // the URS → FRS → test chain by design). A matrix whose test count is
    // lower than the suite's and does not say why reads as a matrix that
    // dropped something.
    outside: TESTS.filter((t) => !new Set(rows.map((r) => r.testId)).has(t.id)).map((t) => t.id),
    // A requirement with one proved mechanism and one unproved one is NOT
    // "traced" — it is partly traced, and the honest count is the one that says
    // so rather than the one that rounds up.
    fullyTraced: [...proved].filter((id) => !untraced.has(id)).length,
    partlyTraced: [...proved].filter((id) => untraced.has(id)).length,
    untraced: [...untraced].filter((id) => !proved.has(id)).length,
  };
}

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
// THE MODULE IS DERIVED, NOT DECLARED. Nothing on a requirement says which
// screen it belongs to, and adding a field to 146 of them by hand would be 146
// guesses. A requirement belongs to a module when its own words NAME that
// module — its route, or every distinctive word of its label. So the grouping
// is evidence from the text rather than an opinion about it, and it moves when
// the text does.
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
import { URS, FRS, TESTS, type Req, type FReq, type TestCase } from './validation';

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

export const testsFor = (id: string): TestCase[] => TESTS.filter((t) => t.reqs.includes(id));
export const frsFor = (ursId: string): FReq[] => FRS.filter((f) => f.urs.includes(ursId));

export interface UrsEntry { req: Req; frs: FReq[]; tests: TestCase[] }
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
  const named = new Map<string, Req[]>();
  URS.forEach((r) => modulesNamedBy(`${r.title} ${r.text}`).forEach((p) => {
    if (!named.has(p)) named.set(p, []);
    named.get(p)!.push(r);
  }));
  const out: GroupReqs[] = [];
  for (const header of PERM_TREE) {
    const modules: ModuleReqs[] = [];
    for (const page of header.pages) {
      const mine = named.get(page.path);
      if (!mine?.length) continue;
      modules.push({
        path: page.path, label: page.label, action: moduleAction(page.path),
        urs: mine.map(entry),
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
  return URS.filter((r) => modulesNamedBy(`${r.title} ${r.text}`).length === 0).map(entry);
}

/** Where the set is not complete. Stated rather than left to be noticed — none
 *  is a defect on its own, each is a question for a person. */
export function requirementGaps() {
  const unimplemented = URS.filter((r) => frsFor(r.id).length === 0);
  const unproved = FRS.filter((f) => testsFor(f.id).length === 0);
  const untested = URS.filter((r) => entry(r).tests.length === 0);
  return { unimplemented, unproved, untested };
}

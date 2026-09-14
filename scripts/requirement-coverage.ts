// ===========================================================================
// WHICH SCREENS AND ACTIONS THE REQUIREMENTS DO NOT MENTION.
//
// The user, 2026-09-14: "Check if the Requirements are up to Date".
//
// WHAT THIS CAN AND CANNOT TELL YOU, said first because the difference decides
// how the output should be read.
//
//   IT CAN say that no requirement, design note or test in the validation
//   package mentions a screen or an action ANYWHERE in its text. That is a
//   fact, and it is a strong hint.
//
//   IT CANNOT say a thing is uncovered. Requirements are prose: URS-016
//   ("Audit trail") covers `audit.view` without naming the key, and no scan
//   will see that. So every line here is a QUESTION for a human, and the
//   output says so rather than calling them gaps — a coverage report that
//   overstates is one that gets argued with instead of acted on.
//
// It also reports the reverse, which is the half people forget: requirements
// naming a route that no longer exists.
//
// Usage: npm run coverage:reqs
// ===========================================================================
import { MODULES, ACTIONS, PERM_TREE, moduleAction } from '../src/lib/rbac';
import { URS, FRS, TESTS, RISKS, DETAILED, CHECKLIST } from '../src/lib/validation';

// EVERY WORD OF THE PACKAGE, not just the requirement text: a control named in
// a risk row or a test step is covered, and treating only URS/FRS as the corpus
// would report dozens of false questions.
const corpus = [
  ...URS.map((r) => `${r.title} ${r.text}`),
  ...FRS.map((r) => `${r.title} ${r.text}`),
  ...TESTS.map((t) => `${t.objective} ${t.steps.join(' ')} ${t.expected}`),
  ...RISKS.map((r) => `${r.fn} ${r.failure} ${r.effect} ${r.controls}`),
  ...DETAILED.flatMap((d) => [d.area, ...d.points]),
  ...CHECKLIST.flatMap((c) => c.items.map((i) => `${i.item} ${i.ref}`)),
].join('\n').toLowerCase();

const P = (s = '') => console.log(s);
P('# Requirement coverage — screens and actions the package does not mention');
P();
P('**GENERATED** by `scripts/requirement-coverage.ts` (`npm run coverage:reqs`).');
P();
P('Every line below is a **question for a human**, not a defect. Requirements are');
P('prose: one can cover a screen without naming it, and no scan sees that. What');
P('this proves is only that the words do not appear anywhere in the package —');
P('requirements, design, risks, tests and the compliance checklist together.');
P();

// ---- screens ---------------------------------------------------------------
const labelWords = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
const screenSilent = MODULES.filter((m) => {
  if (!m.path) return false;
  if (corpus.includes(m.path.toLowerCase())) return false;
  // Or its label's distinctive words, all of them present somewhere.
  const w = labelWords(m.label);
  return !(w.length && w.every((x) => corpus.includes(x)));
});
P(`## Screens not named anywhere in the package (${screenSilent.length} of ${MODULES.length})`);
P();
if (!screenSilent.length) P('None — every screen is named somewhere.');
else { P('| Screen | Route | Opened by |'); P('| --- | --- | --- |');
  screenSilent.forEach((m) => P(`| ${m.label} | \`${m.path}\` | \`${moduleAction(m.path)}\` |`)); }
P();

// ---- actions ---------------------------------------------------------------
// A PAGE'S OWN KEY IS GRANTED BY THE PAGE ENTRY, not by its actions list —
// `view` is deliberately kept separate from the actions in PERM_TREE, so a page
// with `actions: []` still grants `mod:<path>`. The first version counted only
// the actions and reported three screens as ungrantable when every one of them
// can be granted; that is the same false finding this file warns the reader
// about, made by the file itself.
const granted = new Set<string>();
PERM_TREE.forEach((h) => h.pages.forEach((p) => {
  if (p.path) granted.add(moduleAction(p.path));
  p.actions.forEach((a) => granted.add(a));
}));
const actionSilent = ACTIONS.filter((a) => {
  if (corpus.includes(a.key.toLowerCase())) return false;
  const w = labelWords(a.label);
  return !(w.length && w.every((x) => corpus.includes(x)));
});
P(`## Actions not named anywhere in the package (${actionSilent.length} of ${ACTIONS.length})`);
P();
P('An action is what an administrator GRANTS, so one the package never mentions');
P('is authority the validation does not discuss.');
P();
if (!actionSilent.length) P('None — every action is named somewhere.');
else { P('| Action | What it allows | On the matrix? |'); P('| --- | --- | --- |');
  actionSilent.forEach((a) => P(`| \`${a.key}\` | ${a.label} | ${granted.has(a.key) ? 'yes' : '**no — it cannot be granted**'} |`)); }
P();

// ---- the reverse: the package naming what is gone --------------------------
const routes = new Set(MODULES.map((m) => m.path));
const stale = new Set<string>();
for (const m of corpus.matchAll(/(?<![\w/])\/(?:[a-z0-9-]+\/)*[a-z0-9-]{3,}(?![\w/])/g)) {
  const r = m[0];
  if (/\.(sql|ts|tsx|md|mjs|json|gs)$/.test(r)) continue;   // a file path, not a route
  if (/^\/(src|docs|scripts|supabase|apps-script|node_modules|home|tmp|usr)\b/.test(r)) continue;
  if (!routes.has(r)) stale.add(r);
}
P(`## Paths the package names that are not screens (${stale.size})`);
P();
P('Usually a file path or a prose slash rather than a route — read it as a');
P('shortlist to glance at, not a defect list.');
P();
if (!stale.size) P('None.');
else [...stale].sort().forEach((r) => P(`- \`${r}\``));

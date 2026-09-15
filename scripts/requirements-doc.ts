// ===========================================================================
// ONE REQUIREMENT DOCUMENT, GROUPED BY MODULE.
//
// The user, 2026-09-15: "Group the Requirements per Module. Make one
// Requirement Document - Which is a Complete Set of Requirement - System
// Requirements implementing the User Requirements."
//
// GENERATED, like DATABASE_SCHEMA.md and for the same reason: the requirements
// already exist in four places and a fifth HAND-WRITTEN copy would be the one
// that goes stale while reading as authoritative. The sources stay where they
// are maintained; this assembles them.
//
//   src/lib/validation.ts        URS — what the business needs
//                                FRS — how the system does it, each naming
//                                      the URS it implements
//                                TESTS — what proves it
//   docs/CALL_REQUEST_REQUIREMENTS.md   CR — the Call Request module
//   docs/ISO13485_SERVICING.md          SR — the servicing process (ISO 13485)
//
// THE MODULE IS DERIVED, NOT DECLARED. Nothing on a requirement says which
// screen it belongs to, and adding a field to 146 of them by hand would be 146
// guesses. A requirement belongs to a module when its own words NAME that
// module — its route, or every distinctive word of its label — which is the
// same match `requirement-coverage.ts` already uses to ask whether a screen is
// mentioned at all. So the grouping is evidence from the text rather than an
// opinion about it, and it moves when the text does.
//
// A REQUIREMENT NAMING SEVERAL MODULES APPEARS UNDER EACH. That is not
// duplication to be tidied away: "a manager sees their team's calls" really is
// a requirement of every call register, and filing it under one would hide it
// from the others.
//
// WHAT IS NOT DERIVED IS SAID SO. A requirement whose words name no screen is
// listed at the end under its own heading rather than being forced somewhere —
// most are system-wide (access control, audit, retention) and belong to no one
// screen, and pretending otherwise is how a document starts lying.
// ===========================================================================
import { readFileSync } from 'node:fs';
import { MODULES, PERM_TREE, moduleAction } from '../src/lib/rbac';
import { URS, FRS, TESTS, NON_AUDITABLE } from '../src/lib/validation';
// ONE DEFINITION OF THE GROUPING, shared with the Requirements tab of the
// in-app Validation Package. They are the same document in two places, and a
// document that says different things in two places is worse than either.
// The MATCHER is what must not drift — where a requirement is filed decides
// what this document says. The rendering differs legitimately: the document
// folds in the two hand-maintained references (CR, SR) and the in-app tab links
// out to them instead.
import { modulesNamedBy, frsFor, testsFor } from '../src/lib/requirements';

const P = (s = '') => console.log(s);

// ---- the two hand-maintained references ------------------------------------
// Read as IDENTIFIER + TITLE only, with a link to the full text. Copying the
// prose would make this the second place each is written, and the sources carry
// status lines that are updated in the change that makes one true — a copy here
// would go stale the first time one moved.
interface Ext { id: string; title: string; doc: string }
function readExternal(file: string, prefix: string): Ext[] {
  const raw = readFileSync(file, 'utf8');
  const out: Ext[] = [];
  // `**SR-003 — Reference materials ... are available at the` wraps onto the
  // next line, so the title runs to the closing `**` however far away it is.
  const re = new RegExp(`\\*\\*(${prefix}-\\d{3})\\s*[—-]\\s*([\\s\\S]*?)\\*\\*`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const id = m[1];
    if (out.some((x) => x.id === id)) continue;   // the first mention is the definition
    out.push({ id, title: m[2].replace(/\s+/g, ' ').replace(/\.$/, '').trim(), doc: file });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
const CR = readExternal('docs/CALL_REQUEST_REQUIREMENTS.md', 'CR');
const SR = readExternal('docs/ISO13485_SERVICING.md', 'SR');

type Item = { kind: 'URS' | 'CR' | 'SR'; id: string; title: string; text?: string; risk?: string; doc?: string };
const items: { it: Item; mods: string[] }[] = [
  ...URS.map((r) => ({ it: { kind: 'URS' as const, id: r.id, title: r.title, text: r.text, risk: r.risk }, mods: modulesNamedBy(`${r.title} ${r.text}`) })),
  ...CR.map((r) => ({ it: { kind: 'CR' as const, id: r.id, title: r.title, doc: r.doc }, mods: modulesNamedBy(r.title).length ? modulesNamedBy(r.title) : ['/call-requests'] })),
  ...SR.map((r) => ({ it: { kind: 'SR' as const, id: r.id, title: r.title, doc: r.doc }, mods: modulesNamedBy(r.title) })),
];

// ---- the document ----------------------------------------------------------
P('# Requirements — the complete set, by module');
P();
P('**GENERATED — do not hand-edit.** Written by `scripts/requirements-doc.ts`');
P('(`npm run docs:reqs`). Edit the source and re-run it.');
P();
P('One document, so there is one place to read what this system is required to');
P('do. It is ASSEMBLED rather than written: every requirement below is');
P('maintained somewhere else, and a hand-kept fifth copy would be the one that');
P('goes stale while reading as authoritative.');
P();
P('| | Where it is maintained | What it is |');
P('| --- | --- | --- |');
P('| **URS** | `src/lib/validation.ts` | **User requirements** — what the business needs, in its own words |');
P('| **FRS** | `src/lib/validation.ts` | **System requirements** — how this system does it. Each names the URS it implements |');
P('| **CR** | [`docs/CALL_REQUEST_REQUIREMENTS.md`](CALL_REQUEST_REQUIREMENTS.md) | The CALL REQUEST module, in full |');
P('| **SR** | [`docs/ISO13485_SERVICING.md`](ISO13485_SERVICING.md) | The SERVICING PROCESS against ISO 13485 §7.5.4 — a DRAFT, not approved |');
P('| **OQ / PQ** | `src/lib/validation.ts` | The tests that prove each one |');
P();
P('## How to read it');
P();
P('**A user requirement is a need; a system requirement is a mechanism.** Under');
P('each URS below sit the FRS entries that implement it, and under those the');
P('tests that prove them. Read downwards and you have the whole argument for one');
P('requirement: what was asked for, how it was built, and what shows it works.');
P();
P('**The module is derived from the words, not declared.** Nothing on a');
P('requirement says which screen it belongs to. One is filed under a module when');
P('its own text names that module — its route, or every distinctive word of its');
P('label. So the grouping is evidence rather than opinion, and it moves when the');
P('text does. A requirement naming several modules appears under each: "a manager');
P('sees their team’s calls" really is a requirement of every call register.');
P();
P('**A requirement that names no screen is not forced into one.** Those are');
P('gathered at the end. Most are system-wide — access control, audit, retention —');
P('and belong to no single screen.');

// ---- per module ------------------------------------------------------------
const groupOf = new Map<string, string>();
PERM_TREE.forEach((h) => h.pages.forEach((pg) => groupOf.set(pg.path, h.title)));

const seen = new Set<string>();
const byGroup = new Map<string, typeof MODULES>();
MODULES.forEach((m) => {
  if (!m.path) return;
  const g = groupOf.get(m.path) ?? 'Not on the permissions matrix';
  if (!byGroup.has(g)) byGroup.set(g, []);
  byGroup.get(g)!.push(m);
});

let withModule = 0;
for (const header of PERM_TREE) {
  const mods = byGroup.get(header.title) ?? [];
  const any = mods.some((m) => items.some((x) => x.mods.includes(m.path)));
  if (!any) continue;
  P();
  P(`# ${header.title}`);
  for (const m of mods) {
    const mine = items.filter((x) => x.mods.includes(m.path));
    if (!mine.length) continue;
    P();
    P(`## ${m.label} \`${m.path}\``);
    P();
    P(`Opened by \`${moduleAction(m.path)}\`.`);
    const ursHere = mine.filter((x) => x.it.kind === 'URS');
    if (ursHere.length) {
      for (const { it } of ursHere) {
        seen.add(it.id); withModule += 1;
        P();
        P(`### ${it.id} — ${it.title}`);
        P();
        P(`*Risk: ${it.risk}.* ${it.text}`);
        const impl = frsFor(it.id);
        P();
        if (!impl.length) {
          P('> **No system requirement names this yet.** A user requirement nothing');
          P('> implements is either a gap or a need met outside this system; either way');
          P('> it is a question for a person, which is why it is not hidden.');
        } else {
          P('| Implemented by | Risk | Proved by |');
          P('| --- | --- | --- |');
          impl.forEach((f) => {
            const t = testsFor(f.id).map((x) => x.id);
            P(`| **${f.id}** — ${f.title} | ${f.risk} | ${t.length ? t.join(', ') : '_no test names it_'} |`);
          });
          impl.forEach((f) => { P(); P(`**${f.id}.** ${f.text}`); });
        }
      }
    }
    const ext = mine.filter((x) => x.it.kind !== 'URS');
    if (ext.length) {
      P();
      P(`**Also governing this screen** — maintained in their own documents:`);
      P();
      ext.forEach(({ it }) => { seen.add(it.id); P(`- **${it.id}** — ${it.title} · [full text](${(it.doc ?? '').replace('docs/', '')})`); });
    }
  }
}

// ---- what belongs to no one screen ----------------------------------------
P();
P('# Not tied to one screen');
P();
P('These name no module in their own words. Most are system-wide, and forcing');
P('them under a screen would say something the requirement does not.');
const loose = items.filter((x) => !seen.has(x.it.id));
for (const kind of ['URS', 'CR', 'SR'] as const) {
  const here = loose.filter((x) => x.it.kind === kind);
  if (!here.length) continue;
  P();
  P(`## ${kind === 'URS' ? 'User requirements' : kind === 'CR' ? 'Call Request module' : 'Servicing process (ISO 13485)'}`);
  P();
  here.forEach(({ it }) => {
    if (kind === 'URS') {
      const impl = frsFor(it.id).map((f) => f.id);
      P(`- **${it.id}** — ${it.title} · implemented by ${impl.length ? impl.join(', ') : '_nothing yet_'}`);
    } else {
      P(`- **${it.id}** — ${it.title} · [full text](${(it.doc ?? '').replace('docs/', '')})`);
    }
  });
}

// ---- the gaps, said plainly ------------------------------------------------
P();
P('# Where the set is not complete');
P();
P('Stated rather than left to be noticed. None of these is a defect on its own —');
P('each is a question for a person.');
P();
const ursNoFrs = URS.filter((r) => !frsFor(r.id).length);
const frsNoTest = FRS.filter((f) => !testsFor(f.id).length);
const ursNoTest = URS.filter((r) => !testsFor(r.id).length && !frsFor(r.id).some((f) => testsFor(f.id).length));
P('| | Count | What it means |');
P('| --- | --- | --- |');
P(`| User requirements no system requirement implements | ${ursNoFrs.length} | a gap, or a need met outside this system |`);
P(`| System requirements no test names | ${frsNoTest.length} | built and specified, not yet proved |`);
P(`| User requirements nothing proves, directly or through an FRS | ${ursNoTest.length} | the one that matters for an audit |`);
P();
if (ursNoFrs.length) { P('**Unimplemented:** ' + ursNoFrs.map((r) => `${r.id} (${r.title})`).join(' · ')); P(); }
if (frsNoTest.length) { P('**Unproved:** ' + frsNoTest.map((f) => f.id).join(', ')); P(); }

// NOT REPORTED HERE: "screens no requirement names". It was, for one run, and
// the number was WRONG IN THE ALARMING DIRECTION — 31 of 54, including the
// Field Call Register, which URS-003 plainly governs ("register a customer
// call") without using the word "field". The match above is deliberately
// STRICT because it decides where a requirement is FILED, and over-filing puts
// requirements under screens they do not govern. Inverting a strict match to
// claim an absence is not the same test: it reports every near-miss as a gap.
//
// `REQUIREMENT_COVERAGE.md` asks that question properly, against the whole
// package — requirements, design, risks, tests and the checklist — and reports
// 0 of 54. A false finding is worse than none, because somebody acts on it.
P('**Is every screen covered?** That question is answered in');
P('[`REQUIREMENT_COVERAGE.md`](REQUIREMENT_COVERAGE.md), which searches the whole');
P('package rather than requirement text alone. It is not answered here: the match');
P('used for FILING above is strict on purpose, and inverting a strict match to');
P('claim an absence reports every near-miss as a gap.');
P();
P('---');
P();
P(`**${URS.length}** user requirements · **${FRS.length}** system requirements · `
  + `**${CR.length}** call-request · **${SR.length}** servicing · **${TESTS.length}** tests · `
  + `**${NON_AUDITABLE.length}** recorded as non-auditable · `
  + `**${withModule}** of ${URS.length} user requirements tied to a module by their own words.`);

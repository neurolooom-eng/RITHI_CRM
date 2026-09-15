// ===========================================================================
// WHAT EVERY SCREEN IS, WHAT IT LETS YOU DO, AND WHAT IT READS.
//
// The user, 2026-09-14: "Scan Page by Page, Module by Module - List down all
// Actions, Views, Check if the Requirements are up to Date".
//
// GENERATED, never written — the same reason `docs/DATABASE_SCHEMA.md` is.
// An inventory of fifty-four screens written by hand is out of date by the end
// of the week it was written, and an inventory that is WRONG is worse than
// none: it is read to decide what has been covered.
//
// WHAT IS DERIVED, AND FROM WHERE. Each line says so, because a reader has to
// know which parts are facts about the code and which are a best reading of it:
//
//   route, label, admin     MODULES (rbac.ts) — the authority on what a screen
//                           IS and what key opens it
//   menu group              Layout.tsx — where somebody finds it
//   actions                 PERM_TREE (rbac.ts) — the authority on what may be
//                           DONE on a screen, because it is what an
//                           administrator grants
//   permission gates        `can('x')` in the screen's own source — what it
//                           actually tests, which is not always what the
//                           matrix offers, and the DIFFERENCE is worth seeing
//   buttons                 the screen's own source, best-effort
//   tables read             `.from('x')` in the screen's own source. A screen
//                           reading through a lib function shows NONE here,
//                           and that is reported rather than hidden — this
//                           column is a floor, not a census.
//
// Usage: npm run inventory > docs/MODULE_INVENTORY.md
// ===========================================================================
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { MODULES, PERM_TREE, ACTIONS, moduleAction } from '../src/lib/rbac';

const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
// Comments are stripped before any of the greps below: a button named in a
// comment is not a button, and prose has produced false findings in this repo
// before.
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// ---- route -> component -> file -------------------------------------------
const app = code(read('src/App.tsx'));
const routeToComp = new Map<string, string>();
for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)) {
  // `Navigate` IS NOT A SCREEN. It matched this pattern first, so `/users` was
  // resolved to it, had no file, and was reported as unresolvable — while the
  // redirect map right below held the answer. A component name that is really
  // a control-flow element has to be excluded here or the redirect branch can
  // never run.
  if (m[2] !== 'Navigate') routeToComp.set(m[1], m[2]);
}
const redirects = new Map<string, string>();
for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<Navigate\s+to="([^"]+)"/g)) redirects.set(m[1], m[2]);

const files = readdirSync('src/modules').filter((f) => f.endsWith('.tsx'));
const compToFile = new Map<string, string>();
for (const f of files) {
  const src = read(`src/modules/${f}`);
  // BOTH SHAPES. The first version looked only for `export function X(` and
  // reported the Warranty and Contract registers as unresolvable — they are
  // `export const X = () => <CoverRegister kind=... />`. Eight screens came
  // back as findings and every one of them was this script being wrong, which
  // is worse than no inventory: a gap that is not there sends somebody to
  // cover something already covered.
  for (const m of src.matchAll(/export (?:function|const) (\w+)\s*[=(]/g)) {
    if (!compToFile.has(m[1])) compToFile.set(m[1], `src/modules/${f}`);
  }
}

/** The component serving a path, following the two indirections App.tsx uses.
 *  A screen is no less covered for being reached through a redirect or a
 *  parameterised route, and reporting it as unresolved says the opposite. */
function componentFor(path: string, seen = new Set<string>()): { comp: string; via: string } {
  if (seen.has(path)) return { comp: '', via: '' };
  seen.add(path);
  const direct = routeToComp.get(path);
  if (direct) return { comp: direct, via: '' };
  const to = redirects.get(path);
  if (to) { const r = componentFor(to, seen); return { comp: r.comp, via: `redirects to \`${to}\`` }; }
  // `/exports/:tab` serves `/exports/consumption` and the rest.
  for (const [pat, comp] of routeToComp) {
    if (!pat.includes(':')) continue;
    const re = new RegExp(`^${pat.replace(/:[^/]+/g, '[^/]+')}$`);
    if (re.test(path)) return { comp, via: `served by \`${pat}\`` };
  }
  return { comp: '', via: '' };
}

// ---- menu group per route --------------------------------------------------
const lay = code(read('src/components/layout/Layout.tsx'));
const nav = lay.slice(lay.indexOf('title:'), lay.indexOf('\n];', lay.indexOf('title:')));
const groupOf = new Map<string, string>();
for (const g of nav.matchAll(/title: '([^']+)',[^[]*?items: \[([\s\S]*?)\n\s*\],/g)) {
  for (const i of g[2].matchAll(/\{ to: '([^']+)'/g)) groupOf.set(i[1], g[1]);
}

// ---- actions per page, from the matrix ------------------------------------
const actionsOf = new Map<string, string[]>();
PERM_TREE.forEach((h) => h.pages.forEach((p) => { if (p.path) actionsOf.set(p.path, p.actions); }));
const actionLabel = new Map(ACTIONS.map((a) => [a.key, a.label]));

const out: string[] = [];
const P = (s = '') => out.push(s);

P('# RITHI CRM — every screen, what it lets you do, and what it reads');
P();
P('**GENERATED — do not hand-edit.** Produced by `scripts/module-inventory.ts`');
P('(`npm run inventory`). Re-run it after adding or changing a screen.');
P();
P('Written for one question: *is there a requirement and a test for this?* So it');
P('lists what an auditor would ask about — the screen, who may open it, what may');
P('be DONE on it, and what it reads — and says for each column where the fact');
P('came from, because some are authoritative and one is a floor.');
P();

let noFile = 0; let noGroup = 0; let noTables = 0;
const rows: { path: string; label: string; group: string; file: string; via: string; acts: string[];
              gates: string[]; buttons: string[]; tables: string[]; admin: boolean }[] = [];

for (const mod of MODULES) {
  const { comp, via } = componentFor(mod.path);
  const file = compToFile.get(comp) ?? '';
  const src = file ? code(read(file)) : '';
  if (!file) noFile++;
  const group = groupOf.get(mod.path) ?? '';
  if (!group && mod.path !== '') noGroup++;
  const gates = [...new Set([...src.matchAll(/can\('([^']+)'\)/g)].map((m) => m[1]))].sort();
  const buttons = [...new Set([...src.matchAll(/>\s*([⭳✎＋↩⊘✓+][^<{]{0,40}|[A-Z][A-Za-z ][^<{]{2,34})<\/button>/g)]
    .map((m) => m[1].trim()).filter((b) => b && !/^\{/.test(b)))].slice(0, 14);
  const tables = [...new Set([...src.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]))].sort();
  if (!tables.length) noTables++;
  rows.push({ path: mod.path, label: mod.label, group, file, via, admin: !!mod.admin,
              acts: actionsOf.get(mod.path) ?? [], gates, buttons, tables });
}

P(`## The count`);
P();
P(`| | |`);
P(`| --- | --- |`);
P(`| Screens in \`MODULES\` | **${MODULES.length}** |`);
P(`| …with a component this script could resolve | ${MODULES.length - noFile} |`);
P(`| …on the menu | ${MODULES.length - noGroup} |`);
P(`| …naming a table in their own source | ${MODULES.length - noTables} |`);
P(`| Redirects (not screens of their own) | ${redirects.size} |`);
P();
P('A screen naming **no table** is not a screen that reads nothing — it reads');
P('through a function in `src/lib`, which this script deliberately does not');
P('follow. The column is a **floor**, and saying so is the point: an inventory');
P('that guessed would be read as a census.');
P();

// A PAGE CAN LEGITIMATELY HAVE NO MENU ENTRY, and calling that a gap would be
// the same false finding as the eight this script produced on its first run.
// `/exports` is the case: it is the PARENT key that grants every report, and
// the menu lists the reports themselves rather than the hub.
const childrenOnMenu = (p: string) =>
  [...groupOf.keys()].filter((k) => k !== p && k.startsWith(`${p}/`));

for (const g of [...new Set(rows.map((r) => r.group || 'Not on the menu'))]) {
  P(`## ${g}`);
  P();
  for (const r of rows.filter((x) => (x.group || 'Not on the menu') === g)) {
    P(`### ${r.label} \`${r.path}\``);
    P();
    P(`- **Opened by** \`${moduleAction(r.path)}\`${r.admin ? ' · administrator-only screen' : ''}`);
    if (!r.group) {
      const kids = childrenOnMenu(r.path);
      P(kids.length
        ? `- **Not on the menu itself** — it is the parent key, and the menu lists its ${kids.length} reports instead. Granting it grants all of them.`
        : `- **Not on the menu** — reachable by URL or from another screen only.`);
    }
    P(`- **Source** ${r.file ? `\`${r.file}\`` : '— **not resolved from `App.tsx`**'}${r.via ? ` (${r.via})` : ''}`);
    if (r.acts.length) {
      P(`- **Actions an administrator can grant** (from the permission matrix):`);
      r.acts.forEach((a) => P(`  - \`${a}\` — ${actionLabel.get(a) ?? '*(no label in ACTIONS)*'}`));
    } else {
      P(`- **Actions an administrator can grant**: none — the screen is opened or it is not.`);
    }
    // THE DIFFERENCE IS THE INTERESTING PART: a right the screen tests that the
    // matrix does not offer cannot be granted from the matrix.
    const unoffered = r.gates.filter((x) => !r.acts.includes(x) && x !== moduleAction(r.path));
    if (unoffered.length) P(`- **Also tested in the screen** (not offered under this page in the matrix): ${unoffered.map((x) => `\`${x}\``).join(', ')}`);
    if (r.buttons.length) P(`- **Buttons** ${r.buttons.map((b) => `“${b}”`).join(', ')}`);
    if (r.tables.length) P(`- **Reads directly** ${r.tables.map((t) => `\`${t}\``).join(', ')}`);
    P();
  }
}

if (redirects.size) {
  P('## Redirects');
  P();
  P('Paths that resolve to another screen rather than being one.');
  P();
  redirects.forEach((to, from) => P(`- \`${from}\` → \`${to}\``));
  P();
}

process.stdout.write(`${out.join('\n')}\n`);

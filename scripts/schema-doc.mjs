#!/usr/bin/env node
// ===========================================================================
// THE DATABASE SCHEMA, WRITTEN BY THE DATABASE.
//
// The user, 2026-09-09: "Prepare a detailed schema document of all the tables
// present and also their relationship with each other and their keys ... Always
// record the field type, it's allowed values, if coming from a master then that
// detail also. make a note of the permission and actions on all these schema."
//
// GENERATED, NOT WRITTEN, and that is the whole point. There are 61 tables,
// 24 views, 1,400+ columns and 117 policies across 156 migrations. A schema
// document typed by hand is wrong the day after the next migration, and a
// schema document that is WRONG is worse than none — somebody plans around it.
// This introspects a real database built from the migrations, so re-running it
// is how the document stays true.
//
// It is also the project's own standing rule applied to documentation: verify
// against a database, never by reading the SQL. Reading 156 files to describe a
// column's default is exactly the method that has produced wrong answers here
// before.
//
// ALLOWED VALUES come from three places and the document says which, because
// they are enforced very differently:
//   * a CHECK constraint      — the database refuses anything else
//   * a MASTER value list     — a person maintains it; anything can be stored
//   * a foreign key           — it must exist in the other table
//
// PERMISSIONS are the RLS policies verbatim, per table, per command. That is
// the honest answer to "who can do what": the app's buttons are a suggestion,
// the policy is the rule.
//
// Usage:
//   node scripts/schema-doc.mjs "<psql args>" > docs/DATABASE_SCHEMA.md
// e.g.
//   node scripts/schema-doc.mjs "-h /tmp/pg -p 55432 -U postgres -d schema"
// ===========================================================================

import { execFileSync } from 'node:child_process';

const args = (process.argv[2] ?? '').trim();
if (!args) {
  console.error('Usage: node scripts/schema-doc.mjs "<psql args>"');
  process.exit(2);
}

// SPLIT ON A RECORD SEPARATOR, NOT ON NEWLINES. 25 of the RLS policies have a
// multi-line `qual`, so line-based parsing silently split one policy across
// several rows -- the document then claimed 170 policies where the database has
// 117, the extras being fragments of real ones. A schema document that is wrong
// is worse than none, and this is exactly how it would have got there.
const FS = '\u001f';   // field separator
const RS = '\u001e';   // record separator
const q = (sql) => {
  const out = execFileSync('psql', [...args.split(/\s+/), '-tA', '-F', FS, '-R', RS, '-c', sql], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  // TRIMMED, because psql leaves a trailing newline on the final record -- so
  // the last column of the last row fails an equality test for a reason that is
  // invisible in the output.
  return out.split(RS).filter((r) => r.trim() !== '').map((r) => r.split(FS).map((v) => v.trim()));
};

// ---- what the app feeds from a master value list -------------------------
// Read from the code rather than guessed: these are the useMaster() call sites
// and what each list actually fills. A master is NOT a constraint — the column
// will accept anything — so the document has to say "maintained, not enforced".
const MASTER_FED = {
  'calls.standard_complaint': 'complaint (Standard Complaint)',
  'field_calls.standard_complaint': 'complaint (Standard Complaint)',
  'installation_calls.standard_complaint': 'complaint (Standard Complaint)',
  'pm_calls.standard_complaint': 'complaint (Standard Complaint)',
  'call_requests.standard_complaint': 'complaint (Standard Complaint)',
  'reports.pending_reason': 'pendingreason (Call Pending Reason)',
  'calls.call_type': 'calltype (Call Type)',
  'field_calls.call_type': 'calltype (Call Type)',
  'calls.cancel_reason': 'cancelreason (Call Cancel Reason)',
  'call_reviews.complaint_grouping': 'dccrgrouping (DCCR Complaint Grouping)',
  'call_reviews.root_cause_keyword': 'rootcause (Root Cause Key Word)',
  'parties.party_name': 'party — derived from the parties table itself',
  'products.item_name': 'product — derived from the products table itself',
  'parts.item_detail': 'spare — derived from the parts table itself',
};

const out = [];
const w = (s = '') => out.push(s);

// ---- gather ---------------------------------------------------------------
const tables = q(`select c.relname, c.relkind, coalesce(obj_description(c.oid), ''),
    case when c.relrowsecurity then 't' else 'f' end
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','v')
  order by c.relkind, c.relname`);
// NOTE the explicit case: `relrowsecurity::text` renders 'true'/'false', not the
// 't'/'f' psql shows for a raw boolean column. Comparing the cast to 't' made
// EVERY table in this document claim row-level security was off -- on the one
// property nobody would double-check because it was stated so confidently.

const cols = q(`select c.table_name, c.ordinal_position::int, c.column_name, c.data_type,
    coalesce(c.character_maximum_length::text,''), c.is_nullable, coalesce(c.column_default,''),
    coalesce(c.is_identity,'NO'), coalesce(c.is_generated,'NEVER'),
    coalesce(col_description(('public.'||quote_ident(c.table_name))::regclass, c.ordinal_position), '')
  from information_schema.columns c
  where c.table_schema='public' order by c.table_name, c.ordinal_position`);

const pks = q(`select rel.relname, string_agg(a.attname, ', ' order by k.ord)
  from pg_constraint con
  join pg_class rel on rel.oid=con.conrelid
  cross join lateral unnest(con.conkey) with ordinality k(attnum, ord)
  join pg_attribute a on a.attrelid=rel.oid and a.attnum=k.attnum
  where con.contype='p' and rel.relnamespace='public'::regnamespace
  group by rel.relname`);

const fks = q(`select rel.relname, con.conname,
    (select string_agg(a.attname, ', ' order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
       join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.attnum),
    fr.relname,
    (select string_agg(a.attname, ', ' order by k.ord) from unnest(con.confkey) with ordinality k(attnum, ord)
       join pg_attribute a on a.attrelid=con.confrelid and a.attnum=k.attnum),
    case con.confdeltype when 'c' then 'cascade' when 'n' then 'set null' when 'r' then 'restrict' else 'no action' end
  from pg_constraint con
  join pg_class rel on rel.oid=con.conrelid
  join pg_class fr on fr.oid=con.confrelid
  where con.contype='f' and rel.relnamespace='public'::regnamespace
  order by rel.relname, con.conname`);

const uniq = q(`select rel.relname, con.conname,
    (select string_agg(a.attname, ', ' order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord)
       join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.attnum)
  from pg_constraint con join pg_class rel on rel.oid=con.conrelid
  where con.contype='u' and rel.relnamespace='public'::regnamespace order by rel.relname`);

const uidx = q(`select t.relname, i.relname, pg_get_indexdef(x.indexrelid)
  from pg_index x join pg_class i on i.oid=x.indexrelid join pg_class t on t.oid=x.indrelid
  where x.indisunique and not x.indisprimary and t.relnamespace='public'::regnamespace
  order by t.relname, i.relname`);

const checks = q(`select rel.relname, con.conname, pg_get_constraintdef(con.oid)
  from pg_constraint con join pg_class rel on rel.oid=con.conrelid
  where con.contype='c' and rel.relnamespace='public'::regnamespace order by rel.relname`);

const pols = q(`select tablename, policyname, cmd, coalesce(roles::text,''),
    coalesce(qual,''), coalesce(with_check,'')
  from pg_policies where schemaname='public' order by tablename, cmd, policyname`);

const trigs = q(`select rel.relname, t.tgname, p.proname
  from pg_trigger t join pg_class rel on rel.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
  where not t.tgisinternal and rel.relnamespace='public'::regnamespace order by rel.relname, t.tgname`);

const viewOpts = q(`select c.relname, coalesce(array_to_string(c.reloptions, ', '), '')
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v' order by c.relname`);

// ---- index by table -------------------------------------------------------
const by = (rows, k = 0) => rows.reduce((m, r) => ((m[r[k]] ??= []).push(r), m), {});
const C = by(cols), FK = by(fks), UQ = by(uniq), UI = by(uidx), CK = by(checks), PL = by(pols), TG = by(trigs);
const PK = Object.fromEntries(pks.map((r) => [r[0], r[1]]));
const VO = Object.fromEntries(viewOpts.map((r) => [r[0], r[1]]));

// Allowed values pulled out of a CHECK: `col = ANY (ARRAY['a'::text, ...])`
function allowedFromChecks(table, col) {
  for (const [, , def] of CK[table] ?? []) {
    if (!new RegExp(`\\b${col}\\b`).test(def)) continue;
    const arr = /ARRAY\[(.*?)\]/s.exec(def);
    if (arr) {
      const vals = [...arr[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
      if (vals.length) return vals.map((v) => (v === '' ? '(empty)' : v)).join(' · ');
    }
    if (/> *0|>= *0/.test(def)) return def.replace(/^CHECK ?/, '');
  }
  return '';
}
const fkFor = (table, col) => (FK[table] ?? [])
  .filter(([, , from]) => from.split(', ').includes(col))
  .map(([, , , to, toc]) => `→ ${to}(${toc})`).join(' ');

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const short = (s, n = 150) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ---- write ----------------------------------------------------------------
const base = tables.filter((t) => t[1] === 'r');
const views = tables.filter((t) => t[1] === 'v');

w('# RITHI CRM — database schema');
w();
w('**GENERATED — do not hand-edit.** Produced by `scripts/schema-doc.mjs` from a');
w('database built out of `supabase/migrations/`. Re-run it after any migration:');
w();
w('```bash');
w('node scripts/schema-doc.mjs "-h /tmp/pg -p 55432 -U postgres -d schema" > docs/DATABASE_SCHEMA.md');
w('```');
w();
w('It is generated rather than written because a schema document that is WRONG is');
w('worse than none — somebody plans around it. Reading 156 migration files to');
w('describe a default is the method that has produced wrong answers in this');
w('project before.');
w();
w(`**${base.length} tables · ${views.length} views · ${cols.length} columns · ${pols.length} policies · ${fks.length} foreign keys.**`);
w();
w('## How to read this');
w();
w('**Allowed values** come from three places and they are enforced very differently:');
w();
w('| Source | Shown as | Enforcement |');
w('| --- | --- | --- |');
w('| `CHECK` constraint | the value list | **The database refuses anything else.** |');
w('| Master value list | `master: <key>` | **Maintained, not enforced** — a person keeps the list, and the column will still accept anything written to it directly. |');
w('| Foreign key | `→ table(col)` | It must exist in the other table. |');
w();
w('**Permissions** are the row-level security policies, verbatim. That is the honest');
w('answer to "who can do what": the app\'s buttons are a suggestion, the policy is the');
w('rule — and a table with RLS on and **no** policy for a command denies everyone.');
w();
w('---');
w();
w('## Contents');
w();
for (const [name] of base) w(`- [${name}](#${name.replace(/_/g, '-')})`);
w();
w('Views are listed [after the tables](#views).');
w();
w('---');
w();

for (const [name, , comment, rls] of base) {
  w(`## ${name}`);
  w();
  if (comment) { w(`> ${esc(comment)}`); w(); }
  const pk = PK[name];
  w(`**Primary key:** ${pk ? `\`${pk}\`` : '_none_'} · **Row-level security:** ${rls === 't' ? '**on**' : '_off_'}`);
  w();

  // Columns
  w('| # | Column | Type | Null | Default | Allowed values / reference |');
  w('| --- | --- | --- | --- | --- | --- |');
  for (const [, pos, col, type, len, nullable, def, ident, gen, ccomment] of C[name] ?? []) {
    const t = len ? `${type}(${len})` : type;
    const flags = [];
    if (ident === 'YES') flags.push('identity');
    if (gen === 'ALWAYS') flags.push('generated');
    const allowed = [
      allowedFromChecks(name, col),
      fkFor(name, col),
      MASTER_FED[`${name}.${col}`] ? `master: ${MASTER_FED[`${name}.${col}`]}` : '',
      ccomment ? esc(ccomment) : '',
    ].filter(Boolean).join(' · ');
    w(`| ${pos} | \`${col}\` | ${t}${flags.length ? ` _(${flags.join(', ')})_` : ''} | ${nullable === 'YES' ? 'yes' : '**no**'} | ${def ? `\`${esc(short(def, 60))}\`` : ''} | ${allowed} |`);
  }
  w();

  // Keys and relationships
  const u = [...(UQ[name] ?? []).map(([, n, c]) => `\`${c}\` _(${n})_`),
             ...(UI[name] ?? []).map(([, n, d]) => {
               const m = /\((.*)\)\s*(WHERE.*)?$/s.exec(d);
               return `\`${m ? m[1] : d}\`${/WHERE/i.test(d) ? ' _(partial)_' : ''} _(${n})_`;
             })];
  if (u.length) { w(`**Unique:** ${u.join(' · ')}`); w(); }

  if ((FK[name] ?? []).length) {
    w('**References:**');
    w();
    for (const [, cname, from, to, toc, del] of FK[name]) {
      w(`- \`${from}\` → **${to}**(\`${toc}\`) · on delete ${del} _(${cname})_`);
    }
    w();
  }
  const referrers = fks.filter(([, , , to]) => to === name);
  if (referrers.length) {
    w(`**Referenced by:** ${[...new Set(referrers.map(([r, , from]) => `${r}.${from}`))].map((s) => `\`${s}\``).join(' · ')}`);
    w();
  }

  const otherChecks = (CK[name] ?? []).filter(([, , d]) => !/ARRAY\[/.test(d));
  if (otherChecks.length) {
    w('**Constraints:**');
    w();
    for (const [, cn, d] of otherChecks) w(`- \`${cn}\` — \`${esc(short(d, 200))}\``);
    w();
  }

  if ((TG[name] ?? []).length) {
    w(`**Triggers:** ${TG[name].map(([, t, f]) => `\`${t}\` → \`${f}()\``).join(' · ')}`);
    w();
  }

  // Permissions
  w('**Permissions**');
  w();
  if (!(PL[name] ?? []).length) {
    w(rls === 't'
      ? '_RLS is ON and there is no policy — **nothing is permitted** to a normal role. Reached only by the owner or a `security definer` function._'
      : '_No policies, RLS off — reachable by anything with table privileges._');
  } else {
    w('| Command | Policy | Using | With check |');
    w('| --- | --- | --- | --- |');
    for (const [, pn, cmd, , qual, wc] of PL[name]) {
      w(`| ${cmd} | \`${pn}\` | ${qual ? `\`${esc(short(qual, 180))}\`` : '—'} | ${wc ? `\`${esc(short(wc, 180))}\`` : '—'} |`);
    }
  }
  w();
  w('---');
  w();
}

w('## Views');
w();
w('A view over an RLS-protected table **must** carry `security_invoker=on`, or it');
w('reads as its OWNER and row-level security stops applying to whoever is reading —');
w('silently, with no error. `npm run check:views` fails any that lacks it.');
w();
w('| View | security_invoker | Columns |');
w('| --- | --- | --- |');
for (const [name] of views) {
  const n = (C[name] ?? []).length;
  w(`| \`${name}\` | ${/security_invoker=on/.test(VO[name] ?? '') ? '**on**' : '_not set_'} | ${n} |`);
}
w();
for (const [name, , comment] of views) {
  if (!comment) continue;
  w(`**\`${name}\`** — ${esc(comment)}`);
  w();
}

w('---');
w();
w('## Master value lists');
w();
w('Maintained by people under **Master**, not enforced by the database. A column fed');
w('by one will still accept anything written to it directly — which is why the app');
w('picks from these lists rather than letting them be typed.');
w();
w('| List key | Feeds |');
w('| --- | --- |');
const byList = {};
for (const [k, v] of Object.entries(MASTER_FED)) (byList[v] ??= []).push(k);
for (const [list, columns] of Object.entries(byList).sort()) {
  w(`| ${esc(list)} | ${columns.map((c) => `\`${c}\``).join(' · ')} |`);
}
w();

process.stdout.write(`${out.join('\n')}\n`);

# RITHI CRM — working notes for Claude

Vite + React + TypeScript front end for the Field Service module. Data lives in
Supabase (Postgres + RLS + Auth); the Apps Script bridge (`apps-script/CallReg.gs`)
remains for the sheet-era paths — file uploads to Drive, and reads when Supabase
isn't connected.

## Shipping — the default, no need to ask

Every change is **committed, merged to `main`, and deployed**. Pushing to `main`
triggers `.github/workflows/deploy.yml`, which builds and publishes to the
`gh-pages` branch — that is the live site, so nothing is live until it is on
`main`. The loop:

1. Work on the session's feature branch; `npm run build` must pass (it runs
   `tsc --noEmit` first).
2. Commit, push, open the PR.
3. Merge it into `main`, then confirm the "Deploy to GitHub Pages" run succeeded.

If `main` moved, merge it in and resolve rather than rebasing. Check `main`
itself builds **before** merging into it: a branch cut from an old tree can
revert modules when it lands, and the next merge gets blamed for it. (It has
happened twice — see the ⚠️ notes in `docs/BACKLOG.md`. Branch protection
against force-pushes on `main` would turn both from recoverable into
impossible.)

### Verifying a SQL change

`npm run build` does not see SQL. After any change under
`supabase/migrations/`, re-run the bundle generator and apply every migration
to a throwaway Postgres, then run the suites in `supabase/tests/` — each is
written so the only errors in its output are the ones labelled `expect ERROR`:

```bash
node scripts/build-apply-bundles.mjs
initdb -D /tmp/pg/data -U postgres --auth=trust      # as a NON-root user
pg_ctl -D /tmp/pg/data -o "-p 55432 -k /tmp/pg" -l /tmp/pg/log start
psql -h /tmp/pg -p 55432 -U postgres -v ON_ERROR_STOP=1 \
  -f supabase/tests/_stub.sql $(for f in supabase/migrations/*.sql; do echo -n " -f $f"; done)
psql -h /tmp/pg -p 55432 -U postgres -f supabase/tests/<suite>_test.sql
```

Then the three checks that need a database — no bundle undoes another, no view
has lost `security_invoker`, and `_status.sql` tells the truth:

```bash
npm run check:replay -- "-h /tmp/pg -p 55432 -U postgres"          # no -d: it makes its own
npm run check:views  -- "-h /tmp/pg -p 55432 -U postgres -d <db>"
npm run check:status -- "-h /tmp/pg -p 55432 -U postgres -d <db>"
```

And the two that need no database, after any change to `src/lib/uploads.ts`:

```bash
npm run check:uploads        # the shaping behind each register upload
npm run check:upserts -- "<psql args>"
```

`npm run check:generated` needs no database either and belongs after ANY
migration change: it regenerates the bundles into a temporary directory and
fails if what is committed differs. The bundles are the files the user is sent a
LINK to and asked to RUN, so a stale one is wrong SQL handed over as the thing
to apply — and **no other check can see it**, because `check:replay` and
`check:status` both build their database from the bundles, so a bundle and an
`all.sql` stale in the same way agree with each other perfectly. It happened
(2026-09-14): `0186_feedback_key.sql` was corrected to drop a partial unique
index and committed without re-running the generator, and `data_integrity.sql`
went on carrying the partial index while its raw link was being handed out.

`check:uploads` is in this list because it was NOT, and drifted: two of its
assertions had been failing on `main` unnoticed — one still looking for
`Purchase Cost` in `extra` after 0148 gave `parts` a real column, one counting
30 registers after a 31st was added. A check nobody runs is a check that
records what used to be true.

`check:status` runs `_status.sql` against that database and fails on any NO.
Nothing can be missing there, so **every NO is a faulty check** — and a row that
answers NO when nothing is missing is worse than no row, because it is ACTED ON:
it sends somebody to re-run a bundle already in, and teaches them a NO here may
mean nothing. It happened (2026-09-13): two Field Failure rows read NO on the
live project because 0169 had legitimately dropped the zero-argument
`next_ffr_no()` and rewritten `ffr_from_review` as a wrapper, and the rows went
on testing the old shape. **When a migration replaces a definition, move the
`_status.sql` row with it.**

## Conventions

- **Migrations** — `supabase/migrations/`, numbered **per module**, so two files
  can share a number (`0011_spare_intake.sql`, `0011_call_request_actions.sql`).
  Go by file name, never the number. Other sessions add migrations at the same
  time, so **re-check for a collision after merging `main`** and renumber if
  yours is taken — safe even once the SQL has been applied, since the bundles
  are idempotent.
- **Apply bundles** — `supabase/apply/*.sql` are GENERATED. Edit the migration,
  add it to the right module in `scripts/build-apply-bundles.mjs`, re-run
  `node scripts/build-apply-bundles.mjs`, and commit the result.
  `npm run check:generated` is what proves you did (see above). `_status.sql`
  is hand-maintained: add a row when a bundle gains a checkable object.
- **User-visible change** → add a `CHANGELOG` entry in `src/lib/changelog.ts`
  (in-app Version History) and bump `package.json`. Write it in the user's
  words, not the code's. `main` has often claimed your version already from
  another branch: take the next one **above** it rather than renumbering
  theirs, and keep `package-lock.json`'s two version fields in step.
- **Migrations auto-apply once `SUPABASE_DB_URL` is set** (2026-09-09) — BUILT
  BUT NOT YET PROVEN AGAINST THE LIVE PROJECT, and **parked** at the user's
  request. The first attempt failed on an unencoded `@` in the password, before
  reaching the database. Until it has run green once, treat the manual step
  below as the live path and do not tell the user their SQL is automatic.
  `docs/BACKLOG.md` has the diagnosis.
  `.github/workflows/db-migrate.yml` runs `scripts/apply-migrations.mjs` on a
  push to `main` that touches `supabase/migrations/`, applying only what its
  ledger (`public.schema_migrations`) says has not run — each in ONE
  transaction with a short `lock_timeout`, so a migration that cannot get its
  lock rolls back whole instead of deadlocking against the live app (which is
  what a hand-run bundle did). A pull request only dry-runs.
  **An existing database must be baselined first** (Actions → Apply database
  migrations → mode: `baseline`) or the script refuses rather than re-running
  155 migrations. Until the secret is added, everything below still applies.
  The bundles remain the REBUILD path, not the update path — running one to
  apply two new statements re-executes the other 150, which is what took the
  locks.
- **Applying SQL to the live Supabase project stays the user's step** while
  that secret is unset. Name the
  bundle to run (`_status.sql` first, then what it flags) — never assume a
  migration is live because it is merged.
  **`Spare_1.sql` and `HandStock_X.sql` are at the REPOSITORY ROOT**, not in
  `supabase/apply/` — they are the two numbered consolidated files handed round.
  A link to the wrong path 404'd once, and **that claim was false when it was
  written**: `check:ui` checked meta-commands and nothing else, which is the
  fault this file warns about elsewhere — a comment claiming a check exists is
  the reason nobody looks. It is true now, for one specific thing: every
  `Restore: <file>` named in `_status.sql` must exist, as a bundle in
  `supabase/apply/` or one of the two root files. Written after doing it twice
  in one week — a raw link to a file only on a branch, and row 166 plus a
  changelog entry naming `handstock.sql`, whose real name is `HandStock_X.sql`
  at the repository ROOT. A name in a Restore clause is read by somebody
  deciding WHAT TO RUN.
  **THE SUPABASE SQL EDITOR IS NOT psql.** Everything in `supabase/apply/` is
  pasted into that editor, so a psql meta-command (`\set`, `\echo`, `\i`) is
  not a command there but a syntax error on its own line —
  `_dccr_undo.sql` shipped with ten of them and came straight back as
  `ERROR: 42601: syntax error at or near "\"`. Write one statement that returns
  a report rather than several with `\echo` between them; that editor shows one
  result grid. `check:ui` refuses a meta-command in any hand-run SQL file.
  **Always give the LINK, not just the file name** (user's ask, 2026-09-03):
  `https://github.com/neurolooom-eng/RITHI_CRM/blob/main/<path>` to read it,
  `https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/<path>` to
  copy it. Same for a snippet pasted into chat — say which file it came from
  and link that file.
- **`docs/REQUIREMENTS.md` is GENERATED — never hand-edit it.** ONE document,
  grouped by module: every user requirement, the system requirements
  implementing it, and the tests proving those. `npm run docs:reqs` assembles it
  from where each is MAINTAINED — `src/lib/validation.ts` (URS/FRS/tests),
  `docs/CALL_REQUEST_REQUIREMENTS.md` (CR) and `docs/ISO13485_SERVICING.md`
  (SR) — because a hand-kept fifth copy is the one that goes stale while reading
  as authoritative. **DERIVED BY DEFAULT, DECLARED BY EXCEPTION**,
  unioned rather than one replacing the other, and every entry says which of the
  two filed it. Derived: the requirement's own words name the module — its
  route, or every distinctive word of its label — so the grouping is evidence
  rather than opinion and moves when the text does. Declared: `Req.modules` in
  `validation.ts`, with a written reason, for the ones whose words name nothing.
  **Derivation alone left 34 of 56 screens with no requirement section**,
  including the Field Call Register — URS-003 says "register a customer call"
  and never says "field" — which is what the user found. It is 2 of 56 now, both
  listed with their reason in `MODULES_WITHOUT_REQUIREMENT`, and `check:ui`
  fails on a third appearing without one, or on a declaration naming a route
  that does not exist. **Do not invert the DERIVED match to claim a screen is
  uncovered**: it was, for one run, and reported 31 of 54 as unnamed. Ask it of
  the FILED set (`modulesWithNoRequirement()`), which is a different question,
  or `REQUIREMENT_COVERAGE.md` for the whole package.
  The document also carries the **traceability matrix** — URS / FRS / test in
  six columns, ONE ROW PER LINK, so a test proving two mechanisms is two rows
  and a requirement nothing proves still gets one with the gap named.
  Re-run it after changing any requirement. It caught the first stale count it
  was pointed at: CLAUDE.md said the servicing reference had 37 requirements
  and it defines 44.
- **`public/docs/spare-module-schema.html` IS THE SPARE MODULE'S SCHEMA, for a
  reader rather than a generator** — the fields that carry a decision, who fills
  each one, what it refuses in the words it refuses it, and the links up and
  downstream. Its facts are INTROSPECTED the same way `DATABASE_SCHEMA.md`'s are,
  for the same reason, and it must be re-checked against a database after any
  migration touching the module. **It deliberately does not read "mandatory" off
  `NOT NULL`**, because that is wrong in both directions here: most `NOT NULL`
  columns in the module carry a default, and four of the genuinely required
  fields on a reconciliation are NULLABLE and demanded by a trigger. The badge
  answers "must I put something here?" and the rule beside it says what enforces
  that. Writing it is what found the missing guard above.
- **`docs/DATABASE_SCHEMA.md` is GENERATED — never hand-edit it.** 61 tables,
  24 views, 1,400+ columns, 117 policies. `npm run schema:doc -- "<psql args>"`
  introspects a database built from the migrations and writes the whole thing:
  types, defaults, keys, relationships, **allowed values** (a CHECK, a master
  list or a foreign key — it says which, because they are enforced very
  differently) and the **RLS policies verbatim** per table. Re-run it after any
  migration. Generated rather than written for the project's own reason: a
  schema description that is WRONG is worse than none, and reading 156 files to
  describe a default is the method that has produced wrong answers here.
  Writing the generator proved the point twice — `relrowsecurity::text` renders
  `true`/`false` (not `t`/`f`), so the first draft told the reader RLS was OFF on
  all 61 tables; and 25 policies have multi-line `qual`, so line-based parsing
  reported 170 policies where there are 117.
- **`docs/BACKLOG.md`** is the running record — mark what shipped and what is
  still pending (a migration to run, a redeploy to do) as part of the change.
- **`docs/CALL_REQUEST_REQUIREMENTS.md`** is the standing reference for the CALL
  REQUEST module — 31 requirements (CR-001…CR-031) covering the keys, the
  machine-names-the-customer rule, what a request must capture, the installation
  exception, status, visibility, performance and the records. **Read it before
  changing anything on that form.** The module was redesigned on 2026-09-11/12
  and the reasoning was spread across a dozen commit messages; it is gathered
  there. Two rules in it are easy to undo by accident: the customer search must
  never come BEFORE the machine search (CR-006 — the party filter stays
  conditional), and the visibility rule is evaluated once per query rather than
  once per row (CR-024). Its status lines are updated in the same change that
  makes one true.
- **`docs/HOW_TO_USE.md`** is the USER-FACING handbook for the WHOLE application
  — all 50 modules in `MODULES`, what each screen is for and the rules that are
  easy to get wrong. A module added to `MODULES` belongs here too.
  Written in the user's words, not the code's. Update it in the same change that
  makes one of its statements untrue; where it and the code disagree, the code
  is the fact and the handbook is the bug.
  Shareable copy: <https://claude.ai/code/artifact/a6cb9ac1-cd68-47f7-9ce9-7e88eafc5908>
- **`docs/COVER_FIELD_COMPARISON.md`** is the field-by-field comparison of the
  WARRANTY and CONTRACT registers — all four AppSheet tables (`WarrantySale`,
  `WarrantySaleDetails`, `ContractEntry`, `ContractDetails`) against what is
  here, 108 columns, each with a verdict and the remaining gaps ranked. Read it
  before changing either register. Its two sources are named in it and they are
  not interchangeable: `Admin_AppDef.pdf` (AppSheet's column properties) and
  `Appsheet - Forms.xlsx` (the SPREADSHEET formulas the PDF withholds — it
  prints those columns' outputs and not their rules, which is why 0036 had to
  guess the expiry band and 0187 could stop guessing).
  Shareable copy: <https://claude.ai/code/artifact/09231279-fa36-41b1-ab7e-c24af8d3b7bb>
- **`docs/ISO13485_SERVICING.md`** is the standing reference for what the
  SERVICING PROCESS must do — 44 requirements (SR-001…SR-044) from ISO 13485
  §7.5.4 and the clauses it reaches into, each assessed against this system.
  **Read it before building anything in the servicing path**, and update the
  requirement's status line in the same change that closes it. Two things it is
  not: it is not the software validation package (`src/lib/validation.ts`, which
  answers §4.1.6 — whether the app is fit to be *used* in the QMS), and it is not
  approved — it is a DRAFT whose clause mappings are for RA/QA to confirm.
  **Software validation does not discharge a process requirement**, which is why
  the two are separate documents and must not be merged.
  Shareable copy: <https://claude.ai/code/artifact/3696155c-2394-43ad-b017-a614f69c3219>
- **CallReg redeploys** — a change to `apps-script/CallReg.gs` is not live until
  the Web App is redeployed. When a new `/exec` URL arrives, bake it into
  `DEFAULT_SHEETS_URL` in `src/lib/sheets.ts` and bump `DEFAULT_URL_VERSION`, so
  every client supersedes its stored URL instead of each device editing Settings.

## Gotchas

- **Check what is actually applied before diagnosing anything.** Run
  `supabase/apply/_state_check.sql` (read-only). Most "role bugs" this project
  has produced were a migration that had not been run, and `docs/BACKLOG.md`
  claimed the opposite twice — once nearly causing a needless rebuild of the
  live `calls` tables. The backlog is a record, not evidence.
- **`docs/COVER_REQUIREMENTS.md` IS THE STANDING REFERENCE FOR COVER** — warranty,
  contract, ownership transfer and the assembled machine record, 20 requirements
  (CW-001…CW-020) each mapped to the ISO 13485:2016 clause it serves, with a
  status line and a ranked gap list. The THIRD hand-maintained reference after
  CR and SR, and `requirements-doc.ts` folds it into `REQUIREMENTS.md` the same
  way. **Read it before changing anything about cover**, and update a status
  line in the same change that makes it true.
- **A VIEW A SCREEN READS MUST BE GRANTED TO `authenticated`, AND THE OMISSION
  HIDES.** 28 of the 30 views these migrations create carry
  `grant select ... to authenticated`; `product_database_v2` shipped without
  one. Supabase's default privileges usually cover a view created by
  `postgres` — which is exactly why it hides — and "usually" is not a rule to
  rely on for the one object a new screen reads, nor for a project rebuilt in a
  different order. `check:ui` refuses it now; `calls` is the only exemption,
  because it REPLACED a table and inherited that table's privileges.
- **2.0 CAN LEGITIMATELY LIST FEWER MACHINES THAN `machine_cover`, AND AN EMPTY
  SCREEN IS NOT PROOF OF A FAULT.** It requires a register row to carry a
  serial **and** a product name, because a machine is its model and its serial;
  `machine_cover` requires only the serial, which is why it shows rows 2.0 will
  not — and why the ones it shows can be two machines merged into one. A
  register carrying serials with blank product names therefore produces an
  EMPTY 2.0 and a populated `machine_cover`, and neither is broken.
  **`supabase/apply/_why_is_product_database_2_empty.sql` answers it with the
  project's own numbers**: per register, how many rows have a serial, how many
  have a product name, and how many have BOTH — rows 4, 8 and 11 are the
  answer. Ask it before changing the view: the alternative fix (fall back to the
  model in `products` by serial, and only where exactly ONE machine has that
  serial) is a real option but must not be built on a guess about the data.
- **PRODUCT DATABASE 2.0 IS A VIEW BESIDE THE OLD ONE, NOT A REPLACEMENT** (the
  user, 2026-09-20: *"Do Not disturb the current product Database, create this
  as Product Database 2.0"*). `product_database_v2` (0218) is one row per
  MACHINE — model and serial — assembled from `warranty_sale_details`,
  `contract_details`, `product_additional_entries`, `ownership_transfers` and
  the installation call. `public.products` and `machine_cover` are untouched.
  **Three places it deliberately disagrees with `machine_cover`**, which is why
  a second view exists rather than an edit to that one: it keys on PRODUCT +
  SERIAL where that view keys on the serial ALONE (so that one merges the eleven
  machines numbered 219 into one row wearing one machine's cover); it reads FIVE
  registers where that one reads two (Ownership Transfer and Additional Entries
  are not consulted there at all); and **WARRANTY DECIDES BEFORE CONTRACT**,
  where that one asks the contract first. A contract with a blank type reads
  `CONTRACT (TYPE NOT RECORDED)` rather than that view's guess of CMC.
  **`cover_period_end()` reproduces `addPeriod()`'s JAVASCRIPT MONTH OVERFLOW**:
  31 January plus one month is 2 March, where Postgres's own interval arithmetic
  clamps to 27 February — 26 of 458 start/period pairs differ, proved against
  the application rather than reasoned about. `_status.sql` row 169;
  `supabase/apply/_product_database_2_vs_1.sql` counts the disagreements on live
  data, because this repository can rank the gaps by consequence and cannot
  count them.
  **IT IS ITS OWN BUNDLE, LAST IN `ALL_ORDER`, AND THAT IS NOT TIDINESS.** It
  reads `cover_code()` (0208, `data_integrity`) and `imported_ts()` (0215,
  `performance`), and BOTH a SQL-language function body and a view are resolved
  AT CREATION — so filed with the registers it reads it died twice, once on each.
  `check:replay` found both.
- **A MODULE NAME WITH A DIGIT WAS INVISIBLE TO `check:bundles`.** Its parser
  matched `^  ([a-z_]+): \{`, so `product_database_2` was not merely unchecked —
  its files fell into the PRECEDING module's chunk and the mirror rule was
  reported against a module that does not own them (*"0122_spare_requests_replay_tail.sql
  must be the LAST file in module spare_requests — it is followed by
  0218_product_database_v2.sql"*, naming two files that share no module). Widened
  to `[a-z0-9_]+`. A check that silently absorbs a module into its neighbour is
  worse than one that refuses it.
- **A `Restore:` CLAUSE MUST NAME A BUNDLE THAT CARRIES THE MIGRATION, AND
  "THE FILE EXISTS" WAS THE ONLY THING CHECKED.** Row 167 told somebody to run
  `HandStock_X.sql` to restore **0215**, which lives in the `performance`
  module and is in no other bundle — so the row went on reading NO however many
  times they ran what it named, and `product_database_2.sql` then died on
  `function public.imported_ts(jsonb, unknown) does not exist`. `check:ui` now
  matches the row's own migration — the PARENTHESISED convention, `(0215)` —
  against the bundle's SECTION HEADER (`^-- 0215_….sql`). Two traps found while
  writing it, both of which would have made the check lie: a bare number in the
  prose is not the row's migration (row 81 says *"notify_spare_dispatched
  carries 0064"*), and a bare `includes` reads a bundle's own PREFLIGHT COMMENT
  — which names what it needs — as proof it carries it.
- **NEVER `sed` A SHARED STRING ACROSS `_status.sql`.** `sed -i
  "s|Restore: data_integrity.sql|Restore: product_database_2.sql|"` rewrote
  **all five** rows that legitimately named `data_integrity.sql`, not the one
  intended — rows 132, 139, 142, 145 and 160 all began telling people to run a
  bundle that has nothing to do with them. The same mistake hit `validation.ts`
  two days earlier, where a global rename of `URS-053` silently renumbered a
  pre-existing requirement and orphaned three FRS links. **Edit by ROW, splitting
  on the row opener**, and diff the `Restore:` tally before and after.
- **A BUNDLE WITH A CROSS-MODULE DEPENDENCY MUST DECLARE IT IN `needs`.** The
  `preflight()` guard turns a mid-file Postgres error into *"Apply these first,
  then re-run this bundle: imported_ts() — 0215… (apply bundle: performance)"*.
  `product_database_2` declares `importedTs` and `coverCode`; proved by building
  a database with 0215 deliberately left out and running the bundle at it.
- **A PROBE'S "CHANGE ME" LINE MUST NOT DEFAULT TO SOMEBODY REAL.**
  `_why_is_it_empty.sql` and `_why_is_it_empty_2.sql` both shipped with a live
  address on that line, so running either unchanged returned a COMPLETE,
  PLAUSIBLE, CONFIDENTLY WRONG grid about a DIFFERENT PERSON — worse than no
  answer, because nothing in it reads as an error. It happened (2026-09-18): the
  file was run to check a Hotline Engineer and reported an ENGINEER's numbers,
  and the only thing that gave it away was row 1 printing the email it matched.
  **`CHANGE-ME@example.com`** is the default now — `example.com` is reserved for
  this (RFC 2606) and can match no profile, so an unchanged run SAYS SO.
  `check:ui` refuses any other default in `supabase/apply/_*.sql`, and **row 1
  is read first, every time**.
- **AN OFFICE ROLE MAKES A "SMALL" SCREEN REGISTER-SIZED** (reported
  2026-09-18: *"HotLine Engineer -- All Data should be Visible for this user"*).
  Pending Registrations reads `call_requests` through `cr_read`, whose FIRST
  branch is `can_view_all_calls()` — which NAMES hotline — so the Hotline desk's
  pending list is the WHOLE COMPANY'S, not one person's. It was `.limit(300)`,
  unpaged, and `check:ui`'s `.limit(n > 1000)` rule cannot see that: 300 is
  UNDER the PostgREST cap, so nothing was lying about truncation — the screen
  simply stopped at 300 and reported it as *"300 pending call registrations"*
  with no `+`. **When a role sees everything, re-ask which reads are
  register-sized**; `allRows()` with a tiebreaker after `submitted_at`, because
  a bulk import makes ties certain and a tie puts a row on two pages or neither.
  **AND THE PERMISSIONS WERE NOT THE FAULT.** Measured on a database: a
  `hotline` profile gets `can_view_all_calls() = true` and sees all four
  requests including both pending ones raised by somebody else. An empty screen
  there means the queue is clear. `_why_is_it_empty_2.sql` now prints what a
  person SEES beside what EXISTS, because either number alone answers nothing.
  **THAT PROBE ONLY IMPERSONATES ON THE REAL PROJECT**: it sets
  `request.jwt.claims`, which Supabase's `auth.uid()` reads, while
  `supabase/tests/_stub.sql` replaces `auth.uid()` with a stand-in reading the
  `harness` TABLE. Run it locally and the claims are ignored,
  `can_view_all_calls()` comes back NULL and every count reads 0 — which looks
  exactly like a damning finding and is an artefact. Use `call public.be(...)`
  for the harness; the probe is for the live project.
- **Pending Registrations reads `call_requests`, not `pending_registrations`.**
  `listPending()` → `listCallRequestsAsPending()`. Two fixes were aimed at the
  wrong table before this surfaced; `pending_registrations` is the sheet-era
  table. Its policy is `cr_read` (0003).
- **A role that sees NOTHING is usually the `has_perm` gate, not the scope.**
  The call policies are `has_perm('calls.view') AND <visibility>`. `has_perm`
  falls back to the `engineer` defaults only when the role's `app_roles` row has
  ZERO permissions — a row with *some* permissions but missing `calls.view`
  silently blocks everything. Grant by MERGING into `app_roles`, never by
  overwriting: an admin may have tuned the role.
- **Office-role visibility lives in `can_view_all_calls()`** (hotline, nsm,
  commercial, spare_coordinator, stores_incharge, tally_coordinator). A read
  policy only benefits from it if it actually calls it — `cr_read` did not.
  **`SEE_ALL_ROLES` + `roleSeesAllCalls()` in `rbac.ts` are the CLIENT copy of
  that list — ONE copy, and `seesEveryRecord(user, can)` is the wrapper a
  screen uses**, so it can tell the truth when it has nothing to show. An empty list proves what the READER was shown,
  never what exists, so "nothing is waiting" and "nothing is waiting THAT YOU
  MAY SEE" are different claims and only an office role's empty screen supports
  the first. Pending Dispatch asserted the strong one to everybody (*"every
  approved spare has been booked out"*), which is why a Stores Incharge looking
  at an empty queue on 2026-09-18 could not tell whether it was clear or
  filtered — and neither could anybody he asked. `check:ui` compares the client
  list with 0035's SQL word for word; change one, change both.
- **`user.role` IS NOT THE RBAC KEY — `user.rbacRole` IS**, and this is the
  `user.name`/`fullName` trap in a second place. A `User` carries both, and
  `roleFromProfile()` collapses everything that is not admin / rm / rgm /
  viewer into **`'engineer'`** — so a Stores Incharge, an NSM, a Commercial and
  a Tally Coordinator all have `user.role === 'engineer'`. Passing that to a
  role test type-checks, reads correctly, and is the wrong answer for four of
  the six office roles. It shipped on 2026-09-18 in the fix for the line above:
  Pending Dispatch told a Stores Incharge his role was "shown its own and its
  team's spares" while the database was showing him everything — the screen was
  wrong in the opposite direction from the bug it was fixing.
  **`seesEveryRecord()` takes the USER rather than a role string** precisely so
  no call site can pick the wrong field, and `check:ui` refuses both halves (the
  helper reading `user.role`, and any module passing it).
  **And it was a THIRD copy of a list that already existed twice.** `access.ts`
  had been calling `roleSeesAllCalls(identity.rbacRole)` correctly all along.
  Look for the helper before writing one.
- **A BLANK NAME IS NOT A MANAGER, and it used to match one** (0212, reported
  2026-09-18: *"Why is a Regional Manager able to see everyone's call and every
  spare request?"*). `visible_engineer_names()` walks `user_directory` DOWNWARDS
  from the caller by `reporting_manager` AND `regional_manager`, and the walk
  compared names with nothing excluding the EMPTY STRING from either side. A
  caller whose own directory row had a blank `name` therefore asked for everyone
  whose manager is `''` — every row with no manager recorded, which is what a
  partial import or a trimmed cell leaves. Measured both ways on a fixture:
  with the name present he saw his three and himself; with it blank he saw two
  STRANGERS **and lost one of his own**, because the root stopped matching the
  people who name him. The second list is the dangerous one — it is not
  obviously wrong, it reads as a different region. The fix is one condition and
  **only ever narrows**: a tree node with a blank name stops recursing, so a
  caller the directory cannot name sees no team and still sees their own work
  through the policies' id/email branches. The comparison is left EXACTLY as it
  was — adding `btrim()` to both sides would also make `' X '` match `'X'`,
  which is a WIDENING and a different decision. `_status.sql` row 164.
  **THE OTHER WAY THIS HAPPENS IS A PERMISSION, NOT A BUG**: `data.view_all`
  turns `can_view_all_calls()` true for ANY role, no migration grants it to
  `rgm`, so a Regional Manager holding it was ticked by hand on Roles &
  Permissions. `supabase/apply/_who_can_this_person_see.sql` tells the two
  apart.
- **`create or replace view` DROPS `security_invoker`, and a view without it
  reads as its OWNER — so row-level security stops applying to whoever is
  reading, with no error and no warning.** 0040 set it on `calls`, 0050
  re-created the view and set it again, 0057 re-created it and did not: every
  signed-in user could read every call. `pending_calls` and `call_state` carry
  the setting themselves and leaked anyway, because a view marked invoker that
  reads a view running as its owner inherits the owner's reach — marking the
  outer view is no protection. `npm run check:views -- "<psql args>"` fails on
  any view over an RLS-protected table that lacks it. Re-assert it on EVERY
  rebuild, in the bundle that defines the view.
- **A bundle must carry the LATEST definition of everything it defines.** The
  bundles are replayed ONE AT A TIME, not only as a set, so if module A creates
  a function and module B redefines it, running `A.sql` alone puts the old
  definition back — no error, and the bundle reports success. That is how a
  Reporting Manager lost team visibility twice: 0092 was filed under `rbac`
  while `user_directory.sql` replays 0004, which defines the same function
  without the fix. It reads as "the migration was never applied"; it had been,
  and was then overwritten.
  **`npm run check:replay -- "<psql args, no -d>"` is the one that proves it**:
  it builds a database from `all.sql`, replays each bundle onto a copy, and
  diffs every policy, function and view. Every bundle passes it today and it
  must stay that way. Where an object cannot be moved into the bundle that owns
  the last word, the module ends with a **guarded mirror** — a verbatim copy of
  the owner's definition, skipped while the later module's tables are absent
  (`0121_rbac_policy_tail.sql`, and the four `0122_*_replay_tail.sql`). A mirror
  is only safe while it stays a copy, so `check:bundles` compares each one with
  the migration it copies WORD FOR WORD and fails on drift; list it in `MIRRORS`
  and keep it LAST in its module. `base.sql` is the one bundle with no mirror —
  it would need 29 — so it **refuses** to run on a database that already has
  `app_roles`.
  `npm run check:bundles` also still catches a NEW object split across modules;
  the ones already split are listed in that script.
- **Every migration must be listed in a module in `build-apply-bundles.mjs`,**
  or the generator refuses to build. A migration in no module is also missing
  from every apply bundle, so a rebuilt project silently lacks it (0057/0058
  shipped that way).
- **Module ORDER matters for a fresh apply.** A migration that redefines
  something owned by a later module gets overwritten by it — put it in a module
  that runs afterwards (`ALL_ORDER`). `0055` sits in `handstock`, not
  `spare_requests`, for exactly this reason.
- **`create or replace view` can only APPEND columns.** Inserting one in the
  middle fails with "cannot change name of view column"; add at the end, or drop
  and recreate (and then everything depending on the view must be rebuilt too).
- **A PAGED READ'S `order()` COLUMN MUST EXIST, AND POSTGREST ANSWERS A BAD ONE
  WITH AN ERROR — not with unsorted rows.** So the register comes back EMPTY,
  not merely out of order. Reported from use (2026-09-16): Stock Out was blank
  because `listStockOutLines` ordered by `id` and the view publishes
  `dl.id as line_id`. Nothing could catch it by reading — the column is a
  STRING in a chained call, no type-checker sees it, and `dl.id as line_id`
  reads like an `id` until you look twice. `npm run check:orders -- "<psql
  args>"` asks a DATABASE, for all 109 order columns across 53 relations.
- **"DOES NOT EXIST" IS NOT A QUESTION ABOUT THE TABLE.** Postgres says it about
  a missing COLUMN, FUNCTION and OPERATOR in the same words, so fourteen screens
  matching `/foo|does not exist|schema cache/` turned any of those into *"run
  migration 00xx"* — an instruction, ACTED ON, sending somebody to re-run a
  bundle already in. Same argument as a `_status.sql` row that answers NO for
  nothing: worse than no message. `isMissingTable()` in `src/lib/dberror.ts` is
  the one test — it rules out column/function/operator FIRST, then asks whether
  the message is about a RELATION, then whether it is one of the screen's own.
  `loadFailure()` gives the three answers (migration · grant · the error
  VERBATIM, because the real fault was readable in the message and a hint
  overwrote it). `check:dberror` proves it, and `check:ui` refuses a bare
  `does not exist` test in any module.
- **POSTGREST CAPS A RESPONSE AT 1,000 ROWS HOWEVER LARGE THE `limit` SAYS, and
  silently.** So `.limit(20000)` is not a bigger request — it is a line that
  reads like a precaution and is the thing HIDING the truncation. Everything
  register-sized goes through `allRows()` in `src/lib/paging.ts`, which pages
  with `range()`. Reported from use (2026-09-14): Product & Party Search on
  ORION-G — 2,547 machines, the serial picker offered 1,000, and a real serial
  read as *"Nothing matches"*. It had been diagnosed ONCE for
  `listCallRequests`, whose comment says exactly this, and the fix went into
  **one of thirteen call sites**; the other twelve were reported a year later as
  a new bug. `npm run check:ui` now refuses any `.limit(n > 1000)`, and
  `npm run check:paging` tests the pager against a fake server that honours the
  cap. **Every paged read must also name an ORDER** — without one the pages can
  overlap and a row is doubled or dropped, which is worse than truncation
  because the result looks complete. `paging.ts` is a module of its own for one
  reason: `supabase.ts` reads `import.meta.env` and no node script can import
  it, so nothing in it can be tested as behaviour.
- **READ A `validate` FAILURE BY RE-RUNNING THE SUITE, NOT BY TRUSTING THE
  LABELS.** The harness pairs each `expect ERROR` with the NEXT error IN ORDER,
  so when a guard stops firing early in a file every later pairing shifts and
  the report names the WRONG expectations as unmet. It did exactly that for
  0210's truncated guard: it blamed two Commercial-approval labels at the end of
  `spare_workflow_test`, and the guards that had actually stopped working were
  *"not dispatched yet"* and *"not the raiser"*, twenty lines earlier. The
  COUNTS were right and the NAMES were not.
  **And an `expect ERROR` written as a SQL comment is invisible** — the harness
  reads the suite's OUTPUT, and `--` never reaches it. Use `\echo`.
  **A HARNESS MUST MATCH WHAT A TOOL REPORTS, NEVER WHAT IT MENTIONS.** The
  check runner tested `/FAILED/` against the whole output, and `check:ui` has a
  PASSING assertion labelled *"a failure is dated by when it FAILED"* — so that
  one word recorded the entire check as failed in `VALIDATION_RUN.md` while it
  passed everywhere else. It is anchored to `^<n> FAILED$` now. Same fault as the
  GST check that matched "18%" in its own comment.
- **A NEW GUARD BREAKS EVERY FIXTURE THAT PREDATES IT, AND THE SUITES ARE NOT
  OPTIONAL WORK.** 0214 (`zz_consumption_needs_visit`) broke NINE suites at
  once — every one that books a spare against a fixture call with no visit — and
  0210's NSM rule broke a tenth. Each read as an unexpected error where the
  suite was actually proving something else, which is the failure the suites
  exist to prevent. **Run `npm run validate` after adding a trigger or changing
  a rule**, not only the suite you wrote. Where a fixture must keep the OLD
  shape because that is what it tests — `consumption_report_test`'s CR-2 has no
  visit on purpose — lift that ONE trigger by name
  (`alter table ... disable trigger <name>`) rather than
  `session_replication_role = replica`, which switches off the lot.
- **`npm run validate -- "<psql args>"` RUNS EVERYTHING** — a template database
  from every migration, all 77 suites EACH ON ITS OWN COPY, all 13 checks, and a
  dated record in `docs/VALIDATION_RUN.md` written whatever happens. Two things
  it judges that a loop would not: an `expect ERROR` **that does not error is a
  failure too** (a guard that stopped working produces a suite that runs clean —
  three had), and a suite run against a SHARED database collides on its own
  fixtures and reads as a failure it is not.
- **A DATABASE-LEVEL SETTING DOES NOT SURVIVE A COPY OR A RESTORE.**
  `alter database ... set jit = off` (0099 — the Hand Stock timeout, 3.7s
  COMPILING a query that runs in 174ms) lives in `pg_db_role_setting` keyed by
  the database OID, so `create database ... template x` gets a new OID and NONE
  of the settings. Proved by asking: the original reads `jit=off`, the copy
  reads nothing. **Any rebuild that copies or restores rather than re-running
  the migrations silently loses it**, and the timeout returns with nothing to
  say why. `_status.sql` row 47 is the check.
- **Substring search needs pg_trgm; `=`/`IN` needs a btree.** A trigram index
  does not serve equality, so `products.party_name =` (the request cascade) went
  on timing out until btree indexes were added alongside the trigram ones.
- **THE TWO MIDDLE SPARE STAGES DO NOT SHARE A RULE** (0210). Commercial judges
  whether somebody is being CHARGED — AMC or OGP; NSM judges whether the stock
  is WARRANTED — AMC or OGP **or a HandStock request**, which has no machine
  behind it and so no cover for Commercial to weigh. `spare_needs_commercial` /
  `spare_needs_nsm` in SQL, `needsCommercial` / `needsNsm` in `spareflow.ts`.
  **`spare_line_stage` KEEPS ITS SIX ARGUMENTS and no longer reads
  `item_status`**: seven migrations call it (0016, 0025, 0031, 0055, 0116, 0118,
  0154) and three define views whose current definitions live in later files, so
  a seventh argument is a lot of surface — and a six-arg version left beside a
  seven-arg one answers the OLD rule, correctly-looking, for whatever still
  calls it. The rule lives in what gets STAMPED at RM approval instead, which
  also makes the stage report the record rather than re-deriving it.
  **That is only safe because 0210 first writes today's meaning into the data** —
  every line the old rule waved through gets `Auto-Approved` in the columns it
  waved through, with NO `_by`/`_at`, since nobody decided them. Without that
  step every settled line marches backwards out of Stores.
  **Approvals are PER LINE**: `spare_requests_stage_guard()` (0016) refuses any
  approval written to the request itself, and redefining it is how a wider hole
  than the one you are closing gets opened — `check:replay` caught exactly that
  in 0210's first draft.
- **A MIGRATION THAT DROPS A GUARD TO DO ITS WORK MUST PUT EVERY ONE BACK, AND
  NOTHING EXISTING CHECKED THAT.** 0210's step 2 switches off three triggers so
  the backfill can write approval columns nobody decided. Its first version
  restored two and left `spare_requests_stage_guard` off the table — and every
  check passed, because **`check:replay` compares FUNCTIONS and the function was
  untouched**; only the TRIGGER was missing. Found by asking a database which
  triggers `spare_requests` carries while documenting the table, not by reading
  the file, which reads as correct (it even carries a comment about remembering
  to restore the *second* one). What it cost was measured on two databases, one
  built with 0210 and one without: an engineer holding `spare.request` alone is
  the requester, so `sr_update` lets them write their own request, and with the
  guard off **one UPDATE carried it past RM, Commercial, NSM and Stores to
  Received** — the per-line RBAC never ran, because no line was touched. The
  repair is in 0210; `_status.sql` row 162 now counts all **three** triggers and
  `handstock_needs_nsm_test.sql` proves the refusal still fires. **The probe in
  that suite must OWN the request** — pointed at somebody else's, RLS makes the
  UPDATE match zero rows and the assertion passes with the guard removed, which
  is what its first draft did.
- **THE DESIGNATION AND THE PERMISSION ARE DIFFERENT THINGS AND ROUTINELY
  DIFFER** (the user, 2026-09-18, pointing at a User Master row reading
  Designation *"Regional Manager"* beside Role *"Reporting Manager"*). The
  DESIGNATION is the job somebody holds in the company; the second line is what
  this application grants, and the user named it **PERMISSION** rather than
  "RITHI role" (*"Instead of Rithi Role, Name it as Permission"*) — their word,
  and the clearer one: it says what the value DOES rather than which system it
  belongs to. The header chip showed only `roleLabel(user)`,
  unlabelled, in the place a reader looks for a job title — so the two were read
  as one. It shows the designation under the name and the role beneath it
  **saying which it is**; an unlabelled second line would have recreated the
  confusion rather than fixed it. `user.designation` comes from the User Master
  through `profiles` — **0199 syncs it on write**, where the login has ONE
  directory row — so nothing has to be re-typed, and a person whose row carries
  none gets no empty line. `check:ui` holds the field name too: `user?.jobTitle`
  TYPE-CHECKS and BUILDS CLEAN (the `BaseRecord` index signature again) and
  renders blank for ever, which is the `user.name` trap in a third place.
- **`user.name` DOES NOT EXIST — it is `fullName` — AND TYPESCRIPT CANNOT SAY
  SO**, because `BaseRecord` carries `[key: string]: unknown`. `user?.name`
  type-checks and is `undefined` at runtime, every time, with no error. It put
  the wrong name on a DELIVERY CHALLAN (2026-09-16): `SpareDispatch.tsx` sent
  `user?.name ?? user?.email`, so it never sent a name at all. `check:ui`
  refuses it anywhere now.
  **And `spare_dispatches.dispatched_by` is STAMPED from the session** (0211,
  a `before insert` trigger), so what the client sends is discarded — the
  0113/0114 rule. A caller-supplied value is DISCARDED, not refused: refusing
  makes an honest client fail, discarding makes a buggy one harmless.
  **The trigger exists rather than an edit to `dispatch_spare_lines` because
  that function is four revisions past 0027** and carries partial dispatch;
  0211's first draft rewrote it from the old body and would have deleted all of
  it. **Read a function out of the DATABASE before replacing it**, not out of
  the migration that first created it.
  **AND IT HAPPENED AGAIN THE SAME WEEK, SHIPPED THIS TIME.** 0210 rewrote
  `spare_request_lines_guard()` from an OLD revision to add the HandStock NSM
  rule: three rules went in and **three came out** — the dispatch permission,
  the rejection permission, the whole RECEIPT block and the parts rule. Measured
  on a database built from every migration: an engineer marked a line RECEIVED
  that had never been dispatched (`UPDATE 1`, no refusal, stage straight to
  Received), a DIFFERENT engineer acknowledged somebody else's spare, and any
  engineer could change the PART or QUANTITY on another engineer's line — which
  no test covered at all. `0217` is the repair and **`_status.sql` row 168
  counts all six rules by name**, so a rewrite that drops one answers NO however
  plausible the file reads. **`check:replay` cannot see this class**: it compares
  each bundle against `all.sql` and both are built from the same migrations, so
  a function truncated in the migration is truncated identically in both and
  they agree perfectly — the blind spot `check:generated` exists for, one level
  down.
- **Hand stock is derived, never stored** — issued − consumed ± transfers −
  returns. Consumption is therefore the control point: a DB trigger caps every
  consumption line at the engineer's balance. Reported lines are capped too;
  the Spare Coordinator corrects the stock, not the engineer.
- **Quality records are never deleted** (0049 blocks it). A wrong consumption
  line is VOIDED — quantity set to 0, the row retained with its original
  quantity, reason and author, and the stock returns.

- **A call has TWO registrant columns and they answer different questions.**
  `created_by` is the Hotline DESK it is filed to — it defaults to the Hotline
  engineer whoever typed the call in, so grouping by it shows nothing.
  `actual_created_by` is the person who typed it in, stamped from `auth.uid()`
  with a caller-supplied value discarded (0114). The two DIFFERING is the
  vigilance finding. Anything asking "who registered this?" reads
  `actual_created_by`; anything checking "may this person see it?" must test
  BOTH, or the stand-in loses sight of the call she just registered.

- **`call_report` AND `reports` DO NOT COUNT THE SAME THING, AND BOTH ARE
  RIGHT** (the user, 2026-09-24: *"there are 2 reports - call_report and
  reports ; the count is different in both"*). `public.reports` is ONE ROW PER
  VISIT — 0001 created it with `unique (ucn)` and **0002 dropped that** and
  keyed it on `uid`, precisely so a call visited three times keeps three
  records. `public.call_report` (0191) is ONE ROW PER CALL, over `public.calls`
  LEFT JOINed to the LATEST visit, and its own comment says why: *"NOT one row
  per visit. A call with four visits is one call, and a report that repeated it
  four times would have every count in it wrong."*
  **THE TWO DIFFER IN BOTH DIRECTIONS AT ONCE**, so "is one bigger?" answers
  nothing: a call with SEVERAL visits is 1 row there and N here; a call with NO
  visit is 1 row there and 0 here (the normal state of an open call, not a
  gap); and a visit whose UCN matches no call is 0 rows there and 1 here.
  **THAT LAST ONE IS THE ONLY FAULT AMONG THEM**: `reports.ucn` is plain text
  with NO foreign key, so a mistyped or pre-migration UCN is a visit in no
  register, no `call_report` row and no call status.
  **AND A FOURTH REASON THAT IS NOT ARITHMETIC**: they are read under DIFFERENT
  row-level security — `call_report` is `security_invoker` over `calls`, so the
  CALL policies bound it (`has_perm('calls.view')` AND the visibility rule),
  while `reports` has its own `reports_read`. The same person can be shown
  different numbers by each with nothing missing.
  `supabase/apply/_why_do_the_two_report_counts_differ.sql` reconciles them on
  live data line by line and names the orphans; its last row says whether the
  arithmetic balances, and if it does not, nothing above it should be acted on.
- `public.reports` is the **visit history** (one row per visit, keyed by `uid`).
  It has `visit_at` and `updated_at` — there is **no `created_at`**. Two
  orderings, deliberately: a **list** of visits reads by `visit_at desc nulls
  last, id desc`, but the **latest** visit (what a call's status comes from) is
  the latest ENTRY — `updated_at desc, id desc`, matching
  `sync_call_last_visit()` in `0032_call_state_by_entry.sql`.
- A call is **Unattended** only while it has no visit row; after that its status
  is the latest entry's. `calls.open_state` tests unsolved and report-pending
  **before** `solved%`, or "Solved - Report Pending" would read as Solved.
- The Supabase anon/publishable key in `src/lib/supabase.ts` is public by design;
  access is enforced by RLS. Never ship the service_role key.
- `script.google.com` is blocked from the sandbox's outbound proxy, so the Apps
  Script endpoints cannot be probed from here — say so rather than guessing.
- The local `db.ts` collections are **demo leftovers**, and `clearDemoData()`
  empties them on load — a screen backed by one renders blank against live
  data. That is what made Part Master and the in-call spare-consumption picker
  look empty; both read live tables now. The last two demo-backed screens
  (Field Failure Report, KPI & Failure Analysis) are honest placeholders until
  they get a table; the CRUD demo scaffolding (`CrudModule`, `schemas.tsx`,
  `CallExtras`) is gone. Recognise the symptom quickly.
- **Two marks, from one place.** `src/lib/brand.ts` exports `COMPANY_LOGO`
  (Air Liquide — anything that leaves the building: Delivery Challan,
  Declaration) and `RITHI_LOGO` (the app's own chrome: sign-in, menu bar). They
  are NOT interchangeable: a printed document carries the company's mark, never
  the application's (user's rule, 2026-09-05). Replacing a logo is replacing one
  file in `src/assets/`; `npm run check:ui` fails a screen that imports an asset
  directly or uses the wrong one of the two.
- **The call-status colour code is FIXED and the same in both themes.**
  Unattended RED, Unsolved BLUE, Solved-Report Pending PINK, Solved GREEN
  (user's spec, 2026-09-06) — literal hex in `src/lib/callstate.tsx`, never
  theme tokens: a colour people have learned to read is a code, and a code that
  means something else in dark mode is not one. The theme changes the BOX
  around the chip, never the hue; `npm run check:ui` fails a dark-theme block
  that restates a colour. **A UCN carries that colour wherever it appears** —
  every module. Where a register does not know the state (a spare line knows
  the UCN, not what happened to the call) `useCallStates` looks it up in one
  request; a UCN whose state is unknown renders PLAIN, because a wrong colour on
  a code is worse than no colour.

- **EVERY DROPDOWN IS TYPE-SEARCH-AND-SELECT. That is the design default**
  (user's rule, 2026-09-09), and it is a default rather than a preference: a
  native `<select>` picks on the FIRST KEYSTROKE, so with Auto Save on the Daily
  Call Review a stray key wrote a Root Cause nobody chose. `PickList` (and
  `SelectPicker`, its `<select>`-shaped wrapper) filter on typing and commit
  only on a click or Enter. **The form engine renders `type: 'select'` this
  way**, so every FieldDef form — Field Call, Installation, PM, Pending
  Registrations — gets it without being touched, and so does the next one.
  - **A short list gets no search box.** Under eight options `PickList` shows
    just the list: making somebody type to reach *Yes / No* is worse than the
    dropdown it replaced.
  - **FALLBACK IS PER FIELD, and OFF by default.** `allowFreeText` is what lets
    a value that is not on the list be committed. Off is right for anything
    fed by a master — a typed value is a master entry that does not exist. The
    **Standard Complaint takes no fallback in any module** (the user's rule):
    every count, filter and frequent-failure match downstream runs on that
    value, so a hand-typed one matches nothing. An empty master is a MASTER
    problem — the field says so and stays a picker.
  - `npm run check:ui` fails a NEW `<select>` in a module; the few that remain
    are listed in that script and are being converted.
- **"Highlight" means CONTRAST, not a tint** (user's standing preference,
  2026-09-06). A pale wash of the accent colour is what this project reached
  for first and it did not read at all on screen. Highlighting is done by
  INVERTING against the page — `background: var(--text); color: var(--surface)`
  — or by a saturated, solid state colour, so the thing projects off the
  surface instead of sitting slightly on top of it. Both work in either theme
  by construction, which a hand-picked highlighter colour does not.

- **THE UPDATE BANNER WATCHES THE BUILD AND MUST NOT PRINT THE VERSION
  BLINDLY.** It compares `buildId`, so a deploy that changes no version — SQL,
  a document, a diagnostic — announced *"A newer version (v0.9.293) is out —
  this tab is still on v0.9.293"*, telling somebody to update to exactly what
  they already have. It names a version only when the version DIFFERS, and
  otherwise says the build is older. Not cosmetic: the banner exists because a
  fix can be merged, deployed and still invisible to whoever reported the
  fault, and a banner that cries wolf is one people learn to dismiss — which
  costs the round trip it was built to save. `check:ui` holds both halves.
- **A count over partly-loaded data is a LOWER BOUND and must show `+`.**
  Every register loads in pages, so a chip reading "MAYANK GUPTA 90" over the
  first 800 rows means *at least* 90. A number that looks exact and is not is
  worse than no number, because somebody acts on it. The title badge
  (`countMore`) and the table's footer count already did this; the facet chips
  and the group headings did not. `FacetChips` takes `more`, and
  `npm run check:ui` REFUSES a `<FacetChips>` that does not pass it either way —
  `more={false}` is the right answer only where the database computed the whole
  aggregate (the KPI views), not where rows are still coming. Same rule for any
  new count you add anywhere.
  It cuts BOTH ways, and the Daily Call Review is the case that shows it:
  `countCallReviews` walks every page, so its total is EXACT and takes no `+`
  even while only the first 500 rows are on screen — "3,850+" would be wrong in
  the other direction. That screen wants an exact count AND a Load more button,
  so `PageHeader` separates them: `countMore` adds the `+`, `moreAvailable`
  shows the button, and it defaults to `countMore` where the two coincide.
- **A DOWNLOAD IS NOT THE WIRE.** The Consumption Report carried
  `2026-09-18T08:51:02.55+00:00` into a file opened in Excel (reported
  2026-09-18). `formatDayTime()` in `dates.ts` is the one formatter —
  `dd-MMM-yyyy HH:mm:ss`, month NAMED — and `ReportBuilder` applies it to every
  cell on the way out, so all three reports get it from one place. **BY VALUE,
  NOT BY COLUMN NAME**: the columns differ per report and move with the picker,
  so a list of date-ish headings is a list to forget. **THE OFFSET IS THE POINT,
  not the punctuation** — the database stores UTC, so printing the front of that
  string puts the wrong TIME on the row and, before 05:30 IST, the wrong DAY. A
  value with NO offset is a wall clock and is printed as written; a date with no
  time stays a date rather than gaining a midnight nobody recorded; anything
  unreadable comes back exactly as it arrived, anchored at BOTH ends so a remark
  beginning with a date survives.
- **AN .XLSX DATE IS A NUMBER PLUS A FORMAT, NEVER A FORMATTED STRING** (the
  user, 2026-09-18: *"those Date Fields are not Complaint with the Long Date
  Format of Excel"*). A string Excel cannot sort, filter by month, subtract or
  re-format — and each of those returns something wrong rather than refusing.
  `excelSerial()` in `dates.ts` + `xlsxDate()` and `styles.xml` in `xlsx.ts`;
  the CSV still gets `formatDayTime`, which is all a CSV can carry.
  **`excelSerial` uses the STRICT ISO test, never `parseAnyDate`.** Its first
  version used the lenient DISPLAY parser and turned the part code `MP-010` into
  serial 37165 — in a spreadsheet that is not a wrong-looking string but a
  NUMBER under a date format, so the column silently stops being a part code.
  And a date-only value must be a WHOLE day: going through
  `new Date('2026-09-18')` parses UTC midnight and reads it back locally, giving
  every date in India a 05:30 fraction. **Both were found by building a workbook
  and reading the bytes**, which is the only thing that was ever going to show
  them.
- **A REPORT IS A VIEW PLUS TWO LISTS, AND THEY CAN DISAGREE SILENTLY IN BOTH
  DIRECTIONS.** The file is built from `CONSUMPTION_MANDATORY` /
  `CONSUMPTION_OPTIONAL` in `src/lib/reports.ts` (and the CALL_ / FEEDBACK_
  pairs), never from the view — so a column IN THE VIEW AND IN NEITHER LIST can
  be exported by nobody, and a column IN A LIST the view no longer has exports
  an EMPTY column under a heading that promises a value. The first happened the
  day it was written about: `Visit UID` was added to `consumption_report` (0215)
  for the user, announced as added, and was unreachable from the picker for a
  day. Nothing could have caught it — `tsc` sees two lists of strings, and
  reading the migration is the method that missed it. **`npm run check:reports
  -- "<psql args>"` asks a DATABASE**, for all three reports, both ways.
  **A THIRD STATE EXISTS AND IS NOT MANDATORY**: `ReportSpec.defaults` (the
  user, 2026-09-18: *"Add Default Columns - Line ID , Source Ref Key , Created
  At"*) is ticked to start with and still removable, which is exactly what
  `mandatory` is not — that list is shown ticked and DISABLED because it is the
  format that was handed over. **Every default must also be in OPTIONAL**, or it
  is ticked in the picker and dropped by `exportColumns` on the way out; both
  `check:ui` and `check:reports` refuse that.
- **A NUMBER IN THE .XLSX MUST STAY A NUMBER, and the test is `typeof v ===
  'number'` — never whether a STRING looks numeric.** Same argument as the
  dates: Excel cannot sort, sum or filter a number handed to it as text, and
  each of those returns something WRONG rather than refusing — Line ID sorted
  1, 10, 100, 2 and a SUM over QTY answered 0. PostgREST sends Postgres's
  numeric columns as JSON numbers and its text columns as strings, so the
  `typeof` test converts exactly the columns the database calls numbers.
  Widening it to numeric-looking strings is the `MP-010` mistake in the other
  direction: a Serial No, Call Number, Contract No or UCN of all digits would
  lose its leading zeros and stop being an identifier. Proved by building a
  workbook and unzipping it — `0012345` is still `0012345` in the bytes.
- **A DIAGNOSTIC THE USER RUNS TO DECIDE WHETHER TO RUN SOMETHING MUST NOT
  DEPEND ON THAT SOMETHING.** `_do_i_need_to_reupload.sql` called
  `public.imported_ts()`, which **0215 creates** — and 0215 was exactly what was
  still waiting to be applied, so the one file whose job was to answer "do I
  need to run anything?" came back
  `ERROR: 42883: function public.imported_ts(jsonb, unknown) does not exist`.
  Every check here passed it, because every check builds its database from
  **all** the migrations: the gap is between the repository and the LIVE
  project, and nothing in the repository knows which migrations the user has
  actually run. **So write a probe against the state the user has, not the
  state `main` describes** — inline the rule rather than calling a helper a
  pending migration introduces — and test it on a database built with the
  pending migrations LEFT OUT, which is a two-line change to the apply loop:

  ```bash
  psql ... $(for f in supabase/migrations/*.sql; do
    case "$f" in *0214_*|*0215_*) ;; *) echo -n " -f $f";; esac; done)
  ```

  No check is offered for this and one is not claimed: which migrations are live
  is a fact about the Supabase project, not about this tree. `_state_check.sql`
  is how to ask.
- **THE TWO VISIT COLUMNS ON THE CONSUMPTION REPORT CANNOT BE FILLED FROM THE
  CONSUMPTION SIDE AT ALL** (the user, 2026-09-18: *"I need to Fill the Visit
  Date and Visit Entry Date Field in my Consumption Data -- How Do I do that?"*).
  They are not columns of `spare_consumption`; `consumption_report` LEFT JOINs
  `public.reports`. So re-uploading consumption cannot fill them and there is no
  field to type them into — **the answer is to load the VISITS**: Bulk Uploads →
  Visit Reports → Field / Installation / PM Reports, all three `REPORT_COLS`
  into `public.reports`, where `Visit Date & Time` → `visit_at` (**required**)
  and `Visit Entry Date` → `updated_at`. Every spare on that call then fills,
  including `Visit UID`, which the 0215 fallbacks deliberately cannot supply.
  **Say what else that load does, because it is not only two dates**: `Call
  Status` from the file becomes the call's status via `sync_call_last_visit()`,
  and a blank one leaves the call reading **Report pending** (0032's expression:
  a visit with no status can be nothing else). The `uid` is DERIVED from UCN +
  visit date when the file has none, so a re-load updates instead of
  duplicating — and several consumption rows sharing a UCN and date collapse
  into the one visit they were.
- **A GUARD THAT IS RIGHT CAN STILL BE USELESS AS AN ANSWER.** 0214 refuses a
  spare booked against a call with no visit — the user's own rule — and on a
  bulk load it arrived as *"No visit has been filed on 26H26F0029 (row ~1)
  (0 written before it stopped.)"*. Correct, and it stops everything while the
  visit it wants IS IN THE FILE: `Visit Date & Time` is the column the
  Consumption upload already maps onto `created_at`, and `Visit Entry Date`
  falls into `data`. So the register gained `prepare: 'consumption-visits'`,
  which FILES THE VISIT FIRST from the file's own values — recording the guard's
  requirement rather than evading it — and holds back BY NAME only the rows
  whose call the file cannot date, which is the one thing an all-or-nothing
  refusal cannot do. **Nothing is invented**: no date in the file means no
  visit. Three rules it must keep, each pinned by `check:uploads`:
  ONE VISIT PER UCN (three parts fitted on one visit are one event, and per-row
  keying makes the call's status come from whichever row was written last); the
  **FIRST** dated row wins, so a re-run is stable; and the uid is
  `REPORT_COLS`' own derivation, compared against that function rather than a
  literal — drift does not error, it quietly makes a SECOND visit of one call on
  one day. **The planner lives in `uploads.ts`, not `supabase.ts`**, for the
  `paging.ts` reason: that module reads `import.meta.env`, so nothing in it can
  be tested as behaviour. `prepareUpload` keeps the two round trips and nothing
  else; `check:ui` refuses a decision drifting back into it.
- **A SPARE NEEDS A VISIT BEHIND IT** (0214). `Visit Entry Date` and
  `Visit Date & Time` are NOT stored on the consumption row —
  `consumption_report` LEFT JOINs the latest visit — so both blank means one
  thing: the call has no `reports` row. The fix is at the cause:
  `zz_consumption_needs_visit` refuses an insert whose UCN has no visit.
  **Establish the ORDER before writing a guard like this**: Call Reporting saves
  the visit FIRST and the spares second, so the everyday path passes untouched —
  had it been the other way round the trigger would have broken every report.
  It runs LAST among the before-insert guards so a typo'd UCN still gets the
  reconcile guard's better message. It also stops the BULK CONSUMPTION UPLOAD
  for rows whose call has no visit, which is deliberate and worth saying out
  loud. Existing rows are NOT rewritten; `_consumption_without_a_visit.sql`
  lists them. `_status.sql` row 166.
  **A RECONCILIATION IS EXEMPT (0243, the user, 2026-09-26)** — "Add
  consumption (reconciliation)" exists for a part fitted but never reported, so
  under 0214 alone it could not save on exactly the calls it was built for, and
  the refusal landed behind the drawer where nobody saw it (finding 47). It is
  not a hole: `cons_write` demands `consumption.reconcile` for that source, so
  an engineer who writes `source = 'Reconciliation'` is refused by the POLICY;
  `reconciliation_needs_no_visit_test` proves both halves. **0214's comment says
  such a line shows BLANK visit dates — it does not, since 0215**: both show the
  booking time (the last fallback) and only `Visit UID` is blank. Measured, not
  read. `_status.sql` row 186 checks the exemption AND the rule.
- **EVERY TABLE HAS FIVE SYSTEM COLUMNS, AND THE DATABASE WRITES THEM** (0244,
  the user, 2026-09-26: *"sys_created_by, sys_created_on shouldn't overlap with
  any of the other fields"*). `sys_id` (unique), `sys_created_by`,
  `sys_created_on`, `sys_updated_by`, `sys_updated_on` on every table except the
  nine number counters; `sys_stamp()` (trigger `zzz_sys_stamp`, named to run
  LAST) writes them and DISCARDS what a signed-in caller sends. Four rules:
  - **NEVER REUSE THEM FOR BUSINESS MEANING, OR THE REVERSE.** `created_by` on a
    call is the Hotline DESK; `reports.updated_at` is the Visit Entry Date. The
    sys columns answer one question everywhere — which login wrote the row, and
    when — which is the point of keeping them apart.
  - **A NEW TABLE GETS THEM BY RE-RUNNING `sys_columns.sql`** — the module is
    LAST in `ALL_ORDER` and attaches itself to every table that exists, so a
    fresh apply covers everything; on the live project a table added later reads
    NO on `_status.sql` row 187 until it is re-run. A new COUNTER table must be
    added to the exclusion list in 0244, the row and the suite.
  - **A VIEW WRITTEN `select t.*` OVER A TABLE IS MIRRORED IN 0245**, because
    `*` is expanded at creation and re-running the owner's bundle would rebuild
    it with different columns. Changing `calls`, `pending_calls`,
    `field_failure_register`, `indoor_job_list`, `tracker_list` or
    `export_schedule_state` means changing 0245 to match — `check:bundles`
    fails until you do. A NEW `t.*` view over a table goes there too, or
    `check:replay` fails.
  - **A SCREEN THAT BUILDS COLUMNS FROM A ROW'S KEYS USES `isSysColumn()`**
    (`src/lib/syscols.ts`), or five columns appear on it, two of them login ids.
- **EVERY TABLE RECORDS WHEN THE TRANSACTION HAPPENED, AND IT READS
  `dd-MMM-yyyy HH:mm:ss` EVERYWHERE IT IS SHOWN OR EXPORTED** (the user's
  standing rule, 2026-09-24: *"Applicable to All Tables ; Timestamp - Capturing
  the Transaction Date and Time in this format dd-mmm-yyyy hh:mm:ss and this
  should be compatible as a DateTime / Long Date field in Excel."*). Three
  separate obligations, and only the middle one was already true everywhere:
  - **RECORD IT.** A new table carries `created_at timestamptz not null default
    now()`, and `updated_at` where the row is editable. A table that records
    only a DATE cannot answer "which happened first" within a day — that is not
    hypothetical, it is `ownership_transfers` (fixed by 0240, which added
    `transferred_at` because `transfer_date` is a DATE and the party is decided
    by whichever of the sale and the transfer is LATEST). **40 of 77 tables have
    no `created_at`** as of 2026-09-24; most are counters, child lines and views
    of other tables, but a REGISTER without one cannot be audited or ordered.
  - **SHOW IT** through `formatDayTime()` in `src/lib/dates.ts` — the one
    formatter, month NAMED so it cannot be read the other way round. Never the
    raw string: the database stores UTC, so printing the front of
    `2026-09-18T08:51:02.55+00:00` puts the wrong TIME on the row and, before
    05:30 IST, the wrong DAY.
  - **EXPORT IT AS A NUMBER, NOT A STRING.** An .xlsx date is a serial plus a
    format (`excelSerial()` + `xlsxDate()` + `styles.xml`); a formatted string
    is something Excel cannot sort, filter by month, subtract or re-format, and
    each of those returns something WRONG rather than refusing. `ReportBuilder`
    applies it BY VALUE, never by column name, because the columns move with the
    picker. The CSV gets `formatDayTime`, which is all a CSV can carry.
  **AND EVERY TABLE WANTS A KEY OF ITS OWN** — a natural key, so a re-load
  CORRECTS rather than duplicates. 22 of 77 have only a synthetic `id`; most are
  append-only logs and child lines, where every row IS a distinct event and a
  natural key would be wrong. The ones where it is a real gap are named in
  `docs/BACKLOG.md` — `user_directory` first, since the User Master is "the only
  place I can map and configure" and nothing stops the same person appearing
  twice.

- **One parser, one FORMATTER, one matcher.** Every importer reads dates through
  `src/lib/dates.ts` (day-first, always) and every screen DISPLAYS one through
  `formatDay()` in the same file — `dd-MMM-yyyy`, the month NAMED so it cannot
  be read the other way round. A native `<input type="date">` renders in the
  BROWSER'S locale, which is how the Field Call drawer came to show
  `2026-09-12` beside `09/11/2026`; format for display only where the form
  CANNOT be submitted, since a formatted string in a savable field is a
  corrupted date. Headers go through
  `src/lib/headers.ts` (strict → loose → squash); CSV through `csv.ts`. Do not
  add a private `toDate` or header normaliser to a module — there used to be
  four date parsers and they had started to disagree. A wall-clock export time is
  LOCAL (`toIsoTimestamp(v, 'local')`, settled with the user); display of a
  non-ISO string is day-first too (`parseAnyDate`). Neither is a per-file habit.
- **THE MODULE KEY OPENS A SCREEN; THE READ POLICIES DECIDE THE ROWS.** Granting
  `mod:/x` correctly and seeing an empty page is not a fault in the grant — it is
  the other half, and the standing rule about Roles & Permissions does not cover
  it. Product Failure Analysis reads `field_call_review`, which is built FROM
  `field_calls`, so it is bounded by the CALL policies (`has_perm('calls.view')
  AND <visibility>`) however open `call_reviews_read` is; Spare Insights reads
  `spare_consumption`, whose `cons_read` is `can_view_all_calls() OR mine OR my
  team's`. A role that is not an office role and has no reporting team passes
  nothing. `data.view_all` is the per-role grant built for exactly that (0035),
  and it is needed AS WELL AS the `has_perm` gate, never instead of it.
- **COVER IS ONE VOCABULARY: WGP / OGP / CMC / AMC**, enforced by
  `public.cover_code()` + triggers (0208), with `coverCode()` in `fieldcall.ts`
  as the client copy (`check:ui` compares them). "WARRANTY" is WGP. A second
  spelling does not read as a small error on this dimension — every count is a
  `group by`, so it SPLITS the total silently and the reader believes both
  halves. Two rules that look fussy and are not: **"OUT OF WARRANTY" matches on
  the WHOLE squashed string**, or a substring rule turns one cover into its
  opposite; and **an unrecognised value is returned unchanged**, never bucketed,
  because a guess written into a quality record is worse than a value that reads
  as odd — the odd one gets reported, which is how this was found.
- **`products` IS THE INSTALL BASE; `product_master` IS THE CATALOGUE — and the
  NAMES SWAPPED on 2026-09-14.** `public.products` is one row per MACHINE
  (model + serial, customer, cover), ~20,000 rows, labelled **Product Database**
  at `/product-database`. `public.product_master` (0193) is one row per PRODUCT
  LINE — code, type, category, still-sold — 53 rows, labelled **Product Master**
  at `/product-master`. The table names now read backwards against the labels,
  which is the price of not renaming a table 24 views and a dozen functions
  depend on; the labels are what the user reads.
  **The permission had to move with the screen** (0192): the module key IS the
  route, so leaving `mod:/product-master` where it was would have silently
  swapped which screen every role could open. It merges `mod:/product-database`
  into every role that held the old key.
  **`active` stops exactly one thing: a NEW SALE ENTRY.** Contracts, calls,
  visits, spares and feedback are untouched — a machine sold in 2014 is still
  supported. Enforced on the FORM (`optionsFrom: 'sellable-*'` in `cover.ts`)
  and NOT by a trigger, because a trigger would also refuse the historical sales
  import: 30 of the 53 lines are retired and those sales really happened.
  `product_line_sellable()` is the same rule in SQL; an UNKNOWN code is sellable,
  since an incomplete catalogue must not refuse a real sale.
- **REMOVING A MENU ENTRY DOES NOT RESTRICT A PAGE**, and the rule below cuts
  both ways: NARROWING a page needs the migration exactly as much as adding one
  does. "How RITHI Functions" shipped `alwaysOpen` (no module, no key) and was
  limited to four roles hours later — `admin: true` on the module keeps the key
  out of `NON_ADMIN_MODULES`, leaving `SEES_EVERY_MODULE`'s three, and NSM is
  named in its own `FUNCTIONAL_DEFAULTS`; **0209** puts it in `app_roles`,
  without which the tick grants nobody anything. And the `_status.sql` row
  checks BOTH halves — everyone named holds it, and nobody else does — because
  "limit exposure" is two statements and a grant that leaks to a fifth role
  passes every check that only looks at the four.
- **THE SHARED DIAGRAMS AND THE IN-APP PAGE ARE THE SAME FILES.**
  `public/docs/*.html` are in the repo — `how-a-call-works.html`,
  `how-a-spare-moves.html`, `how-hand-stock-moves.html` and
  `spare-module-schema.html` so far — framed from the app's own origin by
  `HowRithiFunctions.tsx`, which lists them in `DOCS` and offers a chip per
  module; each claude.ai artifact is PUBLISHED FROM its path. A third module is
  a file and a line in `DOCS`. They share ONE shell: copy the head of an
  existing document so the theme hand-off and the height message come with it
  (`check:ui` checks every listed document for both, and that the file exists). **The artifact URL cannot be embedded** — that host answers
  `x-frame-options: SAMEORIGIN` and the page is private, so an iframe at it
  renders an empty box for everybody but its author. A frame keeps one copy of
  the markup and one of the CSS; the two things it costs are handled and
  checked: the host's theme is passed in (`?theme=`, from the app theme's
  `scheme`) and the document posts its own height, accepted only from that
  frame. A missing document says so rather than rendering blank.
- **A NEW SCREEN, OR A RE-ARRANGED ONE, IS NOT DONE UNTIL ROLES & PERMISSIONS
  KNOWS** (the user's standing rule, 2026-09-14: *"Always when a New UI is
  introduced or when a UI is re-arranged — this is often missed"*). It had been
  missed four times. Three things must move together, and the third is the one
  that bites:
  1. `MODULES` and the menu in `Layout.tsx` — the screen and where it lives.
  2. `PERM_TREE` in `rbac.ts` — the matrix an administrator edits. Its header
     must be the screen's MENU GROUP and its position the menu's position; a
     page filed under a header the screen no longer sits under is how somebody
     grants the wrong thing believing they granted the right one. Machine
     History moved to Overview and kept a header of its own for two days.
  3. **A MIGRATION MERGING `mod:/<path>` INTO `app_roles`.** `permsForRole()` is
     `if (stored && stored.length) return stored;` — the code defaults apply
     ONLY to a role whose stored set is EMPTY, and on a project in use every
     role has a tuned row. So a new module's key reaches NOBODY until a
     migration puts it there: the screen ships, the menu entry exists, the
     permission is ticked in `DEFAULT_PERMS`, and the page is invisible to all
     twelve roles with no error anywhere. That is exactly what happened to
     Machine History, the Call Report and the Customer Feedback Report; 0195 is
     the repair and `0192`/`0195` are the pattern. **MERGE, never overwrite**,
     and leave a role with ZERO permissions alone — an empty array means "not
     configured" and writing one key into it turns the fallback off.
  `npm run check:ui` enforces all three now. It did not, while `rbac.ts` claimed
  it did — nothing read `PERM_TREE` at all. **A comment claiming a check exists
  is worse than no comment, because it is the reason nobody looks.**
- **A BLANK CELL USED TO BE INDISTINGUISHABLE FROM AN ABSENT COLUMN, and they
  mean opposite things.** A heading the file does NOT carry must leave its
  column alone; a heading it DOES carry with an empty cell must EMPTY it. Both
  produced a payload with no such key, so an upload could only ever ADD a value
  and never REMOVE one — a correction at source did nothing. Reported
  2026-09-14: ORION-G 2410 showed contract MC5521, which belongs to the CPX CARE
  that shares that serial; the master was corrected and re-uploading it left
  MC5521 in place (proved against Postgres before it was fixed). `blanksClear`
  on an `UploadDef` sends the empty value instead, and is **opt-in per
  register** — right where the file is the WHOLE ROW (the Product Database's
  master export carries all 32 headings), wrong where a partial file's tool
  emits every heading whether or not it means to fill it. A **stamped** column
  is never blanked, nor a **required** one (that row is held back instead).
- **Bulk Uploads is the importer.** The legacy Data Import panel keeps only what
  Bulk Uploads does not do: the four AppSheet cover exports (+ Normalise), the
  User Master directory, and the MRN two-tab flattening. Do not add a table to
  both — two importers for one table is how a good file came back as "0 rows".
- **Verify an upsert target against a database, not by reading the SQL.**
  `npm run check:upserts -- "<psql args>"` rejects partial indexes, expression
  indexes and views. That class shipped six times by inspection alone.
- **GIVING A TABLE A CONFLICT TARGET CHANGES WHICH POLICY THE IMPORTER NEEDS.**
  An upsert that finds a collision stops being an INSERT and becomes an UPDATE,
  so the table needs an **UPDATE policy** — and a table that has only ever been
  inserted into usually has not got one. `feedback` had a read and an insert
  from 0001, narrowed to rights by 0008, and no third; the moment 0186 gave it
  a key the upload ran to row 24,092 and stopped with *"Your role does not have
  permission for this action"*. It fails at the ONE moment an upsert earns its
  keep — the re-load. `check:upserts` asks both questions now ("can PostgREST
  infer the target?" AND "may the caller write the row it infers?"), and found
  `stock_transfers` carrying the same hole unreported. Copy the audience from
  the INSERT policy VERBATIM so nobody gains reach; say in the migration what
  the UPDATE does and does not allow, because on a stock or quality record that
  is the whole argument.
- **A CONSTRAINT ADDED BY ONE MIGRATION AND DROPPED BY A LATER ONE IS DEAD CODE
  THAT STILL EXECUTES — ON EVERY RE-APPLY.** 0148 added `parts_category_check`;
  0152 drops it four files later, deliberately (a check there aborts a bulk
  import part-written). The `add` stayed, guarded by
  `if not exists (... conname = 'parts_category_check')` — and after 0152 the
  constraint's ABSENCE is the correct state, so every re-run of
  `performance.sql` tried to put it back. **On an empty database that succeeds
  and 0152 removes it again, which is why every check passed for months.** On
  the live project, where a part had since been loaded with a category outside
  the five words, the bundle stopped at 0148 with
  `ERROR: 23514: check constraint "parts_category_check" ... is violated by
  some row` — BEFORE reaching the file that would have dropped it (reported
  2026-09-20). `IF NOT EXISTS` guards a NAME, never an INTENTION. The `add` is
  gone from 0148; 0152 still drops it defensively and `_status.sql` row 115
  asserts it is absent. `check:ui` refuses the pattern now — it was the only
  instance in 219 migrations, and the offending part row is LEFT AS IT IS,
  because that column is the Item Master's own word and an unexpected one is a
  bar in Spare Insights, not something to rewrite.
- **`IF NOT EXISTS` GUARDS A NAME, NEVER A DEFINITION** — it makes a migration
  re-runnable, it does NOT make it corrective. `add column if not exists x ...
  generated always as (<new expr>)` is a silent no-op when the column exists:
  the expression is not compared. `create unique index if not exists <name>` is
  a silent no-op when that NAME exists, whatever its definition. 0186 changed
  both the generation expression and the index's predicate while reusing both
  names, so a project that had run its first version kept the PARTIAL index for
  ever and every later run of the corrected file confirmed it was fine — which
  is exactly how the live project reported "no unique or exclusion constraint
  matching the ON CONFLICT specification" after running the bundle. Anything
  that CHANGES the shape of an object somebody may already have must INSPECT
  and replace (`0188_feedback_key_repair.sql` is the pattern: find the index by
  SHAPE, not by name, since PostgREST does not read names either). 0185 escaped
  it only by naming its new index differently and dropping the old one by name.

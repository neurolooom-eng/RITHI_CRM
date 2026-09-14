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
  A link to the wrong path 404'd once; `check:ui` now resolves every SQL path in
  the docs.
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
  REQUEST module — 30 requirements (CR-001…CR-030) covering the keys, the
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
  SERVICING PROCESS must do — 37 requirements (SR-001…SR-037) from ISO 13485
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
- **Substring search needs pg_trgm; `=`/`IN` needs a btree.** A trigram index
  does not serve equality, so `products.party_name =` (the request cascade) went
  on timing out until btree indexes were added alongside the trigram ones.
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
- **One parser, one matcher.** Every importer reads dates through
  `src/lib/dates.ts` (day-first, always) and headers through
  `src/lib/headers.ts` (strict → loose → squash); CSV through `csv.ts`. Do not
  add a private `toDate` or header normaliser to a module — there used to be
  four date parsers and they had started to disagree. A wall-clock export time is
  LOCAL (`toIsoTimestamp(v, 'local')`, settled with the user); display of a
  non-ISO string is day-first too (`parseAnyDate`). Neither is a per-file habit.
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

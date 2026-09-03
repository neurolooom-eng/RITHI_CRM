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
initdb -D /tmp/pg/data -U postgres --auth=trust
pg_ctl -D /tmp/pg/data -o "-p 55432 -k /tmp/pg" -l /tmp/pg/log start
psql -h /tmp/pg -p 55432 -U postgres -v ON_ERROR_STOP=1 \
  -f supabase/tests/_stub.sql $(for f in supabase/migrations/*.sql; do echo -n " -f $f"; done)
psql -h /tmp/pg -p 55432 -U postgres -f supabase/tests/<suite>_test.sql
```

## Conventions

- **Migrations** — `supabase/migrations/`, numbered **per module**, so two files
  can share a number (`0011_spare_intake.sql`, `0011_call_request_actions.sql`).
  Go by file name, never the number. Other sessions add migrations at the same
  time, so **re-check for a collision after merging `main`** and renumber if
  yours is taken — safe even once the SQL has been applied, since the bundles
  are idempotent.
- **Apply bundles** — `supabase/apply/*.sql` are GENERATED. Edit the migration,
  add it to the right module in `scripts/build-apply-bundles.mjs`, re-run
  `node scripts/build-apply-bundles.mjs`, and commit the result. `_status.sql`
  is hand-maintained: add a row when a bundle gains a checkable object.
- **User-visible change** → add a `CHANGELOG` entry in `src/lib/changelog.ts`
  (in-app Version History) and bump `package.json`. Write it in the user's
  words, not the code's. `main` has often claimed your version already from
  another branch: take the next one **above** it rather than renumbering
  theirs, and keep `package-lock.json`'s two version fields in step.
- **Applying SQL to the live Supabase project stays the user's step.** Name the
  bundle to run (`_status.sql` first, then what it flags) — never assume a
  migration is live because it is merged.
  **Always give the LINK, not just the file name** (user's ask, 2026-09-03):
  `https://github.com/neurolooom-eng/RITHI_CRM/blob/main/<path>` to read it,
  `https://raw.githubusercontent.com/neurolooom-eng/RITHI_CRM/main/<path>` to
  copy it. Same for a snippet pasted into chat — say which file it came from
  and link that file.
- **`docs/BACKLOG.md`** is the running record — mark what shipped and what is
  still pending (a migration to run, a redeploy to do) as part of the change.
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
- **One parser, one matcher.** Every importer reads dates through
  `src/lib/dates.ts` (day-first, always) and headers through
  `src/lib/headers.ts` (strict → loose → squash); CSV through `csv.ts`. Do not
  add a private `toDate` or header normaliser to a module — there used to be
  four date parsers and they had started to disagree. A wall-clock export time is
  LOCAL (`toIsoTimestamp(v, 'local')`, settled with the user); display of a
  non-ISO string is day-first too (`parseAnyDate`). Neither is a per-file habit.
- **Bulk Uploads is the importer.** The legacy Data Import panel keeps only what
  Bulk Uploads does not do: the four AppSheet cover exports (+ Normalise), the
  User Master directory, and the MRN two-tab flattening. Do not add a table to
  both — two importers for one table is how a good file came back as "0 rows".
- **Verify an upsert target against a database, not by reading the SQL.**
  `npm run check:upserts -- "<psql args>"` rejects partial indexes, expression
  indexes and views. That class shipped six times by inspection alone.

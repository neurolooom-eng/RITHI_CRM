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
  Go by file name, never the number.
- **Apply bundles** — `supabase/apply/*.sql` are GENERATED. Edit the migration,
  add it to the right module in `scripts/build-apply-bundles.mjs`, re-run
  `node scripts/build-apply-bundles.mjs`, and commit the result. `_status.sql`
  is hand-maintained: add a row when a bundle gains a checkable object.
- **User-visible change** → add a `CHANGELOG` entry in `src/lib/changelog.ts`
  (in-app Version History) and bump `package.json`. Write it in the user's
  words, not the code's.
- **`docs/BACKLOG.md`** is the running record — mark what shipped and what is
  still pending (a migration to run, a redeploy to do) as part of the change.
- **CallReg redeploys** — a change to `apps-script/CallReg.gs` is not live until
  the Web App is redeployed. When a new `/exec` URL arrives, bake it into
  `DEFAULT_SHEETS_URL` in `src/lib/sheets.ts` and bump `DEFAULT_URL_VERSION`, so
  every client supersedes its stored URL instead of each device editing Settings.

## Gotchas

- `public.reports` is the **visit history** (one row per visit, keyed by `uid`).
  It has `visit_at` and `updated_at` — there is **no `created_at`**; order by
  `visit_at desc nulls last, id desc`.
- The Supabase anon/publishable key in `src/lib/supabase.ts` is public by design;
  access is enforced by RLS. Never ship the service_role key.
- `script.google.com` is blocked from the sandbox's outbound proxy, so the Apps
  Script endpoints cannot be probed from here — say so rather than guessing.

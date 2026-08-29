# RITHI CRM — working notes

## Shipping (standing instruction)

Every change ships end to end without being asked: **commit → merge to `main` → deploy.**

1. Work on the session's branch, commit with a message that says what changed and why.
2. Merge the latest `origin/main` in first and resolve conflicts — `main` moves fast,
   several sessions push to it in parallel.
3. Push, open the PR, merge it to `main`.
4. Pushing `main` triggers `.github/workflows/deploy.yml` (GitHub Pages). Confirm the
   run succeeds; report the version and commit.

Only stop short of this when the change is genuinely unsafe to ship, and say why.

## Before every push

- `npx tsc --noEmit` and `npx vite build` must both pass.
- Ran a migration? Apply it to a scratch Postgres **twice** to prove it is idempotent.
- Touched `supabase/migrations/`? Re-run `node scripts/build-apply-bundles.mjs` and
  commit the regenerated `supabase/apply/*.sql`.

## Conventions

- **Migrations** are numbered `NNNN_name.sql`. Other sessions add migrations
  concurrently, so re-check for a number collision after merging `main` and renumber
  yours if it clashes — the apply bundle is idempotent, so renumbering is safe even
  after the SQL has been applied to the live project.
- **Version + changelog**: bump `package.json` and add an entry at the top of
  `src/lib/changelog.ts` (shown in-app under Version History). `main` often claims the
  same version from another branch — take the next one above it, don't renumber theirs.
- **Applying SQL to the live project is the user's step.** Say which bundle to run
  (`supabase/apply/<module>.sql`, or `_status.sql` first to see what's outstanding).

## Data sources

The app reads live data from Supabase, with a Google Apps Script (CallReg) sheet
fallback; `dataConfigured()` covers either. The local `db.ts` collections are demo
leftovers — `clearDemoData()` empties them on first load, so any screen still backed by
one renders blank. Masters, calls, spares and reports are all live.

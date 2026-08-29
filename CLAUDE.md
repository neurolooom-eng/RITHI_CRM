# RITHI CRM — working agreement

## Ship it: commit, merge to main, deploy

Standing instruction from the repo owner. **Do not ask** whether to commit,
merge or deploy — do all three as part of finishing a piece of work.

1. **Commit** on the session's feature branch, with a message that says what
   changed and why.
2. **Merge to `main`** — push the branch, open a PR, merge it. Merge the
   branch's own PR rather than pushing straight to `main`, so the change has a
   record.
3. **Deploy** happens by itself: `.github/workflows/deploy.yml` builds and
   publishes to the `gh-pages` branch on every push to `main`. **Check the run
   went green afterwards** (Actions → "Deploy to GitHub Pages") and fix it if
   it did not — a merged change that failed to deploy is not shipped.

"Don't ask" is not "don't check". Everything below still has to pass before
the merge; shipping a red `main` breaks the deploy for everyone.

## Before every merge

```bash
npm ci && npm run build          # tsc --noEmit + vite build. Must be clean.
node scripts/build-apply-bundles.mjs   # after ANY change under supabase/migrations/
```

For a change touching SQL, apply every migration to a throwaway Postgres and
run the suites in `supabase/tests/` — each is written so that the only errors
in its output are the ones labelled `expect ERROR`:

```bash
initdb -D /tmp/pg/data -U postgres --auth=trust
pg_ctl -D /tmp/pg/data -o "-p 55432 -k /tmp/pg" -l /tmp/pg/log start
psql -h /tmp/pg -p 55432 -U postgres -v ON_ERROR_STOP=1 \
  -f supabase/tests/_stub.sql $(for f in supabase/migrations/*.sql; do echo -n " -f $f"; done)
psql -h /tmp/pg -p 55432 -U postgres -f supabase/tests/<suite>_test.sql
```

Also worth doing on a merge: check `main` builds *before* you merge into it.
A branch cut from an old tree can revert modules when it lands (this has
happened — see the ⚠️ note in `docs/BACKLOG.md`), and the merge that follows
gets blamed for it.

## Repo conventions

- **Migrations** live in `supabase/migrations/`, numbered per module, so two
  files can share a number — go by file name. Numbers are claimed fast by
  parallel branches; re-check yours against `main` before merging.
- **Apply bundles** in `supabase/apply/` (plus `Spare_1.sql` and
  `HandStock_X.sql` at the root) are **generated** — edit the migration and
  re-run the generator, never the bundle. Every migration must belong to a
  module or the generator refuses to run.
- `supabase/apply/_status.sql` reports what a live project is missing. It is
  hand-written: add a row when you add a module.
- **Changelog**: add an entry at the top of `src/lib/changelog.ts` and bump
  `package.json` (keep `package-lock.json`'s two version fields in step).
- **Backlog**: `docs/BACKLOG.md` tracks what shipped, what is queued, and the
  migrations a live project still needs to run.

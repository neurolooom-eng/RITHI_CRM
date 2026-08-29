# Migration tests

`spare_workflow_test.sql` exercises the spare-request workflow triggers against
a throwaway Postgres — the approval chain, the OR/RowNo numbering, and the RBAC
guards. It caught a live bug (an RM's approval of a non-AMC item being refused
by the stage guard, fixed in `0011_spare_auto_approval.sql`), so it is worth
re-running whenever a migration touches `spare_requests`.

These are plain `psql` scripts, not a test framework: each step prints what it
did, and the steps that must fail are labelled `expect ERROR`. Read the output.

## Running

Supabase objects the migrations depend on (`auth.uid()`, `auth.email()`,
`auth.role()`, `auth.users`) do not exist in a bare Postgres, so `_stub.sql`
provides them plus a `harness` table naming the user being impersonated and a
`be(email)` procedure to switch.

```bash
initdb -D /tmp/pgt/data -U postgres --auth=trust      # as an unprivileged user
pg_ctl -D /tmp/pgt/data -o "-p 55432 -k /tmp/pgt" -l /tmp/pgt/log start

psql -h /tmp/pgt -p 55432 -U postgres -v ON_ERROR_STOP=1 \
  -f supabase/tests/_stub.sql \
  $(for f in supabase/migrations/*.sql; do echo -n " -f $f"; done)

psql -h /tmp/pgt -p 55432 -U postgres -f supabase/tests/spare_workflow_test.sql
```

Note the harness connects as superuser, which bypasses RLS — it exercises the
**triggers**, not the row-level policies. Policy changes still want a check
against a real Supabase project.

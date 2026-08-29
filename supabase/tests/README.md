# Migration tests

`call_requests_test.sql` exercises the call-request and call-state migrations —
one REQID across a request's calls, the `unique_key` identity, the Hotline
outcomes (mapped / registered / cancelled), and how a call's latest visit
decides its open state. It caught a live bug: `pending_calls` selected `c.*`
alongside the state column, and `calls` already has a `state` column (the
geographic one), so the view would not create at all — the status is now
`open_state`.

`spare_workflow_test.sql` exercises the spare-request workflow triggers against
a throwaway Postgres — the approval chain, the OR/RowNo numbering, and the RBAC
guards. It caught a live bug (an RM's approval of a non-AMC item being refused
by the stage guard, fixed in `0012_spare_auto_approval.sql`), so it is worth
re-running whenever a migration touches `spare_requests`.

`handstock_test.sql` exercises hand stock (`0022_handstock.sql`) — the four
terms of the stock level (a Stores dispatch in, consumption out, a transfer out
of one engineer and into another), the name/part-code matching the movements
are joined on, and a negative level where spares were consumed that no stock
out covers. It also pins the two things `0022` fixed: a spare dispatched
against a CALL is stock (it used to be consumed out of a balance it was never
added to), and a dispatch carrying a DC but no date still counts. Because
`engineer_stock` is redefined over the same derivation, it checks that the two
agree and that the transfer guard reads the same figures — run
`stock_transfer_test.sql` alongside it.

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
psql -h /tmp/pgt -p 55432 -U postgres -f supabase/tests/call_requests_test.sql
psql -h /tmp/pgt -p 55432 -U postgres -f supabase/tests/handstock_test.sql
```

Note the harness connects as superuser, which bypasses RLS — it exercises the
**triggers**, not the row-level policies. Policy changes still want a check
against a real Supabase project.

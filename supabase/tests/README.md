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

`handstock_test.sql` exercises hand stock (`0023_handstock.sql`) — the four
terms of the stock level (a Stores dispatch in, consumption out, a transfer out
of one engineer and into another), the name/part-code matching the movements
are joined on, and a negative level where spares were consumed that no stock
out covers. It also pins the two things `0022` fixed: a spare dispatched
against a CALL is stock (it used to be consumed out of a balance it was never
added to), and a dispatch carrying a DC but no date still counts. Because
`engineer_stock` is redefined over the same derivation, it checks that the two
agree and that the transfer guard reads the same figures — run
`stock_transfer_test.sql` alongside it.

`master_list_permissions_test.sql` exercises the per-list master permissions
(`0067`) — that `master.<list>.edit` maintains one value list and no other,
that it does not carry delete (and delete does not carry edit), that
deactivating a value is an update so the edit key covers it, and that the
global `masters.edit` still covers every list. These are RLS policies, so the
suite runs its writes under `set local role authenticated`.

`app_user_names_test.sql` exercises the id -> name lookup (`0068`) the tables
use to show WHO created a row: that an ordinary engineer, who may read only
their own `profiles` row, still resolves everyone's name; that a blank
`full_name` falls back to the email rather than to nothing; that the view is
**read-only by construction** (it selects from a SECURITY DEFINER function, so
no write can be routed through it into `profiles` past that policy); and that
`anon` cannot read it at all.

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
psql -h /tmp/pgt -p 55432 -U postgres -f supabase/tests/master_list_permissions_test.sql
psql -h /tmp/pgt -p 55432 -U postgres -f supabase/tests/app_user_names_test.sql
```

Note the harness connects as superuser, which bypasses RLS, so by default a
suite exercises the **triggers**, not the row-level policies. A suite that
means to test a policy has to say `set local role authenticated` inside a
transaction first — `master_list_permissions_test.sql`,
`app_user_names_test.sql` and `daily_call_review_test.sql` do. Policy changes still want a check against a
real Supabase project.

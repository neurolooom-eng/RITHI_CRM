# Apply bundles

One consolidated, ready-to-paste SQL file **per module**. Each carries every
migration that module needs, in order, so applying a module to a project that
is behind is a single paste — not a hunt through the numbered migrations,
finding the missing pieces one error at a time.

`supabase/migrations/` stays the source of truth. These are **generated**:

```bash
node scripts/build-apply-bundles.mjs            # all bundles
node scripts/build-apply-bundles.mjs spare_requests
```

The spare bundle is written to **`Spare_X.sql` at the repo root** rather than
into this directory — it is the file handed round for that module. Everything
else lives here.

Re-run it whenever a migration is added or edited, and commit the result. One
file per module, regenerated in place, so bundles never duplicate or overwrite
each other.

## Using them

1. Run **`_status.sql`** in the Supabase SQL Editor first. It reports one row
   per bundle — what is applied and what is not. It changes nothing.
2. Run the bundle(s) it flags. Each starts with a preflight that names any
   missing prerequisite (and the bundle providing it) instead of failing
   partway through, and each is wrapped in a transaction.
3. Every bundle is idempotent — running one twice is a no-op.

| File | Covers | Needs first |
| --- | --- | --- |
| `_status.sql` | read-only report of what is applied | — |
| `user_directory.sql` | `0004` — engineer directory, reporting-tree helpers | base `0001` |
| `rbac.sql` | `0005`, `0007`, `0008` — role matrix, per-user access, Postgres enforcement | `user_directory` |
| `../Spare_X.sql` | `0006`, `0009`, `0011`, `0012`, `0016`–`0019` — the whole spare workflow (repo root) | `rbac` |
| `stock_transfer.sql` | `0020` — engineer → engineer hand-overs, and the derived stock balance | `Spare_X.sql` |
| `../HandStock_X.sql` | `0022` — the stock level per engineer & spare, its movements, and `engineer_stock` redefined over them (repo root) | `stock_transfer` |
| `call_requests.sql` | `0003`, `0010`, `0011`, `0012`, `0014`, `0015` — call requests, the Hotline actions, call state, Call Number | `user_directory` |
| `masters.sql` | `0021` — master value lists registry + the "200 All Masters" seed | `rbac` |
| `reports.sql` | `0010_reports_ordering` — visit-history ordering indexes | base `0001` |
| `all.sql` | every module above, in dependency order | base `0001` |

Use `all.sql` when a project is behind on more than one module; use a
per-module bundle when you only need that one.

> Migration numbers are per-module, so two files can share a number (`0011_spare_intake.sql` and `0011_call_request_actions.sql`). The bundles list exactly which files they carry — go by the file name, not the number.

## Verifying a change

`supabase/tests/` applies the migrations to a throwaway Postgres and exercises
the spare-request triggers. Run it after regenerating — it is what caught the
approval-guard bug fixed in `0012`.

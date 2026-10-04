# Validation run record

**GENERATED — do not hand-edit.** Written by `scripts/validate-run.mjs`
(`npm run validate -- "<psql args>"`). Each run REPLACES this file; the
defect register in `src/lib/validation.ts` is what accumulates.

- **Run at** 2026-10-04T09:14:54.333Z
- **Took** 18s
- **Commit** `78617de2` on `claude/field-service-module-poc-hslouq`
- **Version** 0.10.68

## Result

| | Passed | Total |
| --- | --- | --- |
| Database suites | 0 | 0 |
| Automated checks | 15 | 22 |
| Labelled `expect ERROR` outcomes matched | 0 | 0 |

**How a suite is judged.** Each suite runs on its OWN copy of a database
built from every migration, because run against one shared database they
collide on their own fixtures and that reads as a failure it is not. Its
output is then matched: every `expect ERROR` label consumes the next error.
**Both directions fail** — an error nobody expected, and an expectation whose
error never arrived. The second is the one that matters most: a guard that
stopped working produces a suite that runs clean.

## Setup

| | Result | |
| --- | --- | --- |
| `building the template database` | ❌ **FAIL** | psql: error: connection to server on socket "/tmp/pg/.s.PGSQL.55432" failed: Connection refused
	Is the server running locally and accepting connections on that socket?
 |

## Automated checks

| | Result | |
| --- | --- | --- |
| `check:bundles` | ✅ pass | no NEW object is split across modules (505 checked, 37 known and listed) |
| `check:columns` | ❌ **FAIL** | psql: error: connection to server on socket "/tmp/pg/.s.PGSQL.55432" failed: Connection refused · node:internal/errors:983 ·   const err = new Error(message); · Error: Command failed: bash -c psql -h /tmp/pg -p 55432 -U postgres -d val_checks -tA -c "select table_name \|\| '.' \|\| column_name from information_schema.columns where table_schema='public'" |
| `check:cover-party` | ✅ pass | all passed |
| `check:dberror` | ✅ pass | all passed |
| `check:generated` | ✅ pass | every generated bundle matches its migrations (109 checked) |
| `check:kyc` | ✅ pass | all passed |
| `check:machine` | ✅ pass | all passed |
| `check:mapping` | ✅ pass | all passed |
| `check:nar003` | ✅ pass | all passed |
| `check:orders` | ❌ **FAIL** | psql: error: connection to server on socket "/tmp/pg/.s.PGSQL.55432" failed: Connection refused · node:internal/errors:983 ·   const err = new Error(message); · Error: Command failed: psql -h /tmp/pg -p 55432 -U postgres -d val_checks -Atc  |
| `check:paging` | ✅ pass | all passed |
| `check:picklist` | ✅ pass | all passed |
| `check:picklist:open` | ✅ pass | all passed |
| `check:replay` | ❌ **FAIL** | node:internal/errors:983 ·   const err = new Error(message); · Error: Command failed: psql -h /tmp/pg -p 55432 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c create database rithi_replay_ref · psql: error: connection to server on socket "/tmp/pg/.s.PGSQL.55432" failed: Connection refused |
| `check:reports` | ❌ **FAIL** | psql: error: connection to server on socket "/tmp/pg/.s.PGSQL.55432" failed: Connection refused · node:internal/errors:983 ·   const err = new Error(message); · Error: Command failed: psql -h /tmp/pg -p 55432 -U postgres -d val_checks -Atc select string_agg(column_name, E'\n' order by ordinal_position) |
| `check:safe-updates` | ✅ pass | no WHERE-less update or delete in any of the 285 functions |
| `check:scheduled-export` | ✅ pass | all passed |
| `check:status` | ❌ **FAIL** | psql: error: connection to server on socket "/tmp/pg/.s.PGSQL.55432" failed: Connection refused |
| `check:ui` | ✅ pass | all passed |
| `check:uploads` | ✅ pass | all passed |
| `check:upserts` | ❌ **FAIL** | psql: error: connection to server on socket "/tmp/pg/.s.PGSQL.55432" failed: Connection refused · node:internal/errors:983 ·   const err = new Error(message); · Error: Command failed: psql -h /tmp/pg -p 55432 -U postgres -d val_checks -Atc select coalesce((select relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='field_calls'), '?') |
| `check:views` | ❌ **FAIL** | psql: error: connection to server on socket "/tmp/pg/.s.PGSQL.55432" failed: Connection refused · node:internal/errors:983 ·   const err = new Error(message); · Error: Command failed: psql -h /tmp/pg -p 55432 -U postgres -d val_checks -At -c  |

## Database suites

### ✅ 0 suite(s) clean




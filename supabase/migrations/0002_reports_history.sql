-- ===========================================================================
-- Reports = visit history: one row per VISIT, keyed by UID (not one per UCN).
-- Run in the Supabase SQL Editor as postgres. This drops the one-per-UCN
-- uniqueness, adds a unique `uid`, clears the deduped reports, and lets you
-- re-import all visit rows.
-- ===========================================================================

-- 1) Drop the one-report-per-UCN constraint (created by `unique (ucn)`).
alter table public.reports drop constraint if exists reports_ucn_key;

-- 2) Add the visit UID and make it the natural key.
alter table public.reports add column if not exists uid text;
create unique index if not exists reports_uid_key on public.reports (uid) where uid is not null;
create index if not exists reports_ucn_idx on public.reports (ucn);

-- 3) Clear the earlier de-duped load so the full visit history can be re-imported.
truncate table public.reports;

-- After running this, re-import reports.csv from Admin Config → Bulk Data Import
-- (now one row per visit, ~17,392 rows).

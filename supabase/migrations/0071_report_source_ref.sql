-- ===========================================================================
-- Bulk report → call mapping: keep what a link was DERIVED FROM.
--
-- Reports recovered from an AppSheet export arrive carrying AppSheet file
-- references, not Drive links — `Reports_Images/foo.png`, or a
-- gettablefileurl?... URL. The import turns those into Drive links and stores
-- them in `manual_report`, which is what the app opens.
--
-- `source_ref` keeps the ORIGINAL reference alongside it. Without that, a link
-- that resolved to the wrong file is unprovable and unfixable: you cannot tell
-- what it was meant to point at, and a re-run has nothing to re-resolve from.
-- For a quality record that is the difference between a recoverable mistake and
-- a permanent one, which is why it is a column and not a note in `data`.
--
-- `mapped_at` says the row came in through the bulk mapping rather than from an
-- engineer in the field — so a recovered visit is never mistaken for one
-- reported live.
-- ===========================================================================

alter table public.reports add column if not exists source_ref text not null default '';
alter table public.reports add column if not exists mapped_at  timestamptz;

comment on column public.reports.source_ref is
  'The original AppSheet file reference this row''s manual_report was derived from. Kept so a wrong link can be re-resolved.';
comment on column public.reports.mapped_at is
  'Set when the row was loaded by the bulk report → call mapping, not reported live.';

-- The mapping looks a call up by UCN and by call number; both already have
-- their index (0002, 0010). This one is for finding what the bulk run touched.
create index if not exists reports_mapped_at_idx on public.reports (mapped_at desc) where mapped_at is not null;

-- ---------------------------------------------------------------------------
-- Make `uid` usable as an UPSERT target.
--
-- 0002 created it as a PARTIAL unique index (`where uid is not null`).
-- Postgres will not infer a partial index from a bare `on conflict (uid)`, so
-- the bulk mapping's upsert failed outright with "there is no unique or
-- exclusion constraint matching the ON CONFLICT specification" — which is what
-- makes re-running a recovery sheet correct its rows instead of doubling the
-- visit history.
--
-- A FULL unique index is equivalent here and does infer: NULLs are distinct in
-- a unique index, so the rows with no uid (the sheet-era ones) still coexist
-- exactly as they did under the partial index.
-- ---------------------------------------------------------------------------
create unique index if not exists reports_uid_uniq on public.reports (uid);
drop index if exists public.reports_uid_key;

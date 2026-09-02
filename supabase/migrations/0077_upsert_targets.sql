-- ===========================================================================
-- Make the bulk-upload upsert targets INFERABLE.
--
-- `on conflict (cols)` needs a unique index Postgres can infer from that exact
-- column list. It cannot infer a PARTIAL index, an EXPRESSION index, or
-- anything at all on a VIEW. Five registers were declared against targets that
-- fail one of those tests, so their upload was refused outright — "there is no
-- unique or exclusion constraint matching the ON CONFLICT specification", or
-- worse, silence.
--
-- The same trap has now been sprung four times (0071's partial reports_uid_key,
-- 0074, 0076, and here), which is why `npm run check:uploads` now verifies every
-- register's conflict target against a real database rather than by eye.
--
-- The call registers needed no change here: they were pointed at the `calls`
-- VIEW, and the fix is in the app — target the physical field_calls /
-- installation_calls / pm_calls, each of which already has <table>_ucn_key and
-- still fires calls_biu (call number, reg date). That is strictly better: the
-- upsert works AND the stamping trigger still runs.
-- ===========================================================================

-- ---- product_additional_entries: expression index -> stored column ---------
alter table public.product_additional_entries
  add column if not exists serial_key text generated always as (lower(btrim(serial_number))) stored;

create unique index if not exists product_additional_entries_serial_key_uniq
  on public.product_additional_entries (serial_key);
drop index if exists public.product_additional_entries_serial_uniq;

-- ---- spare_consumption_history: partial index -> plain -------------------
--
-- The partial index (`where ref <> ''`) protected only the rows that carry a
-- reference, and could not be inferred. A row with no reference cannot be
-- matched on a re-run anyway, so the upload now REQUIRES one and this index is
-- plain — which makes it both inferable and honest about what it guarantees.
--
-- Guarded: if rows without a reference are already loaded they would all
-- collide on ('', source), so say so rather than failing the migration.
do $$
begin
  if exists (
    select 1 from public.spare_consumption_history
     group by source_key, ref having count(*) > 1
  ) then
    raise notice 'spare_consumption_history has rows sharing (source, ref) — leaving the partial index in place. Give those rows a distinct ref and re-run this file.';
    return;
  end if;
  drop index if exists public.spare_consumption_history_ref_uniq;
  create unique index if not exists spare_consumption_history_ref_uniq
    on public.spare_consumption_history (source_key, ref);
end $$;

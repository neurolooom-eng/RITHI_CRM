-- ===========================================================================
-- D-071 (the user's decision, 2026-10-12: "Overwrite with the file").
--
-- The MRN Register and the Stock Transfer Lines uploads had no key the upload
-- could name, so they were INSERTED, and a second run of the same file moved
-- the stock again -- an engineer holding parts that do not exist (URS-153).
-- A line the database numbered itself (max + 1 within its submission) never
-- collided, which is how a file WITHOUT row numbers went in twice even where a
-- unique index existed.
--
-- From here a re-loaded line takes the file's values instead:
--
--   1. MRN Register: keyed on SI Number + part code + line number. The part
--      CODE is what a return is counted by (material_returns_uid_part_idx, 0039,
--      already makes it unique), so it becomes a column, part_key, that the
--      upload can name -- PostgREST cannot infer an expression index.
--   2. Stock Transfer Lines: keyed on transfer + line number -- IF NO TWO LINES
--      ALREADY SHARE ONE. A file loaded twice before this fix left exactly such
--      pairs, and a unique index cannot be built over them; the migration then
--      says so and leaves the key off rather than failing whole.
--      supabase/apply/_stock_transfer_lines_repeated.sql lists them.
--   3. An UPDATE policy on each, for an IMPORTED row and an importer only
--      (bulk.upload, or import.panel for the legacy importer): giving a table a
--      conflict target turns a repeated row into an UPDATE, and neither table
--      had an UPDATE policy at all.
--   4. "A material return cannot be edited" now lets an importer overwrite an
--      IMPORTED return with the file's values. A return raised in the app is
--      untouched -- it is still corrected by a correcting entry. The upload
--      numbers the lines in file order where the file has none, so the same
--      file lands on the same rows (src/lib/uploads.ts, numberLines).
--
-- Every overwrite is imaged before and after by record_audit (0314).
-- ===========================================================================

-- 1. The MRN key. A STORED generated column: part_code() is immutable.
alter table public.material_returns
  add column if not exists part_key text generated always as (public.part_code(part)) stored;
comment on column public.material_returns.part_key is
  'The part code, kept by the database from `part` (part_code()). Part of the key a re-loaded MRN line is matched on: SI Number (uid) + part_key + row_no (D-071, 0455).';
-- Cannot collide with existing rows: material_returns_uid_part_idx is unique
-- on (uid, part_code(part), coalesce(row_no, 0)), and row_no is always set.
create unique index if not exists material_returns_natural_key
  on public.material_returns (uid, part_key, row_no);

-- 2. The transfer-line key, where the data allows it.
do $$
declare d int;
begin
  select count(*) into d from (
    select 1 from public.stock_transfer_lines
     where row_no is not null
     group by transfer_uid, row_no having count(*) > 1) x;
  if d = 0 then
    create unique index if not exists stock_transfer_lines_natural_key
      on public.stock_transfer_lines (transfer_uid, row_no);
  else
    raise notice 'D-071: % transfer line number(s) are held by more than one line, so the Stock Transfer Lines key was NOT created and a re-run of that upload is refused until they are resolved. supabase/apply/_stock_transfer_lines_repeated.sql lists them; then re-run this migration.', d;
  end if;
end $$;

-- 3. The UPDATE policies a conflict target needs. TO authenticated: the public
-- key holds no permission, and has_perm() answers FALSE for a login with no
-- profile (0300).
drop policy if exists mr_import_update on public.material_returns;
create policy mr_import_update on public.material_returns for update to authenticated
  using (source = 'import'
         and ((select public.has_perm('bulk.upload')) or (select public.has_perm('import.panel'))))
  with check (source = 'import'
         and ((select public.has_perm('bulk.upload')) or (select public.has_perm('import.panel'))));

drop policy if exists stl_import_update on public.stock_transfer_lines;
create policy stl_import_update on public.stock_transfer_lines for update to authenticated
  using (((select public.has_perm('bulk.upload')) or (select public.has_perm('import.panel')))
         and exists (select 1 from public.stock_transfers t
                      where t.uid = stock_transfer_lines.transfer_uid and t.source = 'import'))
  with check (((select public.has_perm('bulk.upload')) or (select public.has_perm('import.panel')))
         and exists (select 1 from public.stock_transfers t
                      where t.uid = stock_transfer_lines.transfer_uid and t.source = 'import'));

-- 4. The return guard, restated from 0310 with the import overwrite added and
-- part_key left out of the rename comparison: a generated column is not yet
-- computed in a BEFORE trigger, so NEW and OLD would never compare equal.
create or replace function public.material_returns_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  -- D-071 (0455): an IMPORTED return re-loaded from its file takes the file's
  -- values, by an importer only. It stays imported -- a return raised in the
  -- app is never reached by this.
  if old.source = 'import' and new.source = 'import'
     and auth.uid() is not null
     and (public.has_perm('bulk.upload') or public.has_perm('import.panel')) then
    return new;
  end if;
  -- A PART RENAME (0310): only the part changed, exactly as the ticket that
  -- rename_part_records() filed in this transaction says. Nothing else on a
  -- return may change, by anybody but an administrator.
  if (to_jsonb(new) - 'part' - 'part_key' - 'sys_updated_by' - 'sys_updated_on')
       = (to_jsonb(old) - 'part' - 'part_key' - 'sys_updated_by' - 'sys_updated_on')
     and exists (select 1 from public.part_rename_ticket t
                  where t.txid = txid_current()
                    and t.old_key = lower(btrim(old.part))
                    and t.new_detail = new.part) then
    return new;
  end if;
  raise exception 'A material return cannot be edited — raise a correcting entry instead';
end $$;

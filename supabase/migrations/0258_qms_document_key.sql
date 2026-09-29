-- ===========================================================================
-- QMS DOCUMENTS BY BULK UPLOAD -- the Master List.
--
--   The user, 2026-09-30: "I want to be able to do a bulk upload on QMS
--   Documents. 99% it will be a One Time Activity, the QMS Department has a
--   Specific format to maintain the MasterList." What goes up: the Master List
--   with each document's Drive URL (the files are already on Drive).
--
-- TWO THINGS THE UPLOAD NEEDS:
--
--   * A KEY, so a re-load CORRECTS a row instead of adding a second copy of
--     the document: the document number + revision, on the QMS shelf only.
--     NULL for anything without a number (every service manual, and a QMS row
--     typed without one), and NULLs never collide -- so the index constrains
--     exactly the rows the Master List can name, and is a plain unique index
--     PostgREST can infer (check:upserts), not a partial one.
--   * SOMEWHERE FOR THE MASTER LIST'S OWN COLUMNS. Its format is the QMS
--     department's; every heading with no column here is kept in `extra`
--     under its own spelling rather than dropped.
--
-- IF TWO QMS ROWS ALREADY SHARE A NUMBER AND REVISION, the index cannot be
-- built, and this says so instead of failing: nothing is deleted or merged
-- (quality records are never deleted) -- retire or correct one of them on the
-- QMS Documents screen and run this again. _status.sql row 200 checks it.
-- ===========================================================================

alter table public.documents add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.documents add column if not exists doc_key text generated always as (
  case when kind = 'qms' and btrim(doc_no) <> ''
       then lower(btrim(doc_no)) || '|' || lower(btrim(revision)) end) stored;

do $$
declare dup text;
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'documents_doc_key_uniq') then
    return;
  end if;
  select string_agg(doc_key, ', ') into dup
    from (select doc_key from public.documents where doc_key is not null
           group by doc_key having count(*) > 1 limit 20) x;
  if dup is not null then
    raise notice '0258: QMS documents share a number + revision (%); the upload key was NOT created. Correct them and run again.', dup;
    return;
  end if;
  create unique index documents_doc_key_uniq on public.documents (doc_key);
end $$;

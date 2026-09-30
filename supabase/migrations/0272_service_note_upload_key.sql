-- ===========================================================================
-- TECHNICAL / SERVICE NOTES BY BULK UPLOAD -- a key for re-loading the list.
--
--   The user, 2026-09-30, pasting the Drive listing of the Technical Note
--   folder: "Normalise this for bulk upload". The shelf itself exists since
--   v0.10.6 (documents kind 'service_note', no migration); what a bulk load
--   needs is a KEY, so loading the list a second time CORRECTS those rows
--   instead of adding a second copy of every note.
--
-- THE KEY IS THE DRIVE LINK. A note has no controlled number and revision the
-- way a QMS document does (0265): the listing's file names carry a number
-- sometimes and a revision rarely, and two different notes are filed under the
-- same number in two product folders (NT606 is under Extend-XT AND Monnal
-- T75). What names ONE file unambiguously is its Drive link. So url_key is the
-- link, lower-cased and trimmed, for SERVICE NOTES ONLY -- NULL for every other
-- kind, and NULLs never collide, so the index constrains exactly the rows this
-- upload writes and is a plain unique index PostgREST can infer.
--
-- IF TWO NOTES ALREADY SHARE A LINK the index cannot be built; this says so
-- instead of failing, and nothing is deleted. _status.sql row 212 checks it.
-- ===========================================================================

alter table public.documents add column if not exists url_key text generated always as (
  case when kind = 'service_note' and btrim(url) <> '' then lower(btrim(url)) end) stored;

do $$
declare dup text;
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'documents_url_key_uniq') then
    return;
  end if;
  select string_agg(url_key, ', ') into dup
    from (select url_key from public.documents where url_key is not null
           group by url_key having count(*) > 1 limit 20) x;
  if dup is not null then
    raise notice '0272: service notes share a Drive link (%); the upload key was NOT created. Retire one of each and run again.', dup;
    return;
  end if;
  create unique index documents_url_key_uniq on public.documents (url_key);
end $$;

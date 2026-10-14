-- ===========================================================================
-- 0368 — A QMS DOCUMENT'S REVISION IS A NEW ENTRY, NOT AN EDIT, AND A QMS
--        DOCUMENT IS RETIRED, NEVER DELETED
--        (second re-review D-061)
--
-- documents_update (0070) let any holder of qms.manage save number, revision,
-- effective date and link over an existing QMS row, and documents_delete let
-- them delete it. Measured: revision 01 changed to 02 in place, effective
-- date cleared, link replaced -- UPDATE 1. What was in force on a date was
-- replaced rather than retired; the screen's own guidance says to publish a
-- new revision as a new entry, and nothing held it.
--
-- For a QMS document (kind = 'qms'), signed in and not an importer:
--   * a NEW one needs its document number, revision and effective date;
--   * on an existing one, Document No, Revision, Effective date and the file
--     (url) may be FILLED where blank and are otherwise fixed -- a new revision
--     is added as a new entry and the old one retired (Retire sets active);
--     title, tags, notes, Live / Retired stay editable;
--   * it is not deleted: a quality record is retired (the 0049 rule);
--   * a document cannot be moved into or out of the QMS shelf.
-- Service manuals and technical notes are untouched. Imports (bulk.upload /
-- import.panel) and a connection with no session load history as it was --
-- stock_import_allowed()'s rule (0339), written out because that function is
-- created by a later module.
-- In the documents module, after 0356.
-- ===========================================================================

create or replace function public.qms_document_controlled()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_changed text[] := '{}';
begin
  if auth.uid() is null or public.has_perm('bulk.upload') or public.has_perm('import.panel') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if old.kind = 'qms' then
      raise exception 'A QMS document is a quality record: it is retired (Retire), not deleted'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and (old.kind = 'qms') is distinct from (new.kind = 'qms') then
    raise exception 'A document is not moved into or out of the QMS shelf -- add it there as a new entry'
      using errcode = '42501';
  end if;
  if new.kind is distinct from 'qms' then return new; end if;

  if tg_op = 'INSERT' then
    if btrim(coalesce(new.doc_no, '')) = '' or btrim(coalesce(new.revision, '')) = '' or new.effective_date is null then
      raise exception 'A QMS document needs its Document No, Revision and Effective date'
        using errcode = '23502';
    end if;
    return new;
  end if;

  -- UPDATE: a controlled field may be filled where blank, never changed.
  if btrim(coalesce(old.doc_no, '')) <> '' and btrim(coalesce(new.doc_no, '')) is distinct from btrim(old.doc_no) then
    v_changed := v_changed || 'Document No'::text;
  end if;
  if btrim(coalesce(old.revision, '')) <> '' and btrim(coalesce(new.revision, '')) is distinct from btrim(old.revision) then
    v_changed := v_changed || 'Revision'::text;
  end if;
  if old.effective_date is not null and new.effective_date is distinct from old.effective_date then
    v_changed := v_changed || 'Effective date'::text;
  end if;
  if btrim(coalesce(old.url, '')) <> '' and btrim(coalesce(new.url, '')) is distinct from btrim(old.url) then
    v_changed := v_changed || 'the file'::text;
  end if;
  if array_length(v_changed, 1) > 0 then
    raise exception 'A QMS document''s % is fixed once recorded -- add the new revision as a new entry and retire this one',
      array_to_string(v_changed, ', ') using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.qms_document_controlled() from public, anon, authenticated;
drop trigger if exists qms_document_controlled on public.documents;
create trigger qms_document_controlled
  before insert or update or delete on public.documents
  for each row execute function public.qms_document_controlled();

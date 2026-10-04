-- ===========================================================================
-- TECHNICAL / SERVICE NOTES: MANY EDITS, ONE SAVE.
--
-- The user, 2026-10-04: "Give me a Beta Edit -- like one click at the top,
-- make all changes and 1 Save saves all the changes done."
--
-- save_service_notes(p_rows jsonb) takes an array of {id, <field>: <value>...}
-- and writes every one in ONE transaction: all of it, or -- on the first
-- refusal -- none of it, so a half-applied batch cannot happen.
--
-- SECURITY INVOKER, deliberately: the documents_update policy (0070) decides
-- exactly as it does for one edit -- docs.manage for a note. A row the policy
-- refuses matches nothing and Postgres raises no error (finding 48), so each
-- UPDATE is counted and a miss STOPS the batch with the note's id, instead of
-- the batch reporting a refused edit as saved.
--
-- Only the fields a note carries are written, and only those present in the
-- element: title, product, doc_no, revision, effective_date, dated, tags,
-- notes, url, file_name, extra. A date sent blank is cleared. Title and link
-- may not be blanked -- the same rule as the form. kind, active and the Drive
-- facts are not writable here. Changing dated or product fires 0354's trigger
-- and the Latest marks follow.
-- ===========================================================================

create or replace function public.save_service_notes(p_rows jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  r     jsonb;
  v_id  bigint;
  v_n   integer := 0;
  v_hit integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'save_service_notes expects an array of notes' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_id := nullif(r->>'id', '')::bigint;
    if v_id is null then
      raise exception 'A note in the batch has no id' using errcode = '22023';
    end if;
    if (r ? 'title' and btrim(coalesce(r->>'title', '')) = '')
       or (r ? 'url' and btrim(coalesce(r->>'url', '')) = '') then
      raise exception 'Note % needs a title and a link -- nothing was saved', v_id using errcode = '23514';
    end if;
    if r ? 'extra' and jsonb_typeof(r->'extra') is distinct from 'object' then
      raise exception 'Note %: extra must be an object', v_id using errcode = '22023';
    end if;

    update public.documents d set
      title          = case when r ? 'title'          then btrim(r->>'title')                          else d.title end,
      product        = case when r ? 'product'        then coalesce(r->>'product', '')                 else d.product end,
      doc_no         = case when r ? 'doc_no'         then coalesce(btrim(r->>'doc_no'), '')           else d.doc_no end,
      revision       = case when r ? 'revision'       then coalesce(btrim(r->>'revision'), '')         else d.revision end,
      effective_date = case when r ? 'effective_date' then nullif(r->>'effective_date', '')::date      else d.effective_date end,
      dated          = case when r ? 'dated'          then nullif(r->>'dated', '')::date               else d.dated end,
      tags           = case when r ? 'tags'           then coalesce(btrim(r->>'tags'), '')             else d.tags end,
      notes          = case when r ? 'notes'          then coalesce(btrim(r->>'notes'), '')            else d.notes end,
      url            = case when r ? 'url'            then btrim(r->>'url')                            else d.url end,
      file_name      = case when r ? 'file_name'      then coalesce(btrim(r->>'file_name'), '')        else d.file_name end,
      extra          = case when r ? 'extra'          then r->'extra'                                  else d.extra end,
      updated_at     = now()
     where d.id = v_id and d.kind = 'service_note';
    get diagnostics v_hit = row_count;
    if v_hit = 0 then
      raise exception 'Note % was not saved -- it no longer exists, or your role may not edit it. Nothing in this batch was saved.', v_id
        using errcode = '42501';
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke execute on function public.save_service_notes(jsonb) from public, anon;
grant execute on function public.save_service_notes(jsonb) to authenticated;

comment on function public.save_service_notes(jsonb) is
  'Technical / Service Notes Beta Edit: writes every edited note in one transaction under the caller''s own rights (documents_update), all or nothing (0355).';

-- ===========================================================================
-- TECHNICAL / SERVICE NOTES: A DATE OF THEIR OWN, AND THE LATEST ONE PER
-- PRODUCT MARKED.
--
-- The user, 2026-10-04: "Group it as Per Product. Add a Column [Dated], which
-- I will update manually. Sort it by Dated, Newest to Oldest. Automatically add
-- a Tag as Latest. When I add a new Technical Note for the Product, these Auto
-- Tags should reset and update according to the Latest. I should have a Button
-- to Trigger this correction."  Settled with the user the same day:
--   * a note covering several products is listed under EACH of them, and may
--     be the latest for one and not another -- so the mark is PER PRODUCT;
--   * a note with no product is the "Every product" group (token '');
--   * only a LIVE note with a Dated can be the latest -- a note not yet dated,
--     or retired, is never marked; two live notes on the same newest date are
--     both marked;
--   * the mark is STORED, recalculated automatically, and on demand by a button.
--
-- documents.dated       the date the user gives the note, by hand. Not
--                       effective_date (the QMS field) and not created_at (when
--                       it was entered here) -- a note entered today may be
--                       dated years ago.
-- documents.latest_for  the products this note is currently the latest for,
--                       spelled as on the note; '' stands for "Every product".
--                       Written ONLY by refresh_service_note_latest_all().
--
-- WHEN IT RECALCULATES: a statement-level trigger after any insert or delete of
-- a document, and after an update of kind / product / dated / active -- so a
-- bulk upload of 300 notes recalculates once, and the recalculation's own write
-- (latest_for only) does not fire it again. The Refresh button calls
-- refresh_service_note_latest(), which asks for docs.manage and does the same.
-- Only rows whose mark actually changes are written.
-- ===========================================================================

alter table public.documents add column if not exists dated date;
alter table public.documents add column if not exists latest_for text[] not null default '{}';

comment on column public.documents.dated is
  'Technical / Service Notes: the note''s own date, entered by hand. Orders the shelf (newest first) and decides which note is the latest per product (0350).';
comment on column public.documents.latest_for is
  'Technical / Service Notes: the products this note is the latest for ('''' = every product). Written only by refresh_service_note_latest_all() (0350).';

create index if not exists documents_dated_idx on public.documents (kind, dated desc);

-- THE RECALCULATION. Products are split exactly as the screen splits them
-- (comma, semicolon, bar, newline; trimmed; blanks dropped) and compared
-- case-insensitively, so "MONNAL T60" and "Monnal T60" are one product.
create or replace function public.refresh_service_note_latest_all()
returns integer language plpgsql security definer set search_path = public as $$
declare v_changed integer;
begin
  with note_products as (
    select d.id, d.dated,
           coalesce(nullif(btrim(p.prod), ''), '') as prod
      from public.documents d
      left join lateral regexp_split_to_table(coalesce(d.product, ''), '[,;|\n]') as p(prod) on true
     where d.kind = 'service_note' and d.active and d.dated is not null
  ),
  -- A note with products listed has '' rows only from blank pieces; drop
  -- those unless the note names no product at all.
  cleaned as (
    select np.* from note_products np
     where np.prod <> ''
        or not exists (select 1 from note_products o where o.id = np.id and o.prod <> '')
  ),
  newest as (
    select lower(prod) as k, max(dated) as top from cleaned group by lower(prod)
  ),
  marks as (
    select c.id, array_agg(distinct c.prod order by c.prod) as latest
      from cleaned c join newest n on n.k = lower(c.prod) and n.top = c.dated
     group by c.id
  ),
  target as (
    select d.id, coalesce(m.latest, '{}'::text[]) as latest
      from public.documents d left join marks m on m.id = d.id
     where d.kind = 'service_note'
  )
  update public.documents d set latest_for = t.latest
    from target t
   where t.id = d.id and d.latest_for is distinct from t.latest;
  get diagnostics v_changed = row_count;
  return v_changed;
end $$;

revoke execute on function public.refresh_service_note_latest_all() from public, anon, authenticated;

-- THE BUTTON. The same work, for whoever may maintain the shelf.
create or replace function public.refresh_service_note_latest()
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('docs.manage') then
    raise exception 'Your role does not have permission for this action' using errcode = '42501';
  end if;
  return public.refresh_service_note_latest_all();
end $$;

revoke execute on function public.refresh_service_note_latest() from public, anon;
grant execute on function public.refresh_service_note_latest() to authenticated;

create or replace function public.documents_refresh_latest()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_service_note_latest_all();
  return null;
end $$;

revoke execute on function public.documents_refresh_latest() from public, anon, authenticated;

drop trigger if exists zz_service_note_latest_ins on public.documents;
create trigger zz_service_note_latest_ins after insert or delete on public.documents
  for each statement execute function public.documents_refresh_latest();
drop trigger if exists zz_service_note_latest_upd on public.documents;
create trigger zz_service_note_latest_upd after update of kind, product, dated, active on public.documents
  for each statement execute function public.documents_refresh_latest();

-- The notes already on the shelf: none has a Dated yet, so this marks nothing
-- today; it is here so a re-run after dates were loaded by hand lands right.
select public.refresh_service_note_latest_all();

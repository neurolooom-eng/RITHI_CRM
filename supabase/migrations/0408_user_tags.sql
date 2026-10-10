-- ===========================================================================
-- 0408 -- TAGS ON THE USER MASTER (the user, 2026-10-10: "in User Master, Add
-- provision for Tags..").
--
-- Asked and answered:
--   * What for: "I need to add People to list in FFR - CAPA Responsibility".
--     A person tagged "CAPA Responsibility" is offered in that picker on the
--     Field Failure Register, beside "No closed in FFR".
--   * Values: FREE TEXT, several per person. No master list.
--   * Where: the person's form, a table column, a filter at the top and a
--     bulk add / remove.
--
-- A text[] on `user_directory`, read by everyone signed in like the rest of
-- the row -- a tag is not private. Written under the directory's own policies
-- (users.manage.details); nothing new is granted.
--
-- TIDIED IN THE DATABASE so every writer -- the table edit, the form, the bulk
-- action, an import -- stores the same shape: each tag trimmed, blanks
-- dropped, and a tag repeated in another case kept ONCE, in the spelling that
-- came first. A free-text tag typed "CAPA responsibility" and "CAPA
-- Responsibility" on one person is one tag, not two. Case is otherwise kept as
-- typed, and comparing is done case-blind by whoever reads it.
-- ===========================================================================

alter table public.user_directory add column if not exists tags text[] not null default '{}';
create index if not exists user_directory_tags_idx on public.user_directory using gin (tags);

create or replace function public.user_directory_tags_tidy()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.tags := coalesce((
    select array_agg(t order by first_at)
      from (select distinct on (lower(btrim(x))) btrim(x) as t, ord as first_at
              from unnest(coalesce(new.tags, '{}'::text[])) with ordinality u(x, ord)
             where btrim(coalesce(x, '')) <> ''
             order by lower(btrim(x)), ord) s), '{}'::text[]);
  return new;
end $$;

drop trigger if exists user_directory_tags_tidy on public.user_directory;
create trigger user_directory_tags_tidy
  before insert or update of tags on public.user_directory
  for each row execute function public.user_directory_tags_tidy();

comment on column public.user_directory.tags is
  'Free-text tags, several per person (0408). "CAPA Responsibility" puts the person on the Field Failure Register''s CAPA Responsibility list. Trimmed, blanks dropped, one per spelling case-blind.';

-- ===========================================================================
-- Knowledge Base — team-written field-solution articles. Anyone signed in can
-- read every article and contribute one; the author (or an admin) can edit or
-- delete their own. Stamped with the author so the team knows who to ask.
-- ===========================================================================

create table if not exists public.kb_articles (
  id           bigint generated always as identity primary key,
  title        text not null,
  body         text not null,
  category     text default '',      -- Field Issue / How-To / Product Tip / Other
  product      text default '',      -- optional: the product / model it concerns
  tags         text default '',      -- optional: comma-separated keywords
  attachments  jsonb not null default '[]',  -- [{name, url}] — links to files in Drive / on Pages / anywhere
  author_name  text default '',
  author_email text default '',
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists kb_articles_updated_idx  on public.kb_articles (updated_at desc);
create index if not exists kb_articles_category_idx  on public.kb_articles (category);

-- Stamp the author on insert (can't be spoofed) and updated_at on every write.
create or replace function public.kb_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists kb_biu on public.kb_articles;
create trigger kb_biu before insert or update on public.kb_articles
  for each row execute function public.kb_before_write();

alter table public.kb_articles enable row level security;
grant select, insert, update, delete on public.kb_articles to authenticated;

-- Read: everyone signed in. Contribute: any signed-in user (stamped as self).
-- Edit / delete: the author, or an admin.
drop policy if exists kb_read on public.kb_articles;
create policy kb_read on public.kb_articles for select
  using (auth.role() = 'authenticated');

drop policy if exists kb_insert on public.kb_articles;
create policy kb_insert on public.kb_articles for insert
  with check (auth.uid() is not null);

drop policy if exists kb_update on public.kb_articles;
create policy kb_update on public.kb_articles for update
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists kb_delete on public.kb_articles;
create policy kb_delete on public.kb_articles for delete
  using (created_by = auth.uid() or public.is_admin());

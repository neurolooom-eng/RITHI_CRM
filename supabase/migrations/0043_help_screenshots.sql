-- ===========================================================================
-- Help screenshots — one optional picture per task in the "How to use RITHI
-- CRM" guide, keyed by the task's section id (e.g. 'request', 'install'). Every
-- signed-in user sees them; only an admin can set or clear one. The image is a
-- downscaled data URL (same as Knowledge Base article images), so no separate
-- file store is needed.
-- ===========================================================================

create table if not exists public.help_screenshots (
  section_id  text primary key,             -- matches a guide section id
  image       text not null,                -- data URL (downscaled JPEG/PNG)
  caption     text not null default '',
  updated_by  uuid references auth.users (id),
  updated_at  timestamptz not null default now()
);

-- Stamp who/when on every write (can't be spoofed by the client).
create or replace function public.help_shot_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists help_shot_biu on public.help_screenshots;
create trigger help_shot_biu before insert or update on public.help_screenshots
  for each row execute function public.help_shot_before_write();

alter table public.help_screenshots enable row level security;
grant select, insert, update, delete on public.help_screenshots to authenticated;

-- Read: everyone signed in. Set / replace / clear: admins only.
drop policy if exists help_shot_read on public.help_screenshots;
create policy help_shot_read on public.help_screenshots for select
  using (auth.role() = 'authenticated');

drop policy if exists help_shot_insert on public.help_screenshots;
create policy help_shot_insert on public.help_screenshots for insert
  with check (public.is_admin());

drop policy if exists help_shot_update on public.help_screenshots;
create policy help_shot_update on public.help_screenshots for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists help_shot_delete on public.help_screenshots;
create policy help_shot_delete on public.help_screenshots for delete
  using (public.is_admin());

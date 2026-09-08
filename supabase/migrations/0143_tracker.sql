-- ===========================================================================
-- THE TRACKER — a shared list of what is being worked on.
--
-- The user, 2026-09-08: "add a tracker page under admin to track activities.
-- something very similar to backlog.. shared between me and a few other. all who
-- have access should be able add, edit".
--
-- SO IT IS ONE PERMISSION, NOT TWO. `mod:/tracker` grants the page AND the right
-- to add and edit on it -- "all who have access should be able to add, edit" is
-- the whole access model, and splitting it into a view right and an edit right
-- would invent a distinction the user did not ask for and then require two ticks
-- to undo. Sharing it with somebody is one tick in Roles & Permissions.
--
-- Nothing is granted to any role here except ADMIN. A tracker that arrived
-- already visible to the whole company would be the opposite of "shared between
-- me and a few other" -- the few are chosen, not defaulted.
--
-- NOTHING IS EVER DELETED BY ACCIDENT, and nothing is hidden either. An item is
-- CLOSED (status Done or Dropped) and stays on the list; the page filters it out
-- of the default view. A shared list people delete from is one nobody trusts,
-- because the thing you remember agreeing is simply not there any more and there
-- is no way to tell whether it was done or dropped. Deleting is still possible
-- and is a deliberate act on the row.
--
-- WHO TOUCHED IT LAST IS THE POINT OF A SHARED LIST. `updated_by` and
-- `updated_at` are stamped by a trigger, not by the client -- so they cannot be
-- forgotten, and cannot be set to somebody else. `app_user_names` (0068) turns
-- the id into a name for the screen.
--
-- FREE TEXT WHERE THE BACKLOG HAS PROSE. `status` and `area` are plain text with
-- a CHECK only on status: a tracker whose categories have to be migrated before
-- somebody can file a thought is a tracker people keep in a spreadsheet instead.
-- ===========================================================================

create table if not exists public.tracker_items (
  id          bigint generated always as identity primary key,
  title       text not null,
  detail      text not null default '',
  -- OPEN is the default because an item somebody just typed is open by
  -- definition, and making them choose is a step that adds nothing.
  status      text not null default 'Open'
              check (status in ('Open', 'In progress', 'Blocked', 'Done', 'Dropped')),
  -- WHO IT IS WITH -- free text, because it is as often "a decision" or a
  -- customer as it is a person on this system.
  owner       text not null default '',
  area        text not null default '',      -- Calls, Spares, Objectives, Data …
  due_date    date,
  -- Hand ordering, so the list can be arranged the way the people using it
  -- think about it rather than by whatever they happened to type first.
  sort_order  integer not null default 0,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

create index if not exists tracker_items_open_idx
  on public.tracker_items (status, sort_order, id);

alter table public.tracker_items enable row level security;

-- ONE PERMISSION FOR BOTH. `for all` covers select, insert, update and delete;
-- `using` gates the rows a reader sees and `with check` the rows a writer may
-- leave behind, and both ask the same question.
drop policy if exists tracker_rw on public.tracker_items;
create policy tracker_rw on public.tracker_items for all
  using (public.has_perm('mod:/tracker'))
  with check (public.has_perm('mod:/tracker'));

grant select, insert, update, delete on public.tracker_items to authenticated;

-- ---------------------------------------------------------------------------
-- WHO, AND WHEN -- stamped here so a client cannot forget it or fake it.
-- ---------------------------------------------------------------------------
create or replace function public.tracker_items_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    -- An edit cannot rewrite who raised it, or when.
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists zz_tracker_items_stamp on public.tracker_items;
create trigger zz_tracker_items_stamp before insert or update on public.tracker_items
  for each row execute function public.tracker_items_stamp();

-- ---------------------------------------------------------------------------
-- THE LIST, WITH NAMES. A shared tracker showing UUIDs would be unreadable, and
-- every consumer resolving them itself is how two screens end up disagreeing
-- about who did something.
--
-- SECURITY INVOKER, so the policy above is what decides who sees it -- not the
-- view's owner. This project has been bitten three times by a view that read as
-- its owner (0040, 0050, 0057) and a shared list is exactly where that would go
-- unnoticed.
-- ---------------------------------------------------------------------------
drop view if exists public.tracker_list;
create view public.tracker_list as
  select t.*,
         coalesce(cu.name, '') as created_by_name,
         coalesce(uu.name, '') as updated_by_name,
         (t.status in ('Done', 'Dropped')) as is_closed
    from public.tracker_items t
    left join public.app_user_names cu on cu.id = t.created_by
    left join public.app_user_names uu on uu.id = t.updated_by;
alter view public.tracker_list set (security_invoker = on);
grant select on public.tracker_list to authenticated;

comment on table public.tracker_items is
  'A shared list of what is being worked on -- the in-app backlog. One permission (mod:/tracker) grants both the page and the right to add and edit, because "all who have access should be able to add, edit" is the access model. Nothing is auto-deleted: an item is Done or Dropped and stays, because a shared list people delete from is one nobody trusts.';

-- ---------------------------------------------------------------------------
-- ADMINS ONLY, TO BEGIN WITH. Everyone else is added by hand on Roles &
-- Permissions -- "a few other" is a choice somebody makes, not a default.
--
-- MERGED, never overwritten: an administrator may have tuned the role already.
-- ---------------------------------------------------------------------------
update public.app_roles ar
   set permissions = (
         select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
           from (
             select jsonb_array_elements_text(ar.permissions) as v
             union
             select 'mod:/tracker' as v
           ) u
       ),
       updated_at = now()
 where ar.role = 'admin'
   and not (ar.permissions ? 'mod:/tracker');

-- ===========================================================================
-- A CHART SOMEBODY BUILDS, AND KEEPS.
--
-- The user, 2026-09-15: "Add a provision to create a chart by myself and save
-- it." Asked earlier in the same session whether it could be saved "for
-- Everyone or for Specific roles" — so scope is part of the feature, not an
-- afterthought.
--
-- MODELLED ON `role_table_views` (0120) DELIBERATELY. That table already
-- answers "this configuration belongs to a role, or to everyone" for register
-- layouts, and a second answer to the same question would be a second set of
-- rules to keep in step. Same columns, same `set_at`, same admin-only rule for
-- anything shared.
--
-- THREE SCOPES, and the difference is who else is affected:
--   • MINE      owner = the person, role is NULL. Anybody may make one; nobody
--               else sees it.
--   • A ROLE    role = the role key. Changes what a group of people see.
--   • EVERYONE  role = ''. Same, for all of them.
-- The last two need `config.manage` or an administrator — the same authority
-- 0120 requires to set a layout for a role, because it is the same act.
--
-- A CHART IS NOT SENSITIVE AND ITS DATA IS NOT IN IT. The row holds a
-- DIMENSION and a chart type: "count the failures by root cause, as a Pareto".
-- The numbers are computed in the reader's own session from rows their own RLS
-- allowed, so a chart shared with somebody who may see less simply shows less.
-- Sharing a chart can never share data.
--
-- THE SPEC IS VALIDATED WHERE IT IS USED, NOT HERE. A jsonb column cannot
-- usefully constrain "dimension must be a column of field_call_review" — the
-- view's shape changes with migrations, and a CHECK that went stale would
-- refuse a chart that is fine. The page ignores a dimension it does not know
-- and says so, which is the failure that can be seen and corrected.
-- ===========================================================================

create table if not exists public.saved_charts (
  id          bigint generated always as identity primary key,
  page        text        not null,                -- which analysis page it belongs to
  name        text        not null,
  role        text,                                -- NULL = private to `owner`; '' = everyone
  owner       uuid        references auth.users (id),
  spec        jsonb       not null default '{}'::jsonb,
  set_at      bigint      not null default (extract(epoch from now()) * 1000)::bigint,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users (id)
);

comment on table public.saved_charts is
  'A chart somebody built and kept. role NULL = private to owner; '''' = everyone; otherwise that role key. The spec holds a dimension and a chart type — never data.';

-- A PERSON CANNOT HAVE TWO CHARTS OF THE SAME NAME ON THE SAME PAGE, and a
-- role cannot either. Partial, because `role` is NULL for a private chart and
-- NULL is not equal to itself: one index per shape, or a private chart and a
-- shared one of the same name would collide with each other.
create unique index if not exists saved_charts_mine_uniq
  on public.saved_charts (page, owner, name) where role is null;
create unique index if not exists saved_charts_shared_uniq
  on public.saved_charts (page, role, name) where role is not null;

create index if not exists saved_charts_page_idx on public.saved_charts (page);

alter table public.saved_charts enable row level security;
grant select, insert, update, delete on public.saved_charts to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- READ: your own, plus anything shared with everyone or with your role.
drop policy if exists sc_read on public.saved_charts;
create policy sc_read on public.saved_charts for select
  using (
    (role is null and owner = auth.uid())
    or role = ''
    or role = public.my_role()
  );

-- WRITE YOUR OWN. `owner = auth.uid()` on both sides, so nobody can create a
-- chart in somebody else's name or move one to them.
drop policy if exists sc_write_mine on public.saved_charts;
create policy sc_write_mine on public.saved_charts for all
  using (role is null and owner = auth.uid())
  with check (role is null and owner = auth.uid());

-- WRITE A SHARED ONE — the same authority 0120 requires to set a register
-- layout for a role, because it is the same act: deciding what a group of
-- people see when they open a screen.
drop policy if exists sc_write_shared on public.saved_charts;
create policy sc_write_shared on public.saved_charts for all
  using (role is not null and (public.is_admin() or public.has_perm('config.manage')))
  with check (role is not null and (public.is_admin() or public.has_perm('config.manage')));

-- WHO SAVED IT IS THE DATABASE'S TO RECORD, not the caller's — 0113's rule for
-- who registered a call, and for the same reason: a caller-supplied author is
-- a name anybody can type. `owner` is stamped on a PRIVATE chart so it cannot
-- be filed against somebody else even by a caller that means well.
create or replace function public.saved_charts_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.role is null then new.owner := auth.uid(); end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    -- `set_at` moves on every write: it is what the reader compares when the
    -- same chart exists both privately and for their role — the later decision
    -- stands, which is 0120's rule and the Auto Save rule before it.
    new.set_at := (extract(epoch from now()) * 1000)::bigint;
  end if;
  return new;
end $$;

drop trigger if exists saved_charts_stamp on public.saved_charts;
create trigger saved_charts_stamp
  before insert or update on public.saved_charts
  for each row execute function public.saved_charts_stamp();

-- ===========================================================================
-- A TABLE'S LAYOUT, SET FOR A ROLE.
--
-- The user's ask (2026-09-06): "like save for everyone, I need option to set
-- the views to roles."
--
-- What a register looks like — which columns, in what order, how wide, grouped
-- by what, filtered how — is currently each person's own, kept in their
-- browser. There is also a "default for everyone", but it goes through the
-- Apps Script sheet bridge, it is all-or-nothing, and it carries only the
-- columns: not the grouping, not the filters. Nobody can say "this is how the
-- Stores In-charge should see Pending Dispatch".
--
-- So: one row per (register, role), holding the whole layout. A role of '' is
-- EVERYONE — the same table answers both questions rather than one mechanism
-- for roles and a different one for all, which would drift.
--
-- WHOSE LAYOUT WINS. The same rule as the Auto Save default, and for the same
-- reason: both the reader's own arrangement and the administrator's carry a
-- TIME, and the later decision stands. "The admin always wins" would make
-- every reader's column picker a lie; "your own always wins" would make
-- "apply to a role" a lie. `set_at` is what the client compares against.
--
-- ADMIN-ONLY WRITE, everyone reads. A layout is not sensitive — it says which
-- columns to show, not what is in them — and RLS on the underlying registers
-- is what decides the rows either way.
-- ===========================================================================

create table if not exists public.role_table_views (
  storage_key text        not null,
  role        text        not null default '',     -- '' = everyone
  view        jsonb       not null default '{}'::jsonb,
  set_at      bigint      not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users (id),
  primary key (storage_key, role)
);

comment on table public.role_table_views is
  'How a register looks for a role: columns, order, widths, grouping, filters. role = '''' means everyone. set_at is compared against the reader''s own arrangement — the later decision wins.';

alter table public.role_table_views enable row level security;
grant select on public.role_table_views to authenticated;
revoke insert, update, delete on public.role_table_views from authenticated;

drop policy if exists rtv_read on public.role_table_views;
create policy rtv_read on public.role_table_views for select
  using (auth.role() = 'authenticated');

-- Writes go through the function below, so the rule about WHO can set a
-- layout lives in one place and `set_at` cannot be back-dated by a caller.
drop policy if exists rtv_write on public.role_table_views;
create policy rtv_write on public.role_table_views for all
  using (public.is_admin() or public.has_perm('config.manage'))
  with check (public.is_admin() or public.has_perm('config.manage'));

create or replace function public.set_role_table_view(
  p_storage_key text, p_role text, p_view jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_at bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not (public.is_admin() or public.has_perm('config.manage')) then
    raise exception 'RBAC: only an administrator can set a layout for a role';
  end if;
  if coalesce(btrim(p_storage_key), '') = '' then
    raise exception 'Which register?';
  end if;

  insert into public.role_table_views (storage_key, role, view, set_at, updated_at, updated_by)
  values (btrim(p_storage_key), coalesce(btrim(p_role), ''), coalesce(p_view, '{}'::jsonb), v_at, now(), auth.uid())
  on conflict (storage_key, role) do update
     set view = excluded.view, set_at = excluded.set_at,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  return v_at;
end $$;
revoke all on function public.set_role_table_view(text, text, jsonb) from public;
grant execute on function public.set_role_table_view(text, text, jsonb) to authenticated;

-- Clearing one is a decision too, and it must be possible without inventing an
-- "empty layout" that would read as "show no columns".
create or replace function public.clear_role_table_view(p_storage_key text, p_role text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.has_perm('config.manage')) then
    raise exception 'RBAC: only an administrator can clear a layout for a role';
  end if;
  delete from public.role_table_views
   where storage_key = btrim(p_storage_key) and role = coalesce(btrim(p_role), '');
  return found;
end $$;
revoke all on function public.clear_role_table_view(text, text) from public;
grant execute on function public.clear_role_table_view(text, text) to authenticated;

-- WHICH LAYOUT APPLIES TO THE CALLER: the one set for their role, and failing
-- that the one set for everyone. Resolved in the database so every register
-- asks the question the same way and a role name is never matched in the
-- browser against a role the browser only thinks it has.
create or replace function public.my_table_view(p_storage_key text)
returns table (view jsonb, set_at bigint, role text)
language sql stable security definer set search_path = public as $$
  select v.view, v.set_at, v.role
    from public.role_table_views v
   where v.storage_key = btrim(p_storage_key)
     and (v.role = '' or v.role = coalesce(public.my_role(), ''))
   order by (v.role <> '') desc      -- the role's own beats the everyone one
   limit 1
$$;
revoke all on function public.my_table_view(text) from public;
grant execute on function public.my_table_view(text) to authenticated;

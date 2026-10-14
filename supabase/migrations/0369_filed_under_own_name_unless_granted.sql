-- ===========================================================================
-- 0369 — A VISIT, ITS SPARES AND A SPARE REQUEST ARE FILED UNDER YOUR OWN
--        NAME, YOUR TEAM'S, OR ANYBODY'S ONLY WITH A KEY GIVEN FOR IT
--        (second re-review D-125; the user's decision, 2026-10-04)
--
-- D-125: nothing compared the ENGINEER on a visit, a consumption line or a
-- spare request with the person filing it. Measured: an engineer booked 2 off
-- a third engineer's stock on a call allocated to somebody else (INSERT 1).
-- And consumption_before_insert kept a created_by the caller sent, while
-- created_by decides who may READ the line (cons_read) -- the same on
-- material_returns and stock_transfers.
--
-- THE USER'S DECISION (2026-10-04):
--   * A VISIT and its SPARES -- under your own name; an RM / RGM also for the
--     engineers under them in the User Master ("Yes -- RM/RGM for their
--     team"); anybody else only when given it per person in Extra Access
--     ("Office Role Yes but not a generic one, i will add it for those Specific
--     Ppl in the Extra Access. SAme for Consumption as well, reco is already
--     controlled.") -> key visit.others, granted to NOBODY here.
--   * A SPARE REQUEST -- "RM / RGM / NSM can add for their Subordinates +
--     Admins + Technical Support" -> your own name, your team, or the key
--     spare.request.others, given once to technical_support here (an
--     administrator passes has_perm() for every key).
--   "Your team" is visible_engineer_names(): the User Master tree below you
--   by Reporting Manager and Regional Manager, yourself included. An NSM has
--   a team where the directory names them as somebody's manager.
--
-- WHAT IS NOT STOPPED -- read from every writer first, not assumed:
--   * RECONCILIATION consumption: already needs consumption.reconcile (cons_write).
--   * IMPORTS: a holder of bulk.upload or import.panel loads history as filed.
--   * FUNCTIONS THAT FILE FOR SOMEBODY BY DESIGN and check their own rights:
--     approve_indoor_dc (the authoriser files the unit's drafted visit and
--     spares), file_visit_for_spare_request (the request's visit), the rename
--     carry and reassign_spare_request. They run as their owner, so
--     current_user is not `authenticated` inside them -- measured on a built
--     database: a direct INSERT sees `authenticated`, the same INSERT inside a
--     SECURITY DEFINER function sees `postgres`. That is the test used here,
--     which is why the guard function itself is SECURITY INVOKER.
--   * An UPDATE that leaves the engineer as it was, and a blank engineer.
--   * A connection with no session (the SQL editor, a restore).
-- A spare request's engineer is checked on INSERT only: changing it is
-- already Change engineer / a rename alone (0340).
--
-- created_by on spare_consumption, material_returns and stock_transfers is
-- stamped from the session on INSERT -- the value sent is DISCARDED, the 0211
-- rule -- except for an importer, whose history keeps what it says. No screen
-- sends it today (read: supabase.ts, uploads.ts).
--
-- In the handstock module: every table it guards exists by then, and it sits
-- beside stock_import_allowed()'s own rules (0339).
-- ===========================================================================

-- ---- 1. "is this name me?" ---------------------------------------------------
-- The name as the profile carries it (what the screens default to) or as any
-- User Master row with my email or gmail carries it (what the pickers list).
create or replace function public.is_me(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(btrim(p_name), '') <> ''
     and (exists (select 1 from public.profiles p
                   where p.id = auth.uid()
                     and lower(btrim(p_name)) in (lower(btrim(coalesce(p.full_name, ''))),
                                                  lower(btrim(coalesce(p.email, '')))))
          or exists (select 1 from public.user_directory d
                      where lower(btrim(d.name)) = lower(btrim(p_name))
                        and (lower(coalesce(d.email, '')) = lower(coalesce(auth.email(), '-'))
                             or lower(coalesce(d.gmail, '')) = lower(coalesce(auth.email(), '-')))))
$$;
revoke execute on function public.is_me(text) from public, anon;
grant execute on function public.is_me(text) to authenticated;

-- ---- 2. the guard -------------------------------------------------------------
create or replace function public.filed_under_own_name()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_key text;
begin
  if auth.uid() is null then return new; end if;                 -- no session
  if current_user <> 'authenticated' then return new; end if;    -- a function filing by design
  if btrim(coalesce(new.engineer, '')) = '' then return new; end if;
  if tg_op = 'UPDATE' and lower(btrim(coalesce(new.engineer, '')))
                          = lower(btrim(coalesce(old.engineer, ''))) then
    return new;
  end if;
  if public.has_perm('bulk.upload') or public.has_perm('import.panel') then return new; end if;

  if tg_table_name = 'spare_consumption' then
    if coalesce(new.source, 'Report') = 'Reconciliation' then return new; end if;  -- cons_write's
    v_key := 'visit.others';
  elsif tg_table_name = 'reports' then
    v_key := 'visit.others';
  elsif tg_table_name = 'spare_requests' then
    v_key := 'spare.request.others';
  else
    return new;
  end if;

  if public.is_me(new.engineer)
     or lower(btrim(new.engineer)) in (select lower(btrim(v.n)) from public.visible_engineer_names() v(n))
     or public.has_perm(v_key) then
    return new;
  end if;

  raise exception '% is not you or an engineer in your team, so this % cannot be filed in their name (it needs "%", given per person in Extra Access)',
    btrim(new.engineer),
    case tg_table_name when 'spare_requests' then 'spare request'
                       when 'reports' then 'visit' else 'spare consumption' end,
    case v_key when 'visit.others' then 'Report a visit and its spares in another engineer''s name'
               else 'Raise a spare request in any engineer''s name' end
    using errcode = '42501';
end $$;
revoke execute on function public.filed_under_own_name() from public, anon, authenticated;

drop trigger if exists filed_under_own_name on public.reports;
create trigger filed_under_own_name
  before insert or update of engineer on public.reports
  for each row execute function public.filed_under_own_name();
drop trigger if exists filed_under_own_name on public.spare_consumption;
create trigger filed_under_own_name
  before insert or update of engineer on public.spare_consumption
  for each row execute function public.filed_under_own_name();
drop trigger if exists filed_under_own_name on public.spare_requests;
create trigger filed_under_own_name
  before insert on public.spare_requests
  for each row execute function public.filed_under_own_name();

-- ---- 3. created_by is the session --------------------------------------------
create or replace function public.created_by_is_the_session()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if current_user <> 'authenticated' then return new; end if;
  if public.has_perm('bulk.upload') or public.has_perm('import.panel') then return new; end if;
  new.created_by := auth.uid();
  return new;
end $$;
revoke execute on function public.created_by_is_the_session() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['spare_consumption', 'material_returns', 'stock_transfers'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists a_created_by_is_the_session on public.%I', t);
      execute format('create trigger a_created_by_is_the_session before insert on public.%I '
                     'for each row execute function public.created_by_is_the_session()', t);
    end if;
  end loop;
end $$;

-- ---- 4. the keys --------------------------------------------------------------
-- visit.others is given to nobody: the user ticks it per person. spare.request.
-- others goes to Technical Support ONCE (the user named it); a re-run never
-- hands it back to a role an administrator has taken it from.
-- 0318's definition VERBATIM: on a fresh apply this bundle runs before
-- sales_contracts, so whichever creates the table first must create the same one.
create table if not exists public.one_time_fixes_done (
  name       text primary key,
  applied_at timestamptz not null default now(),
  detail     text
);
alter table public.one_time_fixes_done enable row level security;
revoke all on public.one_time_fixes_done from anon, authenticated;

do $$
begin
  if not exists (select 1 from public.one_time_fixes_done where name = '0369_spare_request_others_to_technical_support') then
    update public.app_roles
       set permissions = coalesce(permissions, '[]'::jsonb) || '["spare.request.others"]'::jsonb
     where role = 'technical_support'
       and jsonb_array_length(coalesce(permissions, '[]'::jsonb)) > 0
       and not (coalesce(permissions, '[]'::jsonb) ? 'spare.request.others');
    insert into public.one_time_fixes_done (name, detail)
    values ('0369_spare_request_others_to_technical_support', 'spare.request.others given to technical_support once');
  end if;
end $$;

-- ===========================================================================
-- 0298 — TODAY'S GRANTS, COPIED ONTO THE NEW PER-SCREEN KEYS, ONCE.
--
-- The user, 2026-09-30, on findings 63 and 64: "It should show the Individual
-- View's Control Action and its Check Box" -- answered with keys of their own
-- per screen (0286-0297). A key nobody holds would take every one of those
-- buttons away from everybody the day this ships, so each new key is given to
-- exactly the roles and people that hold the key it replaces:
--
--   install.* / pm.* / calls.reopen  <- the calls.* key it was checked under
--   contract.edit                    <- cover.edit
--   tracker.delete                   <- the Tracker page itself (everybody
--                                       who opens it could delete)
--   objective.manage, charts.share,
--   validation.manage, layouts.share <- config.manage, which the database
--                                       asked for each of them
--   pd2.rebuild                      <- masters.edit or cover.edit
--   stock.return.others              <- any spare approval stage or dispatch,
--                                       which is what the database asked
--
-- ONCE, AND SAID SO IN A TABLE. A re-run that copied again would hand a key
-- back to a role an administrator had deliberately unticked it from, which is
-- the one thing a permission migration must never do. The keys that are
-- CHILDREN of a key somebody holds (0286's perm_parents) are not copied at all:
-- the parent already grants them.
--
-- A role row with no permissions is left alone: an empty array means "not
-- configured" and falls back to the engineer defaults, so it inherits through
-- the engineer row, which is copied like any other.
--
-- Also, every run (finding 66, "Fix it"): the two ticks that did nothing are
-- taken off every role and person -- dashboard.view, which nothing tested, and
-- the User Access page (/users), which only redirects to the User Master.
-- ===========================================================================

create table if not exists public.permission_copies_done (
  name       text primary key,
  applied_at timestamptz not null default now()
);
alter table public.permission_copies_done enable row level security;
revoke all on public.permission_copies_done from anon, authenticated;
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.permission_copies_done'::regclass);
  end if;
end $$;

do $$
declare
  pair record;
  n_roles int; n_people int;
begin
  if to_regclass('public.app_roles') is null or to_regclass('public.profiles') is null then
    raise notice '0298: app_roles or profiles missing -- nothing copied';
    return;
  end if;
  if exists (select 1 from public.permission_copies_done where name = '0284_per_screen_keys') then
    raise notice '0298: the per-screen keys were copied before -- not copied again';
  else
    for pair in
      select * from (values
        ('install.edit',           array['calls.edit']),
        ('install.edit.complaint', array['calls.edit.complaint']),
        ('install.edit.customer',  array['calls.edit.customer']),
        ('install.edit.vigilance', array['calls.edit.vigilance']),
        ('install.edit.contact',   array['calls.edit.contact']),
        ('install.allot',          array['calls.allot']),
        ('install.report',         array['calls.report']),
        ('install.cancel',         array['calls.cancel']),
        ('install.reopen',         array['calls.create', 'pending.register']),
        ('pm.create',              array['calls.create']),
        ('pm.edit',                array['calls.edit']),
        ('pm.edit.complaint',      array['calls.edit.complaint']),
        ('pm.edit.customer',       array['calls.edit.customer']),
        ('pm.edit.vigilance',      array['calls.edit.vigilance']),
        ('pm.edit.contact',        array['calls.edit.contact']),
        ('pm.allot',               array['calls.allot']),
        ('pm.report',              array['calls.report']),
        ('pm.cancel',              array['calls.cancel']),
        ('pm.reopen',              array['calls.create', 'pending.register']),
        ('calls.reopen',           array['calls.create', 'pending.register']),
        ('contract.edit',          array['cover.edit']),
        ('tracker.delete',         array['mod:/tracker']),
        ('objective.manage',       array['config.manage']),
        ('charts.share',           array['config.manage']),
        ('validation.manage',      array['config.manage']),
        ('layouts.share',          array['config.manage']),
        ('pd2.rebuild',            array['masters.edit', 'cover.edit']),
        ('stock.return.others',    array['spare.approve_rm', 'spare.approve_commercial', 'spare.approve_nsm', 'spare.dispatch'])
      ) as t(new_key, old_keys)
    loop
      update public.app_roles
         set permissions = permissions || jsonb_build_array(pair.new_key), updated_at = now()
       where jsonb_array_length(permissions) > 0
         and permissions ?| pair.old_keys
         and not permissions ? pair.new_key;
      get diagnostics n_roles = row_count;
      update public.profiles
         set extra_permissions = coalesce(extra_permissions, '[]'::jsonb) || jsonb_build_array(pair.new_key)
       where coalesce(extra_permissions, '[]'::jsonb) ?| pair.old_keys
         and not coalesce(extra_permissions, '[]'::jsonb) ? pair.new_key;
      get diagnostics n_people = row_count;
      raise notice '0298: % given to % role(s) and % person(s) holding %', pair.new_key, n_roles, n_people, pair.old_keys;
    end loop;
    insert into public.permission_copies_done (name) values ('0284_per_screen_keys');
  end if;

  update public.app_roles
     set permissions = (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(permissions) e
                         where e not in ('"dashboard.view"'::jsonb, '"mod:/users"'::jsonb)),
         updated_at = now()
   where permissions ?| array['dashboard.view', 'mod:/users'];
  update public.profiles
     set extra_permissions = (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(extra_permissions) e
                               where e not in ('"dashboard.view"'::jsonb, '"mod:/users"'::jsonb))
   where coalesce(extra_permissions, '[]'::jsonb) ?| array['dashboard.view', 'mod:/users'];
end $$;

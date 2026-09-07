-- ===========================================================================
-- MOVING A CALL TO ANOTHER ENGINEER IS ITS OWN RIGHT.
--
-- Reported 2026-09-06: "call re-allocation option not visible for RM / RGM and
-- I couldn't find it in the roles and permissions as well."
--
-- The second half is the real fault. Re-allocation had no permission of its
-- own: it was a corner of `calls.edit`, so the Roles & Permissions screen had
-- nothing to show, and there was no way to give a manager the right to move a
-- call to one of their engineers WITHOUT also letting them rewrite the rest of
-- the call — or to take it away and leave the rest.
--
-- `calls.allot` is that right. Every role that holds `calls.edit` today is
-- given it, by MERGING into app_roles rather than overwriting: an administrator
-- may have tuned a role, and this must not be the change that quietly undoes
-- that. So nobody loses anything the day this lands, and from here on the two
-- can be granted apart.
--
-- ENFORCED IN THE DATABASE, not only on the screen. The register hides the
-- tick-boxes and locks the "Call Allocated To" box without the permission, but
-- a hidden control is a courtesy: `allocated_to` is reachable through PostgREST
-- by anyone whose row policy lets them update the call at all, and the call
-- policy asks for `calls.edit OR calls.report`. Without the trigger below the
-- new permission would be decoration.
--
-- WHAT THE TRIGGER DOES NOT STOP:
--   * allotting AT REGISTRATION — that is `calls.create`, and this only fires
--     on UPDATE;
--   * a change made with no signed-in user (an import, a definer function, a
--     scheduled job), which has no permissions to test and is not a person;
--   * an administrator.
--
-- Filling a BLANK allocated_to for the first time IS covered, and deliberately:
-- "allot this unallotted call" is the same act as moving it, and it is what the
-- bulk bar on the register actually does most of the time.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Every role that can edit a call can re-allocate one, as it could yesterday.
-- MERGE, never overwrite (CLAUDE.md): a role with tuned permissions keeps them.
-- ---------------------------------------------------------------------------
update public.app_roles ar
   set permissions = (
         select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
           from (
             select jsonb_array_elements_text(ar.permissions) as v
             union
             select 'calls.allot' as v
           ) u
       ),
       updated_at = now()
 where ar.permissions ? 'calls.edit'
   and not (ar.permissions ? 'calls.allot');

-- ---------------------------------------------------------------------------
-- The guard. Named `zz_` so it runs after the other BEFORE triggers on these
-- tables (they fire in NAME order), which is where the creator stamp lives —
-- nothing here depends on that, but the convention keeps the order readable.
-- ---------------------------------------------------------------------------
create or replace function public.calls_allot_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.allocated_to is not distinct from old.allocated_to then
    return new;                                   -- not a re-allocation
  end if;
  if auth.uid() is null then
    return new;                                   -- import / definer / scheduled
  end if;
  if public.is_admin() then
    return new;
  end if;
  if not public.has_perm('calls.allot') then
    raise exception
      'RBAC: moving a call to another engineer needs the "Re-allocate a call to another engineer" permission';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['field_calls', 'installation_calls', 'pm_calls'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'skip %: not present yet', t;
      continue;
    end if;
    execute format('drop trigger if exists zz_calls_allot_guard on public.%I', t);
    execute format(
      'create trigger zz_calls_allot_guard before update of allocated_to on public.%I
         for each row execute function public.calls_allot_guard()', t);
  end loop;
end $$;

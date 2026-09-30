-- ===========================================================================
-- 0295 — A PERSON'S PROFILE AND R&R ARE "EDIT USER MASTER DETAILS"
--
-- Findings 57-67 (docs/PERMISSIONS_REVIEW.md), the user's decisions of
-- 2026-09-30: "63, 64: It should show the Individual View's Control Action and
-- its Check Box" -- each screen gets keys of its own, today's grants copied
-- across (0298) so nobody gains or loses anything on the day it ships -- and
-- "67: Break it down", with the old key kept as the PARENT of the new ones, so
-- a role holding it keeps everything until an administrator unticks it.
-- The parent rule itself is in has_perm() (0286, public.perm_parents).
--
-- This file: the training module's rules that asked users.manage now ask
-- its child users.manage.details.
-- ===========================================================================

do $$
begin
  if to_regclass('public.user_profile') is null then return; end if;
  drop policy if exists up_insert on public.user_profile;
  drop policy if exists up_update on public.user_profile;
  create policy up_insert on public.user_profile for insert
    with check ((select public.has_perm('users.manage.details')));
  create policy up_update on public.user_profile for update
    using ((select public.has_perm('users.manage.details'))) with check ((select public.has_perm('users.manage.details')));
  drop policy if exists rr_insert on public.user_rr;
  drop policy if exists rr_update on public.user_rr;
  create policy rr_insert on public.user_rr for insert
    with check ((select public.has_perm('users.manage.details')) or (select public.has_perm('training.manage')));
  create policy rr_update on public.user_rr for update
    using ((select public.has_perm('users.manage.details')) or (select public.has_perm('training.manage')))
    with check ((select public.has_perm('users.manage.details')) or (select public.has_perm('training.manage')));
end $$;

CREATE OR REPLACE FUNCTION public.may_see_person(p_dir_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_perm('users.manage.details')
      or public.has_perm('training.manage')
      or exists (
           select 1 from public.user_directory d
            where d.id = p_dir_id
              and ( (btrim(coalesce(d.email, '')) <> '' and lower(d.email) = lower(auth.email()))
                 or (btrim(coalesce(d.gmail, '')) <> '' and lower(d.gmail) = lower(auth.email()))
                 or d.name in (select public.visible_engineer_names()) ));
$function$;

-- ===========================================================================
-- 0388 — A USER MASTER ENTRY WITH A PROFILE OR R&R HISTORY IS NOT DELETED
--        (second re-review D-059)
--
-- 0264 declares user_profile.dir_id and user_rr.dir_id ON DELETE CASCADE, so
-- deleting a User Master row took the person's profile and every Roles &
-- Responsibilities period with it -- measured: the row, its R&R periods and
-- its profile all went -- while the screen's confirmation says "all history
-- are kept", FRS-093 says nothing in the person's record is deletable and
-- URS-079 says a new R&R period ends the previous one without deleting it.
-- (Training attendance and assignments already refuse the delete: their keys
-- do not cascade.)
-- A signed-in delete of a row that has a profile or an R&R period is now
-- refused, saying to mark the person inactive (Active = No) instead; a row with
-- neither -- an entry made by mistake -- can still be deleted. A connection
-- with no session (a repair) is not stopped.
-- In the training module, after 0295.
-- ===========================================================================

create or replace function public.user_directory_keeps_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_what text[] := '{}';
begin
  if auth.uid() is null then return old; end if;
  if to_regclass('public.user_profile') is not null
     and exists (select 1 from public.user_profile p where p.dir_id = old.id) then
    v_what := v_what || 'a profile'::text;
  end if;
  if to_regclass('public.user_rr') is not null
     and exists (select 1 from public.user_rr r where r.dir_id = old.id) then
    v_what := v_what || 'Roles & Responsibilities history'::text;
  end if;
  if array_length(v_what, 1) > 0 then
    raise exception '% has % on the User Master, which is kept: set Active to No instead of deleting the entry',
      coalesce(nullif(btrim(old.name), ''), 'This person'), array_to_string(v_what, ' and ')
      using errcode = '23503';
  end if;
  return old;
end $$;
revoke execute on function public.user_directory_keeps_history() from public, anon, authenticated;
drop trigger if exists user_directory_keeps_history on public.user_directory;
create trigger user_directory_keeps_history
  before delete on public.user_directory
  for each row execute function public.user_directory_keeps_history();

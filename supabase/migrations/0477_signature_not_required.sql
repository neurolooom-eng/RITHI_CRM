-- ===========================================================================
-- 0477 -- NO SIGNATURE IS ASKED OF A TEST ACCOUNT OR AN INACTIVE USER (the
-- user, 2026-11-13: "For Test Accounts, Signature is not Required in User
-- Master. Same with Inactive Users.").
--
-- Asked, the user chose:
--   * a TEST ACCOUNT is a User Master row tagged "Test Account" (0408's Tags,
--     matched without regard to case or spaces) -- the list is theirs to keep
--     by tagging;
--   * "not required" applies to User Master's Signature column (and its
--     filter), the signature tracker's count, and the sign-in reminder.
--
-- ONE RULE, signature_not_required(): the login is inactive, or a User Master
-- row of its address (Air Liquide ID or Gmail) is inactive or tagged Test
-- Account. The tracker carries it as `required` (appended, so the function is
-- dropped and re-created -- a set-returning function cannot change its
-- columns in place), and my_signature_required() answers it for the signed-in
-- login only, for the reminder. Nothing about a signature itself changes:
-- one already saved stays saved and is still shown as Saved.
-- ===========================================================================

create or replace function public.signature_not_required(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(p.active, true) = false from public.profiles p where p.id = p_user), false)
      or exists (
        select 1
          from public.profiles p
          join public.user_directory u
            on lower(btrim(u.email)) = lower(btrim(p.email))
            or (btrim(coalesce(u.gmail, '')) <> '' and lower(btrim(u.gmail)) = lower(btrim(p.email)))
         where p.id = p_user
           and (u.validity = false
                or exists (select 1 from unnest(u.tags) t where lower(regexp_replace(btrim(t), '\s+', ' ', 'g')) = 'test account')))
$$;
comment on function public.signature_not_required(uuid) is
  'A signature is not asked of this login (0477): it is inactive, or its User Master row is inactive or tagged "Test Account".';
revoke execute on function public.signature_not_required(uuid) from public, anon, authenticated;

-- The signed-in login's own answer, for the reminder. Nothing about anybody else.
create or replace function public.my_signature_required()
returns boolean language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else not public.signature_not_required(auth.uid()) end
$$;
revoke execute on function public.my_signature_required() from public, anon;
grant execute on function public.my_signature_required() to authenticated;

-- 0454's tracker with `required` appended; its permission check unchanged.
drop function if exists public.signature_tracker();
create function public.signature_tracker()
returns table(user_id uuid, full_name text, email text, designation text, active boolean, has_signature boolean,
              signed_at timestamptz, required boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(public.has_perm('users.manage.details'), false) then
    raise exception 'The signature tracker needs "Edit User Master details" on Roles & Permissions.' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.email, coalesce(p.designation, ''), coalesce(p.active, true),
           (s.user_id is not null and coalesce(btrim(s.signature), '') <> ''), s.updated_at,
           not public.signature_not_required(p.id)
      from public.profiles p
      left join public.user_signatures s on s.user_id = p.id
     order by lower(coalesce(nullif(btrim(p.full_name), ''), p.email));
end $$;
revoke execute on function public.signature_tracker() from public, anon;
grant execute on function public.signature_tracker() to authenticated;

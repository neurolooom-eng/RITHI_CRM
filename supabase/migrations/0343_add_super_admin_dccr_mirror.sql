-- ===========================================================================
-- ADD A SUPER ADMIN: the DCCR mirror's own login.
--
-- The user, 2026-10-04: "Add a User to Supabase - DCCR_Mirror@gmail.com, Add
-- it to Admin - Hardcode it like service.almsind@gmail.com".
--
-- The DCCR mirror in CallReg.gs signs in as DCCR_EMAIL to read the review
-- register on its four daily runs; the register is bounded by the call
-- policies, so the login must see every call. A super admin does.
--
-- SUPER ADMIN IS TWO PLACES and both change together (0156): this row is what
-- POSTGRES allows; `SUPER_ADMINS` in src/lib/auth.tsx is what the BROWSER
-- offers, changed in the same commit. `check:ui` compares the two.
--
-- THE LOGIN ITSELF IS NOT MADE HERE. A row in auth.users carries the password
-- hash, and a password written into a migration lives in the repository's
-- history for good. It is created in Supabase (Authentication -> Add user) or
-- from User Master, and this row makes whoever signs in with the address a
-- super admin from that moment. Supabase stores the address in lower case;
-- is_super_admin() compares in lower case too.
--
-- AFTER 0156 in the rbac module, like any later change to this list.
-- Idempotent, and it says what it did.
-- ===========================================================================

do $add$
declare
  v_email text := 'dccr_mirror@gmail.com';
  n integer := 0;
begin
  insert into public.app_super_admins (email) values (v_email)
  on conflict (email) do nothing;
  get diagnostics n = row_count;
  raise notice 'Super admin %: %', v_email,
    case when n = 1 then 'added' else 'already present' end;
  if not exists (select 1 from auth.users where lower(email) = v_email) then
    raise notice '  no login with that address yet -- create it in Supabase (Authentication -> Add user)';
  end if;
end $add$;

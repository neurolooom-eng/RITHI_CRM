-- Read-only probe: how the person behind harshavardhan.singh@airliquide.com
-- signs in, and what the 19 audit events under the new address are.
select 1 as n, 'identity provider' as k, i.provider || ' | email_verified=' || coalesce(i.identity_data->>'email_verified', '?')
       || ' | last sign-in ' || coalesce(to_char(i.last_sign_in_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI'), '-') as v
  from auth.identities i where lower(i.email) = 'harshavardhan.singh@airliquide.com'
union all
select 2, 'auth user', 'confirmed=' || (u.email_confirmed_at is not null)::text || ' | created ' || to_char(u.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')
       || ' | last sign-in ' || coalesce(to_char(u.last_sign_in_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI'), '-')
  from auth.users u where lower(u.email) = 'harshavardhan.singh@airliquide.com'
union all
select 3, 'audit_log under the NEW address: ' || coalesce(a.action, '?') || ' / ' || coalesce(a.status, '?'), count(*)::text
  from public.audit_log a where lower(a.email) = 'harshvardhan.singh@airliquide.com' group by a.action, a.status
union all
select 4, 'user_directory row (new address)', coalesce(d.name, '') || ' | active=' || coalesce(d.active::text, '?')
  from public.user_directory d where lower(d.email) = 'harshvardhan.singh@airliquide.com'
union all
select 5, 'profile (old address)', coalesce(p.full_name, '') || ' | role ' || coalesce(p.role, '')
  from public.profiles p where lower(p.email) = 'harshavardhan.singh@airliquide.com'
union all
select 6, 'triggers on profiles / user_directory', string_agg(t.tgrelid::regclass::text || '.' || t.tgname, ', ')
  from pg_trigger t where t.tgrelid in ('public.profiles'::regclass, 'public.user_directory'::regclass) and not t.tgisinternal
order by 1, 2;

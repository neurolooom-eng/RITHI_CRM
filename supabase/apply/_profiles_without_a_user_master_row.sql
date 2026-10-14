-- ===========================================================================
-- READ-ONLY. Sign-ins whose profile matches no User Master row (D-172).
--
-- Until 0458, ensure_my_profile() gave a sign-in whose email is on no User
-- Master row an ENGINEER profile the first time it signed in. 0458 stops that
-- for new sign-ins; the profiles already made this way were left as they are
-- (the user's decision, 2026-10-14). This lists every profile whose email is
-- on no User Master row (email or gmail), with its role and when it was made,
-- so each can be decided: add the person to the User Master, or remove the
-- login. An administrator's own profile is listed too -- that is expected.
--
-- One result grid: row 1 counts them, rows 101 onwards name each one.
-- ===========================================================================
with lone as (
  select p.id, p.email, p.full_name, p.role, p.active, p.created_at
    from public.profiles p
   where not exists (select 1 from public.user_directory d
                      where btrim(coalesce(p.email, '')) <> ''
                        and (lower(d.email) = lower(p.email) or lower(d.gmail) = lower(p.email)))
)
select 1 as row, 'Profiles whose email is on no User Master row' as what,
       (select count(*) from lone)::text as value, '' as email, '' as name, '' as role, null::timestamptz as made
union all
select 100 + row_number() over (order by l.created_at nulls last, l.email)::int,
       case when l.active is false then 'inactive' else 'active' end,
       '', l.email, l.full_name, l.role, l.created_at
  from lone l
order by 1;

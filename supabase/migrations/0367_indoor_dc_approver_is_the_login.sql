-- ===========================================================================
-- 0367 — AN INDOOR DC IS APPROVED BY THE LOGIN THE USER MASTER NAMES, NOT BY
--        ANYBODY WHOSE PROFILE CARRIES THE SAME NAME
--        (second re-review D-143)
--
-- indoor_dc_may_approve() (0323) compared authorised_by_name with
-- my_dir_name() (limit 1, no order) OR the caller's profile full_name.
-- Measured: a second login whose profile name equals the approver's, holding
-- calls.view only and with no User Master row, saw both DCs (indoor_read reads
-- it through indoor_job_on_my_dc()) and approved one; the DC then read
-- approved_by_name as the right person.
--
-- The authoriser is chosen from the User Master (0327), so the person named is
-- a User Master row, and that row says which login is theirs: its Mail ID or
-- its Gmail. The caller is now the person named when a User Master row of that
-- name carries the caller's sign-in address -- any such row, not the first.
-- The profile's own name is still accepted ONLY where no User Master row of
-- that name carries any address at all: then the directory cannot say who the
-- person is, and refusing would leave the DC with no approver but an
-- administrator. Where it does carry one, a different login with the same
-- name is refused.
-- Signature and every caller unchanged (approve, reject, record_indoor_visit,
-- the DC list, indoor_job_on_my_dc). In the indoor module, after 0363.
-- ===========================================================================

create or replace function public.indoor_dc_may_approve(p_authorised_by text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (coalesce(btrim(p_authorised_by), '') <> ''
          and (exists (select 1 from public.user_directory d
                        where upper(btrim(d.name)) = upper(btrim(p_authorised_by))
                          and coalesce(auth.email(), '') <> ''
                          and (lower(btrim(coalesce(d.email, ''))) = lower(auth.email())
                               or lower(btrim(coalesce(d.gmail, ''))) = lower(auth.email())))
               or (not exists (select 1 from public.user_directory d
                                where upper(btrim(d.name)) = upper(btrim(p_authorised_by))
                                  and (btrim(coalesce(d.email, '')) <> '' or btrim(coalesce(d.gmail, '')) <> ''))
                   and upper(btrim(p_authorised_by))
                       = upper(btrim(coalesce((select p.full_name from public.profiles p where p.id = auth.uid()), ''))))));
$$;
comment on function public.indoor_dc_may_approve(text) is
  'True for an administrator, or for the login a User Master row of that name carries (Mail ID or Gmail); by profile name only where no row of that name carries an address (0367, D-143).';
revoke all on function public.indoor_dc_may_approve(text) from public;
revoke execute on function public.indoor_dc_may_approve(text) from anon;
grant execute on function public.indoor_dc_may_approve(text) to authenticated;

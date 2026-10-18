-- ===========================================================================
-- 0446 -- PM DUE NAMES THE MONTH'S LATEST PM CALL BEFORE IT CREATES (the user,
-- 2026-10-18: "when creating tell me what is the last call in oct with Date
-- and time and also what will be first call that we create will get in terms
-- of Date and time").
--
-- pm_due_latest_reg_at() (0401) gives the TIME the batch follows: the largest
-- registration date-and-time among ALL PM calls dated to the month, whoever's
-- call it is. This returns the CALL that holds it -- UCN, call number, party,
-- product, serial and that time -- so PM Due can say which call the new ones
-- follow. Same rule, same right (pm.generate), same reach: a definer function,
-- because the batch follows the month's latest call whether or not the person
-- creating may read it. A tie on the time takes the later-written row.
-- No row means the month has no PM call with a registration time, which is
-- exactly when the batch starts at 00:30 on the 1st.
-- ===========================================================================

create or replace function public.pm_due_latest_call(p_month date)
returns table (ucn text, call_number text, party_name text, product_name text, serial text, reg_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.has_perm('pm.generate'), false) then
    raise exception 'Needs “Generate PM calls from the registers” (pm.generate) on Roles & Permissions.'
      using errcode = '42501';
  end if;
  return query
    select pc.ucn, pc.call_number, pc.party_name, pc.product_name, pc.serial, pc.reg_at
      from public.pm_calls pc
     where pc.reg_date >= date_trunc('month', p_month)::date
       and pc.reg_date < (date_trunc('month', p_month) + interval '1 month')::date
       and pc.reg_at is not null
     order by pc.reg_at desc, pc.id desc
     limit 1;
end $$;

comment on function public.pm_due_latest_call(date) is
  'The PM call holding the largest registration date-and-time among the PM calls dated to the month (0446) -- the call PM Due''s new calls are registered 10 seconds after. Same rule and right as pm_due_latest_reg_at (0401).';

revoke execute on function public.pm_due_latest_call(date) from public, anon;
grant execute on function public.pm_due_latest_call(date) to authenticated;

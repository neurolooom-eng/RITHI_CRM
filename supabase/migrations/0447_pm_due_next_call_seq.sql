-- ===========================================================================
-- 0447 -- A PM CALL MADE FROM PM DUE CONTINUES ITS MONTH'S NUMBERING (the user,
-- 2026-10-18: "I am creating calls in an Adhoc manner, so there might be calls
-- existing and this will be appended to that list ... Say there are 400 calls
-- already in the list for that month, then the call number should be
-- 26PMOCT401-J-Prod-serialno"; asked, the number is padded to 4 digits like
-- every existing one: 26PMOCT0401).
--
-- The PM register's call numbers read  <YY>PM<MON><NNNN>-<letter>-<product>-<serial>
-- -- 26PMOCT1333-J-MONNAL T60-19146 -- where the letter is the month's (Jan A
-- ... Dec L). Measured on the live project the same day: every 2026 month's
-- PM call numbers follow it exactly, and in every 2026 month the largest NNNN
-- equals the month's count, cancelled calls included. Until now a call made
-- from PM Due arrived with no Call Number and took the generic CL<YY><NNNNN>.
--
-- THIS RETURNS THE NEXT NNNN for the month: one more than the largest already
-- used by that month's PM calls, and never less than the month's count + 1 --
-- which is the count + 1 in every 2026 month, and stays clear of a number
-- already taken where an older month has gaps (October 2025: 46 calls, the
-- largest 0992). The client builds the rest; the same right and reach as
-- pm_due_latest_reg_at (0401), since the next number depends on every call of
-- the month, whoever's.
-- ===========================================================================

create or replace function public.pm_due_next_call_seq(p_month date)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from   date := date_trunc('month', p_month)::date;
  v_prefix text := to_char(date_trunc('month', p_month), 'YY') || 'PM' || upper(to_char(date_trunc('month', p_month), 'MON'));
  v_max    integer;
  v_count  integer;
begin
  if not coalesce(public.has_perm('pm.generate'), false) then
    raise exception 'Needs “Generate PM calls from the registers” (pm.generate) on Roles & Permissions.'
      using errcode = '42501';
  end if;
  select max(substring(pc.call_number from '^' || v_prefix || '(\d+)-')::integer), count(*)
    into v_max, v_count
    from public.pm_calls pc
   where pc.reg_date >= v_from
     and pc.reg_date < (v_from + interval '1 month')::date;
  return greatest(coalesce(v_max, 0), v_count) + 1;
end $$;

comment on function public.pm_due_next_call_seq(date) is
  'The next running number for the month''s PM call numbers (<YY>PM<MON><NNNN>-<letter>-<product>-<serial>): one more than the largest used, never less than the month''s count + 1 (0447). Same right as pm_due_latest_reg_at (0401).';

revoke execute on function public.pm_due_next_call_seq(date) from public, anon;
grant execute on function public.pm_due_next_call_seq(date) to authenticated;

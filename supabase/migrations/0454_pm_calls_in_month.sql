-- ===========================================================================
-- 0454 — WHICH MACHINES ALREADY HAVE A PM CALL THIS MONTH, ASKED OF EVERY
--        PM CALL (second re-review D-038, FRS-142.11 as the user decided)
--
-- The user's decision (2026-10-12): when a PM upload names a machine that
-- already has a PM call in that due month -- an earlier load, or one generated
-- from PM Due -- the row is SKIPPED and NAMED with that call's UCN; no second
-- call, and the existing call is left as it is. The upload asks this before it
-- writes. Read through the uploader's own row-level security it would see only
-- the PM calls that person may see, and a machine whose call belongs to
-- somebody else's team would be loaded twice -- so, like PM Due's own reads
-- (pm_visits_due, 0402), this runs as its owner and asks pm.bulk_upload (or
-- pm.generate) itself. It returns the machine and the UCN, nothing more.
-- A cancelled PM call is not counted, as PM Due does not count one: a machine
-- whose call was cancelled still has its PM to do this month.
-- In the sales_contracts module, after the PM Due migrations.
-- ===========================================================================

create or replace function public.pm_calls_in_month(p_month date)
returns table (ucn text, product_name text, serial text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_perm('pm.bulk_upload') or public.has_perm('pm.generate')) then
    raise exception 'pm.bulk_upload is required to check a PM upload against the month''s calls'
      using errcode = '42501';
  end if;
  return query
    select p.ucn, coalesce(p.product_name, ''), coalesce(p.serial, '')
      from public.pm_calls p
     where p.reg_date >= date_trunc('month', p_month)::date
       and p.reg_date <  (date_trunc('month', p_month) + interval '1 month')::date
       and p.cancelled_at is null
     order by p.ucn;
end $$;
revoke execute on function public.pm_calls_in_month(date) from public, anon;
grant execute on function public.pm_calls_in_month(date) to authenticated;

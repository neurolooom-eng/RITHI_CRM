-- ===========================================================================
-- OR numbers pad the counter to three digits: OR-26/08/001.
--
-- 0017 wrote the counter bare (OR-26/08/1), which sorts wrongly as text once a
-- month passes nine requests — OR-26/08/10 lands before OR-26/08/2 in the
-- register and in CSV exports. Three digits sorts correctly to 999 a month.
--
-- Past 999 the number simply grows (OR-26/08/1000) and text ordering breaks
-- again at that point; no month is expected to come close.
-- ===========================================================================

create or replace function public.next_spare_or_no(p_on date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare
  p text := to_char(p_on, 'YY/MM');
  n integer;
begin
  insert into public.spare_or_counters (period, last_no) values (p, 1)
  on conflict (period) do update set last_no = public.spare_or_counters.last_no + 1
  returning last_no into n;
  return 'OR-' || p || '/' || lpad(n::text, 3, '0');
end $$;

-- ---------------------------------------------------------------------------
-- Restate the few numbers 0017 issued unpadded. This is the same number in the
-- required format, not a renumbering: OR-26/08/1 becomes OR-26/08/001, same
-- month, same position in the series. The unpadded form was only ever live
-- between 0017 and this migration.
--
-- The immutability trigger is dropped first: it refuses any or_no change from
-- a non-admin, and in the Supabase SQL Editor auth.uid() is NULL so is_admin()
-- is false. It is recreated below, which also makes this safe to re-run.
-- ---------------------------------------------------------------------------
drop trigger if exists spare_requests_number_immutable on public.spare_requests;

update public.spare_requests r
   set or_no = 'OR-' || substring(or_no from 4 for 5) || '/'
               || lpad(substring(or_no from 10), 3, '0')
 where or_no ~ '^OR-\d\d/\d\d/\d{1,2}$'
   -- never write over a number that already exists in the padded form
   and not exists (
     select 1 from public.spare_requests x
      where x.or_no = 'OR-' || substring(r.or_no from 4 for 5) || '/'
                      || lpad(substring(r.or_no from 10), 3, '0')
        and x.uid <> r.uid);

create trigger spare_requests_number_immutable
  before update on public.spare_requests
  for each row execute function public.spare_requests_number_immutable();

-- Re-seed the counters from the padded numbers, so a re-run cannot hand out
-- one that is taken (0017's seeding only matched the unpadded form).
insert into public.spare_or_counters (period, last_no)
select to_char(coalesce(or_req_date, created_at::date), 'YY/MM'),
       max((regexp_replace(or_no, '^OR-\d\d/\d\d/', ''))::integer)
  from public.spare_requests
 where or_no ~ '^OR-\d\d/\d\d/\d+$'
 group by 1
on conflict (period) do update
  set last_no = greatest(public.spare_or_counters.last_no, excluded.last_no);

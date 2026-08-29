-- ===========================================================================
-- OR numbers become OR-YYMM-NNNN: OR-2608-0001.
--
-- Third and final shape for this identifier:
--   0017  OR-26/08/1     monthly series, bare counter
--   0018  OR-26/08/001   padded to three
--   0019  OR-2608-0001   slashes replaced by a dash, counter padded to four
--
-- Still one series per month, restarting at 0001. Four digits sorts correctly
-- to 9999 a month, which no month will approach.
--
-- Numbers from the ORIGINAL sheet series (OR47042…) are left alone — they are
-- quoted on DCs and in Tally. The OR-26/08/… forms only ever existed between
-- these migrations, so they are restated into the new shape.
-- ===========================================================================

create or replace function public.next_spare_or_no(p_on date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare
  p text := to_char(p_on, 'YY/MM');   -- counters stay keyed by YY/MM
  n integer;
begin
  insert into public.spare_or_counters (period, last_no) values (p, 1)
  on conflict (period) do update set last_no = public.spare_or_counters.last_no + 1
  returning last_no into n;
  return 'OR-' || to_char(p_on, 'YYMM') || '-' || lpad(n::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------------
-- Restate the slashed numbers. Same month, same position in the series — only
-- the rendering changes.
--
-- The immutability trigger is dropped first: it refuses any or_no change from
-- a non-admin, and in the Supabase SQL Editor auth.uid() is NULL so is_admin()
-- is false. Recreated below, which also makes this safe to re-run.
-- ---------------------------------------------------------------------------
drop trigger if exists spare_requests_number_immutable on public.spare_requests;

update public.spare_requests r
   set or_no = 'OR-' || substring(or_no from 4 for 2) || substring(or_no from 7 for 2)
               || '-' || lpad(regexp_replace(or_no, '^OR-\d\d/\d\d/', ''), 4, '0')
 where or_no ~ '^OR-\d\d/\d\d/\d+$'
   and not exists (
     select 1 from public.spare_requests x
      where x.or_no = 'OR-' || substring(r.or_no from 4 for 2) || substring(r.or_no from 7 for 2)
                      || '-' || lpad(regexp_replace(r.or_no, '^OR-\d\d/\d\d/', ''), 4, '0')
        and x.uid <> r.uid);

create trigger spare_requests_number_immutable
  before update on public.spare_requests
  for each row execute function public.spare_requests_number_immutable();

-- Re-seed the counters from the new shape, so a re-run cannot reissue a number
-- that is taken (earlier seeding only matched the slashed forms).
insert into public.spare_or_counters (period, last_no)
select substring(or_no from 4 for 2) || '/' || substring(or_no from 6 for 2),
       max((regexp_replace(or_no, '^OR-\d{4}-', ''))::integer)
  from public.spare_requests
 where or_no ~ '^OR-\d{4}-\d+$'
 group by 1
on conflict (period) do update
  set last_no = greatest(public.spare_or_counters.last_no, excluded.last_no);

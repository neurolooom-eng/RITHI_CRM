-- ===========================================================================
-- OR numbers become OR-YY/MM/N, restarting at 1 every month.
--
-- 0011 issued a single running series (OR47042…) continuing the sheet's. The
-- required format is per-month instead: OR-26/08/1, OR-26/08/2, … and the
-- first request of September is OR-26/09/1.
--
-- Numbers already issued are NOT rewritten — they are quoted on DCs and in
-- Tally, so the old series stays as history and the new format starts here.
-- ===========================================================================

-- One counter per YY/MM period. Written only by next_spare_or_no().
create table if not exists public.spare_or_counters (
  period  text primary key,          -- 'YY/MM', e.g. '26/08'
  last_no integer not null default 0
);
alter table public.spare_or_counters enable row level security;  -- definer-only

-- Hand out the next number for a month. The upsert is atomic, so two requests
-- submitted at the same moment cannot take the same number.
create or replace function public.next_spare_or_no(p_on date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare
  p text := to_char(p_on, 'YY/MM');
  n integer;
begin
  insert into public.spare_or_counters (period, last_no) values (p, 1)
  on conflict (period) do update set last_no = public.spare_or_counters.last_no + 1
  returning last_no into n;
  return 'OR-' || p || '/' || n;
end $$;
grant execute on function public.next_spare_or_no(date) to authenticated;

-- If this month already has numbers in the new format (a re-run, or a partial
-- rollout), continue past the highest rather than colliding with it.
insert into public.spare_or_counters (period, last_no)
select to_char(coalesce(or_req_date, created_at::date), 'YY/MM'),
       max((regexp_replace(or_no, '^OR-\d\d/\d\d/', ''))::integer)
  from public.spare_requests
 where or_no ~ '^OR-\d\d/\d\d/\d+$'
 group by 1
on conflict (period) do update
  set last_no = greatest(public.spare_or_counters.last_no, excluded.last_no);

create or replace function public.spare_requests_assign_or_no()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.or_req_date is null then
    new.or_req_date := current_date;
  end if;
  if new.or_no is null or trim(new.or_no) = '' then
    -- Numbered in the month the request is raised in.
    new.or_no := public.next_spare_or_no(new.or_req_date);
  end if;
  return new;
end $$;

-- The old single running series is no longer used by anything.
drop sequence if exists public.spare_or_no_seq;

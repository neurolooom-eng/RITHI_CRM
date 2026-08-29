-- ===========================================================================
-- Call Number.
--
--   • From a call registration request → the request's UniqueID
--     (REQID-Product-SerialNo), carried over when the Hotline registers it.
--   • Direct customer call (no request) → CLYY + a 5-digit running number,
--     e.g. CL2600001, continuing the existing series for that year
--     (the register already holds CL2300081, CL2300079, …).
--
-- It was a free-text field nobody filled, so a hand-created call could be
-- saved with a blank Call Number — and reports, spare requests, consumption
-- and feedback are all keyed by it.
-- ===========================================================================

create table if not exists public.call_number_seq (
  yy      text primary key,          -- two-digit year
  last_no integer not null default 0
);
alter table public.call_number_seq enable row level security;  -- only the definer function touches it

-- Next CL number for a year. The counter is seeded once, from the numbers
-- already in `calls` — so import historical CL numbers BEFORE this runs (or
-- delete that year's `call_number_seq` row afterwards to re-seed).
-- Next CL number for this year. The year's counter is seeded from the highest
-- CLYY##### already in `calls`, so it continues the series instead of
-- colliding with imported history.
create or replace function public.next_direct_call_number(p_yy text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_yy text := coalesce(nullif(p_yy, ''), to_char(current_date, 'YY'));
  v_no int;
begin
  insert into public.call_number_seq (yy, last_no)
  values (v_yy, coalesce((
    select max(substring(call_number from 5 for 5)::int)
      from public.calls
     where call_number ~ ('^CL' || v_yy || '[0-9]{5}')), 0))
  on conflict (yy) do nothing;

  update public.call_number_seq set last_no = last_no + 1
   where yy = v_yy
   returning last_no into v_no;

  return 'CL' || v_yy || lpad(v_no::text, 5, '0');
end $$;

-- Assign one when the call arrives without a Call Number. A call registered
-- from a request carries the request's UniqueID, so this only fires for direct
-- calls (and for any import row that has none).
create or replace function public.calls_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ucn is null or new.ucn = '' then
    new.ucn := public.next_ucn(new.call_type);
  end if;
  if coalesce(new.call_number, '') = '' then
    new.call_number := public.next_direct_call_number(to_char(coalesce(new.reg_date, current_date), 'YY'));
  end if;
  if new.reg_date is null then new.reg_date := current_date; end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;

drop trigger if exists calls_biu on public.calls;
create trigger calls_biu before insert on public.calls
  for each row execute function public.calls_before_insert();

-- Back-fill calls saved before this with no Call Number, each in its own year's
-- series (a call registered in 2025 gets a CL25 number, not a CL26 one).
do $$
declare r record;
begin
  for r in select id, reg_date from public.calls where coalesce(call_number, '') = '' order by id loop
    update public.calls
       set call_number = public.next_direct_call_number(to_char(coalesce(r.reg_date, current_date), 'YY'))
     where id = r.id;
  end loop;
end $$;

grant execute on function public.next_direct_call_number(text) to authenticated;

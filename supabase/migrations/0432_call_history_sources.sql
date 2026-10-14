-- ===========================================================================
-- 0432 -- CALL HISTORY FROM SEVERAL SYSTEMS: SOURCE, YEAR, DUPLICATES FLAGGED
-- (the user, 2026-10-13).
--
-- The history comes from every system of record: e-service (before WinMax,
-- calls numbered plainly), WinMax (2017/2018 to 09-Jun-2022, where today's
-- UC Number format began), the yearly sheets on RITHI v1.0 / AppSheet (from
-- 10-Jun-2022, where every January the previous years' pending calls were
-- carried forward as OLD CALLS and their later visit entries pasted into the
-- next year's sheet), and the DCCR register. So the same call can arrive more
-- than once. The user's rules:
--
--   "UCN + Call No = Unique, if the Unique is still a duplicate then Keep the
--    latest year record. Flag it as Duplicate for now but dont action upon it
--    until i explicitly say so" -- and for an Old Call: "Flag it as Duplicate
--    ... And record it with the Year."
--
-- SO every row now says WHERE it came from (`source`: e-service / WinMax /
-- Yearly sheet / DCCR register ...) and FOR WHICH YEAR (`record_year`: the
-- yearly sheet's year, else the year of the call itself). When a file brings a
-- UC No. + Call No. already held FROM ANOTHER SOURCE OR YEAR:
--
--   * the row shows the record of the LATER year (a tie goes to the newcomer);
--   * the other record is NOT lost: it is kept, whole, in `duplicates`, with its
--     source and year;
--   * `duplicate` is set -- a FLAG and nothing more: nothing is merged, deleted
--     or chosen beyond the latest-year rule until the user says so.
--
-- Re-loading the SAME source and year is a correction, as before: not a
-- duplicate.
-- ===========================================================================

alter table public.call_history add column if not exists source      text not null default '';
alter table public.call_history add column if not exists record_year integer;
alter table public.call_history add column if not exists duplicate   boolean not null default false;
alter table public.call_history add column if not exists duplicates  jsonb not null default '[]'::jsonb;

comment on column public.call_history.source is 'The system of record the row came from: e-service, WinMax, Yearly sheet, DCCR register ... (0432).';
comment on column public.call_history.record_year is 'The year of the record: a yearly sheet''s year, else the year of the call (0432).';
comment on column public.call_history.duplicate is 'Flagged when the same UC No. + Call No. arrived from another source or year; the latest year''s record is shown, the others are kept in `duplicates`. A flag only -- nothing is acted on (0432).';
comment on column public.call_history.duplicates is 'The other records of the same UC No. + Call No., each whole with its source and year (0432).';

-- The calls 0430 moved from the DCCR-history import.
update public.call_history
   set source = 'DCCR register',
       record_year = coalesce(record_year, extract(year from (call_at at time zone 'Asia/Kolkata'))::int)
 where source = '' and extra->>'imported_from' = 'DCCR register (historical)';

-- The record's year where the file gave none: the year of the call, in India.
create or replace function public.call_history_year(p_year integer, p_call_at timestamptz)
returns integer language sql immutable set search_path = public as $$
  select coalesce(p_year, extract(year from (p_call_at at time zone 'Asia/Kolkata'))::int)
$$;

-- One record of a call, whole, as `duplicates` keeps it.
create or replace function public.call_history_record(r public.call_history)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'source', r.source, 'record_year', r.record_year, 'call_at', r.call_at, 'call_type', r.call_type,
    'party_name', r.party_name, 'state', r.state, 'city', r.city, 'engineer', r.engineer,
    'item_code', r.item_code, 'item_name', r.item_name, 'serial', r.serial,
    'standard_complaint', r.standard_complaint, 'complaint_reported', r.complaint_reported,
    'item_status', r.item_status, 'warranty_start', r.warranty_start, 'contract_type', r.contract_type,
    'call_status', r.call_status, 'solved_at', r.solved_at, 'extra', r.extra, 'loaded_at', r.loaded_at))
$$;

create or replace function public.call_history_year_default()
returns trigger language plpgsql set search_path = public as $$
begin
  new.source := btrim(coalesce(new.source, ''));
  new.record_year := public.call_history_year(new.record_year, new.call_at);
  return new;
end $$;
revoke execute on function public.call_history_year_default() from public, anon, authenticated;
drop trigger if exists call_history_year_default on public.call_history;
create trigger call_history_year_default before insert on public.call_history
  for each row execute function public.call_history_year_default();

-- THE RULE ON A SECOND RECORD OF THE SAME CALL. Runs on the UPDATE an upsert
-- makes when the key is already held -- AFTER call_history_stamp (the name
-- sorts after it), so a record that stays keeps its own load time, and before
-- zzz_sys_stamp. A record already kept for that source and year is REPLACED,
-- never stacked, so loading the same file twice keeps one copy.
create or replace function public.call_history_keep_latest()
returns trigger language plpgsql set search_path = public as $$
declare
  v_old_year integer := public.call_history_year(old.record_year, old.call_at);
  v_new_year integer;
  v_rest     jsonb;
  v_keep     public.call_history;
begin
  new.source := btrim(coalesce(new.source, ''));
  v_new_year := public.call_history_year(new.record_year, new.call_at);
  new.record_year := v_new_year;
  -- The same source and year: a correction, not a duplicate.
  if new.source = coalesce(old.source, '') and v_new_year is not distinct from v_old_year then
    new.duplicate := old.duplicate;
    new.duplicates := old.duplicates;
    return new;
  end if;
  if v_new_year >= coalesce(v_old_year, v_new_year) then
    -- The newcomer is the latest year: it shows; the held record is kept.
    select coalesce(jsonb_agg(e), '[]'::jsonb) into v_rest
      from jsonb_array_elements(coalesce(old.duplicates, '[]'::jsonb)) e
     where not (e->>'source' = coalesce(old.source, '') and (e->>'record_year')::int is not distinct from v_old_year)
       and not (e->>'source' = new.source and (e->>'record_year')::int is not distinct from v_new_year);
    new.duplicates := v_rest || jsonb_build_array(public.call_history_record(old));
    new.duplicate := true;
    return new;
  end if;
  -- The held record is the later year: it stays as it was; the newcomer is kept.
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_rest
    from jsonb_array_elements(coalesce(old.duplicates, '[]'::jsonb)) e
   where not (e->>'source' = new.source and (e->>'record_year')::int is not distinct from v_new_year);
  v_keep := old;
  v_keep.duplicates := v_rest || jsonb_build_array(public.call_history_record(new));
  v_keep.duplicate := true;
  return v_keep;
end $$;
revoke execute on function public.call_history_keep_latest() from public, anon, authenticated;
drop trigger if exists call_history_keep_latest on public.call_history;
drop trigger if exists call_history_zz_keep_latest on public.call_history;
create trigger call_history_zz_keep_latest before update on public.call_history
  for each row execute function public.call_history_keep_latest();

create index if not exists call_history_duplicate_idx on public.call_history (duplicate) where duplicate;

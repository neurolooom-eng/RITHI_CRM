-- ===========================================================================
-- JUST 0226, NOTHING ELSE -- FOR A LIVE PROJECT.
--
-- Running `call_requests.sql` deadlocked (2026-09-21):
--   ERROR: 40P01 deadlock detected ... waits for AccessExclusiveLock
-- That bundle re-executes SIXTY migrations, many of which take an exclusive
-- lock on the call tables, while the application is reading them. CLAUDE.md
-- already says it: the bundles are the REBUILD path, not the update path --
-- "running one to apply two new statements re-executes the other 150, which is
-- what took the locks". Pointing you at it was the wrong instruction.
--
-- This carries ONLY 0226's contents.
--
-- THREE THINGS MAKE IT SAFE AGAINST A LIVE APP:
--
--  1. `lock_timeout`. Each statement gives up after 10 seconds instead of
--     waiting -- so the worst case is an error you re-run, never a deadlock
--     that takes a live query down with it.
--  2. ONE TABLE PER STATEMENT. The migration does all three inside a single DO
--     block, which holds all three locks at once for as long as the slowest
--     takes. Split up, each lock is taken and released on its own.
--  3. The lock is needed only to change a CATALOG entry -- the column is not
--     rewritten -- so once it is granted the work is instant.
--
-- IF A STATEMENT TIMES OUT: re-run the file. Every part is idempotent, and the
-- parts that already succeeded do nothing the second time. A quiet minute is
-- the easiest way to get the lock.
-- ===========================================================================

set lock_timeout = '10s';

-- ---- 1. the rule ----------------------------------------------------------
create or replace function public.call_open_state(p_status text, p_visit timestamptz)
returns text language sql immutable set search_path = public as $$
  select case
    when p_visit is null and coalesce(p_status, '') = ''        then 'Unattended'
    when lower(coalesce(p_status, '')) like '%cancel%'          then 'Cancelled'
    when lower(coalesce(p_status, '')) like '%unsolved%'        then 'Unsolved'
    when lower(coalesce(p_status, '')) like '%report pending%'  then 'Report pending'
    when lower(coalesce(p_status, '')) like 'solved%'           then 'Solved'
    else 'Report pending'
  end;
$$;
grant execute on function public.call_open_state(text, timestamptz) to authenticated;

create or replace function public.call_open_state_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.open_state := public.call_open_state(new.last_status, new.last_visit_at);
  return new;
end $$;

-- ---- 2. field_calls -------------------------------------------------------
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='field_calls'
                and column_name='open_state' and is_generated='ALWAYS') then
    alter table public.field_calls alter column open_state drop expression;
  end if;
end $$;
drop trigger if exists call_open_state_t on public.field_calls;
create trigger call_open_state_t before insert or update on public.field_calls
  for each row execute function public.call_open_state_stamp();
update public.field_calls set open_state = public.call_open_state(last_status, last_visit_at)
 where open_state is distinct from public.call_open_state(last_status, last_visit_at);

-- ---- 3. installation_calls ------------------------------------------------
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='installation_calls'
                and column_name='open_state' and is_generated='ALWAYS') then
    alter table public.installation_calls alter column open_state drop expression;
  end if;
end $$;
drop trigger if exists call_open_state_t on public.installation_calls;
create trigger call_open_state_t before insert or update on public.installation_calls
  for each row execute function public.call_open_state_stamp();
update public.installation_calls set open_state = public.call_open_state(last_status, last_visit_at)
 where open_state is distinct from public.call_open_state(last_status, last_visit_at);

-- ---- 4. pm_calls ----------------------------------------------------------
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='pm_calls'
                and column_name='open_state' and is_generated='ALWAYS') then
    alter table public.pm_calls alter column open_state drop expression;
  end if;
end $$;
drop trigger if exists call_open_state_t on public.pm_calls;
create trigger call_open_state_t before insert or update on public.pm_calls
  for each row execute function public.call_open_state_stamp();
update public.pm_calls set open_state = public.call_open_state(last_status, last_visit_at)
 where open_state is distinct from public.call_open_state(last_status, last_visit_at);

reset lock_timeout;

-- ---- 5. did it work? ------------------------------------------------------
select 'triggers armed (want 3)' as check, count(*)::text as answer
  from pg_trigger where tgname = 'call_open_state_t' and not tgisinternal
union all
select 'a Canceled call now reads', public.call_open_state('Canceled', now())
union all
select 'calls reading Cancelled', (select count(*)::text from public.calls where open_state = 'Cancelled')
union all
select 'calls reading Report pending', (select count(*)::text from public.calls where open_state = 'Report pending');

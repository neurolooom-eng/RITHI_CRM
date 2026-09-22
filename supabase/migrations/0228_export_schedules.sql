-- ===========================================================================
-- SCHEDULED EXPORT — WHAT AND WHEN, DECIDED IN THE UI. NEVER WHERE.
--
-- The user, 2026-09-22: "Or can we have Scheduled Export option in the UI
-- itself so that i will schedule which ever is necessary."
--
-- THERE IS NO DESTINATION COLUMN IN THIS TABLE, AND THAT IS THE WHOLE DESIGN.
-- The first attempt at a scheduled export was refused as an exfiltration
-- primitive and the refusal was correct: it held the delivery address in a
-- settings row, so any administrator could point the nightly copy of the entire
-- customer base -- every serial, every contract, every contact -- at an address
-- of their choosing, silently, and nothing in the application would look
-- different the next morning.
--
-- So the two halves are separated by where they are kept:
--   * WHICH TABLES and AT WHAT TIME are data, edited on a screen, audited, and
--     harmless on their own -- the worst an administrator can do here is mail
--     the same people a table they did not want.
--   * WHO RECEIVES IT is a DEPLOYMENT SECRET (EXPORT_TO on the Edge Function),
--     changed with the Supabase CLI by somebody holding the project keys, and
--     not reachable from the application at all. It is not in this repository
--     and it is not in this database.
-- Changing the recipients is therefore a deliberate act by a different person
-- through a different channel, which is what "a destination an administrator
-- can edit" failed to be.
--
-- THE SECOND CONTROL IS ON THE TABLE NAMES. The job reads with the service
-- role, past row-level security, because a schedule has no signed-in person
-- behind it -- so an unchecked name in this table would be a way to mail out
-- `record_audit`. `is_exportable_table()` is the one rule, shared with the
-- screen's picker, and a trigger applies it on every insert and update.
-- ===========================================================================

-- ---- the one rule about what may leave -------------------------------------
-- Extracted from 0227's exportable_tables() rather than copied. The picker and
-- the schedule guard must agree for ever: a table the screen will not offer is
-- a table the job must refuse, or the control is only a decoration on a form.
create or replace function public.is_exportable_table(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'v', 'm')
       and c.relname = btrim(coalesce(p_name, ''))
       -- The audit trails are the record of what everyone did. They are large,
       -- and a nightly copy of them in a mailbox is a liability, not a backup.
       and c.relname not in ('audit_log', 'record_audit', 'audit_mode_changes')
  );
$$;

grant execute on function public.is_exportable_table(text) to authenticated;

comment on function public.is_exportable_table(text) is
  'True where the named relation may be exported. ONE copy of the rule: the Data Export picker and the scheduled-export guard both ask it, so a table the screen will not offer is one the job will refuse.';

-- 0227's function now asks that rule rather than restating it.
create or replace function public.exportable_tables()
returns table (table_name text, approx_rows bigint)
language sql stable security definer set search_path = public as $$
  select c.relname::text,
         greatest(c.reltuples, 0)::bigint
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and public.is_exportable_table(c.relname)
     and public.is_admin()
   order by c.relname;
$$;

grant execute on function public.exportable_tables() to authenticated;

-- ---- the schedules ---------------------------------------------------------
create table if not exists public.export_schedules (
  id           bigserial primary key,
  label        text not null,
  tables       text[] not null,
  frequency    text not null default 'daily',
  day_of_week  smallint,            -- 0 = Sunday … 6 = Saturday, weekly only
  hour_ist     smallint not null default 23,
  minute_ist   smallint not null default 0,
  enabled      boolean not null default true,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_run_at  timestamptz,
  last_status  text,
  last_detail  text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'export_schedules_when_check') then
    alter table public.export_schedules add constraint export_schedules_when_check check (
      hour_ist between 0 and 23 and minute_ist between 0 and 59
      and (
        (frequency = 'daily'  and day_of_week is null)
        -- A weekly schedule with no day is not a weekly schedule. Refused here
        -- rather than defaulted to Sunday, because a job that silently picks a
        -- day is a job nobody can predict.
        or (frequency = 'weekly' and day_of_week between 0 and 6)
      )
    );
  end if;
end $$;

comment on table public.export_schedules is
  'What to export and when. NO DESTINATION: the recipients are a deployment secret on the Edge Function (EXPORT_TO), not a column here — see the header of 0228.';

-- ---- the record of every run ----------------------------------------------
-- NAR-004.8. The `last_*` columns above answer "did tonight work?"; this
-- answers "has it been working?", which is the question somebody actually asks
-- six weeks later. Written by the job with the service role and by nothing
-- else: the API grants below give an administrator READ and nothing more, so
-- the history of what left the building cannot be tidied from a screen.
create table if not exists public.export_runs (
  id           bigserial primary key,
  schedule_id  bigint references public.export_schedules(id) on delete set null,
  label        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  tables       text[],
  row_count    bigint,
  bytes        bigint,
  recipients   int,
  status       text,               -- sent · partial · failed
  detail       text
);

create index if not exists export_runs_started_idx on public.export_runs (started_at desc);

-- ---- when is it due? -------------------------------------------------------
-- IN SQL RATHER THAN IN THE JOB, so it can be tested. The Edge Function is the
-- one part of this system no suite here can run, so every decision that can be
-- taken out of it is taken out of it; what remains there is reading rows,
-- building a file and handing it to Resend.
--
-- It returns the MOST RECENT scheduled instant at or before `p_at` — not the
-- next one — and the job compares that with last_run_at. Written that way on
-- purpose: a job that fires "when the clock says 23:00" misses the night the
-- container was restarting, and a job that asks "is the last due instant newer
-- than the last run?" catches up at the next tick and never sends twice.
--
-- Asia/Kolkata throughout because that is where the people reading the mail
-- are, and IST has no daylight saving, so no scheduled time is ever ambiguous
-- or skipped.
create or replace function public.export_run_due_at(
  p_frequency text, p_day_of_week smallint, p_hour smallint, p_minute smallint, p_at timestamptz)
returns timestamptz
language plpgsql stable as $$
declare
  lt    timestamp;   -- p_at as a wall clock in IST
  today timestamp;   -- today's scheduled instant, same wall clock
  back  int;
begin
  if p_hour is null or p_minute is null or p_at is null then return null; end if;
  lt := p_at at time zone 'Asia/Kolkata';
  today := date_trunc('day', lt) + make_interval(hours => p_hour, mins => p_minute);

  if p_frequency = 'daily' then
    if lt < today then today := today - interval '1 day'; end if;
    return today at time zone 'Asia/Kolkata';
  elsif p_frequency = 'weekly' then
    if p_day_of_week is null then return null; end if;
    back := (extract(dow from lt)::int - p_day_of_week + 7) % 7;
    -- Due today, but the hour has not come round yet — so the last one was a
    -- week ago, not this morning.
    if back = 0 and lt < today then back := 7; end if;
    return (today - make_interval(days => back)) at time zone 'Asia/Kolkata';
  end if;
  return null;
end $$;

comment on function public.export_run_due_at(text, smallint, smallint, smallint, timestamptz) is
  'The most recent instant at or before p_at when this schedule was due, in Asia/Kolkata. A run is owed where this is later than last_run_at.';

create or replace function public.due_export_schedules()
returns table (id bigint, label text, tables text[], due_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.label, s.tables, d.due_at
    from public.export_schedules s
    cross join lateral (
      select public.export_run_due_at(s.frequency, s.day_of_week, s.hour_ist, s.minute_ist, now()) as due_at
    ) d
   where s.enabled
     and d.due_at is not null
     and (s.last_run_at is null or s.last_run_at < d.due_at)
   order by s.id;
$$;

-- The job holds the service role. Nobody signed in needs this — the screen
-- reads the schedules themselves — so it is not granted to `authenticated`.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.due_export_schedules() to service_role';
  end if;
end $$;

-- ---- the screen's view -----------------------------------------------------
-- security_invoker, like every other view over an RLS-protected table: without
-- it the view runs as its owner and the policies below stop applying to
-- whoever is reading (0040/0050/0057).
create or replace view public.export_schedule_state as
select s.*,
       public.export_run_due_at(s.frequency, s.day_of_week, s.hour_ist, s.minute_ist, now())
         + case when s.frequency = 'weekly' then interval '7 days' else interval '1 day' end
         as next_run_at
  from public.export_schedules s;

alter view public.export_schedule_state set (security_invoker = on);
grant select on public.export_schedule_state to authenticated;

-- ---- who may touch any of it ----------------------------------------------
alter table public.export_schedules enable row level security;
alter table public.export_runs      enable row level security;

drop policy if exists export_schedules_admin on public.export_schedules;
create policy export_schedules_admin on public.export_schedules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists export_runs_read on public.export_runs;
create policy export_runs_read on public.export_runs
  for select to authenticated using (public.is_admin());

grant select, insert, update, delete on public.export_schedules to authenticated;
grant usage, select on sequence public.export_schedules_id_seq to authenticated;
-- READ ONLY, deliberately. The run history is a record of what left the
-- building; an administrator may look at it and may not edit or erase it. The
-- job writes it with the service role, which is not subject to either.
grant select on public.export_runs to authenticated;
revoke insert, update, delete on public.export_runs from authenticated;

-- ---- the guard -------------------------------------------------------------
create or replace function public.export_schedule_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  -- Stamped from the session, caller-supplied value DISCARDED rather than
  -- refused (the 0113/0114 rule): refusing makes an honest client fail,
  -- discarding makes a buggy one harmless.
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;

  new.label := btrim(coalesce(new.label, ''));
  if new.label = '' then
    raise exception 'A scheduled export needs a name, so the mail says what it is.';
  end if;

  if new.tables is null or array_length(new.tables, 1) is null then
    raise exception 'A scheduled export must name at least one table.';
  end if;
  -- Sorted and de-duplicated, so the mail's attachment order is stable and a
  -- table named twice is not read twice.
  new.tables := (select array_agg(distinct btrim(x) order by btrim(x))
                   from unnest(new.tables) x where btrim(x) <> '');
  foreach t in array new.tables loop
    if not public.is_exportable_table(t) then
      raise exception 'This system does not export "%" — it is not a table here, or it is an audit trail.', t;
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists zz_export_schedule_guard on public.export_schedules;
create trigger zz_export_schedule_guard
  before insert or update on public.export_schedules
  for each row execute function public.export_schedule_guard();

-- ---- the screen's key ------------------------------------------------------
-- No new module: the schedule lives on the Data Export screen, because it is
-- the same act with a clock on it. `mod:/data-export` (0227) already governs it.

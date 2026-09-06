-- ===========================================================================
-- THE UCN COUNTER RESTARTS EVERY DAY, PER CALL TYPE.
--
-- `next_ucn()` built <YY><MonthLetter><DD><TypeLetter><nnnn> where nnnn came
-- from `ucn_seq` — ONE sequence for the whole database, created in 0001 and
-- never reset by anything. So the date in front changed every day and the
-- number behind it just kept climbing, across all three call types together.
--
-- It was never a regression: 0001 says "Seq is a global monotonic count. NOTE:
-- confirm this matches the legacy format before go-live", and
-- docs/SUPABASE_MIGRATION.md has carried "whether the sequence should reset
-- per day/month" as an unresolved open item ever since. This settles it.
--
-- The register itself is the evidence it should reset: it holds 26H28F0009 and
-- then 26H29F0003 — the number goes DOWN from one day to the next, which a
-- global counter can never do. The sheet was counting per day; the database
-- was not. (2024 has the same shape: 24I01P0053, 24I01P0099.)
--
-- PER TYPE, restarting at 0001 each day (user's choice, 2026-09-06): Field,
-- Installation and PM each count their own day. The type letter is already in
-- the UCN, so nothing collides either way; this is the one that reads properly
-- on a printed register, where the Field list counts 1, 2, 3.
--
-- NUMBERS ALREADY ISSUED ARE NOT REWRITTEN (user's choice) — a UCN is printed
-- on delivery challans, quoted on spare requests and written into visit
-- reports, so it can never move under somebody. The counter for a day is
-- SEEDED past whatever that day already carries, so today continues from where
-- it got to and tomorrow opens at 0001. That also makes the change safe to
-- apply mid-day, and correct after an import that back-fills a day.
--
-- AND THE DAY IS INDIA'S. `next_ucn` read `now()`, which is UTC, so the DD in
-- the UCN rolled over at 5:30 am India time: a call registered between midnight
-- and 5:30 already carried YESTERDAY's date. A daily reset keyed off the same
-- clock would have reset at 5:30 too, so both are fixed here. Everything below
-- reads `now() at time zone 'Asia/Kolkata'`.
-- ===========================================================================

-- One counter per day per type. Written only by next_ucn(); RLS on with no
-- policy, so nothing but a definer function can see or touch it.
create table if not exists public.ucn_counters (
  day         date    not null,
  type_letter char(1) not null,          -- F | I | P
  last_no     integer not null default 0,
  primary key (day, type_letter)
);
alter table public.ucn_counters enable row level security;

-- The highest number ALREADY ISSUED under one YYMMDD<T> prefix.
--
-- Reads the three base tables, NOT the `calls` view: `calls` is
-- security_invoker, so inside a definer function it would apply the CALLER's
-- row policies and could hide a call — and a UCN this cannot see is a UCN it
-- would hand out twice. The base tables are read by the definer's owner, which
-- sees all of them.
--
-- The shape test matters as much as the prefix: an imported UCN that does not
-- match YYMMDD<T>nnnn has no number to compare, and `right(ucn,4)::int` on one
-- would raise rather than skip it.
create or replace function public.ucn_highest_issued(p_prefix text)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(max(right(ucn, 4)::int), 0)
    from (
      select ucn from public.field_calls        where ucn like p_prefix || '%'
      union all
      select ucn from public.installation_calls where ucn like p_prefix || '%'
      union all
      select ucn from public.pm_calls           where ucn like p_prefix || '%'
    ) u
   where ucn ~ '^[0-9]{2}[A-L][0-9]{2}[FIP][0-9]{4}$';
$$;
revoke all on function public.ucn_highest_issued(text) from public;

create or replace function public.next_ucn(p_call_type text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_local timestamp := now() at time zone 'Asia/Kolkata';
  v_day   date      := v_local::date;
  tletter text := case public.call_table_for(p_call_type)
                    when 'installation' then 'I'
                    when 'pm'           then 'P'
                    else 'F'
                  end;
  v_prefix text := to_char(v_local, 'YY')
                || substr('ABCDEFGHIJKL', extract(month from v_local)::int, 1)
                || to_char(v_local, 'DD')
                || tletter;
  n integer;
begin
  -- Three statements rather than one upsert, so the SEED SCAN runs once a day
  -- per type instead of on every call: the second statement's WHERE matches
  -- only while the counter is still 0, and Postgres does not evaluate a SET
  -- expression for rows it does not match. That matters — `ucn like 'prefix%'`
  -- cannot use the ucn index under a non-C collation, so the seed reads the
  -- three tables. Once a day per type it is nothing; on every registration it
  -- would not be.
  insert into public.ucn_counters (day, type_letter, last_no)
  values (v_day, tletter, 0)
  on conflict (day, type_letter) do nothing;

  update public.ucn_counters c
     set last_no = public.ucn_highest_issued(v_prefix)
   where c.day = v_day and c.type_letter = tletter and c.last_no = 0;

  -- The row lock this takes is what stops two calls registered in the same
  -- instant taking the same number.
  update public.ucn_counters c
     set last_no = c.last_no + 1
   where c.day = v_day and c.type_letter = tletter
  returning c.last_no into n;

  return v_prefix || lpad(n::text, 4, '0');
end $$;

comment on function public.next_ucn(text) is
  'YYMMDD<T>nnnn, where nnnn restarts at 0001 each day PER CALL TYPE and the day is Asia/Kolkata. Seeded past whatever that day already carries, so numbers already issued are never re-used.';

-- The single running series is no longer used by anything. Dropped rather than
-- left lying about: a dead sequence that the production-reset script still
-- resets is a lie in the code, and this project has been caught by stale
-- artefacts before. (0017 retired spare_or_no_seq the same way.)
drop sequence if exists public.ucn_seq;

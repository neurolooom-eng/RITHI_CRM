-- ===========================================================================
-- SPARE INSIGHTS COUNTS INDIA'S DAYS, WHATEVER THE DATABASE'S ZONE (0254,
-- finding 13).
--
-- Three bookings sit either side of an India-time boundary that is NOT a UTC
-- one: 00:10 on 1 January (31 December in UTC), 23:50 on 31 January, and
-- 03:00 on 1 February (31 January in UTC). January in India holds the first
-- two and not the third. Asked with the session in UTC, in Asia/Kolkata and in
-- a zone on the other side of the world, the answer must be the same -- which
-- is the whole claim. 0148's version answered January as 6 in UTC (it dropped
-- the first booking and took the third).
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

set session_replication_role = replica;   -- no call, no visit: only the window is under test
insert into public.spare_consumption (ucn, part, qty, engineer, created_at)
values ('SI-TZ-1', 'SITZ|Window part', 1, 'SI TZ', '2026-01-01 00:10+05:30'),
       ('SI-TZ-2', 'SITZ|Window part', 2, 'SI TZ', '2026-01-31 23:50+05:30'),
       ('SI-TZ-3', 'SITZ|Window part', 4, 'SI TZ', '2026-02-01 03:00+05:30');
set session_replication_role = origin;

\echo ''
\echo '--- 1. THE SAME ANSWER IN EVERY SESSION ZONE ---'
do $$
declare
  z text; jan numeric; feb numeric; months jsonb;
begin
  foreach z in array array['UTC', 'Asia/Kolkata', 'America/Los_Angeles'] loop
    perform set_config('timezone', z, true);
    jan := (public.spare_insights('2026-01-01', '2026-01-31')->'by_part'->0->>'qty')::numeric;
    feb := (public.spare_insights('2026-02-01', '2026-02-28')->'by_part'->0->>'qty')::numeric;
    if jan is distinct from 3 then
      raise exception 'in %, January in India should hold 3 (00:10 on the 1st + 23:50 on the 31st), got %', z, jan;
    end if;
    if feb is distinct from 4 then
      raise exception 'in %, February in India should hold 4 (03:00 on the 1st), got %', z, feb;
    end if;
    select jsonb_object_agg(m->>'month', (m->>'qty')::numeric) into months
      from jsonb_array_elements(public.spare_insights('2026-01-01', '2026-02-28')->'by_month') m;
    if months is distinct from '{"2026-01": 3, "2026-02": 4}'::jsonb then
      raise exception 'in %, the months should be {2026-01: 3, 2026-02: 4}, got %', z, months;
    end if;
    raise notice 'ok in %: January 3, February 4, months %', z, months;
  end loop;
end $$;

delete from public.spare_consumption where ucn like 'SI-TZ-%';

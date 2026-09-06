-- ===========================================================================
-- THE UCN COUNTER RESTARTS EVERY DAY, PER CALL TYPE (0125).
--
-- What this suite is really holding:
--   * three calls in a row on one day count 0001, 0002, 0003 — and a PM on the
--     same day starts its OWN 0001, because the counter is per type;
--   * the number does NOT carry over to the next day, which is the whole bug:
--     `ucn_seq` was global and monotonic, so the register held 26H28F0009
--     followed by 26H29F0003 in the sheet era and could not any more;
--   * A NUMBER ALREADY ISSUED IS NEVER RE-USED. The day's counter is seeded
--     past whatever that day already carries, so applying this mid-day
--     continues the day rather than colliding with it — the one failure that
--     would be unrecoverable, since a UCN is printed on a delivery challan;
--   * an imported UCN that is not YYMMDD<T>nnnn is skipped rather than raising;
--   * the day is ASIA/KOLKATA, so it does not roll at 5:30 am;
--   * a UCN supplied by the caller is still honoured — the generator only
--     fills a blank.
--
-- The clock cannot be injected (next_ucn reads now()), so the day-boundary
-- cases are tested by SEEDING a day's counter and by checking the prefix the
-- generator produces against the same expression computed independently.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- The suite inserts real calls, so it clears its own first: run twice on one
-- database and the second run must see exactly what the first did.
delete from public.field_calls
 where serial in ('U1','U2','U3','U4') or ucn in ('LEGACY/NOT-A-UCN','MYOWN-UCN-1');
delete from public.ucn_counters;

\echo '--- 1. the old global sequence is GONE ---'
\echo 'expect: 0 — nothing should still be handing out one running series'
select count(*) as ucn_seq_still_there from pg_class
 where relkind = 'S' and relname = 'ucn_seq';

\echo '--- 2. the prefix is today in ASIA/KOLKATA, not UTC ---'
\echo 'expect: t'
select public.next_ucn('FIELD') like
       (to_char(now() at time zone 'Asia/Kolkata', 'YY')
        || substr('ABCDEFGHIJKL', extract(month from now() at time zone 'Asia/Kolkata')::int, 1)
        || to_char(now() at time zone 'Asia/Kolkata', 'DD') || 'F%') as prefix_is_india_today;

\echo '--- 3. a fresh day counts 0001, 0002, 0003 for FIELD ---'
\echo 'expect: 0001 0002 0003'
delete from public.ucn_counters;
select right(public.next_ucn('FIELD'), 4) as one,
       right(public.next_ucn('FIELD'), 4) as two,
       right(public.next_ucn('FIELD'), 4) as three;

\echo '--- 4. ...and PM on the SAME day starts its own 0001 ---'
\echo 'expect: P0001 P0002, then FIELD carries on at 0004'
select right(public.next_ucn('PM VISIT'), 5) as pm_one,
       right(public.next_ucn('P M VISIT'), 5) as pm_two,
       right(public.next_ucn('FIELD'), 5)     as field_next;

\echo '--- 5. INSTALLATION too, and the three counters are independent ---'
\echo 'expect: I0001, and one row per type for today'
select right(public.next_ucn('INSTALLATION'), 5) as inst_one;
select type_letter, last_no from public.ucn_counters
 where day = (now() at time zone 'Asia/Kolkata')::date order by type_letter;

\echo '--- 6. YESTERDAY reaching 0009 does not push today past 0001 ---'
\echo 'expect: 0001 — the reset is the point'
delete from public.ucn_counters;
insert into public.ucn_counters (day, type_letter, last_no)
values ((now() at time zone 'Asia/Kolkata')::date - 1, 'F', 9);
select right(public.next_ucn('FIELD'), 4) as first_of_today;

\echo '--- 7. A NUMBER ALREADY ISSUED TODAY IS NEVER RE-USED ---'
\echo 'expect: 0043 — the day is seeded past the 0042 already on record'
delete from public.ucn_counters;
insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to)
values ((to_char(now() at time zone 'Asia/Kolkata','YY')
         || substr('ABCDEFGHIJKL', extract(month from now() at time zone 'Asia/Kolkata')::int, 1)
         || to_char(now() at time zone 'Asia/Kolkata','DD') || 'F0042'),
        'FIELD','VEGA','U1', current_date,'H','x','y','E');
select right(public.next_ucn('FIELD'), 4) as continues_from;

\echo '--- 8. ...and it only counts THIS day and THIS type ---'
\echo 'expect: P0001 — the 0042 above is a FIELD call, and PM has its own count'
select right(public.next_ucn('PM'), 5) as pm_unaffected;

\echo '--- 9. an imported UCN of another shape is SKIPPED, not raised on ---'
\echo 'expect: no error, and the count carries on from the well-formed one'
insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to)
values ('LEGACY/NOT-A-UCN','FIELD','VEGA','U2', current_date,'H','x','y','E');
delete from public.ucn_counters;
select right(public.next_ucn('FIELD'), 4) as still_0043;

\echo '--- 10. a UCN the caller supplies is left alone ---'
\echo 'expect: MYOWN-UCN-1'
insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to)
values ('MYOWN-UCN-1','FIELD','VEGA','U3', current_date,'H','x','y','E');
select ucn from public.field_calls where serial = 'U3';

\echo '--- 11. a call registered with NO ucn gets one from the generator ---'
\echo 'expect: today''s prefix, next in the FIELD series'
insert into public.field_calls (call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to)
values ('FIELD','VEGA','U4', current_date,'H','x','y','E');
select ucn from public.field_calls where serial = 'U4';

\echo '--- 12. the counter table is definer-only — no policy, so no reader ---'
\echo 'expect: 0 policies, and RLS on'
select (select count(*) from pg_policies where schemaname='public' and tablename='ucn_counters') as policies,
       (select relrowsecurity from pg_class where oid = 'public.ucn_counters'::regclass) as rls_on;

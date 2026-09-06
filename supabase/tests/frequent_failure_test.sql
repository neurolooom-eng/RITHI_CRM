-- ===========================================================================
-- IS THIS A FREQUENT FAILURE? (0117)
--
-- The user's rule: failures on the SAME product + serial, with the SAME
-- complaint, in the last 6 months. What this suite is really guarding:
--
--   * the window is measured FROM THE CALL, not from today — otherwise
--     reopening an old review changes its answer;
--   * the call itself is excluded, because "two earlier failures" is what a
--     reviewer needs to hear and a count that includes the call reads as one
--     more than it is;
--   * a BLANK SERIAL answers nothing rather than matching every other call
--     that is also missing one — a confident number built out of absent data
--     is the worst kind of wrong here, since it decides whether an FFR is
--     raised.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('f0f0f0f0-0000-0000-0000-000000000001','ff_rev@x.com'),
 ('f0f0f0f0-0000-0000-0000-000000000002','ff_out@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('f0f0f0f0-0000-0000-0000-000000000001','ff_rev@x.com','FF Reviewer','hotline'),
 ('f0f0f0f0-0000-0000-0000-000000000002','ff_out@x.com','FF Outsider','stores_incharge')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- The call under review, plus its machine's history.
insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to)
values
 -- the call being reviewed
 ('FF-NOW','FIELD','VEGA','36', current_date,              'HOSP','FiO2 measurement inoperative','NO OUTPUT PRESSURE','ENG A'),
 -- same machine, same standard complaint, inside 6 months  -> counts (x2)
 ('FF-A1', 'FIELD','VEGA','36', current_date - 40,         'HOSP','something else',              'NO OUTPUT PRESSURE','ENG A'),
 ('FF-A2', 'FIELD','VEGA','36', current_date - 150,        'HOSP','something else',              'NO OUTPUT PRESSURE','ENG B'),
 -- same machine, same complaint, OUTSIDE 6 months          -> does not count
 ('FF-OLD','FIELD','VEGA','36', current_date - 400,        'HOSP','x',                           'NO OUTPUT PRESSURE','ENG A'),
 -- same machine, DIFFERENT complaint                       -> does not count
 ('FF-B1', 'FIELD','VEGA','36', current_date - 20,         'HOSP','y',                           'ALARM 012','ENG A'),
 -- same product, DIFFERENT serial                          -> does not count
 ('FF-C1', 'FIELD','VEGA','99', current_date - 20,         'HOSP','z',                           'NO OUTPUT PRESSURE','ENG A'),
 -- matched on the REPORTED problem, for a call with no standard complaint
 ('FF-D1', 'FIELD','VEGA','36', current_date - 10,         'HOSP','FiO2 measurement inoperative','','ENG A'),
 -- a CANCELLED call is not a failure
 ('FF-X1', 'FIELD','VEGA','36', current_date - 15,         'HOSP','x',                           'NO OUTPUT PRESSURE','ENG A'),
 -- a machine with NO serial at all, and another like it
 ('FF-N1', 'FIELD','ORION','',  current_date,              'HOSP','q',                           'SOME FAULT','ENG A'),
 ('FF-N2', 'FIELD','ORION','',  current_date - 5,          'HOSP','q',                           'SOME FAULT','ENG A')
on conflict (ucn) do nothing;
update public.field_calls set cancelled_at = now() where ucn = 'FF-X1';

\echo '--- 1. THE ANSWER: earlier failures on this machine, same complaint, 6 months ---'
\echo 'expect: FF-D1 (reported problem matches), FF-A1, FF-A2 — three rows,'
\echo 'newest first. NOT the call itself, NOT the 400-day-old one, NOT the'
\echo 'different complaint, NOT the different serial, NOT the cancelled one.'
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select ucn, reg_date, complaint, days_before from public.frequent_failure_history('FF-NOW');
commit;

\echo '--- 2. a shorter window narrows it ---'
\echo 'expect: FF-D1 and FF-A1 only — FF-A2 is 150 days back'
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select ucn, days_before from public.frequent_failure_history('FF-NOW', 3);
commit;

\echo '--- 3. THE WINDOW IS MEASURED FROM THE CALL, not from today ---'
\echo 'expect: 0 rows. FF-OLD is 400 days old, so its own six months reaches'
\echo 'back to day 580 and none of the others are in it. If this ever returns'
\echo 'rows, reopening an old review has started changing its answer.'
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select count(*) as rows_for_the_old_call from public.frequent_failure_history('FF-OLD');
commit;

\echo '--- 4. a machine with NO serial answers nothing ---'
\echo 'expect: 0 — not "1 other blank-serial call", which is a number built out'
\echo 'of absent data and would push somebody towards raising an FFR'
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select count(*) as rows_for_a_blank_serial from public.frequent_failure_history('FF-N1');
commit;

\echo '--- 5. a UCN that does not exist is empty, not an error ---'
\echo 'expect: 0'
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select count(*) as rows_for_nothing from public.frequent_failure_history('FF-NOPE');
commit;

\echo '--- 6. it is gated ---'
\echo 'expect: rows for a reader with calls.view — the machine is one they are'
\echo 'reviewing, and a count filtered by their own call scope would read LOWER'
\echo 'than the truth, which is the one direction that matters here'
call public.be('ff_out@x.com');
begin;
  set local role authenticated;
  select count(*) as visible_to_stores from public.frequent_failure_history('FF-NOW');
commit;

\echo '--- 7. cleanup ---'
call public.be(null);
delete from public.field_calls where ucn like 'FF-%';
delete from public.profiles where email like 'ff_%@x.com';

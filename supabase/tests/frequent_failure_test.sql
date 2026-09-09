-- ===========================================================================
-- IS THIS A FREQUENT FAILURE? (0117, rewritten for the rule in 0153)
--
-- The procedure's rule: two or more failures INCLUDING the call under review,
-- within ONE MONTH, on the same equipment OR the same part in the same machine.
-- What this suite is really guarding:
--
--   * the count INCLUDES the call under review, so ONE prior failure is
--     already a frequent failure -- the old screen read one short;
--   * the SAME PART path finds a call the complaint path never would, which is
--     the whole reason it was added;
--   * the window is measured FROM THE CALL, not from today -- otherwise
--     reopening an old review changes its answer;
--   * a BLANK SERIAL answers `known: false` rather than matching every other
--     call that is also missing one -- a confident number built out of absent
--     data is the worst kind of wrong here, since it decides whether an FFR is
--     raised;
--   * a VOIDED consumption line (qty 0) is not a part that was fitted.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
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

insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to)
values
 -- the call being reviewed
 ('FF-NOW','FIELD','VEGA','36', current_date,       'HOSP','FiO2 measurement inoperative','NO OUTPUT PRESSURE','ENG A'),
 -- same machine, same standard complaint, INSIDE one month   -> counts
 ('FF-A1', 'FIELD','VEGA','36', current_date - 20,  'HOSP','something else',              'NO OUTPUT PRESSURE','ENG A'),
 -- same machine, same complaint, OUTSIDE one month            -> does not count
 ('FF-A2', 'FIELD','VEGA','36', current_date - 150, 'HOSP','something else',              'NO OUTPUT PRESSURE','ENG B'),
 -- same machine, DIFFERENT complaint, but the SAME PART fitted -> counts (0153)
 ('FF-P1', 'FIELD','VEGA','36', current_date - 10,  'HOSP','y',                           'ALARM 012','ENG A'),
 -- same machine, different complaint, a DIFFERENT part         -> does not count
 ('FF-B1', 'FIELD','VEGA','36', current_date - 12,  'HOSP','y',                           'ALARM 013','ENG A'),
 -- same product, DIFFERENT serial, same part                   -> does not count
 ('FF-C1', 'FIELD','VEGA','99', current_date - 8,   'HOSP','z',                           'NO OUTPUT PRESSURE','ENG A'),
 -- matched on the REPORTED problem, for a call with no standard complaint
 ('FF-D1', 'FIELD','VEGA','36', current_date - 5,   'HOSP','FiO2 measurement inoperative','','ENG A'),
 -- a CANCELLED call is not a failure
 ('FF-X1', 'FIELD','VEGA','36', current_date - 15,  'HOSP','x',                           'NO OUTPUT PRESSURE','ENG A'),
 -- the same part, but VOIDED (qty 0) -- nothing was fitted
 ('FF-V1', 'FIELD','VEGA','36', current_date - 9,   'HOSP','w',                           'ALARM 099','ENG A'),
 -- a machine with NO serial at all, and another like it
 ('FF-N1', 'FIELD','ORION','',  current_date,       'HOSP','q',                           'SOME FAULT','ENG A'),
 ('FF-N2', 'FIELD','ORION','',  current_date - 5,   'HOSP','q',                           'SOME FAULT','ENG A'),
 -- a lone call: no history at all
 ('FF-L1', 'FIELD','LYRA','7',  current_date,       'HOSP','p',                           'SOME FAULT','ENG A')
on conflict (ucn) do nothing;
update public.field_calls set cancelled_at = now() where ucn = 'FF-X1';

-- Hand stock first: a DB trigger caps every consumption line at the engineer's
-- balance, so a fixture that books parts has to give them to him first.
insert into public.handstock_opening (engineer, part, qty, as_of, source) values
 ('ENG A','PCB-100|Main board',  10, current_date - 400, 'test'),
 ('ENG A','PCB-999|Other board', 10, current_date - 400, 'test')
on conflict do nothing;

insert into public.spare_consumption (ucn, part, qty, engineer) values
 ('FF-NOW','PCB-100|Main board', 1, 'ENG A'),   -- the part fitted on the call in review
 ('FF-P1', 'PCB-100|Main board', 1, 'ENG A'),   -- the SAME part, different complaint
 ('FF-B1', 'PCB-999|Other board',1, 'ENG A'),   -- a different part
 ('FF-C1', 'PCB-100|Main board', 1, 'ENG A'),   -- same part, but another machine
 ('FF-V1', 'PCB-100|Main board', 1, 'ENG A');   -- voided just below

-- A VOID IS AN UPDATE, never an insert of zero: 0049 keeps the row and 0060
-- refuses a zero-quantity booking. The part was never fitted, so FF-V1 must not
-- match on it.
update public.spare_consumption
   set qty = 0, adjustment_reason = 'Voided -- not actually fitted'
 where ucn = 'FF-V1';

\echo '--- 1. THE VERDICT ---'
\echo 'expect: known t, window 1 month, threshold 2, earlier 3, total 4,'
\echo 'is_frequent t. The three are FF-D1 (reported wording), FF-P1 (SAME PART,'
\echo 'a call the complaint path would have missed) and FF-A1. NOT FF-A2 (150'
\echo 'days), NOT FF-B1 (other part, other complaint), NOT FF-C1 (other'
\echo 'machine), NOT FF-X1 (cancelled), NOT FF-V1 (voided line).'
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select r ->> 'known' as known, r ->> 'window_months' as months, r ->> 'threshold' as threshold,
         r ->> 'earlier' as earlier, r ->> 'total' as total, r ->> 'is_frequent' as is_frequent
    from public.frequent_failure('FF-NOW') r;
commit;

\echo '--- 2. WHICH ONES, and why each matched ---'
\echo 'expect: FF-D1 Same machine same complaint · FF-P1 Same part in this'
\echo 'machine · FF-A1 Same machine same complaint. Newest first.'
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select x ->> 'ucn' as ucn, x ->> 'days_before' as days_before, x ->> 'match_on' as match_on
    from jsonb_array_elements(public.frequent_failure('FF-NOW') -> 'rows') x;
commit;

\echo '--- 3. ONE PRIOR FAILURE IS ALREADY A FREQUENT FAILURE ---'
\echo 'expect: earlier 1, total 2, is_frequent t. This is the off-by-one the'
\echo 'old screen had: it showed 1 where the rule counts 2.'
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select r ->> 'earlier' as earlier, r ->> 'total' as total, r ->> 'is_frequent' as is_frequent
    from public.frequent_failure('FF-P1') r;
commit;

\echo '--- 4. a call with no history is NOT frequent ---'
\echo 'expect: known t, earlier 0, total 1, is_frequent f'
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select r ->> 'known' as known, r ->> 'earlier' as earlier, r ->> 'total' as total,
         r ->> 'is_frequent' as is_frequent
    from public.frequent_failure('FF-L1') r;
commit;

\echo '--- 5. THE WINDOW IS MEASURED FROM THE CALL, not from today ---'
\echo 'expect: earlier 0. FF-A2 is 150 days back, so its own month reaches to'
\echo 'day 180 and none of the others are in it. If this ever returns rows,'
\echo 'reopening an old review has started changing its answer.'
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select r ->> 'earlier' as earlier from public.frequent_failure('FF-A2') r;
commit;

\echo '--- 6. a machine with NO serial answers "cannot tell", not "no" ---'
\echo 'expect: known f, is_frequent f. NOT "1 other blank-serial call", which'
\echo 'is a number built out of absent data.'
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select r ->> 'known' as known, r ->> 'earlier' as earlier, r ->> 'is_frequent' as is_frequent
    from public.frequent_failure('FF-N1') r;
commit;

\echo '--- 7. a UCN that does not exist is "cannot tell", not an error ---'
\echo 'expect: known f'
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select r ->> 'known' as known from public.frequent_failure('FF-NOPE') r;
commit;

\echo '--- 8. THE SETTINGS ARE THE RULE: widen the window, FF-A2 comes back ---'
\echo 'expect: earlier 4 (FF-A2 joins the three)'
update public.app_settings set value = '6' where key = 'ffr.window_months';
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select r ->> 'window_months' as months, r ->> 'earlier' as earlier
    from public.frequent_failure('FF-NOW') r;
commit;

\echo '--- 9. ...and turning OFF the complaint requirement widens the equipment path ---'
\echo 'expect: earlier 6 — every uncancelled call on this machine in 6 months'
update public.app_settings set value = 'off' where key = 'ffr.equipment_needs_complaint';
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select r ->> 'equipment_needs_complaint' as needs_complaint, r ->> 'earlier' as earlier
    from public.frequent_failure('FF-NOW') r;
commit;
update public.app_settings set value = '1'  where key = 'ffr.window_months';
update public.app_settings set value = 'on' where key = 'ffr.equipment_needs_complaint';

\echo '--- 10. raising the threshold makes the same history NOT frequent ---'
\echo 'expect: threshold 5, earlier 3, total 4, is_frequent f'
update public.app_settings set value = '5' where key = 'ffr.threshold';
call public.be('ff_rev@x.com');
begin;
  set local role authenticated;
  select r ->> 'threshold' as threshold, r ->> 'total' as total, r ->> 'is_frequent' as is_frequent
    from public.frequent_failure('FF-NOW') r;
commit;
update public.app_settings set value = '2' where key = 'ffr.threshold';

\echo '--- 11. it is gated, and NOT narrowed to the reader''s own call scope ---'
\echo 'expect: earlier 3 for a reader with calls.view — the machine is one they'
\echo 'are reviewing, and a count filtered by their own scope would read LOWER'
\echo 'than the truth, which is the one direction that matters here'
call public.be('ff_out@x.com');
begin;
  set local role authenticated;
  select r ->> 'earlier' as earlier from public.frequent_failure('FF-NOW') r;
commit;

\echo '--- 12. cleanup ---'
call public.be(null);
delete from public.spare_consumption where ucn like 'FF-%';
delete from public.handstock_opening where engineer = 'ENG A' and source = 'test';
delete from public.field_calls where ucn like 'FF-%';
delete from public.profiles where email like 'ff_%@x.com';

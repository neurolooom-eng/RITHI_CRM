-- ===========================================================================
-- Call requests + call state, against a throwaway Postgres. See README.
--   psql ... -f _stub.sql -f <every migration> -f call_requests_test.sql
-- Covers: one REQID across a request's calls, the unique_key identity, the
-- Hotline outcomes (mapped / registered / cancelled), and how a call's latest
-- visit decides its open state.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- ---- personas -------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','eng@x.com'),
  ('55555555-5555-5555-5555-555555555555','hot@x.com');
insert into public.profiles (id, email, full_name, role) values
  ('11111111-1111-1111-1111-111111111111','eng@x.com','Eng Elan','engineer'),
  ('55555555-5555-5555-5555-555555555555','hot@x.com','Hot Hema','hotline');

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

\echo '--- 1. One request = up to 5 calls sharing a REQID (0010) ---'
call public.be('eng@x.com');
select public.next_call_reqid() as reqid \gset
insert into public.call_requests (reqid, engineer, call_type, party_name, product, serial_no, standard_complaint, reported_problem) values
  (:'reqid','Eng Elan','FIELD','KAMALAKAR','ORION-G','2137','Fi O2','Fi O2 percentage problem'),
  (:'reqid','Eng Elan','FIELD','KAMALAKAR','ORION-G','2138','Solenoid','Solenoid valve problem'),
  (:'reqid','Eng Elan','FIELD','KAMALAKAR','CPX CARE','4306','Autodrain','Autodrain problem');
select reqid, product, serial_no, unique_key, status from public.call_requests order by unique_key;

\echo '--- 2. The same product+serial twice in one request is refused ---'
\echo 'expect ERROR: duplicate unique_key'
insert into public.call_requests (reqid, engineer, product, serial_no) values (:'reqid','Eng Elan','ORION-G','2137');

\echo '--- 3. A second request gets its own REQID ---'
insert into public.call_requests (engineer, call_type, party_name, product, serial_no) values
  ('Eng Elan','INSTALLATION CALL','A.V.M.','ORION-G','9001'),
  ('Eng Elan','FIELD','THOOTHUKUDI','ORION-G','601');
select count(distinct reqid) as distinct_reqids from public.call_requests;

\echo '--- 4. Hotline maps one, registers one, cancels one (0011) ---'
call public.be('hot@x.com');
insert into public.calls (ucn, call_type, party_name, product_name, serial, allocated_to)
  values ('MAP-UCN-1','FIELD','KAMALAKAR','ORION-G','2137','Venkat');
update public.call_requests set ucn='MAP-UCN-1', status='Mapped', actioned_by='Hot Hema', actioned_at=now()
 where unique_key = :'reqid' || '-ORION-G-2137';
update public.call_requests set ucn='REG-UCN-1', status='Registered', actioned_by='Hot Hema', actioned_at=now()
 where unique_key = :'reqid' || '-ORION-G-2138';
update public.call_requests set status='Cancelled', cancel_reason='Duplicate request', cancelled_at=now(), actioned_by='Hot Hema'
 where unique_key = :'reqid' || '-CPX CARE-4306';

\echo 'still pending = no UCN and not cancelled (what the Pending list shows)'
select unique_key, status from public.call_requests
 where coalesce(ucn,'') = '' and status <> 'Cancelled' order by unique_key;

\echo '--- 5. Call state comes from the LATEST visit (0012) ---'
insert into public.calls (ucn, call_type, party_name, product_name, serial, allocated_to) values
  ('U-NOVISIT','FIELD','A','P','S1','Eng Elan'),
  ('U-UNSOLVED','FIELD','A','P','S2','Eng Elan'),
  ('U-PENDING','FIELD','A','P','S3','Eng Elan'),
  ('U-SOLVED','FIELD','A','P','S4','Eng Elan');
insert into public.reports (uid, ucn, call_status, visit_at) values
  ('V1','U-UNSOLVED','Unsolved', now() - interval '2 day'),
  ('V2','U-PENDING','Report Pending', now() - interval '1 day'),
  ('V3','U-SOLVED','Unsolved', now() - interval '3 day'),
  ('V4','U-SOLVED','Solved - Report Completed', now() - interval '1 hour');
select ucn, state from public.call_state where ucn like 'U-%' order by ucn;

\echo 'a later unsolved visit re-opens a solved call'
insert into public.reports (uid, ucn, call_status, visit_at) values ('V5','U-SOLVED','Unsolved', now());
select ucn, state from public.call_state where ucn = 'U-SOLVED';

\echo '--- 6. pending_calls = everything not solved, with the calls columns ---'
select ucn, open_state, party_name, state as geographic_state from public.pending_calls where ucn like 'U-%' order by ucn;

\echo '--- 7. RBAC policies survive re-applying 0003 (the apply bundle does) ---'
select polname, pg_get_expr(polwithcheck, polrelid) as with_check
  from pg_policy where polrelid = 'public.call_requests'::regclass and polname = 'cr_insert';

\echo '--- 8. Call state lives on the call and the trigger keeps it current (0012) ---'
select ucn, open_state from public.calls where ucn like 'U-%' order by ucn;
\echo 'a new unsolved visit flips a solved call without any view re-deriving it'
insert into public.reports (uid, ucn, call_status, visit_at) values ('V6','U-PENDING','Solved - Report Completed', now());
select ucn, last_status, open_state from public.calls where ucn = 'U-PENDING';
\echo 'deleting the last visit puts the call back to Unattended'
delete from public.reports where ucn = 'U-UNSOLVED';
select ucn, last_status, open_state from public.calls where ucn = 'U-UNSOLVED';

\echo '--- 9. Call Number: request UniqueID, else CLYY##### (0013) ---'
insert into public.calls (call_type, party_name, product_name, serial, reg_date)
  values ('FIELD','Direct One','ORION-G','7001', current_date);
insert into public.calls (call_number, call_type, party_name, product_name, serial, reg_date)
  values ('R20005-ORION-G-601','FIELD','From Request','ORION-G','601', current_date);
select call_number, party_name from public.calls
 where party_name in ('Direct One','From Request') order by party_name;

\echo 'the year counter seeds from the numbers already in the register'
delete from public.call_number_seq;                       -- as if seeding for the first time
insert into public.calls (ucn, call_number, call_type, party_name, reg_date)
  values ('CN-OLD','CL' || to_char(current_date,'YY') || '00200-ORION-G-842','FIELD','Imported', current_date);
insert into public.calls (call_type, party_name, reg_date) values ('FIELD','After Import', current_date);
select call_number, party_name from public.calls where party_name = 'After Import';

\echo 'a call registered a year ago gets that years series'
insert into public.calls (call_type, party_name, reg_date) values ('FIELD','Last Year', current_date - interval '1 year');
select call_number, party_name from public.calls where party_name = 'Last Year';

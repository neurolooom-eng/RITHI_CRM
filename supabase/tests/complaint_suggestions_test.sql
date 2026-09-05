-- ===========================================================================
-- Suggesting the Standard Complaint (0104).
--   The register's own evidence outranks a resemblance between two strings.
--   An engineer gets the SAME suggestions as an administrator — the function
--   is SECURITY DEFINER precisely so the newest engineer is not given the
--   worst suggestions — while learning nothing about a call they may not see.
--   The log records what was offered and what was taken.
-- Superuser bypasses RLS, so each scoped check runs as `authenticated`.
-- Run after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id,email) values
 ('c1c1c1c1-0000-0000-0000-000000000001','boss@x.com'),
 ('c1c1c1c1-0000-0000-0000-000000000002','eng@x.com');
insert into public.profiles (id,email,full_name,role) values
 ('c1c1c1c1-0000-0000-0000-000000000001','boss@x.com','Admin Boss','admin'),
 ('c1c1c1c1-0000-0000-0000-000000000002','eng@x.com','New Engineer','engineer');
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid=(select id from auth.users where email=p), email=p; end $$;

insert into public.masters (name, value) values ('complaint','CS-1 OXYGEN SENSOR FAULT - TESTP')
  on conflict do nothing;

-- Twelve past calls, none of them the new engineer's, all settling the same
-- question: "Oxygen sensor defective" is CS-1.
insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to)
select 'CS'||g, 'FIELD', 'TESTPROD', g::text, current_date - g, 'HOSP',
       'Oxygen sensor defective', 'CS-1 OXYGEN SENSOR FAULT - TESTP', 'Someone Else'
  from generate_series(1,12) g;

grant select on public.harness to authenticated;

\echo '--- 1. the evidence wins: chosen 12 times, ranked first ---'
\echo 'expect: CS-1 OXYGEN SENSOR FAULT - TESTP, chosen 12'
select value, chosen, why from public.suggest_standard_complaint('Oxygen sensor defective','TESTPROD',1);

\echo '--- 2. PARAPHRASE: "O2 sensor faulty" still finds it ---'
\echo 'expect: the same complaint, still on the strength of those 12 calls'
select value, chosen from public.suggest_standard_complaint('O2 sensor faulty','TESTPROD',1);

\echo '--- 3. an ENGINEER who owns none of those calls gets the same answer ---'
\echo 'expect: identical to 1 — the point of SECURITY DEFINER'
call public.be('eng@x.com');
do $$
declare v text; n int;
begin
  set local role authenticated;
  select value, chosen into v, n from public.suggest_standard_complaint('Oxygen sensor defective','TESTPROD',1);
  raise notice 'engineer sees: % (chosen %)', v, n;
end $$;

\echo '--- 4. ...and still cannot read the calls it was drawn from (expect 0) ---'
\echo 'This is the check that found the `calls` view had lost security_invoker'
\echo '(0057 rebuilt it and did not re-assert it), so every user could read'
\echo 'every call. 0105 restores it. If this reads 12 again, that has regressed.'
do $$
declare n int;
begin
  set local role authenticated;
  select count(*) into n from public.calls where ucn like 'CS%';
  raise notice 'calls the engineer can read: %', n;
end $$;

\echo '--- 5. the log records what was offered and what was taken ---'
\echo 'expect: accepted CS-1..., accepted_rank 1, author stamped by the database'
do $$
begin
  set local role authenticated;
  insert into public.complaint_suggestions (product, reported, suggested, accepted, accepted_rank, ucn)
  values ('TESTPROD','Oxygen sensor defective',
          '[{"value":"CS-1 OXYGEN SENSOR FAULT - TESTP","why":"chosen on 12 similar calls","source":"register","rank":1}]'::jsonb,
          'CS-1 OXYGEN SENSOR FAULT - TESTP', 1, 'CS-NEW');
end $$;
select accepted, accepted_rank, asked_by_name from public.complaint_suggestions where ucn = 'CS-NEW';

\echo '--- 6. an engineer cannot READ the log (expect 0 rows) ---'
do $$
declare n int;
begin
  set local role authenticated;
  select count(*) into n from public.complaint_suggestions;
  raise notice 'log rows the engineer can read: %', n;
end $$;

\echo '--- 7. cleanup ---'
delete from public.complaint_suggestions where ucn = 'CS-NEW';
delete from public.field_calls where ucn like 'CS%';
delete from public.profiles where email in ('boss@x.com','eng@x.com');

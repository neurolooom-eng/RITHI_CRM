-- ===========================================================================
-- WHAT THE PUBLIC KEY CAN REACH (0247, 0248) -- findings 49-52.
--
-- TWO HALVES, AND THE SECOND IS THE ONE THAT BITES. The first proves the
-- holes are shut: the not-signed-in role and an ordinary engineer are refused.
-- The second proves NOTHING THE APP DOES BROKE: every function withdrawn here is
-- still reached by the database's own paths -- a new call gets its UCN, a new
-- party its Party Key, a review raises its FFR, a spare request its OR number.
--
-- WHY THE SECOND HALF RUNS AS `authenticated`: a superuser ignores EXECUTE
-- grants entirely, and most suites run as one -- so a revoke that broke call
-- registration would pass every one of them. Only a signed-in role can see it.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('10c00000-0000-0000-0000-000000000001', 'lock-admin@x.com'),
  ('10c00000-0000-0000-0000-000000000002', 'lock-eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('10c00000-0000-0000-0000-000000000001', 'lock-admin@x.com', 'Lock Admin', 'admin'),
  ('10c00000-0000-0000-0000-000000000002', 'lock-eng@x.com',   'Lock Eng',   'engineer')
on conflict do nothing;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;
grant select on public.harness to anon, authenticated;

\echo ''
\echo '--- 1. NOT SIGNED IN: every door is shut ---'
update public.harness set uid = null, email = null;
set role anon;
\echo 'expect ERROR: permission denied for table party_key_seq (49)'
update public.party_key_seq set last_no = 999999;
\echo 'expect ERROR: permission denied for function next_party_key (52)'
select public.next_party_key();
\echo 'expect ERROR: permission denied for function raise_ffr (50)'
select public.raise_ffr(json_populate_record(null::public.call_reviews, '{"ucn":"LOCK-1","risk_to_patient":"Yes"}'));
\echo 'expect ERROR: permission denied for function refresh_product_cover (51)'
select public.refresh_product_cover();
\echo 'expect ERROR: permission denied for function next_ucn (52)'
select public.next_ucn('FIELD');
reset role;

\echo ''
\echo '--- 2. SIGNED IN AS AN ENGINEER: no maintenance, no minting numbers ---'
call public.be('lock-eng@x.com');
set role authenticated;
select 'the engineer holds neither' as check,
       public.has_perm('cover.edit')::text as cover_edit_should_be_false,
       public.is_admin()::text as admin_should_be_false;
\echo 'expect ERROR: Only someone who may edit cover (cover.edit) can re-fold cover (51)'
select public.refresh_product_cover();
\echo 'expect ERROR: Only someone who may edit cover (cover.edit) can re-fold cover (51)'
select public.cover_unpin_inherited();
\echo 'expect ERROR: permission denied for function next_ucn (52)'
select public.next_ucn('FIELD');
\echo 'expect ERROR: permission denied for function purge_audit_log (51)'
select public.purge_audit_log();
\echo 'expect ERROR: permission denied for function raise_ffr (50)'
select public.raise_ffr(json_populate_record(null::public.call_reviews, '{"ucn":"LOCK-1","risk_to_patient":"Yes"}'));
reset role;

\echo ''
\echo '--- 3. WHAT THE APP CALLS STILL WORKS for the people meant to call it ---'
call public.be('lock-admin@x.com');
set role authenticated;
select 'an admin re-folds cover' as check,
       (public.cover_unpin_inherited() >= 0)::text as unpin_ok,
       (public.refresh_product_cover() >= 0)::text as refresh_ok;
select 'a REQID can still be minted' as check,
       (coalesce(public.next_call_reqid(), '') <> '')::text as should_be_true;
reset role;

\echo ''
\echo '--- 4. THE DATABASE''S OWN PATHS STILL WORK, as a signed-in user ---'
call public.be('lock-admin@x.com');
set role authenticated;
-- a new call is given its UCN by the definer trigger that calls next_ucn()
insert into public.calls (call_type, product_name, serial, reg_date, party_name,
                          complaint_reported, standard_complaint, allocated_to)
values ('FIELD', 'LOCKPROD', 'L-1', current_date, 'LOCK HOSP', 'x', 'y', '');
-- a new party is given its Party Key by the definer trigger that calls next_party_key()
insert into public.parties (party_name) values ('LOCK TEST PARTY');
reset role;
do $$
declare v_ucn text; v_key text;
begin
  select ucn into v_ucn from public.field_calls where serial = 'L-1' and product_name = 'LOCKPROD';
  if coalesce(v_ucn, '') = '' then raise exception 'a call registered by a signed-in user got no UCN'; end if;
  select party_key into v_key from public.parties where party_name = 'LOCK TEST PARTY';
  if coalesce(v_key, '') = '' then raise exception 'a party added by a signed-in user got no Party Key'; end if;
  raise notice 'ok: UCN % and Party Key % still assigned', v_ucn, v_key;
end $$;

-- a Daily Complaint Review answer raises its FFR through ffr_from_review() -> raise_ffr()
set role authenticated;
-- any_potential_effect is computed from the three answers, so it is not written.
insert into public.call_reviews (ucn, risk_to_patient, warranty_failure, frequent_failure)
select ucn, 'Yes', 'Yes', 'Yes' from public.field_calls where serial = 'L-1' and product_name = 'LOCKPROD';
reset role;
do $$
begin
  if not exists (select 1 from public.field_failure_reports f
                   join public.field_calls c on c.ucn = f.ucn
                  where c.serial = 'L-1' and c.product_name = 'LOCKPROD') then
    raise exception 'a review by a signed-in user no longer raises its FFR';
  end if;
  raise notice 'ok: the review still raised its FFR';
end $$;

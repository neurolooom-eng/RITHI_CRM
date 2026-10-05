-- ===========================================================================
-- UNMAP: A MAPPED CALL REQUEST GOES BACK TO PENDING (v0.10.98).
--
-- The user, 2026-10-05: R18884 was mapped to 26H01P0365 by mistake -- "I want
-- to unmap this and put it back on pending list". The app's Unmap button and
-- supabase/apply/_unmap_call_request.sql both write the same four columns.
--
-- WHAT THIS PROVES, as `authenticated` (a superuser ignores RLS):
--   1. a pending.register holder (Hotline) puts a Mapped request back to
--      Pending -- UCN cleared, actioned by/at cleared -- and 0232's freeze on
--      an answered request's CONTENT does not stand in the way, because only
--      disposition columns move; the request is then on the pending list again;
--   2. the call it was mapped to is untouched;
--   3. the status test leaves a Registered request alone (zero rows);
--   4. an engineer who did not raise the request and holds neither key changes
--      nothing -- cr_update matches no row.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
  ('0398a000-0000-0000-0000-000000000001', 'um-hotline@x.com'),
  ('0398e000-0000-0000-0000-000000000002', 'um-eng@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0398a000-0000-0000-0000-000000000001', 'um-hotline@x.com', 'UM HOTLINE', 'hotline'),
  ('0398e000-0000-0000-0000-000000000002', 'um-eng@x.com',     'UM ENG',     'engineer')
on conflict do nothing;

create or replace procedure public.be(p_email text) language plpgsql as $$
begin
  update public.harness set uid = (select id from auth.users where email = p_email), email = p_email;
end $$;

insert into public.field_calls (ucn, call_number, party_name, allocated_to)
values ('UM-CALL-1', 'CN-UM', 'PRAYAG HOSPITAL', 'UM ENG');
insert into public.call_requests (reqid, engineer, party_name, product, serial_no, ucn, status, actioned_by, actioned_at) values
  ('UM-R1', 'UM ENG', 'PRAYAG HOSPITAL', 'HORUS EXTEND', '925', 'UM-CALL-1', 'Mapped',     'Rithi Admin', now()),
  ('UM-R2', 'UM ENG', 'PRAYAG HOSPITAL', 'HORUS EXTEND', '926', 'UM-CALL-1', 'Registered', 'Rithi Admin', now()),
  ('UM-R3', 'UM ENG', 'PRAYAG HOSPITAL', 'HORUS EXTEND', '927', 'UM-CALL-1', 'Mapped',     'Rithi Admin', now());

\echo ''
\echo '--- 1 and 2. the Hotline desk unmaps a Mapped request ---'
call public.be('um-hotline@x.com');
set role authenticated;
with moved as (
  update public.call_requests set ucn = '', status = 'Pending', actioned_by = '', actioned_at = null
   where reqid = 'UM-R1' and status = 'Mapped' returning reqid)
select count(*)::text as rows_unmapped_should_be_1 from moved;
reset role;
select 'after the unmap' as check,
  (select status || ' | ' || coalesce(nullif(ucn, ''), 'no ucn') || ' | ' || coalesce(nullif(actioned_by, ''), 'nobody') || ' | ' || coalesce(actioned_at::text, 'no time')
     from public.call_requests where reqid = 'UM-R1') as should_be_pending_no_ucn_nobody_no_time,
  (select count(*) from public.call_requests where reqid = 'UM-R1'
      and coalesce(btrim(ucn), '') = '' and lower(coalesce(status, '')) in ('', 'pending'))::text as on_pending_list_should_be_1,
  (select count(*) from public.field_calls where ucn = 'UM-CALL-1' and party_name = 'PRAYAG HOSPITAL')::text as call_untouched_should_be_1;

\echo ''
\echo '--- 3. a Registered request is left alone ---'
set role authenticated;
with moved as (
  update public.call_requests set ucn = '', status = 'Pending', actioned_by = '', actioned_at = null
   where reqid = 'UM-R2' and status = 'Mapped' returning reqid)
select count(*)::text as rows_should_be_0 from moved;
reset role;
select 'the Registered one' as check,
  (select status || ' | ' || ucn from public.call_requests where reqid = 'UM-R2') as should_be_registered_um_call_1;

\echo ''
\echo '--- 4. an engineer who did not raise it changes nothing ---'
call public.be('um-eng@x.com');
set role authenticated;
with moved as (
  update public.call_requests set ucn = '', status = 'Pending', actioned_by = '', actioned_at = null
   where reqid = 'UM-R3' and status = 'Mapped' returning reqid)
select count(*)::text as rows_should_be_0 from moved;
reset role;
select 'the engineer''s attempt' as check,
  (select status || ' | ' || ucn from public.call_requests where reqid = 'UM-R3') as should_be_mapped_um_call_1;

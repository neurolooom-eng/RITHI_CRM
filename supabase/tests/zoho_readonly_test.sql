-- ===========================================================================
-- ZOHO MIGRATION IS READ-ONLY, AND A CLONE SEEDS A ROLE ONCE.
--
-- Every error this suite prints is labelled `expect ERROR`. Anything else is
-- a real failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

insert into auth.users (id,email) values ('cc000000-0000-0000-0000-000000000001','zoho@x.com')
on conflict do nothing;
insert into public.profiles (id,email,full_name,role) values
 ('cc000000-0000-0000-0000-000000000001','zoho@x.com','Zoho Person','zoho_migration')
on conflict (id) do update set role = excluded.role;
insert into public.user_directory (name,email,role) values ('Zoho Person','zoho@x.com','zoho_migration')
on conflict do nothing;

insert into public.field_calls (ucn, call_number, call_type, party_name, product_name, allocated_to, reg_date)
values ('F-ZOHO-1','CN-ZOHO-1','Field Call','Hospital Z','MONNAL T75','Some Engineer', current_date),
       ('F-ZOHO-2','CN-ZOHO-2','Field Call','Hospital Z','MONNAL T75','Some Engineer', current_date)
on conflict do nothing;

\echo ''
\echo '=== 1. THE REPORTED CASE, reproduced before it is fixed ==============='
-- The live state: an administrator ticked review.edit on TECHNICAL SUPPORT,
-- and the old merge in 0155 carried it to zoho_migration.
update public.app_roles set permissions = permissions || '["review.edit"]'::jsonb
 where role = 'technical_support' and not permissions ? 'review.edit';
update public.app_roles set permissions = permissions || '["review.edit"]'::jsonb
 where role = 'zoho_migration' and not permissions ? 'review.edit';

call public.be('zoho@x.com');
set role authenticated;
select public.has_perm('review.edit') as holds_review_edit_should_be_t;
-- Risk to Patient = Yes makes any_potential_effect YES, which raises an FFR.
insert into public.call_reviews (ucn, risk_to_patient, warranty_failure, frequent_failure)
values ('F-ZOHO-1','Yes','No','No');
reset role;
select count(*) as ffrs_raised_should_be_1 from public.field_failure_reports where ucn = 'F-ZOHO-1';
select raised_by_name as raised_by_should_be_zoho_person
  from public.field_failure_reports where ucn = 'F-ZOHO-1';

\echo ''
\echo '=== 2. 0180 revokes it -- and ONLY from zoho_migration ================'
\i supabase/migrations/0180_zoho_readonly.sql
select role, permissions ? 'review.edit' as holds_review_edit
  from public.app_roles where role in ('technical_support','zoho_migration') order by role;
\echo '    (technical_support must still read t -- the user decided it keeps it)'

\echo ''
\echo '=== 3. the role can no longer write a review, so cannot raise an FFR =='
call public.be('zoho@x.com');
set role authenticated;
select public.has_perm('review.edit') as holds_review_edit_should_be_f;
\echo '    expect ERROR below -- that refusal IS the fix'
insert into public.call_reviews (ucn, risk_to_patient, warranty_failure, frequent_failure)
values ('F-ZOHO-2','Yes','No','No');
reset role;
select count(*) as ffrs_for_call_2_should_be_0 from public.field_failure_reports where ucn = 'F-ZOHO-2';

\echo ''
\echo '=== 4. NOTHING IS UNDONE: the FFR already raised still stands ========='
-- 0049's rule. Withdrawing access is not a way of editing the record.
select count(*) as ffr_from_step_1_still_there_should_be_1
  from public.field_failure_reports where ucn = 'F-ZOHO-1';

\echo ''
\echo '=== 5. A CLONE SEEDS ONCE: re-running 0155 does NOT re-add it ========='
-- The whole mechanism that caused this. technical_support still holds
-- review.edit (step 2), so the OLD merge would put it straight back.
\i supabase/migrations/0155_zoho_migration_role.sql
select permissions ? 'review.edit' as re_added_should_be_f
  from public.app_roles where role = 'zoho_migration';

\echo ''
\echo '=== 6. ...and a NEW write action ticked later does not cross either ==='
update public.app_roles set permissions = permissions || '["masters.edit"]'::jsonb
 where role = 'technical_support';
\i supabase/migrations/0155_zoho_migration_role.sql
select permissions ? 'masters.edit' as crossed_over_should_be_f
  from public.app_roles where role = 'zoho_migration';

\echo ''
\echo '=== 7. 0180 is idempotent -- a second run is a no-op =================='
\i supabase/migrations/0180_zoho_readonly.sql
select permissions ? 'review.edit' as still_gone_should_be_f
  from public.app_roles where role = 'zoho_migration';

\echo ''
\echo '=== 8. the status row now reads yes ==================================='
select not exists (
         select 1 from public.app_roles zm, lateral jsonb_array_elements_text(zm.permissions) m(v)
          where zm.role = 'zoho_migration'
            and m.v in ('calls.edit','masters.edit','users.manage','rbac.manage','spare.dispatch',
                        'review.edit','cover.edit','consumption.reconcile')
       ) as read_only_should_be_t;

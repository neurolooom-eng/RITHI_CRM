-- ===========================================================================
-- REVIEW BATCH 5, PROVED ON A DATABASE (0366-0368).
-- Each section proves BOTH halves: the hole the re-review measured is closed,
-- AND the honest path beside it still works.
--
--   1. D-140  the masters' required fields and case-variant codes (0366)
--   2. D-058  the KYC verifier is not the caller's to write (0366)
--   3. D-138  a product line indoor jobs name is not deleted; its rename count (0366)
--   4. D-143  an Indoor DC is approved by the login its User Master row carries (0367)
--   5. D-061  a QMS revision is a new entry, and a QMS document is not deleted (0368)
--
-- Checks raise an unlabelled error when they are wrong, so the harness counts
-- a failure; an error that is meant to happen is labelled `expect ERROR`.
-- Run ONCE after _stub.sql + every migration.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into public.app_roles (role, label, permissions) values
 ('rb5_master', 'RB5 Master', '["masters.view", "masters.edit", "masters.edit.kyc", "masters.parties.delete", "masters.parts.delete"]'::jsonb),
 ('rb5_loader', 'RB5 Loader', '["masters.view", "masters.edit", "bulk.upload"]'::jsonb),
 ('rb5_qms',    'RB5 QMS',    '["qms.manage", "docs.manage"]'::jsonb),
 ('rb5_reader', 'RB5 Reader', '["calls.view", "mod:/indoor"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
  ('0b550000-0000-0000-0000-000000000001', 'rb5-master@x.com'),
  ('0b550000-0000-0000-0000-000000000002', 'rb5-loader@x.com'),
  ('0b550000-0000-0000-0000-000000000003', 'rb5-qms@x.com'),
  ('0b550000-0000-0000-0000-000000000004', 'rb5-approver@x.com'),
  ('0b550000-0000-0000-0000-000000000005', 'rb5-namesake@x.com'),
  ('0b550000-0000-0000-0000-000000000006', 'rb5-nomail@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('0b550000-0000-0000-0000-000000000001', 'rb5-master@x.com',   'RB5 Master',   'rb5_master'),
  ('0b550000-0000-0000-0000-000000000002', 'rb5-loader@x.com',   'RB5 Loader',   'rb5_loader'),
  ('0b550000-0000-0000-0000-000000000003', 'rb5-qms@x.com',      'RB5 Qms',      'rb5_qms'),
  ('0b550000-0000-0000-0000-000000000004', 'rb5-approver@x.com', 'RB5 Approver', 'rb5_reader'),
  ('0b550000-0000-0000-0000-000000000005', 'rb5-namesake@x.com', 'RB5 Approver', 'rb5_reader'),
  ('0b550000-0000-0000-0000-000000000006', 'rb5-nomail@x.com',   'RB5 No Mail',  'rb5_reader')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
create or replace procedure public.nobody() language plpgsql as $$
begin update public.harness set uid = null, email = null; end $$;
grant select on public.harness to authenticated;

-- ===========================================================================
\echo ''
\echo '--- 1. D-140: required fields and case-variant codes ---'
-- ===========================================================================
call public.nobody();
delete from public.parties where party_name like 'RB5 %';
delete from public.parts where code ilike 'rb5-%';
delete from public.product_master where product_code ilike 'rb5-%';
insert into public.parties (party_name, city, state) values ('RB5 OLD NO CITY', '', '');
insert into public.parts (code, description, item_detail) values ('RB5-P1', 'RB5 PART', 'RB5-P1|RB5 PART');
insert into public.product_master (product_code, product_name) values ('RB5-L1', 'RB5 LINE');

call public.be('rb5-master@x.com');
set role authenticated;
\echo 'expect ERROR: City, State cannot be blank'
insert into public.parties (party_name, city, state) values ('RB5 NO CITY', '', '');
\echo 'expect ERROR: Party Name cannot be blank'
insert into public.parties (party_name, city, state) values ('   ', 'X', 'Y');
insert into public.parties (party_name, city, state) values ('RB5 HOSP', 'CHENNAI', 'TAMIL NADU');
\echo 'expect ERROR: City cannot be blank (blanking a city that has one)'
update public.parties set city = '' where party_name = 'RB5 HOSP';
-- An old party that never had a city can still be edited.
update public.parties set gstin = '' where party_name = 'RB5 OLD NO CITY';
\echo 'expect ERROR: Part Code, Description cannot be blank'
insert into public.parts (code, description, item_detail) values ('', '', '|');
\echo 'expect ERROR: Part code rb5-p1 is already on the Part Master as RB5-P1'
insert into public.parts (code, description, item_detail) values ('rb5-p1', 'RB5 OTHER', 'rb5-p1|RB5 OTHER');
\echo 'expect ERROR: Product Code, Product Name cannot be blank'
insert into public.product_master (product_code, product_name) values (' ', '');
\echo 'expect ERROR: Product code rb5-l1 is already on the Product Master as RB5-L1'
insert into public.product_master (product_code, product_name) values ('rb5-l1', 'RB5 LINE TOO');
insert into public.product_master (product_code, product_name) values ('RB5-L2', 'RB5 LINE TWO');
reset role;

-- An importer loads history as it was.
call public.be('rb5-loader@x.com');
set role authenticated;
insert into public.parties (party_name, city, state) values ('RB5 IMPORTED NO CITY', '', '');
reset role;
call public.nobody();
do $$ begin
  if exists (select 1 from public.parties where party_name in ('RB5 NO CITY')) then
    raise exception 'D-140 FAILED: a party with no city or state was added';
  end if;
  if not exists (select 1 from public.parties where party_name = 'RB5 HOSP' and city = 'CHENNAI') then
    raise exception 'D-140 FAILED: a complete party was refused, or its city blanked';
  end if;
  if exists (select 1 from public.parts where code = 'rb5-p1') then
    raise exception 'D-140 FAILED: a case-variant part code was added';
  end if;
  if exists (select 1 from public.product_master where product_code = 'rb5-l1')
     or not exists (select 1 from public.product_master where product_code = 'RB5-L2') then
    raise exception 'D-140 FAILED: a case-variant product code was added, or a new one refused';
  end if;
  if not exists (select 1 from public.parties where party_name = 'RB5 IMPORTED NO CITY') then
    raise exception 'D-140 FAILED: an importer was refused';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 2. D-058: the KYC verifier is the database''s ---'
-- ===========================================================================
call public.be('rb5-master@x.com');
set role authenticated;
update public.parties set kyc_status = 'Verified' where party_name = 'RB5 HOSP';
-- Writing a verifier without changing the status.
update public.parties set kyc_verified_by = '0b550000-0000-0000-0000-000000000005', kyc_verified_at = '1999-01-01'
 where party_name = 'RB5 HOSP';
reset role;
call public.nobody();
do $$ begin
  if not exists (select 1 from public.parties where party_name = 'RB5 HOSP'
                    and kyc_verified_by = '0b550000-0000-0000-0000-000000000001'
                    and kyc_verified_at > now() - interval '1 minute') then
    raise exception 'D-058 FAILED: the verifier or time was taken from the caller';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 3. D-138: a product line indoor jobs name ---'
-- ===========================================================================
call public.nobody();
insert into public.indoor_jobs (kind, activity, product_name, serial, party_name, status)
values ('Customer property', 'Repair', 'rb5 line two ', 'RB5-J1', 'RB5 HOSP', 'Received');
do $$ begin
  if public.product_line_name_uses('RB5 LINE TWO', 'RB5-L2') <> 1 then
    raise exception 'D-138 FAILED: the rename count is not 1';
  end if;
  if public.product_line_name_uses('RB5 LINE TWO') <> 0 then
    raise exception 'D-138 FAILED: the count ignored the line that still carries the name';
  end if;
end $$;
call public.be('rb5-master@x.com');
set role authenticated;
\echo 'expect ERROR: This product line is still named on 1 record(s) — 1 indoor jobs (by product name)'
delete from public.product_master where product_code = 'RB5-L2';
reset role;
call public.nobody();
do $$ begin
  if not exists (select 1 from public.product_master where product_code = 'RB5-L2') then
    raise exception 'D-138 FAILED: a line indoor jobs name was deleted';
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 4. D-143: the approver is the login the User Master names ---'
-- ===========================================================================
call public.nobody();
delete from public.user_directory where name in ('RB5 Approver', 'RB5 No Mail');
insert into public.user_directory (name, email, gmail) values
  ('RB5 Approver', 'rb5-approver@x.com', ''),
  ('RB5 No Mail',  '',                   '');
call public.be('rb5-approver@x.com');
create temp table rb5_may as select public.indoor_dc_may_approve('RB5 Approver') as v;
call public.be('rb5-namesake@x.com');
insert into rb5_may select public.indoor_dc_may_approve('RB5 Approver');
call public.be('rb5-nomail@x.com');
insert into rb5_may select public.indoor_dc_may_approve('RB5 No Mail');
call public.nobody();
\echo 'expect: t (the named login), f (another login with the same profile name), t (no address on the row: by profile name)'
select v from rb5_may;
do $$ begin
  if (select array_agg(v) from rb5_may) is distinct from array[true, false, true] then
    raise exception 'D-143 FAILED: got %', (select array_agg(v) from rb5_may);
  end if;
end $$;

-- ===========================================================================
\echo ''
\echo '--- 5. D-061: a QMS revision is a new entry; a QMS document is retired ---'
-- ===========================================================================
call public.nobody();
delete from public.documents where title like 'RB5 %';
call public.be('rb5-qms@x.com');
set role authenticated;
\echo 'expect ERROR: A QMS document needs its Document No, Revision and Effective date'
insert into public.documents (kind, title, doc_no, revision, url) values ('qms', 'RB5 SOP NO REV', 'RB5-SOP-1', '', 'https://drive/rb5-0');
insert into public.documents (kind, title, doc_no, revision, effective_date, url)
values ('qms', 'RB5 SOP', 'RB5-SOP-1', '01', '2026-01-01', 'https://drive/rb5-1');
\echo 'expect ERROR: A QMS document''s Revision, Effective date, the file is fixed once recorded'
update public.documents set revision = '02', effective_date = null, url = 'https://drive/rb5-2' where title = 'RB5 SOP';
-- Title, notes and retiring are still edits.
update public.documents set title = 'RB5 SOP', notes = 'superseded', active = false where title = 'RB5 SOP';
-- The new revision is a new entry.
insert into public.documents (kind, title, doc_no, revision, effective_date, url)
values ('qms', 'RB5 SOP R2', 'RB5-SOP-1', '02', '2026-06-01', 'https://drive/rb5-2');
\echo 'expect ERROR: A QMS document is a quality record: it is retired (Retire), not deleted'
delete from public.documents where title = 'RB5 SOP';
\echo 'expect ERROR: A document is not moved into or out of the QMS shelf'
update public.documents set kind = 'manual' where title = 'RB5 SOP R2';
-- A service manual is untouched by any of it.
insert into public.documents (kind, title, url) values ('manual', 'RB5 MANUAL', 'https://drive/rb5-m');
update public.documents set url = 'https://drive/rb5-m2' where title = 'RB5 MANUAL';
delete from public.documents where title = 'RB5 MANUAL';
reset role;
call public.nobody();
do $$ begin
  if not exists (select 1 from public.documents where title = 'RB5 SOP' and revision = '01'
                    and effective_date = '2026-01-01' and url = 'https://drive/rb5-1' and not active and notes = 'superseded') then
    raise exception 'D-061 FAILED: revision 01 was overwritten, or its notes / retirement were refused';
  end if;
  if not exists (select 1 from public.documents where title = 'RB5 SOP R2' and kind = 'qms') then
    raise exception 'D-061 FAILED: the new revision was refused, or moved off the QMS shelf';
  end if;
  if exists (select 1 from public.documents where title = 'RB5 SOP NO REV') then
    raise exception 'D-061 FAILED: a QMS document with no revision was added';
  end if;
  if exists (select 1 from public.documents where title = 'RB5 MANUAL') then
    raise exception 'D-061 FAILED: a service manual could no longer be deleted';
  end if;
end $$;

call public.nobody();

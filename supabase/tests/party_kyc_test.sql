-- ===========================================================================
-- THE PARTY MASTER'S COLUMNS AND ITS KYC (0201). Every error printed is
-- labelled `expect ERROR`.
--
-- The fixtures are the REAL VALUES out of the supplied export, not invented
-- ones: five Tax strings, each with a different label and separator, which is
-- the whole reason the number is found by SHAPE rather than by parsing a
-- format that the file does not actually keep to.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
insert into auth.users (id, email) values
  ('bbbbbbbb-0000-0000-0000-00000000000a','kyc.admin@example.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
  ('bbbbbbbb-0000-0000-0000-00000000000a','kyc.admin@example.com','KYC ADMIN','admin') on conflict do nothing;
call public.be('kyc.admin@example.com');

\echo ''
\echo '=== 1. EVERY PARTY STARTS PENDING ======================================'
-- The user''s answer. Nobody has verified anything, so nobody is Verified.
insert into public.parties (party_name) values ('PLAIN HOSPITAL');
select party_name, kyc_status, coalesce(kyc_verified_by::text,'(none)') as verified_by
  from public.parties where party_name = 'PLAIN HOSPITAL';

\echo ''
\echo '=== 2. the five REAL Tax strings, each found by SHAPE ==================='
insert into public.parties (party_name, extra) values
  ('TAX PAN ONLY',   '{"Tax 1":"PAN NO:AAACI7716A"}'::jsonb),
  ('TAX GST NO',     '{"Tax 1":"GST NO:33AADCK3295K2ZB"}'::jsonb),
  ('TAX GSTIN TIGHT','{"Tax 1":"GSTIN:33AAACL7222Q1ZB"}'::jsonb),
  ('TAX GSTIN SPACE','{"Tax 2":"GSTIN: 09AAACI7716A1ZV"}'::jsonb),
  ('TAX NOTHING',    '{"Tax 1":"to be collected"}'::jsonb);

-- NOT REPEATED HERE: the rows above were INSERTED, so the trigger has already
-- derived both numbers. That is the point of this section -- an UPLOAD is read
-- exactly as the migration read the file, because there is one definition and
-- both call it.

select party_name,
       case when coalesce(gstin,'') = '' then '(none)' else gstin end as gstin,
       case when coalesce(pan,'')   = '' then '(none)' else pan   end as pan
  from public.parties where party_name like 'TAX %' order by party_name;
\echo '    A GSTIN CONTAINS A PAN at characters 3-12, so the three GSTIN rows'
\echo '    get a PAN for nothing. "to be collected" yields neither -- a label'
\echo '    is not a number, and guessing one onto a KYC record is the one'
\echo '    outcome worse than leaving it blank.'

\echo ''
\echo '=== 3. the status is a CLOSED list, because it is COUNTED ==============='
\echo '    expect ERROR: violates check constraint "parties_kyc_status_check"'
insert into public.parties (party_name, kyc_status) values ('BAD STATUS','verified');
select count(*) as should_be_zero from public.parties where party_name = 'BAD STATUS';

\echo ''
\echo '=== 4. VERIFYING stamps who and when -- the database says, not the caller'
-- The same rule 0113 applies to who registered a call: a caller-supplied name
-- is discarded. A verification naming somebody who did not do it is worse than
-- one naming nobody.
update public.parties set kyc_status = 'Verified',
       kyc_verified_by = '00000000-0000-0000-0000-000000000000', kyc_verified_at = '1999-01-01'
 where party_name = 'PLAIN HOSPITAL';
select kyc_status,
       case when kyc_verified_by = 'bbbbbbbb-0000-0000-0000-00000000000a' then 'THE SIGNED-IN USER (correct)'
            when kyc_verified_by is null then 'nobody'
            else 'the caller''s value: ' || kyc_verified_by::text end as verified_by,
       case when kyc_verified_at > now() - interval '1 minute' then 'NOW (correct)'
            else kyc_verified_at::text end as verified_at
  from public.parties where party_name = 'PLAIN HOSPITAL';

\echo ''
\echo '=== 5. sending it BACK to Pending clears the stamp ======================'
-- A party that is no longer verified was not verified by anybody. Leaving the
-- name on it would say it had been.
update public.parties set kyc_status = 'Pending' where party_name = 'PLAIN HOSPITAL';
select kyc_status,
       case when kyc_verified_by is null and kyc_verified_at is null then 'CLEARED (correct)'
            else 'still stamped' end as stamp
  from public.parties where party_name = 'PLAIN HOSPITAL';

\echo ''
\echo '=== 6. the columns are DE-DUPED BY NAME, not numbered ==================='
-- The export carries Tel 1 / Tel 2 / Fax / Email ID twice -- once against the
-- installation address, once against billing. Two blocks, named.
insert into public.parties (party_name, address, pincode, phone, phone_2, fax, email,
                            billing_address, billing_pincode, billing_phone, billing_phone_2, billing_fax, billing_email,
                            profile, route)
values ('TWO BLOCKS','12 Install St','600001','111','222','333','install@x.com',
        '9 Billing Rd','600002','444','555','666','billing@x.com','PRIVATE','HINDON AIRFORCE');
select address, phone, email, billing_address, billing_phone, billing_email, profile, route
  from public.parties where party_name = 'TWO BLOCKS';
\echo '    Both contact blocks survive. Until 0200 the second set reached'
\echo '    NOTHING -- not even `extra`.'

\echo ''
\echo '=== 7. Profile is its own column, no longer swallowed by Type ==========='
-- The importer aliased party_type to ['type','profile'] and Type wins, so
-- PRIVATE/GOVERNMENT only ever reached `extra` on a file carrying both.
insert into public.parties (party_name, party_type, profile) values ('BOTH KINDS','CUSTOMER','GOVERNMENT');
select party_type, profile from public.parties where party_name = 'BOTH KINDS';

\echo ''
\echo '=== 8. a number typed on the screen is never overwritten by a sheet ====='
insert into public.parties (party_name, gstin, extra)
values ('TYPED WINS','07AAACL7222Q1ZB', '{"Tax 1":"GSTIN:33AADCK3295K2ZB"}'::jsonb);
select case when gstin = '07AAACL7222Q1ZB' then 'THE TYPED ONE (correct)' else 'overwritten: ' || gstin end as gstin
  from public.parties where party_name = 'TYPED WINS';

\echo ''
\echo '=== 9. ...and a re-upload of the same file changes nothing =============='
-- The importer upserts on the party name, so this is what a second load does.
insert into public.parties (party_name, extra) values
  ('TAX GST NO','{"Tax 1":"GST NO:33AADCK3295K2ZB"}'::jsonb)
on conflict (name_key) do update set extra = excluded.extra;
select gstin, pan, kyc_status from public.parties where party_name = 'TAX GST NO';

\echo ''
\echo '=== 10. a BARE Pincode beside an Inst. Pincode is the BILLING one ======='
-- The export names one and leaves the other bare, so the importer cannot alias
-- it without racing the installation column for the same heading -- it did, and
-- the installation pincode came out holding the billing value. The pair is only
-- ambiguous in isolation; where both headings are on the row it is not in doubt.
insert into public.parties (party_name, pincode, extra) values
  ('BOTH PINCODES','600001','{"Inst. Pincode":"600001","Pincode":"600002"}'::jsonb),
  ('ONE PINCODE ONLY','600003','{"Pincode":"600003"}'::jsonb);
select party_name, pincode,
       case when coalesce(billing_pincode,'') = '' then '(none)' else billing_pincode end as billing_pincode
  from public.parties where party_name like '%PINCODE%' order by party_name;
\echo '    BOTH  -> the bare one becomes billing. ONE ONLY -> left alone,'
\echo '    because nothing on that row says it is a billing address.'

\echo ''
\echo '=== 11. ONE SPELLING, EVERY CUSTOMER THAT NAMES IT ======================'
-- The user: "Give me an Option to Change the Engineer Name in one go - Like
-- Ctrl H." 32 of the 49 Servicemen on the supplied export match no User Master
-- name, and `allocated_to` on a call is a NAME -- so those prefill a box with
-- somebody who does not exist and notify nobody. 328 customers share the worst
-- spelling, which is not a repair anybody performs one party at a time.
insert into public.parties (party_name, service_engineer) values
  ('SWAP A','SIVA KUMAR R.'), ('SWAP B','SIVA KUMAR R.'), ('SWAP C','SIVA KUMAR R.'),
  ('SWAP KEEP','SIVAKUMAR'),
  ('SWAP CASE','siva kumar r.');
-- Verified KYC on one of them, to prove a rename does not disturb it.
update public.parties set kyc_status = 'Verified' where party_name = 'SWAP A';

update public.parties set service_engineer = 'SIVAKUMAR' where service_engineer = 'SIVA KUMAR R.';
select service_engineer, count(*) as parties
  from public.parties where party_name like 'SWAP%' group by 1 order by 1;
\echo '    Three moved. SWAP KEEP was already right. SWAP CASE is a DIFFERENT'
\echo '    spelling and is left alone -- matched exactly, never case-folded,'
\echo '    because a rename that quietly caught a second spelling is one'
\echo '    nobody asked for. It appears on the list in its own right.'

\echo ''
\echo '=== 12. ...and a verified KYC is not disturbed by it ===================='
select party_name, kyc_status,
       case when kyc_verified_at is not null then 'STILL STAMPED (correct)' else 'lost the stamp' end as stamp
  from public.parties where party_name = 'SWAP A';

\echo ''
\echo '=== 13. clearing it is a rename to nobody =============================='
update public.parties set service_engineer = '' where service_engineer = 'SIVAKUMAR';
select count(*) as should_be_zero
  from public.parties where party_name like 'SWAP%' and coalesce(btrim(service_engineer),'') <> ''
    and service_engineer <> 'siva kumar r.';

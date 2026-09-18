-- ===========================================================================
-- A HANDSTOCK REQUEST GOES TO NSM (0210).
--
--   The user, 2026-09-16: "For Handstock request - NSM has to approve the
--   request." Before this, a HandStock line had no item status, so the one
--   AMC/OGP rule was false and the RM's approval stamped BOTH middle stages
--   'Auto-Approved' — replenishment left on one signature.
--
--   THE NEGATIVES ARE THE POINT HERE. A change that routes HandStock to NSM is
--   easy to get right for HandStock and wrong for everything else, and
--   "everything else" is most of the register.
--
-- Superuser bypasses RLS, so every guarded write runs as `authenticated`.
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- `data.view_all` IS A FIXTURE CONVENIENCE, not part of what is under test.
-- Without it `sr_read` hides these rows from an approver who is not the
-- engineer's manager and not an office role, and every UPDATE below matches
-- nothing — which reads as "the guard refused it" when nothing was refused at
-- all. (That silent UPDATE 0 is exactly what the first run of this suite did.)
-- WHO an RM may approve for is `spare_rm_may_approve()` and has its own suite;
-- this one is about which STAGES a request must pass through.
-- A SECOND RUN MUST SAY THE SAME THING. Step 6 leaves the HandStock line
-- Rejected, and an `on conflict do nothing` insert will not undo that — so a
-- re-run reported 'Rejected' where the first run correctly said 'NSM'. Each
-- suite gets its own database under `npm run validate`, so this only bites a
-- hand-run; an assertion that reads differently on the second run is worth one
-- line either way.
delete from public.spare_request_lines where request_uid like 'SRQ-%';
delete from public.spare_requests      where uid         like 'SRQ-%';

insert into public.app_roles (role, label, permissions) values
 ('rm',  'Reporting Manager', '["spare.approve_rm","data.view_all"]'::jsonb),
 ('nsm', 'NSM',               '["spare.approve_nsm","data.view_all"]'::jsonb),
 ('com', 'Commercial',        '["spare.approve_commercial","data.view_all"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;

insert into auth.users (id, email) values
 ('dd000000-0000-0000-0000-000000000001','rm@x.com'),
 ('dd000000-0000-0000-0000-000000000002','nsm@x.com'),
 ('dd000000-0000-0000-0000-000000000003','com@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
 ('dd000000-0000-0000-0000-000000000001','rm@x.com','The RM','rm'),
 ('dd000000-0000-0000-0000-000000000002','nsm@x.com','The NSM','nsm'),
 ('dd000000-0000-0000-0000-000000000003','com@x.com','Commercial','com')
on conflict (id) do update set role = excluded.role;

create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- Three requests: the two routes, plus an AMC call-based one as the control.
insert into public.spare_requests (uid, req_type, engineer, engineer_email, item_status, ucn, handstock_reason) values
 ('SRQ-HS',  'HandStock',  'ENG', 'eng@x.com', '',    '',        'boot stock'),
 ('SRQ-CB',  'Call Based', 'ENG', 'eng@x.com', 'CMC', 'UCN-CB',  ''),
 ('SRQ-AMC', 'Call Based', 'ENG', 'eng@x.com', 'AMC', 'UCN-AMC', '')
on conflict (uid) do update set req_type = excluded.req_type, item_status = excluded.item_status;

\echo ''
\echo '--- 1. the rules, asked directly ---'
select 'HandStock spelled any way' as check,
       public.spare_is_handstock('HandStock')  as a,
       public.spare_is_handstock('Hand Stock') as b,
       public.spare_is_handstock('HANDSTOCK')  as c,
       public.spare_is_handstock('Call Based') as should_be_false;
select 'NSM is needed for HandStock, and for AMC/OGP' as check,
       public.spare_needs_nsm('',    'HandStock')  as handstock,
       public.spare_needs_nsm('AMC', 'Call Based') as amc,
       public.spare_needs_nsm('OGP', 'Call Based') as ogp,
       public.spare_needs_nsm('CMC', 'Call Based') as cmc_should_be_false;
-- COMMERCIAL IS UNCHANGED. The whole risk of this change is that it quietly
-- drags Commercial along with NSM.
select 'Commercial is UNCHANGED — HandStock does not reach it' as check,
       public.spare_needs_commercial('')    as handstock_should_be_false,
       public.spare_needs_commercial('AMC') as amc,
       public.spare_needs_commercial('CMC') as cmc_should_be_false;

-- THE APPROVALS RUN ON THE LINES, which is how the module works: "the state
-- belongs to ONE SPARE, not to the request", and the request's own `stage` is
-- the ROLLUP of its lines. A fixture with no lines rolls up to 'RM Approval'
-- for ever and every assertion below reads as a failure that is not one — which
-- is what the first run of this suite did.
insert into public.spare_request_lines (request_uid, part, qty, row_no) values
 ('SRQ-HS',  'O-RING', 1, 1),
 ('SRQ-CB',  'O-RING', 1, 1),
 ('SRQ-AMC', 'O-RING', 1, 1)
on conflict do nothing;

\echo ''
\echo '--- 2. the RM approves each one; where does the line land? ---'
call public.be('rm@x.com');
set role authenticated;
update public.spare_request_lines
   set rm_approval = 'Approved', rm_by = 'The RM', rm_at = now(),
       commercial_approval = 'Auto-Approved'      -- allowed: not AMC/OGP
 where request_uid = 'SRQ-HS';
reset role;
select 'HandStock line after RM approval' as check, stage as should_be_NSM
  from public.spare_request_lines where request_uid = 'SRQ-HS';
select '...and the request rolls up to' as check, stage as should_be_NSM
  from public.spare_requests where uid = 'SRQ-HS';

call public.be('rm@x.com');
set role authenticated;
update public.spare_request_lines
   set rm_approval = 'Approved', rm_by = 'The RM', rm_at = now(),
       commercial_approval = 'Auto-Approved', nsm_approval = 'Auto-Approved'
 where request_uid = 'SRQ-CB';
reset role;
-- THE CONTROL. A Call-Based line that is neither AMC nor OGP must still go
-- straight to Stores: the risk in this change is that it drags everything else
-- to NSM with it.
select 'Call Based, CMC, after RM approval' as check, stage as should_be_Stores
  from public.spare_request_lines where request_uid = 'SRQ-CB';

\echo ''
\echo '--- 3. expect ERROR: an RM cannot wave NSM through on a HandStock ---'
-- The whole point. If this succeeded the rule would be decoration: the RM would
-- stamp NSM themselves in the same write, exactly as they legitimately may on a
-- Call-Based CMC line above.
call public.be('rm@x.com');
set role authenticated;
update public.spare_request_lines set nsm_approval = 'Auto-Approved' where request_uid = 'SRQ-HS';
reset role;
select 'HandStock NSM column after the refused write' as check,
       coalesce(nullif(nsm_approval, ''), '(unset)') as should_still_be_Pending
  from public.spare_request_lines where request_uid = 'SRQ-HS';

\echo ''
\echo '--- 4. expect ERROR: an RM cannot wave COMMERCIAL through on an AMC line ---'
-- Already the rule before this change, and asserted here because the change is
-- to the NSM half: if Commercial quietly started auto-approving for AMC too,
-- every other test in this file would still pass.
call public.be('rm@x.com');
set role authenticated;
update public.spare_request_lines
   set rm_approval = 'Approved', rm_by = 'The RM', rm_at = now(),
       commercial_approval = 'Auto-Approved'
 where request_uid = 'SRQ-AMC';
reset role;

\echo ''
\echo '--- 4b. ...and approving it PROPERLY leaves it at Commercial ---'
call public.be('rm@x.com');
set role authenticated;
update public.spare_request_lines
   set rm_approval = 'Approved', rm_by = 'The RM', rm_at = now()
 where request_uid = 'SRQ-AMC';
reset role;
select 'AMC line waits at Commercial' as check, stage as should_be_Commercial
  from public.spare_request_lines where request_uid = 'SRQ-AMC';

\echo ''
\echo '--- 5. the NSM approves the HandStock, and it reaches Stores ---'
call public.be('nsm@x.com');
set role authenticated;
update public.spare_request_lines
   set nsm_approval = 'Approved', nsm_by = 'The NSM', nsm_at = now()
 where request_uid = 'SRQ-HS';
reset role;
select 'HandStock line after NSM approval' as check, stage as should_be_Stores
  from public.spare_request_lines where request_uid = 'SRQ-HS';
select '...and the request with it' as check, stage as should_be_Stores
  from public.spare_requests where uid = 'SRQ-HS';

\echo ''
\echo '--- 6. the stage reads the RECORD: a rejection anywhere is terminal ---'
call public.be('nsm@x.com');
set role authenticated;
update public.spare_request_lines
   set nsm_approval = 'Rejected', nsm_by = 'The NSM', nsm_at = now(),
       rejected_stage = 'NSM', reject_reason = 'not needed'
 where request_uid = 'SRQ-HS';
reset role;
select 'after the NSM rejects it' as check, stage as should_be_Rejected
  from public.spare_request_lines where request_uid = 'SRQ-HS';

\echo ''
\echo '--- 7. THE TRIGGERS STEP 2 DROPPED ARE ALL BACK ---'
-- Step 2 of 0210 drops three guards so the backfill can write approval columns
-- that nobody decided, and puts them back afterwards. The FIRST version of this
-- migration restored only two: `spare_requests_stage_guard` was dropped and
-- never recreated, and nothing caught it — `check:replay` compares functions,
-- and the function was untouched. Only the trigger was gone.
--
-- A migration that drops a guard to do its work and leaves it off is a class,
-- not an incident, so this asks the DATABASE for all three by name.
select 'guards restored after the backfill' as check,
       count(*)::text || ' of 3' as should_be_3_of_3
  from pg_trigger
 where not tgisinternal
   and (tgrelid, tgname) in (
     ('public.spare_request_lines'::regclass, 'spare_request_lines_guard'),
     ('public.spare_request_lines'::regclass, 'spare_request_lines_dispatch_guard'),
     ('public.spare_requests'::regclass,      'spare_requests_stage_guard'));

\echo ''
\echo '--- 7b. ...and the request-level one still REFUSES a self-approval ---'
-- What the missing trigger actually cost, as behaviour rather than a count.
-- An engineer holding `spare.request` alone is the requester, so `sr_update`
-- lets them write their own request; with the guard off, ONE update carried it
-- past RM, Commercial, NSM and Stores to Received. The per-line RBAC never ran,
-- because no line was touched.
insert into public.app_roles (role, label, permissions) values
 ('eng_selfapp', 'Engineer (self-approval probe)', '["spare.request"]'::jsonb)
on conflict (role) do update set permissions = excluded.permissions;
insert into auth.users (id, email) values
 ('dd000000-0000-0000-0000-000000000009','selfapp@x.com') on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
 ('dd000000-0000-0000-0000-000000000009','selfapp@x.com','Self Approver','eng_selfapp')
on conflict (id) do update set role = excluded.role;

-- THE PROBE MUST OWN THE REQUEST, or this proves nothing. `sr_update` is
-- `can_approve_spares() OR is_spare_requester(...)`, so pointing the probe at
-- somebody else's request makes the UPDATE match ZERO rows and the assertion
-- passes with the guard removed — which is what the first draft of this step
-- did. The row has to be one RLS lets them write, so that the only thing left
-- refusing it is the trigger under test.
insert into public.spare_requests (uid, req_type, engineer, engineer_email, item_status, ucn)
values ('SRQ-SELF', 'Call Based', 'Self Approver', 'selfapp@x.com', 'CMC', 'UCN-SELF')
on conflict (uid) do update set engineer_email = excluded.engineer_email;
insert into public.spare_request_lines (request_uid, part, qty)
select 'SRQ-SELF', 'P-SELF|Widget', 1
 where not exists (select 1 from public.spare_request_lines where request_uid = 'SRQ-SELF');

call public.be('selfapp@x.com');
set role authenticated;
select 'the requester may not approve spares' as check,
       public.can_approve_spares()::text as should_be_false;
select 'but RLS does let them write their own request' as check,
       public.is_spare_requester(r.*)::text as should_be_true
  from public.spare_requests r where r.uid = 'SRQ-SELF';
-- AN `\echo`, NOT A SQL COMMENT. The validation harness reads the suite's
-- OUTPUT and pairs each `expect ERROR` line with the next error; a `--` comment
-- never reaches the output, so this expectation was invisible and its error was
-- counted as an unexpected one. Written as a comment here when the suite was
-- added with 0210.
\echo 'expect ERROR: Spare approvals are recorded per spare'
update public.spare_requests
   set rm_approval = 'Approved', commercial_approval = 'Approved',
       nsm_approval = 'Approved', stores_status = 'Dispatched', received_at = now()
 where uid = 'SRQ-SELF';
reset role;
select 'SRQ-SELF after the attempt' as check,
       coalesce(nullif(rm_approval,''),'Pending') as should_be_Pending,
       case when received_at is null then 'not received' else 'RECEIVED' end as should_be_not_received
  from public.spare_requests where uid = 'SRQ-SELF';

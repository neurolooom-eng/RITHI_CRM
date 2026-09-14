-- ===========================================================================
-- RENAMING A PART CARRIES ITS HISTORY, AND NOTHING ELSE MAY MOVE A LINE (0196).
--
-- The user, 2026-09-14: "I need to be able to Edit Part Master", and, asked
-- before building because the readings differ so much: "Rename carries the
-- history".
--
-- WHY THIS SUITE IS LONGER THAN THE FEATURE. A part's identity here is the
-- STRING `CODE|Description` and NOTHING HAS A FOREIGN KEY TO `parts` — nine
-- tables carry that string as a value, and HAND STOCK IS DERIVED from them
-- (issued − consumed ± transfers − returns). So a half-done rename does not
-- merely lose a link: AN ENGINEER'S BALANCE CHANGES. The number this suite
-- watches hardest is therefore the balance, before and after.
--
-- And the exemption that lets the rename touch a consumption line at all had to
-- be made UNFORGEABLE. The first version used a transaction-local
-- `set_config` flag; `set_config` is available to any caller, so anyone who
-- could update a line could set it and re-point the line — which is the one
-- thing 0062's guard exists to prevent. That hole is section 5, and it is
-- tested from the role that would have exploited it rather than from the owner,
-- who bypasses RLS and would have reported it closed while it was open.
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

delete from public.spare_consumption   where engineer = 'RP ENGINEER';
delete from public.spare_issue_history where engineer = 'RP ENGINEER';
delete from public.handstock_opening   where engineer = 'RP ENGINEER';
delete from public.parts where code in ('RP-1', 'RP-2');

insert into public.parts (code, description, item_detail, category)
values ('RP-1', 'LOUDSPEAKR V2', 'RP-1|LOUDSPEAKR V2', 'SPARE'),   -- the typo
       ('RP-2', 'ANOTHER PART',  'RP-2|ANOTHER PART',  'SPARE');

insert into public.spare_issue_history (engineer, part, qty, source)
values ('RP ENGINEER', 'RP-1|LOUDSPEAKR V2', 5, 'stock out');
insert into public.spare_consumption (engineer, part, qty, ucn)
values ('RP ENGINEER', 'RP-1|LOUDSPEAKR V2', 2, '26A02F0001');
-- STORED WITH DIFFERENT SPACING AND CASE. This is the row a rename matching on
-- the raw string would leave behind as the only survivor of the old name — and
-- it is an OPENING BALANCE, so leaving it behind changes what the engineer
-- holds.
insert into public.handstock_opening (engineer, part, qty, source, as_of)
values ('RP ENGINEER', '  rp-1|loudspeakr v2  ', 1, 'opening', current_date);

\echo ''
\echo '--- 1. what the engineer holds BEFORE, and what would move ---------------'
select part, opening, stock_out, consumed, on_hand_live
  from public.handstock_balance where engineer = 'RP ENGINEER';
\echo 'expect: consumption 1, issued 1, opening 1 — the spaced row included'
select relation, rows from public.part_rename_impact('RP-1|LOUDSPEAKR V2') where rows > 0 order by 1;

\echo ''
\echo '--- 2. the rename ---------------------------------------------------------'
\echo 'expect: renamed = true'
select (public.rename_part((select id from public.parts where code = 'RP-1'),
                           'RP-1', 'LOUDSPEAKER V2'))->>'renamed' as renamed;

\echo ''
\echo '--- 3. THE BALANCE IS UNCHANGED, and the name is corrected ----------------'
\echo 'expect: the SAME opening/stock_out/consumed/on_hand as section 1, part now LOUDSPEAKER'
select part, opening, stock_out, consumed, on_hand_live
  from public.handstock_balance where engineer = 'RP ENGINEER';
\echo 'expect: 0 0 0 0 — nothing anywhere still names the typo'
select (select count(*) from public.spare_consumption   where part   ilike '%LOUDSPEAKR %') as consumption,
       (select count(*) from public.spare_issue_history where part   ilike '%LOUDSPEAKR %') as issued,
       (select count(*) from public.handstock_opening   where part   ilike '%LOUDSPEAKR %') as opening,
       (select count(*) from public.parts        where item_detail   ilike '%LOUDSPEAKR %') as parts;
\echo 'expect: 0 — the capability is spent, not left lying about'
select count(*) as tickets from public.part_rename_ticket;

\echo ''
\echo '--- 4. a rename is not a MERGE -------------------------------------------'
\echo 'expect ERROR: Another part is already called "RP-2|ANOTHER PART"'
select public.rename_part((select id from public.parts where code = 'RP-1'), 'RP-2', 'ANOTHER PART');

\echo ''
\echo '--- 5. NOTHING ELSE MAY MOVE A CONSUMPTION LINE --------------------------'
\echo 'expect ERROR: a reconciliation can only change the quantity (re-pointing the part)'
update public.spare_consumption set part = 'RP-2|ANOTHER PART' where engineer = 'RP ENGINEER';
\echo 'expect ERROR: ...nor the engineer'
update public.spare_consumption set engineer = 'SOMEBODY ELSE' where engineer = 'RP ENGINEER';
\echo 'expect ERROR: ...nor the UCN'
update public.spare_consumption set ucn = '26A02F9999' where engineer = 'RP ENGINEER';

\echo ''
\echo '--- 5b. AND THE EXEMPTION CANNOT BE FORGED -------------------------------'
-- THE HOLE THE FIRST VERSION HAD. `set_config` is callable by anybody, so a
-- flag is a suggestion; the ticket is a row in a table with RLS on, no policy
-- and no grants, which is a capability.
\echo 'expect ERROR: the old set_config flag buys nothing'
begin;
select set_config('app.part_rename', 'rp-1|loudspeaker v2' || chr(10) || 'RP-2|ANOTHER PART', true);
update public.spare_consumption set part = 'RP-2|ANOTHER PART' where engineer = 'RP ENGINEER';
rollback;

-- TESTED FROM `authenticated`, NOT FROM THE OWNER. The owner bypasses RLS and
-- would report this closed while it was open — which is exactly how a leak of
-- this kind survives a test suite.
\echo 'expect ERROR: permission denied for table part_rename_ticket'
begin;
set local role authenticated;
insert into public.part_rename_ticket (txid, old_key, new_detail)
values (txid_current(), 'rp-1|loudspeaker v2', 'RP-2|ANOTHER PART');
rollback;

\echo ''
\echo '--- 6. the shape of the thing --------------------------------------------'
\echo 'expect: t — RLS is on, and there is no policy to let anybody in'
select relrowsecurity from pg_class where oid = 'public.part_rename_ticket'::regclass;
\echo 'expect: 0 policies'
select count(*) as policies from pg_policies where tablename = 'part_rename_ticket';

delete from public.spare_consumption   where engineer = 'RP ENGINEER';
delete from public.spare_issue_history where engineer = 'RP ENGINEER';
delete from public.handstock_opening   where engineer = 'RP ENGINEER';
delete from public.parts where code in ('RP-1', 'RP-2');

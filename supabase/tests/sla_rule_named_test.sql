-- ===========================================================================
-- EVERY SLA HAS A NAME (0427): a blank or all-space name is refused by the
-- database, because the Dashboard shows each SLA's tile and list under it;
-- a real name saves.
--
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

\echo 'expect ERROR: new row for relation "sla_rules" violates check constraint "sla_rules_label_named"'
update public.sla_rules set label = '   ' where key = 'closure';
\echo 'expect ERROR: new row for relation "sla_rules" violates check constraint "sla_rules_label_named"'
update public.sla_rules set label = '' where key = 'first_visit';
update public.sla_rules set label = 'Close the call' where key = 'closure';
select 'a real name saves' as t, label = 'Close the call' as ok from public.sla_rules where key = 'closure';
update public.sla_rules set label = 'Call closure' where key = 'closure';

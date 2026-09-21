-- A CANCELLED CALL IS NOT "REPORT PENDING" (0226).
--
-- The fault: open_state's final ELSE turned every status it did not recognise
-- into 'Report pending', so a cancelled call sat in a queue of work somebody
-- was chasing. Nineteen of them in one reporting upload.
\echo '--- the rule, by value'
select 'Canceled                  -> ' || public.call_open_state('Canceled', now()) as t;
select 'Cancelled                 -> ' || public.call_open_state('Cancelled', now()) as t;
select 'Call Cancelled by Cust.   -> ' || public.call_open_state('Call Cancelled by Customer', now()) as t;
\echo '--- and everything 0032 already got right is UNCHANGED'
select 'Solved - Report Completed -> ' || public.call_open_state('Solved - Report Completed', now()) as t;
select 'Solved - Report Pending   -> ' || public.call_open_state('Solved - Report Pending', now()) as t;
select 'Unsolved                  -> ' || public.call_open_state('Unsolved', now()) as t;
select 'Solved                    -> ' || public.call_open_state('Solved', now()) as t;
select 'no visit, no status       -> ' || public.call_open_state('', null) as t;
select 'an unrecognised status    -> ' || public.call_open_state('Something Odd', now()) as t;

\echo '--- through the REGISTER, so the whole path is exercised'
insert into public.field_calls (ucn, call_type, party_name, product_name, complaint_date, last_status, last_visit_at)
values ('26T01F0001', 'FIELD', 'HOSP', 'VEGA', current_date, 'Canceled', now());
select 'a cancelled call reads ' || open_state as t from public.calls where ucn = '26T01F0001';

\echo '--- the value is STAMPED: what a caller sends is discarded (0113/0114)'
update public.field_calls set open_state = 'Solved' where ucn = '26T01F0001';
select 'after writing Solved onto it, it still reads ' || open_state as t
  from public.calls where ucn = '26T01F0001';

\echo '--- and it FOLLOWS the status, so un-cancelling works too'
update public.field_calls set last_status = 'Solved - Report Completed' where ucn = '26T01F0001';
select 'restored to Solved: ' || open_state as t from public.calls where ucn = '26T01F0001';

\echo '--- the column is no longer generated, and the views that read it survived'
select 'open_state is generated: ' || is_generated as t from information_schema.columns
 where table_schema = 'public' and table_name = 'field_calls' and column_name = 'open_state';
select 'views reading it: ' || count(*)::text as t from pg_class
 where relname in ('calls','field_call_review','field_call_review_summary','pending_calls',
                   'call_state','call_report','consumption_report','solved_without_report');

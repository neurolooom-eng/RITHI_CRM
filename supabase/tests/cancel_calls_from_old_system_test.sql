-- ===========================================================================
-- THE OLD SYSTEM'S CANCELLED CALLS, CANCELLED HERE (0439).
--   26A22F0004 Unattended            -> Cancelled, with the file's reason,
--                                       entry time and Email-ID.
--   26B10F0016 Solved, a later visit -> Cancelled too; the visit is kept.
--   26A08F0002 already cancelled     -> its RITHI reason and date stand.
--   Re-running the file changes nothing more.
-- Run ONCE after _stub.sql + every migration. Every error printed is labelled
-- `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off
set timezone = 'UTC';

alter table public.field_calls disable trigger user;
delete from public.field_calls where ucn in ('26A22F0004', '26B10F0016', '26A08F0002');
insert into public.field_calls (ucn, call_number, call_type, reg_date, product_name, serial, party_name,
                                last_status, last_visit_at, open_state, cancelled_at, cancel_reason) values
 ('26A22F0004', 'R16094-ORION-G-1439', 'FIELD', date '2026-01-22', 'ORION-G', '1439', 'P', '', null, 'Unattended', null, ''),
 ('26B10F0016', 'X2', 'FIELD', date '2026-02-10', 'VEGA', 'S2', 'P', 'Solved - Report Completed', timestamptz '2026-09-26 00:00+05:30', 'Solved', null, ''),
 ('26A08F0002', 'X3', 'FIELD', date '2026-01-08', 'VEGA', 'S3', 'P', 'Unsolved', timestamptz '2026-02-06 00:00+05:30', 'Cancelled', timestamptz '2026-09-18 11:00+05:30', 'Raised twice');
alter table public.field_calls enable trigger user;

\ir ../migrations/0439_cancel_calls_from_old_system.sql

select '26A22F0004: Cancelled, reason and entry time from the file' as t,
  (open_state, cancel_reason, cancelled_at) = ('Cancelled', 'WRONG CALL REGISTRATION', timestamptz '2026-01-27 11:28:16+05:30')
  and extra->>'cancelled_by_name' = 'airliquide.customercare2022@gmail.com' as ok
  from public.field_calls where ucn = '26A22F0004';
select '26B10F0016: Solved before, Cancelled now, its visit status kept' as t,
  open_state = 'Cancelled' and last_status = 'Solved - Report Completed' and cancelled_at is not null as ok
  from public.field_calls where ucn = '26B10F0016';
select '26A08F0002: already cancelled -- its own reason and date stand' as t,
  (cancel_reason, cancelled_at) = ('Raised twice', timestamptz '2026-09-18 11:00+05:30') as ok
  from public.field_calls where ucn = '26A08F0002';

\echo '--- re-run: nothing more changes ---'
\ir ../migrations/0439_cancel_calls_from_old_system.sql
select 'still the file''s entry time after a re-run' as t,
  cancelled_at = timestamptz '2026-01-27 11:28:16+05:30' as ok from public.field_calls where ucn = '26A22F0004';

alter table public.field_calls disable trigger user;
delete from public.field_calls where ucn in ('26A22F0004', '26B10F0016', '26A08F0002');
alter table public.field_calls enable trigger user;

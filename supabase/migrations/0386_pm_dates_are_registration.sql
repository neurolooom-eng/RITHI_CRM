-- ===========================================================================
-- 0386  PM CALLS: COMPLAINT DATE AND BREAKDOWN DATE ARE THE REGISTRATION DATE
--       (2026-10-05) -- a one-time correction of the batch already uploaded.
--
-- The user: "Map, Complaint Date, Break Down Date to the Same Date as Call
-- Registration" -- "I have already uploaded it -- this is only for PM" -- "Not
-- any other Call Types". PM Bulk Upload now writes both from the
-- registration date (pmImport.ts); this brings the PM calls uploaded before
-- that change into line.
--
-- SCOPE, deliberately narrow: PM calls only (pm_calls, call type P M VISIT),
-- and only those registered from 01-Oct-2026 -- the batch that was uploaded.
-- Older PM calls are left as they are; nothing else is touched.
--
-- THE SAME BATCH WENT IN WITHOUT ITS SERIALS (the sheet's "Product Serial
-- Number" was not a recognised heading until v0.10.117) -- the value was kept
-- in `extra`, so the serial is filled from there where the call has none.
-- Nothing is invented: a call whose extra carries no serial stays blank. The
-- engineer ("Call Allocated To") is NOT filled here: setting allocated_to
-- notifies the engineer, and 1,333 notifications are not a data fix.
--
-- Runs as the migration owner (no signed-in user), which the call guards
-- treat as an import. Idempotent: a re-run finds nothing to change.
-- ===========================================================================
do $$
declare n_dates integer := 0; n_serial integer := 0;
begin
  if to_regclass('public.pm_calls') is null then return; end if;

  update public.pm_calls
     set complaint_date = reg_date,
         breakdown_date = reg_date
   where call_type = 'P M VISIT'
     and reg_date >= date '2026-10-01'
     and (complaint_date is distinct from reg_date or breakdown_date is distinct from reg_date);
  get diagnostics n_dates = row_count;

  update public.pm_calls
     set serial = btrim(extra->>'Product Serial Number')
   where call_type = 'P M VISIT'
     and reg_date >= date '2026-10-01'
     and coalesce(btrim(serial), '') = ''
     and coalesce(btrim(extra->>'Product Serial Number'), '') <> '';
  get diagnostics n_serial = row_count;

  raise notice '0386: % PM call(s) now dated by their registration; % given the serial their upload carried', n_dates, n_serial;
end $$;

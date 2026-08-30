-- ===========================================================================
-- `extra` on call_requests, so the historical CRN Registration export can be
-- imported without losing the columns the table has no home for — "Any Open
-- Call?" (the Hotline's answer at the time, either No or the open call's UCN),
-- Regional Manager, and Comments / Remarks.
-- ===========================================================================

alter table public.call_requests
  add column if not exists extra jsonb not null default '{}'::jsonb;

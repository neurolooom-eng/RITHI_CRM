-- ===========================================================================
-- Call request actions (Hotline): a pending request is closed out in one of
-- three ways —
--   • Registered — a new call was created from it (UCN written back)
--   • Mapped     — it belongs to an existing call (that call's UCN written back)
--   • Cancelled  — not a call; reason recorded
-- A request leaves the pending list once it has a UCN or is cancelled.
-- ===========================================================================

alter table public.call_requests
  add column if not exists cancel_reason text default '',
  add column if not exists cancelled_at  timestamptz,
  add column if not exists actioned_by   text default '',
  add column if not exists actioned_at   timestamptz;

create index if not exists call_requests_status_idx on public.call_requests (status);

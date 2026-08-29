-- ===========================================================================
-- Spare request module — phase 3.
--   • Reject reasons captured at every approval stage.
--   • Dispatch details (courier / remarks) alongside the DC number.
--   • Engineer acknowledgement, closing the loop: Dispatched → Received.
-- ===========================================================================

alter table public.spare_requests
  add column if not exists reject_reason     text,
  add column if not exists rejected_stage    text,
  add column if not exists courier           text,
  add column if not exists dispatch_remarks  text,
  add column if not exists received_by       text,
  add column if not exists received_at       timestamptz,
  add column if not exists receipt_remarks   text;

-- The register filters and sorts by workflow stage, so index it.
create index if not exists spare_requests_stage_idx      on public.spare_requests (stage);
create index if not exists spare_requests_created_at_idx on public.spare_requests (created_at desc);

-- ===========================================================================
-- Spare approval workflow on spare_requests:
--   RM → Commercial → NSM → Stores(dispatch/DC).
-- Commercial & NSM auto-approve unless the item is AMC or OGP (item_status).
-- ===========================================================================

alter table public.spare_requests
  add column if not exists rm_approval        text default 'Pending',
  add column if not exists rm_by              text,
  add column if not exists rm_at              timestamptz,
  add column if not exists commercial_approval text default 'Pending',
  add column if not exists commercial_by      text,
  add column if not exists commercial_at      timestamptz,
  add column if not exists nsm_approval        text default 'Pending',
  add column if not exists nsm_by             text,
  add column if not exists nsm_at             timestamptz,
  add column if not exists stores_status       text default 'Pending',
  add column if not exists dc_number          text,
  add column if not exists dispatched_by      text,
  add column if not exists dispatched_at      timestamptz,
  add column if not exists stage              text default 'RM Approval';

-- Approvers update spare_requests (buttons are RBAC-gated in the app).
drop policy if exists sr_update on public.spare_requests;
create policy sr_update on public.spare_requests for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

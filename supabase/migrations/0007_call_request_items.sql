-- ===========================================================================
-- Multi-item call requests. A request is up to 5 calls (Product + Serial No +
-- Standard Complaint + Reported Problem) that SHARE one REQID, so REQID cannot
-- be unique — the per-row identity is UniqueID (REQID-Product-SerialNo).
--
-- Before this, inserting the 2nd..5th item failed with
--   duplicate key value violates unique constraint "call_requests_reqid_key"
-- leaving the request half-saved (item 1 only).
-- ===========================================================================

alter table public.call_requests drop constraint if exists call_requests_reqid_key;
create index if not exists call_requests_reqid_idx on public.call_requests (reqid);

-- The real identity: one row per product/serial within a request.
create unique index if not exists call_requests_unique_key_uidx
  on public.call_requests (unique_key);

-- Mint a REQID up front so the whole request goes in as ONE insert and can
-- never be half-saved. The trigger still assigns one when this isn't used.
create or replace function public.next_call_reqid()
returns text language sql security definer set search_path = public as $$
  select 'R' || nextval('public.call_req_seq')::text;
$$;
grant execute on function public.next_call_reqid() to authenticated;

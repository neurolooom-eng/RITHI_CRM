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

-- 0003 ships permissive insert/update policies; 0008 (RBAC enforcement)
-- replaces them with permission checks. Re-applying 0003 — which the
-- call_requests apply bundle does — would silently hand them back, so put the
-- RBAC versions back whenever has_perm() is present.
do $$
begin
  if to_regprocedure('public.has_perm(text)') is null then return; end if;

  execute 'drop policy if exists cr_insert on public.call_requests';
  execute $p$create policy cr_insert on public.call_requests for insert
    with check (public.has_perm('request.create'))$p$;

  execute 'drop policy if exists cr_update on public.call_requests';
  execute $p$create policy cr_update on public.call_requests for update
    using (public.has_perm('calls.create') or public.has_perm('pending.register') or created_by = auth.uid())
    with check (public.has_perm('calls.create') or public.has_perm('pending.register') or created_by = auth.uid())$p$;
end $$;

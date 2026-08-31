-- ===========================================================================
-- spare.drop — a Spare Coordinator / Hotline may DROP a spare at any stage
-- (short supply, no longer needed, superseded). It sets stores_status =
-- 'Dropped' (terminal), and must NOT mint a DC. Distinct from Stores dispatch,
-- which still needs spare.dispatch. The line guard is widened to allow it.
-- ===========================================================================

create or replace function public.spare_request_lines_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed boolean;
  auto_ok boolean;
  req     public.spare_requests;
begin
  if public.is_admin() then return new; end if;
  select * into req from public.spare_requests where uid = new.request_uid;

  auto_ok := not public.spare_needs_review(req.item_status)
             and public.has_perm('spare.approve_rm');

  changed := new.rm_approval is distinct from old.rm_approval
          or new.rm_by       is distinct from old.rm_by
          or new.rm_at       is distinct from old.rm_at;
  if changed and not public.has_perm('spare.approve_rm') then
    raise exception 'RBAC: RM approval requires the spare.approve_rm permission';
  end if;

  changed := new.commercial_approval is distinct from old.commercial_approval
          or new.commercial_by       is distinct from old.commercial_by
          or new.commercial_at       is distinct from old.commercial_at;
  if changed
     and not public.has_perm('spare.approve_commercial')
     and not (auto_ok and new.commercial_approval = 'Auto-Approved'
              and new.commercial_by is not distinct from old.commercial_by) then
    raise exception 'RBAC: Commercial approval requires the spare.approve_commercial permission';
  end if;

  changed := new.nsm_approval is distinct from old.nsm_approval
          or new.nsm_by       is distinct from old.nsm_by
          or new.nsm_at       is distinct from old.nsm_at;
  if changed
     and not public.has_perm('spare.approve_nsm')
     and not (auto_ok and new.nsm_approval = 'Auto-Approved'
              and new.nsm_by is not distinct from old.nsm_by) then
    raise exception 'RBAC: NSM approval requires the spare.approve_nsm permission';
  end if;

  changed := new.stores_status    is distinct from old.stores_status
          or new.dc_number        is distinct from old.dc_number
          or new.dispatched_by    is distinct from old.dispatched_by
          or new.dispatched_at    is distinct from old.dispatched_at
          or new.courier          is distinct from old.courier
          or new.dispatch_remarks is distinct from old.dispatch_remarks;
  -- Dispatch needs spare.dispatch; a DROP (Dropped, no DC) needs spare.drop.
  if changed and not public.has_perm('spare.dispatch')
     and not (public.has_perm('spare.drop')
              and coalesce(new.stores_status, '') ~* 'drop'
              and new.dc_number is not distinct from old.dc_number) then
    raise exception 'RBAC: dispatch / DC requires the spare.dispatch permission (a drop needs spare.drop)';
  end if;

  changed := new.reject_reason  is distinct from old.reject_reason
          or new.rejected_stage is distinct from old.rejected_stage;
  if changed and not public.can_approve_spares() and not public.has_perm('spare.drop') then
    raise exception 'RBAC: recording a rejection requires an approval permission';
  end if;

  changed := new.received_by     is distinct from old.received_by
          or new.received_at     is distinct from old.received_at
          or new.receipt_remarks is distinct from old.receipt_remarks;
  if changed then
    if not public.has_perm('spare.receive') then
      raise exception 'RBAC: acknowledging receipt requires the spare.receive permission';
    end if;
    if not public.is_spare_requester(req) then
      raise exception 'RBAC: only the engineer who raised the request may acknowledge it';
    end if;
    if old.stores_status is null or old.stores_status !~* 'dispatch' then
      raise exception 'RBAC: a spare can only be acknowledged after it is dispatched';
    end if;
  end if;

  if (new.part is distinct from old.part or new.qty is distinct from old.qty)
     and not public.is_spare_requester(req) then
    raise exception 'RBAC: only the engineer who raised the request may change its parts';
  end if;

  return new;
end $$;
